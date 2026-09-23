import { NextRequest } from 'next/server';
import { parseDictatedTradeIntent } from '@/lib/trading/dictation-parser';
import { quoteBudget } from '@/lib/trading/http';

export const dynamic = 'force-dynamic';

const DEFAULT_DICTATION_ENDPOINT = 'https://dictation.assemblyai.com/v1/transcribe/live';
const FALLBACK_SYNC_ENDPOINT = 'https://sync.assemblyai.com/transcribe';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10MB limit to prevent memory bloat
const dictationBudget = quoteBudget(); // 30 requests/minute budget guard

// Dictation only accepts WAV (audio/wav) or raw PCM S16LE (audio/pcm) —
// MediaRecorder's webm/opus output is rejected with 415. Stock names and
// amounts bias the transcript toward the desk's vocabulary.
const HETTY_DICTATION_CONFIG = JSON.stringify({
  keyterms_prompt: [
    'NVDA', 'Nvidia', 'AAPL', 'Apple', 'TSLA', 'Tesla', 'GOOGL', 'Google', 'Alphabet',
    'META', 'Meta', 'COIN', 'Coinbase', 'MSFT', 'Microsoft', 'AMZN', 'Amazon', 'MSTR',
    'buy', 'sell', 'USDC', 'Coinbase tokenized stocks',
  ],
});

const JESSE_DICTATION_CONFIG = JSON.stringify({
  keyterms_prompt: [
    'AAPLx', 'Apple', 'AAPL', 'NVDAx', 'NVIDIA', 'NVDA', 'TSLAx', 'Tesla', 'TSLA',
    'buy', 'sell', 'USDC', 'xStock', 'scaled', 'compare', 'file paper record', 'Jupiter', 'Solana',
  ],
});

