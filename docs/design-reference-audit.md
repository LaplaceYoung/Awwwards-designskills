# Design Reference Audit Map

> 生成时间：2026-03-28  
> 目的：为二次复查提供“页面模块 -> 参考网站 -> 本地证据”的可追溯映射。

## 1) 零样本默认策略（已生效）

- 默认策略：`top-score + current-year`
- 解释：当用户未指定参考网站时，自动采用“本年度高分网站”作为复刻基准。
- 验证文件：
  - `output/awwwards-design-selector/candidates.shortlist.zero-default.json`
  - 其中榜首：`gq-ap-the-extraordinary-lab`，评分 `7.74`，参考站 `https://www.gq.com/sponsored/story/the-extraordinary-lab`

## 2) 参考站点总览

| 参考站ID | 站点URL | 主要用于 |
| --- | --- | --- |
| `gq-ap-the-extraordinary-lab` | `https://www.gq.com/sponsored/story/the-extraordinary-lab` | `wuhan-tourism-v1`（零样本默认风格）、`whu-promo-gq-hifi`（主迁移） |
| `shed` | `https://shed.design/` | `whu-promo-shed-hifi`（历史基线/Before 对比） |

## 3) 武汉旅游页（wuhan-tourism-v1）模块映射

页面文件：`output/awwwards-design-selector/wuhan-tourism-v1/index.html`

| 本地模块 | 位置锚点 | 参考网站 | 复刻说明 |
| --- | --- | --- | --- |
| Hero 沉浸首屏 + 文案大标题 | `<div class="hero">` | GQ 榜一站点 | 采用编辑式大标题 + 视觉主图开场节奏 |
| Topbar + 锚点导航 | `<header class="topbar">` | GQ 榜一站点 | 轻量导航覆盖在视觉背景上 |
| 三列亮点卡片 | `<section id="highlights">` | GQ 榜一站点 | 栏目化卡片信息密度与视觉节奏 |
| 路线时间线 | `<section id="routes">` | GQ 榜一站点（适配） | 将专栏叙事节奏迁移为“时间轴行文” |
| 咨询表单 | `<section id="contact">` | GQ 榜一站点（适配） | 保留叙事页收束到 CTA 的结构逻辑 |
| Reveal + Hero Parallax | `script.js` | GQ 榜一站点（动效语言） | 采用滚动触发显现与轻量视差过渡 |

媒体来源：`output/awwwards-design-selector/wuhan-tourism-v1/assets-map.json`

## 4) 武汉大学页（whu-promo-gq-hifi）模块映射

页面文件：`output/awwwards-design-selector/whu-promo-gq-hifi/index.html`

| 本地模块 | 位置锚点 | 参考网站 | 复刻说明 |
| --- | --- | --- | --- |
| Topbar + Overlay Menu | `header.topbar` / `nav.overlay-menu` | GQ 榜一站点 | 全屏目录切换 + 顶部轻量导航 |
| Hero 多图轮播 + 大标题 | `section#about.hero` | GQ 榜一站点 | 大开场叙事视觉 + 文案前导 |
| Chapter Intro 段落 | `section.chapter-intro` | GQ 榜一站点 | 章节间缓冲文本，强化长滚阅读感 |
| Narrative 双章节 Story Block | `section#narrative` | GQ 榜一站点 | 章节式滚动叙事结构（Chapter 01/02） |
| Research 栏目卡片 | `section#research` | GQ 榜一站点 | 信息栏目化、三卡并行节奏 |
| Index Strip + Marquee | `section#index.index-strip` | GQ 榜一站点 + 迁移适配 | 滚动字幕/指标条保持运动连续性 |
| Stories 图集区 | `section#stories` | GQ 榜一站点 | 图片驱动叙事卡组 |
| Contact 收束区 | `section#contact` | GQ 榜一站点（适配） | 叙事末端表单 CTA |
| Scroll Rail + Chapter Meter | `#scrollRailThumb` / `#chapterMeter` | GQ 榜一站点（动效强化） | 章节进度感知与滚动反馈 |
| Preloader / Reveal / Parallax / Menu Lock | `script.js` | GQ 榜一站点（动效语言） | 首屏加载、章节激活、滚动反馈、菜单锁滚 |

媒体来源：`output/awwwards-design-selector/whu-promo-gq-hifi/assets-map.json`

## 5) 前后对比映射（用于复查）

| 版本 | 页面目录 | 主要参考站 |
| --- | --- | --- |
| Before | `output/awwwards-design-selector/whu-promo-shed-hifi/` | Shed |
| After | `output/awwwards-design-selector/whu-promo-gq-hifi/` | GQ 榜一 |

对比图：`output/awwwards-design-selector/comparisons/whu-before-after/whu-before-after-side-by-side.jpg`

## 6) 复验命令

```bash
# 1) 验证零样本默认策略
node scripts/rank_and_select.js \
  --in output/awwwards-design-selector/candidates.analyzed.today-live.json \
  --out output/awwwards-design-selector/candidates.shortlist.zero-default.json \
  --brief output/awwwards-design-selector/selection-brief.zero-default.md \
  --min 5 --threshold 70

# 2) 武汉大学页 fidelity（GQ profile）
node scripts/review_replica_fidelity.js \
  --page output/awwwards-design-selector/whu-promo-gq-hifi \
  --profile gq \
  --reference output/awwwards-design-selector/reference-gq-structure.json \
  --assets output/awwwards-design-selector/whu-promo-gq-hifi/assets-map.json \
  --intent "wuhan university campaign" \
  --threshold 90

# 3) 页面 smoke
node scripts/pre_delivery_smoke_test.js --page output/awwwards-design-selector/wuhan-tourism-v1
node scripts/pre_delivery_smoke_test.js --page output/awwwards-design-selector/whu-promo-gq-hifi
```

## 7) 备注

- 复刻以“结构/动效/视觉语言相似”为目标，不直接复制受版权保护的品牌资产。
- 当业务语义（如“武汉大学/武汉旅游”）与参考站内容冲突时，优先做业务素材替换并保留动效语言。
