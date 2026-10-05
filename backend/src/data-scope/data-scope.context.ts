import { AsyncLocalStorage } from 'node:async_hooks';

export interface DataScopeContext {
  /** 当前登录用户 id（BigInt 序列化字符串，来自 JWT sub） */
  userId: string;
  /** 是否为老板（老板可见全部店铺，不过滤） */
  isBoss: boolean;
  /** 业务员绑定的店铺 id 列表；老板为空数组（表示不过滤） */
  storeIds: bigint[];
}

export const dataScopeContext = new AsyncLocalStorage<DataScopeContext>();

export function getDataScope(): DataScopeContext | undefined {
  return dataScopeContext.getStore();
}
