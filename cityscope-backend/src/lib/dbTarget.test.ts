import { describe, it, expect } from 'vitest';
import { requireDbTarget, describeDatabase } from './dbTarget';

describe('requireDbTarget', () => {
  it('throws when unset', () => {
    expect(() => requireDbTarget({})).toThrow(/CITYSCOPE_DB_TARGET/);
  });

  it('throws when blank', () => {
    expect(() => requireDbTarget({ CITYSCOPE_DB_TARGET: '  ' })).toThrow(/CITYSCOPE_DB_TARGET/);
  });

  it('returns the target', () => {
    expect(requireDbTarget({ CITYSCOPE_DB_TARGET: 'reach-dev' })).toBe('reach-dev');
  });
});

describe('describeDatabase', () => {
  it('strips credentials', () => {
    const description = describeDatabase(
      'postgresql://u:secret@ep-x.eu-central-1.aws.neon.tech/neondb?sslmode=require',
    );
    expect(description).toBe('ep-x.eu-central-1.aws.neon.tech');
    expect(description).not.toContain('secret');
  });

  it('reports when there is no DATABASE_URL', () => {
    expect(describeDatabase(undefined)).toBe('(no DATABASE_URL)');
  });
});
