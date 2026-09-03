const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { afterEach, describe, test } = require('node:test');
const {
  CONFIG_FIELDS,
  ensureEnvFile,
  isConfiguredForFirstBoot,
  readCurrentConfig,
  validateInput,
  writeConfig
} = require('../server/utils/envConfig');
const { hasAllowedExt, resolveAudioPathFrom, sanitizeCategory } = require('../server/utils/path');
const { isValidChannelId, normalizeAudioFileName } = require('../server/utils/validation');

const originalEnvPath = process.env.BARDBOARD_ENV_PATH;
const temporaryDirs = [];

afterEach(() => {
  if (originalEnvPath === undefined) delete process.env.BARDBOARD_ENV_PATH;
  else process.env.BARDBOARD_ENV_PATH = originalEnvPath;
  while (temporaryDirs.length) {
    fs.rmSync(temporaryDirs.pop(), { recursive: true, force: true });
  }
});

function useTemporaryEnv() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bardboard-env-'));
  temporaryDirs.push(dir);
  const envPath = path.join(dir, '.env');
  process.env.BARDBOARD_ENV_PATH = envPath;
  return envPath;
}

function currentItems(values = {}) {
  return CONFIG_FIELDS.map(field => ({
    ...field,
    value: values[field.key] || '',
    configured: Boolean(values[field.key])
  }));
}

describe('path and request validation', () => {
  test('resolveAudioPathFrom confines paths to the configured audio directory', () => {
    const base = path.resolve(os.tmpdir(), 'bardboard-audio-root');
    assert.equal(resolveAudioPathFrom(base, 'Combat/roar.mp3'), path.join(base, 'Combat', 'roar.mp3'));
    assert.equal(resolveAudioPathFrom(base, '../secret.mp3'), null);
    assert.equal(resolveAudioPathFrom(base, path.resolve(base, '..', 'secret.mp3')), null);
  });

  test('category, extension and channel validators accept only supported values', () => {
    assert.equal(sanitizeCategory(' Combat! '), 'Combat!');
    assert.equal(sanitizeCategory('../Combat'), 'Combat');
    assert.equal(hasAllowedExt('track.MP3'), true);
    assert.equal(hasAllowedExt('track.flac'), false);
    assert.equal(isValidChannelId('12345678901234567'), true);
    assert.equal(isValidChannelId('1234'), false);
    assert.equal(normalizeAudioFileName('Combat\\roar.ogg'), 'Combat/roar.ogg');
    assert.equal(normalizeAudioFileName('../roar.ogg'), null);
  });
});

describe('environment configuration', () => {
  test('first-boot validation requires token and admin credentials', () => {
    assert.equal(isConfiguredForFirstBoot({}), false);
    assert.equal(isConfiguredForFirstBoot({
      DISCORD_TOKEN: 'PasteYourDiscordBotTokenHere',
      AUTH_ADMIN_USER: 'admin',
      AUTH_ADMIN_PASS: 'secret'
    }), false);
    assert.equal(isConfiguredForFirstBoot({
      DISCORD_TOKEN: 'token',
      AUTH_ADMIN_USER: 'admin',
      AUTH_ADMIN_PASS: 'secret'
    }), true);
  });

  test('validateInput filters unknown keys and validates numeric fields', () => {
    const items = currentItems({ AUTH_ADMIN_PASS: 'existing' });
    assert.deepEqual(validateInput({ UNKNOWN: 'ignored', RATE_LIMIT_AUDIO: '25' }, items), {
      values: { RATE_LIMIT_AUDIO: '25' }
    });
    assert.match(validateInput({ RATE_LIMIT_AUDIO: '-1' }, items).error, /Invalid integer/);
    assert.match(validateInput({ RATE_LIMIT_AUDIO: '1.5' }, items).error, /Invalid integer/);
    assert.match(validateInput({ NOISES_VOLUME: '10.1' }, items).error, /Invalid number/);
    assert.deepEqual(validateInput({ AUTH_ADMIN_PASS: '' }, items), { values: {} });
    assert.match(validateInput({ AUTH_ADMIN_USER: 'x'.repeat(2049) }, items).error, /Value too long/);
  });

  test('ensureEnvFile creates defaults and writeConfig round-trips quoted secrets', () => {
    const envPath = useTemporaryEnv();
    ensureEnvFile();
    assert.equal(fs.existsSync(envPath), true);

    const secret = "two words \\ and 'quotes'";
    const changed = writeConfig({
      DISCORD_TOKEN: 'token',
      AUTH_ADMIN_USER: 'admin',
      AUTH_ADMIN_PASS: secret
    });
    assert.deepEqual(changed.sort(), ['AUTH_ADMIN_PASS', 'AUTH_ADMIN_USER', 'DISCORD_TOKEN']);

    const values = Object.fromEntries(readCurrentConfig().map(item => [item.key, item.value]));
    assert.equal(values.DISCORD_TOKEN, 'token');
    assert.equal(values.AUTH_ADMIN_USER, 'admin');
    assert.equal(values.AUTH_ADMIN_PASS, secret);
    assert.equal(isConfiguredForFirstBoot(values), true);
  });

  test('writeConfig preserves unrelated lines and reports only changed keys', () => {
    const envPath = useTemporaryEnv();
    fs.writeFileSync(envPath, '# custom\nDISCORD_TOKEN=old\nEXTRA=value\n', 'utf8');
    assert.deepEqual(writeConfig({ DISCORD_TOKEN: 'new' }), ['DISCORD_TOKEN']);
    assert.match(fs.readFileSync(envPath, 'utf8'), /^# custom\nDISCORD_TOKEN=new\nEXTRA=value\n$/);
    assert.deepEqual(writeConfig({ DISCORD_TOKEN: 'new' }), []);
  });
});
