// ============================================================================
// TAB MONITOR
// Monitors multiple phimbro.com tabs and shows warnings when overlay is active in multiple
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // CONSTANTS
    // ========================================================================

    // Delay after tab close before checking (allows state to settle)
    const TAB_CLOSE_CHECK_DELAY_MS = 200;

    // URL pattern for phimbro tabs
    const PHIMBRO_URL_PATTERN = "*://phimbro.com/*";

    // ========================================================================
    // HELPER: SAFE SEND MESSAGE TO TAB
    // ========================================================================

    /**
     * Send message to a tab safely - handles closed tabs and missing content scripts
     * @param {number} tabId - The tab ID
     * @param {object} message - The message to send
     * @returns {Promise<any>} - Response or null on error
     */
    function safeSendToTab(tabId, message) {
        return new Promise((resolve) => {
            try {
                chrome.tabs.sendMessage(tabId, message, (response) => {
                    // Check for errors (tab closed, no content script, etc.)
                    if (chrome.runtime.lastError) {
                        // Silently ignore - tab may have closed or content script not loaded
                        resolve(null);
                        return;
                    }
                    resolve(response);
                });
            } catch (err) {
                // Handle synchronous errors
                resolve(null);
            }
        });
    }

    // ========================================================================
    // MULTI-TAB DETECTION
    // ========================================================================

    /**
     * Check all phimbro tabs for active overlays and show/hide multi-tab warnings
     * Called on tab create, remove, and update events
     */
    async function monitorPhimbroTabsContinuously() {
        // Query all phimbro tabs
        chrome.tabs.query({ url: PHIMBRO_URL_PATTERN }, async (tabs) => {
            // Validate query result
            if (chrome.runtime.lastError) {
                console.warn("[Binger] Tab query error:", chrome.runtime.lastError.message);
                return;
            }

            if (!tabs || tabs.length === 0) {
                return;
            }

            // Ask each tab if overlay is shown
            const responses = await Promise.all(
                tabs.map(async (tab) => {
                    // Skip tabs without valid IDs
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

            // Filter only overlay-visible tabs
            const activeOverlayTabs = responses.filter(r => r.hasOverlay);

            if (activeOverlayTabs.length > 1) {
                // Multiple tabs have overlay - show warning on all
                console.log(`[Binger] Multi-tab detected: ${activeOverlayTabs.length} tabs with overlay`);

                for (const t of activeOverlayTabs) {
                    await safeSendToTab(t.id, { command: "showMultiTabWarning" });
                }
            } else {
                // Single or no overlay tabs - hide warning on any that had it
                for (const t of activeOverlayTabs) {
                    await safeSendToTab(t.id, { command: "hideMultiTabWarning" });
                }
            }
        });
    }

    // ========================================================================
    // EVENT LISTENERS
    // ========================================================================

    /**
     * Initialize tab monitoring event listeners
     */
    function init() {
        // Check when new tab is created
        chrome.tabs.onCreated.addListener(() => {
            monitorPhimbroTabsContinuously();
        });

        // Check when tab is closed (with small delay to let state settle)
        chrome.tabs.onRemoved.addListener(() => {
            setTimeout(monitorPhimbroTabsContinuously, TAB_CLOSE_CHECK_DELAY_MS);
        });

        // Check when tab finishes loading
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === "complete") {
                monitorPhimbroTabsContinuously();
            }
        });

        console.log("[Binger] Tab monitor initialized");
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGTabMonitor = {
        init,
        monitorPhimbroTabsContinuously
    };

})();