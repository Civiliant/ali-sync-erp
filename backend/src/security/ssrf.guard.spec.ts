import { BadRequestException } from '@nestjs/common';
import { SsrfGuard } from './ssrf.guard.js';

describe('SsrfGuard', () => {
  const publicResolver = vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

  beforeEach(() => publicResolver.mockReset().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]));

  it.each([
    'http://127.0.0.1',
    'http://10.10.1.2',
    'http://172.20.0.1',
    'http://192.168.1.10',
    'http://169.254.169.254',
    'http://[::1]',
    'http://[fc00::1]',
    'http://[2002:c0a8:0101::1]',
    'file:///etc/passwd',
  ])('rejects local or unsupported URL %s', async (url) => {
    const guard = new SsrfGuard(publicResolver);
    await expect(guard.validate(url)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a public-looking hostname that resolves to a private address', async () => {
    publicResolver.mockResolvedValue([{ address: '10.0.0.4', family: 4 }]);
    await expect(new SsrfGuard(publicResolver).validate('https://example.com'))
      .rejects.toThrow('non-public address');
  });

  it('allows HTTPS hostnames resolving only to public IP addresses', async () => {
    const result = await new SsrfGuard(publicResolver).validate('https://example.com/path');
    expect(result.href).toBe('https://example.com/path');
    expect(publicResolver).toHaveBeenCalledWith('example.com');
  });
});
