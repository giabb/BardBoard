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
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, NoSubscriberBehavior } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const musicmetadata = require('music-metadata');
const { AUDIO_DIR } = require('../constants');

function createDiscordAudioService(discordClient) {
  const activeAudioPlayers = new Map();
  const activeConnections = new Map();
  const repeatEnabled = new Map();
  const currentAudioFile = new Map();
  const currentVolume = new Map();
  const activeAudioResources = new Map();
  const playStartTime = new Map();
  const trackDurations = new Map();
  const pausedState = new Map();
  const pausedElapsed = new Map();

  function getChannel(channelId) {
    return discordClient.channels.cache.get(channelId);
  }

  function cleanupPlayerOnly(guildId) {
    const player = activeAudioPlayers.get(guildId);
    if (player) {
      player.stop();
      player.removeAllListeners();
      activeAudioPlayers.delete(guildId);
      currentAudioFile.delete(guildId);
      playStartTime.delete(guildId);
      pausedState.delete(guildId);
      pausedElapsed.delete(guildId);
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

  async function playAudioInDiscord(fileName, channelId) {
    await sodium.ready;
    const channel = getChannel(channelId);
    if (!channel) return false;

    try {
      const existingPlayer = activeAudioPlayers.get(channel.guild.id);
      if (existingPlayer) {
        existingPlayer.stop();
        existingPlayer.removeAllListeners();
      }

      let connection = activeConnections.get(channel.guild.id);
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

      const resource = createAudioResource(path.join(AUDIO_DIR, fileName), { inlineVolume: true });

      const volume = currentVolume.get(channel.guild.id) || 0.5;
      resource.volume.setVolume(volume);

      connection.subscribe(player);
      activeAudioPlayers.set(channel.guild.id, player);
      activeAudioResources.set(channel.guild.id, resource);

      playStartTime.set(channel.guild.id, Date.now());
      pausedState.set(channel.guild.id, false);
      player.play(resource);

      player.on('stateChange', (oldState, newState) => {
        if (newState.status === 'idle') {
          if (repeatEnabled.get(channel.guild.id)) {
            const currentFile = currentAudioFile.get(channel.guild.id);
            if (currentFile) {
              const newResource = createAudioResource(path.join(AUDIO_DIR, currentFile), { inlineVolume: true });
              newResource.volume.setVolume(currentVolume.get(channel.guild.id) || 0.5);
              activeAudioResources.set(channel.guild.id, newResource);
              playStartTime.set(channel.guild.id, Date.now());
              player.play(newResource);
            }
          } else {
            cleanupPlayerOnly(channel.guild.id);
          }
        }
      });

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
    if (player.state.status === 'playing') {
      const startedAt = playStartTime.get(guildId) || Date.now();
      const elapsed = (Date.now() - startedAt) / 1000;
      pausedElapsed.set(guildId, elapsed);

      player.pause();
      paused = true;
      pausedState.set(guildId, true);
    } else if (player.state.status === 'paused') {
      const elapsed = pausedElapsed.get(guildId) || 0;
      playStartTime.set(guildId, Date.now() - (elapsed * 1000));
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
    const filePath = path.resolve(AUDIO_DIR, fileName);

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

    activeAudioResources.set(guildId, resource);
    playStartTime.set(guildId, Date.now() - offsetSecs * 1000);

    const isPaused = pausedState.get(guildId) || false;
    if (isPaused) {
      pausedElapsed.set(guildId, offsetSecs);
    }

    player.play(resource);
    return true;
  }

  async function nowPlaying(channelId) {
    const channel = getChannel(channelId);
    if (!channel) return { song: null, elapsed: 0, duration: 0, paused: false };

    const guildId = channel.guild.id;
    const fileName = currentAudioFile.get(guildId) || null;
    if (!fileName) return { song: null, elapsed: 0, duration: 0, paused: false };

    let duration = trackDurations.get(fileName);
    if (duration === undefined) {
      try {
        const metadata = await musicmetadata.parseFile(path.join(AUDIO_DIR, fileName));
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
      const startedAt = playStartTime.get(guildId) || Date.now();
      elapsed = Math.min((Date.now() - startedAt) / 1000, duration);
    }

    return {
      song: fileName.replace(/\.[^/.]+$/, ''),
      elapsed: Math.round(elapsed * 10) / 10,
      duration: Math.round(duration * 10) / 10,
      paused: isPaused
    };
  }

  return {
    playAudioInDiscord,
    togglePause,
    getPauseStatus,
    stopAudioInDiscord,
    toggleRepeat,
    getRepeatStatus,
    setCurrentVolume,
    getVolume,
    seek,
    nowPlaying
  };
}

module.exports = { createDiscordAudioService };
