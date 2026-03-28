const pageShell = document.querySelector(".page-shell");
const focusImage = document.getElementById("focusImage");
const focusTitle = document.getElementById("focusTitle");
const focusKicker = document.getElementById("focusKicker");
const langButtons = Array.from(document.querySelectorAll(".lang-btn"));
const floatCards = Array.from(document.querySelectorAll(".float-card"));
const navButtons = Array.from(document.querySelectorAll("[data-panel-target]"));
const closeButtons = Array.from(document.querySelectorAll("[data-close-panel]"));

const panelMap = {
  about: document.getElementById("aboutPanel"),
  projects: document.getElementById("projectsPanel"),
  contact: document.getElementById("contactPanel"),
};

let currentLang = "zh";

function applyClickFeedback() {
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

function setLang(lang) {
  currentLang = lang;
  langButtons.forEach((btn) => btn.classList.toggle("is-on", btn.dataset.lang === lang));
  document.querySelectorAll("[data-i18n-zh]").forEach((el) => {
    const text = lang === "zh" ? el.dataset.i18nZh : el.dataset.i18nEn;
    if (text) el.textContent = text;
  });
  if (focusTitle) {
    focusTitle.textContent = lang === "zh" ? focusTitle.dataset.zh : focusTitle.dataset.en;
  }
}

function setFocusFromCard(card) {
  if (!card || !focusImage || !focusTitle || !focusKicker) return;
  floatCards.forEach((item) => item.classList.remove("is-active"));
  card.classList.add("is-active");
  const image = card.dataset.image;
  const title = currentLang === "zh" ? card.dataset.titleZh : card.dataset.titleEn;
  const kicker = card.dataset.tag || "[PROJECT]";
  if (image) focusImage.src = image;
  if (title) focusTitle.textContent = title;
  focusKicker.textContent = kicker;
}

function bindFloatCards() {
  floatCards.forEach((card) => {
    card.addEventListener("mouseenter", () => setFocusFromCard(card));
    card.addEventListener("focus", () => setFocusFromCard(card), true);
    card.addEventListener("click", () => setFocusFromCard(card));
  });
}

function bindPanels() {
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.panelTarget;
      const panel = panelMap[target];
      if (panel) panel.showModal();
    });
  });
  closeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.closest("dialog");
      if (panel) panel.close();
    });
  });
}

function bindParallax() {
  if (!pageShell) return;
  pageShell.addEventListener("mousemove", (event) => {
    const xRatio = (event.clientX / window.innerWidth - 0.5) * 2;
    const yRatio = (event.clientY / window.innerHeight - 0.5) * 2;
    floatCards.forEach((card, index) => {
      const factor = 4 + (index % 3) * 2;
      card.style.transform = `translate(${xRatio * factor}px, ${yRatio * factor}px)`;
    });
  });
  pageShell.addEventListener("mouseleave", () => {
    floatCards.forEach((card) => {
      card.style.transform = "";
    });
  });
}

langButtons.forEach((btn) => {
  btn.addEventListener("click", () => setLang(btn.dataset.lang || "zh"));
});

applyClickFeedback();
bindFloatCards();
bindPanels();
bindParallax();
setLang("zh");
setFocusFromCard(floatCards[0]);


