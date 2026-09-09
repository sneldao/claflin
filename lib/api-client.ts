/**
 * Client-side API access. Every desk fetch goes through here so a failing
 * endpoint can never surface a raw parse error like
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` — the symptom
 * of an HTML error page (or a proxy fallback) landing on a JSON parser.
 *
 * Contract (see tests/api-client.test.ts):
 * - typed errors (offline/network/timeout/http/parse), never raw browser text;
 * - retries only for idempotent methods and transient failures — mutations are
 *   never replayed implicitly;
 * - jittered exponential backoff within strict bounds;
 * - friendly, product-voice copy for every failure mode.
 */

export type ApiErrorKind = 'offline' | 'network' | 'timeout' | 'http' | 'parse';

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** The user-visible messages. Never leak stack, status text, or parse detail into copy. */
export function friendlyMessageFor(kind: ApiErrorKind, status: number): string {
  if (kind === 'offline') return 'You appear to be offline. The desk will pick up where you left off when the connection returns.';
  if (kind === 'network') return 'The broker desk could not be reached. Check your connection and try again.';
  if (kind === 'timeout') return 'The service took too long to answer. Please try again.';
  if (kind === 'parse') return 'The service returned something the desk could not read. Please try again.';
  if (status === 429) return 'Too many calls just now. Please wait a moment and try again.';
  if (status === 401) return 'Sign in again to continue.';
  if (status === 403) return 'This action is not available right now.';
  if (status === 404) return 'That desk service does not exist here.';
  if (status >= 500) return 'The desk had a problem completing that. Please try again shortly.';
  return 'That request did not go through. Please try again.';
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  /** Server-provided error code (`error` field), when the payload had one. */
  readonly code: string | null;
  /** Present when the server asked the client to back off (Retry-After). */
  readonly retryAfterSeconds: number | null;
  readonly friendlyMessage: string;
  readonly retryable: boolean;

  constructor(kind: ApiErrorKind, message: string, options: { status?: number; code?: string | null; retryAfterSeconds?: number | null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? 0;
    this.code = options.code ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.friendlyMessage = friendlyMessageFor(kind, this.status);
    this.retryable = kind === 'http' ? isRetryableStatus(this.status) : kind !== 'parse';
  }
}

/** Map a thrown fetch failure to a typed error. ApiError passes through untouched. */
export function classifyFetchFailure(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ApiError('timeout', friendlyMessageFor('timeout', 0));
  }
  if (error instanceof TypeError) {
    // Browsers throw TypeError("Failed to fetch") for offline, CORS and DNS too.
    return new ApiError('network', friendlyMessageFor('network', 0));
  }
  return new ApiError('network', friendlyMessageFor('network', 0));
}

/** Full jitter, bounded by base * 2^attempt and the max cap. */
export function computeBackoffDelay(attempt: number, baseMs = 400, maxMs = 8_000, rand: () => number = Math.random): number {
  const ceiling = Math.min(baseMs * 2 ** Math.max(0, attempt), maxMs);
  return Math.floor(rand() * ceiling);
}

const DEFAULT_TIMEOUT_MS = 30_000;
const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new ApiError('timeout', friendlyMessageFor('timeout', 0)));
  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new ApiError('timeout', friendlyMessageFor('timeout', 0)));
    signal.addEventListener('abort', onAbort!, { once: true });
  });
  return Promise.race([promise, aborted]).finally(() => {
    if (onAbort) signal.removeEventListener('abort', onAbort!);
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let onAbort: (() => void) | undefined;
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort!);
      resolve();
    }, ms);
    onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort!);
      reject(new ApiError('timeout', friendlyMessageFor('timeout', 0)));
    };
    if (signal?.aborted) { onAbort!(); return; }
    signal?.addEventListener('abort', onAbort!, { once: true });
  });
}

