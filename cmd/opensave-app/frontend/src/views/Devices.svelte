<script>
  import { slidingIndicator } from '../lib/motion.js';
  import { peers, discoveredPeers, wanRoom, appUpdate, toast, askConfirm } from '../lib/stores.js';
  import { api, native } from '../lib/api.js';
  import InternetSync from './InternetSync.svelte';
  import ProtectionBadge from '../components/ProtectionBadge.svelte';
  import { protectionState } from '../lib/protection.js';
  import DeviceIcon from '../components/DeviceIcon.svelte';
  import Globe from 'lucide-svelte/icons/globe';
  import Network from 'lucide-svelte/icons/network';
  import Download from 'lucide-svelte/icons/download';

  export let params = {};

  let manualIp = '';
  let manualPort = 8383;
  let busy = false;
  // Which "add a device" method is shown. Deep-links can request the
  // internet tab; otherwise default to the local network.
  let connectTab = params.tab === 'internet' ? 'wan' : 'lan';

  $: pairedList = Object.values($peers).sort((a, b) => a.name.localeCompare(b.name));
  $: pairedIds = new Set(pairedList.map((p) => p.id));
  $: lanDiscovered = $discoveredPeers.filter((d) => !d.isWan && !pairedIds.has(d.id));

  async function run(fn, okMsg) {
    if (busy) return;
    busy = true;
    try {
      await fn();
      if (okMsg) toast(okMsg, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = false;
    }
  }

  const pairDiscovered = (d) =>
    run(() => api.post('/api/peers/pair', { address: d.address, port: d.port }), `已向 ${d.deviceName} 发送配对请求`);
  const pairManual = () =>
    run(() => api.post('/api/peers/pair', { address: manualIp, port: Number(manualPort) }), '配对请求已发送');
  const unpair = async (peer) => {
    if (!(await askConfirm(`解除与"${peer.name}"的配对？双方设备上的游戏都会保留，但将停止互相同步。`, { title: '解除配对？', confirmText: '解除配对', danger: true }))) return;
    run(() => api.del(`/api/peers/${peer.id}`), `已解除与 ${peer.name} 的配对`);
  };

  // The only repair for a pairing with no encryption key is to make it again,
  // and this button can only do the first half of that. Saying "Pair again to
  // encrypt" on a control that just unpairs would leave someone believing they
  // had fixed it, with two devices that no longer sync at all.
  const repairPairing = async (peer) => {
    const ok = await askConfirm(
      `解除与"${peer.name}"的配对，然后重新配对两台设备以交换加密密钥。` +
        `双方的游戏和存档都保持原样。在重新配对之前，` +
        `这两台设备之间不会同步任何内容。`,
      { title: '解除配对以便重新配对？', confirmText: '立即解除' }
    );
    if (!ok) return;
    run(
      () => api.del(`/api/peers/${peer.id}`),
      `已解除与 ${peer.name} 的配对——请重新配对两台设备以加密同步内容`
    );
  };

  // Peer-to-peer app update: pull the newer build the peer is running and
  // install it here — no manually copying the exe between machines.
  const updateFromPeer = async (peer) => {
    const ok = await askConfirm(
      `${peer.name} 正在运行较新的 OpenSave 版本（${peer.appVersion}）。要从 ${peer.name} 下载并更新本设备吗？完成后 OpenSave 会自动重启。`,
      { title: '更新 OpenSave？', confirmText: '更新并重启' }
    );
    if (!ok) return;
    const err = await native.installFromPeer(peer.id);
    if (err) toast(err, 'error');
  };

  const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '从未');
</script>

<div class="head">
  <h2 class="page-title">设备</h2>
</div>

