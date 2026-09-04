const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { describe, test } = require('node:test');
const { AudioPlayerStatus } = require('@discordjs/voice');
const { createDiscordAudioService } = require('../server/services/discordAudio');
const { createSpy } = require('../test-support/http');

const CHANNEL_ONE = '123456789012345678';
const CHANNEL_TWO = '223456789012345678';
const UNKNOWN_CHANNEL = '323456789012345678';

class FakePlayer extends EventEmitter {
  constructor() {
    super();
    this.state = { status: AudioPlayerStatus.Idle, resource: null };
    this.playCalls = [];
    this.pauseCalls = 0;
    this.unpauseCalls = 0;
    this.stopCalls = 0;
  }

  play(resource) {
    const oldState = this.state;
    this.state = { status: AudioPlayerStatus.Playing, resource };
    this.playCalls.push(resource);
    this.emit('stateChange', oldState, this.state);
  }

  pause() {
    this.pauseCalls += 1;
    this.state = { ...this.state, status: AudioPlayerStatus.Paused };
    return true;
  }

  unpause() {
    this.unpauseCalls += 1;
    this.state = { ...this.state, status: AudioPlayerStatus.Playing };
    return true;
  }

  stop() {
    this.stopCalls += 1;
    this.state = { status: AudioPlayerStatus.Idle, resource: null };
    return true;
  }

  finish() {
    const oldState = this.state;
    this.state = { status: AudioPlayerStatus.Idle, resource: null };
    this.emit('stateChange', oldState, this.state);
  }
}

class FakeConnection extends EventEmitter {
  constructor(joinConfig) {
    super();
    this.joinConfig = joinConfig;
    this.subscriptions = [];
    this.destroyed = false;
  }

  subscribe(player) {
    this.subscriptions.push(player);
    return { unsubscribe() {} };
  }

  destroy() {
    this.destroyed = true;
  }
}

function createHarness(options = {}) {
  const guild = { id: 'guild-1', voiceAdapterCreator: {} };
  const channels = new Map([
    [CHANNEL_ONE, { id: CHANNEL_ONE, guild }],
    [CHANNEL_TWO, { id: CHANNEL_TWO, guild }]
  ]);
  const players = [];
  const connections = [];
  const resources = [];
  const transcoders = [];

  const dependencies = {
    sodiumReady: Promise.resolve(),
    resolveAudioPath: fileName => fileName === 'missing.mp3' ? null : `virtual/audio/${fileName}`,
    parseAudioMetadata: async () => ({ format: { duration: 10 } }),
    joinVoiceChannel: config => {
      if (options.failConnection) throw new Error('connection failed');
      const connection = new FakeConnection(config);
      connections.push(connection);
      return connection;
    },
    createAudioPlayer: () => {
      const player = new FakePlayer();
      players.push(player);
      return player;
    },
    createAudioResource: (source, resourceOptions) => {
      const resource = {
        source,
        options: resourceOptions,
        playbackDuration: 2500,
        playStream: { destroy: createSpy() },
        volume: { setVolume: createSpy() }
      };
      resources.push(resource);
      return resource;
    },
    spawn: (command, args, spawnOptions) => {
      const transcoder = new EventEmitter();
      transcoder.command = command;
      transcoder.args = args;
      transcoder.options = spawnOptions;
      transcoder.stdout = {};
      transcoder.kill = createSpy();
      transcoders.push(transcoder);
      return transcoder;
    }
  };

  const discordClient = { channels: { cache: channels } };
  const service = createDiscordAudioService(discordClient, dependencies);
  return { service, players, connections, resources, transcoders };
}

function nextTurn() {
  return new Promise(resolve => setImmediate(resolve));
}

