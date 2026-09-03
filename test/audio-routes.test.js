const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const createAudioRoutes = require('../server/routes/audio');
const { createSpy, request, withTestServer } = require('../test-support/http');

const CHANNEL_ID = '123456789012345678';

function createAudioService(overrides = {}) {
  return {
    getRepeatStatus: createSpy(() => ({ repeatEnabled: false })),
    playAudioInDiscord: createSpy(async () => true),
    togglePause: createSpy(() => ({ paused: true })),
    getPauseStatus: createSpy(() => ({ paused: false })),
    stopAudioInDiscord: createSpy(() => true),
    switchVoiceChannel: createSpy(() => true),
    toggleRepeat: createSpy(() => true),
    setCurrentVolume: createSpy(() => true),
    getVolume: createSpy(() => ({ volume: 0.5 })),
    seek: createSpy(async () => true),
    nowPlaying: createSpy(async () => ({
      song: null,
      elapsed: 0,
      duration: 0,
      paused: false,
      playing: false
    })),
    ...overrides
  };
}

async function callAudioApi(service, callback) {
  await withTestServer(createAudioRoutes(service), callback);
}

describe('audio API', () => {
  test('rate limiting rejects requests above the configured threshold', async () => {
    const previousLimit = process.env.RATE_LIMIT_AUDIO;
    process.env.RATE_LIMIT_AUDIO = '1';
    const service = createAudioService();
    const router = createAudioRoutes(service);
    if (previousLimit === undefined) delete process.env.RATE_LIMIT_AUDIO;
    else process.env.RATE_LIMIT_AUDIO = previousLimit;

    await withTestServer(router, async baseUrl => {
      const options = {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      };
      assert.equal((await request(baseUrl, '/stop-audio', options)).status, 200);
      assert.equal((await request(baseUrl, '/stop-audio', options)).status, 429);
      assert.equal(service.stopAudioInDiscord.calls.length, 1);
    });
  });

  test('POST /play-audio validates and forwards the request to Discord', async () => {
    const service = createAudioService();

    await callAudioApi(service, async baseUrl => {
      const response = await request(baseUrl, '/play-audio', {
        method: 'POST',
        body: { fileName: 'Combat\\roar.mp3', channelId: CHANNEL_ID }
      });

      assert.equal(response.status, 200);
      assert.deepEqual(service.playAudioInDiscord.calls, [['Combat/roar.mp3', CHANNEL_ID]]);
    });
  });

  test('POST /play-audio rejects unsafe or unsupported files', async () => {
    const service = createAudioService();

    await callAudioApi(service, async baseUrl => {
      for (const fileName of ['../secret.mp3', '/absolute.mp3', 'notes.txt', '']) {
        const response = await request(baseUrl, '/play-audio', {
          method: 'POST',
          body: { fileName, channelId: CHANNEL_ID }
        });

        assert.equal(response.status, 400, fileName);
        assert.deepEqual(response.body, { error: 'Invalid fileName' });
      }
      assert.equal(service.playAudioInDiscord.calls.length, 0);
    });
  });

  test('POST /play-audio reports Discord lookup and playback failures', async () => {
    const unavailable = createAudioService({
      playAudioInDiscord: createSpy(async () => false)
    });

    await callAudioApi(unavailable, async baseUrl => {
      const response = await request(baseUrl, '/play-audio', {
        method: 'POST',
        body: { fileName: 'song.mp3', channelId: CHANNEL_ID }
      });
      assert.deepEqual(response, {
        status: 404,
        body: { error: 'Channel or audio file not found' }
      });
    });

    const failing = createAudioService({
      playAudioInDiscord: createSpy(async () => {
        throw new Error('Discord unavailable');
      })
    });

    await callAudioApi(failing, async baseUrl => {
      const originalError = console.error;
      console.error = () => {};
      try {
        const response = await request(baseUrl, '/play-audio', {
          method: 'POST',
          body: { fileName: 'song.mp3', channelId: CHANNEL_ID }
        });
        assert.deepEqual(response, {
          status: 500,
          body: { error: 'Playback failed' }
        });
      } finally {
        console.error = originalError;
      }
    });
  });

  test('audio endpoints reject malformed Discord channel IDs', async () => {
    const service = createAudioService();
    const calls = [
      ['/repeat-status?channelId=invalid', { method: 'GET' }],
      ['/play-audio', { method: 'POST', body: { fileName: 'song.mp3', channelId: 'invalid' } }],
      ['/toggle-pause', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/pause-status?channelId=invalid', { method: 'GET' }],
      ['/stop-audio', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/switch-channel', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/toggle-repeat', { method: 'POST', body: { channelId: 'invalid' } }],
      ['/set-volume', { method: 'POST', body: { channelId: 'invalid', volume: 0.5 } }],
      ['/get-volume?channelId=invalid', { method: 'GET' }],
      ['/seek', { method: 'POST', body: { channelId: 'invalid', offsetSecs: 5 } }],
      ['/now-playing?channelId=invalid', { method: 'GET' }]
    ];

    await callAudioApi(service, async baseUrl => {
      for (const [path, options] of calls) {
        const response = await request(baseUrl, path, options);
        assert.equal(response.status, 400, path);
        assert.deepEqual(response.body, { error: 'Invalid channelId' });
      }
    });
  });

  test('GET status endpoints return the service state', async () => {
    const service = createAudioService({
      getRepeatStatus: createSpy(() => ({ repeatEnabled: true })),
      getPauseStatus: createSpy(() => ({ paused: true })),
      getVolume: createSpy(() => ({ volume: 0.75 })),
      nowPlaying: createSpy(async () => ({
        song: 'Combat/roar',
        elapsed: 2.5,
        duration: 12,
        paused: false,
        playing: true
      }))
    });

    await callAudioApi(service, async baseUrl => {
      assert.deepEqual(
        await request(baseUrl, `/repeat-status?channelId=${CHANNEL_ID}`),
        { status: 200, body: { repeatEnabled: true } }
      );
      assert.deepEqual(
        await request(baseUrl, `/pause-status?channelId=${CHANNEL_ID}`),
        { status: 200, body: { paused: true } }
      );
      assert.deepEqual(
        await request(baseUrl, `/get-volume?channelId=${CHANNEL_ID}`),
        { status: 200, body: { volume: 0.75 } }
      );
      assert.deepEqual(
        await request(baseUrl, `/now-playing?channelId=${CHANNEL_ID}`),
        {
          status: 200,
          body: {
            song: 'Combat/roar',
            elapsed: 2.5,
            duration: 12,
            paused: false,
            playing: true
          }
        }
      );

      assert.deepEqual(service.getRepeatStatus.calls, [[CHANNEL_ID]]);
      assert.deepEqual(service.getPauseStatus.calls, [[CHANNEL_ID]]);
      assert.deepEqual(service.getVolume.calls, [[CHANNEL_ID]]);
      assert.deepEqual(service.nowPlaying.calls, [[CHANNEL_ID]]);
    });
  });

  test('pause, stop and channel switch call the matching bot actions', async () => {
    const service = createAudioService();

    await callAudioApi(service, async baseUrl => {
      assert.deepEqual(
        await request(baseUrl, '/toggle-pause', {
          method: 'POST',
          body: { channelId: CHANNEL_ID }
        }),
        { status: 200, body: { paused: true } }
      );
      assert.equal((await request(baseUrl, '/stop-audio', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      })).status, 200);
      assert.equal((await request(baseUrl, '/switch-channel', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      })).status, 200);

      assert.deepEqual(service.togglePause.calls, [[CHANNEL_ID]]);
      assert.deepEqual(service.stopAudioInDiscord.calls, [[CHANNEL_ID]]);
      assert.deepEqual(service.switchVoiceChannel.calls, [[CHANNEL_ID]]);
    });
  });

  test('pause and channel switch return 404 when no Discord resource exists', async () => {
    const service = createAudioService({
      togglePause: createSpy(() => null),
      switchVoiceChannel: createSpy(() => false)
    });

    await callAudioApi(service, async baseUrl => {
      assert.equal((await request(baseUrl, '/toggle-pause', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      })).status, 404);
      assert.equal((await request(baseUrl, '/switch-channel', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      })).status, 404);
    });
  });

  test('POST /toggle-repeat returns both enabled and disabled states', async () => {
    const states = [true, false];
    const service = createAudioService({
      toggleRepeat: createSpy(() => states.shift())
    });

    await callAudioApi(service, async baseUrl => {
      const options = { method: 'POST', body: { channelId: CHANNEL_ID } };
      assert.deepEqual(
        await request(baseUrl, '/toggle-repeat', options),
        { status: 200, body: { repeatEnabled: true } }
      );
      assert.deepEqual(
        await request(baseUrl, '/toggle-repeat', options),
        { status: 200, body: { repeatEnabled: false } }
      );
    });
  });

  test('POST /toggle-repeat returns 404 when the channel is unknown', async () => {
    const service = createAudioService({ toggleRepeat: createSpy(() => null) });

    await callAudioApi(service, async baseUrl => {
      const response = await request(baseUrl, '/toggle-repeat', {
        method: 'POST',
        body: { channelId: CHANNEL_ID }
      });
      assert.equal(response.status, 404);
    });
  });

  test('POST /set-volume accepts the boundary values and calls the bot', async () => {
    const service = createAudioService();

    await callAudioApi(service, async baseUrl => {
      for (const volume of [0, 1]) {
        const response = await request(baseUrl, '/set-volume', {
          method: 'POST',
          body: { channelId: CHANNEL_ID, volume }
        });
        assert.equal(response.status, 200);
      }
      assert.deepEqual(service.setCurrentVolume.calls, [
        [CHANNEL_ID, 0],
        [CHANNEL_ID, 1]
      ]);
    });
  });

  test('POST /set-volume rejects non-numeric and out-of-range values', async () => {
    const service = createAudioService();

    await callAudioApi(service, async baseUrl => {
      for (const volume of ['loud', -0.1, 1.1, null]) {
        const response = await request(baseUrl, '/set-volume', {
          method: 'POST',
          body: { channelId: CHANNEL_ID, volume }
        });
        assert.equal(response.status, 400, String(volume));
        assert.deepEqual(response.body, { error: 'Invalid volume' });
      }
      assert.equal(service.setCurrentVolume.calls.length, 0);
    });
  });

  test('POST /seek validates the offset and reports service outcomes', async () => {
    const service = createAudioService({
      seek: createSpy(async (_channelId, offset) => offset !== 99)
    });

    await callAudioApi(service, async baseUrl => {
      assert.equal((await request(baseUrl, '/seek', {
        method: 'POST',
        body: { channelId: CHANNEL_ID, offsetSecs: 12.5 }
      })).status, 200);
      assert.equal((await request(baseUrl, '/seek', {
        method: 'POST',
        body: { channelId: CHANNEL_ID, offsetSecs: 99 }
      })).status, 404);

      for (const offsetSecs of [-1, 'later', null]) {
        const response = await request(baseUrl, '/seek', {
          method: 'POST',
          body: { channelId: CHANNEL_ID, offsetSecs }
        });
        assert.equal(response.status, 400, String(offsetSecs));
      }

      assert.deepEqual(service.seek.calls, [
        [CHANNEL_ID, 12.5],
        [CHANNEL_ID, 99]
      ]);
    });
  });

  test('POST /seek returns 500 when the Discord service fails unexpectedly', async () => {
    const service = createAudioService({
      seek: createSpy(async () => {
        throw new Error('voice connection failed');
      })
    });

    await callAudioApi(service, async baseUrl => {
      const originalError = console.error;
      console.error = () => {};
      try {
        const response = await request(baseUrl, '/seek', {
          method: 'POST',
          body: { channelId: CHANNEL_ID, offsetSecs: 1 }
        });
        assert.equal(response.status, 500);
      } finally {
        console.error = originalError;
      }
    });
  });
});
