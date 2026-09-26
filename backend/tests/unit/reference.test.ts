import { describe, expect, it } from 'vitest';
import { formatReference } from '../../src/stock-engine/reference.js';

describe('BR7 — reference formatting', () => {
  it('builds <shortCode>/<OP>/<4-digit sequence>', () => {
    expect(formatReference('WH', 'IN', 1)).toBe('WH/IN/0001');
    expect(formatReference('WH2', 'OUT', 42)).toBe('WH2/OUT/0042');
    expect(formatReference('WH', 'INT', 9999)).toBe('WH/INT/9999');
    expect(formatReference('WH', 'ADJ', 7)).toBe('WH/ADJ/0007');
  });

  it('keeps sequences longer than 4 digits intact', () => {
    expect(formatReference('WH', 'IN', 10000)).toBe('WH/IN/10000');
    expect(formatReference('WH', 'ADJ', 123456)).toBe('WH/ADJ/123456');
  });
});
