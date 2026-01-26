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

    try {
        self.importScripts(
            "../../firebase/firebase-app.js",
            "../../firebase/firebase-auth.js",
            "../../firebase/firebase-database.js"
        );
        console.log("[Binger] Firebase SDKs loaded");
    } catch (e) {
        console.error("[Binger] importScripts failed:", e);
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

    try {
        firebase.initializeApp(firebaseConfig);
        console.log("[Binger] Firebase initialized in background");
    } catch (e) {
        console.error("[Binger] Firebase init failed:", e);
    }

    // ========================================================================
    // DATABASE REFERENCE
    // ========================================================================

    const db = firebase.database();

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
     * @returns {firebase.database.Reference}
     */
    function ref(path) {
        return db.ref(path);
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