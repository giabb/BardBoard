{/**
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
*/}
// -------------------------------------------------------
// Initial load helpers (env + audio list + state sync)
// -------------------------------------------------------
function showLoader() {
    const loaderEl = document.getElementById('appLoader');
    if (!loaderEl) return;
    const msgEl = document.getElementById('loaderMessage');
    if (msgEl) {
        const messages = [
            'Rolling initiative...',
            'Sharpening your lute strings...',
            'Summoning the tavern playlist...',
            'Polishing the bardic armor...',
            'Feeding the mimic jukebox...',
            'Consulting the dungeon DJ...',
            'Refilling the potion of volume...',
            'Taming the dragon speakers...',
            'Warming up the dice of destiny...',
            'Checking the spellbook of tracks...'
        ];
        msgEl.textContent = messages[Math.floor(Math.random() * messages.length)];
    }
    document.body.classList.remove('ready');
    loaderEl.classList.remove('loaded');
}

function hideLoader() {
    const loaderEl = document.getElementById('appLoader');
    if (!loaderEl) return;
    document.body.classList.add('ready');
    loaderEl.classList.add('loaded');
}

async function ensureEnvConfig() {
    if (window.ENV && window.ENV.channelId) return window.ENV;
    const response = await fetch('/env-config');
    const config = await response.json();
    window.ENV = config;
    return config;
}

async function loadAudioButtons() {
    const response = await fetch('/audio-files');
    const data = await response.json();
    const container = document.getElementById('audioButtons');
    container.innerHTML = ''; // Clear loading state if any

    const categoryPalette = [
    '#8b5cf6', // Purple
    '#d4a843', // Gold
    '#e05d8a', // Pink
    '#5aa8d6', // Blue
    '#6fbf9a', // Teal/Green
    '#ef4444', // Red
    '#f59e0b', // Orange/Amber
    '#a855f7', // Bright Purple
    '#ec4899', // Hot Pink
    '#14b8a6', // Cyan
    '#10b981', // Emerald
    '#f97316', // Bright Orange
    '#06b6d4', // Sky Blue
    '#eab308', // Yellow
    '#84cc16', // Lime
    ];

    const categoryColorMap = new Map();
    let colorIndex = 0;

    const getCategoryColor = (name) => {
        if (!categoryColorMap.has(name)) {
            categoryColorMap.set(name, categoryPalette[colorIndex % categoryPalette.length]);
            colorIndex++;
        }
        return categoryColorMap.get(name);
    };

    // Helper to create a grid of buttons
    const createGrid = (files, animationOffset = 0) => {
        const grid = document.createElement('div');
        grid.className = 'track-grid';

        files.forEach((file, i) => {
            // Display name: removes folder path and extension
            // e.g. "Dungeon/Scary.mp3" -> "Scary"
            const displayName = file.split('/').pop().replace(/\.[^/.]+$/, '');

            const btn = document.createElement('button');
            btn.className = 'track-btn';
            // Stagger animation slightly based on index
            btn.style.animationDelay = `${(i + animationOffset) * 0.03}s`;
            const searchKey = file.replace(/\.[^/.]+$/, '').replace(/[\\/]/g, ' ').toLowerCase();
            btn.setAttribute('data-track', file.replace(/\.[^/.]+$/, '')); // used for now-playing matching
            btn.setAttribute('data-search', searchKey);
            btn.setAttribute('data-file', file);
            btn.setAttribute('aria-label', `Play ${displayName}`);

            btn.innerHTML = `
                <span class="track-label">${displayName}</span>
                <div class="track-actions">
                    <button class="track-delete" type="button" aria-label="Delete ${displayName}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                        </svg>
                    </button>
                </div>
            `;

            btn.addEventListener('click', () => {
                playAudio(file); // Passes "Folder/File.mp3" to server
                btn.classList.add('pressed');
                setTimeout(() => btn.classList.remove('pressed'), 200);
            });

            const delBtn = btn.querySelector('.track-delete');
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (!confirm(`Delete "${displayName}"?`)) return;
                void deleteAudioFile(file).then(() => refreshAudioList());
            });

            grid.appendChild(btn);
        });
        return grid;
    };

    let globalCount = 0;

    // Render Root Files (Uncategorized)
    if (data.root && data.root.length > 0) {
        const rootGrid = createGrid(data.root, globalCount);
        rootGrid.classList.add('cat-colored');
        rootGrid.style.setProperty('--cat-color', getCategoryColor('__root__'));
        container.appendChild(rootGrid);
        globalCount += data.root.length;
    }

    // Render Categories
    if (data.categories) {
        const categoryList = document.getElementById('categoryList');
        const categorySelect = document.getElementById('uploadCategorySelect');
        if (categoryList) categoryList.innerHTML = '';
        if (categorySelect) {
            categorySelect.querySelectorAll('option[data-category]').forEach(opt => opt.remove());
        }

        Object.keys(data.categories).forEach(folderName => {
            const files = data.categories[folderName];
            if (categoryList) {
                const opt = document.createElement('option');
                opt.value = folderName;
                categoryList.appendChild(opt);
            }
            if (categorySelect) {
                const opt = document.createElement('option');
                opt.value = folderName;
                opt.textContent = folderName;
                opt.setAttribute('data-category', '1');
                categorySelect.appendChild(opt);
            }

            // Create the Header with a toggle
            const header = document.createElement('h2');
            header.className = 'category-header';
            const catColor = getCategoryColor(folderName);
            header.style.setProperty('--cat-color', catColor);
            header.innerHTML = `
                <span>${folderName}</span>
                <button class="cat-delete" type="button" aria-label="Delete category ${folderName}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                        <path d="M10 11v6"></path>
                        <path d="M14 11v6"></path>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                    </svg>
                </button>
                <svg class="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            `;

            // Create a wrapper for the collapsible effect
            const wrapper = document.createElement('div');
            wrapper.className = 'category-wrapper cat-colored'; // Default state: Open
            wrapper.style.setProperty('--cat-color', catColor);

            const inner = document.createElement('div');
            inner.className = 'category-inner';

            // Put the grid inside the inner wrapper
            inner.appendChild(createGrid(files, globalCount));
            wrapper.appendChild(inner);

            // Add Click Event to Toggle
            header.addEventListener('click', () => {
                // Toggle the 'collapsed' class on both header (for arrow rotation) and wrapper (for height)
                header.classList.toggle('collapsed');
                wrapper.classList.toggle('collapsed');
            });

            const catDeleteBtn = header.querySelector('.cat-delete');
            catDeleteBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (!confirm(`Delete category "${folderName}" and all its tracks?`)) return;
                void deleteCategory(folderName).then(() => refreshAudioList());
            });

            // Append everything to the main container
            container.appendChild(header);
            container.appendChild(wrapper);

            globalCount += files.length;
        });
    }
}