describe('Discord audio service', () => {
  test('returns safe defaults for unknown channels', async () => {
    const { service } = createHarness();
    assert.equal(await service.playAudioInDiscord('song.mp3', UNKNOWN_CHANNEL), false);
    assert.equal(service.getQueue(UNKNOWN_CHANNEL), null);
    assert.equal(service.togglePause(UNKNOWN_CHANNEL), null);
    assert.equal(service.switchVoiceChannel(UNKNOWN_CHANNEL), false);
    assert.deepEqual(service.getRepeatStatus(UNKNOWN_CHANNEL), { repeatEnabled: false });
    assert.deepEqual(service.getVolume(UNKNOWN_CHANNEL), { volume: 0.5 });
    assert.deepEqual(await service.nowPlaying(UNKNOWN_CHANNEL), {
      song: null,
      elapsed: 0,
      duration: 0,
      paused: false,
      playing: false
    });
  });

  test('queues are isolated by guild and copied when replaced', () => {
    const { service } = createHarness();
    assert.deepEqual(service.addToQueue(CHANNEL_ONE, 'one.mp3'), ['one.mp3']);
    assert.deepEqual(service.getQueue(CHANNEL_TWO), ['one.mp3']);

    const replacement = ['two.mp3'];
    assert.deepEqual(service.setQueue(CHANNEL_ONE, replacement), ['two.mp3']);
    replacement.push('outside.mp3');
    assert.deepEqual(service.getQueue(CHANNEL_ONE), ['two.mp3']);
    assert.deepEqual(service.clearQueue(CHANNEL_ONE), []);
  });

  test('connects, plays, pauses, resumes, changes volume and stops', async () => {
    const { service, players, connections, resources } = createHarness();
    assert.equal(service.setCurrentVolume(CHANNEL_ONE, 0), true);
    assert.deepEqual(service.getVolume(CHANNEL_ONE), { volume: 0 });

    assert.equal(await service.playAudioInDiscord('Music/theme.mp3', CHANNEL_ONE), true);
    assert.equal(connections.length, 1);
    assert.equal(players.length, 1);
    assert.deepEqual(connections[0].joinConfig, {
      channelId: CHANNEL_ONE,
      guildId: 'guild-1',
      adapterCreator: {}
    });
    assert.equal(connections[0].subscriptions[0], players[0]);
    assert.equal(resources[0].source, 'virtual/audio/Music/theme.mp3');
    assert.deepEqual(resources[0].volume.setVolume.calls, [[0]]);
    assert.equal(service.isPlaying(CHANNEL_ONE), true);

    assert.deepEqual(await service.nowPlaying(CHANNEL_ONE), {
      song: 'Music/theme',
      elapsed: 2.5,
      duration: 10,
      paused: false,
      playing: true
    });
    assert.deepEqual(service.togglePause(CHANNEL_ONE), { paused: true });
    assert.deepEqual(service.getPauseStatus(CHANNEL_ONE), { paused: true });
    assert.deepEqual(service.togglePause(CHANNEL_ONE), { paused: false });
    assert.deepEqual(service.getPauseStatus(CHANNEL_ONE), { paused: false });

    assert.equal(service.stopAudioInDiscord(CHANNEL_ONE), true);
    assert.equal(players[0].stopCalls, 1);
    assert.equal(service.isPlaying(CHANNEL_ONE), false);
  });

  test('switching channels recreates the connection and retains the player', async () => {
    const { service, players, connections } = createHarness();
    await service.playAudioInDiscord('song.mp3', CHANNEL_ONE);

    assert.equal(service.switchVoiceChannel(CHANNEL_TWO), true);
    assert.equal(connections[0].destroyed, true);
    assert.equal(connections.length, 2);
    assert.equal(connections[1].joinConfig.channelId, CHANNEL_TWO);
    assert.equal(connections[1].subscriptions[0], players[0]);

    assert.equal(service.switchVoiceChannel(CHANNEL_TWO), true);
    assert.equal(connections.length, 2);
  });

  test('repeat recreates the current resource when playback becomes idle', async () => {
    const { service, players, resources } = createHarness();
    await service.playAudioInDiscord('loop.ogg', CHANNEL_ONE);
    assert.equal(service.toggleRepeat(CHANNEL_ONE), true);

    players[0].finish();
    assert.equal(resources.length, 2);
    assert.equal(resources[1].source, 'virtual/audio/loop.ogg');
    assert.equal(players[0].playCalls.length, 2);
  });

  test('idle playback advances the queue automatically', async () => {
    const { service, players, resources } = createHarness();
    service.addToQueue(CHANNEL_ONE, 'next.wav');
    await service.playAudioInDiscord('first.mp3', CHANNEL_ONE);

    players[0].finish();
    await nextTurn();
    await nextTurn();

    assert.equal(resources.at(-1).source, 'virtual/audio/next.wav');
    assert.deepEqual(service.getQueue(CHANNEL_ONE), []);
    assert.equal((await service.nowPlaying(CHANNEL_ONE)).song, 'next');
  });

  test('seek uses ffmpeg and preserves a paused state', async () => {
    const { service, players, resources, transcoders } = createHarness();
    await service.playAudioInDiscord('song.mp3', CHANNEL_ONE);
    service.togglePause(CHANNEL_ONE);

    assert.equal(await service.seek(CHANNEL_ONE, 4.25), true);
    assert.equal(transcoders.length, 1);
    assert.equal(transcoders[0].command, 'ffmpeg');
    assert.deepEqual(transcoders[0].args.slice(0, 2), ['-ss', '4.25']);
    assert.equal(resources.at(-1).source, transcoders[0].stdout);
    assert.equal(players[0].state.status, AudioPlayerStatus.Paused);
    assert.equal((await service.nowPlaying(CHANNEL_ONE)).elapsed, 4.3);
  });

  test('noise tracks are mixed over the current song with configured gain', async () => {
    const previousNoiseVolume = process.env.NOISES_VOLUME;
    process.env.NOISES_VOLUME = '3';
    const { service, players, connections, resources, transcoders } = createHarness();
    try {
      await service.playAudioInDiscord('Music/theme.mp3', CHANNEL_ONE);
      assert.equal(await service.playAudioInDiscord('!noises/thunder.wav', CHANNEL_ONE), true);

      assert.equal(players.length, 1);
      assert.equal(connections.length, 1);
      assert.equal(transcoders.length, 1);
      assert.deepEqual(transcoders[0].args.slice(0, 6), [
        '-ss', '2.5',
        '-i', 'virtual/audio/Music/theme.mp3',
        '-i', 'virtual/audio/!noises/thunder.wav'
      ]);
      assert.match(transcoders[0].args[7], /volume=3/);
      assert.match(transcoders[0].args[7], /amix=inputs=2/);
      assert.equal(resources[1].options.metadata.title, 'Music/theme.mp3');
      assert.equal((await service.nowPlaying(CHANNEL_ONE)).song, 'Music/theme');
    } finally {
      if (previousNoiseVolume === undefined) delete process.env.NOISES_VOLUME;
      else process.env.NOISES_VOLUME = previousNoiseVolume;
    }
  });

  test('player errors release streams, transcoders and voice connections', async () => {
    const { service, players, connections, resources, transcoders } = createHarness();
    await service.playAudioInDiscord('song.mp3', CHANNEL_ONE);
    await service.seek(CHANNEL_ONE, 2);

    const originalError = console.error;
    console.error = () => {};
    try {
      players[0].emit('error', new Error('player failed'));
    } finally {
      console.error = originalError;
    }

    assert.equal(players[0].stopCalls, 1);
    assert.equal(connections[0].destroyed, true);
    assert.deepEqual(transcoders[0].kill.calls, [[]]);
    assert.deepEqual(resources.at(-1).playStream.destroy.calls, [[]]);
    assert.equal(service.isPlaying(CHANNEL_ONE), false);
  });

  test('connection errors stop playback and destroy its resources', async () => {
    const { service, players, connections, resources } = createHarness();
    await service.playAudioInDiscord('song.mp3', CHANNEL_ONE);

    const originalError = console.error;
    console.error = () => {};
    try {
      connections[0].emit('error', new Error('connection lost'));
    } finally {
      console.error = originalError;
    }

    assert.equal(players[0].stopCalls, 1);
    assert.equal(connections[0].destroyed, true);
    assert.deepEqual(resources[0].playStream.destroy.calls, [[]]);
    assert.equal(service.isPlaying(CHANNEL_ONE), false);
  });

  test('shutdown releases every playback resource and clears guild state', async () => {
    const { service, players, connections, resources, transcoders } = createHarness();
    service.setCurrentVolume(CHANNEL_ONE, 0.8);
    service.toggleRepeat(CHANNEL_ONE);
    service.addToQueue(CHANNEL_ONE, 'queued.mp3');
    await service.playAudioInDiscord('song.mp3', CHANNEL_ONE);
    await service.seek(CHANNEL_ONE, 2);

    service.shutdown();
    service.shutdown();

    assert.equal(players[0].stopCalls, 1);
    assert.equal(connections[0].destroyed, true);
    assert.deepEqual(transcoders[0].kill.calls, [[]]);
    assert.deepEqual(resources.at(-1).playStream.destroy.calls, [[]]);
    assert.equal(service.isPlaying(CHANNEL_ONE), false);
    assert.deepEqual(service.getVolume(CHANNEL_ONE), { volume: 0.5 });
    assert.deepEqual(service.getRepeatStatus(CHANNEL_ONE), { repeatEnabled: false });
    assert.deepEqual(service.getQueue(CHANNEL_ONE), []);
    assert.equal(service.isFileInUse('queued.mp3'), false);
    assert.deepEqual(await service.nowPlaying(CHANNEL_ONE), {
      song: null,
      elapsed: 0,
      duration: 0,
      paused: false,
      playing: false
    });
  });

  test('tracks and categories in playback or queues are marked in use', async () => {
    const { service } = createHarness();
    service.addToQueue(CHANNEL_ONE, 'Combat/queued.mp3');
    assert.equal(service.isFileInUse('Combat/queued.mp3'), true);
    assert.equal(service.isCategoryInUse('Combat'), true);
    await service.playAudioInDiscord('Music/current.mp3', CHANNEL_ONE);
    assert.equal(service.isFileInUse('Music/current.mp3'), true);
    assert.equal(service.isCategoryInUse('Music'), true);
    assert.equal(service.isFileInUse('other.mp3'), false);
  });

  test('invalid paths and voice connection failures do not escape the service', async () => {
    const missing = createHarness();
    assert.equal(await missing.service.playAudioInDiscord('missing.mp3', CHANNEL_ONE), false);
    assert.equal(await missing.service.playAudioInDiscord('notes.txt', CHANNEL_ONE), false);

    const failing = createHarness({ failConnection: true });
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.equal(await failing.service.playAudioInDiscord('song.mp3', CHANNEL_ONE), false);
    } finally {
      console.error = originalError;
    }
  });
});
