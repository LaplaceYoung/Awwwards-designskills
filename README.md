# Awwwards Design Skills

[![Pages Deploy](https://img.shields.io/github/actions/workflow/status/LaplaceYoung/Awwwards-designskills/deploy-pages.yml?branch=main&label=pages&logo=githubactions&logoColor=white)](https://github.com/LaplaceYoung/Awwwards-designskills/actions/workflows/deploy-pages.yml)
[![Live Site](https://img.shields.io/badge/live-github%20pages-24292f?logo=github&logoColor=white)](https://laplaceyoung.github.io/Awwwards-designskills/)
[![Last Commit](https://img.shields.io/github/last-commit/LaplaceYoung/Awwwards-designskills)](https://github.com/LaplaceYoung/Awwwards-designskills/commits/main)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

High-fidelity Awwwards-style reconstruction workflow with real-site evidence capture, animation parity checks, and business-intent media adaptation.

## Live Demo

- Pages: [https://laplaceyoung.github.io/Awwwards-designskills/](https://laplaceyoung.github.io/Awwwards-designskills/)
- Current homepage theme: **TLB-style Wuhan promotion** (reference: `https://tlb.betteroff.studio/`)

## What This Repo Delivers

- Real URL verification (avoid Awwwards navigation-page mis-capture)
- No-recording reconstruction using Playwright evidence snapshots
- Motion and click-response evidence (`before -> after-short -> after-long`)
- Scroll and interaction smoke gate before delivery
- Intent-aware media replacement (Chinese-first content + Wuhan assets)

## Repository Structure

```text
.github/workflows/                 # GitHub Pages deployment
assets/                            # Skill templates
docs/                              # Published site (GitHub Pages root)
  index.html                       # TLB-style Wuhan promo page
  styles.css
  script.js
  assets/                          # Local images, audio, smoke screenshots
  demos/                           # Previous demo outputs (WHU / Wuhan tourism)
  design-reference-audit.md        # Section-level reference mapping
  test-report.md                   # Smoke test results
output/awwwards-design-selector/   # Runtime capture/audit outputs
references/                        # Scoring rules and playbooks
scripts/                           # Capture / ranking / review / smoke scripts
SKILL.md
```

## Validation

```bash
npm install
node scripts/capture_no_recording_evidence.js --url "https://tlb.betteroff.studio/" --site-id tlb-betteroff-live --frames 12
node scripts/pre_delivery_smoke_test.js --page docs --out docs/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/whu-promo-gq-hifi --out docs/demos/whu-promo-gq-hifi/pre-delivery-smoke.json
node scripts/pre_delivery_smoke_test.js --page docs/demos/wuhan-tourism-v1 --out docs/demos/wuhan-tourism-v1/pre-delivery-smoke.json
```

## Test Screenshots

### Homepage Smoke (TLB Wuhan Edition)

![Docs Smoke](docs/assets/test-docs-home.png)

### Route Snapshot: Surf

![Surf Route](docs/assets/test-surf-route.png)

### Route Snapshot: About

![About Route](docs/assets/test-about-route.png)

## Notes

- Replica work in this repository is for local learning/demo and engineering process validation.
- Protected third-party logos/brand assets are not copied into deliverables.