function setUploadStatus(message, isError = false) {
    const modal = document.getElementById('statusModal');
    const title = document.getElementById('statusTitle');
    const text = document.getElementById('statusMessage');
    if (!modal || !title || !text) return;
    title.textContent = isError ? 'Upload failed' : 'Upload complete';
    text.textContent = message;
    text.style.color = isError ? '#fca5a5' : '';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
}

function setUploadLoading(isLoading) {
    const loading = document.getElementById('uploadLoading');
    if (!loading) return;
    loading.classList.toggle('show', isLoading);
    loading.setAttribute('aria-hidden', isLoading ? 'false' : 'true');
}

function uploadAudio(file, category) {
    const formData = new FormData();
    formData.append('file', file);
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    return fetch('/upload-audio' + query, {
        method: 'POST',
        body: formData
    }).then(r => {
        if (!r.ok) return r.json().then(err => Promise.reject(err));
        return r.json();
    });
}

function deleteAudioFile(path) {
    return fetch('/audio-file?path=' + encodeURIComponent(path), {
        method: 'DELETE'
    }).then(r => {
        if (!r.ok) return r.json().then(err => Promise.reject(err));
        return r.json();
    });
}

function deleteCategory(name) {
    return fetch('/audio-category?name=' + encodeURIComponent(name), {
        method: 'DELETE'
    }).then(r => {
        if (!r.ok) return r.json().then(err => Promise.reject(err));
        return r.json();
    });
}

async function refreshAudioList() {
    await loadAudioButtons();
    const searchEl = document.getElementById('trackSearch');
    if (searchEl) applySearchFilter(searchEl.value);
}

