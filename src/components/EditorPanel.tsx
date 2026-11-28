import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Check, CornerDownLeft, Database, Pencil, Trash2, X } from 'lucide-react';
import type {
  AllowedUnit,
  AttentionLine,
  CatalogProduct,
  InvoiceData,
  InvoiceItem,
  PriceTierCode,
  TierPriceMap,
} from '../types/invoice';
import {
  ALLOWED_UNITS,
  CREATOR_COLOR_PRESETS,
  DEFAULT_CREATOR_COLOR,
  PRICE_TIER_CODES,
  findCatalogMatch,
  formatRupiahNumber,
  formatTodayPlaceDate,
  getSearchTokens,
  isInvoiceItemEmpty,
  normalizePriceCode,
  parseNumericInput,
  resolveInvoiceSummary,
  resolveItemPricing,
  searchCatalogProducts,
  syncDateTextToToday,
} from '../utils/invoiceLogic';

function renderHighlightedProductName(name: string, query: string) {
  const tokens = Array.from(new Set(getSearchTokens(query))).sort((a, b) => b.length - a.length);
  if (tokens.length === 0) return name;
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escaped.join('|')})`, 'gi');
  const parts = name.split(regex);
  return parts.map((part, idx) =>
    tokens.some((t) => part.toLowerCase() === t) ? (
      <mark key={idx} className="bg-amber-100 text-slate-950 font-semibold rounded-xs px-0.5">
        {part}
      </mark>
    ) : (
      <span key={idx}>{part}</span>
    ),
  );
}

interface DraftItemState {
  name: string;
  unit: AllowedUnit | '';
  qty: string;
  price: string;
  tierPrices?: TierPriceMap;
}

const EMPTY_DRAFT: DraftItemState = {
  name: '',
  unit: '',
  qty: '',
  price: '',
  tierPrices: undefined,
};

interface EditorPanelProps {
  data: InvoiceData;
  catalog: CatalogProduct[];
  editingHistoryLabel?: string | null;
  onStartNewNota: () => void;
  onOpenCatalog: () => void;
  onChange: (next: InvoiceData) => void;
  onCommitItem: (draft: Omit<InvoiceItem, 'id'>, editingItemId: string | null) => void;
  onRemoveItem: (id: string) => void;
  onMoveItem: (index: number, direction: -1 | 1) => void;
  onUpdateAttention: (id: string, patch: Partial<AttentionLine>) => void;
}

export function EditorPanel({
  data,
  catalog,
  editingHistoryLabel = null,
  onStartNewNota,
  onOpenCatalog,
  onChange,
  onCommitItem,
  onRemoveItem,
  onMoveItem,
  onUpdateAttention,
}: EditorPanelProps) {
  const [draft, setDraft] = useState<DraftItemState>(EMPTY_DRAFT);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [codeInputText, setCodeInputText] = useState<string>(
    data.priceCode === 'AUTO' ? 'AUTO' : data.priceCode,
  );
  const nameInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const blurTimeoutRef = useRef<number | null>(null);

  const clearBlurTimeout = () => {
    if (blurTimeoutRef.current !== null) {
      window.clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
  };

  // Clear local draft whenever a completely different invoice record is loaded
  useEffect(() => {
    clearBlurTimeout();
    setDraft(EMPTY_DRAFT);
    setEditingItemId(null);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
  }, [data.id]);

  useEffect(() => () => clearBlurTimeout(), []);

  const summary = resolveInvoiceSummary(data, catalog);
  const activeCreatorColor = data.creatorColor || DEFAULT_CREATOR_COLOR;

  const effectiveCodeDisplay =
    normalizePriceCode(codeInputText) === data.priceCode
      ? codeInputText
      : data.priceCode === 'AUTO'
        ? 'AUTO'
        : data.priceCode;

  const handleUseTodayDate = () => {
    onChange({
      ...data,
      dateText: syncDateTextToToday(data.dateText),
    });
  };

  const handlePriceCodeTextChange = (raw: string) => {
    setCodeInputText(raw);
    const trimmed = raw.trim().toUpperCase();
    if (trimmed === '' || trimmed === 'NORMAL' || trimmed === 'KATALOG') {
      onChange({ ...data, priceCode: '' });
      return;
    }
    const normalized = normalizePriceCode(raw);
    if (normalized !== '') {
      onChange({ ...data, priceCode: normalized });
    }
  };

  const handleSelectPriceCode = (code: PriceTierCode) => {
    setCodeInputText(code === 'AUTO' ? 'AUTO' : code);
    onChange({ ...data, priceCode: code });
  };

  const handleDraftNameChange = (value: string) => {
    clearBlurTimeout();
    const exactMatch = findCatalogMatch(value, catalog);
    if (exactMatch) {
      setDraft((prev) => ({
        ...prev,
        name: value,
        unit: exactMatch.unit,
        price: exactMatch.defaultPrice ?? prev.price,
        tierPrices: exactMatch.tierPrices,
      }));
    } else {
      setDraft((prev) => ({ ...prev, name: value }));
    }
    setIsDropdownOpen(true);
    setHighlightedIndex(-1);
  };

  const handleSelectCatalogProduct = (product: CatalogProduct, focusQty = true) => {
    clearBlurTimeout();
    setDraft((prev) => ({
      ...prev,
      name: product.name,
      unit: product.unit,
      price: product.defaultPrice ?? '',
      tierPrices: product.tierPrices,
    }));
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    if (focusQty) {
      window.requestAnimationFrame(() => {
        qtyInputRef.current?.focus();
      });
    }
  };

  const handleCommitDraft = () => {
    clearBlurTimeout();
    const hasContent =
      draft.name.trim() !== '' || draft.qty.trim() !== '' || draft.price.trim() !== '';
    if (!hasContent) return;

    const match = findCatalogMatch(draft.name, catalog);
    const payload: Omit<InvoiceItem, 'id'> = {
      name: draft.name.trim(),
      unit: draft.unit || match?.unit || '',
      qty: draft.qty.trim(),
      price: draft.price.trim() || match?.defaultPrice || '',
      tierPrices: draft.tierPrices ?? match?.tierPrices,
    };

    onCommitItem(payload, editingItemId);
    setDraft(EMPTY_DRAFT);
    setEditingItemId(null);
    setIsDropdownOpen(false);
    setHighlightedIndex(-1);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  };

  const handleEntryFieldKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommitDraft();
    }
  };

  const handleLoadItemIntoDraft = (item: InvoiceItem) => {
    setEditingItemId(item.id);
    setDraft({
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      price: item.price,
      tierPrices: item.tierPrices,
    });
    setIsDropdownOpen(false);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  };

  const handleCancelEditDraft = () => {
    setEditingItemId(null);
    setDraft(EMPTY_DRAFT);
    setIsDropdownOpen(false);
    window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
  };

  const populatedItems = data.items.filter((item) => !isInvoiceItemEmpty(item));
  const matchingProducts =
    catalog.length > 0
      ? searchCatalogProducts(catalog, draft.name, { includeUnit: true, limit: 25 })
      : [];
  const showSuggestions = isDropdownOpen && matchingProducts.length > 0;
  const draftCatalogMatch = findCatalogMatch(draft.name, catalog);
  const displayedDraftPrice =
    draft.price !== '' ? draft.price : (draftCatalogMatch?.defaultPrice ?? '');
  const draftResolved = resolveItemPricing(
    {
      id: 'draft-preview',
      name: draft.name,
      unit: draft.unit,
      qty: draft.qty,
      price: displayedDraftPrice,
      tierPrices: draft.tierPrices ?? draftCatalogMatch?.tierPrices,
    },
    summary.effectiveCode,
    catalog,
  );

  return (
    <aside
      aria-label="Panel Editor Proforma Invoice"
      className="w-full lg:w-[440px] shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-y-auto no-print"
    >
      <div className="p-5 space-y-6">
        {editingHistoryLabel && (
          <div
            role="status"
            data-testid="editing-history-banner"
            className="rounded-lg border border-slate-900/20 bg-slate-900 text-white px-3 py-2 flex items-center justify-between gap-2 text-xs"
          >
            <div className="min-w-0">
              <span className="text-slate-300">Sedang mengedit riwayat: </span>
              <strong className="font-semibold truncate">{editingHistoryLabel}</strong>
            </div>
            <button
              type="button"
              onClick={onStartNewNota}
              className="shrink-0 rounded bg-white/15 hover:bg-white/25 px-2 py-1 text-[11px] font-medium text-white cursor-pointer whitespace-nowrap"
            >
              Buat Baru
            </button>
          </div>
        )}
        {/* Section 1: Header & Recipient */}
        <section aria-labelledby="section-header-info" className="space-y-3.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 id="section-header-info" className="text-sm font-semibold text-slate-900">
              1. Informasi Dokumen & Tujuan
            </h2>
            <button
              type="button"
              onClick={handleUseTodayDate}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Otomatis Hari Ini
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="doc-title" className="block text-xs font-medium text-slate-700 mb-1">
                Judul Dokumen
              </label>
              <input
                id="doc-title"
                type="text"
                value={data.documentTitle}
                onChange={(e) => onChange({ ...data, documentTitle: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="doc-date" className="block text-xs font-medium text-slate-700 mb-1">
                Tempat & Tanggal
              </label>
              <input
                id="doc-date"
                type="text"
                value={data.dateText}
                onChange={(e) => onChange({ ...data, dateText: e.target.value })}
                placeholder={formatTodayPlaceDate('Jember')}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="doc-recipient-heading" className="block text-xs font-medium text-slate-700 mb-1">
                Sapaan Tujuan
              </label>
              <input
                id="doc-recipient-heading"
                type="text"
                value={data.recipientHeading}
                onChange={(e) => onChange({ ...data, recipientHeading: e.target.value })}
                placeholder="Kepada Yth."
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="doc-district" className="block text-xs font-medium text-slate-700 mb-1">
                Kecamatan (Alamat Pemesan)
              </label>
              <input
                id="doc-district"
                type="text"
                value={data.district ?? ''}
                onChange={(e) => {
                  const target = e.target;
                  const start = target.selectionStart;
                  const end = target.selectionEnd;
                  onChange({ ...data, district: target.value.toUpperCase() });
                  window.requestAnimationFrame(() => {
                    if (document.activeElement === target && start !== null && end !== null) {
                      target.setSelectionRange(start, end);
                    }
                  });
                }}
                placeholder="Contoh: SUMBERSARI"
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm uppercase text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          <div>
            <label htmlFor="doc-recipient-details" className="block text-xs font-medium text-slate-700 mb-1">
              Nama Pemesan / Toko (opsional)
            </label>
            <textarea
              id="doc-recipient-details"
              rows={2}
              value={data.recipientDetails}
              onChange={(e) => {
                const target = e.target;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                onChange({ ...data, recipientDetails: target.value.toUpperCase() });
                window.requestAnimationFrame(() => {
                  if (document.activeElement === target && start !== null && end !== null) {
                    target.setSelectionRange(start, end);
                  }
                });
              }}
              placeholder="Contoh: TB. SUMBER MAKMUR"
              className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm uppercase text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-y"
            />
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">
                Warna Identitas Pembuat Nota (Pojok Kiri Atas)
              </span>
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                <span>Kustom</span>
                <input
                  type="color"
                  aria-label="Pilih warna kustom pembuat nota"
                  value={activeCreatorColor}
                  onChange={(e) => onChange({ ...data, creatorColor: e.target.value })}
                  className="w-6 h-6 rounded border border-slate-300 bg-white p-0.5 cursor-pointer"
                />
              </label>
            </div>
            <div
              role="group"
              aria-label="Pilihan warna identitas pembuat nota"
              className="flex flex-wrap items-center gap-2"
            >
              {CREATOR_COLOR_PRESETS.map((preset) => {
                const isSelected =
                  activeCreatorColor.toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    aria-label={`Pilih warna ${preset.label}`}
                    aria-pressed={isSelected}
                    title={preset.label}
                    onClick={() => onChange({ ...data, creatorColor: preset.hex })}
                    className={`w-7 h-7 rounded-md border flex items-center justify-center transition-transform cursor-pointer ${
                      isSelected
                        ? 'ring-2 ring-slate-900 ring-offset-1 border-slate-900 scale-105'
                        : 'border-slate-300 hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset.hex }}
                  >
                    {isSelected && (
                      <Check
                        className={`w-3.5 h-3.5 ${
                          preset.hex === '#eab308' ? 'text-slate-900' : 'text-white'
                        }`}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {data.displayOptions.showInvoiceNumber && (
            <div>
              <label htmlFor="doc-invoice-number" className="block text-xs font-medium text-slate-700 mb-1">
                Nomor Invoice
              </label>
              <input
                id="doc-invoice-number"
                type="text"
                value={data.invoiceNumber}
                onChange={(e) => onChange({ ...data, invoiceNumber: e.target.value })}
                placeholder="PI/2026/11/001"
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          )}
        </section>

        {/* Section 2: Kode Harga & Single-Row Item Input */}
        <section aria-labelledby="section-items" className="space-y-3">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-2">
            <h2 id="section-items" className="text-sm font-semibold text-slate-900">
              2. Daftar Barang ({populatedItems.length} item)
            </h2>
            <button
              type="button"
              onClick={onOpenCatalog}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Database className="w-3.5 h-3.5" aria-hidden="true" />
              Database ({catalog.length})
            </button>
          </div>

          {/* Kode Harga / Diskon Input Column */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="price-code-input" className="text-xs font-semibold text-slate-800">
                Kode Harga (Auto / 5 / 10 / 20 / 40 / TB)
              </label>
              <input
                id="price-code-input"
                type="text"
                value={effectiveCodeDisplay}
                onChange={(e) => handlePriceCodeTextChange(e.target.value)}
                placeholder="AUTO / 5 / 10 / 20 / 40 / TB"
                className="w-28 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-mono-tabular font-semibold text-slate-900 uppercase focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div role="group" aria-label="Pilihan cepat kode harga" className="grid grid-cols-7 gap-1">
              {PRICE_TIER_CODES.map((code) => {
                const label =
                  code === 'AUTO'
                    ? 'Auto'
                    : code === ''
                      ? 'Normal'
                      : code === 'TB'
                        ? 'TB'
                        : `${code}jt`;
                const isActive = data.priceCode === code;
                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSelectPriceCode(code)}
                    className={`py-1.5 px-1 text-[11px] font-semibold rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] leading-snug text-slate-600">
              {data.priceCode === 'TB'
                ? 'Mode TB aktif: harga berubah langsung ke tier 40jt, baris HARGA NORMAL disembunyikan, hanya tampil TOTAL.'
                : data.priceCode === 'AUTO'
                  ? summary.effectiveCode
                    ? summary.showNormalRow
                      ? `Mode Otomatis: total normal Rp ${formatRupiahNumber(summary.normalTotal)} menyentuh tier ${summary.effectiveCode}jt. Harga item & TOTAL memakai potongan ${summary.effectiveCode}jt, dengan HARGA NORMAL di atas TOTAL.`
                      : `Mode Otomatis: total Rp ${formatRupiahNumber(summary.grandTotal)} menyentuh batas ${summary.effectiveCode}jt (belum ada selisih harga diskon, sehingga baris HARGA NORMAL disembunyikan).`
                    : 'Mode Otomatis: tidak ada diskon (total < 5jt), hanya tampil TOTAL. Otomatis masuk diskon 5jt, 10jt, 20jt, 40jt saat total menyentuh batasnya.'
                  : data.priceCode
                    ? summary.showNormalRow
                      ? `Kode ${data.priceCode}jt aktif: harga item & TOTAL memakai potongan sheet ${data.priceCode}jt, dengan HARGA NORMAL di atas TOTAL.`
                      : `Kode ${data.priceCode}jt aktif: belum ada selisih harga diskon pada barang di nota, sehingga baris HARGA NORMAL disembunyikan.`
                    : 'Mode Normal: tidak ada diskon, baris HARGA NORMAL disembunyikan dan hanya tampil TOTAL.'}
            </p>
          </div>

          {/* Single 1-Row Input Form (never grows downward) */}
          <div
            data-testid="single-item-entry-form"
            className={`rounded-lg border p-3 space-y-2.5 ${
              editingItemId
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-800">
                {editingItemId ? 'Edit Barang Terpilih' : 'Input Barang (1 Baris)'}
              </span>
              {editingItemId ? (
                <button
                  type="button"
                  onClick={handleCancelEditDraft}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                  Batal Edit
                </button>
              ) : (
                <span className="text-[11px] text-slate-500">
                  Tekan Enter untuk masuk ke nota
                </span>
              )}
            </div>

            <div className="relative">
              <label
                htmlFor="entry-item-name"
                className="block text-xs font-medium text-slate-600 mb-1"
              >
                Nama Barang
              </label>
              <input
                ref={nameInputRef}
                id="entry-item-name"
                type="text"
                autoComplete="off"
                value={draft.name}
                onFocus={() => {
                  clearBlurTimeout();
                  setIsDropdownOpen(true);
                  setHighlightedIndex(-1);
                }}
                onBlur={() => {
                  clearBlurTimeout();
                  blurTimeoutRef.current = window.setTimeout(() => {
                    blurTimeoutRef.current = null;
                    setIsDropdownOpen(false);
                  }, 150);
                }}
                onChange={(e) => handleDraftNameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && showSuggestions) {
                    e.preventDefault();
                    setHighlightedIndex((prev) =>
                      prev < matchingProducts.length - 1 ? prev + 1 : 0,
                    );
                    return;
                  }
                  if (e.key === 'ArrowUp' && showSuggestions) {
                    e.preventDefault();
                    setHighlightedIndex((prev) =>
                      prev > 0 ? prev - 1 : matchingProducts.length - 1,
                    );
                    return;
                  }
                  if (e.key === 'Escape' && showSuggestions) {
                    setIsDropdownOpen(false);
                    setHighlightedIndex(-1);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (
                      showSuggestions &&
                      highlightedIndex >= 0 &&
                      matchingProducts[highlightedIndex]
                    ) {
                      handleSelectCatalogProduct(matchingProducts[highlightedIndex], true);
                    } else {
                      handleCommitDraft();
                    }
                  }
                }}
                placeholder={
                  catalog.length > 0
                    ? 'Ketik kata kunci barang (cth: besi 10)...'
                    : 'Nama barang atau deskripsi'
                }
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />

              {showSuggestions && (
                <div
                  role="listbox"
                  aria-label="Pilihan barang dari database"
                  className="absolute left-0 right-0 top-full mt-1 z-30 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg divide-y divide-slate-100"
                >
                  {matchingProducts.map((product, pIdx) => (
                    <button
                      key={product.id}
                      type="button"
                      role="option"
                      aria-selected={highlightedIndex === pIdx || draft.name === product.name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectCatalogProduct(product, true);
                      }}
                      className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 cursor-pointer ${
                        highlightedIndex === pIdx ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-xs font-medium text-slate-900 truncate">
                        {renderHighlightedProductName(product.name, draft.name)}
                      </span>
                      <span className="text-[11px] font-mono-tabular text-slate-600 shrink-0">
                        {product.unit}
                        {product.defaultPrice
                          ? ` · Rp ${formatRupiahNumber(parseNumericInput(product.defaultPrice))}`
                          : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-3">
                <label
                  htmlFor="entry-item-unit"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Satuan
                </label>
                <select
                  id="entry-item-unit"
                  value={draft.unit}
                  onChange={(e) =>
                    setDraft((prev) => ({ ...prev, unit: e.target.value as AllowedUnit | '' }))
                  }
                  onKeyDown={handleEntryFieldKeyDown}
                  className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                >
                  <option value="">- Pilih -</option>
                  {ALLOWED_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label
                  htmlFor="entry-item-qty"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Qty
                </label>
                <input
                  ref={qtyInputRef}
                  id="entry-item-qty"
                  type="text"
                  inputMode="decimal"
                  value={draft.qty}
                  onChange={(e) => setDraft((prev) => ({ ...prev, qty: e.target.value }))}
                  onKeyDown={handleEntryFieldKeyDown}
                  placeholder="0"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div className="col-span-4">
                <label
                  htmlFor="entry-item-price"
                  className="block text-xs font-medium text-slate-600 mb-1"
                >
                  Harga Katalog (Rp)
                </label>
                <input
                  id="entry-item-price"
                  type="text"
                  inputMode="numeric"
                  value={displayedDraftPrice}
                  onChange={(e) => setDraft((prev) => ({ ...prev, price: e.target.value }))}
                  onKeyDown={handleEntryFieldKeyDown}
                  placeholder="0"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
              <div className="col-span-3">
                <button
                  type="button"
                  onClick={handleCommitDraft}
                  className="w-full inline-flex items-center justify-center gap-1 rounded-md bg-slate-900 px-2 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap h-[34px]"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" aria-hidden="true" />
                  {editingItemId ? 'Simpan' : 'Masuk'}
                </button>
              </div>
            </div>

            {(draft.name.trim() || draft.qty.trim() || displayedDraftPrice) && (
              <div className="pt-1 border-t border-slate-200/80 text-xs flex items-center justify-between text-slate-600">
                <span>
                  {summary.effectiveCode && summary.effectiveCode !== 'TB'
                    ? `Estimasi Kode ${summary.effectiveCode}jt`
                    : summary.effectiveCode === 'TB'
                      ? 'Estimasi TB (40jt)'
                      : 'Estimasi baris'}
                </span>
                <span className="font-semibold text-slate-900 font-mono-tabular">
                  Rp {formatRupiahNumber(draftResolved.tierLineTotal)}
                </span>
              </div>
            )}
          </div>

          {/* Compact Readout of Committed Items (click any item to edit in the 1-row bar above) */}
          {populatedItems.length > 0 && (
            <div
              data-testid="committed-items-list"
              className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100"
            >
              {populatedItems.map((item, idx) => {
                const resolved = resolveItemPricing(item, summary.effectiveCode, catalog);
                const isEditing = editingItemId === item.id;
                return (
                  <div
                    key={item.id}
                    data-testid={`committed-item-${idx}`}
                    className={`px-2.5 py-2 flex items-center justify-between gap-2 text-xs ${
                      isEditing ? 'bg-slate-100' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadItemIntoDraft(item)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="font-medium text-slate-900 truncate">
                        <span className="font-mono-tabular text-slate-500 mr-1.5">{idx + 1}.</span>
                        {item.name || '(Tanpa nama)'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                        {[item.qty || '0', item.unit].filter(Boolean).join(' ')} × Rp{' '}
                        {formatRupiahNumber(resolved.sheetDisplayUnitPrice)} ={' '}
                        <strong className="text-slate-800">
                          Rp {formatRupiahNumber(resolved.sheetDisplayLineTotal)}
                        </strong>
                      </p>
                    </button>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleLoadItemIntoDraft(item)}
                        aria-label={`Edit barang baris ${idx + 1}`}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(idx, -1)}
                        disabled={idx === 0}
                        aria-label={`Pindahkan baris ${idx + 1} ke atas`}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveItem(idx, 1)}
                        disabled={idx === populatedItems.length - 1}
                        aria-label={`Pindahkan baris ${idx + 1} ke bawah`}
                        className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (editingItemId === item.id) {
                            handleCancelEditDraft();
                          }
                          onRemoveItem(item.id);
                        }}
                        aria-label={`Hapus barang baris ${idx + 1}`}
                        className="p-1 rounded text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Section 3: Attention & Signature */}
        <section aria-labelledby="section-footer-info" className="space-y-3.5">
          <div className="border-b border-slate-200 pb-2">
            <h2 id="section-footer-info" className="text-sm font-semibold text-slate-900">
              3. Catatan Perhatian & Tanda Tangan
            </h2>
          </div>

          <div className="space-y-2.5">
            {data.attentionLines.map((line, index) => (
              <div key={line.id} className="space-y-1">
                <label
                  htmlFor={`att-line-${line.id}`}
                  className="block text-xs font-medium text-slate-600"
                >
                  Poin Perhatian {index + 1}
                </label>
                <input
                  id={`att-line-${line.id}`}
                  type="text"
                  value={`${line.prefix}${line.boldPart}${line.suffix}`}
                  onChange={(e) =>
                    onUpdateAttention(line.id, {
                      prefix: e.target.value,
                      boldPart: '',
                      suffix: '',
                    })
                  }
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sig-greeting" className="block text-xs font-medium text-slate-700 mb-1">
                Salam Penutup
              </label>
              <input
                id="sig-greeting"
                type="text"
                value={data.signatureGreeting}
                onChange={(e) => onChange({ ...data, signatureGreeting: e.target.value })}
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div>
              <label htmlFor="sig-name" className="block text-xs font-medium text-slate-700 mb-1">
                Nama Penandatangan (opsional)
              </label>
              <input
                id="sig-name"
                type="text"
                value={data.signatureName}
                onChange={(e) => onChange({ ...data, signatureName: e.target.value })}
                placeholder="( Nama / Bagian )"
                className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>
        </section>

        {/* Section 4: Display Options */}
        <section aria-labelledby="section-display-opts" className="space-y-2.5 pb-4">
          <div className="border-b border-slate-200 pb-2">
            <h2 id="section-display-opts" className="text-sm font-semibold text-slate-900">
              4. Opsi Tampilan Lembar
            </h2>
          </div>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={data.displayOptions.showRowDividers}
              onChange={(e) =>
                onChange({
                  ...data,
                  displayOptions: {
                    ...data.displayOptions,
                    showRowDividers: e.target.checked,
                  },
                })
              }
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span>Tampilkan garis horizontal pemisah antar barang</span>
          </label>

          <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={data.displayOptions.showInvoiceNumber}
              onChange={(e) =>
                onChange({
                  ...data,
                  displayOptions: {
                    ...data.displayOptions,
                    showInvoiceNumber: e.target.checked,
                  },
                })
              }
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            <span>Tampilkan nomor invoice di bawah judul</span>
          </label>
        </section>
      </div>
    </aside>
  );
}
