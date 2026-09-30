<script>
  // Which events interrupt you on this device. See lib/notifyprefs.js.
  import { notifyPrefs, NOTIFY_EVENTS } from '../../lib/notifyprefs.js';
  import { exampleEvents, exampleEvent } from '../../lib/notifications.js';
  import { playChime } from '../../lib/notify.js';
  import { toast, gameList } from '../../lib/stores.js';
  import { native, gameCover } from '../../lib/api.js';
  import BellRing from 'lucide-svelte/icons/bell-ring';

  // How each kind shows, played through once: a message in the corner with a
  // new entry behind the bell, then — a moment later — the chime that comes
  // with something that needs you (which also brings OpenSave to the front
  // when it is behind other windows), and last the notification the desktop
  // shows when OpenSave is not in front — sent here even though it is, so it
  // can be seen. It uses a game from the library, for its cover.
  let showing = false;
  function showMe() {
    showing = true;
    toast('Hades：从 Steam Deck 收到 3 个文件——示例', 'info', { action: { label: '打开', run: () => {} } });
    exampleEvents.update((list) => [exampleEvent(), ...list]);
    setTimeout(() => {
      playChime();
      toast('这声提示音意味着有需要你处理的事情——冲突、存档被清空、有设备请求配对。此时 OpenSave 也会自动来到前台。', 'warning', { ttl: 9000 });
    }, 2200);
    setTimeout(async () => {
      showing = false;
      if (!$notifyPrefs.desktop) return;
      const game = $gameList[0];
      const why = await native.desktopNotify({
        title: game?.name ?? 'Hades',
        body: '从 Steam Deck 收到 3 个文件——示例',
        image: game ? gameCover(game) : '',
        open: JSON.stringify(game ? { view: 'game', params: { gameId: game.id } } : { view: 'settings', params: {} })
      });
      toast(why ? `无法显示桌面通知：${why}` : '这一条来自桌面通知，用于 OpenSave 不在前台时。点击即可打开该游戏。', why ? 'error' : 'info', { ttl: 9000 });
    }, 4800);
  }

  const toggle = (key) => notifyPrefs.update((p) => ({ ...p, [key]: !p[key] }));
  const attention = Object.entries(NOTIFY_EVENTS).filter(([, e]) => e.kind === 'attention');
  const messages = Object.entries(NOTIFY_EVENTS).filter(([, e]) => e.kind === 'message');
</script>

<div class="notif">
<div class="demo">
  <p class="hint">
    所有内容也会进入窗口顶部的铃铛，其中会统计新消息和等待你处理的事项。
  </p>
  <button class="btn small" disabled={showing} on:click={showMe}><BellRing size={14} />演示一下</button>
</div>
<p class="lead">以下情况时提示音并将 OpenSave 带到前台…</p>
{#each attention as [key, e]}
  <label class="check">
    <input type="checkbox" checked={$notifyPrefs[key]} on:change={() => toggle(key)} />
    {e.label}
  </label>
{/each}

<p class="lead">以下情况时显示消息…</p>
{#each messages as [key, e]}
  <label class="check">
    <input type="checkbox" checked={$notifyPrefs[key]} on:change={() => toggle(key)} />
    {e.label}
  </label>
{/each}

<label class="check quiet">
  <input type="checkbox" checked={$notifyPrefs.desktop} on:change={() => toggle('desktop')} />
  OpenSave 不在前台时在桌面上显示通知
</label>
<p class="hint">
  以系统原生通知的形式显示，并带有游戏封面。点击通知即可在 OpenSave 中打开对应内容。
</p>

<label class="check quiet">
  <input type="checkbox" checked={$notifyPrefs.quietWhilePlaying} on:change={() => toggle('quietWhilePlaying')} />
  全屏游戏运行时保持安静
</label>
<p class="hint">
  不播放提示音、不显示桌面通知，也不会有窗口挡在你的游戏前面。无论如何，通知都会留在铃铛里等你回来查看。
</p>
</div>

<style>
  /* Not .hint: a hint straight after a switch is pulled up to it (app.css),
     and these head the group below them instead. */
  .lead {
    margin: 14px 0 2px;
    font-size: 0.8rem;
    color: var(--text-faint);
  }
  .lead:first-child {
    margin-top: 0;
  }
  .quiet {
    margin-top: 12px;
  }
  .demo {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--border);
  }
  .demo .hint {
    margin: 0;
  }
</style>
