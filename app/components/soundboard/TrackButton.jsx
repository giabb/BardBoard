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
import { stripExt } from './utils';

export default function TrackButton({ file, playing, onPlay, onQueue, onDelete }) {
  const display = stripExt(file.split('/').pop());
  return (
    <div className={`track-card${playing ? ' playing' : ''}`}>
      <button className={`track-btn${playing ? ' playing' : ''}`} type="button" onClick={() => void onPlay(file)} aria-label={`Play ${display}`}>
        <span className="track-label">{display}</span>
      </button>
      <div className="track-actions">
        <button className="track-queue" type="button" onClick={e => { e.stopPropagation(); void onQueue(file); }} aria-label={`Queue ${display}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
        </button>
        <button className="track-delete" type="button" onClick={e => { e.stopPropagation(); onDelete(file); }} aria-label={`Delete ${display}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
        </button>
      </div>
    </div>
  );
}

