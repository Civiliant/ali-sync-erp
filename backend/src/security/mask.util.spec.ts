import { maskSensitive } from './mask.util.js';

describe('maskSensitive', () => {
  it('masks phone numbers while preserving the first three and last four characters', () => {
    expect(maskSensitive('13812348888', 'phone')).toBe('138****8888');
  });

  it('masks email local parts while preserving the first character and domain', () => {
    expect(maskSensitive('alice@example.com', 'email')).toBe('a***@example.com');
  });

  it('preserves at most the first six address characters', () => {
    expect(maskSensitive('北京市朝阳区建国路88号', 'address')).toBe('北京市朝阳区***');
    expect(maskSensitive('短地址', 'address')).toBe('短地址');
  });

  it('masks bank account numbers except for their final four characters', () => {
    expect(maskSensitive('6222021234567890', 'bankAccount')).toBe('************7890');
  });

  it('recursively masks sensitive fields in objects and arrays', () => {
    expect(maskSensitive({ buyer: { phone_number: '13812348888' }, contacts: [{ email: 'alice@example.com' }], receiverAddress: '北京市朝阳区建国路88号' })).toEqual({
      buyer: { phone_number: '138****8888' },
      contacts: [{ email: 'a***@example.com' }],
      receiverAddress: '北京市朝阳区***',
    });
  });
});
