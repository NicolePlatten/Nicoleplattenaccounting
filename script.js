// ---------- header scroll state ----------
const header = document.querySelector('.site-header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
document.addEventListener('scroll', onScroll, { passive:true });
onScroll();

// ---------- mobile nav ----------
const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('.mobile-nav');
const mobileClose = document.querySelector('.mobile-nav-close');
if (navToggle && mobileNav) {
  navToggle.addEventListener('click', () => mobileNav.classList.add('is-open'));
  mobileClose?.addEventListener('click', () => mobileNav.classList.remove('is-open'));
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => mobileNav.classList.remove('is-open')));
}

// ---------- hero entrance (single orchestrated moment) ----------
const hero = document.querySelector('.hero');
requestAnimationFrame(() => requestAnimationFrame(() => hero?.classList.add('is-ready')));

// ---------- scroll reveals ----------
const revealEls = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-visible'));
}

// ---------- tax saving calculator (illustrative, client-side only) ----------
const calcIncome = document.getElementById('calc-income');
const calcStructure = document.getElementById('calc-structure');
const calcResult = document.getElementById('calc-result');
function runCalc(){
  if (!calcIncome || !calcResult) return;
  const income = parseFloat(calcIncome.value) || 0;
  const structure = calcStructure?.value || 'sole-trader';
  // Illustrative only — a rough, transparent placeholder rate, not tax advice.
  const rate = structure === 'limited-company' ? 0.06 : 0.04;
  const estimate = Math.max(0, Math.round(income * rate));
  calcResult.textContent = estimate > 0
    ? `£${estimate.toLocaleString('en-GB')}`
    : '£—';
}
calcIncome?.addEventListener('input', runCalc);
calcStructure?.addEventListener('change', runCalc);
runCalc();

// ---------- current year in footer ----------
document.querySelectorAll('[data-year]').forEach(el => el.textContent = new Date().getFullYear());
