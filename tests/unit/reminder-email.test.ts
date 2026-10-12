import { describe, expect, it } from 'vitest';
import { findBanned } from '@/lib/legal/banned-phrases';
import { formatPacific, renderReminderEmail } from '@/lib/email/reminder-email';

describe('formatPacific', () => {
  it('formats in Pacific time, PDT and PST', () => {
    expect(formatPacific(new Date('2026-10-15T04:00:00Z'))).toBe('Wed, Oct 14 · 9:00 pm');
    expect(formatPacific(new Date('2026-12-01T05:00:00Z'))).toBe('Mon, Nov 30 · 9:00 pm');
    expect(formatPacific(new Date('2026-10-14T16:00:00Z'))).toBe('Wed, Oct 14 · 9:00 am');
  });
});

describe('renderReminderEmail', () => {
  const items = [
    { dealId: 'd2', address: '9 <b>Elm</b> St', label: 'Financing', dueAt: new Date('2026-10-16T04:00:00Z') },
    { dealId: 'd1', address: '1 Oak Ave', label: 'Inspection', dueAt: new Date('2026-10-15T04:00:00Z') },
  ];
  const out = renderReminderEmail(items, 'https://app.example.com/');

  it('pluralises the subject', () => {
    expect(out.subject).toBe('REPrep: 2 deadlines coming up');
    expect(renderReminderEmail([items[0]!], 'https://x.test').subject).toBe('REPrep: 1 deadline coming up');
  });
  it('lists items by due date with links and footer', () => {
    expect(out.text.indexOf('1 Oak Ave')).toBeLessThan(out.text.indexOf('9 <b>Elm</b> St'));
    expect(out.text).toContain('Inspection — Wed, Oct 14 · 9:00 pm');
    expect(out.text).toContain('https://app.example.com/deals/d1/deadlines');
    expect(out.text).toContain('Dates are computed — confirm against your signed contract.');
    expect(out.html).toContain('href="https://app.example.com/deals/d2/deadlines"');
  });
  it('escapes HTML in user-entered addresses', () => {
    expect(out.html).toContain('9 &lt;b&gt;Elm&lt;/b&gt; St');
    expect(out.html).not.toContain('<b>Elm');
  });
  it('contains no banned phrases', () => {
    expect(findBanned(out.text)).toEqual([]);
    expect(findBanned(out.subject)).toEqual([]);
  });
});
