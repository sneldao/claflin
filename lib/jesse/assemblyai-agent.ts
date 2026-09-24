/**
 * Jesse on AssemblyAI's Voice Agent API — the session config and the two
 * pieces of policy that make it safe: progressive tool reveal and ordered
 * tool results. Pure: no DOM, no socket.
 *
 * The prompt and tool wording are shared with the ElevenLabs agent
 * (scripts/jesse-agent-config.mjs) so both lines describe the same desk.
 * Tools execute in the caller's browser against useJesseDesk; the agent has
 * no wallet and no signing tool on either provider.
 *
 * Docs: https://www.assemblyai.com/docs/voice-agents/voice-agent-api
 */
import { SYSTEM_PROMPT, tools as SHARED_TOOLS } from '../../scripts/jesse-agent-config.mjs';
import type { JesseForeground } from '../solana/desk-documents';

/** Only the document kind decides which tools exist. */
type ForegroundKind = Pick<JesseForeground, 'kind'>;

export const AAI_WS_URL = 'wss://agents.assemblyai.com/v1/ws';
export const AAI_TOKEN_URL = 'https://agents.assemblyai.com/v1/token';
/** PCM16 mono, both directions (Voice Agent API default wire format). */
export const AAI_WIRE_RATE = 24_000;
/** UK voice; a steady, low register for Jesse. */
export const AAI_JESSE_VOICE = 'charles';

export type JesseToolName =
  | 'choose_instrument' | 'set_instruction' | 'set_amount' | 'request_estimate'
  | 'compare_markets' | 'record_paper' | 'cancel_instruction' | 'describe_desk'
  | 'watch_mark' | 'explain_concept';

interface SharedTool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  response_timeout_secs?: number;
}

export interface AaiFunctionTool {
  type: 'function';
  name: JesseToolName;
  description: string;
  parameters: Record<string, unknown>;
  execution_mode: 'interactive' | 'hold';
  timeout_seconds: number;
}

/* Shape hints the Voice Agent API validates before a tool runs: a spoken
   amount that is not a plain positive number is re-asked, not guessed. */
const PARAMETER_HINTS: Partial<Record<JesseToolName, Record<string, Record<string, unknown>>>> = {
  set_amount: { amount: { pattern: '(0|[1-9][0-9]*)(\\.[0-9]+)?', examples: ['100', '250', '0.5'] } },
  choose_instrument: { query: { examples: ['Apple', 'NVIDIA', 'TSLAx'] } },
};

/* Filing is the one consequential step — the broker goes quiet until the
   browser has written (or refused) the record. */
const HOLD: ReadonlySet<JesseToolName> = new Set(['record_paper']);

function toAai(tool: SharedTool): AaiFunctionTool {
  const name = tool.name as JesseToolName;
  const parameters = structuredClone(tool.parameters ?? { type: 'object', properties: {} }) as {
    type: 'object'; properties: Record<string, Record<string, unknown>>; required?: string[];
  };
  for (const [prop, hint] of Object.entries(PARAMETER_HINTS[name] ?? {})) {
    if (parameters.properties[prop]) parameters.properties[prop] = { ...parameters.properties[prop], ...hint };
  }
  return {
    type: 'function',
    name,
    description: tool.description,
    parameters,
    execution_mode: HOLD.has(name) ? 'hold' : 'interactive',
    timeout_seconds: Math.max(10, tool.response_timeout_secs ?? 10),
  };
}

export const JESSE_AAI_TOOLS: readonly AaiFunctionTool[] = Object.freeze(
  (SHARED_TOOLS as SharedTool[]).map(toAai),
);

/**
 * Progressive tool reveal: the agent can only reach tools that make sense
 * for the document in front of the caller. `record_paper` exists only while
 * a quotation is under review — the model cannot file what it cannot call.
 */
export function toolsForForeground(foreground: ForegroundKind): readonly AaiFunctionTool[] {
  const allowed = allowedTools(foreground);
  return JESSE_AAI_TOOLS.filter(tool => allowed.has(tool.name));
}

