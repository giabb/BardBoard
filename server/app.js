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
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const { createDiscordAudioService } = require('./services/discordAudio');
const createAudioRoutes = require('./routes/audio');
const createPlaylistRoutes = require('./routes/playlist');
const fileRoutes = require('./routes/files');

require('dotenv').config();

const app = express();
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const audioService = createDiscordAudioService(discordClient);

function safeEqual(a, b) {
  const aBuf = Buffer.from(a || '');
  const bBuf = Buffer.from(b || '');
  if (aBuf.length !== bBuf.length) return false;
  return require('crypto').timingSafeEqual(aBuf, bBuf);
}

const authUser = process.env.AUTH_USER || '';
const authPass = process.env.AUTH_PASS || '';
const rememberDays = Math.max(1, Number.parseInt(process.env.LOGIN_REMEMBER_DAYS || '30', 10));
const authEnabled = authUser && authPass;
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const sessionDir = process.env.SESSION_DIR || path.join(__dirname, '..', 'sessions');

function cleanupNonRememberSessions() {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const files = fs.readdirSync(sessionDir);
    files.forEach(file => {
      if (!file.endsWith('.json')) return;
      const fullPath = path.join(sessionDir, file);
      try {
        const raw = fs.readFileSync(fullPath, 'utf8');
        const data = JSON.parse(raw);
        if (!data || !data.remember) {
          fs.unlinkSync(fullPath);
        }
      } catch (err) {
        fs.unlinkSync(fullPath);
      }
    });
  } catch (err) {
    console.warn('Session cleanup skipped:', err.message);
  }
}

app.use(helmet({ contentSecurityPolicy: false }));
if (corsOrigins.length > 0) {
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
  }));
}
cleanupNonRememberSessions();
app.use(session({
  secret: process.env.SESSION_SECRET || 'change-me',
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: sessionDir,
    retries: 1
  }),
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.post('/login', (req, res) => {
  if (!authEnabled) return res.redirect('/');

  const username = (req.body.username || '').toString();
  const password = (req.body.password || '').toString();
  if (!safeEqual(username, authUser) || !safeEqual(password, authPass)) {
    return res.status(401).send('Invalid username or password');
  }

  req.session.authenticated = true;
  req.session.remember = Boolean(req.body.remember);
  if (req.body.remember) {
    req.session.cookie.maxAge = rememberDays * 24 * 60 * 60 * 1000;
  }
  return res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.use((req, res, next) => {
  if (!authEnabled) return next();
  if (req.session && req.session.authenticated) return next();
  if (req.path === '/login' || req.path === '/logout') return next();
  if (req.path === '/styles.css' || req.path === '/ouroboros.svg' || req.path === '/favicon.ico') return next();
  if (req.accepts('html')) return res.redirect('/login');
  return res.status(401).json({ error: 'Unauthorized' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/env-config', (req, res) => {
  res.json({ channelId: process.env.CHANNEL_ID });
});

app.use(createAudioRoutes(audioService));
app.use(createPlaylistRoutes(audioService));
app.use(fileRoutes);

discordClient.on(Events.ClientReady, () => {
  console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.login(process.env.DISCORD_TOKEN);

app.listen(process.env.BOT_PORT, '0.0.0.0', () => console.log('Server running on port', process.env.BOT_PORT));
