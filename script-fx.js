// ============================================
// SHARED VISUAL EFFECTS
// Two effects are used by more than one view, so they live here once
// instead of being re-implemented per module:
//
//   • the pixel field — the drifting square-dot canvas behind the whole
//     page and inside the game detail panel;
//   • the cursor tilt — the "poster leans toward your mouse" effect on
//     every cover card (library detail, tier maker, About me, top lists).
// ============================================
(function () {
    // ---- Pixel field maths ----

    // Four plane waves at different angles/frequencies/speeds, summed
    // rather than multiplied — multiplying two fields zeroes out
    // everywhere the two don't already agree, which reads as separated
    // blobs. Summing traveling waves gives one continuous interference
    // pattern that flows and drifts like water. Returns -1..1.
    function wave(x, y, t) {
        return (
            Math.sin(x * 0.018 + t * 0.001) +
            Math.sin(y * 0.021 - t * 0.00082) +
            Math.sin((x + y) * 0.013 + t * 0.00065) +
            Math.sin((x - y) * 0.016 - t * 0.0009)
        ) / 4;
    }

    // The ambient wave, reshaped to 0..1 with a slight bias toward the
    // low end so the bright crests stay sparse.
    window.pixelAmbient = function (x, y, t) {
        return Math.pow((wave(x, y, t) + 1) / 2, 1.35);
    };

    // Eases toward a target at different rates depending on direction, so
    // an effect can rise fast and drain slowly — that asymmetry is what
    // makes a passing cursor leave a trail instead of snapping off.
    window.pixelLerp = function (current, target, dt, riseRate, fallRate) {
        return current + (target - current) * Math.min(1, dt * (target > current ? riseRate : fallRate));
    };

    // How hard an expanding ring is hitting this point right now: 0
    // outside the ring, strongest at its leading edge, fading to 0 as the
    // whole ripple ages out. `radius`/`fade` are computed once per frame
    // by the field — they don't vary per dot.
    window.pixelRipplePulse = function (x, y, ripple) {
        const ringDist = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - ripple.radius);
        if (ringDist >= ripple.thickness) return 0;
        return (1 - ringDist / ripple.thickness) * ripple.fade;
    };

    // How strongly a point is inside a rect's `margin` halo, 0..1, with a
    // concave falloff so the second and third rows of pixels still swell
    // visibly less than the first — reading as one soft glow rather than
    // a hard band. Runs per dot per card, so it rejects the common
    // far-away case with plain comparisons before touching sqrt.
    window.pixelRectFalloff = function (x, y, rect, margin, exp) {
        if (x < rect.left - margin || x > rect.right + margin
            || y < rect.top - margin || y > rect.bottom + margin) return 0;
        const dx = Math.max(rect.left - x, 0, x - rect.right);
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);
        const d2 = dx * dx + dy * dy;
        if (d2 >= margin * margin) return 0;
        return Math.pow(1 - Math.sqrt(d2) / margin, exp);
    };

    // ---- Pixel field engine ----
    // Owns the dot grid, DPR-correct sizing, the rAF loop, ripple
    // lifecycle and drawing. Callers supply only `shade`, which decides
    // what one dot looks like this frame — that's the sole difference
    // between the page background and the detail panel's field.
    //
    // `shade(dot, env)` must set dot.size / dot.r / dot.g / dot.b /
    // dot.alpha. `env` is { now, dt, mouseX, mouseY, hasMouse, ripples }.
    window.createPixelField = function (canvas, { spacing, initDot, shade, beforeFrame = null, autoRipple = null }) {
        const ctx = canvas.getContext('2d');

        let width = 0;
        let height = 0;
        let dots = [];
        let ripples = [];
        let frameId = null;
        let lastTime = null;
        let mouseX = -9999;
        let mouseY = -9999;
        let hasMouse = false;
        let nextAuto = 0;

        const autoGap = () => autoRipple.minGap + Math.random() * (autoRipple.maxGap - autoRipple.minGap);

        function resize() {
            width = canvas.clientWidth;
            height = canvas.clientHeight;
            if (!width || !height) return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            dots = [];
            for (let row = 0; row <= Math.ceil(height / spacing); row++) {
                for (let col = 0; col <= Math.ceil(width / spacing); col++) {
                    dots.push({ x: col * spacing, y: row * spacing, ...initDot() });
                }
            }
        }

        function paint(now) {
            const dt = lastTime == null ? 16 : now - lastTime;
            lastTime = now;

            if (ripples.length) ripples = ripples.filter((r) => now - r.start < r.duration);

            if (autoRipple) {
                nextAuto -= dt;
                if (nextAuto <= 0) {
                    field.addRipple(Math.random() * width, Math.random() * height, autoRipple);
                    nextAuto = autoGap();
                }
            }

            // Anything that varies per frame but not per dot is computed
            // once here — inside the dot loop it would run thousands of
            // times a frame for the same answer.
            for (const r of ripples) {
                const progress = (now - r.start) / r.duration;
                r.radius = progress * r.maxRadius;
                r.fade = 1 - progress;
            }

            const env = { now, dt, mouseX, mouseY, hasMouse, ripples };
            beforeFrame?.(env);

            ctx.clearRect(0, 0, width, height);
            for (const dot of dots) {
                shade(dot, env);
                if (dot.alpha < 0.01) continue; // skip the draw call for dots that wouldn't show anyway
                const half = dot.size / 2;
                ctx.fillStyle = `rgba(${dot.r | 0}, ${dot.g | 0}, ${dot.b | 0}, ${Math.min(1, dot.alpha)})`;
                ctx.fillRect(dot.x - half, dot.y - half, dot.size, dot.size);
            }
        }

        function frame(now) {
            paint(now);
            frameId = requestAnimationFrame(frame);
        }

        const field = {
            resize,

            start() {
                resize();
                if (autoRipple) nextAuto = autoGap();
                if (!frameId) frameId = requestAnimationFrame(frame);
            },

            stop() {
                if (frameId) cancelAnimationFrame(frameId);
                frameId = null;
                hasMouse = false;
                ripples = [];
                lastTime = null;
            },

            // A single static frame, for prefers-reduced-motion.
            drawStill() {
                resize();
                paint(performance.now());
            },

            addRipple(x, y, shape) {
                ripples.push({ x, y, start: performance.now(), ...shape });
            },

            setMouse(x, y) {
                mouseX = x;
                mouseY = y;
                hasMouse = true;
            },

            clearMouse() {
                hasMouse = false;
            }
        };

        return field;
    };

    // ---- Cursor tilt ----
    // Delegated from a container so it survives re-renders instead of
    // being re-wired per element. Pass `selector: null` to tilt the
    // container itself (the two single-cover cases).
    window.attachTilt = function (root, { selector = null, max = 12, perspective = 600, scale = 1.04 } = {}) {
        let target = null;

        function reset() {
            if (!target) return;
            target.style.transform = '';
            target.classList.remove('is-tilting');
            target = null;
        }

        root.addEventListener('mousemove', (event) => {
            const el = selector ? event.target.closest(selector) : root;
            if (!el) return reset();

            if (el !== target) {
                reset();
                target = el;
                el.classList.add('is-tilting');
            }

            const rect = el.getBoundingClientRect();
            const px = (event.clientX - rect.left) / rect.width;
            const py = (event.clientY - rect.top) / rect.height;
            el.style.transform =
                `perspective(${perspective}px) rotateX(${((0.5 - py) * max * 2).toFixed(2)}deg) `
                + `rotateY(${((px - 0.5) * max * 2).toFixed(2)}deg) scale(${scale})`;
        });

        root.addEventListener('mouseleave', reset);

        return reset;
    };
})();
