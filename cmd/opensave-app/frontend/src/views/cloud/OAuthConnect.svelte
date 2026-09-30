<script>
  // Signing in to Google Drive, OneDrive or Dropbox — or the account card
  // once signed in. Kept mounted while other cards are looked at, so a
  // sign-in finishing in the browser meanwhile is still caught.
  import { onDestroy } from 'svelte';
  import { toast, cloudAuthEvent } from '../../lib/stores.js';
  import { api, native } from '../../lib/api.js';
  import { isOAuth, isEmail, providerById } from '../../lib/cloudproviders.js';
  import ProviderIcon from './ProviderIcon.svelte';
  import Spinner from '../../components/ui/Spinner.svelte';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  export let config;
  export let connected = null;
  /** The page's busy flag (a writable store). */
  export let busy;
  /** Re-reads the settings after the sign-in changes. */
  export let reload = async () => {};

  let authCode = '';
  let authInProgress = false;
  let authAuto = false; // backend caught the redirect automatically
  let showManualCode = false;

  $: current = providerById(config.provider);

  // The daemon broadcasts cloud-auth when the browser redirect lands on
  // its temporary localhost listener — sign-in completes with no pasting.
  const unsubAuth = cloudAuthEvent.subscribe((ev) => {
    if (!ev || !authInProgress) return;
    cloudAuthEvent.set(null);
    authInProgress = false;
    showManualCode = false;
    if (ev.success) {
      toast(`已连接为 ${ev.userEmail}`, 'success');
      reload();
    } else {
      toast(ev.error ?? '登录失败', 'error');
    }
  });
  onDestroy(unsubAuth);

  async function startAuth() {
    busy.set(true);
    try {
      const res = await api.post('/api/auth/start', { provider: config.provider });
      native.openExternal(res.authUrl);
      authInProgress = true;
      authAuto = !!res.autoCallback;
      showManualCode = !authAuto;
      if (authAuto) {
        toast('完成登录后 OpenSave 会自动连接。');
      } else {
        toast('请在浏览器窗口中登录，然后将跳转 URL 中的代码粘贴到此处。');
      }
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy.set(false);
    }
  }

  function cancelAuth() {
    authInProgress = false;
    showManualCode = false;
    authCode = '';
  }

  async function finishAuth() {
    busy.set(true);
    try {
      const res = await api.post('/api/auth/callback', { code: authCode.trim() });
      toast(`已连接为 ${res.userEmail}`, 'success');
      authInProgress = false;
      showManualCode = false;
      authCode = '';
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy.set(false);
    }
  }

  async function disconnect() {
    busy.set(true);
    try {
      await api.post('/api/auth/disconnect');
      toast('已断开连接');
      await reload();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy.set(false);
    }
  }
</script>

{#if isOAuth(config.provider)}
  {#if connected === config.provider && config.tokens?.userEmail}
    <div class="acct">
      <div class="acct-icon"><ProviderIcon provider={current} size={26} /></div>
      <div class="acct-info">
        <div class="acct-title">已连接到 {current?.label}</div>
        <div class="acct-sub">
          <span class="acct-dot"></span>
          {isEmail(config.tokens.userEmail) ? config.tokens.userEmail : '已登录——新快照会自动上传'}
        </div>
      </div>
      <button class="btn small danger" disabled={$busy} on:click={disconnect}>断开连接</button>
    </div>
  {:else}
    {#if connected}
      <p class="quiet" style="margin-bottom: 10px;">
        你当前已连接到 {providerById(connected)?.label}——在此登录将替换该连接。
      </p>
    {/if}
    {#if !authInProgress}
      <button class="btn primary" disabled={$busy} on:click={startAuth}>
        使用 {current?.label} 登录
      </button>
      {#if config.provider === 'google_drive'}
        <p class="quiet" style="margin-top: 10px;">
          <TriangleAlert size={14} class="inline-icon warn-icon" />在 Google 的授权页面上，请<strong>勾选</strong>允许 OpenSave 访问
          其自建 Drive 文件的复选框——否则上传会因"权限不足"而失败。
        </p>
      {/if}
    {:else}
      <div class="waiting">
        <Spinner size={16} />
        <div class="waiting-text">
          <strong>等待你完成登录…</strong>
          <span class="quiet">在浏览器中批准访问——OpenSave 会自行连接。</span>
        </div>
        <button class="btn small" on:click={cancelAuth}>取消</button>
      </div>
      {#if !showManualCode && authAuto}
        <button class="linkish" on:click={() => (showManualCode = true)}>
          遇到问题？手动粘贴代码
        </button>
      {/if}
      {#if showManualCode}
        <div class="code">
          <p class="quiet">
            批准访问后，浏览器会跳转到一个 localhost 页面。请复制其地址栏中的 <code>code</code> 值
            并粘贴到这里：
          </p>
          <div class="path-row">
            <input placeholder="4/0AY0e-g7…" bind:value={authCode} />
            <button class="btn primary" disabled={!authCode || $busy} on:click={finishAuth}>连接</button>
          </div>
        </div>
      {/if}
    {/if}
  {/if}
{/if}

<style>
  .quiet {
    color: var(--text-faint);
    font-size: 0.85rem;
  }
  .acct {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 16px 18px;
    background: rgba(var(--success-rgb), 0.05);
    border: 1px solid rgba(var(--success-rgb), 0.3);
    border-radius: var(--radius-lg);
  }
  .acct-icon {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
  .acct-info {
    flex: 1;
    min-width: 0;
  }
  .acct-title {
    font-weight: 600;
    font-size: 0.98rem;
  }
  .acct-sub {
    display: flex;
    align-items: center;
    gap: 7px;
    color: var(--text-dim);
    font-size: 0.82rem;
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .acct-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
  }
  .waiting {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
    border-radius: var(--radius);
  }
  .waiting-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 0.88rem;
  }
  .linkish {
    margin-top: 10px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    font-size: 0.8rem;
    cursor: pointer;
    text-decoration: underline;
    padding: 2px 0;
  }
  .linkish:hover {
    color: var(--text-dim);
  }
  .code {
    margin-top: 12px;
  }
  .code code {
    background: var(--bg);
    padding: 1px 5px;
    border-radius: 4px;
  }
</style>
