// The only `fetch` in the app (ESLint). Callers stay on our origin.

export async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url);
  const body: unknown = await response.json().catch(() => null);
  return { status: response.status, body };
}
