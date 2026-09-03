const fs = require('node:fs');
const path = require('node:path');

const workspaceDir = path.resolve(process.cwd());
const tempDir = path.resolve(workspaceDir, '.e2e-runtime');
if (path.dirname(tempDir) !== workspaceDir) {
  throw new Error('E2E runtime directory escaped the workspace');
}
fs.rmSync(tempDir, { recursive: true, force: true });
fs.mkdirSync(tempDir, { recursive: true });
const envPath = path.join(tempDir, '.env');
const sessionDir = path.join(tempDir, 'sessions').replace(/\\/g, '/');

fs.writeFileSync(envPath, [
  'DISCORD_TOKEN=e2e-token-without-network-login',
  'AUTH_ADMIN_USER=e2e-admin',
  'AUTH_ADMIN_PASS=e2e-secret',
  'SESSION_SECRET=e2e-session-secret',
  `SESSION_DIR=${sessionDir}`,
  'BOT_PORT=3001',
  'RATE_LIMIT_AUDIO=1000',
  'RATE_LIMIT_AUDIO_STATUS=1000',
  'RATE_LIMIT_FILES=1000',
  'RATE_LIMIT_PLAYLIST=1000'
].join('\n') + '\n', 'utf8');

process.env.BARDBOARD_ENV_PATH = envPath;
process.env.NODE_ENV = 'test';

const { app, discordClient } = require('../server/app');

const voiceChannel = {
  id: '323456789012345678',
  name: 'Smoke Voice',
  rawPosition: 0,
  isVoiceBased: () => true
};
const guild = {
  id: 'e2e-guild',
  name: 'E2E Guild',
  channels: { cache: new Map([[voiceChannel.id, voiceChannel]]) }
};
voiceChannel.guild = guild;
discordClient.guilds.cache.set(guild.id, guild);
discordClient.channels.cache.set(voiceChannel.id, voiceChannel);

const server = app.listen(3001, '127.0.0.1', () => {
  console.log('E2E API server listening on http://127.0.0.1:3001');
});

let closing = false;
function close() {
  if (closing) return;
  closing = true;
  server.close(() => {
    discordClient.destroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
    process.exit(0);
  });
}

process.on('SIGINT', close);
process.on('SIGTERM', close);
