/**
 * Discussion continuity helpers — captions on the desk are not agent memory
 * until an explicit resume passes a bounded summary into the next session.
 */

export type DiscussionCaption = {
  role: 'user' | 'agent';
  text: string;
  at: number;
};

const CAPTION_LIMIT = 50;
const CONTEXT_MAX = 480;

/** Append-only caption store. Bounded and newest-last. */
export function appendCaption(
  previous: readonly DiscussionCaption[],
  caption: DiscussionCaption,
): DiscussionCaption[] {
  const next = [...previous, caption];
  return next.length > CAPTION_LIMIT ? next.slice(next.length - CAPTION_LIMIT) : next;
}

/** Latest caption for a side, or null when that side has not spoken yet. */
export function lastCaption(
  captions: readonly DiscussionCaption[],
  role: DiscussionCaption['role'],
): DiscussionCaption | null {
  for (let i = captions.length - 1; i >= 0; i--) {
    if (captions[i].role === role) return captions[i];
  }
  return null;
}

/** A short inspectable summary of the discussion so far — the last exchange,
 *  never authority. The ticket stays the instruction of record. */
export function summarizeDiscussion(captions: readonly DiscussionCaption[]): string | null {
  const user = lastCaption(captions, 'user');
  const agent = lastCaption(captions, 'agent');
  if (!user && !agent) return null;
  const parts: string[] = [];
  if (user) parts.push(`You said: ${user.text}`);
  if (agent) parts.push(`Hetty replied: ${agent.text}`);
  return `Last exchange — ${parts.join(' ')} (${captions.length} ${captions.length === 1 ? 'line' : 'lines'} this session). The ticket holds the instruction.`;
}

/** Bounded prior-discussion context for the next voice session. Null when
 *  there is nothing to resume. Truncated for dynamic-variable limits. */
export function boundedDiscussionContext(
  captions: readonly DiscussionCaption[],
  maxChars = CONTEXT_MAX,
): string | null {
  if (captions.length === 0) return null;
  const recent = captions.slice(-6);
  const lines = recent.map(c => {
    const who = c.role === 'user' ? 'Caller' : 'Hetty';
    const text = c.text.length > 140 ? `${c.text.slice(0, 139)}…` : c.text;
    return `${who}: ${text}`;
  });
  let joined = lines.join(' · ');
  if (joined.length > maxChars) joined = `${joined.slice(0, maxChars - 1)}…`;
  return joined;
}

/** Opening line when the caller chose Resume — ticket opening plus a brief
 *  acknowledgment of the prior exchange. Fresh rings use ticket opening alone. */
export function openingWithResume(
  ticketOpening: string,
  captions: readonly DiscussionCaption[],
): string {
  const user = lastCaption(captions, 'user');
  if (!user) return ticketOpening;
  const clipped = user.text.length > 160 ? `${user.text.slice(0, 159)}…` : user.text;
  return `Continuing our discussion. Last you said: "${clipped}". ${ticketOpening}`;
}
