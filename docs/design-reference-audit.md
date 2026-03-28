# Design Reference Audit Map

生成时间：2026-03-28

本文档用于复查“页面用途 -> 参考网站 -> 模块映射 -> 本地实现路径”。

## 1. 页面角色拆分

| 页面 | 角色 | 参考网站 |
| --- | --- | --- |
| `docs/index.html` | Skill 宣传首页 | 非单站复刻，汇总本 skill 能力与样例入口 |
| `docs/demos/wuhan-tourism-tlb/index.html` | 武汉城市宣传样例（TLB 高保真） | `https://tlb.betteroff.studio/` |
| `docs/demos/whu-promo-gq-hifi/index.html` | 武汉大学宣传样例（GQ 风格） | GQ 榜一参考站 |
| `docs/demos/wuhan-tourism-v1/index.html` | 武汉旅游样例 1.0（历史版本） | GQ 风格迁移 |

## 2. TLB 武汉样例模块映射

页面文件：`docs/demos/wuhan-tourism-tlb/index.html`

| 本地模块 | 参考站模块 | 复刻要点 | 本地迁移 |
| --- | --- | --- | --- |
| 顶部菜单（Timeline/Surf/Index/About） | 顶部路由菜单 | 轻量文本导航 + active 强调 + 切页反馈 | 保留路由结构，内容替换为武汉叙事章节 |
| 右侧月份索引墙 | 年度索引信息墙 | 双列固定索引、等宽字、高密度信息 | 保留视觉密度，文案替换为样例数据 |
| 门禁首屏（Enter with sound） | 首屏 gate | 大标题 + 声音入口 + 无声入口 | 标题与文案替换为武汉主题，接入本地音频 |
| 路由转场 | 页面切换动效 | 淡入/位移/主题切换 | `timeline/index` 浅底，`surf/about` 深底 |
| 滚动 reveal | 章节滚动动效 | GSAP + ScrollTrigger 节点揭示 | 应用于故事卡、媒体卡、索引卡 |
| 按钮与卡片反馈 | hover/click 交互 | 按压、点击冲击波、轻倾斜 | 保持原交互语义，替换为中文内容块 |
| 跑马灯关键词带 | 连续信息带 | 横向循环滚动 | 替换为武汉城市关键词 |

## 3. 中文适配修正（本轮）

针对中文字体与排版问题，已在 `docs/demos/wuhan-tourism-tlb/styles.css` 完成：

- 增加中文显示字族变量：`--cn-display`
- 门禁标题拆分为中英文行，分别控制字号与字距
- 中文大标题使用 `route-title-cn`，关闭英文式 uppercase
- 中文段落统一 `line-height` 与 `word-break: keep-all`
- 主内容区宽度调整并给右侧索引留出避让空间，避免叠压

## 4. 证据与资源

参考站真实抓取证据：

- `output/awwwards-design-selector/reference-evidence/tlb-betteroff-live/evidence.json`
- `output/awwwards-design-selector/reference-evidence/tlb-betteroff-live/desktop-fullpage.png`
- `output/awwwards-design-selector/reference-evidence/tlb-betteroff-live/mobile-fullpage.png`
- `output/awwwards-design-selector/reference-evidence/tlb-betteroff-live/timeline/*.png`
- `output/awwwards-design-selector/reference-evidence/tlb-betteroff-live/interactions/*.png`

TLB 武汉样例资源：

- `docs/demos/wuhan-tourism-tlb/assets/`

## 5. 可复验命令

```bash
# 1) 参考站证据抓取
node scripts/capture_no_recording_evidence.js --url "https://tlb.betteroff.studio/" --site-id tlb-betteroff-live --frames 12

# 2) 首页 smoke（skill 宣传页）
node scripts/pre_delivery_smoke_test.js --page docs --out docs/pre-delivery-smoke.json

# 3) TLB 武汉样例 smoke
node scripts/pre_delivery_smoke_test.js --page docs/demos/wuhan-tourism-tlb --out docs/demos/wuhan-tourism-tlb/pre-delivery-smoke.json
```
