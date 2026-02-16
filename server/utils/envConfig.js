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
const fs = require('fs');
const path = require('path');

const CONFIG_FIELDS = [
  { key: 'DISCORD_TOKEN', label: 'Discord Token', section: 'Required Discord Settings', description: 'Bot token from the Discord Developer Portal.', secret: true, restartScope: 'bot' },
  { key: 'AUTH_ADMIN_USER', label: 'Admin Username', section: 'Auth and Session Settings', description: 'Username for admin login.', restartScope: 'bot' },
  { key: 'AUTH_ADMIN_PASS', label: 'Admin Password', section: 'Auth and Session Settings', description: 'Password for admin login.', secret: true, restartScope: 'bot' },
  { key: 'AUTH_READONLY_USER', label: 'User Username', section: 'Auth and Session Settings', description: 'Username for readonly user login.', restartScope: 'bot' },
  { key: 'AUTH_READONLY_PASS', label: 'User Password', section: 'Auth and Session Settings', description: 'Password for readonly user login.', secret: true, restartScope: 'bot' },
  { key: 'SESSION_SECRET', label: 'Session Secret', section: 'Auth and Session Settings', description: 'Secret used to sign session cookies.', secret: true, restartScope: 'bot' },
  { key: 'LOGIN_REMEMBER_DAYS', label: 'Login Remember Days', section: 'Auth and Session Settings', description: 'Remember-me cookie duration in days.', type: 'integer', restartScope: 'bot' },
  { key: 'SESSION_DIR', label: 'Session Directory', section: 'Auth and Session Settings', description: 'Directory where session files are stored.', restartScope: 'bot' },
  { key: 'NOISES_FOLDER', label: 'Noises Folder', section: 'Audio File Behavior', description: 'Category folder name used for overlay noise tracks.', restartScope: 'bot' },
  { key: 'WEB_PORT', label: 'Web Port', section: 'Network and Ports', description: 'Port exposed by the Next.js web UI.', type: 'integer', restartScope: 'web', settingsEditable: false },
  { key: 'BOT_PORT', label: 'Bot/API Port', section: 'Network and Ports', description: 'Port exposed by the bot/API process.', type: 'integer', restartScope: 'bot', settingsEditable: false },
  { key: 'BACKEND_URL', label: 'Backend URL', section: 'Network and Ports', description: 'URL used by Next.js to proxy API requests.', restartScope: 'web', settingsEditable: false },
  { key: 'UPLOAD_MAX_MB', label: 'Upload Max MB', section: 'Uploads and Rate Limit', description: 'Maximum upload size per file in MB.', type: 'integer', restartScope: 'both', settingsEditable: false },
  { key: 'RATE_LIMIT_AUDIO', label: 'Audio Rate Limit', section: 'Uploads and Rate Limit', description: 'Per-minute limit for playback control requests.', type: 'integer', restartScope: 'bot' },
  { key: 'RATE_LIMIT_FILES', label: 'Files Rate Limit', section: 'Uploads and Rate Limit', description: 'Per-minute limit for file-management requests.', type: 'integer', restartScope: 'bot' },
  { key: 'RATE_LIMIT_AUDIO_STATUS', label: 'Audio Status Rate Limit', section: 'Uploads and Rate Limit', description: 'Per-minute limit for status polling endpoints.', type: 'integer', restartScope: 'bot' },
  { key: 'RATE_LIMIT_PLAYLIST', label: 'Playlist Rate Limit', section: 'Uploads and Rate Limit', description: 'Per-minute limit for playlist operations.', type: 'integer', restartScope: 'bot' },
  { key: 'CORS_ORIGINS', label: 'CORS Origins', section: 'CORS (Optional)', description: 'Comma-separated list of allowed origins.', restartScope: 'bot' },
  { key: 'SESSION_FILE_RETRIES', label: 'Session File Retries', section: 'Session File Retry Tuning', description: 'Retry count used by session-file-store.', type: 'integer', restartScope: 'bot' },
  { key: 'SESSION_FILE_RETRY_FACTOR', label: 'Session Retry Factor', section: 'Session File Retry Tuning', description: 'Backoff factor used by session-file-store.', type: 'integer', restartScope: 'bot' },
  { key: 'SESSION_FILE_RETRY_MIN_MS', label: 'Session Retry Min ms', section: 'Session File Retry Tuning', description: 'Minimum retry wait (ms) for session-file-store.', type: 'integer', restartScope: 'bot' },
  { key: 'SESSION_FILE_RETRY_MAX_MS', label: 'Session Retry Max ms', section: 'Session File Retry Tuning', description: 'Maximum retry wait (ms) for session-file-store.', type: 'integer', restartScope: 'bot' },
  { key: 'SESSION_WRITE_RETRIES', label: 'Session Write Retries', section: 'Session File Retry Tuning', description: 'Extra retries for EPERM/EBUSY during session writes.', type: 'integer', restartScope: 'bot' }
];

