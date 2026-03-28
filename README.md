# Awwwards Design Skills

[![Pages Deploy](https://img.shields.io/github/actions/workflow/status/LaplaceYoung/Awwwards-designskills/deploy-pages.yml?branch=main&label=pages&logo=githubactions&logoColor=white)](https://github.com/LaplaceYoung/Awwwards-designskills/actions/workflows/deploy-pages.yml)
[![Live Site](https://img.shields.io/badge/live-github%20pages-24292f?logo=github&logoColor=white)](https://laplaceyoung.github.io/Awwwards-designskills/)
[![Last Commit](https://img.shields.io/github/last-commit/LaplaceYoung/Awwwards-designskills)](https://github.com/LaplaceYoung/Awwwards-designskills/commits/main)
[![Repo Size](https://img.shields.io/github/repo-size/LaplaceYoung/Awwwards-designskills)](https://github.com/LaplaceYoung/Awwwards-designskills)

High-fidelity reconstruction and migration workflow for award-style web interfaces.
The repository ships a reproducible pipeline for reference capture, interaction decomposition, implementation, browser verification, and fidelity scoring.

## Live Entry

- Pages home: [https://laplaceyoung.github.io/Awwwards-designskills/](https://laplaceyoung.github.io/Awwwards-designskills/)
- WHU demo: [docs/demos/whu-promo-gq-hifi/index.html](docs/demos/whu-promo-gq-hifi/index.html)
- Wuhan tourism demo: [docs/demos/wuhan-tourism-v1/index.html](docs/demos/wuhan-tourism-v1/index.html)

## Capabilities

- Real external site capture (avoid navigation/gallery page mismatches)
- No-recording reconstruction with desktop/mobile evidence
- Click interaction evidence (`before -> after-short -> after-long`)
- Scroll timeline parity checks (sticky/pin/progress-driven behavior)
- Pre-delivery smoke gates + replica fidelity review loop
- Intent-aware media replacement and localization-first adaptation

## Repository Layout

```text
.
├─ .github/workflows/                        # GitHub Pages workflow
├─ docs/                                     # Public Pages site
│  ├─ index.html                             # Promotional landing page
│  ├─ demos/                                 # Deployable demos
│  ├─ assets/                                # Preview + test screenshots
│  ├─ design-reference-audit.md
│  └─ test-report.md
├─ output/awwwards-design-selector/          # Runtime outputs
├─ references/                               # Rules and playbooks
├─ scripts/                                  # Capture/review/smoke scripts
├─ SKILL.md
└─ README.md
```

## Quick Start

```bash
npm install
node scripts/scan_project.js
node scripts/fetch_awwwards_candidates.js --source live --count 8
node scripts/analyze_sites.js
node scripts/rank_and_select.js --min 5 --threshold 70
node scripts/build_blueprint.js --selected <candidate-id>
```

High-fidelity loop:

```bash
node scripts/collect_replica_assets.js --mode hybrid --intent-file <intent.txt>
node scripts/review_replica_fidelity.js --threshold 90
node scripts/pre_delivery_smoke_test.js --page <replica-dir>
```

## Validation Commands

```bash
node --check scripts/*.js
node scripts/pre_delivery_smoke_test.js --page docs --out docs/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/whu-promo-gq-hifi --out docs/demos/whu-promo-gq-hifi/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/wuhan-tourism-v1 --out docs/demos/wuhan-tourism-v1/pre-delivery-smoke.json
node scripts/review_replica_fidelity.js --page output/awwwards-design-selector/whu-promo-gq-hifi --profile gq --reference output/awwwards-design-selector/reference-gq-structure.json --threshold 90
```

## Test Screenshots

### Docs Landing Smoke

![Docs Smoke](docs/assets/test-docs-home.png)

### WHU Demo Smoke

![WHU Smoke](docs/assets/test-whu-home.png)

### Wuhan Tourism Demo Smoke

![Wuhan Smoke](docs/assets/test-wuhan-home.png)

## Deployment

Push to `main` and GitHub Actions deploys `docs/` automatically.

- Workflow: `.github/workflows/deploy-pages.yml`
- Repository: `LaplaceYoung/Awwwards-designskills`

