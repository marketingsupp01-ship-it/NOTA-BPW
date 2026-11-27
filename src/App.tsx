import { useCallback, useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Copy, Download, Eye, EyeOff, Printer } from 'lucide-react';
import { CatalogModal } from './components/CatalogModal';
import { EditorPanel } from './components/EditorPanel';
import { HistoryModal } from './components/HistoryModal';
import { InvoiceSheet, SHEET_HEIGHT_PX, SHEET_WIDTH_PX } from './components/InvoiceSheet';
import type {
  AttentionLine,
  CatalogProduct,
  InvoiceData,
  InvoiceItem,
  SavedInvoiceRecord,
} from './types/invoice';
import { copyInvoicePngToClipboard, downloadInvoiceAsPng } from './utils/exportPng';
import {
  clearInMemoryAccessToken,
  getInMemoryAccessToken,
  googleSignInForSheets,
  googleSignOut,
  initGoogleAuth,
} from './utils/googleAuth';
import {
  GoogleSheetsAuthExpiredError,
  extractSpreadsheetId,
  fetchCatalogFromGoogleSheet,
  type GoogleSheetLinkConfig,
} from './utils/googleSheets';
import {
  DEFAULT_CREATOR_COLOR,
  buildInvoiceSummaryLabel,
  commitItemToList,
  createDefaultInvoice,
  createSampleCatalog,
  createSampleInvoice,
  finalizeInvoiceToHistory,
  formatRupiahNumber,
  hasInvoiceContent,
  normalizeAllowedUnit,
  normalizePriceCode,
  removeItemFromList,
  resolveInvoiceSummary,
  syncDateTextToToday,
  upsertHistoryRecord,
} from './utils/invoiceLogic';

const ACTIVE_STORAGE_KEY = 'proforma_invoice_active_v1';
const HISTORY_STORAGE_KEY = 'proforma_invoice_history_v1';
const CATALOG_STORAGE_KEY = 'proforma_product_catalog_v1';
const EDITING_HISTORY_ID_KEY = 'proforma_editing_history_id_v1';
const GSHEET_CONFIG_STORAGE_KEY = 'proforma_gsheet_config_v1';

const DEFAULT_SHEET_CONFIG: GoogleSheetLinkConfig = {
  spreadsheetInput: '',
  spreadsheetId: '',
  spreadsheetTitle: '',
  autoSync: true,
  lastSyncedAt: null,
};

function catalogSignature(products: CatalogProduct[]): string {
  return JSON.stringify(
    products.map((p) => ({
      name: p.name,
      unit: p.unit,
      defaultPrice: p.defaultPrice ?? '',
      tierPrices: p.tierPrices ?? null,
    })),
  );
}

function normalizeLoadedInvoice(parsed: InvoiceData, syncDate = false): InvoiceData {
  const legacyCity = parsed.city?.trim() ?? '';
  const rawDate = parsed.dateText?.trim() ?? '';
  const mergedDate =
    parsed.district === undefined && legacyCity && rawDate && !rawDate.toLowerCase().includes(legacyCity.toLowerCase())
      ? `${legacyCity}, ${rawDate}`
      : parsed.dateText;

  return {
    ...parsed,
    dateText: syncDate ? syncDateTextToToday(mergedDate) : mergedDate,
    district: parsed.district ?? '',
    creatorColor: parsed.creatorColor || DEFAULT_CREATOR_COLOR,
    subtotalLabel: parsed.subtotalLabel?.trim() || 'HARGA NORMAL',
    priceCode: parsed.priceCode === undefined ? 'AUTO' : normalizePriceCode(parsed.priceCode),
    items: parsed.items.map((item) => ({
      ...item,
      unit: normalizeAllowedUnit(item.unit),
    })),
  };
}

function loadInitialInvoice(): InvoiceData {
  try {
    const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
    if (!raw) return createDefaultInvoice();
    const parsed = JSON.parse(raw) as InvoiceData;
    if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
      return createDefaultInvoice();
    }
    return normalizeLoadedInvoice(parsed, true);
  } catch {
    return createDefaultInvoice();
  }
}

