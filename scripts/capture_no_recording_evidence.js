#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function toPosix(p) {
  return p.replaceAll("\\", "/");
}

function sanitizeName(input, fallback = "site") {
  const clean = String(input || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return clean || fallback;
}

function changedKeys(before, after) {
  const keys = Object.keys({ ...(before || {}), ...(after || {}) });
  return keys.filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
}

async function sampleElementState(handle) {
  return handle.evaluate((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      className: String(el.className || "").trim().slice(0, 160) || null,
      ariaExpanded: el.getAttribute("aria-expanded"),
      ariaPressed: el.getAttribute("aria-pressed"),
      rect: {
        x: Number(rect.x.toFixed(2)),
        y: Number(rect.y.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
      },
      styles: {
        opacity: style.opacity,
        transform: style.transform,
        filter: style.filter,
        backgroundColor: style.backgroundColor,
        color: style.color,
        borderColor: style.borderColor,
        clipPath: style.clipPath,
      },
    };
  });
}

function summarizeStateDelta(before, after) {
  const styleChanged = changedKeys(before?.styles || {}, after?.styles || {});
  const rectChanged = changedKeys(before?.rect || {}, after?.rect || {});
  const attrChanged = changedKeys(
    {
      ariaExpanded: before?.ariaExpanded ?? null,
      ariaPressed: before?.ariaPressed ?? null,
      className: before?.className ?? null,
    },
    {
      ariaExpanded: after?.ariaExpanded ?? null,
      ariaPressed: after?.ariaPressed ?? null,
      className: after?.className ?? null,
    }
  );

  return {
    styleChanged,
    rectChanged,
    attrChanged,
    visualResponse: styleChanged.length > 0 || rectChanged.length > 0 || attrChanged.length > 0,
  };
}

function classifyInteraction(meta, beforeNav, afterNav, motionEvidence) {
  const text = String(meta?.text || "").toLowerCase();
  const cls = String(meta?.className || "").toLowerCase();
  const href = String(meta?.href || "");

  let type = "generic-clickable";
  if (/menu|nav|toggle|drawer|overlay/.test(`${text} ${cls}`)) type = "menu-toggle";
  else if (href.startsWith("#") || /anchor|chapter/.test(cls)) type = "anchor-navigation";
  else if (/submit|send|apply|contact|consult|form/.test(`${text} ${cls}`)) type = "form-cta";
  else if (/card|tile|feature|story|research|panel/.test(cls)) type = "content-card";
  else if (meta?.tag === "button" || meta?.role === "button") type = "button-cta";

  const outcomes = [];
  if ((afterNav?.url || "") !== (beforeNav?.url || "")) outcomes.push("url-change");
  if ((afterNav?.hash || "") !== (beforeNav?.hash || "")) outcomes.push("hash-change");
  if (Math.abs(Number(afterNav?.y || 0) - Number(beforeNav?.y || 0)) > 30) outcomes.push("scroll-shift");
  if (motionEvidence?.visualResponse) outcomes.push("visual-feedback");
  if ((motionEvidence?.shortDelta?.attrChanged || []).length || (motionEvidence?.longDelta?.attrChanged || []).length) {
    outcomes.push("state-toggle");
  }
  if (!outcomes.length) outcomes.push("no-visible-feedback");

  return {
    type,
    outcomes,
  };
}

async function safeCaptureElementFrame(handle, page, filePath) {
  try {
    await handle.screenshot({ path: filePath });
    return { file: toPosix(filePath), mode: "element" };
  } catch {
    await page.screenshot({ path: filePath, fullPage: false });
    return { file: toPosix(filePath), mode: "viewport-fallback" };
  }
}

function deriveSiteId(url, explicit) {
  if (explicit) return sanitizeName(explicit, "site");
  try {
    const u = new URL(url);
    const host = sanitizeName(u.hostname.replace(/^www\./, ""), "site");
    const slug = sanitizeName(u.pathname.split("/").filter(Boolean).slice(0, 2).join("-"), "home");
    return `${host}-${slug}`;
  } catch {
    return "site-home";
  }
}

async function collectRedirectChain(response) {
  if (!response) return [];
  const chain = [];
  let req = response.request();
  const stack = [];
  while (req) {
    stack.unshift(req);
    req = req.redirectedFrom();
  }
  for (const item of stack) {
    const res = await item.response();
    chain.push({
      url: item.url(),
      method: item.method(),
      status: res ? res.status() : null,
    });
  }
  return chain;
}

async function collectDomAndMotionSnapshot(page) {
  return page.evaluate(() => {
    const sections = Array.from(document.querySelectorAll("section, main > div, [data-section]"))
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: String(el.className || "").trim().slice(0, 120) || null,
        textSample: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 80),
      }));

    const classFreq = new Map();
    document.querySelectorAll("[class]").forEach((el) => {
      String(el.className || "")
        .split(/\s+/)
        .map((c) => c.trim())
        .filter(Boolean)
        .forEach((c) => classFreq.set(c, (classFreq.get(c) || 0) + 1));
    });
    const classFrequency = Array.from(classFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([name, count]) => ({ name, count }));

    const elements = Array.from(document.querySelectorAll("body *")).slice(0, 2400);
    const fontFreq = new Map();
    const colorFreq = new Map();
    const bgFreq = new Map();
    let transitionNodes = 0;
    let animationNodes = 0;
    let stickyNodes = 0;

    for (const el of elements) {
      const s = window.getComputedStyle(el);
      const font = String(s.fontFamily || "").split(",")[0].replace(/['"]/g, "").trim();
      if (font) fontFreq.set(font, (fontFreq.get(font) || 0) + 1);

      const color = String(s.color || "").trim();
      if (color && color !== "rgba(0, 0, 0, 0)") colorFreq.set(color, (colorFreq.get(color) || 0) + 1);

      const bg = String(s.backgroundColor || "").trim();
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") bgFreq.set(bg, (bgFreq.get(bg) || 0) + 1);

      if ((s.transitionDuration && s.transitionDuration !== "0s") || (s.transitionProperty && s.transitionProperty !== "all")) {
        transitionNodes += 1;
      }
      if (s.animationName && s.animationName !== "none") animationNodes += 1;
      if (s.position === "sticky" || s.position === "fixed") stickyNodes += 1;
    }

    const fonts = Array.from(fontFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));
    const textColors = Array.from(colorFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([color, count]) => ({ color, count }));
    const backgroundColors = Array.from(bgFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([color, count]) => ({ color, count }));

    let keyframesCount = 0;
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of Array.from(rules || [])) {
        if (rule.type === CSSRule.KEYFRAMES_RULE) keyframesCount += 1;
      }
    }

    const scriptSources = Array.from(document.scripts)
      .map((s) => s.src || "")
      .filter(Boolean)
      .slice(0, 120);
    const inlineScriptHints = Array.from(document.scripts)
      .map((s) => (s.src ? "" : s.textContent || ""))
      .join("\n")
      .toLowerCase()
      .slice(0, 24000);
    const scriptJoined = `${scriptSources.join(" ")} ${inlineScriptHints}`.toLowerCase();
    const detectedLibraries = [
      "gsap",
      "lenis",
      "locomotive",
      "three",
      "barba",
      "swiper",
      "framer",
      "anime",
      "scrolltrigger",
    ].filter((name) => scriptJoined.includes(name));

    const globalLibraries = [
      "gsap",
      "ScrollTrigger",
      "Lenis",
      "LocomotiveScroll",
      "Swiper",
      "THREE",
      "barba",
      "anime",
      "framerMotion",
    ].filter((name) => typeof window[name] !== "undefined");

    const scrollCandidates = Array.from(
      document.querySelectorAll(
        "section, article, [data-scroll], [data-scroll-anim], [class*='story'], [class*='panel'], [class*='marquee'], [class*='hero']"
      )
    )
      .filter((el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 40 && r.height > 40;
      })
      .slice(0, 30);

    const scrollTimelineHints = {
      stickyCandidates: scrollCandidates.filter((el) => {
        const s = window.getComputedStyle(el);
        return s.position === "sticky" || s.position === "fixed";
      }).length,
      transformResponsiveCandidates: scrollCandidates.filter((el) => {
        const s = window.getComputedStyle(el);
        return s.transform !== "none" || s.willChange.includes("transform");
      }).length,
      opacityResponsiveCandidates: scrollCandidates.filter((el) => {
        const s = window.getComputedStyle(el);
        return Number(s.opacity) < 1 || s.transitionProperty.includes("opacity");
      }).length,
      marqueeCandidates: document.querySelectorAll(".marquee, .ticker, [class*='marquee']").length,
      scrollKeywordClasses: Array.from(document.querySelectorAll("[class]"))
        .flatMap((el) => String(el.className || "").split(/\s+/))
        .filter((name) => /scroll|pin|parallax|sticky|reveal|trigger|progress/i.test(name))
        .slice(0, 40),
    };

    return {
      finalUrl: location.href,
      title: document.title || "",
      sections,
      classFrequency,
      typography: { fonts, textColors, backgroundColors },
      motionHints: {
        keyframesCount,
        transitionNodes,
        animationNodes,
        stickyOrFixedNodes: stickyNodes,
        detectedLibraries,
        globalLibraries,
        scriptSources,
        inlineScriptHints: inlineScriptHints.slice(0, 4000),
        scrollTimelineHints,
      },
    };
  });
}

