// ============================================
// CARD DATA / STYLING HELPERS
// ============================================
(function () {
    const STATUS_LABELS = {
        backlog: 'Backlog',
        playing: 'Playing',
        completed: 'Completed'
    };

    const STATUS_ORDER = ['backlog', 'playing', 'completed'];

    window.getAdvancedFormData = function (formFields) {
        return {
            status: formFields.status?.value || 'backlog',
            color: formFields.color?.value || '',
            description: formFields.description?.value || '',
            genre: formFields.genre?.value?.trim() || (typeof window.getWikiGenre === 'function' ? window.getWikiGenre() : ''),
            developer: typeof window.getWikiDeveloper === 'function' ? window.getWikiDeveloper() : '',
            image: formFields.image?.value?.trim() || (typeof window.getWikiImage === 'function' ? window.getWikiImage() : null),
            screenshot: typeof window.getWikiScreenshot === 'function' ? window.getWikiScreenshot() : null
        };
    };

    window.applyAdvancedDataToShow = function (game, advancedData = {}) {
        game.status = advancedData.status || 'backlog';
        game.color = advancedData.color || '';
        game.description = advancedData.description || '';
        game.genre = advancedData.genre || '';
        game.developer = advancedData.developer || '';
        game.image = advancedData.image || null;
        game.screenshot = advancedData.screenshot || null;
        game.ratings = advancedData.ratings || {};
    };

    window.toggleAdvancedWatchedStatus = function (game) {
        if (!game) return false;
        const currentIndex = STATUS_ORDER.indexOf(game.status);
        game.status = STATUS_ORDER[(currentIndex + 1) % STATUS_ORDER.length];
        return true;
    };

    window.getAdvancedWatchedLabel = function (game) {
        return STATUS_LABELS[game.status] || STATUS_LABELS.backlog;
    };

    window.renderAdvancedInfo = function (game) {
        return `<p class="show-description">${window.escapeHtml(game.description || '')}</p>`;
    };

    window.renderPixelStar = function (extraClass) {
        return `<img src="imgs/pixel-star.png" class="pixel-star${extraClass ? ' ' + extraClass : ''}" alt="" draggable="false">`;
    };

    // In-memory only (not saved to the game/localStorage), keyed by game id.
    // Games with no chosen image get a live-fetched one; keeping it here
    // means it stays put across re-renders within the session but is
    // fetched fresh — and so can land on a different photo — every reload.
    const randomImageCache = new Map();

    // A pasted image URL is user input like any other: quoting it as a CSS
    // string means a `")` in the middle can't break out of url(...) and
    // inject declarations.
    window.cssUrl = function (url) {
        return url ? `url("${String(url).replace(/["\\]/g, '\\$&')}")` : 'none';
    };

    window.applyAdvancedCardStyles = function (card, game) {
        const showCard = card.querySelector('.show');
        if (!showCard) return;

        const imageUrl = game.image || randomImageCache.get(game.id) || '';
        showCard.style.setProperty('--bg-image', window.cssUrl(imageUrl));

        if (!game.image && !randomImageCache.has(game.id) && typeof window.fetchRandomCoverImage === 'function') {
            randomImageCache.set(game.id, null); // placeholder so we don't fetch twice
            window.fetchRandomCoverImage(game.title).then((url) => {
                if (!url) return;
                randomImageCache.set(game.id, url);
                if (showCard.isConnected) {
                    showCard.style.setProperty('--bg-image', window.cssUrl(url));
                }
            });
        }

        // --card-accent lives on the frame (the outer wrapper) so both the
        // ring and everything inside .show inherit the same color.
        // game.color can hold more than one swatch (comma-separated) — every
        // solid-color CSS property downstream only takes the first.
        const accent = window.activeSwatchColor(game.color);
        if (accent) {
            card.style.setProperty('--card-accent', accent);
        } else {
            card.style.removeProperty('--card-accent');
        }

        showCard.dataset.status = game.status;
    };
})();

// ============================================
// CARD ↔ BACKGROUND REACTION
// Makes the pixel background beside a card pulse in that card's own
// accent color on hover, and ripple in that color on click.
//
// The zones are viewport rectangles, so they go stale the moment the
// grid scrolls or the window resizes — both are re-measured here,
// batched into a single rAF so a fast scroll can't queue up a layout
// read per event.
// ============================================
(function () {
    function getCardTint(frame) {
        const accent = getComputedStyle(frame).getPropertyValue('--card-accent').trim();
        return window.hexToRgb(accent.startsWith('#') ? accent : null);
    }

    // Factory so both the library grid and the tier maker (board + tray)
    // get the same hover-glow/ripple wiring without duplicating it. Each
    // reactor only ever drives the *shared* background zones while its own
    // container is the one currently visible/active — callers own that by
    // only invoking the returned `sync` function when relevant.
    function createCardReactor(container, scroller) {
        if (!container) return () => {};

        let hoveredFrame = null;
        let clearZoneTimer = null;
        let queued = false;

        function syncZones() {
            queued = false;
            // Only one of the library grid / tier maker is ever visible at
            // once (the other sits `hidden`); a hidden container must not
            // overwrite the visible one's zones on a shared window resize.
            if (container.offsetParent === null) return;

            if (typeof window.setCardZones === 'function') {
                const zones = Array.from(container.querySelectorAll('.show-frame')).map((frame) => ({
                    rect: frame.getBoundingClientRect(),
                    tint: getCardTint(frame)
                }));
                window.setCardZones(zones);
            }

            if (hoveredFrame?.isConnected && typeof window.setCardHoverZone === 'function') {
                window.setCardHoverZone(hoveredFrame.getBoundingClientRect(), getCardTint(hoveredFrame));
            }
        }

        function scheduleSync() {
            if (queued) return;
            queued = true;
            requestAnimationFrame(syncZones);
        }

        container.addEventListener('mouseover', (event) => {
            const frame = event.target.closest('.show-frame');
            if (!frame || frame.contains(event.relatedTarget)) return;
            clearTimeout(clearZoneTimer);
            hoveredFrame = frame;
            scheduleSync();
        });

        container.addEventListener('mouseout', (event) => {
            const frame = event.target.closest('.show-frame');
            if (!frame || frame.contains(event.relatedTarget)) return;
            // Delayed instead of instant, so the glow lingers a moment and
            // reads as a trail rather than snapping off the second you leave.
            clearTimeout(clearZoneTimer);
            clearZoneTimer = setTimeout(() => {
                hoveredFrame = null;
                window.clearCardHoverZone?.();
            }, 450);
        });

        container.addEventListener('click', (event) => {
            const frame = event.target.closest('.show-frame');
            if (!frame || typeof window.spawnColoredRipple !== 'function') return;
            window.spawnColoredRipple(event.clientX, event.clientY, getCardTint(frame));
        });

        scroller?.addEventListener('scroll', scheduleSync, { passive: true });
        window.addEventListener('resize', scheduleSync);

        return scheduleSync;
    }

    const showsSync = createCardReactor(document.getElementById('shows'), document.querySelector('.main__scroll'));
    const tierView = document.getElementById('tierView');
    const tierSync = createCardReactor(tierView, tierView);

    // Called after every grid render / tier board render.
    window.onCardsRendered = showsSync;
    window.onTierRendered = tierSync;
})();
