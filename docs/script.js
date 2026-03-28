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
    window.setTimeout(() => ring.remove(), 560);
    window.setTimeout(() => el.classList.remove("is-clicked"), 420);
  });
});

