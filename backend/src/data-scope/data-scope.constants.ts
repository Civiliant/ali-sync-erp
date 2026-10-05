/**
 * 店铺维度表：含直接 store_id 字段、需按店铺自动隔离的表（Prisma 模型名）。
 * 嵌套表（orderItem / orderCost / productSku 等）通过父表的过滤间接隔离。
 */
export const STORE_SCOPED_MODELS = [
  'Order',
  'Product',
  'Customer',
  'Shipment',
  'SyncJob',
  'PlatformAccount',
  'PlatformAccountBinding',
  'ProductPlatformMapping',
  'Inventory',
] as const;

/** 需要注入 store_id 过滤的操作（接受非唯一 where 的读/批量写操作） */
export const FILTERED_OPERATIONS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
] as const;
