-- ============================================================
-- Ali-Sync 跨境电商智能 ERP · 数据库设计 (PostgreSQL 16)
-- 版本：v2.0（对齐 PRD V3.5 + 最终技术栈 NestJS+Prisma）
-- 全局约定：
--   1. 金额字段统一 NUMERIC(18,2)（保留 2 位小数）
--   2. 汇率字段统一 NUMERIC(18,6)（保留 6 位小数，保证利润换算精度）
--   3. 所有表含 created_at / updated_at；软删除用 deleted_at
--   4. 店铺级数据隔离：业务数据均带 store_id 或经绑定关系过滤
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 一、系统与权限 (8 张)
-- ============================================================

-- 1. 用户
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    username      VARCHAR(64)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    email         VARCHAR(128),
    phone         VARCHAR(32),
    real_name     VARCHAR(64),
    avatar_url    VARCHAR(512),
    dept_id       BIGINT,                                   -- 见 departments
    status        SMALLINT     NOT NULL DEFAULT 1,          -- 1启用 0禁用
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);

-- 2. 部门（多人协作组织）
CREATE TABLE departments (
    id          BIGSERIAL PRIMARY KEY,
    parent_id   BIGINT,
    name        VARCHAR(64) NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users ADD CONSTRAINT fk_users_dept
    FOREIGN KEY (dept_id) REFERENCES departments(id) ON DELETE SET NULL;

-- 3. 角色
CREATE TABLE roles (
    id          BIGSERIAL PRIMARY KEY,
    code        VARCHAR(64) NOT NULL UNIQUE,                -- boss / operator / finance ...
    name        VARCHAR(64) NOT NULL,
    description VARCHAR(255),
    is_builtin  BOOLEAN NOT NULL DEFAULT FALSE,             -- 内置角色禁止删除
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. 权限点（按钮级）
CREATE TABLE permissions (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(128) NOT NULL UNIQUE,                -- order:cost:write / store:manage ...
    name       VARCHAR(128) NOT NULL,
    module     VARCHAR(64)  NOT NULL,                       -- order/product/store ...
    menu_id    BIGINT,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- 5. 用户-角色
CREATE TABLE user_roles (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

-- 6. 角色-权限
CREATE TABLE role_permissions (
    role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- 7. 菜单（前端导航 + 权限树）
CREATE TABLE menus (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT,
    name       VARCHAR(64)  NOT NULL,
    path       VARCHAR(255),
    component  VARCHAR(255),
    icon       VARCHAR(64),
    sort_order INTEGER NOT NULL DEFAULT 0,
    visible    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE permissions ADD CONSTRAINT fk_permissions_menu
    FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE SET NULL;

-- 8. 登录日志
CREATE TABLE login_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    username    VARCHAR(64),
    ip          VARCHAR(64),
    user_agent  VARCHAR(512),
    status      VARCHAR(16) NOT NULL,                       -- success / failed
    message     VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 二、店铺与平台账号 (5 张)
-- ============================================================

-- 9. 店铺（一个已授权平台账号 = 一个店铺）
CREATE TABLE stores (
    id                       BIGSERIAL PRIMARY KEY,
    name                     VARCHAR(128) NOT NULL,
    platform                 VARCHAR(32)  NOT NULL DEFAULT 'alibaba_intl', -- alibaba_intl / 1688
    account_id               VARCHAR(128),                  -- 平台会员 ID
    app_key                  VARCHAR(128) NOT NULL,
    app_secret_enc           TEXT         NOT NULL,         -- AES-256-GCM
    access_token_enc         TEXT,
    refresh_token_enc        TEXT,
    access_token_expires_at  TIMESTAMPTZ,
    refresh_token_expires_at TIMESTAMPTZ,
    auth_status              VARCHAR(32) NOT NULL DEFAULT 'PENDING', -- PENDING/AUTHORIZED/EXPIRED/REFRESH_FAILED
    status                   SMALLINT NOT NULL DEFAULT 1,
    sync_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
    last_order_sync_at       TIMESTAMPTZ,
    last_product_sync_at     TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at               TIMESTAMPTZ
);
CREATE INDEX idx_stores_platform ON stores(platform, status);

-- 10. 平台子账号（国际站同步下来的子账号）
CREATE TABLE platform_accounts (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    account_id  VARCHAR(128) NOT NULL,                      -- 平台子账号 ID
    name        VARCHAR(128),
    role        VARCHAR(64),                                -- 平台角色
    status      VARCHAR(32) NOT NULL DEFAULT 'active',
    platform_raw JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_platform_accounts UNIQUE (store_id, account_id)
);

-- 11. 平台子账号绑定 ERP 员工（数据隔离依据）
CREATE TABLE platform_account_bindings (
    id                  BIGSERIAL PRIMARY KEY,
    store_id            BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    platform_account_id BIGINT NOT NULL REFERENCES platform_accounts(id) ON DELETE CASCADE,
    user_id             BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_account_binding UNIQUE (platform_account_id, user_id)
);
CREATE INDEX idx_binding_user ON platform_account_bindings(user_id);

-- 12. OAuth state（防 CSRF，存 Redis 的落库备份）
CREATE TABLE alibaba_oauth_states (
    id         BIGSERIAL PRIMARY KEY,
    state      VARCHAR(128) NOT NULL UNIQUE,
    store_id   BIGINT,
    expires_at TIMESTAMPTZ NOT NULL,
    used       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. OAuth 授权日志
CREATE TABLE alibaba_oauth_logs (
    id          BIGSERIAL PRIMARY KEY,
    store_id    BIGINT REFERENCES stores(id) ON DELETE SET NULL,
    action      VARCHAR(32) NOT NULL,                       -- authorize/refresh/callback
    status      VARCHAR(16) NOT NULL,                       -- success/failed
    error_code  VARCHAR(64),
    error_message TEXT,
    ip          VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 三、商品 (9 张)
-- ============================================================

-- 14. 本地产品主表（含本地成本价）
CREATE TABLE products (
    id            BIGSERIAL PRIMARY KEY,
    store_id      BIGINT REFERENCES stores(id) ON DELETE CASCADE, -- NULL=全局本地产品
    group_id      BIGINT,                                   -- 见 product_groups
    supplier_id   BIGINT,                                   -- 默认供应商
    title         VARCHAR(512),
    category_id   VARCHAR(64),
    category_name VARCHAR(255),
    main_image_url VARCHAR(1024),
    tags          JSONB,                                    -- 标签 ID 数组（关联 product_tags）
    cost_price    NUMERIC(18,2),                            -- 本地产品成本价（订单成本默认值）
    currency      VARCHAR(8)  NOT NULL DEFAULT 'CNY',
    status        VARCHAR(32) NOT NULL DEFAULT 'active',    -- active/inactive
    platform_raw  JSONB,
    synced_at     TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_products_store ON products(store_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);

-- 15. 产品 SKU（双轨库存 + SKU 级成本价）
CREATE TABLE product_skus (
    id             BIGSERIAL PRIMARY KEY,
    product_id     BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    sku_code       VARCHAR(128),
    spec_attrs     JSONB,                                   -- [{name,value}]
    cost_price     NUMERIC(18,2),                           -- SKU 级成本价（优先于产品级）
    price          NUMERIC(18,2),
    currency       VARCHAR(8),
    local_stock    INTEGER NOT NULL DEFAULT 0,              -- ERP 本地库存（订单扣减此值）
    platform_stock INTEGER NOT NULL DEFAULT 0,              -- 平台同步库存（仅参考）
    weight         NUMERIC(12,3),
    wholesale_prices JSONB,                                 -- 阶梯价快照 [{minQty,maxQty,price}]
    platform_raw   JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at     TIMESTAMPTZ,
    CONSTRAINT uq_skus_product_code UNIQUE (product_id, sku_code)
);
CREATE INDEX idx_skus_product ON product_skus(product_id);

-- 16. 产品图片
CREATE TABLE product_images (
    id         BIGSERIAL PRIMARY KEY,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url  VARCHAR(1024) NOT NULL,
    is_main    BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pimages_product ON product_images(product_id);

-- 17. 产品分组/分类
CREATE TABLE product_groups (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT,
    name       VARCHAR(128) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE products ADD CONSTRAINT fk_products_group
    FOREIGN KEY (group_id) REFERENCES product_groups(id) ON DELETE SET NULL;

-- 18. 产品标签（字典，产品通过 products.tags JSONB 关联）
CREATE TABLE product_tags (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(64) NOT NULL UNIQUE,
    color      VARCHAR(16),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 19. 平台商品映射（本地产品/SKU ↔ 平台产品/SKU）
CREATE TABLE product_platform_mappings (
    id                 BIGSERIAL PRIMARY KEY,
    store_id           BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    platform           VARCHAR(32) NOT NULL DEFAULT 'alibaba_intl',
    platform_product_id VARCHAR(128) NOT NULL,
    platform_sku_id    VARCHAR(128),
    product_id         BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_sku_id     BIGINT REFERENCES product_skus(id) ON DELETE CASCADE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_platform_mapping UNIQUE (store_id, platform, platform_product_id, platform_sku_id)
);
CREATE INDEX idx_mapping_local ON product_platform_mappings(product_sku_id);

-- 20. 阶梯采购价（V1+，用于按数量命中采购成本）
CREATE TABLE wholesale_prices (
    id             BIGSERIAL PRIMARY KEY,
    product_sku_id BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    min_qty        INTEGER NOT NULL,
    max_qty        INTEGER,                                 -- NULL = 无上限
    unit_price     NUMERIC(18,2) NOT NULL,
    currency       VARCHAR(8) NOT NULL DEFAULT 'CNY',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wholesale_sku ON wholesale_prices(product_sku_id);

-- 21. 成本价历史
CREATE TABLE product_cost_history (
    id             BIGSERIAL PRIMARY KEY,
    product_sku_id BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    old_cost       NUMERIC(18,2),
    new_cost       NUMERIC(18,2) NOT NULL,
    currency       VARCHAR(8) NOT NULL DEFAULT 'CNY',
    changed_by     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. 库存流水（双轨：local / platform）
CREATE TABLE inventory (
    id             BIGSERIAL PRIMARY KEY,
    product_sku_id BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    store_id       BIGINT REFERENCES stores(id) ON DELETE CASCADE,
    stock_type     VARCHAR(16) NOT NULL,                    -- local / platform
    change_type    VARCHAR(32) NOT NULL,                    -- order_deduct/order_restore/sync/manual_adjust/purchase_in
    quantity       INTEGER NOT NULL,                        -- 正=入，负=出
    before_qty     INTEGER NOT NULL,
    after_qty      INTEGER NOT NULL,
    ref_type       VARCHAR(32),                             -- order/purchase/sync ...
    ref_id         VARCHAR(128),
    note           TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_inventory_sku ON inventory(product_sku_id, stock_type, created_at DESC);

-- ============================================================
-- 四、供应商 (2 张)
-- ============================================================

-- 23. 供应商档案
CREATE TABLE suppliers (
    id           BIGSERIAL PRIMARY KEY,
    name         VARCHAR(128) NOT NULL,
    contact_name VARCHAR(64),
    phone        VARCHAR(32),
    wechat       VARCHAR(64),
    address      VARCHAR(255),
    settlement_cycle VARCHAR(32),                           -- 结算周期
    bank_account VARCHAR(64),                               -- 敏感，界面脱敏
    remark       TEXT,
    status       SMALLINT NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

-- 24. 供应商-商品 关联（反向追溯）
CREATE TABLE supplier_products (
    supplier_id BIGINT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    product_id  BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    is_default  BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (supplier_id, product_id)
);
ALTER TABLE products ADD CONSTRAINT fk_products_supplier
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;

-- ============================================================
-- 五、订单 (9 张)
-- ============================================================

-- 25. 订单主表（含汇率锁账快照）
CREATE TABLE orders (
    id                    BIGSERIAL PRIMARY KEY,
    store_id              BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    platform              VARCHAR(32) NOT NULL DEFAULT 'alibaba_intl',
    platform_order_id     VARCHAR(128) NOT NULL,            -- 平台订单号（幂等键）
    customer_id           BIGINT,                           -- 外键见 customers 表定义后
    buyer_name            VARCHAR(128),
    buyer_email           VARCHAR(128),
    buyer_phone           VARCHAR(32),                      -- 敏感，界面脱敏
    order_status          VARCHAR(32) NOT NULL DEFAULT 'pending', -- ERP业务状态: pending/paid/ready_to_ship/shipped/completed/cancelled/refunded/frozen
    platform_status       VARCHAR(32),                           -- 平台原始状态: unpay/paid/captured/undeliver/delivering/wait_confirm_receipt/trade_success/trade_close/charge_back/frozen
    -- 金额（原币，2 位）
    currency              VARCHAR(8),
    total_amount          NUMERIC(18,2),
    freight_amount        NUMERIC(18,2),
    discount_amount       NUMERIC(18,2),
    platform_fee          NUMERIC(18,2),                    -- 平台手续费
    paid_amount           NUMERIC(18,2),
    -- 汇率锁账快照
    lock_status           VARCHAR(16) NOT NULL DEFAULT 'UNLOCKED', -- UNLOCKED/LOCKED
    exchange_rate_snapshot NUMERIC(18,6),                   -- 锁账时内部记账汇率快照
    revenue_cny           NUMERIC(18,2),                    -- 订单收入(折人民币) = paid_amount × 汇率快照
    locked_at             TIMESTAMPTZ,
    locked_by             BIGINT REFERENCES users(id) ON DELETE SET NULL,
    -- 时间
    order_time            TIMESTAMPTZ,
    pay_time              TIMESTAMPTZ,
    ship_time             TIMESTAMPTZ,
    complete_time         TIMESTAMPTZ,
    -- 物流
    logistics_company     VARCHAR(128),
    tracking_no           VARCHAR(128),
    -- 其他
    sync_status           VARCHAR(16) NOT NULL DEFAULT 'synced',
    remark                TEXT,
    platform_raw          JSONB,
    synced_at             TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at            TIMESTAMPTZ,
    CONSTRAINT uq_orders_store_platform UNIQUE (store_id, platform_order_id)
);
CREATE INDEX idx_orders_store_status ON orders(store_id, order_status);
CREATE INDEX idx_orders_store_time ON orders(store_id, order_time DESC);
CREATE INDEX idx_orders_customer ON orders(customer_id);

-- 26. 订单明细
CREATE TABLE order_items (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id    BIGINT REFERENCES products(id) ON DELETE SET NULL,
    product_sku_id BIGINT REFERENCES product_skus(id) ON DELETE SET NULL,
    platform_product_id VARCHAR(128),
    platform_sku_id    VARCHAR(128),
    sku_code      VARCHAR(128),
    product_title VARCHAR(512),
    image_url     VARCHAR(1024),
    spec_attrs    JSONB,
    quantity      INTEGER NOT NULL DEFAULT 1,
    unit_price    NUMERIC(18,2),
    currency      VARCHAR(8),
    amount        NUMERIC(18,2),
    platform_raw  JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_order ON order_items(order_id);
CREATE INDEX idx_items_sku ON order_items(product_sku_id);

-- 27. 订单成本（三类：采购/运输/其他）
CREATE TABLE order_costs (
    id            BIGSERIAL PRIMARY KEY,
    order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    cost_type     VARCHAR(32) NOT NULL,                     -- purchase/transport/other
    amount        NUMERIC(18,2) NOT NULL,
    currency      VARCHAR(8) NOT NULL DEFAULT 'CNY',
    exchange_rate NUMERIC(18,6) NOT NULL DEFAULT 1,
    amount_cny    NUMERIC(18,2) NOT NULL,
    source_type   VARCHAR(16) NOT NULL DEFAULT 'manual',    -- auto/manual（auto=绑定本地产品成本价带出）
    ref_no        VARCHAR(128),                             -- 1688采购单号/线下收据号
    note          TEXT,
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_costs_order ON order_costs(order_id);

-- 28. 成本类型字典
CREATE TABLE cost_types (
    code       VARCHAR(32) PRIMARY KEY,
    name       VARCHAR(64) NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    enabled    BOOLEAN NOT NULL DEFAULT TRUE
);
INSERT INTO cost_types (code, name, sort_order) VALUES
    ('purchase',  '采购成本', 1),
    ('transport', '运输成本', 2),
    ('other',     '其他成本', 3);

-- 29. 发货单
CREATE TABLE shipments (
    id                BIGSERIAL PRIMARY KEY,
    store_id          BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    order_id          BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    logistics_company VARCHAR(128),
    tracking_no       VARCHAR(128),
    ship_status       VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending/shipped/delivered
    ship_time         TIMESTAMPTZ,
    platform_raw      JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipments_order ON shipments(order_id);

-- 30. 发货单明细
CREATE TABLE shipment_items (
    id             BIGSERIAL PRIMARY KEY,
    shipment_id    BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    order_item_id  BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    quantity       INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipitems_shipment ON shipment_items(shipment_id);

-- 31. 采购单（缺货一键生成）
CREATE TABLE purchase_orders (
    id           BIGSERIAL PRIMARY KEY,
    order_id     BIGINT REFERENCES orders(id) ON DELETE SET NULL, -- 关联订单（缺货触发）
    supplier_id  BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
    status       VARCHAR(32) NOT NULL DEFAULT 'draft',      -- draft/placed/received/cancelled
    total_amount NUMERIC(18,2),
    currency     VARCHAR(8) NOT NULL DEFAULT 'CNY',
    remark       TEXT,
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_order ON purchase_orders(order_id);

-- 32. 采购单明细
CREATE TABLE purchase_order_items (
    id               BIGSERIAL PRIMARY KEY,
    purchase_order_id BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_sku_id   BIGINT NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
    quantity         INTEGER NOT NULL,
    unit_price       NUMERIC(18,2),
    amount           NUMERIC(18,2),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_purchase_items ON purchase_order_items(purchase_order_id);

-- 33. 订单状态流转日志
CREATE TABLE order_status_logs (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status VARCHAR(32),
    to_status   VARCHAR(32) NOT NULL,
    operator_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    remark      VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_statuslog_order ON order_status_logs(order_id);

-- ============================================================
-- 六、客户 (1 张)
-- ============================================================

-- 34. 买家/客户
CREATE TABLE customers (
    id                BIGSERIAL PRIMARY KEY,
    store_id          BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    platform_buyer_id VARCHAR(128) NOT NULL,
    name              VARCHAR(128),
    email             VARCHAR(128),                         -- 敏感，界面脱敏
    phone             VARCHAR(32),                          -- 敏感，界面脱敏
    country           VARCHAR(64),
    country_code      VARCHAR(8),
    address           TEXT,                                 -- 敏感，界面脱敏
    platform_raw      JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_customers_store_buyer UNIQUE (store_id, platform_buyer_id)
);
CREATE INDEX idx_customers_store ON customers(store_id);
ALTER TABLE orders ADD CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

-- ============================================================
-- 七、汇率 (2 张)
-- ============================================================

-- 35. 内部记账汇率（当前生效值）
CREATE TABLE exchange_rates (
    id            BIGSERIAL PRIMARY KEY,
    currency_code VARCHAR(8) NOT NULL UNIQUE,               -- USD/EUR/GBP...
    rate_to_cny   NUMERIC(18,6) NOT NULL,                   -- 1 外币 = X CNY（6 位）
    updated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 36. 汇率变更历史（订单按下单时间取对应历史汇率）
CREATE TABLE exchange_rate_logs (
    id            BIGSERIAL PRIMARY KEY,
    currency_code VARCHAR(8) NOT NULL,
    old_rate      NUMERIC(18,6),
    new_rate      NUMERIC(18,6) NOT NULL,
    effective_at  TIMESTAMPTZ NOT NULL,                     -- 生效时间
    updated_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    note          VARCHAR(255),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ratelog_currency_time ON exchange_rate_logs(currency_code, effective_at DESC);

-- ============================================================
-- 八、数据同步 (2 张)
-- ============================================================

-- 37. 同步任务记录
CREATE TABLE sync_jobs (
    id            BIGSERIAL PRIMARY KEY,
    store_id      BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sync_type     VARCHAR(16) NOT NULL,                     -- order / product
    trigger_type  VARCHAR(16) NOT NULL,                     -- schedule / manual
    status        VARCHAR(16) NOT NULL,                     -- running/success/partial/failed
    total_count   INTEGER NOT NULL DEFAULT 0,
    success_count INTEGER NOT NULL DEFAULT 0,
    fail_count    INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_syncjobs_store_type ON sync_jobs(store_id, sync_type, started_at DESC);

-- 38. 同步任务明细（单条级失败重试）
CREATE TABLE sync_job_items (
    id           BIGSERIAL PRIMARY KEY,
    sync_job_id  BIGINT NOT NULL REFERENCES sync_jobs(id) ON DELETE CASCADE,
    platform_id  VARCHAR(128) NOT NULL,                     -- 平台订单号/产品ID
    status       VARCHAR(16) NOT NULL,                      -- success/failed/skipped
    error_code   VARCHAR(64),
    error_message TEXT,
    retry_count  INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_syncjobitems_job ON sync_job_items(sync_job_id, status);

-- ============================================================
-- 九、打印与导出 (5 张)
-- ============================================================

-- 39. 打印模板（worm 设计器 JSON）
CREATE TABLE print_templates (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(128) NOT NULL,
    scene            VARCHAR(32) NOT NULL,                  -- label/pickup/purchase/invoice/planning
    template_content JSONB NOT NULL,                        -- worm 模板 JSON
    is_default       BOOLEAN NOT NULL DEFAULT FALSE,
    created_by       BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 40. 打印队列
CREATE TABLE print_queue (
    id           BIGSERIAL PRIMARY KEY,
    template_id  BIGINT REFERENCES print_templates(id) ON DELETE SET NULL,
    order_id     BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    status       VARCHAR(16) NOT NULL DEFAULT 'pending',    -- pending/processing/success/failed
    result_path  VARCHAR(512),
    error_message TEXT,
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

-- 41. 导出队列
CREATE TABLE export_queue (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type         VARCHAR(32) NOT NULL,                      -- orders/products/reports
    format       VARCHAR(8)  NOT NULL DEFAULT 'xlsx',       -- xlsx/pdf/docx
    filter_json  JSONB,
    status       VARCHAR(16) NOT NULL DEFAULT 'pending',
    file_name    VARCHAR(255),
    file_path    VARCHAR(512),
    error_message TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);
CREATE INDEX idx_export_user ON export_queue(user_id, created_at DESC);

-- 42. 订单规划书模板
CREATE TABLE order_planning_templates (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    content     JSONB NOT NULL,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 43. 订单 Word 模板
CREATE TABLE order_word_templates (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(128) NOT NULL,
    content     JSONB NOT NULL,
    created_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 十、素材 (2 张)
-- ============================================================

-- 44. 素材文件夹
CREATE TABLE material_folders (
    id         BIGSERIAL PRIMARY KEY,
    parent_id  BIGINT,
    name       VARCHAR(128) NOT NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 45. 素材（图片等，OSS 存储）
CREATE TABLE materials (
    id            BIGSERIAL PRIMARY KEY,
    folder_id     BIGINT REFERENCES material_folders(id) ON DELETE SET NULL,
    file_name     VARCHAR(255) NOT NULL,
    file_size     INTEGER NOT NULL,                         -- 字节，<=10MB
    mime_type     VARCHAR(64),
    oss_url       VARCHAR(1024),                            -- 原图
    standard_url  VARCHAR(1024),                            -- 压缩标准版（长边1200px）
    thumb_url     VARCHAR(1024),                            -- 缩略图
    width         INTEGER,
    height        INTEGER,
    tags          JSONB,                                    -- 标签数组
    created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_materials_folder ON materials(folder_id);

-- ============================================================
-- 十一、AI 审查 (4 张)
-- ============================================================

-- 46. AI 网关配置（自备 Base URL + Key）
CREATE TABLE ai_gateway_configs (
    id         BIGSERIAL PRIMARY KEY,
    name       VARCHAR(128) NOT NULL,
    base_url   VARCHAR(512) NOT NULL,
    api_key_enc TEXT        NOT NULL,                       -- AES 加密
    model      VARCHAR(128),
    is_active  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 47. AI 审查任务
CREATE TABLE ai_inspection_jobs (
    id           BIGSERIAL PRIMARY KEY,
    gateway_id   BIGINT REFERENCES ai_gateway_configs(id) ON DELETE SET NULL,
    inspect_type VARCHAR(32) NOT NULL,                      -- image/title
    status       VARCHAR(16) NOT NULL DEFAULT 'pending',    -- pending/processing/success/failed
    total_items  INTEGER NOT NULL DEFAULT 0,
    done_items   INTEGER NOT NULL DEFAULT 0,
    created_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

-- 48. AI 审查任务明细
CREATE TABLE ai_inspection_items (
    id         BIGSERIAL PRIMARY KEY,
    job_id     BIGINT NOT NULL REFERENCES ai_inspection_jobs(id) ON DELETE CASCADE,
    product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
    material_id BIGINT REFERENCES materials(id) ON DELETE SET NULL,
    input_ref  VARCHAR(512),                                -- 图片 URL 或标题文本
    status     VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 49. AI 审查结果
CREATE TABLE ai_inspection_results (
    id           BIGSERIAL PRIMARY KEY,
    item_id      BIGINT NOT NULL REFERENCES ai_inspection_items(id) ON DELETE CASCADE,
    risk_level   VARCHAR(16),                               -- none/low/medium/high
    risk_type    VARCHAR(64),                               -- trademark/logo/forbidden_word...
    description  TEXT,
    raw_response JSONB,
    review_status VARCHAR(16) NOT NULL DEFAULT 'pending',   -- pending/confirmed/dismissed
    reviewed_by  BIGINT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 十二、系统配置 / 审计 / 告警 (4 张)
-- ============================================================

-- 50. 系统配置（可视化配置页）
CREATE TABLE system_configs (
    id          BIGSERIAL PRIMARY KEY,
    config_key  VARCHAR(128) NOT NULL UNIQUE,
    config_value TEXT,
    is_secret   BOOLEAN NOT NULL DEFAULT FALSE,             -- 敏感字段 AES 加密，界面掩码
    description VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 51. 审计事件（写操作 Diff 日志）
CREATE TABLE audit_events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(32) NOT NULL,                       -- create/update/delete/export/sync/bind...
    module      VARCHAR(64) NOT NULL,
    target_type VARCHAR(64),
    target_id   VARCHAR(128),
    before_json JSONB,                                      -- 变更前
    after_json  JSONB,                                      -- 变更后
    ip          VARCHAR(64),
    user_agent  VARCHAR(512),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user_time ON audit_events(user_id, created_at DESC);
CREATE INDEX idx_audit_module_target ON audit_events(module, target_type, target_id);

-- 52. 操作日志（轻量，高频）
CREATE TABLE operation_logs (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
    module      VARCHAR(64) NOT NULL,
    action      VARCHAR(64) NOT NULL,
    description VARCHAR(255),
    ip          VARCHAR(64),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_oplog_user_time ON operation_logs(user_id, created_at DESC);

-- 53. 通知/告警（缺货、同步失败、token 刷新失败）
CREATE TABLE notifications (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
    type         VARCHAR(32) NOT NULL,                      -- stock_warning/sync_failed/token_refresh_failed
    title        VARCHAR(128) NOT NULL,
    content      TEXT,
    ref_type     VARCHAR(32),
    ref_id       VARCHAR(128),
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON notifications(user_id, is_read, created_at DESC);

-- ============================================================
-- 附：利润核算视图（含锁账快照）
-- ============================================================
-- 订单收入(折CNY) = paid_amount × exchange_rate_snapshot（锁账后固定）
-- 订单总成本(折CNY) = Σ order_costs.amount_cny
-- 净利润 = 收入 − 总成本

CREATE OR REPLACE VIEW v_order_profit AS
SELECT
    o.id                                        AS order_id,
    o.store_id,
    o.platform_order_id,
    o.order_status,
    o.lock_status,
    o.currency,
    o.paid_amount,
    o.exchange_rate_snapshot                    AS rate_snapshot,
    o.revenue_cny                               AS revenue_cny,
    COALESCE(c.total_cost_cny, 0)               AS cost_cny,
    o.revenue_cny - COALESCE(c.total_cost_cny, 0) AS gross_profit_cny,
    CASE
        WHEN o.revenue_cny = 0 THEN 0
        ELSE ROUND((o.revenue_cny - COALESCE(c.total_cost_cny, 0)) / o.revenue_cny * 100, 2)
    END                                         AS gross_margin_pct
FROM orders o
LEFT JOIN (
    SELECT order_id, SUM(amount_cny) AS total_cost_cny
    FROM order_costs
    GROUP BY order_id
) c ON c.order_id = o.id
WHERE o.deleted_at IS NULL;
