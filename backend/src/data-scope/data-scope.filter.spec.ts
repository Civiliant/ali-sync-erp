import { isScopeApplicable, scopedWhere } from './data-scope.filter.js';

describe('data-scope filter', () => {
  const boss = { userId: '1', isBoss: true, storeIds: [] as bigint[] };
  const operator = { userId: '2', isBoss: false, storeIds: [10n, 12n] };

  it('applies scope only to store-scoped models and filtered operations', () => {
    expect(isScopeApplicable('Order', 'findMany', operator)).toBe(true);
    expect(isScopeApplicable('Product', 'findFirst', operator)).toBe(true);
    expect(isScopeApplicable('Order', 'updateMany', operator)).toBe(true);
    expect(isScopeApplicable('Order', 'deleteMany', operator)).toBe(true);
    expect(isScopeApplicable('Order', 'findMany', boss)).toBe(false);
    expect(isScopeApplicable('Order', 'findMany', undefined)).toBe(false);
    expect(isScopeApplicable('User', 'findMany', operator)).toBe(false);
    expect(isScopeApplicable('Order', 'create', operator)).toBe(false);
    expect(isScopeApplicable('Order', 'findUnique', operator)).toBe(false);
  });

  it('wraps where with store id filter', () => {
    expect(scopedWhere(undefined, [10n, 12n])).toEqual({
      AND: [{}, { storeId: { in: [10n, 12n] } }],
    });
    expect(scopedWhere({ orderStatus: 'paid' }, [10n])).toEqual({
      AND: [{ orderStatus: 'paid' }, { storeId: { in: [10n] } }],
    });
  });

  it('produces empty in-list for users without bound stores', () => {
    expect(scopedWhere(undefined, [])).toEqual({
      AND: [{}, { storeId: { in: [] } }],
    });
  });
});
