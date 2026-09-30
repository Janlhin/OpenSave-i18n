// The notification hub (components/NotificationHub.svelte): everything worth
// telling you, in one place behind the bell.
//
// Two sorts. Things waiting on you — a conflict, an emptied save, a device
// asking to pair, a newer save offered from the cloud, games found, a
// folder gone, a snapshot that cannot be restored, an update — come from the
// app's state and stay until they are dealt with; there is nothing to mark
// read about a question still open. Things that happened — a save arriving
// from another device, one brought from the cloud, a deletion made
// elsewhere, a restore — come from the activity history (lib/timeline.js)
// and are unread until the bell has been opened since.
import { writable } from 'svelte/store';
import { describe } from './timeline.js';

/** Activity kinds worth a notification; the rest stay on the timeline. */
export const NOTIFY_KINDS = ['received', 'cloud-pulled', 'deleted', 'restored', 'emptied', 'conflict'];

/** How far back "Earlier" reaches. */
export const NOTIFY_DAYS = 14;

/**
 * The things waiting on you, most pressing first.
 * @returns {{id: string, tone: 'warn'|'info', title: string, detail: string, go: {view: string, params?: object}|null, gameId?: string}[]}
 */
export function waitingOnYou({ games = {}, conflicts = {}, locationConflicts = [], pairingRequests = [], cloudOffers = [], newGames = [], update = null } = {}) {
  const out = [];
  const name = (id) => games[id]?.name ?? '某个游戏';
  for (const id of Object.keys(conflicts)) {
    out.push({ id: `conflict:${id}`, tone: 'warn', gameId: id, title: `${name(id)} 需要做出决定`, detail: '它在本地和另一台设备上同时发生了变化', go: { view: 'game', params: { gameId: id } } });
  }
  for (const c of locationConflicts) {
    out.push({ id: `location:${c.gameId}:${c.root}`, tone: 'warn', gameId: c.gameId, title: `${name(c.gameId)} 需要做出决定`, detail: `它的“${c.root}”位置在两台设备上都有变化`, go: { view: 'game', params: { gameId: c.gameId } } });
  }
  for (const g of Object.values(games)) {
    if (g.emptied?.state === 'held') {
      out.push({ id: `emptied:${g.id}`, tone: 'warn', gameId: g.id, title: `${g.name} 的所有存档文件已在此删除`, detail: '在你做出选择前，其他设备会保留它们的文件', go: { view: 'game', params: { gameId: g.id } } });
    }
  }
  for (const r of pairingRequests) {
    out.push({ id: `pair:${r.peerId}`, tone: 'info', title: `${r.deviceName ?? '某台设备'} 想要配对`, detail: '在主页批准它即可与之同步', go: { view: 'home' } });
  }
  for (const o of cloudOffers) {
    out.push({ id: `offer:${o.gameId}:${o.snapshotId}`, tone: 'info', gameId: o.gameId, title: `${o.gameName ?? name(o.gameId)} 有更新的存档`, detail: `来自${o.deviceName ?? '另一台设备'}，经云端传输`, go: { view: 'home' } });
  }
  for (const g of Object.values(games)) {
    if (g.savePathMissing) {
      out.push({ id: `missing:${g.id}`, tone: 'warn', gameId: g.id, title: `${g.name} 的存档文件夹丢失`, detail: '在它恢复之前不会为其同步任何内容', go: { view: 'game', params: { gameId: g.id } } });
    }
  }
  for (const g of Object.values(games)) {
    const damaged = Object.values(g.branches ?? {}).flatMap((b) => (b.snapshots ?? []).filter((s) => s.problem)).length;
    if (damaged) {
      out.push({ id: `damaged:${g.id}`, tone: 'warn', gameId: g.id, title: `${g.name} 有 ${damaged} 个快照无法恢复`, detail: '读取时发现已损坏', go: { view: 'game', params: { gameId: g.id } } });
    }
  }
  if (newGames.length) {
    out.push({ id: `new:${newGames.map((g) => g.name).join(',')}`, tone: 'info', title: `发现 ${newGames.length} 个新游戏`, detail: newGames.slice(0, 3).map((g) => g.name).join(', '), go: { view: 'home' } });
  }
  if (update?.latest) {
    out.push({ id: `update:${update.latest}`, tone: 'info', title: `OpenSave ${update.latest} 可用`, detail: `当前版本为 ${update.current ?? '较旧版本'}——请从顶部横幅安装`, go: null });
  }
  return out;
}

