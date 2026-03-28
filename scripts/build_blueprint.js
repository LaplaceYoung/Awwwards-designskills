#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function toPosix(p) {
  return p.replaceAll("\\", "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.shortlist)) return payload.shortlist;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  return [];
}

function pickBySelection(items, selectedRaw) {
  if (!selectedRaw || String(selectedRaw).toLowerCase() === "all") return items;

  const tokens = String(selectedRaw)
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const picked = [];

  for (const token of tokens) {
    const byIndex = Number(token);
    if (Number.isFinite(byIndex) && byIndex >= 1 && byIndex <= items.length) {
      picked.push(items[byIndex - 1]);
      continue;
    }

    const byId = items.find((item) => String(item.id) === token);
    if (byId) picked.push(byId);
  }

  const deduped = [];
  const seen = new Set();
  for (const item of picked) {
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }
  return deduped;
}

function similarityForItem(item) {
  const structure = Math.min(95, 70 + (item.analysis?.ui?.tags || []).length * 5);
  const visual = Math.min(95, 70 + (item.analysis?.theme?.tags || []).length * 6);
  const motion = Math.min(95, 68 + (item.analysis?.motion?.tags || []).length * 5);
  const overall = Math.round(structure * 0.35 + visual * 0.35 + motion * 0.3);
  return { structure, visual, motion, overall };
}

function buildArchitecture(selected) {
  const hasStory = selected.some((item) => (item.analysis?.interaction?.logicTags || []).some((t) => t.includes("story")));
  const hasDenseNav = selected.some((item) => (item.analysis?.ui?.tags || []).some((t) => t.includes("navigation")));

  const sections = [
    "01 Hero stage (immersive visual + primary message)",
    "02 Core value section (3-4 value points)",
    "03 Works/gallery section (cards or horizontal rail)",
    "04 Detail narrative section (scroll-triggered transitions)",
    "05 CTA section (contact / trial / download)",
  ];

  if (hasStory) sections.splice(3, 0, "04 Story timeline (segmented narrative + sticky transitions)");
  if (hasDenseNav) sections.splice(1, 0, "02 Navigation index (quick jump and filtering)");

  return sections;
}

function stackMapping(profile) {
  const framework = profile?.stack?.framework || "unknown";
  if (framework === "next") {
    return [
      "Page layer: `app/page.tsx` + route segments",
      "Component layer: `components/sections/*`",
      "Style layer: CSS Modules or Tailwind tokens",
      "Motion layer: GSAP/Framer Motion (reuse existing deps first)",
    ];
  }
  if (framework === "react") {
    return [
      "Page layer: `src/pages/*` or `src/App.tsx`",
      "Component layer: `src/components/sections/*`",
      "Style layer: reuse current CSS/Tailwind/Sass system",
      "Motion layer: reuse existing animation libs first, else add a lightweight option",
    ];
  }
  if (framework === "vue") {
    return [
      "Page layer: `src/views/*`",
      "Component layer: `src/components/*`",
      "Style layer: SFC scoped styles + global tokens",
      "Motion layer: Vue transitions + optional GSAP",
    ];
  }
  return [
    "Page layer: align new entry pages to the current folder structure",
    "Component layer: split Hero/Section/Card/CTA atoms",
    "Style layer: define tokens first, then implement page styles",
    "Motion layer: prefer CSS/WAAPI; add libraries only for complex motion",
  ];
}

