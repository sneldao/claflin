import './jsdom-setup';
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  AAI_JESSE_VOICE,
  JESSE_AAI_TOOLS,
  ToolResultQueue,
  allowedTools,
  jesseSessionUpdate,
  jesseToolUpdate,
  toolsForForeground,
} from '../lib/jesse/assemblyai-agent';
import { tools as ELEVENLABS_TOOLS } from '../scripts/jesse-agent-config.mjs';
import { AssemblyAiVoiceSession, friendlyAaiError } from '../lib/jesse/assemblyai-session';
import { jesseVoiceProvider } from '../lib/solana/flags';

const names = (kind: string) => toolsForForeground({ kind } as never).map(t => t.name).sort();

describe('Jesse on AssemblyAI — agent config', () => {
  it('ports every ElevenLabs tool as an AssemblyAI function tool with a JSON-Schema object', () => {
    assert.deepEqual(JESSE_AAI_TOOLS.map(t => t.name).sort(), (ELEVENLABS_TOOLS as { name: string }[]).map(t => t.name).sort());
    for (const tool of JESSE_AAI_TOOLS) {
      assert.equal(tool.type, 'function');
      assert.equal((tool.parameters as { type: string }).type, 'object', `${tool.name} parameters are an object schema`);
      assert.ok(tool.timeout_seconds >= 10 && tool.timeout_seconds <= 300);
    }
  });

  it('files paper in hold mode and everything else interactively', () => {
    for (const tool of JESSE_AAI_TOOLS) {
      assert.equal(tool.execution_mode, tool.name === 'record_paper' ? 'hold' : 'interactive', tool.name);
    }
  });

  it('constrains spoken amounts so a misheard amount is re-asked, not guessed', () => {
    const amount = JESSE_AAI_TOOLS.find(t => t.name === 'set_amount')!;
    const prop = (amount.parameters as { properties: { amount: { pattern: string; examples: string[] } } }).properties.amount;
    const re = new RegExp(`^(?:${prop.pattern})$`);
    for (const ok of prop.examples) assert.ok(re.test(ok), `example ${ok} matches`);
    for (const bad of ['-5', '1e3', 'a hundred', '00.5', '']) assert.ok(!re.test(bad), `${bad} is rejected`);
  });

  it('never reveals a signing, wallet or submit tool', () => {
    assert.ok(!JESSE_AAI_TOOLS.some(t => /sign|submit|execute|wallet|transfer/i.test(t.name)));
  });
});

describe('Jesse on AssemblyAI — progressive tool reveal', () => {
  it('registers record_paper only while a quotation is in review', () => {
    assert.ok(names('quotation').includes('record_paper'));
    for (const kind of ['draft', 'pending', 'receipt', 'archive', 'missing']) {
      assert.ok(!names(kind).includes('record_paper'), `${kind} cannot file`);
    }
  });

  it('keeps a filed or missing record read-only on the line', () => {
    for (const kind of ['receipt', 'archive', 'missing']) {
      assert.deepEqual(names(kind), ['describe_desk', 'explain_concept', 'watch_mark']);
    }
  });

  it('lets a pending estimate only be described or cancelled', () => {
    assert.deepEqual(names('pending'), ['cancel_instruction', 'describe_desk', 'explain_concept']);
  });

  it('the first session.update carries prompt, greeting, voice, keyterms and the draft tools', () => {
    const update = jesseSessionUpdate({ greeting: 'Claflin, Jesse speaking.', foreground: { kind: 'draft' }, instrument: '', stage: 'draft', priorDiscussion: null });
    assert.equal(update.type, 'session.update');
    assert.equal(update.session.greeting, 'Claflin, Jesse speaking.');
    assert.equal(update.session.output.voice, AAI_JESSE_VOICE);
    assert.match(update.session.system_prompt, /You are Jesse Livermore/);
    assert.match(update.session.system_prompt, /desk_mode: paper/);
    assert.ok(update.session.input.keyterms.includes('AAPLx'));
    assert.ok(!update.session.tools.some(t => t.name === 'record_paper'));
    assert.equal(allowedTools({ kind: 'draft' }).has('record_paper'), false);
  });

  it('a mid-call update replaces tools only — never the voice or greeting', () => {
    const update = jesseToolUpdate({ kind: 'quotation' });
    assert.deepEqual(Object.keys(update.session), ['tools']);
    assert.ok(update.session.tools.some(t => t.name === 'record_paper'));
  });
});

