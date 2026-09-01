// ============================================
// SHARED UI KIT
// Small primitives every other module builds on: HTML escaping, the
// accent palette, a themed confirm dialog and a toast stack.
//
// The confirm/toast pair replaces native `confirm()`/`alert()`, which
// block the main thread, can't be styled, and (for a destructive action
// like removing a game) give no way back once dismissed. The toast
// version is non-blocking and can carry an Undo.
// ============================================
(function () {
    // ---- Escaping ----
    // Game titles, descriptions and tags are user-supplied and get
    // interpolated into innerHTML in several places. Without escaping, a
    // title like `<img onerror=...>` would execute — so everything
    // user-authored goes through here first.
    const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

    window.escapeHtml = function (value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ESCAPE_MAP[char]);
    };

    // One <use> reference into the sprite defined at the top of index.html.
    // `flip` turns an arrow around rather than needing a mirrored sprite.
    window.icon = function (name, { flip = false } = {}) {
        return `<svg class="icon" aria-hidden="true"${flip ? ' style="transform:rotate(180deg)"' : ''}><use href="#i-${name}"/></svg>`;
    };

    // ---- Accent palette, shared by the add form and the detail view ----
    // 9 base hues (white, blue, cyan, pink, purple, red, orange, green,
    // yellow), each as a light/saturated/dark triad.
    const COLOR_OPTIONS = [
        ['', 'Default'],
        ['#ffffff', 'White'],
        ['#94a3b8', 'Gray'],
        ['#334155', 'Dark gray'],
        ['#f43434', 'Red'],
        ['#f46b34', 'Red-orange'],
        ['#f4a234', 'Orange'],
        ['#f4d934', 'Amber'],
        ['#d9f434', 'Yellow'],
        ['#a2f434', 'Yellow-green'],
        ['#6bf434', 'Lime'],
        ['#34f434', 'Green'],
        ['#34f46b', 'Emerald'],
        ['#34f4a2', 'Teal'],
        ['#34f4d9', 'Cyan'],
        ['#34d9f4', 'Sky'],
        ['#34a2f4', 'Azure'],
        ['#346bf4', 'Blue'],
        ['#3434f4', 'Indigo'],
        ['#6b34f4', 'Violet'],
        ['#a234f4', 'Purple'],
        ['#d934f4', 'Magenta'],
        ['#f434d9', 'Pink'],
        ['#f434a2', 'Rose'],
        ['#f4346b', 'Crimson']
    ];

    // Same 24 hues games can be tagged with, minus the "Default" slot —
    // callers that need one solid color per item (no empty/inherit state)
    // reuse this instead of the raw COLOR_OPTIONS pairs.
    window.GAME_SWATCH_COLORS = COLOR_OPTIONS.filter(([value]) => value).map(([value]) => value);

    // `colors`/`attr` let a caller with its own flat hex palette (the tier
    // editor) reuse this instead of rebuilding the same button markup.
    // `selected` can be a single hex or a comma-separated list — every
    // swatch present in it renders active, so callers can support picking
    // more than one color (see toggleSwatchSelection below).
    window.renderSwatchRow = function (selected, { colors, attr = 'color' } = {}) {
        const options = colors ? colors.map((hex) => [hex, hex]) : COLOR_OPTIONS;
        const picked = String(selected || '').split(',').map((v) => v.trim()).filter(Boolean);
        return options.map(([value, label]) => `
            <button type="button" class="swatch${(picked.includes(value) || (!picked.length && value === '')) ? ' is-active' : ''}"
                data-${attr}="${value}" style="--swatch:${value || 'var(--accent)'}"
                title="${window.escapeHtml(label)}" aria-label="${window.escapeHtml(label)}"></button>
        `).join('');
    };

    // Toggles one color in/out of a comma-separated selection — clicking
    // the default swatch always clears back to just the default.
    window.toggleSwatchSelection = function (current, value) {
        if (!value) return '';
        const picked = String(current || '').split(',').map((v) => v.trim()).filter(Boolean);
        const at = picked.indexOf(value);
        if (at === -1) picked.push(value);
        else picked.splice(at, 1);
        return picked.join(',');
    };

    // The rest of the app (--card-accent, the pixel-field tint, …) only
    // understands a single solid color. Picking the *last* one chosen
    // rather than the first matters: with the first, clicking a new
    // swatch while others were already picked silently did nothing
    // visible — the original pick stayed the accent forever. The most
    // recently toggled-on color is what a click should visibly become.
    window.activeSwatchColor = function (value) {
        const picked = String(value || '').split(',').map((v) => v.trim()).filter(Boolean);
        return picked[picked.length - 1] || '';
    };

    window.hexToRgb = function (hex, fallback = [168, 85, 247]) {
        if (!hex) return fallback;
        const clean = String(hex).replace('#', '');
        const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
        const n = parseInt(full, 16);
        if (Number.isNaN(n) || full.length !== 6) return fallback;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    // ---- Focus trap helper: keeps Tab inside an open dialog ----
    const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    window.trapFocus = function (root, event) {
        if (event.key !== 'Tab') return;
        const items = Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    // ---- Dialog scaffold ----
    // Every modal in the app is the same shell: a dimming overlay, a
    // notched box, Escape-to-close, a focus trap and focus restored on
    // close. Building it here also gives us a stack, so a dialog opened
    // on top of another (the game picker over an editor, say) sits above
    // it and closes back to it instead of the two fighting over one
    // z-index.
    const stack = [];

    window.createDialog = function ({ className = '', html, onClose } = {}) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay modal-overlay--top';
        overlay.hidden = true;

        const box = document.createElement('div');
        box.className = `modal-container modal-container--top notch ${className}`.trim();
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.hidden = true;
        // .ref-modal builds its own inner wrapper inline (it needs a
        // custom child layout), everything else gets the shared
        // notch-inner box that pairs with the outer frame above.
        box.innerHTML = className === 'ref-modal'
            ? html
            : `<div class="modal-container__inner notch-inner">${html}</div>`;
        document.body.append(overlay, box);

        let restoreFocusTo = null;

        const dialog = {
            el: box,

            open(focusEl) {
                if (stack.includes(dialog)) return;
                restoreFocusTo = document.activeElement;
                stack.push(dialog);
                // Two layers per dialog so its own overlay always lands
                // between it and whatever it was opened from.
                overlay.style.zIndex = 200 + stack.length * 2;
                box.style.zIndex = 201 + stack.length * 2;
                overlay.hidden = false;
                box.hidden = false;
                (focusEl || box.querySelector('input, textarea, button'))?.focus();
            },

            close() {
                if (box.hidden) return;
                const at = stack.indexOf(dialog);
                if (at !== -1) stack.splice(at, 1);
                overlay.hidden = true;
                box.hidden = true;
                restoreFocusTo?.focus?.();
                onClose?.();
            }
        };

        overlay.addEventListener('click', dialog.close);
        box.addEventListener('click', (event) => {
            if (event.target.closest('[data-dialog-close]')) dialog.close();
        });
        box.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') dialog.close();
            window.trapFocus(box, event);
        });

        return dialog;
    };

    // ---- Confirm dialog ----
    // Built on the shared dialog scaffold so it takes its place in the
    // stack — without that, confirming something from inside an
    // already-open dialog (e.g. deleting a card from its edit panel)
    // would render the confirm box *behind* it, unreachable.
    let resolveConfirm = null;

    const confirmDialog = window.createDialog({
        className: 'confirm',
        html: `
            <h2 class="confirm__title"></h2>
            <p class="confirm__message"></p>
            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch confirm__ok"><span class="btn-notch__inner"></span></button>
                <button type="button" class="cancelBtn btn-notch confirm__cancel"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => {
            confirmDialog.el.classList.remove('is-danger');
            resolveConfirm?.(false);
            resolveConfirm = null;
        }
    });
    confirmDialog.el.setAttribute('role', 'alertdialog');

    const confirmEls = {
        title: confirmDialog.el.querySelector('.confirm__title'),
        message: confirmDialog.el.querySelector('.confirm__message'),
        ok: confirmDialog.el.querySelector('.confirm__ok'),
        okLabel: confirmDialog.el.querySelector('.confirm__ok .btn-notch__inner'),
        cancel: confirmDialog.el.querySelector('.confirm__cancel')
    };

    confirmEls.ok.addEventListener('click', () => {
        resolveConfirm?.(true);
        resolveConfirm = null;
        confirmDialog.close();
    });
    confirmEls.cancel.addEventListener('click', () => confirmDialog.close());

    window.confirmDialog = function ({ title, message = '', confirmLabel = 'Confirm', danger = false }) {
        confirmEls.title.textContent = title;
        confirmEls.message.textContent = message;
        confirmEls.message.hidden = !message;
        confirmEls.okLabel.textContent = confirmLabel;
        confirmDialog.el.classList.toggle('is-danger', danger);
        confirmDialog.open(confirmEls.ok);
        return new Promise((resolve) => {
            resolveConfirm = resolve;
        });
    };

    // ---- Prompt dialog (single text field) ----
    let resolvePrompt = null;

    const promptDialog = window.createDialog({
        className: 'confirm',
        html: `
            <h2 class="confirm__title"></h2>
            <div class="formEntry"><input type="text" class="prompt__input"></div>
            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch prompt__ok"><span class="btn-notch__inner">Save</span></button>
                <button type="button" class="cancelBtn btn-notch prompt__cancel"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => {
            resolvePrompt?.(null);
            resolvePrompt = null;
        }
    });

    const promptEls = {
        title: promptDialog.el.querySelector('.confirm__title'),
        input: promptDialog.el.querySelector('.prompt__input'),
        ok: promptDialog.el.querySelector('.prompt__ok'),
        cancel: promptDialog.el.querySelector('.prompt__cancel')
    };

    function submitPrompt() {
        resolvePrompt?.(promptEls.input.value.trim() || null);
        resolvePrompt = null;
        promptDialog.close();
    }

    promptEls.ok.addEventListener('click', submitPrompt);
    promptEls.cancel.addEventListener('click', () => promptDialog.close());
    promptEls.input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submitPrompt();
        }
    });

    window.promptDialog = function ({ title, value = '', placeholder = '' }) {
        promptEls.title.textContent = title;
        promptEls.input.value = value;
        promptEls.input.placeholder = placeholder;
        promptDialog.open(promptEls.input);
        promptEls.input.select();
        return new Promise((resolve) => {
            resolvePrompt = resolve;
        });
    };

    // ---- Toasts ----
    const toastHost = document.getElementById('toastHost');

    window.toast = function (message, { actionLabel, onAction, duration = 3000 } = {}) {
        if (!toastHost) return;

        const el = document.createElement('div');
        el.className = 'toast notch';
        el.innerHTML = `<span class="toast__msg">${window.escapeHtml(message)}</span>`;

        if (actionLabel) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'toast__action';
            button.textContent = actionLabel;
            button.addEventListener('click', () => {
                onAction?.();
                dismiss();
            });
            el.appendChild(button);
        }

        let timer = null;
        function dismiss() {
            clearTimeout(timer);
            el.classList.add('is-leaving');
            el.addEventListener('animationend', () => el.remove(), { once: true });
        }

        toastHost.appendChild(el);
        timer = setTimeout(dismiss, duration);
    };
})();

