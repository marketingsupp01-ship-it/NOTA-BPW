import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_UNITS,
  CREATOR_COLOR_PRESETS,
  DEFAULT_CREATOR_COLOR,
  type HistoryRecordEntry,
  buildInvoiceSummaryLabel,
  buildRecipientDisplayText,
  calculateInvoiceSubtotal,
  calculateInvoiceTotal,
  calculateLineTotal,
  commitItemToList,
  createDefaultInvoice,
  createEmptyItem,
  createSampleCatalog,
  createSampleInvoice,
  finalizeInvoiceToHistory,
  formatDistrictAddress,
  formatIndonesianDate,
  formatLocationDate,
  formatQtyDisplay,
  formatRupiahNumber,
  formatTodayPlaceDate,
  getSearchTokens,
  hasInvoiceContent,
  normalizeAllowedUnit,
  normalizePriceCode,
  parseNumericInput,
  removeItemFromList,
  resolveAutoTierFromTotal,
  resolveInvoiceSummary,
  resolveItemPricing,
  searchCatalogProducts,
  syncDateTextToToday,
  upsertHistoryRecord,
} from './invoiceLogic';
import { parseCatalogRows, parseWorkbookSheets } from './catalogExcel';

test('createDefaultInvoice initializes date automatically to today and matches reference defaults', () => {
  const fixedNow = new Date(2026, 10, 17);
  const invFixed = createDefaultInvoice(fixedNow);
  assert.equal(invFixed.documentTitle, 'PROFORMA INVOICE');
  assert.equal(invFixed.dateText, 'Jember, 17 November 2026');
  assert.equal(invFixed.district, '');
  assert.equal(invFixed.creatorColor, DEFAULT_CREATOR_COLOR);
  assert.ok(CREATOR_COLOR_PRESETS.length >= 6);
  assert.equal(invFixed.recipientHeading, 'Kepada Yth.');
  assert.equal(invFixed.priceCode, 'AUTO');
  assert.equal(invFixed.subtotalLabel, 'HARGA NORMAL');
  assert.equal(invFixed.items.length, 1);
  assert.equal(invFixed.items[0].name, '');
  assert.equal(invFixed.totalLabel, 'TOTAL');
  assert.equal(invFixed.attentionTitle, 'PERHATIAN :');
  assert.equal(invFixed.attentionLines.length, 3);
  assert.equal(invFixed.attentionLines[1].boldPart, 'mohon tanda tangan Surat Jalan dan kembalikan ke supir');
  assert.equal(invFixed.signatureGreeting, 'Hormat Kami,');
  assert.equal(calculateInvoiceTotal(invFixed.items), 0);
  assert.equal(formatRupiahNumber(calculateInvoiceTotal(invFixed.items)), '-');

  const invToday = createDefaultInvoice();
  assert.equal(invToday.dateText, formatTodayPlaceDate('Jember', new Date()));
  assert.equal(syncDateTextToToday('Surabaya, 1 Januari 2024', fixedNow), 'Surabaya, 17 November 2026');
  assert.equal(syncDateTextToToday('', fixedNow), 'Jember, 17 November 2026');
});

test('ALLOWED_UNITS contains strictly KG, BTG, LBR, BOX, PCS', () => {
  assert.deepEqual([...ALLOWED_UNITS], ['KG', 'BTG', 'LBR', 'BOX', 'PCS']);
  assert.equal(normalizeAllowedUnit('kg'), 'KG');
  assert.equal(normalizeAllowedUnit('Batang'), 'BTG');
  assert.equal(normalizeAllowedUnit('lbr.'), 'LBR');
  assert.equal(normalizeAllowedUnit('box'), 'BOX');
  assert.equal(normalizeAllowedUnit('Pcs'), 'PCS');
  assert.equal(normalizeAllowedUnit('Sak'), '');
});

test('normalizePriceCode normalizes AUTO, 5, 10, 20, 40, TB and aliases', () => {
  assert.equal(normalizePriceCode(''), '');
  assert.equal(normalizePriceCode('auto'), 'AUTO');
  assert.equal(normalizePriceCode('otomatis'), 'AUTO');
  assert.equal(normalizePriceCode('5'), '5');
  assert.equal(normalizePriceCode('5jt'), '5');
  assert.equal(normalizePriceCode('10'), '10');
  assert.equal(normalizePriceCode('20'), '20');
  assert.equal(normalizePriceCode('40jt'), '40');
  assert.equal(normalizePriceCode('tb'), 'TB');
  assert.equal(normalizePriceCode('TB'), 'TB');
});

