/**
 * Avatar mouth drive — pure char→viseme scheduling for the desk avatar's
 * lip sync. ElevenLabs hands us per-character timings (chars[],
 * char_start_times_ms[], char_durations_ms[]); this module turns those
 * into per-frame viseme weights for three-vrm's aa/ee/ih/oh/ou presets.
 *
 * Pure and node-testable: no three.js, no React, no audio analysis. The
 * scheduler is stateful — schedule a chunk once when the playback event
 * fires, then sample every frame; attack/release damping keeps the mouth
 * from snapping between shapes.
 *
 * Mapping follows visible-mouth phonetics, not real visemes: vowels get
 * their preset, closers (m/b/p) shut the mouth, fricatives (f/v) half a
 * spread, and other consonants carry the previous vowel at reduced weight
 * so words don't stutter closed.
 */

export type MouthViseme = 'aa' | 'ee' | 'ih' | 'oh' | 'ou';

export type MouthWeights = Record<MouthViseme, number>;

export const MOUTH_VISIMES: readonly MouthViseme[] = ['aa', 'ee', 'ih', 'oh', 'ou'];

const ATTACK_MS = 25;
const RELEASE_MS = 70;

/** Map one character to a viseme target, given the vowel before it. */
function charFrame(
  char: string,
  lastVowel: MouthViseme | null,
): { viseme: MouthViseme | null; weight: number } {
  switch (char) {
    case 'a': case 'A': return { viseme: 'aa', weight: 1 };
    case 'e': case 'E': return { viseme: 'ee', weight: 1 };
    case 'i': case 'I': return { viseme: 'ih', weight: 1 };
    case 'o': case 'O': return { viseme: 'oh', weight: 1 };
    case 'u': case 'U': return { viseme: 'ou', weight: 1 };
    case 'y': case 'Y': return { viseme: 'ih', weight: 1 };
    case 'w': case 'W': return { viseme: 'ou', weight: 1 };
    case 'm': case 'M': case 'b': case 'B': case 'p': case 'P':
      return { viseme: null, weight: 0 };
    case 'f': case 'F': case 'v': case 'V':
      return { viseme: 'ee', weight: 0.5 };
    default:
      if (/[a-z]/i.test(char)) return { viseme: lastVowel, weight: lastVowel ? 0.45 : 0 };
      return { viseme: null, weight: 0 };
  }
}

interface ScheduledChunk {
  t0: number;
  chars: readonly string[];
  startsMs: readonly number[];
  durationsMs: readonly number[];
  /** Precomputed per-char targets (consonant carry resolved at schedule time). */
  frames: readonly { viseme: MouthViseme | null; weight: number }[];
}

function zeroWeights(): MouthWeights {
  return { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 };
}

/**
 * A queued speech chunk plus a level fallback, whichever arrived last.
 * sample() returns damped weights; idle eases everything to closed.
 */
export class MouthScheduler {
  private chunk: ScheduledChunk | null = null;
  /** Level-drive fallback (no alignment): level 0..1 mapped onto 'aa'. */
  private level: { at: number; value: number } | null = null;
  private weights: MouthWeights = zeroWeights();

  /** Queue an alignment chunk. timings are ms relative to t0. */
  scheduleChunk(
    t0: number,
    chars: readonly string[],
    charStartsMs: readonly number[],
    charDurationsMs: readonly number[],
  ): void {
    const lastVowelStack: (MouthViseme | null)[] = [];
    const frames = chars.map(char => {
      const carry = lastVowelStack.length ? lastVowelStack[lastVowelStack.length - 1] : null;
      const frame = charFrame(char, carry);
      if (frame.viseme && frame.weight >= 1) lastVowelStack.push(frame.viseme);
      return frame;
    });
    this.chunk = { t0, chars, startsMs: charStartsMs, durationsMs: charDurationsMs, frames };
    this.level = null;
  }

  /** Drive the mouth from an aggregate level (volume fallback). */
  driveLevel(level: number, nowMs: number): void {
    this.level = { at: nowMs, value: Math.max(0, Math.min(1, level)) };
    this.chunk = null;
  }

  /** Stop on interruption, disconnect, or the call ending. */
  clear(): void {
    this.chunk = null;
    this.level = null;
  }

  /** True while a scheduled chunk still has frames ahead of nowMs. */
  speaking(nowMs: number): boolean {
    const chunk = this.chunk;
    if (chunk) {
      const t = nowMs - chunk.t0;
      const end = chunk.startsMs.length
        ? chunk.startsMs[chunk.startsMs.length - 1] + chunk.durationsMs[chunk.durationsMs.length - 1]
        : 0;
      return t < end;
    }
    if (this.level) return nowMs - this.level.at < 250;
    return false;
  }

  /** Advance damping and return the current viseme weights. */
  sample(nowMs: number, dtMs: number): MouthWeights {
    const target = zeroWeights();
    const chunk = this.chunk;
    if (chunk) {
      const t = nowMs - chunk.t0;
      for (let i = 0; i < chunk.chars.length; i++) {
        const start = chunk.startsMs[i];
        const end = start + chunk.durationsMs[i];
        if (t >= start && t < end) {
          const frame = chunk.frames[i];
          if (frame.viseme) target[frame.viseme] = frame.weight;
          break;
        }
      }
    } else if (this.level && nowMs - this.level.at < 250) {
      target.aa = this.level.value;
    }

    for (const key of MOUTH_VISIMES) {
      const goal = target[key];
      const current = this.weights[key];
      const tau = goal > current ? ATTACK_MS : RELEASE_MS;
      const blend = dtMs > 0 ? 1 - Math.exp(-dtMs / tau) : 1;
      this.weights[key] = current + (goal - current) * blend;
    }
    return this.weights;
  }
}
