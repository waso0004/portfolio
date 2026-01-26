document.documentElement.classList.add("js-enabled");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const pageTransitionFlagKey = "page-transition-pending";

// Immediately cover the page if we're coming from a transition (before anything renders)
const shouldRevealOnLoad = sessionStorage.getItem(pageTransitionFlagKey) === "true";
let earlyOverlay = null;
if (shouldRevealOnLoad && !prefersReducedMotion) {
    earlyOverlay = document.createElement("div");
    earlyOverlay.id = "early-page-cover";
    earlyOverlay.style.cssText = "position:fixed;inset:0;background:#000;z-index:99999;";
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

        // Preserve the label, description, and action area. Button should be last.
        const actions = preview.querySelector(".preview-actions");
        const description = preview.querySelector("p.small.text-muted");
        preview.appendChild(iframe);
        if (description) preview.appendChild(description);
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
    
    // Track which groups have completed their animations
    const completedGroups = new Set();
    // Track items waiting for their group turn
    const pendingItems = new Map(); // element -> group number
    
    // Animation duration in ms (matches CSS transition)
    const REVEAL_DURATION = 600;
    
    const canReveal = (item) => {
        const group = item.dataset.revealGroup;
        if (!group) return true; // No group = can always reveal
        
        const groupNum = parseInt(group, 10);
        // Group 1 can always reveal, higher groups need previous groups done
        for (let i = 1; i < groupNum; i++) {
            if (!completedGroups.has(i)) return false;
        }
        return true;
    };
    
    const markGroupComplete = (groupNum) => {
        completedGroups.add(groupNum);
        // Check if any pending items can now be revealed
        pendingItems.forEach((pendingGroup, el) => {
            if (canReveal(el)) {
                el.classList.add("is-visible");
                pendingItems.delete(el);
                // Mark this item's group as completing after animation
                if (pendingGroup) {
                    setTimeout(() => markGroupComplete(pendingGroup), REVEAL_DURATION);
                }
            }
        });
    };

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                const viewportBottom = (window.innerHeight || document.documentElement.clientHeight);
                const elemTop = entry.boundingClientRect.top;
                const isPastTop = viewportBottom >= elemTop;
                const shouldShow = isPastTop;

                if (shouldShow) {
                    const group = entry.target.dataset.revealGroup;
                    const groupNum = group ? parseInt(group, 10) : null;
                    
                    if (canReveal(entry.target)) {
                        entry.target.classList.add("is-visible");
                        // Mark group as complete after animation finishes
                        if (groupNum) {
                            setTimeout(() => markGroupComplete(groupNum), REVEAL_DURATION);
                        }
                    } else {
                        // Store for later when previous group completes
                        pendingItems.set(entry.target, groupNum);
                    }
                } else {
                    entry.target.classList.remove("is-visible");
                    // If hiding, remove from pending
                    pendingItems.delete(entry.target);
                }
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
    
    // Track completed reveal groups and their animation status
    const completedGroups = new Set();
    const animatingGroups = new Set();
    
    // Track teardown status for groups (higher groups must teardown before lower)
    const tornDownGroups = new Set();
    const tearingDownGroups = new Set();
    
    // Find the highest group number in use
    let maxGroupNum = 0;
    lazyList.forEach((el) => {
        const group = el.dataset.revealGroup;
        if (group) {
            maxGroupNum = Math.max(maxGroupNum, parseInt(group, 10));
        }
    });
    
    // Scroll velocity tracking
    let lastScrollY = window.scrollY;
    let lastScrollTime = performance.now();
    let scrollVelocity = 0; // pixels per ms
    
    // Animation duration bounds (in ms)
    const MIN_ANIMATION_DURATION = 50;   // fastest animation when scrolling fast
    const MAX_ANIMATION_DURATION = 250;  // slowest animation when scrolling slow
    
    // Scroll speed thresholds (pixels per ms)
    const SLOW_SCROLL_SPEED = 0.5;   // below this = max duration
    const FAST_SCROLL_SPEED = 3.0;   // above this = min duration
    
    const updateScrollVelocity = () => {
        const now = performance.now();
        const currentScrollY = window.scrollY;
        const timeDelta = now - lastScrollTime;
        
        if (timeDelta > 0) {
            const distance = Math.abs(currentScrollY - lastScrollY);
            scrollVelocity = distance / timeDelta;
        }
        
        lastScrollY = currentScrollY;
        lastScrollTime = now;
    };
    
    const getAnimationDuration = () => {
        // Map scroll velocity to animation duration (inverse relationship)
        // Faster scroll = shorter duration, slower scroll = longer duration
        if (scrollVelocity <= SLOW_SCROLL_SPEED) {
            return MAX_ANIMATION_DURATION;
        }
        if (scrollVelocity >= FAST_SCROLL_SPEED) {
            return MIN_ANIMATION_DURATION;
        }
        
        // Linear interpolation between min and max
        const speedRange = FAST_SCROLL_SPEED - SLOW_SCROLL_SPEED;
        const speedProgress = (scrollVelocity - SLOW_SCROLL_SPEED) / speedRange;
        const durationRange = MAX_ANIMATION_DURATION - MIN_ANIMATION_DURATION;
        
        return MAX_ANIMATION_DURATION - (speedProgress * durationRange);
    };

    const renderFromBottom = (el) => {
        if (el.dataset.rendered === "true") return;

        // cancel any fade-out in progress
        el.classList.remove("lazy-fade-out");
        el.dataset.fading = "false";
        
        const animDuration = getAnimationDuration();
        el.style.transitionDuration = `${animDuration}ms`;

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
        
        // Handle reveal group completion
        const group = el.dataset.revealGroup;
        if (group) {
            const groupNum = parseInt(group, 10);
            // Clear torn down status since we're re-rendering
            tornDownGroups.delete(groupNum);
            
            if (!animatingGroups.has(groupNum)) {
                animatingGroups.add(groupNum);
                // Mark group complete after animation finishes
                setTimeout(() => {
                    animatingGroups.delete(groupNum);
                    completedGroups.add(groupNum);
                    // Trigger re-evaluation for pending items
                    evaluateLazy();
                }, animDuration);
            }
        }
    };
    
    const canRevealGroup = (el) => {
        const group = el.dataset.revealGroup;
        if (!group) return true; // No group = can always reveal
        
        const groupNum = parseInt(group, 10);
        // Group 1 can always reveal, higher groups need previous groups completed (not just started)
        for (let i = 1; i < groupNum; i++) {
            if (!completedGroups.has(i)) return false;
        }
        return true;
    };
    
    const canTeardownGroup = (el) => {
        const group = el.dataset.revealGroup;
        if (!group) return true; // No group = can always teardown
        
        const groupNum = parseInt(group, 10);
        // Lower groups can only teardown after higher groups have torn down
        // e.g., group 1 (Skills) can't teardown until group 2 (Tools) is done
        for (let i = groupNum + 1; i <= maxGroupNum; i++) {
            if (!tornDownGroups.has(i)) return false;
        }
        return true;
    };

    const teardownIfAbove = (el) => {
        if (el.dataset.rendered !== "true") return;
        if (el.dataset.fading === "true") return;
        
        // Check if this group can teardown (higher groups must go first)
        if (!canTeardownGroup(el)) return;

        const animDuration = getAnimationDuration();
        
        el.dataset.fading = "true";
        el.classList.remove("lazy-visible");
        el.style.transitionDuration = `${animDuration}ms`;
        el.classList.add("lazy-fade-out");
        
        // Track teardown for group ordering
        const group = el.dataset.revealGroup;
        if (group) {
            const groupNum = parseInt(group, 10);
            if (!tearingDownGroups.has(groupNum)) {
                tearingDownGroups.add(groupNum);
            }
        }

        const teardownDelay = animDuration + 50; // slightly above transition duration
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
            
            // Mark group as torn down and clear from completed (for re-reveal later)
            if (group) {
                const groupNum = parseInt(group, 10);
                tornDownGroups.add(groupNum);
                tearingDownGroups.delete(groupNum);
                completedGroups.delete(groupNum);
                // Trigger re-evaluation for items waiting to teardown
                evaluateLazy();
            }
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
            
            // Check if this item's reveal group can be shown (previous groups must be done animating)
            const groupAllowed = canRevealGroup(el);

            const shouldRender = prevEverRendered && groupAllowed && !offscreenBelow && !offscreenAbove;
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
    window.addEventListener("scroll", () => {
        updateScrollVelocity();
        evaluateLazy();
    }, { passive: true });
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

            const baseDuration = 0.45;
            
            // Check if mobile viewport
            const isMobile = () => window.innerWidth < 992;
            
            // Calculate duration based on direction to maintain consistent perceived speed
            // Desktop: Side animations scale by square root of aspect ratio (less aggressive scaling)
            // Mobile: Use fixed duration for all directions
            const getDuration = (dirName) => {
                if (!isMobile() && (dirName === 'left' || dirName === 'right')) {
                    const aspectRatio = window.innerWidth / window.innerHeight;
                    return baseDuration * Math.sqrt(aspectRatio);
                }
                return baseDuration;
            };
            
            let currentTimeline = null;

            let pendingHref = null;

            const svg = overlay.querySelector(".page-transition__svg");
            
            // Random directions: top, bottom, left, right
            // Mobile uses different sizing for left/right to handle narrow viewports
            const getDirections = () => {
                if (isMobile()) {
                    return [
                        { name: 'top', transform: 'scaleY(-1)', left: '0', top: '-200%', width: '100%', height: '300%', marginLeft: '0', marginTop: '0' },
                        { name: 'bottom', transform: 'scaleY(1)', left: '0', top: '0', width: '100%', height: '300%', marginLeft: '0', marginTop: '0' },
                        { name: 'left', transform: 'rotate(90deg) scaleY(-1)', left: '50%', top: '50%', width: '300vh', height: '300vw', marginLeft: '-150vh', marginTop: '-150vw' },
                        { name: 'right', transform: 'rotate(-90deg) scaleY(-1)', left: '50%', top: '50%', width: '300vh', height: '300vw', marginLeft: '-150vh', marginTop: '-150vw' },
                    ];
                }
                return [
                    { name: 'top', transform: 'scaleY(-1)', left: '0', top: '-200%', width: '100%', height: '300%', marginLeft: '0', marginTop: '0' },
                    { name: 'bottom', transform: 'scaleY(1)', left: '0', top: '0', width: '100%', height: '300%', marginLeft: '0', marginTop: '0' },
                    { name: 'left', transform: 'rotate(90deg) scaleY(-1)', left: '50%', top: '50%', width: '300%', height: '300%', marginLeft: '-150%', marginTop: '-150%' },
                    { name: 'right', transform: 'rotate(-90deg) scaleY(-1)', left: '50%', top: '50%', width: '300%', height: '300%', marginLeft: '-150%', marginTop: '-150%' },
                ];
            };
            
            const applyDirection = (dir) => {
                svg.style.transform = dir.transform;
                svg.style.left = dir.left;
                svg.style.top = dir.top;
                svg.style.width = dir.width;
                svg.style.height = dir.height;
                svg.style.marginLeft = dir.marginLeft;
                svg.style.marginTop = dir.marginTop;
            };

            const coverAndNavigate = (href) => {
                if (!href || (currentTimeline && currentTimeline.isActive())) return;

                pendingHref = href;
                
                // Pick a random direction
                const directions = getDirections();
                const dir = directions[Math.floor(Math.random() * directions.length)];
                applyDirection(dir);
                
                // Calculate duration based on direction
                const duration = getDuration(dir.name);
                
                // Create timeline with calculated duration
                currentTimeline = gsapLib.timeline();
                currentTimeline.to(path, { attr: { d: shapes.mid }, ease: "power2.in", duration: duration })
                    .to(path, { attr: { d: shapes.full }, ease: "power2.out", duration: duration });
                
                currentTimeline.eventCallback("onComplete", () => {
                    if (pendingHref) {
                        window.location.href = pendingHref;
                    }
                });
                
                // Store direction for reveal on next page
                sessionStorage.setItem("page-transition-dir", JSON.stringify(dir));
                sessionStorage.setItem(pageTransitionFlagKey, "true");
                
                overlay.classList.add("is-active");
                overlay.style.pointerEvents = "auto";
            };

            // Only attach click handlers to nav-link and navbar-brand elements, plus .page-transition-link
            document.querySelectorAll("nav .nav-link, nav .navbar-brand, .page-transition-link").forEach((link) => {
                link.addEventListener("click", (event) => {
                    const href = link.getAttribute("href") || "";
                    
                    // Skip hash links entirely
                    if (!href || href === "#" || href.startsWith("#")) return;
                    
                    // Skip if modifier keys
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    
                    // Skip external links
                    const target = link.getAttribute("target");
                    if (target && target !== "_self") return;
                    
                    try {
                        const url = new URL(href, window.location.href);
                        if (url.origin !== window.location.origin) return;
                        
                        // Prevent default and animate
                        event.preventDefault();
                        coverAndNavigate(url.href);
                    } catch (e) {
                        // Invalid URL, let browser handle it
                    }
                });
            });

            if (shouldRevealOnLoad) {
                // Get stored direction from previous page
                const storedDir = sessionStorage.getItem("page-transition-dir");
                sessionStorage.removeItem("page-transition-dir");
                
                let dirName = 'top'; // default
                if (storedDir) {
                    const dir = JSON.parse(storedDir);
                    applyDirection(dir);
                    dirName = dir.name;
                }
                
                // Calculate duration based on direction
                const duration = getDuration(dirName);
                
                // Set path to full coverage before showing
                path.setAttribute("d", shapes.full);
                overlay.classList.add("is-active");
                overlay.style.pointerEvents = "auto";
                
                // Remove the early cover after ensuring GSAP overlay is fully rendered
                // Use setTimeout as fallback for mobile browsers
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        setTimeout(() => {
                            if (earlyOverlay) {
                                earlyOverlay.remove();
                                earlyOverlay = null;
                            }
                        }, 16); // One frame delay (~16ms at 60fps)
                    });
                });
                
                // Reveal animation with calculated duration
                const revealTl = gsapLib.timeline();
                revealTl.to(path, { attr: { d: shapes.mid }, ease: "power2.in", duration: duration })
                    .to(path, { attr: { d: shapes.hidden }, ease: "power2.out", duration: duration })
                    .eventCallback("onComplete", () => {
                        overlay.classList.remove("is-active");
                        overlay.style.pointerEvents = "none";
                    });
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

// Project filter functionality
const initProjectFilter = () => {
    const filterButtons = document.querySelectorAll('.project-filter [data-filter]');
    const projectItems = document.querySelectorAll('.project-item');
    
    if (!filterButtons.length || !projectItems.length) return;
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            const filter = button.dataset.filter;
            
            // Update active button state
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Filter projects
            projectItems.forEach(item => {
                const category = item.dataset.category;
                if (filter === 'all' || category === filter) {
                    item.style.display = '';
                    item.classList.remove('filtered-out');
                } else {
                    item.style.display = 'none';
                    item.classList.add('filtered-out');
                }
            });
        });
    });
};

document.addEventListener('DOMContentLoaded', initProjectFilter);
