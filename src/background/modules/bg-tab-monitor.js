// ============================================================================
// TAB MONITOR
// Monitors multiple phimbro.com tabs and shows warnings when overlay is active in multiple
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // MULTI-TAB DETECTION
    // ========================================================================

    /**
     * Check all phimbro tabs for active overlays and show/hide multi-tab warnings
     * Called on tab create, remove, and update events
     */
    function monitorPhimbroTabsContinuously() {
        chrome.tabs.query({ url: "*://phimbro.com/*" }, async (tabs) => {
            // Ask each tab if overlay is shown
            const responses = await Promise.all(tabs.map(tab => {
                return new Promise((resolve) => {
                    chrome.tabs.sendMessage(tab.id, { command: "isOverlayShown" }, (res) => {
                        resolve({ id: tab.id, hasOverlay: res?.overlay === true });
                    });
                });
            }));

            // Filter only overlay-visible tabs
            const activeOverlayTabs = responses.filter(r => r.hasOverlay);

            if (activeOverlayTabs.length > 1) {
                // Multiple tabs have overlay - show warning on all
                activeOverlayTabs.forEach(t => {
                    chrome.tabs.sendMessage(t.id, { command: "showMultiTabWarning" });
                });
            } else {
                // Single or no overlay tabs - hide warning
                activeOverlayTabs.forEach(t => {
                    chrome.tabs.sendMessage(t.id, { command: "hideMultiTabWarning" });
                });
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
        chrome.tabs.onCreated.addListener(monitorPhimbroTabsContinuously);

        // Check when tab is closed (with small delay to let state settle)
        chrome.tabs.onRemoved.addListener(() => {
            setTimeout(monitorPhimbroTabsContinuously, 200);
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