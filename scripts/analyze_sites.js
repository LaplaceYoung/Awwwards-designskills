#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const LIB_HINTS = ["gsap", "three", "lottie", "barba", "lenis", "locomotive", "framer", "anime", "swiper", "pixi"];
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";

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

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeCandidates(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.candidates)) return payload.candidates;
  return [];
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

function socialOrAwwwards(url) {
  if (!url) return true;
  const lower = String(url).toLowerCase();
  if (lower.includes("awwwards.com")) return true;
  return ["facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com", "youtube.com", "tiktok.com", "pinterest."].some((s) =>
    lower.includes(s)
  );
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

  let score = 0;
  if (/visit\s*site|visit|live\s*site|launch|experience|discover|explore/i.test(text)) score += 45;
  if (/toolbar-bts__item/.test(className)) score += 40;
  if (/figure-rollover__bt/.test(className)) score += 30;
  if (/button|cta|visit|launch/.test(className)) score += 20;
  if (target === "_blank") score += 8;
  if (/[?#]/.test(href)) score -= 6;
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
      source: String(link?.source || "anchor"),
    });
  }

  const externalLinks = normalized.filter((l) => !socialOrAwwwards(l.href));
  if (!externalLinks.length) return { url: null, candidates: [] };

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
    candidates: scored.slice(0, 6).map((item) => ({
      href: item.href,
      text: item.text || "",
      className: item.className || "",
      target: item.target || "",
      source: item.source || "anchor",
      score: item.score,
    })),
  };
}

function inferThemeTags(theme) {
  const tags = [];
  const bg = (theme.bodyBg || "").toLowerCase();
  const fg = (theme.bodyColor || "").toLowerCase();
  const palette = theme.palette || [];

  if (bg.includes("0, 0, 0") || bg.includes("rgb(0") || bg.includes("#000")) tags.push("dark-base");
  if (bg.includes("255") || bg.includes("#fff") || bg.includes("white")) tags.push("light-base");
  if (theme.fontFamilies.length >= 2) tags.push("multi-font");
  if (fg && bg && fg !== bg) tags.push("contrast-driven");
  if (palette.length >= 4) tags.push("rich-palette");
  if (!tags.length) tags.push("neutral-theme");

  return tags;
}

function inferUiTags(signal) {
  const tags = [];
  if (signal.sectionCount >= 8) tags.push("long-form-layout");
  if (signal.linkCount >= 80) tags.push("content-dense-navigation");
  if (signal.buttonCount >= 10) tags.push("cta-heavy");
  if (signal.headingCount >= 12) tags.push("editorial-typography");
  if (signal.cardLikeCount >= 8) tags.push("card-composition");
  if (signal.navCount >= 2) tags.push("multi-nav");
  if (!tags.length) tags.push("minimal-composition");
  return tags;
}

function inferMotionTags(signal, libs) {
  const tags = [];
  if (signal.hasCanvas) tags.push("canvas-scene");
  if (signal.hasVideo) tags.push("video-stage");
  if (signal.hasWebglKeyword) tags.push("webgl-hint");
  if (signal.hasCustomCursor) tags.push("custom-cursor");
  if (signal.stickyCount >= 2) tags.push("scroll-pinned-sections");
  if (signal.cssAnimatedElements >= 8) tags.push("css-animated");
  if (signal.cssTransitionElements >= 12) tags.push("css-transitioned");
  if (signal.keyframeCount >= 2) tags.push("keyframe-driven");
  for (const lib of libs) tags.push(`lib:${lib}`);
  if (!tags.length) tags.push("basic-motion");
  return tags;
}

function inferInteractionSummary(signal) {
  const logicTags = [];
  if (signal.hasCustomCursor) logicTags.push("cursor-feedback");
  if (signal.stickyCount >= 2) logicTags.push("scroll-storytelling");
  if (signal.linkCount > 70) logicTags.push("exploration-navigation");
  if (signal.buttonCount > 10) logicTags.push("multi-cta-journey");
  if (signal.pointerElements > 40) logicTags.push("high-interactive-density");
  if (signal.interactiveElements > 45) logicTags.push("interactive-mesh");
  if (!logicTags.length) logicTags.push("focused-navigation");
  return {
    logicTags,
    summary: logicTags.join(" + "),
  };
}

