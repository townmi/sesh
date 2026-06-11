export function formatShortId(id: string): string {
  const stripped = id.replace(/-/g, '');
  return stripped.length >= 8 ? stripped.slice(0, 8) : stripped;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}

export function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + '...' + str.slice(str.length - half);
}

export function sanitize(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${min}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isFullWidthCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    codePoint === 0x2329 ||
    codePoint === 0x232a ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  );
}

function displayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const codePoint = char.codePointAt(0);
    width += codePoint !== undefined && isFullWidthCodePoint(codePoint) ? 2 : 1;
  }
  return width;
}

function truncateDisplay(str: string, maxWidth: number): string {
  if (displayWidth(str) <= maxWidth) return str;
  if (maxWidth <= 0) return '';
  if (maxWidth === 1) return '…';

  const ellipsisWidth = 1;
  let width = 0;
  let result = '';

  for (const char of str) {
    const codePoint = char.codePointAt(0);
    const charWidth = codePoint !== undefined && isFullWidthCodePoint(codePoint) ? 2 : 1;
    if (width + charWidth > maxWidth - ellipsisWidth) break;
    result += char;
    width += charWidth;
  }

  return `${result}…`;
}

function padDisplayEnd(str: string, width: number): string {
  return str + ' '.repeat(Math.max(0, width - displayWidth(str)));
}

export function formatTable(
  rows: Record<string, string>[],
  maxWidths?: Record<string, number>,
): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const widths: Record<string, number> = {};
  for (const key of keys) {
    const contentWidth = Math.max(...rows.map((r) => displayWidth(r[key])));
    const max = maxWidths?.[key] ?? Infinity;
    widths[key] = Math.max(displayWidth(key), Math.min(contentWidth, max));
  }
  const header = keys.map((k) => padDisplayEnd(k, widths[k])).join('  ');
  const separator = keys.map((k) => '-'.repeat(widths[k])).join('  ');
  const body = rows
    .map((row) =>
      keys
        .map((k) => {
          const val = truncateDisplay(row[k], widths[k]);
          return padDisplayEnd(val, widths[k]);
        })
        .join('  '),
    )
    .join('\n');
  return `${header}\n${separator}\n${body}`;
}
