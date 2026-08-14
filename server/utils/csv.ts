/** Escapes one CSV cell (RFC 4180: quote, and double inner quotes). */
const cell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export interface CsvSection {
  /** Optional caption row rendered above the table. */
  title?: string;
  headers: string[];
  rows: Array<Array<string | number | Date | null | undefined>>;
}

/**
 * Renders one or more labelled tables as a single CSV document. A UTF-8
 * BOM is prepended so spreadsheet applications open it with the correct
 * encoding.
 */
export const toCsv = (sections: CsvSection[]): string => {
  const lines: string[] = [];

  sections.forEach((section, index) => {
    if (index > 0) lines.push('');
    if (section.title) lines.push(cell(section.title));
    lines.push(section.headers.map(cell).join(','));
    for (const row of section.rows) {
      lines.push(row.map(cell).join(','));
    }
  });

  return `﻿${lines.join('\r\n')}\r\n`;
};

/** Filename-safe report slug, e.g. billing-report-2026-08-13.csv */
export const csvFilename = (report: string): string =>
  `${report}-report-${new Date().toISOString().slice(0, 10)}.csv`;
