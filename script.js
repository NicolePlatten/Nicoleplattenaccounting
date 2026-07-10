const siteHeader = document.getElementById("siteHeader");
const navLinks = document.getElementById("navLinks");
const menuButton = document.getElementById("menuButton");
const scrollProgress = document.getElementById("scrollProgress");
const currentYear = document.getElementById("currentYear");
const contactForm = document.getElementById("contactForm");
const submitButton = contactForm.querySelector(".form-submit");
const portraitFrame = document.getElementById("portraitFrame");

currentYear.textContent = new Date().getFullYear();

function closeMenu() {
  navLinks.classList.remove("open");
  menuButton.classList.remove("open");
  document.body.classList.remove("menu-open");

  menuButton.setAttribute(
    "aria-expanded",
    "false"
  );

  menuButton.setAttribute(
    "aria-label",
    "Open navigation menu"
  );
}

menuButton.addEventListener("click", () => {
  const open = navLinks.classList.toggle("open");

  menuButton.classList.toggle(
    "open",
    open
  );

  document.body.classList.toggle(
    "menu-open",
    open
  );

  menuButton.setAttribute(
    "aria-expanded",
    String(open)
  );

  menuButton.setAttribute(
    "aria-label",
    open
      ? "Close navigation menu"
      : "Open navigation menu"
  );
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeMenu();
  }
});

document
  .querySelectorAll('a[href^="#"]')
  .forEach(link => {
    link.addEventListener("click", event => {
      const selector =
        link.getAttribute("href");

      if (
        !selector ||
        selector === "#"
      ) {
        return;
      }

      const target =
        document.querySelector(selector);

      if (!target) {
        return;
      }

      event.preventDefault();
      closeMenu();

      target.scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });
  });

document
  .querySelectorAll(".faq-question")
  .forEach(button => {
    button.addEventListener("click", () => {
      const item =
        button.closest(".faq-item");

      const alreadyOpen =
        item.classList.contains("active");

      document
        .querySelectorAll(".faq-item")
        .forEach(faq => {
          faq.classList.remove("active");

          const faqButton =
            faq.querySelector(".faq-question");

          faqButton.setAttribute(
            "aria-expanded",
            "false"
          );
        });

      if (!alreadyOpen) {
        item.classList.add("active");

        button.setAttribute(
          "aria-expanded",
          "true"
        );
      }
    });
  });

const revealElements =
  document.querySelectorAll(".reveal");

if (
  "IntersectionObserver" in window &&
  !window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches
) {
  const revealObserver =
    new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) {
            return;
          }

          entry.target.classList.add(
            "is-visible"
          );

          revealObserver.unobserve(
            entry.target
          );
        });
      },
      {
        threshold: 0.12,
        rootMargin:
          "0px 0px -40px 0px"
      }
    );

  revealElements.forEach(element => {
    revealObserver.observe(element);
  });
} else {
  revealElements.forEach(element => {
    element.classList.add("is-visible");
  });
}

const sections =
  document.querySelectorAll(
    "main section[id]"
  );

const navAnchors =
  document.querySelectorAll(
    ".nav-links a"
  );

if ("IntersectionObserver" in window) {
  const sectionObserver =
    new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) {
            return;
          }

          const id =
            entry.target.getAttribute("id");

          navAnchors.forEach(anchor => {
            anchor.classList.toggle(
              "active",
              anchor.getAttribute("href") ===
                `#${id}`
            );
          });
        });
      },
      {
        rootMargin:
          "-35% 0px -55% 0px",
        threshold: 0
      }
    );

  sections.forEach(section => {
    sectionObserver.observe(section);
  });
}

function updateScrollEffects() {
  const scrollTop =
    window.scrollY;

  const maxScroll =
    document.documentElement.scrollHeight -
    window.innerHeight;

  const progress =
    maxScroll > 0
      ? scrollTop / maxScroll
      : 0;

  scrollProgress.style.transform =
    `scaleX(${progress})`;

  siteHeader.classList.toggle(
    "scrolled",
    scrollTop > 18
  );
}

updateScrollEffects();

window.addEventListener(
  "scroll",
  updateScrollEffects,
  {
    passive: true
  }
);

contactForm.addEventListener(
  "submit",
  () => {
    submitButton.classList.add(
      "loading"
    );

    submitButton.disabled = true;
  }
);

const reviews = [
  {
    quote:
      "“The whole process was straightforward and stress-free. Nicole explained everything clearly and helped me feel confident.”",
    author:
      "Sole trader client"
  },
  {
    quote:
      "“Nicole prepared our financial statements and corporation tax return for our property company, handling everything from start to finish.”",
    author:
      "Property investment client"
  },
  {
    quote:
      "“Professional, reliable and quick to respond. Switching accountants was much easier than expected.”",
    author:
      "Limited company director"
  }
];

let currentReview = 0;

const reviewQuote =
  document.getElementById(
    "reviewQuote"
  );

const reviewAuthor =
  document.getElementById(
    "reviewAuthor"
  );

const reviewPosition =
  document.getElementById(
    "reviewPosition"
  );

const reviewPrev =
  document.getElementById(
    "reviewPrev"
  );

const reviewNext =
  document.getElementById(
    "reviewNext"
  );

function renderReview() {
  reviewQuote.style.opacity = "0";
  reviewAuthor.style.opacity = "0";

  window.setTimeout(() => {
    reviewQuote.textContent =
      reviews[currentReview].quote;

    reviewAuthor.textContent =
      reviews[currentReview].author;

    reviewPosition.textContent =
      `${currentReview + 1} / ${reviews.length}`;

    reviewQuote.style.opacity = "1";
    reviewAuthor.style.opacity = "1";
  }, 180);
}

reviewQuote.style.transition =
  "opacity .25s ease";

reviewAuthor.style.transition =
  "opacity .25s ease";

reviewPrev.addEventListener(
  "click",
  () => {
    currentReview =
      (
        currentReview -
        1 +
        reviews.length
      ) %
      reviews.length;

    renderReview();
  }
);

reviewNext.addEventListener(
  "click",
  () => {
    currentReview =
      (
        currentReview +
        1
      ) %
      reviews.length;

    renderReview();
  }
);

if (
  portraitFrame &&
  window.matchMedia(
    "(pointer: fine)"
  ).matches &&
  !window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches
) {
  const heroMedia =
    portraitFrame.parentElement;

  heroMedia.addEventListener(
    "mousemove",
    event => {
      const bounds =
        heroMedia.getBoundingClientRect();

      const x =
        (
          event.clientX -
          bounds.left
        ) /
          bounds.width -
        0.5;

      const y =
        (
          event.clientY -
          bounds.top
        ) /
          bounds.height -
        0.5;

      portraitFrame.style.transform =
        `rotateY(${x * 3.5}deg)
         rotateX(${y * -3.5}deg)
         translate3d(
           ${x * 5}px,
           ${y * 4}px,
           0
         )`;
    }
  );

  heroMedia.addEventListener(
    "mouseleave",
    () => {
      portraitFrame.style.transform = "";
    }
  );
}