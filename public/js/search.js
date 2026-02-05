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
export function applySearchFilter(query) {
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

export function setupSearch() {
    const input = document.getElementById('trackSearch');
    if (!input) return;
    const handler = () => applySearchFilter(input.value);
    input.addEventListener('input', handler);
    input.addEventListener('search', handler);
    applySearchFilter(input.value);
}
