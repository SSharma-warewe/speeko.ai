import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GhlService } from '../ghl.service';

describe('GhlService CRM HTTP boundary', () => {
  const token = 'pit-tenant-secret';
  const creds = { token, locationId: 'location1' };
  let service: GhlService;
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    service = new GhlService({
      get: () => undefined,
    } as unknown as ConfigService);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => jest.restoreAllMocks());
  it('uses only explicit credentials and a fixed host with redirect refusal', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ contacts: [] }), { status: 200 }),
    );
    await service.crmRequest(creds, 'GET', '/contacts/?locationId=location1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://services.leadconnectorhq.com/contacts/?locationId=location1',
      expect.objectContaining({
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          Version: '2021-07-28',
        }),
      }),
    );
  });
  it.each([401, 403, 404, 429, 400, 422, 409, 500])(
    'never leaks error bodies at status %s',
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response(`secret=${token}; contact=private`, { status }),
      );
      try {
        await service.crmRequest(creds, 'GET', '/contacts/');
        throw new Error('Expected error');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        expect((error as Error).message).not.toContain(token);
        expect((error as Error).message).not.toContain('private');
        if (status === 401 || status === 403)
          expect(error).toBeInstanceOf(ForbiddenException);
        if (status === 404) expect(error).toBeInstanceOf(NotFoundException);
        if (status === 400 || status === 422)
          expect(error).toBeInstanceOf(BadRequestException);
      }
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it('redacts a reflected token even from successful responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ value: token }), { status: 200 }),
    );
    await expect(
      service.crmRequest(creds, 'GET', '/contacts/'),
    ).resolves.toEqual({ value: '[redacted]' });
  });
  it('does not retry an ambiguous write or report success', async () => {
    fetchMock.mockRejectedValue(new Error(`timeout ${token}`));
    await expect(
      service.crmRequest(creds, 'POST', '/contacts/', { firstName: 'Ada' }),
    ).rejects.toThrow('may have been saved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('treats a failed response stream as an unconfirmed write without leaking errors', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockRejectedValue(new Error(token)),
    });
    await expect(
      service.crmRequest(creds, 'POST', '/contacts/', { firstName: 'Ada' }),
    ).rejects.toThrow('may have been saved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['//evil.test/contacts', '/contacts/\\evil', 'https://evil.test'])(
    'rejects unsafe path %s',
    async (path) => {
      await expect(service.crmRequest(creds, 'GET', path)).rejects.toThrow(
        BadRequestException,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it('never falls back to platform credentials', async () => {
    await expect(
      service.crmRequest(
        { token: '', locationId: 'location1' },
        'GET',
        '/contacts/',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('handles empty delete receipts and rejects malformed success', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response('not-json', { status: 200 }));
    await expect(
      service.crmRequest(creds, 'DELETE', '/contacts/c1'),
    ).resolves.toEqual({ success: true });
    await expect(
      service.crmRequest(creds, 'POST', '/contacts/', {}),
    ).rejects.toThrow(BadGatewayException);
  });
});
