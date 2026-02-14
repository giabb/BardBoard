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

function createAudioRoutes(audioService) {
  const router = express.Router();
  const actionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_AUDIO || '120', 10),
    standardHeaders: 'draft-7',
    legacyHeaders: false
  });
  const statusLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: Number.parseInt(process.env.RATE_LIMIT_AUDIO_STATUS || '600', 10),
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

  router.get('/repeat-status', statusLimiter, (req, res) => {
    const { channelId } = req.query;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    res.json(audioService.getRepeatStatus(channelId));
  });

  router.post('/play-audio', actionLimiter, (req, res) => {
    const { fileName, channelId } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    const safeFile = normalizeFileName(fileName);
    if (!safeFile) return res.status(400).json({ error: 'Invalid fileName' });
    audioService.playAudioInDiscord(safeFile, channelId);
    res.sendStatus(200);
  });

  router.post('/toggle-pause', actionLimiter, (req, res) => {
    const { channelId } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    const result = audioService.togglePause(channelId);
    if (!result) return res.sendStatus(404);
    res.json(result);
  });

  router.get('/pause-status', statusLimiter, (req, res) => {
    const { channelId } = req.query;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    res.json(audioService.getPauseStatus(channelId));
  });

  router.post('/stop-audio', actionLimiter, (req, res) => {
    const { channelId } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    audioService.stopAudioInDiscord(channelId);
    res.sendStatus(200);
  });

  router.post('/toggle-repeat', actionLimiter, (req, res) => {
    const { channelId } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    const newState = audioService.toggleRepeat(channelId);
    if (newState === null) return res.sendStatus(404);
    res.json({ repeatEnabled: newState });
  });

  router.post('/set-volume', actionLimiter, (req, res) => {
    const { channelId, volume } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    const volumeValue = Number(volume);
    if (!Number.isFinite(volumeValue) || volumeValue < 0 || volumeValue > 1) {
      return res.status(400).json({ error: 'Invalid volume' });
    }
    audioService.setCurrentVolume(channelId, volumeValue);
    res.sendStatus(200);
  });

  router.get('/get-volume', statusLimiter, (req, res) => {
    const { channelId } = req.query;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    res.json(audioService.getVolume(channelId));
  });

  router.post('/seek', actionLimiter, async (req, res) => {
    const { channelId, offsetSecs } = req.body;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    const offsetValue = Number(offsetSecs);
    if (!Number.isFinite(offsetValue) || offsetValue < 0) {
      return res.status(400).json({ error: 'Invalid offsetSecs' });
    }
    try {
      const ok = await audioService.seek(channelId, offsetValue);
      if (!ok) return res.sendStatus(404);
      res.sendStatus(200);
    } catch (err) {
      console.error('Seek error:', err);
      res.sendStatus(500);
    }
  });

  router.get('/now-playing', statusLimiter, async (req, res) => {
    const { channelId } = req.query;
    if (!isValidChannelId(channelId)) return res.status(400).json({ error: 'Invalid channelId' });
    res.json(await audioService.nowPlaying(channelId));
  });

  return router;
}

module.exports = createAudioRoutes;
