<script>
  // Every folder one game was found in, opened under its tile in the scan.
  // Ticking one fires `toggle` with its id.
  import { createEventDispatcher } from 'svelte';
  import { contentsLabel, normPath } from '../../lib/scan.js';

  export let group;
  export let selected = new Set();
  /** Normalised save paths already tracked. */
  export let trackedPaths = new Set();

  const dispatch = createEventDispatcher();
</script>

<div class="panel">
  <div class="head">
    <strong>{group.primary.name}</strong> 在 {group.members.length} 个位置被发现。
    勾选属于这份存档的文件夹 — 它们会被作为一个游戏来跟踪。
  </div>
  {#each group.members as m (m.id)}
    {@const tracked = trackedPaths.has(normPath(m.savePath))}
    <label class="row" class:covered={m.role === 'inside'}>
      <input
        type="checkbox"
        checked={selected.has(m.id)}
        disabled={m.role === 'inside' || tracked}
        on:change={() => dispatch('toggle', m.id)}
      />
      <span class="main">
        <span class="path">{m.savePath}</span>
        <span class="meta">
          {contentsLabel(m)}
          {#if m.role === 'primary'}<span class="tag tag-primary">存档文件夹</span>
          {:else if m.role === 'location'}<span class="tag tag-loc">同一份存档的一部分</span>
          {:else if m.role === 'inside'}<span class="tag">已包含在上面的文件夹中</span>
          {:else if m.role === 'alternative'}<span class="tag tag-alt">另一个副本 — 可能是旧安装的残留</span>{/if}
          {#if tracked}<span class="tag tag-primary">已在跟踪</span>{/if}
        </span>
      </span>
    </label>
  {/each}
</div>

<style>
  /* Spans the grid so the folder list reads as a list, not as a tile. */
  .panel {
    grid-column: 1 / -1;
    background: var(--bg-elev, rgba(127, 127, 127, 0.08));
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px 14px;
    margin: 2px 0 10px;
  }
  .head {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-bottom: 10px;
  }
  .row {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 6px 4px;
    border-top: 1px solid var(--border);
    cursor: pointer;
  }
  .row:first-of-type {
    border-top: 0;
  }
  .row.covered {
    opacity: 0.55;
    cursor: default;
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .path {
    font-size: 0.78rem;
    color: var(--text);
    word-break: break-all;
  }
  .meta {
    font-size: 0.72rem;
    color: var(--text-faint);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .tag {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0 7px;
    font-size: 0.68rem;
    line-height: 1.5;
    color: var(--text-dim);
  }
  .tag-primary {
    border-color: var(--accent);
    color: var(--accent-text);
  }
  .tag-loc {
    border-color: var(--ok, var(--accent));
    color: var(--ok, var(--accent));
  }
  .tag-alt {
    border-color: var(--warn, var(--border));
    color: var(--warn, var(--text-dim));
  }
</style>
