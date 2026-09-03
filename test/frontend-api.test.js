const assert = require('node:assert/strict');
const { before, describe, test } = require('node:test');

let createSoundboardApi;
let parseJsonResponse;

before(async () => {
  ({ createSoundboardApi, parseJsonResponse } = await import('../app/lib/soundboardApi.mjs'));
});

function createFetchHarness(response = new Response('{}', {
  status: 200,
  headers: { 'content-type': 'application/json' }
})) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (...args) => {
      calls.push(args);
      return response.clone();
    }
  };
}

function assertJsonPost(call, expectedUrl, expectedBody) {
  assert.equal(call[0], expectedUrl);
  assert.equal(call[1].method, 'POST');
  assert.deepEqual(call[1].headers, { 'Content-Type': 'application/json' });
  assert.deepEqual(JSON.parse(call[1].body), expectedBody);
}

describe('soundboard frontend API', () => {
  test('playing a track sends the selected file and channel', async () => {
    const harness = createFetchHarness();
    const api = createSoundboardApi(harness);
    await api.playTrack('Combat/roar.mp3', 'channel-1');
    assertJsonPost(harness.calls[0], '/api/play-audio', {
      fileName: 'Combat/roar.mp3',
      channelId: 'channel-1'
    });
  });

  test('queueing a track calls the playlist endpoint', async () => {
    const harness = createFetchHarness();
    const api = createSoundboardApi(harness);
    await api.queueTrack('intro.ogg', 'channel-2');
    assertJsonPost(harness.calls[0], '/api/playlist/add', {
      fileName: 'intro.ogg',
      channelId: 'channel-2'
    });
  });

  test('switching the selected voice channel calls the bot endpoint', async () => {
    const harness = createFetchHarness();
    const api = createSoundboardApi(harness);
    await api.switchChannel('channel-3');
    assertJsonPost(harness.calls[0], '/api/switch-channel', { channelId: 'channel-3' });
  });

  test('playlist reordering sends the complete ordered queue', async () => {
    const harness = createFetchHarness();
    const api = createSoundboardApi(harness);
    await api.setPlaylist(['second.mp3', 'first.mp3'], 'channel-4');
    assertJsonPost(harness.calls[0], '/api/playlist/set', {
      channelId: 'channel-4',
      queue: ['second.mp3', 'first.mp3']
    });
  });

  test('authentication and setup responses trigger the expected redirects', async () => {
    let unauthorized = 0;
    let setupRequired = 0;
    const unauthorizedApi = createSoundboardApi({
      fetchImpl: async () => new Response('{}', { status: 401 }),
      onUnauthorized: () => { unauthorized += 1; }
    });
    await assert.rejects(unauthorizedApi.fetchApi('/api/audio-files'), /Unauthorized/);
    assert.equal(unauthorized, 1);

    const setupApi = createSoundboardApi({
      fetchImpl: async () => new Response(JSON.stringify({ setupRequired: true }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      }),
      onSetupRequired: () => { setupRequired += 1; }
    });
    await assert.rejects(setupApi.fetchApi('/api/audio-files'), /Initial setup required/);
    assert.equal(setupRequired, 1);

    assert.deepEqual(await parseJsonResponse(new Response('not-json')), {});
  });
});
