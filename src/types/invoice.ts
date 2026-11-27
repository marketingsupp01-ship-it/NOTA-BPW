export type AllowedUnit = 'KG' | 'BTG' | 'LBR' | 'BOX' | 'PCS';

export type PriceTierCode = '' | 'AUTO' | '5' | '10' | '20' | '40' | 'TB';

export interface TierPriceMap {
  '5'?: string;
  '10'?: string;
  '20'?: string;
  '40'?: string;
}

export interface CatalogProduct {
  id: string;
  name: string;
  unit: AllowedUnit;
  defaultPrice?: string;
  tierPrices?: TierPriceMap;
}

export interface InvoiceItem {
  id: string;
  name: string;
  unit: AllowedUnit | '';
  qty: string;
  price: string;
  tierPrices?: TierPriceMap;
}

export interface AttentionLine {
  id: string;
  prefix: string;
  boldPart: string;
  suffix: string;
}

export interface InvoiceDisplayOptions {
  showRowDividers: boolean;
  showInvoiceNumber: boolean;
}

export interface InvoiceData {
  id: string;
  documentTitle: string;
  invoiceNumber: string;
  dateText: string;
  district: string;
  city?: string;
  creatorColor?: string;
  recipientHeading: string;
  recipientDetails: string;
  priceCode: PriceTierCode;
  items: InvoiceItem[];
  subtotalLabel: string;
  totalLabel: string;
  attentionTitle: string;
  attentionLines: AttentionLine[];
  signatureGreeting: string;
  signatureName: string;
  displayOptions: InvoiceDisplayOptions;
}

export interface SavedInvoiceRecord {
  id: string;
  savedAt: string;
  label: string;
  total: number;
  data: InvoiceData;
}
