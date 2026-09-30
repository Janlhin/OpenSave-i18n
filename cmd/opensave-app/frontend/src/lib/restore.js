// Restoring a snapshot, asked about with what it would change.
//
// "Restore the snapshot from 1:13 PM?" asked someone to trust a timestamp.
// The daemon can say, file by file, what a restore would change (see
// internal/snapshot/preview.go); the question now shows that, so the answer
// is given knowing what it does.
import { writable, get } from 'svelte/store';

/** {game, snap, resolve} while the restore dialog is open. */
export const restoreRequest = writable(null);

/** Opens the restore dialog for a snapshot; resolves true to go ahead. */
export function askRestore(game, snap) {
  return new Promise((resolve) => restoreRequest.set({ game, snap, resolve }));
}

export function answerRestore(yes) {
  const req = get(restoreRequest);
  restoreRequest.set(null);
  req?.resolve(yes);
}

const KIND_ORDER = { changed: 0, restored: 1, removed: 2 };

/** Counts per kind and the changes in reading order: by location, then by
 *  what happens to them, then by path. */
export function summarize(preview) {
  const changes = [...(preview?.changes ?? [])].sort(
    (a, b) =>
      (a.location ?? '').localeCompare(b.location ?? '') ||
      KIND_ORDER[a.change] - KIND_ORDER[b.change] ||
      a.path.localeCompare(b.path)
  );
  const count = (kind) => changes.filter((c) => c.change === kind).length;
  return {
    changes,
    changed: count('changed'),
    restored: count('restored'),
    removed: count('removed'),
    unchanged: preview?.unchanged ?? 0,
    identical: changes.length === 0,
    unplaced: preview?.unplaced ?? []
  };
}

/** "2 个文件将被更改，1 个将被恢复，1 个将被删除" — only the parts that apply. */
export function describeSummary(s) {
  const parts = [];
  if (s.changed) parts.push(`${s.changed} 个文件将被更改`);
  if (s.restored) parts.push(`${s.restored} 个文件将被恢复`);
  if (s.removed) parts.push(`${s.removed} 个文件将被删除`);
  return parts.join('，');
}
