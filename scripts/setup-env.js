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
const crypto = require('crypto');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const SAMPLE_PATH = path.join(process.cwd(), '.env.sample');
const ENV_PATH = path.join(process.cwd(), '.env');

const OPTIONAL_KEYS = [
  'SESSION_DIR',
  'NOISES_FOLDER',
  'WEB_PORT',
  'BOT_PORT',
  'BACKEND_URL',
  'UPLOAD_MAX_MB',
  'RATE_LIMIT_AUDIO',
  'RATE_LIMIT_FILES',
  'RATE_LIMIT_AUDIO_STATUS',
  'RATE_LIMIT_PLAYLIST',
  'CORS_ORIGINS',
  'SESSION_FILE_RETRIES',
  'SESSION_FILE_RETRY_FACTOR',
  'SESSION_FILE_RETRY_MIN_MS',
  'SESSION_FILE_RETRY_MAX_MS',
  'SESSION_WRITE_RETRIES'
];

function unquote(rawValue) {
  const text = String(rawValue ?? '').trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('\'') && text.endsWith('\''))
  ) {
    return text.slice(1, -1);
  }
  return text;
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

function parseSample(raw) {
  const lines = raw.split(/\r?\n/);
  const values = {};

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = unquote(match[2]);
  }

  return { lines, values };
}

function normalizeYesNo(input, fallback) {
  const value = String(input ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (['y', 'yes'].includes(value)) return true;
  if (['n', 'no'].includes(value)) return false;
  return fallback;
}

async function askRequired(rl, question, validateFn) {
  while (true) {
    const value = (await rl.question(question)).trim();
    if (validateFn(value)) return value;
    console.log('Invalid value, please try again.');
  }
}

async function askOptional(rl, question, fallback = '') {
  const raw = await rl.question(question);
  const trimmed = raw.trim();
  return trimmed ? trimmed : fallback;
}

async function askYesNo(rl, question, fallback) {
  const suffix = fallback ? ' [Y/n] ' : ' [y/N] ';
  const value = await rl.question(question + suffix);
  return normalizeYesNo(value, fallback);
}

async function askAuthMode(rl) {
  console.log('');
  console.log('Authentication mode:');
  console.log('1) Disabled (anyone reaching your LAN URL can use BardBoard)');
  console.log('2) Admin only');
  console.log('3) Admin + readonly user');

  while (true) {
    const choice = (await rl.question('Choose 1, 2, or 3 [2]: ')).trim() || '2';
    if (choice === '1' || choice === '2' || choice === '3') return choice;
    console.log('Please enter 1, 2, or 3.');
  }
}

function applyValuesToLines(lines, nextValues) {
  return lines.map(line => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) return line;
    const key = match[2];
    if (!Object.prototype.hasOwnProperty.call(nextValues, key)) return line;
    return `${match[1]}${key}=${quoteIfNeeded(nextValues[key])}`;
  });
}

async function main() {
  if (!fs.existsSync(SAMPLE_PATH)) {
    console.error('Missing .env.sample. Cannot run wizard.');
    process.exit(1);
  }

  const sampleRaw = fs.readFileSync(SAMPLE_PATH, 'utf8');
  const { lines, values } = parseSample(sampleRaw);
  const nextValues = { ...values };
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    console.log('');
    console.log('BardBoard environment setup wizard');
    console.log('This will generate .env from .env.sample.');
    console.log('');

    nextValues.DISCORD_TOKEN = await askRequired(
      rl,
      'Discord bot token (required): ',
      value => value.length > 20
    );

    const authMode = await askAuthMode(rl);
    if (authMode === '1') {
      nextValues.AUTH_ADMIN_USER = '';
      nextValues.AUTH_ADMIN_PASS = '';
      nextValues.AUTH_READONLY_USER = '';
      nextValues.AUTH_READONLY_PASS = '';
      nextValues.SESSION_SECRET = '';
    } else {
      nextValues.AUTH_ADMIN_USER = await askRequired(
        rl,
        'Admin username: ',
        value => value.length > 0
      );
      nextValues.AUTH_ADMIN_PASS = await askRequired(
        rl,
        'Admin password: ',
        value => value.length > 0
      );

      if (authMode === '3') {
        nextValues.AUTH_READONLY_USER = await askRequired(
          rl,
          'Readonly username: ',
          value => value.length > 0
        );
        nextValues.AUTH_READONLY_PASS = await askRequired(
          rl,
          'Readonly password: ',
          value => value.length > 0
        );
      } else {
        nextValues.AUTH_READONLY_USER = '';
        nextValues.AUTH_READONLY_PASS = '';
      }

      const autoSecret = await askYesNo(rl, 'Generate SESSION_SECRET automatically?', true);
      if (autoSecret) {
        nextValues.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
      } else {
        nextValues.SESSION_SECRET = await askRequired(
          rl,
          'SESSION_SECRET (recommended 32+ chars): ',
          value => value.length >= 8
        );
      }
    }

    const configureOptional = await askYesNo(rl, 'Do you want to configure optional/advanced values now?', false);
    if (configureOptional) {
      console.log('');
      console.log('Optional values (press Enter to keep current default):');
      for (const key of OPTIONAL_KEYS) {
        const fallback = String(nextValues[key] ?? '');
        const shownDefault = fallback || '(empty)';
        const answer = await askOptional(rl, `${key} [${shownDefault}]: `, fallback);
        nextValues[key] = answer;
      }
    }

    if (!nextValues.BACKEND_URL || !nextValues.BACKEND_URL.trim()) {
      const botPort = String(nextValues.BOT_PORT || '3001').trim() || '3001';
      nextValues.BACKEND_URL = `http://localhost:${botPort}`;
    }

    const outputLines = applyValuesToLines(lines, nextValues);
    const output = `${outputLines.join('\n').replace(/\n*$/, '')}\n`;
    fs.writeFileSync(ENV_PATH, output, 'utf8');

    console.log('');
    console.log(`.env generated at ${ENV_PATH}`);
    console.log('Next step: run docker compose up --build -d');
  } finally {
    rl.close();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('Setup failed:', err?.message || err);
    process.exit(1);
  });
}
