import { Prisma } from '@prisma/client';
import { getDataScope } from './data-scope.context.js';
import { isScopeApplicable, scopedWhere } from './data-scope.filter.js';

/**
 * 店铺级数据隔离扩展：业务员查询/批量写店铺维度表时，
 * 自动在 where 中追加 store_id IN (绑定店铺) 过滤；老板不过滤。
 */
export const dataScopeExtension = Prisma.defineExtension({
  name: 'data-scope',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const scope = getDataScope();
        if (!isScopeApplicable(model, operation, scope)) {
          return query(args);
        }
        // 业务员：注入 store_id 过滤；未绑定店铺时 in [] 匹配空集
        const withWhere = args as { where?: Record<string, unknown> };
        withWhere.where = scopedWhere(withWhere.where, scope!.storeIds);
        return query(args);
      },
    },
  },
});
