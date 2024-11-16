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
const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, NoSubscriberBehavior, getVoiceConnection } = require('@discordjs/voice');
const sodium = require('libsodium-wrappers');
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
  const audioFiles = fs.readdirSync('./audio-files');
  res.json(audioFiles);
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
  console.log("Toggling repeat for channelId:", channelId);
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
  console.log("Changing volume for channelId:", channelId);
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
discordClient.on('ready', () => {
  console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.login(process.env.DISCORD_TOKEN);

app.listen(process.env.BOT_PORT, () => console.log('Server running on port', process.env.BOT_PORT));