#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { chromium } = require("playwright");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const UNSPLASH_SEARCH_API = "https://api.unsplash.com/search/photos";

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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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

function isHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function isAwwwards(url) {
  return /(^|\.)awwwards\.com$/i.test(new URL(url).hostname);
}

function sanitizeName(input, fallback = "asset") {
  const clean = String(input || fallback)
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return clean || fallback;
}

function extensionFrom(contentType, urlPathname) {
  const lowerType = String(contentType || "").toLowerCase();
  if (lowerType.includes("image/jpeg")) return ".jpg";
  if (lowerType.includes("image/png")) return ".png";
  if (lowerType.includes("image/webp")) return ".webp";
  if (lowerType.includes("image/gif")) return ".gif";
  if (lowerType.includes("image/svg")) return ".svg";
  if (lowerType.includes("video/mp4")) return ".mp4";
  if (lowerType.includes("video/webm")) return ".webm";
  if (lowerType.includes("video/ogg")) return ".ogv";

  const ext = path.extname(urlPathname || "").toLowerCase();
  if (ext && ext.length <= 6) return ext;
  return ".bin";
}

function looksLikeMedia(url) {
  if (!isHttpUrl(url)) return false;
  const lower = url.toLowerCase();
  if (lower.includes("base64,")) return false;
  return (
    /\.(avif|webp|png|jpe?g|gif|svg|mp4|webm|mov|m4v|ogg)(\?|#|$)/.test(lower) ||
    /image|video|poster|thumbnail|thumb|hero|cover|banner/.test(lower)
  );
}

function extractIntentKeywords(intent, fallbackTitle) {
  const base = String(intent || "")
    .split(/[,\u3001\uFF0C;；|/\\\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const expanded = [];
  for (const token of base) {
    expanded.push(token);
    const sub = token
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2);
    for (const s of sub) expanded.push(s);
  }

  const uniq = Array.from(new Set(expanded)).slice(0, 5);
  if (uniq.length >= 3) return uniq;

  const fallback = String(fallbackTitle || "campus education innovation")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const f of fallback) {
    if (!uniq.includes(f)) uniq.push(f);
    if (uniq.length >= 5) break;
  }
  return uniq.slice(0, 5);
}

async function searchUnsplashByKeywords(keywords, perKeywordLimit) {
  const key = process.env.UNSPLASH_ACCESS_KEY || "";
  const out = [];
  const seen = new Set();

  if (key) {
    for (const kw of keywords) {
      const url = `${UNSPLASH_SEARCH_API}?query=${encodeURIComponent(kw)}&per_page=${Math.max(1, perKeywordLimit)}`;
      try {
        const res = await fetch(url, {
          headers: {
            "user-agent": USER_AGENT,
            accept: "application/json",
            authorization: `Client-ID ${key}`,
          },
          redirect: "follow",
        });
        if (!res.ok) continue;
        const payload = await res.json();
        const rows = Array.isArray(payload?.results) ? payload.results : [];
        for (const row of rows) {
          const img = row?.urls?.regular || row?.urls?.full || row?.urls?.raw || "";
          if (!isHttpUrl(img) || seen.has(img)) continue;
          seen.add(img);
          out.push(img);
        }
      } catch {
        // continue next keyword
      }
    }
    return out;
  }

  for (const kw of keywords) {
    const img = `https://source.unsplash.com/featured/?${encodeURIComponent(kw)}`;
    if (!seen.has(img)) {
      seen.add(img);
      out.push(img);
    }
  }
  return out;
}

function buildFallbackSvg(keyword, index) {
  const safe = String(keyword || "visual").replace(/[<>&"]/g, "");
  const hue = (index * 47 + 220) % 360;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900'>
  <defs>
    <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0%' stop-color='hsl(${hue},75%,50%)'/>
      <stop offset='100%' stop-color='hsl(${(hue + 80) % 360},80%,45%)'/>
    </linearGradient>
  </defs>
  <rect width='100%' height='100%' fill='url(#g)'/>
  <text x='80' y='180' fill='rgba(255,255,255,.9)' font-size='86' font-family='Arial, sans-serif' font-weight='700'>${safe}</text>
  <text x='80' y='260' fill='rgba(255,255,255,.85)' font-size='42' font-family='Arial, sans-serif'>AI thematic fallback visual</text>
</svg>`;
}

function writeIntentFallbackSvgs(dirPath, keywords, neededCount) {
  ensureDir(dirPath);
  const files = [];
  for (let i = 0; i < neededCount; i += 1) {
    const keyword = keywords[i % keywords.length] || `intent-${i + 1}`;
    const fileName = `${i + 1}-generated-${sanitizeName(keyword, "intent")}.svg`;
    const fullPath = path.join(dirPath, fileName);
    fs.writeFileSync(fullPath, buildFallbackSvg(keyword, i), "utf8");
    files.push({
      sourceType: "intent-generated",
      kind: "image",
      url: `generated://${keyword}`,
      finalUrl: `generated://${keyword}`,
      contentType: "image/svg+xml",
      bytes: fs.statSync(fullPath).size,
      file: toPosix(fullPath),
    });
  }
  return files;
}

