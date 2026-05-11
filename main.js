// ── Lenis smooth scroll ──────────────────────────────────────────
const lenis = new Lenis({
  duration: 1.2,
  easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
  smoothWheel: true,
});

function raf(time) {
  lenis.raf(time);
  requestAnimationFrame(raf);
}
requestAnimationFrame(raf);

// ── Threshold-based scroll snapping ─────────────────────────────
// Follows the wheel naturally; after the user pauses (150ms), checks
// whether they've crossed 25% into the next section and snaps there,
// otherwise snaps back to the current one.
const steps = [...document.querySelectorAll('.step')];
let currentIndex = 0;
let isSnapping = false;
let wheelAccum = 0;
let wheelDebounce = null;

const SNAP_THRESHOLD = 0.25;

// Converts a CSS cubic-bezier into a JS easing function for Lenis
function mkCubicBezier(x1, y1, x2, y2) {
  const sample = (t, a, b) => (((1 - 3*b + 3*a)*t + (3*b - 6*a))*t + 3*a)*t;
  const slope  = (t, a, b) => 3*(1 - 3*b + 3*a)*t*t + 2*(3*b - 6*a)*t + 3*a;
  const solve  = x => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (sample(t, x1, x2) - x) / s;
    }
    return t;
  };
  return t => sample(solve(t), y1, y2);
}

const SNAP_EASE = mkCubicBezier(0.32, 0.72, 0, 1);

function snapTo(index) {
  const next = Math.max(0, Math.min(index, steps.length - 1));
  currentIndex = next;
  isSnapping = true;

  lenis.scrollTo(steps[currentIndex], {
    duration: 1.5,
    easing: SNAP_EASE,
    onComplete: () => { isSnapping = false; },
  });
}

window.addEventListener('wheel', e => {
  // Block all wheel input while a snap is in flight
  if (isSnapping) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return;
  }

  // Not snapping — let Lenis scroll naturally, accumulate intent
  wheelAccum += e.deltaY;

  clearTimeout(wheelDebounce);
  wheelDebounce = setTimeout(() => {
    const scroll  = lenis.scroll;
    const stepH   = steps[0].offsetHeight;
    const raw     = scroll / stepH;
    const floor   = Math.max(0, Math.min(Math.floor(raw), steps.length - 1));
    const frac    = raw - Math.floor(raw);
    const dir    = wheelAccum > 0 ? 1 : -1;

    const target = dir > 0
      ? (frac >= SNAP_THRESHOLD ? floor + 1 : floor)
      : (frac <= 1 - SNAP_THRESHOLD ? floor : floor + 1);

    wheelAccum = 0;
    snapTo(target);
  }, 150);
}, { passive: false, capture: true });

// Keyboard nav
window.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'PageDown') {
    e.preventDefault();
    if (!isSnapping) snapTo(currentIndex + 1);
  } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
    e.preventDefault();
    if (!isSnapping) snapTo(currentIndex - 1);
  }
});

// Touch swipe
let touchStartY = 0;
window.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, { passive: true });
window.addEventListener('touchend', e => {
  const delta = touchStartY - e.changedTouches[0].clientY;
  if (Math.abs(delta) > 50 && !isSnapping) snapTo(currentIndex + (delta > 0 ? 1 : -1));
}, { passive: true });

// ── Text splitting ───────────────────────────────────────────────
// per-word-crossfade: transform-origin 50% 55%, per-word
const UNIT_STYLES = {
  display: 'inline-block',
  whiteSpace: 'pre',
  backfaceVisibility: 'hidden',
  transformOrigin: '50% 55%',
  willChange: 'transform, opacity',
};

function applyUnitStyles(span) {
  Object.assign(span.style, UNIT_STYLES);
}

// Per-word split, preserves <br> tags
function splitToWords(el) {
  const nodes = Array.from(el.childNodes);
  el.innerHTML = '';
  const units = [];

  nodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = node.textContent.match(/(\S+|\s+)/g) || [];
      parts.forEach(part => {
        const span = document.createElement('span');
        span.textContent = part;
        if (/\S/.test(part)) {
          applyUnitStyles(span);
          units.push(span);
        }
        el.appendChild(span);
      });
    } else if (node.nodeName === 'BR') {
      el.appendChild(document.createElement('br'));
    }
  });

  return units;
}

// ── Animation ────────────────────────────────────────────────────
// per-word-crossfade: opacity 0→1, y 4.64px→0 (8px * 0.58 travel multiplier)
// 504ms duration, 50ms stagger, cubic-bezier(0.16, 1, 0.3, 1)
const CROSSFADE_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

function animateIn(units, { duration = 504, stagger = 50, baseDelay = 0 } = {}) {
  units.forEach((unit, i) => {
    unit.animate(
      [
        { opacity: '0', transform: 'translate3d(0, 4.64px, 0)' },
        { opacity: '1', transform: 'translate3d(0, 0, 0)' },
      ],
      { duration, delay: baseDelay + i * stagger, easing: CROSSFADE_EASING, fill: 'forwards' }
    );
  });
}

// ── Per-step setup ───────────────────────────────────────────────
steps.forEach(step => {
  const label = step.querySelector('.step__label');
  const h2    = step.querySelector('h2');
  const p     = step.querySelector('p');

  const labelUnits = splitToWords(label);
  const h2Units    = splitToWords(h2);
  const pUnits     = splitToWords(p);

  [...labelUnits, ...h2Units, ...pUnits].forEach(u => { u.style.opacity = '0'; });

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry.isIntersecting) return;
    animateIn(labelUnits, { baseDelay: 0 });
    animateIn(h2Units,    { baseDelay: 120 });
    animateIn(pUnits,     { duration: 380, stagger: 18, baseDelay: 240 });
    observer.unobserve(step);
  }, { threshold: 0.35 });

  observer.observe(step);
});
