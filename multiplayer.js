/* multiplayer.js — Singleton room controller built on top of Firebase RTDB.
   Depends on window.FB (initialized by firebase-config.js as a module).

   Exposes window.Room with these methods:
     await Room.create({ name, hostColor, timeLimit })
         -> { code, role: 'host', myColor, opponentColor }
     await Room.join({ code, name })
         -> { code, role: 'guest', myColor, opponentColor }
     await Room.attach({ code })
         -> { code, role, myColor, opponentColor }  (resume after navigation)
     await Room.publishMove({ row, col, newGameState })
     await Room.publishSkip({ newGameState })
     await Room.requestRematch()
     await Room.leave()
     Room.on(event, cb), Room.off(event, cb)
       events: 'meta' | 'players' | 'game' | 'rematch' | 'rematchReady' | 'error'

   Game-state shape written into /rooms/{code}/game:
     {
       board: number[8][8],     // 0 empty, 1 black, 2 white
       currentPlayer: 1 | 2,
       moveNumber: number,      // monotonic; opening state = 0
       scores: { black, white },
       lastMove: { r, c, by } | null,
       deadlineTs: number | null,   // serverNow + timeLimit*1000; null if unlimited
       gameOver: boolean,
       winner: 'black' | 'white' | 'tie' | null,
       lastEvent: 'move' | 'skip' | 'start' | 'timeout'
     }
*/
(function () {
    'use strict';

    const ROOM_VERSION = 1;
    const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 chars, no 0/O/1/I/L
    const CODE_LENGTH = 5;
    const MAX_CODE_RETRIES = 6;

    // --- Internal state (singleton) ---
    const state = {
        code: null,
        role: null,        // 'host' | 'guest'
        myColor: null,     // 1 (BLACK) | 2 (WHITE)
        opponentColor: null,
        timeLimit: 30,
        unsubs: [],        // RTDB listener unsubscribers
        cachedMeta: null,
        cachedPlayers: null,
        cachedGame: null,
        cachedRematch: null,
        listeners: {
            meta: new Set(),
            players: new Set(),
            game: new Set(),
            rematch: new Set(),
            rematchReady: new Set(),
            error: new Set(),
        },
    };

    function emit(event, payload) {
        const set = state.listeners[event];
        if (!set) return;
        set.forEach(cb => {
            try { cb(payload); } catch (e) { console.error(`[Room.${event}]`, e); }
        });
    }

    function ensureFB() {
        if (!window.FB) throw new Error('Firebase not loaded. Make sure firebase-config.js is included as a module before multiplayer.js.');
        return window.FB.ready.then(() => window.FB);
    }

    function genCode() {
        let out = '';
        for (let i = 0; i < CODE_LENGTH; i++) {
            out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
        }
        return out;
    }

    function colorWord(c) { return c === 1 ? 'black' : c === 2 ? 'white' : null; }
    function colorFromWord(w) { return w === 'black' ? 1 : w === 'white' ? 2 : null; }

    // --- Initial-board helper. Mirrors othelloplr.html's initializeBoard(). ---
    function initialBoardState() {
        const b = Array.from({ length: 8 }, () => Array(8).fill(0));
        b[3][3] = 2; b[3][4] = 1;
        b[4][3] = 1; b[4][4] = 2;
        return {
            board: b,
            currentPlayer: 1,        // BLACK opens
            moveNumber: 0,
            scores: { black: 2, white: 2 },
            lastMove: null,
            deadlineTs: null,        // populated when both players have joined
            gameOver: false,
            winner: null,
            lastEvent: 'start',
        };
    }

    // Snapshot the host's current theme + disk-skin so the guest can mirror
    // the exact same look for this match. Falls back to safe defaults if the
    // shared.js helpers aren't available (e.g. test harnesses).
    function snapshotHostStyle() {
        try {
            if (typeof window.getCurrentRoomStyle === 'function') {
                const s = window.getCurrentRoomStyle();
                if (s && s.theme && s.diskSkin) return s;
            }
        } catch (_) {}
        return {
            theme: 'default',
            diskSkin: { black: 'galaxy', white: 'moonstone' }
        };
    }

    // --- Room creation ---
    async function create({ name, hostColor, timeLimit }) {
        const fb = await ensureFB();
        const { ref, runTransaction, set, serverTimestamp, update } = fb.sdk;

        const hostColorNum = colorFromWord(hostColor) || 1;
        const limit = Math.max(0, parseInt(timeLimit, 10) || 0);

        // Capture the host's theme + piece design ONCE at room creation. Both
        // host and guest will read this back via meta.hostStyle so the board
        // looks identical on both screens for the entire match.
        const hostStyle = snapshotHostStyle();

        // metaPayload is captured by the transaction update-function below.
        // That callback runs LOCALLY and may NOT contain `serverTimestamp()`
        // sentinels — Firebase will reject them. We stamp a numeric
        // `Date.now()` placeholder during the transaction, then overwrite
        // `meta/createdAt` with the real server sentinel via the follow-up
        // `update()` (which is allowed to carry sentinels).
        const metaPayload = {
            version: ROOM_VERSION,
            createdAt: Date.now(),
            createdBy: fb.uid,
            status: 'waiting',
            hostColor: colorWord(hostColorNum),
            timeLimit: limit,
            rematchId: null,
            hostStyle,
        };

        let chosenCode = null;
        for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
            const candidate = genCode();
            const result = await runTransaction(
                ref(fb.db, `rooms/${candidate}/meta`),
                cur => (cur ? undefined : metaPayload)
            );
            if (result.committed) { chosenCode = candidate; break; }
        }
        if (!chosenCode) throw new Error('Could not allocate a room code, try again.');

        // Seed host player + initial game state in one update so the room is
        // observable in a consistent shape from the very first listener tick.
        // We also overwrite `meta/createdAt` here with the real server-side
        // sentinel — the transaction above had to use a plain Date.now()
        // because sentinels aren't permitted inside the update function.
        const safeName = String(name || 'Host').slice(0, 40);
        await update(ref(fb.db, `rooms/${chosenCode}`), {
            'meta/createdAt': serverTimestamp(),
            'players/host': {
                uid: fb.uid,
                name: safeName,
                color: hostColorNum,
                connected: true,
                lastSeen: serverTimestamp(),
            },
            game: initialBoardState(),
            rematch: { hostWants: false, guestWants: false },
        });

        state.code = chosenCode;
        state.role = 'host';
        state.myColor = hostColorNum;
        state.opponentColor = hostColorNum === 1 ? 2 : 1;
        state.timeLimit = limit;

        await _attachListenersAndPresence();

        return {
            code: chosenCode,
            role: 'host',
            myColor: hostColorNum,
            opponentColor: state.opponentColor,
        };
    }

    // --- Room join (guest) ---
    async function join({ code, name }) {
        const fb = await ensureFB();
        const { ref, get, runTransaction, update, serverTimestamp } = fb.sdk;
        const trimmed = String(code || '').trim().toUpperCase();
        if (!/^[A-Z0-9]{4,8}$/.test(trimmed)) throw new Error('Invalid room code.');

        const metaSnap = await get(ref(fb.db, `rooms/${trimmed}/meta`));
        if (!metaSnap.exists()) throw new Error('Room not found.');
        const meta = metaSnap.val();
        if (meta.status === 'finished') throw new Error('This room has already ended.');

        const hostColorNum = colorFromWord(meta.hostColor) || 1;
        const guestColorNum = hostColorNum === 1 ? 2 : 1;
        const safeName = String(name || 'Guest').slice(0, 40);

        // Use a transaction so two concurrent joins can't both claim the guest
        // slot. NOTE: the transaction update-function runs LOCALLY and must
        // return plain JS values only — `serverTimestamp()` sentinels are not
        // allowed here (Firebase will throw / abort). We stamp a numeric
        // `Date.now()` placeholder for the callback and then overwrite it
        // with the real server sentinel via a follow-up `update()` once the
        // commit succeeds (see below).
        const guestRef = ref(fb.db, `rooms/${trimmed}/players/guest`);
        const result = await runTransaction(
            guestRef,
            cur => {
                if (cur && cur.uid && cur.uid !== fb.uid) return undefined; // someone else already joined
                return {
                    uid: fb.uid,
                    name: safeName,
                    color: guestColorNum,
                    connected: true,
                    lastSeen: Date.now(),
                };
            }
        );
        if (!result.committed) {
            // The transaction aborts with !committed for TWO different reasons:
            //   1. Someone else already owns the guest slot (room actually full).
            //   2. A retriable failure (network blip, contention, sentinel
            //      validation, etc.) where no other player is in the slot.
            // The previous code conflated these as "Room is full." — which
            // misled users and obscured real errors. Inspect the snapshot
            // returned with the transaction result to disambiguate.
            const claimed = result.snapshot && result.snapshot.exists()
                ? result.snapshot.val()
                : null;
            if (claimed && claimed.uid && claimed.uid !== fb.uid) {
                throw new Error('Room is already full.');
            }
            throw new Error('Join failed — please try again.');
        }

        // Overwrite the placeholder Date.now() with the real server sentinel.
        // This runs OUTSIDE the transaction callback so the sentinel is legal,
        // and `update()` patches just `lastSeen` without disturbing the rest
        // of the guest slot we just committed.
        try {
            await update(guestRef, { lastSeen: serverTimestamp() });
        } catch (e) {
            // Non-fatal — Date.now() is already in place. Surface for logs.
            console.warn('[Room.join] lastSeen sentinel patch failed:', e);
        }

        // Flip status to "playing" and stamp first move's deadline so the
        // black player's clock starts ticking immediately for both clients.
        // Pass our resolved `fb` instance through — `_markPlayingAndStartClock`
        // used to re-read `window.FB` which races on slow auth-startup.
        await _markPlayingAndStartClock(trimmed, meta.timeLimit || 0, fb);

        state.code = trimmed;
        state.role = 'guest';
        state.myColor = guestColorNum;
        state.opponentColor = hostColorNum;
        state.timeLimit = meta.timeLimit || 0;

        await _attachListenersAndPresence();

        return {
            code: trimmed,
            role: 'guest',
            myColor: guestColorNum,
            opponentColor: hostColorNum,
        };
    }

    // --- Resume an existing room after navigation (lobby -> game page) ---
    async function attach({ code }) {
        const fb = await ensureFB();
        const { ref, get, serverTimestamp, update } = fb.sdk;
        const trimmed = String(code || '').trim().toUpperCase();

        const snap = await get(ref(fb.db, `rooms/${trimmed}`));
        if (!snap.exists()) throw new Error('Room not found.');
        const data = snap.val();

        let role = null;
        if (data.players && data.players.host && data.players.host.uid === fb.uid) role = 'host';
        else if (data.players && data.players.guest && data.players.guest.uid === fb.uid) role = 'guest';
        else throw new Error('You are not a player in this room.');

        const myColor = data.players[role].color;
        const opponentColor = myColor === 1 ? 2 : 1;

        state.code = trimmed;
        state.role = role;
        state.myColor = myColor;
        state.opponentColor = opponentColor;
        state.timeLimit = (data.meta && data.meta.timeLimit) || 0;

        // Mark ourselves as back online (covers refresh / re-attach cases).
        await update(ref(fb.db, `rooms/${trimmed}/players/${role}`), {
            connected: true,
            lastSeen: serverTimestamp(),
        });

        await _attachListenersAndPresence();

        return { code: trimmed, role, myColor, opponentColor };
    }

    // --- Internal: hook up listeners + presence ---
    async function _attachListenersAndPresence() {
        const fb = window.FB;
        const { ref, onValue, onDisconnect, serverTimestamp } = fb.sdk;

        _detachListeners();

        const metaRef = ref(fb.db, `rooms/${state.code}/meta`);
        const playersRef = ref(fb.db, `rooms/${state.code}/players`);
        const gameRef = ref(fb.db, `rooms/${state.code}/game`);
        const rematchRef = ref(fb.db, `rooms/${state.code}/rematch`);

        const u1 = onValue(metaRef, snap => {
            state.cachedMeta = snap.val();
            emit('meta', state.cachedMeta);
            if (state.cachedMeta && state.cachedMeta.rematchId) {
                emit('rematchReady', state.cachedMeta.rematchId);
            }
        }, err => emit('error', err));
        const u2 = onValue(playersRef, snap => {
            state.cachedPlayers = snap.val();
            emit('players', state.cachedPlayers);
        }, err => emit('error', err));
        const u3 = onValue(gameRef, snap => {
            state.cachedGame = snap.val();
            emit('game', state.cachedGame);
        }, err => emit('error', err));
        const u4 = onValue(rematchRef, snap => {
            state.cachedRematch = snap.val() || { hostWants: false, guestWants: false };
            emit('rematch', state.cachedRematch);
            _maybeFulfillRematch();
        }, err => emit('error', err));

        state.unsubs.push(u1, u2, u3, u4);

        // Presence: if this client disconnects, flip our connected flag so
        // the opponent's UI surfaces an "opponent offline" banner.
        const presenceRef = ref(fb.db, `rooms/${state.code}/players/${state.role}/connected`);
        const lastSeenRef = ref(fb.db, `rooms/${state.code}/players/${state.role}/lastSeen`);
        try {
            await onDisconnect(presenceRef).set(false);
            await onDisconnect(lastSeenRef).set(serverTimestamp());
        } catch (e) {
            console.warn('[Room] onDisconnect setup failed:', e);
        }
    }

    function _detachListeners() {
        state.unsubs.forEach(u => { try { u(); } catch (_) {} });
        state.unsubs = [];
    }

    // Once a guest joins, flip status -> playing and stamp the first deadline.
    // `fb` is passed in by the caller (the resolved Firebase instance from
    // their own `await ensureFB()` call). Re-reading `window.FB` here used to
    // race on slow auth startup — by the time this helper ran, the caller had
    // already fully resolved FB; trusting that local reference is safe and
    // removes the race window.
    async function _markPlayingAndStartClock(code, timeLimit, fb) {
        const { ref, get, update } = fb.sdk;

        const gameSnap = await get(ref(fb.db, `rooms/${code}/game`));
        const game = gameSnap.val() || initialBoardState();

        const deadlineTs = timeLimit > 0 ? (fb.serverNow() + timeLimit * 1000) : null;

        await update(ref(fb.db, `rooms/${code}`), {
            'meta/status': 'playing',
            'game/deadlineTs': deadlineTs,
            'game/lastEvent': game.moveNumber === 0 ? 'start' : (game.lastEvent || 'start'),
        });
    }

    // --- Publish a move (caller computes newGameState locally) ---
    async function publishMove({ row, col, newGameState }) {
        if (!state.code) throw new Error('Not in a room.');
        const fb = window.FB;
        const { ref, update, push, serverTimestamp } = fb.sdk;

        const deadlineTs = state.timeLimit > 0 && !newGameState.gameOver
            ? (fb.serverNow() + state.timeLimit * 1000)
            : null;

        const gamePatch = {
            board: newGameState.board,
            currentPlayer: newGameState.currentPlayer,
            moveNumber: newGameState.moveNumber,
            scores: newGameState.scores,
            lastMove: { r: row, c: col, by: state.myColor },
            deadlineTs,
            gameOver: !!newGameState.gameOver,
            winner: newGameState.winner || null,
            lastEvent: 'move',
        };

        const movesPushRef = push(ref(fb.db, `rooms/${state.code}/moves`));
        const updates = {};
        updates[`rooms/${state.code}/game`] = gamePatch;
        updates[`rooms/${state.code}/moves/${movesPushRef.key}`] = {
            row, col, player: state.myColor, ts: serverTimestamp(), n: newGameState.moveNumber,
        };
        if (newGameState.gameOver) {
            updates[`rooms/${state.code}/meta/status`] = 'finished';
        }

        await update(ref(fb.db), updates);
    }

    // Skip is essentially a "null move" — same shape minus the placement.
    async function publishSkip({ newGameState, reason }) {
        if (!state.code) throw new Error('Not in a room.');
        const fb = window.FB;
        const { ref, update, push, serverTimestamp } = fb.sdk;

        const deadlineTs = state.timeLimit > 0 && !newGameState.gameOver
            ? (fb.serverNow() + state.timeLimit * 1000)
            : null;

        const gamePatch = {
            board: newGameState.board,
            currentPlayer: newGameState.currentPlayer,
            moveNumber: newGameState.moveNumber,
            scores: newGameState.scores,
            lastMove: null,
            deadlineTs,
            gameOver: !!newGameState.gameOver,
            winner: newGameState.winner || null,
            lastEvent: reason === 'timeout' ? 'timeout' : 'skip',
        };

        const movesPushRef = push(ref(fb.db, `rooms/${state.code}/moves`));
        const updates = {};
        updates[`rooms/${state.code}/game`] = gamePatch;
        updates[`rooms/${state.code}/moves/${movesPushRef.key}`] = {
            row: -1, col: -1, player: state.myColor, ts: serverTimestamp(),
            n: newGameState.moveNumber, kind: reason === 'timeout' ? 'timeout' : 'skip',
        };
        if (newGameState.gameOver) {
            updates[`rooms/${state.code}/meta/status`] = 'finished';
        }

        await update(ref(fb.db), updates);
    }

    // --- Rematch ---
    async function requestRematch() {
        if (!state.code) throw new Error('Not in a room.');
        const fb = window.FB;
        const { ref, update } = fb.sdk;
        const key = state.role === 'host' ? 'hostWants' : 'guestWants';
        await update(ref(fb.db, `rooms/${state.code}/rematch`), { [key]: true });
        // Host also nudges the coordinator immediately in case the listener
        // is still warming up (e.g. clicked right after game-over).
        if (state.role === 'host') _maybeFulfillRematch();
    }

    // Host-only: when both players want a rematch, atomically create a new
    // room with swapped colors and stamp the old room's meta with the new id.
    async function _maybeFulfillRematch() {
        if (state.role !== 'host') return;
        const r = state.cachedRematch;
        if (!r || !r.hostWants || !r.guestWants) return;
        if (state.cachedMeta && state.cachedMeta.rematchId) return; // already created

        const fb = window.FB;
        const { ref, get, runTransaction, update, serverTimestamp } = fb.sdk;

        try {
            const playersSnap = await get(ref(fb.db, `rooms/${state.code}/players`));
            const players = playersSnap.val() || {};
            const oldHost = players.host;
            const oldGuest = players.guest;
            if (!oldHost || !oldGuest) return;

            const newHostColorNum = oldHost.color === 1 ? 2 : 1;
            // Carry the original host style into the rematch room so both
            // players continue to see the same theme + piece design they
            // started with — no flicker when the page navigates over.
            const carriedStyle = (state.cachedMeta && state.cachedMeta.hostStyle) || snapshotHostStyle();
            // newMeta is captured by the transaction update-function below
            // (closure). That callback runs LOCALLY and may NOT contain
            // `serverTimestamp()` sentinels — Firebase will reject them. We
            // use a plain `Date.now()` placeholder, then overwrite
            // `meta/createdAt` with the real server sentinel via the
            // follow-up `update()` below (sentinels are legal there).
            const newMeta = {
                version: ROOM_VERSION,
                createdAt: Date.now(),
                createdBy: fb.uid,
                status: 'waiting',
                hostColor: colorWord(newHostColorNum),
                timeLimit: state.timeLimit || 0,
                rematchId: null,
                rematchOf: state.code,
                hostStyle: carriedStyle,
            };

            let newCode = null;
            for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
                const candidate = genCode();
                const result = await runTransaction(
                    ref(fb.db, `rooms/${candidate}/meta`),
                    cur => (cur ? undefined : newMeta)
                );
                if (result.committed) { newCode = candidate; break; }
            }
            if (!newCode) throw new Error('Could not allocate rematch room.');

            const newGuestColorNum = newHostColorNum === 1 ? 2 : 1;
            await update(ref(fb.db, `rooms/${newCode}`), {
                'meta/createdAt': serverTimestamp(),
                'players/host': {
                    uid: oldHost.uid,
                    name: oldHost.name,
                    color: newHostColorNum,
                    connected: true,
                    lastSeen: serverTimestamp(),
                },
                'players/guest': {
                    uid: oldGuest.uid,
                    name: oldGuest.name,
                    color: newGuestColorNum,
                    connected: true,
                    lastSeen: serverTimestamp(),
                },
                game: initialBoardState(),
                rematch: { hostWants: false, guestWants: false },
            });

            // Stamp the OLD room with the new code so both clients (listening
            // on meta.rematchId) auto-navigate.
            await update(ref(fb.db, `rooms/${state.code}/meta`), { rematchId: newCode });
        } catch (e) {
            console.error('[Room] Rematch fulfillment failed:', e);
            emit('error', e);
        }
    }

    // --- Leave (soft) ---
    async function leave() {
        if (!state.code) return;
        const fb = window.FB;
        const { ref, update, serverTimestamp, onDisconnect } = fb.sdk;
        try {
            // Cancel any pending onDisconnect writes BEFORE marking offline so
            // they don't fire later if the same UID reconnects elsewhere.
            await onDisconnect(ref(fb.db, `rooms/${state.code}/players/${state.role}/connected`)).cancel();
            await onDisconnect(ref(fb.db, `rooms/${state.code}/players/${state.role}/lastSeen`)).cancel();
            await update(ref(fb.db, `rooms/${state.code}/players/${state.role}`), {
                connected: false,
                lastSeen: serverTimestamp(),
            });
        } catch (e) {
            console.warn('[Room] leave warn:', e);
        }
        _detachListeners();
        state.code = null;
        state.role = null;
        state.myColor = null;
        state.opponentColor = null;
    }

    // --- Event subscription ---
    function on(event, cb) {
        const set = state.listeners[event];
        if (!set || typeof cb !== 'function') return;
        set.add(cb);
    }
    function off(event, cb) {
        const set = state.listeners[event];
        if (!set) return;
        set.delete(cb);
    }

    function snapshot() {
        return {
            code: state.code,
            role: state.role,
            myColor: state.myColor,
            opponentColor: state.opponentColor,
            timeLimit: state.timeLimit,
            meta: state.cachedMeta,
            players: state.cachedPlayers,
            game: state.cachedGame,
            rematch: state.cachedRematch,
        };
    }

    window.Room = {
        create, join, attach,
        publishMove, publishSkip,
        requestRematch, leave,
        on, off, snapshot,
        initialBoardState,
    };
})();
