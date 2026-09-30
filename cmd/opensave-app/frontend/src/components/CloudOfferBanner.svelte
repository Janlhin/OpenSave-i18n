<script>
  // A newer save for one of your games is in your cloud backup, put there by
  // another of your devices, and this one has not taken it.
  //
  // Peer-to-peer sync tells you this by doing it: a device that comes online
  // hands over what changed. The cloud mirror was one-way — every device
  // uploaded, none looked — so a save made on a machine that is now switched
  // off could only be found by opening the cloud screen and knowing to look.
  // The daemon now checks, takes what it safely can on its own, and asks
  // about the rest here.
  import { fly as flyIn } from 'svelte/transition';
  import { gated } from '../lib/motion.js';
  // Instant with animations off; see lib/motion.js.
  const fly = gated(flyIn);
  import { cloudOffers, toast } from '../lib/stores.js';
  import { api } from '../lib/api.js';
  import { timeAgo } from '../lib/timeago.js';
  import CloudDownload from 'lucide-svelte/icons/cloud-download';

  let busy = '';

  const where = {
    google_drive: 'Google Drive',
    onedrive: 'OneDrive',
    dropbox: 'Dropbox',
    webdav: '你的 WebDAV 服务器',
    local: '你的备份文件夹'
  };

  const key = (o) => `${o.gameId}:${o.snapshotId}`;

  async function bring(offer) {
    if (busy) return;
    busy = key(offer);
    try {
      await api.post('/api/cloud/offers/accept', { gameId: offer.gameId, snapshotId: offer.snapshotId });
      toast(`“${offer.gameName}”现在使用 ${offer.deviceName} 的存档——本机的存档已保存为快照`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = '';
    }
  }

  async function later(offer) {
    if (busy) return;
    busy = key(offer);
    try {
      await api.post('/api/cloud/offers/dismiss', { gameId: offer.gameId, snapshotId: offer.snapshotId });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      busy = '';
    }
  }
</script>

{#if $cloudOffers.length > 0}
  <div class="offer-wrap" transition:fly={{ y: -90, duration: 320 }}>
    {#each $cloudOffers as offer (key(offer))}
      <div class="offer-card" class:diverged={offer.diverged} transition:fly={{ y: -20, duration: 200 }}>
        <div class="offer-icon"><CloudDownload size={19} /></div>
        <div class="offer-body">
          <div class="offer-title">
            <strong>{offer.deviceName}</strong> 有 <strong>{offer.gameName}</strong> 的更新存档
          </div>
          <div class="offer-sub">
            保存于 {timeAgo(offer.savedAt)} · 位于 {where[offer.provider] ?? '你的云端备份'}
          </div>
          {#if offer.diverged}
            <!-- Not "since the two last matched": two devices meeting through
                 the cloud for the first time never matched at all, and that
                 is the commonest way to see this card. -->
            <div class="offer-warn">
              本机的存档有 {offer.deviceName} 那边没有的更改。
              带来对方的存档会覆盖这些更改——本机存档会保存为快照，可供以后恢复。
            </div>
          {/if}
        </div>
        <div class="offer-actions">
          <button class="btn small" disabled={!!busy} on:click={() => later(offer)}>暂不</button>
          <button class="btn small primary" disabled={!!busy} on:click={() => bring(offer)}>
            {busy === key(offer) ? '正在获取…' : '带到本机'}
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Placed by App.svelte's notice stack. */
  .offer-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .offer-card {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 16px;
    background: var(--bg-raised);
    border: 1px solid var(--accent);
    border-radius: var(--radius-lg);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px var(--accent-soft);
  }
  .offer-card.diverged {
    border-color: var(--warn);
  }
  .offer-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: grid;
    place-items: center;
    background: var(--accent-soft);
    color: var(--accent-text);
  }
  .offer-body {
    flex: 1;
    min-width: 0;
  }
  .offer-title {
    font-size: 0.92rem;
  }
  .offer-sub {
    font-size: 0.78rem;
    color: var(--text-faint);
    margin-top: 2px;
  }
  .offer-warn {
    font-size: 0.78rem;
    color: var(--text-dim, var(--text-faint));
    margin-top: 6px;
  }
  .offer-actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }
</style>