export type ApiFetchOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Abort signal from the caller (e.g. the desk's request controller). */
  signal?: AbortSignal;
  /** Request deadline in milliseconds. Hung requests reject as `timeout` instead of spinning. */
  timeoutMs?: number;
  /** Extra attempts after the first. Defaults to 2 for idempotent methods, 0 for mutations. */
  retries?: number;
  retryBaseMs?: number;
  retryMaxMs?: number;
  fetchImpl?: typeof fetch;
};

function readRetryAfter(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  return header && /^\d+$/.test(header) ? Number(header) : null;
}

function abortControllerDeadline(ms: number): { controller: AbortController; signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * JSON fetch that resolves with parsed data on success and throws a typed
 * `ApiError` on every failure mode. GET/HEAD retry transient failures;
 * mutations never retry implicitly.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const maxAttempts = 1 + (options.retries ?? (IDEMPOTENT_METHODS.has(method) ? 2 : 0));
  const retryBaseMs = options.retryBaseMs ?? 400;
  const retryMaxMs = options.retryMaxMs ?? 8_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  if (options.signal?.aborted) {
    throw new ApiError('timeout', friendlyMessageFor('timeout', 0));
  }

  let deadline = timeoutMs > 0 ? abortControllerDeadline(timeoutMs) : null;
  let cleanup = deadline ? () => { deadline!.clear(); } : () => {};
  if (deadline && options.signal) {
    const forward = () => deadline!.controller.abort();
    options.signal.addEventListener('abort', forward, { once: true });
    const baseClear = cleanup;
    cleanup = () => { baseClear(); options.signal?.removeEventListener('abort', forward); };
  }
  const signal = deadline?.signal ?? options.signal ?? undefined;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl(path, {
          method,
          headers: options.headers,
          body: options.body,
          signal,
          cache: 'no-store',
        });
      } catch (error) {
        const typed = classifyFetchFailure(error);
        if (typed.retryable && signal && !signal.aborted && attempt < maxAttempts - 1) {
          await sleep(computeBackoffDelay(attempt, retryBaseMs, retryMaxMs), signal);
          continue;
        }
        throw typed;
      }

      if (!response.ok) {
        const retryAfterSeconds = readRetryAfter(response);
        let payload: { message?: unknown; error?: unknown } = {};
        try {
          payload = (await withSignal(response.json(), signal)) as { message?: unknown; error?: unknown };
        } catch (error) {
          if (error instanceof ApiError) throw error;
          /* HTML error page — generic copy below */
        }
        const serverMessage = typeof payload.message === 'string' && payload.message.length > 0 && payload.message.length <= 240
          ? payload.message
          : null;
        const typed = new ApiError('http', serverMessage ?? friendlyMessageFor('http', response.status), {
          status: response.status,
          code: typeof payload.error === 'string' ? payload.error : null,
          retryAfterSeconds,
        });
        if (typed.retryable && signal && !signal.aborted && attempt < maxAttempts - 1) {
          /* A rate-limited response names its own wait; never retry sooner. */
          const delay = Math.max(computeBackoffDelay(attempt, retryBaseMs, retryMaxMs), (retryAfterSeconds ?? 0) * 1000);
          await sleep(delay, signal);
          continue;
        }
        throw typed;
      }

      try {
        const body = await withSignal(response.json(), signal);
        return body as T;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        // A 2xx carrying HTML or empty text is a broken proxy, not data.
        throw new ApiError('parse', friendlyMessageFor('parse', 0), { status: response.status });
      }
    }
    /* Unreachable: the loop either returns or throws on its last attempt. */
    throw new ApiError('network', friendlyMessageFor('network', 0));
  } finally {
    cleanup();
  }
}

export type JsonResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** JSON fetch that always resolves (network failure included) and never parses HTML as JSON. */
export async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<JsonResponse<T>> {
  try {
    const data = await apiFetch<T>(path, {
      method: init.method,
      headers: init.headers as Record<string, string> | undefined,
      body: typeof init.body === 'string' ? init.body : undefined,
      signal: init.signal ?? undefined,
    });
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error : classifyFetchFailure(error) };
  }
}
