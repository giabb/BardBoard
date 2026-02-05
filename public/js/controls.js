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
import { togglePause, stopAudio, toggleRepeat, setVolume, getRepeatStatus, getVolume, getPauseStatus } from './api.js';
import { playbackState, repeatState } from './state.js';

export function updatePauseUI(paused) {
    playbackState.isPaused = paused;
    const btn = document.getElementById('pauseToggle');
    const icon = document.getElementById('pauseIcon');
    const label = btn.querySelector('span');

    if (playbackState.isPaused) {
        btn.classList.add('paused');
        label.textContent = 'Resume';
        icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
    } else {
        btn.classList.remove('paused');
        label.textContent = 'Pause';
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        playbackState.npPollTime = performance.now();
    }
}

export function initControls() {
    const pauseBtn = document.getElementById('pauseToggle');
    const repeatBtn = document.getElementById('repeatToggle');
    const stopBtn = document.getElementById('stopButton');
    const volumeSlider = document.getElementById('volumeSlider');

    pauseBtn.addEventListener('click', () => {
        void togglePause()
            .then(r => r.json())
            .then(data => updatePauseUI(data.paused));
    });

    repeatBtn.addEventListener('click', () => {
        repeatState.isRepeatEnabled = !repeatState.isRepeatEnabled;
        repeatBtn.classList.toggle('active', repeatState.isRepeatEnabled);

        void toggleRepeat().catch(err => console.error('toggle-repeat error:', err));
    });

    stopBtn.addEventListener('click', () => {
        void stopAudio();
    });

    volumeSlider.addEventListener('input', function () {
        void setVolume(this.value / 100).catch(err => console.error('set-volume error:', err));
    });
}

export function syncRepeatState() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();
    return getRepeatStatus()
        .then(r => r.json())
        .then(data => {
            repeatState.isRepeatEnabled = !!data.repeatEnabled;
            document.getElementById('repeatToggle').classList.toggle('active', repeatState.isRepeatEnabled);
        })
        .catch(err => console.error('repeat-status error:', err));
}

export function syncVolumeState() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();
    return getVolume()
        .then(r => r.json())
        .then(data => {
            const volumeSlider = document.getElementById('volumeSlider');
            volumeSlider.value = (data.volume || 0.5) * 100;
        })
        .catch(err => console.error('get-volume error:', err));
}

export function syncPauseState() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();
    return getPauseStatus()
        .then(r => r.json())
        .then(data => updatePauseUI(data.paused))
        .catch(err => console.error('pause-status error:', err));
}