// ============================================
// VIEW ROUTER
// Switches between the library grid and the three full-page tools
// (tier maker, about me, top 10). Each tool renders itself once at
// script load time (into a hidden container) and again — via its
// `refresh*View` hook — whenever it becomes visible, so it always
// reflects the latest library/collections state instead of a stale
// first paint.
// ============================================
(function () {
    const buttons = document.querySelectorAll('[data-app-view]');
    if (!buttons.length) return;

    const views = {
        library: document.getElementById('libraryView'),
        tiers: document.getElementById('tierView'),
        about: document.getElementById('aboutView'),
        tops: document.getElementById('topsView')
    };
    const navWraps = {
        library: document.getElementById('libraryNavWrap'),
        tiers: document.getElementById('tierNavWrap'),
        about: document.getElementById('aboutNavWrap'),
        tops: document.getElementById('topsNavWrap')
    };

    const REFRESH_HOOKS = {
        tiers: () => window.refreshTierView?.(),
        about: () => window.refreshAboutView?.(),
        tops: () => window.refreshTopsView?.()
    };

    function showView(name) {
        if (!views[name]) return;

        Object.entries(views).forEach(([key, el]) => {
            if (el) el.hidden = key !== name;
        });
        Object.entries(navWraps).forEach(([key, el]) => {
            if (el) el.hidden = key !== name;
        });

        buttons.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.appView === name));
        REFRESH_HOOKS[name]?.();

        // Below 980px the page normally grows to fit its content and the
        // whole document scrolls — fine for library/about/tops, but the
        // tier maker's tray (drag source for placing games) needs to stay
        // pinned at the bottom of the screen like on desktop instead of
        // scrolling 10000px away with the tier rows. This class re-bounds
        // the layout to the viewport height only while tiers is active
        // (see the mobile media query in style.css).
        document.documentElement.classList.toggle('is-tier-view', name === 'tiers');

        // The hidden view's background zones freeze in place while it's
        // hidden (see script-enhancements.js); resync whichever one just
        // became visible so it doesn't show stale glow from before the switch.
        // About me and My top lists don't drive the background at all, so
        // switching into them must clear it — otherwise the last library/
        // tier card glow stays painted behind them.
        requestAnimationFrame(() => {
            if (name === 'library') window.onCardsRendered?.();
            else if (name === 'tiers') window.onTierRendered?.();
            else {
                window.setCardZones?.([]);
                window.clearCardHoverZone?.();
            }
        });
    }

    buttons.forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.appView)));
    window.showView = showView;

    // ---- Mobile nav drawer ----
    // Below 980px the sidebar (views, library filters, collections,
    // genres, backup controls) is too tall to fit on screen at once, so
    // it becomes an off-canvas drawer opened from a slim top bar instead
    // of the first thing you have to scroll past.
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebarClose = document.getElementById('sidebarClose');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');

    function openDrawer() {
        sidebar.classList.add('is-open');
        sidebarBackdrop.hidden = false;
        sidebarToggle.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
        sidebar.classList.remove('is-open');
        sidebarBackdrop.hidden = true;
        sidebarToggle.setAttribute('aria-expanded', 'false');
    }

    sidebarToggle?.addEventListener('click', openDrawer);
    sidebarClose?.addEventListener('click', closeDrawer);
    sidebarBackdrop?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDrawer();
    });

    // Picking a view or a library filter is the natural "I'm done with
    // the menu" moment on mobile, so close the drawer right after.
    sidebar?.addEventListener('click', (event) => {
        if (event.target.closest('.nav__item, [data-collection-add]')) closeDrawer();
    });
})();
