document.documentElement.classList.add("js-enabled");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const initProjectPreviews = () => {
    const previews = document.querySelectorAll(".project-preview");

    previews.forEach((preview) => {
        if (preview.dataset.loaded === "true") return;

        let src = preview.dataset.previewSrc || "";
        if (preview.dataset.type === "figma") {
            const raw = preview.dataset.figmaUrl || "";
            src = `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(raw)}`;
        }

        if (!src) return;

        const iframe = document.createElement("iframe");
        iframe.src = src;
        iframe.loading = "eager"; // Load immediately, not lazy
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = "no-referrer-when-downgrade";
        iframe.title = preview.querySelector(".preview-label")?.innerText || "Live preview";

        // Preserve the label and action area, append iframe below.
        const actions = preview.querySelector(".preview-actions");
        preview.appendChild(iframe);
        if (actions) preview.appendChild(actions);

        preview.dataset.loaded = "true";
    });
};

const initScrollReveal = () => {
    const revealItems = document.querySelectorAll("main section, main .card, main .project-preview");
    if (!revealItems.length) return;

    revealItems.forEach((item) => {
        item.classList.add("scroll-reveal");
    });

    if (prefersReducedMotion) {
        revealItems.forEach((item) => item.classList.add("is-visible"));
        return;
    }

    let lastScrollY = window.scrollY;
    let isScrollingDown = null;
    const revealThreshold = 0.15;

    window.addEventListener(
        "scroll",
        () => {
            const currentScrollY = window.scrollY;
            if (currentScrollY === lastScrollY) return;
            isScrollingDown = currentScrollY > lastScrollY;
            lastScrollY = currentScrollY;
        },
        { passive: true }
    );

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                if (isScrollingDown === false) {
                    entry.target.classList.add("no-reveal");
                    entry.target.classList.add("is-visible");
                    requestAnimationFrame(() => {
                        entry.target.classList.remove("no-reveal");
                    });
                } else {
                    entry.target.classList.add("is-visible");
                }

                observer.unobserve(entry.target);
            });
        },
        { threshold: revealThreshold, rootMargin: "0px 0px -10% 0px" }
    );

    revealItems.forEach((item) => observer.observe(item));
};

// Auto-load live previews for project cards immediately
document.addEventListener("DOMContentLoaded", () => {
    initProjectPreviews();
    initScrollReveal();
});

// Back to top button visibility
const backToTop = document.querySelector('.back-to-top');
if (backToTop) {
    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            backToTop.classList.add('show');
        } else {
            backToTop.classList.remove('show');
        }
    });
}