async function fetchBuffer(url, timeoutMs = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "user-agent": USER_AGENT,
        accept: "*/*",
      },
    });

    if (!res.ok) {
      throw new Error(`download-failed ${res.status} ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    const arrayBuffer = await res.arrayBuffer();
    return {
      finalUrl: res.url || url,
      contentType,
      buffer: Buffer.from(arrayBuffer),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function extractOriginMedia(page, targetUrl) {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2200);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(600);

  const media = await page.evaluate(() => {
    const out = [];
    const seen = new Set();

    const toAbs = (value) => {
      if (!value) return null;
      if (/^data:|^blob:/i.test(value)) return null;
      try {
        return new URL(value, location.href).href;
      } catch {
        return null;
      }
    };

    const push = (url, kind, meta = {}) => {
      const abs = toAbs(url);
      if (!abs || seen.has(abs)) return;
      seen.add(abs);
      out.push({
        url: abs,
        kind,
        ...meta,
      });
    };

    const collectSrcset = (srcset) => {
      if (!srcset) return [];
      return srcset
        .split(",")
        .map((part) => part.trim().split(/\s+/)[0])
        .filter(Boolean);
    };

    document.querySelectorAll("img").forEach((img) => {
      push(img.currentSrc || img.src || img.getAttribute("src"), "img", {
        width: img.naturalWidth || img.width || 0,
        height: img.naturalHeight || img.height || 0,
      });
      collectSrcset(img.getAttribute("srcset")).forEach((url) => push(url, "img-srcset"));
      collectSrcset(img.getAttribute("data-srcset")).forEach((url) => push(url, "img-data-srcset"));
      push(img.getAttribute("data-src"), "img-data-src");
    });

    document.querySelectorAll("video").forEach((video) => {
      push(video.currentSrc || video.src || video.getAttribute("src"), "video");
      push(video.poster || video.getAttribute("poster"), "video-poster");
      video.querySelectorAll("source").forEach((source) => push(source.src || source.getAttribute("src"), "video-source"));
    });

    document.querySelectorAll("source").forEach((source) => {
      push(source.src || source.getAttribute("src"), "source");
      collectSrcset(source.getAttribute("srcset")).forEach((url) => push(url, "source-srcset"));
    });

    document.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (/\.(png|jpe?g|webp|gif|svg|mp4|webm|mov|m4v)(\?|#|$)/i.test(href)) {
        push(href, "link-media");
      }
    });

    const cssUrlRegex = /url\((['"]?)(.*?)\1\)/g;
    const collectBgFromString = (value, kind) => {
      if (!value || value === "none") return;
      let match;
      while ((match = cssUrlRegex.exec(value)) !== null) {
        push(match[2], kind);
      }
    };

    document.querySelectorAll("[style]").forEach((el) => {
      collectBgFromString(el.getAttribute("style"), "inline-style");
    });

    const sampled = Array.from(document.querySelectorAll("section, div, figure, article, header, main")).slice(0, 600);
    sampled.forEach((el) => {
      const computed = window.getComputedStyle(el);
      collectBgFromString(computed.backgroundImage, "computed-bg");
    });

    return {
      finalUrl: location.href,
      pageTitle: document.title || "",
      media: out,
    };
  });

  return media;
}

async function duckduckgoImageSearch(query, maxCount) {
  const start = `https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`;
  const pageRes = await fetch(start, {
    headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
    redirect: "follow",
  });
  const html = await pageRes.text();

  const vqdMatch =
    html.match(/vqd='([^']+)'/) ||
    html.match(/vqd=\\?"([^"]+)\\?"/) ||
    html.match(/"vqd"\s*:\s*"([^"]+)"/);
  if (!vqdMatch) {
    throw new Error("duckduckgo-vqd-not-found");
  }
  const vqd = vqdMatch[1];

  const apiUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,&p=1`;
  const apiRes = await fetch(apiUrl, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "application/json,text/javascript,*/*",
      referer: "https://duckduckgo.com/",
      "x-requested-with": "XMLHttpRequest",
    },
    redirect: "follow",
  });
  if (!apiRes.ok) {
    throw new Error(`duckduckgo-api-failed ${apiRes.status}`);
  }
  const data = await apiRes.json();
  const rows = Array.isArray(data?.results) ? data.results : [];
  return rows
    .map((row) => row?.image)
    .filter((url) => isHttpUrl(url))
    .slice(0, Math.max(1, maxCount));
}

