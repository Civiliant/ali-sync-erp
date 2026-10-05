# Worm 打印模块对接实现文档（详细版）

> 版本：基于 @worm-vue3-print/core@1.3.1 + @worm-vue3-print/canvas@1.3.1 官方规范
> 开源仓库：https://gitee.com/liulong_oschina/worm-vue3-print
> 适用范围：前端设计器接入、打印预览、服务端 PDF 导出
> 关联文档：Ali-Sync PRD、ali_sync 第三方对接规范

---

## 1. 核心原则（硬约束，不能违反）

1. **Worm 是唯一打印引擎**：禁止引入 hiprint，禁止双模板迁移（旧项目已经踩过这个坑）。
2. **所有动态循环数组必须放在 printData 顶层**：worm 的 table `dataSource` 不支持 `finance.costRows` 这种嵌套路径，只支持 `costRows` 这种顶层字段。嵌套路径会导致表格数据不渲染。
3. **服务端 PDF 导出必须使用官方 print-render 渲染微服务**：禁止在业务后端（Java）里自行集成 Playwright 或 html2canvas 桥接。官方微服务已经处理好分页、字体、清晰度。
4. **三端一致**：浏览器预览、浏览器打印、服务端 PDF 导出必须消费同一份模板 JSON + 同一份 printData，保证渲染结果一致。
5. **渲染容器必须装中文字体**：否则导出的 PDF 中文全部乱码。
6. **版本锁死**：禁止安装旧版 1.2.2（嵌套路径不兼容、跨页表头不支持），禁止安装没有 scope 的 `worm-vue3-print` 包（npm 404）。

---

## 2. 依赖安装

### 2.1 前端安装
```bash
# 在 vben-admin 的 apps/web-antd 目录下执行
pnpm add @worm-vue3-print/core@1.3.1
pnpm add @worm-vue3-print/canvas@1.3.1
```

### 2.2 全局引入设计器样式
在 `main.ts` 或全局样式中引入：
```ts
import '@worm-vue3-print/canvas/native-controls.css'
```

### 2.3 服务端渲染微服务部署（Docker）
```bash
# 使用官方镜像（需自行构建带中文字体的派生镜像）
docker build -t worm-render:1.3.1 -f worm-render/Dockerfile .

# 运行
docker run -d --name worm-render \
  -p 3001:3001 \
  -e RENDER_API_KEY=你的密钥 \
  -e TZ=Asia/Shanghai \
  worm-render:1.3.1
```

`worm-render/Dockerfile`（必须装中文字体）：
```dockerfile
FROM worm-vue3-print-render:1.3.1
# 安装中文字体，防止 PDF 中文乱码
RUN apt-get update && apt-get install -y \
    fonts-wqy-zenhei \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*
```

---

## 3. 前端：模板设计器接入

> 设计器是给用户可视化拖拽编辑模板用的（对应 PRD 的"模板自定义编辑"功能）。

```vue
<!-- src/views/print/PrintTemplateDesigner.vue -->
<template>
  <PrintDesigner
    ref="designerRef"
    :initial-template="templateData"
    :fields="printFields"
    :upload-image="customUploadImage"
    @save="onSaveTemplate"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { PrintDesigner, createDefaultTemplate } from '@worm-vue3-print/canvas'
import { getPrintTemplate, savePrintTemplate } from '@/api/print'

const designerRef = ref()
const templateData = ref(createDefaultTemplate())
const printFields = ref([
  // 声明可拖入模板的业务字段，设计器里用户可直接拖拽绑定
  { key: 'order.orderNo', label: '订单号' },
  { key: 'order.buyerName', label: '买家名称' },
  { key: 'order.createdAt', label: '下单时间' },
  { key: 'products', label: '商品明细', type: 'table' },
  { key: 'costRows', label: '成本明细', type: 'table' },
  { key: 'finance.revenue', label: '订单收入' },
  { key: 'finance.totalCost', label: '总成本' },
  { key: 'finance.netProfit', label: '净利润' },
  { key: 'finance.grossMargin', label: '毛利率' },
])

onMounted(async () => {
  // 加载已有模板（数据库 print_templates.template_content）
  const res = await getPrintTemplate('ORDER_PLANNING')
  if (res.data?.templateContent) {
    templateData.value = JSON.parse(res.data.templateContent)
  }
})

// 印章/Logo 上传：走咱们的 OSS 适配器上传，返回 URL
async function customUploadImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await uploadMaterial(formData)
  return res.data.url
}

// 保存模板 JSON 到数据库
async function onSaveTemplate(json: string) {
  await savePrintTemplate({
    templateType: 'ORDER_PLANNING',
    templateContent: json,
  })
  // 写审计日志（操作人、时间、模板类型）
}
</script>
```