function loadHistoryRecords(): SavedInvoiceRecord[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadCatalogProducts(): CatalogProduct[] {
  try {
    const raw = localStorage.getItem(CATALOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.name === 'string' && item.name.trim())
      .map((item) => ({
        id: String(item.id || `cat-${Math.random().toString(36).slice(2, 8)}`),
        name: String(item.name).trim(),
        unit: normalizeAllowedUnit(item.unit) || 'PCS',
        defaultPrice: item.defaultPrice ? String(item.defaultPrice) : undefined,
        tierPrices: item.tierPrices && typeof item.tierPrices === 'object' ? item.tierPrices : undefined,
      }));
  } catch {
    return [];
  }
}

function loadEditingHistoryId(): string | null {
  try {
    const raw = localStorage.getItem(EDITING_HISTORY_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

function loadGoogleSheetConfig(): GoogleSheetLinkConfig {
  try {
    const raw = localStorage.getItem(GSHEET_CONFIG_STORAGE_KEY);
    if (!raw) return DEFAULT_SHEET_CONFIG;
    const parsed = JSON.parse(raw) as Partial<GoogleSheetLinkConfig>;
    return {
      spreadsheetInput: String(parsed.spreadsheetInput ?? ''),
      spreadsheetId: String(parsed.spreadsheetId ?? ''),
      spreadsheetTitle: String(parsed.spreadsheetTitle ?? ''),
      autoSync: parsed.autoSync !== false,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : null,
    };
  } catch {
    return DEFAULT_SHEET_CONFIG;
  }
}

export default function App() {
  const [invoice, setInvoice] = useState<InvoiceData>(loadInitialInvoice);
  const [history, setHistory] = useState<SavedInvoiceRecord[]>(loadHistoryRecords);
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(loadEditingHistoryId);
  const [catalog, setCatalog] = useState<CatalogProduct[]>(loadCatalogProducts);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [isPreviewOnly, setIsPreviewOnly] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'preview'>('preview');
  const [zoomMode, setZoomMode] = useState<'fit' | '75' | '100'>('fit');
  const [fitScale, setFitScale] = useState(0.82);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isCopyingPng, setIsCopyingPng] = useState(false);

  const [needsGoogleAuth, setNeedsGoogleAuth] = useState(true);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [sheetConfig, setSheetConfig] = useState<GoogleSheetLinkConfig>(loadGoogleSheetConfig);
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [sheetStatus, setSheetStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const isAutoDateRef = useRef(true);
  const lastAutoSyncAttemptRef = useRef(0);
  const isSyncingRef = useRef(false);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;

  useEffect(() => {
    const syncIfAuto = () => {
      if (!isAutoDateRef.current) return;
      setInvoice((prev) => {
        const nextDate = syncDateTextToToday(prev.dateText);
        if (nextDate === prev.dateText) return prev;
        return { ...prev, dateText: nextDate };
      });
    };

    const interval = window.setInterval(syncIfAuto, 60_000);
    window.addEventListener('focus', syncIfAuto);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', syncIfAuto);
    };
  }, []);

  const handleInvoiceChange = (next: InvoiceData) => {
    if (next.dateText !== invoice.dateText) {
      isAutoDateRef.current = next.dateText === syncDateTextToToday(next.dateText);
    }
    setInvoice(next);
  };

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_STORAGE_KEY, JSON.stringify(invoice));
    } catch {
      // Ignore storage quota errors
    }
  }, [invoice]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  useEffect(() => {
    try {
      localStorage.setItem(CATALOG_STORAGE_KEY, JSON.stringify(catalog));
    } catch {
      // Ignore storage quota errors
    }
  }, [catalog]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;

    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const availableW = Math.max(260, rect.width - 48);
      const availableH = Math.max(200, rect.height - 76);
      const scaleW = availableW / SHEET_WIDTH_PX;
      const scaleH = availableH / SHEET_HEIGHT_PX;
      const next = Math.min(scaleW, scaleH, 1.05);
      setFitScale(Math.max(0.28, Number(next.toFixed(3))));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isPreviewOnly, mobileTab]);

  useEffect(() => {
    if (!feedbackMessage) return;
    const timer = window.setTimeout(() => setFeedbackMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [feedbackMessage]);

  useEffect(() => {
    try {
      if (editingHistoryId) {
        localStorage.setItem(EDITING_HISTORY_ID_KEY, editingHistoryId);
      } else {
        localStorage.removeItem(EDITING_HISTORY_ID_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, [editingHistoryId]);

  const summary = resolveInvoiceSummary(invoice, catalog);

  // When editing an existing history nota, automatically keep that record updated in place
  useEffect(() => {
    if (!editingHistoryId) return;
    setHistory((prev) => {
      const existing = prev.find((r) => r.id === editingHistoryId);
      if (!existing) return prev;
      const nextLabel = buildInvoiceSummaryLabel(invoice);
      const nextTotal = summary.grandTotal;
      if (
        existing.label === nextLabel &&
        existing.total === nextTotal &&
        JSON.stringify(existing.data) === JSON.stringify(invoice)
      ) {
        return prev;
      }
      return prev.map((rec) =>
        rec.id === editingHistoryId
          ? {
              ...rec,
              savedAt: new Date().toISOString(),
              label: nextLabel,
              total: nextTotal,
              data: invoice,
            }
          : rec,
      );
    });
  }, [invoice, editingHistoryId, summary.grandTotal]);

  const activeScale = zoomMode === 'fit' ? fitScale : zoomMode === '75' ? 0.75 : 1;

  const handleCommitItem = (draft: Omit<InvoiceItem, 'id'>, editingItemId: string | null) => {
    setInvoice((prev) => ({
      ...prev,
      items: commitItemToList(prev.items, draft, editingItemId),
    }));
  };

  const handleRemoveItem = (id: string) => {
    setInvoice((prev) => ({
      ...prev,
      items: removeItemFromList(prev.items, id),
    }));
  };

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    setInvoice((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.items.length) return prev;
      const nextItems = [...prev.items];
      const [moved] = nextItems.splice(index, 1);
      nextItems.splice(target, 0, moved);
      return { ...prev, items: nextItems };
    });
  };

  const handleUpdateAttention = (id: string, patch: Partial<AttentionLine>) => {
    setInvoice((prev) => ({
      ...prev,
      attentionLines: prev.attentionLines.map((line) =>
        line.id === id ? { ...line, ...patch } : line,
      ),
    }));
  };

  const handleResetTemplate = () => {
    isAutoDateRef.current = true;
    setEditingHistoryId(null);
    setInvoice(createDefaultInvoice());
    setFeedbackMessage('Membuat nota baru');
  };

  const handleLoadSample = () => {
    isAutoDateRef.current = true;
    setEditingHistoryId(null);
    setInvoice(createSampleInvoice());
    if (catalog.length === 0) {
      setCatalog(createSampleCatalog());
    }
    setFeedbackMessage('Contoh data & database 6-sheet dimuat');
  };

  const handleSaveToHistory = () => {
    const isUpdatingExisting = Boolean(
      editingHistoryId && history.some((rec) => rec.id === editingHistoryId),
    );
    const { records: nextRecords, savedId } = upsertHistoryRecord(history, editingHistoryId, {
      savedAt: new Date().toISOString(),
      label: buildInvoiceSummaryLabel(invoice),
      total: summary.grandTotal,
      data: invoice,
    });
    setHistory(nextRecords);
    setEditingHistoryId(savedId);
    setFeedbackMessage(
      isUpdatingExisting
        ? 'Perubahan nota diperbarui di riwayat'
        : 'Tersimpan ke riwayat',
    );
  };

  const handleDeleteHistory = (id: string) => {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (editingHistoryId === id) {
      setEditingHistoryId(null);
    }
  };

  const handleReplaceCatalog = useCallback((products: CatalogProduct[], silent = false) => {
    setCatalog(products);
    setInvoice((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        const match = products.find(
          (p) =>
            p.name.trim().replace(/\s+/g, ' ').toLowerCase() ===
            item.name.trim().replace(/\s+/g, ' ').toLowerCase(),
        );
        if (!match) return item;
        return {
          ...item,
          unit: match.unit,
          price: match.defaultPrice ?? item.price,
          tierPrices: match.tierPrices,
        };
      }),
    }));
    if (!silent) {
      setFeedbackMessage(`Database barang diperbarui (${products.length} item)`);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(GSHEET_CONFIG_STORAGE_KEY, JSON.stringify(sheetConfig));
    } catch {
      // Ignore storage quota errors
    }
  }, [sheetConfig]);

  useEffect(() => {
    return initGoogleAuth(
      (user) => {
        setGoogleUserEmail(user.email ?? user.displayName ?? 'Akun Google');
        setNeedsGoogleAuth(false);
      },
      (user) => {
        setGoogleUserEmail(user ? user.email ?? user.displayName ?? null : null);
        setNeedsGoogleAuth(true);
      },
    );
  }, []);

  const syncGoogleSheet = useCallback(
    async (overrideInput?: string, silent = false) => {
      const targetInput = (overrideInput ?? sheetConfig.spreadsheetInput) || sheetConfig.spreadsheetId;
      if (!targetInput.trim() || isSyncingRef.current) return;

      const accessToken = getInMemoryAccessToken();
      if (!accessToken) {
        setNeedsGoogleAuth(true);
        if (!silent) {
          setSheetStatus({
            type: 'error',
            text: 'Silakan klik "Sign in with Google" terlebih dahulu untuk membaca spreadsheet.',
          });
        }
        return;
      }

      isSyncingRef.current = true;
      setIsSyncingSheet(true);
      if (!silent) setSheetStatus(null);

      try {
        const result = await fetchCatalogFromGoogleSheet(targetInput, accessToken);
        const nextProducts = result.importResult.products;
        if (nextProducts.length === 0) {
          if (!silent) {
            setSheetStatus({
              type: 'error',
              text: 'Spreadsheet terbaca, tetapi belum ditemukan baris barang. Pastikan ada kolom NAMA BARANG pada tab sheet.',
            });
          }
          return;
        }

        const changed = catalogSignature(catalogRef.current) !== catalogSignature(nextProducts);
        const nowIso = new Date().toISOString();
        setSheetConfig((prev) => ({
          ...prev,
          spreadsheetInput: overrideInput ?? (prev.spreadsheetInput || result.spreadsheetId),
          spreadsheetId: result.spreadsheetId,
          spreadsheetTitle: result.spreadsheetTitle,
          lastSyncedAt: nowIso,
        }));

        if (changed || !silent) {
          handleReplaceCatalog(nextProducts, silent && !changed);
          if (changed && silent) {
            setFeedbackMessage(
              `Database otomatis diperbarui dari Google Sheets (${nextProducts.length} item)`,
            );
          }
        }

        const warning =
          result.importResult.invalidUnitCount > 0
            ? ` — ${result.importResult.invalidUnitCount} satuan disesuaikan ke PCS`
            : '';
        setSheetStatus({
          type: 'success',
          text: `Tersinkron dengan "${result.spreadsheetTitle}" (${nextProducts.length} barang · Sheet: ${result.importResult.detectedSheets.join(', ')})${warning}.`,
        });
      } catch (err) {
        if (err instanceof GoogleSheetsAuthExpiredError) {
          clearInMemoryAccessToken();
          setNeedsGoogleAuth(true);
        }
        if (!silent || err instanceof GoogleSheetsAuthExpiredError) {
          setSheetStatus({
            type: 'error',
            text: err instanceof Error ? err.message : 'Gagal menyinkronkan Google Sheets.',
          });
        }
      } finally {
        isSyncingRef.current = false;
        setIsSyncingSheet(false);
      }
    },
    [handleReplaceCatalog, sheetConfig.spreadsheetId, sheetConfig.spreadsheetInput],
  );

  // Automatic background sync (every 30s + when returning to browser tab) while connected
  useEffect(() => {
    if (needsGoogleAuth || !sheetConfig.autoSync || !sheetConfig.spreadsheetId) return;

    const triggerAutoSync = () => {
      const now = Date.now();
      if (now - lastAutoSyncAttemptRef.current < 10_000) return;
      lastAutoSyncAttemptRef.current = now;
      void syncGoogleSheet(sheetConfig.spreadsheetId, true);
    };

    const interval = window.setInterval(() => {
      void syncGoogleSheet(sheetConfig.spreadsheetId, true);
    }, 30_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerAutoSync();
      }
    };

    window.addEventListener('focus', triggerAutoSync);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', triggerAutoSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [needsGoogleAuth, sheetConfig.autoSync, sheetConfig.spreadsheetId, syncGoogleSheet]);

  const handleGoogleSignIn = async () => {
    setIsSigningInGoogle(true);
    setSheetStatus(null);
    try {
      const res = await googleSignInForSheets();
      setGoogleUserEmail(res.user.email ?? res.user.displayName ?? 'Akun Google');
      setNeedsGoogleAuth(false);
      const savedTarget = sheetConfig.spreadsheetInput || sheetConfig.spreadsheetId;
      if (savedTarget && extractSpreadsheetId(savedTarget)) {
        await syncGoogleSheet(savedTarget, false);
      }
    } catch (err) {
      setSheetStatus({
        type: 'error',
        text:
          err instanceof Error
            ? `Gagal masuk Google: ${err.message}`
            : 'Gagal masuk dengan akun Google.',
      });
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleSignOut = async () => {
    await googleSignOut();
    setGoogleUserEmail(null);
    setNeedsGoogleAuth(true);
    setSheetStatus(null);
  };

  const handleUpdateSheetConfig = (patch: Partial<GoogleSheetLinkConfig>) => {
    setSheetConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleDisconnectSheet = () => {
    setSheetConfig(DEFAULT_SHEET_CONFIG);
    setSheetStatus(null);
  };

  const handleAddCatalogProduct = (product: CatalogProduct) => {
    setCatalog((prev) => [product, ...prev]);
  };

  const handleDeleteCatalogProduct = (id: string) => {
    setCatalog((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearCatalog = () => {
    setCatalog([]);
    setFeedbackMessage('Database barang dikosongkan');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPng = () => {
    downloadInvoiceAsPng(invoice, catalog);
    setFeedbackMessage('PNG horizontal berhasil diunduh');
  };

  const handleFinishAndCopyPng = async () => {
    if (isCopyingPng) return;
    setIsCopyingPng(true);
    const snapshotInvoice = invoice;
    const snapshotTotal = summary.grandTotal;
    const hadContent = hasInvoiceContent(snapshotInvoice);

    try {
      const copyResult = await copyInvoicePngToClipboard(snapshotInvoice, catalog);
      const finalized = finalizeInvoiceToHistory(
        history,
        editingHistoryId,
        snapshotInvoice,
        snapshotTotal,
      );
      setHistory(finalized.records);
      setEditingHistoryId(finalized.nextEditingHistoryId);
      isAutoDateRef.current = true;
      setInvoice(finalized.nextInvoice);

      if (copyResult === 'copied') {
        setFeedbackMessage(
          hadContent
            ? 'PNG otomatis disalin (Ctrl+V) · Nota masuk riwayat & direset'
            : 'PNG disalin ke clipboard (Ctrl+V) · Nota direset',
        );
      } else {
        setFeedbackMessage(
          hadContent
            ? 'PNG diunduh (izin clipboard dibatasi) · Nota masuk riwayat & direset'
            : 'PNG diunduh · Nota direset',
        );
      }
    } finally {
      setIsCopyingPng(false);
    }
  };

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-slate-100 text-slate-900">
      {/* Top Navigation Bar (Strict 3-Zone Contract) */}
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4 lg:gap-8 no-print">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Proforma Invoice
        </span>

        <nav aria-label="Aksi dokumen" className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Database Barang ({catalog.length})
          </button>
          <button
            type="button"
            onClick={handleLoadSample}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Muat Contoh
          </button>
          <button
            type="button"
            onClick={handleResetTemplate}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Nota Baru
          </button>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Riwayat ({history.length})
          </button>
          <button
            type="button"
            onClick={() => setIsPreviewOnly((v) => !v)}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer inline-flex items-center gap-1.5"
          >
            {isPreviewOnly ? (
              <>
                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                Tampilkan Editor
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                Preview Penuh
              </>
            )}
          </button>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            Cetak / PDF
          </button>
        </div>
      </header>

      {/* Mobile Tab Switcher & Compact Actions */}
      <div className="lg:hidden shrink-0 bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              mobileTab === 'preview'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Preview Horizontal
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('editor')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              mobileTab === 'editor'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Edit Data
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCatalogOpen(true)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 whitespace-nowrap"
          >
            Database
          </button>
          <button
            type="button"
            onClick={() => setIsHistoryOpen(true)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 whitespace-nowrap"
          >
            Riwayat
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <main className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Editor Sidebar */}
        {!isPreviewOnly && (
          <div className={`${mobileTab === 'editor' ? 'flex' : 'hidden'} lg:flex h-full min-h-0`}>
            <EditorPanel
              data={invoice}
              catalog={catalog}
              editingHistoryLabel={
                editingHistoryId
                  ? history.find((r) => r.id === editingHistoryId)?.label ?? null
                  : null
              }
              onStartNewNota={handleResetTemplate}
              onOpenCatalog={() => setIsCatalogOpen(true)}
              onChange={handleInvoiceChange}
              onCommitItem={handleCommitItem}
              onRemoveItem={handleRemoveItem}
              onMoveItem={handleMoveItem}
              onUpdateAttention={handleUpdateAttention}
            />
          </div>
        )}

        {/* Right Horizontal A4 Preview Stage */}
        <section
          aria-label="Kanvas Pratinjau Horizontal"
          className={`${
            mobileTab === 'preview' || isPreviewOnly ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 min-h-0 flex-col bg-slate-200/75`}
        >
          {/* Preview Utility Bar */}
          <div className="shrink-0 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="font-medium text-slate-800 whitespace-nowrap">
                A4 Landscape (297 × 210 mm)
              </span>
              {(invoice.priceCode === 'AUTO' || invoice.priceCode) && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span className="font-semibold text-slate-900 whitespace-nowrap">
                    {invoice.priceCode === 'AUTO'
                      ? summary.effectiveCode
                        ? `Auto (${summary.effectiveCode}jt)`
                        : 'Auto (Normal)'
                      : invoice.priceCode === 'TB'
                        ? 'Kode: TB (40jt)'
                        : `Kode: ${invoice.priceCode}jt`}
                  </span>
                </>
              )}
              <span aria-hidden="true" className="text-slate-300">
                /
              </span>
              <span className="font-mono-tabular whitespace-nowrap">
                Total: <strong className="text-slate-900">Rp {formatRupiahNumber(summary.grandTotal)}</strong>
              </span>
              {feedbackMessage && (
                <>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  <span role="status" className="text-emerald-700 font-medium">
                    {feedbackMessage}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div
                role="group"
                aria-label="Skala pratinjau"
                className="flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-md border border-slate-200"
              >
                <button
                  type="button"
                  onClick={() => setZoomMode('fit')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    zoomMode === 'fit'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Fit
                </button>
                <button
                  type="button"
                  onClick={() => setZoomMode('75')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    zoomMode === '75'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  75%
                </button>
                <button
                  type="button"
                  onClick={() => setZoomMode('100')}
                  className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    zoomMode === '100'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  100%
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveToHistory}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <BookmarkPlus className="w-3.5 h-3.5" aria-hidden="true" />
                {editingHistoryId && history.some((r) => r.id === editingHistoryId)
                  ? 'Simpan Perubahan'
                  : 'Simpan'}
              </button>

              <button
                type="button"
                onClick={handleDownloadPng}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Unduh PNG
              </button>
            </div>
          </div>

          {/* Sheet Canvas Container + Bottom-Right Finish & Copy PNG Action */}
          <div className="relative flex-1 min-h-0 flex flex-col">
            <div
              ref={stageRef}
              className="flex-1 min-h-0 overflow-auto p-6 pb-16 flex items-center justify-center"
            >
              <InvoiceSheet data={invoice} catalog={catalog} scale={activeScale} />
            </div>

            <div className="absolute bottom-4 right-5 z-20 no-print">
              <button
                type="button"
                data-testid="finish-copy-png-btn"
                disabled={isCopyingPng}
                onClick={handleFinishAndCopyPng}
                title="Cetak nota jadi PNG, salin otomatis ke clipboard (Ctrl+V), simpan ke riwayat, lalu reset nota"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white shadow-lg ring-1 ring-white/15 hover:bg-slate-800 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                {isCopyingPng ? 'Menyalin PNG...' : 'Selesai & Copy PNG'}
              </button>
            </div>
          </div>
        </section>
      </main>

      <CatalogModal
        isOpen={isCatalogOpen}
        products={catalog}
        isGoogleConnected={!needsGoogleAuth}
        googleUserEmail={googleUserEmail}
        isSigningInGoogle={isSigningInGoogle}
        isSyncingSheet={isSyncingSheet}
        sheetConfig={sheetConfig}
        sheetStatus={sheetStatus}
        onGoogleSignIn={() => void handleGoogleSignIn()}
        onGoogleSignOut={() => void handleGoogleSignOut()}
        onUpdateSheetConfig={handleUpdateSheetConfig}
        onSyncSheetNow={(overrideInput) => void syncGoogleSheet(overrideInput, false)}
        onDisconnectSheet={handleDisconnectSheet}
        onClose={() => setIsCatalogOpen(false)}
        onReplaceCatalog={(products) => handleReplaceCatalog(products, false)}
        onAddProduct={handleAddCatalogProduct}
        onDeleteProduct={handleDeleteCatalogProduct}
        onClearCatalog={handleClearCatalog}
      />

      <HistoryModal
        isOpen={isHistoryOpen}
        records={history}
        activeRecordId={editingHistoryId}
        onClose={() => setIsHistoryOpen(false)}
        onLoad={(record) => {
          const loaded = normalizeLoadedInvoice(record.data);
          isAutoDateRef.current = loaded.dateText === syncDateTextToToday(loaded.dateText);
          setEditingHistoryId(record.id);
          setInvoice(loaded);
          setFeedbackMessage(`Mengedit nota "${record.label}"`);
        }}
        onDelete={handleDeleteHistory}
      />
    </div>
  );
}