function sameEffectiveUrl(a, b) {
  const aa = normalizeUrlSafe(a);
  const bb = normalizeUrlSafe(b);
  if (!aa || !bb) return false;
  try {
    const ua = new URL(aa);
    const ub = new URL(bb);
    const pa = ua.pathname.replace(/\/+$/, "");
    const pb = ub.pathname.replace(/\/+$/, "");
    return ua.origin === ub.origin && pa === pb;
  } catch {
    return aa === bb;
  }
}

async function resolveExternalFromDetail(context, detailUrl) {
  const page = await context.newPage();
  try {
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1800);
    const extracted = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a[href]"))
        .map((a) => ({
          href: a.href,
          text: (a.textContent || "").replace(/\s+/g, " ").trim(),
          className: a.className || "",
          target: a.getAttribute("target") || "",
          source: "anchor",
        }))
        .filter((v) => /^https?:\/\//.test(v.href));

      const dataLinks = Array.from(document.querySelectorAll("[data-url], [data-href], [data-link]"))
        .map((el) => {
          const href = el.getAttribute("data-url") || el.getAttribute("data-href") || el.getAttribute("data-link") || "";
          if (!/^https?:\/\//i.test(href)) return null;
          return {
            href,
            text: (el.textContent || "").replace(/\s+/g, " ").trim(),
            className: el.className || "",
            target: "",
            source: "data-attr",
          };
        })
        .filter(Boolean);

      return {
        finalDetailUrl: window.location.href,
        links: [...anchors, ...dataLinks],
      };
    });

    const picked = pickExternalUrl(extracted.links || []);
    return {
      externalUrl: picked.url,
      detailUrlVisited: extracted.finalDetailUrl || detailUrl,
      candidates: picked.candidates || [],
      note: picked.url ? "resolved-from-detail-page" : "detail-page-has-no-external-url",
    };
  } catch (error) {
    return {
      externalUrl: null,
      detailUrlVisited: detailUrl,
      candidates: [],
      note: `detail-resolve-failed: ${String(error.message || error)}`,
    };
  } finally {
    await page.close();
  }
}

async function extractPageSignals(page) {
  return page.evaluate((libHints) => {
    function normalizeColor(v) {
      if (!v) return "";
      const cleaned = String(v).trim().toLowerCase();
      if (!cleaned || cleaned === "transparent" || cleaned === "rgba(0, 0, 0, 0)") return "";
      return cleaned;
    }

    const scripts = Array.from(document.querySelectorAll("script[src]"))
      .map((s) => (s.getAttribute("src") || "").toLowerCase())
      .filter(Boolean);
    const html = document.documentElement.outerHTML.toLowerCase();
    const bodyStyle = window.getComputedStyle(document.body);

    const libsDetected = libHints.filter((lib) => scripts.some((src) => src.includes(lib)) || html.includes(lib));

    const fontFamilies = Array.from(document.querySelectorAll("h1, h2, h3, h4, p, a, button, nav, [class*='title']"))
      .map((el) => window.getComputedStyle(el).fontFamily)
      .filter(Boolean)
      .slice(0, 120);

    const uniqFonts = Array.from(new Set(fontFamilies)).slice(0, 8);

    const candidates = Array.from(document.querySelectorAll("body, main, section, article, nav, a, button, h1, h2, h3, p")).slice(0, 260);
    const colorCount = new Map();
    const bgCount = new Map();

    for (const el of candidates) {
      const s = window.getComputedStyle(el);
      const color = normalizeColor(s.color);
      const bg = normalizeColor(s.backgroundColor);
      if (color) colorCount.set(color, (colorCount.get(color) || 0) + 1);
      if (bg) bgCount.set(bg, (bgCount.get(bg) || 0) + 1);
    }

    const palette = Array.from(new Set([...Array.from(bgCount.keys()), ...Array.from(colorCount.keys())])).slice(0, 8);

    const allNodes = Array.from(document.querySelectorAll("*")).slice(0, 2000);
    let cssAnimatedElements = 0;
    let cssTransitionElements = 0;
    for (const el of allNodes) {
      const style = window.getComputedStyle(el);
      if (style.animationName && style.animationName !== "none" && style.animationDuration !== "0s") {
        cssAnimatedElements += 1;
      }
      if (style.transitionDuration && style.transitionDuration !== "0s") {
        cssTransitionElements += 1;
      }
    }

    let keyframeCount = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules || [])) {
          if (String(rule.type) === "7") keyframeCount += 1;
        }
      } catch {
        // cross-origin stylesheet
      }
    }

    const signal = {
      hasCanvas: Boolean(document.querySelector("canvas")),
      hasVideo: Boolean(document.querySelector("video")),
      hasWebglKeyword: html.includes("webgl") || html.includes("three"),
      hasCustomCursor: bodyStyle.cursor === "none" || Boolean(document.querySelector(".cursor, .custom-cursor")),
      stickyCount: allNodes.filter((el) => window.getComputedStyle(el).position === "sticky").length,
      headingCount: document.querySelectorAll("h1, h2, h3").length,
      sectionCount: document.querySelectorAll("section").length,
      navCount: document.querySelectorAll("nav").length,
      buttonCount: document.querySelectorAll("button").length,
      linkCount: document.querySelectorAll("a").length,
      pointerElements: Array.from(document.querySelectorAll("a, button, [role='button']")).filter(
        (el) => window.getComputedStyle(el).cursor === "pointer"
      ).length,
      cardLikeCount: document.querySelectorAll("[class*='card'], article").length,
      interactiveElements: document.querySelectorAll("a, button, [role='button'], input, select, textarea, summary").length,
      cssAnimatedElements,
      cssTransitionElements,
      keyframeCount,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };

    return {
      pageTitle: document.title || "",
      libsDetected,
      theme: {
        bodyBg: bodyStyle.backgroundColor,
        bodyColor: bodyStyle.color,
        fontFamilies: uniqFonts,
        palette,
      },
      signal,
    };
  }, LIB_HINTS);
}

