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
const express = require('express');
const path = require('path');
const { Events, Client, GatewayIntentBits } = require('discord.js');
const { createDiscordAudioService } = require('./services/discordAudio');
const createAudioRoutes = require('./routes/audio');
const fileRoutes = require('./routes/files');

require('dotenv').config();

const app = express();
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const audioService = createDiscordAudioService(discordClient);

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/env-config', (req, res) => {
  res.json({ channelId: process.env.CHANNEL_ID });
});

app.use(createAudioRoutes(audioService));
app.use(fileRoutes);

discordClient.on(Events.ClientReady, () => {
  console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.login(process.env.DISCORD_TOKEN);

app.listen(process.env.BOT_PORT, () => console.log('Server running on port', process.env.BOT_PORT));
