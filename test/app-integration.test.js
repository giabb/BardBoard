const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, describe, test } = require('node:test');
const { createCookieClient, request, withTestServer } = require('../test-support/http');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bardboard-app-'));
const envPath = path.join(tempDir, '.env');
const sessionDir = path.join(tempDir, 'sessions').replace(/\\/g, '/');

function writeTestConfig(discordToken = 'fake-discord-token') {
  fs.writeFileSync(envPath, [
    `DISCORD_TOKEN=${discordToken}`,
    'AUTH_ADMIN_USER=admin',
    'AUTH_ADMIN_PASS=admin-secret',
    'AUTH_READONLY_USER=viewer',
    'AUTH_READONLY_PASS=viewer-secret',
    'SESSION_SECRET=test-session-secret',
    `SESSION_DIR=${sessionDir}`,
    'CORS_ORIGINS=https://allowed.example',
    'RATE_LIMIT_AUDIO=1000',
    'RATE_LIMIT_AUDIO_STATUS=1000',
    'RATE_LIMIT_FILES=1000',
    'RATE_LIMIT_PLAYLIST=1000'
  ].join('\n') + '\n', 'utf8');
}

writeTestConfig();
process.env.BARDBOARD_ENV_PATH = envPath;
process.env.NODE_ENV = 'test';

const { app, discordClient } = require('../server/app');

