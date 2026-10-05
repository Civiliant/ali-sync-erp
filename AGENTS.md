# AI 开发规范与安全红线（AGENTS.md）

> 本文件是 AI 开发本项目时**最高优先级**的强制规范。
> 任何与本文件冲突的代码一律视为错误，必须返工。
> 本文件放在项目根目录，AI 编码代理（Cursor / Claude Code / 其他）会自动加载。

---

## 0. 三条铁律（违反即返工）

1. **永不手写 SQL 字符串拼接** —— 一律用 Prisma 参数化查询。
2. **永不硬编码密钥 / token / 密码** —— 一律环境变量 + 封装好的加密服务。
3. **永不信任任何输入** —— 所有入参必须 DTO 校验 + 权限守卫 + 店铺数据隔离。

---

## 1. 禁止清单（黑名单，出现即错）

### 1.1 数据访问
- ❌ 禁止 `$queryRaw` / `$executeRaw` / `$queryRawUnsafe` 拼接任何变量
- ❌ 禁止手写字符串 SQL
- ✅ 必须用 Prisma 的 `findUnique` / `findMany` / `create` / `update` 及 `where` 参数

### 1.2 密钥与加密
- ❌ 禁止硬编码 appSecret / access_token / API Key / 数据库密码
- ❌ 禁止提交任何密钥到 git（含测试值）
- ❌ 禁止自研加密算法（自制 AES / MD5 / 混淆）
- ✅ 必须用项目封装的 `CryptoService`（AES-256-GCM）

### 1.3 认证与授权
- ❌ 禁止给业务接口加 `@Public()` 跳过鉴权（仅登录/回调等白名单接口允许）
- ❌ 禁止在查询里跳过店铺数据隔离过滤
- ✅ 每个写接口必须声明 `@Permissions('模块:动作')`，如 `@Permissions('order:cost:write')`

### 1.4 输出与日志
- ❌ 禁止直接返回数据库实体（会泄露 `password_hash`、token、加密字段）
- ❌ 禁止 `console.log` 打印 token、手机号、邮箱、地址、密钥、密码
- ❌ 禁止用 `v-html` 渲染任何用户输入或平台返回内容

### 1.5 危险操作
- ❌ 禁止 `eval` / `new Function` / 反序列化用户输入
- ❌ 禁止直接请求用户提供的 URL（AI 网关 Base URL、OSS 回调等）——防 SSRF，必须走 `SsrfGuard` 校验
- ❌ 禁止文件上传不校验（MIME 白名单 + 大小上限 + 重编码）

---

## 2. 必须清单（白名单，缺一不可）

- ✅ 所有 **写操作**（POST/PUT/DELETE）必须：权限守卫 + 审计日志
- ✅ 所有 **查询** 必须走数据隔离中间件，自动按用户可见店铺过滤
- ✅ 所有 **入参** 用 `class-validator` 的 DTO 校验，禁止 `@Body() body: any`
- ✅ 密码用 `bcrypt`，JWT 用 `@nestjs/jwt`，加密用 `CryptoService`
- ✅ 敏感字段（手机号/邮箱/地址/银行账号）输出前脱敏
- ✅ 分页/数量参数设上限（如 pageSize ≤ 200）
- ✅ 统一异常处理，绝不向前端泄露堆栈/内部路径
- ✅ 所有金额用 `NUMERIC(18,2)` 对应类型（Prisma `Decimal`），汇率 `NUMERIC(18,6)`

---

## 3. 分模块安全要求

| 模块 | 必须做到 |
|------|---------|
| 认证 auth | 登录限流、bcrypt、token 有效期、refresh 轮换 |
| 授权 RBAC | 按钮级权限 + 店铺数据隔离 + 防 IDOR |
| 店铺 OAuth | state 校验、凭证 AES 加密、日志脱敏 |
| 订单/成本 | 归属校验、锁账后不可改、审计 |
| 导出 | 按角色脱敏、审计"谁导了什么" |
| 素材上传 | MIME 白名单、10MB、图片重编码、防路径遍历 |
| AI 网关 | SsrfGuard 拦截内网/环回地址 |
| 日志 | 不记敏感信息，只记业务标识 |

---

## 4. 交付前自查清单（AI 每次完成必须逐条确认）

- [ ] 有没有硬编码密钥/token？（`grep -R "token\|secret\|password" --include="*.ts"` 复查）
- [ ] 有没有 `$queryRaw` 字符串拼接？
- [ ] 所有入参都有 DTO 校验吗？
- [ ] 这个接口有权限守卫吗？有店铺隔离吗？
- [ ] 返回给前端的数据有没有泄露 `password_hash`/token 等字段？
- [ ] 敏感信息进日志了吗？
- [ ] 有没有直接请求用户提供的 URL？

---

## 5. 正确 vs 错误 示例

```ts
// ❌ SQL 注入风险
await prisma.$queryRawUnsafe(`SELECT * FROM orders WHERE id = ${id}`)
// ✅ 正确
await prisma.order.findUnique({ where: { id } })

// ❌ 硬编码密钥
const appSecret = 'abc123456789'
// ✅ 正确
const enc = this.cryptoService.encrypt(rawSecret) // AES-256-GCM

// ❌ 泄露敏感字段
return this.prisma.user.findMany()
// ✅ 正确（排除密码哈希）
return this.prisma.user.findMany({ select: { id: true, username: true, realName: true } })

// ❌ 越权风险（改了 id 就能看别人的订单）
return this.prisma.order.findUnique({ where: { id } })
// ✅ 正确（强制店铺过滤）
return this.prisma.order.findFirst({ where: { id, storeId: user.storeId } })

// ❌ SSRF 风险（用户填的 URL 直接请求，可能打内网）
await fetch(aiConfig.baseUrl)
// ✅ 正确
const url = this.ssrfGuard.validate(aiConfig.baseUrl) // 拦截 127.0.0.1 / 10.x / 169.254 等
await fetch(url)

// ❌ 未校验输入
async create(@Body() body: any) { /* ... */ }
// ✅ 正确
async create(@Body() dto: CreateOrderCostDto) { /* class-validator 校验 */ }
```

---

## 6. 给开发者（人）的工作流

1. 本文件放在项目根目录，AI 自动加载，**每次对话生效**。
2. **安全基础模块先写死**：`CryptoService`、`AuthGuard`、`PermissionsGuard`、`DataScopeMiddleware`、`SsrfGuard`、脱敏工具——这些由人工/主 AI 写好并配单元测试，业务 AI 只调用、不修改。
3. **AI 审 AI**：每个模块交付后，用另一个 AI 按第 4 节清单 review 一遍。
4. **机器把关**：CI 里跑 `npm audit` + `eslint`（安全插件）+ `tsc --noEmit`，不通过不合入。
5. **上线前**：跑一遍越权测试（换业务员账号访问他人订单 ID），确认 403。
