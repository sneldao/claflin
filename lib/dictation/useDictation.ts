'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { TradeIntent } from '@/lib/trading/domain';
import { playSolenoidClick } from '@/lib/sounds';

export interface DictationState {
  status: 'idle' | 'recording' | 'transcribing' | 'success' | 'error';
  transcript: string | null;
  error: string | null;
  provider: string | null;
}

/** What the parser resolved — the intent plus the literal words that wrote
    each field, so the slip can mark them "said". */
export interface ParsedDictation {
  intent: Partial<TradeIntent>;
  spans?: { instrument?: string; side?: string; amount?: string };
  /** The raw words as heard, before any LLM cleanup — spans only count
      as "said" when they occur here. */
  verbatimTranscript?: string | null;
  cleanedUp?: boolean;
}

export interface UseDictationOptions {
  onIntentParsed?: (intent: Partial<TradeIntent>, transcript: string, parsed: ParsedDictation) => void;
}

/* The Wake Lock API is not in every TS DOM lib yet — a structural type is
   all the hook needs. */
type WakeLockSentinelLike = { release: () => Promise<void> };

export function useDictation(options?: UseDictationOptions) {
  const [state, setState] = useState<DictationState>({
    status: 'idle',
    transcript: null,
    error: null,
    provider: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startTimeRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

  const releaseWakeLock = useCallback(() => {
    void wakeLockRef.current?.release().catch(() => {});
    wakeLockRef.current = null;
  }, []);

  /* A dimmed screen reads as a dead mic: hold the display awake while the
     caller talks. A nicety only — never blocks dictation. */
  const acquireWakeLock = useCallback(async () => {
    try {
      const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } }).wakeLock;
      wakeLockRef.current = (await wakeLock?.request('screen')) ?? null;
    } catch {
      wakeLockRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    startTimeRef.current = 0;
    releaseWakeLock();
  }, [releaseWakeLock]);

  /* The OS drops the wake lock when the tab hides; retake it on return if
     the caller is still mid-sentence. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && mediaRecorderRef.current?.state === 'recording') {
        void acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [acquireWakeLock]);

  const startRecording = useCallback(async () => {
    try {
      cleanup();
      playSolenoidClick('engage');
      setState({
        status: 'recording',
        transcript: null,
        error: null,
        provider: null,
      });

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser cannot access the microphone. Type the instruction below instead — dictation is optional.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      /* A call, Siri, or a pulled headset ends the track without asking.
         stop() never fires 'ended', so our own cleanup cannot trip this. */
      stream.getAudioTracks().forEach(track => {
        track.addEventListener('ended', () => {
          cleanup();
          setState({
            status: 'error',
            transcript: null,
            error: 'The microphone was interrupted — try again when the line is clear, or type the instruction below.',
            provider: null,
          });
        });
      });

      void acquireWakeLock();

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start(100);
    } catch (err) {
      cleanup();
      const raw = err instanceof Error ? err.message : 'Microphone access denied or unavailable.';
      const friendly = /denied|permission|not allowed|notallowed|secure/i.test(raw)
        ? 'Microphone is blocked — allow microphone access in the browser address bar, then try again. Or type the instruction below; dictation is optional.'
        : /not found|no device|notfound|devices/i.test(raw)
          ? 'No microphone found on this device. Type the instruction below instead.'
          : raw;
      setState({
        status: 'error',
        transcript: null,
        error: friendly,
        provider: null,
      });
    }
  }, [cleanup, acquireWakeLock]);

  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    playSolenoidClick('release');

    const durationMs = Date.now() - startTimeRef.current;
    if (durationMs < 200) {
      cleanup();
      setState({
        status: 'error',
        transcript: null,
        error: 'That was too short to hear — try again and say something like “Buy 100 USDC of Nvidia”.',
        provider: null,
      });
      return;
    }

    if (durationMs < 800) {
      cleanup();
      setState({
        status: 'error',
        transcript: null,
        error: 'That clip was very short — try a full sentence, e.g. “Buy 100 USDC of Nvidia”. Or type it below.',
        provider: null,
      });
      return;
    }

    setState(prev => ({ ...prev, status: 'transcribing' }));

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          // Dictation only accepts WAV or raw PCM — transcode the captured
          // webm/opus to 16kHz mono WAV before upload (415 otherwise).
          const wavBlob = await transcodeToWav(
            new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' }),
          );

          const formData = new FormData();
          formData.append('audio', wavBlob, 'recording.wav');

          const response = await fetch('/api/dictation', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({} as { error?: string; message?: string }));
            throw new Error(friendlyDictationError(response.status, errData.error, errData.message));
          }

          const result = await response.json();
          const cleanTranscript = (result.transcript || '').trim();

          if (!cleanTranscript) {
            throw new Error('I could not hear any words in that recording — try again a little louder, closer to the mic, or type the instruction below.');
          }

          setState({
            status: 'success',
            transcript: cleanTranscript,
            error: null,
            provider: result.provider || 'AssemblyAI Dictation',
          });

          if (result.parsedIntent && options?.onIntentParsed) {
            options.onIntentParsed(result.parsedIntent, cleanTranscript, {
              intent: result.parsedIntent,
              spans: result.parsedSpans ?? undefined,
              verbatimTranscript: result.verbatimTranscript ?? null,
              cleanedUp: result.cleanedUp === true,
            });
          }
        } catch (err) {
          setState({
            status: 'error',
            transcript: null,
            error: err instanceof Error ? err.message : 'Dictation transcription failed.',
            provider: null,
          });
        } finally {
          cleanup();
          resolve();
        }
      };

      recorder.stop();
    });
  }, [cleanup, options]);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    cleanup();
    setState({
      status: 'idle',
      transcript: null,
      error: null,
      provider: null,
    });
  }, [cleanup]);

  return {
    state,
    isRecording: state.status === 'recording',
    isTranscribing: state.status === 'transcribing',
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

/**
 * Decode any browser-captured audio and re-encode as 16kHz mono 16-bit WAV —
 * the format AssemblyAI Dictation accepts (webm/opus is rejected with 415).
 * Runs entirely in the browser via WebAudio; no extra dependency.
 */
async function transcodeToWav(source: Blob): Promise<Blob> {
  const buffer = await source.arrayBuffer();
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return source;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const targetRate = 16000;
    const length = Math.max(1, Math.floor(decoded.duration * targetRate));
    const offline = new OfflineAudioContext(1, length, targetRate);
    const src = offline.createBufferSource();
    // Downmix to mono: average all channels into one.
    const mono = offline.createBuffer(1, decoded.length, decoded.sampleRate);
    const out = mono.getChannelData(0);
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < data.length; i++) out[i] = (out[i] ?? 0) + data[i]! / decoded.numberOfChannels;
    }
    src.buffer = mono;
    src.connect(offline.destination);
    src.start();
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0), targetRate);
  } finally {
    void ctx.close().catch(() => {});
  }
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);
  const writeStr = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Translate a dictation API failure into plain words for the ticket.
 * Never leaks status codes, provider names-as-jargon, or raw payloads —
 * the desk always offers the manual path forward.
 */
