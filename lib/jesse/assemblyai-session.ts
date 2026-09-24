'use client';

/**
 * Browser session for AssemblyAI's Voice Agent API: microphone capture,
 * playback, and the WebSocket protocol. The audio path follows AssemblyAI's
 * browser guide (github.com/AssemblyAI/voice-agent-starter-js):
 *   - the mic is opened with echo cancellation ON and noise suppression OFF;
 *   - both AudioContexts run at the device rate and a worklet resamples to
 *     and from the 24 kHz wire, so Safari (which ignores sampleRate) and
 *     Firefox (whose echo canceller only sees the default graph) both work;
 *   - playback is a ring buffer that barge-in empties.
 * `session.end` is always sent on hang-up so the 30 s resume window is not
 * billed.
 */
import { AAI_WIRE_RATE, AAI_WS_URL, ToolResultQueue } from './assemblyai-agent';

export type AaiServerEvent = { type: string; [key: string]: unknown };

export interface AaiSessionHandlers {
  onReady: () => void;
  onUserTranscript: (text: string, final: boolean) => void;
  onAgentTranscript: (text: string, interrupted: boolean) => void;
  onSpeaking: (speaking: boolean) => void;
  onToolCall: (name: string, args: Record<string, unknown>) => Promise<string>;
  onEnded: (reason: 'ended' | 'dropped') => void;
  onError: (message: string) => void;
}

/* Capture: float at the device rate → PCM16 at 24 kHz (linear resample). */
const CAPTURE_WORKLET = `
class Capture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / options.processorOptions.wireRate;
    this.pos = 0; this.prev = 0;
  }
  pcm(samples, len) {
    const out = new Int16Array(len);
    for (let i = 0; i < len; i++) { const s = Math.max(-1, Math.min(1, samples[i])); out[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    return out;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.ratio === 1) { const p = this.pcm(ch, ch.length); this.port.postMessage(p.buffer, [p.buffer]); return true; }
    const n = ch.length, src = new Float32Array(n + 1);
    src[0] = this.prev; src.set(ch, 1);
    const out = new Float32Array(Math.ceil((n + 1) / this.ratio) + 2);
    let len = 0, pos = this.pos;
    while (pos < n) { const i = Math.floor(pos), f = pos - i; out[len++] = src[i] + (src[i + 1] - src[i]) * f; pos += this.ratio; }
    this.pos = pos - n; this.prev = ch[n - 1];
    if (len) { const p = this.pcm(out, len); this.port.postMessage(p.buffer, [p.buffer]); }
    return true;
  }
}
registerProcessor('aai-capture', Capture);`;

/* Playback: PCM16 at 24 kHz → a ring buffer at the device rate. 'stop' empties it. */
const PLAYBACK_WORKLET = `
class Playback extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ring = new Float32Array(sampleRate * 30);
    this.w = 0; this.r = 0; this.avail = 0;
    this.step = options.processorOptions.wireRate / sampleRate;
    this.rsPos = 0; this.rsPrev = 0; this.drained = false;
    this.port.onmessage = (e) => {
      if (e.data === 'stop') { this.w = this.r = this.avail = 0; this.rsPos = this.rsPrev = 0; return; }
      const s = new Int16Array(e.data);
      if (!s.length) return;
      if (this.drained) { this.rsPrev = 0; this.rsPos = 0; this.drained = false; }
      if (this.step === 1) { for (let i = 0; i < s.length; i++) this.push(s[i] / 32768); return; }
      const n = s.length; let pos = this.rsPos;
      while (pos < n) { const i = Math.floor(pos), f = pos - i; const a = i === 0 ? this.rsPrev : s[i - 1] / 32768; const b = s[i] / 32768; this.push(a + (b - a) * f); pos += this.step; }
      this.rsPos = pos - n; this.rsPrev = s[n - 1] / 32768;
    };
  }
  push(v) { if (this.avail < this.ring.length) { this.ring[this.w] = v; this.w = (this.w + 1) % this.ring.length; this.avail++; } }
  process(inputs, outputs) {
    const out = outputs[0][0];
    for (let i = 0; i < out.length; i++) {
      if (this.avail > 0) { out[i] = this.ring[this.r]; this.r = (this.r + 1) % this.ring.length; this.avail--; }
      else { out[i] = 0; this.drained = true; }
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('aai-playback', Playback);`;

