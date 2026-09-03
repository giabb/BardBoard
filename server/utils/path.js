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
const path = require('path');
const { AUDIO_DIR, ALLOWED_EXT } = require('../constants');

function sanitizeCategory(raw) {
  if (!raw) return '';
  return raw.toString().trim().replace(/[^a-zA-Z0-9 _!-]/g, '');
}

function resolveAudioPathFrom(baseDir, relativePath) {
  const resolvedBaseDir = path.resolve(baseDir);
  const fullPath = path.resolve(resolvedBaseDir, relativePath);
  if (fullPath === resolvedBaseDir) return fullPath;
  if (!fullPath.startsWith(resolvedBaseDir + path.sep)) return null;
  return fullPath;
}

function resolveAudioPath(relativePath) {
  return resolveAudioPathFrom(AUDIO_DIR, relativePath);
}

function hasAllowedExt(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

module.exports = {
  sanitizeCategory,
  resolveAudioPath,
  resolveAudioPathFrom,
  hasAllowedExt
};
