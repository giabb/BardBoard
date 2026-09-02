/**
  BardBoard - A DiscordJS bot soundboard
  Copyright (C) 2024 Giovanbattista Abbate

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const path = require('path');
const { spawn } = require('child_process');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  NoSubscriberBehavior,
  AudioPlayerStatus
} = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const musicmetadata = require('music-metadata');
const { AUDIO_DIR } = require('../constants');
const { resolveAudioPath, hasAllowedExt } = require('../utils/path');

function createDiscordAudioService(discordClient) {
  const activeAudioPlayers = new Map();
  const activeConnections = new Map();
  const repeatEnabled = new Map();
  const currentAudioFile = new Map();
  const currentVolume = new Map();
  const activeAudioResources = new Map();
  const activeTranscoders = new Map();
  const playbackOffsets = new Map();
  const trackDurations = new Map();
  const pausedState = new Map();
  const pausedElapsed = new Map();
  const playbackMode = new Map();
  const queueByGuild = new Map();

  function getChannel(channelId) {
    return discordClient.channels.cache.get(channelId);
  }

  function cleanupPlayerOnly(guildId) {
    const player = activeAudioPlayers.get(guildId);
    if (player) {
      player.stop();
      player.removeAllListeners();
      activeAudioPlayers.delete(guildId);
      releasePlaybackHandles(guildId);
      currentAudioFile.delete(guildId);
      playbackOffsets.delete(guildId);
      pausedState.delete(guildId);
      pausedElapsed.delete(guildId);
      playbackMode.delete(guildId);
    }
  }

  function cleanupResources(guildId) {
    cleanupPlayerOnly(guildId);
    const connection = activeConnections.get(guildId);
    if (connection) {
      try {
        connection.destroy();
        connection.removeAllListeners();
      } catch (error) {
        console.error('Error destroying connection:', error);
      }
      activeConnections.delete(guildId);
      repeatEnabled.delete(guildId);
      currentAudioFile.delete(guildId);
    }
  }

  function releasePlaybackHandles(guildId) {
    const resource = activeAudioResources.get(guildId);
    if (resource && resource.playStream && typeof resource.playStream.destroy === 'function') {
      try {
        resource.playStream.destroy();
      } catch (error) {
        console.warn('Error destroying play stream:', error.message);
      }
    }
    activeAudioResources.delete(guildId);
    playbackOffsets.delete(guildId);

    const transcoder = activeTranscoders.get(guildId);
    if (transcoder) {
      try {
        transcoder.kill();
      } catch (error) {
        console.warn('Error stopping transcoder:', error.message);
      }
      activeTranscoders.delete(guildId);
    }
  }

  function setPlaybackResource(guildId, resource, transcoder = null, offsetSecs = 0) {
    releasePlaybackHandles(guildId);
    activeAudioResources.set(guildId, resource);
    playbackOffsets.set(guildId, offsetSecs);
    if (transcoder) activeTranscoders.set(guildId, transcoder);
  }

  function waitForPlaybackStart(player, resource, timeoutMs = 5000) {
    if (player.state.status === AudioPlayerStatus.Playing && player.state.resource === resource) {
      return Promise.resolve();
    }

    return new Promise(resolve => {
      let settled = false;
      let timeout;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        player.off('stateChange', onStateChange);
        player.off('error', finish);
        resolve();
      };

      const onStateChange = (oldState, newState) => {
        if (newState.status === AudioPlayerStatus.Playing && newState.resource === resource) {
          finish();
        } else if (newState.status === AudioPlayerStatus.Idle) {
          finish();
        }
      };

      player.on('stateChange', onStateChange);
      player.once('error', finish);
      timeout = setTimeout(finish, timeoutMs);
    });
  }

  function getGuildId(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return null;
    return channel.guild.id;
  }

  function getQueue(channelId) {
    const guildId = getGuildId(channelId);
    if (!guildId) return null;
    if (!queueByGuild.has(guildId)) {
      queueByGuild.set(guildId, []);
    }
    return queueByGuild.get(guildId);
  }

  function addToQueue(channelId, fileName) {
    const queue = getQueue(channelId);
    if (!queue) return null;
    queue.push(fileName);
    return queue;
  }

  function setQueue(channelId, queue) {
    const guildId = getGuildId(channelId);
    if (!guildId) return null;
    const safeQueue = Array.isArray(queue) ? queue.slice() : [];
    queueByGuild.set(guildId, safeQueue);
    return safeQueue;
  }

  function clearQueue(channelId) {
    const guildId = getGuildId(channelId);
    if (!guildId) return null;
    queueByGuild.set(guildId, []);
    return [];
  }

  function shuffleQueue(channelId) {
    const queue = getQueue(channelId);
    if (!queue) return null;
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
    return queue;
  }

  function getNoiseFolderName() {
    const raw = process.env.NOISES_FOLDER || '!noises';
    return raw.toString().trim().replace(/^\/+|\/+$/g, '') || '!noises';
  }

  function getNoiseVolume() {
    const configured = Number(process.env.NOISES_VOLUME || '2');
    if (!Number.isFinite(configured)) return 2;
    return Math.min(10, Math.max(0, configured));
  }

  function isNoiseTrack(fileName) {
    const folder = getNoiseFolderName().toLowerCase();
    const normalized = fileName.replace(/\\/g, '/').toLowerCase();
    return normalized.startsWith(`${folder}/`);
  }

  function getElapsedSeconds(guildId) {
    const resource = activeAudioResources.get(guildId);
    const offsetSecs = playbackOffsets.get(guildId) || 0;
    const resourceElapsed = Number(resource?.playbackDuration) || 0;
    return Math.max(0, offsetSecs + (resourceElapsed / 1000));
  }

  async function playNoiseOverCurrent(noiseFile, channel) {
    const guildId = channel.guild.id;
    const player = activeAudioPlayers.get(guildId);
    const currentFile = currentAudioFile.get(guildId);
    if (!player || !currentFile) return false;

    const noisePath = resolveAudioPath(noiseFile);
    const mainPath = resolveAudioPath(currentFile);
    if (!noisePath || !mainPath) return false;

    const offsetSecs = getElapsedSeconds(guildId);
    const noiseVolume = getNoiseVolume();
    const ffmpeg = spawn('ffmpeg', [
      '-ss', String(offsetSecs),
      '-i', mainPath,
      '-i', noisePath,
      '-filter_complex', `[1:a]volume=${noiseVolume}[noise];[0:a][noise]amix=inputs=2:duration=first:dropout_transition=0:normalize=1,alimiter=limit=0.95:level=false`,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg overlay error:', err);
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
      metadata: { title: currentFile }
    });

    const volume = currentVolume.get(guildId) || 0.5;
    resource.volume.setVolume(volume);

    setPlaybackResource(guildId, resource, ffmpeg, offsetSecs);
    pausedState.set(guildId, false);
    pausedElapsed.delete(guildId);

    const playbackStarted = waitForPlaybackStart(player, resource);
    player.play(resource);
    await playbackStarted;
    return true;
  }

  function isPlaying(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return false;
    const guildId = channel.guild.id;
    const player = activeAudioPlayers.get(guildId);
    return Boolean(player && currentAudioFile.get(guildId));
  }

  function normalizeTrackPath(fileName) {
    return (fileName || '').toString().replace(/\\/g, '/');
  }

  function isFileInUse(fileName) {
    const target = normalizeTrackPath(fileName);
    if (!target) return false;

    for (const current of currentAudioFile.values()) {
      if (normalizeTrackPath(current) === target) return true;
    }

    for (const queue of queueByGuild.values()) {
      if (!Array.isArray(queue)) continue;
      if (queue.some(item => normalizeTrackPath(item) === target)) return true;
    }

    return false;
  }

  function isCategoryInUse(categoryName) {
    const prefix = normalizeTrackPath(categoryName).replace(/^\/+|\/+$/g, '');
    if (!prefix) return false;
    const categoryPrefix = `${prefix}/`;

    for (const current of currentAudioFile.values()) {
      const normalized = normalizeTrackPath(current);
      if (normalized.startsWith(categoryPrefix)) return true;
    }

    for (const queue of queueByGuild.values()) {
      if (!Array.isArray(queue)) continue;
      if (queue.some(item => normalizeTrackPath(item).startsWith(categoryPrefix))) return true;
    }

    return false;
  }

  async function playNextFromQueue(channelId) {
    const queue = getQueue(channelId);
    if (!queue) return false;
    while (queue.length > 0) {
      const next = queue.shift();
      const ok = await playAudioInDiscord(next, channelId);
      if (ok) return true;
    }
    return false;
  }

  async function playAudioInDiscord(fileName, channelId) {
    await sodium.ready;
    const channel = getChannel(channelId);
    if (!channel) return false;
    if (!hasAllowedExt(fileName)) return false;
    const safePath = resolveAudioPath(fileName);
    if (!safePath) return false;

    try {
      const isNoise = isNoiseTrack(fileName);
      if (isNoise && currentAudioFile.get(channel.guild.id) && playbackMode.get(channel.guild.id) !== 'noise') {
        const ok = await playNoiseOverCurrent(fileName, channel);
        if (ok) return true;
      }

      const existingPlayer = activeAudioPlayers.get(channel.guild.id);
      if (existingPlayer) {
        cleanupPlayerOnly(channel.guild.id);
      }

      let connection = activeConnections.get(channel.guild.id);
      if (connection && connection.joinConfig && connection.joinConfig.channelId !== channel.id) {
        try {
          connection.destroy();
          connection.removeAllListeners();
        } catch (error) {
          console.error('Error switching connection channel:', error);
        }
        activeConnections.delete(channel.guild.id);
        connection = null;
      }
      if (!connection) {
        connection = joinVoiceChannel({
          channelId: channel.id,
          guildId: channel.guild.id,
          adapterCreator: channel.guild.voiceAdapterCreator
        });
        activeConnections.set(channel.guild.id, connection);

        connection.on('error', (error) => {
          console.error(`Connection error: ${error.message}`);
          cleanupResources(channel.guild.id);
        });
      }

      const player = createAudioPlayer({
        behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
      });

      player.on('error', (error) => {
        console.error(`Player error: ${error.message}`);
        cleanupResources(channel.guild.id);
      });

      currentAudioFile.set(channel.guild.id, fileName);
      playbackMode.set(channel.guild.id, isNoise ? 'noise' : 'main');

      const resource = createAudioResource(safePath, { inlineVolume: true });

      const volume = currentVolume.get(channel.guild.id) || 0.5;
      resource.volume.setVolume(volume);

      connection.subscribe(player);
      activeAudioPlayers.set(channel.guild.id, player);
      setPlaybackResource(channel.guild.id, resource);
      pausedState.set(channel.guild.id, false);

      player.on('stateChange', async (oldState, newState) => {
        if (newState.status === AudioPlayerStatus.Idle) {
          const mode = playbackMode.get(channel.guild.id) || 'main';
          if (mode === 'noise') {
            cleanupPlayerOnly(channel.guild.id);
            return;
          }
          if (repeatEnabled.get(channel.guild.id)) {
            const currentFile = currentAudioFile.get(channel.guild.id);
            if (currentFile) {
              const repeatPath = resolveAudioPath(currentFile);
              if (!repeatPath) {
                cleanupPlayerOnly(channel.guild.id);
                return;
              }
              const newResource = createAudioResource(repeatPath, { inlineVolume: true });
              newResource.volume.setVolume(currentVolume.get(channel.guild.id) || 0.5);
              setPlaybackResource(channel.guild.id, newResource);
              player.play(newResource);
            }
          } else {
            const ok = await playNextFromQueue(channel.id);
            if (ok) return;
            cleanupPlayerOnly(channel.guild.id);
          }
        }
      });

      const playbackStarted = waitForPlaybackStart(player, resource);
      player.play(resource);
      await playbackStarted;
      return true;
    } catch (error) {
      console.error('Error in playAudioInDiscord:', error);
      cleanupResources(channel.guild.id);
      return false;
    }
  }

  function togglePause(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return null;

    const guildId = channel.guild.id;
    const player = activeAudioPlayers.get(guildId);
    if (!player) return null;

    let paused = false;
    if (player.state.status === AudioPlayerStatus.Playing) {
      const elapsed = getElapsedSeconds(guildId);
      pausedElapsed.set(guildId, elapsed);

      player.pause();
      paused = true;
      pausedState.set(guildId, true);
    } else if (player.state.status === AudioPlayerStatus.Paused) {
      pausedElapsed.delete(guildId);

      player.unpause();
      paused = false;
      pausedState.set(guildId, false);
    }

    return { paused };
  }

  function getPauseStatus(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return { paused: false };
    const guildId = channel.guild.id;
    return { paused: pausedState.get(guildId) || false };
  }

  function stopAudioInDiscord(channelId) {
    const channel = getChannel(channelId);
    if (channel) {
      cleanupPlayerOnly(channel.guild.id);
      return true;
    }
    return false;
  }

  function switchVoiceChannel(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return false;

    const guildId = channel.guild.id;
    let connection = activeConnections.get(guildId);
    if (connection && connection.joinConfig && connection.joinConfig.channelId === channel.id) {
      return true;
    }

    if (connection) {
      try {
        connection.destroy();
        connection.removeAllListeners();
      } catch (error) {
        console.error('Error switching connection channel:', error);
      }
      activeConnections.delete(guildId);
      connection = null;
    }

    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator
    });
    activeConnections.set(guildId, connection);

    connection.on('error', (error) => {
      console.error(`Connection error: ${error.message}`);
      cleanupResources(guildId);
    });

    const player = activeAudioPlayers.get(guildId);
    if (player) {
      connection.subscribe(player);
    }

    return true;
  }

  function toggleRepeat(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return null;
    const guildId = channel.guild.id;
    const currentState = repeatEnabled.get(guildId) || false;
    repeatEnabled.set(guildId, !currentState);
    console.log('New repeat state for guild:', guildId, !currentState);
    return !currentState;
  }

  function getRepeatStatus(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return { repeatEnabled: false };
    return { repeatEnabled: repeatEnabled.get(channel.guild.id) || false };
  }

  function setCurrentVolume(channelId, volume) {
    const channel = getChannel(channelId);
    if (!channel) return false;
    const guildId = channel.guild.id;
    currentVolume.set(guildId, volume);
    console.log('New volume for guild:', guildId, currentVolume);

    const player = activeAudioPlayers.get(guildId);
    if (player) {
      const resource = player.state.resource;
      if (resource && resource.volume) {
        resource.volume.setVolume(volume);
      }
    }
    return true;
  }

  function getVolume(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return { volume: 0.5 };
    const guildId = channel.guild.id;
    return { volume: currentVolume.get(guildId) || 0.5 };
  }

  async function seek(channelId, offsetSecs) {
    const channel = getChannel(channelId);
    if (!channel) return false;

    const guildId = channel.guild.id;
    const fileName = currentAudioFile.get(guildId);
    const player = activeAudioPlayers.get(guildId);
    if (!fileName || !player) return false;

    const volume = currentVolume.get(guildId) || 0.5;
    const filePath = resolveAudioPath(fileName);
    if (!filePath) return false;

    const ffmpeg = spawn('ffmpeg', [
      '-ss', String(offsetSecs),
      '-i', filePath,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    ffmpeg.on('error', (err) => {
      console.error('FFmpeg spawn error:', err);
    });

    const resource = createAudioResource(ffmpeg.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true,
      metadata: { title: fileName }
    });

    resource.volume.setVolume(volume);

    setPlaybackResource(guildId, resource, ffmpeg, offsetSecs);

    const isPaused = pausedState.get(guildId) || false;
    if (isPaused) {
      pausedElapsed.set(guildId, offsetSecs);
    }

    const playbackStarted = waitForPlaybackStart(player, resource);
    player.play(resource);
    await playbackStarted;
    if (isPaused) player.pause();
    return true;
  }

  async function nowPlaying(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return { song: null, elapsed: 0, duration: 0, paused: false, playing: false };

    const guildId = channel.guild.id;
    const fileName = currentAudioFile.get(guildId) || null;
    if (!fileName) return { song: null, elapsed: 0, duration: 0, paused: false, playing: false };

    let duration = trackDurations.get(fileName);
    if (duration === undefined) {
      try {
        const safePath = resolveAudioPath(fileName);
        if (!safePath) return { song: null, elapsed: 0, duration: 0, paused: false, playing: false };
        const metadata = await musicmetadata.parseFile(safePath);
        duration = metadata.format.duration || 0;
      } catch {
        duration = 0;
      }
      trackDurations.set(fileName, duration);
    }

    let elapsed;
    const isPaused = pausedState.get(guildId) || false;
    if (isPaused) {
      elapsed = pausedElapsed.get(guildId) || 0;
    } else {
      elapsed = Math.min(getElapsedSeconds(guildId), duration);
    }

    const player = activeAudioPlayers.get(guildId);
    const isActivelyPlaying = player?.state.status === AudioPlayerStatus.Playing;

    return {
      song: fileName.replace(/\.[^/.]+$/, ''),
      elapsed: Math.round(elapsed * 10) / 10,
      duration: Math.round(duration * 10) / 10,
      paused: isPaused,
      playing: isActivelyPlaying
    };
  }

  return {
    playAudioInDiscord,
    playNextFromQueue,
    getQueue,
    addToQueue,
    setQueue,
    clearQueue,
    shuffleQueue,
    isPlaying,
    togglePause,
    getPauseStatus,
    stopAudioInDiscord,
    switchVoiceChannel,
    toggleRepeat,
    getRepeatStatus,
    setCurrentVolume,
    getVolume,
    seek,
    nowPlaying,
    isFileInUse,
    isCategoryInUse
  };
}

module.exports = { createDiscordAudioService };
