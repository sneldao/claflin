'use client';

import { memo, useCallback, useState } from 'react';
import { ConversationProvider } from '@elevenlabs/react';
import {
  appendCaption,
  boundedDiscussionContext,
  lastCaption,
  openingWithResume,
  summarizeDiscussion,
} from '@/lib/hetty/discussion';
import type { useTradingDesk } from '@/lib/trading/useTradingDesk';
import type { SlipProvenance } from '@/lib/desk/slip-provenance';
import { HettyCallSession, type Caption, type TranscriptSaveState } from './HettyCallSession';

type Desk = ReturnType<typeof useTradingDesk>;

export type { Caption, TranscriptSaveState };

export { appendCaption, lastCaption, summarizeDiscussion, boundedDiscussionContext, openingWithResume };

/* The outer shell owns the session lifecycle: every terminal event remounts
   the ConversationProvider (fresh socket, fresh locks), while the closing
   note, any error, and the discussion itself persist across the remount —
   the line can break; the caller's work does not. The wiring lives in
   HettyCallSession. */
export const HettyCall = memo(function HettyCall({ desk, liveMode, take = null, onLiveChange, onUserSpoken, onAgentSpoken, onLineApplied }: { desk: Desk; liveMode: boolean; take?: string | null; onLiveChange: (live: boolean) => void; onUserSpoken?: (text: string) => void; onAgentSpoken?: (text: string) => void; onLineApplied?: (partial: SlipProvenance) => void }) {
  const [sessionKey, setSessionKey] = useState(0);
  const [endNote, setEndNote] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [saveState, setSaveState] = useState<TranscriptSaveState>({ status: 'idle', attempts: 0 });
  const handleCaption = useCallback((caption: Caption) => {
    setCaptions(previous => appendCaption(previous, caption));
  }, []);
  const handleSaveState = useCallback((state: TranscriptSaveState) => { setSaveState(state); }, []);
  /* The discussion is the caller's work: it survives across rings and
     remounts. A fresh call begins a fresh save/attempt counter, but keeps
     what was already said so the caller can resume the thread. "Start fresh"
     is the deliberate way to clear it. */
  const handleActivity = useCallback(() => { setEndNote(null); setCallError(null); setSaveState({ status: 'idle', attempts: 0 }); }, []);
  const clearDiscussion = useCallback(() => setCaptions([]), []);
  const handleEnded = useCallback((note: string | null) => {
    setCallError(null);
    setEndNote(note);
    setSessionKey(k => k + 1);
  }, []);
  const handleFailed = useCallback((message: string) => {
    setEndNote(null);
    setCallError(message);
    setSessionKey(k => k + 1);
  }, []);
  return (
    <ConversationProvider key={sessionKey}>
      <HettyCallSession
        desk={desk}
        liveMode={liveMode}
        take={take}
        captions={captions}
        onCaption={handleCaption}
        saveState={saveState}
        onSaveState={handleSaveState}
        onClearDiscussion={clearDiscussion}
        onLiveChange={onLiveChange}
        onUserSpoken={onUserSpoken}
        onAgentSpoken={onAgentSpoken}
        onLineApplied={onLineApplied}
        endNote={endNote}
        callError={callError}
        onActivity={handleActivity}
        onSessionEnded={handleEnded}
        onSessionFailed={handleFailed}
      />
    </ConversationProvider>
  );
});
