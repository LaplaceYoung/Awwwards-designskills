# Awwwards Design Skills

<p align="center">
  <img src="./assets/readme-skill-icon.svg" alt="Awwwards Design Skills 图标" width="128" />
</p>

<p align="center">
  面向高保真网页复刻与业务迁移的工程化技能：真实站点取证、动效拆解、评分迭代与交付验证。
</p>

<p align="center">
  <a href="./README.md"><strong>English</strong></a> · <a href="./README.zh-CN.md"><strong>简体中文</strong></a>
</p>

[![Pages Deploy](https://img.shields.io/github/actions/workflow/status/LaplaceYoung/Awwwards-designskills/deploy-pages.yml?branch=main&label=pages&logo=githubactions&logoColor=white)](https://github.com/LaplaceYoung/Awwwards-designskills/actions/workflows/deploy-pages.yml)
[![Live Site](https://img.shields.io/badge/live-github%20pages-24292f?logo=github&logoColor=white)](https://laplaceyoung.github.io/Awwwards-designskills/)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Playwright](https://img.shields.io/badge/tested%20with-Playwright-2EAD33?logo=playwright&logoColor=white)](https://playwright.dev/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

## 在线演示

- Skill 宣传页（GitHub Pages 首页）：[https://laplaceyoung.github.io/Awwwards-designskills/](https://laplaceyoung.github.io/Awwwards-designskills/)
- TLB 武汉样例页：[https://laplaceyoung.github.io/Awwwards-designskills/demos/wuhan-tourism-tlb/](https://laplaceyoung.github.io/Awwwards-designskills/demos/wuhan-tourism-tlb/)

## 能力范围

- 真实目标链接识别（避免抓到 Awwwards 导航页）
- 无录屏模式下的 MCP/Playwright 取证重建
- 点击交互证据链（`before -> after-short -> after-long`）
- 滚动/动效复刻与交付前 smoke 闸门
- 按业务意图进行媒体替换与中文优先适配

## Demo 测试截图

### Skill 宣传页冒烟截图

![Skill Landing](docs/assets/test-docs-home.png)

### TLB 武汉样例 - Surf 路由

![TLB Surf](docs/assets/test-surf-route.png)

### TLB 武汉样例 - About 路由

![TLB About](docs/assets/test-about-route.png)

## 提示样例（可直接复用）

### 样例 1：零样本默认策略（本年度高分榜第一）

```text
用 awwwards-design-selector 重做我的首页。
我不提供参考站点，请按默认策略：直接使用本年度高分榜第一站点作为参考，
并输出中文优先、动效完整的高保真方案。
```

### 样例 2：指定站点复刻 + 业务迁移

```text
复刻目标：https://tlb.betteroff.studio/
要求 fidelity >= 90，并迁移为武汉城市宣传页。
媒体素材和背景音乐必须按业务语义替换。
```

### 样例 3：基于已有内容继续强化

```text
基于 docs/demos/whu-promo-gq-hifi 的已有内容继续迭代。
保持结构和动效语言，补齐滚动时间线、按钮点击反馈、
并提升中文排版与可读性。
```

## 验证命令

```bash
npm install
node scripts/capture_no_recording_evidence.js --url "https://tlb.betteroff.studio/" --site-id tlb-betteroff-live --frames 12
node scripts/pre_delivery_smoke_test.js --page docs --out docs/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/wuhan-tourism-tlb --out docs/demos/wuhan-tourism-tlb/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/whu-promo-gq-hifi --out docs/demos/whu-promo-gq-hifi/pre-delivery-smoke.json
```

## 仓库结构

```text
.github/workflows/                 # GitHub Pages 部署
assets/                            # Skill 模板 + README 图标
docs/                              # Pages 发布目录
  index.html                       # Skill 宣传页
  demos/                           # 复刻样例页
  assets/                          # 截图与媒体资源
output/awwwards-design-selector/   # 运行期证据与输出物
references/                        # 评分规则与流程文档
scripts/                           # 抓取/分析/评审/冒烟脚本
SKILL.md
```

## 说明

- 本仓库用于工程化复刻演示，核心目标是结构、交互、动效语言相似。
- 第三方受保护品牌素材不可直接商用发布。
