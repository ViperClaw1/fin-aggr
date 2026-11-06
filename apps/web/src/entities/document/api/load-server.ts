import 'server-only';
import type { DocumentMeta, Id } from '@fa/contracts';
import { getGateway } from '@/shared/api';

export function loadDocument(id: Id): Promise<DocumentMeta> {
  return getGateway().getDocument(id);
}
