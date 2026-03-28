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

function pct(v, t) {
  return t ? Number(((v / t) * 100).toFixed(2)) : 0;
}

function toPosix(p) {
  return p.replaceAll("\\", "/");
}

function sourceIncludesAny(source, patterns) {
  return patterns.some((pattern) => pattern.test(source));
}

async function sampleLocatorState(locator) {
  return locator.evaluate((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return {
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

function compareLocatorState(before, after) {
  const changed = [];
  for (const group of ["styles", "rect"]) {
    const keys = Object.keys({ ...(before?.[group] || {}), ...(after?.[group] || {}) });
    for (const key of keys) {
      if (JSON.stringify(before?.[group]?.[key] ?? null) !== JSON.stringify(after?.[group]?.[key] ?? null)) {
        changed.push(`${group}.${key}`);
      }
    }
  }

  ["className", "ariaExpanded", "ariaPressed"].forEach((key) => {
    if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)) changed.push(key);
  });

  return changed;
}

function mustContainAny(text, patternGroups) {
  let hit = 0;
  const missing = [];
  for (const group of patternGroups) {
    const ok = group.some((p) => text.includes(p));
    if (ok) hit += 1;
    else missing.push(group.join(" | "));
  }
  return { hit, total: patternGroups.length, missing };
}

function resolvePageUrl(pageDir, pageUrlArg) {
  if (pageUrlArg) {
    if (/^https?:\/\//i.test(pageUrlArg)) return pageUrlArg;
    if (/^file:\/\//i.test(pageUrlArg)) return pageUrlArg;
  }
  const indexPath = path.resolve(pageDir, "index.html");
  const normalized = indexPath.replaceAll("\\", "/");
  return `file:///${normalized}`;
}

function navAliasTable() {
  return {
    about: ["about", "\u5173\u4e8e"],
    services: ["services", "\u670d\u52a1"],
    work: ["work", "\u6848\u4f8b"],
    "see featured": ["see featured", "\u67e5\u770b\u7cbe\u9009", "\u7cbe\u9009"],
    "see index": ["see index", "\u7d22\u5f15", "index"],
    "news & views": ["news & views", "\u65b0\u95fb\u4e0e\u89c2\u70b9", "\u52a8\u6001"],
    contact: ["contact", "\u8054\u7cfb"],
  };
}

function navAliasTableForProfile(profileName) {
  const base = navAliasTable();
  if (profileName !== "gq") return base;
  return {
    about: ["about", "\u5173\u4e8e"],
    narrative: ["narrative", "\u53d9\u4e8b", "\u7ae0\u8282"],
    research: ["research", "\u79d1\u7814"],
    index: ["index", "\u6307\u6570", "\u5173\u952e"],
    stories: ["stories", "\u6821\u56ed", "\u73b0\u573a"],
    contact: ["contact", "\u8054\u7cfb", "\u7533\u8bf7"],
  };
}

function profileConfig(profileName) {
  if (profileName === "gq") {
    return {
      componentGroups: [
        ["topbar", "header class=\"topbar\""],
        ["overlay-menu", "menu-toggle"],
        ["hero__media", "section class=\"hero\""],
        ["chapter-intro"],
        ["section class=\"narrative\"", "story sticky-block"],
        ["research-grid", "research-card"],
        ["index-strip", "marquee__track"],
        ["story-gallery", "story-tile"],
        ["contact-form", "section class=\"contact\""],
        ["preloader"],
        ["cursor"],
      ],
      motionGroups: [
        ["@keyframes", "ticker"],
        ["IntersectionObserver"],
        ["transform"],
        ["transition"],
        ["click", "pointerdown", "is-pressed", "ripple"],
        ["parallax", "translateY"],
        ["marquee", "ticker"],
        ["preloader"],
        ["scrolltrigger", "gsap", "timeline", "scrub", "pin"],
        ["split-lines", "data-split"],
      ],
    };
  }

  return {
    componentGroups: [
      ["overlay-nav"],
      ["hero-video"],
      ["service-strip", "services"],
      ["featured-track"],
      ["client-grid"],
      ["index-grid", "index-table", "section class=\"index\""],
      ["marquee-track"],
      ["contact-modal"],
      ["menu-btn"],
      ["cursor"],
      ["scrollbar"],
      ["clone-link"],
      ["split-words", "split-lines"],
    ],
    motionGroups: [
      ["@keyframes"],
      ["IntersectionObserver"],
      ["transform"],
      ["transition"],
      ["click", "pointerdown", "is-pressed", "ripple"],
      ["parallax"],
      ["clip-path"],
      ["marquee"],
      ["preloader"],
      ["scrolltrigger", "gsap", "timeline", "scrub", "pin"],
      ["splitWords", "splitLines"],
      ["scrollThumb"],
    ],
  };
}

function extractIntentTokens(raw) {
  const sanitizeToken = (value) =>
    String(value || "")
      .replace(/[\u0000-\u001F"\\]/g, "")
      .trim();

  const base = String(raw || "")
    .toLowerCase()
    .split(/[,\s\u3001\uFF0C;|/\\]+/)
    .map((s) => sanitizeToken(s))
    .filter((s) => s.length >= 2);

  const zhAlias = [
    { zh: "\u6b66\u6c49\u5927\u5b66", aliases: ["whu", "wuhan", "wuhan university", "university", "campus"] },
    { zh: "\u6b66\u6c49", aliases: ["wuhan"] },
    { zh: "\u5927\u5b66", aliases: ["university", "campus"] },
    { zh: "\u6821\u56ed", aliases: ["campus"] },
    { zh: "\u5ba3\u4f20", aliases: ["campaign", "promo"] },
    { zh: "\u535a\u7269\u9986", aliases: ["museum"] },
    { zh: "\u79d1\u6280", aliases: ["tech", "technology"] },
  ];

  const out = new Set(base);
  for (const token of base) {
    for (const row of zhAlias) {
      if (token.includes(row.zh)) {
        for (const alias of row.aliases) out.add(sanitizeToken(alias));
      }
    }
  }
  return Array.from(out)
    .map((s) => sanitizeToken(s))
    .filter((s) => s.length >= 2)
    .slice(0, 16);
}

function mediaEntryText(entry) {
  return [
    entry?.name,
    entry?.source,
    entry?.file,
    entry?.url,
    entry?.finalUrl,
    entry?.sourceType,
    entry?.kind,
    entry?.title,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesIntentMedia(entry, intentTokens) {
  const hay = mediaEntryText(entry);
  if (!hay) return false;
  if (hay.includes("intent")) return true;
  return intentTokens.some((token) => hay.includes(token));
}

function analyzeScrollEngineCompatibility(html, css, js, scrollStats) {
  const source = `${html}\n${css}\n${js}`.toLowerCase();
  const cssLower = css.toLowerCase();
  const jsLower = js.toLowerCase();

  const hasThirdPartyEngine = /(lenis|locomotive|asscroll)/.test(source);
  const hasNativeSmoothScroll = /scroll-behavior\s*:\s*smooth/.test(cssLower) || /scroll-behavior\s*:\s*smooth/.test(source);

  const hasScrollTrigger = /scrolltrigger/.test(source);
  const hasPinUsage = /pin\s*:\s*true|\.pin\(/.test(source);
  const hasLenis = /lenis/.test(source);
  const hasLenisSync =
    /lenis\.on\(\s*['"]scroll['"][\s\S]{0,220}scrolltrigger\.update/.test(jsLower) ||
    /scrolltrigger\.update\(\)[\s\S]{0,220}lenis\.raf/.test(jsLower);

  const conflicts = [];
  if (hasThirdPartyEngine && hasNativeSmoothScroll) conflicts.push("native-smooth-scroll-conflict");
  if (hasLenis && hasScrollTrigger && hasPinUsage && !hasLenisSync) conflicts.push("lenis-scrolltrigger-sync-missing");
  if ((hasThirdPartyEngine || hasScrollTrigger) && scrollStats.overlayProbeAvailable && scrollStats.overlayToggleOk === false) {
    conflicts.push("overlay-scroll-dead-zone");
  }
  if ((hasPinUsage || hasScrollTrigger) && scrollStats.pinProbeAvailable && scrollStats.pinProxyOk === false) {
    conflicts.push("pin-proxy-runtime-failed");
  }

  return {
    hasThirdPartyEngine,
    hasNativeSmoothScroll,
    hasScrollTrigger,
    hasPinUsage,
    hasLenis,
    hasLenisSync,
    runtime: {
      overlayProbeAvailable: scrollStats.overlayProbeAvailable,
      overlayToggleOk: scrollStats.overlayToggleOk,
      pinProbeAvailable: scrollStats.pinProbeAvailable,
      pinProxyOk: scrollStats.pinProxyOk,
    },
    conflicts,
    pass: conflicts.length === 0,
  };
}

async function analyzeRuntime(pageUrl, artifactsDir) {
  const browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1512, height: 982 } });
  const page = await desktop.newPage();

  const warnings = [];
  let runtime = null;

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(2200);

    const screenshotPath = path.join(artifactsDir, "runtime-fullpage.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });

    const scrollStats = {
      wheelOk: false,
      trackpadProxyOk: false,
      touchProxyOk: false,
      overlayProbeAvailable: false,
      overlayToggleOk: null,
      pinProbeAvailable: false,
      pinProxyOk: null,
    };
    const startY = await page.evaluate(() => window.scrollY);

    for (let i = 0; i < 7; i += 1) {
      await page.mouse.wheel(0, 900);
      await page.waitForTimeout(80);
    }
    const afterWheel = await page.evaluate(() => window.scrollY);
    scrollStats.wheelOk = afterWheel > startY + 50;

    await page.evaluate(() => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const safeY = Math.max(0, maxY - 1200);
      if (window.scrollY > safeY) window.scrollTo(0, safeY);
    });
    await page.waitForTimeout(120);

    const trackpadStart = await page.evaluate(() => window.scrollY);
    const trackpadTrace = [trackpadStart];
    for (let i = 0; i < 18; i += 1) {
      await page.mouse.wheel(0, 72);
      await page.waitForTimeout(35);
      trackpadTrace.push(await page.evaluate(() => window.scrollY));
    }

    const trackpadDeltas = [];
    for (let i = 1; i < trackpadTrace.length; i += 1) {
      trackpadDeltas.push(trackpadTrace[i] - trackpadTrace[i - 1]);
    }
    const progressiveSteps = trackpadDeltas.filter((d) => d > 0.8).length;
    const lockSteps = trackpadDeltas.filter((d) => d <= 0.2).length;
    const trackpadEnd = trackpadTrace[trackpadTrace.length - 1] || trackpadStart;
    scrollStats.trackpadProxyOk =
      trackpadEnd > trackpadStart + 70 &&
      progressiveSteps >= Math.ceil(trackpadDeltas.length * 0.55) &&
      lockSteps <= Math.floor(trackpadDeltas.length * 0.45);

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mpage = await mobile.newPage();
    await mpage.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await mpage.waitForTimeout(1200);
    const touchRes = await mpage.evaluate(async () => {
      const start = window.scrollY;
      for (let i = 0; i < 8; i += 1) {
        window.scrollBy(0, 120);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      return { start, end: window.scrollY };
    });
    scrollStats.touchProxyOk = touchRes.end > touchRes.start + 20;
    await mobile.close();

    const interactionTargets = page.locator("a, button, .feature-card, .client-item, .service-item");
    const targetCount = await interactionTargets.count();
    let hovered = 0;
    for (let i = 0; i < targetCount && hovered < 3; i += 1) {
      const h = interactionTargets.nth(i);
      const box = await h.boundingBox();
      if (!box || box.width < 4 || box.height < 4) continue;
      await h.hover({ timeout: 2000 });
      hovered += 1;
      await page.waitForTimeout(60);
    }

    const clickTargets = page.locator(
      "button, [role='button'], .menu-toggle, .hero-link, .story-tile, .research-card, [data-click-anim], .cta"
    );
    const clickTargetCount = await clickTargets.count();
    const clickInteractions = {
      testedCount: 0,
      responsiveCount: 0,
      samples: [],
    };

    for (let i = 0; i < clickTargetCount && clickInteractions.testedCount < 5; i += 1) {
      const target = clickTargets.nth(i);
      const box = await target.boundingBox();
      if (!box || box.width < 6 || box.height < 6) continue;

      let before;
      try {
        before = await sampleLocatorState(target);
      } catch {
        continue;
      }

      try {
        await target.click({ timeout: 2500 });
        await page.waitForTimeout(100);
      } catch {
        continue;
      }

      let afterShort = null;
      let afterLong = null;
      try {
        afterShort = await sampleLocatorState(target);
        await page.waitForTimeout(220);
        afterLong = await sampleLocatorState(target);
      } catch {
        // Element may disappear during click choreography.
      }

      const deltaShort = compareLocatorState(before, afterShort);
      const deltaLong = compareLocatorState(before, afterLong);
      const responsive = deltaShort.length > 0 || deltaLong.length > 0;

      clickInteractions.testedCount += 1;
      if (responsive) clickInteractions.responsiveCount += 1;
      clickInteractions.samples.push({
        responsive,
        deltaShort,
        deltaLong,
      });
    }

    const linkTargets = page.locator('a[href^="#"]');
    const linkCount = await linkTargets.count();
    let clickedLinks = 0;
    for (let i = 0; i < linkCount && clickedLinks < 2; i += 1) {
      const l = linkTargets.nth(i);
      const before = await page.evaluate(() => ({ y: window.scrollY, hash: location.hash }));
      try {
        await l.click({ timeout: 2500 });
        await page.waitForTimeout(150);
      } catch {
        continue;
      }
      const after = await page.evaluate(() => ({ y: window.scrollY, hash: location.hash }));
      if (after.y !== before.y || after.hash !== before.hash) clickedLinks += 1;
    }

    const overlayProbe = await page.evaluate(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const overlayEls = Array.from(
        document.querySelectorAll(".overlay-nav, .menu-overlay, .nav-overlay, [data-overlay], [class*='drawer'], [class*='offcanvas']")
      );
      if (!overlayEls.length) return { available: false, ok: null };

      const toggles = Array.from(
        document.querySelectorAll(
          ".menu-btn, .nav-toggle, [data-menu-toggle], [aria-controls*='menu' i], button[class*='menu'], button[class*='nav']"
        )
      ).filter((el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 8 && r.height > 8;
      });
      if (!toggles.length) return { available: false, ok: null };
      const toggle = toggles[0];

      const anyVisibleOverlay = () =>
        overlayEls.some((el) => {
          const s = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05 && r.width > 16 && r.height > 16;
        });

      window.scrollTo(0, 120);
      await wait(120);
      const before = window.scrollY;
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await wait(260);
      const opened = anyVisibleOverlay();

      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await wait(260);
      const closed = !anyVisibleOverlay();

      for (let i = 0; i < 6; i += 1) {
        window.scrollBy(0, 120);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const afterCloseScroll = window.scrollY;
      const moved = afterCloseScroll > before + 40;
      return {
        available: true,
        opened,
        closed,
        moved,
        ok: moved && (!opened || closed),
      };
    });
    scrollStats.overlayProbeAvailable = overlayProbe.available;
    scrollStats.overlayToggleOk = overlayProbe.available ? overlayProbe.ok : null;

    const pinProbe = await page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const candidates = Array.from(document.querySelectorAll("*")).filter((el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return (s.position === "sticky" || s.position === "fixed") && r.width > 80 && r.height > 24;
      });
      if (!candidates.length) return { available: false, ok: null, candidates: 0 };

      const top = (el) => el.getBoundingClientRect().top;
      const sample = candidates.slice(0, 6);
      const beforeY = window.scrollY;
      const p0 = sample.map(top);
      window.scrollBy(0, 220);
      await waitFrame();
      await waitFrame();
      const p1 = sample.map(top);
      window.scrollBy(0, 220);
      await waitFrame();
      await waitFrame();
      const p2 = sample.map(top);
      const endY = window.scrollY;

      const stable = p0
        .map((_, idx) => Math.abs(p1[idx] - p0[idx]) < 28 && Math.abs(p2[idx] - p1[idx]) < 28)
        .filter(Boolean).length;

      return {
        available: true,
        candidates: sample.length,
        moved: endY > beforeY + 120,
        stable,
        ok: endY > beforeY + 120 && stable >= 1,
      };
    });
    scrollStats.pinProbeAvailable = pinProbe.available;
    scrollStats.pinProxyOk = pinProbe.available ? pinProbe.ok : null;

    const sectionLocator = page.locator("section, main > section, main > div, [data-section]");
    const sectionCount = await sectionLocator.count();
    const sectionDiagnostics = [];

    for (let i = 0; i < sectionCount; i += 1) {
      const sec = sectionLocator.nth(i);
      const bbox = await sec.boundingBox();
      if (!bbox || bbox.width < 80 || bbox.height < 80) continue;

      await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - window.innerHeight * 0.35)), bbox.y);
      await page.waitForTimeout(80);

      const info = await sec.evaluate((el) => {
        const parseColor = (v) => {
          const m = String(v || "").match(/rgba?\(([^)]+)\)/i);
          if (!m) return [255, 255, 255];
          const parts = m[1].split(",").map((s) => Number(String(s).trim()));
          return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
        };
        const colorDistance = (a, b) => {
          const dx = a[0] - b[0];
          const dy = a[1] - b[1];
          const dz = a[2] - b[2];
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        };

        const rect = el.getBoundingClientRect();
        const children = Array.from(el.querySelectorAll("*"));
        const visibleChildren = children.filter((c) => {
          const s = window.getComputedStyle(c);
          const r = c.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 1 && r.height > 1;
        }).length;

        let visibleTextNodes = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node || !node.textContent || !node.textContent.trim()) continue;
          const parent = node.parentElement;
          if (!parent) continue;
          const s = window.getComputedStyle(parent);
          const r = parent.getBoundingClientRect();
          if (s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 1 && r.height > 1) {
            visibleTextNodes += 1;
          }
        }

        const cx = Math.max(2, Math.min(window.innerWidth - 2, rect.left + rect.width / 2));
        const cy = Math.max(2, Math.min(window.innerHeight - 2, rect.top + rect.height / 2));
        const centerEl = document.elementFromPoint(cx, cy);

        const bodyBg = parseColor(window.getComputedStyle(document.body).backgroundColor);
        const centerBg = parseColor(centerEl ? window.getComputedStyle(centerEl).backgroundColor : "rgb(255,255,255)");
        const centerDiff = colorDistance(bodyBg, centerBg);

        const id = el.id || null;
        const cls = el.className ? String(el.className) : "";
        const tag = el.tagName.toLowerCase();

        return {
          id,
          cls,
          tag,
          visibleChildren,
          visibleTextNodes,
          centerDiff,
        };
      });

      sectionDiagnostics.push(info);
      if (info.visibleChildren < 1 || info.visibleTextNodes < 1 || (info.centerDiff < 5 && info.visibleTextNodes < 2)) {
        warnings.push(`EMPTY_SECTION_WARNING:${info.tag}${info.id ? `#${info.id}` : ""}`);
      }
    }

    const contentDensity = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll(
          "article, .card, .feature-card, .news-card, .client-item, .service-item, .index-item, .grid-item, li"
        )
      );
      const items = nodes.filter((el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 1 && r.height > 1;
      });

      let pass = 0;
      for (const el of items) {
        const classText = String(el.className || "").toLowerCase();
        const title = (el.querySelector("h1,h2,h3,h4,h5,h6,strong,b,.title")?.textContent || "").trim();
        const desc =
          (el.querySelector("p,.desc,.description,.summary,.meta")?.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const hasData = /\d|%|\+|\u5e74|\u9879|\u4f4d|\u4e07|\u5343/.test(text);
        const hasHeading = Boolean(el.querySelector("h1,h2,h3,h4,h5,h6,.title,strong,b"));

        const isChipLike =
          /service-item|client-item|chip|tag|badge|pill/.test(classText) ||
          (!hasHeading && !el.querySelector("p,.desc,.description,.summary") && text.length <= 48);

        if (isChipLike) {
          if (text.length >= 2) pass += 1;
          continue;
        }

        const isCardLike = /card|feature|news|index|article|panel|tile/.test(classText) || hasHeading;
        if (isCardLike) {
          if (title.length >= 2 && (desc.length >= 6 || hasData)) pass += 1;
          continue;
        }

        if (text.length >= 6 && (title.length >= 2 || desc.length >= 4 || hasData)) pass += 1;
      }

      return {
        total: items.length,
        pass,
      };
    });

    const scrollTimeline = await page.evaluate(async () => {
      const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const candidates = Array.from(
        document.querySelectorAll(
          "section, article, .story, .story__media img, .research-card, .story-tile, .marquee__track, [data-scroll], [data-scroll-anim]"
        )
      )
        .filter((el) => {
          const s = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && r.width > 40 && r.height > 40;
        })
        .slice(0, 18);

      const stateOf = (el) => {
        const s = window.getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          top: Number(r.top.toFixed(2)),
          opacity: Number((Number(s.opacity) || 0).toFixed(3)),
          transform: s.transform,
          position: s.position,
        };
      };

      const measure = async (scrollY) => {
        window.scrollTo(0, scrollY);
        await waitFrame();
        await waitFrame();
        return candidates.map((el) => stateOf(el));
      };

      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const start = await measure(0);
      const mid = await measure(maxY * 0.45);
      const end = await measure(maxY * 0.82);

      let reactiveCount = 0;
      let transformResponsiveCount = 0;
      let opacityResponsiveCount = 0;
      let stickyCount = 0;

      for (let i = 0; i < candidates.length; i += 1) {
        const a = start[i];
        const b = mid[i];
        const c = end[i];
        const topShift = Math.abs((b?.top ?? 0) - (a?.top ?? 0)) + Math.abs((c?.top ?? 0) - (b?.top ?? 0));
        const transformChanged = a?.transform !== b?.transform || b?.transform !== c?.transform;
        const opacityChanged = a?.opacity !== b?.opacity || b?.opacity !== c?.opacity;

        if (topShift > 24 || transformChanged || opacityChanged) reactiveCount += 1;
        if (transformChanged) transformResponsiveCount += 1;
        if (opacityChanged) opacityResponsiveCount += 1;
        if ([a?.position, b?.position, c?.position].includes("sticky") || [a?.position, b?.position, c?.position].includes("fixed")) {
          stickyCount += 1;
        }
      }

      return {
        candidateCount: candidates.length,
        reactiveCount,
        transformResponsiveCount,
        opacityResponsiveCount,
        stickyCount,
        marqueePresent: document.querySelectorAll(".marquee, .ticker, [class*='marquee']").length > 0,
        progressRailPresent: document.querySelectorAll("[class*='progress'], [class*='rail'], [class*='meter']").length > 0,
      };
    });

    runtime = {
      screenshotPath,
      scrollStats,
      hoveredTargets: hovered,
      clickInteractions,
      clickedNavLinks: clickedLinks,
      sectionDiagnostics,
      contentDensity,
      scrollTimeline,
      overlayProbe,
      pinProbe,
      smoke: {
        renderOk: true,
        scrollOk:
          scrollStats.wheelOk &&
          scrollStats.trackpadProxyOk &&
          scrollStats.touchProxyOk &&
          scrollStats.overlayToggleOk !== false,
        visualOk: warnings.length === 0,
        interactionOk: hovered >= 3,
        clickAnimationOk: clickInteractions.testedCount > 0 && clickInteractions.responsiveCount >= 1,
        linkOk: clickedLinks >= 2,
      },
    };
  } finally {
    await desktop.close();
    await browser.close();
  }

  return { runtime, warnings };
}