function applySearchFilter(query) {
    const needle = query.trim().toLowerCase();
    const searching = needle.length > 0;
    const container = document.getElementById('audioButtons');
    if (!container) return;

    document.querySelectorAll('.track-btn').forEach(btn => {
        const hay = btn.dataset.search || btn.textContent.toLowerCase();
        const match = !searching || hay.includes(needle);
        btn.classList.toggle('is-hidden', !match);
    });

    const children = Array.from(container.children);
    for (let i = 0; i < children.length; i++) {
        const el = children[i];
        if (el.classList.contains('category-header')) {
            const header = el;
            const wrapper = children[i + 1];
            if (!wrapper) continue;
            const hasMatches = wrapper.querySelectorAll('.track-btn:not(.is-hidden)').length > 0;

            header.classList.toggle('is-hidden', !hasMatches);
            wrapper.classList.toggle('is-hidden', !hasMatches);

            if (searching) {
                if (header.dataset.prevCollapsed === undefined) {
                    header.dataset.prevCollapsed = header.classList.contains('collapsed') ? '1' : '0';
                }
                if (wrapper.dataset.prevCollapsed === undefined) {
                    wrapper.dataset.prevCollapsed = wrapper.classList.contains('collapsed') ? '1' : '0';
                }
                header.classList.remove('collapsed');
                wrapper.classList.remove('collapsed');
            } else {
                if (header.dataset.prevCollapsed !== undefined) {
                    header.classList.toggle('collapsed', header.dataset.prevCollapsed === '1');
                    delete header.dataset.prevCollapsed;
                }
                if (wrapper.dataset.prevCollapsed !== undefined) {
                    wrapper.classList.toggle('collapsed', wrapper.dataset.prevCollapsed === '1');
                    delete wrapper.dataset.prevCollapsed;
                }
            }
        } else if (el.classList.contains('track-grid')) {
            const hasMatches = el.querySelectorAll('.track-btn:not(.is-hidden)').length > 0;
            el.classList.toggle('is-hidden', !hasMatches);
        }
    }
}

function setupSearch() {
    const input = document.getElementById('trackSearch');
    if (!input) return;
    const handler = () => applySearchFilter(input.value);
    input.addEventListener('input', handler);
    input.addEventListener('search', handler);
    applySearchFilter(input.value);
}

function setupUpload() {
    const form = document.getElementById('uploadForm');
    const modal = document.getElementById('uploadModal');
    const openBtn = document.getElementById('openUpload');
    const closeBtn = document.getElementById('closeUpload');
    const fileInput = document.getElementById('uploadFile');
    const drop = document.getElementById('uploadDrop');
    const fileName = document.getElementById('uploadFileName');
    const fileList = document.getElementById('uploadFileList');
    const selectEl = document.getElementById('uploadCategorySelect');
    const newEl = document.getElementById('uploadCategoryNew');
    const newFields = document.getElementById('newCategoryFields');
    const statusModal = document.getElementById('statusModal');
    const statusOk = document.getElementById('statusOk');
    if (!form || !modal || !openBtn || !closeBtn || !fileInput || !drop || !fileName || !fileList || !statusModal || !statusOk) return;

    let selectedFiles = [];

    const syncInputFiles = () => {
        const dt = new DataTransfer();
        selectedFiles.forEach(file => dt.items.add(file));
        fileInput.files = dt.files;
    };

    const renderFileList = () => {
        fileList.innerHTML = '';
        if (!selectedFiles.length) return;
        selectedFiles.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'upload-file-item';
            item.innerHTML = `
                <span class="upload-file-name">${file.name}</span>
                <button class="upload-file-remove" type="button" aria-label="Remove ${file.name}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                        <path d="M10 11v6"></path>
                        <path d="M14 11v6"></path>
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
                    </svg>
                </button>
            `;
            const removeBtn = item.querySelector('.upload-file-remove');
            removeBtn.addEventListener('click', () => {
                selectedFiles.splice(index, 1);
                syncInputFiles();
                updateFileLabel();
                renderFileList();
            });
            fileList.appendChild(item);
        });
    };

    const openModal = () => {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        if (newFields) newFields.classList.add('is-hidden');
        if (selectEl) selectEl.value = '';
    };
    const closeModal = () => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
    };

    openBtn.addEventListener('click', () => openModal());
    closeBtn.addEventListener('click', () => closeModal());
    modal.addEventListener('click', e => {
        if (e.target === modal) closeModal();
    });
    window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
    });

    statusOk.addEventListener('click', () => {
        statusModal.classList.remove('open');
        statusModal.setAttribute('aria-hidden', 'true');
    });
    statusModal.addEventListener('click', e => {
        if (e.target === statusModal) {
            statusModal.classList.remove('open');
            statusModal.setAttribute('aria-hidden', 'true');
        }
    });

    if (selectEl && newFields) {
        selectEl.addEventListener('change', () => {
            const wantsNew = selectEl.value === '__new__';
            newFields.classList.toggle('is-hidden', !wantsNew);
            if (!wantsNew && newEl) newEl.value = '';
        });
    }

    const updateFileLabel = () => {
        fileName.textContent = selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'No files selected';
    };

    const mergeFiles = (incoming) => {
        const seen = new Set(selectedFiles.map(f => `${f.name}:${f.size}:${f.lastModified}`));
        incoming.forEach(file => {
            const key = `${file.name}:${file.size}:${file.lastModified}`;
            if (!seen.has(key)) {
                selectedFiles.push(file);
                seen.add(key);
            }
        });
        syncInputFiles();
        updateFileLabel();
        renderFileList();
    };

    fileInput.addEventListener('change', () => {
        const incoming = fileInput.files ? Array.from(fileInput.files) : [];
        mergeFiles(incoming);
    });

    drop.addEventListener('dragover', e => {
        e.preventDefault();
        drop.classList.add('dragging');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('dragging');
        if (!e.dataTransfer || !e.dataTransfer.files) return;
        mergeFiles(Array.from(e.dataTransfer.files));
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const files = selectedFiles;
        const selectedCategory = selectEl ? selectEl.value : '';
        const wantsNew = selectedCategory === '__new__';
        const newCategory = wantsNew && newEl && newEl.value ? newEl.value.trim() : '';
        const category = wantsNew ? newCategory : selectedCategory;

        if (!files.length) {
            setUploadStatus('Select a file first.', true);
            return;
        }
        if (wantsNew && !category) {
            setUploadStatus('Enter a new category name.', true);
            return;
        }

        setUploadLoading(true);
        try {
            for (const file of files) {
                await uploadAudio(file, category);
            }
            closeModal();
            setUploadLoading(false);
            setUploadStatus('Your songs are ready.');
            fileInput.value = '';
            selectedFiles = [];
            if (newEl) newEl.value = '';
            if (newFields) newFields.classList.add('is-hidden');
            updateFileLabel();
            renderFileList();
            await refreshAudioList();
        } catch (err) {
            setUploadLoading(false);
            setUploadStatus(err.error || 'Upload failed.', true);
        }
    });
}

