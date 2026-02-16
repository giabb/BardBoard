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
export default function SearchBar({ search, onSearchChange, onOpenUpload, onOpenCategory }) {
  return (
    <div className="search-bar">
      <div className="search-field">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input id="trackSearch" type="search" placeholder="Search tracks or categories..." value={search} onChange={e => onSearchChange(e.target.value)} />
      </div>
      <button id="openCategory" className="ctrl-btn ctrl-upload" onClick={onOpenCategory}>Add Category</button>
      <button id="openUpload" className="ctrl-btn ctrl-upload" onClick={onOpenUpload}>Add Song</button>
    </div>
  );
}

