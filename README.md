# Ali-Sync 跨境电商智能 ERP

对接阿里巴巴国际站（Alibaba.com），处理**订单同步、产品管理、成本核算、订单导出**的轻量 ERP 系统。以「一件代发财务核算」为核心，支持多店铺 + 多人协作。

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia |
| 后端 | NestJS (Node 20) + Prisma |
| 数据库 | PostgreSQL 16 |
| 缓存/队列 | Redis 7 + BullMQ |
| 认证 | JWT + RBAC（按钮级权限 + 店铺级数据隔离） |
| 打印 | @worm-vue3-print/core + canvas + print-render 微服务 |
| 部署 | 宝塔 + Docker Compose |

## AI 开发必读（按顺序读）

1. **`AGENTS.md`** —— 开发规范与安全红线（**最高优先级，违反即返工**）
2. **`BACKLOG.md`** —— 任务清单（按顺序逐项开发）
3. **`PROGRESS.md`** —— 当前进度（开工前先读，完成后更新）
4. **`docs/`** —— 全部设计文档

## 目录结构

```
ali-sync-erp/
├── AGENTS.md              # AI 开发规范与安全红线（必读）
├── README.md              # 本文件
├── BACKLOG.md             # 开发任务清单
├── PROGRESS.md            # 进度状态
├── .env.example           # 环境变量模板
├── docker-compose.yml     # PostgreSQL + Redis（+ 后续服务）
├── .gitignore
├── docs/                  # 设计文档
│   ├── PRD.md             # 产品需求文档
│   ├── 阿里国际站ERP技术设计文档.md
│   ├── 阿里国际站对接规范.md
│   ├── 阿里国际站店铺授权实现文档.md
│   ├── Worm打印模块对接实现文档.md
│   └── database/
│       └── schema.sql     # 53 张表建表语句
├── backend/               # NestJS 后端（待开发）
│   └── prisma/            # schema.prisma（从 schema.sql 生成）
└── frontend/              # Vue3 前端（待开发）
```

## 开发方式

全程 AI 辅助开发。核心原则：

1. **数据库优先**：先按 `docs/database/schema.sql` 建好 `schema.prisma` → `prisma migrate dev` 建库。
2. **安全基础模块先写死**：`CryptoService`、`AuthGuard`、`PermissionsGuard`、`DataScopeMiddleware`、`SsrfGuard`、脱敏工具——这些由人工/主 AI 写好并配测试，业务 AI 只调用不修改。
3. **小步交付**：按 BACKLOG 逐项做，每项完成 → `tsc --noEmit` / 构建 / 测试通过 → `git commit` → 停一下让用户验收。
4. **单语言**：前后端都是 TypeScript，类型共享，减少 AI 出错。

## 快速开始（首个 AI 任务）

```bash
# 1. 启动数据库
docker compose up -d

# 2. 初始化后端
cd backend
pnpm init  # 或按 BACKLOG 阶段0 执行
```

详见 `BACKLOG.md`。
