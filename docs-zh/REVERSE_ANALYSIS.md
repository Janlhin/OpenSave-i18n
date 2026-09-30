# OpenSave v2.4.0 逆向分析报告

> 说明：OpenSave 采用 **MIT 开源协议**，源码完整公开，因此本项目基于官方源码合法进行
> 汉化与本地化改造，无需黑盒反编译。本文档记录对源码的扫描分析结论。

## 1. 项目概况

- 版本：v2.4.0（wails.json）
- 语言：Go 后端 + Wails v2 桌面框架 + Svelte 前端
- 协议：MIT（Copyright © 2026 Siva Prakash and OpenSave contributors）
- 构建：`wails build`（前端 npm build 嵌入 Go 二进制）

## 2. 目录结构（第一轮扫描）

```
cmd/opensave-app/      桌面应用主程序（Wails 入口 + 前端）
internal/              核心业务（454 个文件）
  api                  本地 REST + WebSocket API
  p2p                  设备发现、配对、同步引擎
  delta                块哈希 / manifest diff（增量同步核心）
  snapshot             快照、分支、保留策略
  watcher              存档变更检测（safe-write 感知）
  presets              20000+ 游戏存档位置索引（基于 Ludusavi manifest）
  cloud                云备份（Google Drive/Dropbox/OneDrive/WebDAV + PKCE OAuth）
  e2ee                 端到端加密（v2.4.0 新增）
  store                SQLite 持久化（~/.opensave/）
  sysintegration       托盘、通知、自启动
  selfupdate           自动更新
relay/                 独立无状态中继服务器（可自托管）
cmd/opensave-cli       CLI 命令行工具
e2e/                   端到端测试（77 个文件）
opensave-decky-plugin  Steam Deck Decky 插件
packaging/             打包脚本（Flatpak/安装器等）
```

## 3. 前端结构（第二轮扫描）

- 入口：`frontend/src/main.js` → `App.svelte`
- 视图（views/）：Home、GameDetail、Devices、CloudBackup、Settings、Changelog、ActivityLog、InternetSync
- 组件（components/）：约 40+ 个（TitleBar、Sidebar、ConflictModal、PairingBanner 等）
- lib/：81 个 JS 模块（几乎都有配套 .test.js，测试覆盖良好）
- 前端与 Go 后端通过 Wails 绑定（window.go）+ WebSocket（lib/api.js 的 connectWS）通信

## 4. 汉化现状调查

- **无 i18n 框架**：前端无 locale/i18n 模块，全部字符串硬编码在 Svelte 模板中
- **Go 侧用户可见字符串**：托盘菜单（tray_status.go）、Windows 通知（notify_windows.go）、
  确认对话框文案等也是硬编码英文
- GitHub Issues 搜索 chinese/i18n/translation/汉化：零结果

## 5. 汉化方案

采用**直接汉化**策略（不做 i18n 抽象层，改动最小、风险最低）：

1. 前端 Svelte/JS：逐文件将英文 UI 字符串替换为中文（83 个 .svelte + 相关 js）
2. Go 侧：托盘、通知、对话框字符串汉化
3. 文档：提供中文入门指南
4. 每完成一批文件即 git 提交，可回滚可审查

## 6. 风险与注意

- 上游更新后需 rebase；冲突集中在被汉化的文件
- 中文文案必须考虑窗口宽度（TitleBar/按钮空间有限）
- 存档数据文件不受影响（SQLite 内无英文 UI 文案）
