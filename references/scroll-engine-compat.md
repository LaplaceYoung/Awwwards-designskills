# Scroll Engine Compatibility Matrix

Use this reference when adding smooth scroll or advanced pinning.

## Baseline Rule

- Use only one primary scroll controller at a time:
  - native browser scroll
  - Lenis
  - Locomotive Scroll
- Do not stack two smooth-scroll systems.

## Conflict Matrix

| Engine | Conflicts | Typical Symptom | Fix |
| --- | --- | --- | --- |
| Lenis | `scroll-behavior: smooth` on `html`/`*` | wheel/scroll freeze or stutter | remove native smooth behavior |
| Lenis + ScrollTrigger | missing RAF sync | pin/scrub timing drift | call `ScrollTrigger.update()` inside Lenis scroll callback and drive Lenis via RAF |
| Locomotive + native fixed/pin assumptions | wrong scroller proxy | pin jumps / dead zones | configure `ScrollTrigger.scrollerProxy` and set explicit scroller element |
| Any engine + `overflow: hidden` on page wrappers | blocked viewport updates | section never enters viewport | keep root scroll containers scrollable |

## Lenis Template

```css
html, body {
  height: auto;
}

/* IMPORTANT: remove native smooth scrolling when Lenis is enabled */
html {
  scroll-behavior: auto;
}
```

```js
const lenis = new Lenis({ smoothWheel: true });

lenis.on("scroll", () => {
  ScrollTrigger.update();
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);
```

## Locomotive Template

```js
const loco = new LocomotiveScroll({
  el: document.querySelector("[data-scroll-container]"),
  smooth: true,
});

ScrollTrigger.scrollerProxy("[data-scroll-container]", {
  scrollTop(value) {
    if (arguments.length) loco.scrollTo(value, { duration: 0, disableLerp: true });
    return loco.scroll.instance.scroll.y;
  },
  getBoundingClientRect() {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  },
});

loco.on("scroll", ScrollTrigger.update);
ScrollTrigger.addEventListener("refresh", () => loco.update());
ScrollTrigger.refresh();
```

## Pre-Ship Compatibility Checklist

- Wheel scrolling works top-to-bottom.
- Continuous scrolling does not lock (trackpad-like behavior).
- Mobile/touch scrolling works.
- ScrollTrigger pin/scrub sections align with expected timing.
- No dead zones after opening/closing nav overlays or modals.
