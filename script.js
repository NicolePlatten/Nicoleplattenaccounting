// ---------- header scroll state ----------
const header = document.querySelector('.site-header');
const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
document.addEventListener('scroll', onScroll, { passive:true });
onScroll();

// ---------- mobile nav ----------
const navToggle = document.querySelector('.nav-toggle');
const mobileNav = document.querySelector('.mobile-nav');
const mobileClose = document.querySelector('.mobile-nav-close');
if (navToggle && mobileNav) {
  mobileNav.id ||= 'mobile-navigation';
  navToggle.setAttribute('aria-controls', mobileNav.id);
  mobileNav.inert = true;
  const setMenu = open => {
    mobileNav.classList.toggle('is-open', open);
    mobileNav.setAttribute('aria-hidden', String(!open));
    navToggle.setAttribute('aria-expanded', String(open));
    mobileNav.inert = !open;
    document.body.classList.toggle('menu-open', open);
    if (open) mobileClose?.focus(); else navToggle.focus();
  };
  navToggle.addEventListener('click', () => setMenu(!mobileNav.classList.contains('is-open')));
  mobileClose?.addEventListener('click', () => setMenu(false));
  mobileNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => {
    if (!mobileNav.classList.contains('is-open')) return;
    if (e.key === 'Escape') setMenu(false);
    if (e.key === 'Tab') {
      const items = [...mobileNav.querySelectorAll('a[href],button:not([disabled])')];
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  matchMedia('(min-width: 901px)').addEventListener('change', e => { if(e.matches && mobileNav.classList.contains('is-open')) setMenu(false); });
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


// Bounded requests without requiring the newer AbortSignal.timeout API.
async function fetchWithTimeout(url, options, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

// ---------- contact form via Formspree ----------
const websiteForm = document.getElementById('enquiry-form');
const formSubmitButton = document.getElementById('formSubmit');
const websiteFormError = document.getElementById('formError');

if (websiteForm) {
  websiteForm.addEventListener('submit', async (event) => {
    // Always keep the enquiry inside the website. We intentionally prevent the
    // browser's default form/mail-client behaviour and submit to Formspree here.
    event.preventDefault();

    if (!websiteForm.checkValidity()) {
      websiteForm.reportValidity();
      return;
    }

    const promoCodeInput = websiteForm.querySelector('#promoCode');
    if (promoCodeInput) {
      const enteredPromo = promoCodeInput.value.trim().toUpperCase();
      promoCodeInput.value = enteredPromo;
      if (enteredPromo && enteredPromo !== 'WEB5OFF') {
        event.preventDefault();
        if (websiteFormError) {
          websiteFormError.textContent = 'That promo code is not valid. Please check the code and try again.';
          websiteFormError.hidden = false;
        }
        promoCodeInput.focus();
        return;
      }
    }

    if (!window.fetch || !window.FormData) {
      if (websiteFormError) {
        websiteFormError.textContent = 'Your browser cannot send the form securely right now. Please try another browser or use WhatsApp.';
        websiteFormError.hidden = false;
      }
      return;
    }

    if (websiteFormError) websiteFormError.hidden = true;
    if (formSubmitButton) {
      formSubmitButton.disabled = true;
      formSubmitButton.setAttribute('aria-busy', 'true');
      const label = formSubmitButton.querySelector('.form-submit-label');
      if (label) label.textContent = 'Sending…';
    }

    try {
      const response = await fetchWithTimeout(websiteForm.action, {
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

      try { sessionStorage.setItem('npa_form_success', '1'); } catch (_) {}
      window.location.href = 'thank-you.html';
    } catch (error) {
      if (websiteFormError) {
        websiteFormError.textContent = error.name === 'AbortError' ? 'The request took too long. Delivery could not be confirmed; please check with Nicole before sending again.' : error.message || 'Sorry — your enquiry could not be sent. Please try again.';
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


// ---------- timed first-package offer ----------
(() => {
  const OFFER_DELAY_MS = 10000;
  const DISMISS_FOR_DAYS = 7;
  const CLAIM_FOR_DAYS = 180;
  const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xbdegwjj';
  const DISCOUNT_CODE = 'WEB5OFF';
  const STORAGE_KEY = 'npa_web5_offer_state_v1';
  const excludedPages = /(?:privacy|terms|thank-you)\.html$/i;

  if (excludedPages.test(location.pathname)) return;

  function getState() {
    try {
      const state = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
    }
    catch (_) { return {}; }
  }
  function saveState(patch) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({...getState(), ...patch})); }
    catch (_) {}
  }
  function shouldShow() {
    const state = getState(), now = Date.now();
    if (state.claimedUntil && now < state.claimedUntil) return false;
    if (state.dismissedUntil && now < state.dismissedUntil) return false;
    return true;
  }
  function track(name, params = {}) {
    if (typeof window.npaTrack === 'function') {
      window.npaTrack(name, {offer_code: DISCOUNT_CODE, ...params});
    }
  }
  let offerPreviousFocus = null;
  let offerKeyboardHandler = null;
  function removeOffer() {
    document.removeEventListener('keydown', offerKeyboardHandler);
    offerPreviousFocus?.focus();
    document.querySelector('.web5-offer-backdrop')?.remove();
    document.body.classList.remove('offer-modal-open');
  }
  function dismissOffer() {
    saveState({dismissedUntil: Date.now() + DISMISS_FOR_DAYS * 86400000});
    track('discount_offer_dismiss', {page_path: location.pathname});
    removeOffer();
  }

  function showOffer() {
    if (!shouldShow() || document.querySelector('.web5-offer-backdrop, .mobile-nav.is-open, .cookie-banner') || document.activeElement?.matches('input,textarea,select')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'web5-offer-backdrop';
    backdrop.innerHTML = `
      <section class="web5-offer" role="dialog" aria-modal="true" aria-labelledby="web5OfferTitle">
        <button class="web5-offer-close" type="button" aria-label="Close offer">×</button>
        <div class="web5-offer-logo"><img src="assets/logo.png" alt="Nicole Platten Accounting"></div>
        <p class="web5-offer-kicker">A LITTLE WELCOME FROM NICOLE</p>
        <h2 id="web5OfferTitle">Save 5% on your first package</h2>
        <p class="web5-offer-copy">Thinking about working with Nicole? Leave your email and unlock 5% off your first package.</p>

        <form class="web5-offer-form" novalidate>
          <label class="sr-only" for="web5-email">Email address</label>
          <div class="web5-offer-field">
            <input id="web5-email" name="email" type="email" autocomplete="email" placeholder="Your email address" required>
            <button type="submit">Unlock 5% off</button>
          </div>
          <input type="hidden" name="_subject" value="Website 5% offer claimed">
          <input type="hidden" name="offer" value="WEB5OFF — 5% off first package">
          <input type="hidden" name="source" value="10-second website popup">
          <p class="web5-offer-fine">New clients only · first package only · one use per client. By submitting, you agree to our <a href="privacy.html">privacy policy</a>.</p>
          <p class="web5-offer-error" hidden></p>
        </form>

        <div class="web5-offer-success" hidden>
          <span class="web5-offer-tick" aria-hidden="true">✓</span>
          <p class="web5-offer-success-label">Your discount code</p>
          <div class="web5-code-row">
            <strong>${DISCOUNT_CODE}</strong>
            <button type="button" class="web5-copy-code">Copy code</button>
          </div>
          <p>Quote this code when you contact Nicole and 5% will be taken off your first package.</p>
          <a class="web5-offer-cta" href="contact.html">Get in touch</a>
        </div>

        <button class="web5-offer-later" type="button">Not right now</button>
      </section>`;

    offerPreviousFocus = document.activeElement;
    document.body.appendChild(backdrop);
    document.body.classList.add('offer-modal-open');
    requestAnimationFrame(() => backdrop.classList.add('is-visible'));
    track('discount_offer_view', {page_path: location.pathname});

    const form = backdrop.querySelector('.web5-offer-form');
    const email = backdrop.querySelector('#web5-email');
    const error = backdrop.querySelector('.web5-offer-error');
    const submit = form.querySelector('button[type="submit"]');
    const success = backdrop.querySelector('.web5-offer-success');

    backdrop.querySelector('.web5-offer-close')?.addEventListener('click', dismissOffer);
    backdrop.querySelector('.web5-offer-later')?.addEventListener('click', dismissOffer);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) dismissOffer(); });

    const escHandler = e => {
      if (e.key === 'Tab') {
        const items = [...backdrop.querySelectorAll('a[href],button:not([disabled]),input:not([type=hidden])')].filter(el => el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'Escape' && document.body.contains(backdrop)) {
        dismissOffer();
        document.removeEventListener('keydown', escHandler);
      }
    };
    offerKeyboardHandler = escHandler;
    document.addEventListener('keydown', escHandler);

    backdrop.querySelector('.web5-copy-code')?.addEventListener('click', async e => {
      const button = e.currentTarget;
      let copied = false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(DISCOUNT_CODE);
          copied = true;
        }
      } catch (_) {}
      if (!copied) {
        const helper = document.createElement('textarea');
        helper.value = DISCOUNT_CODE;
        helper.setAttribute('readonly', '');
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        helper.setSelectionRange(0, helper.value.length);
        try { copied = document.execCommand('copy'); } catch (_) {}
        helper.remove();
      }
      button.textContent = copied ? 'Copied ✓' : 'Select code';
      if (!copied) {
        const code = backdrop.querySelector('.web5-code-row strong');
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
      }
      setTimeout(() => { if (document.body.contains(button)) button.textContent = 'Copy code'; }, 2200);
      track('discount_code_copy', {page_path: location.pathname, success: copied});
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      error.hidden = true;

      if (!email.checkValidity()) {
        email.reportValidity();
        return;
      }

      submit.disabled = true;
      submit.textContent = 'Unlocking…';

      const data = new FormData(form);
      data.append('page', location.href);

      try {
        const response = await fetchWithTimeout(FORMSPREE_ENDPOINT, {
          method: 'POST',
          body: data,
            headers: {Accept: 'application/json'}
        });
        if (!response.ok) throw new Error();

        saveState({claimedUntil: Date.now() + CLAIM_FOR_DAYS * 86400000, claimed: true});
        track('discount_offer_claim', {method: 'email_popup', page_path: location.pathname});

        form.hidden = true;
        success.hidden = false;
        success.querySelector('button')?.focus();
        backdrop.querySelector('.web5-offer-later').hidden = true;
        backdrop.querySelector('.web5-offer-copy').textContent = 'Thanks — your website offer is ready to use.';
      } catch (_) {
        error.textContent = 'We couldn’t unlock the offer just now. Please try again.';
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = 'Unlock 5% off';
      }
    });

    setTimeout(() => email?.focus({preventScroll:true}), 450);
  }

  if (shouldShow()) setTimeout(showOffer, OFFER_DELAY_MS);
})();

