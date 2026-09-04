const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { describe, test } = require('node:test');

const workspaceDir = path.resolve(__dirname, '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(url, child, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited before becoming healthy with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Server did not become healthy: ${lastError?.message || 'timeout'}`);
}

async function startProductionServer() {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bardboard-lifecycle-'));
  const envPath = path.join(runtimeDir, '.env');
  const sessionDir = path.join(runtimeDir, 'sessions').replace(/\\/g, '/');
  const port = await getFreePort();
  fs.writeFileSync(envPath, [
    'DISCORD_TOKEN=invalid-test-token',
    'AUTH_ADMIN_USER=admin',
    'AUTH_ADMIN_PASS=admin-secret',
    'SESSION_SECRET=lifecycle-test-secret',
    'BOT_PORT=1',
    `SESSION_DIR=${sessionDir}`,
    'RATE_LIMIT_AUDIO=1000',
    'RATE_LIMIT_AUDIO_STATUS=1000',
    'RATE_LIMIT_FILES=1000',
    'RATE_LIMIT_PLAYLIST=1000'
  ].join('\n') + '\n', 'utf8');

  const child = spawn(process.execPath, ['server/app.js'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      BARDBOARD_ENV_PATH: envPath,
      BOT_PORT: String(port),
      NODE_ENV: 'production'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForHealth(baseUrl, child);
  } catch (error) {
    if (child.exitCode === null) child.kill('SIGKILL');
    await exited.catch(() => {});
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    throw new Error(`${error.message}\nstdout:\n${stdout}\nstderr:\n${stderr}`);
  }

  return {
    baseUrl,
    child,
    exited,
    logs: () => ({ stdout, stderr }),
    async cleanup() {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      await exited.catch(() => {});
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    }
  };
}

describe('production process lifecycle', { concurrency: false }, () => {
  test('the production restart endpoint drains the server and exits cleanly', async () => {
    const server = await startProductionServer();
    try {
      const loginResponse = await fetch(`${server.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin-secret' })
      });
      assert.equal(loginResponse.status, 200);
      const cookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
      assert.ok(cookie);

      const response = await fetch(`${server.baseUrl}/settings/restart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: '{}'
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, restarting: true });

      const result = await server.exited;
      assert.deepEqual(result, { code: 0, signal: null });
      assert.match(server.logs().stdout, /Shutting down \(settings restart\)/);
      await assert.rejects(() => fetch(`${server.baseUrl}/health`));
    } finally {
      await server.cleanup();
    }
  });

  test('SIGTERM and SIGINT trigger graceful shutdown', {
    skip: process.platform === 'win32' ? 'POSIX signals are exercised by the Linux CI and Docker smoke test' : false
  }, async () => {
    for (const signal of ['SIGTERM', 'SIGINT']) {
      const server = await startProductionServer();
      try {
        assert.equal(server.child.kill(signal), true);
        const result = await server.exited;
        assert.deepEqual(result, { code: 0, signal: null });
        assert.match(server.logs().stdout, new RegExp(`Shutting down \\(${signal}\\)`));
        await assert.rejects(() => fetch(`${server.baseUrl}/health`));
      } finally {
        await server.cleanup();
      }
    }
  });
});
