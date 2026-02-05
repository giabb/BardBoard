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

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const category = sanitizeCategory(req.query.category);
      const targetDir = category ? path.join(AUDIO_DIR, category) : AUDIO_DIR;
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        cb(null, targetDir);
      } catch (err) {
        cb(err);
      }
    },
    filename: (req, file, cb) => {
      cb(null, path.basename(file.originalname));
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error('Unsupported file type'));
    }
    cb(null, true);
  }
});

module.exports = upload;
