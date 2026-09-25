import { afterEach, describe, expect, it, vi } from 'vitest';
import { authRequest } from './auth-api';
import { POST } from '../app/api/auth/[...path]/route';
import type { NextRequest } from 'next/server';

describe('auth API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends credentialed state changes with the CSRF marker and configured API URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ loggedOut: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await authRequest('logout', {});

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({
      method: 'POST', credentials: 'include', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-ClassLoom-Request': '1' },
    }));
  });

  it('surfaces API validation errors without keeping credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message: 'Email or password is incorrect' }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(authRequest('login', { email: 'a@example.test', password: 'secret' }))
      .rejects.toThrow('Email or password is incorrect');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      body: JSON.stringify({ email: 'a@example.test', password: 'secret' }),
    });
  });

  it('proxies the host-only API session cookie onto the web origin for SSR', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ account: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Set-Cookie': 'classloom_session=opaque; Path=/; HttpOnly; SameSite=Lax' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const incoming = new Request('https://app.example.test/api/auth/login', {
      method: 'POST', body: '{}', headers: {
        Cookie: 'theme=light', Origin: 'https://app.example.test', 'X-ClassLoom-Request': '1',
        'Content-Type': 'application/json',
      },
    });
    const response = await POST(incoming as NextRequest, { params: Promise.resolve({ path: ['login'] }) });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:4000/api/v1/auth/login');
    const upstreamHeaders = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(upstreamHeaders.get('cookie')).toBe('theme=light');
    expect(upstreamHeaders.get('origin')).toBe('https://app.example.test');
    expect(response.headers.getSetCookie()[0]).toContain('classloom_session=opaque');
  });

  it('rejects oversized auth bodies before contacting the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const incoming = new Request('https://app.example.test/api/auth/login', {
      method: 'POST', body: JSON.stringify({ payload: 'x'.repeat(16 * 1024) }),
      headers: { 'Content-Type': 'application/json' },
    });
    const response = await POST(incoming as NextRequest, { params: Promise.resolve({ path: ['login'] }) });

    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
