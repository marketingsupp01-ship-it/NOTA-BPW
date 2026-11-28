import { useRef, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  Link2,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AllowedUnit, CatalogProduct } from '../types/invoice';
import { downloadCatalogTemplateXlsx, parseExcelFileToCatalog } from '../utils/catalogExcel';
import type { GoogleSheetLinkConfig } from '../utils/googleSheets';
import {
  ALLOWED_UNITS,
  formatRupiahNumber,
  parseNumericInput,
  searchCatalogProducts,
} from '../utils/invoiceLogic';

interface CatalogModalProps {
  isOpen: boolean;
  products: CatalogProduct[];
  isGoogleConnected: boolean;
  hasActiveSyncToken: boolean;
  googleUserEmail: string | null;
  isSigningInGoogle: boolean;
  isSyncingSheet: boolean;
  sheetConfig: GoogleSheetLinkConfig;
  sheetStatus: { type: 'success' | 'error'; text: string } | null;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onUpdateSheetConfig: (patch: Partial<GoogleSheetLinkConfig>) => void;
  onSyncSheetNow: (overrideInput?: string) => void;
  onDisconnectSheet: () => void;
  onClose: () => void;
  onReplaceCatalog: (products: CatalogProduct[]) => void;
  onAddProduct: (product: CatalogProduct) => void;
  onDeleteProduct: (id: string) => void;
  onClearCatalog: () => void;
}

