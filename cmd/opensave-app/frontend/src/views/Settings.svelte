<script>
  import { slidingIndicator } from '../lib/motion.js';
  import { onMount, onDestroy } from 'svelte';
  import { settings, toast, askConfirm, gameList, navigate } from '../lib/stores.js';
  import { showSetupAgain } from '../lib/setup.js';
  import { api, native } from '../lib/api.js';
  import { adoptOutsideChanges, changedFields, createAutosave } from '../lib/autosave.js';
  import qrcode from 'qrcode-generator';
  import { DISCORD_URL, DONATE_URL } from '../lib/links.js';
  import LibraryViewOptions from './home/LibraryViewOptions.svelte';
  import Skeleton from '../components/ui/Skeleton.svelte';
  import MoreInfo from '../components/ui/MoreInfo.svelte';
  import AppearanceOptions from './settings/AppearanceOptions.svelte';
  import ControllerOptions from './settings/ControllerOptions.svelte';
  import NotificationOptions from './settings/NotificationOptions.svelte';
  import StorageUsage from './settings/StorageUsage.svelte';
  import SnapshotChecks from './settings/SnapshotChecks.svelte';
  import FileCheck from 'lucide-svelte/icons/file-check';
  import PieChart from 'lucide-svelte/icons/chart-pie';
  import Bell from 'lucide-svelte/icons/bell';
  import Palette from 'lucide-svelte/icons/palette';
  import Monitor from 'lucide-svelte/icons/monitor';
  import LayoutGrid from 'lucide-svelte/icons/layout-grid';
  import Rocket from 'lucide-svelte/icons/rocket';
  import Download from 'lucide-svelte/icons/download';
  import RefreshCw from 'lucide-svelte/icons/refresh-cw';
  import Globe from 'lucide-svelte/icons/globe';
  import RadioTower from 'lucide-svelte/icons/radio-tower';
  import Cloud from 'lucide-svelte/icons/cloud';
  import HardDrive from 'lucide-svelte/icons/hard-drive';
  import Timer from 'lucide-svelte/icons/timer';
  import History from 'lucide-svelte/icons/history';
  import BrushCleaning from 'lucide-svelte/icons/brush-cleaning';
  import ScanSearch from 'lucide-svelte/icons/scan-search';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import Network from 'lucide-svelte/icons/network';
  import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
  import Heart from 'lucide-svelte/icons/heart';
  import ArrowUpRight from 'lucide-svelte/icons/arrow-up-right';
  import X from 'lucide-svelte/icons/x';
  import Plus from 'lucide-svelte/icons/plus';
  import Wrench from 'lucide-svelte/icons/wrench';
  import Gamepad2 from 'lucide-svelte/icons/gamepad-2';
  import ArrowRight from 'lucide-svelte/icons/arrow-right';
  import Check from 'lucide-svelte/icons/check';
  import LoaderCircle from 'lucide-svelte/icons/loader-circle';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  // QR of the same URL, generated locally so paying from a phone (where
  // Apple/Google Pay is a single tap) needs no typing. Built once — the URL
  // is constant. Error-correction level M tolerates a bit of screen glare.
  const qrSvg = (() => {
    const qr = qrcode(0, 'M');
    qr.addData(DONATE_URL);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  })();

  let donateOpened = false;
  function openDonatePage() {
    native.openExternal(DONATE_URL);
    donateOpened = true;
  }

  /** From navigate('settings', {tab}). */
  export let params = {};
  const TABS = ['general', 'sync', 'storage', 'advanced', 'support'];
  let tab = TABS.includes(params?.tab) ? params.tab : 'general';
  let pruning = false;

  // The running build, so the updates toggle can explain what it means for
  // THIS install: someone already on a beta is offered betas regardless, and
  // saying so is the difference between the checkbox looking broken and
  // looking deliberate.
  let appVersion = '';
  $: onPreRelease = appVersion.includes('-');
  onMount(async () => {
    try {
      appVersion = (await native.appInfo())?.version ?? '';
    } catch {
      appVersion = '';
    }
  });

  // Every change saves itself (see lib/autosave.js): a toggle or a choice at
  // once, typed text when you leave the box or press Enter. `draft` is what
  // the page shows and edits; `saved` is what the daemon last confirmed.
  let draft = null;
  let saved = null;
  let saveState = null; // null | 'saving' | 'saved' | {error}
  // Values the daemon refused, and why, by field: left out of later saves
  // until changed (lib/autosave.js), and shown until then — a later save
  // succeeding does not mean this one did.
  let rejected = {};
  let refusedWhy = {};
  const FIELD_NAMES = {
    relayUrl: '中继 URL',
    relayPort: '中继托管端口',
    port: '守护进程端口',
    deviceName: '设备名称',
    backupsDir: '快照文件夹',
    syncBackupsDir: '安全备份文件夹',
    pathTranslations: '路径规则'
  };
  $: unsaved = draft ? Object.keys(rejected).filter((key) => same(draft[key], rejected[key])) : [];
  const firstSentence = (text) => String(text).split(/(?<=\.)\s/)[0];

  // The settings as this page edits them. The cloud settings are set on the
  // Cloud Backup page and left out: they are not this page's to send.
  function editable(s) {
    const { cloudSync, cloudAutoPull, ...rest } = structuredClone(s);
    // Older daemons predate the separate manual-snapshot budget; 0 is the
    // "keep forever" default, so an omitted value behaves as it should.
    rest.defaultMaxManualSnapshots ??= 0;
    // Older daemons predate the update channel; stable is the default.
    rest.updateChannel ??= 'stable';
    return rest;
  }

  // A path rule with a side still empty is not a rule yet: it stays on the
  // page but is not saved until both sides are filled in.
  const ready = (d) => ({
    ...d,
    pathTranslations: (d.pathTranslations ?? []).filter((r) => r.fromPattern?.trim() && r.toPattern?.trim())
  });

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const saver = createAutosave({
    collect: () => changedFields(saved, ready(draft), { rejected }),
    send: (patch) => api.post('/api/settings', patch),
    onSaved(result, patch) {
      const next = editable(result);
      // The daemon's version of what was sent — it may have tidied it — unless
      // the field has been changed again in the meantime.
      for (const key of Object.keys(patch)) {
        if (same(draft[key], patch[key])) draft[key] = structuredClone(next[key]);
        delete rejected[key];
        delete refusedWhy[key];
      }
      rejected = rejected;
      saved = next;
      settings.set(result);
    },
    onFailed(patch, error) {
      rejected = { ...rejected, ...patch };
      for (const key of Object.keys(patch)) refusedWhy[key] = error.message;
    },
    onState: (state) => (saveState = state)
  });
  const saveNow = () => saver.flush();
  onDestroy(saveNow);

  // Arrivals from elsewhere while the page is open — the tray, the terminal,
  // another screen — are taken in, except into a field being edited here.
  function takeSettings(s) {
    if (!s) return;
    if (!draft) {
      saved = editable(s);
      draft = structuredClone(saved);
      return;
    }
    ({ saved, draft } = adoptOutsideChanges(saved, draft, editable(s)));
  }
  $: takeSettings($settings);

  function showTab(next) {
    saveNow();
    tab = next;
  }

  async function cleanUpSnapshots() {
    pruning = true;
    try {
      // Save the limit first so the cleanup uses it, then prune everything.
      await saver.flush();
      if (saveState?.error) throw new Error(`无法保存这些限制：${saveState.error}`);
      const res = await api.post('/api/snapshots/prune', { applyDefaultToAll: true });
      const mb = (res.freedBytes / 1048576).toFixed(1);
      toast(
        res.removed > 0
          ? `已删除 ${res.removed} 个旧快照，释放 ${mb} MB`
          : '无需清理——所有游戏均在限额之内',
        'success'
      );
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      pruning = false;
    }
  }

  // Path translations editor
  function addRule() {
    draft.pathTranslations = [...(draft.pathTranslations ?? []), { fromPattern: '', toPattern: '' }];
  }
  function removeRule(i) {
    draft.pathTranslations = draft.pathTranslations.filter((_, idx) => idx !== i);
    saveNow();
  }

  // Custom scan paths
  async function addScanPath() {
    const dir = await native.selectDirectory('添加要扫描的文件夹');
    if (dir) draft.customScanPaths = [...(draft.customScanPaths ?? []), dir];
    saveNow();
  }
  function removeScanPath(i) {
    draft.customScanPaths = draft.customScanPaths.filter((_, idx) => idx !== i);
    saveNow();
  }

  // Excluded folders — locations the scan should skip entirely.
  async function addExcludePath() {
    const dir = await native.selectDirectory('选择要从扫描中排除的文件夹');
    if (dir) draft.excludePaths = [...(draft.excludePaths ?? []), dir];
    saveNow();
  }
  function removeExcludePath(i) {
    draft.excludePaths = draft.excludePaths.filter((_, idx) => idx !== i);
    saveNow();
  }

  // Reset tracking — untrack every game so the user can re-add them from the
  // right locations (e.g. after moving games between launchers or drives).
  // Non-destructive: this only clears the tracked list; snapshot backups on
  // disk are kept.
  let resetting = false;
  async function resetTracking() {
    const n = $gameList.length;
    if (n === 0) return;
    const ok = await askConfirm(
      `取消跟踪全部 ${n} 个游戏？它们将从你的游戏库中移除，以便之后从正确的位置重新添加。磁盘上的存档快照会保留——不会删除任何内容。`,
      { title: '重置跟踪？', confirmText: `取消跟踪 ${n}`, danger: true }
    );
    if (!ok) return;
    resetting = true;
    try {
      const res = await api.post('/api/games/untrack-bulk', { all: true });
      toast(`已取消跟踪 ${res.untracked} 个游戏——快照已保留`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      resetting = false;
    }
  }

  async function pickBackupsDir() {
    const dir = await native.selectDirectory('选择快照存储文件夹');
    if (dir) draft.backupsDir = dir;
    saveNow();
  }

  async function pickSyncBackupsDir() {
    const dir = await native.selectDirectory('选择同步前安全备份文件夹');
    if (dir) draft.syncBackupsDir = dir;
    saveNow();
  }

  // Relay hosting: LAN IPs / public IP to share with friends. Shown only on
  // request — these identify the machine, so they shouldn't appear on screen
  // just because the checkbox was ticked.
  let relayInfo = null;
  let relayInfoShown = false;
  let relayInfoLoading = false;

  async function toggleRelayInfo() {
    if (relayInfoShown) {
      relayInfoShown = false;
      return;
    }
    relayInfoLoading = true;
    try {
      // Re-fetch each time: the public IP changes, and a stale one sent to a
      // friend is worse than none.
      relayInfo = await api.get('/api/relay/ips');
      relayInfoShown = true;
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      relayInfoLoading = false;
    }
  }

  // Turning hosting off should also hide addresses left on screen.
  $: if (draft && !draft.hostRelay && relayInfoShown) relayInfoShown = false;
</script>

<div class="head">
  <h2 class="page-title">设置</h2>
  {#if draft}
    <span class="save-state" class:error={saveState?.error || unsaved.length} aria-live="polite">
      {#if saveState === 'saving'}
        <LoaderCircle size={14} class="spin" />保存中…
      {:else if unsaved.length}
        <TriangleAlert size={14} />
        <span class="why" title={refusedWhy[unsaved[0]]}>
          未保存：{FIELD_NAMES[unsaved[0]] ?? unsaved[0]}——{firstSentence(refusedWhy[unsaved[0]])}
        </span>
      {:else if saveState?.error}
        <TriangleAlert size={14} /><span class="why" title={saveState.error}>无法保存：{firstSentence(saveState.error)}</span>
      {:else if saveState === 'saved'}
        <Check size={14} />已保存
      {:else}
        更改会即时保存
      {/if}
    </span>
  {/if}
</div>

{#if !draft}
  <Skeleton kind="cards" count={3} />
{:else}
  <div class="pill-tabs" style="margin-bottom: 18px;" use:slidingIndicator={{ inset: 10 }}>
    <button class:active={tab === 'general'} on:click={() => showTab('general')}>常规</button>
    <button class:active={tab === 'sync'} on:click={() => showTab('sync')}>同步</button>
    <button class:active={tab === 'storage'} on:click={() => showTab('storage')}>存储</button>
    <button class:active={tab === 'advanced'} on:click={() => showTab('advanced')}>高级</button>
    <button class="support-tab" class:active={tab === 'support'} on:click={() => showTab('support')}><Heart size={14} />支持</button>
    <!-- Not a tab: it leaves the app. Shaped like its neighbour so the pair
         reads as one group, marked with an outward arrow so nobody expects a panel. -->
    <button class="discord-tab" on:click={() => native.openExternal(DISCORD_URL)} title="在浏览器中打开 OpenSave Discord">
      <span class="discord-glyph" aria-hidden="true">
        <svg viewBox="0 0 24 18" width="17" height="13" fill="currentColor">
          <path d="M20.32 1.53A19.8 19.8 0 0 0 15.43 0c-.21.38-.46.9-.63 1.31a18.3 18.3 0 0 0-5.6 0C9.03.9 8.77.38 8.56 0A19.74 19.74 0 0 0 3.67 1.53C.57 6.19-.27 10.73.15 15.21A19.9 19.9 0 0 0 6.18 18c.49-.66.92-1.37 1.29-2.11-.71-.27-1.39-.6-2.03-.98.17-.13.34-.26.5-.4a14.2 14.2 0 0 0 12.12 0c.16.14.33.27.5.4-.64.38-1.32.71-2.03.98.37.74.8 1.45 1.29 2.11a19.87 19.87 0 0 0 6.03-2.79c.5-5.19-.84-9.69-3.53-13.68ZM8.02 12.46c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4c1.2 0 2.17 1.09 2.15 2.4 0 1.32-.95 2.4-2.15 2.4Zm7.96 0c-1.18 0-2.15-1.08-2.15-2.4s.95-2.4 2.15-2.4c1.2 0 2.17 1.09 2.15 2.4 0 1.32-.95 2.4-2.15 2.4Z" />
        </svg>
      </span>
      Discord
      <span class="ext" aria-hidden="true"><ArrowUpRight size={13} /></span>
    </button>
  </div>

  <!-- A toggle or a choice commits at once; typed text when the box is left
       or Enter is pressed. See lib/autosave.js. -->
  <div
    class="tab-body"
    on:change={saveNow}
    on:keydown={(e) => e.key === 'Enter' && e.target.matches('input') && saveNow()}
    role="presentation"
  >
  {#if tab === 'general'}
    <div class="card">
      <h3 class="section-title with-icon"><Monitor size={17} />设备身份</h3>
      <div class="field">
        <label for="s-name">设备名称——其他设备看到的名字</label>
        <input id="s-name" class:invalid={unsaved.includes('deviceName')} bind:value={draft.deviceName} />
      </div>
      <div class="field">
        <label for="s-type">设备类型</label>
        <select id="s-type" bind:value={draft.deviceType}>
          <option value="desktop">台式机（Windows / macOS / Linux 电脑）</option>
          <option value="deck">Steam Deck（SteamOS 掌机）</option>
          <option value="handheld">掌机（ROG Ally / Legion Go / 模拟器）</option>
          <option value="mobile">伴侣设备（移动设备）</option>
        </select>
        <span class="hint">在其他设备发现你时显示。</span>
      </div>
      <div class="field">
        <label for="s-node">设备 ID</label>
        <input id="s-node" value={draft.nodeId ?? ''} readonly class="mono" />
        <span class="hint">本设备的唯一网络标识符（只读）。</span>
      </div>
    </div>

    <!-- Kept on this device rather than in the daemon's settings, like the
         library view below. -->
    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Palette size={17} />外观</h3>
      <AppearanceOptions />
    </div>

    <!-- Using OpenSave from a gamepad: a Steam Deck, a handheld, a pad on a
         PC. Also on this device only. -->
    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Gamepad2 size={17} />手柄</h3>
      <ControllerOptions />
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Bell size={17} />通知</h3>
      <NotificationOptions />
    </div>

    <!-- The same thing the View menu on the library changes, kept on this
         device: see lib/libraryview.js for why. -->
    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><LayoutGrid size={17} />游戏库</h3>
      <p class="hint library-hint">游戏在主页上的排列方式。更改立即生效。</p>
      <LibraryViewOptions />
      <div class="guide-row">
        <div>
          <strong>设置向导</strong>
          <p class="hint">主页上的入门清单：找到你的存档、添加其他设备、备份到云端。</p>
        </div>
        <button class="btn small" on:click={() => { showSetupAgain(); navigate('home'); }}>再次显示</button>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Rocket size={17} />启动</h3>
      <label class="check">
        <input type="checkbox" bind:checked={draft.startOnBoot} />
        开机时启动 OpenSave
      </label>
      <p class="hint" style="margin-top: 6px;">
        启动时最小化到系统托盘，让同步在后台运行。
      </p>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Download size={17} />更新</h3>
      <label class="check">
        <input
          type="checkbox"
          checked={draft.updateChannel === 'beta'}
          on:change={(e) => (draft.updateChannel = e.currentTarget.checked ? 'beta' : 'stable')}
        />
        向我提供测试版
      </label>
      <p class="hint" style="margin-top: 6px;">
        {#if onPreRelease}
          你正在运行 <strong>{appVersion}</strong>，这是一个测试版，因此无论是否勾选，都会向你提供更新的
          测试版——否则在正式版跟上之前你将无法升级。取消勾选后，一旦正式版比你当前的版本更新，你就会
          切换到正式版。
        {:else}
          测试版更早发布、包含最新修复，但测试较少。只要正式版更新就会向你提供，因此这不是单向选择。
        {/if}
      </p>
    </div>

  {:else if tab === 'sync'}
    <div class="card">
      <h3 class="section-title with-icon"><RefreshCw size={17} />同步行为</h3>
      <label class="check">
        <input type="checkbox" bind:checked={draft.autoSyncOnTrack} />
        首次跟踪游戏时立即同步
      </label>
      <label class="check" style="margin-top: 18px;">
        <input type="checkbox" bind:checked={draft.detectNewGames} />
        当发现 OpenSave 未管理的游戏存档时提醒我
      </label>
      <span class="hint" style="margin-top: 6px;">
        OpenSave 每小时在后台检查一次，只提示未曾见过的游戏。在你选择之前不会跟踪任何内容。
      </span>
      <label class="check" style="margin-top: 18px;">
        <input type="checkbox" bind:checked={draft.matchByAppId} />
        按 Steam App ID 匹配各电脑间的存档
      </label>
      <span class="hint" style="margin-top: 6px;">
        即使同一游戏在不同设备上以不同名称或盘符被跟踪，也能将其关联。
        <MoreInfo>
          例如一台电脑上的 Steam 版和另一台上的独立版。如果你有意保留同一游戏的两个不应合并的副本，
          请关闭此选项。你随时可以在游戏页面手动关联。
        </MoreInfo>
      </span>
        <div class="field" style="margin-top: 18px;">
          <label for="s-unknown-game">当其他设备同步了本机没有的游戏</label>
          <select id="s-unknown-game" bind:value={draft.unknownGameFromPeer}>
            <option value="track">自动开始跟踪（推荐）</option>
            <option value="ask">询问我存放位置</option>
          </select>
          <span class="hint">
            自动跟踪会根据游戏在其他设备上的位置推算出文件夹，这也是 OpenSave 通常无需配置的原因。
            <MoreInfo>
              如果自动推算的位置不对——比如第二块硬盘、移动过的文件夹，或存档保存在以你账号命名的
              文件夹中的游戏——请选择<em>询问我</em>。等待指定位置的游戏会显示在主页上。
            </MoreInfo>
          </span>
        </div>
      <div class="field" style="margin-top: 14px;">
        <label for="s-limit">网络带宽限制</label>
        <select id="s-limit" bind:value={draft.speedLimit}>
          <option value={0}>不限速（最快）</option>
          <option value={100}>100 KB/s（很低）</option>
          <option value={500}>500 KB/s（中等）</option>
          <option value={1024}>1 MB/s（较高）</option>
          <option value={5120}>5 MB/s（很高）</option>
          <option value={10240}>10 MB/s（极高）</option>
        </select>
        <span class="hint">仅对中继（互联网）同步生效——局域网永不限速。</span>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Globe size={17} />互联网中继</h3>
      <div class="field">
        <label for="s-relay-url">WebSocket 中继 URL</label>
        <input id="s-relay-url" class:invalid={unsaved.includes('relayUrl')} bind:value={draft.relayUrl} placeholder="wss://relay.opensave.org" />
        <span class="hint">承载跨互联网同步的中继。请在<strong>互联网同步</strong>页面加入房间。</span>
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={draft.hostRelay} />
        在本设备上托管广域网中继服务器
      </label>
      <p class="hint" style="margin-top: 6px;">
        让朋友直接连接你，而不使用公共中继。
      </p>
      {#if draft.hostRelay}
        <div class="field" style="margin-top: 12px;">
          <label for="s-relay-port">中继托管端口</label>
          <input id="s-relay-port" type="number" class:invalid={unsaved.includes('relayPort')} bind:value={draft.relayPort} />
          <span class="hint">在路由器上转发此 TCP 端口，以便互联网上的朋友能连到你。</span>
        </div>
        <button class="btn small" on:click={toggleRelayInfo} disabled={relayInfoLoading}>
          {#if relayInfoLoading}
            查询中…
          {:else if relayInfoShown}
            隐藏我的地址
          {:else}
            显示可分享的地址
          {/if}
        </button>
        {#if relayInfoShown && relayInfo}
          <div class="share-banner">
            <div class="share-title with-icon"><RadioTower size={15} />将这些信息分享给你的朋友</div>
            <div class="share-row"><span>局域网 IP：</span> {relayInfo.lanIps?.join(', ') || '—'}</div>
            <div class="share-row"><span>公网 IP：</span> {relayInfo.publicIp || '不可用'}</div>
            <div class="share-row"><span>中继端口：</span> {relayInfo.relayPort}</div>
          </div>
        {/if}
      {/if}
    </div>

    <div class="card moved" style="margin-top: 14px;">
      <div>
        <h3 class="section-title with-icon"><Cloud size={17} />云备份</h3>
        <p class="hint">
          备份的去向、是否上传每个快照、是否从其他设备拉取较新存档，均在云备份页面设置。
        </p>
      </div>
      <button class="btn" on:click={() => navigate('cloud')}>打开云备份</button>
    </div>
  {:else if tab === 'storage'}
    <div class="card">
      <h3 class="section-title with-icon"><PieChart size={17} />已用空间</h3>
      <StorageUsage />
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><FileCheck size={17} />能否恢复？</h3>
      <SnapshotChecks />
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><HardDrive size={17} />快照存储</h3>
      <div class="field">
        <label for="s-backups">快照文件夹</label>
        <div class="path-row">
          <input id="s-backups" bind:value={draft.backupsDir} />
          <button class="btn" on:click={pickBackupsDir}>浏览</button>
        </div>
        <span class="hint">版本历史快照（ZIP 压缩包）的存储位置。</span>
      </div>
      <div class="field">
        <label for="s-sync-backups">同步前安全备份文件夹</label>
        <div class="path-row">
          <input id="s-sync-backups" bind:value={draft.syncBackupsDir} placeholder="默认：~/.opensave/backups" />
          <button class="btn" on:click={pickSyncBackupsDir}>浏览</button>
        </div>
        <span class="hint">每次接收同步前都会在此保存一份存档的安全副本，因此任何糟糕的同步都可撤销。</span>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><Timer size={17} />保留策略</h3>
      <label class="check">
        <input type="checkbox" bind:checked={draft.autoDeleteBackups} />
        自动删除旧的自动快照
      </label>
      <span class="hint">
        OpenSave 自动创建的快照——在同步替换文件之前、游戏保存时、发生冲突时。你手动创建的快照会保留，
        每条分支上最新的一个也会保留，无论其时间早晚。在启动后不久以及每隔几小时运行。
      </span>
      {#if draft.autoDeleteBackups}
        <div class="field" style="margin-top: 10px;">
          <label for="s-days">删除早于此时间的快照</label>
          <select id="s-days" bind:value={draft.autoDeleteDays}>
            <option value={7}>7 天</option>
            <option value={14}>14 天</option>
            <option value={30}>30 天</option>
            <option value={60}>60 天</option>
            <option value={90}>90 天</option>
            <option value={180}>180 天</option>
          </select>
        </div>
      {/if}
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><History size={17} />快照历史</h3>
      <div class="field">
        <label for="s-max-snaps">每个游戏保留的自动快照数</label>
        <input id="s-max-snaps" type="number" min="0" style="max-width: 120px;" bind:value={draft.defaultMaxSnapshots} />
        <span class="hint">
          新跟踪游戏的默认上限（0 = 全部保留）。按分支从最旧的开始清理。单个游戏的上限可在其配置页修改。
        </span>
      </div>
      <div class="field">
        <label for="s-max-manual-snaps">每个游戏保留的手动快照数</label>
        <input id="s-max-manual-snaps" type="number" min="0" style="max-width: 120px;" bind:value={draft.defaultMaxManualSnapshots} />
        <span class="hint">
          手动创建的快照有独立限额，因此频繁自动存档的游戏（如 Elden Ring、Dragonsword）不会把它们挤掉。
          <strong>0 = 永久保留</strong>，这也是默认值。
        </span>
      </div>
      <div class="field" style="margin-bottom: 0;">
        <div>
          <button class="btn small" disabled={pruning} on:click={cleanUpSnapshots}>
            <BrushCleaning size={14} />{pruning ? '应用中…' : '将这些限额应用到所有游戏'}
          </button>
        </div>
        <span class="hint">
          用这些限额替换每个游戏各自的上限，然后删除每条分支中超出的快照。要按各游戏自己的限额清理，
          请使用上方的已用空间。
        </span>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><ScanSearch size={17} />游戏扫描器</h3>
      <div class="field" style="margin-bottom: 0;">
        <label for="s-scan-paths">额外扫描的文件夹</label>
        <span class="hint">扫描已覆盖 Steam 和常见模拟器——可在此添加自定义游戏库。</span>
        {#each draft.customScanPaths ?? [] as p, i}
          <div class="rule-row">
            <span class="rule-path" title={p}>{p}</span>
            <button class="btn small ghost icon" title="移除" aria-label="移除" on:click={() => removeScanPath(i)}><X size={15} /></button>
          </div>
        {/each}
        <button id="s-scan-paths" class="btn small" on:click={addScanPath}><Plus size={14} />添加文件夹</button>
      </div>

      <div class="field" style="margin: 18px 0 0;">
        <label for="s-exclude-paths">排除的文件夹</label>
        <span class="hint">扫描会跳过这些文件夹及其中的所有内容——适合不再想被提示的过时存档位置（比如旧的 GSE 存档目录）。</span>
        {#each draft.excludePaths ?? [] as p, i}
          <div class="rule-row">
            <span class="rule-path" title={p}>{p}</span>
            <button class="btn small ghost icon" title="移除" aria-label="移除" on:click={() => removeExcludePath(i)}><X size={15} /></button>
          </div>
        {/each}
        <button id="s-exclude-paths" class="btn small" on:click={addExcludePath}><Plus size={14} />排除文件夹</button>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><RotateCcw size={17} />重置跟踪</h3>
      <div class="field" style="margin-bottom: 0;">
        <span class="hint">一次性取消跟踪所有游戏，然后重新扫描以从正确位置重新添加——在启动器或硬盘之间移动过游戏时很有用。这只清除跟踪列表；磁盘上的存档快照会保留。</span>
        <button
          class="btn small danger"
          style="margin-top: 12px; width: fit-content; align-self: flex-start;"
          on:click={resetTracking}
          disabled={resetting || $gameList.length === 0}
        >
          {#if resetting}正在取消跟踪…{:else if $gameList.length === 0}暂无已跟踪游戏{:else}取消跟踪全部 {$gameList.length} 个游戏{/if}
        </button>
      </div>
    </div>
  {:else if tab === 'advanced'}
    <div class="card">
      <h3 class="section-title with-icon"><Network size={17} />网络</h3>
      <div class="field" style="margin-bottom: 0;">
        <label for="s-port">守护进程端口</label>
        <input id="s-port" type="number" class:invalid={unsaved.includes('port')} bind:value={draft.port} />
        <span class="hint">本设备监听的端口，供本应用和网络上的其他设备使用。更改后需要重启。</span>
      </div>
    </div>

    <div class="card" style="margin-top: 14px;">
      <h3 class="section-title with-icon"><ArrowLeftRight size={17} />跨平台路径转换</h3>
      <div class="field" style="margin-bottom: 0;">
        <span class="hint">
          将其他设备的存档路径改写为本机的路径约定，例如 "C:\Users\me\Saves" → "/home/deck/saves"。
        </span>
        {#each draft.pathTranslations ?? [] as rule, i}
          <div class="rule-row">
            <input placeholder="源路径模式" bind:value={rule.fromPattern} />
            <span class="arrow"><ArrowRight size={15} /></span>
            <input placeholder="目标路径模式" bind:value={rule.toPattern} />
            <button class="btn small ghost icon" title="移除" aria-label="移除" on:click={() => removeRule(i)}><X size={15} /></button>
          </div>
        {/each}
        <button id="s-rules" class="btn small" on:click={addRule}><Plus size={14} />添加规则</button>
      </div>
    </div>
  {:else if tab === 'support'}
    <div class="card support-card">
      <div class="support-hero">
        <div class="support-badge"><Heart size={22} /></div>
        <div class="support-hero-text">
          <h3 class="support-title">支持 OpenSave</h3>
          <p class="support-lede">
            自由开源，且将一直如此——无需账号、没有广告、没有遥测，也没有任何内容需要付费解锁。
          </p>
        </div>
      </div>

      <div class="support-split">
        <div class="support-left">
          <p class="support-body">
            它由业余时间开发和维护。如果它帮你省去了在电脑之间复制存档文件夹的麻烦，欢迎贡献一份力量。
          </p>
          <ul class="support-points">
            <li><span class="pt-icon"><Globe size={15} /></span> 维持公共中继在线</li>
            <li><span class="pt-icon"><Gamepad2 size={15} /></span> 支持识别更多游戏和模拟器</li>
            <li><span class="pt-icon"><Wrench size={15} /></span> 投入更多时间修复问题和开发新功能</li>
          </ul>

          <div class="support-actions">
            <button class="btn primary support-cta" on:click={openDonatePage}>
              {donateOpened ? '再次打开' : '打开捐赠页面'}<ArrowUpRight size={15} />
            </button>
            {#if donateOpened}
              <span class="support-opened">已在浏览器中打开——谢谢。</span>
            {/if}
          </div>
          <p class="support-foot">
            不想捐赠？报告问题或提出建议同样是有力的帮助。
          </p>
        </div>

        <div class="support-qr">
          <!-- Rendered locally from DONATE_URL; no network request, no external
               image service. Kept on a light plate because phone cameras
               struggle with inverted (light-on-dark) QR codes. -->
          <div class="qr-plate">{@html qrSvg}</div>
          <span class="qr-caption">用手机<br />扫码支付</span>
        </div>
      </div>

      <p class="support-note">
        支付完全由 Gumroad 处理——OpenSave 不会看到你的银行卡信息。
      </p>
    </div>
  {/if}

  </div>
{/if}

<style>
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }
  .save-state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-faint);
    min-width: 0;
  }
  .save-state.error {
    color: var(--danger-text);
  }
  .why {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: min(560px, 60vw);
  }
  input.invalid {
    border-color: var(--danger);
  }
  .save-state :global(.spin) {
    animation: settings-spin 1s linear infinite;
  }
  @keyframes settings-spin {
    to {
      transform: rotate(360deg);
    }
  }
  /* .check and the checkbox itself are styled globally in app.css. */
  .path-row {
    display: flex;
    gap: 8px;
  }
  .path-row input {
    flex: 1;
  }
  .rule-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .rule-row input {
    flex: 1;
    padding: 7px 10px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    font-size: 0.85rem;
    outline: none;
  }
  .rule-path {
    flex: 1;
    font-size: 0.83rem;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .arrow {
    color: var(--text-faint);
  }
  /* Support tab: set apart from the settings tabs (it configures nothing) but
     never shouty — no accent fill, just a softer separated pill. */
  .support-tab {
    margin-left: auto;
  }
  /* Discord's own blurple, so it is recognisable at a glance, but kept at
     the same weight as the tabs beside it rather than shouting over them. */
  .pill-tabs .discord-tab {
    color: #9ba1f7;
  }
  .pill-tabs .discord-tab:hover {
    color: #fff;
    background: rgba(88, 101, 242, 0.35);
  }
  :global(:root[data-theme='light']) .pill-tabs .discord-tab {
    color: #4752c4;
  }
  :global(:root[data-theme='light']) .pill-tabs .discord-tab:hover {
    color: #fff;
    background: #5865f2;
  }
  .discord-glyph {
    display: inline-flex;
  }
  .ext {
    display: inline-flex;
    opacity: 0.7;
  }
  /* This is the one tab that isn't a settings form, so it carries a little
     accent identity instead of reading as another block of options. */
  .support-hero {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 22px;
    padding: 18px 20px;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(120% 160% at 0% 0%, var(--accent-soft), transparent 62%),
      var(--bg);
    border: 1px solid var(--border);
  }
  .support-badge {
    flex: none;
    width: 46px;
    height: 46px;
    display: grid;
    place-items: center;
    color: var(--accent-text);
    border-radius: 50%;
    background: var(--accent-soft);
    border: 1px solid rgba(var(--accent-rgb), 0.35);
  }
  .support-hero-text {
    min-width: 0;
  }
  .support-title {
    font-size: 1.05rem;
    font-weight: 600;
    margin: 0 0 5px;
  }
  .support-lede {
    font-size: 0.88rem;
    color: var(--text-dim);
    margin: 0;
    line-height: 1.5;
    max-width: 68ch;
  }
  .support-body {
    font-size: 0.88rem;
    color: var(--text-dim);
    margin: 0 0 16px;
    line-height: 1.5;
    max-width: 56ch;
  }
  .support-points {
    list-style: none;
    margin: 0 0 22px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .support-points li {
    display: flex;
    align-items: center;
    gap: 11px;
    font-size: 0.86rem;
    color: var(--text);
  }
  .pt-icon {
    flex: none;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    color: var(--text-dim);
    border-radius: 8px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
  }
  .support-actions {
    display: flex;
    gap: 12px;
    align-items: center;
    flex-wrap: wrap;
  }
  .support-cta {
    padding: 9px 18px;
  }
  .support-foot {
    font-size: 0.8rem;
    color: var(--text-faint);
    margin: 16px 0 0;
  }
  .support-split {
    display: flex;
    gap: 32px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .support-left {
    flex: 1;
    min-width: 260px;
  }
  .support-opened {
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  /* Framed panel so the code reads as a deliberate element rather than an
     image floating in empty space. */
  .support-qr {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px;
    border-radius: var(--radius-lg);
    background: var(--bg);
    border: 1px solid var(--border);
  }
  /* Light plate: phone cameras are unreliable at reading inverted QR codes,
     so the code stays dark-on-light even in the dark theme. */
  .qr-plate {
    background: #fff;
    padding: 10px;
    border-radius: 10px;
    line-height: 0;
  }
  .qr-plate :global(svg) {
    display: block;
    width: 124px;
    height: 124px;
    shape-rendering: crispEdges;
  }
  .qr-caption {
    font-size: 0.76rem;
    color: var(--text-faint);
    text-align: center;
    line-height: 1.4;
  }
  .support-note {
    font-size: 0.78rem;
    color: var(--text-faint);
    margin: 18px 0 0;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  /* A pointer to where the cloud settings moved, rather than a gap where
     they were. */
  .moved {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .moved .hint {
    font-size: 0.82rem;
    color: var(--text-faint);
    line-height: 1.5;
  }
  .guide-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid var(--border);
  }
  .guide-row strong {
    font-size: 0.88rem;
  }
  .guide-row .hint {
    margin: 2px 0 0;
  }
  .library-hint {
    font-size: 0.82rem;
    color: var(--text-faint);
    margin: -4px 0 14px;
  }
  .section-title {
    font-size: 0.95rem;
    font-weight: 600;
    margin-bottom: 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
    color: var(--text);
  }
  .mono {
    font-family: ui-monospace, 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.82rem;
    color: var(--text-dim);
  }
  input[readonly] {
    opacity: 0.75;
    cursor: default;
  }
  .share-banner {
    margin-top: 12px;
    background: rgba(var(--accent-rgb), 0.06);
    border: 1px solid rgba(var(--accent-rgb), 0.28);
    border-radius: var(--radius);
    padding: 12px 14px;
    font-size: 0.82rem;
  }
  .share-title {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .share-row {
    color: var(--text-dim);
    margin-top: 3px;
  }
  .share-row span {
    color: var(--text-faint);
    display: inline-block;
    width: 78px;
  }
</style>
