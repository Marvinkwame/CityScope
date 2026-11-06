/**
 * Reading NHS England's GP practice list (the ODS "epraccur" file), and the
 * share arithmetic of the London doctor-data check.
 *
 * The file has no header row. Every field is double-quoted, a field may hold a
 * comma, a doubled quote or a line break, and each row has 27 columns. Only
 * the four read here matter:
 *
 *   0  practice code, e.g. "A81001"
 *   9  postcode
 *   12 status, as a word: ACTIVE, INACTIVE or DORMANT
 *   25 primary role code; RO76 is a GP practice (the file also lists
 *      walk-in centres, prisons and other prescribing settings)
 */

const CODE_COLUMN = 0;
const POSTCODE_COLUMN = 9;
const STATUS_COLUMN = 12;
const ROLE_COLUMN = 25;

const ACTIVE_STATUS = 'ACTIVE';
const GP_PRACTICE_ROLE = 'RO76';

export interface GpPractice {
  code: string;
  postcode: string;
}

/** Splits CSV text into rows of fields. Quoted fields may hold commas, quotes ("") and line breaks. */
function readCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      // The \n of a \r\n ends the row; a lone \r is dropped.
    } else {
      field += ch;
    }
  }
  // A last row with no line break after it.
  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * The active GP practices in the file: status ACTIVE and primary role RO76.
 * Blank lines and rows too short to have a role are skipped.
 */
export function parseGpPractices(csv: string): GpPractice[] {
  const practices: GpPractice[] = [];
  for (const fields of readCsvRows(csv)) {
    if (fields.length <= ROLE_COLUMN) continue;
    if (fields[STATUS_COLUMN].trim() !== ACTIVE_STATUS) continue;
    if (fields[ROLE_COLUMN].trim() !== GP_PRACTICE_ROLE) continue;
    practices.push({ code: fields[CODE_COLUMN].trim(), postcode: fields[POSTCODE_COLUMN].trim() });
  }
  return practices;
}

/** The fraction of `distances` at or under `metres`, from 0 to 1. An empty list gives 0. */
export function shareWithin(distances: readonly number[], metres: number): number {
  if (distances.length === 0) return 0;
  const within = distances.filter((d) => d <= metres).length;
  return within / distances.length;
}

/**
 * The value at fraction `p` (0 to 1) of `values`, interpolating between the
 * two nearest when it falls between them. An empty list gives 0. `values` is
 * not reordered.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = Math.min(Math.max(p, 0), 1) * (sorted.length - 1);
  const below = Math.floor(position);
  const above = Math.ceil(position);
  return sorted[below] + (sorted[above] - sorted[below]) * (position - below);
}
