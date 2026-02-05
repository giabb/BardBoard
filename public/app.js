import { showLoader, hideLoader } from './js/loader.js';
import { ensureEnvConfig } from './js/api.js';
import { loadAudioButtons } from './js/audioButtons.js';
import { applySearchFilter, setupSearch } from './js/search.js';
import { setupUpload } from './js/upload.js';
import { initControls, syncPauseState, syncRepeatState, syncVolumeState } from './js/controls.js';
import { updateNowPlaying, startNowPlayingTicker, setupSeek } from './js/nowPlaying.js';

const DEBUG_LOADER_MS = 0;

async function refreshAudioList() {
    await loadAudioButtons(refreshAudioList);
    const searchEl = document.getElementById('trackSearch');
    if (searchEl) applySearchFilter(searchEl.value);
}

async function initApp() {
    showLoader();
    try {
        await ensureEnvConfig();
        await loadAudioButtons(refreshAudioList);
        setupSearch();
        setupUpload(refreshAudioList);
        initControls();
        setupSeek();
        startNowPlayingTicker();
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
