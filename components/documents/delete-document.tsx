import { SubmitButton } from '@/components/ui/submit-button';

/** Hard delete; the action removes the stored file as well as the record. */
export function DeleteDocument({ action, label = 'Delete' }: { action: () => Promise<void>; label?: string }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-danger">{label}</summary>
      <form action={action} className="space-y-2 pb-2">
        <p className="text-sm">This removes the file and any review results. It cannot be undone.</p>
        <SubmitButton variant="danger" pendingLabel="Deleting…">
          Yes, delete
        </SubmitButton>
      </form>
    </details>
  );
}
