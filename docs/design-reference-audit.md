# Design Reference Audit Map

生成时间：2026-03-28

本文档用于复查“本地页面模块 -> 参考网站设计语言 -> 迁移实现”的映射关系。

## 1. 当前主参考站

| 参考站 | URL | 用途 |
| --- | --- | --- |
| Better Off THE LOOKBACK | `https://tlb.betteroff.studio/` | `docs/index.html` 的主复刻参考（结构、交互、动效、视觉节奏） |

本轮已在 `output/awwwards-design-selector/reference-evidence/tlb-betteroff-live/` 保存真实访问证据：

- `desktop-fullpage.png`
- `mobile-fullpage.png`
- `timeline/*.png`
- `interactions/*.png`
- `evidence.json`

## 2. 首页模块映射（TLB -> 武汉版）

页面文件：`docs/index.html`

| 本地模块 | 参考站模块 | 复刻点 | 武汉化改造 |
| --- | --- | --- | --- |
| 顶部左侧菜单（Timeline/Surf/Index/About） | 顶部左侧路由菜单 | 文本导航、轻量 hover 强调、路由状态高亮 | 菜单保留原路由词，内容落地到武汉叙事章节 |
| 右侧月份索引双列 | 右侧年度索引信息墙 | 高密度等宽信息列表、固定在右侧 | 保留格式与节奏，改为武汉宣传语境的数据标签 |
| 门禁首屏（Enter with sound / ...or without） | 首屏进入门禁 | 居中超大标题 + 声音入口 + 无声入口 | 标题改为“武汉城市档案 THE LOOKBACK (WH®)/2026”，音频替换为本地武汉氛围音轨 |
| 超大无衬线标题层级 | 原站巨型 display 标题 | 黑白高对比、紧凑字距、强层级 | 中文主文案优先，保留英文字母块节奏 |
| 路由切换转场 | 原站页面切换过渡 | 切换时淡入/位移，主题色切换 | `timeline/index` 用浅底，`surf/about` 用暗底，增强章节区分 |
| 滚动 reveal 与 hero 动效 | 原站滚动叙事动效 | GSAP + ScrollTrigger 做 section reveal 和 hero 轻 pin/scrub | 映射到武汉卡片、数据模块和说明块 |
| 卡片 hover / click 反馈 | 原站 hover 与点击状态变化 | 卡片轻倾斜、按钮按压、点击冲击波（impact ring） | 作用于武汉图文卡与信息卡 |
| 跑马灯关键词带 | 原站连续滚动信息带 | 横向连续滚动文本 | 文案替换为“武汉/光谷/东湖/长江主轴”等关键词 |

## 3. 媒体与音频替换清单（武汉意图）

目录：`docs/assets/tlb-wuhan/`

- 图片：
  - `wuhan-skyline.jpg`
  - `yellow-crane.jpg`
  - `east-lake.jpg`
  - `whu-hero-1.jpg`
  - `whu-hero-2.jpg`
  - `whu-hero-3.jpg`
  - `wuhan.jpg`
  - `yellow_crane_tower.jpg`
- 音频：
  - `wuhan-ambient.wav`（本地循环背景音）

## 4. 可复验命令

```bash
# 1) 参考站证据抓取
node scripts/capture_no_recording_evidence.js --url "https://tlb.betteroff.studio/" --site-id tlb-betteroff-live --frames 12

# 2) 首页烟测
node scripts/pre_delivery_smoke_test.js --page docs --out docs/pre-delivery-smoke.json

# 3) Demo 烟测
node scripts/pre_delivery_smoke_test.js --page docs/demos/whu-promo-gq-hifi --out docs/demos/whu-promo-gq-hifi/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/wuhan-tourism-v1 --out docs/demos/wuhan-tourism-v1/pre-delivery-smoke.json
```

## 5. 说明

- 本仓库复刻目标是“结构/动效/视觉语言相似”，不是拷贝第三方受版权保护品牌资产。
- 业务迁移优先中文语境和武汉主题素材，保持参考站交互节奏与版式逻辑。
