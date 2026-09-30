<script>
  // This game's snapshots in the cloud backup: restore one, or send up the
  // ones that are only here.
  import { navigate, toast, askConfirm, settings } from '../../lib/stores.js';
  import { api } from '../../lib/api.js';
  import { fmtSize } from '../../lib/format.js';
  import Spinner from '../../components/ui/Spinner.svelte';
  import Cloud from 'lucide-svelte/icons/cloud';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Upload from 'lucide-svelte/icons/upload';

  export let game;
  export let runner;
  const { busy, run } = runner;

  let snaps = null;
  let loading = false;

  async function load() {
    loading = true;
    snaps = null;
    try {
      snaps = await api.get(`/api/cloud/snapshots/${game.id}`);
    } catch (e) {
      toast(e.message, 'error');
      snaps = [];
    } finally {
      loading = false;
    }
  }
  load();

  const restore = async (snap) => {
    if (!(await askConfirm(`下载云端快照 ${snap.snapshotId} 并覆盖当前存档？`, { title: '从云端恢复？', confirmText: '下载并恢复' }))) return;
    return run('已从云端恢复', async () => {
      await api.post(`/api/cloud/restore/${game.id}`, { fileName: snap.name });
    });
  };

  const upload = () =>
    run('已上传到云端', async () => {
      const res = await api.post(`/api/cloud/sync-local/${game.id}`);
      toast(`已上传 ${res.uploaded} 个，跳过 ${res.skipped} 个`, 'success');
      await load();
    });
</script>

<div class="card">
  <div class="head">
    <div>
      <h3 class="with-icon"><Cloud size={18} /> {game.name} 的云端快照</h3>
      <p class="sub">已备份到所配置云服务商的快照。</p>
    </div>
    <div class="actions">
      <button class="btn small" disabled={$busy} on:click={load}><RefreshCw size={13} />刷新</button>
      <button class="btn small primary" disabled={$busy} on:click={upload}><Upload size={13} />上传本地快照</button>
    </div>
  </div>

  {#if loading}
    <div class="quiet-block"><Spinner size={13} /> 正在加载云端快照…</div>
  {:else if !snaps || snaps.length === 0}
    <div class="quiet-block">
      <p>这个游戏还没有云端快照。</p>
      {#if $settings?.cloudSync?.ready}
        <p class="hint">新快照在创建时会自动上传。“上传本地快照”则发送在此之前创建的那些。</p>
      {:else}
        <p class="hint">
          先在<button class="linklike" on:click={() => navigate('cloud')}>云备份</button>中配置服务商，
          再使用“上传本地快照”。
        </p>
      {/if}
    </div>
  {:else}
    <table>
      <thead>
        <tr><th>分支</th><th>日期</th><th>大小</th><th></th></tr>
      </thead>
      <tbody>
        {#each snaps as snap (snap.name)}
          <tr>
            <td><span class="badge offline">{snap.branch}</span></td>
            <td class="mono">{new Date(snap.createdTime).toLocaleString()}</td>
            <td class="mono">{fmtSize(snap.sizeBytes)}</td>
            <td class="right">
              <button class="btn small primary" disabled={$busy} on:click={() => restore(snap)}>恢复</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }
  .sub {
    font-size: 0.82rem;
    color: var(--text-faint);
    margin-top: 3px;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .quiet-block {
    padding: 30px 10px;
    text-align: center;
    color: var(--text-faint);
  }
  .hint {
    font-size: 0.82rem;
    margin-top: 6px;
  }
  .linklike {
    background: none;
    border: none;
    color: var(--accent-text);
    cursor: pointer;
    padding: 0;
    font: inherit;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }
  th {
    text-align: left;
    color: var(--text-faint);
    font-weight: 600;
    font-size: 0.75rem;
    padding: 6px 10px;
    border-bottom: 1px solid var(--border);
  }
  td {
    padding: 9px 10px;
    border-bottom: 1px solid var(--border);
  }
  tr:last-child td {
    border-bottom: none;
  }
  .mono {
    font-family: 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.78rem;
    color: var(--text-dim);
  }
  .right {
    text-align: right;
  }
</style>
