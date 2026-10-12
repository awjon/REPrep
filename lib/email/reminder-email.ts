// Pure renderer for the grouped deadline reminder. Carries only address, label, date and link:
// never deal notes or document text.

export type ReminderItem = { dealId: string; address: string; label: string; dueAt: Date };

const FOOTER = 'Dates are computed — confirm against your signed contract.';

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/** "Wed, Oct 14 · 9:00 pm" in Pacific time. */
export function formatPacific(d: Date): string {
  const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.weekday}, ${p.month} ${p.day} · ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function renderReminderEmail(items: ReminderItem[], appUrl: string) {
  const base = appUrl.replace(/\/+$/, '');
  const sorted = [...items].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  const rows = sorted.map((i) => ({
    address: i.address,
    label: i.label,
    when: formatPacific(i.dueAt),
    link: `${base}/deals/${i.dealId}/deadlines`,
  }));
  const subject = `REPrep: ${rows.length} ${rows.length === 1 ? 'deadline' : 'deadlines'} coming up`;

  const text = [
    subject,
    '',
    ...rows.map((r) => `${r.address}\n  ${r.label} — ${r.when}\n  ${r.link}`),
    '',
    FOOTER,
  ].join('\n');

  const html = [
    '<div style="font-family:system-ui,sans-serif;max-width:480px">',
    `<h2 style="font-size:18px">${esc(subject)}</h2>`,
    '<ul style="padding-left:18px">',
    ...rows.map(
      (r) =>
        `<li style="margin-bottom:12px"><strong>${esc(r.address)}</strong><br>${esc(r.label)} — ${esc(r.when)}<br><a href="${esc(r.link)}">Open deadlines</a></li>`,
    ),
    '</ul>',
    `<p style="color:#666;font-size:12px">${FOOTER}</p>`,
    '</div>',
  ].join('\n');

  return { subject, text, html };
}
