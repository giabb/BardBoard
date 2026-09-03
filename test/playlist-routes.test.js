const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const createPlaylistRoutes = require('../server/routes/playlist');
const { createSpy, request, withTestServer } = require('../test-support/http');

const CHANNEL_ID = '123456789012345678';

function createPlaylistService(overrides = {}) {
  const queue = [];
  return {
    getQueue: createSpy(() => queue),
    addToQueue: createSpy((_channelId, fileName) => {
      queue.push(fileName);
      return queue;
    }),
    setQueue: createSpy((_channelId, nextQueue) => {
      queue.splice(0, queue.length, ...nextQueue);
      return queue;
    }),
    shuffleQueue: createSpy(() => queue),
    clearQueue: createSpy(() => {
      queue.length = 0;
      return queue;
    }),
    isPlaying: createSpy(() => false),
    playNextFromQueue: createSpy(async () => false),
    stopAudioInDiscord: createSpy(() => true),
    ...overrides
  };
}

async function callPlaylistApi(service, callback) {
  await withTestServer(createPlaylistRoutes(service), callback);
}

describe('playlist API', () => {
  test('playlist endpoints reject malformed Discord channel IDs', async () => {
    const service = createPlaylistService();
    const calls = [
      ['/playlist?channelId=invalid', { method: 'GET' }],
      ['/playlist/add', { method: 'POST', body: { channelId: 'invalid', fileName: 'song.mp3' } }],
      ['/playlist/set', { method: 'POST', body: { channelId: 'invalid', queue: [] } }],
      ['/playlist/shuffle', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/playlist/clear', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/playlist/play', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/playlist/skip', { method: 'POST', body: { channelId: 'invalid' } }]
    ];

    await callPlaylistApi(service, async baseUrl => {
      for (const [path, options] of calls) {
        const response = await request(baseUrl, path, options);
        assert.equal(response.status, 400, path);
        assert.deepEqual(response.body, { error: 'Invalid channelId' });
      }
    });
  });

  test('GET /playlist returns the queue', async () => {
    const service = createPlaylistService({
      getQueue: createSpy(() => ['intro.mp3', 'Combat/roar.ogg'])
    });

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, `/playlist?channelId=${CHANNEL_ID}`);
      assert.deepEqual(response, {
        status: 200,
        body: { queue: ['intro.mp3', 'Combat/roar.ogg'] }
      });
      assert.deepEqual(service.getQueue.calls, [[CHANNEL_ID]]);
    });
  });

  test('GET /playlist returns 404 for an unknown channel', async () => {
    const service = createPlaylistService({ getQueue: createSpy(() => null) });

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, `/playlist?channelId=${CHANNEL_ID}`);
      assert.equal(response.status, 404);
      assert.deepEqual(response.body, { error: 'Channel not found' });
    });
  });

  test('POST /playlist/add normalizes the filename and appends it', async () => {
    const service = createPlaylistService();

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, '/playlist/add', {
        method: 'POST',
        body: { channelId: CHANNEL_ID, fileName: 'Combat\\roar.ogg' }
      });
      assert.deepEqual(response, {
        status: 200,
        body: { queue: ['Combat/roar.ogg'] }
      });
      assert.deepEqual(service.addToQueue.calls, [['123456789012345678', 'Combat/roar.ogg']]);
    });
  });

  test('POST /playlist/add rejects unsafe filenames without touching the queue', async () => {
    const service = createPlaylistService();

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, '/playlist/add', {
        method: 'POST',
        body: { channelId: CHANNEL_ID, fileName: '../secret.mp3' }
      });
      assert.equal(response.status, 400);
      assert.deepEqual(response.body, { error: 'Invalid fileName' });
      assert.equal(service.addToQueue.calls.length, 0);
    });
  });

  test('POST /playlist/set validates and replaces the complete queue', async () => {
    const service = createPlaylistService();

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, '/playlist/set', {
        method: 'POST',
        body: {
          channelId: CHANNEL_ID,
          queue: ['intro.mp3', 'Combat\\roar.wav']
        }
      });
      assert.deepEqual(response, {
        status: 200,
        body: { queue: ['intro.mp3', 'Combat/roar.wav'] }
      });
      assert.deepEqual(service.setQueue.calls, [[
        CHANNEL_ID,
        ['intro.mp3', 'Combat/roar.wav']
      ]]);
    });
  });

  test('POST /playlist/set rejects non-arrays and an invalid item atomically', async () => {
    const service = createPlaylistService();

    await callPlaylistApi(service, async baseUrl => {
      const notAnArray = await request(baseUrl, '/playlist/set', {
        method: 'POST',
        body: { channelId: CHANNEL_ID, queue: 'song.mp3' }
      });
      assert.equal(notAnArray.status, 400);
      assert.deepEqual(notAnArray.body, { error: 'Invalid queue' });

      const unsafeItem = await request(baseUrl, '/playlist/set', {
        method: 'POST',
        body: { channelId: CHANNEL_ID, queue: ['valid.mp3', '../secret.mp3'] }
      });
      assert.equal(unsafeItem.status, 400);
      assert.deepEqual(unsafeItem.body, { error: 'Invalid fileName' });
      assert.equal(service.setQueue.calls.length, 0);
    });
  });

  test('shuffle and clear return the updated queue', async () => {
    const service = createPlaylistService({
      shuffleQueue: createSpy(() => ['b.mp3', 'a.mp3']),
      clearQueue: createSpy(() => [])
    });

    await callPlaylistApi(service, async baseUrl => {
      assert.deepEqual(
        await request(baseUrl, '/playlist/shuffle', {
          method: 'POST',
          body: { channelId: CHANNEL_ID }
        }),
        { status: 200, body: { queue: ['b.mp3', 'a.mp3'] } }
      );
      assert.deepEqual(
        await request(baseUrl, '/playlist/clear', {
          method: 'POST',
          body: { channelId: CHANNEL_ID }
        }),
        { status: 200, body: { queue: [] } }
      );
      assert.deepEqual(service.shuffleQueue.calls, [[CHANNEL_ID]]);
      assert.deepEqual(service.clearQueue.calls, [[CHANNEL_ID]]);
    });
  });

  test('queue mutation endpoints return 404 for an unknown channel', async () => {
    const service = createPlaylistService({
      addToQueue: createSpy(() => null),
      setQueue: createSpy(() => null),
      shuffleQueue: createSpy(() => null),
      clearQueue: createSpy(() => null)
    });

    await callPlaylistApi(service, async baseUrl => {
      const calls = [
        ['/playlist/add', { channelId: CHANNEL_ID, fileName: 'song.mp3' }],
        ['/playlist/set', { channelId: CHANNEL_ID, queue: ['song.mp3'] }],
        ['/playlist/shuffle', { channelId: CHANNEL_ID }],
        ['/playlist/clear', { channelId: CHANNEL_ID }]
      ];

      for (const [path, body] of calls) {
        const response = await request(baseUrl, path, { method: 'POST', body });
        assert.equal(response.status, 404, path);
        assert.deepEqual(response.body, { error: 'Channel not found' });
      }
    });
  });

  test('POST /playlist/play does not restart audio that is already playing', async () => {
    const service = createPlaylistService({
      isPlaying: createSpy(() => true),
      getQueue: createSpy(() => ['next.mp3'])
    });

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, '/playlist/play', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      });
      assert.deepEqual(response, {
        status: 200,
        body: { started: false, queue: ['next.mp3'] }
      });
      assert.equal(service.playNextFromQueue.calls.length, 0);
    });
  });

  test('POST /playlist/play starts the next track or reports an empty queue', async () => {
    const service = createPlaylistService({
      playNextFromQueue: createSpy(async () => true),
      getQueue: createSpy(() => ['second.mp3'])
    });

    await callPlaylistApi(service, async baseUrl => {
      const started = await request(baseUrl, '/playlist/play', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      });
      assert.deepEqual(started, {
        status: 200,
        body: { started: true, queue: ['second.mp3'] }
      });
    });

    const emptyService = createPlaylistService();
    await callPlaylistApi(emptyService, async baseUrl => {
      const empty = await request(baseUrl, '/playlist/play', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      });
      assert.equal(empty.status, 404);
      assert.deepEqual(empty.body, { error: 'Queue empty' });
    });
  });

  test('POST /playlist/skip starts the next track when available', async () => {
    const service = createPlaylistService({
      playNextFromQueue: createSpy(async () => true),
      getQueue: createSpy(() => ['after-next.mp3'])
    });

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, '/playlist/skip', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      });
      assert.deepEqual(response, {
        status: 200,
        body: { started: true, queue: ['after-next.mp3'] }
      });
      assert.equal(service.stopAudioInDiscord.calls.length, 0);
    });
  });

  test('POST /playlist/skip stops playback when no next track exists', async () => {
    const service = createPlaylistService();

    await callPlaylistApi(service, async baseUrl => {
      const response = await request(baseUrl, '/playlist/skip', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      });
      assert.deepEqual(response, {
        status: 200,
        body: { started: false, queue: [] }
      });
      assert.deepEqual(service.stopAudioInDiscord.calls, [[CHANNEL_ID]]);
    });
  });
});
