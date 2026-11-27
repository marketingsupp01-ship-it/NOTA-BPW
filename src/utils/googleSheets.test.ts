import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBatchGetUrl,
  extractSpreadsheetId,
  mapBatchGetResponseToCatalog,
} from './googleSheets';

test('extractSpreadsheetId parses full Google Sheets URLs and raw IDs', () => {
  assert.equal(
    extractSpreadsheetId(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0',
    ),
    '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  );
  assert.equal(
    extractSpreadsheetId('  1AbC_dEfG-hIjKlMnOpQrStUvWxYz123456  '),
    '1AbC_dEfG-hIjKlMnOpQrStUvWxYz123456',
  );
  assert.equal(extractSpreadsheetId(''), null);
  assert.equal(extractSpreadsheetId('https://example.com/not-a-sheet'), null);
});

test('buildBatchGetUrl encodes ranges with UNFORMATTED_VALUE for multi-sheet tabs', () => {
  const url = buildBatchGetUrl('sheet-id-1234567890', ['satuan', 'katalog', "5'jt"]);
  const parsed = new URL(url);
  assert.equal(
    `${parsed.origin}${parsed.pathname}`,
    'https://sheets.googleapis.com/v4/spreadsheets/sheet-id-1234567890/values:batchGet',
  );
  assert.equal(parsed.searchParams.get('valueRenderOption'), 'UNFORMATTED_VALUE');
  assert.deepEqual(parsed.searchParams.getAll('ranges'), [
    "'satuan'!A:Z",
    "'katalog'!A:Z",
    "'5''jt'!A:Z",
  ]);
});

test('mapBatchGetResponseToCatalog merges 6-sheet Google Sheets data into CatalogProduct[]', () => {
  const result = mapBatchGetResponseToCatalog(
    'sheet-id-1234567890',
    'Database Harga Toko Bangunan',
    ['satuan', 'katalog', '5jt', '10jt', '20jt', '40jt'],
    [
      {
        values: [
          ['NAMA BARANG', 'SATUAN'],
          ['Besi Beton Polos 10mm', 'BTG'],
          ['Besi Beton Ulir 10mm', 'BTG'],
        ],
      },
      {
        values: [
          ['NAMA BARANG', 'HARGA'],
          ['Besi Beton Polos 10mm', 79000],
          ['Besi Beton Ulir 10mm', 85000],
        ],
      },
      {
        values: [
          ['NAMA BARANG', 'HARGA'],
          ['Besi Beton Polos 10mm', 77000],
          ['Besi Beton Ulir 10mm', 83000],
        ],
      },
      {
        values: [
          ['NAMA BARANG', 'HARGA'],
          ['Besi Beton Polos 10mm', 75500],
        ],
      },
      {
        values: [
          ['NAMA BARANG', 'HARGA'],
          ['Besi Beton Polos 10mm', 74000],
        ],
      },
      {
        values: [
          ['NAMA BARANG', 'HARGA'],
          ['Besi Beton Polos 10mm', 72000],
        ],
      },
    ],
  );

  assert.equal(result.spreadsheetTitle, 'Database Harga Toko Bangunan');
  assert.equal(result.importResult.products.length, 2);
  assert.deepEqual(result.importResult.detectedSheets, [
    'satuan',
    'katalog',
    '5jt',
    '10jt',
    '20jt',
    '40jt',
  ]);
  assert.equal(result.importResult.products[0].unit, 'BTG');
  assert.equal(result.importResult.products[0].defaultPrice, '79000');
  assert.deepEqual(result.importResult.products[0].tierPrices, {
    '5': '77000',
    '10': '75500',
    '20': '74000',
    '40': '72000',
  });
  assert.equal(result.importResult.products[1].name, 'Besi Beton Ulir 10mm');
  assert.equal(result.importResult.products[1].defaultPrice, '85000');
});
