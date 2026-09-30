<script>
  import { writable } from 'svelte/store';
  import { onMount } from 'svelte';
  import { toast, settings } from '../lib/stores.js';
  import { api, native } from '../lib/api.js';
  import { connectedProviderOf, isOAuth } from '../lib/cloudproviders.js';
  import ProviderPicker from './cloud/ProviderPicker.svelte';
  import ProviderFields from './cloud/ProviderFields.svelte';
  import OAuthConnect from './cloud/OAuthConnect.svelte';
  import OwnOAuthApp from './cloud/OwnOAuthApp.svelte';
  import CloudBrowser from './cloud/CloudBrowser.svelte';
  import ExportDialog from './cloud/ExportDialog.svelte';
  import ImportDialog from './cloud/ImportDialog.svelte';
  import Skeleton from '../components/ui/Skeleton.svelte';
  import Cloud from 'lucide-svelte/icons/cloud';

  let config = null;
  // The provider and its details as last saved, to tell whether the ones on
  // screen still need saving.
  let savedConfig = null;
  // Kept in the general settings rather than the cloud config, but it is a
  // cloud behaviour and is set here with the rest.
  let autoPull = false;
  // Shared by everything on the page that talks to the provider, so one
  // change is in flight at a time.
  const busy = writable(false);

  // The provider the stored OAuth tokens belong to (server truth at load
  // time) — independent of which card is currently selected, so the
  // connected card keeps saying "connected" while you browse the others.
  let connected = null;

  onMount(() => load());

  /** Reads the settings. `keepProvider` keeps that card selected rather than
   *  the one last saved, for a change made to a card not yet saved. */
  async function load(keepProvider) {
    try {
      const s = await api.get('/api/settings');
      const next = s.cloudSync ?? {
        enabled: false, provider: 'local', url: '', username: '', password: '', headers: '{}', folderId: ''
      };
      connected = connectedProviderOf(next);
      savedConfig = structuredClone(next);
      if (keepProvider) next.provider = keepProvider;
      config = next;
      autoPull = !!s.cloudAutoPull;
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // The provider and its details are saved with a button: a provider half
  // filled in is not one to start sending backups to. The switches below
  // save themselves.
  const sansSwitch = (c) => c && { ...c, enabled: undefined };
  $: providerDirty = !!config && !!savedConfig && JSON.stringify(sansSwitch(config)) !== JSON.stringify(sansSwitch(savedConfig));

  async function save() {
    busy.set(true);
    try {
      settings.set(await api.post('/api/settings', { cloudSync: config }));
      savedConfig = structuredClone(config);
      toast('云服务商已保存', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy.set(false);
    }
  }

  // Each switch sends only itself, one at a time and in order, and goes back
  // if the daemon refuses it.
  let switches = Promise.resolve();
  let switchState = null; // null | 'saving' | 'saved'
  function saveSwitch(patch, undo) {
    switchState = 'saving';
    switches = switches.then(async () => {
      try {
        settings.set(await api.post('/api/settings', patch));
        switchState = 'saved';
      } catch (e) {
        undo();
        switchState = null;
        toast(`无法保存：${e.message}`, 'error');
      }
    });
  }
  function setBackupAll(on) {
    config.enabled = on;
    savedConfig = { ...savedConfig, enabled: on };
    saveSwitch({ cloudSync: { enabled: on } }, () => {
      config.enabled = !on;
      savedConfig = { ...savedConfig, enabled: !on };
    });
  }
  function setAutoPull(on) {
    autoPull = on;
    saveSwitch({ cloudAutoPull: on }, () => (autoPull = !on));
  }

  let browserOpen = false;
  let exportOpen = false;
  let importSource = '';

  async function pickImportFile() {
    const src = await native.selectBackupFile('选择要导入的 .sscb 备份文件');
    if (src) importSource = src;
  }
</script>

<div class="head">
  <h2 class="page-title">云备份</h2>
</div>

{#if !config}
  <Skeleton kind="cards" count={2} />
{:else}
  <div class="card">
    <ProviderPicker bind:config {connected} />
    <ProviderFields bind:config />
    <OAuthConnect {config} {connected} {busy} reload={() => load()} />
    {#if isOAuth(config.provider)}
      <!-- Rebuilt per provider, so one provider's credentials never show
           under another's name. -->
      {#key config.provider}
        <OwnOAuthApp {config} {connected} {busy} reload={load} />
      {/key}
    {/if}

    {#if config.provider === 'google_drive'}
      <div class="field folder-id">
        <label for="cb-driveid">Drive 文件夹 ID（可选）</label>
        <input id="cb-driveid" bind:value={config.folderId} placeholder="留空则使用其自动创建的 OpenSave 文件夹" />
        <span class="hint">
          仅用于将快照保存到某个已有的特定 Drive 文件夹——ID 就是该文件夹地址中的那串长代码。
        </span>
      </div>
    {/if}

    {#if providerDirty}
      <div class="actions">
        <span class="unsaved">尚未保存——备份仍会发送到之前保存的服务商。</span>
        <button class="btn primary" disabled={$busy} on:click={save}>保存服务商</button>
      </div>
    {/if}

    <!-- Moved here from Settings → Sync, which the note on this card used to
         send people to: what the cloud does on its own belongs beside where
         it goes. These save as they are switched. -->
    <div class="auto">
      <h4>
        自动
        <span class="switch-state" aria-live="polite">
          {#if switchState === 'saving'}保存中…{:else if switchState === 'saved'}已保存{/if}
        </span>
      </h4>
      <label class="check">
        <input type="checkbox" checked={config.enabled} on:change={(e) => setBackupAll(e.currentTarget.checked)} />
        将每个新快照备份到云端
      </label>
      <p class="hint">
        在上方设置好服务商后即开始上传。快照会保存在那里的
        <strong>OpenSave</strong> 文件夹中。
      </p>
      <label class="check">
        <input type="checkbox" checked={autoPull} on:change={(e) => setAutoPull(e.currentTarget.checked)} />
        从我的其他设备拉取较新的存档
      </label>
      <p class="hint">
        当其他设备的备份正好接续本机当前的存档，且本机存档此后没有变化时，会直接应用而不再询问——这就是
        设备间同步的工作方式。其他情况都会先询问，且无论哪种情况，本机存档都会保留为快照。
      </p>
    </div>

  </div>

  <h3 class="section">云端快照</h3>
  <div class="card entry">
    <div>
      <h3>浏览你的云端库</h3>
      <p class="quiet">
        以封面卡片形式列出云端有快照的所有游戏——可按游戏上传、恢复或删除。
      </p>
    </div>
    <button class="btn primary" on:click={() => (browserOpen = true)}><Cloud size={16} />浏览云端</button>
  </div>

  <h3 class="section">备份文件（.sscb）</h3>
  <div class="card entry">
    <div>
      <h3>导出 / 导入存档</h3>
      <p class="quiet">
        选择本机上的任意存档——无论已跟踪还是刚检测到的——将其连同路径一并导出为一个文件。
        导入可将它们加入快照，或完整还原到磁盘。
      </p>
    </div>
    <div class="entry-actions">
      <button class="btn" disabled={$busy} on:click={pickImportFile}>导入 .sscb</button>
      <button class="btn primary" disabled={$busy} on:click={() => (exportOpen = true)}>导出存档…</button>
    </div>
  </div>
{/if}

{#if exportOpen}
  <ExportDialog on:close={() => (exportOpen = false)} />
{/if}

{#if importSource}
  <ImportDialog source={importSource} on:close={() => (importSource = '')} />
{/if}

{#if browserOpen}
  <CloudBrowser {busy} onAuthLost={() => load()} on:close={() => (browserOpen = false)} />
{/if}

<style>
  .head {
    margin-bottom: 20px;
  }
  .quiet {
    color: var(--text-faint);
    font-size: 0.85rem;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
  }
  .folder-id {
    margin-top: 16px;
  }
  .auto {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  .auto h4 {
    display: flex;
    align-items: baseline;
    gap: 10px;
    font-size: 0.92rem;
    font-weight: 600;
    margin-bottom: 8px;
  }
  .switch-state {
    font-size: 0.76rem;
    font-weight: 400;
    color: var(--text-faint);
  }
  .unsaved {
    font-size: 0.82rem;
    color: var(--warn);
  }
  .auto .hint {
    font-size: 0.8rem;
    color: var(--text-faint);
    margin: 2px 0 12px 27px;
    line-height: 1.5;
  }
  .section {
    margin: 22px 0 10px;
  }
  .entry {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }
  .entry-actions {
    display: flex;
    gap: 8px;
  }
</style>
