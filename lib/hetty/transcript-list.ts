/**
 * Account transcript listing helpers — compact previews for retrieve/delete,
 * not a chat archive UI.
 */

export type TranscriptTurn = { role: 'user' | 'agent'; text: string; at: number };

export type StoredTranscript = {
  conversationId: string;
  turns: TranscriptTurn[];
  startedAt: number;
  endedAt: number;
  revision?: number;
};

export type TranscriptListItem = {
  conversationId: string;
  startedAt: number;
  endedAt: number;
  turnCount: number;
  preview: string;
};

const LIST_CAP = 20;

export function transcriptListPreview(turns: readonly TranscriptTurn[]): string {
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === 'user' && turns[i].text.trim()) {
      const text = turns[i].text.trim();
      return text.length > 120 ? `${text.slice(0, 119)}…` : text;
    }
  }
  const last = turns[turns.length - 1];
  if (!last) return 'Saved call';
  const text = last.text.trim();
  return text.length > 120 ? `${text.slice(0, 119)}…` : text || 'Saved call';
}

export function toTranscriptListItem(
  conversationId: string,
  transcript: Pick<StoredTranscript, 'turns' | 'startedAt' | 'endedAt'>,
): TranscriptListItem {
  return {
    conversationId,
    startedAt: transcript.startedAt,
    endedAt: transcript.endedAt,
    turnCount: transcript.turns.length,
    preview: transcriptListPreview(transcript.turns),
  };
}

export function sortTranscriptList(items: readonly TranscriptListItem[]): TranscriptListItem[] {
  return [...items].sort((a, b) => b.endedAt - a.endedAt).slice(0, LIST_CAP);
}
