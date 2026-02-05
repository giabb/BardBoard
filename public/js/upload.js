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
import { uploadAudio } from './api.js';

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

export function setupUpload(onRefresh = () => Promise.resolve()) {
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

    const updateFileLabel = () => {
        fileName.textContent = selectedFiles.length ? `${selectedFiles.length} file(s) selected` : 'No files selected';
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
                const response = await uploadAudio(file, category);
                if (!response.ok) {
                    const err = await response.json();
                    throw err;
                }
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
            await onRefresh();
        } catch (err) {
            setUploadLoading(false);
            setUploadStatus(err.error || 'Upload failed.', true);
        }
    });
}
