const { test, expect } = require('@playwright/test');

const CHANNEL_ONE = '123456789012345678';
const CHANNEL_TWO = '223456789012345678';

function parseRequestBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  const contentType = request.headers()['content-type'] || '';
  if (contentType.includes('application/json')) return request.postDataJSON();
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return null;
}

async function mockSoundboard(page, options = {}) {
  const state = {
    playlist: [...(options.initialPlaylist || [])],
    nowPlaying: options.initialNowPlaying || null,
    requests: [],
    authenticated: options.authenticated ?? true,
    setupRequired: Boolean(options.setupMode),
    setupFailuresRemaining: Number(options.setupFailures || 0),
    transientFailures: { ...(options.transientFailures || {}) },
    canManageSettings: options.canManageSettings ?? true,
    settings: Object.fromEntries((options.settingsItems || [
      {
        key: 'DISCORD_TOKEN',
        value: 'configured-token',
        section: 'Required Discord Settings',
        description: 'Bot token.',
        secret: true
      },
      {
        key: 'AUTH_ADMIN_USER',
        value: 'admin',
        section: 'Auth and Session Settings',
        description: 'Admin username.'
      },
      {
        key: 'RATE_LIMIT_AUDIO',
        value: '120',
        section: 'Uploads and Rate Limit',
        description: 'Playback requests per minute.',
        type: 'integer'
      }
    ]).map(item => [item.key, { ...item }])),
    audio: {
      root: [...(options.audio?.root || ['intro.mp3'])],
      categories: Object.fromEntries(Object.entries(options.audio?.categories || {
        Combat: ['Combat/roar.ogg']
      }).map(([name, files]) => [name, [...files]]))
    }
  };

  const removeAudioFile = file => {
    state.audio.root = state.audio.root.filter(item => item !== file);
    for (const name of Object.keys(state.audio.categories)) {
      state.audio.categories[name] = state.audio.categories[name].filter(item => item !== file);
    }
  };

  const addAudioFile = (file, category = '') => {
    if (!category) {
      state.audio.root.push(file);
      return;
    }
    state.audio.categories[category] ||= [];
    state.audio.categories[category].push(`${category}/${file.split('/').pop()}`);
  };

  await page.route('**/api/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname;
    const method = request.method();
    const body = parseRequestBody(request);
    state.requests.push({ method, path: apiPath, body });

    const transientKey = `${method} ${apiPath}`;
    if (state.transientFailures[transientKey] > 0) {
      state.transientFailures[transientKey] -= 1;
      return route.fulfill({ status: 500, json: { error: 'Temporary service failure' } });
    }

    if (apiPath === '/api/auth/login') {
      const credentials = options.credentials || { username: 'admin', password: 'secret' };
      if (body?.username !== credentials.username || body?.password !== credentials.password) {
        return route.fulfill({ status: 401, json: { error: 'Invalid credentials' } });
      }
      state.authenticated = true;
      return route.fulfill({
        status: 200,
        headers: { 'set-cookie': 'bardboard_session=e2e-session; Path=/; HttpOnly; SameSite=Lax' },
        json: { ok: true }
      });
    }
    if (apiPath === '/api/auth/logout') {
      state.authenticated = false;
      return route.fulfill({
        status: 200,
        headers: { 'set-cookie': 'bardboard_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax' },
        json: { ok: true }
      });
    }
    if (options.unauthorizedPath === apiPath) {
      return route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    }
    if (options.setupRequiredPath === apiPath) {
      return route.fulfill({ status: 503, json: { setupRequired: true } });
    }
    if (options.errorPath === apiPath && method === 'POST') {
      return route.fulfill({ status: 500, json: { error: 'Simulated API failure' } });
    }

    if (apiPath === '/api/setup/status') {
      return route.fulfill({ json: { setupRequired: state.setupRequired } });
    }
    if (apiPath === '/api/setup/complete') {
      if (state.setupFailuresRemaining > 0) {
        state.setupFailuresRemaining -= 1;
        return route.fulfill({ status: 400, json: { error: 'Discord rejected the token' } });
      }
      state.setupRequired = false;
      return route.fulfill({ json: { ok: true, restartRequired: true } });
    }
    if (!state.authenticated) {
      return route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
    }
    if (apiPath === '/api/env-config') return route.fulfill({ json: { uploadMaxMb: 50 } });
    if (apiPath === '/api/auth/status') {
      return route.fulfill({
        json: {
          setupRequired: false,
          authEnabled: true,
          authenticated: state.authenticated,
          role: 'admin',
          canManageSettings: state.canManageSettings
        }
      });
    }
    if (apiPath === '/api/settings/config' && method === 'GET') {
      return route.fulfill({ json: { items: Object.values(state.settings) } });
    }
    if (apiPath === '/api/settings/config' && method === 'POST') {
      const nextValues = body?.values || {};
      const audioRateLimit = nextValues.RATE_LIMIT_AUDIO;
      if (audioRateLimit !== undefined && !/^\d+$/.test(String(audioRateLimit))) {
        return route.fulfill({ status: 400, json: { error: 'RATE_LIMIT_AUDIO must be an integer' } });
      }
      const changedKeys = Object.keys(nextValues).filter(key => (
        state.settings[key] && state.settings[key].value !== String(nextValues[key])
      ));
      for (const key of changedKeys) state.settings[key].value = String(nextValues[key]);
      return route.fulfill({
        json: {
          ok: true,
          changedKeys,
          authChanged: changedKeys.some(key => key.startsWith('AUTH_')),
          webRestartRequired: false
        }
      });
    }
    if (apiPath === '/api/settings/restart') {
      return route.fulfill({ json: { ok: true, restarting: true } });
    }
    if (apiPath === '/api/voice-channels') {
      return route.fulfill({
        json: {
          channels: [
            { guildId: 'guild-1', guildName: 'Campaign', channelId: CHANNEL_ONE, channelName: 'General', position: 0 },
            { guildId: 'guild-1', guildName: 'Campaign', channelId: CHANNEL_TWO, channelName: 'Tavern', position: 1 }
          ]
        }
      });
    }
    if (apiPath === '/api/audio-files') {
      return route.fulfill({ json: state.audio });
    }
    if (apiPath === '/api/upload-audio') {
      const multipart = request.postDataBuffer()?.toString('latin1') || '';
      const fileName = multipart.match(/filename="([^"]+)"/)?.[1];
      if (!fileName) return route.fulfill({ status: 400, json: { error: 'No file uploaded' } });
      state.requests[state.requests.length - 1].body = { fileName };
      if ((options.uploadFailureNames || []).includes(fileName)) {
        return route.fulfill({ status: 500, json: { error: `Upload rejected for ${fileName}` } });
      }
      addAudioFile(fileName, url.searchParams.get('category') || '');
      return route.fulfill({ status: 201, json: { fileName } });
    }
    if (apiPath === '/api/audio-file/rename') {
      const source = body.path;
      const extension = source.slice(source.lastIndexOf('.'));
      const category = source.includes('/') ? source.slice(0, source.lastIndexOf('/')) : '';
      removeAudioFile(source);
      addAudioFile(`${body.newName}${extension}`, category);
      return route.fulfill({ json: { ok: true } });
    }
    if (apiPath === '/api/audio-file/move') {
      const source = body.path;
      removeAudioFile(source);
      addAudioFile(source.split('/').pop(), body.targetCategory || '');
      return route.fulfill({ json: { ok: true } });
    }
    if (apiPath === '/api/audio-file' && method === 'DELETE') {
      removeAudioFile(url.searchParams.get('path'));
      return route.fulfill({ json: { ok: true } });
    }
    if (apiPath === '/api/playlist' && method === 'GET') {
      return route.fulfill({ json: { queue: state.playlist } });
    }
    if (apiPath === '/api/playlist/add') {
      state.playlist.push(body.fileName);
      return route.fulfill({ json: { queue: state.playlist } });
    }
    if (apiPath === '/api/playlist/set') {
      state.playlist = [...body.queue];
      return route.fulfill({ json: { queue: state.playlist } });
    }
    if (apiPath === '/api/playlist/shuffle') {
      state.playlist.reverse();
      return route.fulfill({ json: { queue: state.playlist } });
    }
    if (apiPath === '/api/playlist/clear') {
      state.playlist = [];
      return route.fulfill({ json: { queue: state.playlist } });
    }
    if (apiPath === '/api/playlist/play' || apiPath === '/api/playlist/skip') {
      const next = state.playlist.shift() || null;
      if (next) state.nowPlaying = next.replace(/\.[^/.]+$/, '');
      return route.fulfill({ json: { started: Boolean(next), queue: state.playlist } });
    }
    if (apiPath === '/api/play-audio') {
      state.nowPlaying = body.fileName.replace(/\.[^/.]+$/, '');
      return route.fulfill({ status: 200, body: 'OK' });
    }
    if (apiPath === '/api/now-playing') {
      return route.fulfill({
        json: {
          song: state.nowPlaying,
          elapsed: 0,
          duration: state.nowPlaying ? 30 : 0,
          paused: false,
          playing: Boolean(state.nowPlaying)
        }
      });
    }
    if (apiPath === '/api/repeat-status') return route.fulfill({ json: { repeatEnabled: false } });
    if (apiPath === '/api/get-volume') return route.fulfill({ json: { volume: 0.5 } });
    if (apiPath === '/api/pause-status') return route.fulfill({ json: { paused: false } });

    return route.fulfill({ status: 200, json: { ok: true } });
  });

  return state;
}

