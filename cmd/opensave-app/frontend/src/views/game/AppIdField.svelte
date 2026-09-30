<script>
  // The Steam App ID box, which says what Steam calls the number as it is
  // typed — so "did I get the number right?" is answered before Save rather
  // than by whether a cover eventually appears. A cover that does not appear
  // says nothing about why: a typo, a game Steam has no art for, and a
  // network that blocks Steam all look identical from the outside, which is
  // how "I added the app ID but it doesn't do anything" gets asked.
  import { onDestroy } from 'svelte';
  import { api } from '../../lib/api.js';
  import MoreInfo from '../../components/ui/MoreInfo.svelte';
  import CircleCheck from 'lucide-svelte/icons/circle-check';

  export let value = '';
  /** Set by the form when Save refuses the value. */
  export let error = '';

  // Three states, kept apart because each wants different advice.
  let check = null; // null | { state: 'checking'|'found'|'unknown'|'unreachable', name? }
  let timer = null;
  let checkedFor = '';
  onDestroy(() => clearTimeout(timer));

  $: schedule(value ?? '');

  function schedule(raw) {
    const id = String(raw).trim();
    clearTimeout(timer);
    if (id === '' || !/^\d+$/.test(id)) {
      check = null;
      checkedFor = '';
      return;
    }
    if (id === checkedFor) return;
    // Debounced: a lookup per keystroke would hit Steam for every partial
    // number on the way to the real one.
    timer = setTimeout(() => lookup(id), 500);
  }

  async function lookup(id) {
    check = { state: 'checking' };
    try {
      const res = await api.get(`/api/steam/app?appId=${encodeURIComponent(id)}`);
      // The field may have moved on while Steam was answering.
      if (String(value ?? '').trim() !== id) return;
      checkedFor = id;
      check = res?.found
        ? { state: 'found', name: res.name }
        : { state: res?.reason === 'unreachable' ? 'unreachable' : 'unknown' };
    } catch {
      if (String(value ?? '').trim() !== id) return;
      checkedFor = id;
      check = { state: 'unreachable' };
    }
  }
</script>

<div class="field">
  <label for="c-appid">Steam App ID</label>
  <input id="c-appid" placeholder="例如 1091500" bind:value />
  <span class="hint">
    即游戏 Steam 商店网址中的那串数字。用于启动游戏和获取封面图。
    <MoreInfo>
      在设置中开启“按 Steam App ID 匹配游戏”后，它还能让本游戏与另一台设备上以不同名称跟踪的副本同步。
      能推断出来时会自动填写；位于 <code>AppData</code> 下的存档通常无从推断，此时你可以在这里手动填写。
    </MoreInfo>
  </span>
  {#if error}<span class="hint hint-error">{error}</span>{/if}
  {#if check?.state === 'checking'}
    <span class="hint appid-check">正在向 Steam 查询…</span>
  {:else if check?.state === 'found'}
    <span class="hint appid-check ok"><CircleCheck size={13} class="inline-icon" />Steam: <strong>{check.name}</strong></span>
  {:else if check?.state === 'unknown'}
    <span class="hint appid-check warn">
      没有 Steam 游戏使用这个 App ID。它是商店页网址中的数字 —
      <code>store.steampowered.com/app/<strong>1091500</strong>/…</code> — 而不是其他平台的编号。
    </span>
  {:else if check?.state === 'unreachable'}
    <span class="hint appid-check warn">
      无法连接 Steam 来核对这个数字。如果当前网络无法访问 Steam 商店或 CDN，封面图也加载不出来 —
      但这个 ID 本身很可能是对的。
    </span>
  {/if}
</div>

<style>
  .field {
    margin-bottom: 14px;
  }
  .appid-check {
    display: block;
    margin-top: 4px;
  }
  .appid-check.ok {
    color: var(--success);
  }
  .appid-check.warn {
    color: var(--warn);
  }
  .hint-error {
    color: var(--danger);
  }
</style>
