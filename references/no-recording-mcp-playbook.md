# No-Recording MCP Playbook

Use this flow when the user does not provide a video recording but asks for high-fidelity redesign/replica.

## Goal

Reconstruct design system + interaction/motion behavior from the live website using MCP + Playwright evidence.

## Required Evidence Capture

1. Desktop and mobile full-page screenshots.
2. Step screenshots along scroll timeline (for example every 10-15vh).
3. Interaction snapshots: menu open/close, hover states, modal states, carousel states.
4. Click-response evidence: primary CTA/button `before -> after-short -> after-long` frame triplets, including pressed/ripple/overlay/success states when present.
5. DOM structure export: section map, class frequency, typography families, color tokens.
6. Motion hints export: script libraries, keyframes count, transition-heavy nodes, sticky elements, scroll-timeline hints.
7. Final URL trace and redirect chain.
8. Interaction classification summary:
   - click type distribution (menu-toggle / anchor-navigation / content-card / form-cta / generic)
   - click outcome distribution (hash-change / scroll-shift / visual-feedback / state-toggle)

## MCP-Driven Procedure

```powershell
node ./skills/awwwards-design-selector/scripts/capture_no_recording_evidence.js --url "<target-site-url>" --site-id "<project-id>"
```

1. Navigate using Playwright MCP and wait for stable load.
2. Capture baseline screenshot at desktop and mobile viewports.
3. Auto-scroll and capture timeline frames.
4. Trigger interactions one by one:
   - nav toggle
   - major CTA hover
   - major CTA click
   - card hover
   - card click if it expands or changes focus state
   - modal open/close
   - carousel controls
5. Export network and scripts to detect motion libraries (for example gsap/three/lenis).
6. Save all evidence under `output/awwwards-design-selector/reference-evidence/<site-id>/`.
7. Run pre-delivery smoke test before first user-facing handoff:

```powershell
node ./skills/awwwards-design-selector/scripts/pre_delivery_smoke_test.js --page <replica-dir>
```

## Reconstruction Strategy

1. Rebuild structure first (IA + components).
2. Rebuild motion sequence second (loader, hero reveal, section cadence, hover logic, click-response logic, marquee/scroll behavior).
3. Rebuild scroll timeline third:
   - identify pinned/sticky scenes
   - map scroll progress to media/copy transitions
   - preserve chapter handoff cadence instead of only using one-shot reveal
4. Adapt content/media to user intent.
5. Run replica fidelity review and iterate until `>=90`.

## Acceptance

- Evidence set complete.
- Replica fidelity score >= 90.
- User-intent media adaptation applied.
- Pre-delivery smoke test passes.
- Output directory cleaned (obsolete artifacts moved to `_archive-obsolete`).
