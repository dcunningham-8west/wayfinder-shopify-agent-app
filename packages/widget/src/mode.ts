import type { Channel } from '@wayfinder/contracts';

/** Per tab, like the Session; a fresh tab opens in chat. */
const MODE_KEY = 'wayfinder:mode';

export function readMode(): Channel {
  try {
    return sessionStorage.getItem(MODE_KEY) === 'voice' ? 'voice' : 'chat';
  } catch {
    return 'chat';
  }
}

export function writeMode(mode: Channel): void {
  try {
    sessionStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: the mode lasts until the next page load.
  }
}