describe('Jesse on AssemblyAI — tool.result ordering', () => {
  it('holds results until reply.done, and drops them if the caller barged in', () => {
    const sent: string[] = [];
    const queue = new ToolResultQueue(m => sent.push(m));
    queue.busy();
    queue.push('c1', 'AAPLx is on the ticket.');
    assert.equal(sent.length, 0, 'mid-turn results wait');
    queue.done('completed');
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0]), { type: 'tool.result', call_id: 'c1', result: JSON.stringify({ result: 'AAPLx is on the ticket.' }) });

    queue.busy();
    queue.push('c2', 'stale');
    queue.done('interrupted');
    assert.equal(sent.length, 1, 'interrupted replies drop their pending results');
    assert.equal(queue.size, 0);
  });

  it('sends immediately when the agent is already idle, and flags errors', () => {
    const sent: string[] = [];
    const queue = new ToolResultQueue(m => sent.push(m));
    queue.push('c3', 'Browser storage is unavailable.', true);
    const msg = JSON.parse(sent[0]);
    assert.equal(msg.is_error, true);
    assert.deepEqual(JSON.parse(msg.result), { error: 'Browser storage is unavailable.' });
  });
});

describe('Jesse on AssemblyAI — provider choice', () => {
  it('defaults to the deploy default and honours ?line=', () => {
    assert.equal(jesseVoiceProvider('', 'elevenlabs'), 'elevenlabs');
    assert.equal(jesseVoiceProvider('?desk=jesse&line=assemblyai', 'elevenlabs'), 'assemblyai');
    assert.equal(jesseVoiceProvider('?line=elevenlabs', 'assemblyai'), 'elevenlabs');
    assert.equal(jesseVoiceProvider('?line=other', 'elevenlabs'), 'elevenlabs');
  });

  it('turns fatal session errors into plain words', () => {
    assert.match(friendlyAaiError('at_capacity', 'x'), /busy/);
    assert.match(friendlyAaiError('session_expired', undefined), /ten-minute/);
  });
});

/* ——— The browser session against a scripted Voice Agent socket ——— */

class FakeSocket {
  static OPEN = 1;
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: URL) { FakeSocket.last = this; setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 0); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.onclose?.(); }
  emit(event: Record<string, unknown>) { this.onmessage?.({ data: JSON.stringify(event) }); }
}

class FakeNode {
  port = { onmessage: null as unknown, postMessage: (_m: unknown) => { void _m; } };
  connect() { return this; }
}

class FakeAudioContext {
  audioWorklet = { addModule: async () => undefined };
  destination = {};
  async resume() {}
  async close() {}
  createMediaStreamSource() { return { connect: () => undefined }; }
}

