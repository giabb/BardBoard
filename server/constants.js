const path = require('path');

const AUDIO_DIR = path.join(__dirname, '..', 'audio-files');
const ALLOWED_EXT = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

module.exports = {
  AUDIO_DIR,
  ALLOWED_EXT
};
