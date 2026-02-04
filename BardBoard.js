{/**
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
*/}

const express = require('express');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { Events, Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType, NoSubscriberBehavior, getVoiceConnection } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
const musicmetadata = require('music-metadata');
const app = express();
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
require('dotenv').config();

/*******************************************************
 *                      Setup
 *******************************************************/

const activeAudioPlayers = new Map();
const activeConnections = new Map();
const repeatEnabled = new Map();
const currentAudioFile = new Map();
const currentVolume = new Map();
const activeAudioResources = new Map();
const playStartTime   = new Map();   // guildId → Date.now() when current track started
const trackDurations  = new Map();   // fileName → duration in seconds (cached)
const pausedState     = new Map();   // guildId → boolean (is currently paused)
const pausedElapsed   = new Map();   // guildId → elapsed seconds when paused

app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// Serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to load env var
app.get('/env-config', (req, res) => {
  res.json({
    channelId: process.env.CHANNEL_ID
  });
});

/**
 * Handles the `/repeat-status` API endpoint to return whether
 * repeat is currently enabled for the given channel.
 *
 * @route GET /repeat-status
 * @query  {string} channelId - The ID of the Discord channel.
 * @returns {{ repeatEnabled: boolean }}
 */
app.get('/repeat-status', (req, res) => {
  const { channelId } = req.query;
  res.json({ repeatEnabled: isRepeatEnabled(channelId) });
});

/*******************************************************
 *                   Audio APIs
 *******************************************************/

/**
 * Handles the `/audio-files` API endpoint to return a list of audio files
 * from the `audio-files` directory.
 *
 * @route GET /audio-files
 * @returns {string[]} A list of audio file names.
 */
app.get('/audio-files', (req, res) => {
  const baseDir = './audio-files';

  // Helper to get all items safely
  let entries = [];
  try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (e) {
      console.error("Could not read audio-files directory:", e);
      return res.json({ root: [], categories: {} });
  }

  const response = {
    root: [],
    categories: {}
  };

  // Supported extensions
  const isAudio = (name) => /\.(mp3|wav|ogg|m4a)$/i.test(name);

  entries.forEach(entry => {
    if (entry.isFile() && isAudio(entry.name)) {
      // Files in the main folder
      response.root.push(entry.name);

    } else if (entry.isDirectory()) {
      // Files inside subfolders (categories)
      const subDirPath = path.join(baseDir, entry.name);
      try {
        const subFiles = fs.readdirSync(subDirPath)
          .filter(f => isAudio(f))
          .map(f => `${entry.name}/${f}`); // Create relative path "Folder/File.mp3"

        if (subFiles.length > 0) {
          response.categories[entry.name] = subFiles;
        }
      } catch (err) {
        console.error(`Error reading subdir ${entry.name}:`, err);
      }
    }
  });

  res.json(response);
});

/**
 * Handles the `/play-audio` API endpoint to play the specified audio file
 * in the Discord channel.
 *
 * @route POST /play-audio
 * @param {string} fileName - The name of the audio file to play.
 * @param {string} channelId - The ID of the Discord channel.
 */
app.post('/play-audio', (req, res) => {
  const { fileName, channelId } = req.body;
  playAudioInDiscord(fileName, channelId);
  res.sendStatus(200);
});

/**
 * Handles the `/toggle-pause` API endpoint.
 * @route POST /toggle-pause
 */
app.post('/toggle-pause', (req, res) => {
  const { channelId } = req.body;
  const channel = discordClient.channels.cache.get(channelId);
  if (!channel) return res.sendStatus(404);

  const guildId = channel.guild.id;
  const player = activeAudioPlayers.get(guildId);
  if (!player) return res.sendStatus(404);

  let paused = false;
  if (player.state.status === 'playing') {
    // Pausing: store current elapsed time
    const startedAt = playStartTime.get(guildId) || Date.now();
    const elapsed = (Date.now() - startedAt) / 1000;
    pausedElapsed.set(guildId, elapsed);

    player.pause();
    paused = true;
    pausedState.set(guildId, true);
  } else if (player.state.status === 'paused') {
    // Resuming: adjust start time to account for paused duration
    const elapsed = pausedElapsed.get(guildId) || 0;
    playStartTime.set(guildId, Date.now() - (elapsed * 1000));
    pausedElapsed.delete(guildId);

    player.unpause();
    paused = false;
    pausedState.set(guildId, false);
  }

  res.json({ paused });
});