/**
 * POST /api/dictation
 *
 * AssemblyAI Dictation API Integration for Claflin Trading Desk.
 * Transcribes voice orders with disfluencies (ums, ahs) filtered out at the model level,
 * returning a clean, auditable transcript and parsed trade intent for the ticket.
 * Optional form field `desk=jesse` swaps keyterms and skips Base intent parsing.
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
    let desk = 'hetty';

    const reqContentType = req.headers.get('content-type') || '';

    if (reqContentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const deskField = formData.get('desk');
      if (typeof deskField === 'string' && deskField === 'jesse') desk = 'jesse';
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

    const dictationConfig = desk === 'jesse' ? JESSE_DICTATION_CONFIG : HETTY_DICTATION_CONFIG;
    const apiKey = process.env.ASSEMBLYAI_API_KEY;
    const endpoint = process.env.ASSEMBLYAI_DICTATION_ENDPOINT || DEFAULT_DICTATION_ENDPOINT;

    // If API key is not configured, provide mock transcription for local dev/testing
    if (!apiKey) {
      const mockText = desk === 'jesse' ? 'Buy 100 USDC of Apple' : 'Buy 100 USDC of NVDA';
      if (desk === 'jesse') {
        return Response.json({
          ok: true,
          transcript: mockText,
          confidence: 0.98,
          parsedIntent: null,
          matchedInstrument: null,
          disfluencyFiltered: true,
          provider: 'AssemblyAI Dictation (dev simulated)',
          desk,
        }, { headers });
      }
      const parsed = parseDictatedTradeIntent(mockText);
      return Response.json({
        ok: true,
        transcript: mockText,
        confidence: 0.98,
        parsedIntent: parsed.intent,
        parsedSpans: parsed.spans ?? null,
        matchedInstrument: parsed.matchedInstrument ? {
          id: parsed.matchedInstrument.id,
          symbol: parsed.matchedInstrument.symbol,
          name: parsed.matchedInstrument.name,
        } : null,
        disfluencyFiltered: true,
        provider: 'AssemblyAI Dictation (dev simulated)',
        desk,
      }, { headers });
    }

    // Call AssemblyAI Dictation API.
    // Format per https://www.assemblyai.com/docs/dictation:
    // multipart/form-data with a `config` part FIRST (always present, `{}` for
    // defaults) and the `audio` file part second. Only WAV (audio/wav) or raw
    // PCM S16LE (audio/pcm) are accepted — webm/opus is rejected with 415.
    // The rewrite is best-effort: prefer llm_response (clean, send-ready),
    // fall back to verbatim text, never treat llm_error as a failed request.
    const upstreamForm = new FormData();
    upstreamForm.append('config', new Blob([dictationConfig], { type: 'application/json' }));
    upstreamForm.append('audio', new File([new Uint8Array(audioBuffer)], 'recording.wav', { type: 'audio/wav' }));

    let response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
      },
      body: upstreamForm,
    });

    // Fallback to sync endpoint if beta dictation subdomain returns error
    if (!response.ok && endpoint !== FALLBACK_SYNC_ENDPOINT) {
      try {
        const fallbackForm = new FormData();
        fallbackForm.append('config', new Blob([dictationConfig], { type: 'application/json' }));
        fallbackForm.append('audio', new File([new Uint8Array(audioBuffer)], 'recording.wav', { type: 'audio/wav' }));
        const fallbackRes = await fetch(FALLBACK_SYNC_ENDPOINT, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
          },
          body: fallbackForm,
        });
        if (fallbackRes.ok) response = fallbackRes;
      } catch {
        // preserve original response
      }
    }

    if (!response.ok) {
      if (response.status === 401 || response.status === 402 || response.status === 404) {
        return Response.json({
          error: 'credits_exhausted',
          message: 'AssemblyAI dictation service quota reached. You can still enter orders manually on the ticket.',
        }, { status: 503, headers });
      }
      if (response.status === 415) {
        return Response.json({
          error: 'unsupported_audio',
          message: 'That recording came in a format the transcription service cannot read. Try again — or type the instruction below.',
        }, { status: 502, headers });
      }
      const errorText = await response.text();
      return Response.json({
        error: 'dictation_failed',
        message: 'AssemblyAI dictation returned status 400. Manual entry is available.',
        details: errorText,
      }, { status: 502, headers });
    }

    const data = (await response.json()) as {
      text?: string;
      transcript?: string;
      llm_response?: string | null;
      llm_error?: string | null;
      confidence?: number;
      words?: Array<{ text: string; start: number; end: number; confidence: number }>;
    };

    // Prefer the cleaned-up rewrite (filler gone, send-ready); fall back to
    // the verbatim transcript when the rewrite failed (llm_response null).
    const cleanText = (data.llm_response || '').trim();
    const verbatimText = (data.text || data.transcript || '').trim();
    const transcript = (cleanText || verbatimText).trim();
    const usedRewrite = Boolean(cleanText);

    if (!transcript) {
      return Response.json({
        error: 'no_speech',
        message: 'No words were heard in that recording. Try again a little louder, or type the instruction on the ticket.',
      }, { status: 422, headers });
    }

    if (desk === 'jesse') {
      return Response.json({
        ok: true,
        transcript,
        verbatimTranscript: verbatimText || null,
        cleanedUp: usedRewrite,
        confidence: data.confidence ?? 0.95,
        parsedIntent: null,
        matchedInstrument: null,
        disfluencyFiltered: true,
        provider: 'AssemblyAI Dictation',
        desk,
      }, { headers });
    }

    const parsed = parseDictatedTradeIntent(transcript);

    return Response.json({
      ok: true,
      transcript,
      verbatimTranscript: verbatimText || null,
      cleanedUp: usedRewrite,
      confidence: data.confidence ?? 0.95,
      parsedIntent: parsed.intent,
      parsedSpans: parsed.spans ?? null,
      matchedInstrument: parsed.matchedInstrument ? {
        id: parsed.matchedInstrument.id,
        symbol: parsed.matchedInstrument.symbol,
        name: parsed.matchedInstrument.name,
      } : null,
      disfluencyFiltered: true,
      provider: 'AssemblyAI Dictation',
      desk,
    }, { headers });
  } catch (err) {
    return Response.json({
      error: 'server_error',
      message: err instanceof Error ? err.message : 'Failed to process dictation audio',
    }, { status: 500, headers });
  }
}

