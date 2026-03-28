#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

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

function runNode(scriptPath, scriptArgs) {
  const res = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function appendArg(args, key, value) {
  if (value === undefined || value === null || value === "") return;
  args.push(`--${key}`, String(value));
}

function main() {
  const args = parseArgs(process.argv);
  const maxRounds = Math.max(1, Number(args["max-rounds"] || 2));
  const threshold = Number(args.threshold || 75);
  const count = Math.max(5, Number(args.count || 8));
  const min = Math.max(5, Number(args.min || 5));
  const source = String(args.source || "live");
  const selected = String(args.selected || "all");
  const collectAssets = String(args["collect-assets"] || "true").toLowerCase() !== "false";
  const assetMode = String(args["asset-mode"] || "hybrid").toLowerCase();
  const assetQuery = args["asset-query"] ? String(args["asset-query"]) : "";

  const baseOutDir = path.resolve(String(args["out-dir"] || path.join(process.cwd(), "output", "awwwards-design-selector")));
  const rawPath = path.join(baseOutDir, "candidates.raw.json");
  const analyzedPath = path.join(baseOutDir, "candidates.analyzed.json");
  const shortlistPath = path.join(baseOutDir, "candidates.shortlist.json");
  const reviewDir = path.join(baseOutDir, "quality-loop");
  const assetsManifest = path.join(baseOutDir, "replica-assets.manifest.json");
  const summaryPath = path.join(reviewDir, "loop-summary.json");
  fs.mkdirSync(reviewDir, { recursive: true });

  const scriptsDir = path.resolve(__dirname);
  const fetchScript = path.join(scriptsDir, "fetch_awwwards_candidates.js");
  const analyzeScript = path.join(scriptsDir, "analyze_sites.js");
  const rankScript = path.join(scriptsDir, "rank_and_select.js");
  const assetScript = path.join(scriptsDir, "collect_replica_assets.js");
  const reviewScript = path.join(scriptsDir, "review_pipeline_quality.js");

  const loop = {
    generatedAt: new Date().toISOString(),
    maxRounds,
    threshold,
    params: {
      count,
      min,
      source,
      selected,
      collectAssets,
      assetMode,
      assetQuery,
    },
    rounds: [],
    final: {
      pass: false,
      score: 0,
      report: null,
      completedRounds: 0,
    },
  };

  for (let round = 1; round <= maxRounds; round += 1) {
    const roundInfo = {
      round,
      steps: [],
      pass: false,
      score: 0,
      reportPath: null,
    };

    const fetchArgs = ["--count", String(count), "--source", source, "--out", rawPath];
    const fetchRes = runNode(fetchScript, fetchArgs);
    roundInfo.steps.push({ name: "fetch", ok: fetchRes.ok, status: fetchRes.status, stderr: fetchRes.stderr.trim() });
    if (!fetchRes.ok) {
      loop.rounds.push(roundInfo);
      break;
    }

    const analyzeArgs = ["--in", rawPath, "--out", analyzedPath];
    const analyzeRes = runNode(analyzeScript, analyzeArgs);
    roundInfo.steps.push({ name: "analyze", ok: analyzeRes.ok, status: analyzeRes.status, stderr: analyzeRes.stderr.trim() });
    if (!analyzeRes.ok) {
      loop.rounds.push(roundInfo);
      break;
    }

    const rankArgs = ["--in", analyzedPath, "--out", shortlistPath, "--min", String(min)];
    const rankRes = runNode(rankScript, rankArgs);
    roundInfo.steps.push({ name: "rank", ok: rankRes.ok, status: rankRes.status, stderr: rankRes.stderr.trim() });
    if (!rankRes.ok) {
      loop.rounds.push(roundInfo);
      break;
    }

    if (collectAssets) {
      const assetArgs = ["--source", shortlistPath, "--selected", selected, "--mode", assetMode, "--out", assetsManifest];
      appendArg(assetArgs, "query", assetQuery);
      const assetRes = runNode(assetScript, assetArgs);
      roundInfo.steps.push({
        name: "collect-assets",
        ok: assetRes.ok,
        status: assetRes.status,
        stderr: assetRes.stderr.trim(),
      });
      if (!assetRes.ok) {
        loop.rounds.push(roundInfo);
        break;
      }
    }

    const reportPath = path.join(reviewDir, `quality-review.round-${round}.json`);
    const reviewArgs = ["--analyzed", analyzedPath, "--threshold", String(threshold), "--out", reportPath];
    if (collectAssets) {
      reviewArgs.push("--assets", assetsManifest);
    }
    const reviewRes = runNode(reviewScript, reviewArgs);
    roundInfo.steps.push({ name: "review", ok: reviewRes.ok, status: reviewRes.status, stderr: reviewRes.stderr.trim() });
    if (!reviewRes.ok) {
      loop.rounds.push(roundInfo);
      break;
    }

    const report = readJson(reportPath);
    roundInfo.pass = Boolean(report.pass);
    roundInfo.score = Number(report.score || 0);
    roundInfo.reportPath = toPosix(reportPath);
    loop.rounds.push(roundInfo);

    loop.final.pass = roundInfo.pass;
    loop.final.score = roundInfo.score;
    loop.final.report = roundInfo.reportPath;
    loop.final.completedRounds = round;

    if (roundInfo.pass) {
      break;
    }
  }

  fs.writeFileSync(summaryPath, `${JSON.stringify(loop, null, 2)}\n`, "utf8");
  console.log(`Quality loop summary: ${toPosix(summaryPath)}`);
  console.log(
    `Final result: ${loop.final.pass ? "PASS" : "FAIL"} (score=${loop.final.score}, rounds=${loop.final.completedRounds})`
  );
}

main();