<h3 class="section">已配对的设备</h3>
{#if pairedList.length === 0}
  <div class="empty">
    <h3>暂无已配对的设备</h3>
    <p>在下方配对设备——同一 Wi-Fi 下会自动出现，也可以用房间码通过互联网连接。</p>
  </div>
{:else}
  <div class="list">
    {#each pairedList as peer (peer.id)}
      <div class="card peer">
        <DeviceIcon type={peer.deviceType} />
        <div class="peer-info">
          <div class="peer-name">
            {peer.name}
            <span class="badge" class:online={peer.status === 'online'} class:offline={peer.status !== 'online'}>
              {peer.status}
            </span>
          </div>
          <div class="peer-meta">
            {peer.address === 'relay' ? '互联网中继' : `${peer.address}:${peer.port}`}
            · 上次同步 {fmtTime(peer.lastSynced)}
            {#if peer.appVersion}· OpenSave {peer.appVersion}{/if}
          </div>
          <!-- Per device, next to how it is reached, because that is the
               context the answer depends on. -->
          <div class="peer-protection">
            <ProtectionBadge {peer} compact />
            {#if protectionState(peer) === 'open'}
              <button class="linkish" disabled={busy} on:click={() => repairPairing(peer)}>
                修复
              </button>
            {/if}
          </div>
        </div>
        {#if peer.hasNewerBuild && peer.status === 'online'}
          <button class="btn small primary" disabled={busy || !!$appUpdate} on:click={() => updateFromPeer(peer)}>
            <Download size={14} />从此设备更新
          </button>
        {/if}
        <button class="btn small danger" disabled={busy} on:click={() => unpair(peer)}>解除配对</button>
      </div>
    {/each}
  </div>
{/if}

<h3 class="section">添加设备</h3>
<div class="pill-tabs connect-tabs" use:slidingIndicator={{ inset: 10 }}>
  <button class:active={connectTab === 'lan'} on:click={() => (connectTab = 'lan')}><Network size={15} />本地网络</button>
  <button class:active={connectTab === 'wan'} on:click={() => (connectTab = 'wan')}>
    <Globe size={15} />通过互联网
    {#if $wanRoom?.connected}<span class="tab-dot"></span>{/if}
  </button>
</div>

{#if connectTab === 'lan'}
  <p class="quiet lan-intro">
    同一 Wi-Fi/以太网下运行 OpenSave 的设备会自动互相发现，无需任何设置。
  </p>
  <h4 class="subsection">在网络中发现</h4>
  {#if lanDiscovered.length === 0}
    <p class="quiet">本地网络上未发现未配对的设备。请确认另一台设备上的 OpenSave 正在运行。</p>
  {:else}
    <div class="list">
      {#each lanDiscovered as d (d.id)}
        <div class="card peer">
          <DeviceIcon type={d.deviceType} />
          <div class="peer-info">
            <div class="peer-name">{d.deviceName}</div>
            <div class="peer-meta">{d.address}:{d.port}</div>
          </div>
          <button class="btn small primary" disabled={busy} on:click={() => pairDiscovered(d)}>配对</button>
        </div>
      {/each}
    </div>
  {/if}

  <h4 class="subsection">通过 IP 地址添加</h4>
  <div class="card manual">
    <input placeholder="192.168.1.42" bind:value={manualIp} />
    <input class="port" type="number" bind:value={manualPort} />
    <button class="btn primary" disabled={!manualIp || busy} on:click={pairManual}>发送配对请求</button>
  </div>
{:else}
  <InternetSync />
{/if}

<style>
  .head {
    margin-bottom: 20px;
  }
  .section {
    margin: 22px 0 10px;
  }
  .subsection {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-dim);
    margin: 18px 0 8px;
  }
  .connect-tabs {
    margin-bottom: 14px;
  }
  .connect-tabs button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .tab-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success);
  }
  .lan-intro {
    margin-bottom: 4px;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .peer {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
  }
  .peer-info {
    flex: 1;
    min-width: 0;
  }
  .peer-name {
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .peer-protection {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.35rem;
    flex-wrap: wrap;
  }
  .linkish {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    font-size: 0.78rem;
    color: var(--accent-text);
    text-decoration: underline;
    cursor: pointer;
  }
  .linkish:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .peer-meta {
    font-size: 0.78rem;
    color: var(--text-faint);
    margin-top: 2px;
  }
  .quiet {
    color: var(--text-faint);
    font-size: 0.88rem;
  }
  .manual {
    display: flex;
    gap: 10px;
    padding: 14px;
  }
  .manual input {
    padding: 8px 12px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    color: var(--text);
    outline: none;
    flex: 1;
  }
  .manual .port {
    flex: 0 0 90px;
  }
</style>
