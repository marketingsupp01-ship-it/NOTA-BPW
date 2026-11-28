import type { InvoiceData, SavedInvoiceRecord } from '../types/invoice';
import { DEFAULT_CREATOR_COLOR, normalizePriceCode } from './invoiceLogic';

export const SHARED_WORKSPACE_KEY = 'shared_team';

export function toSafeInvoiceDocId(rawId: string): string {
  const cleaned = rawId
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 128);
  return cleaned || `inv-${Date.now()}`;
}

export function deriveUserDisplayLabel(
  displayName?: string | null,
  email?: string | null,
): string {
  const name = displayName?.trim();
  if (name) return name.slice(0, 120);
  const rawEmail = email?.trim();
  if (rawEmail) {
    const prefix = rawEmail.split('@')[0]?.trim();
    if (prefix) return prefix.slice(0, 120);
  }
  return 'Pengguna';
}

function clampStr(val: unknown, maxLen: number): string {
  return String(val ?? '').slice(0, maxLen);
}

/**
 * Produces a Firestore-safe plain map adhering strictly to firebase-blueprint.json
 * and firestore.rules volumetric & key constraints (no undefined values).
 */
export function sanitizeInvoiceDataForFirestore(data: InvoiceData): InvoiceData {
  const safeId = toSafeInvoiceDocId(data.id);
  const safeItems = (Array.isArray(data.items) && data.items.length > 0 ? data.items : [
    { id: 'item-1', name: '', unit: '' as const, qty: '', price: '' },
  ])
    .slice(0, 200)
    .map((item, idx) => {
      const cleanItem: InvoiceData['items'][number] = {
        id: clampStr(item.id || `item-${idx + 1}`, 128),
        name: clampStr(item.name, 200),
        unit: item.unit || '',
        qty: clampStr(item.qty, 40),
        price: clampStr(item.price, 40),
      };
      if (item.tierPrices && typeof item.tierPrices === 'object') {
        const tiers: NonNullable<InvoiceData['items'][number]['tierPrices']> = {};
        if (item.tierPrices['5']) tiers['5'] = clampStr(item.tierPrices['5'], 40);
        if (item.tierPrices['10']) tiers['10'] = clampStr(item.tierPrices['10'], 40);
        if (item.tierPrices['20']) tiers['20'] = clampStr(item.tierPrices['20'], 40);
        if (item.tierPrices['40']) tiers['40'] = clampStr(item.tierPrices['40'], 40);
        if (Object.keys(tiers).length > 0) {
          cleanItem.tierPrices = tiers;
        }
      }
      return cleanItem;
    });

  const safeAttentionLines = (Array.isArray(data.attentionLines) ? data.attentionLines : [])
    .slice(0, 10)
    .map((line, idx) => ({
      id: clampStr(line.id || `att-${idx + 1}`, 128),
      prefix: clampStr(line.prefix, 300),
      boldPart: clampStr(line.boldPart, 300),
      suffix: clampStr(line.suffix, 300),
    }));

  const sanitized: InvoiceData = {
    id: safeId,
    documentTitle: clampStr(data.documentTitle, 120),
    invoiceNumber: clampStr(data.invoiceNumber, 120),
    dateText: clampStr(data.dateText, 120),
    district: clampStr(data.district, 120),
    creatorColor: clampStr(data.creatorColor || DEFAULT_CREATOR_COLOR, 24),
    recipientHeading: clampStr(data.recipientHeading, 120),
    recipientDetails: clampStr(data.recipientDetails, 500),
    priceCode: normalizePriceCode(String(data.priceCode ?? 'AUTO')),
    items: safeItems,
    subtotalLabel: clampStr(data.subtotalLabel || 'HARGA NORMAL', 120),
    totalLabel: clampStr(data.totalLabel || 'TOTAL', 120),
    attentionTitle: clampStr(data.attentionTitle, 120),
    attentionLines: safeAttentionLines,
    signatureGreeting: clampStr(data.signatureGreeting, 120),
    signatureName: clampStr(data.signatureName, 120),
    displayOptions: {
      showRowDividers: Boolean(data.displayOptions?.showRowDividers),
      showInvoiceNumber: Boolean(data.displayOptions?.showInvoiceNumber),
    },
  };

  if (typeof data.city === 'string' && data.city.trim()) {
    sanitized.city = clampStr(data.city, 120);
  }

  return sanitized;
}

export function mergeSharedAndLocalHistory(
  remoteRecords: SavedInvoiceRecord[],
  localRecords: SavedInvoiceRecord[],
): SavedInvoiceRecord[] {
  const byId = new Map<string, SavedInvoiceRecord>();
  for (const rec of localRecords) {
    byId.set(toSafeInvoiceDocId(rec.id), {
      ...rec,
      id: toSafeInvoiceDocId(rec.id),
    });
  }
  for (const rec of remoteRecords) {
    byId.set(toSafeInvoiceDocId(rec.id), {
      ...rec,
      id: toSafeInvoiceDocId(rec.id),
    });
  }
  return Array.from(byId.values())
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .slice(0, 100);
}
