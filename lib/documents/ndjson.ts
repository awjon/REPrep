// Newline-delimited JSON for the review stream. Client and server share these.

export const encodeLine = (value: unknown): string => `${JSON.stringify(value)}\n`;

/** Incremental parser: feed text chunks, get complete parsed lines back. Bad lines are skipped. */
export function createLineParser(): { push(chunk: string): unknown[]; flush(): unknown[] } {
  let buf = '';
  const parse = (line: string): unknown[] => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  };
  return {
    push(chunk) {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop()!;
      return lines.flatMap(parse);
    },
    flush() {
      const rest = buf;
      buf = '';
      return parse(rest);
    },
  };
}
