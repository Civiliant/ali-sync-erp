import type { DataScopeContext } from './data-scope.context.js';
import {
  FILTERED_OPERATIONS,
  STORE_SCOPED_MODELS,
} from './data-scope.constants.js';

const storeScopedModels: readonly string[] = STORE_SCOPED_MODELS;
const filteredOperations: readonly string[] = FILTERED_OPERATIONS;

/** 判断当前操作是否需要注入店铺过滤 */
export function isScopeApplicable(
  model: string,
  operation: string,
  scope: DataScopeContext | undefined,
): boolean {
  return (
    scope !== undefined &&
    !scope.isBoss &&
    storeScopedModels.includes(model) &&
    filteredOperations.includes(operation)
  );
}

/** 将 store_id 过滤包裹进原始 where，返回 AND 组合后的 where */
export function scopedWhere(
  where: Record<string, unknown> | undefined,
  storeIds: readonly bigint[],
): Record<string, unknown> {
  return { AND: [where ?? {}, { storeId: { in: [...storeIds] } }] };
}
