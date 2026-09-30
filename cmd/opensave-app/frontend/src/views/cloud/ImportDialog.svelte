<script>
  // Import a .sscb backup. "snapshots" (the default) never touches live
  // files; "overwrite" restores every save in the file onto disk — the daemon
  // takes safety copies of anything it replaces. Fires `close`.
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { plural } from '../../lib/format.js';
  import { toast, backupProgressEvent } from '../../lib/stores.js';
  import { api } from '../../lib/api.js';
  import Modal from '../../components/ui/Modal.svelte';
  import PackageOpen from 'lucide-svelte/icons/package-open';
  import ModalFoot from '../../components/ui/ModalFoot.svelte';
  import ProgressBar from '../../components/ui/ProgressBar.svelte';

  /** The backup file chosen. */
  export let source = '';

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  let mode = 'snapshots';
  let importing = false;

  // Live per-game progress while the daemon walks the import.
  let prog = null;
  const unsubProg = backupProgressEvent.subscribe((ev) => {
    prog = ev && !ev.complete ? ev : null;
  });
  onDestroy(unsubProg);

  async function run() {
    importing = true;
    try {
      const res = await api.post('/api/backup/restore', { sourcePath: source, mode });
      if (res.legacy) {
        toast(`已导入 ${res.imported} 个快照，跳过 ${res.skipped} 个`, 'success');
      } else {
        const bits = [];
        if (res.restored) bits.push(`${res.restored} 个已还原`);
        if (res.snapshots) bits.push(`${res.snapshots} 个已加入快照`);
        if (res.skipped) bits.push(`${res.skipped} 个已跳过`);
        toast(`导入完成：${bits.join('，') || '未导入任何内容'}——详情见活动记录`, res.skipped ? 'info' : 'success');
      }
      close();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      importing = false;
    }
  }
</script>

<!-- Two choices and a footer don't need the full browser-modal height —
     sized to content so the dialog doesn't look hollow. -->
<Modal title="导入备份" icon={PackageOpen} onClose={close} closable={!importing} width={560} height="auto" maxHeight="min(78vh, 720px)">
  <svelte:fragment slot="sub"><code>{source}</code></svelte:fragment>

  <div class="modes">
    <label class="mode" class:selected={mode === 'snapshots'}>
      <input type="radio" bind:group={mode} value="snapshots" />
      <div>
        <div class="mode-title">加入快照 <span class="badge online">推荐</span></div>
        <p class="quiet">
          文件中的每个存档都会加入其游戏的快照历史。磁盘上的内容不做任何改动——你随时可以选择
          逐个还原游戏。本机未跟踪的游戏会在活动记录中列出并跳过。
        </p>
      </div>
    </label>
    <label class="mode danger-mode" class:selected={mode === 'overwrite'}>
      <input type="radio" bind:group={mode} value="overwrite" />
      <div>
        <div class="mode-title">覆盖当前存档</div>
        <p class="quiet">
          文件中的每个存档都会写入本机对应的位置——已跟踪的游戏写入其跟踪文件夹，其他游戏写入备份中
          记录的路径。写入前会先对现有内容做一份安全副本。之后可在活动记录中查看具体还原了什么、
          还原到了哪里。
        </p>
      </div>
    </label>
  </div>

  {#if importing && prog}
    <ProgressBar done={prog.done} total={prog.total}>
      导入第 {Math.min(prog.done + 1, prog.total)} 个，共 {prog.total} 个
      {#if prog.current}&nbsp;— <code>{prog.current}</code>{/if}
    </ProgressBar>
  {/if}
  <ModalFoot>
    <span class="quiet">任何覆盖操作都会先做安全副本，绝不会例外。</span>
    <div class="actions">
      <button class="btn" disabled={importing} on:click={close}>取消</button>
      <button class="btn {mode === 'overwrite' ? 'danger' : 'primary'}" disabled={importing} on:click={run}>
        {importing ? '导入中…' : mode === 'overwrite' ? '覆盖存档' : '加入快照'}
      </button>
    </div>
  </ModalFoot>
</Modal>

<style>
  .quiet {
    color: var(--text-faint);
    font-size: 0.85rem;
  }
  .modes {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 20px;
  }
  .mode {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
  }
  .mode input {
    margin-top: 3px;
  }
  .mode.selected {
    border-color: var(--accent);
    background: var(--bg-hover, rgba(128, 128, 128, 0.06));
  }
  .mode.danger-mode.selected {
    border-color: var(--danger, var(--danger));
  }
  .mode-title {
    font-weight: 600;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mode p {
    margin: 0;
    font-size: 0.82rem;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
</style>
