import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isRetiredMarketplaceApi } from './lib/house';

const ALLOWED_HEADERS = 'Content-Type, Authorization, X-API-Key, X-Requested-With, X-Wallet-Address, X-Signature, X-Timestamp';

/* Browser origins that may make credentialed cross-origin API calls.
   Reflecting an arbitrary Origin alongside Allow-Credentials lets any
   website ride a visitor's bearer token — only configured origins qualify. */
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.NEXT_PUBLIC_WEB_URL,
  'http://localhost:3000',
].filter((value): value is string => Boolean(value));

function applyCorsHeaders(request: NextRequest, response: NextResponse): NextResponse {
  const origin = request.headers.get('origin');
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Vary', 'Origin');
  } else if (!origin) {
    /* Server-to-server callers (webhooks, scripts) send no Origin and
       do not need credentials; '*' is honest for them. */
    response.headers.set('Access-Control-Allow-Origin', '*');
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  return response;
}

export function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return NextResponse.next();

  if (request.method === 'OPTIONS') {
    return applyCorsHeaders(request, new NextResponse(null, { status: 204 }));
  }

  if (isRetiredMarketplaceApi(request.nextUrl.pathname)) {
    return applyCorsHeaders(
      request,
      NextResponse.json(
        { error: 'marketplace_retired', message: 'Claflin is a curated brokerage house. Public broker listing, marketplace discovery, and ratings have been retired.' },
        { status: 410, headers: { 'Cache-Control': 'no-store' } },
      ),
    );
  }

  /* A miss on the API surface must answer JSON, not the HTML 404 page —
     a client parsing `{}` from "<!DOCTYPE …" is how raw parse errors
     reach the desk. Known-but-unimplemented routes get honest copy. */
  const route = request.nextUrl.pathname;
  const hasRouteHandler = [
    '/api/stocks/quote',
    '/api/stocks/marks',
    '/api/desk',
    '/api/hetty/session',
    '/api/hetty/transcript',
    '/api/paper',
    '/api/eligibility',
    '/api/webhooks/elevenlabs',
  ].some(path => route === path || route.startsWith(`${path}/`));
  if (!hasRouteHandler) {
    return applyCorsHeaders(
      request,
      NextResponse.json(
        { error: 'not_found', message: 'That desk service does not exist here.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      ),
    );
  }

  return applyCorsHeaders(request, NextResponse.next());
}

export const config = {
  matcher: '/api/:path*',
};
