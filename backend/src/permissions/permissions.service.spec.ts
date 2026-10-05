import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_PERMISSIONS,
  PermissionsService,
} from './permissions.service.js';

describe('PermissionsService', () => {
  it('resolves user roles through role permissions to permission codes', async () => {
    const prisma = {
      userRole: { findMany: vi.fn().mockResolvedValue([{ roleId: 4n }]) },
      role: {
        findMany: vi.fn().mockResolvedValue([{ id: 4n, code: 'finance' }]),
      },
      rolePermission: {
        findMany: vi.fn().mockResolvedValue([{ permissionId: 8n }]),
      },
      permission: {
        findMany: vi.fn().mockResolvedValue([{ code: 'order:cost:write' }]),
      },
    } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(
      service.hasAllPermissions('41', ['order:cost:write']),
    ).resolves.toBe(true);
    await expect(
      service.hasAllPermissions('41', ['order:cost:write', 'store:manage']),
    ).resolves.toBe(false);
  });

  it('denies users without roles and limits boss to registered permissions', async () => {
    const userRoleFindMany = vi.fn().mockResolvedValue([{ roleId: 1n }]);
    const prisma = {
      userRole: { findMany: userRoleFindMany },
      role: {
        findMany: vi.fn().mockResolvedValue([{ id: 1n, code: 'boss' }]),
      },
      rolePermission: { findMany: vi.fn().mockResolvedValue([]) },
      permission: {
        findMany: vi.fn(
          async ({ where }: { where?: { code?: { in: string[] } } }) =>
            (where?.code?.in ?? []).includes('order:read')
              ? [{ code: 'order:read' }]
              : [],
        ),
      },
    } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    userRoleFindMany.mockResolvedValueOnce([]);
    await expect(service.hasAllPermissions('1', ['order:read'])).resolves.toBe(false);
    await expect(service.hasAllPermissions('2', ['order:read'])).resolves.toBe(true);
    await expect(service.hasAllPermissions('2', ['unknown:permission'])).resolves.toBe(false);
  });

  it('seeds the required role permission sets idempotently', async () => {
    const upsertPermission = vi.fn(async ({ where }: { where: { code: string } }) => ({
      id: BigInt(DEFAULT_PERMISSIONS.findIndex(({ code }) => code === where.code) + 1),
      code: where.code,
    }));
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      permission: {
        upsert: upsertPermission,
        findMany: vi.fn(async () =>
          DEFAULT_PERMISSIONS.map(({ code }, index) => ({
            id: BigInt(index + 1),
            code,
          })),
        ),
      },
      role: {
        upsert: vi.fn(async ({ where }: { where: { code: string } }) => ({
          id: BigInt(where.code === 'boss' ? 1 : where.code === 'operator' ? 2 : 3),
        })),
      },
      rolePermission: { createMany },
    } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await service.initializeDefaults();

    expect(upsertPermission).toHaveBeenCalledTimes(DEFAULT_PERMISSIONS.length);
    expect(createMany).toHaveBeenCalledTimes(3);
    const bossLinks = createMany.mock.calls[0][0].data;
    const operatorLinks = createMany.mock.calls[1][0].data;
    const financeLinks = createMany.mock.calls[2][0].data;
    expect(bossLinks).toHaveLength(DEFAULT_PERMISSIONS.length);
    expect(operatorLinks.map((link: { permissionId: bigint }) => link.permissionId)).toEqual([
      1n,
      5n,
    ]);
    expect(financeLinks).toHaveLength(5);
  });

  it('automatically grants newly created permissions to the boss role', async () => {
    const createdPermission = {
      id: 90n,
      code: 'custom:manage',
      name: 'Custom management',
      module: 'custom',
      menuId: null,
      createdAt: new Date(),
    };
    const permissionCreate = vi.fn().mockResolvedValue(createdPermission);
    const rolePermissionCreate = vi.fn().mockResolvedValue({
      roleId: 1n,
      permissionId: 90n,
    });
    const prisma = {
      permission: { create: permissionCreate },
      role: { findUnique: vi.fn().mockResolvedValue({ id: 1n }) },
      rolePermission: { create: rolePermissionCreate },
    } as unknown as PrismaService;
    const service = new PermissionsService(prisma);

    await expect(
      service.createPermission({
        code: 'custom:manage',
        name: 'Custom management',
        module: 'custom',
      }),
    ).resolves.toBe(createdPermission);
    expect(rolePermissionCreate).toHaveBeenCalledWith({
      data: { roleId: 1n, permissionId: 90n },
    });
  });
});
