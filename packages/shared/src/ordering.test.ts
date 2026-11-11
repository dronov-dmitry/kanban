import { describe, expect, it } from 'vitest';
import { generateNKeysBetween, keyBetween, rebalancedPositions } from './ordering';

describe('fractional indexing', () => {
  it('creates a first key', () => {
    expect(keyBetween(null, null)).toBe('V');
  });

  it('inserts before and after', () => {
    const first = keyBetween(null, null);
    const before = keyBetween(null, first);
    const after = keyBetween(first, null);
    expect(before < first).toBe(true);
    expect(first < after).toBe(true);
  });

  it('keeps inserting between neighbours in order', () => {
    let left = keyBetween(null, null);
    const right = keyBetween(left, null);
    const inserted: string[] = [];
    for (let i = 0; i < 50; i++) {
      const next = keyBetween(left, right);
      expect(next > left && next < right).toBe(true);
      inserted.push(next);
      left = next;
    }
    expect(new Set(inserted).size).toBe(inserted.length);
  });

  it('generates evenly spaced batches', () => {
    const keys = generateNKeysBetween(null, null, 20);
    expect(keys).toHaveLength(20);
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1]! < keys[i]!).toBe(true);
    }
  });

  it('rejects inverted bounds', () => {
    expect(() => keyBetween('b', 'a')).toThrow();
  });

  it('rebalances a list', () => {
    const keys = rebalancedPositions(1024);
    expect(keys).toHaveLength(1024);
    expect([...keys].sort()).toEqual(keys);
  });
});
