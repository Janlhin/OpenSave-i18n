<script>
  // Per-game settings, edited as a form and saved together with one button.
  import { askConfirm } from '../../lib/stores.js';
  import { api, native, coverURL } from '../../lib/api.js';
  import { savePathChange } from '../../lib/savepath.js';
  import AppIdField from './AppIdField.svelte';
  import SyncIgnoreEditor from './SyncIgnoreEditor.svelte';
  import SaveLocations from './SaveLocations.svelte';
  import MoreInfo from '../../components/ui/MoreInfo.svelte';
  import Gamepad2 from 'lucide-svelte/icons/gamepad-2';

  export let game;
  export let runner;
  const { busy, run } = runner;

  // Taken from the game once, when the tab opens: the game updates often
  // (every sync), and re-reading it would throw away what is being typed.
  let cfg = {
    appId: game.appId ?? '',
    savePath: game.savePath ?? '',
    exePath: game.exePath ?? '',
    // The art Steam has for the App ID is not a custom cover: shown here it
    // read as one, beside a hint saying to leave the field blank for it.
    coverUrl: game.coverUrl && !game.coverUrl.includes('steamstatic.com/steam/apps/') ? game.coverUrl : '',
    autoSync: game.autoSync ?? true,
    maxSnapshots: game.maxSnapshots ?? 5,
    maxManualSnapshots: game.maxManualSnapshots ?? 0,
    syncIgnore: game.syncIgnore ?? ''
  };
  let locations = [];

  // Cover preview: a custom URL wins, else the proxied Steam art for the App
  // ID being edited.
  $: cover =
    cfg.coverUrl && !cfg.coverUrl.includes('steamstatic.com') ? cfg.coverUrl : coverURL(cfg.appId, false, '');

  // A Steam App ID is digits. Saving something else stores a value that
  // matches nothing, launches nothing and fetches no art, with no complaint
  // at any point — which reads as the features being broken rather than the
  // field being wrong. Catch it at the edit instead.
  let appIdError = '';

  async function save() {
    const appId = (cfg.appId ?? '').trim();
    if (appId !== '' && !/^\d+$/.test(appId)) {
      appIdError = 'Steam App ID 只能是数字 — 即商店网址中的那串数字。';
      return;
    }
    appIdError = '';

    // Moving tracking to a different folder is the one edit on this form that
    // changes WHICH files are the save, rather than a detail about them. The
    // old folder is left untouched, but nothing there syncs or is snapshotted
    // any more, so it is worth one confirmation.
    const savePath = savePathChange(game.savePath, cfg.savePath);
    if (savePath) {
      const ok = await askConfirm(
        `以后在 ${savePath} 跟踪“${game.name}”？\n\n` +
          `旧文件夹中的文件会原样保留，但它们不再同步、也不再生成快照。` +
          `已有的快照会保留，仍可恢复。`,
        { title: '将跟踪移动到新文件夹？', confirmText: '移动跟踪' }
      );
      if (!ok) return;
    }

    await run('配置已保存', () =>
      api.patch(`/api/games/${game.id}`, {
        appId,
        // Omitted unless it actually changed: the PATCH decodes into the
        // stored game, so leaving it out keeps the current folder. Sending an
        // empty string instead would be a real edit, and validation would
        // reject it — blocking every other change on this form.
        ...(savePath ? { savePath } : {}),
        exePath: cfg.exePath,
        coverUrl: cfg.coverUrl,
        autoSync: cfg.autoSync,
        maxSnapshots: Number(cfg.maxSnapshots),
        maxManualSnapshots: Number(cfg.maxManualSnapshots),
        syncIgnore: cfg.syncIgnore ?? ''
      })
    );
  }

  async function browseSavePath() {
    const dir = await native.selectDirectory(`“${game.name}”的存档文件夹`);
    if (dir) cfg.savePath = dir;
  }

  async function browseExe() {
    const file = await native.selectFile('选择游戏可执行文件');
    if (file) cfg.exePath = file;
  }
</script>

