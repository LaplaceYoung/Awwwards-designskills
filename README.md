# Awwwards Design Skills

面向高保真网页复刻与业务迁移的设计工程技能仓库。  
核心目标是把 Awwwards 高分站点的结构、动效语言、交互逻辑转化为可复用的实现流程，并在交付前通过自动化闸门完成质量验证。

## 项目能力

- 榜单抓取与候选排序：优先获取真实外链站点，避免误用导航页。
- 无录屏取证：自动抓取桌面/移动端页面证据、滚动帧、交互状态与重定向链。
- 点击动效取证：对关键按钮/链接导出 `before -> after-short -> after-long` 三帧。
- 滚动叙事识别：提取 sticky/pin、scroll timeline、进度反馈等线索。
- 复刻评分闭环：`review_replica_fidelity.js` + `pre_delivery_smoke_test.js` 双闸门。
- 业务化迁移：支持按用户主题替换媒体资源与文案（如武汉旅游、武汉大学宣传页）。

## 仓库结构

```text
.
├─ .github/workflows/          # GitHub Pages 发布工作流
├─ assets/                     # 模板资源
├─ docs/                       # Pages 站点（公开展示）
├─ output/awwwards-design-selector/
│  ├─ whu-promo-gq-hifi/       # 武汉大学高保真页面
│  ├─ wuhan-tourism-v1/        # 武汉旅游宣传页面
│  ├─ comparisons/             # 前后对比图
│  ├─ reference-gq-structure.json
│  └─ design-reference-audit.md
├─ references/                 # 评分规则与取证规范
├─ scripts/                    # 采集、评分、冒烟、流程脚本
├─ SKILL.md                    # 技能规范
└─ README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 运行候选选择流程

```bash
node scripts/scan_project.js
node scripts/fetch_awwwards_candidates.js --source live --count 8
node scripts/analyze_sites.js
node scripts/rank_and_select.js --min 5 --threshold 70
node scripts/build_blueprint.js --selected <candidate-id>
```

### 3. 运行高保真复刻流程

```bash
node scripts/collect_replica_assets.js --mode hybrid --intent-file <intent.txt>
node scripts/review_replica_fidelity.js --threshold 90
node scripts/pre_delivery_smoke_test.js --page <replica-dir>
```

## 关键脚本

- `scripts/capture_no_recording_evidence.js`  
  无录屏模式下的真实访问取证，包含点击三帧与交互分类摘要。
- `scripts/review_replica_fidelity.js`  
  复刻评分主脚本，包含组件、动效、点击、滚动时间线、滚动兼容等维度。
- `scripts/pre_delivery_smoke_test.js`  
  交付前浏览器冒烟测试，检查滚动、可见性、交互、链接与点击动效反馈。

## 已交付示例

- 武汉旅游宣传页：`output/awwwards-design-selector/wuhan-tourism-v1/`
- 武汉大学宣传页：`output/awwwards-design-selector/whu-promo-gq-hifi/`
- 前后对比：`output/awwwards-design-selector/comparisons/whu-before-after/`
- 设计映射文档：`output/awwwards-design-selector/design-reference-audit.md`

公开预览入口（GitHub Pages）：

- `docs/index.html`
- `docs/demos/wuhan-tourism-v1/index.html`
- `docs/demos/whu-promo-gq-hifi/index.html`

## 测试与验收

```bash
node --check scripts/*.js
node scripts/pre_delivery_smoke_test.js --page docs --out docs/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page output/awwwards-design-selector/wuhan-tourism-v1 --out output/awwwards-design-selector/wuhan-tourism-v1/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page output/awwwards-design-selector/whu-promo-gq-hifi --out output/awwwards-design-selector/whu-promo-gq-hifi/pre-delivery-smoke.json
node scripts/review_replica_fidelity.js --page output/awwwards-design-selector/whu-promo-gq-hifi --profile gq --reference output/awwwards-design-selector/reference-gq-structure.json --assets output/awwwards-design-selector/whu-promo-gq-hifi/assets-map.json --intent "wuhan university campaign" --threshold 90
```

## 部署到 GitHub Pages

1. 推送仓库到 `main` 分支。
2. 在仓库设置中启用 **Pages**（GitHub Actions）。
3. 工作流 `.github/workflows/deploy-pages.yml` 会自动发布 `docs/`。

目标仓库：
[https://github.com/LaplaceYoung/Awwwards-designskills](https://github.com/LaplaceYoung/Awwwards-designskills)

