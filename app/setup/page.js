'use client';

import { useEffect, useState } from 'react';

export default function SetupPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [adminUser, setAdminUser] = useState('admin');
  const [adminPass, setAdminPass] = useState('');
  const [readonlyEnabled, setReadonlyEnabled] = useState(false);
  const [readonlyUser, setReadonlyUser] = useState('');
  const [readonlyPass, setReadonlyPass] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maxAttempts = 30;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const res = await fetch('/api/setup/status', { cache: 'no-store' });
          if (!res.ok) throw new Error('Unable to verify setup status.');
          const data = await res.json();
          if (!cancelled && !data?.setupRequired) {
            window.location.href = '/';
            return;
          }
          if (!cancelled) {
            setError('');
            setLoading(false);
          }
          return;
        } catch (err) {
          if (cancelled) return;
          if (attempt >= maxAttempts) {
            setError(err?.message || 'Unable to verify setup status.');
            setLoading(false);
            return;
          }
          await new Promise(resolve => window.setTimeout(resolve, 1000));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordToken,
          adminUser,
          adminPass,
          readonlyEnabled,
          readonlyUser,
          readonlyPass
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Setup failed.');

      await fetch('/api/settings/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purgeSessions: true }),
        keepalive: true
      }).catch(() => {});

      window.location.href = '/restarting';
    } catch (err) {
      setError(err?.message || 'Setup failed.');
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <div className="ambient-bg" aria-hidden="true">
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
      </div>
      <main className="settings-main">
        <section className="settings-surface">
          <header className="settings-header">
            <h1 className="settings-title">First Boot Setup</h1>
            <p className="settings-subtitle">Configure required credentials before using BardBoard.</p>
          </header>

          {loading ? (
            <p>Checking setup status...</p>
          ) : (
            <form className="settings-form" onSubmit={onSubmit}>
              <label className="settings-field">
                <span className="field-label settings-field-label"><code>DISCORD_TOKEN</code></span>
                <input className="field-input login-input" type="password" value={discordToken} onChange={e => setDiscordToken(e.target.value)} required />
              </label>

              <label className="settings-field">
                <span className="field-label settings-field-label"><code>AUTH_ADMIN_USER</code></span>
                <input className="field-input login-input" type="text" value={adminUser} onChange={e => setAdminUser(e.target.value)} required />
              </label>

              <label className="settings-field">
                <span className="field-label settings-field-label"><code>AUTH_ADMIN_PASS</code></span>
                <input className="field-input login-input" type="password" value={adminPass} onChange={e => setAdminPass(e.target.value)} required />
              </label>

              <label className="settings-field" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={readonlyEnabled} onChange={e => setReadonlyEnabled(e.target.checked)} />
                <span>Enable readonly account (optional)</span>
              </label>

              {readonlyEnabled && (
                <>
                  <label className="settings-field">
                    <span className="field-label settings-field-label"><code>AUTH_READONLY_USER</code></span>
                    <input className="field-input login-input" type="text" value={readonlyUser} onChange={e => setReadonlyUser(e.target.value)} required={readonlyEnabled} />
                  </label>

                  <label className="settings-field">
                    <span className="field-label settings-field-label"><code>AUTH_READONLY_PASS</code></span>
                    <input className="field-input login-input" type="password" value={readonlyPass} onChange={e => setReadonlyPass(e.target.value)} required={readonlyEnabled} />
                  </label>
                </>
              )}

              <p className="settings-disclaimer">SESSION_SECRET and all non-critical defaults are auto-generated on first boot.</p>
              {error && <p className="login-error settings-error">{error}</p>}

              <div className="settings-actions">
                <button type="submit" className="ctrl-btn login-submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save and Restart'}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
