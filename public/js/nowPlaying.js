import { getNowPlaying, seekTo } from './api.js';
import { playbackState } from './state.js';
import { updatePauseUI } from './controls.js';

function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderProgress(dt) {
    const elapsed = Math.min(playbackState.npState.elapsed + (dt || 0), playbackState.npState.duration);
    const duration = playbackState.npState.duration;
    const pct = duration > 0 ? (elapsed / duration) * 100 : 0;

    document.getElementById('npElapsed').textContent = formatTime(elapsed);
    document.getElementById('npDuration').textContent = formatTime(duration);
    document.getElementById('npBarFill').style.width = pct + '%';
    document.getElementById('npBarThumb').style.left = pct + '%';
}

export function updateNowPlaying() {
    if (!window.ENV || !window.ENV.channelId) return Promise.resolve();

    return getNowPlaying()
        .then(r => r.json())
        .then(data => {
            const songEl = document.getElementById('nowPlayingSong');
            const barEl = document.getElementById('nowPlayingBar');
            const progRow = document.getElementById('npProgressRow');

            document.querySelectorAll('.track-btn').forEach(b => b.classList.remove('playing'));

            playbackState.npState = data;
            playbackState.npPollTime = performance.now();
            playbackState.isPaused = data.paused || false;
            updatePauseUI(playbackState.isPaused);

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
                playbackState.npState = { song: null, elapsed: 0, duration: 0 };
            }
        })
        .catch(err => console.error('now-playing poll error:', err));
}

export function startNowPlayingTicker() {
    setInterval(() => {
        if (!playbackState.npState.song || playbackState.isPaused) return;
        const dt = (performance.now() - playbackState.npPollTime) / 1000;
        renderProgress(dt);
    }, 250);
}

export function setupSeek() {
    const track = document.getElementById('npBarTrack');
    let dragging = false;

    function seekFromEvent(e) {
        const rect = track.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const target = ratio * playbackState.npState.duration;

        playbackState.npState.elapsed = target;
        playbackState.npPollTime = performance.now();
        renderProgress(0);

        void seekTo(target).catch(err => console.error('seek error:', err));
    }

    track.addEventListener('mousedown', e => {
        if (!playbackState.npState.song) return;
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

    track.addEventListener('touchstart', e => {
        if (!playbackState.npState.song) return;
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
}
