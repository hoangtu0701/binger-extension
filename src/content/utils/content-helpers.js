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

    function scrapeMovieContext() {
        const url = location.href;

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
            const subtitleElem = document.querySelector("h2[class^='subtitle']");
            if (subtitleElem) {
                const rawText = subtitleElem.childNodes[0]?.textContent?.trim() || "";
                title = rawText.replace(/["]/g, "").trim() || "Unknown";

                const yearElem = subtitleElem.querySelector("a[href*='/year/']");
                if (yearElem) {
                    year = (yearElem.textContent || "").trim() || "Unknown";
                }
            }

            const video = document.querySelector("video");
            if (video && typeof video.currentTime === "number") {
                minutes = Math.floor(video.currentTime / 60);
            }
        } else if (url.includes("/movie/") || url.includes("/tv/")) {
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

        if (title === "Unknown") {
            const fallback = document.querySelector("h1, h2");
            if (fallback) {
                title = (fallback.textContent || "").trim() || "Unknown";
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