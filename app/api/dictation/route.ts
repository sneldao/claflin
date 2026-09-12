import { NextRequest } from 'next/server';
import { parseDictatedTradeIntent } from '@/lib/trading/dictation-parser';
import { quoteBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const DEFAULT_DICTATION_ENDPOINT = 'https://dictation.assemblyai.com/transcribe';
const FALLBACK_SYNC_ENDPOINT = 'https://sync.assemblyai.com/transcribe';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB limit to prevent memory bloat
const dictationBudget = quoteBudget(); // 30 requests/minute budget guard

/**
 * POST /api/dictation
 *
 * AssemblyAI Dictation API Integration for Claflin Trading Desk.
 * Transcribes voice orders with disfluencies (ums, ahs) filtered out at the model level,
 * returning a clean, auditable transcript and parsed trade intent for the ticket.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const headers = { 'Cache-Control': 'no-store' };

  if (!dictationBudget()) {
    return Response.json({
      error: 'rate_limited',
      message: 'Too many dictation requests. Please wait a moment before trying again.',
    }, { status: 429, headers: { ...headers, 'Retry-After': '10' } });
  }

  try {
    let audioBuffer: Buffer;
    let contentType = 'audio/wav';

    const reqContentType = req.headers.get('content-type') || '';

    if (reqContentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('audio') as File | null;
      if (!file) {
        return Response.json({ error: 'bad_request', message: 'No audio payload provided.' }, { status: 400, headers });
      }
      if (file.size > MAX_AUDIO_BYTES) {
        return Response.json({ error: 'payload_too_large', message: 'Audio exceeds maximum size (10MB).' }, { status: 413, headers });
      }
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
      if (file.type) contentType = file.type;
    } else {
      const arrayBuffer = await req.arrayBuffer();
      if (!arrayBuffer || arrayBuffer.byteLength === 0) {
        return Response.json({ error: 'bad_request', message: 'Empty audio stream.' }, { status: 400, headers });
      }
      if (arrayBuffer.byteLength > MAX_AUDIO_BYTES) {
        return Response.json({ error: 'payload_too_large', message: 'Audio exceeds maximum size (10MB).' }, { status: 413, headers });
      }
      audioBuffer = Buffer.from(arrayBuffer);
      if (reqContentType && !reqContentType.includes('application/json')) {
        contentType = reqContentType;
      }
    }

    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    const endpoint = process.env.ASSEMBLYAI_DICTATION_ENDPOINT || DEFAULT_DICTATION_ENDPOINT;

    // If API key is not configured, provide mock transcription for local dev/testing
    if (!apiKey) {
      const mockText = 'Buy 100 USDC of NVDA';
      const parsed = parseDictatedTradeIntent(mockText);
      return Response.json({
        ok: true,
        transcript: mockText,
        confidence: 0.98,
        parsedIntent: parsed.intent,
        matchedInstrument: parsed.matchedInstrument ? {
          id: parsed.matchedInstrument.id,
          symbol: parsed.matchedInstrument.symbol,
          name: parsed.matchedInstrument.name,
        } : null,
        disfluencyFiltered: true,
        provider: 'AssemblyAI Dictation (dev simulated)',
      }, { headers });
    }

    // Call AssemblyAI Dictation endpoint
    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': contentType,
      },
      body: new Uint8Array(audioBuffer),
    });

    // Fallback to sync endpoint if beta dictation subdomain returns error
    if (!response.ok && endpoint !== FALLBACK_SYNC_ENDPOINT) {
      try {
        const fallbackRes = await fetch(FALLBACK_SYNC_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': contentType,
          },
          body: new Uint8Array(audioBuffer),
        });
        if (fallbackRes.ok) response = fallbackRes;
      } catch {
        // preserve original response
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 402) {
        return Response.json({
          error: 'credits_exhausted',
          message: 'AssemblyAI dictation service quota reached. You can still enter orders manually on the ticket.',
        }, { status: 503, headers });
      }
      const errorText = await response.text();
      return Response.json({
        error: 'dictation_failed',
        message: `AssemblyAI dictation returned status ${response.status}. Manual entry is available.`,
        details: errorText,
      }, { status: 502, headers });
    }

    const data = (await response.json()) as {
      text?: string;
      transcript?: string;
      confidence?: number;
      words?: Array<{ text: string; start: number; end: number; confidence: number }>;
    };

    const transcript = (data.text || data.transcript || '').trim();
    const parsed = parseDictatedTradeIntent(transcript);

    return Response.json({
      ok: true,
      transcript,
      confidence: data.confidence ?? 0.95,
      parsedIntent: parsed.intent,
      matchedInstrument: parsed.matchedInstrument ? {
        id: parsed.matchedInstrument.id,
        symbol: parsed.matchedInstrument.symbol,
        name: parsed.matchedInstrument.name,
      } : null,
      disfluencyFiltered: true,
      provider: 'AssemblyAI Dictation',
    }, { headers });
  } catch (err) {
    return Response.json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Failed to process dictation audio',
    }, { status: 500, headers });
  }
}

