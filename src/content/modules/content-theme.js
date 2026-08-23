(function() {
    "use strict";

    const VALID_THEMES = [
        "burgundy", "pink", "blackwhite", "ocean", "volcano", "forest",
        "midnight", "sunset", "arctic", "royal"
    ];

    const THEME_CLASSES = [
        "theme-pink",
        "theme-blackwhite",
        "theme-ocean",
        "theme-volcano",
        "theme-forest",
        "theme-midnight",
        "theme-sunset",
        "theme-arctic",
        "theme-royal"
    ];

    const DEFAULT_THEME = "burgundy";

    let themeInitialized = false;

    function isValidTheme(theme) {
        return typeof theme === "string" && VALID_THEMES.includes(theme);
    }

    function applyTheme(theme) {
        const currentTheme = isValidTheme(theme) ? theme : DEFAULT_THEME;

        THEME_CLASSES.forEach((cls) => {
            document.body.classList.remove(cls);
        });

        document.querySelectorAll(".leaf, .binger-fog, .binger-frost").forEach((el) => el.remove());

        if (currentTheme !== DEFAULT_THEME) {
            document.body.classList.add(`theme-${currentTheme}`);
        }
    }

    function loadTheme() {
        BingerConnection.getSync("theme")
            .then((theme) => {
                applyTheme(theme);
            })
            .catch((err) => {
                console.warn("[Binger] Failed to load theme:", err);
                applyTheme(DEFAULT_THEME);
            });
    }

    function activateThemeListener(roomId) {
        if (!roomId || typeof roomId !== "string") return;

        if (!BingerState.getIsThemeSubscribed()) {
            BingerConnection.sendMessageAsync({
                command: "subscribeToTheme",
                roomId
            });
            BingerState.setIsThemeSubscribed(true);
        }
    }

    function deactivateThemeListener() {
        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (roomId) {
                    BingerConnection.sendMessageAsync({
                        command: "unsubscribeFromTheme",
                        roomId
                    });
                }
            })
            .catch((err) => {
                console.warn("[Binger] Error getting roomId for theme unsubscribe:", err);
            });

        BingerState.setIsThemeSubscribed(false);
    }

    function handleThemeChange(newTheme) {
        if (!isValidTheme(newTheme)) return;

        applyTheme(newTheme);

        if (window.BingerSession?.sendThemeToCallIframe) {
            window.BingerSession.sendThemeToCallIframe(newTheme);
        }

        BingerConnection.getCurrentRoomId()
            .then((roomId) => {
                if (roomId) {
                    return BingerConnection.sendMessage({
                        command: "post",
                        path: `rooms/${roomId}/theme`,
                        data: newTheme
                    }).then((res) => {
                        if (res?.status !== "success") {
                            console.error("[Binger] Failed to update room theme:", res?.error);
                        }
                    });
                }
            })
            .catch((err) => {
                console.error("[Binger] Error syncing theme to room:", err);
            });
    }

    function handleRoomThemeUpdate(theme) {
        if (!isValidTheme(theme)) return;

        applyTheme(theme);

        if (window.BingerSession?.sendThemeToCallIframe) {
            window.BingerSession.sendThemeToCallIframe(theme);
        }

        BingerConnection.setSync("theme", theme)
            .catch((err) => {
                console.warn("[Binger] Failed to save room theme locally:", err);
            });
    }

    function setupThemeChangeListener() {
        if (themeInitialized) return;

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === "sync" && changes.theme?.newValue) {
                handleThemeChange(changes.theme.newValue);
            }
        });
    }

    function spawnLeaves(msgEl) {
        if (!msgEl || !(msgEl instanceof HTMLElement)) return;

        BingerConnection.getSync("theme")
            .then((theme) => {
                if (!document.contains(msgEl)) return;

                if (theme === "forest") {
                    spawnForestLeaves(msgEl);
                } else if (theme === "midnight") {
                    spawnMidnightFog(msgEl);
                } else if (theme === "arctic") {
                    spawnArcticFrost(msgEl);
                }
            })
            .catch((err) => {
                console.warn("[Binger] Failed to check theme for particles:", err);
            });
    }

    function spawnForestLeaves(msgEl) {
        const total = 4 + Math.floor(Math.random() * 5);

        for (let i = 0; i < total; i++) {
            const leaf = document.createElement("span");
            leaf.className = "leaf";

            const r = Math.random();
            if (r < 0.7) {
                leaf.textContent = String.fromCodePoint(0x1F343);
            } else if (r < 0.9) {
                leaf.textContent = String.fromCodePoint(0x1F342);
            } else {
                leaf.textContent = String.fromCodePoint(0x1F341);
            }

            leaf.style.left = Math.random() * 80 + 10 + "%";
            leaf.style.bottom = "-20px";
            leaf.style.fontSize = (14 + Math.random() * 10) + "px";

            const x = (Math.random() - 0.5) * 300;
            const y = -80 - Math.random() * 200;
            leaf.style.setProperty("--tx", x + "px");
            leaf.style.setProperty("--ty", y + "px");
            leaf.style.setProperty("--dur", (4 + Math.random() * 4) + "s");
            leaf.style.setProperty("--delay", (Math.random() * 0.5) + "s");

            msgEl.appendChild(leaf);

            setTimeout(() => leaf.remove(), 10000);
        }
    }

    function ensureFogFilters() {
        if (document.getElementById("bingerFogDefs")) return;

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.id = "bingerFogDefs";
        svg.setAttribute("width", "0");
        svg.setAttribute("height", "0");
        svg.style.position = "absolute";
        svg.style.pointerEvents = "none";

        const variants = [
            { seed: 3, freq: "0.011 0.021", octaves: 3, scale: 46 },
            { seed: 11, freq: "0.014 0.017", octaves: 4, scale: 38 },
            { seed: 19, freq: "0.009 0.026", octaves: 3, scale: 54 },
            { seed: 27, freq: "0.016 0.019", octaves: 4, scale: 34 },
            { seed: 41, freq: "0.012 0.023", octaves: 3, scale: 49 },
            { seed: 58, freq: "0.018 0.015", octaves: 5, scale: 30 },
            { seed: 5, freq: "0.09 0.05", octaves: 4, scale: 16 },
            { seed: 23, freq: "0.11 0.04", octaves: 5, scale: 13 },
            { seed: 37, freq: "0.07 0.06", octaves: 4, scale: 19 },
            { seed: 61, freq: "0.13 0.045", octaves: 5, scale: 11 },
            { seed: 83, freq: "0.08 0.055", octaves: 4, scale: 17 },
            { seed: 97, freq: "0.1 0.038", octaves: 6, scale: 14 }
        ];

        variants.forEach((v, i) => {
            const filter = document.createElementNS(svgNS, "filter");
            filter.id = `bingerFog${i}`;
            filter.setAttribute("x", "-60%");
            filter.setAttribute("y", "-60%");
            filter.setAttribute("width", "220%");
            filter.setAttribute("height", "220%");
            filter.setAttribute("color-interpolation-filters", "sRGB");

            const turb = document.createElementNS(svgNS, "feTurbulence");
            turb.setAttribute("type", "fractalNoise");
            turb.setAttribute("baseFrequency", v.freq);
            turb.setAttribute("numOctaves", String(v.octaves));
            turb.setAttribute("seed", String(v.seed));
            turb.setAttribute("result", "noise");

            const disp = document.createElementNS(svgNS, "feDisplacementMap");
            disp.setAttribute("in", "SourceGraphic");
            disp.setAttribute("in2", "noise");
            disp.setAttribute("scale", String(v.scale));
            disp.setAttribute("xChannelSelector", "R");
            disp.setAttribute("yChannelSelector", "G");

            filter.appendChild(turb);
            filter.appendChild(disp);
            svg.appendChild(filter);
        });

        document.body.appendChild(svg);
    }

    function spawnMidnightFog(msgEl) {
        ensureFogFilters();

        const total = 5 + Math.floor(Math.random() * 6);
        const wind = (Math.random() - 0.5) * 90;
        let longest = 0;

        for (let i = 0; i < total; i++) {
            const puff = document.createElement("span");
            puff.className = "binger-fog";

            const startX = 4 + Math.random() * 88;
            const startY = 40 + Math.random() * 52;
            const w = 13 + Math.random() * 21;
            const h = w * (1.1 + Math.random() * 1.1);

            const gust = wind + (Math.random() - 0.5) * 130;
            const endX = gust;
            const endY = -58 - Math.random() * 104;
            const midX = gust * (0.44 + Math.random() * 0.18);
            const midY = endY * (0.4 + Math.random() * 0.16);

            const midScale = 1.5 + Math.random() * 1.1;
            const endScale = 3.1 + Math.random() * 2.8;
            const midRot = (Math.random() - 0.5) * 46;
            const endRot = midRot * (1.7 + Math.random());

            const dur = 2.2 + Math.random() * 2.6;
            const delay = Math.random() * 0.72;
            const alpha = 0.16 + Math.random() * 0.28;
            const blur = 2.5 + Math.random() * 3.5;
            const variant = Math.floor(Math.random() * 6);

            puff.style.left = startX + "%";
            puff.style.top = startY + "%";
            puff.style.width = w + "%";
            puff.style.height = h + "%";
            puff.style.filter = `url(#bingerFog${variant}) blur(${blur}px)`;

            puff.style.setProperty("--fmx", midX + "%");
            puff.style.setProperty("--fmy", midY + "%");
            puff.style.setProperty("--fms", midScale);
            puff.style.setProperty("--fmr", midRot + "deg");
            puff.style.setProperty("--fx", endX + "%");
            puff.style.setProperty("--fy", endY + "%");
            puff.style.setProperty("--fs", endScale);
            puff.style.setProperty("--fr", endRot + "deg");
            puff.style.setProperty("--fa", alpha);
            puff.style.setProperty("--fdur", dur + "s");
            puff.style.setProperty("--fdelay", delay + "s");

            msgEl.appendChild(puff);

            const life = (dur + delay) * 1000 + 200;
            if (life > longest) longest = life;
        }

        setTimeout(() => {
            msgEl.querySelectorAll(".binger-fog").forEach((el) => el.remove());
        }, longest);
    }

    function spawnArcticFrost(msgEl) {
        ensureFogFilters();

        const total = 7 + Math.floor(Math.random() * 6);

        for (let i = 0; i < total; i++) {
            const shard = document.createElement("span");
            shard.className = "binger-frost";

            const edge = Math.floor(Math.random() * 4);
            const along = 4 + Math.random() * 92;

            let x;
            let y;
            let aim;

            if (edge === 0) {
                x = along; y = 0; aim = 180;
            } else if (edge === 1) {
                x = 100; y = along; aim = 270;
            } else if (edge === 2) {
                x = along; y = 100; aim = 0;
            } else {
                x = 0; y = along; aim = 90;
            }

            const rot = aim + (Math.random() - 0.5) * 96;
            const w = 5 + Math.random() * 11;
            const h = w * (2.4 + Math.random() * 3.6);
            const grow = 0.62 + Math.random() * 0.62;
            const dur = 0.7 + Math.random() * 1.1;
            const delay = Math.random() * 0.85;
            const alpha = 0.2 + Math.random() * 0.3;
            const blur = 0.3 + Math.random() * 0.7;
            const variant = 6 + Math.floor(Math.random() * 6);

            shard.style.left = x + "%";
            shard.style.top = y + "%";
            shard.style.width = w + "%";
            shard.style.height = h + "%";
            shard.style.filter = `url(#bingerFog${variant}) blur(${blur}px)`;

            shard.style.setProperty("--kr", rot + "deg");
            shard.style.setProperty("--ks", grow);
            shard.style.setProperty("--ka", alpha);
            shard.style.setProperty("--kdur", dur + "s");
            shard.style.setProperty("--kdelay", delay + "s");

            msgEl.appendChild(shard);
        }

        setTimeout(() => {
            msgEl.querySelectorAll(".binger-frost").forEach((el) => {
                el.style.willChange = "auto";
            });
        }, 2400);
    }

    function initTheme() {
        if (themeInitialized) return;

        loadTheme();
        setupThemeChangeListener();

        themeInitialized = true;
    }

    window.BingerTheme = {
        initTheme,

        applyTheme,
        loadTheme,

        activateThemeListener,
        deactivateThemeListener,
        handleRoomThemeUpdate,

        spawnLeaves,

        isValidTheme
    };

})();