async function captureScrollTimeline(page, outDir, prefix, frameCount) {
  ensureDir(outDir);
  const files = [];
  const maxY = await page.evaluate(() => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
  const count = Math.max(3, frameCount);
  for (let i = 0; i < count; i += 1) {
    const ratio = count === 1 ? 0 : i / (count - 1);
    const y = Math.round(maxY * ratio);
    await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
    await page.waitForTimeout(160);
    const name = `${prefix}-scroll-${String(i + 1).padStart(2, "0")}.png`;
    const fullPath = path.join(outDir, name);
    await page.screenshot({ path: fullPath, fullPage: false });
    files.push({
      kind: "scroll-frame",
      viewport: prefix,
      y,
      file: toPosix(fullPath),
    });
  }
  return files;
}

async function captureInteractionStates(page, outDir) {
  ensureDir(outDir);
  const captures = [];
  const handles = await page.$$("a, button, [role='button'], .menu-btn, .nav-toggle, .card, .feature-card");
  let hoverCount = 0;
  let clickCount = 0;

  for (const handle of handles) {
    if (hoverCount >= 6 && clickCount >= 4) break;
    const box = await handle.boundingBox();
    if (!box || box.width < 8 || box.height < 8) continue;

    const meta = await handle.evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      className: String(el.className || "").trim().slice(0, 120) || null,
      href: el.getAttribute("href") || null,
      role: el.getAttribute("role") || null,
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
    }));

    if (hoverCount < 6) {
      const hoverBefore = await sampleElementState(handle);
      try {
        await handle.hover({ timeout: 2000 });
        await page.waitForTimeout(120);
        const hoverAfter = await sampleElementState(handle);
        const hoverPath = path.join(outDir, `hover-${String(hoverCount + 1).padStart(2, "0")}.png`);
        await page.screenshot({ path: hoverPath, fullPage: false });
        captures.push({
          kind: "hover",
          meta,
          delta: summarizeStateDelta(hoverBefore, hoverAfter),
          file: toPosix(hoverPath),
        });
        hoverCount += 1;
      } catch {
        // Skip unstable target and continue collecting other interaction states.
      }
    }

    const clickable =
      meta.tag === "button" ||
      meta.role === "button" ||
      (meta.href && meta.href.startsWith("#")) ||
      /menu|nav|toggle/i.test(`${meta.className || ""} ${meta.text || ""}`);

    if (clickable && clickCount < 4) {
      const before = await page.evaluate(() => ({ url: location.href, hash: location.hash, y: window.scrollY }));
      const clickBefore = await sampleElementState(handle);
      const clickBase = String(clickCount + 1).padStart(2, "0");
      const beforeFrame = await safeCaptureElementFrame(handle, page, path.join(outDir, `click-${clickBase}-before.png`));
      try {
        await handle.click({ timeout: 2000 });
        await page.waitForTimeout(90);
      } catch {
        continue;
      }
      const afterShort = await sampleElementState(handle).catch(() => null);
      const shortFrame = await safeCaptureElementFrame(handle, page, path.join(outDir, `click-${clickBase}-after-short.png`));
      await page.waitForTimeout(260);
      const afterLong = await sampleElementState(handle).catch(() => null);
      const longFrame = await safeCaptureElementFrame(handle, page, path.join(outDir, `click-${clickBase}-after-long.png`));
      const after = await page.evaluate(() => ({ url: location.href, hash: location.hash, y: window.scrollY }));
      const clickPath = path.join(outDir, `click-${clickBase}.png`);
      await page.screenshot({ path: clickPath, fullPage: false });
      const shortDelta = summarizeStateDelta(clickBefore, afterShort);
      const longDelta = summarizeStateDelta(clickBefore, afterLong);
      const motionEvidence = {
        shortDelta,
        longDelta,
        visualResponse: shortDelta.visualResponse || longDelta.visualResponse,
      };
      const classification = classifyInteraction(meta, before, after, motionEvidence);
      captures.push({
        kind: "click",
        meta,
        before,
        after,
        classification,
        motionEvidence,
        frameFiles: [beforeFrame.file, shortFrame.file, longFrame.file],
        frameModes: [beforeFrame.mode, shortFrame.mode, longFrame.mode],
        file: toPosix(clickPath),
      });
      clickCount += 1;
    }
  }

  if (captures.length < 3) {
    const fallbackTargets = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll("a, button, [role='button']"));
      const result = [];
      for (const el of nodes) {
        if (result.length >= 6) break;
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) <= 0) continue;
        if (r.width < 8 || r.height < 8) continue;
        if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) continue;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40);
        result.push({
          x: Math.max(4, Math.min(window.innerWidth - 4, r.left + Math.min(r.width / 2, 24))),
          y: Math.max(4, Math.min(window.innerHeight - 4, r.top + Math.min(r.height / 2, 16))),
          tag: el.tagName.toLowerCase(),
          href: el.getAttribute("href") || null,
          text,
        });
      }
      return result;
    });

    for (const target of fallbackTargets) {
      if (captures.length >= 6) break;
      try {
        await page.mouse.move(target.x, target.y);
        await page.waitForTimeout(120);
        const hoverPath = path.join(outDir, `fallback-hover-${String(captures.length + 1).padStart(2, "0")}.png`);
        await page.screenshot({ path: hoverPath, fullPage: false });
        captures.push({
          kind: "hover-fallback",
          meta: target,
          file: toPosix(hoverPath),
        });
      } catch {
        // ignore and continue fallback targets
      }
    }
  }

  return captures;
}

