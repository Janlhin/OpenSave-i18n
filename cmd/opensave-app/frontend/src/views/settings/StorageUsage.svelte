<script>
  // Where the space goes: each game's share, the biggest snapshots, free
  // space, and what clean-up would give back — before pressing it.
  import { onMount } from 'svelte';
  import BrushCleaning from 'lucide-svelte/icons/brush-cleaning';
  import Layers from 'lucide-svelte/icons/layers';
  import Pin from 'lucide-svelte/icons/pin';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api } from '../../lib/api.js';
  import { askConfirm, navigate, toast } from '../../lib/stores.js';
  import { fmtSize, plural } from '../../lib/format.js';
  import { whenLabel } from '../../lib/snapshots.js';

  let report = null;
  let error = '';
  let busy = false;
  let sharing = false;

  async function load() {
    try {
      report = await api.get('/api/storage');
      error = '';
    } catch (e) {
      error = e.message;
    }
  }
  onMount(load);

  $: largest = Math.max(1, ...(report?.games ?? []).map((g) => g.bytes));

  async function cleanUp() {
    busy = true;
    try {
      const res = await api.post('/api/snapshots/prune', {});
      toast(res.removed > 0 ? `已删除 ${res.removed} 个快照，释放 ${fmtSize(res.freedBytes)}` : '没有可清理的内容', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
      load();
    }
  }

  // Older snapshots share their unchanged files every few hours on their own;
  // this does it now.
  async function shareNow() {
    sharing = true;
    try {
      const res = await api.post('/api/storage/compact', {});
      toast(
        res.compacted > 0
          ? `${res.compacted} 个快照现在共享未更改的文件 · 释放 ${fmtSize(res.freed)}`
          : '没有更多可共享的内容',
        'success'
      );
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      sharing = false;
      load();
    }
  }

  $: saving = report && report.diskBytes > 0 ? Math.max(0, report.totalBytes - report.diskBytes) : 0;

  async function remove(s) {
    const pinned = s.pinned ? ' 它已固定，其他任何清理都不会移除它。' : '';
    if (!(await askConfirm(`删除 ${s.gameName} 在 ${whenLabel(s.timestamp)} 的 ${fmtSize(s.bytes)} 快照？${pinned}此操作无法撤销；当前存档不受影响。`, { title: '删除快照？', confirmText: '删除', danger: true }))) return;
    try {
      await api.del(`/api/games/${s.gameId}/snapshot/${s.snapshotId}`);
      toast(`已释放 ${fmtSize(s.bytes)}`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    load();
  }
</script>

{#if error}
  <p class="hint">无法读取存储信息：{error}</p>
{:else if !report}
  <div class="skeleton" style="height: 120px"></div>
{:else}
  <div class="summary">
    <div>
      <div class="total">{fmtSize(report.totalBytes)}</div>
      <div class="hint">{report.snapshots} 个快照{#if report.freeKnown}{' · '}该磁盘剩余 {fmtSize(report.freeBytes)}{/if}</div>
    </div>
    <button class="btn small" class:primary={report.reclaimable > 0} disabled={busy || report.reclaimable === 0} on:click={cleanUp}>
      <BrushCleaning size={14} />
      {#if busy}清理中…{:else if report.reclaimable > 0}立即清理 · 可释放 {fmtSize(report.reclaimable)}{:else}没有可清理的内容{/if}
    </button>
  </div>
  {#if report.reclaimable > 0}
    <p class="hint">
      {report.reclaimableSnapshots} 个快照超出游戏限额、位于旧冲突分支或超过时限。已固定的快照绝不在其中。
    </p>
  {/if}
  <div class="sharing">
    <Layers size={14} />
    <p class="hint">
      {#if saving > 0}
        磁盘上实际占用 <strong>{fmtSize(report.diskBytes)}</strong> —— 少了 {fmtSize(saving)}，因为较旧的快照对相同文件只保留一份，
        而不是各留一份副本。
      {:else}
        较旧的快照对相同文件只保留一份而不是各留一份副本，因此存档槽位很多的项目不必在每个快照中都重复存储每个槽位。
      {/if}
      每条分支的最新快照和已固定的快照会保留完整副本。
    </p>
    <button class="btn small ghost" disabled={sharing} on:click={shareNow}>{sharing ? '共享中…' : '立即共享'}</button>
  </div>

  {#if report.games.length}
    <ul class="games">
      {#each report.games as g}
        <li>
          <button class="game" on:click={() => navigate('game', { gameId: g.gameId })} title="打开 {g.name}">
            <span class="name">{g.name}</span>
            <span class="bar"><span style="width: {Math.max(2, (g.bytes / largest) * 100)}%"></span></span>
            <span class="size">{fmtSize(g.bytes)}</span>
            <span class="meta">
              {g.snapshots} 个快照{#if g.pinned}{' · '}{g.pinned} 个已固定{/if}{#if g.diskBytes > 0 && g.diskBytes < g.bytes}{' · '}磁盘上 {fmtSize(g.diskBytes)}{/if}{#if g.reclaimable}{' · '}{fmtSize(g.reclaimable)} 可清理{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if report.biggest.length}
    <h4>最大的快照</h4>
    <ul class="biggest">
      {#each report.biggest as s}
        <li>
          <span class="size">{fmtSize(s.bytes)}</span>
          <span class="what">
            <span class="name">{s.gameName}</span>
            <span class="meta">{whenLabel(s.timestamp)}{#if s.note}{' · '}{s.note}{/if}</span>
          </span>
          {#if s.pinned}<span class="pinned"><Pin size={11} />已固定</span>{/if}
          <button class="btn small ghost icon" title="删除此快照" aria-label="删除快照" on:click={() => remove(s)}><Trash2 size={14} /></button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<style>
  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .sharing {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 4px 0 8px;
    color: var(--text-muted);
  }
  .sharing :global(svg) {
    flex: none;
    margin-top: 2px;
  }
  .sharing .hint {
    flex: 1;
    margin: 0;
  }
  .sharing strong {
    color: var(--text);
    font-weight: 600;
  }
  .sharing .btn {
    flex: none;
  }
  .total {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .games,
  .biggest {
    list-style: none;
    margin-top: 12px;
  }
  .game {
    display: grid;
    grid-template-columns: minmax(120px, 200px) 1fr 80px;
    grid-template-rows: auto auto;
    column-gap: 12px;
    align-items: center;
    width: 100%;
    padding: 7px 8px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .game:hover {
    background: var(--bg-hover);
  }
  .game .name {
    font-size: 0.88rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    height: 8px;
    border-radius: 999px;
    background: var(--bg-active);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--accent);
  }
  .size {
    font-size: 0.84rem;
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }
  .game .meta {
    grid-column: 1 / -1;
    font-size: 0.74rem;
    color: var(--text-faint);
    margin-top: 2px;
  }
  h4 {
    margin: 18px 0 0;
    font-size: 0.72rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-faint);
  }
  .biggest li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 8px;
    border-radius: 8px;
  }
  .biggest li:hover {
    background: var(--bg-hover);
  }
  .biggest .size {
    width: 70px;
    text-align: left;
    font-weight: 600;
  }
  .what {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .what .name {
    font-size: 0.86rem;
  }
  .what .meta {
    font-size: 0.74rem;
    color: var(--text-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pinned {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: 0.7rem;
    font-weight: 600;
  }
</style>
