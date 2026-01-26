// ============================================================================
// FIREBASE INITIALIZATION
// Load Firebase SDKs and initialize the app
// ============================================================================

(function() {
    "use strict";

    // ========================================================================
    // LOAD FIREBASE SDKS
    // Using local files for CSP compliance
    // ========================================================================

    let sdkLoaded = false;

    try {
        self.importScripts(
            "../../firebase/firebase-app.js",
            "../../firebase/firebase-auth.js",
            "../../firebase/firebase-database.js"
        );
        sdkLoaded = true;
        console.log("[Binger] Firebase SDKs loaded");
    } catch (e) {
        console.error("[Binger] importScripts failed:", e);
    }

    // Stop if SDK failed to load
    if (!sdkLoaded || typeof firebase === "undefined") {
        console.error("[Binger] Firebase SDK not available - cannot initialize");
        self.BingerBGFirebase = null;
        return;
    }

    // ========================================================================
    // LOAD JSZIP
    // Required for subtitle file extraction
    // ========================================================================

    try {
        self.importScripts("../../libs/jszip.min.js");
        console.log("[Binger] JSZip loaded");
    } catch (e) {
        console.error("[Binger] Failed to load JSZip:", e);
    }

    // ========================================================================
    // FIREBASE CONFIG
    // ========================================================================

    const firebaseConfig = {
        apiKey: "AIzaSyCOBk1uGy_Mb29zeww7KlwaTcvvfKrzKoo",
        authDomain: "binger-extension.firebaseapp.com",
        databaseURL: "https://binger-extension-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "binger-extension",
        storageBucket: "binger-extension.firebasestorage.app",
        messagingSenderId: "6476560552",
        appId: "1:6476560552:web:fc5d9801506dbef89daa9d"
    };

    // ========================================================================
    // INITIALIZE FIREBASE
    // ========================================================================

    let db = null;

    try {
        // Check if Firebase is already initialized
        if (firebase.apps && firebase.apps.length > 0) {
            console.log("[Binger] Firebase already initialized - reusing existing app");
        } else {
            firebase.initializeApp(firebaseConfig);
            console.log("[Binger] Firebase initialized in background");
        }

        // Get database reference
        db = firebase.database();
    } catch (e) {
        console.error("[Binger] Firebase init failed:", e);
        self.BingerBGFirebase = null;
        return;
    }

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    /**
     * Get the Firebase database instance
     * @returns {firebase.database.Database}
     */
    function getDatabase() {
        return db;
    }

    /**
     * Get the current authenticated user
     * @returns {firebase.User|null}
     */
    function getCurrentUser() {
        return firebase.auth().currentUser;
    }

    /**
     * Get a database reference for a path
     * @param {string} path - The database path
     * @returns {firebase.database.Reference|null}
     */
    function ref(path) {
        if (!db) {
            console.error("[Binger] Database not initialized");
            return null;
        }
        if (typeof path !== "string" || path.trim() === "") {
            console.error("[Binger] Invalid database path:", path);
            return null;
        }
        return db.ref(path.trim());
    }

    // ========================================================================
    // EXPOSE TO SERVICE WORKER
    // ========================================================================

    self.BingerBGFirebase = {
        getDatabase,
        getCurrentUser,
        ref,
        // Expose firebase directly for auth operations
        auth: firebase.auth,
        database: firebase.database,
        ServerValue: firebase.database.ServerValue
    };

})();