import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'fa.demo.gate';
const TEXT = new TextEncoder();

/** HMAC of a fixed label. The cookie is not the password, and it stops matching when the password changes. */
export async function demoGateToken(password: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    TEXT.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, TEXT.encode('fa-demo-gate'));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameSecret(given: string, expected: string): boolean {
  const givenBytes = TEXT.encode(given);
  const expectedBytes = TEXT.encode(expected);
  const length = Math.max(givenBytes.length, expectedBytes.length);
  let difference = givenBytes.length ^ expectedBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (givenBytes[index] ?? 0) ^ (expectedBytes[index] ?? 0);
  }
  return difference === 0;
}

function gatePage(rejected: boolean): NextResponse {
  const message = rejected ? '<p>Wrong password.</p>' : '';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>FA demo</title>
</head>
<body>
  <main>
    <h1>FA demo</h1>
    ${message}
    <form method="post">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required>
      <button type="submit">Continue</button>
    </form>
  </main>
</body>
</html>`;
  return new NextResponse(html, {
    status: 401,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/**
 * Asks for DEMO_PASSWORD before any page when that variable is set.
 * Unset (local dev, tests, Lighthouse) leaves the site open. The value is not a NEXT_PUBLIC_ variable.
 */
export async function demoGate(
  request: NextRequest,
  password: string | undefined,
): Promise<NextResponse> {
  const secret = password?.trim();
  if (secret === undefined || secret === '') return NextResponse.next();

  const token = await demoGateToken(secret);
  if (request.cookies.get(COOKIE)?.value === token) return NextResponse.next();

  if (request.method === 'POST') {
    const field = (await request.formData()).get('password');
    const given = typeof field === 'string' ? field : '';
    if (sameSecret(given, secret)) {
      const response = NextResponse.redirect(request.url, 303);
      response.cookies.set(COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.nextUrl.protocol === 'https:',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      });
      return response;
    }
    return gatePage(true);
  }

  return gatePage(false);
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  return demoGate(request, process.env['DEMO_PASSWORD']);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
