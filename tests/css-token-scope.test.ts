import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

/**
 * Shared design tokens (--desk-*, --claflin-*, --dur-*, --ease-*, --stagger)
 * must be consumed from a :root definition. A var(--x) with no fallback that
 * resolves only under some surface's class root breaks silently when a new
 * root forgets the block — the room view rendered dark ink on a dark panel
 * because --desk-paper-light was declared on .workspace but not .roomView.
 */
const SHARED = /^--(claflin-|desk-|dur-\d|ease-[a-z-]+|stagger$)/;

const cssFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (/(node_modules|\.next|\.git)/.test(path)) continue;
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...cssFiles(path));
    else if (entry.endsWith('.css')) out.push(path);
  }
  return out;
};

describe('shared css tokens resolve from :root', () => {
  const repoRoot = fileURLToPath(new URL('../', import.meta.url));
  const files = ['app', 'components', 'styles'].flatMap(dir => cssFiles(join(repoRoot, dir)));
  assert.ok(files.length > 0);

  const parsed = files.map(file => ({ file, root: postcss.parse(readFileSync(file, 'utf8'), { from: file }) }));

  const isRootRule = (node: postcss.Node | undefined): node is postcss.Rule =>
    node?.type === 'rule' && (node as postcss.Rule).selectors.some(s => s.includes(':root'));

  const rootDefined = new Set<string>();
  for (const { root } of parsed) {
    root.walkDecls(decl => {
      if (SHARED.test(decl.prop) && isRootRule(decl.parent)) rootDefined.add(decl.prop);
    });
  }

  const violations: string[] = [];
  for (const { file, root } of parsed) {
    root.walkDecls(decl => {
      for (const match of decl.value.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
        const token = match[1];
        if (!SHARED.test(token)) continue;
        if (!isRootRule(decl.parent) && !rootDefined.has(token)) {
          const selector = decl.parent?.type === 'rule' ? (decl.parent as postcss.Rule).selector : decl.parent?.type ?? 'unknown';
          violations.push(`${relative(process.cwd(), file)}: ${selector} → ${decl.prop}: var(${token}) [no fallback, not defined on :root]`);
        }
      }
    });
  }

  it('never leaves a shared-namespace var() relying on a per-surface definition', () => {
    assert.deepEqual(violations, [], `Shared tokens must be defined on :root (styles/desk-craft.css) or consumed with a fallback:\n${violations.join('\n')}`);
  });

  it('keeps the room-view paper contract alive (regression guard)', () => {
    const craft = readFileSync(join(repoRoot, 'styles/desk-craft.css'), 'utf8');
    for (const token of ['--desk-paper-light', '--desk-paper', '--desk-paper-ink', '--desk-shadow']) {
      assert.match(craft, new RegExp(`:root[\\s\\S]*${token}\\s*:`), token);
    }
  });
});