async function worklet(ctx: AudioContext, code: string, name: string): Promise<AudioWorkletNode> {
  const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  try { await ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
  return new AudioWorkletNode(ctx, name, { processorOptions: { wireRate: AAI_WIRE_RATE } });
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(data: string): ArrayBuffer {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

export function friendlyAaiError(code: string | undefined, message: string | undefined): string {
  if (code === 'at_capacity' || code === 'concurrency_exceeded' || code === 'server_error') {
    return 'Jesse’s line is busy. Ring again in a moment.';
  }
  if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return 'Jesse’s line could not be authorised. Ring again.';
  if (code === 'session_expired') return 'The call reached its ten-minute limit. Ring again to carry on.';
  return message ? `The line dropped: ${message}` : 'The line dropped. Ring again when you are ready.';
}

export class AssemblyAiVoiceSession {
  private ws: WebSocket | null = null;
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private playback: AudioWorkletNode | null = null;
  private mic: MediaStream | null = null;
  private ready = false;
  private muted = false;
  private closed = false;
  private endedCleanly = false;
  private queue: ToolResultQueue | null = null;

  constructor(private readonly handlers: AaiSessionHandlers) {}

  /** Must be called from a user gesture (Safari gates audio on it). */
  async start(token: string, firstUpdate: object): Promise<void> {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot open a voice line. Use the ticket instead.');
    this.captureCtx = new Ctx();
    this.playbackCtx = new Ctx();
    await Promise.all([this.captureCtx.resume(), this.playbackCtx.resume()]);
    this.playback = await worklet(this.playbackCtx, PLAYBACK_WORKLET, 'aai-playback');
    this.playback.connect(this.playbackCtx.destination);

    this.mic = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    if (this.closed) { this.teardown(); return; }
    const capture = await worklet(this.captureCtx, CAPTURE_WORKLET, 'aai-capture');
    this.captureCtx.createMediaStreamSource(this.mic).connect(capture);

    const url = new URL(AAI_WS_URL);
    url.searchParams.set('token', token);
    const ws = new WebSocket(url);
    this.ws = ws;
    this.queue = new ToolResultQueue(message => { if (ws.readyState === WebSocket.OPEN) ws.send(message); });

    capture.port.onmessage = ({ data }: MessageEvent<ArrayBuffer>) => {
      if (!this.ready || this.muted || ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: 'input.audio', audio: toBase64(data) }));
    };
    ws.onopen = () => ws.send(JSON.stringify(firstUpdate));
    ws.onmessage = ({ data }) => { void this.handle(JSON.parse(String(data)) as AaiServerEvent); };
    ws.onclose = () => {
      const reason = this.endedCleanly || this.closed ? 'ended' : 'dropped';
      this.teardown();
      this.handlers.onEnded(reason);
    };
    ws.onerror = () => { if (!this.ready) this.handlers.onError('Jesse’s line could not be opened. Ring again.'); };
  }

  /** Mid-call `session.update` — progressive tool reveal lives here. */
  update(message: object): void {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  setMuted(muted: boolean): void { this.muted = muted; }
  get isMuted(): boolean { return this.muted; }

  /** Hang up: `session.end` first so billing stops, socket close as backstop. */
  end(): void {
    if (this.closed) return;
    this.closed = true;
    const ws = this.ws;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'session.end' }));
      setTimeout(() => { if (ws.readyState === WebSocket.OPEN) ws.close(); }, 3000);
    } else {
      ws?.close();
    }
    this.playback?.port.postMessage('stop');
    this.stopAudio();
    if (!ws) this.handlers.onEnded('ended');
  }

  private async handle(event: AaiServerEvent): Promise<void> {
    switch (event.type) {
      case 'session.ready':
        this.ready = true;
        this.handlers.onReady();
        return;
      case 'input.speech.started':
        this.playback?.port.postMessage('stop');
        this.queue?.busy();
        return;
      case 'reply.started':
        this.queue?.busy();
        this.handlers.onSpeaking(true);
        return;
      case 'reply.audio':
        if (typeof event.data === 'string') {
          const buffer = fromBase64(event.data);
          this.playback?.port.postMessage(buffer, [buffer]);
        }
        return;
      case 'reply.done':
        if (event.status === 'interrupted') this.playback?.port.postMessage('stop');
        this.handlers.onSpeaking(false);
        this.queue?.done(typeof event.status === 'string' ? event.status : undefined);
        return;
      case 'transcript.user.delta':
        if (typeof event.text === 'string') this.handlers.onUserTranscript(event.text, false);
        return;
      case 'transcript.user':
        if (typeof event.text === 'string') this.handlers.onUserTranscript(event.text, true);
        return;
      case 'transcript.agent':
        if (typeof event.text === 'string') this.handlers.onAgentTranscript(event.text, event.interrupted === true);
        return;
      case 'tool.call': {
        const callId = String(event.call_id ?? '');
        const name = String(event.name ?? '');
        const args = (event.arguments && typeof event.arguments === 'object') ? event.arguments as Record<string, unknown> : {};
        try {
          const result = await this.handlers.onToolCall(name, args);
          this.queue?.push(callId, result);
        } catch (err) {
          this.queue?.push(callId, err instanceof Error ? err.message : 'That tool failed. Tell the caller plainly.', true);
        }
        return;
      }
      case 'session.ended':
        this.endedCleanly = true;
        this.ws?.close();
        return;
      case 'session.error': {
        const code = typeof event.code === 'string' ? event.code : undefined;
        const message = typeof event.message === 'string' ? event.message : undefined;
        /* Client-message errors leave the session alive; only report the fatal ones. */
        if (code && ['invalid_format', 'invalid_audio', 'invalid_value', 'invalid_config', 'immutable_field'].includes(code)) return;
        this.handlers.onError(friendlyAaiError(code, message));
        return;
      }
      default:
    }
  }

  private stopAudio(): void {
    this.mic?.getTracks().forEach(track => track.stop());
    void this.captureCtx?.close().catch(() => undefined);
    void this.playbackCtx?.close().catch(() => undefined);
    this.mic = null;
    this.captureCtx = null;
    this.playbackCtx = null;
    this.playback = null;
  }

  private teardown(): void {
    this.ready = false;
    this.stopAudio();
    this.ws = null;
  }
}
