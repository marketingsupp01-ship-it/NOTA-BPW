import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveUserDisplayLabel,
  mergeSharedAndLocalHistory,
  sanitizeInvoiceDataForFirestore,
  toSafeInvoiceDocId,
} from './sharedHistoryHelpers';
import { createSampleInvoice } from './invoiceLogic';

test('toSafeInvoiceDocId sanitizes unsafe characters and enforces length limit', () => {
  assert.equal(toSafeInvoiceDocId('nota-123/abc def'), 'nota-123-abc-def');
  assert.equal(toSafeInvoiceDocId('x'.repeat(200)).length, 128);
});

test('deriveUserDisplayLabel prefers displayName and falls back to non-PII email prefix', () => {
  assert.equal(deriveUserDisplayLabel('Vani Andriana', 'vaniandriana.ch@gmail.com'), 'Vani Andriana');
  assert.equal(deriveUserDisplayLabel('', 'marketingsupp01@gmail.com'), 'marketingsupp01');
  assert.equal(deriveUserDisplayLabel(null, null), 'Pengguna');
});

test('sanitizeInvoiceDataForFirestore strips undefined values and preserves required structure', () => {
  const sample = createSampleInvoice();
  sample.items[0].tierPrices = { '5': '76000', '10': undefined };
  const sanitized = sanitizeInvoiceDataForFirestore(sample);
  assert.equal(sanitized.city, undefined);
  assert.equal('city' in sanitized, false);
  assert.deepEqual(sanitized.items[0].tierPrices, { '5': '76000' });
  assert.equal(typeof sanitized.displayOptions.showInvoiceNumber, 'boolean');
});

test('mergeSharedAndLocalHistory prioritizes remote records and sorts newest first', () => {
  const baseData = createSampleInvoice();
  const merged = mergeSharedAndLocalHistory(
    [
      {
        id: 'nota-1',
        savedAt: '2026-11-28T03:00:00.000Z',
        label: 'TB. REMOTE',
        total: 200000,
        updatedByLabel: 'vaniandriana.ch',
        data: baseData,
      },
    ],
    [
      {
        id: 'nota-1',
        savedAt: '2026-11-28T01:00:00.000Z',
        label: 'TB. LOCAL OLD',
        total: 100000,
        data: baseData,
      },
      {
        id: 'nota-2',
        savedAt: '2026-11-28T04:00:00.000Z',
        label: 'TB. LOCAL NEW',
        total: 300000,
        data: baseData,
      },
    ],
  );

  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'nota-2');
  assert.equal(merged[1].label, 'TB. REMOTE');
  assert.equal(merged[1].updatedByLabel, 'vaniandriana.ch');
});
