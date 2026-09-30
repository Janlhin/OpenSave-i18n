<script>
  // The top of a game's page: its art and name, which devices have this save,
  // the Launch and Sync buttons, and the save folder with a way to open it.
  import { onDestroy } from 'svelte';
  import { peers, navigate, toast, syncActivity, askConfirm } from '../../lib/stores.js';
  import { emptiedWhere } from '../../lib/emptied.js';
  import { whenLabel } from '../../lib/snapshots.js';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import { api, native, gameCover } from '../../lib/api.js';
  import { timeAgo } from '../../lib/timeago.js';
  import { playLength } from '../../lib/format.js';
  import { canLaunch } from '../../lib/gameactions.js';
  import ArrowLeft from 'lucide-svelte/icons/arrow-left';
  import Play from 'lucide-svelte/icons/play';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import FolderOpen from 'lucide-svelte/icons/folder-open';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Star from 'lucide-svelte/icons/star';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import { collections, isFavourite, toggleFavourite } from '../../lib/collections.js';

  export let game;
  /** The page's shared runner (see lib/runner.js). */
  export let runner;
  const { busy, run } = runner;

  $: activity = $syncActivity[game.id];

  // Is my Deck up to date with THIS save? One entry per paired device, in
  // the header, because it is the question a person opens a game to ask.
  // "never" is listed too: it is the answer that explains why a save is not
  // on the other machine. A device that was unpaired is not shown even if a
  // stamp for it survived somewhere — the list is the paired devices.
  $: syncedWith = Object.values($peers)
    .map((p) => ({ id: p.id, name: p.name, at: game?.lastSyncedWith?.[p.id] ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // "4 min ago" must not freeze at the moment the page was opened.
  let now = Date.now();
  const tick = setInterval(() => (now = Date.now()), 30_000);
  onDestroy(() => clearInterval(tick));

  const syncNow = () => run('已触发同步', () => api.post(`/api/games/${game.id}/sync`));
  const launchGame = () => run('正在启动…', () => api.post(`/api/games/${game.id}/launch`));

  let editPath = false;
  let pathDraft = '';

  // The answer to an emptied save: put the files back here, or let the
  // deletion go to the other devices too.
  let answering = false;
  async function answerEmptied(answer) {
    if (answer === 'delete') {
      const n = game.emptied.files;
      const ok = await askConfirm(
        `也要删除 ${game.name} 在其他设备上的存档文件吗？那里的 ${n} 个文件将被删除；每台设备会先保留一份快照。`,
        { title: '在所有设备上删除？', confirmText: '也在那边删除', danger: true }
      );
      if (!ok) return;
    }
    answering = true;
    try {
      const res = await api.post(`/api/games/${game.id}/emptied`, { answer });
      if (answer === 'delete') toast(`${game.name} 的存档文件将在下次同步时从其他设备删除`, 'success');
      else if (res.fetching > 0) toast(`正在找回 ${game.name} 的文件 — 其中 ${res.fetching} 个来自你的其他设备`, 'success');
      else toast(`${game.name} 的文件已找回`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      answering = false;
    }
  }
  // Reveal the save location in Explorer / Finder / the Linux file manager.
  // The bridge returns a message when it can't (e.g. the folder was deleted).
  async function openSaveFolder() {
    const problem = await native.openFolder(game.savePath);
    if (problem) toast(problem, 'error');
  }

  async function savePath() {
    await run('存档路径已更新', () => api.patch(`/api/games/${game.id}`, { savePath: pathDraft }));
    editPath = false;
  }
</script>

<div class="head">
  <button class="btn icon back" on:click={() => navigate('home')} title="返回" aria-label="返回"><ArrowLeft size={18} /></button>
  {#if gameCover(game)}
    <img
      class="head-cover"
      src={gameCover(game)}
      alt=""
      on:load={(e) => (e.currentTarget.style.display = '')}
      on:error={(e) => (e.currentTarget.style.display = 'none')}
    />
  {/if}
  <div class="title-block">
    <h2 class="page-title title-row">
      {game.name}
      <button
        class="btn small ghost icon star"
        class:on={isFavourite($collections, game.id)}
        title={isFavourite($collections, game.id) ? '从收藏中移除' : '加入收藏'}
        aria-label={isFavourite($collections, game.id) ? '从收藏中移除' : '加入收藏'}
        aria-pressed={isFavourite($collections, game.id)}
        on:click={() => toggleFavourite($collections, game)}
      >
        <Star size={16} />
      </button>
    </h2>
    <div class="sub">
      分支 <strong>{game.activeBranch}</strong>
      {#if activity?.state === 'running'}
        · <span class="syncing">同步中 {activity.percentage ?? 0}%</span>
      {/if}
      {#if game.playingSince}
        · <span class="playing">自 {new Date(game.playingSince).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 起游戏中</span>
      {:else if game.lastPlayedAt}
        · <span title={new Date(game.lastPlayedAt).toLocaleString()}>上次游玩 {timeAgo(game.lastPlayedAt, now)}，累计游玩 {playLength(game.playtimeMs)}</span>
      {/if}
      {#if game.installed === 'not-found'}
        · <span title="这台电脑上没有 Steam 版本，它也不在任何存放游戏的文件夹里。可在配置中设置程序路径，从其他位置启动。">未在此电脑上找到</span>
      {/if}
    </div>
    {#if syncedWith.length > 0}
      <div class="sub synced-with">
        {#each syncedWith as d, i (d.id)}
          {#if i > 0}<span class="sep">·</span>{/if}
          <span class="device" title={d.at ? `${d.name}：上次同步于 ${new Date(d.at).toLocaleString()}` : `${d.name} 从未同步过此游戏`}>
            {d.name}
            <span class:never={!d.at}>{d.at ? `已于 ${timeAgo(d.at, now)}同步` : '从未同步'}</span>
          </span>
        {/each}
      </div>
    {/if}
  </div>
  <div class="head-actions">
    {#if canLaunch(game)}
      <button class="btn" disabled={$busy} on:click={launchGame}><Play size={15} />启动</button>
    {/if}
    <button class="btn primary" disabled={$busy} on:click={syncNow}><RefreshCw size={15} />立即同步</button>
  </div>
</div>

<div class="path-line">
  {#if editPath}
    <input class="path-input" bind:value={pathDraft} />
    <button class="btn small" on:click={async () => (pathDraft = (await native.selectDirectory('选择存档文件夹')) || pathDraft)}>浏览</button>
    <button class="btn small primary" on:click={savePath}>保存</button>
    <button class="btn small" on:click={() => (editPath = false)}>取消</button>
  {:else}
    <span class="path" title={game.savePath}>{game.savePath}</span>
    <button class="btn small" on:click={openSaveFolder} title="在文件管理器中显示此文件夹">
      <FolderOpen size={14} />打开文件夹
    </button>
    <button class="btn small" on:click={() => { pathDraft = game.savePath; editPath = true; }}><Pencil size={13} />编辑</button>
  {/if}
</div>

{#if game.emptied && !game.savePathMissing}
  <!-- Every save file went at once here. Nothing is synced until this is
       answered: syncing it would delete them on the other devices too
       (internal/p2p/syncengine/hold.go). -->
  <div class="missing emptied" role="status">
    <TriangleAlert size={16} />
    <div>
      {#if game.emptied.state === 'fetching'}
        <strong>正在找回文件。</strong>
        部分文件还在从你的其他设备传来；全部到齐后，这个游戏会照常同步。
      {:else}
        <strong>{emptiedWhere(game.emptied.locations)} 中的所有存档文件已在此设备上被删除。</strong>
        你的其他设备仍有这些文件，在你做出选择之前不会同步任何内容。
        {#if game.emptied.putBackFrom}
          从 {whenLabel(game.emptied.putBackFromTime)} 的快照找回，并附带你其他设备上更新的文件
        {:else}
          从你的其他设备找回这些文件
        {/if}
        — 或者，如果你确实想删，也可以把那边的一并删除；每台设备都会先保留一份快照。
        <div class="emptied-actions">
          <button class="btn small primary" disabled={answering} on:click={() => answerEmptied('restore')}>
            <RotateCcw size={13} />找回文件
          </button>
          <button class="btn small" disabled={answering} on:click={() => answerEmptied('delete')}>
            也在我的其他设备上删除
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if game.savePathMissing && !editPath}
  <!-- The folder is not there. It is not created again: an empty folder in
       its place would read as every file deleted, and syncing that would
       delete them on your other devices too. -->
  <div class="missing" role="status">
    <TriangleAlert size={16} />
    <div>
      <strong>这个存档文件夹不存在。</strong>
      它可能被移动或删除了，也可能位于尚未连接的驱动器上。在它恢复之前，这个游戏不会生成快照、
      也不会同步 — OpenSave 会在一分钟内自动重新检测到它。如果存档现在在别处，
      可用“编辑”把游戏指向新位置。
    </div>
  </div>
{/if}

<style>
  .title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .star {
    color: var(--text-faint);
  }
  .star.on {
    color: var(--warn);
  }
  .star.on :global(svg) {
    fill: currentColor;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 6px;
  }
  .back {
    font-size: 1rem;
  }
  .head-cover {
    height: 52px;
    aspect-ratio: 460 / 215;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid var(--border);
  }
  .title-block {
    flex: 1;
    min-width: 0;
  }
  .sub {
    color: var(--text-dim);
    font-size: 0.85rem;
    margin-top: 2px;
  }
  .syncing {
    color: var(--accent-text);
    font-weight: 600;
  }
  .synced-with {
    display: flex;
    flex-wrap: wrap;
    gap: 0 6px;
  }
  .synced-with .device {
    white-space: nowrap;
  }
  .synced-with .device > span {
    color: var(--text);
  }
  .synced-with .device > span.never {
    color: var(--text-dim);
    font-style: italic;
  }
  .synced-with .sep {
    color: var(--text-dim);
  }
  .head-actions {
    display: flex;
    gap: 8px;
  }
  .missing {
    display: flex;
    gap: 10px;
    margin: -8px 0 18px 50px;
    padding: 10px 12px;
    border: 1px solid rgba(var(--warn-rgb), 0.35);
    border-radius: var(--radius);
    background: rgba(var(--warn-rgb), 0.08);
    font-size: 0.84rem;
    color: var(--text-dim);
  }
  .missing :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--warn);
  }
  .missing strong {
    color: var(--text);
  }
  .emptied-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .path-line {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 18px 50px;
  }
  .path {
    font-size: 0.8rem;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .path-input {
    flex: 1;
    padding: 6px 10px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    font-size: 0.82rem;
    outline: none;
  }
  .playing {
    color: var(--success);
    font-weight: 600;
  }
</style>
