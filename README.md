# othello-capacitor
<<<<<<< HEAD

Othello game built with Capacitor.

## Online Multiplayer (Firebase) — Setup

The online mode (`Play Online` button on the main menu) uses Firebase
**Realtime Database** + **Anonymous Authentication**. No bundler is required —
the Firebase JS SDK is loaded from the gstatic CDN inside
[`firebase-config.js`](firebase-config.js).

### 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> and create a new project.
2. In the project, open **Build → Authentication → Get started → Sign-in method**
   and enable **Anonymous**.
3. Open **Build → Realtime Database → Create database** and choose a region.
   Start in **Test mode** for first run (you'll lock it down in step 3 below).

### 2. Paste your Firebase config

In your Firebase console: **Project settings (gear icon) → Your apps →
Web app** → register a web app (if you haven't already) → copy the SDK
snippet config. Paste the values into [`firebase-config.js`](firebase-config.js):

```js
const FIREBASE_CONFIG = {
    apiKey:      'YOUR_API_KEY',
    authDomain:  'YOUR_PROJECT.firebaseapp.com',
    databaseURL: 'https://YOUR_PROJECT-default-rtdb.firebaseio.com',
    projectId:   'YOUR_PROJECT',
    appId:       'YOUR_APP_ID',
};
```

### 3. Realtime Database security rules

Open **Realtime Database → Rules** and paste this JSON, then **Publish**:

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null",
        "meta": {
          ".validate": "newData.hasChildren(['createdBy', 'status'])"
        },
        "players": {
          "$role": {
            ".write": "auth != null && (!data.exists() || data.child('uid').val() === auth.uid)"
          }
        },
        "game": {
          ".validate": "newData.hasChildren(['currentPlayer', 'moveNumber', 'board', 'scores'])"
        }
      }
    }
  }
}
```

These rules require authentication for all reads/writes and prevent another
player from overwriting your seat. Move-legality is enforced client-side
(sufficient for friend-play). For an anti-cheat upgrade, move the validation
into Cloud Functions later.

### 4. Run it

Open `index.html` in a browser (or serve the folder with any static HTTP
server — e.g. `npx http-server .`) and click **Play Online**.

- Host taps **Create Room**, shares the 5-character code.
- Friend opens the same site, taps **Play Online → Join Room**, enters the code.
- Game starts automatically once both players are connected.

The same flow works inside the Capacitor Android/iOS shell — the Firebase
JS SDK runs in the WebView with the default Internet permission.

## Data model (Realtime Database)

```text
/rooms/{CODE}
  meta:    { createdAt, createdBy, status, hostColor, timeLimit, rematchId? }
  players:
    host:  { uid, name, color, connected, lastSeen }
    guest: { uid, name, color, connected, lastSeen }
  game:    { board[8][8], currentPlayer, moveNumber, scores, lastMove, deadlineTs, gameOver, winner, lastEvent }
  moves/{auto-id}: { row, col, player, ts, n, kind? }
  rematch: { hostWants, guestWants }
```

## Online file map

| File | Purpose |
| ---- | ------- |
| [`firebase-config.js`](firebase-config.js) | Loads Firebase v10 modular SDK from CDN, signs the user in anonymously, exposes `window.FB`. Loaded as `<script type="module">`. |
| [`multiplayer.js`](multiplayer.js) | `window.Room` singleton: `create`, `join`, `attach`, `publishMove`, `publishSkip`, `requestRematch`, `leave`, presence via `onDisconnect`. |
| [`online.html`](online.html) | Lobby with Create + Join cards, waiting overlay with copy / share / WhatsApp buttons. |
| [`othelloonline.html`](othelloonline.html) | Online game page (fork of `othelloplr.html`) with RTDB sync, server-synced turn timer, disconnect banner, rematch flow. |
=======
Othello game built with Capacitor
>>>>>>> 23d30b8a4ce95174b83c51d46f5ddb5d2af5c4a4
