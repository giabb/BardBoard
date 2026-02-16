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
const express = require('express');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');
const upload = require('../middleware/upload');
const { AUDIO_DIR } = require('../constants');
const { sanitizeCategory, resolveAudioPath, hasAllowedExt } = require('../utils/path');

function createFileRoutes(audioService) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_FILES || '60', 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });

  router.use(limiter);

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
          response.categories[entry.name] = subFiles;
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
      return res.json({ ok: true, file: req.file.filename });
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
    if (audioService && typeof audioService.isFileInUse === 'function' && audioService.isFileInUse(relPath)) {
      return res.status(409).json({ error: 'File is currently in use' });
    }
    const fullPath = resolveAudioPath(relPath);
    if (!fullPath) return res.status(400).json({ error: 'Invalid path' });

    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) return res.status(400).json({ error: 'Not a file' });
      if (!hasAllowedExt(fullPath)) return res.status(400).json({ error: 'Invalid file type' });
      fs.unlinkSync(fullPath);
      return res.json({ ok: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY')) {
        return res.status(409).json({ error: 'File is currently in use' });
      }
      console.error('Delete file failed:', err);
      return res.status(500).json({ error: 'Delete failed' });
    }
  });

  /**
   * Handles the `/audio-file/move` API endpoint to move an audio file
   * to another category (or root folder).
   *
   * @route POST /audio-file/move
   * @body {string} path - Relative source path like "Folder/File.mp3" or "File.mp3".
   * @body {string} [targetCategory] - Target category folder name, empty string for root.
   */
  router.post('/audio-file/move', (req, res) => {
    const rawPath = (req.body?.path || '').toString();
    const sourceRelPath = rawPath.replace(/\\/g, '/');
    if (!sourceRelPath || sourceRelPath.includes('..') || sourceRelPath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    if (!hasAllowedExt(sourceRelPath)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    if (audioService && typeof audioService.isFileInUse === 'function' && audioService.isFileInUse(sourceRelPath)) {
      return res.status(409).json({ error: 'File is currently in use' });
    }

    const rawTargetCategory = req.body?.targetCategory;
    const targetCategoryInput = rawTargetCategory == null ? '' : rawTargetCategory.toString();
    const targetCategory = sanitizeCategory(targetCategoryInput);
    const createCategory = Boolean(req.body?.createCategory);
    if (targetCategoryInput.trim() && !targetCategory) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const sourceFullPath = resolveAudioPath(sourceRelPath);
    if (!sourceFullPath) return res.status(400).json({ error: 'Invalid path' });

    const targetDirPath = targetCategory ? resolveAudioPath(targetCategory) : AUDIO_DIR;
    if (!targetDirPath) return res.status(400).json({ error: 'Invalid category' });

    const targetFileName = path.basename(sourceRelPath);
    const targetRelPath = targetCategory ? `${targetCategory}/${targetFileName}` : targetFileName;
    const targetFullPath = resolveAudioPath(targetRelPath);
    if (!targetFullPath) return res.status(400).json({ error: 'Invalid target path' });

    if (sourceFullPath === targetFullPath) {
      return res.json({ ok: true, from: sourceRelPath, to: targetRelPath, changed: false });
    }

    try {
      const sourceStat = fs.statSync(sourceFullPath);
      if (!sourceStat.isFile()) return res.status(400).json({ error: 'Not a file' });

      if (targetCategory && createCategory && !fs.existsSync(targetDirPath)) {
        fs.mkdirSync(targetDirPath, { recursive: false });
      }

      const targetDirStat = fs.statSync(targetDirPath);
      if (!targetDirStat.isDirectory()) return res.status(400).json({ error: 'Not a category' });

      if (fs.existsSync(targetFullPath)) {
        return res.status(409).json({ error: 'A file with the same name already exists in target category' });
      }

      fs.renameSync(sourceFullPath, targetFullPath);
      return res.json({ ok: true, from: sourceRelPath, to: targetRelPath, changed: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return res.status(404).json({ error: 'File or category not found' });
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY')) {
        return res.status(409).json({ error: 'File is currently in use' });
      }
      console.error('Move file failed:', err);
      return res.status(500).json({ error: 'Move failed' });
    }
  });

  /**
   * Handles the `/audio-category` API endpoint to create a category folder.
   *
   * @route POST /audio-category
   * @body {string} name - Category folder name.
   */
  router.post('/audio-category', (req, res) => {
    const rawName = req.body?.name;
    const input = rawName == null ? '' : rawName.toString();
    const name = sanitizeCategory(input);
    if (!name || !input.trim()) return res.status(400).json({ error: 'Invalid category' });
    if (name !== input.trim()) return res.status(400).json({ error: 'Invalid category' });

    const dirPath = resolveAudioPath(name);
    if (!dirPath || dirPath === AUDIO_DIR) return res.status(400).json({ error: 'Invalid category' });
    if (fs.existsSync(dirPath)) return res.status(409).json({ error: 'Category already exists' });

    try {
      fs.mkdirSync(dirPath, { recursive: false });
      return res.json({ ok: true, name });
    } catch (err) {
      if (err && err.code === 'EEXIST') return res.status(409).json({ error: 'Category already exists' });
      console.error('Create category failed:', err);
      return res.status(500).json({ error: 'Create category failed' });
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
    if (audioService && typeof audioService.isCategoryInUse === 'function' && audioService.isCategoryInUse(name)) {
      return res.status(409).json({ error: 'Category contains file(s) currently in use' });
    }
    const dirPath = resolveAudioPath(name);
    if (!dirPath || dirPath === AUDIO_DIR) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    try {
      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) return res.status(400).json({ error: 'Not a category' });
      fs.rmSync(dirPath, { recursive: true, force: true });
      return res.json({ ok: true });
    } catch (err) {
      if (err && err.code === 'ENOENT') return res.status(404).json({ error: 'Category not found' });
      if (err && (err.code === 'EPERM' || err.code === 'EBUSY')) {
        return res.status(409).json({ error: 'Category contains file(s) currently in use' });
      }
      console.error('Delete category failed:', err);
      return res.status(500).json({ error: 'Delete failed' });
    }
  });

  return router;
}

module.exports = createFileRoutes;