const ALWAYS: readonly JesseToolName[] = ['describe_desk', 'explain_concept'];
const DRAFTING: readonly JesseToolName[] = [
  'choose_instrument', 'set_instruction', 'set_amount', 'request_estimate',
  'compare_markets', 'cancel_instruction', 'watch_mark',
];

export function allowedTools(foreground: ForegroundKind): ReadonlySet<JesseToolName> {
  switch (foreground.kind) {
    case 'quotation':
      return new Set([...ALWAYS, ...DRAFTING, 'record_paper']);
    case 'pending':
      return new Set([...ALWAYS, 'cancel_instruction']);
    case 'receipt':
    case 'archive':
    case 'missing':
      return new Set([...ALWAYS, 'watch_mark']);
    default:
      return new Set([...ALWAYS, ...DRAFTING]);
  }
}

/** Short, spoken-safe context appended to the shared prompt per call. */
export function sessionContext(input: {
  foreground: string;
  instrument: string;
  stage: string;
  priorDiscussion: string | null;
}): string {
  const lines = [
    '',
    'THIS CALL',
    `- desk_mode: paper. desk_foreground: ${input.foreground}. desk_stage: ${input.stage}. desk_instrument: ${input.instrument || 'none'}.`,
    '- Only the tools you can see exist right now. If filing is not available, there is no quotation in review — say so and offer an estimate.',
    '- Speak in short sentences for a voice call. No lists, no markdown, no exclamation marks.',
  ];
  if (input.priorDiscussion) {
    lines.push(`- discussion_resume: yes. prior_discussion: ${input.priorDiscussion}`);
  } else {
    lines.push('- discussion_resume: no.');
  }
  return `${SYSTEM_PROMPT}\n${lines.join('\n')}`;
}

export interface JesseSessionInput {
  greeting: string;
  foreground: ForegroundKind;
  instrument: string;
  stage: string;
  priorDiscussion: string | null;
}

/** The first `session.update` — the whole agent, versioned in this repo. */
export function jesseSessionUpdate(input: JesseSessionInput) {
  return {
    type: 'session.update' as const,
    session: {
      system_prompt: sessionContext({
        foreground: input.foreground.kind,
        instrument: input.instrument,
        stage: input.stage,
        priorDiscussion: input.priorDiscussion,
      }),
      greeting: input.greeting,
      output: { voice: AAI_JESSE_VOICE },
      input: {
        keyterms: ['AAPLx', 'NVDAx', 'TSLAx', 'xStock', 'USDC', 'Jupiter', 'Metis', 'Solana', 'paper record', 'scaled units'],
      },
      tools: toolsForForeground(input.foreground),
    },
  };
}

/** A later reveal: tools (and only tools) for the new foreground. */
export function jesseToolUpdate(foreground: ForegroundKind) {
  return { type: 'session.update' as const, session: { tools: toolsForForeground(foreground) } };
}

/**
 * Tool results must be sent only when `reply.done` is the latest event
 * (AssemblyAI client-side tools contract). Results that finish mid-turn
 * wait; an interrupted reply drops what was pending for it.
 */
export class ToolResultQueue {
  private idle = true;
  private pending: { call_id: string; result: string; is_error?: boolean }[] = [];

  constructor(private readonly send: (message: string) => void) {}

  /** reply.started / input.speech.started — a turn is in flight. */
  busy(): void { this.idle = false; }

  /** reply.done — flush unless the user barged in. */
  done(status: string | undefined): void {
    this.idle = true;
    if (status === 'interrupted') { this.pending = []; return; }
    this.flush();
  }

  push(call_id: string, result: string, is_error = false): void {
    this.pending.push({ call_id, result: JSON.stringify(is_error ? { error: result } : { result }), ...(is_error ? { is_error: true } : {}) });
    this.flush();
  }

  get size(): number { return this.pending.length; }

  private flush(): void {
    if (!this.idle) return;
    for (const item of this.pending) this.send(JSON.stringify({ type: 'tool.result', ...item }));
    this.pending = [];
  }
}
