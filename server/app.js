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
const { ensureEnvFile, getEnvFilePath, readCurrentConfig, validateInput, writeConfig, isConfiguredForFirstBoot } = require('./utils/envConfig');
const deploymentEnvKeys = ['WEB_PORT', 'BOT_PORT', 'BACKEND_URL', 'UPLOAD_MAX_MB', 'SESSION_DIR'];
const deploymentEnv = Object.fromEntries(deploymentEnvKeys
  .filter(key => Object.prototype.hasOwnProperty.call(process.env, key))
  .map(key => [key, process.env[key]]));
ensureEnvFile();
require('dotenv').config({ path: getEnvFilePath(), override: true });
Object.assign(process.env, deploymentEnv);

const app = express();
const discordClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const audioService = createDiscordAudioService(discordClient);

function safeEqual(a, b) {
  const aBuf = Buffer.from(a || '');
  const bBuf = Buffer.from(b || '');
  if (aBuf.length !== bBuf.length) return false;
  return require('crypto').timingSafeEqual(aBuf, bBuf);
}

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

function isSetupRequiredNow() {
  const currentItems = readCurrentConfig();
  const values = {};
  currentItems.forEach(item => {
    values[item.key] = item.value;
  });
  return !isConfiguredForFirstBoot(values);
}

function getAuthConfig() {
  const adminUser = process.env.AUTH_ADMIN_USER || '';
  const adminPass = process.env.AUTH_ADMIN_PASS || '';
  const userUser = process.env.AUTH_READONLY_USER || '';
  const userPass = process.env.AUTH_READONLY_PASS || '';
  const rememberDays = Math.max(1, Number.parseInt(process.env.LOGIN_REMEMBER_DAYS || '30', 10));
  const adminConfigured = Boolean(adminUser && adminPass);
  const readonlyConfigured = Boolean(userUser && userPass);
  return {
    adminUser,
    adminPass,
    userUser,
    userPass,
    rememberDays,
    adminConfigured,
    readonlyConfigured,
    authEnabled: adminConfigured || readonlyConfigured
  };
}

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

function purgeAllSessions() {
  try {
    if (!fs.existsSync(sessionDir)) return;
    const files = fs.readdirSync(sessionDir);
    for (const file of files) {
      const fullPath = path.join(sessionDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile()) fs.unlinkSync(fullPath);
      } catch {
        // Ignore per-file errors during purge.
      }
    }
  } catch (err) {
    console.warn('Session purge skipped:', err.message);
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
  app.use((err, _req, res, next) => {
    if (err?.message === 'Not allowed by CORS') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return next(err);
  });
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

app.get('/setup/status', (_req, res) => {
  res.status(200).json({ setupRequired: isSetupRequiredNow() });
});

app.post('/setup/complete', (req, res) => {
  if (!isSetupRequiredNow()) return res.status(409).json({ error: 'Setup already completed' });

  const discordToken = String(req.body?.discordToken || '').trim();
  const adminUserInput = String(req.body?.adminUser || '').trim();
  const adminPassInput = String(req.body?.adminPass || '');
  const readonlyEnabled = Boolean(req.body?.readonlyEnabled);
  const readonlyUserInput = String(req.body?.readonlyUser || '').trim();
  const readonlyPassInput = String(req.body?.readonlyPass || '');

  if (!discordToken || /pasteyourdiscordbottokenhere/i.test(discordToken)) {
    return res.status(400).json({ error: 'Discord token is required' });
  }
  if (!adminUserInput) return res.status(400).json({ error: 'Admin username is required' });
  if (!adminPassInput) return res.status(400).json({ error: 'Admin password is required' });
  if (readonlyEnabled && (!readonlyUserInput || !readonlyPassInput)) {
    return res.status(400).json({ error: 'Readonly credentials must include both username and password' });
  }

  const changedKeys = writeConfig({
    DISCORD_TOKEN: discordToken,
    AUTH_ADMIN_USER: adminUserInput,
    AUTH_ADMIN_PASS: adminPassInput,
    AUTH_READONLY_USER: readonlyEnabled ? readonlyUserInput : '',
    AUTH_READONLY_PASS: readonlyEnabled ? readonlyPassInput : '',
    BACKEND_URL: process.env.BACKEND_URL || `http://localhost:${process.env.BOT_PORT || '3001'}`
  });

  process.env.DISCORD_TOKEN = discordToken;
  process.env.AUTH_ADMIN_USER = adminUserInput;
  process.env.AUTH_ADMIN_PASS = adminPassInput;
  process.env.AUTH_READONLY_USER = readonlyEnabled ? readonlyUserInput : '';
  process.env.AUTH_READONLY_PASS = readonlyEnabled ? readonlyPassInput : '';
  ensureDiscordLogin();

  return res.status(200).json({ ok: true, changedKeys, restartRequired: true });
});

app.post('/auth/login', (req, res) => {
  const auth = getAuthConfig();
  if (!auth.authEnabled) return res.status(200).json({ ok: true });

  const username = (req.body.username || '').toString();
  const password = (req.body.password || '').toString();
  let role = '';
  if (auth.adminConfigured && safeEqual(username, auth.adminUser) && safeEqual(password, auth.adminPass)) {
    role = 'admin';
  } else if (auth.readonlyConfigured && safeEqual(username, auth.userUser) && safeEqual(password, auth.userPass)) {
    role = 'user';
  }
  if (!role) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.authenticated = true;
  req.session.role = role;
  req.session.remember = Boolean(req.body.remember);
  if (req.body.remember) {
    req.session.cookie.maxAge = auth.rememberDays * 24 * 60 * 60 * 1000;
  }
  return res.status(200).json({ ok: true, role });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.status(200).json({ ok: true });
  });
});

