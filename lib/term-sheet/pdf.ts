// Term sheet PDF in REPrep's own layout. Pure: data in, bytes out. Standard fonts only.
// Deliberately plain: labelled rows under headings, no numbering, no clause text, no signature lines.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DISCLAIMER_TEXT } from '@/lib/legal/disclaimer';
import { FINANCING_LABELS, type TermSheetData } from './schema';

const PAGE_W = 612;
const PAGE_H = 792;
const M = 54;
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 64;
const LABEL_W = 150;
const INK = rgb(0.1, 0.1, 0.12);
const MUTED = rgb(0.38, 0.38, 0.42);
const RULE = rgb(0.8, 0.8, 0.83);

export const TERM_SHEET_SUBTITLE = 'Summary of terms under consideration — for discussion with an attorney. Not a contract.';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const money = (n: number | null) => (n === null ? 'Not entered' : usd.format(n));
function date(ymd: string | null): string {
  const m = ymd ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd) : null;
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : 'Not entered';
}
const dayWord = (n: number | null) => (n === 1 ? '1 day' : `${n ?? '?'} days`);

const REPLACE: Record<string, string> = {
  '‘': "'", '’': "'", '“': '"', '”': '"', '–': '-', '—': '-', '…': '...',
  ' ': ' ', '\t': ' ',
};

/** Standard fonts cover WinAnsi only; anything else becomes '?' rather than failing the export. */
function clean(text: string, font: PDFFont): string {
  let out = '';
  for (const raw of text.replace(/\r\n?/g, '\n')) {
    const ch = REPLACE[raw] ?? raw;
    if (ch === '\n') {
      out += ch;
      continue;
    }
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += '?';
    }
  }
  return out;
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of clean(text, font).split('\n')) {
    let line = '';
    for (const word of para.split(' ').filter(Boolean)) {
      let w = word;
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) <= width) {
        line = test;
        continue;
      }
      if (line) out.push(line);
      line = '';
      while (font.widthOfTextAtSize(w, size) > width) {
        let n = w.length - 1;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n--;
        out.push(w.slice(0, n));
        w = w.slice(n);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

export async function renderTermSheetPdf(data: TermSheetData, opts: { preparedOn?: string } = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.setTitle('Term sheet');
  doc.setProducer('REPrep');
  doc.setCreator('REPrep');

  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;
  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - M;
  };
  const room = (h: number) => {
    if (y - h < M + FOOTER_H) newPage();
  };
  const text = (s: string, x: number, size: number, font: PDFFont, color = INK) => {
    page.drawText(s, { x, y: y - size, size, font, color });
  };

  newPage();
  text('Term sheet', M, 24, bold);
  y -= 32;
  for (const l of wrap(TERM_SHEET_SUBTITLE, regular, 10, CONTENT_W)) {
    text(l, M, 10, regular, MUTED);
    y -= 14;
  }
  if (opts.preparedOn) {
    text(`Prepared ${opts.preparedOn}`, M, 9, regular, MUTED);
    y -= 13;
  }
  y -= 6;

  const heading = (title: string) => {
    room(60);
    y -= 12;
    text(title, M, 13, bold);
    y -= 19;
    page.drawLine({ start: { x: M, y: y + 3 }, end: { x: PAGE_W - M, y: y + 3 }, thickness: 0.6, color: RULE });
    y -= 6;
  };
  const row = (label: string, value: string) => {
    const size = 10;
    const lines = wrap(value, regular, size, CONTENT_W - LABEL_W);
    const labelLines = wrap(label, bold, size, LABEL_W - 10);
    const count = Math.max(lines.length, labelLines.length);
    for (let i = 0; i < count; i++) {
      room(15);
      if (labelLines[i]) text(labelLines[i]!, M, size, bold, MUTED);
      if (lines[i]) text(lines[i]!, M + LABEL_W, size, regular);
      y -= 14;
    }
    y -= 3;
  };
  const bullets = (label: string, items: string[]) => {
    if (items.length === 0) return row(label, 'None entered');
    row(label, '');
    for (const it of items) {
      const lines = wrap(it, regular, 10, CONTENT_W - 28);
      lines.forEach((l, i) => {
        room(15);
        if (i === 0) text('-', M + 12, 10, regular, MUTED);
        text(l, M + 24, 10, regular);
        y -= 14;
      });
    }
    y -= 3;
  };

  const c = data.contingencies;
  const incl = (x: { included: boolean; days?: number | null }) =>
    !x.included ? 'Not included' : x.days !== undefined ? `Included, ${dayWord(x.days)}` : 'Included';

  heading('Property');
  row('Address', data.property.address || 'Not entered');
  row('Parcel PIN', data.property.pin ?? 'Not entered');

  heading('Price and earnest money');
  row('Price under consideration', money(data.price));
  row('Earnest money', money(data.earnestMoney));
  row('Seller credit requested', data.sellerCredit === null ? 'None entered' : money(data.sellerCredit));
  row(
    'Escalation',
    data.escalation.enabled
      ? `On. Increment ${money(data.escalation.increment)}, cap ${money(data.escalation.cap)}`
      : 'Off',
  );

  heading('Financing');
  row('Type', FINANCING_LABELS[data.financing.type]);
  if (data.financing.type !== 'cash') {
    row('Down payment', data.financing.downPaymentPct === null ? 'Not entered' : `${data.financing.downPaymentPct}%`);
  }

  heading('Contingencies');
  row('Inspection', incl(c.inspection));
  row('Financing', incl(c.financing));
  row('Appraisal', incl(c.appraisal));
  row('Title review', incl(c.titleReview));
  row("Sale of buyer's home", incl(c.saleOfBuyersHome));
  row('HOA document review', incl(c.hoaReview));
  row(
    'Seller disclosure review',
    c.sellerDisclosureNote
      ? `Shown as the statutory review period. Note: ${c.sellerDisclosureNote}`
      : 'Shown as the statutory review period.',
  );

  heading('Dates');
  row('Closing date', date(data.closingDate));
  row('Possession', data.possession.mode === 'days_after' ? `${dayWord(data.possession.days)} after closing` : 'On closing');

  heading('Included and excluded items');
  bullets('Included', data.itemsIncluded);
  bullets('Excluded', data.itemsExcluded);

  heading('Notes and questions for the attorney');
  row('Notes', data.notes || 'None entered');
  bullets('Questions', data.questions);

  // Footer with the disclaimer and page numbers, on every page.
  const total = pages.length;
  const disclaimer = wrap(DISCLAIMER_TEXT['term-sheet'], regular, 8, CONTENT_W);
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 44 }, end: { x: PAGE_W - M, y: M + 44 }, thickness: 0.6, color: RULE });
    disclaimer.forEach((l, k) => p.drawText(l, { x: M, y: M + 32 - k * 11, size: 8, font: regular, color: MUTED }));
    p.drawText(`Page ${i + 1} of ${total}`, { x: PAGE_W - M - 60, y: M + 4, size: 8, font: regular, color: MUTED });
  });

  return doc.save();
}

/** Safe, short file name part from an address: "123 Alki Ave SW" -> "123-alki-ave-sw". */
export function shortAddress(address: string): string {
  const s = address
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
  return s || 'property';
}
