// ============================================================================
// AUTHENTICATION HANDLERS
// Handle user signup, signin, auth check, and signout
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // DEPENDENCY VALIDATION
    // ========================================================================

    /**
     * Check that all required global dependencies exist
     * @returns {boolean} - True if all dependencies are available
     */
    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-auth missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    // ========================================================================
    // SIGNUP
    // ========================================================================

    /**
     * Handle user signup
     * @param {object} msg - Message containing email and password
     * @param {function} sendResponse - Response callback
     */
    function handleSignup(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        const email = msg?.data?.email;
        const password = msg?.data?.password;

        if (!email || typeof email !== "string" || email.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: "invalid-email" });
            return;
        }

        if (!password || typeof password !== "string" || password.length < 6) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: "weak-password" });
            return;
        }

        try {
            BingerBGFirebase.auth().createUserWithEmailAndPassword(email.trim(), password)
                .then((userCredential) => {
                    console.log("[Binger] Signup success:", userCredential.user?.email);
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
                })
                .catch((error) => {
                    console.error("[Binger] Signup error:", error.code);
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: error.code });
                });
        } catch (err) {
            console.error("[Binger] Signup exception:", err);
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: "unknown-error" });
        }
    }

    // ========================================================================
    // SIGNIN
    // ========================================================================

    /**
     * Handle user signin
     * @param {object} msg - Message containing email and password
     * @param {function} sendResponse - Response callback
     */
    function handleSignin(msg, sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        // Validate input
        const email = msg?.data?.email;
        const password = msg?.data?.password;

        if (!email || typeof email !== "string" || email.trim() === "") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: "invalid-email" });
            return;
        }

        if (!password || typeof password !== "string") {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: "invalid-password" });
            return;
        }

        try {
            BingerBGFirebase.auth().signInWithEmailAndPassword(email.trim(), password)
                .then((userCredential) => {
                    console.log("[Binger] Signin success:", userCredential.user?.email);
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
                })
                .catch((error) => {
                    console.error("[Binger] Signin error:", error.code);
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: error.code });
                });
        } catch (err) {
            console.error("[Binger] Signin exception:", err);
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", code: "unknown-error" });
        }
    }

    // ========================================================================
    // CHECK AUTH
    // ========================================================================

    /**
     * Check if user is currently authenticated
     * @param {function} sendResponse - Response callback
     */
    function handleCheckAuth(sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { user: null, error: "Missing dependencies" });
            return;
        }

        try {
            const unsubscribe = BingerBGFirebase.auth().onAuthStateChanged((user) => {
                unsubscribe(); // Immediately unsubscribe to avoid memory leaks
                BingerBGHelpers.safeSendResponse(sendResponse, {
                    user: user ? { uid: user.uid, email: user.email } : null
                });
            });
        } catch (err) {
            console.error("[Binger] CheckAuth exception:", err);
            BingerBGHelpers.safeSendResponse(sendResponse, { user: null, error: "Auth check failed" });
        }
    }

    // ========================================================================
    // SIGN OUT
    // ========================================================================

    /**
     * Handle user sign out
     * @param {function} sendResponse - Response callback
     */
    function handleSignOut(sendResponse) {
        // Validate dependencies
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

        try {
            BingerBGFirebase.auth().signOut()
                .then(() => {
                    chrome.storage.local.clear(() => {
                        if (chrome.runtime.lastError) {
                            console.warn("[Binger] Error clearing storage:", chrome.runtime.lastError.message);
                        }
                        console.log("[Binger] Signed out and cleared local storage");
                        BingerBGHelpers.safeSendResponse(sendResponse, { status: "success" });
                    });
                })
                .catch((error) => {
                    console.error("[Binger] Signout error:", error);
                    BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: error.message });
                });
        } catch (err) {
            console.error("[Binger] Signout exception:", err);
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Signout failed" });
        }
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGAuth = {
        handleSignup,
        handleSignin,
        handleCheckAuth,
        handleSignOut
    };

})();