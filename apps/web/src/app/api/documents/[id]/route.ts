// Citation metadata for the browser. The page stays on our origin; Supabase is not called there.
import { GatewayError } from '@fa/contracts';
import { loadDocument } from '@/entities/document/queries';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  try {
    return Response.json(await loadDocument(id));
  } catch (error) {
    if (error instanceof GatewayError && error.code === 'not_found') {
      return Response.json({ error: 'not_found' }, { status: 404 });
    }
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
}