test('resolveAutoTierFromTotal triggers 5jt, 10jt, 20jt, and 40jt at exact thresholds', () => {
  assert.equal(resolveAutoTierFromTotal(0), '');
  assert.equal(resolveAutoTierFromTotal(4_999_999), '');
  assert.equal(resolveAutoTierFromTotal(5_000_000), '5');
  assert.equal(resolveAutoTierFromTotal(9_999_999), '5');
  assert.equal(resolveAutoTierFromTotal(10_000_000), '10');
  assert.equal(resolveAutoTierFromTotal(19_999_999), '10');
  assert.equal(resolveAutoTierFromTotal(20_000_000), '20');
  assert.equal(resolveAutoTierFromTotal(39_999_999), '20');
  assert.equal(resolveAutoTierFromTotal(40_000_000), '40');
  assert.equal(resolveAutoTierFromTotal(120_000_000), '40');
});

test('AUTO mode dynamically updates discount tier when normal subtotal crosses thresholds', () => {
  const catalog = createSampleCatalog();
  // Besi Beton: Katalog=78.000, 5jt=76.000, 10jt=74.500, 20jt=73.000, 40jt=71.000
  const makeRow = (qty: string) => ({
    id: 'auto-1',
    name: catalog[0].name,
    unit: catalog[0].unit,
    qty,
    price: '78000',
    tierPrices: catalog[0].tierPrices,
  });

  // 10 * 78.000 = 780.000 (< 5jt) -> Normal
  const sLow = resolveInvoiceSummary({ items: [makeRow('10')], priceCode: 'AUTO' }, catalog);
  assert.equal(sLow.effectiveCode, '');
  assert.equal(sLow.normalTotal, 780000);
  assert.equal(sLow.grandTotal, 780000);

  // 70 * 78.000 = 5.460.000 (>= 5jt, < 10jt) -> auto 5jt (70 * 76.000 = 5.320.000)
  const s5 = resolveInvoiceSummary({ items: [makeRow('70')], priceCode: 'AUTO' }, catalog);
  assert.equal(s5.effectiveCode, '5');
  assert.equal(s5.normalTotal, 5460000);
  assert.equal(s5.grandTotal, 5320000);

  // 130 * 78.000 = 10.140.000 (>= 10jt, < 20jt) -> auto 10jt (130 * 74.500 = 9.685.000)
  const s10 = resolveInvoiceSummary({ items: [makeRow('130')], priceCode: 'AUTO' }, catalog);
  assert.equal(s10.effectiveCode, '10');
  assert.equal(s10.normalTotal, 10140000);
  assert.equal(s10.grandTotal, 9685000);

  // 260 * 78.000 = 20.280.000 (>= 20jt, < 40jt) -> auto 20jt (260 * 73.000 = 18.980.000)
  const s20 = resolveInvoiceSummary({ items: [makeRow('260')], priceCode: 'AUTO' }, catalog);
  assert.equal(s20.effectiveCode, '20');
  assert.equal(s20.normalTotal, 20280000);
  assert.equal(s20.grandTotal, 18980000);

  // 520 * 78.000 = 40.560.000 (>= 40jt) -> auto 40jt (520 * 71.000 = 36.920.000)
  const s40 = resolveInvoiceSummary({ items: [makeRow('520')], priceCode: 'AUTO' }, catalog);
  assert.equal(s40.effectiveCode, '40');
  assert.equal(s40.normalTotal, 40560000);
  assert.equal(s40.grandTotal, 36920000);
});

test('resolveItemPricing & resolveInvoiceSummary display discounted prices on sheet for 5/10/20/40 and hide normal row on TB', () => {
  const catalog = createSampleCatalog();
  const item = {
    id: 'test-1',
    name: catalog[0].name,
    unit: catalog[0].unit,
    qty: '10',
    price: '78000',
    tierPrices: catalog[0].tierPrices,
  };

  const p5 = resolveItemPricing(item, '5', catalog);
  assert.equal(p5.sheetDisplayUnitPrice, 76000);
  assert.equal(p5.sheetDisplayLineTotal, 760000);
  assert.equal(p5.normalLineTotal, 780000);
  assert.equal(p5.tierLineTotal, 760000);
  const s5 = resolveInvoiceSummary({ items: [item], priceCode: '5' }, catalog);
  assert.equal(s5.showNormalRow, true);
  assert.equal(s5.normalTotal, 780000);
  assert.equal(s5.grandTotal, 760000);

  const p20 = resolveItemPricing(item, '20', catalog);
  assert.equal(p20.sheetDisplayUnitPrice, 73000);
  assert.equal(p20.sheetDisplayLineTotal, 730000);

  const pTB = resolveItemPricing(item, 'TB', catalog);
  assert.equal(pTB.sheetDisplayUnitPrice, 71000);
  assert.equal(pTB.sheetDisplayLineTotal, 710000);
  const sTB = resolveInvoiceSummary({ items: [item], priceCode: 'TB' }, catalog);
  assert.equal(sTB.showNormalRow, false);
  assert.equal(sTB.grandTotal, 710000);
});