/**
 * The things that happened, newest first, from the activity history.
 * @param {object[]} items GET /api/activity items
 * @param {Record<string, object>} games
 * @param {number} seenAt when the bell was last opened (ms)
 */
export function happened(items, games = {}, seenAt = 0, now = Date.now()) {
  const since = now - NOTIFY_DAYS * 86_400_000;
  return items
    .filter((it) => NOTIFY_KINDS.includes(it.kind) && it.atMs >= since && games[it.gameId])
    .map((it) => {
      const said = describe(it, new Date(now));
      return {
        id: `${it.kind}:${it.gameId}:${it.atMs}`,
        gameId: it.gameId,
        atMs: it.atMs,
        tone: said.tone === 'warn' ? 'warn' : 'info',
        // "Hades: got 3 files from Steam Deck" — but a sentence that opens
        // with a device's name keeps it as it is.
        title: `${games[it.gameId].name}: ${it.device && said.title.startsWith(it.device) ? said.title : said.title[0].toLowerCase() + said.title.slice(1)}`,
        detail: said.detail,
        unread: it.atMs > seenAt,
        go: { view: 'game', params: { gameId: it.gameId } }
      };
    });
}

/** What the bell's badge counts: every question open, and every event unread. */
export const badgeCount = (waiting, events) => waiting.length + events.filter((e) => e.unread).length;

const SEEN_KEY = 'opensave.notificationsSeenAt';

export function loadSeenAt(storage = globalThis.localStorage) {
  try {
    return Number(storage?.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveSeenAt(ms, storage = globalThis.localStorage) {
  try {
    storage?.setItem(SEEN_KEY, String(ms));
  } catch {
    // Storage refused: everything reads as unread again after a restart.
  }
}

// A save arriving from another device is said in the corner too — at most
// once in a while for each game, since a game played on the other device
// saves every few minutes, and each of those arrives here.
export const ARRIVAL_QUIET_MS = 5 * 60_000;

/** The message for an activity event of a save arriving, or null when it is
 *  not one or one was shown for that game lately. lastShown is updated. */
export function arrivalMessage(ev, games, lastShown, now = Date.now()) {
  if (ev?.kind !== 'received' || !games?.[ev.gameId]) return null;
  if (now - (lastShown[ev.gameId] ?? 0) < ARRIVAL_QUIET_MS) return null;
  lastShown[ev.gameId] = now;
  return `${games[ev.gameId].name}: 从 ${ev.device} 收到 ${ev.files || 1} 个文件`;
}

/** An arrival as the desktop shows it: the game's name over what came, with
 *  its cover. Asked only once arrivalMessage has said to. */
export function arrivalNote(ev, games) {
  const game = games?.[ev.gameId];
  if (!game) return null;
  return { title: game.name, body: `从 ${ev.device} 收到 ${ev.files || 1} 个文件`, game };
}

/** New games found, as the desktop shows them. */
export function newGamesNote(found) {
  if (!found?.length) return null;
  const names = found.map((g) => g.name);
  const body = names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} 等 ${names.length} 个`;
  return {
    title: names.length === 1 ? '发现新游戏' : `发现 ${names.length} 个新游戏`,
    body: `${body}——将其加入跟踪以保持存档同步`,
    open: { view: 'home', params: {} }
  };
}

// Examples, from "Show me" in Settings → Notifications: entries in the bell
// that look like the real thing, gone once the bell has been looked at.
export const exampleEvents = writable([]);

export function exampleEvent(now = Date.now()) {
  return {
    id: `example:${now}`,
    example: true,
    atMs: now,
    tone: 'info',
    title: 'Hades: 从 Steam Deck 收到 3 个文件',
    detail: '示例——存档从另一台设备到达时就是这样显示的',
    unread: true,
    go: null
  };
}
