const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, test } = require('node:test');
const createFileRoutes = require('../server/routes/files');
const { createUpload } = require('../server/middleware/upload');
const { createSpy, request, withTestServer } = require('../test-support/http');

function createAudioService(overrides = {}) {
  return {
    isFileInUse: createSpy(() => false),
    isCategoryInUse: createSpy(() => false),
    ...overrides
  };
}

async function withAudioDir(callback) {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bardboard-files-'));
  try {
    await callback(audioDir);
  } finally {
    fs.rmSync(audioDir, { recursive: true, force: true });
  }
}

async function callFileApi(audioDir, service, callback, options = {}) {
  const upload = createUpload({ audioDir, maxUploadMb: options.maxUploadMb ?? 1 });
  const router = createFileRoutes(service, { audioDir, upload });
  await withTestServer(router, callback);
}

function post(body) {
  return { method: 'POST', body };
}

describe('file and category API', () => {
  test('GET /audio-files lists only supported root and category tracks', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'intro.mp3'), 'audio');
      fs.writeFileSync(path.join(audioDir, 'ignore.txt'), 'text');
      fs.mkdirSync(path.join(audioDir, 'Combat'));
      fs.writeFileSync(path.join(audioDir, 'Combat', 'roar.ogg'), 'audio');
      fs.writeFileSync(path.join(audioDir, 'Combat', 'ignore.json'), '{}');

      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        const response = await request(baseUrl, '/audio-files');
        assert.equal(response.status, 200);
        assert.deepEqual(response.body, {
          root: ['intro.mp3'],
          categories: { Combat: ['Combat/roar.ogg'] }
        });
      });
    });
  });

  test('POST /upload-audio stores a supported file in an optional category', async () => {
    await withAudioDir(async audioDir => {
      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        const form = new FormData();
        form.append('file', new Blob(['fake audio']), 'theme.mp3');
        const response = await request(baseUrl, '/upload-audio?category=Music', {
          method: 'POST',
          body: form
        });

        assert.deepEqual(response, { status: 200, body: { ok: true, file: 'theme.mp3' } });
        assert.equal(fs.readFileSync(path.join(audioDir, 'Music', 'theme.mp3'), 'utf8'), 'fake audio');
      });
    });
  });

  test('upload rejects missing, unsupported, invalid-category and duplicate files', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'existing.mp3'), 'original');

      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        assert.equal((await request(baseUrl, '/upload-audio', { method: 'POST' })).status, 400);

        const unsupported = new FormData();
        unsupported.append('file', new Blob(['text']), 'notes.txt');
        assert.deepEqual(
          await request(baseUrl, '/upload-audio', { method: 'POST', body: unsupported }),
          { status: 400, body: { error: 'Unsupported file type' } }
        );

        const invalidCategory = new FormData();
        invalidCategory.append('file', new Blob(['audio']), 'clip.mp3');
        assert.deepEqual(
          await request(baseUrl, '/upload-audio?category=../escape', { method: 'POST', body: invalidCategory }),
          { status: 400, body: { error: 'Invalid category' } }
        );

        const duplicate = new FormData();
        duplicate.append('file', new Blob(['replacement']), 'existing.mp3');
        assert.deepEqual(
          await request(baseUrl, '/upload-audio', { method: 'POST', body: duplicate }),
          { status: 400, body: { error: 'A file with the same name already exists' } }
        );
        assert.equal(fs.readFileSync(path.join(audioDir, 'existing.mp3'), 'utf8'), 'original');
      });
    });
  });

  test('upload enforces the configured maximum file size', async () => {
    await withAudioDir(async audioDir => {
      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        const form = new FormData();
        form.append('file', new Blob(['larger than one byte']), 'large.mp3');
        const response = await request(baseUrl, '/upload-audio', {
          method: 'POST',
          body: form
        });
        assert.deepEqual(response, { status: 400, body: { error: 'File too large' } });
        assert.equal(fs.existsSync(path.join(audioDir, 'large.mp3')), false);
      }, { maxUploadMb: 1 / (1024 * 1024) });
    });
  });

  test('a missing audio directory returns an empty soundboard', async () => {
    await withAudioDir(async audioDir => {
      fs.rmSync(audioDir, { recursive: true, force: true });
      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        const originalError = console.error;
        console.error = () => {};
        try {
          assert.deepEqual(await request(baseUrl, '/audio-files'), {
            status: 200,
            body: { root: [], categories: {} }
          });
        } finally {
          console.error = originalError;
        }
      });
    });
  });

  test('DELETE /audio-file deletes files and blocks traversal or in-use tracks', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'delete.mp3'), 'audio');
      fs.writeFileSync(path.join(audioDir, 'busy.mp3'), 'audio');
      const service = createAudioService({
        isFileInUse: createSpy(fileName => fileName === 'busy.mp3')
      });

      await callFileApi(audioDir, service, async baseUrl => {
        assert.deepEqual(
          await request(baseUrl, '/audio-file?path=delete.mp3', { method: 'DELETE' }),
          { status: 200, body: { ok: true } }
        );
        assert.equal(fs.existsSync(path.join(audioDir, 'delete.mp3')), false);
        assert.equal((await request(baseUrl, '/audio-file?path=../secret.mp3', { method: 'DELETE' })).status, 400);
        assert.equal((await request(baseUrl, '/audio-file?path=busy.mp3', { method: 'DELETE' })).status, 409);
        assert.equal((await request(baseUrl, '/audio-file?path=missing.mp3', { method: 'DELETE' })).status, 404);
      });
    });
  });

  test('locked files return conflicts for delete and move operations', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'delete.mp3'), 'audio');
      fs.writeFileSync(path.join(audioDir, 'move.mp3'), 'audio');
      fs.mkdirSync(path.join(audioDir, 'Music'));
      const originalUnlink = fs.unlinkSync;
      const originalRename = fs.renameSync;

      fs.unlinkSync = target => {
        if (target === path.join(audioDir, 'delete.mp3')) {
          const error = new Error('locked');
          error.code = 'EPERM';
          throw error;
        }
        return originalUnlink(target);
      };
      fs.renameSync = (source, target) => {
        if (source === path.join(audioDir, 'move.mp3')) {
          const error = new Error('busy');
          error.code = 'EBUSY';
          throw error;
        }
        return originalRename(source, target);
      };

      try {
        await callFileApi(audioDir, createAudioService(), async baseUrl => {
          assert.deepEqual(
            await request(baseUrl, '/audio-file?path=delete.mp3', { method: 'DELETE' }),
            { status: 409, body: { error: 'File is currently in use' } }
          );
          assert.deepEqual(
            await request(baseUrl, '/audio-file/move', post({
              path: 'move.mp3', targetCategory: 'Music'
            })),
            { status: 409, body: { error: 'File is currently in use' } }
          );
        });
      } finally {
        fs.unlinkSync = originalUnlink;
        fs.renameSync = originalRename;
      }
    });
  });

  test('POST /audio-file/move moves a track and can create its category', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'roar.wav'), 'audio');

      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        const response = await request(baseUrl, '/audio-file/move', post({
          path: 'roar.wav',
          targetCategory: 'Combat',
          createCategory: true
        }));
        assert.deepEqual(response, {
          status: 200,
          body: { ok: true, from: 'roar.wav', to: 'Combat/roar.wav', changed: true }
        });
        assert.equal(fs.existsSync(path.join(audioDir, 'Combat', 'roar.wav')), true);
      });
    });
  });

  test('move blocks invalid categories, conflicts and in-use tracks', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'busy.mp3'), 'audio');
      fs.writeFileSync(path.join(audioDir, 'song.mp3'), 'audio');
      fs.mkdirSync(path.join(audioDir, 'Music'));
      fs.writeFileSync(path.join(audioDir, 'Music', 'song.mp3'), 'other');
      const service = createAudioService({ isFileInUse: createSpy(file => file === 'busy.mp3') });

      await callFileApi(audioDir, service, async baseUrl => {
        assert.equal((await request(baseUrl, '/audio-file/move', post({
          path: 'song.mp3', targetCategory: '../Music'
        }))).status, 400);
        assert.equal((await request(baseUrl, '/audio-file/move', post({
          path: 'song.mp3', targetCategory: 'Music'
        }))).status, 409);
        assert.equal((await request(baseUrl, '/audio-file/move', post({
          path: 'busy.mp3', targetCategory: 'Music'
        }))).status, 409);
      });
    });
  });

  test('POST /audio-file/rename renames safely and reports conflicts', async () => {
    await withAudioDir(async audioDir => {
      fs.writeFileSync(path.join(audioDir, 'old.ogg'), 'audio');
      fs.writeFileSync(path.join(audioDir, 'taken.ogg'), 'audio');

      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        assert.equal((await request(baseUrl, '/audio-file/rename', post({
          path: 'old.ogg', newName: '../escape'
        }))).status, 400);
        assert.equal((await request(baseUrl, '/audio-file/rename', post({
          path: 'old.ogg', newName: 'taken'
        }))).status, 409);
        assert.deepEqual(
          await request(baseUrl, '/audio-file/rename', post({ path: 'old.ogg', newName: 'new' })),
          { status: 200, body: { ok: true, from: 'old.ogg', to: 'new.ogg', changed: true } }
        );
        assert.equal(fs.existsSync(path.join(audioDir, 'new.ogg')), true);
      });
    });
  });

  test('category lifecycle supports create, rename and delete', async () => {
    await withAudioDir(async audioDir => {
      await callFileApi(audioDir, createAudioService(), async baseUrl => {
        assert.deepEqual(
          await request(baseUrl, '/audio-category', post({ name: 'Ambience' })),
          { status: 200, body: { ok: true, name: 'Ambience' } }
        );
        assert.equal((await request(baseUrl, '/audio-category', post({ name: 'Ambience' }))).status, 409);
        assert.deepEqual(
          await request(baseUrl, '/audio-category/rename', post({ name: 'Ambience', newName: 'Music' })),
          { status: 200, body: { ok: true, from: 'Ambience', to: 'Music', changed: true } }
        );
        assert.deepEqual(
          await request(baseUrl, '/audio-category?name=Music', { method: 'DELETE' }),
          { status: 200, body: { ok: true } }
        );
        assert.equal(fs.existsSync(path.join(audioDir, 'Music')), false);
      });
    });
  });

  test('category mutation blocks invalid names and categories in use', async () => {
    await withAudioDir(async audioDir => {
      fs.mkdirSync(path.join(audioDir, 'Busy'));
      const service = createAudioService({ isCategoryInUse: createSpy(name => name === 'Busy') });

      await callFileApi(audioDir, service, async baseUrl => {
        assert.equal((await request(baseUrl, '/audio-category', post({ name: '../escape' }))).status, 400);
        assert.equal((await request(baseUrl, '/audio-category?name=../Busy', { method: 'DELETE' })).status, 400);
        assert.equal((await request(baseUrl, '/audio-category?name=Busy', { method: 'DELETE' })).status, 409);
        assert.equal((await request(baseUrl, '/audio-category/rename', post({
          name: 'Busy', newName: 'Other'
        }))).status, 409);
      });
    });
  });
});
