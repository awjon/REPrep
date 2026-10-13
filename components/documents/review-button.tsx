'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { createLineParser } from '@/lib/documents/ndjson';
import { progressLabel, reviewErrorMessage, type ProgressEvent } from '@/lib/documents/messages';

const HTTP_CODES: Record<number, string> = { 401: 'unauthorized', 404: 'not_found', 409: 'already_running' };

export function ReviewButton({ documentId, hasReview, disabled }: { documentId: string; hasReview: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setRunning(true);
    setError(null);
    setStatus('Starting…');
    let finished = false;
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      if (!res.ok || !res.body) {
        setError(reviewErrorMessage(HTTP_CODES[res.status] ?? 'internal'));
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const parser = createLineParser();
      const handle = (msg: unknown) => {
        const m = msg as Record<string, unknown>;
        if (m.done === true) finished = true;
        else if (typeof m.error === 'string') {
          finished = true;
          setError(reviewErrorMessage(m.error));
        } else if (typeof m.stage === 'string') setStatus(progressLabel(m as ProgressEvent));
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.push(decoder.decode(value, { stream: true })).forEach(handle);
      }
      parser.flush().forEach(handle);
      if (!finished) setError(reviewErrorMessage('model_error'));
    } catch {
      setError(reviewErrorMessage('internal'));
    } finally {
      setRunning(false);
      setStatus(null);
      router.refresh();
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={start} disabled={running || disabled}>
        {running ? 'Reviewing…' : hasReview ? 'Review again' : 'Review this document'}
      </Button>
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {running ? status : ''}
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
