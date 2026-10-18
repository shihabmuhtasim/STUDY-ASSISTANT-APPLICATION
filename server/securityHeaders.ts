export function secureResponse(request: Request, response: Response) {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(self)');
  headers.set('cross-origin-opener-policy', 'same-origin-allow-popups');
  headers.set('content-security-policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
  if (new URL(request.url).protocol === 'https:') headers.set('strict-transport-security', 'max-age=15552000');
  if (new URL(request.url).pathname.startsWith('/api/')) {
    headers.set('cache-control', 'private, no-store');
    headers.set('pragma', 'no-cache');
    headers.append('vary', 'Authorization, Origin');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
