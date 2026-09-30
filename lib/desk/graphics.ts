export type GraphicsPreference = 'auto' | 'lightweight' | 'full';

export const GRAPHICS_STORAGE_KEY = 'claflin.graphics.v1';

export function parseGraphicsPreference(raw: unknown): GraphicsPreference {
  return raw === 'lightweight' || raw === 'full' || raw === 'auto' ? raw : 'auto';
}

export function shouldUseLightweightGraphics(
  preference: GraphicsPreference,
  signals: { reducedMotion: boolean; coarsePointer: boolean; saveData: boolean },
): boolean {
  if (signals.reducedMotion) return true;
  if (preference === 'lightweight') return true;
  if (preference === 'full') return false;
  return signals.coarsePointer || signals.saveData;
}