**设计器关键能力（对应 PRD）：**
- 拖拽文本、表格、图片元素
- 图片元素绑定 `upload-image` 钩子 → 上传到 OSS → 返回 URL 渲染
- 表格设置"跨页重复表头"开关（对应多页 PDF 每页都有表头）
- 支持 Z-Index 图层、透明度、旋转（印章/Logo 叠加）

---

## 4. 前端：打印预览组件

> 预览弹窗：打开订单 → 加载模板 JSON + 订单数据 → 渲染预览 → 浏览器打印。

```vue
<!-- src/views/order/components/OrderPrintPreview.vue -->
<template>
  <a-modal :open="visible" width="900" @cancel="close">
    <PrintHtmlPreview
      v-if="visible"
      ref="previewRef"
      :template-json="templateJson"
      :print-data="printData"
    />
    <template #footer>
      <a-button @click="close">关闭</a-button>
      <a-button type="primary" :loading="printing" @click="handlePrint">
        打印
      </a-button>
      <a-button type="primary" :loading="exporting" @click="handleExportPdf">
        导出 PDF
      </a-button>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { PrintHtmlPreview } from '@worm-vue3-print/core'

const props = defineProps<{
  visible: boolean
  orderId: number
}>()

const previewRef = ref()
const templateJson = ref('')
const printData = ref({})
const printing = ref(false)
const exporting = ref(false)

// 关键：每次切换订单必须重新加载模板 + 新订单数据，禁止复用上一次的渲染实例
watch(() => props.orderId, async (orderId) => {
  if (!orderId || !props.visible) return

  // 1. 加载模板（优先使用 worm 模板 printTemplate）
  const tmpl = await getPrintTemplate('ORDER_PLANNING')
  templateJson.value = tmpl.data.templateContent

  // 2. 加载当前订单业务数据
  //    注意：动态数组必须放顶层！products / costRows 都在顶层
  const order = await getOrderPrintData(orderId)
  printData.value = {
    order: order.basic,          // 订单基础信息对象
    products: order.products,    // 商品明细数组（顶层）
    costRows: order.costRows,    // 成本明细数组（顶层）
    finance: order.finance,      // 财务汇总对象
    printDate: formatDate(new Date()),
  }
}, { immediate: true })

// 浏览器打印：直接消费 worm 渲染的 HTML
async function handlePrint() {
  printing.value = true
  try {
    await previewRef.value?.print()
  } finally {
    printing.value = false
  }
}

// 导出 PDF：调后端接口，后端走 worm 官方渲染微服务
async function handleExportPdf() {
  exporting.value = true
  try {
    const blob = await exportOrderPdf(props.orderId)
    // 触发浏览器下载
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `订单规划单_${props.orderId}.pdf`
    a.click()
    URL.revokeObjectURL(url)
  } finally {
    exporting.value = false
  }
}
</script>
```

**⚠️ 关键注意点（旧项目踩过的坑，务必遵守）：**
1. **切换订单必须重新渲染**：销毁上一次 worm 实例，清空 DOM 容器，用新模板+新数据重建，禁止复用初始化缓存的 worm 模板。
2. **数据容错**：业务字段为 null/undefined 时统一填充 `{}` / `[]`，不允许字段缺失导致整个渲染静默空白。
3. **异常兜底**：worm 渲染用 try-catch 捕获，异常时页面输出调试提示，不要白屏。

---

## 5. 服务端：PDF 导出（官方渲染微服务）

### 5.1 架构
```
前端导出按钮
   ↓ POST /api/order/{id}/export/pdf
RuoYi 后端（只做：读模板 + 组装 printData + 转发）
   ↓ POST http://worm-render:3001/render/pdf
worm print-render 微服务（官方，负责 HTML 渲染 + 分页 + PDF 生成）
   ↓
返回 PDF 字节流 → 后端返回给前端下载
```

### 5.2 Java 后端实现