const EDITABLE_CONFIG_KEYS = new Set(CONFIG_FIELDS
  .filter(field => field.settingsEditable !== false)
  .map(field => field.key));

function getEnvFilePath() {
  return path.join(__dirname, '..', '..', '.env');
}

function unquote(raw) {
  const value = (raw || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteIfNeeded(value) {
  const text = String(value ?? '');
  if (!text) return '';
  if (/[\s#"'\\]/.test(text)) {
    const escaped = text.replace(/\\/g, '\\\\').replace(/'/g, '\\\'');
    return `'${escaped}'`;
  }
  return text;
}

function parseEnvLines(rawText) {
  const lines = rawText.split(/\r?\n/);
  const values = {};
  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    values[key] = unquote(match[2]);
  }
  return { lines, values };
}

function readCurrentConfig() {
  const envPath = getEnvFilePath();
  const raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const parsed = parseEnvLines(raw);

  return CONFIG_FIELDS.map(field => {
    const hasFileValue = Object.prototype.hasOwnProperty.call(parsed.values, field.key);
    const processValue = Object.prototype.hasOwnProperty.call(process.env, field.key) ? String(process.env[field.key] ?? '') : '';
    const value = hasFileValue ? parsed.values[field.key] : processValue;
    return {
      ...field,
      value,
      configured: value !== ''
    };
  });
}

function validateInput(inputValues, currentItems) {
  const out = {};
  const currentMap = new Map(currentItems.map(item => [item.key, item]));
  for (const [rawKey, rawValue] of Object.entries(inputValues || {})) {
    const key = String(rawKey || '').trim();
    if (!EDITABLE_CONFIG_KEYS.has(key)) continue;
    const field = currentMap.get(key);
    const value = String(rawValue ?? '');

    if (value.length > 2048) {
      return { error: `Value too long for ${key}` };
    }

    if (field?.type === 'integer' && value.trim() !== '') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || `${parsed}` !== value.trim() || parsed < 0) {
        return { error: `Invalid integer for ${key}` };
      }
    }

    if (field?.secret && value === '' && field.configured) {
      continue;
    }

    out[key] = value;
  }
  return { values: out };
}

function writeConfig(updatedValues) {
  const envPath = getEnvFilePath();
  const before = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const parsed = parseEnvLines(before);
  const lines = parsed.lines.length ? [...parsed.lines] : [];
  const changedKeys = [];
  const seen = new Set();

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const key = match[1];
    if (!Object.prototype.hasOwnProperty.call(updatedValues, key)) continue;
    seen.add(key);
    const nextValue = quoteIfNeeded(updatedValues[key]);
    const nextLine = `${key}=${nextValue}`;
    if (line !== nextLine) {
      lines[i] = nextLine;
      changedKeys.push(key);
    }
  }

  for (const [key, value] of Object.entries(updatedValues)) {
    if (seen.has(key)) continue;
    const nextLine = `${key}=${quoteIfNeeded(value)}`;
    lines.push(nextLine);
    changedKeys.push(key);
  }

  const normalized = `${lines.join('\n').replace(/\n*$/, '')}\n`;
  if (normalized !== before) {
    fs.writeFileSync(envPath, normalized, 'utf8');
  }

  return changedKeys;
}

module.exports = {
  CONFIG_FIELDS,
  readCurrentConfig,
  validateInput,
  writeConfig
};