async function analyzeExternalPage(contexts, candidate, screenshotDir, targetUrl, resolution) {
  const desktopPage = await contexts.desktop.newPage();
  const shotDesktopName = `${candidate.id || "candidate"}-desktop.png`;
  const shotMobileName = `${candidate.id || "candidate"}-mobile.png`;
  const shotDesktopPath = path.join(screenshotDir, shotDesktopName);
  const shotMobilePath = path.join(screenshotDir, shotMobileName);

  const result = {
    pageTitle: "",
    libsDetected: [],
    theme: {
      bodyBg: "",
      bodyColor: "",
      fontFamilies: [],
      palette: [],
      tags: [],
    },
    ui: {
      tags: [],
      signals: {},
    },
    motion: {
      tags: [],
      signals: {},
    },
    interaction: {
      logicTags: [],
      summary: "",
    },
    evidence: {
      screenshot: "",
      screenshotDesktop: "",
      screenshotMobile: "",
      finalUrl: targetUrl || null,
      finalUrlDesktop: null,
      finalUrlMobile: null,
      inputUrl: targetUrl || null,
      redirected: false,
      redirectedMobile: false,
      detailFallbackUsed: Boolean(resolution?.resolvedFromDetail),
      detailResolution: resolution?.detailResolution || null,
    },
    notes: [],
  };

  try {
    fs.mkdirSync(screenshotDir, { recursive: true });

    await desktopPage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await desktopPage.waitForTimeout(2200);
    await desktopPage.mouse.move(220, 260);
    await desktopPage.mouse.wheel(0, 900);
    await desktopPage.waitForTimeout(600);

    const extracted = await extractPageSignals(desktopPage);
    await desktopPage.screenshot({ path: shotDesktopPath, fullPage: false });

    let mobileFinalUrl = null;
    try {
      const mobilePage = await contexts.mobile.newPage();
      await mobilePage.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      await mobilePage.waitForTimeout(2000);
      await mobilePage.mouse.wheel(0, 500);
      await mobilePage.waitForTimeout(400);
      await mobilePage.screenshot({ path: shotMobilePath, fullPage: false });
      mobileFinalUrl = mobilePage.url();
      await mobilePage.close();
    } catch (mobileError) {
      result.notes.push(`mobile-capture-failed: ${String(mobileError.message || mobileError)}`);
    }

    result.pageTitle = extracted.pageTitle;
    result.libsDetected = extracted.libsDetected;
    result.theme = {
      ...extracted.theme,
      tags: inferThemeTags(extracted.theme),
    };
    result.ui = {
      tags: inferUiTags(extracted.signal),
      signals: extracted.signal,
    };
    result.motion = {
      tags: inferMotionTags(extracted.signal, extracted.libsDetected),
      signals: extracted.signal,
    };
    result.interaction = inferInteractionSummary(extracted.signal);
    result.evidence = {
      ...result.evidence,
      screenshot: toPosix(path.relative(process.cwd(), shotDesktopPath)),
      screenshotDesktop: toPosix(path.relative(process.cwd(), shotDesktopPath)),
      screenshotMobile: fs.existsSync(shotMobilePath) ? toPosix(path.relative(process.cwd(), shotMobilePath)) : "",
      finalUrl: desktopPage.url(),
      finalUrlDesktop: desktopPage.url(),
      finalUrlMobile: mobileFinalUrl,
      redirected: !sameEffectiveUrl(targetUrl, desktopPage.url()),
      redirectedMobile: mobileFinalUrl ? !sameEffectiveUrl(targetUrl, mobileFinalUrl) : false,
    };
  } catch (error) {
    result.notes.push(`external-analyze-failed: ${String(error.message || error)}`);
    result.theme = {
      bodyBg: "unknown",
      bodyColor: "unknown",
      fontFamilies: [],
      palette: [],
      tags: ["unknown-theme"],
    };
    result.ui = {
      tags: ["fallback-ui"],
      signals: {},
    };
    result.motion = {
      tags: ["fallback-motion"],
      signals: {},
    };
    result.interaction = {
      logicTags: ["fallback-interaction"],
      summary: "fallback-interaction",
    };
  } finally {
    await desktopPage.close();
  }

  return result;
}

