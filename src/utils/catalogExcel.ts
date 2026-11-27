import * as XLSX from 'xlsx';
import type { AllowedUnit, CatalogProduct, TierPriceMap } from '../types/invoice';
import {
  createSampleCatalog,
  normalizeAllowedUnit,
  normalizeProductName,
  parseNumericInput,
} from './invoiceLogic';

export interface CatalogImportResult {
  products: CatalogProduct[];
  skippedRows: number;
  invalidUnitCount: number;
  detectedSheets: string[];
}

const NAME_HEADER_PATTERNS = [
  'nama barang',
  'nama produk',
  'nama item',
  'nama',
  'barang',
  'produk',
  'item',
  'deskripsi',
  'uraian',
];
const UNIT_HEADER_PATTERNS = ['satuan', 'unit', 'uom', 'sat'];
const PRICE_HEADER_PATTERNS = [
  'harga katalog',
  'harga normal',
  'harga jual',
  'harga satuan',
  'harga',
  'h. katalog',
  'h.katalog',
  'price',
  'hrg',
  'katalog',
  'normal',
  'nominal',
  'rp',
];

function cellToString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function findHeaderColumn(headers: string[], patterns: string[]): number {
  for (const pattern of patterns) {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i].toLowerCase().trim();
      if (!h) continue;
      if (h === pattern || h.includes(pattern)) {
        return i;
      }
    }
  }
  return -1;
}

function findExactTierColumn(headers: string[], tier: '5' | '10' | '20' | '40'): number {
  const patterns = [`${tier}jt`, `${tier} jt`, `${tier}juta`, `${tier} juta`, tier];
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (!h) continue;
    if (patterns.some((p) => h === p || h.includes(p))) {
      return i;
    }
  }
  return -1;
}

type SheetRole = 'satuan' | 'katalog' | '5' | '10' | '20' | '40' | 'generic';

export function classifySheetRole(sheetName: string): SheetRole {
  const normalized = sheetName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return 'generic';
  if (normalized.includes('satuan') || normalized === 'unit') return 'satuan';
  if (normalized.includes('katalog') || normalized.includes('catalog') || normalized === 'normal') return 'katalog';
  if (normalized === '5' || normalized === '5jt' || normalized === '5juta') return '5';
  if (normalized === '10' || normalized === '10jt' || normalized === '10juta') return '10';
  if (normalized === '20' || normalized === '20jt' || normalized === '20juta') return '20';
  if (normalized === '40' || normalized === '40jt' || normalized === '40juta') return '40';
  return 'generic';
}

interface ParsedSheetInput {
  sheetName: string;
  rows: unknown[][];
}

function parsePriceCell(val: unknown): string | undefined {
  const s = cellToString(val);
  if (!s) return undefined;
  const num = parseNumericInput(s);
  return num > 0 ? String(Math.round(num)) : undefined;
}

function isPureRowNumber(val: unknown): boolean {
  const s = cellToString(val);
  return /^\d{1,5}$/.test(s);
}

/**
 * Pure multi-sheet parser that merges product names, units (from 'satuan' or any sheet),
 * normal catalog prices (from 'katalog' or price column), and tier prices (5jt, 10jt, 20jt, 40jt).
 * Handles flexible column layouts (e.g., [Nama, Harga], [No, Nama, Harga], [Nama, Satuan, Harga]).
 */