async function main() {
  const args = parseArgs(process.argv);
  const pageDir = path.resolve(String(args.page || "output/awwwards-design-selector/whu-promo-shed-hifi"));
  const pageUrlArg = args.url ? String(args.url) : "";
  const profileName = String(args.profile || "shed").toLowerCase();
  const config = profileConfig(profileName);
  const intentTokens = extractIntentTokens(args.intent ? String(args.intent) : "");
  const refPath = path.resolve(String(args.reference || "output/awwwards-design-selector/reference-shed-structure.json"));
  const mapPath = path.resolve(String(args.assets || path.join(pageDir, "assets-map.json")));
  const outPath = path.resolve(String(args.out || path.join(pageDir, "replica-fidelity-review.json")));
  const threshold = Number(args.threshold || 90);

  const htmlPath = path.join(pageDir, "index.html");
  const cssPath = path.join(pageDir, "styles.css");
  const jsPath = path.join(pageDir, "script.js");
  if (!fs.existsSync(htmlPath) || !fs.existsSync(cssPath) || !fs.existsSync(jsPath)) {
    throw new Error("Missing index.html/styles.css/script.js in page folder");
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  const css = fs.readFileSync(cssPath, "utf8");
  const js = fs.readFileSync(jsPath, "utf8");
  const ref = fs.existsSync(refPath) ? JSON.parse(fs.readFileSync(refPath, "utf8")) : null;
  const assetMap = fs.existsSync(mapPath) ? JSON.parse(fs.readFileSync(mapPath, "utf8")) : [];

  const pageUrl = resolvePageUrl(pageDir, pageUrlArg);
  const { runtime, warnings } = await analyzeRuntime(pageUrl, pageDir);

  const componentCheck = mustContainAny(html, config.componentGroups);
  const motionCheck = mustContainAny(`${css}\n${js}`, config.motionGroups);
  const scrollEngineCompatibility = analyzeScrollEngineCompatibility(html, css, js, runtime.scrollStats);

  const aliasMap = navAliasTableForProfile(profileName);
  const refNav = ref && Array.isArray(ref.nav) ? ref.nav : [];
  const lowerHtml = html.toLowerCase();
  const navMatches = refNav.filter((n) => {
    const key = String(n).toLowerCase();
    const aliases = aliasMap[key] || [key];
    return aliases.some((a) => lowerHtml.includes(String(a).toLowerCase()));
  });

  const mediaFiles = assetMap.filter((a) => String(a.name || "").trim());
  const mediaIntentMatches = mediaFiles.filter((a) => matchesIntentMedia(a, intentTokens)).length;

  const componentPenalty = warnings.length * 10;
  const componentParity = Math.max(0, pct(componentCheck.hit, componentCheck.total) - componentPenalty);
  const contentDensity = pct(runtime.contentDensity.pass, runtime.contentDensity.total || 1);
  const motionParity = pct(motionCheck.hit, motionCheck.total);
  const clickInteraction = pct(runtime.clickInteractions.responsiveCount, runtime.clickInteractions.testedCount || 1);
  const sourceLower = `${html}\n${css}\n${js}`.toLowerCase();
  const scrollTimelineSignals = [
    runtime.scrollTimeline.reactiveCount >= 3,
    runtime.scrollTimeline.transformResponsiveCount >= 1 || runtime.scrollTimeline.opacityResponsiveCount >= 1,
    runtime.scrollTimeline.stickyCount >= 1 || runtime.scrollTimeline.progressRailPresent || runtime.scrollTimeline.marqueePresent,
    sourceIncludesAny(sourceLower, [/scrolltrigger/, /\bgsap\b/, /\btimeline\b/, /\bscrub\b/, /\bpin\b/, /intersectionobserver/, /requestanimationframe/, /addEventListener\(\s*["']scroll/]),
  ];
  const scrollTimelineParity = pct(scrollTimelineSignals.filter(Boolean).length, scrollTimelineSignals.length);

  const scrollFunctionality = pct(
    Number(runtime.scrollStats.wheelOk) + Number(runtime.scrollStats.trackpadProxyOk) + Number(runtime.scrollStats.touchProxyOk),
    3
  );

  const navParity = pct(navMatches.length, refNav.length || 1);
  const mediaAdaptation = intentTokens.length ? pct(mediaIntentMatches, mediaFiles.length || 1) : 100;

  const scores = {
    componentParity,
    contentDensity,
    motionParity,
    clickInteraction,
    scrollTimelineParity,
    scrollFunctionality,
    navParity,
    mediaAdaptation,
  };

  const finalScore = Number(
    (
      scores.componentParity * 0.25 +
      scores.contentDensity * 0.1 +
      scores.motionParity * 0.2 +
      scores.clickInteraction * 0.1 +
      scores.scrollTimelineParity * 0.05 +
      scores.scrollFunctionality * 0.05 +
      scores.navParity * 0.1 +
      scores.mediaAdaptation * 0.15
    ).toFixed(2)
  );

  const issues = [];
  if (warnings.length) issues.push("empty-section-warnings");
  if (scores.scrollFunctionality < 100) issues.push("scroll-functionality-partial");
  if (scores.contentDensity < 80) issues.push("content-density-low");
  if (runtime.hoveredTargets < 3) issues.push("interaction-smoke-hover-failed");
  if (scores.clickInteraction < 60) issues.push("click-animation-parity-low");
  if (scores.scrollTimelineParity < 60) issues.push("scroll-timeline-parity-low");
  if (runtime.clickedNavLinks < 2) issues.push("navigation-smoke-click-failed");
  if (!scrollEngineCompatibility.pass) issues.push("scroll-engine-compatibility-failed");
  const gatePass = scrollEngineCompatibility.pass && scores.clickInteraction >= 60 && scores.scrollTimelineParity >= 60;

  const report = {
    generatedAt: new Date().toISOString(),
    pageDir: toPosix(pageDir),
    pageUrl,
    profile: profileName,
    reference: fs.existsSync(refPath) ? toPosix(refPath) : null,
    threshold,
    scores,
    finalScore,
    pass: finalScore >= threshold && gatePass,
    issues,
    warnings,
    gates: {
      scrollEngineCompatibility: scrollEngineCompatibility.pass,
      clickAnimationParity: scores.clickInteraction >= 60,
      scrollTimelineParity: scores.scrollTimelineParity >= 60,
    },
    details: {
      component: componentCheck,
      motion: motionCheck,
      scrollEngineCompatibility,
      refNav,
      navMatches,
      intentTokens,
      mediaFiles: mediaFiles.length,
      mediaIntentMatches,
      runtime,
    },
  };

  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Replica fidelity: ${finalScore}/100 (${report.pass ? "PASS" : "FAIL"})`);
  console.log(`Saved: ${toPosix(outPath)}`);
  if (!report.pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exit(1);
});
