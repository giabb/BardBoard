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
const rateLimit = require('express-rate-limit');
const { resolveAudioPath, hasAllowedExt } = require('../utils/path');

function createPlaylistRoutes(audioService) {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_PLAYLIST || '120', 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });

  function isValidChannelId(channelId) {
    return typeof channelId === 'string' && /^\d{17,20}$/.test(channelId);
  }

  function normalizeFileName(raw) {
    if (!raw) return null;
    const relPath = raw.toString().replace(/\\/g, '/');
    if (relPath.includes('..') || relPath.startsWith('/')) return null;
    if (!hasAllowedExt(relPath)) return null;
    const fullPath = resolveAudioPath(relPath);
    if (!fullPath) return null;
    return relPath;
  }

  router.use(limiter);

  router.get('/playlist', (req, res) => {
    const queue = audioService.getQueue(req.sessionID);
    res.json({ queue });
  });

  router.post('/playlist/add', (req, res) => {
    const safeFile = normalizeFileName(req.body.fileName);
    if (!safeFile) return res.status(400).json({ error: 'Invalid fileName' });
    const queue = audioService.addToQueue(req.sessionID, safeFile);
    res.json({ queue });
  });

  router.post('/playlist/set', (req, res) => {
    const rawQueue = req.body.queue;
    if (!Array.isArray(rawQueue)) return res.status(400).json({ error: 'Invalid queue' });
    const safeQueue = [];
    for (const item of rawQueue) {
      const safeFile = normalizeFileName(item);
      if (!safeFile) return res.status(400).json({ error: 'Invalid fileName' });
      safeQueue.push(safeFile);
    }
    const queue = audioService.setQueue(req.sessionID, safeQueue);
    res.json({ queue });
  });

  router.post('/playlist/shuffle', (req, res) => {
    const queue = audioService.shuffleQueue(req.sessionID);
    res.json({ queue });
  });

  router.post('/playlist/clear', (req, res) => {
    const queue = audioService.clearQueue(req.sessionID);
    res.json({ queue });
  });

  router.post('/playlist/play', async (req, res) => {
    const { channelId } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    if (!audioService.setActiveQueueOwner(channelId, req.sessionID)) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    if (audioService.isPlaying(channelId)) {
      return res.json({ started: false, queue: audioService.getQueue(req.sessionID) });
    }
    const started = await audioService.playNextFromQueue(channelId, req.sessionID);
    if (!started) return res.status(404).json({ error: 'Queue empty' });
    return res.json({ started: true, queue: audioService.getQueue(req.sessionID) });
  });

  router.post('/playlist/skip', async (req, res) => {
    const { channelId } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    if (!audioService.setActiveQueueOwner(channelId, req.sessionID)) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    const started = await audioService.playNextFromQueue(channelId, req.sessionID);
    if (!started) {
      audioService.stopAudioInDiscord(channelId);
      return res.json({ started: false, queue: audioService.getQueue(req.sessionID) });
    }
    return res.json({ started: true, queue: audioService.getQueue(req.sessionID) });
  });

  return router;
}

module.exports = createPlaylistRoutes;
