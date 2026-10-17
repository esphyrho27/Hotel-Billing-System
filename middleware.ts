import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { COOKIE_NAME } from './lib/cookie';

const PROTECTED = ['/dashboard', '/rooms', '/stays', '/folio', '/checkout', '/services', '/reports', '/transactions', '/users'];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = req.cookies.has(COOKIE_NAME);

  if (pathname === '/') {
    return NextResponse.redirect(new URL(hasSession ? '/dashboard' : '/login', req.url));
  }

  if (pathname === '/login' || pathname.startsWith('/login/')) {
    if (hasSession) return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  }

  if (PROTECTED.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    if (!hasSession) {
      const url = new URL('/login', req.url);
      url.searchParams.set('next', pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
