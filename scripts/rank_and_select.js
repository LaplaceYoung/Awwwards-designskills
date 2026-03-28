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

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function normalizeItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  return [];
}

function normalizeDateScore(isoDate) {
  if (!isoDate) return 1;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return 1;

  const now = Date.now();
  const diffDays = Math.max(0, Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24)));

  if (diffDays <= 30) return 10;
  if (diffDays <= 120) return 8;
  if (diffDays <= 240) return 6;
  if (diffDays <= 365) return 4;
  return 2;
}

function awardScore(tags = []) {
  const lower = tags.map((t) => String(t).toLowerCase());
  let score = 0;
  if (lower.some((t) => t.includes("sotd"))) score += 15;
  if (lower.some((t) => t.includes("dev"))) score += 10;
  if (lower.some((t) => t.includes("hm"))) score += 6;
  return score;
}

function qualityScore(item) {
  const numeric = item.score ? Math.min(60, Number(item.score) * 6) : 0;
  const award = awardScore(item.awardTags || []);
  const freshness = normalizeDateScore(item.freshnessDate);
  return Math.round(Math.min(100, numeric + award + freshness));
}

function popularityScore(item) {
  const motionTags = item.analysis?.motion?.tags || [];
  const uiTags = item.analysis?.ui?.tags || [];
  const logicTags = item.analysis?.interaction?.logicTags || [];
  const hasExternal = item.externalUrl ? 12 : 0;

  const density = Math.min(30, motionTags.length * 3 + uiTags.length * 2 + logicTags.length * 2);
  const awardPop = Math.min(40, awardScore(item.awardTags || []));
  return Math.round(Math.min(100, hasExternal + density + awardPop));
}

function projectFitBonus(item, profile) {
  if (!profile || !profile.stack) return 0;

  let bonus = 0;
  const framework = String(profile.stack.framework || "unknown").toLowerCase();
  const styles = (profile.stack.styles || []).map((v) => String(v).toLowerCase());
  const motionTags = (item.analysis?.motion?.tags || []).map((v) => String(v).toLowerCase());

  if (framework === "react" || framework === "next") {
    if (motionTags.some((t) => t.includes("framer") || t.includes("gsap"))) bonus += 5;
  }

  if (styles.includes("tailwindcss") && (item.analysis?.ui?.tags || []).some((t) => /card|minimal|editorial/.test(t))) {
    bonus += 3;
  }

  return Math.min(10, bonus);
}

