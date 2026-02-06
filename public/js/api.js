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
export async function ensureEnvConfig() {
    if (window.ENV && window.ENV.channelId) return window.ENV;
    const response = await fetch('/env-config');
    const config = await response.json();
    window.ENV = config;
    return config;
}

export async function fetchAudioFiles() {
    const response = await fetch('/audio-files');
    return response.json();
}

export function playAudio(fileName) {
    return fetch('/play-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, channelId: window.ENV.channelId })
    });
}

export function togglePause() {
    return fetch('/toggle-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    });
}

export function stopAudio() {
    return fetch('/stop-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    });
}

export function toggleRepeat() {
    return fetch('/toggle-repeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    });
}

export function setVolume(volume) {
    return fetch('/set-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId, volume })
    });
}

export function getVolume() {
    return fetch('/get-volume?channelId=' + encodeURIComponent(window.ENV.channelId));
}

export function getRepeatStatus() {
    return fetch('/repeat-status?channelId=' + encodeURIComponent(window.ENV.channelId));
}

export function getPauseStatus() {
    return fetch('/pause-status?channelId=' + encodeURIComponent(window.ENV.channelId));
}

export function getNowPlaying() {
    return fetch('/now-playing?channelId=' + encodeURIComponent(window.ENV.channelId));
}

export function seekTo(offsetSecs) {
    return fetch('/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId, offsetSecs })
    });
}

export function uploadAudio(file, category) {
    const formData = new FormData();
    formData.append('file', file);
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetch('/upload-audio' + query, {
        method: 'POST',
        body: formData
    });
}

export function deleteAudioFile(path) {
    return fetch('/audio-file?path=' + encodeURIComponent(path), {
        method: 'DELETE'
    });
}

export function deleteCategory(name) {
    return fetch('/audio-category?name=' + encodeURIComponent(name), {
        method: 'DELETE'
    });
}

export function fetchPlaylist() {
    return fetch('/playlist');
}

export function addToPlaylist(fileName) {
    return fetch('/playlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
    });
}

export function setPlaylist(queue) {
    return fetch('/playlist/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue })
    });
}

export function shufflePlaylist() {
    return fetch('/playlist/shuffle', {
        method: 'POST'
    });
}

export function clearPlaylist() {
    return fetch('/playlist/clear', {
        method: 'POST'
    });
}

export function playPlaylist() {
    return fetch('/playlist/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    });
}

export function skipPlaylist() {
    return fetch('/playlist/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    });
}
