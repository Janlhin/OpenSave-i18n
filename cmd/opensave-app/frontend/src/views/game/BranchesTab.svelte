<script>
  // Branches: separate lines of saves for one game — a second playthrough, or
  // a run kept apart from the main one.
  import { askConfirm } from '../../lib/stores.js';
  import { api } from '../../lib/api.js';
  import NewBranchDialog from './NewBranchDialog.svelte';
  import Plus from 'lucide-svelte/icons/plus';

  export let game;
  export let runner;
  const { busy, run } = runner;

  $: branches = Object.values(game.branches ?? {});

  let newBranch = '';
  // Creating a branch asks what it starts from in its own dialog rather than
  // a checkbox beside the name field. The two answers do materially
  // different things to the save folder on the next switch, which is not a
  // decision to make by noticing a tickbox.
  let dialogOpen = false;
  function openDialog() {
    if (!newBranch || $busy) return;
    dialogOpen = true;
  }
  const createBranch = (copyCurrentSave) => {
    dialogOpen = false;
    return run(copyCurrentSave ? '已从当前存档创建分支' : '已创建空分支', async () => {
      await api.post(`/api/games/${game.id}/branch`, { name: newBranch, copyCurrentSave });
      newBranch = '';
    });
  };
  const switchBranch = (name) =>
    run(`已切换到“${name}”`, () => api.post(`/api/games/${game.id}/branch/switch`, { name }));
  async function deleteBranch(name) {
    if (!(await askConfirm(`删除分支“${name}”及其全部快照？当前存档和其他分支不受影响。`, { title: '删除分支？', confirmText: '删除', danger: true }))) return;
    run(`已删除分支“${name}”`, () => api.del(`/api/games/${game.id}/branch/${encodeURIComponent(name)}`));
  }
</script>

<div class="card branch-new">
  <div class="new-row">
    <input
      placeholder="新分支名称（如 ng-plus）"
      bind:value={newBranch}
      on:keydown={(e) => e.key === 'Enter' && openDialog()}
    />
    <button class="btn primary" disabled={!newBranch || $busy} on:click={openDialog}><Plus size={15} />创建分支</button>
  </div>
  <span class="hint">
    分支是一条独立的存档线 — 可以是二周目，也可以是想与主线分开的一次游戏。
    系统会询问新分支从什么内容开始。
  </span>
</div>
<div class="list">
  {#each branches as branch (branch.name)}
    <div class="card row">
      <div class="info">
        <div class="top">
          <span class="name">{branch.name}</span>
          {#if branch.name === game.activeBranch}<span class="badge online">当前使用</span>{/if}
        </div>
        <div class="meta">{branch.snapshots?.length ?? 0} 张快照</div>
      </div>
      {#if branch.name !== game.activeBranch}
        <div class="actions">
          <button class="btn small primary" disabled={$busy} on:click={() => switchBranch(branch.name)}>
            切换到此分支
          </button>
          {#if branch.name !== 'main'}
            <button class="btn small danger" disabled={$busy} on:click={() => deleteBranch(branch.name)}>
              删除
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>
<p class="footnote">
  切换分支前会先对当前存档做一次快照，然后恢复另一个分支的最新状态。刚创建的分支还没有自己的状态，
  因此它会以当前存档文件夹里的内容为起点 — 从你在这个分支上拍的第一张快照起，两者才各自分道扬镳。
</p>

{#if dialogOpen}
  <NewBranchDialog
    name={newBranch}
    activeBranch={game.activeBranch}
    busy={$busy}
    on:create={(e) => createBranch(e.detail)}
    on:cancel={() => (dialogOpen = false)}
  />
{/if}

<style>
  .branch-new {
    padding: 14px;
    margin-bottom: 14px;
  }
  .new-row {
    display: flex;
    gap: 10px;
  }
  .new-row input {
    flex: 1;
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    color: var(--text);
    outline: none;
  }
  .branch-new .hint {
    display: block;
    margin-top: 10px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
  }
  .info {
    flex: 1;
    min-width: 0;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .name {
    font-weight: 600;
    font-size: 0.9rem;
  }
  .meta {
    font-size: 0.75rem;
    color: var(--text-faint);
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .footnote {
    margin-top: 12px;
    font-size: 0.8rem;
    color: var(--text-faint);
  }
</style>
