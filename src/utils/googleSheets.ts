import { parseWorkbookSheets, type CatalogImportResult } from './catalogExcel';

export interface GoogleSheetLinkConfig {
  spreadsheetInput: string;
  spreadsheetId: string;
  spreadsheetTitle: string;
  autoSync: boolean;
  lastSyncedAt: string | null;
}

export interface GoogleSheetSyncResult {
  spreadsheetId: string;
  spreadsheetTitle: string;
  importResult: CatalogImportResult;
}

export class GoogleSheetsAuthExpiredError extends Error {
  constructor(message = 'Sesi izin Google Sheets berakhir. Silakan Sign in with Google ulang.') {
    super(message);
    this.name = 'GoogleSheetsAuthExpiredError';
  }
}

/**
 * Extracts a Google Spreadsheet ID from either a full Google Sheets URL
 * or a raw spreadsheet ID string.
 */
export function extractSpreadsheetId(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch?.[1]) {
    return urlMatch[1];
  }

  // Raw spreadsheet ID (alphanumeric, hyphens, underscores, typically 20+ chars)
  if (/^[a-zA-Z0-9-_]{15,}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Builds the Google Sheets API v4 values:batchGet endpoint URL with A1 ranges
 * properly quoted and URI-encoded for arbitrary tab names.
 */
export function buildBatchGetUrl(spreadsheetId: string, sheetNames: string[]): string {
  const params = new URLSearchParams();
  params.set('valueRenderOption', 'UNFORMATTED_VALUE');
  for (const name of sheetNames) {
    const escapedName = name.replace(/'/g, "''");
    params.append('ranges', `'${escapedName}'!A:Z`);
  }
  return `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}/values:batchGet?${params.toString()}`;
}

export interface SheetValueRangeInput {
  range?: string;
  values?: unknown[][];
}

/**
 * Maps a Google Sheets values:batchGet payload into parsed catalog products
 * by reusing the multi-sheet workbook parser (satuan, katalog, 5jt, 10jt, 20jt, 40jt).
 */
export function mapBatchGetResponseToCatalog(
  spreadsheetId: string,
  spreadsheetTitle: string,
  sheetNames: string[],
  valueRanges: SheetValueRangeInput[],
): GoogleSheetSyncResult {
  const sheets = sheetNames.map((sheetName, idx) => ({
    sheetName,
    rows: Array.isArray(valueRanges[idx]?.values) ? valueRanges[idx].values! : [],
  }));
  return {
    spreadsheetId,
    spreadsheetTitle,
    importResult: parseWorkbookSheets(sheets),
  };
}

interface SpreadsheetMetadataResponse {
  properties?: { title?: string };
  sheets?: Array<{ properties?: { title?: string } }>;
  error?: { message?: string; code?: number };
}

interface BatchGetValuesResponse {
  valueRanges?: SheetValueRangeInput[];
  error?: { message?: string; code?: number };
}

export async function fetchCatalogFromGoogleSheet(
  spreadsheetInput: string,
  accessToken: string,
): Promise<GoogleSheetSyncResult> {
  const spreadsheetId = extractSpreadsheetId(spreadsheetInput);
  if (!spreadsheetId) {
    throw new Error(
      'Link atau ID Google Spreadsheet tidak valid. Tempel link lengkap dari Google Sheets.',
    );
  }

  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId,
  )}?fields=properties.title,sheets.properties.title`;

  const metaRes = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (metaRes.status === 401) {
    throw new GoogleSheetsAuthExpiredError();
  }

  const metaJson = (await metaRes.json()) as SpreadsheetMetadataResponse;
  if (!metaRes.ok) {
    if (metaRes.status === 403) {
      throw new Error(
        'Akun Google ini tidak memiliki izin akses ke spreadsheet tersebut. Pastikan file dibagikan ke akun Google Anda.',
      );
    }
    if (metaRes.status === 404) {
      throw new Error('Spreadsheet tidak ditemukan. Periksa kembali link Google Sheets.');
    }
    throw new Error(metaJson.error?.message || 'Gagal membaca metadata Google Spreadsheet.');
  }

  const spreadsheetTitle = metaJson.properties?.title?.trim() || 'Google Spreadsheet';
  const sheetNames = (metaJson.sheets ?? [])
    .map((s) => s.properties?.title?.trim() ?? '')
    .filter(Boolean);

  if (sheetNames.length === 0) {
    throw new Error('Spreadsheet tidak memiliki tab sheet yang dapat dibaca.');
  }

  const batchUrl = buildBatchGetUrl(spreadsheetId, sheetNames);
  const valuesRes = await fetch(batchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (valuesRes.status === 401) {
    throw new GoogleSheetsAuthExpiredError();
  }

  const valuesJson = (await valuesRes.json()) as BatchGetValuesResponse;
  if (!valuesRes.ok) {
    throw new Error(valuesJson.error?.message || 'Gagal membaca isi data dari Google Sheets.');
  }

  return mapBatchGetResponseToCatalog(
    spreadsheetId,
    spreadsheetTitle,
    sheetNames,
    valuesJson.valueRanges ?? [],
  );
}
