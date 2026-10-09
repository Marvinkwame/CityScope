import { describe, it, expect } from 'vitest';
import {
  WELCOME_DISMISSED_KEY,
  openedFromShareLink,
  rememberWelcomeDismissed,
  shouldShowWelcome,
} from './welcomeMemory';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

// What private mode and strict privacy settings can do to localStorage.
const blocked: Pick<Storage, 'getItem' | 'setItem'> = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('shouldShowWelcome', () => {
  it('greets a first visit', () => {
    expect(shouldShowWelcome('', memoryStorage())).toBe(true);
  });

  it('stays away once dismissed in this browser', () => {
    const storage = memoryStorage();
    rememberWelcomeDismissed(storage);
    expect(shouldShowWelcome('', storage)).toBe(false);
  });

  it('lets a share link land on its own view', () => {
    expect(shouldShowWelcome('#s=eyJ2IjoxfQ', memoryStorage())).toBe(false);
  });

  it('shows the card when storage throws, rather than crashing', () => {
    expect(shouldShowWelcome('', blocked)).toBe(true);
  });

  it('shows the card when there is no storage at all', () => {
    expect(shouldShowWelcome('', null)).toBe(true);
  });
});

describe('rememberWelcomeDismissed', () => {
  it('swallows a storage that refuses writes', () => {
    expect(() => rememberWelcomeDismissed(blocked)).not.toThrow();
  });

  it('stores the dismissal under the agreed key', () => {
    const storage = memoryStorage();
    rememberWelcomeDismissed(storage);
    expect(storage.getItem(WELCOME_DISMISSED_KEY)).toBe('1');
    expect(WELCOME_DISMISSED_KEY).toBe('cityscope.welcomeDismissed');
  });
});

describe('openedFromShareLink', () => {
  it('only counts the share-state hash', () => {
    expect(openedFromShareLink('#s=abc')).toBe(true);
    expect(openedFromShareLink('#other')).toBe(false);
    expect(openedFromShareLink('')).toBe(false);
  });
});