test('an expired session redirects the soundboard to login', async ({ page }) => {
  await mockSoundboard(page, { unauthorizedPath: '/api/voice-channels' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: /BardBoard/ })).toBeVisible();
});

test('an incomplete installation redirects the soundboard to setup', async ({ page }) => {
  await mockSoundboard(page, {
    setupRequiredPath: '/api/env-config',
    setupMode: true
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole('heading', { name: 'First Boot Setup' })).toBeVisible();
});

test('selecting a channel and a track sends playback requests', async ({ page }) => {
  const state = await mockSoundboard(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Select voice channel' }).click();
  await page.getByRole('option', { name: 'Tavern' }).click();
  await expect.poll(() => state.requests.some(item => (
    item.path === '/api/switch-channel' && item.body?.channelId === CHANNEL_TWO
  ))).toBe(true);

  await page.getByRole('button', { name: 'Play roar' }).click();
  await expect.poll(() => state.requests.some(item => (
    item.path === '/api/play-audio'
    && item.body?.fileName === 'Combat/roar.ogg'
    && item.body?.channelId === CHANNEL_TWO
  ))).toBe(true);
  await expect(page.locator('#nowPlayingSong')).toHaveText('Combat/roar');
});

test('queueing a track updates the visible playlist', async ({ page }) => {
  const state = await mockSoundboard(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Queue intro' }).click();
  await expect(page.locator('.playlist-track')).toHaveText('intro');
  await expect(page.getByRole('button', { name: 'Play Queue' })).toBeEnabled();
  expect(state.playlist).toEqual(['intro.mp3']);
});

test('playlist API failures are shown to the user', async ({ page }) => {
  await mockSoundboard(page, {
    initialPlaylist: ['intro.mp3'],
    errorPath: '/api/playlist/skip'
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#statusTitle')).toHaveText('Error');
  await expect(page.locator('#statusMessage')).toHaveText('Simulated API failure');
});

test('login, persistent session and logout work from the browser', async ({ page, context }) => {
  const state = await mockSoundboard(page, { authenticated: false });
  await page.goto('/login');

  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Unlock BardBoard' }).click();
  await expect(page.locator('#error')).toContainText('Access denied');
  expect(state.authenticated).toBe(false);

  await page.getByLabel('Password').fill('secret');
  await page.getByLabel('Remember me').check();
  await page.getByRole('button', { name: 'Unlock BardBoard' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /BardBoard/ })).toBeVisible();
  await expect.poll(async () => (await context.cookies()).some(cookie => (
    cookie.name === 'bardboard_session' && cookie.httpOnly
  ))).toBe(true);
  expect(state.requests.some(item => (
    item.path === '/api/auth/login'
    && item.body?.username === 'admin'
    && item.body?.remember === '1'
  ))).toBe(true);

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Logout successful' })).toBeVisible();
  expect(state.authenticated).toBe(false);
  await expect.poll(async () => (await context.cookies()).some(cookie => (
    cookie.name === 'bardboard_session'
  ))).toBe(false);
  await page.getByRole('link', { name: 'Login again' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('audio upload validates files and adds a track to the selected category', async ({ page }) => {
  const state = await mockSoundboard(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Song' }).click();

  const fileInput = page.locator('#uploadFile');
  await fileInput.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') });
  await expect(page.locator('#statusTitle')).toHaveText('Upload failed');
  await expect(page.locator('#statusMessage')).toContainText('MP3, WAV, OGG, or M4A');
  await page.getByRole('button', { name: 'Ok' }).click();

  await fileInput.setInputFiles({ name: 'spell.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFF e2e audio') });
  await page.locator('#uploadCategorySelect').click();
  await page.getByRole('option', { name: 'Combat' }).click();
  await page.getByRole('button', { name: 'Upload' }).click();

  await expect(page.locator('#statusTitle')).toHaveText('Upload complete');
  await expect(page.getByRole('button', { name: 'Play spell' })).toBeVisible();
  expect(state.audio.categories.Combat).toContain('Combat/spell.wav');
});

test('a partial multi-file upload keeps successful files and allows retrying the failed one', async ({ page }) => {
  const state = await mockSoundboard(page, { uploadFailureNames: ['broken.ogg'] });
  await page.goto('/');
  await page.getByRole('button', { name: 'Add Song' }).click();

  await page.locator('#uploadFile').setInputFiles([
    { name: 'success.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('successful audio') },
    { name: 'broken.ogg', mimeType: 'audio/ogg', buffer: Buffer.from('broken audio') }
  ]);
  await page.getByRole('button', { name: 'Upload' }).click();

  await expect(page.locator('#statusTitle')).toHaveText('Upload partially complete');
  await expect(page.locator('#statusMessage')).toContainText('1 file uploaded');
  await expect(page.locator('#statusMessage')).toContainText('broken.ogg');
  await page.getByRole('button', { name: 'Ok' }).click();
  await expect(page.getByRole('button', { name: 'Play success' })).toBeVisible();
  await expect(page.locator('.upload-file-name')).toHaveText(['broken.ogg']);
  expect(state.audio.root).toContain('success.mp3');
  expect(state.audio.root).not.toContain('broken.ogg');
});

test('a track can be renamed, moved to a category and deleted', async ({ page }) => {
  const state = await mockSoundboard(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Rename intro' }).click();
  await page.getByLabel('New name').fill('opening');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await expect(page.locator('#statusTitle')).toHaveText('Rename complete');
  await page.getByRole('button', { name: 'Ok' }).click();
  await expect(page.getByRole('button', { name: 'Play opening' })).toBeVisible();

  const trackCard = page.getByRole('button', { name: 'Play opening' }).locator('..');
  const combatCategory = page.locator('.category-header:has-text("Combat") + .category-wrapper');
  await trackCard.dragTo(combatCategory);
  await expect.poll(() => state.audio.categories.Combat.includes('Combat/opening.mp3')).toBe(true);
  await expect(combatCategory.getByRole('button', { name: 'Play opening' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete opening' }).click();
  await expect(page.locator('#confirmMessage')).toContainText('opening');
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play opening' })).toHaveCount(0);
  expect(state.audio.categories.Combat).not.toContain('Combat/opening.mp3');
});

test('playlist tracks can be reordered and removed', async ({ page }) => {
  const state = await mockSoundboard(page, {
    initialPlaylist: ['intro.mp3', 'Combat/roar.ogg', 'outro.m4a']
  });
  await page.goto('/');

  const items = page.locator('.playlist-item');
  await expect(items).toHaveCount(3);
  await items.nth(0).dragTo(items.nth(2));
  await expect.poll(() => state.playlist).toEqual(['Combat/roar.ogg', 'outro.m4a', 'intro.mp3']);
  await expect(page.locator('.playlist-track')).toHaveText(['Combat / roar', 'outro', 'intro']);

  await page.getByRole('button', { name: 'Remove outro from playlist' }).click();
  await expect(page.locator('.playlist-track')).toHaveText(['Combat / roar', 'intro']);
  expect(state.playlist).toEqual(['Combat/roar.ogg', 'intro.mp3']);
});

test('playlist commands shuffle, play, skip and clear the queue', async ({ page }) => {
  const state = await mockSoundboard(page, {
    initialPlaylist: ['intro.mp3', 'Combat/roar.ogg', 'outro.m4a']
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Shuffle' }).click();
  await expect(page.locator('.playlist-track')).toHaveText(['outro', 'Combat / roar', 'intro']);

  await page.getByRole('button', { name: 'Play Queue' }).click();
  await expect(page.locator('#nowPlayingSong')).toHaveText('outro');
  await expect(page.locator('.playlist-track')).toHaveText(['Combat / roar', 'intro']);

  await page.getByRole('button', { name: 'Skip' }).click();
  await expect(page.locator('#nowPlayingSong')).toHaveText('Combat/roar');
  await expect(page.locator('.playlist-track')).toHaveText(['intro']);

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('.playlist-item')).toHaveCount(0);
  await expect(page.locator('#playlistEmpty')).toBeVisible();
  expect(state.playlist).toEqual([]);
});

test('now-playing polling recovers after a temporary server failure', async ({ page }) => {
  const state = await mockSoundboard(page, {
    initialNowPlaying: 'intro',
    transientFailures: { 'GET /api/now-playing': 1 }
  });
  await page.goto('/');

  await expect(page.locator('#nowPlayingSong')).toHaveText('intro', { timeout: 4000 });
  await expect.poll(() => state.requests.filter(item => item.path === '/api/now-playing').length).toBeGreaterThanOrEqual(2);
});

test('a failed channel switch is reported and succeeds when retried', async ({ page }) => {
  const state = await mockSoundboard(page, {
    transientFailures: { 'POST /api/switch-channel': 1 }
  });
  await page.goto('/');

  await page.getByRole('button', { name: 'Select voice channel' }).click();
  await page.getByRole('option', { name: 'Tavern' }).click();
  await expect(page.locator('#statusTitle')).toHaveText('Error');
  await expect(page.locator('#statusMessage')).toHaveText('Temporary service failure');
  await page.getByRole('button', { name: 'Ok' }).click();

  await page.getByRole('button', { name: 'Select voice channel' }).click();
  await page.getByRole('option', { name: 'Tavern' }).click();
  await expect.poll(() => state.requests.filter(item => (
    item.path === '/api/switch-channel' && item.body?.channelId === CHANNEL_TWO
  )).length).toBe(2);
  await expect(page.getByRole('button', { name: 'Select voice channel' })).toContainText('Tavern');
});

test('first-boot setup validates credentials, reports errors and requests a restart', async ({ page }) => {
  const state = await mockSoundboard(page, { setupMode: true, setupFailures: 1 });
  await page.goto('/setup');

  const tokenInput = page.locator('label').filter({ hasText: 'DISCORD_TOKEN' }).locator('input');
  const adminPasswordInput = page.locator('label').filter({ hasText: 'AUTH_ADMIN_PASS' }).locator('input');
  await tokenInput.fill('e2e-discord-token');
  await adminPasswordInput.fill('admin-secret');
  await page.getByLabel('Enable readonly account (optional)').check();

  const readonlyUserInput = page.locator('label').filter({ hasText: 'AUTH_READONLY_USER' }).locator('input');
  const readonlyPasswordInput = page.locator('label').filter({ hasText: 'AUTH_READONLY_PASS' }).locator('input');
  await page.getByRole('button', { name: 'Save and Restart' }).click();
  await expect(readonlyUserInput).toBeFocused();
  expect(state.requests.filter(item => item.path === '/api/setup/complete')).toHaveLength(0);

  await readonlyUserInput.fill('viewer');
  await readonlyPasswordInput.fill('viewer-secret');
  await page.getByRole('button', { name: 'Save and Restart' }).click();
  await expect(page.locator('.settings-error')).toHaveText('Discord rejected the token');

  await page.getByRole('button', { name: 'Save and Restart' }).click();
  await expect.poll(() => state.requests.some(item => (
    item.path === '/api/setup/complete'
    && item.body?.discordToken === 'e2e-discord-token'
    && item.body?.readonlyEnabled === true
    && item.body?.readonlyUser === 'viewer'
  ))).toBe(true);
  await expect.poll(() => state.requests.some(item => (
    item.path === '/api/settings/restart' && item.body?.purgeSessions === true
  ))).toBe(true);
  await expect(page).toHaveURL(/\/restarting$/);
});

test('settings validate changes, avoid unnecessary restarts and save valid values', async ({ page }) => {
  const state = await mockSoundboard(page);
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

  const saveButton = page.locator('.settings-form').getByRole('button', { name: 'Save and Restart' });
  const confirmSave = page.locator('.confirm-modal.open').getByRole('button', { name: 'Save and Restart' });
  await saveButton.click();
  await confirmSave.click();
  await expect(page.locator('.settings-status')).toHaveText('No changes detected.');
  expect(state.requests.filter(item => item.path === '/api/settings/restart')).toHaveLength(0);

  const rateLimitInput = page.locator('label').filter({ hasText: 'RATE_LIMIT_AUDIO' }).locator('input');
  await rateLimitInput.fill('not-a-number');
  await saveButton.click();
  await confirmSave.click();
  await expect(page.locator('.settings-error')).toHaveText('RATE_LIMIT_AUDIO must be an integer');

  await rateLimitInput.fill('240');
  await saveButton.click();
  await confirmSave.click();
  await expect.poll(() => state.requests.some(item => (
    item.path === '/api/settings/config' && item.method === 'POST' && item.body?.values?.RATE_LIMIT_AUDIO === '240'
  ))).toBe(true);
  await expect.poll(() => state.requests.some(item => (
    item.path === '/api/settings/restart' && item.body?.purgeSessions === false
  ))).toBe(true);
  await expect(page).toHaveURL(/\/restarting$/);
});

test('readonly users cannot open settings', async ({ page }) => {
  const state = await mockSoundboard(page, { canManageSettings: false });
  await page.goto('/settings');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /BardBoard/ })).toBeVisible();
  expect(state.requests.some(item => item.path === '/api/settings/config')).toBe(false);
});

test('the browser reaches the real Express API through the Next.js proxy', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Username').fill('e2e-admin');
  await page.getByLabel('Password').fill('e2e-secret');
  await page.getByRole('button', { name: 'Unlock BardBoard' }).click();

  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('button', { name: 'Select voice channel' }).click();
  await expect(page.getByRole('option', { name: 'Smoke Voice' })).toBeVisible();

  const healthResponse = await page.request.get('/api/health');
  expect(healthResponse.status()).toBe(200);
  expect(await healthResponse.json()).toEqual({ ok: true });

  await page.getByRole('button', { name: 'Logout' }).click();
  await expect(page.getByRole('heading', { name: 'Logout successful' })).toBeVisible();
  const protectedResponse = await page.request.get('/api/voice-channels');
  expect(protectedResponse.status()).toBe(401);
});
