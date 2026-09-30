// Pausing syncing, from the app: the wording, and the calls. The state is the
// daemon's (see internal/syncpause); the app shows it and asks for changes.
import { api } from './api.js';
import { toast } from './stores.js';

/** The lengths offered wherever pausing is, worded to follow "Pause
 *  syncing". null is until resumed. */
export const PAUSE_CHOICES = [
  { minutes: 15, label: '15 分钟' },
  { minutes: 60, label: '1 小时' },
  { minutes: 180, label: '3 小时' },
  { minutes: null, label: '直到我手动恢复' }
];

/** "还有 42 分钟"，"还剩 1 小时 05 分钟"，"直到你手动恢复"。 */
export function pauseLength(pause, now = Date.now()) {
  if (!pause?.paused) return '';
  if (pause.untilRestart || !pause.endsAt) return '直到你手动恢复';
  const minutes = Math.max(0, Math.ceil((pause.endsAt - now) / 60000));
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const hours = `${h} 小时`;
    return m ? `还剩 ${hours} ${m} 分钟` : `还剩 ${hours}`;
  }
  if (minutes <= 1) return '还剩不到 1 分钟';
  return `还剩 ${minutes} 分钟`;
}

/** Short form for the status bar: "42 min left", "until resumed". */
export function pauseShort(pause, now = Date.now()) {
  if (!pause?.paused) return '';
  if (pause.untilRestart || !pause.endsAt) return '直到恢复';
  const minutes = Math.max(0, Math.ceil((pause.endsAt - now) / 60000));
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `剩 ${h} 小时 ${m} 分钟` : `剩 ${h} 小时`;
  }
  return `剩 ${Math.max(1, minutes)} 分钟`;
}

export async function pauseSync(minutes) {
  try {
    await api.post('/api/sync/pause', minutes ? { minutes } : { untilRestart: true });
    toast(
      minutes ? `同步已暂停——快照仍会照常建立` : '同步已暂停，直到你手动恢复——快照仍会照常建立',
      'success'
    );
  } catch (e) {
    toast(e.message, 'error');
  }
}

export async function resumeSync() {
  try {
    await api.post('/api/sync/resume', {});
    toast('同步已恢复——正在补上进度', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}
