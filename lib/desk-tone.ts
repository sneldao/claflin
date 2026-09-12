'use client';

import { useEffect, useRef, useState } from 'react';

const TONE_KEY = 'claflin.room-tone';

/**
 * Opt-in room tone: a distant floor, not a soundtrack.
 * Off by default. Silent while Hetty is on the line, when the tab is
 * hidden, and when the client prefers reduced motion? No — reduced-motion
 * is visual; sound stays independently controllable.
 */

function brownBuffer(ctx: AudioContext): AudioBuffer {
  const length = ctx.sampleRate * 2;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

function click(ctx: AudioContext, destination: AudioNode, now: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'square';
  osc.frequency.value = 1800 + Math.random() * 900;
  filter.type = 'highpass';
  filter.frequency.value = 1200;
  gain.gain.setValueAtTime(0.012, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function rumble(ctx: AudioContext, destination: AudioNode, now: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 62;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.018, now + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
  osc.connect(gain);
  gain.connect(destination);
  osc.start(now);
  osc.stop(now + 0.56);
}

/** Distant exchange pit murmur — soft filtered resonance simulating a busy floor downstairs */
function pitMurmur(ctx: AudioContext, destination: AudioNode, now: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = 'triangle';
  osc.frequency.value = 110 + Math.random() * 40;
  filter.type = 'bandpass';
  filter.frequency.value = 220;
  filter.Q.value = 2.0;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.008, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(destination);
  osc.start(now);
  osc.stop(now + 1.85);
}

export function useRoomTone(silenced: boolean) {
  const [enabled, setEnabledState] = useState(false);
  const userSet = useRef(false);

  useEffect(() => {
    if (userSet.current) return;
    try {
      setEnabledState(window.localStorage.getItem(TONE_KEY) === 'on');
    } catch { /* private mode — stay off */ }
  }, []);

  useEffect(() => {
    if (!enabled || silenced || typeof window === 'undefined') return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 280;
    filter.Q.value = 0.7;
    filter.connect(master);

    const noise = ctx.createBufferSource();
    noise.buffer = brownBuffer(ctx);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.045;
    noise.connect(noiseGain);
    noiseGain.connect(filter);
    noise.start();

    let cancelled = false;
    let clickTimer = 0;
    let rumbleTimer = 0;
    let murmurTimer = 0;

    const scheduleClick = () => {
      clickTimer = window.setTimeout(() => {
        if (cancelled || document.hidden) { scheduleClick(); return; }
        click(ctx, master, ctx.currentTime);
        scheduleClick();
      }, 2200 + Math.random() * 5200);
    };
    const scheduleRumble = () => {
      rumbleTimer = window.setTimeout(() => {
        if (cancelled || document.hidden) { scheduleRumble(); return; }
        rumble(ctx, master, ctx.currentTime);
        scheduleRumble();
      }, 14000 + Math.random() * 16000);
    };
    const scheduleMurmur = () => {
      murmurTimer = window.setTimeout(() => {
        if (cancelled || document.hidden) { scheduleMurmur(); return; }
        pitMurmur(ctx, master, ctx.currentTime);
        scheduleMurmur();
      }, 8000 + Math.random() * 12000);
    };
    scheduleClick();
    scheduleRumble();
    scheduleMurmur();

    const onHide = () => {
      master.gain.setTargetAtTime(document.hidden ? 0 : 0.22, ctx.currentTime, 0.08);
    };
    document.addEventListener('visibilitychange', onHide);
    void ctx.resume();

    return () => {
      cancelled = true;
      window.clearTimeout(clickTimer);
      window.clearTimeout(rumbleTimer);
      window.clearTimeout(murmurTimer);
      document.removeEventListener('visibilitychange', onHide);
      noise.stop();
      void ctx.close();
    };
  }, [enabled, silenced]);

  const setEnabled = (next: boolean) => {
    userSet.current = true;
    setEnabledState(next);
    try { window.localStorage.setItem(TONE_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
  };

  return { enabled, setEnabled };
}