test('parseWorkbookSheets merges satuan, katalog, 5jt, 10jt, 20jt, 40jt sheets accurately', () => {
  const result = parseWorkbookSheets([
    {
      sheetName: 'satuan',
      rows: [
        ['NAMA BARANG', 'SATUAN'],
        ['Besi Beton 10mm', 'btg'],
        ['Triplek 9mm', 'LBR'],
      ],
    },
    {
      sheetName: 'katalog',
      rows: [
        ['NO', 'NAMA BARANG', 'HARGA KATALOG'],
        [1, 'Besi Beton 10mm', 78000],
        [2, 'Triplek 9mm', 145000],
      ],
    },
    {
      sheetName: '5jt',
      rows: [
        ['NAMA BARANG', 'HARGA'],
        ['Besi Beton 10mm', 76000],
        ['Triplek 9mm', 142000],
      ],
    },
    {
      sheetName: '10jt',
      rows: [
        ['NAMA BARANG', 'HARGA'],
        ['Besi Beton 10mm', 74500],
        ['Triplek 9mm', 139000],
      ],
    },
    {
      sheetName: '20jt',
      rows: [
        ['NAMA BARANG', 'HARGA'],
        ['Besi Beton 10mm', 73000],
        ['Triplek 9mm', 136000],
      ],
    },
    {
      sheetName: '40jt',
      rows: [
        ['NAMA BARANG', 'HARGA'],
        ['Besi Beton 10mm', 71000],
        ['Triplek 9mm', 132000],
      ],
    },
  ]);

  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].name, 'Besi Beton 10mm');
  assert.equal(result.products[0].unit, 'BTG');
  assert.equal(result.products[0].defaultPrice, '78000');
  assert.deepEqual(result.products[0].tierPrices, {
    '5': '76000',
    '10': '74500',
    '20': '73000',
    '40': '71000',
  });
});

test('parseCatalogRows parses single-sheet rows and normalizes units', () => {
  const rows = [
    ['NAMA BARANG', 'SATUAN', 'HARGA'],
    ['Besi Beton 10mm', 'btg', '72.000'],
    ['Triplek 9mm', 'Lembar', 135000],
    ['', '', ''],
    ['Kawat Bendrat', 'kg', '24000'],
    ['Produk Custom', 'LITER', '15000'],
  ];
  const result = parseCatalogRows(rows);
  assert.equal(result.products.length, 4);
  assert.equal(result.products[0].unit, 'BTG');
  assert.equal(result.products[0].defaultPrice, '72000');
  assert.equal(result.products[1].unit, 'LBR');
  assert.equal(result.products[2].unit, 'KG');
  assert.equal(result.products[3].unit, 'PCS');
  assert.equal(result.invalidUnitCount, 1);
});

test('parseNumericInput and formatRupiahNumber handle Indonesian number formats', () => {
  assert.equal(parseNumericInput('1.500.000'), 1500000);
  assert.equal(parseNumericInput('Rp 250.000'), 250000);
  assert.equal(formatRupiahNumber(0), '-');
  assert.equal(formatRupiahNumber(1800000), '1.800.000');
});

test('line total and sample invoice auto-5jt totals compute accurately', () => {
  const sample = createSampleInvoice();
  // Normal (Katalog): 50*78000 + 20*145000 + 25*26000 + 10*52000 + 12*38000 = 8,426,000 (>= 5jt, < 10jt)
  // Auto selects 5jt: 50*76000 + 20*142000 + 25*25000 + 10*50000 + 12*36500
  // = 3,800,000 + 2,840,000 + 625,000 + 500,000 + 438,000 = 8,203,000
  assert.equal(calculateLineTotal(sample.items[0]), 3900000);
  assert.equal(calculateInvoiceSubtotal(sample.items), 8426000);
  const summary = resolveInvoiceSummary(sample);
  assert.equal(summary.effectiveCode, '5');
  assert.equal(summary.showNormalRow, true);
  assert.equal(summary.normalTotal, 8426000);
  assert.equal(summary.grandTotal, 8203000);
});