<div class="card config">
  <div class="cover">
    {#if cover}
      <img src={cover} alt="" on:error={(e) => (e.currentTarget.style.display = 'none')} />
    {:else}
      <div class="cover-fallback"><Gamepad2 size={30} strokeWidth={1.5} /></div>
    {/if}
  </div>
  <div class="fields">
    <h3>启动与同步配置</h3>
    <div class="field">
      <label for="c-savepath">存档文件夹</label>
      <div class="path-row">
        <input id="c-savepath" placeholder="存放此游戏存档的文件夹" bind:value={cfg.savePath} />
        <button class="btn" on:click={browseSavePath}>浏览</button>
      </div>
      <span class="hint">
        OpenSave 视为此游戏存档的文件夹。
        <MoreInfo>
          文件按其在该文件夹<em>内部</em>的位置同步，因此每台设备可以指向不同路径，最终仍得到相同的文件 —
          当游戏把存档放在以你的 Steam 或 Epic ID 命名、且每台机器都不同的账号文件夹里时尤其有用。
          让每台设备指向各自的此类文件夹，存档就会落到该副本游戏查找它们的位置。
        </MoreInfo>
      </span>
      {#if savePathChange(game.savePath, cfg.savePath)}
        <span class="hint hint-warn">
          尚未保存。旧文件夹中的文件仍在，但不再同步、也不再生成快照。
        </span>
      {/if}
    </div>
    <AppIdField bind:value={cfg.appId} error={appIdError} />
    <div class="field">
      <label for="c-exe">可执行文件路径</label>
      <div class="path-row">
        <input id="c-exe" placeholder="浏览选择游戏的 .exe" bind:value={cfg.exePath} />
        <button class="btn" on:click={browseExe}>浏览</button>
      </div>
      <span class="hint">
        启动时运行此程序，Steam 游戏也不例外。留空则通过 Steam 启动。
      </span>
    </div>
    <div class="field">
      <label for="c-cover">自定义封面图 URL</label>
      <input id="c-cover" placeholder="https://…  （模拟器游戏很好用）" bind:value={cfg.coverUrl} />
      <span class="hint">留空则根据 App ID 自动使用 Steam 封面图。模拟器游戏可粘贴任意图片 URL。</span>
    </div>
    <label class="check">
      <input type="checkbox" bind:checked={cfg.autoSync} />
      检测到变化时自动同步存档
    </label>
    <div class="field" style="margin-top: 12px;">
      <label for="c-max">自动快照上限</label>
      <input id="c-max" type="number" min="0" bind:value={cfg.maxSnapshots} />
      <span class="hint">
        每个分支保留的<em>自动</em>快照数量上限（0 = 不限制）。最旧的先被清理。
      </span>
    </div>
    <div class="field">
      <label for="c-max-manual">手动快照上限</label>
      <input id="c-max-manual" type="number" min="0" bind:value={cfg.maxManualSnapshots} />
      <span class="hint">
        你手动拍摄的快照有独立的配额，因此频繁自动存档的游戏不会把它们挤掉。
        <strong>0 = 永久保留</strong>（默认值）。
      </span>
    </div>
    <SyncIgnoreEditor {game} bind:value={cfg.syncIgnore} severalFolders={locations.length > 0} />
    <SaveLocations {game} {runner} bind:locations />
    <div class="save">
      <button class="btn primary" disabled={$busy} on:click={save}>保存配置</button>
    </div>
  </div>
</div>

<style>
  .config {
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }
  .cover {
    flex-shrink: 0;
    width: 160px;
    aspect-ratio: 460 / 215;
    border-radius: var(--radius);
    overflow: hidden;
    border: 1px solid var(--border);
    background: var(--bg);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .cover-fallback {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-faint);
  }
  .fields {
    flex: 1;
    min-width: 0;
  }
  .fields h3 {
    margin-bottom: 14px;
  }
  .fields .field {
    margin-bottom: 14px;
  }
  .hint-warn {
    color: var(--warn);
  }
  .save {
    display: flex;
    justify-content: flex-end;
    margin-top: 8px;
  }
  @media (max-width: 720px) {
    .config {
      flex-direction: column;
    }
    .cover {
      width: 100%;
    }
  }
</style>
