<script>
  // Which collections a game is in, ticked on and off, with a new one made
  // in place — and the collections themselves renamed or deleted, since this
  // is where they are looked at. Opened from a game's menu.
  import { tick } from 'svelte';
  import Tags from 'lucide-svelte/icons/tags';
  import Star from 'lucide-svelte/icons/star';
  import Pencil from 'lucide-svelte/icons/pencil';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import Modal from './ui/Modal.svelte';
  import ModalFoot from './ui/ModalFoot.svelte';
  import { askConfirm } from '../lib/stores.js';
  import { collectionsDialog } from '../lib/gameactions.js';
  import { collections, setInCollection, createCollection, renameCollection, deleteCollection } from '../lib/collections.js';

  $: game = $collectionsDialog;
  const close = () => collectionsDialog.set(null);

  let newName = '';
  let renaming = null;
  let renameDraft = '';

  async function add() {
    const name = newName.trim();
    if (!name) return;
    const made = await createCollection(name);
    if (made) {
      newName = '';
      await setInCollection(made.id, game.id, true);
    }
  }

  async function startRename(c) {
    renaming = c.id;
    renameDraft = c.name;
    await tick();
    document.getElementById(`rename-${c.id}`)?.focus();
  }
  async function saveRename(c) {
    if (renaming !== c.id) return;
    renaming = null;
    if (renameDraft.trim() && renameDraft.trim() !== c.name) await renameCollection(c.id, renameDraft);
  }

  async function remove(c) {
    const n = c.gameIds.length;
    if (!(await askConfirm(`确定删除合集“${c.name}”吗？${n ? `其中的 ${n} 个游戏仍会保持跟踪，只会移除这个分组。` : '该合集是空的。'}`, { title: '删除合集？', confirmText: '删除', danger: true }))) return;
    await deleteCollection(c.id);
  }
</script>

{#if game}
  <Modal title="合集" icon={Tags} onClose={close} width={460} height="auto" maxHeight="min(78vh, 620px)">
    <svelte:fragment slot="sub">{game.name}</svelte:fragment>
    <div class="body">
      <ul>
        {#each $collections as c (c.id)}
          <li>
            {#if renaming === c.id}
              <input
                id="rename-{c.id}"
                class="rename"
                maxlength="40"
                bind:value={renameDraft}
                on:keydown={(e) => {
                  if (e.key === 'Enter') saveRename(c);
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    renaming = null;
                  }
                }}
                on:blur={() => saveRename(c)}
              />
            {:else}
              <label class="check">
                <input type="checkbox" checked={c.gameIds.includes(game.id)} on:change={(e) => setInCollection(c.id, game.id, e.currentTarget.checked)} />
                {#if c.builtin}<span class="star"><Star size={14} /></span>{/if}
                <span class="name">{c.name}</span>
                <span class="count">{c.gameIds.length}</span>
              </label>
              {#if !c.builtin}
                <button class="btn small ghost icon" title="重命名" aria-label="重命名 {c.name}" on:click={() => startRename(c)}><Pencil size={13} /></button>
                <button class="btn small ghost icon" title="删除" aria-label="删除 {c.name}" on:click={() => remove(c)}><Trash2 size={13} /></button>
              {/if}
            {/if}
          </li>
        {/each}
      </ul>
      <form class="new" on:submit|preventDefault={add}>
        <input placeholder="新建合集，例如：正在游玩" maxlength="40" bind:value={newName} />
        <button class="btn small" type="submit" disabled={!newName.trim()}><Plus size={14} />添加</button>
      </form>
      <p class="hint">合集用于在游戏库中查找游戏；不会改变游戏的同步方式。</p>
    </div>
    <ModalFoot>
      <span></span>
      <button class="btn primary" on:click={close}>完成</button>
    </ModalFoot>
  </Modal>
{/if}

<style>
  .body {
    padding: 12px 22px 6px;
    overflow: auto;
  }
  ul {
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 38px;
  }
  li .check {
    flex: 1;
    min-width: 0;
  }
  .name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .star {
    display: flex;
    color: var(--warn);
  }
  .count {
    font-size: 0.75rem;
    color: var(--text-faint);
  }
  .rename,
  .new input {
    flex: 1;
    padding: 7px 10px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    font: inherit;
    font-size: 0.88rem;
    outline: none;
  }
  .rename:focus,
  .new input:focus {
    border-color: var(--accent);
  }
  .new {
    display: flex;
    gap: 8px;
    margin: 12px 0 8px;
  }
</style>
