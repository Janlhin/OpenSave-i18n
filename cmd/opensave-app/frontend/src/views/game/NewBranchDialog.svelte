<script>
  // What a new branch starts from. Fires `create` with true for a copy of the
  // current save, false for an empty one; `cancel` otherwise.
  import { dialogOut } from '../../lib/motion.js';
  import { createEventDispatcher } from 'svelte';
  import GitBranch from 'lucide-svelte/icons/git-branch';
  import History from 'lucide-svelte/icons/history';

  export let name = '';
  export let activeBranch = '';
  export let busy = false;

  const dispatch = createEventDispatcher();
  // Default to copying: a branch that keeps your save can never surprise you.
  let copySave = true;

  // Escape closes it, as in every other dialog in the app.
  const onKeydown = (e) => e.key === 'Escape' && dispatch('cancel');
</script>

<svelte:window on:keydown={onKeydown} />

<!-- The same furniture as the conflict modal on purpose — both are "this is
     about to touch your save folder, choose". -->
<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="overlay" on:click={() => dispatch('cancel')} out:dialogOut|global>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal card" on:click|stopPropagation>
    <h3 class="with-icon"><GitBranch size={19} /> 新建分支 — {name}</h3>
    <p class="desc">它应该从什么内容开始？</p>

    <label class="choice" class:sel={copySave}>
      <input type="radio" bind:group={copySave} value={true} />
      <span class="c-body">
        <span class="c-title">当前存档的副本</span>
        <span class="c-desc">
          “{name}”从你现在的进度开始。直到你在这个分支上拍下第一张快照之前，两者完全相同 —
          因此适合在不丢失进度的前提下做些尝试。
        </span>
      </span>
    </label>

    <label class="choice" class:sel={!copySave}>
      <input type="radio" bind:group={copySave} value={false} />
      <span class="c-body">
        <span class="c-title">全新开始 — 无存档</span>
        <span class="c-desc">
          “{name}”从空白开始，用于从头开始的全新一周目。切换到它时会清空存档文件夹 —
          当前存档会先被快照，切回 <strong>{activeBranch}</strong> 时立即恢复。
        </span>
      </span>
    </label>

    <div class="actions">
      <button class="btn" on:click={() => dispatch('cancel')}>取消</button>
      <button class="btn primary" disabled={busy} on:click={() => dispatch('create', copySave)}>创建分支</button>
    </div>
    <p class="hint-line">
      <History size={15} class="inline-icon" /> 无论哪种方式都不会丢失数据。在分支间切换时会先对存档文件夹中的内容做快照，
      如果快照无法完成，就不会改动任何东西。
    </p>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: var(--overlay);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 90;
  }
  .modal {
    width: 520px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 80px);
    overflow-y: auto;
  }
  .modal h3 {
    margin-bottom: 8px;
    overflow-wrap: anywhere;
  }
  .desc {
    color: var(--text-dim);
    font-size: 0.9rem;
    margin-bottom: 14px;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px;
    margin-bottom: 10px;
    cursor: pointer;
    transition:
      border-color 0.13s ease,
      background 0.13s ease;
  }
  .choice:hover {
    border-color: var(--border-strong);
  }
  .choice.sel {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .choice input {
    margin-top: 1px;
  }
  .c-body {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .c-title {
    font-size: 0.9rem;
    font-weight: 600;
  }
  .c-desc {
    font-size: 0.8rem;
    color: var(--text-dim);
    line-height: 1.5;
  }
  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 14px;
  }
  .hint-line {
    margin-top: 12px;
    font-size: 0.78rem;
    color: var(--text-faint);
    line-height: 1.5;
  }
</style>
