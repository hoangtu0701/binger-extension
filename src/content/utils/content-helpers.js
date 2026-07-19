(function() {
    "use strict";

    function isOnPhimbro() {
        return window.location.hostname === "phimbro.com";
    }

    function isOnWatchPage() {
        return window.location.hostname === "phimbro.com" &&
               window.location.pathname.startsWith("/watch");
    }

    function isOnSearchPage() {
        return window.location.pathname === "/search";
    }

    function extractMovieCode(url) {
        if (typeof url !== "string") return "";
        if (!url.includes("/watch/")) return "";

        const parts = url.split("/watch/");
        if (parts.length >= 2) {
            return parts[1].split(/[?#]/)[0];
        }
        return "";
    }

    function formatTime(timestamp) {
        if (typeof timestamp !== "number" || isNaN(timestamp)) {
            return "--:--";
        }
        return new Date(timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function getElement(id) {
        return document.getElementById(id);
    }

    function createElement(tag, options = {}) {
        const element = document.createElement(tag);

        if (options.id) element.id = options.id;
        if (options.className) element.className = options.className;
        if (options.textContent) element.textContent = options.textContent;
        if (options.innerHTML) element.innerHTML = options.innerHTML;

        if (options.attributes) {
            for (const [key, value] of Object.entries(options.attributes)) {
                element.setAttribute(key, value);
            }
        }

        if (options.styles) {
            Object.assign(element.style, options.styles);
        }

        if (options.disabled !== undefined) {
            element.disabled = options.disabled;
        }

        if (options.events) {
            for (const [event, handler] of Object.entries(options.events)) {
                if (typeof handler === "function") {
                    element.addEventListener(event, handler);
                }
            }
        }

        return element;
    }

    function removeElement(id) {
        const element = document.getElementById(id);
        if (element) element.remove();
    }

    function findYearNearHeading(heading) {
        if (!heading) return "Unknown";

        let scope = heading.parentElement;

        for (let depth = 0; depth < 4 && scope; depth++) {
            const candidates = scope.querySelectorAll("a, span, div");

            for (const el of candidates) {
                if (el.children.length > 0) continue;

                const text = (el.textContent || "").trim();
                if (text.length === 0 || text.length > 12) continue;

                const match = text.match(/^\(?((?:19|20)\d{2})\)?$/);
                if (match) return match[1];
            }

            scope = scope.parentElement;
        }

        return "Unknown";
    }

    function extractYearFromDocumentTitle() {
        const match = (document.title || "").match(/\(((?:19|20)\d{2})\)/);
        return match ? match[1] : "Unknown";
    }

    function scrapeMovieContext() {
        const url = location.href;
        const isWatching = url.includes("/watch/");
        const isDetailPage = url.includes("/title/");

        if (!isWatching && !isDetailPage) {
            return null;
        }

        let title = "Unknown";
        let year = "Unknown";
        let minutes = 0;

        const heading = document.querySelector("h1");
        const titleAnchor = document.querySelector("h1 a[href^='/title/']");

        if (titleAnchor) {
            title = (titleAnchor.textContent || "").trim() || "Unknown";
        } else if (heading) {
            title = (heading.textContent || "").trim() || "Unknown";
        }

        if (title === "Unknown") {
            const fallback = document.querySelector("h1, h2");
            if (fallback) {
                title = (fallback.textContent || "").trim() || "Unknown";
            }
        }

        year = findYearNearHeading(heading);
        if (year === "Unknown") {
            year = extractYearFromDocumentTitle();
        }

        if (isWatching) {
            const video = document.querySelector("video");
            if (video && typeof video.currentTime === "number") {
                minutes = Math.floor(video.currentTime / 60);
            }
        }

        return { title, year, minutes, isWatching };
    }

    function isValidRoomCode(code) {
        if (typeof code !== "string" && typeof code !== "number") {
            return false;
        }
        return /^\d{6}$/.test(String(code));
    }

    window.BingerHelpers = {
        isOnPhimbro,
        isOnWatchPage,
        isOnSearchPage,
        extractMovieCode,

        formatTime,

        getElement,
        createElement,
        removeElement,

        scrapeMovieContext,

        isValidRoomCode
    };

})();