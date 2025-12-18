document.documentElement.classList.add("js-enabled");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let lazyFadeDurationMs = 800;
let lastScrollY = window.scrollY;
let lastScrollTime = performance.now();

const updateLazyFadeDuration = (speed) => {
    // speed: px per ms
    const maxDuration = 800;
    const minDuration = 80;
    const clampedSpeed = Math.min(Math.max(speed, 0), 3); // cap extreme flings
    const duration = Math.max(minDuration, Math.min(maxDuration, maxDuration - clampedSpeed * 600));
    lazyFadeDurationMs = duration;
    document.documentElement.style.setProperty("--lazy-fade-duration", `${duration}ms`);
};

window.addEventListener("scroll", () => {
    const now = performance.now();
    const dy = Math.abs(window.scrollY - lastScrollY);
    const dt = now - lastScrollTime || 1;
    const speed = dy / dt; // px per ms
    updateLazyFadeDuration(speed);
    lastScrollY = window.scrollY;
    lastScrollTime = now;
}, { passive: true });

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
    const revealItems = document.querySelectorAll(
        "main section:not(.no-reveal):not(.lazy-render), main .card:not(.no-reveal):not(.lazy-render), main .project-preview:not(.no-reveal):not(.lazy-render)"
    );
    if (!revealItems.length) return;

    revealItems.forEach((item) => {
        item.classList.add("scroll-reveal");
    });

    if (prefersReducedMotion) {
        revealItems.forEach((item) => item.classList.add("is-visible"));
        return;
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const viewportBottom = (window.innerHeight || document.documentElement.clientHeight);
                const elemTop = entry.boundingClientRect.top;
                const isPastTop = viewportBottom >= elemTop;
                const shouldShow = isPastTop;

                entry.target.classList.toggle("is-visible", shouldShow);
            });
        },
        {
            threshold: [0],
            rootMargin: "0px",
        }
    );

    revealItems.forEach((item) => observer.observe(item));
};

const initLazyRender = () => {
    const lazyList = Array.from(document.querySelectorAll(".lazy-render"));
    if (!lazyList.length) return;

    const renderFromBottom = (el) => {
        if (el.dataset.rendered === "true") return;

        // cancel any fade-out in progress
        el.classList.remove("lazy-fade-out");
        el.dataset.fading = "false";
        el.style.transitionDuration = `${lazyFadeDurationMs}ms`;

        const html = el.dataset.lazyContent || "";
        if (html) {
            const wrapper = document.createElement("div");
            wrapper.innerHTML = html;
            const frag = document.createDocumentFragment();
            while (wrapper.firstChild) {
                frag.appendChild(wrapper.firstChild);
            }
            el.appendChild(frag);
        }

        el.dataset.rendered = "true";
        el.dataset.everRendered = "true";
        if (el.dataset.lazyMinHeight) {
            el.style.minHeight = "";
        }
        el.classList.remove("lazy-render-empty");
        // restart fade by removing and re-adding the class
        el.classList.remove("lazy-visible");
        // force reflow so the transition runs when we add the class back
        void el.offsetWidth;
        el.classList.add("lazy-visible");
    };

    const teardownIfAbove = (el) => {
        if (el.dataset.rendered !== "true") return;
        if (el.dataset.fading === "true") return;

        el.dataset.fading = "true";
        el.classList.remove("lazy-visible");
        el.style.transitionDuration = `${lazyFadeDurationMs}ms`;
        el.classList.add("lazy-fade-out");

        const teardownDelay = lazyFadeDurationMs + 100; // slightly above CSS transition (ms)
        setTimeout(() => {
            // if it was re-rendered during the fade, abort teardown
            if (!el.classList.contains("lazy-fade-out")) return;

            el.innerHTML = "";
            if (el.dataset.lazyMinHeight) {
                el.style.minHeight = el.dataset.lazyMinHeight;
            }
            el.dataset.rendered = "false";
            el.dataset.fading = "false";
            el.classList.add("lazy-render-empty");
            el.classList.remove("lazy-fade-out");
        }, teardownDelay);
    };

    const enterOffset = -180; // px: delay render until the element is closer to the viewport (keeps more off-screen hidden)
    const exitOffset = 0; // px: only tear down after the element is well above the viewport to avoid abrupt disappearances
    let nextAllowIndex = 0; // gating for first-time render order

    lazyList.forEach((el) => {
        if (el.dataset.rendered === "true") return;
        el.dataset.lazyContent = el.innerHTML;
        const rect = el.getBoundingClientRect();
        const fallbackHeight = rect.height || el.scrollHeight;
        if (fallbackHeight > 0) {
            el.dataset.lazyMinHeight = `${fallbackHeight}px`;
            el.style.minHeight = el.dataset.lazyMinHeight;
        }
        el.innerHTML = "";
        el.dataset.rendered = "false";
        el.dataset.fading = "false";
        el.dataset.everRendered = "false";
        el.classList.add("lazy-render-empty");
    });

    const evaluateLazy = () => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        lazyList.forEach((el, idx) => {
            // Only attempt render if this item is at or above the next allowed index (enforces order)
            if (idx > nextAllowIndex) {
                teardownIfAbove(el);
                return;
            }

            const rect = el.getBoundingClientRect();
            const offscreenBelow = rect.top - enterOffset > viewportHeight;
            const offscreenAbove = rect.bottom + exitOffset < 0;

            // Require the previous lazy item (if any) to have rendered at least once
            const prevEverRendered =
                idx === 0 ? true : lazyList[idx - 1].dataset.everRendered === "true";

            const shouldRender = prevEverRendered && !offscreenBelow && !offscreenAbove;
            if (shouldRender) {
                const firstTime = el.dataset.everRendered !== "true";
                renderFromBottom(el);
                if (firstTime) {
                    nextAllowIndex = Math.max(nextAllowIndex, idx + 1);
                }
            } else {
                teardownIfAbove(el);
            }
        });
    };

    evaluateLazy();
    window.addEventListener("scroll", evaluateLazy, { passive: true });
    window.addEventListener("resize", evaluateLazy);
    // Fallback timer and visibility change to catch fast flings or missed events
    setInterval(evaluateLazy, 250);
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden) evaluateLazy();
    });
};

// Auto-load live previews for project cards immediately
    document.addEventListener("DOMContentLoaded", () => {
        initProjectPreviews();
        initLazyRender();
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
