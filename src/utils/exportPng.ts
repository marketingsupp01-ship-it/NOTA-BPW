import type { CatalogProduct, InvoiceData } from '../types/invoice';
import {
  DEFAULT_CREATOR_COLOR,
  buildRecipientDisplayText,
  formatQtyDisplay,
  formatRupiahNumber,
  parseNumericInput,
  resolveInvoiceSummary,
  resolveItemPricing,
} from './invoiceLogic';

function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (!text) return [''];
  const paragraphs = text.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = words[0];
    for (let i = 1; i < words.length; i++) {
      const candidate = `${current} ${words[i]}`;
      if (ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * Renders the Proforma Invoice onto a high-DPI 1600x1131 (A4 Landscape ratio) canvas
 * matching the printed output.
 */
export function renderInvoiceToCanvas(
  data: InvoiceData,
  catalog: CatalogProduct[] = [],
): HTMLCanvasElement | null {
  const width = 1600;
  const height = 1131;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const fontFamily = '"Calibri", "Carlito", "Segoe UI", Arial, sans-serif';
  const { effectiveCode, showNormalRow, normalTotal, grandTotal } = resolveInvoiceSummary(
    data,
    catalog,
  );

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Corner identity blocks (Top-left customizable creator color, Bottom-right fixed black)
  ctx.fillStyle = data.creatorColor || DEFAULT_CREATOR_COLOR;
  ctx.fillRect(0, 0, 64, 34);
  ctx.fillStyle = '#000000';
  ctx.fillRect(width - 58, height - 34, 58, 34);

  const marginX = 64;
  const contentWidth = width - marginX * 2;

  const colWidths = [
    Math.round(contentWidth * 0.08),
    Math.round(contentWidth * 0.325),
    Math.round(contentWidth * 0.095),
    Math.round(contentWidth * 0.075),
    Math.round(contentWidth * 0.195),
    contentWidth -
      (Math.round(contentWidth * 0.08) +
        Math.round(contentWidth * 0.325) +
        Math.round(contentWidth * 0.095) +
        Math.round(contentWidth * 0.075) +
        Math.round(contentWidth * 0.195)),
  ];

  const colX: number[] = [];
  let accX = marginX;
  for (const w of colWidths) {
    colX.push(accX);
    accX += w;
  }
  const tableRight = marginX + contentWidth;

  // 1. Header: PROFORMA INVOICE Box (Left)
  const titleBoxX = marginX;
  const titleBoxY = 54;
  const titleBoxW = 362;
  const titleBoxH = 52;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(titleBoxX, titleBoxY, titleBoxW, titleBoxH);

  ctx.fillStyle = '#000000';
  ctx.font = `bold 25px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    data.documentTitle || 'PROFORMA INVOICE',
    titleBoxX + titleBoxW / 2,
    titleBoxY + titleBoxH / 2 + 1,
  );

  if (data.displayOptions.showInvoiceNumber && data.invoiceNumber.trim()) {
    ctx.font = `20px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`No: ${data.invoiceNumber.trim()}`, titleBoxX, titleBoxY + titleBoxH + 12);
  }

  // Header Right: Date & Kepada Yth. + Alamat Pemesan (Kecamatan)
  const rightHeaderX = colX[4] + 10;
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = `25px ${fontFamily}`;
  ctx.fillText(data.dateText.trim(), rightHeaderX, 46);
  ctx.fillText(data.recipientHeading || 'Kepada Yth.', rightHeaderX, 82);

  const recipientDisplay = buildRecipientDisplayText(data.recipientDetails, data.district ?? '');
  if (recipientDisplay) {
    ctx.font = `22px ${fontFamily}`;
    const recLines = wrapTextLines(ctx, recipientDisplay, tableRight - rightHeaderX - 8);
    recLines.slice(0, 4).forEach((line, idx) => {
      ctx.fillText(line, rightHeaderX, 118 + idx * 28);
    });
  }

  // 2. Main Table Geometry
  const tableTop = 258;
  const headerRowH = 44;
  const subtotalRowH = showNormalRow ? 40 : 0;
  const totalRowH = 42;
  const minBodyH = showNormalRow ? 502 : 542;

  ctx.font = `22px ${fontFamily}`;
  const lineH = 30;
  const measuredRows = data.items.map((item) => {
    const lines = wrapTextLines(ctx, item.name.trim(), colWidths[1] - 24);
    return {
      item,
      lines,
      rowH: Math.max(38, lines.length * lineH + 10),
    };
  });
  const totalItemsHeight = measuredRows.reduce((s, r) => s + r.rowH, 0) + 16;
  const bodyH = Math.max(minBodyH, totalItemsHeight);

  const bodyTop = tableTop + headerRowH;
  const footerSummaryTop = bodyTop + bodyH;
  const totalTop = footerSummaryTop + subtotalRowH;
  const tableBottom = totalTop + totalRowH;

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(marginX, tableTop, contentWidth, tableBottom - tableTop);

  ctx.beginPath();
  ctx.moveTo(marginX, bodyTop);
  ctx.lineTo(tableRight, bodyTop);
  ctx.moveTo(marginX, footerSummaryTop);
  ctx.lineTo(tableRight, footerSummaryTop);
  if (showNormalRow) {
    ctx.moveTo(marginX, totalTop);
    ctx.lineTo(tableRight, totalTop);
  }
  ctx.stroke();

  // Vertical dividers: cols 1..3 stop at footerSummaryTop; cols 4..5 run to tableBottom
  ctx.beginPath();
  for (let i = 1; i <= 3; i++) {
    ctx.moveTo(colX[i], tableTop);
    ctx.lineTo(colX[i], footerSummaryTop);
  }
  for (let i = 4; i <= 5; i++) {
    ctx.moveTo(colX[i], tableTop);
    ctx.lineTo(colX[i], tableBottom);
  }
  ctx.stroke();

  // Table Headers
  const headers = ['No', 'NAMA BARANG', 'Satuan', 'Qty', 'Harga', 'JUMLAH'];
  ctx.fillStyle = '#000000';
  ctx.font = `bold 25px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  headers.forEach((h, i) => {
    ctx.fillText(h, colX[i] + colWidths[i] / 2, tableTop + headerRowH / 2 + 1);
  });

  // Table Body Rows
  let curY = bodyTop + 8;
  measuredRows.forEach((row, idx) => {
    const { item, lines, rowH } = row;
    const resolved = resolveItemPricing(item, effectiveCode, catalog);
    const hasQty = item.qty.trim() !== '';

    ctx.fillStyle = '#000000';
    ctx.font = `23px ${fontFamily}`;
    ctx.textBaseline = 'top';

    ctx.textAlign = 'center';
    ctx.fillText(`${idx + 1}`, colX[0] + colWidths[0] / 2, curY + 4);

    ctx.textAlign = 'left';
    lines.forEach((line, lIdx) => {
      if (line) {
        ctx.fillText(line, colX[1] + 12, curY + 4 + lIdx * lineH);
      }
    });

    if (item.unit.trim()) {
      ctx.textAlign = 'center';
      ctx.fillText(item.unit.trim(), colX[2] + colWidths[2] / 2, curY + 4);
    }

    const qtyText = formatQtyDisplay(item.qty);
    if (qtyText) {
      ctx.textAlign = 'center';
      ctx.fillText(qtyText, colX[3] + colWidths[3] / 2, curY + 4);
    }

    if (resolved.sheetDisplayUnitPrice > 0 || resolved.hasAnyPrice) {
      ctx.textAlign = 'right';
      ctx.fillText(formatRupiahNumber(resolved.sheetDisplayUnitPrice), colX[5] - 12, curY + 4);
    }

    if (
      (hasQty || resolved.hasAnyPrice) &&
      (resolved.sheetDisplayLineTotal > 0 || (parseNumericInput(item.qty) > 0 && resolved.hasAnyPrice))
    ) {
      ctx.textAlign = 'left';
      ctx.fillText('Rp', colX[5] + 12, curY + 4);
      ctx.textAlign = 'right';
      ctx.fillText(formatRupiahNumber(resolved.sheetDisplayLineTotal), tableRight - 14, curY + 4);
    }

    if (data.displayOptions.showRowDividers && idx < measuredRows.length - 1) {
      ctx.save();
      ctx.strokeStyle = '#d4d4d8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(marginX, curY + rowH - 2);
      ctx.lineTo(tableRight, curY + rowH - 2);
      ctx.stroke();
      ctx.restore();
    }

    curY += rowH;
  });

  // Normal Price Row (hidden when TB)
  if (showNormalRow) {
    ctx.fillStyle = '#000000';
    ctx.font = `bold 21px ${fontFamily}`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(
      data.subtotalLabel.trim() || 'HARGA NORMAL',
      colX[4] + colWidths[4] / 2,
      footerSummaryTop + subtotalRowH / 2 + 1,
    );
    ctx.font = `23px ${fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText('Rp', colX[5] + 12, footerSummaryTop + subtotalRowH / 2 + 1);
    ctx.textAlign = 'right';
    ctx.fillText(formatRupiahNumber(normalTotal), tableRight - 14, footerSummaryTop + subtotalRowH / 2 + 1);
  }

  // Total Row
  ctx.fillStyle = '#000000';
  ctx.font = `bold 25px ${fontFamily}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(data.totalLabel || 'TOTAL', colX[4] + colWidths[4] / 2, totalTop + totalRowH / 2 + 1);
  ctx.textAlign = 'left';
  ctx.fillText('Rp', colX[5] + 12, totalTop + totalRowH / 2 + 1);
  ctx.textAlign = 'right';
  ctx.fillText(formatRupiahNumber(grandTotal), tableRight - 14, totalTop + totalRowH / 2 + 1);

  // 3. Footer
  const footerTop = tableBottom + 42;
  const attBoxW = colWidths[0] + colWidths[1] + colWidths[2] + Math.round(colWidths[3] * 0.15);
  const attBoxH = 166;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.6;
  ctx.strokeRect(marginX, footerTop, attBoxW, attBoxH);

  const attTitle = data.attentionTitle || 'PERHATIAN :';
  ctx.fillStyle = '#000000';
  ctx.font = `bold 22px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const titleCenterX = marginX + attBoxW / 2;
  const titleY = footerTop + 14;
  ctx.fillText(attTitle, titleCenterX, titleY);
  const titleWidth = ctx.measureText(attTitle).width;
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  ctx.moveTo(titleCenterX - titleWidth / 2, titleY + 25);
  ctx.lineTo(titleCenterX + titleWidth / 2, titleY + 25);
  ctx.stroke();

  ctx.textAlign = 'left';
  data.attentionLines.slice(0, 3).forEach((line, idx) => {
    const y = footerTop + 56 + idx * 36;
    let x = marginX + 12;
    const prefixText = `${idx + 1}. ${line.prefix}`;
    ctx.font = `18px ${fontFamily}`;
    ctx.fillText(prefixText, x, y);
    x += ctx.measureText(prefixText).width;

    if (line.boldPart) {
      ctx.font = `bold 18px ${fontFamily}`;
      ctx.fillText(line.boldPart, x, y);
      x += ctx.measureText(line.boldPart).width;
    }
    if (line.suffix) {
      ctx.font = `18px ${fontFamily}`;
      ctx.fillText(line.suffix, x, y);
    }
  });

  const sigX = colX[4] + 56;
  ctx.fillStyle = '#000000';
  ctx.font = `24px ${fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(data.signatureGreeting || 'Hormat Kami,', sigX, footerTop + 8);

  if (data.signatureName.trim()) {
    ctx.font = `22px ${fontFamily}`;
    ctx.fillText(data.signatureName.trim(), sigX, footerTop + 128);
  }

  return canvas;
}

function triggerCanvasPngDownload(canvas: HTMLCanvasElement, data: InvoiceData): void {
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = `proforma-invoice-${(data.dateText || 'horizontal').toLowerCase().replace(/\s+/g, '-')}.png`;
  link.href = dataUrl;
  link.click();
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Gagal mengonversi nota ke PNG'));
    }, 'image/png');
  });
}

export function downloadInvoiceAsPng(data: InvoiceData, catalog: CatalogProduct[] = []): void {
  const canvas = renderInvoiceToCanvas(data, catalog);
  if (!canvas) return;
  triggerCanvasPngDownload(canvas, data);
}

/**
 * Renders the invoice to a crisp PNG and copies the image directly to the system clipboard
 * so Ctrl+V pastes the PNG image. Falls back to downloading the PNG if clipboard image write is blocked.
 */
export async function copyInvoicePngToClipboard(
  data: InvoiceData,
  catalog: CatalogProduct[] = [],
): Promise<'copied' | 'downloaded-fallback'> {
  const canvas = renderInvoiceToCanvas(data, catalog);
  if (!canvas) {
    throw new Error('Gagal membuat canvas nota');
  }

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  ) {
    // Pass Promise<Blob> immediately within the user click activation frame
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': canvasToPngBlob(canvas) }),
      ]);
      return 'copied';
    } catch {
      try {
        const blob = await canvasToPngBlob(canvas);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return 'copied';
      } catch {
        // Clipboard permission denied or unsupported in this iframe/browser -> download PNG fallback
      }
    }
  }

  triggerCanvasPngDownload(canvas, data);
  return 'downloaded-fallback';
}