function buildBrief(shortlist, outJsonPath, profilePath, threshold, strategy, yearFilter) {
  const lines = [];
  lines.push("# Awwwards Candidate Summary (Selectable)");
  lines.push("");
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Candidate count: ${shortlist.length}`);
  lines.push(`Recommendation threshold: ${threshold}%`);
  lines.push(`Ranking strategy: ${strategy}`);
  lines.push(`Year filter: ${yearFilter || "all"}`);
  lines.push(`Shortlist file: ${toPosix(outJsonPath)}`);
  if (profilePath) lines.push(`Project profile: ${toPosix(profilePath)}`);
  lines.push("");
  lines.push("Please choose one or more candidates:");
  lines.push("- Reply examples: `1` or `1,3,5` or `all`");
  lines.push("");

  shortlist.forEach((item, idx) => {
    const themeTags = (item.analysis?.theme?.tags || []).join(" / ") || "none";
    const uiTags = (item.analysis?.ui?.tags || []).join(" / ") || "none";
    const motionTags = (item.analysis?.motion?.tags || []).join(" / ") || "none";
    const interaction = item.analysis?.interaction?.summary || "none";
    const finalUrl = item.analysis?.evidence?.finalUrl || "n/a";
    const shotDesktop = item.analysis?.evidence?.screenshotDesktop || item.analysis?.evidence?.screenshot || "n/a";

    lines.push(`## ${idx + 1}. ${item.title || item.id}`);
    lines.push(`- id: ${item.id}`);
    lines.push(`- Awwwards detail: ${item.detailUrl || "n/a"}`);
    lines.push(`- External site: ${item.externalUrl || "n/a"}`);
    lines.push(`- Final visited URL: ${finalUrl}`);
    lines.push(`- Evidence screenshot (desktop): ${shotDesktop}`);
    lines.push(`- Awards: ${(item.awardTags || []).join(", ") || "n/a"}`);
    lines.push(`- Awwwards score: ${item.score || "n/a"}`);
    lines.push(`- Total score: ${item.totalScore}`);
    lines.push(`- Similarity estimate: ${item.similarityEstimate}%`);
    lines.push(
      `- Similarity breakdown (35/35/30): structure=${item.similarityBreakdown?.structure ?? "n/a"} visual=${item.similarityBreakdown?.visual ?? "n/a"} motion=${item.similarityBreakdown?.motion ?? "n/a"}`
    );
    lines.push(`- Theme tags: ${themeTags}`);
    lines.push(`- UI tags: ${uiTags}`);
    lines.push(`- Motion tags: ${motionTags}`);
    lines.push(`- Interaction summary: ${interaction}`);
    lines.push("");
  });

  lines.push("## Notes");
  lines.push("- This stage only outputs candidate summaries and does not modify business code.");
  lines.push("- Generate the implementation blueprint only after user selection.");
  lines.push("- Full imitation is for local demo/learning only.\n");

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(String(args.in || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.analyzed.json")));
  const outJson = path.resolve(String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.shortlist.json")));
  const outMd = path.resolve(String(args.brief || path.join(process.cwd(), "output", "awwwards-design-selector", "selection-brief.md")));
  const profilePath = args.profile ? path.resolve(String(args.profile)) : path.resolve(path.join(process.cwd(), "output", "awwwards-design-selector", "project-profile.json"));
  const minCount = Math.max(1, Number(args.min || 5));
  const threshold = Number(args.threshold || 70);
  const strategy = String(args.strategy || "top-score").toLowerCase();
  const yearRaw = String(args.year || "current").toLowerCase();
  const yearFilter =
    yearRaw === "all" ? null : yearRaw === "current" ? new Date().getFullYear() : Number.isFinite(Number(yearRaw)) ? Number(yearRaw) : null;

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input file not found: ${toPosix(inPath)}`);
  }

  const analyzedPayload = readJson(inPath);
  const items = normalizeItems(analyzedPayload);
  const profile = fs.existsSync(profilePath) ? readJson(profilePath) : null;

  const scored = items
    .map((item) => {
      const q = qualityScore(item);
      const p = popularityScore(item);
      const fit = projectFitBonus(item, profile);
      const total = Math.round(Math.min(100, q * 0.6 + p * 0.35 + fit * 0.05));

      const structure = Math.min(95, 65 + (item.analysis?.ui?.tags || []).length * 6);
      const visual = Math.min(95, 65 + (item.analysis?.theme?.tags || []).length * 8);
      const motion = Math.min(95, 60 + (item.analysis?.motion?.tags || []).length * 6);
      const similarityEstimate = Math.round(structure * 0.35 + visual * 0.35 + motion * 0.3);

      return {
        ...item,
        scoreBreakdown: {
          quality: q,
          popularity: p,
          projectFit: fit,
        },
        rawScore: Number(item.score || 0),
        similarityBreakdown: {
          structure,
          visual,
          motion,
          weights: {
            structure: 0.35,
            visual: 0.35,
            motion: 0.3,
          },
        },
        totalScore: total,
        similarityEstimate,
      };
    })
    .sort((a, b) => {
      if (strategy === "top-score") {
        const byScore = (b.rawScore || 0) - (a.rawScore || 0);
        if (byScore !== 0) return byScore;
      }
      return b.totalScore - a.totalScore;
    });

  if (scored.length < minCount) {
    throw new Error(`Not enough analyzed candidates. need >= ${minCount}, got ${scored.length}`);
  }

  let pool = scored;
  const notes = [];
  if (yearFilter) {
    const byYear = scored.filter((item) => String(item.freshnessDate || "").startsWith(`${yearFilter}-`));
    if (byYear.length >= minCount) {
      pool = byYear;
    } else {
      notes.push(`year-filter-insufficient:${yearFilter}:fallback-to-all`);
    }
  }

  const shortlist = pool.slice(0, Math.max(minCount, 5));
  const recommended = shortlist.filter((item) => item.similarityEstimate >= threshold);

  const outPayload = {
    generatedAt: new Date().toISOString(),
    input: toPosix(inPath),
    profile: fs.existsSync(profilePath) ? toPosix(profilePath) : null,
    minCount,
    threshold,
    strategy,
    yearFilter,
    shortlistCount: shortlist.length,
    recommendedCount: recommended.length,
    notes,
    shortlist,
    recommendedIds: recommended.map((item) => item.id),
  };

  writeFile(outJson, `${JSON.stringify(outPayload, null, 2)}\n`);
  writeFile(outMd, `${buildBrief(shortlist, outJson, fs.existsSync(profilePath) ? profilePath : null, threshold, strategy, yearFilter)}\n`);

  console.log(`Saved shortlist: ${toPosix(outJson)}`);
  console.log(`Saved selection brief: ${toPosix(outMd)}`);
  console.log(`Shortlist count: ${shortlist.length}`);
  console.log(`Recommended (>=${threshold}%): ${recommended.length}`);
}

main();
