<script>
  // ── Games a peer syncs that this device has no folder for ─────────
  //
  // Only ever populated when "Ask me where to keep it" is chosen in Settings;
  // with the default an unknown game is tracked automatically and never
  // reaches this list. Shown at the top of the page on purpose: an offer
  // nobody notices is worse than a folder guessed slightly wrong, because a
  // wrong guess is at least visible and can be moved afterwards.
  import { gameList, toast } from '../../lib/stores.js';
  import { withUndo, hiddenKeys } from '../../lib/undo.js';
  import { api, native } from '../../lib/api.js';

  let offeredGames = [];
  async function load() {
    try {
      offeredGames = (await api.get('/api/offered-games')) ?? [];
    } catch {
      offeredGames = [];
    }
  }
  // Refresh with the game list: placing or declining broadcasts a games
  // update, and so does a peer offering something new. The first run of this
  // statement is the initial load.
  $: if ($gameList) load();

  async function place(offer) {
    const dir = await native.selectDirectory(`“${offer.name}”在此设备上的文件夹`);
    if (!dir) return;
    try {
      await api.post(`/api/offered-games/${offer.gameId}/place`, { path: dir });
      toast(`现在开始跟踪 ${offer.name}`, 'success');
      await load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function decline(offer) {
    withUndo({
      message: `不会再询问关于 ${offer.name} 的事。之后仍可自行跟踪它。`,
      keys: [`offer:${offer.gameId}`],
      stillThere: () => offeredGames.some((o) => o.gameId === offer.gameId),
      run: async () => {
        await api.post(`/api/offered-games/${offer.gameId}/decline`);
        await load();
      }
    });
  }
  $: shownOffers = offeredGames.filter((o) => !$hiddenKeys.has(`offer:${o.gameId}`));
</script>

{#if shownOffers.length > 0}
  <div class="card offers">
    <h3>等待指定文件夹</h3>
    <p class="intro">
      {shownOffers.length === 1 ? '另一台设备正在同步这个游戏' : '其他设备正在同步这些游戏'}，
      但这台设备还不知道把它们放在哪里。在你做出选择之前不会同步任何内容。
    </p>
    {#each shownOffers as offer (offer.gameId + offer.peerId)}
      <div class="row">
        <div class="info">
          <strong>{offer.name}</strong>
          <span class="hint">
            在另一台设备上位于 <code>{offer.peerPath}</code>。
          </span>
        </div>
        <div class="actions">
          <button class="btn primary" on:click={() => place(offer)}>选择文件夹…</button>
          <button class="btn" on:click={() => decline(offer)}>拒绝</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  /* Outlined in the accent because being noticed IS the feature: an offer
     nobody sees leaves a save silently not syncing, which is worse than a
     folder guessed wrong. */
  .offers {
    border-color: var(--accent);
  }
  .intro {
    color: var(--text-dim);
    font-size: 0.88rem;
    margin: 0 0 12px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid var(--border);
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .info code {
    word-break: break-all;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
</style>
