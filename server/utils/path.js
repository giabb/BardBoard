const path = require('path');
const { AUDIO_DIR, ALLOWED_EXT } = require('../constants');

function sanitizeCategory(raw) {
  if (!raw) return '';
  return raw.toString().trim().replace(/[^a-zA-Z0-9 _-]/g, '');
}

function resolveAudioPath(relativePath) {
  const fullPath = path.resolve(AUDIO_DIR, relativePath);
  if (!fullPath.startsWith(AUDIO_DIR)) return null;
  return fullPath;
}

function hasAllowedExt(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ALLOWED_EXT.has(ext);
}

module.exports = {
  sanitizeCategory,
  resolveAudioPath,
  hasAllowedExt
};
