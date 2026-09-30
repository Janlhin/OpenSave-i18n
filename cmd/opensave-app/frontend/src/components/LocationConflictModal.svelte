<script>
  // A disagreement about one of a game's EXTRA save folders.
  //
  // Deliberately its own screen rather than a mode of the main conflict
  // modal. That one offers "Keep both", which parks the peer's copy on a
  // branch — and branches belong to the game as a whole, so the same button
  // here would do something to the save folder while the user was looking at
  // a settings folder. Two answers only, and the screen says which folder it
  // is asking about in every sentence.
  import { dialogOut } from '../lib/motion.js';
  import { locationConflicts, games, peers, settings, toast, view } from '../lib/stores.js';
  import { isHandheld } from '../lib/devices.js';
  import { visited } from '../lib/later.js';
  import { api } from '../lib/api.js';
  import { demandAttention } from '../lib/notify.js';
  import Chevron from './ui/Chevron.svelte';
  import Gamepad2 from 'lucide-svelte/icons/gamepad-2';
  import Monitor from 'lucide-svelte/icons/monitor';
  import History from 'lucide-svelte/icons/history';
  import FolderOpen from 'lucide-svelte/icons/folder-open';

  let busy = false;
  let showDiff = false;
  let applying = new Set(); // "gameId\u0000root" of resolutions in flight
  let seen = new Set();

  const keyOf = (c) => `${c.gameId}\u0000${c.root}`;

  // Put off as on the whole-game screen (ConflictModal): out of the way until
  // the game's page is opened again.
  let later = new Map(); // keyOf(c) → the view it was put off from
  $: later = visited(later, $view, (key) => key.split('\u0000')[0]);
  const putOff = () => {
    if (!current || busy) return;
    later = new Map(later).set(keyOf(current), $view);
    showDiff = false;
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && current) putOff();
  };

  $: pending = ($locationConflicts ?? []).filter((c) => !applying.has(keyOf(c)) && !later.has(keyOf(c)));
  $: current = pending[0]; // one at a time, like the whole-game screen
  $: gameName = current ? ($games[current.gameId]?.name ?? current.gameId) : '';
  $: peerName = current ? (current.peer?.name ?? current.peer?.Name ?? '对方设备') : '';
  $: peerType = current ? $peers[current.peer?.id ?? current.peer?.ID]?.deviceType : '';
  $: localIcon = isHandheld($settings?.deviceType) ? Gamepad2 : Monitor;
  $: peerIcon = isHandheld(peerType) ? Gamepad2 : Monitor;

  // Announce new ones the same way a save conflict is announced: this is
  // still "something of yours needs a decision before it can sync".
  $: announce($locationConflicts ?? []);
  function announce(list) {
    const fresh = list.filter((c) => !seen.has(keyOf(c)));
    if (fresh.length > 0) {
      const game = $games[fresh[0].gameId];
      const name = game?.name ?? '某个游戏';
      demandAttention('conflicts', { title: name, body: `两台设备上的“${fresh[0].root}”文件夹存在差异——请选择要保留的版本。`, game });
      toast(`“${name}”的“${fresh[0].root}”文件夹在两台设备上存在差异`, 'error');
    }
    seen = new Set(list.map(keyOf));
    // Forget in-flight markers for conflicts that are gone.
    const live = new Set(list.map(keyOf));
    let pruned = false;
    for (const k of applying) {
      if (!live.has(k)) {
        applying.delete(k);
        pruned = true;
      }
    }
    if (pruned) applying = new Set(applying);
  }

  async function resolve(resolution) {
    if (!current || busy) return;
    busy = true;
    const c = current;
    try {
      await api.post(`/api/games/${c.gameId}/resolve-location-conflict`, {
        peerId: c.peer?.id ?? c.peer?.ID,
        root: c.root,
        resolution
      });
      applying = new Set(applying).add(keyOf(c));
      if (resolution === 'keep-remote') {
        toast(`正在获取 ${peerName} 的“${c.root}”文件夹…`, 'info');
      }
      showDiff = false;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
    }
  }

  const fmtMs = (ms) => (ms ? new Date(ms).toLocaleString() : '未知');
  const fmtSize = (n) =>
    n < 0 ? '—' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n >= 1024 ? (n / 1024).toFixed(1) + ' KB' : n + ' B';
  const diffIcon = (s) => (s === 'changed' ? '✱' : s === 'only-remote' ? '+' : '−');
  const diffLabel = (s) =>
    s === 'changed' ? '有差异' : s === 'only-remote' ? `仅存在于 ${peerName}` : '仅存在于本机';

  $: localMs = current?.localStats?.latestMtimeMs ?? 0;
  $: remoteMs = current?.remoteStats?.latestMtimeMs ?? 0;
  $: newerSide = localMs && remoteMs ? (localMs > remoteMs ? 'local' : remoteMs > localMs ? 'remote' : '') : '';

  $: diffFiles = current?.diffFiles ?? [];
  $: changedCount = diffFiles.filter((d) => d.status === 'changed').length;
  $: onlyLocalCount = diffFiles.filter((d) => d.status === 'only-local').length;
  $: onlyRemoteCount = diffFiles.filter((d) => d.status === 'only-remote').length;

  function sideSummary(stats) {
    const files = stats?.files;
    if (files === 0) return '文件夹为空';
    if (typeof files !== 'number') return '';
    return `整个文件夹：${files} 个文件 · ${fmtSize(stats?.totalBytes ?? -1)}`;
  }
