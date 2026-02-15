'use client';

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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import HeaderControls from './soundboard/HeaderControls';
import SearchBar from './soundboard/SearchBar';
import PlaylistPanel from './soundboard/PlaylistPanel';
import TrackButton from './soundboard/TrackButton';
import TrashIcon from './icons/TrashIcon';
import { stripExt } from './soundboard/utils';

const COLORS = ['#8b5cf6', '#d4a843', '#e05d8a', '#5aa8d6', '#6fbf9a', '#ef4444', '#f59e0b'];
const TRACK_DRAG_MIME = 'application/x-bardboard-track';
const ROOT_DROP_TARGET = '__root__';

function getTrackCategory(filePath) {
  const normalized = (filePath || '').toString().replace(/\\/g, '/');
  const slash = normalized.indexOf('/');
  if (slash <= 0) return '';
  return normalized.slice(0, slash);
}

async function parseJson(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export default function SoundboardClient() {
  const [ready, setReady] = useState(false);
  const [env, setEnv] = useState(null);
  const [audio, setAudio] = useState({ root: [], categories: {} });
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState({});
  const [volume, setVolume] = useState(50);
  const [repeatEnabled, setRepeatEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [np, setNp] = useState({ song: null, elapsed: 0, duration: 0, paused: false });
  const [npElapsed, setNpElapsed] = useState(0);
  const [seeking, setSeeking] = useState(false);
  const [playlist, setPlaylist] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('');
  const [uploadCategoryNew, setUploadCategoryNew] = useState('');
  const [uploadCategoryOpen, setUploadCategoryOpen] = useState(false);
  const [uploadCategoryActive, setUploadCategoryActive] = useState('');
  const [uploadCategoryMenuUp, setUploadCategoryMenuUp] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [status, setStatus] = useState({ open: false, title: 'Upload complete', message: 'Your songs are ready.' });
  const [confirm, setConfirm] = useState({ open: false, title: 'Confirm delete', text: '', action: null });
  const [authEnabled, setAuthEnabled] = useState(false);
  const [draggedTrack, setDraggedTrack] = useState('');
  const [categoryDropTarget, setCategoryDropTarget] = useState('');
  const [playlistDropActive, setPlaylistDropActive] = useState(false);

  const npRef = useRef(np);
  const npPollRef = useRef(0);
  const seekRef = useRef(null);
  const uploadCategoryPickerRef = useRef(null);
  const lastSentVolumeRef = useRef(50);
  const lastNonZeroVolumeRef = useRef(50);
  const channelId = selectedChannelId || env?.channelId || '';
  const uploadMaxMb = Number(env?.uploadMaxMb) > 0 ? Number(env.uploadMaxMb) : 50;

  const fetchApi = useCallback(async (url, options = {}) => {
    const res = await fetch(url, options);
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }
    return res;
  }, []);

  const refreshVoiceChannels = useCallback(async () => {
    const res = await fetchApi('/api/voice-channels');
    if (!res.ok) return [];
    const data = await parseJson(res);
    const list = Array.isArray(data.channels) ? data.channels : [];
    setChannels(list);
    return list;
  }, [fetchApi]);

  const refreshFiles = useCallback(async () => {
    const res = await fetchApi('/api/audio-files');
    const data = await parseJson(res);
    setAudio({ root: Array.isArray(data.root) ? data.root : [], categories: data.categories || {} });
  }, [fetchApi]);

  const refreshPlaylist = useCallback(async () => {
    if (!channelId) return;
    const res = await fetchApi('/api/playlist?channelId=' + encodeURIComponent(channelId));
    if (res.status === 404) {
      setPlaylist([]);
      return;
    }
    if (!res.ok) return;
    const data = await parseJson(res);
    setPlaylist(Array.isArray(data.queue) ? data.queue : []);
  }, [channelId, fetchApi]);

  const updateNowPlaying = useCallback(async () => {
    if (!channelId) return;
    const res = await fetchApi('/api/now-playing?channelId=' + encodeURIComponent(channelId));
    if (!res.ok) return;
    const data = await parseJson(res);
    const next = { song: data.song || null, elapsed: Number(data.elapsed) || 0, duration: Number(data.duration) || 0, paused: Boolean(data.paused) };
    const prevSong = npRef.current.song;
    npRef.current = next;
    npPollRef.current = performance.now();
    setNp(next);
    setPaused(next.paused);
    setNpElapsed(next.elapsed);
    if (prevSong !== next.song) void refreshPlaylist();
  }, [channelId, fetchApi, refreshPlaylist]);

  useEffect(() => { npRef.current = np; }, [np]);

  useEffect(() => {
    let active = true;
    document.body.classList.remove('ready');
    (async () => {
      const [envRes, authRes, channelsList] = await Promise.all([
        fetchApi('/api/env-config'),
        fetchApi('/api/auth/status'),
        refreshVoiceChannels()
      ]);
      const envData = await parseJson(envRes);
      const authData = await parseJson(authRes);
      if (active) {
        setEnv(envData);
        setAuthEnabled(Boolean(authData.authEnabled));
        const preferred = window.localStorage.getItem('bardboard.channelId') || '';
        const hasPreferred = channelsList.some(ch => ch.channelId === preferred);
        const hasEnvDefault = channelsList.some(ch => ch.channelId === envData.channelId);
        const fallback = hasEnvDefault ? envData.channelId : (channelsList[0]?.channelId || envData.channelId || '');
        setSelectedChannelId(hasPreferred ? preferred : fallback);
      }
    })().catch(console.error);
    return () => { active = false; document.body.classList.remove('ready'); };
  }, [fetchApi, refreshVoiceChannels]);

  useEffect(() => {
    if (!selectedChannelId) return;
    window.localStorage.setItem('bardboard.channelId', selectedChannelId);
  }, [selectedChannelId]);

  useEffect(() => {
    setUploadCategoryActive(uploadCategory || '');
  }, [uploadCategory]);

  useEffect(() => {
    const onMouseDown = event => {
      if (!uploadCategoryPickerRef.current) return;
      if (!uploadCategoryPickerRef.current.contains(event.target)) {
        setUploadCategoryOpen(false);
        setUploadCategoryMenuUp(false);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!uploadCategoryOpen) {
      setUploadCategoryMenuUp(false);
      return;
    }

    const updatePlacement = () => {
      const picker = uploadCategoryPickerRef.current;
      const trigger = picker?.querySelector('.field-select-trigger');
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const optionCount = Math.max(1, uploadCategoryOptions.length);
      const estimatedMenuHeight = Math.min(220, (optionCount * 38) + 12) + 6;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      setUploadCategoryMenuUp(spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [uploadCategoryOpen]);

  useEffect(() => {
    if (!channelId) return;
    (async () => {
      try {
        await refreshFiles();
        await refreshPlaylist();
        const [repeatRes, volumeRes, pauseRes] = await Promise.all([
          fetchApi('/api/repeat-status?channelId=' + encodeURIComponent(channelId)),
          fetchApi('/api/get-volume?channelId=' + encodeURIComponent(channelId)),
          fetchApi('/api/pause-status?channelId=' + encodeURIComponent(channelId))
        ]);
        setRepeatEnabled(Boolean((await parseJson(repeatRes)).repeatEnabled));
        const volumePct = Math.round(((await parseJson(volumeRes)).volume || 0.5) * 100);
        setVolume(volumePct);
        lastSentVolumeRef.current = volumePct;
        if (volumePct > 0) lastNonZeroVolumeRef.current = volumePct;
        setPaused(Boolean((await parseJson(pauseRes)).paused));
        await updateNowPlaying();
      } finally {
        setReady(true);
        document.body.classList.add('ready');
      }
    })().catch(console.error);
  }, [channelId, fetchApi, refreshFiles, refreshPlaylist, updateNowPlaying]);

  useEffect(() => {
    if (!channelId) return;
    const poll = window.setInterval(() => void updateNowPlaying(), 1000);
    const tick = window.setInterval(() => {
      const cur = npRef.current;
      if (!cur.song || cur.paused) return;
      setNpElapsed(Math.min(cur.elapsed + ((performance.now() - npPollRef.current) / 1000), cur.duration || 0));
    }, 250);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [channelId, updateNowPlaying]);

  const q = search.trim().toLowerCase();
  const rootFiles = useMemo(() => audio.root.filter(f => !q || stripExt(f).toLowerCase().includes(q)), [audio.root, q]);
  const categories = useMemo(() => Object.keys(audio.categories || {}), [audio.categories]);
  const filteredCategories = useMemo(() => {
    const out = {};
    for (const name of categories) {
      const files = audio.categories[name] || [];
      const matched = files.filter(f => !q || stripExt(f).toLowerCase().includes(q));
      if (matched.length) out[name] = matched;
    }
    return out;
  }, [audio.categories, categories, q]);
  const uploadCategoryOptions = useMemo(() => ([
    { value: '', label: 'Root (no category)' },
    { value: '__new__', label: 'New category...' },
    ...categories.map(c => ({ value: c, label: c }))
  ]), [categories]);

  const nowTrack = np.song ? stripExt(np.song) : '';
  const progress = np.duration > 0 ? (npElapsed / np.duration) * 100 : 0;

  const post = useCallback(async (url, body) => fetchApi(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), [fetchApi]);
  const requireChannel = useCallback(() => {
    if (channelId) return true;
    setStatus({ open: true, title: 'No channel selected', message: 'Select a voice channel first.' });
    return false;
  }, [channelId]);
  const uploadFileWithProgress = useCallback((file, category, onProgress) => new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('file', file);
    const query = category ? `?category=${encodeURIComponent(category)}` : '';
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload-audio' + query, true);
    xhr.withCredentials = true;

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      onProgress(event.loaded);
    };

    xhr.onload = () => {
      if (xhr.status === 401) {
        window.location.href = '/login';
        reject(new Error('Unauthorized'));
        return;
      }
      let data = {};
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new Error(data.error || 'Upload failed'));
      }
    };

    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(fd);
  }), []);

  const playTrack = async file => {
    if (!requireChannel()) return;
    await post('/api/play-audio', { fileName: file, channelId });
    await updateNowPlaying();
  };
  const queueTrack = async file => {
    if (!requireChannel()) return;
    const res = await post('/api/playlist/add', { fileName: file, channelId });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Queue operation failed');
    if (Array.isArray(data.queue)) setPlaylist(data.queue);
  };
  const setVolumeLocal = v => {
    setVolume(v);
    if (v > 0) lastNonZeroVolumeRef.current = v;
  };
  const commitVolume = useCallback(async () => {
    if (!channelId) return;
    const v = volume;
    if (v === lastSentVolumeRef.current) return;
    lastSentVolumeRef.current = v;
    await post('/api/set-volume', { channelId, volume: v / 100 });
  }, [channelId, post, volume]);
  const togglePause = async () => {
    if (!requireChannel()) return;
    const res = await post('/api/toggle-pause', { channelId });
    const data = await parseJson(res);
    setPaused(Boolean(data.paused));
  };
  const toggleRepeat = async () => { if (!requireChannel()) return; setRepeatEnabled(v => !v); await post('/api/toggle-repeat', { channelId }); };
  const stopAudio = async () => { if (!requireChannel()) return; await post('/api/stop-audio', { channelId }); await updateNowPlaying(); };
  const toggleMute = async () => {
    if (!requireChannel()) return;
    if (volume === 0) {
      const restored = Math.max(1, Math.min(100, lastNonZeroVolumeRef.current || 50));
      setVolume(restored);
      lastSentVolumeRef.current = restored;
      await post('/api/set-volume', { channelId, volume: restored / 100 });
      return;
    }
    if (volume > 0) lastNonZeroVolumeRef.current = volume;
    setVolume(0);
    lastSentVolumeRef.current = 0;
    await post('/api/set-volume', { channelId, volume: 0 });
  };
  const playlistCmd = async path => {
    if (!requireChannel()) return;
    try {
      const apiPath = path.startsWith('/api/') ? path : `/api${path}`;
      const res = await post(apiPath, { channelId });
      const data = await parseJson(res);
      if (!res.ok) throw new Error(data.error || 'Playlist operation failed');
      if (Array.isArray(data.queue)) setPlaylist(data.queue);
      await Promise.all([refreshPlaylist(), updateNowPlaying()]);
    } catch (err) {
      setStatus({ open: true, title: 'Error', message: err?.message || 'Playlist operation failed.' });
    }
  };
  const setPlaylistOrder = async next => {
    if (!requireChannel()) return;
    setPlaylist(next);
    await post('/api/playlist/set', { channelId, queue: next });
  };
  const onTrackDragStart = file => {
    setDraggedTrack(file);
    setPlaylistDropActive(false);
  };
  const onTrackDragEnd = () => {
    setDraggedTrack('');
    setCategoryDropTarget('');
    setPlaylistDropActive(false);
  };

  const handleChannelChange = async nextChannelId => {
    setSelectedChannelId(nextChannelId);
    if (!nextChannelId) return;
    try {
      const res = await post('/api/switch-channel', { channelId: nextChannelId });
      if (!res.ok && res.status !== 404) {
        const data = await parseJson(res);
        throw new Error(data.error || 'Failed to switch channel');
      }
      await Promise.all([refreshPlaylist(), updateNowPlaying()]);
    } catch (err) {
      setStatus({ open: true, title: 'Error', message: err?.message || 'Failed to switch channel.' });
    }
  };

  const onUploadCategoryKeyDown = event => {
    if (!uploadCategoryOptions.length) return;
    const activeIdx = uploadCategoryOptions.findIndex(opt => opt.value === uploadCategoryActive);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = activeIdx < 0 ? 0 : Math.min(uploadCategoryOptions.length - 1, activeIdx + 1);
      setUploadCategoryActive(uploadCategoryOptions[next].value);
      setUploadCategoryOpen(true);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const next = activeIdx < 0 ? uploadCategoryOptions.length - 1 : Math.max(0, activeIdx - 1);
      setUploadCategoryActive(uploadCategoryOptions[next].value);
      setUploadCategoryOpen(true);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (uploadCategoryOpen) {
        setUploadCategory(uploadCategoryActive);
        setUploadCategoryOpen(false);
      } else {
        setUploadCategoryOpen(true);
      }
    }
    if (event.key === 'Escape') {
      setUploadCategoryOpen(false);
    }
  };

  const moveTrackToCategory = useCallback(async (file, targetCategory) => {
    const sourceCategory = getTrackCategory(file);
    if (!file || sourceCategory === targetCategory) return;

    const res = await post('/api/audio-file/move', { path: file, targetCategory });
    const data = await parseJson(res);
    if (!res.ok) throw new Error(data.error || 'Move failed');
    await refreshFiles();
  }, [post, refreshFiles]);

  const handleCategoryDragOver = (event, targetCategory, dropTargetKey = targetCategory) => {
    if (!event.dataTransfer?.types?.includes(TRACK_DRAG_MIME)) return;
    if (!draggedTrack || getTrackCategory(draggedTrack) === targetCategory) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setCategoryDropTarget(dropTargetKey);
  };

  const handleCategoryDrop = async (event, targetCategory) => {
    if (!event.dataTransfer?.types?.includes(TRACK_DRAG_MIME)) return;
    event.preventDefault();
    const trackFromDrop = event.dataTransfer.getData(TRACK_DRAG_MIME) || draggedTrack;
    setCategoryDropTarget('');
    setPlaylistDropActive(false);
    try {
      await moveTrackToCategory(trackFromDrop, targetCategory);
    } catch (err) {
      setStatus({ open: true, title: 'Error', message: err?.message || 'Move failed.' });
    } finally {
      setDraggedTrack('');
    }
  };

  const handlePlaylistDragOver = event => {
    if (!event.dataTransfer?.types?.includes(TRACK_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setPlaylistDropActive(true);
  };

  const handlePlaylistDragLeave = event => {
    const nextTarget = event.relatedTarget;
    if (event.currentTarget.contains(nextTarget)) return;
    setPlaylistDropActive(false);
  };

  const handlePlaylistDrop = async event => {
    if (!event.dataTransfer?.types?.includes(TRACK_DRAG_MIME)) return;
    event.preventDefault();
    const trackFromDrop = event.dataTransfer.getData(TRACK_DRAG_MIME) || draggedTrack;
    setPlaylistDropActive(false);
    setCategoryDropTarget('');
    setDraggedTrack('');
    if (!trackFromDrop) return;
    try {
      await queueTrack(trackFromDrop);
    } catch (err) {
      setStatus({ open: true, title: 'Error', message: err?.message || 'Queue operation failed.' });
    }
  };

  const seekFromClientX = useCallback(async clientX => {
    if (!channelId || !npRef.current.song || !seekRef.current) return;
    const rect = seekRef.current.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const target = ratio * (npRef.current.duration || 0);
    setNpElapsed(target);
    npRef.current = { ...npRef.current, elapsed: target };
    npPollRef.current = performance.now();
    await post('/api/seek', { channelId, offsetSecs: target });
  }, [channelId, post, requireChannel]);

  useEffect(() => {
    if (!seeking) return;
    const onMouseMove = event => { void seekFromClientX(event.clientX); };
    const onMouseUp = () => setSeeking(false);
    const onTouchMove = event => {
      if (event.touches?.[0]) void seekFromClientX(event.touches[0].clientX);
      event.preventDefault();
    };
    const onTouchEnd = () => setSeeking(false);

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [seeking, seekFromClientX]);

  const confirmDeleteFile = file => setConfirm({
    open: true,
    title: 'Confirm delete',
    text: `Delete "${stripExt(file.split('/').pop())}"?`,
    action: async () => {
      const res = await fetchApi('/api/audio-file?path=' + encodeURIComponent(file), { method: 'DELETE' });
      if (!res.ok) {
        const data = await parseJson(res);
        throw new Error(data.error || 'Delete failed');
      }
      await refreshFiles();
    }
  });

  const confirmDeleteCategory = name => setConfirm({
    open: true,
    title: 'Confirm delete',
    text: `Delete category "${name}" and all its tracks?`,
    action: async () => {
      const res = await fetchApi('/api/audio-category?name=' + encodeURIComponent(name), { method: 'DELETE' });
      if (!res.ok) {
        const data = await parseJson(res);
        throw new Error(data.error || 'Delete failed');
      }
      await refreshFiles();
    }
  });

  const submitUpload = async e => {
    e.preventDefault();
    const category = uploadCategory === '__new__' ? uploadCategoryNew.trim() : uploadCategory;
    if (!uploadFiles.length) return setStatus({ open: true, title: 'Upload failed', message: 'Select a file first.' });
    if (uploadCategory === '__new__' && !category) return setStatus({ open: true, title: 'Upload failed', message: 'Enter a new category name.' });
    const uploadMaxBytes = uploadMaxMb * 1024 * 1024;
    const oversized = uploadFiles.find(file => Number(file.size || 0) > uploadMaxBytes);
    if (oversized) {
      return setStatus({
        open: true,
        title: 'Upload failed',
        message: `Upload exceeds ${uploadMaxMb}MB, so it cannot be performed. "${oversized.name}" is too large.`
      });
    }

    setUploadLoading(true);
    setUploadProgress(0);
    try {
      const totalBytes = uploadFiles.reduce((sum, file) => sum + Number(file.size || 0), 0);
      let uploadedBytes = 0;
      for (const file of uploadFiles) {
        const fileSize = Number(file.size || 0);
        await uploadFileWithProgress(file, category, loaded => {
          const absoluteLoaded = uploadedBytes + Math.min(fileSize, loaded);
          if (totalBytes > 0) {
            const pct = Math.round((absoluteLoaded / totalBytes) * 100);
            setUploadProgress(Math.max(0, Math.min(99, pct)));
          }
        });
        uploadedBytes += fileSize;
        if (totalBytes > 0) {
          const pct = Math.round((uploadedBytes / totalBytes) * 100);
          setUploadProgress(Math.max(0, Math.min(99, pct)));
        }
      }
      setUploadProgress(100);
      setUploadOpen(false);
      setUploadFiles([]);
      setUploadCategory('');
      setUploadCategoryNew('');
      await refreshFiles();
      setStatus({ open: true, title: 'Upload complete', message: 'Your songs are ready.' });
    } catch (err) {
      setStatus({ open: true, title: 'Upload failed', message: err?.message || 'Upload failed.' });
    } finally {
      setUploadLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <>
      <div id="appLoader" className={`app-loader${ready ? ' loaded' : ''}`}><div className="loader-content"><Image className="loader-ouroboros" src="/ouroboros.svg" alt="Loading" width={96} height={96} priority /><p id="loaderMessage">Preparing the Tavern...</p></div></div>
      <div className="ambient-bg" aria-hidden="true"><div className="particle" /><div className="particle" /><div className="particle" /><div className="particle" /><div className="particle" /><div className="particle" /><div className="particle" /><div className="particle" /></div>

      <HeaderControls
        paused={paused}
        repeatEnabled={repeatEnabled}
        volume={volume}
        channelId={channelId}
        channels={channels}
        onChannelChange={handleChannelChange}
        onVolumeChange={setVolumeLocal}
        onVolumeCommit={commitVolume}
        onToggleMute={toggleMute}
        onTogglePause={togglePause}
        onToggleRepeat={toggleRepeat}
        onStop={stopAudio}
        np={np}
        npElapsed={npElapsed}
        progress={progress}
        seeking={seeking}
        setSeeking={setSeeking}
        seekRef={seekRef}
        seekFromClientX={seekFromClientX}
      />

      <main className="soundboard">
        <SearchBar search={search} onSearchChange={setSearch} onOpenUpload={() => setUploadOpen(true)} />

        <div className="soundboard-layout">
          <section className="soundboard-main"><div id="audioButtons">
            <div
              className={`category-wrapper cat-colored${categoryDropTarget === ROOT_DROP_TARGET ? ' drop-target' : ''}`}
              style={{ '--cat-color': COLORS[0] }}
              onDragOver={e => handleCategoryDragOver(e, '', ROOT_DROP_TARGET)}
              onDrop={e => void handleCategoryDrop(e, '')}
              onDragLeave={e => {
                const nextTarget = e.relatedTarget;
                if (!e.currentTarget.contains(nextTarget) && categoryDropTarget === ROOT_DROP_TARGET) setCategoryDropTarget('');
              }}
            >
              <div className="category-inner">
                {rootFiles.length > 0 ? (
                  <div className="track-grid">
                    {rootFiles.map(file => <TrackButton key={file} file={file} playing={stripExt(file) === nowTrack} onPlay={playTrack} onQueue={queueTrack} onDelete={confirmDeleteFile} onDragStart={onTrackDragStart} onDragEnd={onTrackDragEnd} />)}
                  </div>
                ) : (
                  <div className="playlist-empty">Drop here to move tracks to Root (no category).</div>
                )}
              </div>
            </div>
            {Object.entries(filteredCategories).map(([name, files], i) => {
              const isCollapsed = !q && collapsed[name];
              const isCategoryDropTarget = categoryDropTarget === name;
              return <div key={name}><h2 className={`category-header${isCollapsed ? ' collapsed' : ''}`} style={{ '--cat-color': COLORS[(i + 1) % COLORS.length] }} onClick={() => setCollapsed(prev => ({ ...prev, [name]: !prev[name] }))} onDragOver={e => handleCategoryDragOver(e, name, name)} onDrop={e => void handleCategoryDrop(e, name)} onDragLeave={e => { const nextTarget = e.relatedTarget; if (!e.currentTarget.contains(nextTarget) && categoryDropTarget === name) setCategoryDropTarget(''); }}><span>{name}</span><button className="cat-delete" type="button" onClick={e => { e.stopPropagation(); confirmDeleteCategory(name); }}><TrashIcon /></button><svg className="cat-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg></h2><div className={`category-wrapper cat-colored${isCollapsed ? ' collapsed' : ''}${isCategoryDropTarget ? ' drop-target' : ''}`} style={{ '--cat-color': COLORS[(i + 1) % COLORS.length] }} onDragOver={e => handleCategoryDragOver(e, name, name)} onDrop={e => void handleCategoryDrop(e, name)} onDragLeave={e => { const nextTarget = e.relatedTarget; if (!e.currentTarget.contains(nextTarget) && categoryDropTarget === name) setCategoryDropTarget(''); }}><div className="category-inner"><div className="track-grid">{files.map(file => <TrackButton key={file} file={file} playing={stripExt(file) === nowTrack} onPlay={playTrack} onQueue={queueTrack} onDelete={confirmDeleteFile} onDragStart={onTrackDragStart} onDragEnd={onTrackDragEnd} />)}</div></div></div></div>;
            })}
          </div></section>

          <PlaylistPanel npSong={np.song} playlist={playlist} onPlaylistCmd={playlistCmd} onSetPlaylistOrder={setPlaylistOrder} onTrackDropToPlaylist={e => void handlePlaylistDrop(e)} playlistDropActive={playlistDropActive} onPlaylistDragOver={handlePlaylistDragOver} onPlaylistDragLeave={handlePlaylistDragLeave} />
        </div>
      </main>

      <div id="uploadModal" className={`upload-modal${uploadOpen ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setUploadOpen(false); }}><div className="upload-panel"><div className="upload-head"><h2 id="uploadTitle">Add Songs</h2><button id="closeUpload" className="upload-close" type="button" onClick={() => setUploadOpen(false)}>&times;</button></div><div id="uploadLoading" className={`upload-loading${uploadLoading ? ' show' : ''}`}><Image className="upload-ouroboros" src="/ouroboros.svg" alt="Uploading" width={90} height={90} /><p>Uploading... {uploadProgress}%</p><div className="upload-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={uploadProgress}><div className="upload-progress-fill" style={{ width: `${uploadProgress}%` }} /></div></div><form id="uploadForm" className="upload-form" onSubmit={e => void submitUpload(e)}><input id="uploadFile" type="file" accept=".mp3,.wav,.ogg,.m4a" multiple hidden onChange={e => setUploadFiles(prev => [...prev, ...Array.from(e.target.files || [])])} /><label id="uploadDrop" className="upload-drop" htmlFor="uploadFile"><span className="drop-title">Drag your song(s) here</span><span className="drop-sub">or <span className="drop-link">browse</span> your files</span><span id="uploadFileName" className="drop-file">{uploadFiles.length ? `${uploadFiles.length} file(s) selected` : 'No files selected'}</span></label><div id="uploadFileList" className="upload-file-list">{uploadFiles.map((f, i) => <div key={`${f.name}-${i}`} className="upload-file-item"><span className="upload-file-index">{i + 1}.</span><span className="upload-file-name">{f.name}</span><button className="upload-file-remove" type="button" onClick={() => setUploadFiles(prev => prev.filter((_, x) => x !== i))}><TrashIcon /></button></div>)}</div><div className="upload-fields"><label className="field-label" htmlFor="uploadCategorySelect">Category</label><div className="field-picker" ref={uploadCategoryPickerRef}><button id="uploadCategorySelect" className={`field-select field-select-trigger${uploadCategoryOpen ? ' open' : ''}`} type="button" aria-haspopup="listbox" aria-expanded={uploadCategoryOpen} onClick={() => setUploadCategoryOpen(v => !v)} onKeyDown={onUploadCategoryKeyDown}><span className="field-select-text">{uploadCategoryOptions.find(opt => opt.value === uploadCategory)?.label || 'Root (no category)'}</span><svg className="field-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg></button>{uploadCategoryOpen && (<div className={`field-select-menu${uploadCategoryMenuUp ? ' up' : ''}`} role="listbox" tabIndex={0} onKeyDown={onUploadCategoryKeyDown}>{uploadCategoryOptions.map(opt => { const isActive = uploadCategoryActive === opt.value; const isSelected = uploadCategory === opt.value; return <button key={opt.value || '__root'} type="button" role="option" aria-selected={isSelected} className={`field-select-option${isActive ? ' active' : ''}${isSelected ? ' selected' : ''}`} onMouseEnter={() => setUploadCategoryActive(opt.value)} onClick={() => { setUploadCategory(opt.value); setUploadCategoryOpen(false); }}>{opt.label}</button>; })}</div>)}</div><div id="newCategoryFields" className={`new-category-fields${uploadCategory === '__new__' ? '' : ' is-hidden'}`}><label className="field-label" htmlFor="uploadCategoryNew">New category name</label><input id="uploadCategoryNew" className="field-input" placeholder="New category name" value={uploadCategoryNew} onChange={e => setUploadCategoryNew(e.target.value)} /></div></div><div className="upload-actions"><button type="submit" className="ctrl-btn ctrl-upload">Upload</button></div></form></div></div>

      <div id="statusModal" className={`status-modal${status.open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setStatus(prev => ({ ...prev, open: false })); }}><div className="status-panel"><h2 id="statusTitle">{status.title}</h2><p id="statusMessage">{status.message}</p><div className="status-actions"><button id="statusOk" className="ctrl-btn ctrl-upload" type="button" onClick={() => setStatus(prev => ({ ...prev, open: false }))}>Ok</button></div></div></div>
      <div id="confirmModal" className={`confirm-modal${confirm.open ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setConfirm(prev => ({ ...prev, open: false })); }}><div className="confirm-panel"><h2 id="confirmTitle">{confirm.title}</h2><p id="confirmMessage">{confirm.text}</p><div className="confirm-actions"><button id="confirmCancel" className="ctrl-btn" type="button" onClick={() => setConfirm(prev => ({ ...prev, open: false }))}>Cancel</button><button id="confirmOk" className="ctrl-btn confirm-danger" type="button" onClick={() => { const action = confirm.action; setConfirm(prev => ({ ...prev, open: false })); if (action) void action().catch(err => setStatus({ open: true, title: 'Error', message: err?.message || 'Operation failed.' })); }}>Delete</button></div></div></div>
      <footer className="app-footer">
        <div className="app-footer-inner">
          <span className="footer-credit">Made with &hearts; by <a href="https://github.com/giabb" target="_blank" rel="noopener">giabb</a></span>
          {authEnabled && (
            <button className="footer-logout" type="button" aria-label="Logout" onClick={() => { window.location.href = '/logout'; }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </footer>
    </>
  );
}




