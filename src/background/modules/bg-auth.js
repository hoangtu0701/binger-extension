(function() {
    "use strict";

    function validateDependencies() {
        const required = ["BingerBGFirebase", "BingerBGHelpers"];
        const missing = required.filter(dep => typeof self[dep] === "undefined");

        if (missing.length > 0) {
            console.error("[Binger] bg-auth missing dependencies:", missing.join(", "));
            return false;
        }
        return true;
    }

    function handleSignup(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

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
                .then(() => {
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

    function handleSignin(msg, sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { status: "error", error: "Missing dependencies" });
            return;
        }

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
                .then(() => {
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

    function handleCheckAuth(sendResponse) {
        if (!validateDependencies()) {
            BingerBGHelpers.safeSendResponse(sendResponse, { user: null, error: "Missing dependencies" });
            return;
        }

        try {
            const unsubscribe = BingerBGFirebase.auth().onAuthStateChanged((user) => {
                unsubscribe();
                BingerBGHelpers.safeSendResponse(sendResponse, {
                    user: user ? { uid: user.uid, email: user.email } : null
                });
            });
        } catch (err) {
            console.error("[Binger] CheckAuth exception:", err);
            BingerBGHelpers.safeSendResponse(sendResponse, { user: null, error: "Auth check failed" });
        }
    }

    function handleSignOut(sendResponse) {
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

    self.BingerBGAuth = {
        handleSignup,
        handleSignin,
        handleCheckAuth,
        handleSignOut
    };

})();