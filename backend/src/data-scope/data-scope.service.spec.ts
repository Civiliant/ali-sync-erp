import { PrismaService } from '../prisma/prisma.service.js';
import { DataScopeService } from './data-scope.service.js';

describe('DataScopeService', () => {
  it('marks boss users and resolves an empty store list', async () => {
    const prisma = {
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: 1n }]) },
      role: { findFirst: vi.fn().mockResolvedValue({ id: 1n }) },
      platformAccountBinding: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new DataScopeService(prisma);

    await expect(service.resolveScope('7')).resolves.toEqual({
      userId: '7',
      isBoss: true,
      storeIds: [],
    });
  });

  it('resolves bound store ids (deduplicated) for non-boss users', async () => {
    const prisma = {
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: 3n }]) },
      role: { findFirst: vi.fn().mockResolvedValue(null) },
      platformAccountBinding: {
        findMany: vi.fn().mockResolvedValue([
          { storeId: 10n },
          { storeId: 12n },
          { storeId: 10n },
        ]),
      },
    } as unknown as PrismaService;
    const service = new DataScopeService(prisma);

    await expect(service.resolveScope('9')).resolves.toEqual({
      userId: '9',
      isBoss: false,
      storeIds: [10n, 12n],
    });
  });

  it('treats users without roles as non-boss with no stores', async () => {
    const prisma = {
      userRole: { findMany: vi.fn().mockResolvedValue([]) },
      role: { findFirst: vi.fn() },
      platformAccountBinding: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const service = new DataScopeService(prisma);

    await expect(service.resolveScope('11')).resolves.toEqual({
      userId: '11',
      isBoss: false,
      storeIds: [],
    });
  });
});
