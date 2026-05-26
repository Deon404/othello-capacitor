/* sounds.js — Web Audio sound manager for Othello.
   Honors the "sound-muted" flag in localStorage. AudioContext auto-resumes
   on the first user gesture to satisfy browser autoplay policies. */

const SoundManager = (() => {
    let ctx = null;

    function ensureCtx() {
        if (ctx) return ctx;
        try {
            const AudioCtor = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtor) return null;
            ctx = new AudioCtor();
        } catch (e) {
            ctx = null;
        }
        return ctx;
    }

    function resumeIfSuspended() {
        const c = ensureCtx();
        if (c && c.state === 'suspended' && typeof c.resume === 'function') {
            c.resume().catch(() => {});
        }
    }

    // Resume the AudioContext on the first user interaction.
    ['click', 'touchend', 'keydown'].forEach(evt => {
        window.addEventListener(evt, resumeIfSuspended, { once: false, passive: true });
    });

    function isMuted() {
        return localStorage.getItem('sound-muted') === 'true';
    }

    function playTone(frequency, duration, type = 'sine', gain = 0.3) {
        if (isMuted()) return;
        const c = ensureCtx();
        if (!c) return;
        try {
            const osc = c.createOscillator();
            const gainNode = c.createGain();
            osc.connect(gainNode);
            gainNode.connect(c.destination);
            osc.type = type;
            osc.frequency.setValueAtTime(frequency, c.currentTime);
            gainNode.gain.setValueAtTime(gain, c.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
            osc.start(c.currentTime);
            osc.stop(c.currentTime + duration);
        } catch (e) { /* ignore */ }
    }

    return {
        placePiece() {
            playTone(600, 0.08, 'square', 0.15);
        },
        flipPiece() {
            if (isMuted()) return;
            const c = ensureCtx();
            if (!c) return;
            try {
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.connect(gain);
                gain.connect(c.destination);
                osc.frequency.setValueAtTime(400, c.currentTime);
                osc.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.15);
                gain.gain.setValueAtTime(0.2, c.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15);
                osc.start();
                osc.stop(c.currentTime + 0.15);
            } catch (e) { /* ignore */ }
        },
        win() {
            [523, 659, 784].forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.3, 'sine', 0.25), i * 150);
            });
        },
        lose() {
            [400, 300, 220].forEach((freq, i) => {
                setTimeout(() => playTone(freq, 0.35, 'sine', 0.2), i * 180);
            });
        },
        skip() {
            playTone(220, 0.2, 'sine', 0.1);
        }
    };
})();
