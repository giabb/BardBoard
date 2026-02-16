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
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

function groupBySection(items) {
  const out = new Map();
  for (const item of items) {
    if (!out.has(item.section)) out.set(item.section, []);
    out.get(item.section).push(item);
  }
  return out;
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);
  const [values, setValues] = useState({});
  const [status, setStatus] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const authRes = await fetch('/api/auth/status');
        if (authRes.status === 401) {
          window.location.href = '/login';
          return;
        }
        const auth = await authRes.json();
        if (!auth.authEnabled) {
          window.location.href = '/';
          return;
        }
        if (!auth.canManageSettings) {
          window.location.href = '/';
          return;
        }

        const res = await fetch('/api/settings/config');
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        const nextItems = Array.isArray(data.items) ? data.items : [];
        const nextValues = {};
        for (const item of nextItems) {
          nextValues[item.key] = item.value || '';
        }
        if (!cancelled) {
          setItems(nextItems);
          setValues(nextValues);
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load settings.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const sections = useMemo(() => groupBySection(items), [items]);

  const onSubmit = event => {
    event.preventDefault();
    setError('');
    setStatus('');
    setConfirmOpen(true);
  };

  const onConfirmSave = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      const saveRes = await fetch('/api/settings/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values })
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Failed to save settings.');

      if (saveData.changedKeys?.length === 0) {
        setStatus('No changes detected.');
        setSaving(false);
        return;
      }

      const query = saveData.webRestartRequired ? '?web=1' : '';
      void fetch('/api/settings/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purgeSessions: Boolean(saveData.authChanged) }),
        keepalive: true
      }).catch(() => {
        // If request fails, restart page still gives manual retry path.
      });
      window.location.href = `/restarting${query}`;
    } catch (err) {
      setError(err?.message || 'Failed to save settings.');
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="ambient-bg" aria-hidden="true">
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
      </div>
      <main className="settings-main">
        <section className="settings-surface">
          <header className="settings-header">
            <h1 className="settings-title">Settings</h1>
            <p className="settings-subtitle">Update runtime configuration values from the browser.</p>
            <p className="settings-disclaimer">
              Build-sensitive variables are hidden here (`WEB_PORT`, `BACKEND_URL`, `BOT_PORT`, `UPLOAD_MAX_MB`).
              To change them, edit `.env` manually and run `docker compose up --build -d`.
            </p>
          </header>

          {loading ? (
            <div className="settings-loading">
              <Image className="loader-ouroboros" src="/ouroboros.svg" alt="Loading settings" width={72} height={72} />
              <p>Loading settings...</p>
            </div>
          ) : (
            <form className="settings-form" onSubmit={onSubmit}>
              {[...sections.entries()].map(([section, sectionItems]) => (
                <section key={section} className="settings-section">
                  <h2>{section}</h2>
                  {sectionItems.map(item => (
                    <label key={item.key} className="settings-field">
                      <span className="field-label settings-field-label">
                        <code>{item.key}</code>
                        <span className="settings-info" tabIndex={0} aria-label="Field information">
                          i
                          <span className="settings-tooltip" role="tooltip">
                            {item.description || 'No description available.'}
                          </span>
                        </span>
                      </span>
                      <input
                        className="field-input login-input"
                        type="text"
                        value={values[item.key] ?? ''}
                        onChange={e => setValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </section>
              ))}

              <p className="settings-disclaimer">
                Saving will restart the app services to apply changes.
              </p>

              {error && <p className="login-error settings-error">{error}</p>}
              {status && <p className="settings-status">{status}</p>}

              <div className="settings-actions">
                <Link className="ctrl-btn login-submit" href="/">Cancel</Link>
                <button type="submit" className="ctrl-btn login-submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save and Restart'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
      <div className={`confirm-modal${confirmOpen ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setConfirmOpen(false); }}>
        <div className="confirm-panel">
          <h2>Confirm restart</h2>
          <p>Saving these settings will restart the app services. Are you sure?</p>
          <div className="confirm-actions">
            <button className="ctrl-btn" type="button" onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button className="ctrl-btn confirm-danger" type="button" onClick={() => void onConfirmSave()} disabled={saving}>
              {saving ? 'Saving...' : 'Save and Restart'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
