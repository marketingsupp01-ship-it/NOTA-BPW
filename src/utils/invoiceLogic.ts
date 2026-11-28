import type {
  AllowedUnit,
  AttentionLine,
  CatalogProduct,
  InvoiceData,
  InvoiceItem,
  PriceTierCode,
} from '../types/invoice';

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const ALLOWED_UNITS: readonly AllowedUnit[] = ['KG', 'BTG', 'LBR', 'BOX', 'PCS'] as const;
export const PRICE_TIER_CODES: readonly PriceTierCode[] = ['AUTO', '', '5', '10', '20', '40', 'TB'] as const;

export const DEFAULT_CREATOR_COLOR = '#1d24ff';
export const CREATOR_COLOR_PRESETS = [
  { label: 'Biru', hex: '#1d24ff' },
  { label: 'Merah', hex: '#dc2626' },
  { label: 'Hijau', hex: '#16a34a' },
  { label: 'Kuning', hex: '#eab308' },
  { label: 'Oranye', hex: '#ea580c' },
  { label: 'Ungu', hex: '#7c3aed' },
  { label: 'Pink', hex: '#db2777' },
  { label: 'Teal', hex: '#0d9488' },
] as const;

export function normalizeProductName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Normalizes unit strings into one of the 5 strictly allowed units:
 * KG, BTG, LBR, BOX, PCS. Returns '' if unrecognized.
 */
export function normalizeAllowedUnit(raw: unknown): AllowedUnit | '' {
  if (typeof raw !== 'string') return '';
  const cleaned = raw.trim().toUpperCase().replace(/\.+$/g, '');
  if (!cleaned) return '';

  if (cleaned === 'KG' || cleaned === 'KILO' || cleaned === 'KILOGRAM') return 'KG';
  if (cleaned === 'BTG' || cleaned === 'BATANG') return 'BTG';
  if (cleaned === 'LBR' || cleaned === 'LEMBAR') return 'LBR';
  if (cleaned === 'BOX' || cleaned === 'KOTAK' || cleaned === 'DUS') return 'BOX';
  if (cleaned === 'PCS' || cleaned === 'PC' || cleaned === 'PIECE' || cleaned === 'PIECES') return 'PCS';

  return '';
}

/**
 * Normalizes user input for Kode Harga into 'AUTO', '', '5', '10', '20', '40', or 'TB'.
 */
export function normalizePriceCode(raw: string): PriceTierCode {
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!cleaned || cleaned === 'NORMAL' || cleaned === 'KATALOG') return '';
  if (cleaned === 'AUTO' || cleaned === 'OTOMATIS') return 'AUTO';
  if (cleaned === 'TB') return 'TB';
  if (cleaned === '5' || cleaned === '5JT' || cleaned === '5JUTA') return '5';
  if (cleaned === '10' || cleaned === '10JT' || cleaned === '10JUTA') return '10';
  if (cleaned === '20' || cleaned === '20JT' || cleaned === '20JUTA') return '20';
  if (cleaned === '40' || cleaned === '40JT' || cleaned === '40JUTA') return '40';
  return '';
}

/**
 * Determines the automatic discount tier based on the normal (catalog) subtotal:
 * >= 40.000.000 -> '40'
 * >= 20.000.000 -> '20'
 * >= 10.000.000 -> '10'
 * >=  5.000.000 -> '5'
 * <   5.000.000 -> '' (normal)
 */
export function resolveAutoTierFromTotal(normalTotal: number): '' | '5' | '10' | '20' | '40' {
  if (!Number.isFinite(normalTotal) || normalTotal < 5_000_000) return '';
  if (normalTotal >= 40_000_000) return '40';
  if (normalTotal >= 20_000_000) return '20';
  if (normalTotal >= 10_000_000) return '10';
  return '5';
}