function hash8(input) {
  return crypto.createHash("sha1").update(String(input || "")).digest("hex").slice(0, 8);
}

async function downloadMediaEntries(urls, outDir, limit, sourceType) {
  ensureDir(outDir);
  const downloads = [];
  const failures = [];
  const seen = new Set();

  for (const row of urls) {
    if (downloads.length >= limit) break;
    const url = typeof row === "string" ? row : row.url;
    const kind = typeof row === "string" ? sourceType : row.kind || sourceType;
    if (!isHttpUrl(url) || seen.has(url)) continue;
    seen.add(url);
    if (!looksLikeMedia(url) && !["search", "intent"].includes(sourceType)) continue;

    try {
      const { buffer, contentType, finalUrl } = await fetchBuffer(url);
      if (!buffer.length) {
        failures.push({ url, reason: "empty-buffer" });
        continue;
      }

      const u = new URL(finalUrl);
      const ext = extensionFrom(contentType, u.pathname);
      const base = sanitizeName(path.basename(u.pathname, path.extname(u.pathname)) || `${kind}-${hash8(finalUrl)}`);
      const fileName = `${downloads.length + 1}-${base}${ext}`;
      const fullPath = path.join(outDir, fileName);
      fs.writeFileSync(fullPath, buffer);

      downloads.push({
        sourceType,
        kind,
        url,
        finalUrl,
        contentType: contentType || null,
        bytes: buffer.length,
        file: toPosix(fullPath),
      });
    } catch (error) {
      failures.push({ url, reason: String(error.message || error) });
    }
  }

  return { downloads, failures };
}