/**
 * Handles the `/stop-audio` API endpoint to stop the currently playing
 * audio in the Discord channel.
 *
 * @route POST /stop-audio
 * @param {string} channelId - The ID of the Discord channel.
 */
app.post('/stop-audio', (req, res) => {
    const { channelId } = req.body;
    stopAudioInDiscord(channelId);
    res.sendStatus(200);
});

/**
 * Handles the `/toggle-repeat` API endpoint to toggle the repeat
 * functionality for the audio playback in the Discord bot.
 *
 * @route POST /toggle-repeat
 * @param {string} channelId - The ID of the Discord channel.
 * @returns {boolean} The new repeat state (enabled or disabled).
 */
app.post('/toggle-repeat', (req, res) => {
  const { channelId } = req.body;
  const newState = discordToggleRepeat(channelId);
  res.json({ repeatEnabled: newState });
});

/**
 * Handles the `/set-audio` API endpoint to change the volume
 * for the audio playback in the Discord bot.
 *
 * @route POST /set-audio
 * @param {string} channelId - The ID of the Discord channel.
 * @param {double} volume - The volume as decimal.
 */
app.post('/set-volume', (req, res) => {
  const { channelId, volume } = req.body;
  setCurrentVolume(channelId, volume);
  res.sendStatus(200);
});

/**
 * Handles the `/get-volume` API endpoint to retrieve the current volume
 * for the audio playback in the Discord bot.
 *
 * @route GET /get-volume
 * @param {string} channelId - The ID of the Discord channel.
 * @returns {number} volume - The current volume (0.0 to 1.0, default 0.5).
 */
app.get('/get-volume', (req, res) => {
  const { channelId } = req.query;
  const channel = discordClient.channels.cache.get(channelId);
  if (!channel) return res.json({ volume: 0.5 });

  const guildId = channel.guild.id;
  const volume = currentVolume.get(guildId) || 0.5;
  res.json({ volume });
});

/**
 * Handles the `/seek` API endpoint to jump playback to a
 * specific position within the currently playing track.
 * Stops the current resource and replays from the requested offset
 * using createAudioResource's built-in `start` option.
 *
 * @route POST /seek
 * @param {string} channelId   - The ID of the Discord channel.
 * @param {number} offsetSecs  - Target position in seconds.
 */
