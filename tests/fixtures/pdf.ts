// Builds small text PDFs for tests and evals. Synthetic content only — no real forms or reports.

import { PDFDocument, StandardFonts } from 'pdf-lib';

export async function makePdf(pages: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const text of pages) {
    const page = doc.addPage([612, 792]);
    let y = 740;
    for (const para of text.split('\n')) {
      // naive wrap at ~90 chars
      const words = para.split(' ');
      let line = '';
      for (const w of words) {
        if ((line + ' ' + w).length > 90) {
          page.drawText(line, { x: 50, y, size: 10, font });
          y -= 14;
          line = w;
        } else line = line ? `${line} ${w}` : w;
      }
      page.drawText(line, { x: 50, y, size: 10, font });
      y -= 18;
    }
  }
  return doc.save();
}

export async function makeBlankPdf(pageCount: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([612, 792]);
  return doc.save();
}

export const SAMPLE_DISCLOSURE = [
  `SELLER DISCLOSURE STATEMENT (sample for testing)
Property: 100 Example Ave SW, Seattle, WA
1. Has there been any water leakage or seepage in the basement? YES. Explanation: Water came in along the north wall during heavy rain in 2023; seller installed a sump pump.
2. Is the property connected to a public sewer system? DON'T KNOW.`,
  `3. Are there any underground storage tanks, including heating oil tanks? YES. An oil tank was decommissioned in place in 2019; certificate attached.
4. Have any additions or conversions been made without permits? NO.
5. Are there any encroachments or boundary disputes? The neighbor's fence sits about two feet onto the east side of the lot.`,
  `6. Is the property subject to a homeowners association? NO.
7. Has the roof been replaced? The roof was replaced in 2011.`,
];