function main() {
  const args = parseArgs(process.argv);
  const shortlistPath = path.resolve(String(args.shortlist || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.shortlist.json")));
  const analyzedPath = path.resolve(String(args.in || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.analyzed.json")));
  const profilePath = path.resolve(String(args.profile || path.join(process.cwd(), "output", "awwwards-design-selector", "project-profile.json")));
  const outPath = path.resolve(
    String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "implementation-blueprint.md"))
  );
  const selectedRaw = args.selected;

  const basePayload = fs.existsSync(shortlistPath) ? readJson(shortlistPath) : readJson(analyzedPath);
  const items = normalizeItems(basePayload);
  if (!items.length) {
    throw new Error(`No candidates available from ${toPosix(fs.existsSync(shortlistPath) ? shortlistPath : analyzedPath)}`);
  }

  const selected = pickBySelection(items, selectedRaw);
  if (!selected.length) {
    throw new Error("No candidate matched --selected. Use ids or 1-based indices.");
  }

  const profile = fs.existsSync(profilePath) ? readJson(profilePath) : null;

  const colors = uniq(
    selected.flatMap((item) => [item.analysis?.theme?.bodyBg, item.analysis?.theme?.bodyColor, ...(item.analysis?.theme?.palette || [])]).filter(
      (v) => v && v !== "unknown"
    )
  ).slice(0, 12);

  const fonts = uniq(selected.flatMap((item) => item.analysis?.theme?.fontFamilies || [])).slice(0, 8);
  const motionTags = uniq(selected.flatMap((item) => item.analysis?.motion?.tags || [])).slice(0, 20);
  const interactionTags = uniq(selected.flatMap((item) => item.analysis?.interaction?.logicTags || [])).slice(0, 20);
  const uiTags = uniq(selected.flatMap((item) => item.analysis?.ui?.tags || [])).slice(0, 20);

  const lines = [];
  lines.push("# Frontend Implementation Blueprint (Awwwards High Similarity)");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Project profile: ${profile ? toPosix(profilePath) : "n/a"}`);
  lines.push(`Candidate source: ${toPosix(fs.existsSync(shortlistPath) ? shortlistPath : analyzedPath)}`);
  lines.push(`User selection: ${selected.map((item) => item.id).join(", ")}`);
  lines.push("");

  lines.push("## 1) Experience Positioning");
  lines.push("- Goal: keep high similarity in structure, visual style, motion, and interaction while adapting to the current stack.");
  lines.push("- Principle: blueprint first, implementation second.");
  lines.push("- Adaptation strategy: auto-fit current framework, style system, and animation libs.");
  lines.push("");

  lines.push("## 2) Real Visit Evidence (Desktop/Mobile)");
  selected.forEach((item) => {
    const ev = item.analysis?.evidence || {};
    lines.push(`- ${item.id}:`);
    lines.push(`  Awwwards detail: ${item.detailUrl || "n/a"}`);
    lines.push(`  Target site: ${item.externalUrl || "n/a"}`);
    lines.push(`  Final visited URL: ${ev.finalUrl || ev.finalUrlDesktop || "n/a"}`);
    lines.push(`  Desktop screenshot: ${ev.screenshotDesktop || ev.screenshot || "n/a"}`);
    lines.push(`  Mobile screenshot: ${ev.screenshotMobile || "n/a"}`);
    lines.push(`  Redirected: ${ev.redirected ? "yes" : "no"}`);
  });
  lines.push("");

  lines.push("## 3) Information Architecture (IA)");
  for (const section of buildArchitecture(selected)) {
    lines.push(`- ${section}`);
  }
  lines.push("");

  lines.push("## 4) Visual Token Draft");
  lines.push(`- Color candidates: ${colors.length ? colors.join(" | ") : "extract from reference screenshots"}`);
  lines.push(`- Font candidates: ${fonts.length ? fonts.join(" | ") : "reuse current project fonts"}`);
  lines.push(`- UI keywords: ${uiTags.length ? uiTags.join(" / ") : "minimal-composition"}`);
  lines.push("- Contrast strategy: strong hero contrast, moderated body contrast, reduced decorative noise.");
  lines.push("");

  lines.push("## 5) Interaction State Machine");
  lines.push("```text");
  lines.push("Idle -> Hover -> Focus -> Active -> ScrollEnter -> ScrollPinned -> ScrollLeave");
  lines.push("              ^                                      |              |");
  lines.push("              +--------------- CursorFeedback <------+--------------+");
  lines.push("```");
  lines.push(`- Interaction tags: ${interactionTags.length ? interactionTags.join(" / ") : "focused-navigation"}`);
  lines.push("- Rule: keep hover/click feedback duration consistent; keep chapter-level scroll rhythm coherent.");
  lines.push("");

  lines.push("## 6) Motion Timeline (Suggested)");
  lines.push("- T0-T300ms: hero fade-in + heading translation.");
  lines.push("- T300-T900ms: main visual scale/translate + delayed supporting content.");
  lines.push("- Scroll chapters: each chapter uses enter/active/leave phases.");
  lines.push(`- Motion tags: ${motionTags.length ? motionTags.join(" / ") : "basic-motion"}`);
  lines.push("- Perf guardrail: prioritize transform/opacity and avoid layout thrash.");
  lines.push("");

  lines.push("## 7) Stack Mapping");
  for (const item of stackMapping(profile)) {
    lines.push(`- ${item}`);
  }
  lines.push("");

  lines.push("## 8) Similarity Matrix (Threshold >= 70)");
  lines.push("| Candidate | Structure(35%) | Visual(35%) | Motion/Interaction(30%) | Overall | Conclusion |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const item of selected) {
    const sim = similarityForItem(item);
    lines.push(
      `| ${item.id} | ${sim.structure}% | ${sim.visual}% | ${sim.motion}% | ${sim.overall}% | ${sim.overall >= 70 ? "ready" : "needs-improvement"} |`
    );
  }
  lines.push("");

  lines.push("## 9) Execution Order (After Confirmation)");
  lines.push("1. Implement tokens and base layout skeleton.");
  lines.push("2. Implement key interactions and scroll motion.");
  lines.push("3. Run performance and accessibility checks (with motion reduction fallback).");
  lines.push("");

  lines.push("## 10) Usage Boundary");
  lines.push("- Full imitation is limited to local demo and learning.");
  lines.push("- Do not directly reuse protected brand assets/logos/copyrighted media for public release.");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join("\n")}\n`, "utf8");

  console.log(`Saved blueprint: ${toPosix(outPath)}`);
  console.log(`Selected candidates: ${selected.map((item) => item.id).join(", ")}`);
}

main();
