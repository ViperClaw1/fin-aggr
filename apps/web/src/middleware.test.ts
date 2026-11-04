import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { demoGate, demoGateToken } from './proxy';

const PASSWORD = 'stage1-demo';

function request(method: 'GET' | 'POST', cookie?: string, password?: string): NextRequest {
  const headers = new Headers();
  if (cookie !== undefined) headers.set('cookie', `fa.demo.gate=${cookie}`);
  if (method === 'POST') {
    headers.set('content-type', 'application/x-www-form-urlencoded');
    return new NextRequest('http://127.0.0.1:3000/compare/cd', {
      method,
      headers,
      body: new URLSearchParams({ password: password ?? '' }),
    });
  }
  return new NextRequest('http://127.0.0.1:3000/compare/cd', { method, headers });
}

describe('demoGate', () => {
  it('leaves the site open when DEMO_PASSWORD is unset', async () => {
    const response = await demoGate(request('GET'), undefined);
    expect(response.headers.get('location')).toBeNull();
    expect(response.status).toBe(200);
  });

  it('returns the password form when the cookie is missing', async () => {
    const response = await demoGate(request('GET'), PASSWORD);
    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Password');
  });

  it('rejects a wrong password', async () => {
    const response = await demoGate(request('POST', undefined, 'nope'), PASSWORD);
    expect(response.status).toBe(401);
    expect(await response.text()).toContain('Wrong password.');
  });

  it('sets the gate cookie and redirects after the right password', async () => {
    const response = await demoGate(request('POST', undefined, PASSWORD), PASSWORD);
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('http://localhost:3000/compare/cd');
    expect(response.cookies.get('fa.demo.gate')?.value).toBe(await demoGateToken(PASSWORD));
  });

  it('lets a matching cookie through', async () => {
    const response = await demoGate(request('GET', await demoGateToken(PASSWORD)), PASSWORD);
    expect(response.status).toBe(200);
  });
});
