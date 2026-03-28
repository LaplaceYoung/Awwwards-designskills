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

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function toPosix(p) {
  return p.replaceAll("\\", "/");
}

function listDirsSafe(baseDir) {
  try {
    return fs
      .readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function walkFilesLimited(root, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : 4;
  const maxFiles = Number.isFinite(options.maxFiles) ? options.maxFiles : 4000;
  const ignoreDirs = new Set(options.ignoreDirs || ["node_modules", ".git", "dist", "build", "coverage"]);

  const files = [];

  function walk(current, depth) {
    if (depth > maxDepth || files.length >= maxFiles) return;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) break;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return files;
}

function detectFramework(pkg, cwd) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (name) => Boolean(deps[name]);

  if (has("next") || fs.existsSync(path.join(cwd, "next.config.js")) || fs.existsSync(path.join(cwd, "next.config.mjs"))) {
    return "next";
  }
  if (has("nuxt") || has("nuxt3") || fs.existsSync(path.join(cwd, "nuxt.config.ts")) || fs.existsSync(path.join(cwd, "nuxt.config.js"))) {
    return "nuxt";
  }
  if (has("react") || has("react-dom")) return "react";
  if (has("vue")) return "vue";
  if (has("svelte")) return "svelte";
  if (has("solid-js")) return "solid";
  return "unknown";
}

function detectBuildTool(pkg, cwd) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (name) => Boolean(deps[name]);

  if (has("vite") || fs.existsSync(path.join(cwd, "vite.config.ts")) || fs.existsSync(path.join(cwd, "vite.config.js"))) return "vite";
  if (has("webpack") || fs.existsSync(path.join(cwd, "webpack.config.js"))) return "webpack";
  if (has("@angular/cli")) return "angular-cli";
  if (has("parcel")) return "parcel";
  if (has("rspack") || has("@rspack/core")) return "rspack";
  return "unknown";
}

function detectStyleStack(pkg, cwd, files) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (name) => Boolean(deps[name]);
  const lowerFiles = files.map((f) => f.toLowerCase());

  const styles = [];

  if (has("tailwindcss") || fs.existsSync(path.join(cwd, "tailwind.config.js")) || fs.existsSync(path.join(cwd, "tailwind.config.ts"))) {
    styles.push("tailwindcss");
  }
  if (has("sass") || lowerFiles.some((f) => f.endsWith(".scss") || f.endsWith(".sass"))) {
    styles.push("sass");
  }
  if (has("less") || lowerFiles.some((f) => f.endsWith(".less"))) {
    styles.push("less");
  }
  if (has("styled-components")) styles.push("styled-components");
  if (has("@emotion/react") || has("@emotion/styled")) styles.push("emotion");
  if (lowerFiles.some((f) => f.endsWith(".css"))) styles.push("css");

  return Array.from(new Set(styles));
}

function detectRouting(pkg, files) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (name) => Boolean(deps[name]);
  const lowerFiles = files.map((f) => f.toLowerCase());

  if (has("react-router") || has("react-router-dom")) return "react-router";
  if (has("vue-router")) return "vue-router";
  if (has("@remix-run/router")) return "remix-router";
  if (lowerFiles.some((f) => /[\\/]app[\\/]page\.(tsx|ts|jsx|js)$/.test(f)) || lowerFiles.some((f) => /[\\/]pages[\\/]/.test(f))) {
    return "file-based";
  }
  return "unknown";
}

function detectAnimationLibs(pkg) {
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const names = [
    "gsap",
    "framer-motion",
    "motion",
    "three",
    "@react-three/fiber",
    "lottie-web",
    "@lottiefiles/lottie-player",
    "animejs",
    "lenis",
    "locomotive-scroll",
    "swiper",
    "pixi.js",
  ];

  return names.filter((name) => Boolean(deps[name]));
}

function componentStructure(cwd) {
  const candidates = [
    "src/components",
    "src/sections",
    "src/pages",
    "src/views",
    "src/layouts",
    "app",
    "components",
    "pages",
  ];

  const existing = [];
  for (const rel of candidates) {
    const full = path.join(cwd, rel);
    if (fs.existsSync(full) && fs.statSync(full).isDirectory()) {
      existing.push({
        path: rel,
        childDirs: listDirsSafe(full).length,
      });
    }
  }
  return existing;
}

function countByExt(files) {
  const map = {};
  for (const file of files) {
    const ext = path.extname(file).toLowerCase() || "[none]";
    map[ext] = (map[ext] || 0) + 1;
  }
  return map;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  const args = parseArgs(process.argv);
  const cwd = path.resolve(String(args.cwd || process.cwd()));
  const outputPath = path.resolve(
    String(args.out || path.join(process.cwd(), "output", "awwwards-design-selector", "project-profile.json"))
  );

  const pkgPath = path.join(cwd, "package.json");
  const pkg = readJsonSafe(pkgPath) || {};

  const files = walkFilesLimited(cwd, { maxDepth: 5, maxFiles: 5000 });
  const framework = detectFramework(pkg, cwd);
  const buildTool = detectBuildTool(pkg, cwd);
  const styleStack = detectStyleStack(pkg, cwd, files);
  const routing = detectRouting(pkg, files);
  const animations = detectAnimationLibs(pkg);
  const structure = componentStructure(cwd);

  const profile = {
    generatedAt: new Date().toISOString(),
    cwd: toPosix(cwd),
    projectName: pkg.name || path.basename(cwd),
    packageManager: fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))
      ? "pnpm"
      : fs.existsSync(path.join(cwd, "yarn.lock"))
      ? "yarn"
      : fs.existsSync(path.join(cwd, "package-lock.json"))
      ? "npm"
      : "unknown",
    stack: {
      framework,
      buildTool,
      language: fs.existsSync(path.join(cwd, "tsconfig.json")) ? "typescript" : "javascript",
      routing,
      styles: styleStack,
      animationLibs: animations,
    },
    structure,
    fileSignals: {
      totalScannedFiles: files.length,
      extensionDistribution: countByExt(files),
      hasSrcDir: fs.existsSync(path.join(cwd, "src")),
      hasPublicDir: fs.existsSync(path.join(cwd, "public")),
      hasAppDir: fs.existsSync(path.join(cwd, "app")),
    },
    implementationPreference: {
      defaultFlow: "blueprint-first-then-code",
      adaptation: "auto-fit-current-stack",
      language: "zh-CN",
      similarityWeights: {
        structure: 0.35,
        visual: 0.35,
        motionInteraction: 0.3,
      },
      threshold: 70,
    },
  };

  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  console.log(`Saved project profile: ${toPosix(outputPath)}`);
}

main();
