#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const AWWWARDS_WEBSITES_URL = "https://www.awwwards.com/websites/";
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

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

function slugFromPath(sitePath) {
  return sitePath.replace(/^\/+/, "").replace(/^sites\//, "").replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
}

function parseMaybeDate(text) {
  if (!text) return null;
  const compact = text.replace(/\s+/g, " ").trim();
  const monthPattern = MONTHS.join("|");
  const re = new RegExp(`\\b(${monthPattern})\\s+\\d{1,2},\\s+\\d{4}\\b`, "i");
  const match = compact.match(re);
  if (!match) return null;
  const d = new Date(match[0]);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeNumber(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.match(/\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  return n;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function uniqArray(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function socialOrAwwwards(url) {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (lower.includes("awwwards.com")) return true;
  return ["facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com", "tiktok.com", "pinterest."].some((s) =>
    lower.includes(s)
  );
}

function normalizeUrlSafe(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim();
  if (!/^https?:\/\//i.test(cleaned)) return null;
  try {
    const u = new URL(cleaned);
    return u.toString();
  } catch {
    return null;
  }
}

function canonicalExternalKey(url) {
  const normalized = normalizeUrlSafe(url);
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    const pathPart = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${pathPart}`;
  } catch {
    return normalized;
  }
}

function externalLinkScore(link, freqMap) {
  const href = normalizeUrlSafe(link?.href || "");
  if (!href || socialOrAwwwards(href)) return -Infinity;

  const text = String(link?.text || "").toLowerCase();
  const className = String(link?.className || "").toLowerCase();
  const target = String(link?.target || "").toLowerCase();
  const rel = String(link?.rel || "").toLowerCase();

  let score = 0;

  if (/visit\s*site|visit|live\s*site|launch|experience|discover|explore/i.test(text)) score += 45;
  if (/toolbar-bts__item/.test(className)) score += 40;
  if (/figure-rollover__bt/.test(className)) score += 30;
  if (/button|cta|visit|launch/.test(className)) score += 20;
  if (target === "_blank") score += 8;
  if (rel.includes("nofollow")) score += 3;

  if (/[?#]/.test(href)) score -= 6;
  if (/utm_|fbclid|gclid/i.test(href)) score -= 3;
  if (/\.(jpg|jpeg|png|gif|webp|svg|pdf|zip)(\?|$)/i.test(href)) score -= 20;

  const key = canonicalExternalKey(href);
  const freq = (key && freqMap.get(key)) || 1;
  score += Math.min(15, freq * 3);

  return score;
}

function pickExternalUrl(links) {
  const normalized = [];
  for (const link of links || []) {
    const href = normalizeUrlSafe(link?.href || "");
    if (!href) continue;
    normalized.push({
      href,
      text: String(link?.text || "").trim(),
      className: String(link?.className || "").trim(),
      target: String(link?.target || "").trim(),
      rel: String(link?.rel || "").trim(),
      source: String(link?.source || "anchor"),
    });
  }

  const externalLinks = normalized.filter((l) => !socialOrAwwwards(l.href));
  if (!externalLinks.length) {
    return { url: null, candidates: [] };
  }

  const freqMap = new Map();
  for (const link of externalLinks) {
    const key = canonicalExternalKey(link.href);
    if (!key) continue;
    freqMap.set(key, (freqMap.get(key) || 0) + 1);
  }

  const scored = externalLinks
    .map((link) => ({
      ...link,
      score: externalLinkScore(link, freqMap),
    }))
    .filter((link) => Number.isFinite(link.score))
    .sort((a, b) => b.score - a.score);

  return {
    url: scored[0] ? scored[0].href : null,
    candidates: scored.slice(0, 6).map((v) => ({
      href: v.href,
      text: v.text || "",
      className: v.className || "",
      target: v.target || "",
      source: v.source || "anchor",
      score: v.score,
    })),
  };
}

function baseAwardWeight(tags) {
  let score = 0;
  const lowerTags = (tags || []).map((t) => String(t).toLowerCase());
  if (lowerTags.some((t) => t.includes("sotd"))) score += 15;
  if (lowerTags.some((t) => t.includes("dev"))) score += 10;
  if (lowerTags.some((t) => t.includes("hm"))) score += 6;
  return score;
}

function preRankScore(candidate) {
  const numeric = candidate.score ? Math.min(60, candidate.score * 6) : 0;
  const award = baseAwardWeight(candidate.awardTags);
  const hasExternal = candidate.externalUrl ? 6 : 0;
  return Math.round(numeric + award + hasExternal);
}

async function collectCardCandidates(page) {
  await page.goto(AWWWARDS_WEBSITES_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(800);

  const cards = await page.evaluate(() => {
    return Array.from(document.querySelectorAll(".card-site.js-container-figure"))
      .map((card) => {
        const link = card.querySelector("a.figure-rollover__link[href^='/sites/']");
        const rows = Array.from(card.querySelectorAll(".figure-rollover__row"))
          .map((r) => (r.textContent || "").trim())
          .filter(Boolean);
        const author = (card.querySelector(".avatar-name__title")?.textContent || "").trim();
        const awardTags = Array.from(card.querySelectorAll(".budget-tag"))
          .map((el) => (el.textContent || "").trim())
          .filter(Boolean);
        const awardText = (card.querySelector(".card-site__awards")?.textContent || "").replace(/\s+/g, " ").trim();

        return {
          detailPath: link ? link.getAttribute("href") || "" : "",
          previewTitle: rows[1] || rows[0] || "",
          author,
          awardTags,
          awardText,
        };
      })
      .filter((c) => c.detailPath.startsWith("/sites/"));
  });

  const deduped = [];
  const seen = new Set();
  for (const card of cards) {
    if (!seen.has(card.detailPath)) {
      deduped.push(card);
      seen.add(card.detailPath);
    }
  }
  return deduped;
}

async function extractDetail(context, card) {
  const page = await context.newPage();
  const detailUrl = `https://www.awwwards.com${card.detailPath}`;

  const fallback = {
    detailUrl,
    sitePath: card.detailPath,
    id: slugFromPath(card.detailPath),
    title: card.previewTitle || slugFromPath(card.detailPath),
    sourceTitle: card.previewTitle || "",
    author: card.author || "",
    awardTags: uniqArray(card.awardTags),
    awardType: null,
    score: null,
    overallScores: [],
    freshnessDate: parseMaybeDate(card.awardText),
    externalUrl: null,
  };

  try {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2200);

    const parsed = await page.evaluate(() => {
      const title = (document.querySelector("h1")?.textContent || document.title || "").trim();
      const awardType = (document.querySelector(".box-score__top")?.textContent || "").replace(/\s+/g, " ").trim();
      const scoreText = (document.querySelector(".box-score__note")?.textContent || "").replace(/\s+/g, " ").trim();

      const overallScores = Array.from(document.querySelectorAll(".layout-overall__score"))
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 8);

      const awardTags = Array.from(document.querySelectorAll(".budget-tag"))
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean);

      const tooltipText = Array.from(document.querySelectorAll(".tooltip__content"))
        .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
        .join(" | ");

      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          href: a.href,
          text: (a.textContent || "").replace(/\s+/g, " ").trim(),
          className: a.className || "",
          target: a.getAttribute("target") || "",
          rel: a.getAttribute("rel") || "",
          source: "anchor",
        }))
        .filter((l) => /^https?:\/\//.test(l.href));

      const dataLinks = Array.from(document.querySelectorAll("[data-url], [data-href], [data-link]"))
        .map((el) => {
          const href = el.getAttribute("data-url") || el.getAttribute("data-href") || el.getAttribute("data-link") || "";
          if (!/^https?:\/\//i.test(href)) return null;
          return {
            href,
            text: (el.textContent || "").replace(/\s+/g, " ").trim(),
            className: el.className || "",
            target: "",
            rel: "",
            source: "data-attr",
          };
        })
        .filter(Boolean);

      return {
        title,
        awardType,
        scoreText,
        overallScores,
        awardTags,
        tooltipText,
        links: [...links, ...dataLinks],
      };
    });

    const externalPick = pickExternalUrl(parsed.links);

    const score = normalizeNumber(parsed.scoreText);
    const overall = parsed.overallScores.map((v) => normalizeNumber(v)).filter((v) => v !== null);
    const freshnessDate = parseMaybeDate(parsed.tooltipText || card.awardText || "");

    return {
      ...fallback,
      title: parsed.title || fallback.title,
      awardTags: uniqArray([...(fallback.awardTags || []), ...(parsed.awardTags || [])]),
      awardType: parsed.awardType || fallback.awardType,
      score,
      overallScores: overall,
      freshnessDate,
      externalUrl: externalPick.url,
      detailSignals: {
        scoreText: parsed.scoreText || null,
        tooltipText: parsed.tooltipText || null,
        externalCandidates: externalPick.candidates,
      },
    };
  } catch (error) {
    return {
      ...fallback,
      notes: [`detail-fetch-failed: ${String(error.message || error)}`],
    };
  } finally {
    await page.close();
  }
}

function normalizeCandidates(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  return [];
}

async function fetchLiveCandidates(count) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const listPage = await context.newPage();
    const cards = await collectCardCandidates(listPage);
    await listPage.close();

    const targetPool = cards.slice(0, Math.max(count * 2, 14));
    const detailed = [];

    for (const card of targetPool) {
      const detail = await extractDetail(context, card);
      detailed.push(detail);
    }

    detailed.sort((a, b) => preRankScore(b) - preRankScore(a));
    return detailed.slice(0, Math.max(count, 8));
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const count = Math.max(1, Number(args.count || 8));
  const source = String(args.source || "live").toLowerCase();
  const outPath = path.resolve(String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.raw.json")));
  const cachePath = path.resolve(
    String(args.cache || path.join(__dirname, "..", "references", "cache", "latest-candidates.json"))
  );
  const simulateLiveFailure = String(args["simulate-live-failure"] || "false").toLowerCase() === "true";

  const notes = [];
  let sourceUsed = source;
  let candidates = [];

  if (source === "cache") {
    const cacheData = readJsonSafe(cachePath);
    candidates = normalizeCandidates(cacheData).slice(0, count);
    sourceUsed = "cache";
    if (!candidates.length) {
      throw new Error(`Cache source is empty: ${toPosix(cachePath)}`);
    }
  } else {
    try {
      if (simulateLiveFailure) {
        throw new Error("simulate-live-failure enabled");
      }
      candidates = await fetchLiveCandidates(count);
      sourceUsed = "live";
      if (!candidates.length) {
        throw new Error("live-fetch-empty");
      }
    } catch (error) {
      notes.push(`live-fetch-failed: ${String(error.message || error)}`);
      const cacheData = readJsonSafe(cachePath);
      const fallback = normalizeCandidates(cacheData);
      if (!fallback.length) {
        throw new Error(`Live fetch failed and cache is empty: ${toPosix(cachePath)}`);
      }
      candidates = fallback.slice(0, count);
      sourceUsed = "cache-fallback";
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    sourceRequested: source,
    sourceUsed,
    requestedCount: count,
    candidateCount: candidates.length,
    notes,
    candidates,
  };

  writeJson(outPath, payload);
  writeJson(cachePath, payload);

  console.log(`Saved raw candidates: ${toPosix(outPath)}`);
  console.log(`Updated cache: ${toPosix(cachePath)}`);
  console.log(`Source used: ${sourceUsed}`);
  console.log(`Candidate count: ${candidates.length}`);
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exit(1);
});