async function run() {
  const args = parseArgs(process.argv);
  const targetUrl = String(args.url || "").trim();
  if (!targetUrl) throw new Error("Missing required --url");

  const outRoot = path.resolve(
    String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "reference-evidence"))
  );
  const siteId = deriveSiteId(targetUrl, args["site-id"] ? String(args["site-id"]) : "");
  const frameCount = Math.max(4, Number(args.frames || 10));
  const outDir = path.join(outRoot, siteId);
  ensureDir(outDir);

  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await desktop.newPage();

  const runData = {
    generatedAt: new Date().toISOString(),
    inputUrl: targetUrl,
    siteId,
    outputDir: toPosix(outDir),
    redirects: [],
    desktop: {},
    mobile: {},
    domAndMotion: {},
    interactionSummary: {},
    files: [],
  };

  try {
    const response = await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2400);
    runData.redirects = await collectRedirectChain(response);

    const desktopFull = path.join(outDir, "desktop-fullpage.png");
    await page.screenshot({ path: desktopFull, fullPage: true });
    runData.files.push(toPosix(desktopFull));

    const timelineDir = path.join(outDir, "timeline");
    const desktopTimeline = await captureScrollTimeline(page, timelineDir, "desktop", frameCount);
    runData.desktop.timeline = desktopTimeline;
    runData.files.push(...desktopTimeline.map((f) => f.file));

    const interactionDir = path.join(outDir, "interactions");
    const interactions = await captureInteractionStates(page, interactionDir);
    runData.desktop.interactions = interactions;
    runData.files.push(...interactions.map((f) => f.file));
    runData.files.push(...interactions.flatMap((f) => f.frameFiles || []));
    const clickInteractions = interactions.filter((item) => item.kind === "click");
    const clickTypeCounts = {};
    const clickOutcomeCounts = {};
    for (const item of clickInteractions) {
      const type = item.classification?.type || "generic-clickable";
      clickTypeCounts[type] = (clickTypeCounts[type] || 0) + 1;
      for (const outcome of item.classification?.outcomes || []) {
        clickOutcomeCounts[outcome] = (clickOutcomeCounts[outcome] || 0) + 1;
      }
    }
    runData.interactionSummary = {
      hoverCaptures: interactions.filter((item) => String(item.kind).startsWith("hover")).length,
      clickCaptures: interactions.filter((item) => item.kind === "click").length,
      clickMotionResponses: interactions.filter((item) => item.kind === "click" && item.motionEvidence?.visualResponse).length,
      clickInteractionTypes: clickTypeCounts,
      clickOutcomeSummary: clickOutcomeCounts,
    };

    runData.domAndMotion = await collectDomAndMotionSnapshot(page);
    runData.desktop.finalUrl = runData.domAndMotion.finalUrl || page.url();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mobilePage = await mobile.newPage();
    await mobilePage.goto(runData.desktop.finalUrl || targetUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await mobilePage.waitForTimeout(1600);

    const mobileFull = path.join(outDir, "mobile-fullpage.png");
    await mobilePage.screenshot({ path: mobileFull, fullPage: true });
    runData.files.push(toPosix(mobileFull));
    runData.mobile.timeline = await captureScrollTimeline(mobilePage, timelineDir, "mobile", Math.max(5, Math.floor(frameCount * 0.7)));
    runData.files.push(...runData.mobile.timeline.map((f) => f.file));

    await mobile.close();
  } finally {
    await desktop.close();
    await browser.close();
  }

  const reportPath = path.join(outDir, "evidence.json");
  fs.writeFileSync(reportPath, `${JSON.stringify(runData, null, 2)}\n`, "utf8");
  console.log(`No-recording evidence captured: ${toPosix(reportPath)}`);
}

run().catch((error) => {
  console.error(String(error.stack || error));
  process.exit(1);
});
