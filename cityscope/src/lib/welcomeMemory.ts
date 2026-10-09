import { SHARE_HASH_PREFIX } from './shareCodec';

/**
 * Whether to greet a visitor with the welcome card.
 *
 * Every storage access is wrapped: private mode and strict privacy settings
 * can make localStorage throw (even reading the property can), and blocked
 * storage must mean "show the card", never a crash.
 */
export const WELCOME_DISMISSED_KEY = 'cityscope.welcomeDismissed';

/** localStorage, or null where it is missing or blocked. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The page was opened from a share link, so it should land on that view, not on the card. */
export function openedFromShareLink(hash: string): boolean {
  return hash.startsWith(SHARE_HASH_PREFIX);
}

export function isWelcomeDismissed(storage: Pick<Storage, 'getItem'> | null): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(WELCOME_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberWelcomeDismissed(storage: Pick<Storage, 'setItem'> | null): void {
  if (!storage) return;
  try {
    storage.setItem(WELCOME_DISMISSED_KEY, '1');
  } catch {
    // Blocked storage: the card simply shows again on the next visit.
  }
}

export function shouldShowWelcome(hash: string, storage: Pick<Storage, 'getItem'> | null): boolean {
  return !openedFromShareLink(hash) && !isWelcomeDismissed(storage);
}
