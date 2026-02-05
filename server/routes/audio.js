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

function createAudioRoutes(audioService) {
  const router = express.Router();

  router.get('/repeat-status', (req, res) => {
    const { channelId } = req.query;
    res.json(audioService.getRepeatStatus(channelId));
  });

  router.post('/play-audio', (req, res) => {
    const { fileName, channelId } = req.body;
    audioService.playAudioInDiscord(fileName, channelId);
    res.sendStatus(200);
  });

  router.post('/toggle-pause', (req, res) => {
    const { channelId } = req.body;
    const result = audioService.togglePause(channelId);
    if (!result) return res.sendStatus(404);
    res.json(result);
  });

  router.get('/pause-status', (req, res) => {
    const { channelId } = req.query;
    res.json(audioService.getPauseStatus(channelId));
  });

  router.post('/stop-audio', (req, res) => {
    const { channelId } = req.body;
    audioService.stopAudioInDiscord(channelId);
    res.sendStatus(200);
  });

  router.post('/toggle-repeat', (req, res) => {
    const { channelId } = req.body;
    const newState = audioService.toggleRepeat(channelId);
    if (newState === null) return res.sendStatus(404);
    res.json({ repeatEnabled: newState });
  });

  router.post('/set-volume', (req, res) => {
    const { channelId, volume } = req.body;
    audioService.setCurrentVolume(channelId, volume);
    res.sendStatus(200);
  });

  router.get('/get-volume', (req, res) => {
    const { channelId } = req.query;
    res.json(audioService.getVolume(channelId));
  });

  router.post('/seek', async (req, res) => {
    const { channelId, offsetSecs } = req.body;
    try {
      const ok = await audioService.seek(channelId, offsetSecs);
      if (!ok) return res.sendStatus(404);
      res.sendStatus(200);
    } catch (err) {
      console.error('Seek error:', err);
      res.sendStatus(500);
    }
  });

  router.get('/now-playing', async (req, res) => {
    const { channelId } = req.query;
    res.json(await audioService.nowPlaying(channelId));
  });

  return router;
}

module.exports = createAudioRoutes;
