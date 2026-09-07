/**
 * motion.js — the presentation-motion layer. Pure eye-candy; no concept math.
 *
 * Driven by Motion (motion.dev — the animation engine behind Framer Motion),
 * vendored locally at ../vendor/motion.js. We use its real imperative API:
 *
 *   animate()  — keyframed entrance animations (opacity + transform)
 *   inView()   — IntersectionObserver-backed scroll triggers
 *   stagger()  — staggered delays across the hero group
 *
 * Why not CSS transitions for the reveals: a CSS transition only runs if the
 * browser paints the element at its start value first. Because the initial
 * render happens in the same task, that first frame never lands and the element
 * snaps straight to visible. animate() sets explicit keyframes, so the entrance
 * plays regardless of paint timing.
 *
 * Everything here is disabled (or made instant) under prefers-reduced-motion,
 * and every reveal has a hard fallback so content can never be stranded hidden.
 */

import { animate, inView, stagger } from '../vendor/motion.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = [0.22, 1, 0.36, 1];
const DURATION = 0.85;

/** Resolve the from/to transform pair for an element's reveal direction. */
function transformPair(el) {
  const dir = el.getAttribute('data-reveal-dir');
  if (dir === 'left') return ['translateX(-44px)', 'translateX(0px)'];
  if (dir === 'right') return ['translateX(44px)', 'translateX(0px)'];
  return ['translateY(30px)', 'translateY(0px)'];
}

/** Make an element visible with no animation (reduced-motion / fallback path). */
function showInstant(el) {
  el.style.opacity = '1';
  el.style.transform = 'none';
  el.classList.add('in-view');
}

// --------------------------------------------------------------- scroll bar
function initScrollProgress() {
  const bar = document.getElementById('scroll-progress');
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    bar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
  };
  document.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

// --------------------------------------------------------------- hero entrance
/**
 * The hero is above the fold, so it plays on load rather than on scroll.
 * One animate() call across the group with a stagger delay.
 */
function initHeroReveal() {
  const heroEls = Array.from(document.querySelectorAll('.masthead [data-reveal]'));
  if (!heroEls.length) return;

  if (reduced) {
    heroEls.forEach(showInstant);
    return;
  }

  try {
    animate(
      heroEls,
      { opacity: [0, 1], transform: ['translateY(30px)', 'translateY(0px)'] },
      { duration: DURATION, delay: stagger(0.1, { startDelay: 0.15 }), ease: EASE }
    );
    heroEls.forEach((el) => el.classList.add('in-view'));
  } catch {
    heroEls.forEach(showInstant);
  }
}

// --------------------------------------------------------------- scroll reveals
function initScrollReveals() {
  const els = Array.from(document.querySelectorAll('[data-reveal]')).filter(
    (el) => !el.closest('.masthead')
  );
  if (!els.length) return;

  if (reduced || typeof IntersectionObserver === 'undefined') {
    els.forEach(showInstant);
    return;
  }

  els.forEach((el) => {
    const delay = (+el.getAttribute('data-reveal-delay') || 0) * 0.09;
    const [from, to] = transformPair(el);
    try {
      inView(
        el,
        () => {
          animate(
            el,
            { opacity: [0, 1], transform: [from, to] },
            { duration: DURATION, delay, ease: EASE }
          );
          el.classList.add('in-view');
        },
        { amount: 0.2 }
      );
    } catch {
      showInstant(el);
    }
  });

  // Safety net: if anything never triggered (odd viewport, observer quirk),
  // don't leave content invisible.
  window.setTimeout(() => {
    els.forEach((el) => {
      if (!el.classList.contains('in-view')) showInstant(el);
    });
  }, 4000);
}

// --------------------------------------------------------------- slider fill
export function paintSlider(el) {
  const min = +el.min || 0;
  const max = +el.max || 100;
  const pct = ((+el.value - min) / (max - min)) * 100;
  el.style.setProperty('--range-fill', pct + '%');
}
function initSliders() {
  document.querySelectorAll('input[type="range"]').forEach((el) => {
    paintSlider(el);
    el.addEventListener('input', () => paintSlider(el));
  });
}

// --------------------------------------------------------------- counters
const counterState = new WeakMap();
/**
 * Spring-animate an element's integer text toward `to`.
 * Falls back to an instant set under reduced motion or on any failure.
 */
export function springCount(el, to) {
  if (!el) return;
  const parsed = +String(el.textContent).replace(/[^\d.-]/g, '');
  const from = counterState.get(el) ?? (Number.isFinite(parsed) ? parsed : 0);
  counterState.set(el, to);

  const setText = (v) => (el.textContent = Math.round(v).toLocaleString());
  if (reduced) {
    setText(to);
    return;
  }
  try {
    animate(from, to, { duration: 0.5, ease: EASE, onUpdate: setText });
  } catch {
    setText(to);
  }
}

// --------------------------------------------------------------- hero net
function initHeroNet() {
  const canvas = document.getElementById('hero-net');
  if (!canvas || reduced) return;
  const ctx = canvas.getContext('2d');
  let W = 0;
  let H = 0;
  let nodes = [];
  let raf = null;
  const mouse = { x: -9999, y: -9999 };

  function resize() {
    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth || canvas.offsetWidth;
    H = canvas.clientHeight || canvas.offsetHeight;
    if (!W || !H) return;
    canvas.width = W * DPR;
    canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const count = Math.min(110, Math.max(40, Math.round((W * H) / 14000)));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: 1.1 + Math.random() * 1.8,
    }));
  }

  function frame() {
    if (!W || !H) { raf = requestAnimationFrame(frame); return; }
    ctx.clearRect(0, 0, W, H);

    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;
      const dx = n.x - mouse.x;
      const dy = n.y - mouse.y;
      const dm = Math.hypot(dx, dy);
      if (dm < 130 && dm > 0.01) {
        n.x += (dx / dm) * 1.1;
        n.y += (dy / dm) * 1.1;
      }
    }

    const LINK = 140;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          ctx.strokeStyle = `rgba(120, 175, 255, ${(1 - d / LINK) * 0.75})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    for (const n of nodes) {
      ctx.fillStyle = 'rgba(198, 222, 255, 0.95)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    raf = requestAnimationFrame(frame);
  }

  const start = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = null; } };

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  });
  window.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });

  // pause when the hero scrolls out of view to save battery
  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => (e.isIntersecting ? start() : stop()));
    }).observe(canvas);
  }

  resize();
  // re-measure once layout/fonts settle
  requestAnimationFrame(resize);
  window.setTimeout(resize, 300);
  start();
}

export function initMotion() {
  initScrollProgress();
  initSliders();
  initHeroReveal();
  initScrollReveals();
  initHeroNet();
}
