(function() {
    "use strict";

    const TAB_CLOSE_CHECK_DELAY_MS = 200;
    const PHIMBRO_URL_PATTERN = "*://phimbro.com/*";

    function safeSendToTab(tabId, message) {
        return new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    if (chrome.runtime.lastError) {
                        resolve(null);
                        return;
                    }
                    resolve(response);
                });
            } catch {
                resolve(null);
            }
        });
    }

    async function monitorPhimbroTabsContinuously() {
        chrome.tabs.query({ url: PHIMBRO_URL_PATTERN }, async (tabs) => {
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Tab query error:", chrome.runtime.lastError.message);
                return;
            }

            if (!tabs || tabs.length === 0) return;

            const responses = await Promise.all(
                tabs.map(async (tab) => {
                    if (!tab.id || tab.id < 0) {
                        return { id: tab.id, hasOverlay: false };
                    }

                    const res = await safeSendToTab(tab.id, { command: "isOverlayShown" });
                    return {
                        id: tab.id,
                        hasOverlay: res?.overlay === true
                    };
                })
            );

            const activeOverlayTabs = responses.filter(r => r.hasOverlay);

            if (activeOverlayTabs.length > 1) {
                for (const t of activeOverlayTabs) {
                    await safeSendToTab(t.id, { command: "showMultiTabWarning" });
                }
            } else {
                for (const t of activeOverlayTabs) {
                    await safeSendToTab(t.id, { command: "hideMultiTabWarning" });
                }
            }
        });
    }

    function init() {
        chrome.tabs.onCreated.addListener(() => {
            monitorPhimbroTabsContinuously();
        });

        chrome.tabs.onRemoved.addListener(() => {
            setTimeout(monitorPhimbroTabsContinuously, TAB_CLOSE_CHECK_DELAY_MS);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.status === "complete") {
                monitorPhimbroTabsContinuously();
            }
        });
    }

    self.BingerBGTabMonitor = {
        init,
        monitorPhimbroTabsContinuously
    };

})();