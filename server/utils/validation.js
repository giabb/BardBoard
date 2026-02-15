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
const { resolveAudioPath, hasAllowedExt } = require('./path');

function isValidChannelId(channelId) {
  return typeof channelId === 'string' && /^\d{17,20}$/.test(channelId);
}

function normalizeAudioFileName(raw) {
  if (!raw) return null;
  const relPath = raw.toString().replace(/\\/g, '/');
  if (relPath.includes('..') || relPath.startsWith('/')) return null;
  if (!hasAllowedExt(relPath)) return null;
  const fullPath = resolveAudioPath(relPath);
  if (!fullPath) return null;
  return relPath;
}

module.exports = {
  isValidChannelId,
  normalizeAudioFileName
};
