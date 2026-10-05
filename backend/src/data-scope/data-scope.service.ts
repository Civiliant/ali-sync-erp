import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { DataScopeContext } from './data-scope.context.js';

@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 解析当前用户的数据范围（是否老板 + 绑定的店铺 id 列表） */
  async resolveScope(userId: string): Promise<DataScopeContext> {
    const [bossRoleId, bindings] = await Promise.all([
      this.findBossRoleId(userId),
      this.prisma.platformAccountBinding.findMany({
        where: { userId: BigInt(userId) },
        select: { storeId: true },
      }),
    ]);

    const storeIds = [...new Set(bindings.map((binding) => binding.storeId))];

    return {
      userId,
      isBoss: bossRoleId !== null,
      storeIds,
    };
  }

  private async findBossRoleId(userId: string): Promise<bigint | null> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: BigInt(userId) },
      select: { roleId: true },
    });
    const roleIds = userRoles.map(({ roleId }) => roleId);
    if (roleIds.length === 0) {
      return null;
    }
    const bossRole = await this.prisma.role.findFirst({
      where: { id: { in: roleIds }, code: 'boss' },
      select: { id: true },
    });
    return bossRole?.id ?? null;
  }
}
