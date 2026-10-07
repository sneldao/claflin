import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const surface = readFileSync(
  new URL('../components/desk/JesseDeskSurface.tsx', import.meta.url),
  'utf8',
);

describe('Jesse optional provider payload', () => {
  it('loads AssemblyAI through a client-only chunk instead of a static import', () => {
    assert.doesNotMatch(surface, /import\s+\{[^}]*JesseCallAssemblyAI[^}]*\}\s+from/);
    assert.match(
      surface,
      /const JesseCallAssemblyAI = dynamic\(\s*\(\) => import\('\.\/JesseCallAssemblyAI'\)\.then\(m => m\.JesseCallAssemblyAI\),\s*\{ ssr: false \}/,
    );
  });

  it('keeps the optional chunk behind provider selection and retains both failover callbacks', () => {
    assert.match(surface, /voiceProvider === 'assemblyai'\s*\? <JesseCallAssemblyAI/);
    assert.match(surface, /onProviderDown=\{\(\) => onLineDown\('assemblyai'\)\}/);
    assert.match(surface, /onProviderDown=\{\(\) => onLineDown\('elevenlabs'\)\}/);
    assert.match(surface, /if \(linePinned\.current \|\| downedLines\.current\.has\(down\)\) return/);
  });
});
