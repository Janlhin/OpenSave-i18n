<script>
  // Linking this game with the same game tracked under another name, and
  // stopping tracking it.
  import { games, askConfirm } from '../../lib/stores.js';
  import { api } from '../../lib/api.js';
  import { untrackGame } from '../../lib/gameactions.js';
  import Link from 'lucide-svelte/icons/link';
  import LinkPicker from './LinkPicker.svelte';

  export let game;
  export let runner;
  const { busy, run } = runner;

  // Linked copies — cross-device "same game" links (the manual counterpart
  // to App-ID matching).
  let aliases = [];
  let linkTarget = '';
  $: otherGames = Object.values($games).filter((g) => g.id !== game.id);
  $: chosenName = $games[linkTarget]?.name ?? peerGames.find((g) => g.id === linkTarget)?.name ?? linkTarget;

  async function loadAliases() {
    try {
      aliases = await api.get(`/api/games/${game.id}/aliases`);
    } catch {
      aliases = [];
    }
  }
  loadAliases();

  // Games tracked on paired devices. Without these the picker can only offer
  // entries from this machine, which merges local duplicates but can never
  // connect a title tracked under one name here and another name there —
  // the case App-ID matching can't cover, because a save sitting in
  // AppData\<company>\<game> carries no App ID anywhere in its path.
  let peerGames = [];
  let peerGamesLoading = false;

  async function loadPeerGames() {
    peerGamesLoading = true;
    peerGames = [];
    try {
      const peers = await api.get('/api/peers');
      // Ask each device separately and keep whatever answers: one being
      // offline must not cost you the ability to link against the others.
      const results = await Promise.allSettled(
        (peers ?? []).map(async (p) => ({
          peer: p,
          games: await api.get(`/api/peers/${p.id}/games`)
        }))
      );
      const local = new Set(Object.keys($games));
      peerGames = results
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) =>
          (r.value.games ?? [])
            // An id we already track is the same entry, not a link target.
            .filter((g) => !local.has(g.id))
            .map((g) => ({ ...g, peerName: r.value.peer.name }))
        );
    } catch {
      peerGames = [];
    } finally {
      peerGamesLoading = false;
    }
  }
  loadPeerGames();

  async function linkGame() {
    if (!linkTarget) return;
    const other = $games[linkTarget];
    const remote = peerGames.find((g) => g.id === linkTarget);

    // Two different operations behind one button, and the difference matters
    // to the user: merging a local entry removes it from this library, while
    // linking another device's entry changes nothing here at all. Saying
    // "removed from your library" for the second would be a lie about a
    // destructive step that isn't happening.
    const message = remote
      ? `将 ${remote.peerName} 上的“${remote.name}”关联到“${game.name}”？这些设备同步时，两者会被视为同一游戏。任何一台设备都不会删除内容。`
      : `将“${other?.name ?? linkTarget}”关联到“${game.name}”？跨设备同步时，它们会被视为同一游戏。“${other?.name ?? linkTarget}”会从此处库中移除 — 其存档文件留在原处，快照则会移到“${game.name}”名下、归入以它命名的独立分支。`;

    const ok = await askConfirm(message, { title: '关联游戏？', confirmText: '关联' });
    if (!ok) return;
    const canonicalId = game.id;
    await run('游戏已关联', () => api.post(`/api/games/${canonicalId}/link`, { alias: linkTarget }));
    linkTarget = '';
    await loadAliases();
  }

  async function unlink(aliasId) {
    await run('已解除关联', () => api.del(`/api/games/${game.id}/alias/${aliasId}`));
    await loadAliases();
  }

  // Undone from the toast rather than confirmed first; see lib/undo.js.
  const untrack = () => untrackGame(game);
</script>

<div class="card">
  <h3>已关联的副本</h3>
  <p class="desc">
    如果这个游戏在另一台电脑上以不同名称或盘符被跟踪（例如 Steam 版与便携版），可以关联这些副本，
    让它们的存档跨设备同步。关联会把另一个被跟踪的游戏合并到此条目：其存档文件留在原处，
    快照则移到这里，归入以它命名的分支。
  </p>
  {#if aliases.length > 0}
    <div class="alias-list">
      {#each aliases as a}
        <div class="alias-row">
          <span class="alias-id" title={a.savePath || a.id}>
            <Link size={13} class="inline-icon" />{a.name || a.id}{a.savePath ? ` — ${a.savePath}` : ''}
          </span>
          <button class="btn small" disabled={$busy} on:click={() => unlink(a.id)}>解除关联</button>
        </div>
      {/each}
    </div>
  {/if}
  {#if otherGames.length > 0 || peerGames.length > 0}
    <!-- By cover, with where each copy lives underneath: same-named entries
         are normal now that one game can be tracked at several save
         locations, and a name alone could not tell them apart. -->
    <LinkPicker localGames={otherGames} {peerGames} bind:selected={linkTarget} />
    <div class="link-row">
      <button class="btn small primary" disabled={$busy || !linkTarget} on:click={linkGame}>
        <Link size={13} />{linkTarget ? `关联 ${chosenName}` : '在上方选择要关联的游戏'}
      </button>
    </div>
    {#if peerGamesLoading}
      <p class="desc">正在检查配对设备…</p>
    {/if}
  {:else if peerGamesLoading}
    <p class="desc">正在检查配对设备…</p>
  {:else}
    <p class="desc">
      没有可关联的对象。可以在这台设备上跟踪另一个副本，或者配对拥有它的设备并确保其在线 —
      设备应答后，它的游戏就会出现在这里。
    </p>
  {/if}
</div>

<div class="card" style="margin-top: 16px;">
  <h3>停止跟踪</h3>
  <p class="desc">
    将“{game.name}”从 OpenSave 中移除。磁盘上的存档文件和已有的快照归档都会保留。
  </p>
  <button class="btn danger" disabled={$busy} on:click={untrack}>停止跟踪此游戏</button>
</div>

<style>
  .desc {
    color: var(--text-dim);
    font-size: 0.88rem;
    margin: 8px 0 14px;
  }
  .alias-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }
  .alias-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 7px 10px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .alias-id {
    font-family: monospace;
    font-size: 0.82rem;
    color: var(--text-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .link-row {
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 14px;
  }

</style>
