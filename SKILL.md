---
name: awwwards-design-selector
description: Analyze an existing frontend project, fetch high-score and popular Awwwards candidates, present at least five selectable style summaries, and generate a high-similarity implementation blueprint after user selection. Use when users want Awwwards-inspired frontend direction and implementation guidance with project-aware adaptation.
---

# Awwwards Design Selector

## Overview

This skill supports two output levels:

1. Style selection + implementation blueprint.
2. High-fidelity replica delivery (`>=90` fidelity score) with component and motion parity checks.

Zero-shot default policy:

- If user does not specify a reference site, default to replicating the **current-year top-score** Awwwards candidate.
- This default is enforced in ranking stage (`rank_and_select.js` defaults to `--strategy top-score --year current`).

## Standard Workflow (Required)

1. `scan_project.js`
2. `fetch_awwwards_candidates.js`
3. `analyze_sites.js` (must perform real external-site visits with desktop/mobile evidence)
4. `rank_and_select.js` (at least 5 options)
   - Zero-shot default is top-score current-year; explicit strategy is optional.
5. `build_blueprint.js` (after user selection)
6. `review_pipeline_quality.js` (pipeline quality gate)

## High-Fidelity Replica Workflow (When user asks to clone/recreate)

1. Collect assets:

```powershell
node ./skills/awwwards-design-selector/scripts/collect_replica_assets.js --mode hybrid --intent "<business-intent>"
```

If terminal encoding may corrupt non-ASCII intent text, use UTF-8 file input:

```powershell
node ./skills/awwwards-design-selector/scripts/collect_replica_assets.js --mode hybrid --intent-file "<intent.txt>"
```

2. Build replica page (component/motion parity with selected reference).

3. Run fidelity audit (hard gate):

```powershell
node ./skills/awwwards-design-selector/scripts/review_replica_fidelity.js --threshold 90
```

When scoring a non-`shed` reference, pass profile explicitly (for example `gq`):

```powershell
node ./skills/awwwards-design-selector/scripts/review_replica_fidelity.js --profile gq --reference <reference-structure.json> --threshold 90
```

4. If score `< 90`, iterate on missing components/motion and re-run until pass.
5. Run pre-delivery smoke test:

```powershell
node ./skills/awwwards-design-selector/scripts/pre_delivery_smoke_test.js --page <replica-dir>
```

## No-Recording Mode (Skill + MCP)

When the user does not provide a recording, use MCP + Playwright evidence capture to reconstruct the site.

- Playbook: `references/no-recording-mcp-playbook.md`
- Capture command:

```powershell
node ./skills/awwwards-design-selector/scripts/capture_no_recording_evidence.js --url "<target-site-url>" --site-id "<project-id>"
```

- Must capture: desktop/mobile full screenshots, scroll timeline frames, interaction states (menu/hover/modal/carousel), click-response evidence (`before/after-short/after-long`), interaction classification summary, DOM + motion hints.
- Then run the same replica iteration loop until fidelity passes.

## Iteration Rules (Mandatory for replica tasks)

- Always compare against a real reference snapshot/structure export.
- Fix findings in this order:
  1. Missing structural modules (nav, hero, service strip, featured, index, news, contact)
  2. Missing interaction/motion (preloader, reveal cadence, hover transforms, marquee, custom scrollbar/cursor)
  3. Missing click-response choreography (primary CTA/button press states, overlay/menu stagger, success pulses, card active transitions)
  4. Scroll engine compatibility gate:
     - If using third-party smooth scroll (Lenis, Locomotive, ASScroll, etc.), inject required global CSS rules.
     - Remove native `scroll-behavior: smooth` from `*`/`html` when it conflicts with the engine.
     - Verify GSAP ScrollTrigger pin/scrub behavior against the chosen scroll engine.
     - Verify nav/menu overlay open-close does not create scroll dead zones.
     - Validate wheel, trackpad-like continuous scroll, and touch/mobile scroll behavior.
  5. Scroll timeline parity:
     - Recreate pinned/sticky narrative scenes when present in reference.
     - Map scroll progress to media/copy/index/progress-rail changes instead of relying only on one-shot reveal.
     - Treat GSAP/ScrollTrigger-like timing as a structural requirement when the reference depends on it.
  6. Visual rhythm (type scale, spacing, section pacing)
- Re-score after each iteration; do not stop at first usable version if fidelity is below threshold.

## Hard Requirements

- External URL extraction must target real websites (never Awwwards navigation pages).
- Analyze step must record real-visit evidence: final URL + desktop/mobile screenshots.
- If user has explicit business/topic intent, media replacement is mandatory and must be intentional:
  - Keep structure/motion language from reference.
  - Replace media by user intent (for example, Wuhan University campaign content).
  - Media sourcing strategy (mandatory when business intent exists):
    1. Extract 3-5 intent keywords.
    2. Query Unsplash first (royalty-friendly path).
    3. If Unsplash returns fewer than 3 usable images, fallback to generated thematic visuals.
    4. Embed at least 3 intent-specific images across Hero/Showcase/Card modules.
    5. Never deliver with empty `src` or generic unrelated placeholders.
- Placeholder policy:
  - If a section must remain placeholder (for example, backend form not connected), provide realistic mock content.
  - Never ship empty visual containers.
- High-fidelity replica means:
  - Component parity: navigation, hero, services, featured/index/news/contact, client/summary sections.
  - Motion parity: loading reveal, section reveal, hover feedback, click-response choreography, marquee/scroll movement, custom cursor/scrollbar behavior.
  - Scroll timeline parity: pinned/sticky scenes, progress-driven transitions, chapter handoff cadence when the reference uses them.
  - Visual parity: typography rhythm, spacing, hierarchy, tone.
- Ship only after `review_replica_fidelity >= 90`.

## Output Hygiene (Cleanup)

- Keep latest deliverables in `output/awwwards-design-selector/` top-level paths.
- Move obsolete baseline/tmp artifacts into `output/awwwards-design-selector/_archive-obsolete/`.
- Do not leave mixed old/new prototype folders in active output root.

## Pre-Delivery Smoke Test (Mandatory before any delivery)

Before presenting output to the user, run browser verification:

1. Launch local page and verify successful render.
2. Scroll from top to bottom and confirm no lockups/dead zones.
   - Must pass both desktop and mobile/touch scroll paths.
3. Capture full-page screenshot and verify no empty/blank sections.
4. Hover at least 3 interactive targets and verify hover/cursor feedback.
5. Click at least 1 primary CTA/button and verify visible click-response animation or state change.
6. Click at least 2 navigation links and verify anchor/route response.

If any step fails, fix first and re-run verification before delivery.

## Defaults

- Candidate policy: `8 -> 5`.
- Similarity weights: structure `35%`, visual `35%`, motion/interaction `30%`.
- Replica scoring emphasis: component `25%`, content `10%`, motion `20%`, click interaction `10%`, scroll timeline `5%`, scroll functionality `5%`, navigation `10%`, media adaptation `15%`.
- Recommendation threshold: `>= 70`.
- Replica threshold: `>= 90`.
- Source policy: live crawl first, cache fallback.

## Local Demo Boundary

- Full imitation is for local demo/learning only.
- Do not ship protected third-party brand assets/logos/copyrighted media without rights.

## Resources

- Scoring rules: `references/scoring-and-similarity.md`
- Cache: `references/cache/latest-candidates.json`
- Blueprint template: `assets/implementation-blueprint-template.md`
- No-recording playbook: `references/no-recording-mcp-playbook.md`
- Scroll compatibility matrix: `references/scroll-engine-compat.md`
