'use client';

import { createClient } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/field';
import { checkUpload, DOC_TYPE_OPTIONS } from '@/lib/documents/validation';
import { finalizeUpload, prepareUpload } from '@/app/(app)/deals/[id]/documents/actions';

// The browser sends the file straight to storage with a signed upload token, so the request never
// passes through a Vercel function (and its ~4.5 MB body cap). The anon key is public by design;
// the token is what authorizes this one path.
export function UploadForm({ dealId }: { dealId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState('unknown');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose a PDF file first.');
    const check = checkUpload({ filename: file.name, sizeBytes: file.size });
    if (!check.ok) return setError(check.error);

    try {
      setBusy('Preparing…');
      const prep = await prepareUpload(dealId, { filename: file.name, sizeBytes: file.size, docType });
      if (!prep.ok) return setError(prep.error);

      setBusy('Uploading…');
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const up = await supabase.storage
        .from('documents')
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: 'application/pdf', upsert: false });
      if (up.error) return setError('The upload did not complete. Try again.');

      setBusy('Checking the file…');
      const fin = await finalizeUpload(dealId, { path: prep.path, filename: file.name, docType });
      if (!fin.ok) return setError(fin.error);

      if (fileRef.current) fileRef.current.value = '';
      router.push(`/deals/${dealId}/documents/${fin.documentId}`);
      router.refresh();
    } catch {
      setError('The upload did not complete. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-md border border-line bg-panel p-4">
      <h2 className="font-display text-lg">Add a document</h2>
      <div className="space-y-1.5">
        <label htmlFor="file" className="block text-sm font-medium">
          PDF file
        </label>
        <input
          ref={fileRef}
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-md file:border file:border-line file:bg-panel file:px-4 file:text-sm file:font-medium"
        />
        <p className="text-xs text-muted">Up to 30 MB. Files stay private to your account.</p>
      </div>
      <SelectField label="Document type" name="docType" value={docType} onChange={(e) => setDocType(e.target.value)}>
        {DOC_TYPE_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </SelectField>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy !== null}>
        {busy ?? 'Upload'}
      </Button>
    </form>
  );
}