describe('Jesse on AssemblyAI — browser session protocol', () => {
  const saved: Record<string, unknown> = {};
  let stopped = 0;

  beforeEach(() => {
    stopped = 0;
    for (const key of ['WebSocket', 'AudioContext', 'AudioWorkletNode']) saved[key] = (globalThis as Record<string, unknown>)[key];
    (globalThis as Record<string, unknown>).WebSocket = FakeSocket;
    (window as unknown as Record<string, unknown>).WebSocket = FakeSocket;
    (window as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
    (globalThis as Record<string, unknown>).AudioWorkletNode = FakeNode;
    (globalThis as Record<string, unknown>).URL.createObjectURL = () => 'blob:x';
    (globalThis as Record<string, unknown>).URL.revokeObjectURL = () => undefined;
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { stopped += 1; } }] }) },
    });
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) (globalThis as Record<string, unknown>)[key] = value;
  });

  it('opens with the token, sends the agent, runs tools after reply.done, and ends cleanly', async () => {
    const calls: string[] = [];
    const heard: string[] = [];
    let ended: string | null = null;
    const session = new AssemblyAiVoiceSession({
      onReady: () => calls.push('ready'),
      onUserTranscript: (t, final) => { if (final) heard.push(t); },
      onAgentTranscript: () => undefined,
      onSpeaking: () => undefined,
      onToolCall: async (name, args) => { calls.push(`${name}:${JSON.stringify(args)}`); return 'AAPLx (Apple xStock) is on the ticket.'; },
      onEnded: reason => { ended = reason; },
      onError: message => calls.push(`error:${message}`),
    });
    await session.start('tok_123', { type: 'session.update', session: { greeting: 'hi' } });
    const ws = FakeSocket.last!;
    assert.equal(ws.url.toString(), 'wss://agents.assemblyai.com/v1/ws?token=tok_123');
    await new Promise(r => setTimeout(r, 5));
    assert.equal(ws.sent[0].type, 'session.update', 'the agent config is the first frame');

    ws.emit({ type: 'session.ready', session_id: 's1' });
    ws.emit({ type: 'transcript.user', text: 'Buy a hundred dollars of Apple' });
    ws.emit({ type: 'reply.started', reply_id: 'fc-c1' });
    ws.emit({ type: 'tool.call', call_id: 'c1', name: 'choose_instrument', arguments: { query: 'Apple' } });
    await new Promise(r => setTimeout(r, 5));
    assert.ok(!ws.sent.some(m => m.type === 'tool.result'), 'no result while the reply is in flight');
    ws.emit({ type: 'reply.done', reply_id: 'fc-c1', status: 'completed' });
    const result = ws.sent.find(m => m.type === 'tool.result')!;
    assert.equal(result.call_id, 'c1');
    assert.deepEqual(calls.slice(0, 2), ['ready', 'choose_instrument:{"query":"Apple"}']);
    assert.deepEqual(heard, ['Buy a hundred dollars of Apple']);

    session.update({ type: 'session.update', session: { tools: [] } });
    assert.equal(ws.sent.filter(m => m.type === 'session.update').length, 2, 'mid-call reveal is sent');

    session.end();
    assert.equal(ws.sent.at(-1)!.type, 'session.end', 'hang-up stops billing with session.end');
    assert.equal(stopped, 1, 'the microphone track is released');
    ws.emit({ type: 'session.ended' });
    assert.equal(ended, 'ended');
  });

  it('reports a dropped socket as dropped, not ended', async () => {
    let ended: string | null = null;
    const session = new AssemblyAiVoiceSession({
      onReady: () => undefined, onUserTranscript: () => undefined, onAgentTranscript: () => undefined,
      onSpeaking: () => undefined, onToolCall: async () => '', onEnded: r => { ended = r; }, onError: () => undefined,
    });
    await session.start('tok', { type: 'session.update', session: {} });
    await new Promise(r => setTimeout(r, 5));
    FakeSocket.last!.emit({ type: 'session.ready', session_id: 's2' });
    FakeSocket.last!.close();
    assert.equal(ended, 'dropped');
  });
});

describe('Jesse on AssemblyAI — token route', () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ASSEMBLYAI_API_KEY;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY; else process.env.ASSEMBLYAI_API_KEY = originalKey;
  });

  async function post(ip: string) {
    const { POST } = await import('../app/api/desk/jesse/voice-agent/token/route');
    const { NextRequest } = await import('next/server');
    return POST(new NextRequest('http://localhost/api/desk/jesse/voice-agent/token', { method: 'POST', headers: { 'x-forwarded-for': ip } }));
  }

  it('is honestly unavailable without a key', async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    const res = await post('10.0.0.1');
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, 'not_connected');
  });

  it('mints a single-use voice-agent token server-side and never echoes the key', async () => {
    process.env.ASSEMBLYAI_API_KEY = 'secret-key';
    let seen: { url: string; auth: string | null } | null = null;
    globalThis.fetch = (async (url: URL | string, init?: RequestInit) => {
      seen = { url: String(url), auth: new Headers(init?.headers).get('authorization') };
      return new Response(JSON.stringify({ token: 'tok_abc', expires_in_seconds: 60 }), { status: 200 });
    }) as typeof fetch;
    const res = await post('10.0.0.2');
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.token, 'tok_abc');
    assert.equal(body.maxSessionSeconds, 600);
    assert.doesNotMatch(JSON.stringify(body), /secret-key/);
    assert.equal(seen!.auth, 'secret-key');
    const url = new URL(seen!.url);
    assert.equal(url.origin + url.pathname, 'https://agents.assemblyai.com/v1/token');
    assert.equal(url.searchParams.get('product'), 'voice_agent');
    assert.equal(url.searchParams.get('expires_in_seconds'), '60');
    assert.equal(url.searchParams.get('max_session_duration_seconds'), '600');
  });

  it('does not pass an upstream refusal off as a token', async () => {
    process.env.ASSEMBLYAI_API_KEY = 'secret-key';
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    const res = await post('10.0.0.3');
    assert.equal(res.status, 502);
    assert.equal((await res.json()).token, undefined);
  });
});
