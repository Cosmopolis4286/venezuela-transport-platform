/**
 * CSV for spreadsheets: comma-separated, CRLF line ends, fields quoted when needed, and a UTF-8
 * byte-order mark so Excel opens accents correctly. Cells that look like formulas are prefixed
 * with an apostrophe (CSV injection).
 */
export function toCsv(rows: readonly (readonly (string | number | null)[])[]): string {
  const cell = (value: string | number | null): string => {
    let text = value === null ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
