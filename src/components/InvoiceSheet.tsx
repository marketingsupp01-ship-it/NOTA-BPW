import type { CatalogProduct, InvoiceData } from '../types/invoice';
import {
  DEFAULT_CREATOR_COLOR,
  buildRecipientDisplayText,
  formatQtyDisplay,
  formatRupiahNumber,
  parseNumericInput,
  resolveInvoiceSummary,
  resolveItemPricing,
} from '../utils/invoiceLogic';

interface InvoiceSheetProps {
  data: InvoiceData;
  catalog?: CatalogProduct[];
  scale?: number;
}

export const SHEET_WIDTH_PX = 1122; // 297mm at 96dpi (A4 Landscape width)
export const SHEET_HEIGHT_PX = 794; // 210mm at 96dpi (A4 Landscape height)

export function InvoiceSheet({ data, catalog = [], scale = 1 }: InvoiceSheetProps) {
  const { effectiveCode, showNormalRow, normalTotal, grandTotal } = resolveInvoiceSummary(
    data,
    catalog,
  );
  const recipientDisplay = buildRecipientDisplayText(data.recipientDetails, data.district ?? '');

  return (
    <div
      className="print-only-sheet-wrapper relative shrink-0"
      style={{
        width: `${Math.round(SHEET_WIDTH_PX * scale)}px`,
        height: `${Math.round(SHEET_HEIGHT_PX * scale)}px`,
      }}
    >
      <article
        aria-label="Pratinjau Dokumen Proforma Invoice Horizontal"
        data-testid="invoice-sheet"
        className="invoice-sheet-root invoice-sheet-font relative bg-white text-black shadow-[0_8px_30px_rgba(15,23,42,0.12)] ring-1 ring-slate-300/80 origin-top-left select-text"
        style={{
          width: `${SHEET_WIDTH_PX}px`,
          height: `${SHEET_HEIGHT_PX}px`,
          transform: `scale(${scale})`,
          padding: '34px 44px 30px 44px',
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
        }}
      >
        {/* Top-left creator identity color block */}
        <div
          data-testid="sheet-creator-color-block"
          aria-hidden="true"
          className="absolute top-0 left-0 pointer-events-none"
          style={{
            width: '44px',
            height: '24px',
            backgroundColor: data.creatorColor || DEFAULT_CREATOR_COLOR,
          }}
        />

        {/* Bottom-right fixed black corner block */}
        <div
          data-testid="sheet-bottom-right-block"
          aria-hidden="true"
          className="absolute bottom-0 right-0 pointer-events-none"
          style={{
            width: '40px',
            height: '24px',
            backgroundColor: '#000000',
          }}
        />

        {/* Top Header Section */}
        <header className="relative flex items-start justify-between min-h-[126px]">
          <div className="w-[57.5%] pr-6">
            <div
              className="inline-flex items-center justify-center border border-black px-8 h-[36px] min-w-[254px]"
              style={{ borderWidth: '1px' }}
            >
              <span className="text-[18px] font-bold tracking-[0.01em] text-black leading-none">
                {data.documentTitle || 'PROFORMA INVOICE'}
              </span>
            </div>

            {data.displayOptions.showInvoiceNumber && data.invoiceNumber.trim() && (
              <p className="mt-2.5 text-[15px] text-black leading-snug">
                No: <span className="font-semibold">{data.invoiceNumber.trim()}</span>
              </p>
            )}
          </div>

          {/* Right Header aligned at 57.5% (directly over Harga column start) */}
          <div className="w-[42.5%] pl-2 -mt-1 text-left">
            <p className="text-[18px] text-black leading-[1.36] font-normal">
              {data.dateText.trim()}
            </p>
            <p className="text-[18px] text-black leading-[1.36] font-normal">
              {data.recipientHeading || 'Kepada Yth.'}
            </p>
            {recipientDisplay && (
              <p
                data-testid="sheet-recipient-address"
                className="mt-0.5 text-[16px] text-black leading-[1.32] whitespace-pre-line break-words"
              >
                {recipientDisplay}
              </p>
            )}
          </div>
        </header>

        {/* Main Item Table */}
        <section className="flex flex-col">
          <table
            className="w-full border-collapse border border-black table-fixed"
            style={{ height: '422px' }}
          >
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '32.5%' }} />
              <col style={{ width: '9.5%' }} />
              <col style={{ width: '7.5%' }} />
              <col style={{ width: '19.5%' }} />
              <col style={{ width: '23%' }} />
            </colgroup>

            <thead>
              <tr className="h-[32px]">
                <th className="border border-black text-center font-bold text-[18px] leading-none px-1 py-1 text-black">
                  No
                </th>
                <th className="border border-black text-center font-bold text-[18px] leading-none px-2 py-1 text-black">
                  NAMA BARANG
                </th>
                <th className="border border-black text-center font-bold text-[18px] leading-none px-1 py-1 text-black">
                  Satuan
                </th>
                <th className="border border-black text-center font-bold text-[18px] leading-none px-1 py-1 text-black">
                  Qty
                </th>
                <th className="border border-black text-center font-bold text-[18px] leading-none px-2 py-1 text-black">
                  Harga
                </th>
                <th className="border border-black text-center font-bold text-[18px] leading-none px-2 py-1 text-black">
                  JUMLAH
                </th>
              </tr>
            </thead>

            <tbody>
              {data.items.map((item, idx) => {
                const resolved = resolveItemPricing(item, effectiveCode, catalog);
                const hasQty = item.qty.trim() !== '';
                const qtyText = formatQtyDisplay(item.qty);
                const dividerClass =
                  data.displayOptions.showRowDividers && idx < data.items.length - 1
                    ? 'border-b border-slate-300'
                    : '';

                return (
                  <tr key={item.id} className="h-[28px] align-top">
                    <td
                      className={`border-x border-black text-center text-[16.5px] leading-[1.35] px-1 pt-1.5 pb-1 text-black tabular-nums ${dividerClass}`}
                    >
                      {idx + 1}
                    </td>
                    <td
                      className={`border-x border-black text-left text-[16.5px] leading-[1.35] px-2.5 pt-1.5 pb-1 text-black break-words whitespace-pre-line ${dividerClass}`}
                    >
                      {item.name}
                    </td>
                    <td
                      className={`border-x border-black text-center text-[16.5px] leading-[1.35] px-1.5 pt-1.5 pb-1 text-black ${dividerClass}`}
                    >
                      {item.unit}
                    </td>
                    <td
                      className={`border-x border-black text-center text-[16.5px] leading-[1.35] px-1.5 pt-1.5 pb-1 text-black tabular-nums ${dividerClass}`}
                    >
                      {qtyText}
                    </td>
                    <td
                      className={`border-x border-black text-right text-[16.5px] leading-[1.35] px-2.5 pt-1.5 pb-1 text-black tabular-nums ${dividerClass}`}
                    >
                      {resolved.sheetDisplayUnitPrice > 0
                        ? formatRupiahNumber(resolved.sheetDisplayUnitPrice)
                        : resolved.hasAnyPrice
                          ? '-'
                          : ''}
                    </td>
                    <td
                      className={`border-x border-black text-[16.5px] leading-[1.35] px-2.5 pt-1.5 pb-1 text-black tabular-nums ${dividerClass}`}
                    >
                      {(hasQty || resolved.hasAnyPrice) &&
                      (resolved.sheetDisplayLineTotal > 0 ||
                        (parseNumericInput(item.qty) > 0 && resolved.hasAnyPrice)) ? (
                        <div className="flex items-center justify-between w-full">
                          <span>Rp</span>
                          <span>{formatRupiahNumber(resolved.sheetDisplayLineTotal)}</span>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}

              {/* Stretches remaining vertical column borders down to bottom summary */}
              <tr className="h-full" aria-hidden="true">
                <td className="border-x border-black">&nbsp;</td>
                <td className="border-x border-black">&nbsp;</td>
                <td className="border-x border-black">&nbsp;</td>
                <td className="border-x border-black">&nbsp;</td>
                <td className="border-x border-black">&nbsp;</td>
                <td className="border-x border-black">&nbsp;</td>
              </tr>
            </tbody>

            <tfoot>
              {/* Normal Price Row: hidden when Kode is TB ("tidak tampil harga normal hanya ada total") */}
              {showNormalRow && (
                <tr className="h-[29px]" data-testid="sheet-normal-row">
                  <td colSpan={4} className="border border-black px-2" />
                  <td className="border border-black text-center font-semibold text-[15px] leading-none px-2 text-black">
                    {data.subtotalLabel.trim() || 'HARGA NORMAL'}
                  </td>
                  <td className="border border-black px-2.5 text-[16px] text-black tabular-nums">
                    <div className="flex items-center justify-between w-full">
                      <span>Rp</span>
                      <span>{formatRupiahNumber(normalTotal)}</span>
                    </div>
                  </td>
                </tr>
              )}

              {/* TOTAL Row */}
              <tr className="h-[31px]" data-testid="sheet-total-row">
                <td colSpan={4} className="border border-black px-2" />
                <td className="border border-black text-center font-bold text-[18px] leading-none px-2 text-black">
                  {data.totalLabel || 'TOTAL'}
                </td>
                <td className="border border-black px-2.5 font-bold text-[18px] leading-none text-black tabular-nums">
                  <div className="flex items-center justify-between w-full">
                    <span>Rp</span>
                    <span>{formatRupiahNumber(grandTotal)}</span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {/* Footer: PERHATIAN Box (Left) & Hormat Kami (Right) */}
        <footer className="mt-7 flex items-start justify-between">
          <div className="w-[50%] border border-black px-3 pt-2.5 pb-3 min-h-[114px]">
            <p className="text-center font-bold underline text-[16px] text-black leading-tight">
              {data.attentionTitle || 'PERHATIAN :'}
            </p>
            <ol className="mt-2.5 space-y-2 text-[13px] leading-[1.35] text-black list-none p-0 m-0">
              {data.attentionLines.map((line, index) => (
                <li key={line.id}>
                  <span>
                    {index + 1}. {line.prefix}
                  </span>
                  {line.boldPart && (
                    <strong className="font-bold">{line.boldPart}</strong>
                  )}
                  {line.suffix && <span>{line.suffix}</span>}
                </li>
              ))}
            </ol>
          </div>

          <div className="w-[42.5%] pl-8 pt-1 flex flex-col justify-between min-h-[114px]">
            <p className="text-[17.5px] text-black leading-snug">
              {data.signatureGreeting || 'Hormat Kami,'}
            </p>
            {data.signatureName.trim() && (
              <p className="mt-14 text-[16px] text-black leading-snug">
                {data.signatureName.trim()}
              </p>
            )}
          </div>
        </footer>
      </article>
    </div>
  );
}
