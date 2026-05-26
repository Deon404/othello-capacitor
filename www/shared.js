/* shared.js — Common code shared across all Othello HTML pages.
   Includes color themes, theme loader, board helpers, and a sanitizeText helper.
   MUST be loaded BEFORE any inline <script> tag that uses these symbols. */

/* ---------------- DOMPurify safety shim ----------------
   purify.min.js is bundled locally now so it should always load. But if a
   future build ever ships without it, or the file is corrupt, the pages
   that call DOMPurify.sanitize() should not silently render nothing
   (which is exactly the bug that wiped out the Story Mode level bubbles
   when the CDN version failed to load). Provide a no-op fallback that the
   real DOMPurify will overwrite once its script tag executes. */
if (typeof window !== 'undefined' && !window.DOMPurify) {
    window.DOMPurify = { sanitize: function (input) { return String(input == null ? '' : input); } };
}

/* ---------------- Color theme system ----------------
   Each theme is defined by 7 simple inputs (bg1, bg2, accent + 2 shades, text,
   onAccent). buildTheme() expands them into the full token set consumed by
   style.css (--bg-mid, --bg-deep, --bg-card, --gold, --gold-dark, --gold-light,
   --gold-glow, --gold-soft, --gold-strong, --gold-shine, --btn-primary-*,
   --btn-secondary-*, --board-border, --shadow-gold, plus all legacy aliases).
   This is what makes the Settings page's "Select Color Theme" dropdown actually
   re-skin the entire app — picking "Grapefruit" really turns it pink/red. */