function buildMissingExternalAnalysis(candidate, resolution) {
  return {
    pageTitle: candidate.title || "",
    libsDetected: [],
    theme: { bodyBg: "unknown", bodyColor: "unknown", fontFamilies: [], palette: [], tags: ["missing-external-url"] },
    ui: { tags: ["missing-external-url"], signals: {} },
    motion: { tags: ["missing-external-url"], signals: {} },
    interaction: { logicTags: ["missing-external-url"], summary: "missing-external-url" },
    evidence: {
      screenshot: "",
      screenshotDesktop: "",
      screenshotMobile: "",
      finalUrl: null,
      finalUrlDesktop: null,
      finalUrlMobile: null,
      inputUrl: null,
      redirected: false,
      redirectedMobile: false,
      detailFallbackUsed: Boolean(resolution?.resolvedFromDetail),
      detailResolution: resolution?.detailResolution || null,
    },
    notes: ["external-url-not-found"],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const inPath = path.resolve(String(args.in || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.raw.json")));
  const outPath = path.resolve(String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "candidates.analyzed.json")));
  const screenshotDir = path.resolve(
    String(args["screenshot-dir"] || path.join(process.cwd(), "output", "awwwards-design-selector", "screenshots"))
  );

  if (!fs.existsSync(inPath)) {
    throw new Error(`Input file not found: ${toPosix(inPath)}`);
  }

  const rawPayload = readJson(inPath);
  const rawCandidates = normalizeCandidates(rawPayload);

  const browser = await chromium.launch({ headless: true });
  const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    userAgent: IPHONE_UA,
  });

  const analyzed = [];
  try {
    for (const candidate of rawCandidates) {
      let externalUrl = candidate.externalUrl || null;
      const resolution = {
        resolvedFromDetail: false,
        detailResolution: null,
      };

      if (!externalUrl && candidate.detailUrl) {
        const detailResolution = await resolveExternalFromDetail(desktopContext, candidate.detailUrl);
        resolution.detailResolution = {
          detailUrlVisited: detailResolution.detailUrlVisited,
          note: detailResolution.note,
          candidates: detailResolution.candidates,
        };
        if (detailResolution.externalUrl) {
          externalUrl = detailResolution.externalUrl;
          resolution.resolvedFromDetail = true;
        }
      }

      let analysis;
      if (externalUrl) {
        analysis = await analyzeExternalPage(
          {
            desktop: desktopContext,
            mobile: mobileContext,
          },
          candidate,
          screenshotDir,
          externalUrl,
          resolution
        );
        if (resolution.resolvedFromDetail) {
          analysis.notes.push("external-url-resolved-from-detail");
        }
      } else {
        analysis = buildMissingExternalAnalysis(candidate, resolution);
      }

      analyzed.push({
        id: candidate.id,
        title: candidate.title,
        detailUrl: candidate.detailUrl,
        externalUrl,
        awardTags: candidate.awardTags || [],
        awardType: candidate.awardType || null,
        score: candidate.score || null,
        freshnessDate: candidate.freshnessDate || null,
        analysis,
      });

      console.log(`Analyzed: ${candidate.id} (${externalUrl ? "external" : "missing-external"})`);
    }
  } finally {
    await desktopContext.close();
    await mobileContext.close();
    await browser.close();
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    input: toPosix(inPath),
    count: analyzed.length,
    items: analyzed,
  };

  writeJson(outPath, payload);
  console.log(`Saved analyzed candidates: ${toPosix(outPath)}`);
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exit(1);
});
