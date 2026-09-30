<script>
  // Files that shouldn't sync: a pattern box, and a list of what is actually
  // in the game's folders to tick instead.
  //
  // The pattern box on its own asks you to type a filename you have to
  // already know, for a folder you cannot see, in a syntax you have to learn
  // — and gives no answer until the file turns up on another machine days
  // later. The list marks each file with the verdict the sync engine itself
  // would reach, so the rule and its effect are on screen together.
  import { onDestroy } from 'svelte';
  import { api } from '../../lib/api.js';
  import { addExclusion, addNegation, removeDirectExclusion } from '../../lib/ignorerules.js';
  import Spinner from '../../components/ui/Spinner.svelte';
  import Chevron from '../../components/ui/Chevron.svelte';

  export let game;
  /** The rule text being edited; saved with the rest of the form. */
  export let value = '';
  /** Whether the game has folders besides its save folder. */
  export let severalFolders = false;

  let showFiles = false;
  let saveFiles = null;
  let truncated = false;
  let filesError = '';
  $: excludedCount = (saveFiles ?? []).filter((f) => f.excluded).length;

  // Ask the daemon to judge a rule list against the real folders. The rules
  // are sent rather than saved first: the point of a verdict is watching it
  // change as you type, and saving to find out would mean writing a rule to
  // discover whether it was the rule you meant.
  async function refresh(rulesText) {
    try {
      const q = encodeURIComponent(rulesText ?? '');
      const res = await api.get(`/api/games/${game.id}/save-files?rules=${q}`);
      saveFiles = res?.files ?? [];
      truncated = !!res?.truncated;
      filesError = '';
    } catch (e) {
      filesError = e.message;
    }
  }

  async function togglePicker() {
    showFiles = !showFiles;
    if (showFiles && saveFiles === null) await refresh(value ?? '');
  }

  // Typing in the box re-judges the list, but not on every keystroke.
  let previewTimer = null;
  let lastPreviewed = null;
  onDestroy(() => clearTimeout(previewTimer));
  $: if (showFiles && value !== lastPreviewed) {
    lastPreviewed = value;
    clearTimeout(previewTimer);
    const text = value ?? '';
    previewTimer = setTimeout(() => refresh(text), 250);
  }

  // Ticking a file adds its pattern. Unticking removes the lines that name it
  // outright — and if it is still caught after that, by a wildcard or a folder
  // rule, adds a "!" exception, which is the only thing that can rescue one
  // file from a broader rule without abandoning the rule.
  //
  // Whether it is still caught is a question only the daemon can answer: it
  // holds the matcher the sync engine itself uses. The text editing around
  // that answer lives in ../../lib/ignorerules.js, where it is tested.
  async function toggleFile(f) {
    let text;
    if (!f.excluded) {
      text = addExclusion(value, f.path);
    } else {
      text = removeDirectExclusion(value, f.path);
      await refresh(text);
      const still = (saveFiles ?? []).find((x) => x.path === f.path && x.location === f.location);
      if (still?.excluded) text = addNegation(text, f.path);
    }
    value = text;
    lastPreviewed = text;
    await refresh(text);
  }
</script>

<div class="section">
  <h4>不应同步的文件</h4>
  <p class="hint">
    有些游戏把设备相关的设置和存档放在同一个文件夹里，复制到另一台机器可能导致游戏在那边出问题。
    在这里列出它们，它们就会原地不动：不会被发送、不会被接收，也不会被同步删除。
  </p>
  <textarea
    class="box"
    rows="4"
    spellcheck="false"
    placeholder={'Config.gs\n*.log\nlogs/'}
    bind:value
  ></textarea>
  <span class="hint">
    每行一个模式，与 <code>.gitignore</code> 类似 — <code>Config.gs</code> 按名称匹配，
    <code>/Config.gs</code> 只匹配顶层，<code>*.log</code> 按扩展名匹配，
    <code>logs/</code> 匹配整个文件夹，<code>!keep.log</code> 表示例外。不区分大小写。
    在其他设备上设置相同的列表；每台设备各自应用自己的规则。
  </span>
  <span class="hint">
    <strong>快照仍会包含这些文件</strong>，因此恢复时会一并找回 — 排除只是阻止它传输，绝不阻止它被备份。
  </span>

  <div class="picker-head">
    <button class="btn small" on:click={togglePicker}>
      <Chevron open={showFiles} /> 从存档文件夹中选取
    </button>
    {#if showFiles && saveFiles}
      <span class="hint picker-count">
        {saveFiles.length} 个文件中有 {excludedCount} 个被排除
        {#if truncated}· 仅显示前 {saveFiles.length} 个{/if}
      </span>
    {/if}
  </div>

  {#if showFiles}
    {#if filesError}
      <p class="hint err">{filesError}</p>
    {:else if !saveFiles}
      <p class="hint"><Spinner size={13} /> 正在读取存档文件夹…</p>
    {:else if saveFiles.length === 0}
      <p class="hint">这个游戏的文件夹是空的，暂时没有可选取的内容。</p>
    {:else}
      <div class="picker">
        {#each saveFiles as f (f.location + '/' + f.path)}
          <label class="file-row" class:excluded={f.excluded}>
            <input type="checkbox" checked={f.excluded} on:change={() => toggleFile(f)} />
            <span class="file-name">
              {#if f.location}<span class="file-loc">{f.location} ›</span>{/if}{f.path}
            </span>
            <span class="verdict">{f.excluded ? '不同步' : '同步'}</span>
          </label>
        {/each}
      </div>
      <span class="hint">
        勾选文件时会自动为你写好对应模式，并按锚定方式书写，确保它只可能指代这一个文件。
        取消勾选一个被通配符覆盖的文件时，会添加 <code>!</code> 例外，而不是删掉通配符。
        {#if severalFolders}
          模式对<strong>这个游戏的每一个文件夹</strong>都生效，因此出现在两个文件夹中的同名文件会在两处都被排除。
        {/if}
      </span>
    {/if}
  {/if}
</div>

<style>
  .section {
    margin-top: 18px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
  }
  h4 {
    font-size: 0.92rem;
    font-weight: 600;
    margin-bottom: 6px;
  }
  .box {
    width: 100%;
    margin-top: 8px;
    padding: 10px 12px;
    background: var(--bg);
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    color: var(--text);
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    font-size: 0.82rem;
    line-height: 1.6;
    resize: vertical;
    outline: none;
  }
  .box:focus {
    border-color: var(--accent);
  }
  .hint + .hint {
    margin-top: 6px;
  }
  .picker-head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .picker-count {
    margin-top: 0;
  }
  .picker {
    margin-top: 8px;
    max-height: 280px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  .file-row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 5px 10px;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    font-size: 0.8rem;
  }
  .file-row:last-child {
    border-bottom: 0;
  }
  .file-row:hover {
    background: var(--bg-elev, rgba(127, 127, 127, 0.06));
  }
  .file-name {
    flex: 1;
    min-width: 0;
    font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    word-break: break-all;
  }
  /* The location a file lives in, when the game has more than its save
     folder — the same filename can appear in two of them. */
  .file-loc {
    color: var(--accent-text);
    margin-right: 6px;
  }
  .verdict {
    flex: 0 0 auto;
    font-size: 0.72rem;
    color: var(--text-faint);
  }
  .file-row.excluded .file-name {
    text-decoration: line-through;
    color: var(--text-faint);
  }
  .file-row.excluded .verdict {
    color: var(--warn, var(--accent));
  }
  .err {
    color: var(--danger, var(--danger));
  }
</style>
