const preloader = document.getElementById("preloader");
const loaderValue = document.getElementById("loaderValue");
const loaderBar = document.getElementById("loaderBar");
const cursor = document.getElementById("cursor");
const menuToggle = document.getElementById("menuToggle");
const menuClose = document.getElementById("menuClose");
const overlayMenu = document.getElementById("overlayMenu");
const scrollRailThumb = document.getElementById("scrollRailThumb");
const chapterIndex = document.getElementById("chapterIndex");
const chapterLabel = document.getElementById("chapterLabel");
const chapterProgressBar = document.getElementById("chapterProgressBar");
const hero = document.querySelector(".hero");
const heroLink = document.querySelector(".hero-link");
const storyBlocks = Array.from(document.querySelectorAll(".story[data-story-index]"));
const parallaxTargets = Array.from(document.querySelectorAll("[data-parallax], .story__media img"));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let menuPhaseTimer = null;
let menuCloseUnlockTimer = null;

function splitLines() {
  document.querySelectorAll("[data-split]").forEach((el) => {
    if (el.dataset.splitDone === "1") return;
    const nodes = Array.from(el.childNodes);
    const html = nodes
      .map((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const txt = (node.textContent || "").replace(/\s+/g, " ").trim();
          if (!txt) return "";
          return `<span class="line">${txt}</span>`;
        }
        if (node.nodeType === Node.ELEMENT_NODE) {
          return `<span class="line">${node.outerHTML}</span>`;
        }
        return "";
      })
      .join("");
    el.innerHTML = html;
    el.dataset.splitDone = "1";
  });
}

function decorateMenuButton(button) {
  if (!button || button.querySelector(".menu-toggle__core")) return;
  const labelText = (button.textContent || "").trim();
  const core = document.createElement("span");
  core.className = "menu-toggle__core";
  const label = document.createElement("span");
  label.className = "menu-toggle__label";
  label.textContent = labelText;
  const icon = document.createElement("span");
  icon.className = "menu-toggle__icon";
  const line1 = document.createElement("i");
  const line2 = document.createElement("i");
  icon.append(line1, line2);
  core.append(label, icon);
  button.textContent = "";
  button.append(core);
}

function bindPressFeedback() {
  document.querySelectorAll("[data-click-anim]").forEach((el) => {
    const pressOn = () => el.classList.add("is-pressed");
    const pressOff = () => el.classList.remove("is-pressed");

    el.addEventListener("pointerdown", pressOn);
    el.addEventListener("pointerup", pressOff);
    el.addEventListener("pointerleave", pressOff);
    el.addEventListener("blur", pressOff);

    el.addEventListener("click", (event) => {
      el.classList.add("is-clicked");
      const rect = el.getBoundingClientRect();
      const ring = document.createElement("span");
      ring.className = "impact-ring";
      ring.style.setProperty("--ring-x", `${event.clientX - rect.left || rect.width / 2}px`);
      ring.style.setProperty("--ring-y", `${event.clientY - rect.top || rect.height / 2}px`);
      el.appendChild(ring);
      window.setTimeout(() => ring.remove(), 620);
      window.setTimeout(() => el.classList.remove("is-clicked"), 420);
    });
  });
}

function runPreloader() {
  if (!preloader || !loaderValue || !loaderBar) return;
  let progress = 0;
  const timer = window.setInterval(() => {
    progress += Math.floor(Math.random() * 8) + 6;
    if (progress >= 100) {
      progress = 100;
      window.clearInterval(timer);
      window.setTimeout(() => {
        preloader.classList.add("is-hidden");
        document.querySelectorAll(".split-lines").forEach((el) => el.classList.add("is-in"));
      }, 260);
    }
    loaderValue.textContent = String(progress).padStart(2, "0");
    loaderBar.style.width = `${progress}%`;
  }, reduceMotion ? 20 : 70);
}

function setMenuState(open) {
  if (!overlayMenu) return;
  window.clearTimeout(menuPhaseTimer);
  window.clearTimeout(menuCloseUnlockTimer);

  if (open) {
    overlayMenu.classList.remove("is-closing");
    overlayMenu.classList.add("is-opening", "is-open");
    menuPhaseTimer = window.setTimeout(() => {
      overlayMenu.classList.remove("is-opening");
    }, 420);
    document.body.style.overflow = "hidden";
  } else {
    overlayMenu.classList.remove("is-opening", "is-open");
    overlayMenu.classList.add("is-closing");
    menuPhaseTimer = window.setTimeout(() => {
      overlayMenu.classList.remove("is-closing");
    }, 360);
    menuCloseUnlockTimer = window.setTimeout(() => {
      document.body.style.overflow = "";
    }, 300);
  }

  overlayMenu.setAttribute("aria-hidden", open ? "false" : "true");
  if (menuToggle) {
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuToggle.classList.toggle("is-open", open);
  }
  if (menuClose) {
    menuClose.classList.toggle("is-open", open);
  }
}

