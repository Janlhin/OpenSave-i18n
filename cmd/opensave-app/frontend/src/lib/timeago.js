// A stored moment, said the way a person would: "just now", "4 min ago",
// "yesterday". The same thresholds as the CLI's timeAgo, so the app and the
// terminal describe one sync the same way.
//
// Beyond a week the date itself is clearer than a count of days. Anything
// unparseable is returned as it came, so a wrong-looking value can be
// reported instead of vanishing.

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export function timeAgo(iso, now = Date.now()) {
  if (!iso) return '从未';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return String(iso);
  const d = now - t;
  // A stamp a few seconds in the future is a peer's clock running slightly
  // ahead, not a negative age.
  if (d < 45 * SEC) return '刚刚';
  if (d < 90 * SEC) return '1 分钟前';
  if (d < HOUR) return `${Math.round(d / MIN)} 分钟前`;
  if (d < 90 * MIN) return '1 小时前';
  if (d < DAY) return `${Math.round(d / HOUR)} 小时前`;
  if (d < 36 * HOUR) return '昨天';
  if (d < 7 * DAY) return `${Math.round(d / DAY)} 天前`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// The newest of several stamps, or null when there are none. Used where one
// game gets one line: "synced 4 min ago" is the most recent device.
export function latestOf(stamps) {
  let best = null;
  for (const iso of Object.values(stamps ?? {})) {
    if (iso && (best === null || iso > best)) best = iso;
  }
  return best;
}
