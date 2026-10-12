import Link from 'next/link';
import { StatusBadge } from '@/components/ui/badge';
import { requireUser } from '@/lib/auth';
import { getDeal } from '../data';

export default async function DealLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDeal(user.id, id);
  return (
    <>
      <Link href="/deals" className="text-sm text-muted underline-offset-4 hover:underline">
        All properties
      </Link>
      <header className="mt-2 flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl leading-tight">{deal.address}</h1>
        <StatusBadge status={deal.status} />
      </header>
      {children}
    </>
  );
}