function bindMenu() {
  if (!menuToggle || !menuClose || !overlayMenu) return;
  decorateMenuButton(menuToggle);
  decorateMenuButton(menuClose);

  menuToggle.addEventListener("click", () => setMenuState(true));
  menuClose.addEventListener("click", () => setMenuState(false));
  overlayMenu.querySelectorAll("a").forEach((a) => {
    a.addEventListener("click", () => setMenuState(false));
  });
}

function bindCursor() {
  if (!cursor || !window.matchMedia("(min-width: 981px)").matches || reduceMotion) return;
  window.addEventListener("mousemove", (event) => {
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;
  });

  document.querySelectorAll("a, button, .story-tile, .research-card, .menu-toggle").forEach((el) => {
    el.addEventListener("mouseenter", () => cursor.classList.add("is-active"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("is-active"));
  });
}

function bindRevealObserver() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-in");
      });
    },
    { threshold: 0.18 }
  );

  document.querySelectorAll(".reveal, .sticky-block, .split-lines").forEach((el) => observer.observe(el));
}

function bindHeroSlides() {
  const heroSlides = Array.from(document.querySelectorAll(".hero-slide"));
  if (heroSlides.length <= 1 || reduceMotion) return;
  let activeSlide = 0;

  const showSlide = (index) => {
    activeSlide = (index + heroSlides.length) % heroSlides.length;
    heroSlides.forEach((slide, idx) => slide.classList.toggle("is-active", idx === activeSlide));
  };

  window.setInterval(() => showSlide(activeSlide + 1), 3800);
}

function bindCardFocus() {
  const selectableGroups = [
    Array.from(document.querySelectorAll(".research-card")),
    Array.from(document.querySelectorAll(".story-tile")),
  ];

  selectableGroups.forEach((nodes) => {
    nodes.forEach((node) => {
      node.addEventListener("click", () => {
        const next = !node.classList.contains("is-active");
        nodes.forEach((item) => item.classList.remove("is-active"));
        if (next) node.classList.add("is-active");
      });
    });
  });
}

function bindContactFeedback() {
  const submit = document.querySelector(".contact-form button");
  if (!submit) return;
  const initial = submit.textContent;
  submit.addEventListener("click", () => {
    submit.classList.add("is-confirmed");
    submit.textContent = "\u5df2\u6536\u5230\u54a8\u8be2";
    window.setTimeout(() => {
      submit.classList.remove("is-confirmed");
      submit.textContent = initial;
    }, 1400);
  });
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function updateScrollTimeline() {
  const y = window.scrollY;
  const maxY = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const pageRatio = clamp01(y / maxY);

  if (scrollRailThumb) {
    scrollRailThumb.style.transform = `translateY(${pageRatio * 82}%)`;
  }

  if (hero) {
    const heroProgress = clamp01(y / Math.max(window.innerHeight * 0.92, 1));
    hero.style.setProperty("--hero-progress", heroProgress.toFixed(3));
    if (heroLink) heroLink.style.letterSpacing = `${0.1 + heroProgress * 0.08}em`;
  }

  parallaxTargets.forEach((img) => {
    const story = img.closest(".story");
    if (!story) return;
    const rect = story.getBoundingClientRect();
    const progress = clamp01((window.innerHeight - rect.top) / (window.innerHeight + rect.height * 0.45));
    img.style.setProperty("--story-progress", progress.toFixed(3));
  });

  let activeStory = null;
  let activeProgress = 0;
  let bestScore = -1;

  storyBlocks.forEach((story) => {
    const rect = story.getBoundingClientRect();
    const progress = clamp01((window.innerHeight - rect.top) / (window.innerHeight + rect.height * 0.18));
    story.style.setProperty("--story-progress", progress.toFixed(3));

    const centerY = rect.top + rect.height * 0.5;
    const score = 1 - Math.min(1, Math.abs(centerY - window.innerHeight * 0.52) / (window.innerHeight * 0.75));
    if (score > bestScore) {
      bestScore = score;
      activeStory = story;
      activeProgress = progress;
    }
  });

  if (activeStory) {
    storyBlocks.forEach((node) => node.classList.toggle("is-active", node === activeStory));
    if (chapterIndex) chapterIndex.textContent = activeStory.getAttribute("data-story-index") || "00";
    if (chapterLabel) chapterLabel.textContent = activeStory.getAttribute("data-story-label") || "Story";
    if (chapterProgressBar) {
      const indexRaw = Number(activeStory.getAttribute("data-story-index") || "1");
      const base = Math.max(0, indexRaw - 1);
      const progress = clamp01((base + activeProgress) / Math.max(storyBlocks.length, 1));
      chapterProgressBar.style.setProperty("--chapter-progress", progress.toFixed(3));
    }
  }
}

function bindScrollLoop() {
  let ticking = false;
  const tick = () => {
    updateScrollTimeline();
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (reduceMotion) return;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(tick);
    },
    { passive: true }
  );

  updateScrollTimeline();
}

splitLines();
bindPressFeedback();
runPreloader();
bindMenu();
bindCursor();
bindRevealObserver();
bindHeroSlides();
bindCardFocus();
bindContactFeedback();
bindScrollLoop();
