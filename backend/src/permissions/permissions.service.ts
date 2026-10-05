import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { AssignRolePermissionsDto } from './dto/assign-role-permissions.dto.js';
import { AssignUserRolesDto } from './dto/assign-user-roles.dto.js';
import { CreateMenuDto } from './dto/create-menu.dto.js';
import { CreatePermissionDto } from './dto/create-permission.dto.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateMenuDto } from './dto/update-menu.dto.js';
import { UpdatePermissionDto } from './dto/update-permission.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';

export const DEFAULT_PERMISSIONS = [
  { code: 'order:read', name: '查看订单', module: 'order' },
  { code: 'order:cost:read', name: '查看订单成本', module: 'order' },
  { code: 'order:cost:write', name: '修改订单成本', module: 'order' },
  { code: 'store:manage', name: '管理店铺', module: 'store' },
  { code: 'product:read', name: '查看商品', module: 'product' },
  { code: 'product:write', name: '管理商品', module: 'product' },
  { code: 'report:view', name: '查看利润报表', module: 'report' },
  { code: 'export:read', name: '导出数据', module: 'export' },
  { code: 'supplier:read', name: '查看供应商', module: 'supplier' },
  { code: 'supplier:write', name: '管理供应商', module: 'supplier' },
  { code: 'role:read', name: '查看角色权限', module: 'role' },
  { code: 'role:manage', name: '管理角色权限', module: 'role' },
  { code: 'user:manage', name: '管理用户', module: 'user' },
  { code: 'sync:manage', name: '管理数据同步', module: 'sync' },
  { code: 'material:manage', name: '管理素材', module: 'material' },
  { code: 'system:manage', name: '管理系统配置', module: 'system' },
] as const;

const DEFAULT_ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  operator: ['order:read', 'product:read'],
  finance: [
    'order:read',
    'order:cost:read',
    'order:cost:write',
    'report:view',
    'export:read',
  ],
};

