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
import { formatTime } from './utils';

export default function HeaderControls({
  paused,
  repeatEnabled,
  volume,
  onVolumeChange,
  onVolumeCommit,
  onTogglePause,
  onToggleRepeat,
  onStop,
  np,
  npElapsed,
  progress,
  seeking,
  setSeeking,
  seekRef,
  seekFromClientX
}) {
  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand">
          <span className="brand-icon">&#127925;</span>
          <h1 className="brand-title">BardBoard <span className="ampersand">&amp;</span> Dragons</h1>
          <span className="brand-icon dragon">&#128009;</span>
        </div>
        <nav className="controls" aria-label="Playback controls">
          <div className="volume-group">
            <svg className="vol-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <input
              id="volumeSlider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              style={{ '--vol-pct': `${volume}%` }}
              onChange={e => onVolumeChange(Number(e.target.value))}
              onMouseUp={() => void onVolumeCommit()}
              onTouchEnd={() => void onVolumeCommit()}
              onKeyUp={() => void onVolumeCommit()}
              onBlur={() => void onVolumeCommit()}
              aria-label="Volume"
            />
          </div>
          <button id="pauseToggle" className={`ctrl-btn ctrl-pause${paused ? ' paused' : ''}`} onClick={() => void onTogglePause()} aria-label="Pause/Resume">
            <svg id="pauseIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {paused ? <polygon points="5 3 19 12 5 21 5 3"></polygon> : <><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></>}
            </svg>
            <span>{paused ? 'Resume' : 'Pause'}</span>
          </button>
          <button id="repeatToggle" className={`ctrl-btn ctrl-repeat${repeatEnabled ? ' active' : ''}`} onClick={() => void onToggleRepeat()} aria-label="Toggle repeat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 1l4 4-4 4"></path>
              <path d="M3 11V9a4 4 0 014-4h14"></path>
              <path d="M7 23l-4-4 4-4"></path>
              <path d="M21 13v2a4 4 0 01-4 4H3"></path>
            </svg>
            <span>Repeat</span>
          </button>
          <button id="stopButton" className="ctrl-btn ctrl-stop" onClick={() => void onStop()} aria-label="Stop">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"></rect>
            </svg>
            <span>Stop</span>
          </button>
        </nav>
      </div>
      <div id="nowPlayingBar" className={`now-playing-strip${np.song ? ' has-song' : ''}`}>
        <span className="np-pulse" />
        <span className="np-label">Now Playing</span>
        <span className="np-divider">&gt;</span>
        <span id="nowPlayingSong" className="np-song">{np.song || 'Nothing playing'}</span>
        <div className={`np-progress-row${np.song ? ' visible' : ''}`} id="npProgressRow">
          <span className="np-time" id="npElapsed">{formatTime(npElapsed)}</span>
          <div
            className={`np-bar-track${seeking ? ' dragging' : ''}`}
            id="npBarTrack"
            ref={seekRef}
            onMouseDown={e => { if (!np.song) return; setSeeking(true); void seekFromClientX(e.clientX); }}
            onTouchStart={e => { if (!np.song || !e.touches?.[0]) return; setSeeking(true); void seekFromClientX(e.touches[0].clientX); e.preventDefault(); }}
          >
            <div className="np-bar-fill" id="npBarFill" style={{ width: `${progress}%` }} />
            <div className="np-bar-thumb" id="npBarThumb" style={{ left: `${progress}%` }} />
          </div>
          <span className="np-time" id="npDuration">{formatTime(np.duration)}</span>
        </div>
      </div>
    </header>
  );
}

