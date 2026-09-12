'use client';

import { useState, useRef, useCallback } from 'react';
import type { TradeIntent } from '@/lib/trading/domain';
import { playSolenoidClick } from '@/lib/sounds';

export interface DictationState {
  status: 'idle' | 'recording' | 'transcribing' | 'success' | 'error';
  transcript: string | null;
  error: string | null;
  provider: string | null;
}

export interface UseDictationOptions {
  onIntentParsed?: (intent: Partial<TradeIntent>, transcript: string) => void;
}

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

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    startTimeRef.current = 0;
  }, []);

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

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

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
      setState({
        status: 'error',
        transcript: null,
        error: err instanceof Error ? err.message : 'Microphone access denied or unavailable.',
        provider: null,
      });
    }
  }, [cleanup]);

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
        error: 'Dictation was too short — please speak while holding or recording.',
        provider: null,
      });
      return;
    }

    setState(prev => ({ ...prev, status: 'transcribing' }));

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });

          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch('/api/dictation', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `Dictation request failed (${response.status})`);
          }

          const result = await response.json();
          const cleanTranscript = result.transcript || '';

          setState({
            status: 'success',
            transcript: cleanTranscript,
            error: null,
            provider: result.provider || 'AssemblyAI Dictation',
          });

          if (result.parsedIntent && options?.onIntentParsed) {
            options.onIntentParsed(result.parsedIntent, cleanTranscript);
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
