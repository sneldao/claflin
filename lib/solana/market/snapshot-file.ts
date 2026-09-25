/**
 * File-backed snapshot store for Pyth feed observations.
 *
 * The Lazer daemon and the comparison route run on the same host, so a
 * JSON document replaced atomically (tmp + rename) replaces the Redis
 * round-trip for this path: no request quota, no protocol shim, and rows
 * survive daemon restarts. Every row still passes the same zod schema at
 * read time — a missing or corrupt file reads as `unavailable`, which is
 * data, not an error.
 *
 * Daemon is the only writer; readers get a consistent per-request view.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { FeedSnapshot } from './compare';
import type { SnapshotStore } from './snapshots';

export const DEFAULT_SNAPSHOT_FILE = '/opt/claflin/state/pyth-snapshots.json';

export function snapshotFilePath(): string {
  return process.env.PYTH_SNAPSHOT_FILE || DEFAULT_SNAPSHOT_FILE;
}

type SnapshotMap = Record<string, FeedSnapshot>;

/** Parse the document once. Missing/corrupt → null (never throws). */
export function readSnapshotFile(file = snapshotFilePath()): SnapshotMap | null {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as SnapshotMap;
  } catch {
    return null;
  }
}

/** Atomic replace: write to a sibling tmp file, then rename over the target. */
export async function writeSnapshotFile(entries: SnapshotMap, file = snapshotFilePath()): Promise<void> {
  const dir = path.dirname(file);
  await fsp.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(entries));
  await fsp.rename(tmp, file);
}

/**
 * Reader store: reads the file once, lazily, then serves every key from
 * that snapshot — all feeds in a comparison come from the same write.
 * `set` rejects: readers never write evidence.
 */
export function fileSnapshotStore(file = snapshotFilePath()): SnapshotStore {
  let cache: SnapshotMap | null | undefined;
  return {
    get: async (key) => {
      if (cache === undefined) cache = readSnapshotFile(file);
      return cache?.[key] ?? null;
    },
    set: () => Promise.reject(new Error('snapshot file store is read-only for readers')),
  };
}
