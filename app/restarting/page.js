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
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RestartingPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = window.setInterval(() => setSeconds(prev => prev + 1), 1000);

    const poll = window.setInterval(async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        if (res.ok && !cancelled) {
          setReady(true);
          window.clearInterval(poll);
        }
      } catch {
        // Ignore while restarting.
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(tick);
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => {
      router.replace('/');
    }, 900);
    return () => window.clearTimeout(timer);
  }, [ready, router]);

  return (
    <div className="login-page">
      <div className="ambient-bg" aria-hidden="true">
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
        <div className="particle" />
      </div>
      <main className="login-shell restart-shell">
        <section className="login-card restart-card">
          <Image className="loader-ouroboros" src="/ouroboros.svg" alt="Restarting" width={96} height={96} />
          <h1 className="login-title">{ready ? 'Restart complete' : 'The app is restarting, please wait...'}</h1>
          <p className="login-subtitle">
            {ready ? 'The backend is reachable again.' : `Waiting for service startup (${seconds}s)`}
          </p>
          <p className="settings-disclaimer">
            If web-level values changed and UI does not reflect them, run `docker compose up --build -d`.
          </p>
          <div className="settings-actions">
            <Link className="ctrl-btn login-submit" href={ready ? '/' : '/restarting'}>
              {ready ? 'Back to Soundboard' : 'Retry'}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
