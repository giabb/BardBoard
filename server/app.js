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
const express = require('express');
const { Events, Client, GatewayIntentBits } = require('discord.js');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const fs = require('fs');
const { createDiscordAudioService } = require('./services/discordAudio');
const createAudioRoutes = require('./routes/audio');
const createPlaylistRoutes = require('./routes/playlist');
const createFileRoutes = require('./routes/files');
const openApiSpec = require('./docs/openapi');

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
const sessionStoreLogFn = (message) => {
  const text = String(message || '');
  if (text.includes('ENOENT') && text.includes('[session-file-store]')) return;
  console.warn(text);
};
const sessionStore = new FileStore({
  path: sessionDir,
  retries: Number.parseInt(process.env.SESSION_FILE_RETRIES || '5', 10),
  factor: Number.parseInt(process.env.SESSION_FILE_RETRY_FACTOR || '1', 10),
  minTimeout: Number.parseInt(process.env.SESSION_FILE_RETRY_MIN_MS || '50', 10),
  maxTimeout: Number.parseInt(process.env.SESSION_FILE_RETRY_MAX_MS || '200', 10),
  logFn: sessionStoreLogFn
});

function withFsRetry(store, methodName) {
  const original = store[methodName];
  if (typeof original !== 'function') return;

  store[methodName] = function wrappedStoreMethod(sessionId, sessionData, callback) {
    const maxAttempts = Math.max(1, Number.parseInt(process.env.SESSION_WRITE_RETRIES || '6', 10));
    let attempt = 0;

    const run = () => {
      original.call(store, sessionId, sessionData, (err, value) => {
        if (err && (err.code === 'EPERM' || err.code === 'EBUSY') && attempt < maxAttempts - 1) {
          attempt += 1;
          const delayMs = Math.min(40 * (attempt + 1), 250);
          return setTimeout(run, delayMs);
        }
        if (typeof callback === 'function') callback(err, value);
      });
    };

    run();
  };
}

function withMissingSessionAsEmpty(store) {
  const original = store.get;
  if (typeof original !== 'function') return;

  store.get = function wrappedGet(sessionId, callback) {
    original.call(store, sessionId, (err, value) => {
      if (err && err.code === 'ENOENT') {
        if (typeof callback === 'function') callback(null, null);
        return;
      }
      if (typeof callback === 'function') callback(err, value);
    });
  };
}

withFsRetry(sessionStore, 'set');
withFsRetry(sessionStore, 'touch');
withMissingSessionAsEmpty(sessionStore);

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
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: 'lax'
  }
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.post('/auth/login', (req, res) => {
  if (!authEnabled) return res.status(200).json({ ok: true });

  const username = (req.body.username || '').toString();
  const password = (req.body.password || '').toString();
  if (!safeEqual(username, authUser) || !safeEqual(password, authPass)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.authenticated = true;
  req.session.remember = Boolean(req.body.remember);
  if (req.body.remember) {
    req.session.cookie.maxAge = rememberDays * 24 * 60 * 60 * 1000;
  }
  return res.status(200).json({ ok: true });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({ ok: true });
  });
});

app.get('/auth/status', (req, res) => {
  res.status(200).json({
    authEnabled: Boolean(authEnabled),
    authenticated: Boolean(req.session && req.session.authenticated)
  });
});

app.use((req, res, next) => {
  if (!authEnabled) return next();
  if (req.session && req.session.authenticated) return next();
  if (req.path === '/auth/login' || req.path === '/auth/logout' || req.path === '/auth/status') return next();
  if (req.path === '/api-docs' || req.path === '/api-docs.json') return next();
  return res.status(401).json({ error: 'Unauthorized' });
});

app.get('/env-config', (req, res) => {
  const uploadMaxMb = Math.max(1, Number.parseInt(process.env.UPLOAD_MAX_MB || '50', 10));
  res.json({
    uploadMaxMb
  });
});

app.get('/voice-channels', (_req, res) => {
  const channels = [];

  for (const guild of discordClient.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (typeof channel.isVoiceBased !== 'function' || !channel.isVoiceBased()) continue;
      channels.push({
        guildId: guild.id,
        guildName: guild.name,
        channelId: channel.id,
        channelName: channel.name,
        position: Number(channel.rawPosition) || 0
      });
    }
  }

  channels.sort((a, b) => {
    const guildCmp = a.guildName.localeCompare(b.guildName);
    if (guildCmp !== 0) return guildCmp;
    if (a.position !== b.position) return a.position - b.position;
    return a.channelName.localeCompare(b.channelName);
  });

  res.json({ channels });
});

app.use(createAudioRoutes(audioService));
app.use(createPlaylistRoutes(audioService));
app.use(createFileRoutes(audioService));

app.get('/api-docs.json', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/api-docs', (_req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BardBoard API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api-docs.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
      tagsSorter: 'alpha'
    });
  </script>
</body>
</html>`);
});

discordClient.on(Events.ClientReady, () => {
  console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.login(process.env.DISCORD_TOKEN);

const port = Number.parseInt(process.env.BOT_PORT || '3001', 10);
app.listen(port, '0.0.0.0', () => console.log('Bot/API server running on port', port));
