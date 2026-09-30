import { describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { pauseLength, pauseShort } from './syncpause.js';
import { applyMessage, syncPause } from './stores.js';

const now = Date.parse('2026-09-25T12:00:00Z');
const endingIn = (minutes) => ({ paused: true, endsAt: now + minutes * 60000 });

describe('pause wording', () => {
  it('says nothing when not paused', () => {
    expect(pauseLength({ paused: false }, now)).toBe('');
    expect(pauseShort(null, now)).toBe('');
  });

  it('says how long is left, rounding up to the minute', () => {
    expect(pauseLength(endingIn(42), now)).toBe('还剩 42 分钟');
    expect(pauseLength(endingIn(41.2), now)).toBe('还剩 42 分钟');
    expect(pauseLength(endingIn(65), now)).toBe('还剩 1 小时 5 分钟');
    expect(pauseLength(endingIn(120), now)).toBe('还剩 2 小时');
    expect(pauseLength(endingIn(60), now)).toBe('还剩 1 小时');
    expect(pauseLength(endingIn(61), now)).toBe('还剩 1 小时 1 分钟');
    expect(pauseLength(endingIn(0.5), now)).toBe('还剩不到 1 分钟');
    expect(pauseShort(endingIn(42), now)).toBe('剩 42 分钟');
    expect(pauseShort(endingIn(90), now)).toBe('剩 1 小时 30 分钟');
  });

  it('has no end for a pause until resumed', () => {
    expect(pauseLength({ paused: true, untilRestart: true }, now)).toBe('直到你手动恢复');
    expect(pauseShort({ paused: true, untilRestart: true }, now)).toBe('直到恢复');
  });
});

describe('the pause store', () => {
  it('follows the daemon: the first state, then every change', () => {
    applyMessage({ type: 'init', data: { games: {}, syncPause: { paused: true, remainingSeconds: 600 } } });
    const p = get(syncPause);
    expect(p.paused).toBe(true);
    expect(p.endsAt - Date.now()).toBeGreaterThan(590000);

    applyMessage({ type: 'sync-pause', data: { paused: true, untilRestart: true } });
    expect(get(syncPause)).toMatchObject({ paused: true, untilRestart: true, endsAt: null });

    applyMessage({ type: 'sync-pause', data: { paused: false } });
    expect(get(syncPause).paused).toBe(false);
  });
});
