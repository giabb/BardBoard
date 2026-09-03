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

function compose(args, env, { allowFailure = false } = {}) {
  const result = spawnSync('docker', ['compose', '-p', projectName, ...args], {
    cwd: workspaceDir,
    env,
    stdio: 'inherit',
    shell: false
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`docker compose ${args.join(' ')} failed with exit code ${result.status}`);
  }
  return result.status;
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

    const response = await fetch(`http://127.0.0.1:${webPort}/api/health`);
    if (!response.ok) throw new Error(`Web health endpoint returned HTTP ${response.status}`);
    const body = await response.json();
    if (body?.ok !== true) throw new Error('Web health endpoint returned an unexpected body');

    compose(['ps'], env);
    console.log(`Docker smoke test passed on http://127.0.0.1:${webPort}`);
  } finally {
    compose(['down', '--volumes', '--remove-orphans'], env, { allowFailure: true });
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
