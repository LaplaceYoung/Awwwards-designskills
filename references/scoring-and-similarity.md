# Scoring And Similarity Rules

## Purpose

Define deterministic ranking and similarity rules for `awwwards-design-selector`.

## Candidate Ranking

Use two major axes plus a small project-fit correction:

- Quality (`60%` weight)
- Popularity (`35%` weight)
- Project fit (`5%` weight)

Formula:

```text
totalScore = quality * 0.60 + popularity * 0.35 + projectFit * 0.05
```

### Quality

```text
quality = min(100, numericScore + awardScore + freshnessScore)
```

- `numericScore`: detail-page score mapped from `0-10` to `0-60`.
- `awardScore`:
  - `SOTD`: `+15`
  - `DEV`: `+10`
  - `HM`: `+6`
- `freshnessScore`:
  - <= 30 days: `10`
  - <= 120 days: `8`
  - <= 240 days: `6`
  - <= 365 days: `4`
  - > 365 days: `2`

### Popularity

```text
popularity = min(100, hasExternal + interactionDensity + awardPopularity)
```

- `hasExternal`: `12` when target site URL exists.
- `interactionDensity`: derived from number of motion/UI/interaction tags.
- `awardPopularity`: capped award contribution.

## Similarity Policy (selection stage)

- Structure: `35%`
- Visual: `35%`
- Motion/Interaction: `30%`

```text
similarity = structure * 0.35 + visual * 0.35 + motionInteraction * 0.30
```

Recommendation threshold: `similarity >= 70`.

## High-Fidelity Replica Policy (implementation stage)

For clone/replica tasks, use hard fidelity gate:

```text
replicaFidelity >= 90
```

Replica fidelity score combines:

- Component parity (`25%`)
  - must include navigation, hero, services, featured, index, news, contact, and supporting lists/grids
  - content visibility check:
    - every major section must contain at least one visible text node
    - every major section must contain at least one visible non-zero-opacity child
    - each EMPTY_SECTION_WARNING deducts 10 points from component/content buckets
- Content density (`10%`)
  - every delivered card/list item should include title + description + one data point
  - no empty containers in delivered output
  - each section must show visible content without relying on a hidden initial state
- Motion parity (`20%`)
  - must include loading reveal, section reveal cadence, hover transitions, marquee motion, and cursor/scroll feedback
- Click interaction parity (`10%`)
  - at least one primary CTA/button/menu control must show a visible click-response state
  - accepted signals: pressed transform, ripple/ring, overlay choreography, label swap, or success pulse
- Scroll timeline parity (`5%`)
  - page should expose scroll-driven scene changes beyond simple one-shot reveal
  - accepted signals: scrub-like transforms, sticky/pin section behavior, progress rail, or staged chapter transitions
- Scroll functionality (`5%`)
  - wheel scroll must work
  - trackpad-like continuous scrolling must not lock
  - touch/mobile scroll path must not lock
- Navigation parity vs reference (`10%`)
- Media adaptation ratio for user intent (`15%`)

Media adaptation ratio means intent-specific assets are intentionally replaced (for example, university campaign media for a university page), not just copied from the original site.

## Iteration Rule

If `replicaFidelity < 90`, iterate and re-score until pass.

## Source Strategy

- Default: `live` crawl from Awwwards websites list.
- Fallback: `references/cache/latest-candidates.json`.
- If `live` fails, downgrade automatically to cache and emit note `live-fetch-failed`.

## Delivery Guardrails

- Produce at least five options when input count allows.
- Do not start business-code implementation before user confirms blueprint.
- For replica tasks, run `review_replica_fidelity.js` and iterate until pass.
- For replica tasks, run `review_replica_fidelity.js` and iterate until pass.
- Treat `click-animation-parity-low` and `scroll-timeline-parity-low` as blocking findings, not polish items.
- Full imitation is limited to local learning/demo use.
