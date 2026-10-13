import { currentUser } from '@/lib/auth';
import { withUser } from '@/lib/db/client';
import { getSavedTermSheet } from '@/lib/term-sheet/queries';
import { renderTermSheetPdf, shortAddress } from '@/lib/term-sheet/pdf';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!UUID.test(id)) return new Response(null, { status: 404 });

  // RLS hides other users' deals and term sheets, so both look like "not found".
  const saved = await withUser(user.id, (tx) => getSavedTermSheet(tx, id));
  if (!saved) return new Response(null, { status: 404 });

  const bytes = await renderTermSheetPdf(saved.data, {
    preparedOn: new Date().toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
  });
  return new Response(Buffer.from(bytes), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="term-sheet-${shortAddress(saved.data.property.address)}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
}
