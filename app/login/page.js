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
import { useState } from 'react';

function AmbientBg() {
  return (
    <div className="ambient-bg" aria-hidden="true">
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
      <div className="particle" />
    </div>
  );
}

export default function LoginPage() {
  const [failed, setFailed] = useState(false);
  const failedFromQuery = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('error') === '1';
  const showError = failed || failedFromQuery;

  async function onSubmit(event) {
    event.preventDefault();
    setFailed(false);
    const form = event.currentTarget;
    const body = new URLSearchParams(new FormData(form));
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      if (res.ok) {
        window.location.href = '/';
        return;
      }
      setFailed(true);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="login-page">
      <AmbientBg />
      <main className="login-shell">
        <section className="login-card">
          <header className="login-brand">
            <h1 className="login-title">BardBoard <span className="ampersand">&amp;</span> Dragons</h1>
            <p className="login-subtitle">Sign in to access the soundboard.</p>
          </header>
          <form id="login-form" className={`login-form${showError ? ' login-failed' : ''}`} method="post" action="/api/auth/login" onSubmit={e => void onSubmit(e)}>
            <label className="field-label" htmlFor="username">Username</label>
            <input id="username" name="username" className="field-input login-input" type="text" autoComplete="username" required />
            <label className="field-label" htmlFor="password">Password</label>
            <input id="password" name="password" className="field-input login-input" type="password" autoComplete="current-password" required />
            <div className="login-row">
              <label className="login-remember">
                <input type="checkbox" name="remember" value="1" />
                Remember me
              </label>
            </div>
            <button type="submit" className="ctrl-btn login-submit">Unlock BardBoard</button>
            <div id="error" className="login-error" role="alert" aria-live="polite" style={{ display: showError ? 'block' : 'none' }}>
              <strong>Access denied.</strong> The username or password is incorrect.
            </div>
            <div className="login-hint">Tip: you can connect to BardBoard also on other devices in the same LAN.</div>
          </form>
        </section>
      </main>
    </div>
  );
}

