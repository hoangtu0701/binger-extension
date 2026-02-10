(function() {
    "use strict";

    let sdkLoaded = false;

    try {
        self.importScripts(
            "../../firebase/firebase-app.js",
            "../../firebase/firebase-auth.js",
            "../../firebase/firebase-database.js"
        );
        sdkLoaded = true;
    } catch (e) {
        console.error("[Binger] importScripts failed:", e);
    }

    if (!sdkLoaded || typeof firebase === "undefined") {
        console.error("[Binger] Firebase SDK not available - cannot initialize");
        self.BingerBGFirebase = null;
        return;
    }

    try {
        self.importScripts("../../libs/jszip.min.js");
    } catch (e) {
        console.error("[Binger] Failed to load JSZip:", e);
    }

    const firebaseConfig = {
        apiKey: "AIzaSyCOBk1uGy_Mb29zeww7KlwaTcvvfKrzKoo",
        authDomain: "binger-extension.firebaseapp.com",
        databaseURL: "https://binger-extension-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "binger-extension",
        storageBucket: "binger-extension.firebasestorage.app",
        messagingSenderId: "6476560552",
        appId: "1:6476560552:web:fc5d9801506dbef89daa9d"
    };

    let db = null;

    try {
        if (!firebase.apps || firebase.apps.length === 0) {
            firebase.initializeApp(firebaseConfig);
        }

        db = firebase.database();
    } catch (e) {
        console.error("[Binger] Firebase init failed:", e);
        self.BingerBGFirebase = null;
        return;
    }

    function getDatabase() {
        return db;
    }

    function getCurrentUser() {
        return firebase.auth().currentUser;
    }

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

    self.BingerBGFirebase = {
        getDatabase,
        getCurrentUser,
        ref,
        auth: firebase.auth,
        database: firebase.database,
        ServerValue: firebase.database.ServerValue
    };

})();