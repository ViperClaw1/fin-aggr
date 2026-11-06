// Ingest calls this after a domain publish (ADR-019). Next 16.4 requires the cacheLife profile.
import { DATASET_DOMAINS, type DatasetDomain } from '@fa/contracts';
import { revalidateTag } from 'next/cache';

function isDomain(value: unknown): value is DatasetDomain {
  return typeof value === 'string' && (DATASET_DOMAINS as readonly string[]).includes(value);
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env['REVALIDATE_SECRET']?.trim();
  if (
    secret === undefined ||
    secret === '' ||
    request.headers.get('authorization') !== `Bearer ${secret}`
  ) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }
  const domain =
    typeof body === 'object' && body !== null && 'domain' in body ? body.domain : undefined;
  if (!isDomain(domain)) return Response.json({ error: 'unknown domain' }, { status: 400 });
  revalidateTag(domain, 'max');
  return Response.json({ revalidated: domain });
}