let isPaused = false;

function handlePauseToggle() {
    void fetch('/toggle-pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    })
    .then(r => r.json())
    .then(data => {
        updatePauseUI(data.paused);
    });
}

function updatePauseUI(paused) {
    isPaused = paused;
    const btn = document.getElementById('pauseToggle');
    const icon = document.getElementById('pauseIcon');
    const label = btn.querySelector('span');

    if (isPaused) {
        btn.classList.add('paused');
        label.textContent = 'Resume';
        // Switch to Play Icon
        icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
    } else {
        btn.classList.remove('paused');
        label.textContent = 'Pause';
        // Switch back to Pause Icon
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>';
        // Reset poll time when resuming so interpolation continues correctly
        npPollTime = performance.now();
    }
}

// -------------------------------------------------------
// API helpers
// -------------------------------------------------------
function playAudio(fileName) {
    void fetch('/play-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, channelId: window.ENV.channelId })
    });
}

document.getElementById('stopButton').addEventListener('click', () => {
    void fetch('/stop-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    });
    updateNowPlaying();
});

let isRepeatEnabled = false;
function handleRepeatToggle() {
    isRepeatEnabled = !isRepeatEnabled;
    document.getElementById('repeatToggle').classList.toggle('active', isRepeatEnabled);

    void fetch('/toggle-repeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId })
    }).catch(err => console.error('toggle-repeat error:', err));
}

document.getElementById('volumeSlider').addEventListener('input', function () {
    void fetch('/set-volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: window.ENV.channelId, volume: this.value / 100 })
    }).catch(err => console.error('set-volume error:', err));
});

// -------------------------------------------------------
// Now-Playing polling, progress bar, seek
// -------------------------------------------------------

/** latest server payload - kept in module scope so the local ticker can read it */
let npState = { song: null, elapsed: 0, duration: 0, paused: false };
/** timestamp (performance.now) of the last successful poll */
let npPollTime = 0;

/**
 * Formats seconds -> "M:SS""
 */
function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Renders the progress bar and time labels from the current npState,
 * optionally interpolating elapsed forward by `dt` seconds since last poll.
 */
function renderProgress(dt) {
    const elapsed  = Math.min(npState.elapsed + (dt || 0), npState.duration);
    const duration = npState.duration;
    const pct      = duration > 0 ? (elapsed / duration) * 100 : 0;

    document.getElementById('npElapsed').textContent  = formatTime(elapsed);
    document.getElementById('npDuration').textContent = formatTime(duration);
    document.getElementById('npBarFill').style.width  = pct + '%';
    document.getElementById('npBarThumb').style.left  = pct + '%';
}

/**
 * Polls /now-playing, updates song label + button highlights,
 * shows/hides the progress row, and anchors the local interpolation ticker.
 */
