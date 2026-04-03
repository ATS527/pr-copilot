export function chunkText(input: string, maxLength: number): string[] {
  if (input.length <= maxLength) {
    return [input];
  }

  const chunks: string[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    chunks.push(input.slice(cursor, cursor + maxLength));
    cursor += maxLength;
  }

  return chunks;
}