app.get('/auth/status', (req, res) => {
  const auth = getAuthConfig();
  const role = req.session?.authenticated ? (req.session.role || 'user') : null;
  res.status(200).json({
    setupRequired: isSetupRequiredNow(),
    authEnabled: Boolean(auth.authEnabled),
    authenticated: Boolean(req.session && req.session.authenticated),
    role,
    canManageSettings: role === 'admin'
  });
});

app.use((req, res, next) => {
  const auth = getAuthConfig();
  if (isSetupRequiredNow()) {
    if (req.path === '/setup/status' || req.path === '/setup/complete') return next();
    if (req.path === '/health') return next();
    if (req.path === '/auth/status') return next();
    return res.status(503).json({ error: 'Initial setup required', setupRequired: true });
  }
  if (!auth.authEnabled) return next();
  if (req.session && req.session.authenticated) return next();
  if (req.path === '/auth/login' || req.path === '/auth/logout' || req.path === '/auth/status') return next();
  if (req.path === '/health') return next();
  if (req.path === '/api-docs') return res.redirect('/login');
  return res.status(401).json({ error: 'Unauthorized' });
});

app.use((req, res, next) => {
  const auth = getAuthConfig();
  if (!req.path.startsWith('/settings/')) return next();
  if (req.path === '/settings/restart' && (!auth.authEnabled || isSetupRequiredNow())) return next();
  const role = req.session?.role || '';
  if (role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
});

app.get('/env-config', (req, res) => {
  const uploadMaxMb = Math.max(1, Number.parseInt(process.env.UPLOAD_MAX_MB || '50', 10));
  res.json({
    uploadMaxMb
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/settings/config', (_req, res) => {
  const items = readCurrentConfig()
    .filter(item => item.settingsEditable !== false)
    .map(item => ({
    key: item.key,
    label: item.label,
    description: item.description || '',
    section: item.section,
    secret: Boolean(item.secret),
    type: item.type || 'string',
    configured: Boolean(item.configured),
    value: item.value
    }));
  res.json({ items });
});

app.post('/settings/config', (req, res) => {
  const currentItems = readCurrentConfig();
  const currentMap = new Map(currentItems.map(item => [item.key, item]));
  const validated = validateInput(req.body?.values, currentItems);
  if (validated.error) return res.status(400).json({ error: validated.error });

  const changedKeys = writeConfig(validated.values || {});
  const changedItems = changedKeys
    .map(key => currentMap.get(key))
    .filter(Boolean);
  const botRestartRequired = changedItems.some(item => item.restartScope === 'bot' || item.restartScope === 'both');
  const webRestartRequired = changedItems.some(item => item.restartScope === 'web' || item.restartScope === 'both');
  const authKeys = new Set([
    'AUTH_ADMIN_USER',
    'AUTH_ADMIN_PASS',
    'AUTH_READONLY_USER',
    'AUTH_READONLY_PASS'
  ]);
  const authChanged = changedKeys.some(key => authKeys.has(key));

  return res.json({
    ok: true,
    changedKeys,
    authChanged,
    botRestartRequired,
    webRestartRequired
  });
});

app.post('/settings/restart', (req, res) => {
  if (req.body?.purgeSessions) purgeAllSessions();
  const isDev = process.env.NODE_ENV !== 'production';
  res.json({ ok: true, restarting: !isDev });
  if (isDev) return;
  setTimeout(() => {
    shutdownAndExit('settings restart');
  }, 200);
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
      tagsSorter: 'alpha',
      operationsSorter: (a, b) => {
        const methodOrder = { get: 0, post: 1, put: 2, delete: 3, patch: 4, options: 5, head: 6 };
        const aMethod = String(a.get('method') || '').toLowerCase();
        const bMethod = String(b.get('method') || '').toLowerCase();
        const aRank = Object.prototype.hasOwnProperty.call(methodOrder, aMethod) ? methodOrder[aMethod] : 999;
        const bRank = Object.prototype.hasOwnProperty.call(methodOrder, bMethod) ? methodOrder[bMethod] : 999;
        if (aRank !== bRank) return aRank - bRank;

        const aPath = String(a.get('path') || '');
        const bPath = String(b.get('path') || '');
        const pathCmp = aPath.localeCompare(bPath);
        if (pathCmp !== 0) return pathCmp;

        return aMethod.localeCompare(bMethod);
      }
    });
  </script>
</body>
</html>`);
});

discordClient.on(Events.ClientReady, () => {
  console.log(`Logged in as ${discordClient.user.tag}!`);
});

discordClient.on('error', err => {
  console.error('Discord client error:', err?.message || err);
});

let discordLoginStarted = false;
function ensureDiscordLogin() {
  const discordToken = (process.env.DISCORD_TOKEN || '').trim();
  if (!discordToken) {
    console.warn('DISCORD_TOKEN not configured. API is running, but Discord features are disabled.');
    return;
  }
  if (discordLoginStarted) return;
  discordLoginStarted = true;
  discordClient.login(discordToken).catch(err => {
    discordLoginStarted = false;
    console.error('Discord login failed. API is running, but Discord features are disabled.');
    console.error(err?.message || err);
  });
}
const port = Number.parseInt(process.env.BOT_PORT || '3001', 10);
let httpServer = null;
let stopPromise = null;

function start() {
  if (httpServer) return httpServer;
  stopPromise = null;
  ensureDiscordLogin();
  httpServer = app.listen(port, '0.0.0.0', () => console.log('Bot/API server running on port', port));
  return httpServer;
}

function stop() {
  if (stopPromise) return stopPromise;
  const serverToClose = httpServer;

  stopPromise = Promise.all([
    new Promise((resolve, reject) => {
      if (!serverToClose) return resolve();
      serverToClose.close(error => error ? reject(error) : resolve());
      if (typeof serverToClose.closeIdleConnections === 'function') {
        serverToClose.closeIdleConnections();
      }
    }),
    Promise.resolve().then(() => audioService.shutdown()),
    Promise.resolve().then(() => discordClient.destroy())
  ]).then(() => {
    if (httpServer === serverToClose) httpServer = null;
  });

  return stopPromise;
}

let exitStarted = false;
async function shutdownAndExit(reason, exitCode = 0) {
  if (exitStarted) return;
  exitStarted = true;
  console.log(`Shutting down (${reason})...`);
  const forceExitTimer = setTimeout(() => {
    console.error('Graceful shutdown timed out; forcing exit.');
    process.exit(1);
  }, 10000);
  forceExitTimer.unref();

  try {
    await stop();
    clearTimeout(forceExitTimer);
    process.exit(exitCode);
  } catch (error) {
    clearTimeout(forceExitTimer);
    console.error('Graceful shutdown failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  process.once('SIGTERM', () => shutdownAndExit('SIGTERM'));
  process.once('SIGINT', () => shutdownAndExit('SIGINT'));
  start();
}

module.exports = {
  app,
  audioService,
  discordClient,
  ensureDiscordLogin,
  start,
  stop
};