const ROLE_SELECT = {
  id: true,
  code: true,
  name: true,
  description: true,
  isBuiltin: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.RoleSelect;

const PERMISSION_SELECT = {
  id: true,
  code: true,
  name: true,
  module: true,
  menuId: true,
  createdAt: true,
} satisfies Prisma.PermissionSelect;

const MENU_SELECT = {
  id: true,
  parentId: true,
  name: true,
  path: true,
  component: true,
  icon: true,
  sortOrder: true,
  visible: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.MenuSelect;

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.initializeDefaults();
  }

  async initializeDefaults(): Promise<void> {
    for (const permission of DEFAULT_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        create: permission,
        update: { name: permission.name, module: permission.module },
        select: { id: true, code: true },
      });
    }

    const allPermissions = await this.prisma.permission.findMany({
      select: { id: true, code: true },
    });
    const permissionIdsByCode = new Map(
      allPermissions.map(({ id, code }) => [code, id]),
    );

    const roleDefinitions = [
      { code: 'boss', name: '老板', permissionCodes: allPermissions.map(({ code }) => code) },
      { code: 'operator', name: '业务员', permissionCodes: DEFAULT_ROLE_PERMISSIONS.operator },
      { code: 'finance', name: '财务', permissionCodes: DEFAULT_ROLE_PERMISSIONS.finance },
    ];

    for (const definition of roleDefinitions) {
      const role = await this.prisma.role.upsert({
        where: { code: definition.code },
        create: {
          code: definition.code,
          name: definition.name,
          isBuiltin: true,
        },
        update: { name: definition.name, isBuiltin: true },
        select: { id: true },
      });
      const links = definition.permissionCodes.flatMap((code) => {
        const permissionId = permissionIdsByCode.get(code);
        return permissionId === undefined
          ? []
          : [{ roleId: role.id, permissionId }];
      });
      if (links.length > 0) {
        await this.prisma.rolePermission.createMany({
          data: links,
          skipDuplicates: true,
        });
      }
    }
  }

  async hasAllPermissions(
    userId: string,
    requiredCodes: readonly string[],
  ): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: BigInt(userId) },
      select: { roleId: true },
    });
    if (userRoles.length === 0) return false;

    const roleIds = userRoles.map(({ roleId }) => roleId);
    const roles = await this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: { id: true, code: true },
    });
    const effectiveRoleIds = roles.map(({ id }) => id);
    if (effectiveRoleIds.length === 0) return false;

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId: { in: effectiveRoleIds } },
      select: { permissionId: true },
    });
    const permissionIds = [...new Set(
      rolePermissions.map(({ permissionId }) => permissionId),
    )];
    const permissions = permissionIds.length
      ? await this.prisma.permission.findMany({
          where: { id: { in: permissionIds } },
          select: { code: true },
        })
      : [];
    const grantedCodes = new Set(permissions.map(({ code }) => code));

    if (roles.some(({ code }) => code === 'boss')) {
      const knownPermissions = await this.prisma.permission.findMany({
        where: { code: { in: [...requiredCodes] } },
        select: { code: true },
      });
      return knownPermissions.length === new Set(requiredCodes).size;
    }
    return requiredCodes.every((code) => grantedCodes.has(code));
  }

  async listRoles() {
    return this.prisma.role.findMany({
      select: ROLE_SELECT,
      orderBy: { id: 'asc' },
      take: 200,
    });
  }

  async createRole(dto: CreateRoleDto) {
    return this.prisma.role.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isBuiltin: false,
      },
      select: ROLE_SELECT,
    });
  }

  async updateRole(id: number, dto: UpdateRoleDto) {
    await this.ensureRoleExists(id);
    return this.prisma.role.update({
      where: { id: BigInt(id) },
      data: dto,
      select: ROLE_SELECT,
    });
  }

  async deleteRole(id: number) {
    const role = await this.prisma.role.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, isBuiltin: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isBuiltin) throw new ConflictException('Built-in roles cannot be deleted');
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      this.prisma.userRole.deleteMany({ where: { roleId: role.id } }),
      this.prisma.role.delete({ where: { id: role.id }, select: { id: true } }),
    ]);
    return { id };
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      select: PERMISSION_SELECT,
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
      take: 500,
    });
  }

  async createPermission(dto: CreatePermissionDto) {
    const permission = await this.prisma.permission.create({
      data: {
        ...dto,
        ...(dto.menuId === undefined ? {} : { menuId: BigInt(dto.menuId) }),
      },
      select: PERMISSION_SELECT,
    });
    const bossRole = await this.prisma.role.findUnique({
      where: { code: 'boss' },
      select: { id: true },
    });
    if (bossRole) {
      await this.prisma.rolePermission.create({
        data: { roleId: bossRole.id, permissionId: permission.id },
      });
    }
    return permission;
  }

  async listRolePermissions(roleId: number) {
    const role = await this.prisma.role.findUnique({
      where: { id: BigInt(roleId) },
      select: { id: true, code: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'boss') return this.listPermissions();
    const assignments = await this.prisma.rolePermission.findMany({
      where: { roleId: BigInt(roleId) },
      select: { permissionId: true },
    });
    const permissionIds = assignments.map(({ permissionId }) => permissionId);
    return this.prisma.permission.findMany({
      where: { id: { in: permissionIds } },
      select: PERMISSION_SELECT,
      orderBy: [{ module: 'asc' }, { code: 'asc' }],
      take: 500,
    });
  }

  async listUserRoles(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const assignments = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true },
    });
    const roleIds = assignments.map(({ roleId }) => roleId);
    return this.prisma.role.findMany({
      where: { id: { in: roleIds } },
      select: ROLE_SELECT,
      orderBy: { id: 'asc' },
      take: 200,
    });
  }

  async deletePermission(id: number) {
    const permission = await this.prisma.permission.findUnique({
      where: { id: BigInt(id) },
      select: { id: true, code: true },
    });
    if (!permission) throw new NotFoundException('Permission not found');
    if (DEFAULT_PERMISSIONS.some(({ code }) => code === permission.code)) {
      throw new ConflictException('Default permissions cannot be deleted');
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { permissionId: permission.id },
      }),
      this.prisma.permission.delete({
        where: { id: permission.id },
        select: { id: true },
      }),
    ]);
    return { id };
  }

  async updatePermission(id: number, dto: UpdatePermissionDto) {
    const exists = await this.prisma.permission.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Permission not found');
    return this.prisma.permission.update({
      where: { id: BigInt(id) },
      data: {
        ...dto,
        ...(dto.menuId === undefined
          ? {}
          : { menuId: dto.menuId === null ? null : BigInt(dto.menuId) }),
      },
      select: PERMISSION_SELECT,
    });
  }

  async assignRolePermissions(roleId: number, dto: AssignRolePermissionsDto) {
    const role = await this.prisma.role.findUnique({
      where: { id: BigInt(roleId) },
      select: { id: true, code: true },
    });
    if (!role) throw new NotFoundException('Role not found');
    if (role.code === 'boss') {
      throw new ConflictException('Boss role always receives all permissions');
    }
    const permissionIds = dto.permissionIds.map(BigInt);
    const found = permissionIds.length
      ? await this.prisma.permission.count({
          where: { id: { in: permissionIds } },
        })
      : 0;
    if (found !== permissionIds.length) {
      throw new NotFoundException('One or more permissions were not found');
    }
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId: BigInt(roleId) } }),
      ...(permissionIds.length
        ? [
            this.prisma.rolePermission.createMany({
              data: permissionIds.map((permissionId) => ({
                roleId: BigInt(roleId),
                permissionId,
              })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return { roleId, permissionIds: dto.permissionIds };
  }

  async assignUserRoles(userId: number, dto: AssignUserRolesDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(userId) },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const roleIds = dto.roleIds.map(BigInt);
    const found = roleIds.length
      ? await this.prisma.role.count({ where: { id: { in: roleIds } } })
      : 0;
    if (found !== roleIds.length) {
      throw new NotFoundException('One or more roles were not found');
    }
    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: user.id } }),
      ...(roleIds.length
        ? [
            this.prisma.userRole.createMany({
              data: roleIds.map((roleId) => ({ userId: user.id, roleId })),
              skipDuplicates: true,
            }),
          ]
        : []),
    ]);
    return { userId, roleIds: dto.roleIds };
  }

  async listMenus() {
    return this.prisma.menu.findMany({
      select: MENU_SELECT,
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: 200,
    });
  }

  async createMenu(dto: CreateMenuDto) {
    return this.prisma.menu.create({
      data: {
        ...dto,
        ...(dto.parentId === undefined ? {} : { parentId: BigInt(dto.parentId) }),
      },
      select: MENU_SELECT,
    });
  }

  async updateMenu(id: number, dto: UpdateMenuDto) {
    const exists = await this.prisma.menu.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Menu not found');
    return this.prisma.menu.update({
      where: { id: BigInt(id) },
      data: {
        ...dto,
        ...(dto.parentId === undefined
          ? {}
          : { parentId: dto.parentId === null ? null : BigInt(dto.parentId) }),
      },
      select: MENU_SELECT,
    });
  }

  async deleteMenu(id: number) {
    const menu = await this.prisma.menu.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!menu) throw new NotFoundException('Menu not found');
    await this.prisma.$transaction(async (transaction) => {
      await transaction.permission.updateMany({
        where: { menuId: menu.id },
        data: { menuId: null },
      });
      await transaction.menu.updateMany({
        where: { parentId: menu.id },
        data: { parentId: null },
      });
      await transaction.menu.delete({
        where: { id: menu.id },
        select: { id: true },
      });
    });
    return { id };
  }

  private async ensureRoleExists(id: number): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { id: BigInt(id) },
      select: { id: true },
    });
    if (!role) throw new NotFoundException('Role not found');
  }
}
