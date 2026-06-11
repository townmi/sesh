import { describe, it, expect } from 'vitest';
import {
  formatShortId,
  truncate,
  truncateMiddle,
  sanitize,
  formatDate,
  formatBytes,
  formatTable,
} from '../../src/utils/format.js';

function displayColumn(str: string): number {
  let width = 0;
  for (const char of str) {
    const codePoint = char.codePointAt(0);
    const isFullWidth =
      codePoint !== undefined &&
      ((codePoint >= 0x1100 && codePoint <= 0x115f) ||
        codePoint === 0x2329 ||
        codePoint === 0x232a ||
        (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
        (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
        (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
        (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
        (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
        (codePoint >= 0xff00 && codePoint <= 0xff60) ||
        (codePoint >= 0xffe0 && codePoint <= 0xffe6));
    width += isFullWidth ? 2 : 1;
  }
  return width;
}

describe('formatShortId', () => {
  it('returns first 8 characters of a UUID', () => {
    expect(formatShortId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4');
  });

  it('strips hyphens from a UUID', () => {
    expect(formatShortId('aaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('aaaaaaab');
  });

  it('returns full string if shorter than 8', () => {
    expect(formatShortId('abc')).toBe('abc');
  });
});

describe('truncate', () => {
  it('returns full string if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates with ellipsis if over limit', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });
});

describe('truncateMiddle', () => {
  it('returns full string if within limit', () => {
    expect(truncateMiddle('hello', 10)).toBe('hello');
  });

  it('shows start and end with ellipsis', () => {
    const result = truncateMiddle('/Users/harry/Documents/workspace/xd/ai/openclaw/prod', 40);
    expect(result).toContain('...');
    expect(result.startsWith('/Users/harry')).toBe(true);
    expect(result.endsWith('openclaw/prod')).toBe(true);
  });
});

describe('sanitize', () => {
  it('collapses newlines and multiple spaces', () => {
    expect(sanitize('hello\nworld')).toBe('hello world');
    expect(sanitize('a  b\tc')).toBe('a b c');
    expect(sanitize('  trim me  ')).toBe('trim me');
  });
});

describe('formatDate', () => {
  it('formats ISO date to MM-DD HH:mm', () => {
    expect(formatDate('2026-04-15T10:20:30.000Z')).toBe('04-15 10:20');
  });
});

describe('formatBytes', () => {
  it('returns bytes under 1KB', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('returns KB', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });

  it('returns MB', () => {
    expect(formatBytes(3_000_000)).toBe('2.9 MB');
  });
});

describe('formatTable', () => {
  it('aligns columns', () => {
    const rows = [
      { id: 'abc', name: 'hello' },
      { id: 'defgh', name: 'world' },
    ];
    const result = formatTable(rows);
    expect(result).toContain('abc');
    expect(result).toContain('defgh');
    expect(result).toContain('hello');
    expect(result).toContain('world');
  });

  it('truncates wide title content to the configured display width', () => {
    const result = formatTable([{ TITLE: '标题标题标题', DATE: '06-11 09:45' }], { TITLE: 4 });

    expect(result).toContain('TITLE  DATE');
    expect(result).toContain('标题…  06-11 09:45');
    expect(result).not.toContain('标题标题');
  });

  it('keeps following columns aligned after wide title content', () => {
    const result = formatTable([{ TITLE: '标题标题标题', DATE: '06-11 09:45' }], { TITLE: 4 });
    const [header, , row] = result.split('\n');

    expect(displayColumn(row.slice(0, row.indexOf('06-11 09:45')))).toBe(header.indexOf('DATE'));
  });
});
