/**
 * Parses a JSON response body defensively (never throws, even on empty or
 * non-JSON bodies) and returns it typed against the caller's expectation.
 */
export async function jsonSafe<T extends object>(res: Response, fallback: T = {} as T): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
}