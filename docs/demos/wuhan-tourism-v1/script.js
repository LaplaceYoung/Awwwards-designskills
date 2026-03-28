const reveals = document.querySelectorAll('.reveal');
const heroBg = document.querySelector('.hero-bg');

const obs = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('in');
  });
}, { threshold: 0.2 });

reveals.forEach((el) => obs.observe(el));

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (heroBg) heroBg.style.transform = `scale(1.07) translateY(${Math.round(y * -0.08)}px)`;
}, { passive: true });
