// ============================================================================
// AUTHENTICATION HANDLERS
// Handle user signup, signin, auth check, and signout
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // SIGNUP
    // ========================================================================

    /**
     * Handle user signup
     * @param {object} msg - Message containing email and password
     * @param {function} sendResponse - Response callback
     */
    function handleSignup(msg, sendResponse) {
        const { email, password } = msg.data || {};
        
        BingerBGFirebase.auth().createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("[Binger] Signup success:", userCredential.user);
                sendResponse({ status: "success" });
            })
            .catch((error) => {
                console.error("[Binger] Signup error:", error);
                sendResponse({ status: "error", code: error.code });
            });
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
        const { email, password } = msg.data || {};
        
        BingerBGFirebase.auth().signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                console.log("[Binger] Signin success:", userCredential.user);
                sendResponse({ status: "success" });
            })
            .catch((error) => {
                console.error("[Binger] Signin error:", error);
                sendResponse({ status: "error", code: error.code });
            });
    }

    // ========================================================================
    // CHECK AUTH
    // ========================================================================

    /**
     * Check if user is currently authenticated
     * @param {function} sendResponse - Response callback
     */
    function handleCheckAuth(sendResponse) {
        const unsubscribe = BingerBGFirebase.auth().onAuthStateChanged((user) => {
            unsubscribe(); // Immediately unsubscribe to avoid memory leaks
            sendResponse({ 
                user: user ? { uid: user.uid, email: user.email } : null 
            });
        });
    }

    // ========================================================================
    // SIGN OUT
    // ========================================================================

    /**
     * Handle user sign out
     * @param {function} sendResponse - Response callback
     */
    function handleSignOut(sendResponse) {
        BingerBGFirebase.auth().signOut()
            .then(() => {
                chrome.storage.local.clear(() => {
                    console.log("[Binger] Signed out and cleared local storage");
                    sendResponse({ status: "success" });
                });
            })
            .catch((error) => {
                console.error("[Binger] Signout error:", error);
                sendResponse({ status: "error", error: error.message });
            });
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