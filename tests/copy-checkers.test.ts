import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function check(script: string, content?: string) {
  const root = mkdtempSync(join(tmpdir(), 'claflin-copy-test-'));
  try {
    if (content !== undefined) {
      mkdirSync(join(root, 'components'));
      writeFileSync(join(root, 'components/Fixture.tsx'), content);
    }
    return spawnSync(process.execPath, [fileURLToPath(new URL(`../scripts/${script}.mjs`, import.meta.url))], {
      cwd: root, encoding: 'utf8', timeout: 10_000,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('copy checker commands', () => {
  for (const script of ['check-desk-copy', 'check-broker-voice']) {
    it(`${script} proves that clean source was scanned`, () => {
      const result = check(script, 'export const copy = "A paper record. No funds moved.";');
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /scanned 1 source files/);
    });
    it(`${script} fails instead of passing an empty scan`, () => {
      const result = check(script);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /No source files were scanned/);
    });
  }
  it('reports repeated desk labels once per occurrence and keeps scanning', () => {
    const result = check('check-desk-copy', 'export const a = "the Meteora desk and the Meteora desk";\nexport const b = "MarieSol";');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /3 violation\(s\)/);
    assert.match(result.stderr, /Fixture.tsx:2:/);
  });
  it('ignores comment lines', () => {
    assert.equal(check('check-desk-copy', '// the Meteora desk\nexport const copy = "Halley";').status, 0);
  });
  it('checks both common and desk-specific broker rules', () => {
    const result = check('check-broker-voice', 'export const copy = "I recommend this. This token is backed by nothing.";');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /recommendation/);
    assert.match(result.stderr, /halley · fake provenance/);
  });
});
