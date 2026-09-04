/**
  BardBoard - A DiscordJS bot soundboard
  Copyright (C) 2024 Giovanbattista Abbate

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const multer = require('multer');
const { AUDIO_DIR, ALLOWED_EXT } = require('../constants');
const { sanitizeCategory } = require('../utils/path');

function createUpload(options = {}) {
  const audioDir = options.audioDir || AUDIO_DIR;
  const allowedExt = options.allowedExt || ALLOWED_EXT;
  const fsImpl = options.fs || fs;
  const maxUploadMb = options.maxUploadMb
    ?? Math.max(1, Number.parseInt(process.env.UPLOAD_MAX_MB || '50', 10));

  const storage = {
    _handleFile(req, file, cb) {
      const input = String(req.query.category || '').trim();
      const category = sanitizeCategory(input);
      if (input && category !== input) return cb(new Error('Invalid category'));

      const targetDir = category ? path.join(audioDir, category) : audioDir;
      const fileName = path.basename(file.originalname);
      const targetPath = path.join(targetDir, fileName);
      let output;
      let opened = false;

      try {
        fsImpl.mkdirSync(targetDir, { recursive: true });
        output = fsImpl.createWriteStream(targetPath, { flags: 'wx' });
      } catch (error) {
        return cb(error);
      }

      output.once('open', () => {
        opened = true;
      });

      pipeline(file.stream, output, error => {
        if (!error) {
          return cb(null, {
            destination: targetDir,
            filename: fileName,
            path: targetPath,
            size: output.bytesWritten
          });
        }

        const uploadError = error.code === 'EEXIST'
          ? Object.assign(new Error('A file with the same name already exists'), { code: error.code })
          : error;
        if (!opened) return cb(uploadError);

        fsImpl.unlink(targetPath, cleanupError => {
          if (cleanupError && cleanupError.code !== 'ENOENT') {
            console.warn('Could not remove partial upload:', cleanupError.message);
          }
          cb(uploadError);
        });
      });
    },

    _removeFile(_req, file, cb) {
      fsImpl.unlink(file.path, cb);
    }
  };

  return multer({
    storage,
    limits: {
      fileSize: maxUploadMb * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (!allowedExt.has(ext)) {
        return cb(new Error('Unsupported file type'));
      }
      cb(null, true);
    }
  });
}

const upload = createUpload();

module.exports = upload;
module.exports.createUpload = createUpload;
