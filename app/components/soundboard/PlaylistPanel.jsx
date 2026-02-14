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

export default function PlaylistPanel({ npSong, playlist, onPlaylistCmd, onSetPlaylistOrder }) {
  return (
    <aside className="playlist-panel">
      <div className="playlist-head">
        <div>
          <h2 className="playlist-heading">Playlist</h2>
          <p className="playlist-sub">Up next for this guild.</p>
        </div>
        <div className="playlist-actions">
          <button id="playlistPlay" className={`ctrl-btn ctrl-playlist${npSong || !playlist.length ? ' is-hidden' : ''}`} onClick={() => void onPlaylistCmd('/playlist/play')} disabled={!playlist.length}>Play Queue</button>
          <button id="playlistSkip" className="ctrl-btn ctrl-playlist" onClick={() => void onPlaylistCmd('/playlist/skip')} disabled={!playlist.length}>Skip</button>
          <button id="playlistShuffle" className="ctrl-btn ctrl-playlist" onClick={() => void onPlaylistCmd('/playlist/shuffle')} disabled={!playlist.length}>Shuffle</button>
          <button id="playlistClear" className="ctrl-btn ctrl-playlist" onClick={() => void onPlaylistCmd('/playlist/clear')} disabled={!playlist.length}>Clear</button>
        </div>
      </div>
      <div id="playlistEmpty" className={`playlist-empty${playlist.length ? ' is-hidden' : ''}`}>No tracks queued yet.</div>
      <ul id="playlistList" className="playlist-list">
        {playlist.map((file, idx) => (
          <li
            key={`${file}-${idx}`}
            className="playlist-item"
            draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', String(idx))}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              const from = Number(e.dataTransfer.getData('text/plain'));
              if (!Number.isNaN(from) && from !== idx) {
                const next = [...playlist];
                const [it] = next.splice(from, 1);
                next.splice(idx, 0, it);
                void onSetPlaylistOrder(next);
              }
            }}
          >
            <span className="playlist-handle">::</span>
            <span className="playlist-track">{stripExt(file).replace(/[\\/]/g, ' / ')}</span>
            <button className="playlist-remove" type="button" onClick={() => { const next = playlist.filter((_, i) => i !== idx); void onSetPlaylistOrder(next); }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

