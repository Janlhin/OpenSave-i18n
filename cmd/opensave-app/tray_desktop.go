//go:build windows || linux

package main

import (
	"context"
	_ "embed"
	"runtime"
	"sync/atomic"
	"time"

	"fyne.io/systray"
	"github.com/opensave/opensave/internal/syncpause"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// System tray for Windows and Linux.
//
// fyne.io/systray (the maintained getlantern fork) owns a private message
// loop on Windows and speaks pure-Go D-Bus StatusNotifierItem on Linux —
// neither conflicts with the GTK/Win32 main loop Wails owns, so it can run
// in its own goroutine on both platforms.
//
// Not every Linux desktop has a StatusNotifier host (stock GNOME needs an
// extension). trayReady tracks whether the tray actually appeared: closing
// the window only hides to tray when there IS a tray to reopen from —
// otherwise it quits normally, so the app can never become unreachable.

//go:embed build/windows/icon.ico
var trayIconICO []byte

//go:embed build/appicon.png
var trayIconPNG []byte

// trayReady is true once the tray icon is actually up.
var trayReady atomic.Bool

func trayIconBytes() []byte {
	if runtime.GOOS == "windows" {
		return trayIconICO // Windows wants ICO
	}
	return trayIconPNG // Linux StatusNotifier wants PNG
}

// trayRecentLines is how many recent activity lines the tray shows.
const trayRecentLines = 3

// trayRefreshEvery is how often the tray's status and recent activity are
// brought up to date while nothing prompts it sooner.
const trayRefreshEvery = 3 * time.Second

// trayPauseChoices are the pause lengths offered, as the app offers them;
// zero is until resumed.
var trayPauseChoices = []struct {
	label string
	d     time.Duration
}{
	{"15 分钟", 15 * time.Minute},
	{"1 小时", time.Hour},
	{"3 小时", 3 * time.Hour},
	{"直到我恢复", 0},
}

// startTray runs the system tray in its own goroutine.
//
// The menu answers the questions someone opens it to ask without opening the
// window — is it working, did the last sync go through — and does the things
// wanted in passing: sync now, snapshot everything before something risky,
// pause for a while.
func (a *App) startTray() {
	go systray.Run(func() {
		systray.SetIcon(trayIconBytes())
		systray.SetTitle("OpenSave")
		systray.SetTooltip("OpenSave — 游戏存档同步")

		statusItem := systray.AddMenuItem("正在启动…", "你的存档当前状态")
		statusItem.Disable()
		recentMenu := systray.AddMenuItem("最近活动", "最近发生的几件事")
		recentItems := make([]*systray.MenuItem, trayRecentLines)
		for i := range recentItems {
			recentItems[i] = recentMenu.AddSubMenuItem("", "")
			recentItems[i].Disable()
			recentItems[i].Hide()
		}
		activityItem := recentMenu.AddSubMenuItem("打开活动页", "查看所有发生的事情")
		systray.AddSeparator()

		openItem := systray.AddMenuItem("打开 OpenSave", "显示 OpenSave 窗口")
		syncItem := systray.AddMenuItem("同步所有游戏", "立即同步所有已跟踪的游戏")
		snapshotItem := systray.AddMenuItem("立即为所有游戏建立快照", "为所有已跟踪的游戏建立快照")
		pauseMenu := systray.AddMenuItem("暂停同步", "暂停同步一段时间；快照仍会照常建立")
		pauseItems := make([]*systray.MenuItem, len(trayPauseChoices))
		for i, c := range trayPauseChoices {
			pauseItems[i] = pauseMenu.AddSubMenuItem(c.label, "")
		}
		resumeItem := systray.AddMenuItem("恢复同步", "重新开始同步并补上进度")
		resumeItem.Hide()
		systray.AddSeparator()
		quitItem := systray.AddMenuItem("退出", "停止同步并退出")

		trayReady.Store(true)

		refresh := func() {
			if a.daemon == nil {
				return
			}
			facts := a.trayFacts()
			statusItem.SetTitle(trayStatus(facts))
			systray.SetTooltip("OpenSave — " + trayStatus(facts))
			lines := trayRecent(a.daemon.Log.History(), trayRecentLines)
			for i, item := range recentItems {
				if i < len(lines) {
					item.SetTitle(lines[i])
					item.Show()
				} else {
					item.Hide()
				}
			}
			if facts.Pause.Paused {
				pauseMenu.Hide()
				resumeItem.Show()
			} else {
				resumeItem.Hide()
				pauseMenu.Show()
			}
		}

		// Changes to the pause come from anywhere — the window, the CLI, the
		// timer running out — and the menu should not lag behind them.
		prompt := make(chan struct{}, 1)
		if a.daemon != nil {
			a.daemon.P2P.Pause.OnChange(func(syncpause.Status) {
				select {
				case prompt <- struct{}{}:
				default:
				}
			})
		}

		// One goroutine per pause choice, since each item has its own channel.
		for i, item := range pauseItems {
			d := trayPauseChoices[i].d
			go func(item *systray.MenuItem) {
				for range item.ClickedCh {
					if a.daemon != nil {
						a.daemon.PauseSync(d)
					}
				}
			}(item)
		}

		go func() {
			ticker := time.NewTicker(trayRefreshEvery)
			defer ticker.Stop()
			refresh()
			for {
				select {
				case <-ticker.C:
					refresh()
				case <-prompt:
					refresh()
				case <-openItem.ClickedCh:
					a.showWindow()
				case <-activityItem.ClickedCh:
					a.showWindow()
					wailsruntime.EventsEmit(a.ctx, "navigate", "activity")
				case <-syncItem.ClickedCh:
					if a.daemon != nil {
						go func() {
							ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
							defer cancel()
							a.daemon.P2P.SyncAllGames(ctx)
						}()
					}
				case <-snapshotItem.ClickedCh:
					if a.daemon != nil {
						go func() {
							a.daemon.SnapshotAll("对所有游戏建立快照，来自托盘菜单")
							select {
							case prompt <- struct{}{}:
							default:
							}
						}()
					}
				case <-resumeItem.ClickedCh:
					if a.daemon != nil {
						a.daemon.ResumeSync()
					}
				case <-quitItem.ClickedCh:
					a.quitFromTray()
				}
			}
		}()
	}, func() { trayReady.Store(false) })
}

// trayFacts gathers what the tray's status line is made from.
func (a *App) trayFacts() trayFacts {
	d := a.daemon
	facts := trayFacts{Pause: d.SyncPauseStatus()}
	games, _ := d.Store.ListGames()
	facts.Games = len(games)
	facts.Conflicts = len(d.P2P.Sync.ActiveConflicts()) + len(d.P2P.Sync.ActiveRootConflicts())
	if a.server != nil {
		names := map[string]string{}
		for _, g := range games {
			names[g.ID] = g.Name
		}
		seen := map[string]bool{}
		for _, t := range a.server.Transfers().Active {
			if !seen[t.GameID] {
				seen[t.GameID] = true
				name := names[t.GameID]
				if name == "" {
					name = t.GameID
				}
				facts.Syncing = append(facts.Syncing, name)
			}
		}
	}
	return facts
}

func (a *App) stopTray() {
	systray.Quit()
}

func (a *App) showWindow() {
	wailsruntime.WindowShow(a.ctx)
	wailsruntime.WindowUnminimise(a.ctx)
}

// trayGrace is how long a hidden start waits for the tray before giving up
// and showing the window. systray is up within a few hundred milliseconds
// where a host exists; where none does, it never will be, and nobody should
// stare at an empty desktop for long wondering whether the app started.
const trayGrace = 5 * time.Second

// showIfTrayNeverAppears is the safety net for a hidden start.
//
// StartHidden asks Wails not to show the window, on the assumption that the
// tray icon is the way back to it. When that assumption fails — a Linux
// desktop with no StatusNotifier host — a hidden window is an app the person
// has no way to reach, so it is shown after all. Mirrors beforeClose, which
// declines to hide to a tray that is not there.
func (a *App) showIfTrayNeverAppears() {
	deadline := time.Now().Add(trayGrace)
	for time.Now().Before(deadline) {
		if trayReady.Load() {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	if a.daemon != nil {
		a.daemon.Log.Log("warn", "以隐藏方式启动但托盘图标未出现；改为显示窗口以便访问")
	}
	wailsruntime.WindowShow(a.ctx)
}

// beforeClose intercepts the window X button: hide to tray instead of
// quitting, so syncing keeps running in the background. If the tray never
// materialized (Linux DE without a StatusNotifier host), fall through to a
// normal quit — a hidden window with no tray would be unreachable.
func (a *App) beforeClose(ctx context.Context) bool {
	if a.reallyQuit {
		return false // allow shutdown
	}
	if !trayReady.Load() {
		return false // no tray to come back from — quit normally
	}
	wailsruntime.WindowHide(ctx)
	if a.daemon != nil {
		a.daemon.Log.Log("info", "窗口已隐藏到托盘；同步仍在后台继续")
	}
	return true // prevent close
}