export function parseWorkbookSheets(sheets: ParsedSheetInput[]): CatalogImportResult {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return { products: [], skippedRows: 0, invalidUnitCount: 0, detectedSheets: [] };
  }

  const productMap = new Map<
    string,
    {
      name: string;
      unit?: AllowedUnit;
      defaultPrice?: string;
      tierPrices: TierPriceMap;
    }
  >();

  let skippedRows = 0;
  let invalidUnitCount = 0;
  const detectedSheets: string[] = [];

  for (const sheet of sheets) {
    const rows = sheet.rows;
    if (!Array.isArray(rows) || rows.length === 0) continue;

    const role = classifySheetRole(sheet.sheetName);
    detectedSheets.push(sheet.sheetName);

    let headerRowIndex = -1;
    let nameCol = 0;
    let unitCol = -1;
    let priceCol = -1;
    let col5 = -1;
    let col10 = -1;
    let col20 = -1;
    let col40 = -1;

    const scanLimit = Math.min(rows.length, 8);
    for (let r = 0; r < scanLimit; r++) {
      const row = Array.isArray(rows[r]) ? rows[r].map(cellToString) : [];
      const foundName = findHeaderColumn(row, NAME_HEADER_PATTERNS);
      const foundUnit = findHeaderColumn(row, UNIT_HEADER_PATTERNS);
      const foundPrice = findHeaderColumn(row, PRICE_HEADER_PATTERNS);
      const f5 = findExactTierColumn(row, '5');
      const f10 = findExactTierColumn(row, '10');
      const f20 = findExactTierColumn(row, '20');
      const f40 = findExactTierColumn(row, '40');

      if (foundName !== -1 || foundUnit !== -1 || foundPrice !== -1 || f5 !== -1 || f10 !== -1) {
        headerRowIndex = r;
        nameCol = foundName !== -1 ? foundName : 0;
        unitCol = foundUnit;
        priceCol = foundPrice;
        col5 = f5;
        col10 = f10;
        col20 = f20;
        col40 = f40;
        break;
      }
    }

    // Positional fallback if no explicit header row exists
    if (headerRowIndex === -1) {
      const firstNonEmpty = rows.find((r) => Array.isArray(r) && r.some((c) => cellToString(c) !== ''));
      if (firstNonEmpty && isPureRowNumber(firstNonEmpty[0]) && cellToString(firstNonEmpty[1])) {
        // Sheet starts with [No, Nama Barang, ...]
        nameCol = 1;
        unitCol = 2;
        priceCol = 3;
      } else {
        nameCol = 0;
        unitCol = 1;
        priceCol = 2;
      }
    }

    const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

    for (let r = startRow; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const rawName = cellToString(row[nameCol]).replace(/\s+/g, ' ');
      if (!rawName) {
        const hasOtherData = row.some((c) => cellToString(c) !== '');
        if (hasOtherData) skippedRows++;
        continue;
      }

      const key = normalizeProductName(rawName);
      let entry = productMap.get(key);
      if (!entry) {
        entry = { name: rawName, tierPrices: {} };
        productMap.set(key, entry);
      }

      // Extract unit if unitCol is known or positional
      if (unitCol >= 0 && row[unitCol] !== undefined) {
        const rawUnit = cellToString(row[unitCol]);
        const normalized = normalizeAllowedUnit(rawUnit);
        if (normalized) {
          entry.unit = normalized;
        } else if (
          headerRowIndex === -1 &&
          (role === '5' || role === '10' || role === '20' || role === '40' || role === 'katalog' || role === 'generic') &&
          rawUnit &&
          !parsePriceCell(row[priceCol])
        ) {
          // 2-column sheet [Nama Barang, Harga] without header
          const priceFromUnitCol = parsePriceCell(rawUnit);
          if (priceFromUnitCol) {
            if (role === '5' || role === '10' || role === '20' || role === '40') {
              entry.tierPrices[role] = priceFromUnitCol;
            } else if (role === 'katalog' || !entry.defaultPrice) {
              entry.defaultPrice = priceFromUnitCol;
            }
          }
        } else if (rawUnit && headerRowIndex >= 0 && unitCol >= 0) {
          invalidUnitCount++;
        }
      }

      // Extract single-sheet multi-tier columns if present
      if (col5 >= 0) {
        const p5 = parsePriceCell(row[col5]);
        if (p5) entry.tierPrices['5'] = p5;
      }
      if (col10 >= 0) {
        const p10 = parsePriceCell(row[col10]);
        if (p10) entry.tierPrices['10'] = p10;
      }
      if (col20 >= 0) {
        const p20 = parsePriceCell(row[col20]);
        if (p20) entry.tierPrices['20'] = p20;
      }
      if (col40 >= 0) {
        const p40 = parsePriceCell(row[col40]);
        if (p40) entry.tierPrices['40'] = p40;
      }

      // Determine primary price column for this row
      let effectivePriceCol = priceCol;
      if (effectivePriceCol < 0 && role !== 'satuan') {
        effectivePriceCol = row.findIndex(
          (cell, idx) =>
            idx !== nameCol &&
            idx !== unitCol &&
            idx !== col5 &&
            idx !== col10 &&
            idx !== col20 &&
            idx !== col40 &&
            Boolean(parsePriceCell(cell)),
        );
      }

      if (effectivePriceCol >= 0 && row[effectivePriceCol] !== undefined) {
        const p = parsePriceCell(row[effectivePriceCol]);
        if (p) {
          if (role === '5' || role === '10' || role === '20' || role === '40') {
            entry.tierPrices[role] = p;
          } else if (role === 'katalog') {
            entry.defaultPrice = p;
          } else if (!entry.defaultPrice) {
            entry.defaultPrice = p;
          }
        }
      }
    }
  }

  const products: CatalogProduct[] = [];
  let idx = 0;
  for (const entry of productMap.values()) {
    const hasTier =
      entry.tierPrices['5'] || entry.tierPrices['10'] || entry.tierPrices['20'] || entry.tierPrices['40'];
    products.push({
      id: `cat-${Date.now()}-${idx++}-${Math.random().toString(36).slice(2, 6)}`,
      name: entry.name,
      unit: entry.unit ?? 'PCS',
      defaultPrice: entry.defaultPrice,
      tierPrices: hasTier ? entry.tierPrices : undefined,
    });
  }

  return { products, skippedRows, invalidUnitCount, detectedSheets };
}

export function parseCatalogRows(rows: unknown[][], sheetName = 'katalog'): CatalogImportResult {
  return parseWorkbookSheets([{ sheetName, rows }]);
}

export async function parseExcelFileToCatalog(file: File): Promise<CatalogImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheets: ParsedSheetInput[] = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    return { sheetName, rows };
  });
  return parseWorkbookSheets(sheets);
}

export function downloadCatalogTemplateXlsx(): void {
  const sample = createSampleCatalog();
  const workbook = XLSX.utils.book_new();

  const satuanRows = [
    ['NAMA BARANG', 'SATUAN'],
    ...sample.map((item) => [item.name, item.unit]),
  ];
  const wsSatuan = XLSX.utils.aoa_to_sheet(satuanRows);
  wsSatuan['!cols'] = [{ wch: 36 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, wsSatuan, 'satuan');

  const katalogRows = [
    ['NAMA BARANG', 'HARGA'],
    ...sample.map((item) => [item.name, Number(item.defaultPrice || 0)]),
  ];
  const wsKatalog = XLSX.utils.aoa_to_sheet(katalogRows);
  wsKatalog['!cols'] = [{ wch: 36 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, wsKatalog, 'katalog');

  (['5', '10', '20', '40'] as const).forEach((tier) => {
    const tierRows = [
      ['NAMA BARANG', 'HARGA'],
      ...sample.map((item) => [item.name, Number(item.tierPrices?.[tier] || item.defaultPrice || 0)]),
    ];
    const wsTier = XLSX.utils.aoa_to_sheet(tierRows);
    wsTier['!cols'] = [{ wch: 36 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(workbook, wsTier, `${tier}jt`);
  });

  XLSX.writeFile(workbook, 'template-database-barang-multi-sheet.xlsx');
}
