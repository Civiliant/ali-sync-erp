# 开发任务清单（BACKLOG）

> 按顺序逐项开发。**每完成一项**：更新 `PROGRESS.md` → `git commit` → 停一下让用户验收，再继续下一项。

---

## 阶段 0：项目初始化（P0）

- [ ] 0.1 在 `backend/` 初始化 NestJS 项目，安装依赖（@nestjs/*、prisma、@prisma/client、class-validator、@nestjs/jwt、bcrypt、@nestjs/bullmq、ioredis、exceljs 等）
- [ ] 0.2 在 `frontend/` 初始化 Vue3 + Vite + Element Plus + Pinia 项目
- [ ] 0.3 根据 `docs/database/schema.sql` 编写 `backend/prisma/schema.prisma`（对齐全部 53 张表，金额用 `Decimal @db.Decimal(18,2)`，汇率用 `@db.Decimal(18,6)`）
- [ ] 0.4 `prisma migrate dev` 建库
- [ ] 0.5 配置 `.env`（复制 `.env.example`），Docker Compose 启动 PostgreSQL + Redis
- [ ] 0.6 配置统一响应格式、全局异常过滤器、日志

## 阶段 1：安全基础模块（写死，勿改）

- [x] 1.1 `CryptoService`（AES-256-GCM，独立 APP_ENCRYPTION_KEY）
- [x] 1.2 `AuthModule`（登录、JWT access+refresh、`AuthGuard`）
- [x] 1.3 `PermissionsModule`（角色/权限/菜单 RBAC，`@Permissions()` 守卫）
- [x] 1.4 `DataScopeMiddleware`（店铺级数据隔离，Prisma `$extends` 扩展 + AsyncLocalStorage）
- [x] 1.5 脱敏工具 + `SsrfGuard` + 限流守卫
- [ ] 1.6 审计日志（audit_events / operation_logs / login_logs）

## 阶段 2：店铺与阿里对接（P0）

- [ ] 2.1 `StoresModule`（店铺 CRUD、列表脱敏）
- [ ] 2.2 `AlibabaModule`（AlibabaPlatformAdapter：buildAuthUrl / exchangeToken / refreshToken / getShopInfo）
- [ ] 2.3 OAuth 回调（state 校验、换 token、加密入库），见 `docs/阿里国际站对接规范.md`
- [ ] 2.4 token 定时刷新（每天扫，7 天内到期刷新，失败标记 REFRESH_FAILED）
- [ ] 2.5 平台子账号同步 + 绑定 ERP 员工（platform_account_bindings）

## 阶段 3：产品管理（P0）

- [ ] 3.1 产品同步（拉取国际站商品 → products/product_skus，存 platform_stock）
- [ ] 3.2 本地产品成本价维护 + 平台商品映射（product_platform_mappings）
- [ ] 3.3 本地库存维护（local_stock，库存流水 inventory）

## 阶段 4：订单与成本（P0 核心）

- [ ] 4.1 订单同步引擎（`alibaba.seller.order.list`，modified_date 增量，幂等 UPSERT）
- [ ] 4.2 订单列表/详情（筛选、分页、店铺隔离）
- [ ] 4.3 成本录入（三类：采购/运输/其他，多笔动态求和）
- [ ] 4.4 成本自动带出（订单商品绑定本地 SKU → 采购成本 = 本地成本价）
- [ ] 4.5 利润核算（订单收入折 CNY − 总成本 = 净利润）
- [ ] 4.6 汇率锁账（LOCKED 快照，锁账后成本/汇率不可改）

## 阶段 5：导出与报表（P0）

- [ ] 5.1 订单导出 xlsx（ExcelJS，与筛选联动）
- [ ] 5.2 大导出异步队列（export_queue）
- [ ] 5.3 利润汇总 / 产品排行报表

## 阶段 6：V1 增强（P1）

- [ ] 6.1 缺货预警 + 一键生成采购单
- [ ] 6.2 供应商档案管理
- [ ] 6.3 打印模块（worm-vue3-print 设计器 + 预览 + 服务端 PDF）
- [ ] 6.4 素材中心（OSS）
- [ ] 6.5 汇率管理（内部记账汇率 + 历史）

## 阶段 7：V2 完善（P2）

- [ ] 7.1 AI 审查（自备网关）
- [ ] 7.2 审计脱敏、敏感字段二次验证
- [ ] 7.3 1688 平台适配
- [ ] 7.4 自定义导出模板