function updateNowPlaying() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();

    return fetch('/now-playing?channelId=' + encodeURIComponent(window.ENV.channelId))
        .then(r => r.json())
        .then(data => {
            const songEl    = document.getElementById('nowPlayingSong');
            const barEl     = document.getElementById('nowPlayingBar');
            const progRow   = document.getElementById('npProgressRow');

            document.querySelectorAll('.track-btn').forEach(b => b.classList.remove('playing'));

            npState   = data;
            npPollTime = performance.now();
            isPaused  = data.paused || false;
            updatePauseUI(isPaused);

            if (data.song) {
                songEl.textContent = data.song;
                barEl.classList.add('has-song');
                progRow.classList.add('visible');

                document.querySelectorAll('.track-btn').forEach(b => {
                    if (b.dataset.track === data.song) b.classList.add('playing');
                });

                renderProgress(0);
            } else {
                songEl.textContent = 'Nothing playing';
                barEl.classList.remove('has-song');
                progRow.classList.remove('visible');
                npState = { song: null, elapsed: 0, duration: 0 };
            }
        })
        .catch(err => console.error('now-playing poll error:', err));
}

/**
 * Runs every 250 ms: interpolates elapsed forward from the last polled
 * snapshot so the bar moves smoothly between 1-second server polls.
 * Only updates when not paused.
 */
setInterval(() => {
    if (!npState.song || isPaused) return;
    const dt = (performance.now() - npPollTime) / 1000;
    renderProgress(dt);
}, 250);

// -------------------------------------------------------
// Seek interaction (click / drag on the progress bar)
// -------------------------------------------------------
(function setupSeek() {
    const track = document.getElementById('npBarTrack');
    let dragging = false;

    function seekFromEvent(e) {
        const rect  = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const target = ratio * npState.duration;

        // optimistic local update so the bar jumps instantly
        npState.elapsed = target;
        npPollTime      = performance.now();
        renderProgress(0);

        // tell the server
        void fetch('/seek', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId: window.ENV.channelId, offsetSecs: target })
        }).catch(err => console.error('seek error:', err));
    }

    track.addEventListener('mousedown', e => {
        if (!npState.song) return;
        dragging = true;
        track.classList.add('dragging');
        seekFromEvent(e);
    });
    window.addEventListener('mousemove', e => {
        if (!dragging) return;
        seekFromEvent(e);
    });
    window.addEventListener('mouseup', () => {
        dragging = false;
        track.classList.remove('dragging');
    });

    // touch support
    track.addEventListener('touchstart', e => {
        if (!npState.song) return;
        dragging = true;
        track.classList.add('dragging');
        seekFromEvent(e.touches[0]);
        e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', e => {
        if (!dragging) return;
        seekFromEvent(e.touches[0]);
        e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchend', () => {
        dragging = false;
        track.classList.remove('dragging');
    });
})();

function syncRepeatState() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();
    return fetch('/repeat-status?channelId=' + encodeURIComponent(window.ENV.channelId))
        .then(r => r.json())
        .then(data => {
            isRepeatEnabled = !!data.repeatEnabled;
            document.getElementById('repeatToggle').classList.toggle('active', isRepeatEnabled);
        })
        .catch(err => console.error('repeat-status error:', err));
}

function syncVolumeState() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();
    return fetch('/get-volume?channelId=' + encodeURIComponent(window.ENV.channelId))
        .then(r => r.json())
        .then(data => {
            const volumeSlider = document.getElementById('volumeSlider');
            volumeSlider.value = (data.volume || 0.5) * 100;
        })
        .catch(err => console.error('get-volume error:', err));
}

function syncPauseState() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();
    return fetch('/pause-status?channelId=' + encodeURIComponent(window.ENV.channelId))
        .then(r => r.json())
        .then(data => {
            updatePauseUI(data.paused);
        })
        .catch(err => console.error('pause-status error:', err));
}

const DEBUG_LOADER_MS = 0;

async function initApp() {
  showLoader();
  try {
    await ensureEnvConfig();
    await loadAudioButtons();
    setupSearch();
    setupUpload();
    await Promise.all([
      updateNowPlaying(),
      syncRepeatState(),
      syncVolumeState(),
      syncPauseState()
    ]);
    if (DEBUG_LOADER_MS > 0) {
      await new Promise(r => setTimeout(r, DEBUG_LOADER_MS));
    }
  } catch (err) {
    console.error('init error:', err);
  } finally {
    hideLoader();
    setInterval(updateNowPlaying, 1000);
  }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { void initApp(); });
} else {
    void initApp();
}
