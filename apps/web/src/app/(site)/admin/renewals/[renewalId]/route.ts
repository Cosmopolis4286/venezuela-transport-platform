import { apiFile } from '@/lib/server/api';

/**
 * Streams a renewed document (ADR-042) from the API to a platform reviewer. The API checks the
 * reviewer's role and audits the access; this handler only forwards the session token and file.
 */
export async function GET(_: Request, { params }: RouteContext<'/admin/renewals/[renewalId]'>) {
  const { renewalId } = await params;
  const upstream = await apiFile(`/admin/document-renewals/${encodeURIComponent(renewalId)}/file`);
  if (!upstream.ok || !upstream.body) {
    return new Response(upstream.status === 404 ? 'No encontrado' : 'No autorizado', {
      status: upstream.status === 404 ? 404 : 403,
    });
  }
  const headers = new Headers({ 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  for (const name of ['content-type', 'content-disposition']) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: 200, headers });
}