function hexToRgba(hex, alpha) {
    if (!hex) return `rgba(255, 215, 0, ${alpha})`;
    let h = String(hex).replace('#', '').trim();
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const r = parseInt(h.substr(0, 2), 16);
    const g = parseInt(h.substr(2, 2), 16);
    const b = parseInt(h.substr(4, 2), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Blend two hex colors in RGB space. weightA is the share of color a (0..1).
// Used to keep the board's iconic green while letting the active theme accent
// bleed in, so a red theme yields a warm reddish-green board (not green-on-red).
function mixHex(a, b, weightA) {
    if (!a) return b;
    if (!b) return a;
    const expand = h => {
        let s = String(h).replace('#', '').trim();
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        return s;
    };
    const ea = expand(a);
    const eb = expand(b);
    const wa = Math.max(0, Math.min(1, weightA));
    const wb = 1 - wa;
    const mix = (offset) => Math.round(
        parseInt(ea.substr(offset, 2), 16) * wa +
        parseInt(eb.substr(offset, 2), 16) * wb
    );
    const toHex = n => n.toString(16).padStart(2, '0');
    return `#${toHex(mix(0))}${toHex(mix(2))}${toHex(mix(4))}`;
}

function buildTheme(spec) {
    const { bg1, bg2, accent, accentDark, accentLight, text, onAccent, isGreenIdentity } = spec;
    const isLightText = (text || '#FFFFFF').toLowerCase() === '#ffffff' || text === '#fff';
    const muted = isLightText ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)';
    const dim   = isLightText ? 'rgba(255, 255, 255, 0.30)' : 'rgba(0, 0, 0, 0.30)';

    const accentGlow   = hexToRgba(accent, 0.25);
    const accentSoft   = hexToRgba(accent, 0.22);
    const accentStrong = hexToRgba(accent, 0.45);
    const accentShine  = hexToRgba(accent, 0.10);
    const accentMid    = hexToRgba(accent, 0.35);

    // Board surface tint: by default the active theme dominates so picking
    // Grapefruit / Sapphire / Lavender visibly re-skins the felt. Themes that
    // already carry a green identity (forest/grass/mint) keep the iconic
    // Othello green dominant via isGreenIdentity. The numbers below are the
    // share of THE ORIGINAL OTHELLO GREEN in the mix — everything else is
    // taken from the theme's accent / bg.
    const greenWeight = isGreenIdentity ? 0.55 : 0.18;
    const feltWeight  = isGreenIdentity ? 0.55 : 0.20;

    return {
        /* === New design tokens (the ones style.css actually uses) === */
        'bg-mid':                 bg1,
        'bg-deep':                bg2,
        'bg-card':                hexToRgba(bg1, 0.75),
        'bg-card-2':              hexToRgba(bg2, 0.90),
        'bg-overlay':             hexToRgba(bg2, 0.92),

        'gold':                   accent,
        'gold-dark':              accentDark,
        'gold-light':             accentLight,
        'gold-glow':              accentGlow,
        'gold-soft':              accentSoft,
        'gold-strong':            accentStrong,
        'gold-shine':             accentShine,

        'text-primary':           text,
        'text-gold':              accent,
        'text-muted':             muted,
        'text-dim':               dim,

        // Border: blend the accent with the deep bg so it reads as a richly
        // themed frame instead of a loud contrast ring (Forest -> deep olive,
        // Grapefruit -> rich crimson, etc.).
        'board-border':           mixHex(accent, bg2, 0.62),
        // Hint dot: brighter accent variant + higher opacity so it pops
        // against the warm-tinted board surface on every theme.
        'board-hint':             hexToRgba(accentLight, 0.78),

        'btn-primary-bg':         accent,
        'btn-primary-text':       onAccent,
        'btn-secondary-bg':       hexToRgba(bg1, 0.70),
        'btn-secondary-border':   accentMid,

        'shadow-gold':            `0 4px 20px ${accentGlow}`,

        'timer-text-color':       accent,
        'timer-bg-color':         hexToRgba(bg2, 0.90),
        'timer-border-color':     accentMid,
        'timer-low-color':        '#FF4757',

        'last-move-dot-color':    accent,

        /* === Legacy aliases (for any old inline CSS still referencing them) === */
        'background-color-1':     bg1,
        'background-color-2':     bg2,
        'text-color':             text,
        'button-color':           accent,
        'button-text-color':      onAccent,
        'button-hover-color':     accentDark,
        'scoreboard-text-color':  text,
        'skip-history-heading-color': accent,
        'skip-history-text-color':    muted,

        /* === Theme-aware board surface ===
           The active theme dominates by default — picking Grapefruit gives a
           red board, Sapphire a blue board, etc. Forest/Grass/Mint preserve
           the iconic Othello green via the isGreenIdentity flag. */
        'board-color':            mixHex('#059669', accentDark, greenWeight),
        'board-bg':               mixHex('#053d2a', bg2,        feltWeight),
        // Gridline color is locked to pure black across every theme so the
        // 8x8 grid reads with classic-Othello clarity regardless of felt hue.
        'board-cell-edge':        '#000000',

        /* === Piece b/w stay constant (Othello identity) === */
        'piece-black-dark':       '#000',
        'piece-black-light':      '#444',
        'piece-white-dark':       '#ddd',
        'piece-white-light':      '#fff'
    };
}

const colorThemes = {
    // Each theme is the unified Candy-Crush look re-tinted around a single accent
    // color. The default (purple/gold) matches style.css :root exactly.
    default:        buildTheme({ bg1: '#1D0B6B', bg2: '#11044A', accent: '#FFD700', accentDark: '#E6A800', accentLight: '#FFE44D', text: '#FFFFFF', onAccent: '#2D1B69' }),
    dark:           buildTheme({ bg1: '#2A2A2A', bg2: '#111111', accent: '#9CA3AF', accentDark: '#6B7280', accentLight: '#D1D5DB', text: '#FFFFFF', onAccent: '#111111' }),
    forest:         buildTheme({ bg1: '#2C5F3E', bg2: '#143821', accent: '#C9A86A', accentDark: '#957A4D', accentLight: '#E5C77E', text: '#FFFFFF', onAccent: '#143821', isGreenIdentity: true }),
    grapefruit:     buildTheme({ bg1: '#6B1029', bg2: '#3D0518', accent: '#FF6B7A', accentDark: '#E04555', accentLight: '#FF9098', text: '#FFFFFF', onAccent: '#3D0518' }),
    bittersweet:    buildTheme({ bg1: '#6B2316', bg2: '#3D1108', accent: '#FB6D51', accentDark: '#DC5236', accentLight: '#FF8E78', text: '#FFFFFF', onAccent: '#3D1108' }),
    sunflower:      buildTheme({ bg1: '#6B5410', bg2: '#3D3008', accent: '#FECD57', accentDark: '#DCA730', accentLight: '#FFE08A', text: '#FFFFFF', onAccent: '#3D3008' }),
    grass:          buildTheme({ bg1: '#2D5F1F', bg2: '#143811', accent: '#9ED36A', accentDark: '#75A845', accentLight: '#BFE48E', text: '#FFFFFF', onAccent: '#143811', isGreenIdentity: true }),
    mint:           buildTheme({ bg1: '#1F5F4F', bg2: '#0E382A', accent: '#46CEAD', accentDark: '#2A9F85', accentLight: '#6FE5C7', text: '#FFFFFF', onAccent: '#0E382A', isGreenIdentity: true }),
    aqua:           buildTheme({ bg1: '#1F5F6E', bg2: '#0E3845', accent: '#5EC0C0', accentDark: '#3A9999', accentLight: '#88D5D5', text: '#FFFFFF', onAccent: '#0E3845' }),
    bluejeans:      buildTheme({ bg1: '#1F4A8C', bg2: '#0E2A5C', accent: '#5E9CEA', accentDark: '#3A78C8', accentLight: '#8AB8F0', text: '#FFFFFF', onAccent: '#0E2A5C' }),
    lavenderpurple: buildTheme({ bg1: '#4A3E8C', bg2: '#2A1F5C', accent: '#AC92EA', accentDark: '#8A6FD0', accentLight: '#C4B0F0', text: '#FFFFFF', onAccent: '#2A1F5C' }),
    lavenderpink:   buildTheme({ bg1: '#6B1F4A', bg2: '#3D0E2A', accent: '#EB87BF', accentDark: '#C46B9F', accentLight: '#F2A8D2', text: '#FFFFFF', onAccent: '#3D0E2A' }),
    skintone:       buildTheme({ bg1: '#5C4030', bg2: '#36241A', accent: '#F0C8A5', accentDark: '#C9A084', accentLight: '#F5DCC1', text: '#FFFFFF', onAccent: '#36241A' }),
    lightgray:      buildTheme({ bg1: '#5C5F66', bg2: '#36383D', accent: '#E5E8EC', accentDark: '#B0B5BC', accentLight: '#F4F6F9', text: '#FFFFFF', onAccent: '#36383D' }),
    darkgray:       buildTheme({ bg1: '#2E3138', bg2: '#16181C', accent: '#A9B1BC', accentDark: '#767D88', accentLight: '#C8CFD8', text: '#FFFFFF', onAccent: '#16181C' })
};

/* ---------------- Disk Skin Catalogue ----------------
   These constants must be declared above applyTheme()/loadTheme() because
   loadTheme() runs synchronously at the bottom of this file and ends up
   calling applyDiskSkin(), which reads DISK_STYLES_BLACK/WHITE. Hoisting
   `const`s further down would trip the Temporal Dead Zone.

   We expose two arrays — DISK_STYLES_BLACK and DISK_STYLES_WHITE — each
   with three TRULY DISTINCT art styles (their own SVG file), rather than
   a single base SVG tinted in N colors. The skin selection persists as
   { black: <id>, white: <id> } in localStorage under "disk-skin". */
const MATCH_THEME_STORAGE_KEY = 'disk-skin-match-theme';

const DISK_STYLES_BLACK = [
    { id: 'galaxy',       label: 'Galaxy Void',       asset: 'assets/disks/galaxy.svg',              sparkle: '#ffb8f0' },
    { id: 'cracked-void', label: 'Cracked Void Core', asset: 'assets/disks/cracked-void-black.svg', sparkle: '#9eebff' },
    { id: 'onyx-marble',  label: 'Onyx Marble',       asset: 'assets/disks/onyx-marble.svg',         sparkle: '#e8ecf5' }
];

const DISK_STYLES_WHITE = [
    { id: 'moonstone',    label: 'Moonstone',         asset: 'assets/disks/moonstone.svg',           sparkle: '#dbe6ff' },
    { id: 'cracked-void', label: 'Cracked Void Core', asset: 'assets/disks/cracked-void-white.svg', sparkle: '#ffd87a' },
    { id: 'pearl',        label: 'Iridescent Pearl',  asset: 'assets/disks/pearl.svg',               sparkle: '#ffe5f3' }
];

const DEFAULT_DISK_SKIN = { black: 'galaxy', white: 'moonstone' };

/* Per-theme recommended style pair used by the "Match Color Theme" toggle.
   Each theme is mapped to a pair that pairs nicely with its accent — gemstone
   look for the bright premium themes, classic / marble / pearl for the more
   muted or naturalistic themes. Every value MUST be a valid id from the
   DISK_STYLES_BLACK / DISK_STYLES_WHITE arrays above. */
const THEME_DISK_MAP = {
    default:        { black: 'galaxy',       white: 'moonstone'    },
    dark:           { black: 'galaxy',       white: 'moonstone'    },
    darkgray:       { black: 'onyx-marble',  white: 'cracked-void' },
    lightgray:      { black: 'cracked-void', white: 'cracked-void' },
    skintone:       { black: 'cracked-void', white: 'pearl'        },
    forest:         { black: 'onyx-marble',  white: 'pearl'        },
    grass:          { black: 'onyx-marble',  white: 'pearl'        },
    mint:           { black: 'onyx-marble',  white: 'pearl'        },
    aqua:           { black: 'galaxy',       white: 'moonstone'    },
    bluejeans:      { black: 'galaxy',       white: 'moonstone'    },
    lavenderpurple: { black: 'galaxy',       white: 'pearl'        },
    lavenderpink:   { black: 'onyx-marble',  white: 'pearl'        },
    grapefruit:     { black: 'cracked-void', white: 'pearl'        },
    bittersweet:    { black: 'cracked-void', white: 'pearl'        },
    sunflower:      { black: 'cracked-void', white: 'cracked-void' }
};

function getMatchTheme() {
    const raw = localStorage.getItem(MATCH_THEME_STORAGE_KEY);
    if (raw === null) return true;
    return raw === 'true';
}

function setMatchTheme(flag) {
    localStorage.setItem(MATCH_THEME_STORAGE_KEY, flag ? 'true' : 'false');
}

function applyTheme(themeName) {
    const theme = colorThemes[themeName] || colorThemes.default;
    if (!theme) return;
    const root = document.documentElement;
    for (const [variable, value] of Object.entries(theme)) {
        root.style.setProperty(`--${variable}`, value);
    }

    // Sync the piece skin so the board pieces follow the active theme. Relies
    // on function-declaration hoisting — applyDiskSkin is defined further down
    // in this file but is reachable here. Manual picks in Settings disable
    // this behaviour by flipping the match-theme flag off.
    if (typeof applyDiskSkin === 'function' && getMatchTheme()) {
        const skin = THEME_DISK_MAP[themeName] || THEME_DISK_MAP.default;
        if (skin) applyDiskSkin(skin);
    }
}

function loadTheme() {
    const theme = localStorage.getItem('color-theme') || 'default';
    applyTheme(theme);
}

/* One-time migration for users upgrading from a pre-match-theme build:
   if they already had a custom disk-skin saved but no explicit match-theme
   preference, respect their manual choice by turning the toggle off. New
   users (no prior disk-skin) keep the default ON so they get the premium
   theme-synced look immediately. */
if (typeof localStorage !== 'undefined') {
    if (localStorage.getItem(MATCH_THEME_STORAGE_KEY) === null &&
        localStorage.getItem('disk-skin') !== null) {
        localStorage.setItem(MATCH_THEME_STORAGE_KEY, 'false');
    }
}

// Apply theme as soon as this script runs so the page paints with the correct colors.
loadTheme();

// React to theme changes from other tabs/windows.
window.addEventListener('storage', function (event) {
    if (event.key === 'color-theme' || event.key === MATCH_THEME_STORAGE_KEY) {
        loadTheme();
    }
});

/* ---------------- Disk Skin System ----------------
   Each "skin" is a pair { black: <styleId>, white: <styleId> } whose ids
   reference DISK_STYLES_BLACK / DISK_STYLES_WHITE (declared near the top
   of this file, above loadTheme() to avoid TDZ). Picking a new style swaps
   the SVG asset wholesale — no hue-rotate tinting, so the chosen art style
   is exactly what renders on the board.

   We expose:
     - DISK_STYLES_BLACK / DISK_STYLES_WHITE  → 3-style catalogue per side
     - getDiskSkin() / setDiskSkin()          → load/save the saved pair
     - applyDiskSkin(skin)                    → writes CSS vars on :root so
                                                every .piece-face rerenders
   The base game's solid black/white discs remain the fallback if the SVG
   assets ever fail to load — no gameplay regression possible.
-------------------------------------------------------------------------*/

function getDiskSkin() {
    try {
        const raw = localStorage.getItem('disk-skin');
        if (!raw) return { ...DEFAULT_DISK_SKIN };
        const parsed = JSON.parse(raw) || {};
        // Validate each id against its side's catalogue. Legacy values from
        // the old color-tint era (sapphire/ruby/emerald/amethyst) will not
        // match any style id and silently fall back to the defaults.
        return {
            black: DISK_STYLES_BLACK.some(s => s.id === parsed.black) ? parsed.black : DEFAULT_DISK_SKIN.black,
            white: DISK_STYLES_WHITE.some(s => s.id === parsed.white) ? parsed.white : DEFAULT_DISK_SKIN.white
        };
    } catch {
        return { ...DEFAULT_DISK_SKIN };
    }
}

function setDiskSkin(skin) {
    const next = { ...getDiskSkin(), ...skin };
    const merged = { black: next.black, white: next.white };
    localStorage.setItem('disk-skin', JSON.stringify(merged));
    applyDiskSkin(merged);
    return merged;
}

function applyDiskSkin(skin) {
    if (typeof document === 'undefined') return;
    const s = skin || getDiskSkin();
    const root = document.documentElement;
    const blackStyle = DISK_STYLES_BLACK.find(x => x.id === s.black) || DISK_STYLES_BLACK[0];
    const whiteStyle = DISK_STYLES_WHITE.find(x => x.id === s.white) || DISK_STYLES_WHITE[0];
    root.style.setProperty('--disk-skin-black',  `url("${blackStyle.asset}")`);
    root.style.setProperty('--disk-skin-white',  `url("${whiteStyle.asset}")`);
    // No more hue-rotate tints — each style is already its own finished art.
    root.style.setProperty('--disk-tint-black',  'none');
    root.style.setProperty('--disk-tint-white',  'none');
    root.style.setProperty('--disk-spark-black', blackStyle.sparkle);
    root.style.setProperty('--disk-spark-white', whiteStyle.sparkle);
    root.removeAttribute('data-disk-rarity');
}

/* ---------------- Capture-flip timing (shared) ----------------
   When a move captures discs, we DON'T flip them all at once anymore —
   that hid which discs were flipped by which placement and confused
   beginners. Instead, discs flip one "ring" at a time, where the ring is
   the Chebyshev distance from the placed piece. The immediate neighbours
   flip first, then the next ring, then the next — so the capture visibly
   ripples outward from the move point in every direction at once.

   These constants + helpers live here because the three game pages (vs-bot,
   local 2-player, online) all need to animate identically AND need to wait
   the same total duration before unlocking input / switching turns.

   - initialDelayMs   : pause after the placed piece's pop animation begins,
                        so the move's landing is clearly seen before the
                        first capture flip fires.
   - perRingDelayMs   : gap between consecutive rings — small enough to feel
                        snappy on a 1-disc capture, but big enough on a long
                        chain that each flip is individually visible.
   - squashDurationMs : length of one disc's squash/flip animation (matches
                        the .piece.flipping keyframe in style.css). The disc
                        is fully scaleX(0) at the midpoint, which is exactly
                        when its color class swaps under the hood.
-------------------------------------------------------------------------*/
const FLIP_TIMING = Object.freeze({
    initialDelayMs:    90,
    perRingDelayMs:   130,
    squashDurationMs: 450,
});

// Chebyshev distance from a captured disc to the placement cell. Ring 1 is
// the immediate neighbour (the first disc to flip in any direction).
function flipRingForPiece(flipped, placedAt) {
    if (!placedAt || typeof placedAt.x !== 'number' || typeof placedAt.y !== 'number') return 1;
    const dx = Math.abs(flipped.x - placedAt.x);
    const dy = Math.abs(flipped.y - placedAt.y);
    return Math.max(1, Math.max(dx, dy));
}

// When (ms from "now") a given captured disc should start its flip squash.
function flipStartDelayMs(flipped, placedAt) {
    const ring = flipRingForPiece(flipped, placedAt);
    return FLIP_TIMING.initialDelayMs + (ring - 1) * FLIP_TIMING.perRingDelayMs;
}

// Total animation time (ms) needed for ALL captured discs to finish their
// flip and settle back to scaleX(1). Callers `await` this before flipping
// turns, locking input, or re-rendering the board for the next move.
function flipTotalDurationMs(flippedPieces, placedAt) {
    if (!Array.isArray(flippedPieces) || flippedPieces.length === 0) return 0;
    let maxRing = 1;
    for (const p of flippedPieces) {
        const r = flipRingForPiece(p, placedAt);
        if (r > maxRing) maxRing = r;
    }
    return FLIP_TIMING.initialDelayMs
        + (maxRing - 1) * FLIP_TIMING.perRingDelayMs
        + FLIP_TIMING.squashDurationMs;
}

// Distinct per-ring start delays present in the flipped list, sorted in
// firing order. Game pages use this to schedule ONE flip-tone per ring so
// the capture sounds the same way it looks (cascading outward) instead of
// a single tone hiding a multi-disc chain.
function flipRingStartDelays(flippedPieces, placedAt) {
    if (!Array.isArray(flippedPieces) || flippedPieces.length === 0) return [];
    const seen = new Set();
    for (const p of flippedPieces) {
        seen.add(flipRingForPiece(p, placedAt));
    }
    return Array.from(seen)
        .sort((a, b) => a - b)
        .map(ring => FLIP_TIMING.initialDelayMs + (ring - 1) * FLIP_TIMING.perRingDelayMs);
}

/* ---------------- Sparkle particle burst ----------------
   Spawns a small number of accent-colored sparkles that fly outward from
   the centre of `cellElement`. Used by the game pages on piece placement
   and on each flip — gives the board a tactile "candy crush" feel without
   adding any heavyweight particle library.

   Particles are appended directly to the cell (which has overflow:hidden
   so they stay within the cell bounds), self-clean on animationend, and
   pick up the active theme accent via CSS vars (no inline colors).
-------------------------------------------------------------------------*/
function spawnSparkles(cellElement, count, colorHint) {
    if (!cellElement || typeof document === 'undefined') return;
    const n = Math.max(1, Math.min(8, count || 5));
    const size = cellElement.offsetWidth || 50;
    const maxDist = size * 0.42; // stay inside the cell
    // The `colorHint` is one of "black" | "white" | a CSS color string; the
    // flip path passes the NEW post-flip side so the magic-burst color
    // matches the captured disc. Falls back to the theme gold accent.
    let inlineColor = null;
    if (colorHint === 'black' || colorHint === 'white') {
        const root = document.documentElement;
        inlineColor = getComputedStyle(root).getPropertyValue(`--disk-spark-${colorHint}`).trim();
    } else if (typeof colorHint === 'string' && colorHint) {
        inlineColor = colorHint;
    }

    for (let i = 0; i < n; i++) {
        const baseAngle = (Math.PI * 2 / n) * i;
        const jitter = (Math.random() - 0.5) * (Math.PI / n);
        const angle = baseAngle + jitter;
        const dist = maxDist * (0.55 + Math.random() * 0.45);
        const dx = Math.cos(angle) * dist;
        const dy = Math.sin(angle) * dist;

        const sparkle = document.createElement('span');
        sparkle.className = 'sparkle';
        sparkle.style.setProperty('--dx', `${dx.toFixed(1)}px`);
        sparkle.style.setProperty('--dy', `${dy.toFixed(1)}px`);
        sparkle.style.animationDelay = `${Math.floor(Math.random() * 90)}ms`;
        if (inlineColor) sparkle.style.setProperty('--sparkle-color', inlineColor);

        cellElement.appendChild(sparkle);
        sparkle.addEventListener('animationend',
            () => sparkle.remove(), { once: true });
    }
}

// Apply on initial load so every page paints with the chosen skin instantly.
// If match-theme is ON, loadTheme() has already pushed the themed skin onto
// :root — skipping the saved-skin reapply prevents an overwrite flicker. If
// match-theme is OFF, fall through to the user's manually-saved skin.
if (typeof document !== 'undefined') {
    if (!getMatchTheme()) applyDiskSkin();
    window.addEventListener('storage', e => {
        if (e.key === 'disk-skin' && !getMatchTheme()) applyDiskSkin();
    });
}

/* ---------------- Ephemeral Room Style ----------------
   Online multiplayer needs both players to see the same board theme + piece
   designs that the host picked, without permanently overwriting either
   player's saved preferences. These helpers snapshot the host's chosen
   look at room-creation time and let the guest mirror it for the duration
   of the match only — no localStorage writes happen here.
-------------------------------------------------------------------------*/
function getCurrentRoomStyle() {
    try {
        const theme = (typeof localStorage !== 'undefined' && localStorage.getItem('color-theme')) || 'default';
        // When "Match Color Theme" is ON the displayed skin is derived from
        // the active theme via THEME_DISK_MAP — capture THAT, not the user's
        // older saved disk-skin pair which they may have overridden via the
        // toggle. When OFF, fall back to their explicit manual pick.
        let diskSkin;
        if (getMatchTheme() && THEME_DISK_MAP[theme]) {
            diskSkin = { ...THEME_DISK_MAP[theme] };
        } else {
            diskSkin = getDiskSkin();
        }
        return { theme, diskSkin };
    } catch {
        return { theme: 'default', diskSkin: { ...DEFAULT_DISK_SKIN } };
    }
}

function applyEphemeralRoomStyle(style) {
    if (typeof document === 'undefined' || !style) return;
    const root = document.documentElement;

    if (style.theme && colorThemes[style.theme]) {
        const themeData = colorThemes[style.theme];
        for (const [variable, value] of Object.entries(themeData)) {
            root.style.setProperty(`--${variable}`, value);
        }
    }

    if (style.diskSkin && typeof style.diskSkin === 'object') {
        // Validate ids against current catalogues so a legacy room style
        // (e.g. old "classic-black") falls back to the default instead of
        // pointing at a missing SVG asset.
        const safeSkin = {
            black: DISK_STYLES_BLACK.some(s => s.id === style.diskSkin.black) ? style.diskSkin.black : DEFAULT_DISK_SKIN.black,
            white: DISK_STYLES_WHITE.some(s => s.id === style.diskSkin.white) ? style.diskSkin.white : DEFAULT_DISK_SKIN.white
        };
        applyDiskSkin(safeSkin);
    }
}

if (typeof window !== 'undefined') {
    window.getCurrentRoomStyle = getCurrentRoomStyle;
    window.applyEphemeralRoomStyle = applyEphemeralRoomStyle;
}

/* ---------------- Board / Move Utilities ---------------- */

function copyBoard(currentBoard) {
    if (!currentBoard) return null;
    return currentBoard.map(row => [...row]);
}

function areBoardsEqual(board1, board2) {
    if (!board1 || !board2 || board1.length !== board2.length || board1[0].length !== board2[0].length) return false;
    for (let i = 0; i < board1.length; i++) {
        for (let j = 0; j < board1[i].length; j++) {
            if (board1[i][j] !== board2[i][j]) return false;
        }
    }
    return true;
}

// Pure validity check. Caller is responsible for any history-view / game-over guards.
function isValidMove(row, col, player, currentBoard, directions) {
    const EMPTY = 0;
    if (!currentBoard) return false;
    const size = currentBoard.length;
    if (row < 0 || row >= size || col < 0 || col >= size || currentBoard[row][col] !== EMPTY) return false;

    for (const [dx, dy] of directions) {
        let x = row + dx, y = col + dy, foundOpponent = false;
        while (x >= 0 && x < size && y >= 0 && y < size) {
            if (currentBoard[x][y] === EMPTY) break;
            if (currentBoard[x][y] === player) {
                if (foundOpponent) return true;
                break;
            }
            foundOpponent = true;
            x += dx;
            y += dy;
        }
    }
    return false;
}

// Pure player toggle. Always toggles between BLACK(1) and WHITE(2).
function switchPlayer(currentPlayer) {
    return currentPlayer === 1 ? 2 : 1;
}

function isLastPlaced(r, c, lastPlacedCoords) {
    return !!(lastPlacedCoords && lastPlacedCoords.x === r && lastPlacedCoords.y === c);
}

// Escape user-provided strings so they can be embedded safely. Prefer textContent where possible.
function sanitizeText(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

/* ---------------- Unified Candy Crush UI initializer ----------------
   Marks <body> for animation hooks and (on lower-end mobile devices) flips
   a body class that disables the most expensive visual effects.
   Fonts are bundled locally in style.css @font-face so we no longer inject
   any external Google Fonts <link> — that removed a network round-trip on
   every page load and is what fixed the "title appears in cursive on first
   launch" bug.
-------------------------------------------------------------------------*/
function applyGlobalAnimations() {
    if (typeof document === 'undefined') return;
    document.body.classList.add('cc-themed');

    // Heuristic mobile / low-power detection. CSS reads `.lite-fx` to drop the
    // most expensive effects (blur, infinite starfield/orb animation) so the
    // game stays smooth on cheaper Android devices and inside the Capacitor
    // WebView (which is noticeably slower than Chrome stable).
    try {
        const ua = (navigator.userAgent || '').toLowerCase();
        const isMobileUA = /android|iphone|ipad|ipod|capacitor|cordova/.test(ua);
        const lowCores = (navigator.hardwareConcurrency || 8) <= 4;
        const lowMem = (navigator.deviceMemory || 8) <= 4;
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (isMobileUA || coarse || lowCores || lowMem) {
            document.body.classList.add('lite-fx');
        }
    } catch (e) { /* ignore — feature detect failures shouldn't break the page */ }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyGlobalAnimations);
    } else {
        applyGlobalAnimations();
    }
}

