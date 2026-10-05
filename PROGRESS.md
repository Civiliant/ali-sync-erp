# 项目进度（PROGRESS）

> AI 每次开工前先读本文件；每完成一个 BACKLOG 项后更新本文件。

## 当前状态

🟡 **阶段 1 安全基础模块进行中**

## 已完成

- ✅ 需求 PRD（docs/PRD.md）
- ✅ 技术设计文档（docs/阿里国际站ERP技术设计文档.md）
- ✅ 53 张表数据库设计（docs/database/schema.sql）
- ✅ AI 开发安全规范（AGENTS.md）
- ✅ 阿里国际站对接规范（docs/阿里国际站对接规范.md，OAuth + 订单接口已核实）
- ✅ 打印模块对接（docs/Worm打印模块对接实现文档.md）
- ✅ 项目骨架文件（BACKLOG / PROGRESS / README / env / compose）

## 下一步

- 阶段 1.5：脱敏工具 + SsrfGuard + 限流守卫

## 阶段 0 进度

- 0.1 NestJS backend initialized with required dependencies; `tsc --noEmit` passes.
- 0.2 Vue 3 + TypeScript + Vite frontend initialized with Element Plus and Pinia; `vite build` passes.
- 0.3 Prisma schema created for all 53 database tables; `prisma validate` and backend `tsc --noEmit` pass.

## 关键决策记录

| 决策 | 结论 |
|------|------|
| 技术栈 | Vue3+Element Plus + NestJS+Prisma + PostgreSQL + Redis |
| 金额精度 | 金额 2 位小数，汇率 6 位小数 |
| 库存模型 | 本地库存 + 平台库存双轨，订单扣本地库存 |
| 成本取价 | 订单商品绑定本地产品 → 成本取本地产品成本价 |
| 首期范围 | 只做国际站，1688 后续扩展 |
| 打印版本 | worm-vue3-print 1.3.5 |

## 踩坑记录

（开发中遇到并解决的问题记录在这里，供后续 AI 会话参考）

## Phase 0 Verification

- 0.4 `.env` copied from `.env.example`; PostgreSQL 16 and Redis 7 Compose configuration verified. Docker is unavailable in this environment, so containers were not started.
- 0.5 Unified API response, global validation, and safe exception filtering added; backend typecheck and frontend build pass.

## Phase 1 Progress

- 1.1 CryptoService uses AES-256-GCM with a 32-byte APP_ENCRYPTION_KEY; round-trip, tampering, and key validation tests pass (3 tests).
- 1.2 AuthModule implements bcrypt login, two-hour access JWT, seven-day rotating refresh JWT, and a global default-deny AuthGuard. Login, JWT, refresh replay, and guard tests pass; backend typecheck passes (9 auth tests).
- 1.3 PermissionsModule adds parameterized role/permission/menu CRUD and assignment APIs, a global permission guard, idempotent boss/operator/finance seeds, and audited writes. RBAC tests cover grants, denials, boss defaults, and seed mappings; full backend typecheck and 20 unit tests pass.
- `.env.example` now contains a valid 32-byte hex format placeholder, documents the random-key generation command, and CryptoService rejects the all-zero placeholder.
- 1.4 DataScopeMiddleware adds a Prisma `$extends` query extension driven by AsyncLocalStorage: operators get store_id filters auto-injected on store-scoped models (findMany/findFirst/count/aggregate/groupBy/updateMany/deleteMany), boss is unfiltered. DataScopeService resolves role+bound stores; DataScopeInterceptor wraps requests. 6 new tests; 26 total tests pass, backend typecheck passes.
- 1.5 progress: sensitive-field masking and SSRF URL validation implemented; both unit-test groups pass. Redis login rate limiting remains in progress.
