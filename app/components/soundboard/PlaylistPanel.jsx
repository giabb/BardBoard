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
import TrashIcon from '../icons/TrashIcon';

export default function PlaylistPanel({
  npSong,
  playlist,
  onPlaylistCmd,
  onSetPlaylistOrder,
  onTrackDropToPlaylist,
  playlistDropActive,
  onPlaylistDragOver,
  onPlaylistDragLeave
}) {
  return (
    <aside
      className={`playlist-panel${playlistDropActive ? ' drop-target' : ''}`}
      onDragOver={onPlaylistDragOver}
      onDragLeave={onPlaylistDragLeave}
      onDrop={onTrackDropToPlaylist}
    >
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
              <TrashIcon />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

