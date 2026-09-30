package main

import (
	"strings"
	"testing"
	"unicode/utf8"

	"github.com/opensave/opensave/internal/logging"
	"github.com/opensave/opensave/internal/syncpause"
)

func TestTrayStatusSaysTheMostImportantThing(t *testing.T) {
	paused := syncpause.Status{Paused: true, RemainingSeconds: 42*60 - 10}
	for _, c := range []struct {
		facts trayFacts
		want  string
	}{
		{trayFacts{Games: 6, Conflicts: 1, Pause: paused, Syncing: []string{"Hades"}}, "1 个游戏需要你处理"},
		{trayFacts{Games: 6, Conflicts: 3}, "3 个游戏需要你处理"},
		{trayFacts{Games: 6, Pause: paused, Syncing: []string{"Hades"}}, "同步已暂停 · 剩余 42 分钟"},
		{trayFacts{Games: 6, Pause: syncpause.Status{Paused: true, UntilRestart: true}}, "同步已暂停，直到你恢复"},
		{trayFacts{Games: 6, Pause: syncpause.Status{Paused: true, RemainingSeconds: 3600}}, "同步已暂停 · 剩余 1 小时"},
		{trayFacts{Games: 6, Pause: syncpause.Status{Paused: true, RemainingSeconds: 5400}}, "同步已暂停 · 剩余 1 小时 30 分"},
		{trayFacts{Games: 6, Pause: syncpause.Status{Paused: true, RemainingSeconds: 20}}, "同步已暂停 · 剩余不到 1 分钟"},
		{trayFacts{Games: 6, Syncing: []string{"Hades"}}, "正在同步 Hades…"},
		{trayFacts{Games: 6, Syncing: []string{"Hades", "Celeste"}}, "正在同步 2 个游戏…"},
		{trayFacts{Games: 0}, "还没有跟踪任何游戏"},
		{trayFacts{Games: 1}, "正在监视 1 个游戏"},
		{trayFacts{Games: 6}, "正在监视 6 个游戏"},
	} {
		if got := trayStatus(c.facts); got != c.want {
			t.Errorf("%+v: %q, want %q", c.facts, got, c.want)
		}
	}
}

func TestTrayRecentPrefersWhatWentThroughOrWrong(t *testing.T) {
	log := []logging.Entry{
		{Level: "success", Message: "synced Hades with Deck"},
		{Level: "info", Message: "watching 6 games"},
		{Level: "error", Message: "sync Celeste with Deck failed: connection reset"},
		{Level: "info", Message: "window hidden to tray"},
		{Level: "success", Message: "brought Balatro from the cloud"},
	}
	got := trayRecent(log, 3)
	want := []string{"brought Balatro from the cloud", "⚠ sync Celeste with Deck failed: connection reset", "synced Hades with Deck"}
	if strings.Join(got, "|") != strings.Join(want, "|") {
		t.Errorf("recent = %q, want %q", got, want)
	}
}

func TestTrayRecentFallsBackToTheRoutine(t *testing.T) {
	log := []logging.Entry{{Level: "info", Message: "a"}, {Level: "info", Message: "b"}, {Level: "info", Message: "c"}, {Level: "info", Message: "d"}}
	if got := trayRecent(log, 2); strings.Join(got, "") != "dc" {
		t.Errorf("recent = %q, want the two newest", got)
	}
	if got := trayRecent(nil, 3); len(got) != 0 {
		t.Errorf("recent of nothing = %q", got)
	}
}

func TestTrayRecentKeepsLinesShort(t *testing.T) {
	long := "restored " + strings.Repeat("C:\\Users\\someone\\Saved Games\\", 10) + "slot1.sav"
	got := trayRecent([]logging.Entry{{Level: "success", Message: long + "\n  with a newline"}}, 1)[0]
	if n := utf8.RuneCountInString(got); n != trayRecentMax || !strings.HasSuffix(got, "…") || strings.Contains(got, "\n") {
		t.Errorf("line = %q (%d runes)", got, n)
	}
}
