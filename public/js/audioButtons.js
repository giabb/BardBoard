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
import { fetchAudioFiles, deleteAudioFile, deleteCategory, playAudio } from './api.js';

export async function loadAudioButtons(onRefresh = () => {}) {
    const data = await fetchAudioFiles();
    const container = document.getElementById('audioButtons');
    container.innerHTML = '';

    const categoryPalette = [
        '#8b5cf6',
        '#d4a843',
        '#e05d8a',
        '#5aa8d6',
        '#6fbf9a',
        '#ef4444',
        '#f59e0b',
        '#a855f7',
        '#ec4899',
        '#14b8a6',
        '#10b981',
        '#f97316',
        '#06b6d4',
        '#eab308',
        '#84cc16'
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

    const createGrid = (files, animationOffset = 0) => {
        const grid = document.createElement('div');
        grid.className = 'track-grid';

        files.forEach((file, i) => {
            const displayName = file.split('/').pop().replace(/\.[^/.]+$/, '');

            const btn = document.createElement('button');
            btn.className = 'track-btn';
            btn.style.animationDelay = `${(i + animationOffset) * 0.03}s`;
            const searchKey = file.replace(/\.[^/.]+$/, '').replace(/[\\/]/g, ' ').toLowerCase();
            btn.setAttribute('data-track', file.replace(/\.[^/.]+$/, ''));
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
                playAudio(file);
                btn.classList.add('pressed');
                setTimeout(() => btn.classList.remove('pressed'), 200);
            });

            const delBtn = btn.querySelector('.track-delete');
            delBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (!confirm(`Delete "${displayName}"?`)) return;
                void deleteAudioFile(file).then(() => onRefresh());
            });

            grid.appendChild(btn);
        });
        return grid;
    };

    let globalCount = 0;

    if (data.root && data.root.length > 0) {
        const rootGrid = createGrid(data.root, globalCount);
        rootGrid.classList.add('cat-colored');
        rootGrid.style.setProperty('--cat-color', getCategoryColor('__root__'));
        container.appendChild(rootGrid);
        globalCount += data.root.length;
    }

    if (data.categories) {
        const categorySelect = document.getElementById('uploadCategorySelect');
        if (categorySelect) {
            categorySelect.querySelectorAll('option[data-category]').forEach(opt => opt.remove());
        }

        Object.keys(data.categories).forEach(folderName => {
            const files = data.categories[folderName];
            if (categorySelect) {
                const opt = document.createElement('option');
                opt.value = folderName;
                opt.textContent = folderName;
                opt.setAttribute('data-category', '1');
                categorySelect.appendChild(opt);
            }

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

            const wrapper = document.createElement('div');
            wrapper.className = 'category-wrapper cat-colored';
            wrapper.style.setProperty('--cat-color', catColor);

            const inner = document.createElement('div');
            inner.className = 'category-inner';
            inner.appendChild(createGrid(files, globalCount));
            wrapper.appendChild(inner);

            header.addEventListener('click', () => {
                header.classList.toggle('collapsed');
                wrapper.classList.toggle('collapsed');
            });

            const catDeleteBtn = header.querySelector('.cat-delete');
            catDeleteBtn.addEventListener('click', e => {
                e.stopPropagation();
                if (!confirm(`Delete category "${folderName}" and all its tracks?`)) return;
                void deleteCategory(folderName).then(() => onRefresh());
            });

            container.appendChild(header);
            container.appendChild(wrapper);

            globalCount += files.length;
        });
    }
}
