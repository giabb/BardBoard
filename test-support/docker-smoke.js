const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const workspaceDir = path.resolve(__dirname, '..');
const runtimeDir = path.resolve(workspaceDir, '.docker-smoke-runtime');
if (path.dirname(runtimeDir) !== workspaceDir) {
  throw new Error('Docker smoke runtime directory escaped the workspace');
}

const projectName = `bardboard-smoke-${process.pid}`;
if (!/^bardboard-smoke-\d+$/.test(projectName)) {
  throw new Error('Unsafe Docker Compose project name');
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function runDocker(args, env, { allowFailure = false, capture = false } = {}) {
  const result = spawnSync('docker', args, {
    cwd: workspaceDir,
    env,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: capture ? 'utf8' : undefined,
    shell: false
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    const details = capture ? `\n${result.stderr || result.stdout || ''}` : '';
    throw new Error(`docker ${args.join(' ')} failed with exit code ${result.status}${details}`);
  }
  return capture ? String(result.stdout || '').trim() : result.status;
}

function compose(args, env, options) {
  return runDocker(['compose', '-p', projectName, ...args], env, options);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function assertWebHealth(webPort, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${webPort}/api/health`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (body?.ok !== true) throw new Error('unexpected response body');
      return;
    } catch (error) {
      lastError = error;
      await delay(500);
    }
  }

  throw new Error(`Web health endpoint did not recover: ${lastError?.message || 'timeout'}`);
}

async function waitForContainerHealthy(containerId, env, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  let lastStatus = 'unknown';

  while (Date.now() < deadline) {
    lastStatus = runDocker([
      'inspect',
      '--format',
      '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}',
      containerId
    ], env, { capture: true, allowFailure: true });
    if (lastStatus === 'healthy') return;
    await delay(500);
  }

  const state = runDocker(['inspect', '--format', '{{json .State}}', containerId], env, {
    capture: true,
    allowFailure: true
  });
  const logs = runDocker(['logs', '--tail', '100', containerId], env, {
    capture: true,
    allowFailure: true
  });
  throw new Error(`Container ${containerId} did not recover; last status: ${lastStatus}\nState: ${state}\nLogs:\n${logs}`);
}

function inspectJson(containerId, expression, env) {
  const value = runDocker(['inspect', '--format', expression, containerId], env, { capture: true });
  return JSON.parse(value);
}

async function main() {
  const webPort = await getFreePort();
  const botPort = 3001;
  const env = {
    ...process.env,
    WEB_PORT: String(webPort),
    BOT_PORT: String(botPort),
    WEB_CONTAINER_NAME: `${projectName}-web`,
    BOT_CONTAINER_NAME: `${projectName}-bot`,
    SESSION_DIR: './.docker-smoke-runtime/sessions'
  };

  fs.rmSync(runtimeDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(runtimeDir, 'sessions'), { recursive: true });

  try {
    compose(['config', '--quiet'], env);
    compose(['build'], env);
    compose(['up', '--detach', '--wait', '--wait-timeout', '180'], env);

    await assertWebHealth(webPort);

    const botContainer = compose(['ps', '--quiet', 'bard-board-bot'], env, { capture: true });
    const webContainer = compose(['ps', '--quiet', 'bard-board-web'], env, { capture: true });
    if (!botContainer || !webContainer) throw new Error('Compose did not return both container IDs');

    const runtimeUser = runDocker(['image', 'inspect', '--format', '{{.Config.User}}', 'bardboard:local'], env, { capture: true });
    if (runtimeUser !== 'node') throw new Error(`Image runs as unexpected user: ${runtimeUser || '(root)'}`);
    const botUid = compose(['exec', '-T', 'bard-board-bot', 'id', '-u'], env, { capture: true });
    if (botUid !== '1000') throw new Error(`Bot container runs with unexpected UID: ${botUid}`);

    const webEnvironment = inspectJson(webContainer, '{{json .Config.Env}}', env);
    const forbiddenSecrets = ['DISCORD_TOKEN=', 'AUTH_ADMIN_USER=', 'AUTH_ADMIN_PASS=', 'AUTH_READONLY_USER=', 'AUTH_READONLY_PASS=', 'SESSION_SECRET='];
    const exposedSecret = webEnvironment.find(entry => forbiddenSecrets.some(prefix => entry.startsWith(prefix)));
    if (exposedSecret) throw new Error(`Web container received a bot-only secret: ${exposedSecret.split('=')[0]}`);

    for (const containerId of [botContainer, webContainer]) {
      const hostConfig = inspectJson(containerId, '{{json .HostConfig}}', env);
      if (hostConfig.Init !== true) throw new Error(`Container ${containerId} does not use an init process`);
      if (!hostConfig.SecurityOpt?.includes('no-new-privileges:true')) {
        throw new Error(`Container ${containerId} is missing no-new-privileges`);
      }
      if (hostConfig.LogConfig?.Type !== 'json-file'
        || hostConfig.LogConfig?.Config?.['max-size'] !== '10m'
        || hostConfig.LogConfig?.Config?.['max-file'] !== '3') {
        throw new Error(`Container ${containerId} has unexpected log rotation settings`);
      }
    }

    compose(['restart', 'bard-board-bot'], env);
    compose(['up', '--detach', '--wait', '--wait-timeout', '180'], env);
    await assertWebHealth(webPort);
    const botLogs = compose(['logs', '--no-color', 'bard-board-bot'], env, { capture: true });
    if (!botLogs.includes('Shutting down (SIGTERM)')) {
      throw new Error('Bot restart did not exercise graceful SIGTERM shutdown');
    }

    compose([
      'exec', '-T', 'bard-board-bot', 'node', '-e',
      "process.kill(1, 'SIGKILL')"
    ], env, { allowFailure: true });
    await waitForContainerHealthy(botContainer, env);
    await assertWebHealth(webPort);

    compose([
      'exec', '-T', 'bard-board-web', 'node', '-e',
      "process.kill(1, 'SIGKILL')"
    ], env, { allowFailure: true });
    await waitForContainerHealthy(webContainer, env);
    await assertWebHealth(webPort);

    const markerPath = '/usr/src/app/config/docker-restore-smoke.txt';
    const markerContents = `restored-${process.pid}`;
    const backupConfigDir = path.join(runtimeDir, 'backup', 'config');
    fs.mkdirSync(backupConfigDir, { recursive: true });
    compose([
      'exec', '-T', 'bard-board-bot', 'node', '-e',
      `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, ${JSON.stringify(markerContents)})`
    ], env);
    runDocker(['cp', `${botContainer}:/usr/src/app/config/.`, backupConfigDir], env);
    compose([
      'exec', '-T', 'bard-board-bot', 'node', '-e',
      `require('node:fs').rmSync(${JSON.stringify(markerPath)})`
    ], env);
    runDocker(['cp', `${backupConfigDir}${path.sep}.`, `${botContainer}:/usr/src/app/config`], env);
    runDocker(['exec', '--user', 'root', botContainer, 'chown', '-R', 'node:node', '/usr/src/app/config'], env);
    compose([
      'exec', '-T', 'bard-board-bot', 'node', '-e',
      `const fs=require('node:fs');const p=${JSON.stringify(markerPath)};if(fs.readFileSync(p,'utf8')!==${JSON.stringify(markerContents)})process.exit(1);fs.appendFileSync(p,'-writable')`
    ], env);

    compose(['ps'], env);
    console.log(`Docker smoke test passed (health, isolation, recovery, restore) on http://127.0.0.1:${webPort}`);
  } finally {
    compose(['down', '--volumes', '--remove-orphans'], env, { allowFailure: true });
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
