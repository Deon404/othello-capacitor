/* firebase-config.js — Bootstraps Firebase (App, Auth, Realtime Database) for
   the online multiplayer pages. Loaded as a <script type="module"> so we can
   import the v10 modular SDK directly from gstatic CDN (no bundler needed —
   matches the project's vanilla-JS / Capacitor setup).

   What it exposes:
     window.FB = {
       app, auth, db, uid,        // populated AFTER `ready` resolves
       serverTimeOffset: 0,        // ms; updated live from /.info/serverTimeOffset
       serverNow(): number,        // best-effort server time in ms
       ready: Promise<void>,       // resolves once auth + db are usable
       sdk: { ref, get, set, update, onValue, off, runTransaction,
              push, child, serverTimestamp, onDisconnect, remove }
     };

   Setup (one-time):
     1. Create a Firebase project: https://console.firebase.google.com/
     2. Enable Realtime Database (start in TEST MODE for first run).
     3. Enable Authentication -> Sign-in method -> Anonymous.
     4. Paste your project's config into FIREBASE_CONFIG below.
     5. Paste the security rules from README.md into RTDB -> Rules. */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
    getAuth,
    signInAnonymously,
    onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
    getDatabase,
    ref,
    get,
    set,
    update,
    onValue,
    off,
    runTransaction,
    push,
    child,
    serverTimestamp,
    onDisconnect,
    remove,
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';


// Config values are sourced from `window.__FIREBASE_ENV__`, which is populated
// by `firebase-env.js` (gitignored — local secrets; see `firebase-env.example.js`
// for the template). `firebase-env.js` MUST be loaded as a CLASSIC <script> tag
// BEFORE this module in any HTML page that uses Firebase, so the globals are
// set by the time this module evaluates. Firebase Web API keys are inherently
// public once shipped to the client, so additionally restrict the key in
// Google Cloud Console (HTTP referrers + enabled APIs).
const ENV = (typeof window !== 'undefined' && window.__FIREBASE_ENV__) || {};
const FIREBASE_CONFIG = {
    apiKey: ENV.FIREBASE_API_KEY,
    authDomain: ENV.FIREBASE_AUTH_DOMAIN,
    databaseURL: ENV.FIREBASE_DATABASE_URL,
    projectId: ENV.FIREBASE_PROJECT_ID,
    storageBucket: ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId: ENV.FIREBASE_APP_ID,
};

const FB = {
    app: null,
    auth: null,
    db: null,
    uid: null,
    serverTimeOffset: 0,
    serverNow() {
        return Date.now() + (FB.serverTimeOffset || 0);
    },
    sdk: {
        ref, get, set, update, onValue, off,
        runTransaction, push, child,
        serverTimestamp, onDisconnect, remove,
    },
};

// Surface the namespace BEFORE auth resolves so non-module scripts can hold
// a stable reference and await FB.ready.
window.FB = FB;

FB.ready = (async () => {
    try {
        FB.app = initializeApp(FIREBASE_CONFIG);
        FB.auth = getAuth(FB.app);
        FB.db = getDatabase(FB.app);

        // Keep server-time offset live. RTDB updates this value as soon as the
        // client has a clock skew estimate, so subsequent reads are accurate.
        onValue(ref(FB.db, '.info/serverTimeOffset'), snap => {
            const val = snap.val();
            if (typeof val === 'number') FB.serverTimeOffset = val;
        });

        // Anonymous auth — UID is persisted by the SDK in IndexedDB so the
        // same browser keeps the same identity across reloads (lets a host
        // who refreshes still "own" their room slot).
        await new Promise((resolve, reject) => {
            const unsub = onAuthStateChanged(FB.auth, user => {
                if (user) {
                    FB.uid = user.uid;
                    unsub();
                    resolve();
                }
            }, reject);
            signInAnonymously(FB.auth).catch(reject);
        });
    } catch (err) {
        // Surface a friendly hint in the console — most failures here are
        // either a wrong/empty FIREBASE_CONFIG or RTDB not enabled.
        console.error('[Firebase] Initialization failed:', err);
        const msg = (err && err.message) || String(err);
        if (window.FB) window.FB.initError = msg;
        throw err;
    }
})();
