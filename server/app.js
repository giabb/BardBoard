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
