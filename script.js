/* Nicole Platten Accounting — site behaviour
   Vanilla, dependency-free, defensive. Every module no-ops if its markup
   is absent, so the same file can be loaded on every page. */

(function () {
  "use strict";

  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* --- Current year ---------------------------------------------------- */
  var year = $("#year");
  if (year) year.textContent = String(new Date().getFullYear());

  /* --- Sticky header state --------------------------------------------- */
  var header = $("#siteHeader");
  if (header) {
    var ticking = false;
    var onScroll = function () {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function () {
        header.classList.toggle("is-stuck", window.scrollY > 16);
        ticking = false;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* --- Mobile navigation ------------------------------------------------ */
  var nav = $("#primaryNav");
  var navToggle = $("#navToggle");

  if (nav && navToggle) {
    var setNav = function (open) {
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("is-locked", open);
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    navToggle.addEventListener("click", function () {
      setNav(navToggle.getAttribute("aria-expanded") !== "true");
    });

    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) setNav(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && navToggle.getAttribute("aria-expanded") === "true") {
        setNav(false);
        navToggle.focus();
      }
    });

    // Drop the mobile state if the viewport grows past the breakpoint.
    var wide = window.matchMedia("(min-width: 901px)");
    var onWide = function (event) { if (event.matches) setNav(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide);
    else if (wide.addListener) wide.addListener(onWide);
  }

  /* --- Scroll reveal ---------------------------------------------------- */
  var revealables = $$("[data-reveal]");

  if (revealables.length) {
    if (!("IntersectionObserver" in window) || reducedMotion.matches) {
      revealables.forEach(function (el) { el.classList.add("is-in"); });
    } else {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          revealObserver.unobserve(entry.target);
        });
      }, { threshold: 0.1, rootMargin: "0px 0px -60px 0px" });

      revealables.forEach(function (el) { revealObserver.observe(el); });
    }
  }

  /* --- Section highlighting in the nav ---------------------------------- */
  var sections = $$("main section[id]");
  var navAnchors = $$("#primaryNav a[href^='#']");

  if (sections.length && navAnchors.length && "IntersectionObserver" in window) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = "#" + entry.target.id;
        navAnchors.forEach(function (anchor) {
          if (anchor.getAttribute("href") === id) anchor.setAttribute("aria-current", "true");
          else anchor.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-40% 0px -55% 0px" });

    sections.forEach(function (section) { sectionObserver.observe(section); });
  }

  /* --- FAQ accordion ---------------------------------------------------- */
  var faqTriggers = $$(".faq-trigger");

  faqTriggers.forEach(function (trigger) {
    trigger.addEventListener("click", function () {
      var item = trigger.closest(".faq-item");
      if (!item) return;
      var willOpen = trigger.getAttribute("aria-expanded") !== "true";

      faqTriggers.forEach(function (other) {
        var otherItem = other.closest(".faq-item");
        if (otherItem) otherItem.classList.remove("is-open");
        other.setAttribute("aria-expanded", "false");
      });

      if (willOpen) {
        item.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
      }
    });
  });

  /* --- Testimonials ------------------------------------------------------ */
  var quoteEl  = $("#testimonialQuote");
  var authorEl = $("#testimonialAuthor");
  var countEl  = $("#testimonialCount");
  var bodyEl   = $("#testimonialBody");
  var prevBtn  = $("#testimonialPrev");
  var nextBtn  = $("#testimonialNext");

  if (quoteEl && authorEl && countEl && bodyEl && prevBtn && nextBtn) {
    var testimonials = [
      {
        quote: "“The whole process was straightforward and stress-free. Nicole explained everything clearly and helped me feel confident.”",
        author: "Sole trader client"
      },
      {
        quote: "“Nicole prepared our financial statements and corporation tax return for our property company, handling everything from start to finish.”",
        author: "Property investment client"
      },
      {
        quote: "“Professional, reliable and quick to respond. Switching accountants was much easier than expected.”",
        author: "Limited company director"
      }
    ];

    var index = 0;
    var swapDelay = reducedMotion.matches ? 0 : 220;

    var render = function () {
      var apply = function () {
        quoteEl.textContent = testimonials[index].quote;
        authorEl.textContent = testimonials[index].author;
        countEl.textContent = (index + 1) + " — " + testimonials.length;
        bodyEl.classList.remove("is-swapping");
      };

      if (!swapDelay) { apply(); return; }
      bodyEl.classList.add("is-swapping");
      window.setTimeout(apply, swapDelay);
    };

    var step = function (delta) {
      index = (index + delta + testimonials.length) % testimonials.length;
      render();
    };

    prevBtn.addEventListener("click", function () { step(-1); });
    nextBtn.addEventListener("click", function () { step(1); });

    countEl.textContent = "1 — " + testimonials.length;
  }

  /* --- Contact form -----------------------------------------------------
     Submitted with fetch so we control the redirect ourselves. Formspree's
     legacy _next field is not honoured on all plans, which sent people to
     Formspree's own "Thanks!" page instead of ours. Without JS the form
     still posts natively, so nothing is lost. */
  var form = $("#contactForm");
  var submit = $("#formSubmit");
  var formError = $("#formError");

  var showError = function (message) {
    if (!formError) return;
    formError.textContent = message;
    formError.hidden = false;
  };

  var resetButton = function () {
    if (!submit) return;
    submit.removeAttribute("data-sending");
    submit.disabled = false;
  };

  if (form && submit) {
    form.addEventListener("submit", function (event) {
      if (form.checkValidity && !form.checkValidity()) return;

      if (!window.fetch || !window.FormData) return;   // native POST fallback

      event.preventDefault();
      if (formError) formError.hidden = true;
      submit.setAttribute("data-sending", "true");
      submit.disabled = true;

      window.fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" }
      }).then(function (response) {
        if (response.ok) {
          window.location.href = "/thank-you.html";
          return;
        }
        return response.json().then(function (data) {
          var detail = data && data.errors && data.errors.length
            ? data.errors.map(function (e) { return e.message; }).join(" ")
            : "";
          throw new Error(detail);
        }, function () { throw new Error(""); });
      }).catch(function (error) {
        resetButton();
        showError(
          (error && error.message ? error.message + " " : "") +
          "Sorry — that didn't send. Please call 07492 990955 or email nicoleplatten@outlook.com and I'll pick it up from there."
        );
      });
    });
  }
}());