export function CatalogModal({
  isOpen,
  products,
  isGoogleConnected,
  hasActiveSyncToken,
  googleUserEmail,
  isSigningInGoogle,
  isSyncingSheet,
  sheetConfig,
  sheetStatus,
  onGoogleSignIn,
  onGoogleSignOut,
  onUpdateSheetConfig,
  onSyncSheetNow,
  onDisconnectSheet,
  onClose,
  onReplaceCatalog,
  onAddProduct,
  onDeleteProduct,
  onClearCatalog,
}: CatalogModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState<AllowedUnit>('PCS');
  const [newPrice, setNewPrice] = useState('');
  const [newPrice5, setNewPrice5] = useState('');
  const [newPrice10, setNewPrice10] = useState('');
  const [newPrice20, setNewPrice20] = useState('');
  const [newPrice40, setNewPrice40] = useState('');
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const filteredProducts = searchCatalogProducts(products, searchQuery, { includeUnit: true });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportStatus(null);
    try {
      const result = await parseExcelFileToCatalog(file);
      if (result.products.length === 0) {
        setImportStatus({
          type: 'error',
          text: 'Tidak ada baris barang yang terbaca. Pastikan file memiliki sheet satuan/katalog/5jt/10jt/20jt/40jt dengan kolom NAMA BARANG.',
        });
      } else {
        onReplaceCatalog(result.products);
        const sheetInfo =
          result.detectedSheets.length > 0
            ? ` (Sheet terbaca: ${result.detectedSheets.join(', ')})`
            : '';
        const warning =
          result.invalidUnitCount > 0
            ? ` — ${result.invalidUnitCount} satuan tidak dikenali diubah ke PCS`
            : '';
        setImportStatus({
          type: 'success',
          text: `Berhasil memuat ${result.products.length} barang dari "${file.name}"${sheetInfo}${warning}.`,
        });
      }
    } catch {
      setImportStatus({
        type: 'error',
        text: 'Gagal membaca file Excel. Gunakan format .xlsx, .xls, atau .csv yang valid.',
      });
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) return;

    const cleanNum = (raw: string) => {
      const n = parseNumericInput(raw);
      return n > 0 ? String(Math.round(n)) : undefined;
    };

    const p5 = cleanNum(newPrice5);
    const p10 = cleanNum(newPrice10);
    const p20 = cleanNum(newPrice20);
    const p40 = cleanNum(newPrice40);
    const hasTier = Boolean(p5 || p10 || p20 || p40);

    onAddProduct({
      id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmedName,
      unit: newUnit,
      defaultPrice: cleanNum(newPrice),
      tierPrices: hasTier ? { '5': p5, '10': p10, '20': p20, '40': p40 } : undefined,
    });
    setNewName('');
    setNewPrice('');
    setNewPrice5('');
    setNewPrice10('');
    setNewPrice20('');
    setNewPrice40('');
    setImportStatus({
      type: 'success',
      text: `"${trimmedName}" (${newUnit}) ditambahkan ke database barang.`,
    });
  };

  const formatCellPrice = (raw?: string) => {
    if (!raw) return '-';
    const n = parseNumericInput(raw);
    return n > 0 ? formatRupiahNumber(n) : '-';
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="catalog-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 no-print"
    >
      <div className="w-full max-w-5xl rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[88vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="catalog-modal-title" className="text-base font-semibold text-slate-900">
              Database Barang Excel Multi-Sheet ({products.length} item)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Mendukung sheet <strong className="text-slate-700">satuan</strong>,{' '}
              <strong className="text-slate-700">katalog</strong>,{' '}
              <strong className="text-slate-700">5jt</strong>,{' '}
              <strong className="text-slate-700">10jt</strong>,{' '}
              <strong className="text-slate-700">20jt</strong>, dan{' '}
              <strong className="text-slate-700">40jt</strong> (satuan: KG, BTG, LBR, BOX, PCS).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup database barang"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Google Sheets Auto-Sync + Excel Upload & Template Strip */}
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          {/* Live Google Sheets Integration Card */}
          <div
            data-testid="google-sheets-sync-panel"
            className="rounded-lg border border-slate-200 bg-white p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">
                    Integrasi Google Sheets (Auto-Sync Harga &amp; Barang)
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Perubahan harga atau penambahan item di Google Sheets otomatis memperbarui database ini.
                  </p>
                </div>
              </div>

              {isGoogleConnected ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="google-account-badge"
                    className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1"
                  >
                    {googleUserEmail || 'Google Terhubung'}
                    {hasActiveSyncToken ? ' · Sync Aktif' : ' · Tersimpan'}
                  </span>
                  {!hasActiveSyncToken && (
                    <button
                      type="button"
                      disabled={isSigningInGoogle || isSyncingSheet}
                      onClick={onGoogleSignIn}
                      className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 cursor-pointer disabled:opacity-60"
                    >
                      <RefreshCw className={`w-3 h-3 ${isSigningInGoogle ? 'animate-spin' : ''}`} aria-hidden="true" />
                      {isSigningInGoogle ? 'Menyambungkan...' : 'Aktifkan Auto-Sync'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onGoogleSignOut}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
                  >
                    <LogOut className="w-3 h-3" aria-hidden="true" />
                    Keluar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="google-signin-btn"
                  disabled={isSigningInGoogle}
                  onClick={onGoogleSignIn}
                  className="inline-flex items-center gap-2.5 rounded-md border border-[#747775] bg-white px-3.5 py-1.5 text-xs font-medium text-[#1f1f1f] shadow-xs hover:bg-slate-50 active:bg-slate-100 transition-colors cursor-pointer disabled:opacity-60"
                >
                  <svg
                    className="w-4 h-4 shrink-0"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    aria-hidden="true"
                  >
                    <path
                      fill="#EA4335"
                      d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                    />
                    <path
                      fill="#4285F4"
                      d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                    />
                    <path
                      fill="#34A853"
                      d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                    />
                  </svg>
                  <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>

            {isGoogleConnected && (
              <div className="space-y-2 pt-1 border-t border-slate-100">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSyncSheetNow(sheetConfig.spreadsheetInput);
                  }}
                  className="flex flex-col sm:flex-row gap-2"
                >
                  <label htmlFor="gsheet-link-input" className="sr-only">
                    Link atau ID Google Spreadsheet
                  </label>
                  <input
                    id="gsheet-link-input"
                    type="text"
                    value={sheetConfig.spreadsheetInput}
                    onChange={(e) => onUpdateSheetConfig({ spreadsheetInput: e.target.value })}
                    placeholder="Tempel link Google Sheets (https://docs.google.com/spreadsheets/d/...)"
                    className="flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                  />
                  <button
                    type="submit"
                    disabled={isSyncingSheet || !sheetConfig.spreadsheetInput.trim()}
                    className="inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${isSyncingSheet ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                    {isSyncingSheet ? 'Menyinkronkan...' : 'Sinkronkan Sekarang'}
                  </button>
                </form>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sheetConfig.autoSync}
                      onChange={(e) => onUpdateSheetConfig({ autoSync: e.target.checked })}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span>
                      Perbarui otomatis tiap 30 detik &amp; saat kembali ke tab ini
                      {!hasActiveSyncToken && ' (klik Sinkronkan Sekarang setelah refresh)'}
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    {sheetConfig.spreadsheetId && (
                      <span>
                        Sheet: <strong className="text-slate-800">{sheetConfig.spreadsheetTitle || sheetConfig.spreadsheetId}</strong>
                        {sheetConfig.lastSyncedAt && (
                          <>
                            {' · '}
                            {new Date(sheetConfig.lastSyncedAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            })}
                          </>
                        )}
                      </span>
                    )}
                    {sheetConfig.spreadsheetId && (
                      <button
                        type="button"
                        onClick={onDisconnectSheet}
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Putus Link
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {sheetStatus && (
              <p
                role="status"
                className={`text-xs font-medium px-3 py-1.5 rounded-md border ${
                  sheetStatus.type === 'success'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-red-50 text-red-800 border-red-200'
                }`}
              >
                {sheetStatus.text}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
                aria-label="Unggah file Excel database barang"
              />
              <button
                type="button"
                disabled={isImporting}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                {isImporting ? 'Membaca Excel...' : 'Impor Excel (.xlsx / .csv)'}
              </button>

              <button
                type="button"
                onClick={downloadCatalogTemplateXlsx}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Unduh Template 6-Sheet
              </button>
            </div>

            {products.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClearCatalog();
                  setImportStatus(null);
                }}
                className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline cursor-pointer"
              >
                Hapus Semua Data
              </button>
            )}
          </div>

          {importStatus && (
            <p
              role="status"
              className={`text-xs font-medium px-3 py-2 rounded-md border ${
                importStatus.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {importStatus.text}
            </p>
          )}

          {/* Quick Manual Add Row */}
          <form onSubmit={handleAddManual} className="grid grid-cols-12 gap-2 pt-1">
            <div className="col-span-12 md:col-span-3">
              <label htmlFor="cat-new-name" className="sr-only">
                Nama Barang Baru
              </label>
              <input
                id="cat-new-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nama Barang Baru..."
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="col-span-4 md:col-span-1">
              <label htmlFor="cat-new-unit" className="sr-only">
                Satuan Barang Baru
              </label>
              <select
                id="cat-new-unit"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value as AllowedUnit)}
                className="w-full rounded-md border border-slate-300 bg-white px-1.5 py-1.5 text-xs font-medium text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                {ALLOWED_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-4 md:col-span-2">
              <label htmlFor="cat-new-price" className="sr-only">
                Harga Katalog
              </label>
              <input
                id="cat-new-price"
                type="text"
                inputMode="numeric"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="Harga Katalog"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label htmlFor="cat-new-5" className="sr-only">
                Harga 5jt
              </label>
              <input
                id="cat-new-5"
                type="text"
                inputMode="numeric"
                value={newPrice5}
                onChange={(e) => setNewPrice5(e.target.value)}
                placeholder="5jt"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label htmlFor="cat-new-10" className="sr-only">
                Harga 10jt
              </label>
              <input
                id="cat-new-10"
                type="text"
                inputMode="numeric"
                value={newPrice10}
                onChange={(e) => setNewPrice10(e.target.value)}
                placeholder="10jt"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label htmlFor="cat-new-20" className="sr-only">
                Harga 20jt
              </label>
              <input
                id="cat-new-20"
                type="text"
                inputMode="numeric"
                value={newPrice20}
                onChange={(e) => setNewPrice20(e.target.value)}
                placeholder="20jt"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="col-span-3 md:col-span-1">
              <label htmlFor="cat-new-40" className="sr-only">
                Harga 40jt
              </label>
              <input
                id="cat-new-40"
                type="text"
                inputMode="numeric"
                value={newPrice40}
                onChange={(e) => setNewPrice40(e.target.value)}
                placeholder="40jt"
                className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-mono-tabular text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            <div className="col-span-12 md:col-span-2">
              <button
                type="submit"
                disabled={!newName.trim()}
                className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                Tambah
              </button>
            </div>
          </form>
        </div>

        {/* Search Input */}
        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari barang atau satuan (cth: besi 10, 10 ulir)..."
              aria-label="Cari database barang"
              className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        {/* Product List Table */}
        <div className="flex-1 overflow-auto px-5 py-3">
          {products.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">
                Database barang masih kosong
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Klik &ldquo;Impor Excel (.xlsx / .csv)&rdquo; untuk mengunggah file database dengan sheet satuan, katalog, 5jt, 10jt, 20jt, dan 40jt, atau tambahkan manual di atas.
              </p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Tidak ada barang yang cocok dengan &ldquo;{searchQuery}&rdquo;.
            </p>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="py-2 pr-2 w-8">#</th>
                  <th className="py-2 pr-3">Nama Barang</th>
                  <th className="py-2 px-2 w-14 text-center">Satuan</th>
                  <th className="py-2 px-2 w-24 text-right">Katalog</th>
                  <th className="py-2 px-2 w-22 text-right">5jt</th>
                  <th className="py-2 px-2 w-22 text-right">10jt</th>
                  <th className="py-2 px-2 w-22 text-right">20jt</th>
                  <th className="py-2 px-2 w-22 text-right">40jt</th>
                  <th className="py-2 pl-2 w-9 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((product, index) => (
                  <tr key={product.id} className="hover:bg-slate-50">
                    <td className="py-2 pr-2 text-slate-400 font-mono-tabular">{index + 1}</td>
                    <td className="py-2 pr-3 font-medium text-slate-900">{product.name}</td>
                    <td className="py-2 px-2 text-center font-semibold text-slate-700">
                      {product.unit}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-slate-800">
                      {formatCellPrice(product.defaultPrice)}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-slate-600">
                      {formatCellPrice(product.tierPrices?.['5'])}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-slate-600">
                      {formatCellPrice(product.tierPrices?.['10'])}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-slate-600">
                      {formatCellPrice(product.tierPrices?.['20'])}
                    </td>
                    <td className="py-2 px-2 text-right font-mono-tabular text-slate-600">
                      {formatCellPrice(product.tierPrices?.['40'])}
                    </td>
                    <td className="py-2 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => onDeleteProduct(product.id)}
                        aria-label={`Hapus ${product.name} dari database`}
                        className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
