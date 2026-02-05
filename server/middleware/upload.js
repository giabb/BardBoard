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
