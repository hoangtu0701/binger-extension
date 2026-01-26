// ============================================================================
// HELPER UTILITIES
// Common utility functions for Binger content scripts
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // URL HELPERS
    // ========================================================================

    /**
     * Check if current page is on phimbro.com
     * @returns {boolean}
     */
    function isOnPhimbro() {
        return window.location.hostname === "phimbro.com";
    }

    /**
     * Check if current page is a watch page
     * Uses hostname + pathname for reliability (protocol-agnostic)
     * @returns {boolean}
     */
    function isOnWatchPage() {
        return window.location.hostname === "phimbro.com" &&
               window.location.pathname.startsWith("/watch");
    }

    /**
     * Check if current page is the search page
     * @returns {boolean}
     */
    function isOnSearchPage() {
        return window.location.pathname === "/search";
    }

    /**
     * Extract movie code from a URL
     * @param {string} url - The URL to extract from
     * @returns {string} The movie code or empty string
     */
    function extractMovieCode(url) {
        // Type check - must be a string
        if (typeof url !== "string") return "";
        if (!url.includes("/watch/")) return "";

        const parts = url.split("/watch/");
        if (parts.length >= 2) {
            // Get everything after /watch/ up to query string or hash
            return parts[1].split(/[?#]/)[0];
        }
        return "";
    }

    // ========================================================================
    // TIME HELPERS
    // ========================================================================

    /**
     * Format timestamp to time string (HH:MM)
     * @param {number} timestamp - Unix timestamp in milliseconds
     * @returns {string} Formatted time string
     */
    function formatTime(timestamp) {
        // Handle invalid timestamps
        if (typeof timestamp !== "number" || isNaN(timestamp)) {
            return "--:--";
        }
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    // ========================================================================
    // DOM HELPERS
    // ========================================================================

    /**
     * Safely get an element by ID
     * @param {string} id - The element ID
     * @returns {HTMLElement|null}
     */
    function getElement(id) {
        return document.getElementById(id);
    }

    /**
     * Create an element with optional attributes, styles, and events
     * @param {string} tag - The HTML tag name
     * @param {object} options - Optional attributes, styles, content, and events
     * @returns {HTMLElement}
     */
    function createElement(tag, options = {}) {
        const element = document.createElement(tag);

        if (options.id) element.id = options.id;
        if (options.className) element.className = options.className;
        if (options.textContent) element.textContent = options.textContent;
        if (options.innerHTML) element.innerHTML = options.innerHTML;

        // Set custom attributes
        if (options.attributes) {
            for (const [key, value] of Object.entries(options.attributes)) {
                element.setAttribute(key, value);
            }
        }

        // Apply inline styles
        if (options.styles) {
            Object.assign(element.style, options.styles);
        }

        // Set disabled state
        if (options.disabled !== undefined) {
            element.disabled = options.disabled;
        }

        // Attach event listeners
        if (options.events) {
            for (const [event, handler] of Object.entries(options.events)) {
                if (typeof handler === "function") {
                    element.addEventListener(event, handler);
                }
            }
        }

        return element;
    }

    /**
     * Remove an element by ID if it exists
     * @param {string} id - The element ID
     */
    function removeElement(id) {
        const element = document.getElementById(id);
        if (element) element.remove();
    }

    // ========================================================================
    // MOVIE CONTEXT SCRAPER
    // ========================================================================

    /**
     * Scrape movie/series info from the current page
     * Used for Binger Bot context
     * @returns {object|null} Movie context or null if not on relevant page
     */
    function scrapeMovieContext() {
        const url = location.href;

        // Only scrape on relevant pages
        if (
            !url.includes("/watch/") &&
            !url.includes("/movie/") &&
            !url.includes("/tv/")
        ) {
            return null;
        }

        let title = "Unknown";
        let year = "Unknown";
        let minutes = 0;
        const isWatching = url.includes("/watch/");

        if (url.includes("/watch/")) {
            // On /watch/ page
            const subtitleElem = document.querySelector("h2[class^='subtitle']");
            if (subtitleElem) {
                const rawText = subtitleElem.childNodes[0]?.textContent?.trim() || "";
                title = rawText.replace(/["]/g, "").trim() || "Unknown";

                const yearElem = subtitleElem.querySelector("a[href*='/year/']");
                if (yearElem) {
                    year = (yearElem.textContent || "").trim() || "Unknown";
                }
            }

            // Get current video time
            const video = document.querySelector("video");
            if (video && typeof video.currentTime === "number") {
                minutes = Math.floor(video.currentTime / 60);
            }
        } else if (url.includes("/movie/") || url.includes("/tv/")) {
            // On /movie/ or /tv/ page
            const titleElem = document.querySelector("h1[class^='title']");
            if (titleElem) {
                title = (titleElem.textContent || "").trim() || "Unknown";
            }

            const subtitleElem = document.querySelector("h2[class^='subtitle']");
            if (subtitleElem) {
                const yearElem = subtitleElem.querySelector("a[href*='/year/']");
                if (yearElem) {
                    year = (yearElem.textContent || "").trim() || "Unknown";
                }
            }
        }

        // Fallback - try any h1/h2
        if (title === "Unknown") {
            const fallback = document.querySelector("h1, h2");
            if (fallback) {
                title = (fallback.textContent || "").trim() || "Unknown";
            }
        }

        return { title, year, minutes, isWatching };
    }

    // ========================================================================
    // VALIDATION HELPERS
    // ========================================================================

    /**
     * Validate a 6-digit room code
     * @param {string|number} code - The code to validate
     * @returns {boolean}
     */
    function isValidRoomCode(code) {
        // Must be string or number
        if (typeof code !== "string" && typeof code !== "number") {
            return false;
        }
        // Convert to string and test for exactly 6 digits
        return /^\d{6}$/.test(String(code));
    }

    // ========================================================================
    // EXPOSE TO WINDOW
    // ========================================================================

    window.BingerHelpers = {
        // URL
        isOnPhimbro,
        isOnWatchPage,
        isOnSearchPage,
        extractMovieCode,

        // Time
        formatTime,

        // DOM
        getElement,
        createElement,
        removeElement,

        // Movie
        scrapeMovieContext,

        // Validation
        isValidRoomCode
    };

})();