test('formatDistrictAddress, buildRecipientDisplayText, formatQtyDisplay, formatIndonesianDate, and buildInvoiceSummaryLabel', () => {
  assert.equal(formatQtyDisplay(''), '');
  assert.equal(formatQtyDisplay('10'), '10');
  assert.equal(formatLocationDate('Jember', '17 November 2026'), 'Jember, 17 November 2026');
  assert.equal(formatIndonesianDate(new Date(2026, 10, 17)), '17 November 2026');
  assert.equal(formatDistrictAddress(''), '');
  assert.equal(formatDistrictAddress('Sumbersari'), 'Kec. Sumbersari');
  assert.equal(formatDistrictAddress('Kec. Patrang'), 'Kec. Patrang');
  assert.equal(formatDistrictAddress('Kecamatan Kaliwates'), 'Kecamatan Kaliwates');
  assert.equal(buildRecipientDisplayText('', 'Patrang'), 'Kec. Patrang');
  assert.equal(
    buildRecipientDisplayText('TB. Sumber Makmur', 'Sumbersari'),
    'TB. Sumber Makmur\nKec. Sumbersari',
  );
  assert.equal(buildInvoiceSummaryLabel(createSampleInvoice()), 'TB. Sumber Makmur');
});

test('commitItemToList and removeItemFromList handle 1-row entry bar commits and edits cleanly', () => {
  const initial = [createEmptyItem('1')];
  const step1 = commitItemToList(
    initial,
    { name: 'Paku 5cm', unit: 'KG', qty: '5', price: '22000' },
    null,
  );
  assert.equal(step1.length, 1);
  assert.equal(step1[0].name, 'Paku 5cm');

  const step2 = commitItemToList(
    step1,
    { name: 'Besi Beton', unit: 'BTG', qty: '10', price: '78000' },
    null,
  );
  assert.equal(step2.length, 2);
  assert.equal(step2[1].name, 'Besi Beton');

  // Edit first item in place
  const step3 = commitItemToList(
    step2,
    { name: 'Paku 5cm', unit: 'KG', qty: '8', price: '22000' },
    step1[0].id,
  );
  assert.equal(step3.length, 2);
  assert.equal(step3[0].qty, '8');

  // Removing all items leaves a clean empty placeholder row
  const step4 = removeItemFromList(removeItemFromList(step3, step3[0].id), step3[1].id);
  assert.equal(step4.length, 1);
  assert.equal(step4[0].name, '');
});

test('upsertHistoryRecord updates existing saved nota in place without creating duplicates', () => {
  const inv1 = createDefaultInvoice(new Date(2026, 10, 17));
  inv1.recipientDetails = 'Toko A';

  const initialRecords: HistoryRecordEntry[] = [];
  const first = upsertHistoryRecord(initialRecords, null, {
    savedAt: '2026-11-17T01:00:00Z',
    label: 'Toko A',
    total: 500000,
    data: inv1,
  });
  assert.equal(first.records.length, 1);

  const inv2 = { ...inv1, district: 'Patrang' };
  const updated = upsertHistoryRecord(first.records, first.savedId, {
    savedAt: '2026-11-17T02:00:00Z',
    label: 'Toko A',
    total: 750000,
    data: inv2,
  });
  assert.equal(updated.records.length, 1);
  assert.equal(updated.savedId, first.savedId);
  assert.equal(updated.records[0].total, 750000);
  assert.equal(updated.records[0].data.district, 'Patrang');
});