```java
// com.alisync.module.print.service.PrintExportService.java
@Slf4j
@Service
@RequiredArgsConstructor
public class PrintExportService {

    private final PrintTemplateMapper printTemplateMapper;
    private final OrderService orderService;
    private final RestTemplate restTemplate;

    @Value("${alisync.worm.render-url:http://worm-render:3001}")
    private String wormRenderUrl;

    @Value("${alisync.worm.render-api-key}")
    private String renderApiKey;

    /**
     * 导出订单规划单 PDF
     * 业务约束：
     * 1. 动态数组 products/costRows 必须放 printData 顶层（worm dataSource 不支持嵌套路径）
     * 2. 模板从 print_templates 读取 worm 模板 JSON，禁止读 hiprint 旧模板
     * 3. PDF 由官方 print-render 微服务生成，禁止自行集成 Playwright
     */
    public byte[] exportOrderPlanningPdf(Long orderId) {
        // 1. 读取 worm 模板
        String templateJson = printTemplateMapper.getTemplateContent("ORDER_PLANNING");
        if (StringUtils.isBlank(templateJson)) {
            throw new ServiceException("打印模板未配置：ORDER_PLANNING");
        }

        // 2. 组装 printData（关键：数组全放顶层）
        Map<String, Object> printData = new HashMap<>();
        printData.put("order", orderService.getOrderBasic(orderId));        // 订单对象
        printData.put("products", orderService.getOrderProducts(orderId));  // 商品数组（顶层）
        printData.put("costRows", orderService.getOrderCostRows(orderId));  // 成本数组（顶层）
        printData.put("finance", orderService.getOrderFinance(orderId));    // 财务对象
        printData.put("printDate", LocalDate.now().toString());

        // 3. 调用官方渲染微服务
        Map<String, Object> request = new HashMap<>();
        request.put("templateJson", JSON.parseObject(templateJson));
        request.put("printData", printData);

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-Api-Key", renderApiKey);

        HttpEntity<String> entity = new HttpEntity<>(JSON.toJSONString(request), headers);
        ResponseEntity<byte[]> response = restTemplate.postForEntity(
                wormRenderUrl + "/render/pdf", entity, byte[].class);

        if (response.getStatusCode() != HttpStatus.OK) {
            log.error("worm render failed, status={}", response.getStatusCode());
            throw new ServiceException("PDF 渲染失败");
        }

        // 4. 写审计日志
        auditService.record("导出PDF", orderId);
        return response.getBody();
    }
}
```

### 5.3 Controller

```java
// com.alisync.module.print.controller.PrintExportController.java
@RestController
@RequestMapping("/api/order")
@RequiredArgsConstructor
public class PrintExportController {

    private final PrintExportService printExportService;

    /**
     * 导出订单规划单 PDF
     * @param orderId 订单ID
     * @return PDF 字节流
     */
    @SaCheckPermission("order:export:pdf")
    @PostMapping("/{orderId}/export/pdf")
    public ResponseEntity<byte[]> exportPdf(@PathVariable Long orderId) {
        byte[] pdfBytes = printExportService.exportOrderPlanningPdf(orderId);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=order_planning_" + orderId + ".pdf")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }
}
```

### 5.4 Excel / docx 导出
- **Excel**：用 EasyExcel（RuoYi 自带）按导出模板生成，大导出走异步队列（BullMQ/线程池），生成后提供下载链接。
- **docx**：用 poi-tl（Word 模板引擎）按 .docx 模板填充数据，支持自定义模板。
- 这三种导出共用页面筛选条件。

---

## 6. 模板 JSON 规范（print_templates.template_content）

```json
{
  "paper": {
    "width": 210,
    "height": 297,
    "margin": { "top": 10, "right": 10, "bottom": 10, "left": 10 }
  },
  "header": {
    "height": 18,
    "elements": [
      { "type": "text", "options": { "left": 15, "top": 0, "width": 120, "height": 8, "formatter": "Yiwu Misi Knitting Factory", "fontSize": 14, "fontWeight": "bold" } },
      { "type": "text", "options": { "left": 15, "top": 9, "width": 120, "height": 6, "formatter": "客户订单核算单", "fontSize": 11 } },
      { "type": "text", "options": { "left": 140, "top": 0, "width": 55, "height": 6, "formatter": "订单号：{order.orderNo}", "fontSize": 8 } },
      { "type": "text", "options": { "left": 140, "top": 8, "width": 55, "height": 6, "formatter": "打印日期：{printDate}", "fontSize": 8 } }
    ]
  },
  "footer": {
    "height": 8,
    "elements": [
      { "type": "text", "options": { "left": 0, "top": 0, "width": 190, "height": 5, "formatter": "{pageIndex}/{totalPages}", "fontSize": 8, "textAlign": "right" } }
    ]
  },
  "elements": [
    { "type": "table", "options": { "left": 15, "top": 22, "width": 180, "height": 60, "dataSource": "products", "repeatOnPage": true } },
    { "type": "table", "options": { "left": 15, "top": 90, "width": 90, "height": 40, "dataSource": "costRows" } },
    { "type": "image", "options": { "left": 150, "top": 130, "width": 40, "height": 40, "src": "https://oss.xxx.com/seal.png", "opacity": 0.85, "zIndex": 99 } }
  ]
}
```

