import { NextRequest, NextResponse } from 'next/server';

/**
 * Route-level CORS helpers.
 *
 * NOTE: CORS is now handled centrally in proxy.ts for every /api/*
 * route (OPTIONS preflights + response headers). These helpers remain for
 * backwards compatibility with routes that still call them, and mirror the
 * proxy policy. New code should rely on the proxy instead of wrapping every
 * response.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'https://claflin.trustfall.xyz',
  'https://claflin.vercel.app',
  'http://localhost:3000',
];

function getAllowedOrigin(origin: string | null): string {
  const configuredOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_WEB_URL,
    ...DEFAULT_ALLOWED_ORIGINS,
  ].filter((value): value is string => Boolean(value));

  if (origin && configuredOrigins.includes(origin)) {
    return origin;
  }

  return DEFAULT_ALLOWED_ORIGINS[0];
}

export function corsHeaders(req?: NextRequest): HeadersInit {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req?.headers.get('origin') ?? null),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key, X-Requested-With',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function withCors(response: NextResponse, req?: NextRequest): NextResponse {
  const headers = corsHeaders(req);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export function handleOptions(req?: NextRequest): NextResponse {
  return withCors(new NextResponse(null, { status: 204 }), req);
}
