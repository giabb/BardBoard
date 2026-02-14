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
import { useEffect, useState } from 'react';

export default function LogoutPage() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {
        // Ignore network errors and still show final state.
      } finally {
        if (!cancelled) setDone(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="login-page">
      <div className="ambient-bg" aria-hidden="true">
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
      </div>
      <main className="login-shell">
        <section className="login-card">
          <header className="login-brand">
            <h1 className="login-title">{done ? 'Logout successful' : 'Signing out...'}</h1>
            <p className="login-subtitle">
              {done ? 'Your session has been closed.' : 'Please wait a moment.'}
            </p>
          </header>
          {done && (
            <div className="status-actions">
              <a className="ctrl-btn login-submit" href="/login">Login again</a>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

