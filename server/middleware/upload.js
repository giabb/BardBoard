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
const multer = require('multer');
const { AUDIO_DIR, ALLOWED_EXT } = require('../constants');
const { sanitizeCategory } = require('../utils/path');

function createUpload(options = {}) {
  const audioDir = options.audioDir || AUDIO_DIR;
  const allowedExt = options.allowedExt || ALLOWED_EXT;
  const maxUploadMb = options.maxUploadMb
    ?? Math.max(1, Number.parseInt(process.env.UPLOAD_MAX_MB || '50', 10));

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const input = String(req.query.category || '').trim();
        const category = sanitizeCategory(input);
        if (input && category !== input) return cb(new Error('Invalid category'));

        const targetDir = category ? path.join(audioDir, category) : audioDir;
        try {
          fs.mkdirSync(targetDir, { recursive: true });
          cb(null, targetDir);
        } catch (err) {
          cb(err);
        }
      },
      filename: (req, file, cb) => {
        const fileName = path.basename(file.originalname);
        const category = sanitizeCategory(String(req.query.category || '').trim());
        const targetPath = path.join(category ? path.join(audioDir, category) : audioDir, fileName);
        if (fs.existsSync(targetPath)) {
          return cb(new Error('A file with the same name already exists'));
        }
        cb(null, fileName);
      }
    }),
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
