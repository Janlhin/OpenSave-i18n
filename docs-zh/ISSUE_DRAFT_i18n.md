# Issue 草稿：给官方仓库提 i18n 支持请求

> 使用方法：打开 https://github.com/Liquid-co/OpenSave/issues/new
> 标题用下面的 Title，正文复制 Body。提交前可以把 `<!-- -->` 里的说明删掉。

---

## Title

```
Proposal: i18n / localization support (starting with Simplified Chinese)
```

## Body

````markdown
### Motivation

OpenSave is a fantastic tool, but its UI is English-only. For many users
(especially in the Chinese gaming community, where save-syncing for emulators,
GOG/Epic, and repacks is a very common pain point), an English UI is a real
adoption barrier. The project's own docs say it is "written for people who
have never done this before" — localization would extend that to people who
have never done this before *in English*.

### Current state

I audited the v2.4.0 codebase:

- The frontend (~83 `.svelte` components, ~81 modules in `frontend/src/lib/`)
  has **no i18n framework** — all user-facing strings are hardcoded inline
  in templates and JS.
- The Go side also hardcodes user-visible strings (tray menu in
  `tray_desktop.go` / `tray_status.go`, dialogs and messages in `app.go`,
  notifications).
- No existing issue/PR mentions i18n or translations.

### Proposal

1. **Frontend**: adopt a lightweight i18n layer (e.g. `svelte-i18n`) with
   locale JSON files (`en.json` as source of truth, plus one file per
   language). Extract strings incrementally, view by view, to keep PRs
   reviewable.
2. **Go side**: a small message catalog (e.g. `go-i18n` or a simple map) for
   the handful of tray/notification/dialog strings.
3. **Settings**: a "Language" dropdown in Settings (default: system locale).
4. Ship built-in `en` + `zh-CN` first; the structure makes community
   translations (ja, ko, de, ru…) drop-in easy afterwards.

### Why this is tractable

- As a proof of feasibility, I have already produced a complete working
  Simplified Chinese version (direct string replacement, ~1,100 strings across
  views/components/lib/Go side). All frontend tests pass
  (249/249 after adapting test assertions). So the translation *content*
  is done and validated — the remaining work is the mechanical extraction
  into locale files.
- The extraction can be done in small batches (per view), so no single PR
  is overwhelming.

### About me / offer

I'd be happy to contribute this: I can start with (a) an issue-accepted i18n
skeleton PR (frontend infra + Settings dropdown + `en.json` extraction of one
view as the pattern), then (b) follow-up PRs per view, and (c) the complete
`zh-CN` catalog.

Happy to discuss alternative approaches (e.g. if the maintainer prefers a
zero-dependency dictionary module over `svelte-i18n`).

---
*Built and tested against v2.4.0 (`f9bb679`). Windows 11, Wails v2.12.*
````

---

## 备注（不进 issue）

- 中文标题备选：`Proposal: i18n / localization support (starting with Simplified Chinese)`
- 如果官方回复积极，回来告诉我，我再做 i18n 骨架 PR（这在我们仓库里对应新增 `frontend/src/lib/i18n/` + locale 抽取）。
- 若想降低官方接受门槛，可把上面 "About me / offer" 改得再谦虚一点，或先只提 issue 不承诺 PR。
- 提交前建议顺手在 issue 里贴一张中文版界面截图，说服力会强很多（我这边可以直接截，说一声即可）。
