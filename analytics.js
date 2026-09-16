/* Nicole Platten Accounting — analytics + conversion tracking
   Replace the two IDs below after creating GA4 and Microsoft Clarity.
   Analytics only loads after the visitor accepts optional analytics cookies.
*/
(() => {
  'use strict';

  const CONFIG = {
    ga4MeasurementId: 'G-REPLACE_ME',
    clarityProjectId: 'REPLACE_ME',
    consentStorageKey: 'npa_analytics_consent_v1'
  };

  const validGA = /^G-[A-Z0-9]+$/i.test(CONFIG.ga4MeasurementId) && !CONFIG.ga4MeasurementId.includes('REPLACE');
  const validClarity = /^[a-z0-9]+$/i.test(CONFIG.clarityProjectId) && !CONFIG.clarityProjectId.includes('REPLACE');
  let analyticsLoaded = false;
  let memoryConsent = null;
  function readConsent() { try { return localStorage.getItem(CONFIG.consentStorageKey) || memoryConsent; } catch { return memoryConsent; } }
  function writeConsent(value) { memoryConsent = value; try { localStorage.setItem(CONFIG.consentStorageKey, value); } catch {} }
  function clearAnalyticsCookies() {
    const domains = location.hostname.split('.');
    document.cookie.split(';').forEach(entry => {
      const name = entry.split('=')[0].trim();
      if (!/^(_ga|_gid|_gat|_clck|_clsk)/.test(name)) return;
      document.cookie = name + '=; Max-Age=0; path=/';
      for(let i=0;i<domains.length-1;i++) document.cookie = name + '=; Max-Age=0; path=/; domain=.' + domains.slice(i).join('.');
    });
  }

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ dataLayer.push(arguments); };

  function loadScript(src, id) {
    if (id && document.getElementById(id)) return;
    const s = document.createElement('script');
    s.async = true;
    s.src = src;
    if (id) s.id = id;
    document.head.appendChild(s);
  }

  function loadAnalytics() {
    if (analyticsLoaded) return;
    analyticsLoaded = true;
    window['ga-disable-' + CONFIG.ga4MeasurementId] = false;

    if (validGA) {
      loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CONFIG.ga4MeasurementId)}`, 'npa-ga4');
      gtag('js', new Date());
      gtag('config', CONFIG.ga4MeasurementId, {
        anonymize_ip: true,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        transport_type: 'beacon'
      });
    }

    if (validClarity) {
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, 'clarity', 'script', CONFIG.clarityProjectId);
    }
  }

  function track(eventName, params = {}) {
    if (!validGA || readConsent() !== 'accepted') return;
    gtag('event', eventName, params);
  }

  window.npaTrack = track;

  function setConsent(value) {
    writeConsent(value);
    if (value === 'declined') {
      window['ga-disable-' + CONFIG.ga4MeasurementId] = true;
      window.gtag?.('consent', 'update', {analytics_storage:'denied'});
      window.clarity?.('consent', false);
      clearAnalyticsCookies();
      if (analyticsLoaded) { location.reload(); return; }
    }
    if (value === 'accepted') loadAnalytics();
    document.querySelector('.cookie-banner')?.remove();
  }

  function showConsent(force = false) {
    if (!validGA && !validClarity) return;
    if (!force && readConsent()) return;
    if (document.querySelector('.cookie-banner')) return;

    const el = document.createElement('aside');
    el.className = 'cookie-banner';
    el.setAttribute('aria-label', 'Analytics cookie choices');
    el.innerHTML = `
      <div class="cookie-banner-copy">
        <strong>Help us improve the website</strong>
        <p>Optional analytics help us understand which pages are useful and how visitors find Nicole. You can accept or decline.</p>
      </div>
      <div class="cookie-banner-actions">
        <button type="button" class="cookie-btn cookie-btn-secondary" data-cookie-choice="declined">Decline</button>
        <button type="button" class="cookie-btn cookie-btn-primary" data-cookie-choice="accepted">Accept analytics</button>
      </div>`;
    document.body.appendChild(el);
    el.querySelectorAll('[data-cookie-choice]').forEach(btn => {
      btn.addEventListener('click', () => setConsent(btn.dataset.cookieChoice));
    });
  }

  function addCookieSettingsLink() {
    const footer = document.querySelector('.footer-legal, .footer-bottom, .site-footer');
    if ((!validGA && !validClarity) || !footer || document.querySelector('.cookie-settings-link')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'cookie-settings-link';
    button.textContent = 'Cookie settings';
    button.addEventListener('click', () => {
      showConsent(true);
      document.querySelector('.cookie-banner')?.scrollIntoView({behavior:'smooth', block:'end'});
    });
    footer.appendChild(button);
  }

  function classifyLink(a) {
    const href = (a.getAttribute('href') || '').trim();
    if (/wa\.me|whatsapp\.com/i.test(href)) return ['whatsapp_click', 'WhatsApp'];
    if (/^tel:/i.test(href)) return ['phone_click', 'Phone'];
    if (/^mailto:/i.test(href)) return ['email_click', 'Email'];
    if (/contact\.html/i.test(href)) return ['contact_click', (a.textContent || 'Contact').trim().slice(0,80)];
    return null;
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const result = classifyLink(a);
    if (!result) return;
    const [eventName, label] = result;
    track(eventName, {
      link_text: label,
      link_url: a.href,
      page_path: location.pathname
    });
  }, {passive:true});

  document.addEventListener('DOMContentLoaded', () => {
    const consent = readConsent();
    if (consent === 'accepted') loadAnalytics();
    else showConsent();
    addCookieSettingsLink();

    // Count only successful Formspree submissions, not direct visits to thank-you.html.
    try {
    if (/thank-you\.html$/i.test(location.pathname) && sessionStorage.getItem('npa_form_success') === '1') {
      sessionStorage.removeItem('npa_form_success');
      track('generate_lead', { method: 'website_form', page_path: location.pathname });
    }
    } catch {}
  });
})();
