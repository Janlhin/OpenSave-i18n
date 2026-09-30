<script>
  // Whether every snapshot can still be restored: when they were last read
  // back, what was found, what to do about what was found, and how often it
  // happens by itself. See daemon/verify.go and daemon/repair.go.
  import { onMount } from 'svelte';
  import FileCheck from 'lucide-svelte/icons/file-check';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';
  import CloudDownload from 'lucide-svelte/icons/cloud-download';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import { api } from '../../lib/api.js';
  import { games, navigate, toast, askConfirm, settings } from '../../lib/stores.js';
  import { timeAgo } from '../../lib/timeago.js';
  import { whenLabel } from '../../lib/snapshots.js';

  let summary = null;
  let checking = false;
  let repairing = false;
  let removing = false;
  let details = false;

  async function load() {
    try {
      summary = await api.get('/api/snapshots/check');
    } catch {
      summary = null;
    }
  }
  onMount(load);

  async function checkNow() {
    checking = true;
    try {
      const report = await api.post('/api/snapshots/check', {});
      summary = report.summary;
      const fixed = report.repaired ? ` —— ${report.repaired} 个已从云端放回` : '';
      toast(
        report.damaged.length
          ? `${report.checked} 个快照中有 ${report.damaged.length} 个无法恢复${fixed}`
          : `已检查 ${report.checked} 个快照——全部可以恢复${fixed}`,
        report.damaged.length ? 'error' : 'success'
      );
      settings.update((s) => (s ? { ...s, lastVerifyMs: Date.now() } : s));
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      checking = false;
    }
  }

  // Their cloud copies, where there are whole ones: fetched, checked, and
  // put back where the archives were.
  async function repair() {
    repairing = true;
    try {
      const r = await api.post('/api/snapshots/repair', {});
      const back = r.repaired.length;
      const left = r.remaining.length;
      if (!r.cloudChecked) {
        toast(`无法查看云端：${r.cloudError}`, 'error');
      } else if (back && left) {
        toast(`已从云端放回 ${back} 个；${left} 个在云端没有副本`, 'success');
      } else if (back) {
        toast(`已从云端放回全部 ${back} 个`, 'success');
      } else {
        toast(`它们在云端都没有副本`, 'info');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      repairing = false;
      load();
    }
  }

  async function removeDamaged() {
    const n = summary.damaged.length;
    const ok = await askConfirm(
      `从历史中移除 ${n} 个无法恢复的快照？它们的存档文件已丢失或损坏，因此不会失去任何可恢复的内容；其他所有快照都会保留。`,
      { title: '移除这些快照？', confirmText: `移除 ${n}`, danger: true }
    );
    if (!ok) return;
    removing = true;
    try {
      const r = await api.post('/api/snapshots/forget-damaged', {});
      toast(`已移除 ${r.removed.length} 个无法恢复的快照`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      removing = false;
      load();
    }
  }

  // How often it happens by itself: a daemon setting (verify_every_days).
  const EVERY = [
    [1, '每天'],
    [3, '每 3 天'],
    [7, '每周'],
    [14, '每 2 周'],
    [30, '每月']
  ];
  async function setEvery(days) {
    try {
      const saved = await api.post('/api/settings', { verifyEveryDays: days });
      settings.set(saved?.deviceName !== undefined ? saved : { ...$settings, verifyEveryDays: days });
    } catch (e) {
      toast(e.message, 'error');
    }
  }
  $: every = $settings?.verifyEveryDays ?? 7;
  $: auto = every > 0;
  let lastEvery = 7;
  $: if (every > 0) lastEvery = every;
  $: nextAt = auto && $settings?.lastVerifyMs ? $settings.lastVerifyMs + every * 86_400_000 : 0;

  const iso = (ms) => new Date(ms).toISOString();
  const nameOf = (id) => $games[id]?.name ?? id;
  // The damaged, by game: a list of every row reads as a wall of paths.
  $: byGame = Object.entries(
    (summary?.damaged ?? []).reduce((acc, s) => {
      (acc[s.gameId] ??= []).push(s);
      return acc;
    }, {})
  ).sort((a, b) => b[1].length - a[1].length);
  function inWords(ms) {
    const days = Math.round((ms - Date.now()) / 86_400_000);
    if (days <= 0) return '即将进行';
    return days === 1 ? '明天' : `${days} 天后`;
  }
</script>

<div class="checks">
  {#if summary}
    <div class="state" class:bad={summary.damaged.length}>
      {#if summary.damaged.length}
        <TriangleAlert size={18} />
        <span>
          <strong>{summary.damaged.length} 个快照无法恢复。</strong>
          它们的存档文件在 OpenSave 之外被删除或损坏。其他所有快照都完好，每个游戏的存档也正常。
        </span>
      {:else if summary.lastCheckedMs}
        <FileCheck size={18} />
        <span>
          <strong>检查过的快照全部可以恢复。</strong>
          已检查 {summary.checked} / {summary.total} 个，上次检查于 {timeAgo(iso(summary.lastCheckedMs))}。
        </span>
      {:else}
        <FileCheck size={18} />
        <span>尚未检查。</span>
      {/if}
    </div>

    {#if summary.damaged.length}
      <ul class="bygame">
        {#each byGame as [gameId, list] (gameId)}
          <li>
            <button class="linklike" on:click={() => navigate('game', { gameId, snapshot: list[0].id })}>{nameOf(gameId)}</button>
            <span class="count">{list.length} 个快照，{whenLabel(list[list.length - 1].timestamp)}{list.length > 1 ? ` 至 ${whenLabel(list[0].timestamp)}` : ''}</span>
          </li>
        {/each}
      </ul>
      <div class="fix">
        <button class="btn small primary" disabled={repairing || removing} on:click={repair}>
          <CloudDownload size={14} />{repairing ? '正在查看云端…' : '在云端寻找副本'}
        </button>
        <button class="btn small" disabled={repairing || removing} on:click={removeDamaged}>
          <Trash2 size={14} />{removing ? '正在移除…' : '从历史中移除'}
        </button>
        <button class="linklike quiet" on:click={() => (details = !details)}>{details ? '收起详情' : '详情'}</button>
      </div>
      <p class="hint">
        开启云备份后，每个快照在创建时都已上传：云端若有完整副本，会取回、校验并放回原处。
        任何地方都没有副本的快照只能移除——这条记录指向一个已不存在的存档。
      </p>
      {#if details}
        <ul class="damaged">
          {#each summary.damaged as s (s.id)}
            <li>
              <button class="linklike" on:click={() => navigate('game', { gameId: s.gameId, snapshot: s.id })}>
                {nameOf(s.gameId)} — {whenLabel(s.timestamp)}
              </button>
              <span class="why">{s.problem}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  {/if}

  <div class="schedule">
    <label class="toggle">
      <input type="checkbox" checked={auto} on:change={(e) => setEvery(e.currentTarget.checked ? lastEvery : 0)} />
      自动检查
    </label>
    {#if auto}
      <select value={every} on:change={(e) => setEvery(Number(e.currentTarget.value))} aria-label="检查频率">
        {#each EVERY as [days, label]}
          <option value={days}>{label}</option>
        {/each}
        {#if !EVERY.some(([d]) => d === every)}<option value={every}>每 {every} 天</option>{/if}
      </select>
      <span class="hint">{nextAt ? `下次 ${inWords(nextAt)}。` : '首次检查在 OpenSave 启动后稍后进行。'}云端仍完整保存的内容会随发现随放回。</span>
    {:else}
      <span class="hint">快照在恢复之前仍会进行检查。</span>
    {/if}
  </div>

  <div class="actions">
    <button class="btn small" disabled={checking} on:click={checkNow}>{checking ? '检查中…' : '立即检查所有快照'}</button>
    <span class="hint">每个快照都会完整读回，并逐一比对文件校验和。快照在恢复之前也会进行检查。</span>
  </div>
</div>

<style>
  .checks {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .state {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 0.86rem;
    color: var(--text-dim);
  }
  .state :global(svg) {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--success);
  }
  .state.bad :global(svg) {
    color: var(--danger);
  }
  .state strong {
    color: var(--text);
  }
  .bygame {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.84rem;
  }
  .bygame li {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }
  .count {
    color: var(--text-faint);
    font-size: 0.8rem;
  }
  .fix {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .fix + .hint {
    margin: -4px 0 0;
  }
  .damaged {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.82rem;
  }
  .damaged li {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .why {
    color: var(--danger-text);
    font-size: 0.78rem;
    word-break: break-all;
  }
  .linklike {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    color: var(--text);
    text-align: left;
    cursor: pointer;
    text-decoration: underline;
  }
  .linklike.quiet {
    color: var(--text-faint);
    font-size: 0.82rem;
  }
  .schedule {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.86rem;
    cursor: pointer;
  }
  .schedule select {
    padding: 6px 10px;
    background-color: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    font-size: 0.85rem;
  }
  .schedule .hint,
  .actions .hint {
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
</style>