app.post('/seek', async (req, res) => {
  const { channelId, offsetSecs } = req.body;
  const channel = discordClient.channels.cache.get(channelId);
  if (!channel) return res.sendStatus(404);

  const guildId  = channel.guild.id;
  const fileName = currentAudioFile.get(guildId);
  const player   = activeAudioPlayers.get(guildId);
  if (!fileName || !player) return res.sendStatus(404);

  try {
    const volume   = currentVolume.get(guildId) || 0.5;
    const filePath = path.resolve(`./audio-files/${fileName}`);

    // Spawn ffmpeg to seek
    const ffmpeg = spawn('ffmpeg', [
      '-ss', String(offsetSecs),
      '-i', filePath,
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    // Handle FFmpeg errors to prevent silent crashes
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

    // If we're paused, update the pausedElapsed instead
    const isPaused = pausedState.get(guildId) || false;
    if (isPaused) {
      pausedElapsed.set(guildId, offsetSecs);
    }

    player.play(resource);

    res.sendStatus(200);
  } catch (err) {
    console.error('Seek error:', err);
    res.sendStatus(500);
  }
});

/**
 * Handles the `/now-playing` API endpoint to return the name
 * of the currently playing audio file (without extension),
 * plus elapsed seconds and total duration for the progress bar.
 *
 * @route GET /now-playing
 * @query  {string} channelId - The ID of the Discord channel.
 * @returns {{ song: string|null, elapsed: number, duration: number }}
 */
app.get('/now-playing', async (req, res) => {
  const { channelId } = req.query;
  const channel = discordClient.channels.cache.get(channelId);
  if (!channel) return res.json({ song: null, elapsed: 0, duration: 0 });

  const guildId  = channel.guild.id;
  const fileName = currentAudioFile.get(guildId) || null;

  if (!fileName) return res.json({ song: null, elapsed: 0, duration: 0 });

  // --- duration (cached) ---
  let duration = trackDurations.get(fileName);
  if (duration === undefined) {
    try {
      const metadata = await musicmetadata.parseFile(`./audio-files/${fileName}`);
      duration = metadata.format.duration || 0;
    } catch { duration = 0; }
    trackDurations.set(fileName, duration);
  }

  // --- elapsed: wall-clock since playback started, or frozen if paused ---
  let elapsed;
  const isPaused = pausedState.get(guildId) || false;

  if (isPaused) {
    // Return frozen elapsed time when paused
    elapsed = pausedElapsed.get(guildId) || 0;
  } else {
    // Calculate current elapsed time when playing
    const startedAt = playStartTime.get(guildId) || Date.now();
    elapsed = Math.min((Date.now() - startedAt) / 1000, duration);
  }

  res.json({
    song:     fileName.replace(/\.[^/.]+$/, ''),
    elapsed:  Math.round(elapsed * 10) / 10,   // 1 decimal
    duration: Math.round(duration * 10) / 10,
    paused:   isPaused
  });
});

/**
 * Handles the `/repeat-status` API endpoint to return whether
 * repeat is currently enabled for the given channel.
 *
 * @route GET /repeat-status
 * @query  {string} channelId - The ID of the Discord channel.
 * @returns {{ repeatEnabled: boolean }}
 */
app.get('/repeat-status', (req, res) => {
  const { channelId } = req.query;
  res.json({ repeatEnabled: isRepeatEnabled(channelId) });
});

/*******************************************************
 *                     Logic
 *******************************************************/

/**
 * Plays the specified audio file in the Discord channel.
 *
 * @async
 * @param {string} fileName - The name of the audio file to play.
 * @param {string} channelId - The ID of the Discord channel.
 */
async function playAudioInDiscord(fileName, channelId) {
  await sodium.ready;
  const channel = discordClient.channels.cache.get(channelId);
  if (!channel) return;

  try {
    // Clean up existing player if any
    const existingPlayer = activeAudioPlayers.get(channel.guild.id);
    if (existingPlayer) {
      existingPlayer.stop();
      existingPlayer.removeAllListeners();
    }

    // Get or create connection
    let connection = activeConnections.get(channel.guild.id);
    if (!connection) {
      connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
      });
      activeConnections.set(channel.guild.id, connection);

      connection.on('error', (error) => {
        console.error(`Connection error: ${error.message}`);
        cleanupResources(channel.guild.id);
      });
    }

    const player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Pause,
      },
    });

    player.on('error', (error) => {
      console.error(`Player error: ${error.message}`);
      cleanupResources(channel.guild.id);
    });

    // Store the current audio file name
    currentAudioFile.set(channel.guild.id, fileName);

    const resource = createAudioResource(`./audio-files/${fileName}`, { inlineVolume: true });

    // Set the initial volume
    const volume = currentVolume.get(channel.guild.id) || 0.5;
    resource.volume.setVolume(volume);

    connection.subscribe(player);
    activeAudioPlayers.set(channel.guild.id, player);
    activeAudioResources.set(channel.guild.id, resource);

    playStartTime.set(channel.guild.id, Date.now());   // ← record when playback starts
    pausedState.set(channel.guild.id, false);          // ← reset paused state
    player.play(resource);

    // Handle repeat when audio ends
    player.on('stateChange', (oldState, newState) => {
      if (newState.status === 'idle') {
        if (repeatEnabled.get(channel.guild.id)) {
          // If repeat is enabled, play the same file again
          const currentFile = currentAudioFile.get(channel.guild.id);
          if (currentFile) {
            const newResource = createAudioResource(`./audio-files/${currentFile}`, { inlineVolume: true });
            newResource.volume.setVolume(currentVolume.get(channel.guild.id) || 0.5);
            activeAudioResources.set(channel.guild.id, newResource);
            playStartTime.set(channel.guild.id, Date.now());   // ← reset on repeat loop
            player.play(newResource);
          }
        } else {
          cleanupPlayerOnly(channel.guild.id);
        }
      }
    });

  } catch (error) {
    console.error('Error in playAudioInDiscord:', error);
    cleanupResources(channel.guild.id);
  }
}

