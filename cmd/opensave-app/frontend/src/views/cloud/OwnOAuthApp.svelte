<script>
  // ── Your own OAuth app ───────────────────────────────────────────
  // The daemon has always supported a per-provider client id and secret;
  // nothing in the app set them, so the only route was a hand-written API
  // call. Two things needed it. Google's built-in credentials are a shared
  // app that can expire weekly, and OneDrive has NO built-in id at all —
  // Microsoft does not allow a shared public one — so the OneDrive card could
  // be selected but never connect, and the error said to configure it on a
  // screen that did not exist.
  //
  // OneDrive therefore shows these fields open, as its normal setup rather
  // than as a workaround; the others keep them folded away.
  import { toast, settings } from '../../lib/stores.js';
  import { api, native } from '../../lib/api.js';
  import { needsOwnApp } from '../../lib/cloudproviders.js';
  import Chevron from '../../components/ui/Chevron.svelte';

  export let config;
  export let connected = null;
  export let busy;
  /** Re-reads the settings, keeping the given provider selected. */
  export let reload = async (keepProvider) => {};

  // Mounted per provider (the page rebuilds this when the card changes), so
  // one provider's credentials never show under another's name.
  const provider = config.provider;
  let ownAppID = config.customClientIds?.[provider] ?? '';
  let ownAppSecret = config.customClientSecrets?.[provider] ?? '';
  let showOwnApp = needsOwnApp(provider) && !ownAppID;

  async function save() {
    // Changing the id invalidates any tokens already held: they were issued to
    // the old app and no refresh will be accepted. Disconnecting is the honest
    // outcome — leaving them in place would show "Connected" over credentials
    // that cannot work.
    const changed = (config.customClientIds?.[provider] ?? '') !== ownAppID.trim();
    const wasConnected = connected === provider;

    busy.set(true);
    try {
      settings.set(
        await api.post('/api/settings', {
          cloudSync: {
            customClientIds: { [provider]: ownAppID.trim() },
            customClientSecrets: { [provider]: ownAppSecret.trim() }
          }
        })
      );
      if (changed && wasConnected) {
        await api.post('/api/auth/disconnect');
        toast('已保存。请重新登录——旧连接属于之前的应用。', 'success');
      } else {
        toast(ownAppID.trim() ? '已保存。请登录以使用你自己的应用。' : '已清除——将使用内置应用。', 'success');
      }
      // Reload for the fresh tokens/ids, but keep this card selected. The
      // stored provider is whatever was last saved with "Save provider" — so
      // without that, saving credentials for a provider you had only selected
      // drops you back onto the stored one, and the section you were filling
      // in disappears as though nothing happened.
      await reload(provider);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy.set(false);
    }
  }
</script>

<div class="own-app">
  {#if needsOwnApp(provider) && !ownAppID}
    <p class="quiet required">
      <strong>OneDrive 需要你自己的应用注册。</strong> Microsoft 不允许共享凭据，因此 OpenSave
      无法为它内置凭据。请先在
      <button class="linkish" on:click={() => native.openExternal('https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade')}>Azure 门户</button>
      创建一个免费应用，重定向 URI 填 <code>http://localhost/callback</code>，然后将其应用程序
      （客户端）ID 粘贴到下方。
    </p>
  {:else}
    <button class="linkish" on:click={() => (showOwnApp = !showOwnApp)}>
      <Chevron open={showOwnApp} size={12} /> 使用你自己的 OAuth 应用{ownAppID ? '（使用中）' : ''}
    </button>
  {/if}

  {#if showOwnApp || (needsOwnApp(provider) && !ownAppID)}
    <div class="body">
      {#if provider === 'google_drive'}
        <p class="quiet">
          OpenSave 内置的 Google 凭据是一个仍在测试阶段的共享应用，因此 Drive 可能每周都要求你
          重新登录。使用你自己的 Client ID 可以避免这一点。请在
          <button class="linkish" on:click={() => native.openExternal('https://console.cloud.google.com/apis/credentials')}>Google Cloud 控制台</button>
          创建一个 OAuth 客户端，重定向 URI 填 <code>http://localhost/callback</code>。
        </p>
      {:else if provider === 'dropbox'}
        <p class="quiet">
          仅当你想使用自己的 Dropbox 应用而非内置应用时才需要填写。
        </p>
      {/if}
      <div class="field">
        <label for="cb-clientid">Client ID</label>
        <input
          id="cb-clientid"
          bind:value={ownAppID}
          spellcheck="false"
          placeholder={provider === 'google_drive' ? '…apps.googleusercontent.com' : '应用程序（客户端）ID'}
        />
      </div>
      <div class="field">
        <label for="cb-clientsecret">Client secret <span class="quiet">——除非你的应用要求，否则请留空</span></label>
        <input id="cb-clientsecret" type="password" bind:value={ownAppSecret} spellcheck="false" />
      </div>
      <div class="path-row">
        <button class="btn primary" disabled={$busy} on:click={save}>保存凭据</button>
        {#if ownAppID}
          <button
            class="btn small"
            disabled={$busy}
            title="恢复使用 OpenSave 内置的凭据"
            on:click={() => { ownAppID = ''; ownAppSecret = ''; save(); }}
          >
            使用内置应用
          </button>
        {/if}
      </div>
      {#if connected === provider}
        <p class="quiet">
          你已经登录——修改此处会使你断开连接，因为现有登录属于旧的应用。
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .quiet {
    color: var(--text-faint);
    font-size: 0.85rem;
  }
  .own-app {
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  .required {
    margin: 0 0 10px;
  }
  .body {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
</style>