</script>

<svelte:window on:keydown={onKey} />

{#if current}
  <div class="overlay" out:dialogOut|global>
    <div class="modal card">
      <h3 class="with-icon"><FolderOpen size={20} /> “{current.root}”文件夹 — {gameName}</h3>
      <p class="desc">
        这是 {gameName} 的额外存档文件夹之一，本机与 <strong>{peerName}</strong> 都更改了它。游戏的主存档不受影响、继续同步；
        只有这个文件夹在等待你处理。
      </p>

      <div class="versions">
        <div class="version" class:newer={newerSide === 'local'}>
          <div class="v-head">
            <span class="v-title with-icon"><svelte:component this={localIcon} size={16} /> 本机</span>
            {#if newerSide === 'local'}<span class="v-badge">最近更改过</span>{/if}
          </div>
          <div class="v-diff">
            此处有 <strong>{changedCount + onlyLocalCount}</strong> 个文件存在差异
          </div>
          {#if onlyLocalCount > 0}
            <div class="v-only">{onlyLocalCount} 个文件仅存在于本机</div>
          {/if}
          <div class="v-stats">{sideSummary(current.localStats)}</div>
          <div class="v-time">最后更改 {fmtMs(localMs)}</div>
        </div>
        <div class="version" class:newer={newerSide === 'remote'}>
          <div class="v-head">
            <span class="v-title with-icon"><svelte:component this={peerIcon} size={16} /> {peerName}</span>
            {#if newerSide === 'remote'}<span class="v-badge">最近更改过</span>{/if}
          </div>
          <div class="v-diff">
            对方有 <strong>{changedCount + onlyRemoteCount}</strong> 个文件存在差异
          </div>
          {#if onlyRemoteCount > 0}
            <div class="v-only">{onlyRemoteCount} 个文件仅存在于 {peerName}</div>
          {/if}
          <div class="v-stats">{sideSummary(current.remoteStats)}</div>
          <div class="v-time">最后更改 {fmtMs(remoteMs)}</div>
        </div>
      </div>

      {#if current.diffTotal > 0}
        <button class="diff-toggle" on:click={() => (showDiff = !showDiff)}>
          <Chevron open={showDiff} /> 差异详情（{current.diffTotal} 个文件）
        </button>
        {#if showDiff}
          <div class="diff-list">
            {#each diffFiles as d (d.path)}
              <div class="diff-row">
                <span class="diff-icon" data-status={d.status}>{diffIcon(d.status)}</span>
                <span class="diff-path" title={d.path}>{d.path}</span>
                <span class="diff-meta">{diffLabel(d.status)}</span>
              </div>
            {/each}
            {#if current.diffTotal > diffFiles.length}
              <div class="diff-more">…还有 {current.diffTotal - diffFiles.length} 个</div>
            {/if}
          </div>
        {/if}
      {/if}

      <div class="actions">
        <button class="btn ghost later" disabled={busy} on:click={putOff} title="在你决定之前，该文件夹的任何内容都不会同步。打开该游戏页面进行决定。">稍后决定</button>
        <button class="btn" disabled={busy} on:click={() => resolve('keep-remote')}>
          使用 {peerName} 的
        </button>
        <button class="btn primary" disabled={busy} on:click={() => resolve('keep-local')}>
          保留我的
        </button>
      </div>
      <p class="hint-line">
        <History size={15} class="inline-icon" /> 在应用任一选择之前，都会先为该游戏的每个文件夹保存快照，
        因此两种选择都可以在“快照”标签页撤销。<strong>“保留我的”</strong>会把本机的副本设为共享版本并要求 {peerName} 接收——如果
        {peerName} 有更新的内容，它也有自己的选择权。<strong>“使用 {peerName} 的”</strong>会把对方的副本带到本机。
      </p>
      <p class="hint-line">
        文件夹没有“两者都保留”选项：该选项会把另一份副本放到分支上，而分支覆盖的是整个游戏，而不是某个文件夹。
      </p>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    /* Above the whole-game conflict screen: if both are open, the save
       folder is the more urgent of the two and should be answered first, so
       it must NOT be buried. This sits below it. */
    z-index: 88;
    padding: 32px;
  }
  .modal {
    width: 580px;
    max-width: 100%;
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }
  h3 {
    margin-bottom: 8px;
    overflow-wrap: anywhere;
  }
  .desc {
    color: var(--text-dim);
    font-size: 0.9rem;
    margin-bottom: 16px;
  }
  .versions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 14px;
  }
  .version {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
  }
  .version.newer {
    border-color: rgba(var(--success-rgb), 0.45);
  }
  .v-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 8px;
  }
  .v-title {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .v-badge {
    font-size: 0.66rem;
    font-weight: 700;
    color: var(--success);
    background: rgba(var(--success-rgb), 0.12);
    padding: 2px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }
  .v-diff {
    font-size: 0.84rem;
    color: var(--text);
    margin-bottom: 3px;
  }
  .v-diff strong {
    font-weight: 700;
    color: var(--accent-text);
  }
  .v-only {
    font-size: 0.76rem;
    color: var(--text-dim);
    margin-bottom: 3px;
  }
  .v-stats {
    font-size: 0.78rem;
    color: var(--text-faint);
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }
  .v-time {
    font-size: 0.74rem;
    color: var(--text-faint);
  }
  .diff-toggle {
    border: none;
    background: transparent;
    color: var(--text-dim);
    font-size: 0.84rem;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 0;
    margin-bottom: 6px;
  }
  .diff-toggle:hover {
    color: var(--text);
  }
  .diff-list {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 8px 12px;
    margin-bottom: 14px;
    max-height: 180px;
    overflow-y: auto;
  }
  .diff-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    font-size: 0.8rem;
  }
  .diff-icon {
    width: 16px;
    text-align: center;
    font-weight: 700;
    flex-shrink: 0;
  }
  .diff-icon[data-status='changed'] {
    color: var(--warn);
  }
  .diff-icon[data-status='only-remote'] {
    color: var(--success);
  }
  .diff-icon[data-status='only-local'] {
    color: var(--danger);
  }
  .diff-path {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    font-size: 0.76rem;
  }
  .diff-meta {
    color: var(--text-faint);
    font-size: 0.72rem;
    white-space: nowrap;
  }
  .diff-more {
    color: var(--text-faint);
    font-size: 0.76rem;
    padding: 6px 0 2px;
    text-align: center;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  .actions .later {
    margin-right: auto;
  }
  .hint-line {
    margin-top: 12px;
    font-size: 0.78rem;
    color: var(--text-faint);
    line-height: 1.5;
  }
</style>