export function formatIndonesianDate(date: Date): string {
  const day = date.getDate();
  const month = INDONESIAN_MONTHS[date.getMonth()] ?? 'Januari';
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatTodayPlaceDate(place = 'Jember', now: Date = new Date()): string {
  const trimmedPlace = place.trim();
  const todayText = formatIndonesianDate(now);
  return trimmedPlace ? `${trimmedPlace}, ${todayText}` : todayText;
}

export function syncDateTextToToday(existingDateText: string, now: Date = new Date()): string {
  const commaIdx = existingDateText.indexOf(',');
  const placePrefix = commaIdx > 0 ? existingDateText.slice(0, commaIdx).trim() : 'Jember';
  return formatTodayPlaceDate(placePrefix, now);
}

export function createEmptyItem(idSuffix?: string): InvoiceItem {
  const suffix = idSuffix ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id: `item-${suffix}`,
    name: '',
    unit: '',
    qty: '',
    price: '',
  };
}

export function isInvoiceItemEmpty(
  item: Pick<InvoiceItem, 'name' | 'unit' | 'qty' | 'price'>,
): boolean {
  return !item.name.trim() && !item.unit && !item.qty.trim() && !item.price.trim();
}

export function commitItemToList(
  items: InvoiceItem[],
  draft: Omit<InvoiceItem, 'id'>,
  editingItemId: string | null = null,
): InvoiceItem[] {
  if (editingItemId) {
    return items.map((item) => (item.id === editingItemId ? { ...item, ...draft } : item));
  }
  const newItem: InvoiceItem = {
    ...createEmptyItem(),
    ...draft,
  };
  if (items.length === 1 && isInvoiceItemEmpty(items[0])) {
    return [newItem];
  }
  return [...items, newItem];
}

export function removeItemFromList(items: InvoiceItem[], id: string): InvoiceItem[] {
  const remaining = items.filter((item) => item.id !== id);
  return remaining.length > 0 ? remaining : [createEmptyItem('1')];
}

export function createDefaultAttentionLines(): AttentionLine[] {
  return [
    {
      id: 'att-1',
      prefix: 'Mohon cek kesesuaian surat jalan dan barang datang',
      boldPart: '',
      suffix: '',
    },
    {
      id: 'att-2',
      prefix: 'Jika sudah sesuai, ',
      boldPart: 'mohon tanda tangan Surat Jalan dan kembalikan ke supir',
      suffix: '',
    },
    {
      id: 'att-3',
      prefix: 'Barang yang sudah diterima tidak dapat ditukar atau dikembalikan',
      boldPart: '',
      suffix: '',
    },
  ];
}