### 6.1 表格数据结构（tableRows）
```json
{
  "type": "table",
  "options": {
    "dataSource": "products",
    "repeatOnPage": true
  },
  "tableRows": [
    { "type": "header", "cells": [
        { "formatter": "SKU编码", "width": 40 },
        { "formatter": "商品名称", "width": 60 },
        { "formatter": "数量", "width": 20 },
        { "formatter": "单价", "width": 30 },
        { "formatter": "小计", "width": 30 }
    ]},
    { "type": "data", "cells": [
        { "formatter": "{sku}" },
        { "formatter": "{productName}" },
        { "formatter": "{orderedQuantity}" },
        { "formatter": "{unitPrice}" },
        { "formatter": "{calculatedSubtotal}" }
    ]}
  ]
}
```

**表格硬约束：**
- `tableRows` 必须同时有 `type: "header"` 和 `type: "data"`，否则整张表无输出
- `dataSource` 必须指向 printData **顶层**数组（如 `products`、`costRows`），禁止 `finance.costRows` 这种嵌套路径
- data 行单元格用**行内相对字段**（`{sku}`、`{label}`），不是 `{products.sku}`、`{finance.costRows.label}`
- 跨页重复表头：`repeatOnPage: true`（多页 PDF 每页都显示表头）

---

## 7. 避坑清单（旧项目所有踩过的坑，全部列在这里）

| # | 坑 | 正确做法 |
|---|---|---|
| 1 | dataSource 用嵌套路径 `finance.costRows` | 顶层字段 `_costRows` 或 `costRows`，业务层构造 printData 时平铺 |
| 2 | 表格缺 header 或 data 行 | 迁移/生成模板时强制同时生成两种行 |
| 3 | 模板缓存脏数据 | 每次渲染前校验模板结构，异常时重新生成 |
| 4 | 切换订单复用旧 worm 实例 | 每次切换销毁重建，重新渲染 |
| 5 | 业务字段 null 导致白屏 | printData 统一兜底 `{}` / `[]`，渲染加 try-catch |
| 6 | 服务端自行集成 Playwright | 用官方 print-render 微服务 |
| 7 | 容器没装中文字体，PDF 乱码 | Dockerfile 安装 fonts-wqy-zenhei / fonts-noto-cjk |
| 8 | 表格无边框 | 模板表格元素设置边框样式（border） |
| 9 | 成本表/毛利率元素错位 | 设计器内重新定位，元素用绝对坐标且不与外层容器重叠 |
| 10 | 安装旧版 1.2.2 / 无 scope 的包 | 锁死 @worm-vue3-print/core@1.3.1 + canvas@1.3.1 |

---

## 8. 验收清单

- [ ] 设计器可打开、拖拽文本/表格/图片、保存模板 JSON
- [ ] 印章/Logo 上传到 OSS 后可在模板中拖拽、调透明度/Z-Index
- [ ] 预览弹窗打开订单正常渲染，无白屏
- [ ] 切换 3 条不同订单，内容正确切换，无旧内容残留
- [ ] 商品数组为空时至少表头显示，不白屏
- [ ] 多页订单 PDF：第 2 页重复文档页眉、商品表重复表头、页脚 1/2、2/2
- [ ] 浏览器预览 = 浏览器打印 = 导出 PDF，三端视觉一致
- [ ] PDF 中文正常、无乱码、表格边框完整
- [ ] 导出 PDF 不报 HIPRINT_ASSET_DIR、不依赖任何 hiprint/canvg 资源
- [ ] Excel、docx 导出正常，与筛选条件联动
