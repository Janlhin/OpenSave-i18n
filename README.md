# OpenSave-i18n

**简繁中文本地化工作仓库 / Unofficial i18n work repo for [Liquid-co/OpenSave](https://github.com/Liquid-co/OpenSave)**

> 主工作分支：**`feat/i18n-full-coverage`**（基于上游 `dev-public`，当前领先 24 个提交）
> ⚠️ 本仓库是个人工作仓，**正式贡献一律通过上游 PR 提交**，此处仅作协作与存档。

---

## 📣 给 ChakraFusion / A note for ChakraFusion

**中文**：

嗨，OpenSave 的全部 i18n 提取工作已经完成了——三语目录（`en` / `zh-Hans` / `zh-Hant`，1328 条），窗口所有界面（含 lib 层动态文本：时间格式、活动描述、通知、排序名、外观选项等）都已提取为 key 并翻译。`npm test` 310/310，构建干净，两个运行时崩溃（TransfersPanel 漏改别名、缺时间戳条目导致的时间线崩溃）均已修复并经实测。

需要的话直接从 **`feat/i18n-full-coverage`** 分支取（整个分支自洽，可独立构建）。PR 我会按 view 分小批慢慢推到上游（`dev-public`）——如果和你在做的工作有重叠，随时联系我协调，以避免冲突。

**English**:

Hi — the full i18n extraction for OpenSave is done: three catalogs (`en` / `zh-Hans` / `zh-Hant`, 1328 keys), every window UI extracted to keys, including the lib-layer dynamic text (time formats, activity descriptions, notifications, sort names, appearance options). `npm test` 310/310, clean build, and the two runtime crashes introduced along the way (TransfersPanel alias leftovers, a timeline crash on missing timestamps) are fixed and verified.

Feel free to take anything you need from the **`feat/i18n-full-coverage`** branch — it's self-contained and builds standalone. I'll be pushing PRs to upstream (`dev-public`) view by view; if anything overlaps with your work, ping me and let's coordinate.

---

## 目录结构 / Layout

| 内容 | 位置 |
|---|---|
| 完整 i18n 工作（24 commits） | `feat/i18n-full-coverage` |
| 翻译目录（1328 keys × 3） | `cmd/opensave-app/frontend/src/locales/`（`en.json` / `zh-Hans.json` / `zh-Hant.json`） |
| 上游 PR 计划 | 会话工作区（`OpenSave-PR计划.md`，按需索取） |
| 校对底表（简繁对照 1205 行） | 会话工作区（按需索取） |

## 技术要点 / Technical notes

- 零依赖 i18n 层：`lib/i18n.js`（`t` store + `t(key, params)`），en 为回退源
- 中文按**字形**分目录（`zh-Hans` / `zh-Hant`），`scriptFor()` 按 OS 区域映射——不做 zh-CN/zh-TW 地区细分
- 复数走 `Intl.PluralRules`（en 用 one/other，中文单形式）
- `lib/` 仅追加导出（`timeAgoParts` / `gameStatusParts` / `waitingText` / `recentText` / `providerStatusText`），行为零改动，既有测试原样全绿

## Credit

- i18n 提案与骨架 review：**@sivadaboi**（#18、#19）
- 翻译与全量提取、校验脚本：**@Janlhin**
- 协作：**@ChakraFusion**
- License：MIT（同上游）