export function friendlyDictationError(status: number, code?: string, serverMessage?: string): string {
  if (status === 429 || code === 'rate_limited') {
    return 'Too many dictation tries in a row — wait a few seconds, then try again. Typing still works.';
  }
  if (status === 413 || code === 'payload_too_large') {
    return 'That recording ran long — keep it under ~30 seconds and try again. Or type the instruction below.';
  }
  if (status === 422 || code === 'no_speech') {
    return 'No words came through in that recording — try again a little louder, closer to the mic, or type the instruction below.';
  }
  if (status === 400 || code === 'bad_request') {
    return serverMessage && /empty|no audio/i.test(serverMessage)
      ? 'Nothing was captured — try again, speaking a full sentence. Or type the instruction below.'
      : 'That recording did not come through — try again, or type the instruction below.';
  }
  if (status === 503 || code === 'credits_exhausted') {
    return 'Voice transcription is at capacity right now — type the instruction below; the desk works the same.';
  }
  if (code === 'unsupported_audio') {
    return 'That recording came out garbled — try again, speaking steadily. Or type the instruction below.';
  }
  if (status >= 500) {
    return 'Voice transcription hiccuped — try once more, or type the instruction below. Nothing was lost.';
  }
  return serverMessage || 'Dictation did not go through — try again, or type the instruction below.';
}
