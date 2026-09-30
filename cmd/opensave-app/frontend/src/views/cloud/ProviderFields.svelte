<script>
  // Where a provider without a sign-in sends its backups.
  import { native } from '../../lib/api.js';

  export let config;

  async function pickFolder() {
    const dir = await native.selectDirectory('选择备份目标文件夹');
    if (dir) config.url = dir;
  }
</script>

{#if config.provider === 'local'}
  <div class="field">
    <label for="cb-folder">目标文件夹（例如 NAS 挂载点）</label>
    <div class="path-row">
      <input id="cb-folder" bind:value={config.url} placeholder="D:\Backups\OpenSave" />
      <button class="btn" on:click={pickFolder}>浏览</button>
    </div>
  </div>
{:else if config.provider === 'webdav'}
  <div class="field">
    <label for="cb-url">WebDAV URL</label>
    <input id="cb-url" bind:value={config.url} placeholder="https://nas.local/dav/opensave/" />
  </div>
  <div class="two">
    <div class="field">
      <label for="cb-user">用户名</label>
      <input id="cb-user" bind:value={config.username} />
    </div>
    <div class="field">
      <label for="cb-pass">密码</label>
      <input id="cb-pass" type="password" bind:value={config.password} />
    </div>
  </div>
{:else if config.provider === 'webhook'}
  <div class="field">
    <label for="cb-hook">Webhook URL（接收 multipart POST 请求）</label>
    <input id="cb-hook" bind:value={config.url} />
  </div>
  <div class="field">
    <label for="cb-headers">自定义请求头（JSON）</label>
    <input id="cb-headers" bind:value={config.headers} placeholder={'{"Authorization": "Bearer …"}'} />
  </div>
{/if}

<style>
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
</style>