/**
 * Toggles the repeat functionality for the audio playback in the specified Discord channel.
 *
 * @param {string} channelId - The ID of the Discord channel.
 * @returns {boolean} The new repeat state (true if enabled, false if disabled).
 */
function discordToggleRepeat(channelId) {
  const channel = discordClient.channels.cache.get(channelId);
  if (channel) {
    const guildId = channel.guild.id;
    const currentState = repeatEnabled.get(guildId) || false;
    repeatEnabled.set(guildId, !currentState);
    console.log("New repeat state for guild:", guildId, !currentState);
    return !currentState; // Return new state
  }
  console.error("Channel not found for channelId:", channelId);
  return false;
}

/**
 * Changes the volume for the audio playback in the specified Discord channel.
 *
 * @param {string} channelId - The ID of the Discord channel.
 * @param {double} volume - The volume as decimal.
 */
function setCurrentVolume(channelId, volume) {
  const channel = discordClient.channels.cache.get(channelId);
  if (channel) {
    const guildId = channel.guild.id;

    currentVolume.set(guildId, volume);
    console.log("New volume for guild:", guildId, currentVolume);

    const player = activeAudioPlayers.get(guildId);
    if (player) {
      const resource = player.state.resource;
      if (resource && resource.volume) {
        resource.volume.setVolume(volume);
      }
    }
  } else {
    console.error("Channel not found for channelId:", channelId);
  }
}

/**
 * Stops the audio playback in the specified Discord channel and cleans up the audio player resources.
 *
 * @param {string} channelId - The ID of the Discord channel.
 */
function stopAudioInDiscord(channelId) {
  const channel = discordClient.channels.cache.get(channelId);
  if (channel) {
    cleanupPlayerOnly(channel.guild.id);
  }
}

/**
 * Gets the current repeat status for the audio playback in the specified Discord channel.
 *
 * @param {string} channelId - The ID of the Discord channel.
 * @returns {boolean} The current repeat status (true if enabled, false if disabled).
 */
function isRepeatEnabled(channelId) {
  const channel = discordClient.channels.cache.get(channelId);
  if (channel) {
      return repeatEnabled.get(channel.guild.id) || false;
  }
  return false;
}

/**
 * Disconnects from the voice channel and cleans up all resources for the specified Discord channel.
 *
 * @param {string} channelId - The ID of the Discord channel.
 */
function disconnectFromVoice(channelId) {
  const channel = discordClient.channels.cache.get(channelId);
  if (channel) {
    cleanupResources(channel.guild.id);
  }
}

/**
 * Cleans up only the audio player resources for the specified guild.
 *
 * @param {string} guildId - The ID of the Discord guild.
 */
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

/**
 * Cleans up all resources, including the audio player and the voice connection, for the specified guild.
 * 
 * @param {string} guildId - The ID of the Discord guild.
 */
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

/*******************************************************
 *                      Discord
 *******************************************************/

// Discord bot logic
discordClient.on(Events.ClientReady, () => {
    console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.login(process.env.DISCORD_TOKEN);

app.listen(process.env.BOT_PORT, () => console.log('Server running on port', process.env.BOT_PORT));