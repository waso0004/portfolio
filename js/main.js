document.documentElement.classList.add("js-enabled");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pageTransitionFlagKey = "page-transition-pending";

// Immediately cover the page if we're coming from a transition (before anything renders)
const shouldRevealOnLoad = sessionStorage.getItem(pageTransitionFlagKey) === "true";
let earlyOverlay = null;
if (shouldRevealOnLoad && !prefersReducedMotion) {
    earlyOverlay = document.createElement("div");
    earlyOverlay.id = "early-page-cover";
    earlyOverlay.style.cssText = "position:fixed;inset:0;background:#111;z-index:99999;";
    document.documentElement.appendChild(earlyOverlay);
}

let lazyFadeDurationMs = 800;
let lastScrollY = window.scrollY;
let lastScrollTime = performance.now();
const gsapCdnUrl = "https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js";
let gsapLoaderPromise = null;

const loadGsap = () => {
    if (window.gsap) {
        return Promise.resolve(window.gsap);
    }

    if (gsapLoaderPromise) {
        return gsapLoaderPromise;
    }

    gsapLoaderPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = gsapCdnUrl;
        script.async = true;
        script.onload = () => {
            if (window.gsap) {
                resolve(window.gsap);
            } else {
                reject(new Error("GSAP loaded but window.gsap is missing"));
            }
        };
        script.onerror = () => reject(new Error("Failed to load GSAP"));
        document.head.appendChild(script);
    });

    return gsapLoaderPromise;
};

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

