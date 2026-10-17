'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

interface Me {
  id: number;
  username: string;
  role: string;
}

const NAV: { href: string; label: string; roles: string[] }[] = [
  { href: '/dashboard', label: 'Dashboard', roles: ['admin', 'manager', 'frontdesk', 'cashier', 'service'] },
  { href: '/rooms', label: 'Rooms', roles: ['admin', 'manager', 'frontdesk'] },
  { href: '/stays', label: 'Stays & Check-in', roles: ['admin', 'manager', 'frontdesk'] },
  { href: '/services', label: 'Services', roles: ['admin', 'manager', 'frontdesk', 'service'] },
  { href: '/reports', label: 'Reports', roles: ['admin', 'manager', 'cashier'] },
  { href: '/users', label: 'Users', roles: ['admin'] },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  frontdesk: 'Front Desk',
  cashier: 'Cashier',
  service: 'Service Staff',
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

  return (
    <div className="app-shell">
      <aside className={`sidebar${menuOpen ? ' open' : ''}`}>
        <div className="brand">
          <span className="brand-mark">H</span>
          <span className="brand-text">Hotel Billing</span>
        </div>
        <nav className="nav">
          {links.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={pathname === l.href || pathname.startsWith(l.href + '/') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          {me && (
            <>
              <div className="user-chip">
                <strong>{me.username}</strong>
                <span>{ROLE_LABEL[me.role] ?? me.role}</span>
              </div>
              <button className="btn btn-ghost btn-block" onClick={logout}>
                Log out
              </button>
            </>
          )}
        </div>
      </aside>
      <div className="main">
        <header className="topbar no-print">
          <button className="btn btn-ghost menu-btn" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">
            ☰
          </button>
          <span className="topbar-title">Front Office</span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
