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

function toPosix(p) {
  return p.replaceAll("\\", "/");
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

function stateDelta(before, after) {
  const groups = ["styles", "rect"];
  const changed = [];
  for (const group of groups) {
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

async function probeClickAnimation(page) {
  const targets = page.locator(
    "button, [role='button'], .menu-toggle, .hero-link, .story-tile, .research-card, [data-click-anim], .cta"
  );
  const count = await targets.count();
  const tested = [];
  let responsiveCount = 0;

  for (let i = 0; i < count && tested.length < 5; i += 1) {
    const target = targets.nth(i);
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
      // The target may disappear as part of the click animation or menu transition.
    }

    const deltaShort = stateDelta(before, afterShort);
    const deltaLong = stateDelta(before, afterLong);
    const responsive = deltaShort.length > 0 || deltaLong.length > 0;
    if (responsive) responsiveCount += 1;

    tested.push({
      responsive,
      deltaShort,
      deltaLong,
    });
  }

  return {
    testedCount: tested.length,
    responsiveCount,
    samples: tested,
    pass: tested.length > 0 && responsiveCount >= 1,
  };
}

function resolvePageUrl(pageDir, pageUrlArg) {
  if (pageUrlArg) {
    if (/^https?:\/\//i.test(pageUrlArg)) return pageUrlArg;
    if (/^file:\/\//i.test(pageUrlArg)) return pageUrlArg;
  }
  const indexPath = path.resolve(pageDir, "index.html").replaceAll("\\", "/");
  return `file:///${indexPath}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const pageDir = path.resolve(String(args.page || "output/awwwards-design-selector/whu-promo-shed-hifi"));
  const pageUrl = resolvePageUrl(pageDir, args.url ? String(args.url) : "");
  const outPath = path.resolve(String(args.out || path.join(pageDir, "pre-delivery-smoke.json")));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const report = {
    generatedAt: new Date().toISOString(),
    pageDir: toPosix(pageDir),
    pageUrl,
    checks: {
      render: false,
      scroll: false,
      mobileScroll: false,
      visual: false,
      interaction: false,
      clickAnimation: false,
      links: false,
    },
    details: {},
    pass: false,
  };

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(1800);
    report.checks.render = true;

    const startY = await page.evaluate(() => window.scrollY);
    for (let i = 0; i < 8; i += 1) {
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(70);
    }
    const endY = await page.evaluate(() => window.scrollY);
    report.details.scroll = { startY, endY };
    report.checks.scroll = endY > startY + 80;

    const screenshotPath = path.join(pageDir, "pre-delivery-fullpage.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const emptySections = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll("section, main > section, main > div, [data-section]"));
      const out = [];
      for (const el of sections) {
        const r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 80) continue;
        const visibleChildren = Array.from(el.querySelectorAll("*")).filter((c) => {
          const s = window.getComputedStyle(c);
          const cr = c.getBoundingClientRect();
          return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0 && cr.width > 1 && cr.height > 1;
        }).length;
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!text || visibleChildren < 1) {
          out.push(el.id || el.className || el.tagName.toLowerCase());
        }
      }
      return out;
    });
    report.details.visual = { screenshotPath: toPosix(screenshotPath), emptySections };
    report.checks.visual = emptySections.length === 0;

    const interactive = page.locator("a, button, .card, .feature-card, .client-item, .service-item");
    const iCount = await interactive.count();
    let hoverCount = 0;
    for (let i = 0; i < iCount && hoverCount < 3; i += 1) {
      const target = interactive.nth(i);
      const box = await target.boundingBox();
      if (!box || box.width < 3 || box.height < 3) continue;
      await target.hover({ timeout: 2000 });
      hoverCount += 1;
      await page.waitForTimeout(50);
    }
    report.details.interaction = { hoverCount };
    report.checks.interaction = hoverCount >= 3;

    const clickAnimation = await probeClickAnimation(page);
    report.details.clickAnimation = clickAnimation;
    report.checks.clickAnimation = clickAnimation.pass;

    const navLinks = page.locator('a[href^="#"]');
    const lCount = await navLinks.count();
    let clickCount = 0;
    for (let i = 0; i < lCount && clickCount < 2; i += 1) {
      const link = navLinks.nth(i);
      const before = await page.evaluate(() => ({ hash: location.hash, y: window.scrollY }));
      try {
        await link.click({ timeout: 2500 });
        await page.waitForTimeout(160);
      } catch {
        continue;
      }
      const after = await page.evaluate(() => ({ hash: location.hash, y: window.scrollY }));
      if (after.hash !== before.hash || after.y !== before.y) clickCount += 1;
    }
    report.details.links = { clickCount };
    report.checks.links = clickCount >= 2;

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const mpage = await mobile.newPage();
    try {
      await mpage.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
      await mpage.waitForTimeout(1300);
      const mobileScroll = await mpage.evaluate(async () => {
        const startY = window.scrollY;
        for (let i = 0; i < 8; i += 1) {
          window.scrollBy(0, 130);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        return { startY, endY: window.scrollY };
      });
      report.details.mobileScroll = mobileScroll;
      report.checks.mobileScroll = mobileScroll.endY > mobileScroll.startY + 80;
    } finally {
      await mobile.close();
    }
  } finally {
    await context.close();
    await browser.close();
  }

  report.pass =
    report.checks.render &&
    report.checks.scroll &&
    report.checks.mobileScroll &&
    report.checks.visual &&
    report.checks.interaction &&
    report.checks.clickAnimation &&
    report.checks.links;

  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(`Pre-delivery smoke: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`Saved: ${toPosix(outPath)}`);
  if (!report.pass) process.exitCode = 2;
}

main().catch((error) => {
  console.error(String(error.stack || error));
  process.exit(1);
});
