import { apiFile } from '@/lib/server/api';

/**
 * Streams a KYC document from the API to a platform reviewer. The API checks the reviewer's role
 * and audits the access; this handler only forwards the session token and the file.
 */
export async function GET(
  _: Request,
  { params }: RouteContext<'/admin/applications/[applicationId]/documents/[documentId]'>,
) {
  const { applicationId, documentId } = await params;
  const upstream = await apiFile(
    `/admin/applications/${encodeURIComponent(applicationId)}/documents/${encodeURIComponent(documentId)}/file`,
  );
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