after(() => {
  discordClient.guilds.cache.clear();
  discordClient.destroy();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('complete Express application', { concurrency: false }, () => {
  test('health is public while bot APIs require authentication', async () => {
    await withTestServer(app, async baseUrl => {
      assert.deepEqual(await request(baseUrl, '/health'), { status: 200, body: { ok: true } });
      assert.deepEqual(await request(baseUrl, '/voice-channels'), {
        status: 401,
        body: { error: 'Unauthorized' }
      });
      assert.equal((await request(baseUrl, '/api-docs.json')).status, 401);
    });
  });

  test('CORS allows configured origins and rejects all others', async () => {
    await withTestServer(app, async baseUrl => {
      const allowed = await fetch(`${baseUrl}/health`, {
        headers: { origin: 'https://allowed.example' }
      });
      assert.equal(allowed.status, 200);
      assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example');

      const denied = await request(baseUrl, '/health', {
        headers: { origin: 'https://denied.example' }
      });
      assert.deepEqual(denied, { status: 403, body: { error: 'Origin not allowed' } });
    });
  });

  test('invalid credentials are rejected', async () => {
    await withTestServer(app, async baseUrl => {
      const response = await request(baseUrl, '/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'wrong' }
      });
      assert.deepEqual(response, {
        status: 401,
        body: { error: 'Invalid username or password' }
      });
    });
  });

  test('readonly users can use the bot but cannot manage settings', async () => {
    await withTestServer(app, async baseUrl => {
      const client = createCookieClient(baseUrl);
      const login = await client('/auth/login', {
        method: 'POST',
        body: { username: 'viewer', password: 'viewer-secret' }
      });
      assert.equal(login.status, 200);
      assert.deepEqual(login.body, { ok: true, role: 'user' });

      const status = await client('/auth/status');
      assert.equal(status.body.authenticated, true);
      assert.equal(status.body.role, 'user');
      assert.equal(status.body.canManageSettings, false);
      assert.equal((await client('/voice-channels')).status, 200);
      assert.deepEqual((await client('/settings/config')).body, { error: 'Forbidden' });
    });
  });

  test('admins can read settings and API docs, then log out', async () => {
    await withTestServer(app, async baseUrl => {
      const client = createCookieClient(baseUrl);
      const login = await client('/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'admin-secret', remember: true }
      });
      assert.deepEqual(login.body, { ok: true, role: 'admin' });
      assert.match(login.headers.get('set-cookie'), /Expires=/i);

      const settings = await client('/settings/config');
      assert.equal(settings.status, 200);
      assert.equal(Array.isArray(settings.body.items), true);
      assert.equal((await client('/api-docs.json')).status, 200);

      assert.deepEqual((await client('/auth/logout', { method: 'POST' })).body, { ok: true });
      assert.equal((await client('/settings/config')).status, 401);
    });
  });

  test('admins can validate and update runtime configuration', async () => {
    await withTestServer(app, async baseUrl => {
      const client = createCookieClient(baseUrl);
      await client('/auth/login', {
        method: 'POST',
        body: { username: 'admin', password: 'admin-secret' }
      });

      const invalid = await client('/settings/config', {
        method: 'POST',
        body: { values: { RATE_LIMIT_AUDIO: '-1' } }
      });
      assert.equal(invalid.status, 400);
      assert.match(invalid.body.error, /Invalid integer/);

      const updated = await client('/settings/config', {
        method: 'POST',
        body: { values: { NOISES_VOLUME: '3' } }
      });
      assert.deepEqual(updated.body, {
        ok: true,
        changedKeys: ['NOISES_VOLUME'],
        authChanged: false,
        botRestartRequired: true,
        webRestartRequired: false
      });

      const restart = await client('/settings/restart', {
        method: 'POST',
        body: {}
      });
      assert.deepEqual(restart.body, { ok: true, restarting: false });
    });
    writeTestConfig();
  });

  test('voice channels are filtered and sorted by guild, position and name', async () => {
    const guildA = {
      id: 'guild-a',
      name: 'Alpha',
      channels: {
        cache: new Map([
          ['text', { id: 'text', name: 'chat', isVoiceBased: () => false }],
          ['voice-2', { id: 'voice-2', name: 'Beta', rawPosition: 2, isVoiceBased: () => true }],
          ['voice-1', { id: 'voice-1', name: 'Alpha', rawPosition: 2, isVoiceBased: () => true }]
        ])
      }
    };
    const guildZ = {
      id: 'guild-z',
      name: 'Zulu',
      channels: {
        cache: new Map([
          ['voice-3', { id: 'voice-3', name: 'General', rawPosition: 0, isVoiceBased: () => true }]
        ])
      }
    };
    discordClient.guilds.cache.set(guildZ.id, guildZ);
    discordClient.guilds.cache.set(guildA.id, guildA);

    await withTestServer(app, async baseUrl => {
      const client = createCookieClient(baseUrl);
      await client('/auth/login', {
        method: 'POST',
        body: { username: 'viewer', password: 'viewer-secret' }
      });
      const response = await client('/voice-channels');
      assert.deepEqual(response.body.channels.map(channel => channel.channelId), [
        'voice-1',
        'voice-2',
        'voice-3'
      ]);
    });
  });

  test('setup mode exposes only setup status and health', async () => {
    writeTestConfig('');
    try {
      await withTestServer(app, async baseUrl => {
        assert.deepEqual(await request(baseUrl, '/setup/status'), {
          status: 200,
          body: { setupRequired: true }
        });
        assert.equal((await request(baseUrl, '/health')).status, 200);
        assert.deepEqual(await request(baseUrl, '/voice-channels'), {
          status: 503,
          body: { error: 'Initial setup required', setupRequired: true }
        });

        assert.deepEqual(await request(baseUrl, '/setup/complete', {
          method: 'POST',
          body: {
            discordToken: 'PasteYourDiscordBotTokenHere',
            adminUser: 'admin',
            adminPass: 'secret'
          }
        }), {
          status: 400,
          body: { error: 'Discord token is required' }
        });

        assert.deepEqual(await request(baseUrl, '/setup/complete', {
          method: 'POST',
          body: {
            discordToken: 'token',
            adminUser: 'admin',
            adminPass: 'secret',
            readonlyEnabled: true,
            readonlyUser: 'viewer'
          }
        }), {
          status: 400,
          body: { error: 'Readonly credentials must include both username and password' }
        });
      });
    } finally {
      writeTestConfig();
    }
  });

  test('first-boot setup persists credentials and starts Discord login', async () => {
    writeTestConfig('');
    const originalLogin = discordClient.login;
    const loginCalls = [];
    discordClient.login = async token => {
      loginCalls.push(token);
      return discordClient;
    };

    try {
      await withTestServer(app, async baseUrl => {
        const response = await request(baseUrl, '/setup/complete', {
          method: 'POST',
          body: {
            discordToken: 'new-discord-token',
            adminUser: 'new-admin',
            adminPass: 'new-secret',
            readonlyEnabled: true,
            readonlyUser: 'new-viewer',
            readonlyPass: 'viewer-secret'
          }
        });
        assert.equal(response.status, 200);
        assert.equal(response.body.ok, true);
        assert.equal(response.body.restartRequired, true);
        assert.equal(response.body.changedKeys.includes('DISCORD_TOKEN'), true);
        assert.deepEqual(loginCalls, ['new-discord-token']);
        assert.deepEqual(await request(baseUrl, '/setup/status'), {
          status: 200,
          body: { setupRequired: false }
        });

        const saved = fs.readFileSync(envPath, 'utf8');
        assert.match(saved, /^DISCORD_TOKEN=new-discord-token$/m);
        assert.match(saved, /^AUTH_ADMIN_USER=new-admin$/m);
        assert.match(saved, /^AUTH_READONLY_USER=new-viewer$/m);
      });
    } finally {
      discordClient.login = originalLogin;
      writeTestConfig();
      process.env.DISCORD_TOKEN = 'fake-discord-token';
      process.env.AUTH_ADMIN_USER = 'admin';
      process.env.AUTH_ADMIN_PASS = 'admin-secret';
      process.env.AUTH_READONLY_USER = 'viewer';
      process.env.AUTH_READONLY_PASS = 'viewer-secret';
    }
  });
});
