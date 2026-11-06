import { GatewayError, type DocumentMeta, type Id } from '@fa/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getGateway } from '@/shared/api/browser';
import { getJson } from '@/shared/api/http';
import { env } from '@/shared/config';
import { STALE_TIME } from '@/shared/lib/query-client';

function isDocument(body: unknown): body is DocumentMeta {
  return typeof body === 'object' && body !== null && 'id' in body && 'pages' in body;
}

/** The browser asks our origin. It never opens a connection to Supabase (ADR-019). */
async function documentInBrowser(id: Id): Promise<DocumentMeta> {
  const { status, body } = await getJson(`/api/documents/${encodeURIComponent(id)}`);
  if (status === 404) throw new GatewayError('not_found', 'document not found', false);
  if (status !== 200 || !isDocument(body)) {
    throw new GatewayError('unavailable', 'document request failed', true);
  }
  return body;
}

export const documentQuery = (id: Id) =>
  queryOptions({
    queryKey: ['documents', id] as const,
    queryFn: () =>
      env.dataSource === 'supabase' && typeof window !== 'undefined'
        ? documentInBrowser(id)
        : getGateway().getDocument(id),
    staleTime: STALE_TIME.documents,
  });
