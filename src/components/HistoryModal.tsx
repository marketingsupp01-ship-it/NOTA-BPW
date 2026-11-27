import { useState } from 'react';
import { FileText, Search, Trash2, X } from 'lucide-react';
import type { SavedInvoiceRecord } from '../types/invoice';
import { formatDistrictAddress, formatRupiahNumber } from '../utils/invoiceLogic';

interface HistoryModalProps {
  isOpen: boolean;
  records: SavedInvoiceRecord[];
  activeRecordId?: string | null;
  onClose: () => void;
  onLoad: (record: SavedInvoiceRecord) => void;
  onDelete: (id: string) => void;
}

export function HistoryModal({
  isOpen,
  records,
  activeRecordId = null,
  onClose,
  onLoad,
  onDelete,
}: HistoryModalProps) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const filtered = records.filter((rec) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const districtLabel = (rec.data.district ?? rec.data.city ?? '').toLowerCase();
    return (
      rec.label.toLowerCase().includes(q) ||
      rec.data.dateText.toLowerCase().includes(q) ||
      districtLabel.includes(q)
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 no-print"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl flex flex-col max-h-[82vh]">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="history-modal-title" className="text-base font-semibold text-slate-900">
              Riwayat Invoice Tersimpan
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik nota mana pun untuk mengeditnya kembali secara langsung tanpa membuat nota baru.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup riwayat invoice"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search
              className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari pemesan, kecamatan, atau tanggal..."
              aria-label="Cari riwayat invoice"
              className="w-full rounded-md border border-slate-300 pl-9 pr-3 py-1.5 text-sm text-slate-900 focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {records.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <FileText className="w-8 h-8 text-slate-300 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-slate-700">
                Belum ada invoice tersimpan
              </p>
              <p className="text-xs text-slate-500">
                Klik tombol &ldquo;Simpan&rdquo; untuk menyimpan salinan Proforma Invoice ini.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Tidak ada hasil yang cocok untuk &ldquo;{query}&rdquo;.
            </p>
          ) : (
            filtered.map((rec) => {
              const districtDisplay = formatDistrictAddress(rec.data.district ?? '');
              const isEditingThis = activeRecordId === rec.id;
              return (
                <div
                  key={rec.id}
                  data-testid={`history-record-${rec.id}`}
                  className={`flex items-center justify-between gap-2 rounded-lg border transition-colors ${
                    isEditingThis
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 hover:border-slate-400 bg-white'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onLoad(rec);
                      onClose();
                    }}
                    className="flex-1 min-w-0 px-3.5 py-3 text-left flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {rec.label}
                        </p>
                        {isEditingThis && (
                          <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-white shrink-0">
                            Sedang Diedit
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                        {[districtDisplay, rec.data.dateText].filter(Boolean).join(' · ')} ·{' '}
                        {rec.data.items.filter((i) => i.name.trim() || i.qty.trim() || i.price.trim()).length}{' '}
                        baris · Rp {formatRupiahNumber(rec.total)}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-slate-700 shrink-0">
                      Edit Nota
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(rec.id)}
                    aria-label={`Hapus riwayat ${rec.label}`}
                    className="mr-2 rounded-md p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
