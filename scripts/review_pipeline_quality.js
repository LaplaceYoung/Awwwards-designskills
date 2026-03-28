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

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function normalizeItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.shortlist)) return payload.shortlist;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  return [];
}

function isValidNonAwwwardsUrl(url) {
  if (!/^https?:\/\//i.test(String(url || ""))) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !host.endsWith("awwwards.com");
  } catch {
    return false;
  }
}

function normalizeScreenshotPaths(evidence) {
  if (!evidence) return [];
  const raw = [];
  if (typeof evidence.screenshot === "string" && evidence.screenshot.trim()) raw.push(evidence.screenshot.trim());
  if (typeof evidence.screenshotDesktop === "string" && evidence.screenshotDesktop.trim()) raw.push(evidence.screenshotDesktop.trim());
  if (typeof evidence.screenshotMobile === "string" && evidence.screenshotMobile.trim()) raw.push(evidence.screenshotMobile.trim());
  if (evidence.screenshots && typeof evidence.screenshots === "object") {
    for (const key of Object.keys(evidence.screenshots)) {
      const value = evidence.screenshots[key];
      if (typeof value === "string" && value.trim()) raw.push(value.trim());
    }
  }

  return Array.from(new Set(raw)).map((p) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p)));
}

function pct(count, total) {
  if (!total) return 0;
  return Number(((count / total) * 100).toFixed(2));
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function analyzeItemCompleteness(item) {
  const analysis = item.analysis || {};
  const theme = analysis.theme || {};
  const motion = analysis.motion || {};
  const interaction = analysis.interaction || {};
  const ui = analysis.ui || {};
  const evidence = analysis.evidence || {};

  const themeTags = safeArray(theme.tags).map((s) => String(s).toLowerCase());
  const motionTags = safeArray(motion.tags).map((s) => String(s).toLowerCase());
  const interactionTags = safeArray(interaction.logicTags).map((s) => String(s).toLowerCase());
  const uiTags = safeArray(ui.tags).map((s) => String(s).toLowerCase());

  const themeComplete =
    theme.bodyBg &&
    theme.bodyBg !== "unknown" &&
    theme.bodyColor &&
    theme.bodyColor !== "unknown" &&
    themeTags.length > 0 &&
    !themeTags.some((t) => t.includes("missing") || t.includes("unknown") || t.includes("fallback"));

  const motionComplete =
    motionTags.length > 0 &&
    !motionTags.some((t) => t.includes("missing") || t.includes("unknown") || t.includes("fallback"));

  const interactionComplete =
    interaction.summary &&
    String(interaction.summary).trim() &&
    interactionTags.length > 0 &&
    !interactionTags.some((t) => t.includes("missing") || t.includes("unknown") || t.includes("fallback"));

  const uiComplete = uiTags.length > 0 && !uiTags.some((t) => t.includes("missing") || t.includes("fallback"));
  const screenshots = normalizeScreenshotPaths(evidence);
  const screenshotExists = screenshots.some((p) => fs.existsSync(p));

  return {
    themeComplete: Boolean(themeComplete),
    motionComplete: Boolean(motionComplete),
    interactionComplete: Boolean(interactionComplete),
    uiComplete: Boolean(uiComplete),
    screenshotExists,
  };
}

function buildSummaryText(report) {
  const m = report.metrics;
  const lines = [];
  lines.push(`Pipeline score: ${report.score}/100 (${report.pass ? "PASS" : "FAIL"})`);
  lines.push(`- External URL coverage: ${m.externalCoverage.rate}% (${m.externalCoverage.valid}/${m.externalCoverage.total})`);
  lines.push(`- Final URL non-Awwwards: ${m.finalUrlCoverage.rate}% (${m.finalUrlCoverage.valid}/${m.finalUrlCoverage.total})`);
  lines.push(`- Screenshot coverage: ${m.screenshotCoverage.rate}% (${m.screenshotCoverage.valid}/${m.screenshotCoverage.total})`);
  lines.push(`- Theme/Interaction completeness: ${m.semanticCoverage.rate}% (${m.semanticCoverage.valid}/${m.semanticCoverage.total})`);
  lines.push(`- Asset coverage: ${m.assetCoverage.rate}% (downloaded=${m.assetCoverage.downloaded})`);
  if (report.issues.length) {
    lines.push(`- Issues: ${report.issues.join("; ")}`);
  }
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const analyzedPath = path.resolve(
    String(args.analyzed || args.in || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.analyzed.json"))
  );
  const assetsPath = args.assets ? path.resolve(String(args.assets)) : null;
  const threshold = Number(args.threshold || 70);
  const outPath = path.resolve(
    String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "quality-review.json"))
  );

  if (!fs.existsSync(analyzedPath)) {
    throw new Error(`Analyzed file not found: ${toPosix(analyzedPath)}`);
  }

  const analyzedPayload = readJson(analyzedPath);
  const items = normalizeItems(analyzedPayload);
  if (!items.length) {
    throw new Error("No items found in analyzed payload");
  }

  let assetsPayload = null;
  if (assetsPath && fs.existsSync(assetsPath)) {
    assetsPayload = readJson(assetsPath);
  }

  let externalValid = 0;
  let finalUrlValid = 0;
  let screenshotValid = 0;
  let semanticValid = 0;
  let semanticTotal = 0;

  for (const item of items) {
    if (isValidNonAwwwardsUrl(item.externalUrl)) externalValid += 1;
    if (isValidNonAwwwardsUrl(item.analysis?.evidence?.finalUrl)) finalUrlValid += 1;

    const completeness = analyzeItemCompleteness(item);
    if (completeness.screenshotExists) screenshotValid += 1;

    const partScore = [
      completeness.themeComplete,
      completeness.motionComplete,
      completeness.interactionComplete,
      completeness.uiComplete,
    ];
    semanticValid += partScore.filter(Boolean).length;
    semanticTotal += partScore.length;
  }

  const assetDownloaded = Number(assetsPayload?.totals?.overallDownloaded || 0);
  const assetTarget = Math.max(1, items.length * 3);
  const assetRate = Number(Math.min(100, (assetDownloaded / assetTarget) * 100).toFixed(2));

  const metrics = {
    externalCoverage: {
      valid: externalValid,
      total: items.length,
      rate: pct(externalValid, items.length),
    },
    finalUrlCoverage: {
      valid: finalUrlValid,
      total: items.length,
      rate: pct(finalUrlValid, items.length),
    },
    screenshotCoverage: {
      valid: screenshotValid,
      total: items.length,
      rate: pct(screenshotValid, items.length),
    },
    semanticCoverage: {
      valid: semanticValid,
      total: semanticTotal,
      rate: pct(semanticValid, semanticTotal),
    },
    assetCoverage: {
      downloaded: assetDownloaded,
      target: assetTarget,
      rate: assetRate,
      source: assetsPayload ? toPosix(assetsPath) : null,
    },
  };

  const score = Number(
    (
      metrics.externalCoverage.rate * 0.2 +
      metrics.finalUrlCoverage.rate * 0.25 +
      metrics.screenshotCoverage.rate * 0.2 +
      metrics.semanticCoverage.rate * 0.2 +
      metrics.assetCoverage.rate * 0.15
    ).toFixed(2)
  );

  const issues = [];
  if (metrics.externalCoverage.rate < 80) issues.push("external-url-coverage-low");
  if (metrics.finalUrlCoverage.rate < 80) issues.push("real-site-final-url-coverage-low");
  if (metrics.screenshotCoverage.rate < 70) issues.push("screenshot-coverage-low");
  if (metrics.semanticCoverage.rate < 65) issues.push("theme-interaction-completeness-low");
  if (metrics.assetCoverage.rate < 50) issues.push("asset-download-coverage-low");

  const report = {
    generatedAt: new Date().toISOString(),
    threshold,
    input: {
      analyzed: toPosix(analyzedPath),
      assets: assetsPayload ? toPosix(assetsPath) : null,
      itemCount: items.length,
    },
    metrics,
    score,
    pass: score >= threshold,
    issues,
  };
  report.summary = buildSummaryText(report);

  writeJson(outPath, report);
  console.log(report.summary);
  console.log(`Saved quality review: ${toPosix(outPath)}`);
}

main();