test('searchCatalogProducts finds partial multi-token queries like "besi 10" and "10 ulir"', () => {
  const customCatalog = [
    { id: 'c1', name: 'Besi Beton Polos 12mm x 12m', unit: 'BTG' as const, defaultPrice: '112000' },
    { id: 'c2', name: 'Besi Siku 100x100mm', unit: 'BTG' as const, defaultPrice: '450000' },
    { id: 'c3', name: 'Besi Beton Polos 10mm x 12m', unit: 'BTG' as const, defaultPrice: '78000' },
    { id: 'c4', name: 'Besi Beton 10 Ulir', unit: 'BTG' as const, defaultPrice: '84000' },
    { id: 'c5', name: 'Paku Beton 10cm', unit: 'KG' as const, defaultPrice: '24000' },
  ];

  const matchBesi10 = searchCatalogProducts(customCatalog, 'besi 10');
  const namesBesi10 = matchBesi10.map((p) => p.name);
  assert.ok(namesBesi10.includes('Besi Beton Polos 10mm x 12m'));
  assert.ok(namesBesi10.includes('Besi Beton 10 Ulir'));
  assert.equal(namesBesi10.includes('Besi Beton Polos 12mm x 12m'), false);
  assert.equal(namesBesi10.includes('Paku Beton 10cm'), false);
  // Exact/10mm matches should rank ahead of 100x100mm
  assert.ok(namesBesi10.indexOf('Besi Beton 10 Ulir') < namesBesi10.indexOf('Besi Siku 100x100mm'));
  assert.ok(
    namesBesi10.indexOf('Besi Beton Polos 10mm x 12m') < namesBesi10.indexOf('Besi Siku 100x100mm'),
  );

  // Out-of-order / suffix keywords: "10 ulir" or "ulir 10"
  const match10Ulir = searchCatalogProducts(customCatalog, '10 ulir');
  assert.deepEqual(
    match10Ulir.map((p) => p.name),
    ['Besi Beton 10 Ulir'],
  );
  const matchUlir10 = searchCatalogProducts(customCatalog, 'ulir 10');
  assert.deepEqual(
    matchUlir10.map((p) => p.name),
    ['Besi Beton 10 Ulir'],
  );

  // Joined alphanumeric fallback: "besi10"
  const matchJoined = searchCatalogProducts(customCatalog, 'besi10');
  assert.ok(matchJoined.some((p) => p.name === 'Besi Beton Polos 10mm x 12m'));
  assert.ok(matchJoined.some((p) => p.name === 'Besi Beton 10 Ulir'));

  // Default sample catalog also returns both Polos 10 & Ulir 10 when searching "besi 10"
  const sampleMatches = searchCatalogProducts(createSampleCatalog(), 'besi 10');
  assert.deepEqual(
    sampleMatches.map((p) => p.name),
    ['Besi Beton Polos 10mm x 12m', 'Besi Beton Ulir 10mm x 12m'],
  );
});

test('finalizeInvoiceToHistory saves nota to history, updates edited history in place, and resets active nota', () => {
  const now = new Date(2026, 10, 17);
  const blank = createDefaultInvoice(now);
  assert.equal(hasInvoiceContent(blank), false);

  // Blank invoice resets cleanly without cluttering history
  const blankFinalize = finalizeInvoiceToHistory([], null, blank, 0, now);
  assert.equal(blankFinalize.records.length, 0);
  assert.equal(blankFinalize.nextEditingHistoryId, null);

  // Filled invoice saves to history and resets to a fresh empty nota
  const filled = createDefaultInvoice(now);
  filled.recipientDetails = 'TB. Sukses Makmur';
  filled.district = 'Patrang';
  filled.items = commitItemToList(filled.items, {
    name: 'Besi Beton Polos 10mm x 12m',
    unit: 'BTG',
    qty: '5',
    price: '78000',
  });
  assert.equal(hasInvoiceContent(filled), true);

  const step1 = finalizeInvoiceToHistory([], null, filled, 390000, now);
  assert.equal(step1.records.length, 1);
  assert.equal(step1.records[0].label, 'TB. Sukses Makmur');
  assert.equal(step1.records[0].total, 390000);
  assert.equal(step1.nextEditingHistoryId, null);
  assert.equal(hasInvoiceContent(step1.nextInvoice), false);
  assert.notEqual(step1.nextInvoice.id, filled.id);

  // Editing an existing history nota and finishing updates it in place (no duplicate)
  const edited = { ...filled, district: 'Sumbersari' };
  const step2 = finalizeInvoiceToHistory(step1.records, step1.savedId, edited, 450000, now);
  assert.equal(step2.records.length, 1);
  assert.equal(step2.records[0].id, step1.savedId);
  assert.equal(step2.records[0].data.district, 'Sumbersari');
  assert.equal(step2.records[0].total, 450000);
  assert.equal(step2.nextEditingHistoryId, null);
  assert.equal(hasInvoiceContent(step2.nextInvoice), false);
});
