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


// ---------- contact form via Formspree ----------
const websiteForm = document.getElementById('enquiry-form');
const formSubmitButton = document.getElementById('formSubmit');
const websiteFormError = document.getElementById('formError');

if (websiteForm) {
  websiteForm.addEventListener('submit', async (event) => {
    if (!websiteForm.checkValidity()) return;
    if (!window.fetch || !window.FormData) return; // native Formspree fallback

    event.preventDefault();
    if (websiteFormError) websiteFormError.hidden = true;
    if (formSubmitButton) {
      formSubmitButton.disabled = true;
      formSubmitButton.setAttribute('aria-busy', 'true');
      const label = formSubmitButton.querySelector('.form-submit-label');
      if (label) label.textContent = 'Sending…';
    }

    try {
      const response = await fetch(websiteForm.action, {
        method: 'POST',
        body: new FormData(websiteForm),
        headers: { Accept: 'application/json' }
      });

      if (!response.ok) {
        let message = 'Sorry — your enquiry could not be sent. Please try again.';
        try {
          const data = await response.json();
          if (data && data.errors && data.errors.length) {
            message = data.errors.map(error => error.message).join(' ');
          }
        } catch (_) {}
        throw new Error(message);
      }

      window.location.href = 'thank-you.html';
    } catch (error) {
      if (websiteFormError) {
        websiteFormError.textContent = error.message || 'Sorry — your enquiry could not be sent. Please try again.';
        websiteFormError.hidden = false;
      }
      if (formSubmitButton) {
        formSubmitButton.disabled = false;
        formSubmitButton.removeAttribute('aria-busy');
        const label = formSubmitButton.querySelector('.form-submit-label');
        if (label) label.textContent = 'Send Enquiry';
      }
    }
  });
}
