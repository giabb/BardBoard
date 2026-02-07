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
import {
    fetchPlaylist,
    addToPlaylist,
    setPlaylist,
    shufflePlaylist,
    clearPlaylist,
    playPlaylist,
    skipPlaylist
} from './api.js';

let queue = [];
let dragIndex = null;
let listEl;
let emptyEl;
let playBtn;
let shuffleBtn;
let clearBtn;
let skipBtn;
let isPlaying = false;

function formatTrackLabel(file) {
    return file
        .replace(/\.[^/.]+$/, '')
        .replace(/[\\/]/g, ' / ');
}

function setButtonsState() {
    const hasItems = queue.length > 0;
    if (playBtn) {
        playBtn.classList.toggle('is-hidden', isPlaying || !hasItems);
        playBtn.disabled = !hasItems;
    }
    if (shuffleBtn) shuffleBtn.disabled = !hasItems;
    if (clearBtn) clearBtn.disabled = !hasItems;
    if (skipBtn) skipBtn.disabled = !hasItems;
}

function renderQueue() {
    if (!listEl || !emptyEl) return;
    listEl.innerHTML = '';
    emptyEl.classList.toggle('is-hidden', queue.length > 0);
    setButtonsState();

    queue.forEach((file, index) => {
        const item = document.createElement('li');
        item.className = 'playlist-item';
        item.setAttribute('draggable', 'true');
        item.dataset.index = String(index);
        item.dataset.file = file;

        item.innerHTML = `
            <span class="playlist-handle" aria-hidden="true">::</span>
            <span class="playlist-track">${formatTrackLabel(file)}</span>
            <button class="playlist-remove" type="button" aria-label="Remove ${formatTrackLabel(file)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                    <path d="M10 11v6"></path>
                    <path d="M14 11v6"></path>
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                </svg>
            </button>
        `;

        const removeBtn = item.querySelector('.playlist-remove');
        removeBtn.addEventListener('click', () => {
            queue.splice(index, 1);
            renderQueue();
            void setPlaylist(queue).catch(err => console.error('playlist remove error:', err));
        });

        listEl.appendChild(item);
    });
}

async function refreshQueue() {
    try {
        const response = await fetchPlaylist();
        const data = await response.json();
        queue = Array.isArray(data.queue) ? data.queue : [];
        renderQueue();
    } catch (err) {
        console.error('playlist fetch error:', err);
    }
}

function moveQueueItem(fromIndex, toIndex) {
    if (fromIndex === toIndex) return;
    const [item] = queue.splice(fromIndex, 1);
    queue.splice(toIndex, 0, item);
}

function clearDragState() {
    if (!listEl) return;
    listEl.querySelectorAll('.playlist-item').forEach(item => {
        item.classList.remove('dragging');
        item.classList.remove('drop-target');
    });
    dragIndex = null;
}

function setupDragAndDrop() {
    if (!listEl) return;

    listEl.addEventListener('dragstart', e => {
        const item = e.target.closest('.playlist-item');
        if (!item) return;
        dragIndex = Number(item.dataset.index);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(dragIndex));
    });

    listEl.addEventListener('dragover', e => {
        const item = e.target.closest('.playlist-item');
        if (!item) return;
        e.preventDefault();
        const targetIndex = Number(item.dataset.index);
        if (targetIndex === dragIndex) return;
        listEl.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('drop-target'));
        item.classList.add('drop-target');
    });

    listEl.addEventListener('dragleave', e => {
        const item = e.target.closest('.playlist-item');
        if (!item) return;
        item.classList.remove('drop-target');
    });

    listEl.addEventListener('drop', e => {
        const item = e.target.closest('.playlist-item');
        if (!item) return;
        e.preventDefault();
        const targetIndex = Number(item.dataset.index);
        if (Number.isNaN(dragIndex) || dragIndex === null) return;
        moveQueueItem(dragIndex, targetIndex);
        renderQueue();
        void setPlaylist(queue).catch(err => console.error('playlist reorder error:', err));
        clearDragState();
    });

    listEl.addEventListener('dragend', () => clearDragState());
}

export async function queueTrack(fileName) {
    try {
        const response = await addToPlaylist(fileName);
        const data = await response.json();
        queue = Array.isArray(data.queue) ? data.queue : queue;
        renderQueue();
    } catch (err) {
        console.error('playlist add error:', err);
    }
}

export function refreshPlaylist() {
    return refreshQueue();
}

export function setPlaylistPlaybackStatus(playing) {
    isPlaying = Boolean(playing);
    setButtonsState();
}

export function initPlaylist() {
    listEl = document.getElementById('playlistList');
    emptyEl = document.getElementById('playlistEmpty');
    playBtn = document.getElementById('playlistPlay');
    shuffleBtn = document.getElementById('playlistShuffle');
    clearBtn = document.getElementById('playlistClear');
    skipBtn = document.getElementById('playlistSkip');

    if (!listEl || !emptyEl) return;

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            void playPlaylist()
                .then(() => refreshQueue())
                .catch(err => console.error('playlist play error:', err));
        });
    }

    if (shuffleBtn) {
        shuffleBtn.addEventListener('click', () => {
            void shufflePlaylist()
                .then(r => r.json())
                .then(data => {
                    queue = Array.isArray(data.queue) ? data.queue : queue;
                    renderQueue();
                })
                .catch(err => console.error('playlist shuffle error:', err));
        });
    }

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            void clearPlaylist()
                .then(r => r.json())
                .then(data => {
                    queue = Array.isArray(data.queue) ? data.queue : [];
                    renderQueue();
                })
                .catch(err => console.error('playlist clear error:', err));
        });
    }

    if (skipBtn) {
        skipBtn.addEventListener('click', () => {
            void skipPlaylist()
                .then(() => refreshQueue())
                .catch(err => console.error('playlist skip error:', err));
        });
    }

    setupDragAndDrop();
    void refreshQueue();
}
