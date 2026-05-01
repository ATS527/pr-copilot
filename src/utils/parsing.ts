export function tryParseJson<T>(input: string): T | undefined {
  const normalized = normalizeJsonCandidate(input);

  try {
    return JSON.parse(normalized) as T;
  } catch {
    return undefined;
  }
}

function normalizeJsonCandidate(input: string): string {
  const trimmed = input.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  return trimmed;
}
