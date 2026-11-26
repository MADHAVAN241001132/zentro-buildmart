/** A file download response with the headers every export uses: attachment, no caching, no MIME sniffing. */
export function attachment(name: string, type: string, body: BodyInit): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Disposition': `attachment; filename="${name.replace(/[^A-Za-z0-9._-]/g, '-')}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export const CSV_TYPE = 'text/csv; charset=utf-8';
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
