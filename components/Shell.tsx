'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { LOGO_DATA_URI } from '../lib/logo';

interface Me {
  id: number;
  username: string;
  role: string;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" width="18" height="18" aria-hidden>
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  stays: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  rooms: 'M3 7v11m0-4h18m0 4v-7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2zM6 9V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4',
  services: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  reports: 'M18 20V10M12 20V4M6 20v-6',
  transactions: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  users: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
};

const NAV: { href: string; label: string; icon: string; roles: string[] }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'manager', 'frontdesk', 'cashier', 'service'] },
  { href: '/stays', label: 'Active Stays', icon: 'stays', roles: ['admin', 'manager', 'frontdesk'] },
  { href: '/rooms', label: 'Rooms & Availability', icon: 'rooms', roles: ['admin', 'manager', 'frontdesk'] },
  { href: '/services', label: 'Guest Service Requests', icon: 'services', roles: ['admin', 'manager', 'frontdesk', 'service'] },
  { href: '/reports', label: 'Reports', icon: 'reports', roles: ['admin', 'manager', 'cashier'] },
  { href: '/transactions', label: 'Transactions', icon: 'transactions', roles: ['admin', 'manager', 'cashier'] },
  { href: '/users', label: 'Staff Accounts', icon: 'users', roles: ['admin'] },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'ADMIN',
  manager: 'MANAGER',
  frontdesk: 'FRONT DESK',
  cashier: 'CASHIER',
  service: 'SERVICE',
};

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const isLogin = pathname === '/login' || pathname.startsWith('/login/');
  const isPortal = pathname === '/portal' || pathname.startsWith('/portal/');

  useEffect(() => {
    if (isLogin || isPortal) {
      setMe(null);
      return;
    }
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setMe(d?.user ?? null))
      .catch(() => setMe(null));
  }, [pathname, isLogin]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setMe(null);
    router.push('/login');
  }

  if (isLogin) {
    return <div className="login-wrap">{children}</div>;
  }

  // Public guest portal — no staff navigation.
  if (isPortal) {
    return <>{children}</>;
  }

  const links = NAV.filter(n => me && n.roles.includes(me.role));
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div className="app-shell">
      <header className="app-header no-print">
        <button className="btn btn-ghost menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
          ☰
        </button>
        <img src={LOGO_DATA_URI} alt="Shesh Dev Hotel" className="header-logo" />
        <span className="header-title">Shesh Dev Hotel <span className="header-sep">·</span> Agora, Lapasan, Cagayan de Oro</span>
        <span className="header-pill">Front Office</span>
        <span className="spacer" />
        <span className="header-date">{today}</span>
        {me && (
          <div className="header-user">
            <div className="header-user-meta">
              <strong>{me.username}</strong>
              <span className="role-badge">{ROLE_LABEL[me.role] ?? me.role}</span>
            </div>
            <button className="btn btn-sm header-signout" onClick={logout}>
              ⎋ Sign Out
            </button>
          </div>
        )}
      </header>
      <div className="app-body">
        <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
          <div className="nav-label">Navigation</div>
          <nav className="nav">
            {links.map(l => (
              <Link
                key={l.href}
                href={l.href}
                className={pathname === l.href || pathname.startsWith(l.href + '/') ? 'active' : ''}
                onClick={() => setMenuOpen(false)}
              >
                <span className="nav-ico"><Icon d={ICONS[l.icon]} /></span>
                {l.label}
              </Link>
            ))}
          </nav>
        </aside>
        {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