/* ============================================================================
   OthelloStats — centralized win/loss/draw tracking across every game mode.
   ----------------------------------------------------------------------------
   One source of truth for the main-menu stats card and the settings reset.
   Each mode keeps its own bucket so we can show a per-mode breakdown AND a
   combined total (with win-rate). All buckets share the same {w, l, d} shape
   so totals are a simple sum.

   Storage keys (localStorage):
     stats-bot-easy     : { w, l, d }   (legacy, preserved)
     stats-bot-medium   : { w, l, d }   (legacy, preserved)
     stats-bot-hard     : { w, l, d }   (legacy, preserved)
     stats-pvp          : { w, l, d }   (NEW — was just a count before)
     stats-online       : { w, l, d }   (NEW — wasn't tracked at all)

   Backward-compat: if the old `stats-pvp-games` key exists and `stats-pvp`
   doesn't, we migrate the count into `d` (draws) on first read so existing
   users don't lose their match count.
   ============================================================================ */
(function () {
    if (typeof window === 'undefined') return;

    const KEYS = {
        easy:   'stats-bot-easy',
        medium: 'stats-bot-medium',
        hard:   'stats-bot-hard',
        pvp:    'stats-pvp',
        online: 'stats-online',
    };
    const LEGACY_PVP_COUNT = 'stats-pvp-games';

    function emptyBucket() { return { w: 0, l: 0, d: 0 }; }

    function readBucket(key) {
        let raw;
        try { raw = localStorage.getItem(key); } catch (e) { return emptyBucket(); }
        if (!raw) return emptyBucket();
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return emptyBucket();
            return {
                w: Number(parsed.w) || 0,
                l: Number(parsed.l) || 0,
                d: Number(parsed.d) || 0,
            };
        } catch (e) { return emptyBucket(); }
    }

    function writeBucket(key, bucket) {
        try { localStorage.setItem(key, JSON.stringify(bucket)); } catch (e) { /* ignore */ }
    }

    // Migrate the old "stats-pvp-games" integer count into the new
    // {w,l,d} bucket exactly once. Old data only knew "games played",
    // so we park it under draws (neutral) to preserve the match count.
    function migrateLegacyPvp() {
        try {
            if (localStorage.getItem(KEYS.pvp)) return;
            const legacy = parseInt(localStorage.getItem(LEGACY_PVP_COUNT) || '0', 10);
            if (legacy > 0) {
                writeBucket(KEYS.pvp, { w: 0, l: 0, d: legacy });
            }
        } catch (e) { /* ignore */ }
    }
    migrateLegacyPvp();

    function record(key, result) {
        if (!['w', 'l', 'd'].includes(result)) return;
        const b = readBucket(key);
        b[result] = (b[result] || 0) + 1;
        writeBucket(key, b);
    }

    function totalOf(bucket) { return bucket.w + bucket.l + bucket.d; }

    function getAll() {
        const buckets = {
            easy:   readBucket(KEYS.easy),
            medium: readBucket(KEYS.medium),
            hard:   readBucket(KEYS.hard),
            pvp:    readBucket(KEYS.pvp),
            online: readBucket(KEYS.online),
        };
        const total = emptyBucket();
        Object.values(buckets).forEach(b => {
            total.w += b.w; total.l += b.l; total.d += b.d;
        });
        const games = totalOf(total);
        const decided = total.w + total.l;
        const winRate = decided > 0 ? Math.round((total.w / decided) * 100) : 0;
        return { buckets, total, games, winRate };
    }

    window.OthelloStats = {
        KEYS,
        recordBot(difficulty, result) {
            const key = KEYS[difficulty];
            if (key) record(key, result);
        },
        recordPvp(result) { record(KEYS.pvp, result); },
        recordOnline(result) { record(KEYS.online, result); },
        getAll,
    };
})();