const initPageTransitions = () => {
    if (prefersReducedMotion) {
        sessionStorage.removeItem(pageTransitionFlagKey);
        if (earlyOverlay) {
            earlyOverlay.remove();
            earlyOverlay = null;
        }
        return;
    }

    // Clear the flag now that we've read it at the top of the file
    sessionStorage.removeItem(pageTransitionFlagKey);
    
    // LocalStorage cache for pages
    const PAGE_CACHE_PREFIX = "page-cache-";
    const PAGE_CACHE_TIME_PREFIX = "page-cache-time-";
    const CACHE_DURATION = 1000 * 60 * 60; // 1 hour
    
    const getCachedPage = (url) => {
        try {
            const key = PAGE_CACHE_PREFIX + url;
            const timeKey = PAGE_CACHE_TIME_PREFIX + url;
            const cached = localStorage.getItem(key);
            const cachedTime = localStorage.getItem(timeKey);
            
            if (cached && cachedTime) {
                const age = Date.now() - parseInt(cachedTime, 10);
                if (age < CACHE_DURATION) {
                    return cached;
                }
                // Cache expired, remove it
                localStorage.removeItem(key);
                localStorage.removeItem(timeKey);
            }
        } catch (e) {
            // localStorage might be full or disabled
        }
        return null;
    };
    
    const setCachedPage = (url, html) => {
        try {
            const key = PAGE_CACHE_PREFIX + url;
            const timeKey = PAGE_CACHE_TIME_PREFIX + url;
            localStorage.setItem(key, html);
            localStorage.setItem(timeKey, Date.now().toString());
        } catch (e) {
            // localStorage might be full, clear old caches
            try {
                Object.keys(localStorage).forEach((k) => {
                    if (k.startsWith(PAGE_CACHE_PREFIX) || k.startsWith(PAGE_CACHE_TIME_PREFIX)) {
                        localStorage.removeItem(k);
                    }
                });
                localStorage.setItem(PAGE_CACHE_PREFIX + url, html);
                localStorage.setItem(PAGE_CACHE_TIME_PREFIX + url, Date.now().toString());
            } catch (e2) {
                // Give up on caching
            }
        }
    };
    
    // Cache current page on load
    setCachedPage(window.location.href, document.documentElement.outerHTML);

    loadGsap()
        .then((gsapLib) => {
            const overlay = document.createElement("div");
            overlay.className = "page-transition";
            overlay.setAttribute("aria-hidden", "true");
            overlay.innerHTML = `
                <svg class="page-transition__svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMin slice" style="transform: scaleY(-1);">
                    <defs>
                        <linearGradient id="page-transition-gradient" x1="0" y1="0" x2="99" y2="99" gradientUnits="userSpaceOnUse">
                            <stop offset="0.2" stop-color="rgba(0, 0, 0, 1)" />
                            <stop offset="0.7" stop-color="rgba(0, 0, 0, 1)" />
                        </linearGradient>
                    </defs>
                    <path class="page-transition__path" stroke="url(#page-transition-gradient)" fill="url(#page-transition-gradient)" d="M 0 100 V 100 Q 50 100 100 100 V 100 z" />
                </svg>
            `;
            document.body.appendChild(overlay);

            const path = overlay.querySelector(".page-transition__path");
            const shapes = {
                hidden: "M 0 100 V 100 Q 50 100 100 100 V 100 z",
                mid: "M 0 100 V 50 Q 50 0 100 50 V 100 z",
                full: "M 0 100 V 0 Q 50 0 100 0 V 100 z",
            };

            const tl = gsapLib.timeline({ paused: true });
            tl.to(path, { attr: { d: shapes.mid }, ease: "power2.in", duration: 0.45 })
                .to(path, { attr: { d: shapes.full }, ease: "power2.out", duration: 0.45 });

            let pendingNavigation = null;
            let isNavigating = false;

            const svg = overlay.querySelector(".page-transition__svg");
            
            // Random directions: top, bottom, left, right
            const directions = [
                { name: 'top', transform: 'scaleY(-1)', left: '0', top: '-200%', width: '100%', height: '300%', marginLeft: '0', marginTop: '0' },
                { name: 'bottom', transform: 'scaleY(1)', left: '0', top: '0', width: '100%', height: '300%', marginLeft: '0', marginTop: '0' },
                { name: 'left', transform: 'rotate(90deg) scaleY(-1)', left: '50%', top: '50%', width: '300%', height: '300%', marginLeft: '-150%', marginTop: '-150%' },
                { name: 'right', transform: 'rotate(-90deg) scaleY(-1)', left: '50%', top: '50%', width: '300%', height: '300%', marginLeft: '-150%', marginTop: '-150%' },
            ];
            
            const applyDirection = (dir) => {
                svg.style.transform = dir.transform;
                svg.style.left = dir.left;
                svg.style.top = dir.top;
                svg.style.width = dir.width;
                svg.style.height = dir.height;
                svg.style.marginLeft = dir.marginLeft;
                svg.style.marginTop = dir.marginTop;
            };
            
            const swapPageContent = (html, url) => {
                const parser = new DOMParser();
                const newDoc = parser.parseFromString(html, "text/html");
                
                // Update title
                document.title = newDoc.title;
                
                // Swap main content
                const newMain = newDoc.querySelector("main");
                const currentMain = document.querySelector("main");
                if (newMain && currentMain) {
                    currentMain.innerHTML = newMain.innerHTML;
                }
                
                // Swap header (for active nav state)
                const newHeader = newDoc.querySelector("header");
                const currentHeader = document.querySelector("header");
                if (newHeader && currentHeader) {
                    currentHeader.innerHTML = newHeader.innerHTML;
                }
                
                // Swap footer if different
                const newFooter = newDoc.querySelector("footer");
                const currentFooter = document.querySelector("footer");
                if (newFooter && currentFooter) {
                    currentFooter.innerHTML = newFooter.innerHTML;
                }
                
                // Update URL
                window.history.pushState({ url: url }, "", url);
                
                // Scroll to top
                window.scrollTo(0, 0);
                
                // Re-initialize components
                initProjectPreviews();
                initLazyRender();
                initScrollReveal();
                
                // Re-initialize Bootstrap components (collapse, offcanvas, etc.)
                if (window.bootstrap) {
                    // Initialize all collapse elements
                    document.querySelectorAll('[data-bs-toggle="collapse"]').forEach((el) => {
                        new bootstrap.Collapse(el, { toggle: false });
                    });
                    // Initialize all offcanvas elements
                    document.querySelectorAll('.offcanvas').forEach((el) => {
                        new bootstrap.Offcanvas(el);
                    });
                }
                
                // Re-attach link handlers to new content
                document.querySelectorAll("a[href]").forEach((link) => {
                    link.removeEventListener("click", handleLinkClick);
                    link.addEventListener("click", handleLinkClick);
                });
                
                // Cache the new page
                setCachedPage(url, html);
            };
            
            const fetchPage = async (url) => {
                // Check cache first
                const cached = getCachedPage(url);
                if (cached) {
                    return cached;
                }
                
                // Fetch from network
                const response = await fetch(url);
                if (!response.ok) throw new Error("Failed to fetch page");
                const html = await response.text();
                return html;
            };
            
            const revealPage = () => {
                const revealTl = gsapLib.timeline();
                revealTl.to(path, { attr: { d: shapes.mid }, ease: "power2.in", duration: 0.45 })
                    .to(path, { attr: { d: shapes.hidden }, ease: "power2.out", duration: 0.45 })
                    .eventCallback("onComplete", () => {
                        overlay.classList.remove("is-active");
                        overlay.style.pointerEvents = "none";
                        isNavigating = false;
                    });
            };

            const coverAndNavigate = async (href) => {
                if (!href || isNavigating) return;

                isNavigating = true;
                pendingNavigation = href;
                
                // Pick a random direction
                const dir = directions[Math.floor(Math.random() * directions.length)];
                applyDirection(dir);
                
                // Store direction for reveal
                sessionStorage.setItem("page-transition-dir", JSON.stringify(dir));
                
                overlay.classList.add("is-active");
                overlay.style.pointerEvents = "auto";
                
                // Start fetching page in parallel with animation
                const fetchPromise = fetchPage(href);
                
                // Play cover animation
                tl.play(0);
                
                // Wait for both animation and fetch to complete
                const animationComplete = new Promise((resolve) => {
                    tl.eventCallback("onComplete", resolve);
                });
                
                try {
                    const [, html] = await Promise.all([animationComplete, fetchPromise]);
                    
                    // Swap content
                    swapPageContent(html, href);
                    
                    // Reveal the new page
                    revealPage();
                } catch (error) {
                    // Fallback to traditional navigation on error
                    window.location.href = href;
                }
            };

            const shouldAnimateLink = (link) => {
                const href = link.getAttribute("href") || "";
                if (!href || href.startsWith("#")) return false;
                if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;

                const target = link.getAttribute("target");
                if (target && target !== "_self") return false;

                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin) return false;

                // Do not run the transition if we're only moving within the same page
                if (url.pathname === window.location.pathname && url.hash) return false;

                return true;
            };

            const handleLinkClick = (event) => {
                if (event.defaultPrevented) return;
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

                const link = event.currentTarget;
                if (!shouldAnimateLink(link)) return;

                event.preventDefault();
                
                coverAndNavigate(new URL(link.getAttribute("href"), window.location.href).href);
            };

            document.querySelectorAll("a[href]").forEach((link) => {
                link.addEventListener("click", handleLinkClick);
            });
            
            // Handle browser back/forward buttons
            window.addEventListener("popstate", async (event) => {
                if (isNavigating) return;
                
                const url = window.location.href;
                isNavigating = true;
                
                // Pick a random direction
                const dir = directions[Math.floor(Math.random() * directions.length)];
                applyDirection(dir);
                
                overlay.classList.add("is-active");
                overlay.style.pointerEvents = "auto";
                
                // Start fetching and animating
                const fetchPromise = fetchPage(url);
                tl.play(0);
                
                const animationComplete = new Promise((resolve) => {
                    tl.eventCallback("onComplete", resolve);
                });
                
                try {
                    const [, html] = await Promise.all([animationComplete, fetchPromise]);
                    
                    // Swap content without pushing state (we're responding to popstate)
                    const parser = new DOMParser();
                    const newDoc = parser.parseFromString(html, "text/html");
                    
                    document.title = newDoc.title;
                    
                    const newMain = newDoc.querySelector("main");
                    const currentMain = document.querySelector("main");
                    if (newMain && currentMain) {
                        currentMain.innerHTML = newMain.innerHTML;
                    }
                    
                    const newHeader = newDoc.querySelector("header");
                    const currentHeader = document.querySelector("header");
                    if (newHeader && currentHeader) {
                        currentHeader.innerHTML = newHeader.innerHTML;
                    }
                    
                    const newFooter = newDoc.querySelector("footer");
                    const currentFooter = document.querySelector("footer");
                    if (newFooter && currentFooter) {
                        currentFooter.innerHTML = newFooter.innerHTML;
                    }
                    
                    window.scrollTo(0, 0);
                    
                    initProjectPreviews();
                    initLazyRender();
                    initScrollReveal();
                    
                    // Re-initialize Bootstrap components
                    if (window.bootstrap) {
                        document.querySelectorAll('[data-bs-toggle="collapse"]').forEach((el) => {
                            new bootstrap.Collapse(el, { toggle: false });
                        });
                        document.querySelectorAll('.offcanvas').forEach((el) => {
                            new bootstrap.Offcanvas(el);
                        });
                    }
                    
                    document.querySelectorAll("a[href]").forEach((link) => {
                        link.removeEventListener("click", handleLinkClick);
                        link.addEventListener("click", handleLinkClick);
                    });
                    
                    revealPage();
                } catch (error) {
                    window.location.reload();
                }
            });

            if (shouldRevealOnLoad) {
                // Get stored direction from previous page
                const storedDir = sessionStorage.getItem("page-transition-dir");
                sessionStorage.removeItem("page-transition-dir");
                
                if (storedDir) {
                    const dir = JSON.parse(storedDir);
                    applyDirection(dir);
                }
                
                // Set path to full coverage before showing
                path.setAttribute("d", shapes.full);
                overlay.classList.add("is-active");
                overlay.style.pointerEvents = "auto";
                
                // Remove the early cover now that GSAP overlay is ready
                if (earlyOverlay) {
                    earlyOverlay.remove();
                    earlyOverlay = null;
                }
                
                // Reveal animation
                revealPage();
            }
        })
        .catch(() => {
            // If GSAP fails to load, remove early overlay and fall back to default navigation.
            if (earlyOverlay) {
                earlyOverlay.remove();
                earlyOverlay = null;
            }
        });
};

// Auto-load live previews for project cards immediately
document.addEventListener("DOMContentLoaded", () => {
    initProjectPreviews();
    initLazyRender();
    initScrollReveal();
    initPageTransitions();
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
