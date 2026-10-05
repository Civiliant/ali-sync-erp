import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

type AddressFamily = 4 | 6;
export type SsrfResolver = (hostname: string) => Promise<Array<{ address: string; family: number }>>;
export const SSRF_DNS_RESOLVER = Symbol('SSRF_DNS_RESOLVER');

function ipv4Number(address: string): number | undefined {
  if (isIP(address) !== 4) return undefined;
  return address.split('.').reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
}

function inV4Range(address: string, base: string, prefix: number): boolean {
  const value = ipv4Number(address);
  const network = ipv4Number(base);
  if (value === undefined || network === undefined) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (network & mask);
}

function expandIpv6(address: string): bigint | undefined {
  if (isIP(address) !== 6) return undefined;
  let value = address.toLowerCase().split('%')[0];
  const mappedSeparator = value.lastIndexOf(':');
  const tail = value.slice(mappedSeparator + 1);
  if (tail.includes('.')) {
    const ipv4 = ipv4Number(tail);
    if (ipv4 === undefined) return undefined;
    value = `${value.slice(0, mappedSeparator)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = value.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8 || groups.some((part) => !/^[\da-f]{1,4}$/.test(part))) return undefined;
  return groups.reduce((result, part) => (result << 16n) | BigInt(`0x${part}`), 0n);
}

function inV6Range(address: string, base: string, prefix: number): boolean {
  const value = expandIpv6(address);
  const network = expandIpv6(base);
  if (value === undefined || network === undefined) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (network >> shift);
}

function isNonPublicIp(address: string, family: AddressFamily): boolean {
  if (family === 4) {
    return [
      ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
      ['192.0.2.0', 24], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
      ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
      ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
      ['224.0.0.0', 4], ['240.0.0.0', 4],
    ].some(([base, prefix]) => inV4Range(address, base as string, prefix as number));
  }

  if (
    inV6Range(address, '::', 128) || inV6Range(address, '::1', 128) ||
    inV6Range(address, 'fc00::', 7) || inV6Range(address, 'fe80::', 10) ||
    inV6Range(address, 'ff00::', 8) || inV6Range(address, '2001:db8::', 32)
  ) return true;

  // Transition mechanisms can encapsulate an IPv4 destination that bypasses the IPv6 check.
  if (inV6Range(address, '2001::', 23) || inV6Range(address, '2002::', 16)) return true;

  const mappedPrefix = inV6Range(address, '::ffff:0:0', 96);
  if (mappedPrefix) {
    const value = expandIpv6(address);
    const v4 = Number(value! & 0xffffffffn);
    const mapped = `${(v4 >>> 24) & 255}.${(v4 >>> 16) & 255}.${(v4 >>> 8) & 255}.${v4 & 255}`;
    return isNonPublicIp(mapped, 4);
  }

  return !inV6Range(address, '2000::', 3);
}

@Injectable()
export class SsrfGuard {
  constructor(
    @Inject(SSRF_DNS_RESOLVER)
    private readonly resolve: SsrfResolver = async (hostname) => lookup(hostname, { all: true, verbatim: true }),
  ) {}

  async validate(input: string): Promise<URL> {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new BadRequestException('Only credential-free HTTP(S) URLs are allowed');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
      throw new BadRequestException('URL host is not publicly routable');
    }

    const family = isIP(hostname) as AddressFamily | 0;
    if (family) {
      if (isNonPublicIp(hostname, family)) throw new BadRequestException('URL host is not publicly routable');
      return url;
    }

    let addresses: Array<{ address: string; family: number }>;
    try {
      addresses = await this.resolve(hostname);
    } catch {
      throw new BadRequestException('URL host could not be resolved');
    }
    if (!addresses.length || addresses.some(({ address, family: recordFamily }) =>
      ![4, 6].includes(recordFamily) || isNonPublicIp(address, recordFamily as AddressFamily))) {
      throw new BadRequestException('URL host resolves to a non-public address');
    }
    return url;
  }
}