export function createDefaultInvoice(
  now: Date = new Date(),
  creatorColor: string = DEFAULT_CREATOR_COLOR,
): InvoiceData {
  return {
    id: `default-proforma-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
    documentTitle: 'PROFORMA INVOICE',
    invoiceNumber: '',
    dateText: formatTodayPlaceDate('Jember', now),
    district: '',
    creatorColor: creatorColor.trim() || DEFAULT_CREATOR_COLOR,
    recipientHeading: 'Kepada Yth.',
    recipientDetails: '',
    priceCode: 'AUTO',
    items: [createEmptyItem('1')],
    subtotalLabel: 'HARGA NORMAL',
    totalLabel: 'TOTAL',
    attentionTitle: 'PERHATIAN :',
    attentionLines: createDefaultAttentionLines(),
    signatureGreeting: 'Hormat Kami,',
    signatureName: '',
    displayOptions: {
      showRowDividers: false,
      showInvoiceNumber: false,
    },
  };
}

export function createSampleCatalog(): CatalogProduct[] {
  return [
    {
      id: 'sample-cat-1',
      name: 'Besi Beton Polos 10mm x 12m',
      unit: 'BTG',
      defaultPrice: '78000',
      tierPrices: { '5': '76000', '10': '74500', '20': '73000', '40': '71000' },
    },
    {
      id: 'sample-cat-2',
      name: 'Triplek Meranti 9mm (122 x 244)',
      unit: 'LBR',
      defaultPrice: '145000',
      tierPrices: { '5': '142000', '10': '139000', '20': '136000', '40': '132000' },
    },
    {
      id: 'sample-cat-3',
      name: 'Kawat Bendrat Roll',
      unit: 'KG',
      defaultPrice: '26000',
      tierPrices: { '5': '25000', '10': '24500', '20': '23500', '40': '22500' },
    },
    {
      id: 'sample-cat-4',
      name: 'Sekrup Gypsum 6x1 Inch',
      unit: 'BOX',
      defaultPrice: '52000',
      tierPrices: { '5': '50000', '10': '48500', '20': '47000', '40': '45000' },
    },
    {
      id: 'sample-cat-5',
      name: 'Engsel Pintu Stainless 4 Inch',
      unit: 'PCS',
      defaultPrice: '38000',
      tierPrices: { '5': '36500', '10': '35500', '20': '34000', '40': '32500' },
    },
    {
      id: 'sample-cat-6',
      name: 'Besi Beton Ulir 10mm x 12m',
      unit: 'BTG',
      defaultPrice: '84000',
      tierPrices: { '5': '82000', '10': '80500', '20': '79000', '40': '77000' },
    },
    {
      id: 'sample-cat-7',
      name: 'Besi Beton Polos 12mm x 12m',
      unit: 'BTG',
      defaultPrice: '112000',
      tierPrices: { '5': '109000', '10': '107000', '20': '105000', '40': '102000' },
    },
  ];
}

export function createSampleInvoice(now: Date = new Date()): InvoiceData {
  const sampleCatalog = createSampleCatalog();
  return {
    id: 'sample-proforma',
    documentTitle: 'PROFORMA INVOICE',
    invoiceNumber: 'PI/2026/11/0042',
    dateText: formatTodayPlaceDate('Jember', now),
    district: 'SUMBERSARI',
    creatorColor: DEFAULT_CREATOR_COLOR,
    recipientHeading: 'Kepada Yth.',
    recipientDetails: 'TB. SUMBER MAKMUR',
    priceCode: 'AUTO',
    items: [
      {
        id: 'sample-1',
        name: sampleCatalog[0].name,
        unit: sampleCatalog[0].unit,
        qty: '50',
        price: sampleCatalog[0].defaultPrice ?? '',
        tierPrices: sampleCatalog[0].tierPrices,
      },
      {
        id: 'sample-2',
        name: sampleCatalog[1].name,
        unit: sampleCatalog[1].unit,
        qty: '20',
        price: sampleCatalog[1].defaultPrice ?? '',
        tierPrices: sampleCatalog[1].tierPrices,
      },
      {
        id: 'sample-3',
        name: sampleCatalog[2].name,
        unit: sampleCatalog[2].unit,
        qty: '25',
        price: sampleCatalog[2].defaultPrice ?? '',
        tierPrices: sampleCatalog[2].tierPrices,
      },
      {
        id: 'sample-4',
        name: sampleCatalog[3].name,
        unit: sampleCatalog[3].unit,
        qty: '10',
        price: sampleCatalog[3].defaultPrice ?? '',
        tierPrices: sampleCatalog[3].tierPrices,
      },
      {
        id: 'sample-5',
        name: sampleCatalog[4].name,
        unit: sampleCatalog[4].unit,
        qty: '12',
        price: sampleCatalog[4].defaultPrice ?? '',
        tierPrices: sampleCatalog[4].tierPrices,
      },
    ],
    subtotalLabel: 'HARGA NORMAL',
    totalLabel: 'TOTAL',
    attentionTitle: 'PERHATIAN :',
    attentionLines: createDefaultAttentionLines(),
    signatureGreeting: 'Hormat Kami,',
    signatureName: '( Bagian Administrasi )',
    displayOptions: {
      showRowDividers: false,
      showInvoiceNumber: false,
    },
  };
}

export function parseNumericInput(raw: string | number): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : 0;
  }
  const trimmed = raw.trim();
  if (!trimmed) return 0;

  const cleaned = trimmed.replace(/rp/gi, '').replace(/\s+/g, '');

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  if (/^\d+,\d+$/.test(cleaned)) {
    const parsed = Number(cleaned.replace(',', '.'));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  }

  const digitsOnly = cleaned.replace(/[^0-9.]/g, '');
  if (!digitsOnly) return 0;
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function formatRupiahNumber(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    return '-';
  }
  const rounded = Math.round(amount);
  return rounded.toLocaleString('id-ID');
}

export function formatQtyDisplay(rawQty: string): string {
  const trimmed = rawQty.trim();
  if (!trimmed) return '';
  const num = parseNumericInput(trimmed);
  if (num === 0) return '';
  return Number.isInteger(num)
    ? num.toLocaleString('id-ID')
    : num.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

export interface ResolvedItemPricing {
  normalUnitPrice: number;
  tierUnitPrice: number;
  sheetDisplayUnitPrice: number;
  sheetDisplayLineTotal: number;
  normalLineTotal: number;
  tierLineTotal: number;
  hasAnyPrice: boolean;
}

export function findCatalogMatch(
  itemName: string,
  catalog: CatalogProduct[],
): CatalogProduct | undefined {
  const norm = normalizeProductName(itemName);
  if (!norm) return undefined;
  return catalog.find((p) => normalizeProductName(p.name) === norm);
}

function normalizeForTokenSearch(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getSearchTokens(query: string): string[] {
  const normalized = normalizeForTokenSearch(query);
  if (!normalized) return [];
  return normalized.split(' ').filter(Boolean);
}

function splitAlphaNumericQueryTokens(tokens: string[]): string[] {
  const result: string[] = [];
  for (const token of tokens) {
    const parts = token.match(/[a-z]+|\d+/g);
    if (parts && parts.length > 0) {
      result.push(...parts);
    } else {
      result.push(token);
    }
  }
  return result;
}

function scoreCatalogProduct(
  product: CatalogProduct,
  tokens: string[],
  rawNormQuery: string,
  includeUnit: boolean,
): number {
  const normName = normalizeForTokenSearch(product.name);
  const normUnit = normalizeForTokenSearch(product.unit);
  const haystack = includeUnit ? `${normName} ${normUnit}` : normName;

  for (const token of tokens) {
    if (!haystack.includes(token)) {
      return -1;
    }
  }

  let score = 0;
  if (normName === rawNormQuery) score += 1000;
  else if (normName.startsWith(rawNormQuery)) score += 500;
  else if (normName.includes(rawNormQuery)) score += 250;

  let allTokensInName = true;
  let lastMatchedIdx = -1;
  let inOrder = true;

  for (const token of tokens) {
    const idx = normName.indexOf(token);
    if (idx === -1) {
      allTokensInName = false;
      continue;
    }
    if (idx < lastMatchedIdx) {
      inOrder = false;
    }
    lastMatchedIdx = idx;

    const escaped = escapeRegExp(token);
    if (new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(normName)) {
      score += 60;
    } else if (/^\d+$/.test(token) && new RegExp(`(?:^|\\s)${escaped}(?=\\D|$)`).test(normName)) {
      // Prioritize "10" or "10mm" over "100" when searching numeric sizes like "besi 10"
      score += 48;
    } else if (new RegExp(`(?:^|\\s)${escaped}`).test(normName)) {
      score += 35;
    } else {
      score += 15;
    }
  }

  if (allTokensInName) score += 120;
  if (inOrder && tokens.length > 1) score += 30;
  return score;
}

export function searchCatalogProducts(
  catalog: CatalogProduct[],
  query: string,
  options: { includeUnit?: boolean; limit?: number } = {},
): CatalogProduct[] {
  const { includeUnit = true, limit } = options;
  const rawNormQuery = normalizeForTokenSearch(query);
  if (!rawNormQuery) {
    return typeof limit === 'number' ? catalog.slice(0, limit) : catalog;
  }

  const runSearch = (tokens: string[]) => {
    const scored: Array<{ product: CatalogProduct; score: number; index: number }> = [];
    catalog.forEach((product, index) => {
      const score = scoreCatalogProduct(product, tokens, rawNormQuery, includeUnit);
      if (score >= 0) {
        scored.push({ product, score, index });
      }
    });
    scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.index - b.index));
    const items = scored.map((entry) => entry.product);
    return typeof limit === 'number' ? items.slice(0, limit) : items;
  };

  const primaryTokens = getSearchTokens(query);
  const primaryMatches = runSearch(primaryTokens);
  if (primaryMatches.length > 0) {
    return primaryMatches;
  }

  // Fallback for joined inputs like "besi10" -> ["besi", "10"]
  const splitTokens = splitAlphaNumericQueryTokens(primaryTokens);
  if (splitTokens.length > primaryTokens.length) {
    return runSearch(splitTokens);
  }

  return [];
}

/**
 * Resolves the effective concrete tier ('', '5', '10', '20', '40', 'TB') for an invoice.
 * If priceCode is 'AUTO', checks the normal subtotal against thresholds 5jt / 10jt / 20jt / 40jt.
 */
export function resolveEffectivePriceCode(
  data: Pick<InvoiceData, 'items' | 'priceCode'>,
  catalog: CatalogProduct[] = [],
): '' | '5' | '10' | '20' | '40' | 'TB' {
  const rawCode = data.priceCode ?? '';
  if (rawCode !== 'AUTO') {
    return rawCode;
  }

  let normalTotal = 0;
  for (const item of data.items) {
    const match = findCatalogMatch(item.name, catalog);
    const unitPrice = item.price.trim()
      ? parseNumericInput(item.price)
      : parseNumericInput(match?.defaultPrice ?? '');
    const qty = parseNumericInput(item.qty);
    if (qty > 0 && unitPrice > 0) {
      normalTotal += Math.round(qty * unitPrice);
    }
  }

  return resolveAutoTierFromTotal(normalTotal);
}

export function resolveItemPricing(
  item: InvoiceItem,
  effectiveCode: '' | '5' | '10' | '20' | '40' | 'TB',
  catalog: CatalogProduct[] = [],
): ResolvedItemPricing {
  const catalogMatch = findCatalogMatch(item.name, catalog);

  const manualOrCatalogPrice = item.price.trim()
    ? parseNumericInput(item.price)
    : parseNumericInput(catalogMatch?.defaultPrice ?? '');

  const mergedTierPrices = {
    ...(catalogMatch?.tierPrices ?? {}),
    ...(item.tierPrices ?? {}),
  };

  const tierKey: '5' | '10' | '20' | '40' | null =
    effectiveCode === 'TB' ? '40' : effectiveCode || null;

  const rawTierPrice = tierKey ? mergedTierPrices[tierKey] : undefined;
  const parsedTierPrice = rawTierPrice ? parseNumericInput(rawTierPrice) : 0;
  const effectiveTierUnitPrice = parsedTierPrice > 0 ? parsedTierPrice : manualOrCatalogPrice;

  const qty = parseNumericInput(item.qty);
  const normalLineTotal =
    qty > 0 && manualOrCatalogPrice > 0 ? Math.round(qty * manualOrCatalogPrice) : 0;
  const tierLineTotal =
    qty > 0 && effectiveTierUnitPrice > 0 ? Math.round(qty * effectiveTierUnitPrice) : 0;

  const sheetDisplayUnitPrice = effectiveTierUnitPrice;
  const sheetDisplayLineTotal = tierLineTotal;

  const hasAnyPrice =
    item.price.trim() !== '' ||
    parsedTierPrice > 0 ||
    (manualOrCatalogPrice > 0 && Boolean(catalogMatch));

  return {
    normalUnitPrice: manualOrCatalogPrice,
    tierUnitPrice: effectiveTierUnitPrice,
    sheetDisplayUnitPrice,
    sheetDisplayLineTotal,
    normalLineTotal,
    tierLineTotal,
    hasAnyPrice,
  };
}

export interface ResolvedInvoiceSummary {
  effectiveCode: '' | '5' | '10' | '20' | '40' | 'TB';
  showNormalRow: boolean;
  normalTotal: number;
  grandTotal: number;
}

export function resolveInvoiceSummary(
  data: Pick<InvoiceData, 'items' | 'priceCode'>,
  catalog: CatalogProduct[] = [],
): ResolvedInvoiceSummary {
  const effectiveCode = resolveEffectivePriceCode(data, catalog);
  let normalTotal = 0;
  let grandTotal = 0;

  for (const item of data.items) {
    const resolved = resolveItemPricing(item, effectiveCode, catalog);
    normalTotal += resolved.normalLineTotal;
    grandTotal += resolved.tierLineTotal;
  }

  const hasDiscount =
    effectiveCode !== '' &&
    effectiveCode !== 'TB' &&
    normalTotal > 0 &&
    grandTotal < normalTotal;

  return {
    effectiveCode,
    showNormalRow: hasDiscount,
    normalTotal,
    grandTotal,
  };
}

export function calculateLineTotal(item: Pick<InvoiceItem, 'qty' | 'price'>): number {
  const qty = parseNumericInput(item.qty);
  const price = parseNumericInput(item.price);
  if (qty <= 0 || price <= 0) return 0;
  return Math.round(qty * price);
}

export function calculateInvoiceSubtotal(items: InvoiceItem[]): number {
  return items.reduce((sum, item) => sum + calculateLineTotal(item), 0);
}

export function calculateInvoiceTotal(items: InvoiceItem[]): number {
  return calculateInvoiceSubtotal(items);
}

export function formatLocationDate(city: string, dateText: string): string {
  const c = city.trim();
  const d = dateText.trim();
  if (c && d) return `${c}, ${d}`;
  return c || d || '';
}

export function formatDistrictAddress(district: string): string {
  const trimmed = district.trim().toUpperCase();
  if (!trimmed) return '';
  if (/^KEC(\.|AMATAN)?\b/.test(trimmed)) {
    return trimmed;
  }
  return `KEC. ${trimmed}`;
}

export function buildRecipientDisplayText(recipientDetails: string, district: string): string {
  const details = recipientDetails.trim().toUpperCase();
  const districtLine = formatDistrictAddress(district);
  return [details, districtLine].filter(Boolean).join('\n');
}

export function buildInvoiceSummaryLabel(data: InvoiceData): string {
  const firstRecipientLine = data.recipientDetails
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);
  const districtLine = formatDistrictAddress(data.district ?? '');
  const firstItemName = data.items.map((item) => item.name.trim()).find(Boolean);
  if (firstRecipientLine) return firstRecipientLine;
  if (districtLine) return districtLine;
  if (firstItemName) return firstItemName;
  return data.dateText.trim() || 'Proforma Invoice';
}

export interface HistoryRecordEntry {
  id: string;
  savedAt: string;
  label: string;
  total: number;
  data: InvoiceData;
}

export function upsertHistoryRecord<T extends HistoryRecordEntry = HistoryRecordEntry>(
  records: T[],
  existingId: string | null,
  payload: Omit<T, 'id'>,
): { records: T[]; savedId: string } {
  if (existingId && records.some((rec) => rec.id === existingId)) {
    return {
      savedId: existingId,
      records: records.map((rec) => (rec.id === existingId ? ({ ...payload, id: existingId } as T) : rec)),
    };
  }
  const newId = `inv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const nextRecord = { ...payload, id: newId } as T;
  return {
    savedId: newId,
    records: [nextRecord, ...records],
  };
}

export const REQUIRED_RECIPIENT_NAME_NOTIFICATION =
  'Kolom nama wajib diisi! Tanyakan nama dengan menggunakan /tanya di WA.';

export function isRecipientNameValid(data: Pick<InvoiceData, 'recipientDetails'>): boolean {
  return data.recipientDetails.trim().length > 0;
}

export function hasInvoiceContent(data: InvoiceData): boolean {
  const hasItems = data.items.some((item) => !isInvoiceItemEmpty(item));
  const hasRecipient = Boolean(data.recipientDetails.trim());
  const hasDistrict = Boolean((data.district ?? '').trim());
  const hasNumber = Boolean(data.displayOptions.showInvoiceNumber && data.invoiceNumber.trim());
  return hasItems || hasRecipient || hasDistrict || hasNumber;
}

export function finalizeInvoiceToHistory(
  records: HistoryRecordEntry[],
  existingId: string | null,
  invoice: InvoiceData,
  grandTotal: number,
  now: Date = new Date(),
): {
  records: HistoryRecordEntry[];
  savedId: string | null;
  nextInvoice: InvoiceData;
  nextEditingHistoryId: string | null;
} {
  let nextRecords = records;
  let savedId: string | null = existingId;

  if (hasInvoiceContent(invoice)) {
    const res = upsertHistoryRecord(records, existingId, {
      savedAt: now.toISOString(),
      label: buildInvoiceSummaryLabel(invoice),
      total: grandTotal,
      data: invoice,
    });
    nextRecords = res.records;
    savedId = res.savedId;
  }

  return {
    records: nextRecords,
    savedId,
    nextInvoice: createDefaultInvoice(now, invoice.creatorColor || DEFAULT_CREATOR_COLOR),
    nextEditingHistoryId: null,
  };
}
