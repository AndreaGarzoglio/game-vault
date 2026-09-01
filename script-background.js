// ============================================
// PAGE BACKGROUND
// The full-viewport pixel field. On top of the shared ambient drift (see
// script-fx.js) it reacts to three things: the cursor, the rectangles of
// the cards currently on screen — a faint always-on glow per card, and a
// much stronger one for whichever is hovered — and expanding ripples,
// both from clicks and spawned on a timer so the field never sits still.
// ============================================
(function () {
    const canvas = document.getElementById('pixelBg');
    if (!canvas) return;

    const SPACING = 24;
    const BASE_SIZE = 2.5;
    const AMBIENT_MAX = 5.6;
    const MOUSE_SIZE = 12;
    const MOUSE_RADIUS = 160;

    const HOVER_ZONE_MARGIN = 76;
    const HOVER_ZONE_MAX_SIZE = 7.2;
    const AMBIENT_ZONE_MARGIN = 55;
    const AMBIENT_ZONE_MAX_SIZE = 5.4;
    const AMBIENT_ZONE_COLOR_MAX = 0.5;

    const PURPLE = [168, 85, 247];
    const MAGENTA = [236, 72, 153];

    const CLICK_RIPPLE = { maxRadius: 640, thickness: 120, size: 17, duration: 1300, tint: MAGENTA };
    const AUTO_RIPPLE = {
        maxRadius: 220, thickness: 55, size: 7.5, duration: 1300, tint: null,
        minGap: 2200, maxGap: 5500
    };

    let hoverZone = null; // { rect, tint } — the hovered card, full intensity
    let cardZones = []; // [{ rect, tint }] — every rendered card, faint glow

    // Hoisted out of the per-dot path: these are property loads on the
    // global object, and `shade` runs thousands of times a frame.
    const { pixelAmbient, pixelLerp, pixelRipplePulse, pixelRectFalloff } = window;

    const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;

    // The two sine pulses vary per frame but not per dot, so they get
    // computed once a frame here rather than once per dot.
    let pulse = 1;
    let hoverPulse = 1;

    function beforeFrame({ now }) {
        pulse = 0.86 + 0.14 * Math.sin(now * 0.0052);
        hoverPulse = 0.88 + 0.12 * Math.sin(now * 0.0063);
    }

    // Each effect proposes a dot size and (optionally) a tint; the
    // strongest proposal wins, rather than them summing into mush. The
    // comparison is spelled out at each site rather than going through a
    // helper — a closure here would be allocated per dot, per frame.
    function shade(dot, { now, dt, mouseX, mouseY, hasMouse, ripples }) {
        const shaped = pixelAmbient(dot.x, dot.y, now);
        let sizeTarget = BASE_SIZE + shaped * (AMBIENT_MAX - BASE_SIZE);
        let colorTarget = 0;
        let tintTarget = MAGENTA;

        if (hasMouse) {
            const dx = dot.x - mouseX;
            const dy = dot.y - mouseY;
            const d2 = dx * dx + dy * dy;
            if (d2 < MOUSE_RADIUS_SQ) {
                const eased = Math.pow(1 - Math.sqrt(d2) / MOUSE_RADIUS, 2);
                const size = BASE_SIZE + eased * (MOUSE_SIZE - BASE_SIZE) * pulse;
                if (size > sizeTarget) sizeTarget = size;
                colorTarget = eased * pulse;
            }
        }

        // Every card leaves a very faint permanent glow beside it; the
        // hovered one below is far stronger and simply wins wherever the
        // two overlap.
        for (const zone of cardZones) {
            const falloff = pixelRectFalloff(dot.x, dot.y, zone.rect, AMBIENT_ZONE_MARGIN, 0.6);
            if (!falloff) continue;
            const size = BASE_SIZE + falloff * (AMBIENT_ZONE_MAX_SIZE - BASE_SIZE);
            if (size > sizeTarget) sizeTarget = size;
            const color = falloff * AMBIENT_ZONE_COLOR_MAX;
            if (color > colorTarget) {
                colorTarget = color;
                tintTarget = zone.tint;
            }
        }

        if (hoverZone) {
            const falloff = pixelRectFalloff(dot.x, dot.y, hoverZone.rect, HOVER_ZONE_MARGIN, 0.55);
            if (falloff) {
                const hit = falloff * hoverPulse;
                const size = BASE_SIZE + hit * (HOVER_ZONE_MAX_SIZE - BASE_SIZE);
                if (size > sizeTarget) sizeTarget = size;
                if (hit > colorTarget) {
                    colorTarget = hit;
                    tintTarget = hoverZone.tint;
                }
            }
        }

        for (const ripple of ripples) {
            const hit = pixelRipplePulse(dot.x, dot.y, ripple);
            if (!hit) continue;
            const size = BASE_SIZE + hit * (ripple.size - BASE_SIZE);
            if (size > sizeTarget) sizeTarget = size;
            // The ambient auto-ripple carries no tint — it only swells dots.
            if (ripple.tint && hit > colorTarget) {
                colorTarget = hit;
                tintTarget = ripple.tint;
            }
        }

        dot.size = pixelLerp(dot.size, sizeTarget, dt, 0.016, 0.0045);
        dot.color = pixelLerp(dot.color, colorTarget, dt, 0.016, 0.004);
        dot.tintR = pixelLerp(dot.tintR, tintTarget[0], dt, 0.02, 0.008);
        dot.tintG = pixelLerp(dot.tintG, tintTarget[1], dt, 0.02, 0.008);
        dot.tintB = pixelLerp(dot.tintB, tintTarget[2], dt, 0.02, 0.008);

        // A dot is purple at rest and only takes on an effect's tint as
        // that effect's influence (dot.color) rises.
        dot.r = PURPLE[0] + (dot.tintR - PURPLE[0]) * dot.color;
        dot.g = PURPLE[1] + (dot.tintG - PURPLE[1]) * dot.color;
        dot.b = PURPLE[2] + (dot.tintB - PURPLE[2]) * dot.color;

        const glow = Math.max(0, Math.min(1, (dot.size - BASE_SIZE) / (MOUSE_SIZE - BASE_SIZE)));
        dot.alpha = 0.14 + glow * 0.55 + dot.color * 0.15;
    }

    const field = window.createPixelField(canvas, {
        spacing: SPACING,
        autoRipple: AUTO_RIPPLE,
        initDot: () => ({ size: BASE_SIZE, color: 0, tintR: PURPLE[0], tintG: PURPLE[1], tintB: PURPLE[2] }),
        beforeFrame,
        shade
    });

    window.addEventListener('resize', field.resize);
    window.addEventListener('mousemove', (event) => field.setMouse(event.clientX, event.clientY));
    document.addEventListener('mouseleave', field.clearMouse);
    window.addEventListener('click', (event) => {
        // Cards spawn their own accent-tinted ripple (below), so the
        // generic one would double up on them.
        if (event.target instanceof Element && event.target.closest('.show-frame')) return;
        field.addRipple(event.clientX, event.clientY, CLICK_RIPPLE);
    });

    // Exposed so game cards can make the pixels beside them pulse in the
    // card's own accent color on hover/click.
    window.setCardHoverZone = function (rect, tint) {
        hoverZone = { rect, tint };
    };

    window.clearCardHoverZone = function () {
        hoverZone = null;
    };

    // The always-on, very faint per-card glow — called once after every
    // render with the current position/color of every card on screen.
    window.setCardZones = function (zones) {
        cardZones = zones || [];
    };

    window.spawnColoredRipple = function (x, y, tint) {
        field.addRipple(x, y, { maxRadius: 460, thickness: 100, size: 14, duration: 1200, tint });
    };

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) field.drawStill();
    else field.start();
})();
