/** Failure with a short machine string (goes in the response) and an HTTP status. */
export class IngestError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'IngestError';
  }
}
