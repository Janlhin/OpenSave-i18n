import { describe, it, expect } from 'vitest';
import { timeAgo, latestOf } from './timeago.js';

const now = Date.UTC(2026, 8, 21, 12, 0, 0);
const ago = (ms) => new Date(now - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  it.each([
    [ago(0), '刚刚'],
    [ago(30_000), '刚刚'],
    // A peer's clock a few seconds ahead of ours must not print a negative age.
    [ago(-5_000), '刚刚'],
    [ago(60_000), '1 分钟前'],
    [ago(4 * MIN), '4 分钟前'],
    [ago(59 * MIN), '59 分钟前'],
    [ago(70 * MIN), '1 小时前'],
    [ago(5 * HOUR), '5 小时前'],
    [ago(26 * HOUR), '昨天'],
    [ago(3 * DAY), '3 天前'],
  ])('%s → %s', (iso, want) => {
    expect(timeAgo(iso, now)).toBe(want);
  });

  it('reads the daemon\'s millisecond form and the import\'s plain RFC 3339 alike', () => {
    expect(timeAgo('2026-09-21T11:50:00.000Z', now)).toBe('10 分钟前');
    expect(timeAgo('2026-09-21T11:50:00Z', now)).toBe('10 分钟前');
  });

  it('gives a date beyond a week', () => {
    expect(timeAgo(ago(30 * DAY), now)).toBe(
      new Date(Date.parse(ago(30 * DAY))).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    );
  });

  it('says never for nothing, and shows garbage rather than hiding it', () => {
    expect(timeAgo('', now)).toBe('从未');
    expect(timeAgo(undefined, now)).toBe('从未');
    expect(timeAgo('not a time', now)).toBe('not a time');
  });
});

describe('latestOf', () => {
  it('picks the newest stamp across devices', () => {
    expect(latestOf({ deck: ago(HOUR), laptop: ago(MIN) })).toBe(ago(MIN));
  });
  it('is null with no devices synced', () => {
    expect(latestOf({})).toBeNull();
    expect(latestOf(undefined)).toBeNull();
  });
});
