const express = require('express');
const fs = require('fs');
const path = require('path');
const upload = require('../middleware/upload');
const { AUDIO_DIR } = require('../constants');
const { sanitizeCategory, resolveAudioPath, hasAllowedExt } = require('../utils/path');

const router = express.Router();

/**
 * Handles the `/audio-files` API endpoint to return a list of audio files
 * from the `audio-files` directory.
 *
 * @route GET /audio-files
 * @returns {string[]} A list of audio file names.
 */
router.get('/audio-files', (req, res) => {
  const baseDir = AUDIO_DIR;

  let entries = [];
  try {
    entries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (e) {
    console.error('Could not read audio-files directory:', e);
    return res.json({ root: [], categories: {} });
  }

  const response = { root: [], categories: {} };

  entries.forEach(entry => {
    if (entry.isFile() && hasAllowedExt(entry.name)) {
      response.root.push(entry.name);
    } else if (entry.isDirectory()) {
      const subDirPath = path.join(baseDir, entry.name);
      try {
        const subFiles = fs.readdirSync(subDirPath)
          .filter(f => hasAllowedExt(f))
          .map(f => `${entry.name}/${f}`);
        if (subFiles.length > 0) {
          response.categories[entry.name] = subFiles;
        }
      } catch (err) {
        console.error(`Error reading subdir ${entry.name}:`, err);
      }
    }
  });

  res.json(response);
});

/**
 * Handles the `/upload-audio` API endpoint to upload a new audio file.
 *
 * @route POST /upload-audio
 * @query {string} category - Optional category folder name.
 */
router.post('/upload-audio', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Missing file' });
    res.json({ ok: true, file: req.file.filename });
  });
});

/**
 * Handles the `/audio-file` API endpoint to delete a specific audio file.
 *
 * @route DELETE /audio-file
 * @query {string} path - Relative path like "Folder/File.mp3" or "File.mp3".
 */
router.delete('/audio-file', (req, res) => {
  const relPath = (req.query.path || '').toString().replace(/\\/g, '/');
  if (!relPath || relPath.includes('..') || relPath.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid path' });
  }
  const fullPath = resolveAudioPath(relPath);
  if (!fullPath) return res.status(400).json({ error: 'Invalid path' });

  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });
    if (!hasAllowedExt(fullPath)) return res.status(400).json({ error: 'Invalid file type' });
    fs.unlinkSync(fullPath);
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * Handles the `/audio-category` API endpoint to delete an entire category.
 *
 * @route DELETE /audio-category
 * @query {string} name - Category folder name.
 */
router.delete('/audio-category', (req, res) => {
  const name = sanitizeCategory(req.query.name);
  if (!name) return res.status(400).json({ error: 'Invalid category' });
  const dirPath = resolveAudioPath(name);
  if (!dirPath || dirPath === AUDIO_DIR) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a category' });
    fs.rmSync(dirPath, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(404).json({ error: 'Category not found' });
  }
});

module.exports = router;