async function processCandidate(browser, candidate, options) {
  const candidateDir = path.join(options.assetDir, sanitizeName(candidate.id || candidate.title || "candidate"));
  const originDir = path.join(candidateDir, "origin");
  const searchDir = path.join(candidateDir, "search");
  const intentDir = path.join(candidateDir, "intent");

  const report = {
    id: candidate.id || null,
    title: candidate.title || null,
    mode: options.mode,
    targetUrl: candidate.analysis?.evidence?.finalUrl || candidate.externalUrl || null,
    detailUrl: candidate.detailUrl || null,
    origin: {
      enabled: options.mode === "origin" || options.mode === "hybrid",
      pageTitle: null,
      finalUrl: null,
      foundMedia: 0,
      downloaded: 0,
      failed: 0,
      files: [],
      notes: [],
    },
    search: {
      enabled: options.mode === "search" || options.mode === "hybrid",
      query: null,
      foundMedia: 0,
      downloaded: 0,
      failed: 0,
      files: [],
      notes: [],
    },
    intent: {
      enabled: Boolean(options.intent),
      intentRaw: options.intent || "",
      keywords: [],
      foundMedia: 0,
      downloaded: 0,
      failed: 0,
      files: [],
      notes: [],
    },
  };

  if (report.origin.enabled) {
    const target =
      (isHttpUrl(report.targetUrl) ? report.targetUrl : null) ||
      (isHttpUrl(candidate.externalUrl) ? candidate.externalUrl : null) ||
      null;
    if (!target || (isHttpUrl(target) && isAwwwards(target))) {
      report.origin.notes.push("origin-target-missing-or-awwwards");
    } else {
      const page = await browser.newPage();
      try {
        const extracted = await extractOriginMedia(page, target);
        report.origin.pageTitle = extracted.pageTitle || null;
        report.origin.finalUrl = extracted.finalUrl || null;
        report.origin.foundMedia = extracted.media.length;

        const originDownload = await downloadMediaEntries(
          extracted.media,
          originDir,
          options.maxPerCandidate,
          "origin"
        );
        report.origin.downloaded = originDownload.downloads.length;
        report.origin.failed = originDownload.failures.length;
        report.origin.files = originDownload.downloads;
        if (!report.origin.downloaded) {
          report.origin.notes.push("origin-download-empty");
        }
      } catch (error) {
        report.origin.notes.push(`origin-extract-failed: ${String(error.message || error)}`);
      } finally {
        await page.close();
      }
    }
  }

  if (report.search.enabled) {
    const queryBase = options.query || candidate.title || candidate.id || "modern website design";
    const query = `${queryBase} ui web design`.trim();
    report.search.query = query;

    try {
      let searchResults = [];
      try {
        searchResults = await duckduckgoImageSearch(query, options.maxSearchCandidates);
      } catch (error) {
        report.search.notes.push(`duckduckgo-failed: ${String(error.message || error)}`);
      }

      if (!searchResults.length) {
        searchResults = [
          `https://source.unsplash.com/featured/?${encodeURIComponent(query)}`,
          `https://loremflickr.com/1600/900/${encodeURIComponent(queryBase)}`,
        ];
      }

      report.search.foundMedia = searchResults.length;
      const searchDownload = await downloadMediaEntries(searchResults, searchDir, options.maxSearchDownload, "search");
      report.search.downloaded = searchDownload.downloads.length;
      report.search.failed = searchDownload.failures.length;
      report.search.files = searchDownload.downloads;
      if (!report.search.downloaded) {
        report.search.notes.push("search-download-empty");
      }
    } catch (error) {
      report.search.notes.push(`search-process-failed: ${String(error.message || error)}`);
    }
  }

  if (report.intent.enabled) {
    const keywords = extractIntentKeywords(options.intent, candidate.title || candidate.id);
    report.intent.keywords = keywords;
    try {
      const unsplashUrls = await searchUnsplashByKeywords(
        keywords,
        Math.max(1, Math.ceil(options.maxIntentCandidates / Math.max(1, keywords.length)))
      );
      report.intent.foundMedia = unsplashUrls.length;
      const intentDownload = await downloadMediaEntries(unsplashUrls, intentDir, options.maxIntentDownload, "intent");
      report.intent.downloaded = intentDownload.downloads.length;
      report.intent.failed = intentDownload.failures.length;
      report.intent.files = intentDownload.downloads;

      if (report.intent.downloaded < 3) {
        const ddgIntent = [];
        for (const kw of keywords) {
          if (ddgIntent.length >= options.maxIntentCandidates) break;
          try {
            const rows = await duckduckgoImageSearch(`${kw} campus architecture`, 4);
            ddgIntent.push(...rows);
          } catch (error) {
            report.intent.notes.push(`intent-duckduckgo-failed:${kw}:${String(error.message || error)}`);
          }
        }
        const dedupedDdg = Array.from(new Set(ddgIntent)).slice(0, options.maxIntentCandidates);
        if (dedupedDdg.length) {
          const need = Math.max(0, 3 - report.intent.downloaded);
          const ddgDownload = await downloadMediaEntries(dedupedDdg, intentDir, Math.max(need, 3), "intent-search");
          report.intent.files.push(...ddgDownload.downloads);
          report.intent.downloaded += ddgDownload.downloads.length;
          report.intent.failed += ddgDownload.failures.length;
          if (ddgDownload.downloads.length) report.intent.notes.push("intent-augmented-by-duckduckgo");
        }
      }

      if (report.intent.downloaded < 3) {
        const generated = writeIntentFallbackSvgs(intentDir, keywords, 3 - report.intent.downloaded);
        report.intent.files.push(...generated);
        report.intent.downloaded += generated.length;
        report.intent.notes.push("intent-fallback-generated-visuals");
      }

      if (report.intent.downloaded < 3) {
        report.intent.notes.push("intent-media-below-minimum-3");
      }
    } catch (error) {
      report.intent.notes.push(`intent-process-failed: ${String(error.message || error)}`);
    }
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv);
  const sourcePath = path.resolve(
    String(args.source || args["source-file"] || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.shortlist.json"))
  );
  const outPath = path.resolve(
    String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "replica-assets.manifest.json"))
  );
  const assetDir = path.resolve(
    String(args["asset-dir"] || path.join(process.cwd(), "output", "awwwards-design-selector", "replica-assets"))
  );
  const selectedRaw = args.selected || "all";
  const mode = String(args.mode || "hybrid").toLowerCase();
  const query = args.query ? String(args.query) : "";
  const intentFile = args["intent-file"] ? path.resolve(String(args["intent-file"])) : "";
  let intent = args.intent ? String(args.intent) : "";
  if (!intent && intentFile) {
    if (!fs.existsSync(intentFile)) {
      throw new Error(`Intent file not found: ${toPosix(intentFile)}`);
    }
    intent = fs.readFileSync(intentFile, "utf8").trim();
  }
  const maxPerCandidate = Math.max(1, Number(args["max-per-candidate"] || 20));
  const maxSearchCandidates = Math.max(1, Number(args["max-search-candidates"] || 24));
  const maxSearchDownload = Math.max(1, Number(args["max-search-download"] || 10));
  const maxIntentCandidates = Math.max(3, Number(args["max-intent-candidates"] || 18));
  const maxIntentDownload = Math.max(3, Number(args["max-intent-download"] || 8));

  if (!["origin", "search", "hybrid"].includes(mode)) {
    throw new Error(`Invalid --mode ${mode}. Use origin|search|hybrid`);
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Source file not found: ${toPosix(sourcePath)}`);
  }

  const payload = readJson(sourcePath);
  const items = normalizeItems(payload);
  const selected = pickBySelection(items, selectedRaw);
  if (!selected.length) {
    throw new Error("No selected candidates matched. Use --selected all|id|1,3");
  }

  ensureDir(assetDir);

  const browser = await chromium.launch({ headless: true });
  const summary = {
    generatedAt: new Date().toISOString(),
    mode,
    source: toPosix(sourcePath),
    intentSource: intentFile ? toPosix(intentFile) : "inline-arg",
    selected: selected.map((item) => item.id || item.title || "unknown"),
    assetDir: toPosix(assetDir),
    totals: {
      candidates: selected.length,
      originDownloaded: 0,
      originFailed: 0,
      searchDownloaded: 0,
      searchFailed: 0,
      intentDownloaded: 0,
      intentFailed: 0,
      overallDownloaded: 0,
    },
    items: [],
  };

  try {
    for (const candidate of selected) {
      const report = await processCandidate(browser, candidate, {
        mode,
        query,
        intent,
        assetDir,
        maxPerCandidate,
        maxSearchCandidates,
        maxSearchDownload,
        maxIntentCandidates,
        maxIntentDownload,
      });
      summary.items.push(report);
      summary.totals.originDownloaded += report.origin.downloaded;
      summary.totals.originFailed += report.origin.failed;
      summary.totals.searchDownloaded += report.search.downloaded;
      summary.totals.searchFailed += report.search.failed;
      summary.totals.intentDownloaded += report.intent.downloaded;
      summary.totals.intentFailed += report.intent.failed;
      summary.totals.overallDownloaded += report.origin.downloaded + report.search.downloaded + report.intent.downloaded;

      console.log(
        `[assets] ${report.id || report.title}: origin=${report.origin.downloaded}, search=${report.search.downloaded}, intent=${report.intent.downloaded}`
      );
    }
  } finally {
    await browser.close();
  }

  writeJson(outPath, summary);
  console.log(`Saved replica assets manifest: ${toPosix(outPath)}`);
  console.log(`Total downloaded assets: ${summary.totals.overallDownloaded}`);
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exit(1);
});
