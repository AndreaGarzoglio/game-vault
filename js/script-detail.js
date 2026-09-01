// ============================================
// GAME DETAIL VIEW
// A fixed-size panel: a screenshot backdrop fading into an animated
// pixel field tinted with the game's own accent, over a three-zone
// layout (hero / description+review + ratings / related games).
//
// The panel never grows with its content — every block clamps instead —
// so the notched frame stays put and nothing needs an inner scrollbar.
// ============================================
(function () {
    const DEFAULT_ACCENT = '#a855f7';
    // Fetched/rendered count — the wide desktop panel has room for a full
    // row; CSS caps how many are actually visible on the narrower mobile
    // layout (see .detail-related-list under the 980px breakpoint).
    const RELATED_LIMIT = 8;

    const icon = window.icon;

    let currentGame = null;
    let lastFocused = null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;

    const container = document.createElement('div');
    container.id = 'detailModalContainer';
    container.className = 'detail-container notch-frame';
    container.setAttribute('role', 'dialog');
    container.setAttribute('aria-modal', 'true');
    container.hidden = true;
    container.innerHTML = `
        <div class="detail-inner notch-inner">
            <canvas class="detail-pixel-canvas" id="detailPixelCanvas" aria-hidden="true"></canvas>
            <div class="detail-backdrop" id="detailBanner"></div>

            <div class="detail-icon-row">
                <button type="button" class="detail-color-swatch" id="detailColorSwatch"
                    aria-label="Change card color" title="Card color"></button>
                <button type="button" class="icon-btn" id="detailEditBtn" aria-label="Edit game" title="Edit game">${icon('pencil')}</button>
                <button type="button" class="icon-btn" id="detailAwardsBtn" aria-label="Awards" title="Awards" hidden>${icon('award')}</button>
                <button type="button" class="icon-btn detail-fav-btn" id="detailFavBtn"
                    aria-label="Toggle favorite" title="Favorite"></button>
                <button type="button" class="icon-btn detail-close-btn" id="detailCloseBtn"
                    aria-label="Close" title="Close">${icon('chevron-down')}</button>
            </div>

            <div class="popover" id="detailColorPopup" hidden>
                <div class="swatch-row" id="detailSwatchRow"></div>
            </div>

            <div class="popover popover--awards" id="detailAwardsPopover" hidden></div>

            <div class="detail-content">
                <header class="detail-hero">
                    <img class="detail-cover" id="detailCover" alt="" hidden>
                    <div class="detail-hero__text">
                        <h2 class="detail-title" id="detailTitle"></h2>
                        <p class="detail-meta" id="detailMeta"></p>
                        <div class="detail-tags" id="detailTags"></div>
                    </div>
                </header>

                <div class="detail-body">
                    <div class="detail-col">
                        <section class="detail-section detail-section--tabs">
                            <div class="detail-tabbar" role="tablist">
                                <button type="button" class="detail-tab is-active" data-tab="desc" role="tab" aria-selected="true">Description</button>
                                <button type="button" class="detail-tab" data-tab="review" role="tab" aria-selected="false">Your review</button>
                                <button type="button" class="icon-btn icon-btn--sm detail-tabbar__edit" id="detailReviewEditBtn"
                                    aria-label="Edit review" title="Edit review" hidden>${icon('pencil')}</button>
                            </div>
                            <div class="detail-tab-panel" data-tab-panel="desc">
                                <p class="detail-description" id="detailDescription"></p>
                            </div>
                            <div class="detail-tab-panel" data-tab-panel="review" hidden>
                                <div class="detail-review-box" id="detailReviewBox"></div>
                            </div>
                        </section>
                    </div>

                    <div class="detail-col">
                        <section class="detail-section detail-section--rate">
                            <h3 class="detail-h3">
                                Rate it
                                <button type="button" class="icon-btn icon-btn--sm" id="detailRatingEditBtn"
                                    title="Edit ratings" aria-label="Edit ratings">${icon('pencil')}</button>
                            </h3>
                            <div id="detailRatingDisplay" class="detail-rate-box"></div>
                            <div id="detailRatingMount" class="detail-rate-box" hidden></div>
                        </section>
                    </div>
                </div>

                <section class="detail-related" id="detailRelatedSection" hidden>
                    <h3 class="detail-h3">
                        Related games
                        <button type="button" class="icon-btn icon-btn--sm" id="detailRelatedRefresh"
                            title="Show other games" aria-label="Show other games">${icon('refresh')}</button>
                    </h3>
                    <div id="detailRelatedList" class="detail-related-list"></div>
                </section>
            </div>
        </div>
    `;

    document.body.append(overlay, container);

    const els = {
        inner: container.querySelector('.detail-inner'),
        canvas: container.querySelector('#detailPixelCanvas'),
        banner: container.querySelector('#detailBanner'),
        cover: container.querySelector('#detailCover'),
        colorSwatch: container.querySelector('#detailColorSwatch'),
        colorPopup: container.querySelector('#detailColorPopup'),
        swatchRow: container.querySelector('#detailSwatchRow'),
        editBtn: container.querySelector('#detailEditBtn'),
        awardsBtn: container.querySelector('#detailAwardsBtn'),
        awardsPopover: container.querySelector('#detailAwardsPopover'),
        favBtn: container.querySelector('#detailFavBtn'),
        closeBtn: container.querySelector('#detailCloseBtn'),
        title: container.querySelector('#detailTitle'),
        meta: container.querySelector('#detailMeta'),
        tags: container.querySelector('#detailTags'),
        description: container.querySelector('#detailDescription'),
        ratingDisplay: container.querySelector('#detailRatingDisplay'),
        ratingMount: container.querySelector('#detailRatingMount'),
        ratingEditBtn: container.querySelector('#detailRatingEditBtn'),
        reviewBox: container.querySelector('#detailReviewBox'),
        reviewEditBtn: container.querySelector('#detailReviewEditBtn'),
        relatedSection: container.querySelector('#detailRelatedSection'),
        relatedList: container.querySelector('#detailRelatedList'),
        relatedRefresh: container.querySelector('#detailRelatedRefresh'),
        tabbar: container.querySelector('.detail-tabbar'),
        tabPanels: container.querySelectorAll('.detail-tab-panel')
    };

    els.favBtn.innerHTML = window.renderPixelStar();

    // ---- Edit modal (same chrome as "Add a game") ----
    const editDialog = window.createDialog({
        html: `
            <h2>Edit game</h2>
            <div class="formEntry"><label for="editModalTitle">Title</label><input id="editModalTitle"></div>
            <div class="form-grid">
                <div class="formEntry"><label for="editModalYear">Release year</label><input type="number" id="editModalYear"></div>
                <div class="formEntry"><label for="editModalStatus">Status</label>
                    <select id="editModalStatus">
                        <option value="backlog">Backlog</option>
                        <option value="playing">Playing</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>
            </div>
            <div class="formEntry"><label for="editModalGenre">Genre</label><input id="editModalGenre"></div>
            <div class="formEntry"><label for="editModalDeveloper">Developer</label><input id="editModalDeveloper"></div>
            <div class="formEntry"><label for="editModalDescription">Description</label><textarea id="editModalDescription" rows="3"></textarea></div>
            <div class="formEntry"><label for="editModalImage">Cover image (URL)</label><input id="editModalImage"></div>
            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch" id="editModalSave"><span class="btn-notch__inner">Save</span></button>
                <button type="button" class="cancelBtn btn-notch" id="editModalCancel"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => els.editBtn.focus()
    });
    const editModal = editDialog.el;

    const editEls = {
        title: editModal.querySelector('#editModalTitle'),
        year: editModal.querySelector('#editModalYear'),
        genre: editModal.querySelector('#editModalGenre'),
        developer: editModal.querySelector('#editModalDeveloper'),
        description: editModal.querySelector('#editModalDescription'),
        image: editModal.querySelector('#editModalImage'),
        status: editModal.querySelector('#editModalStatus')
    };

    function openEditModal() {
        const game = currentGame;
        editEls.title.value = game.title || '';
        editEls.year.value = game.year || '';
        editEls.genre.value = game.genre || '';
        editEls.developer.value = game.developer || '';
        editEls.description.value = game.description || '';
        editEls.image.value = game.image || '';
        editEls.status.value = game.status || 'backlog';
        editDialog.open(editEls.title);
    }

    editModal.querySelector('#editModalSave').addEventListener('click', () => {
        const game = currentGame;
        const genreChanged = game.genre !== editEls.genre.value.trim();

        game.title = editEls.title.value.trim() || game.title;
        game.year = editEls.year.value;
        game.genre = editEls.genre.value.trim();
        game.developer = editEls.developer.value.trim();
        game.description = editEls.description.value;
        game.image = editEls.image.value.trim() || null;
        game.status = editEls.status.value;

        refreshAll();
        persistAndRefreshCards();
        if (genreChanged) {
            resetRelated();
            loadRelatedGames();
        }
        editDialog.close();
        window.toast('Changes saved');
    });

    editModal.querySelector('#editModalCancel').addEventListener('click', () => editDialog.close());
    els.editBtn.addEventListener('click', openEditModal);

    // ---- Cover tilt, tracking the cursor across the art ----
    window.attachTilt(els.cover, { max: 14, scale: 1.05 });

    // ---- Ambient pixel field, tinted with the game's accent ----
    // Same engine as the page background (see script-fx.js); this one is
    // denser, single-tinted, and only reacts to the cursor and clicks.
    const pixelBg = (function () {
        // Hoisted out of the per-dot path: these are property loads on the
        // global object, and this runs thousands of times a frame.
        const { pixelAmbient, pixelLerp, pixelRipplePulse } = window;

        const MOUSE_RADIUS = 130;
        const MOUSE_RADIUS_SQ = MOUSE_RADIUS * MOUSE_RADIUS;
        const MOUSE_SIZE = 4.5;
        const RIPPLE = { maxRadius: 260, thickness: 70, duration: 900 };

        let tint = window.hexToRgb(DEFAULT_ACCENT);

        const field = window.createPixelField(els.canvas, {
            spacing: 15,
            initDot: () => ({ boost: 0 }),
            shade(dot, { now, dt, mouseX, mouseY, hasMouse, ripples }) {
                const shaped = pixelAmbient(dot.x, dot.y, now);

                // The interaction glow eases in fast but drains slowly, so a
                // passing cursor leaves a fading trail rather than snapping off.
                let target = 0;
                if (hasMouse) {
                    const dx = dot.x - mouseX;
                    const dy = dot.y - mouseY;
                    const d2 = dx * dx + dy * dy;
                    if (d2 < MOUSE_RADIUS_SQ) target = Math.pow(1 - Math.sqrt(d2) / MOUSE_RADIUS, 2);
                }
                for (const ripple of ripples) {
                    target = Math.max(target, pixelRipplePulse(dot.x, dot.y, ripple));
                }

                dot.boost = pixelLerp(dot.boost, target, dt, 0.02, 0.0035);
                dot.size = 1.5 + shaped * 3.2 + dot.boost * MOUSE_SIZE;
                dot.r = tint[0];
                dot.g = tint[1];
                dot.b = tint[2];
                dot.alpha = 0.08 + shaped * 0.32 + dot.boost * 0.4;
            }
        });

        // Listeners live on the panel, not the canvas: the backdrop and
        // content layers sit on top and would swallow the events first.
        const toCanvas = (event) => {
            const rect = els.canvas.getBoundingClientRect();
            return [event.clientX - rect.left, event.clientY - rect.top];
        };
        els.inner.addEventListener('mousemove', (event) => field.setMouse(...toCanvas(event)));
        els.inner.addEventListener('mouseleave', field.clearMouse);
        els.inner.addEventListener('click', (event) => field.addRipple(...toCanvas(event), RIPPLE));

        return {
            start(accentHex) {
                tint = window.hexToRgb(accentHex || DEFAULT_ACCENT);
                const [r, g, b] = tint;
                els.canvas.style.setProperty('--pixel-bg-tint',
                    `rgb(${Math.round(r * 0.09)}, ${Math.round(g * 0.07)}, ${Math.round(b * 0.13)})`);
                field.start();
            },
            stop: field.stop,
            resize: field.resize
        };
    })();

    window.addEventListener('resize', () => {
        if (!container.hidden) pixelBg.resize();
    });

    // ---- State sync ----
    function persistAndRefreshCards() {
        window.saveWatchlist?.();
        window.renderShows?.();
    }

    function refreshAll() {
        const game = currentGame;

        els.banner.style.setProperty('--bg-image', window.cssUrl(game.image));
        // game.color can hold several comma-separated swatches — every
        // solid-color CSS property here only takes the first.
        const accent = window.activeSwatchColor(game.color);
        container.style.setProperty('--card-accent', accent || DEFAULT_ACCENT);
        els.colorSwatch.style.setProperty('--swatch', accent || 'var(--accent)');

        if (game.image) {
            els.cover.src = game.image;
            els.cover.hidden = false;
        } else {
            els.cover.hidden = true;
        }

        els.title.textContent = game.title;
        els.meta.textContent = [game.year, game.developer].filter(Boolean).join(' · ');
        els.description.textContent = game.description || 'No description yet.';

        const hasAwards = typeof window.gameHasAwards === 'function' && window.gameHasAwards(game.id);
        els.awardsBtn.hidden = !hasAwards;
        els.awardsPopover.hidden = true;

        els.favBtn.classList.toggle('is-active', !!game.favorite);
        refreshRatingDisplay();
        refreshReviewBox();
        renderTags();
        setTab('desc');
    }

    // ---- Awards: same providers as the library card's badge, but its
    // own popover living inside .detail-inner instead of the shared
    // body-level one — that one is positioned from viewport coordinates
    // and can render outside the modal's bounds; this one can't since
    // it's just another child of the card. ----
    function renderAwardsPopover() {
        const sections = (window.awardProviders || []).map((provider) => {
            const rows = provider.findFor(currentGame.id).map((a) => `
                <button type="button" class="awards-row" data-detail-awards-jump="${window.escapeHtml(provider.view)}::${window.escapeHtml(a.id)}">
                    ${a.chip ? `<span class="awards-row__chip" style="${window.escapeHtml(`--tier:${a.chipColor}`)}">${window.escapeHtml(a.chip)}</span>` : ''}
                    ${a.rank ? `<span class="awards-row__rank">#${a.rank}</span>` : ''}
                    <span class="awards-row__label">${window.escapeHtml(a.text)}</span>
                    ${icon('arrow-right')}
                </button>
            `).join('');
            return rows ? `<p class="awards-section__label">${window.escapeHtml(provider.label)}</p>${rows}` : '';
        }).filter(Boolean).join('');

        els.awardsPopover.innerHTML = `<p class="popover__title">Awards</p>${sections || '<p class="field-hint">Nothing yet.</p>'}`;
    }

    els.awardsBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!els.awardsPopover.hidden) {
            els.awardsPopover.hidden = true;
            return;
        }
        els.colorPopup.hidden = true;
        renderAwardsPopover();
        els.awardsPopover.hidden = false;
    });

    els.awardsPopover.addEventListener('click', (event) => {
        const jump = event.target.closest('[data-detail-awards-jump]');
        if (!jump) return;
        const [view, id] = jump.dataset.detailAwardsJump.split('::');
        closeDetail();
        window.showView?.(view);
        window.awardProviders?.find((p) => p.view === view)?.focus(id);
    });

    function refreshRatingDisplay() {
        els.ratingDisplay.innerHTML = window.renderRatingBars(currentGame)
            || '<p class="field-hint">No ratings yet — hit the pencil to score it.</p>';
    }

    // ---- Description / review tabs ----
    let activeDetailTab = 'desc';

    function setTab(name) {
        activeDetailTab = name;
        els.tabbar.querySelectorAll('.detail-tab').forEach((btn) => {
            const active = btn.dataset.tab === name;
            btn.classList.toggle('is-active', active);
            btn.setAttribute('aria-selected', String(active));
        });
        els.tabPanels.forEach((panel) => {
            panel.hidden = panel.dataset.tabPanel !== name;
        });
        updateReviewEditBtn();
    }

    els.tabbar.addEventListener('click', (event) => {
        const btn = event.target.closest('.detail-tab');
        if (btn) setTab(btn.dataset.tab);
    });

    els.favBtn.addEventListener('click', (event) => {
        currentGame.favorite = !currentGame.favorite;
        els.favBtn.classList.toggle('is-active', currentGame.favorite);
        persistAndRefreshCards();
        if (currentGame.favorite) {
            window.spawnColoredRipple?.(event.clientX, event.clientY, [251, 191, 36]);
        }
    });

    // ---- Colour picker ----
    els.colorSwatch.addEventListener('click', (event) => {
        event.stopPropagation();
        els.swatchRow.innerHTML = window.renderSwatchRow(currentGame.color);
        els.colorPopup.hidden = !els.colorPopup.hidden;
    });

    els.swatchRow.addEventListener('click', (event) => {
        const swatch = event.target.closest('.swatch');
        if (!swatch) return;
        // Re-rendering the row below detaches the clicked button from the
        // DOM before the document-level "click outside" listener runs —
        // without this it'd see event.target as no longer inside
        // .colorPopup and close it after every single pick.
        event.stopPropagation();
        currentGame.color = window.toggleSwatchSelection(currentGame.color, swatch.dataset.color);
        els.swatchRow.innerHTML = window.renderSwatchRow(currentGame.color);
        refreshAll();
        persistAndRefreshCards();
        pixelBg.start(window.activeSwatchColor(currentGame.color));
    });

    // ---- Ratings: display ⇄ editor ----
    let ratingEditing = false;

    function setRatingEditing(editing) {
        ratingEditing = editing;
        els.ratingMount.hidden = !editing;
        els.ratingDisplay.hidden = editing;
        els.ratingEditBtn.classList.toggle('is-active', editing);
        if (editing) {
            window.mountRatingEditor(els.ratingMount, currentGame, () => {
                refreshRatingDisplay();
                window.renderShows?.();
            });
        } else {
            refreshRatingDisplay();
        }
    }

    els.ratingEditBtn.addEventListener('click', () => setRatingEditing(!ratingEditing));

    // ---- Review: placeholder → text → textarea ----
    let reviewEditing = false;

    function refreshReviewBox() {
        const hasReview = !!(currentGame.review && currentGame.review.trim());

        if (reviewEditing) {
            els.reviewBox.innerHTML = '<textarea class="detail-review-input" placeholder="What did you think of it?"></textarea>';
            const textarea = els.reviewBox.querySelector('textarea');
            textarea.value = currentGame.review || '';
            textarea.focus();

            const commit = () => {
                currentGame.review = textarea.value.trim();
                reviewEditing = false;
                persistAndRefreshCards();
                refreshReviewBox();
            };
            textarea.addEventListener('blur', commit);
            textarea.addEventListener('keydown', (event) => {
                // Ctrl/Cmd+Enter saves; plain Enter keeps writing paragraphs.
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    textarea.blur();
                }
            });
        } else if (hasReview) {
            els.reviewBox.innerHTML = `<p class="detail-review-text">${window.escapeHtml(currentGame.review)}</p>`;
        } else {
            els.reviewBox.innerHTML = `<button type="button" class="add-review-btn">${icon('plus')} Add review</button>`;
            els.reviewBox.querySelector('button').addEventListener('click', () => {
                reviewEditing = true;
                refreshReviewBox();
            });
        }
        updateReviewEditBtn();
    }

    // Lives in the tab row (next to "Your review") rather than inside the
    // text box itself, and only while that tab is showing a saved review.
    function updateReviewEditBtn() {
        const hasReview = !!(currentGame?.review && currentGame.review.trim());
        els.reviewEditBtn.hidden = !(activeDetailTab === 'review' && hasReview && !reviewEditing);
    }

    els.reviewEditBtn.addEventListener('click', () => {
        reviewEditing = true;
        refreshReviewBox();
    });

    // ---- Tags & collections ----
    // Collections (game.collections) sit right after the status badge, in
    // their own color, since they're the "which list is this game in"
    // facet. Tags (game.tags) are freeform labels and stay with the genre
    // chips. Both are managed from the same "+" popover.
    function renderTags() {
        const genreTags = (currentGame.genre || '').split(',').map((s) => s.trim()).filter(Boolean);
        const statusLabel = window.getAdvancedWatchedLabel(currentGame);

        els.tags.innerHTML = [
            `<span class="status-badge" data-status="${currentGame.status}">${window.escapeHtml(statusLabel)}</span>`,
            ...(currentGame.collections || []).map((name) => {
                const safe = window.escapeHtml(name);
                return `<span class="tag-chip tag-chip--collection">${safe}<button type="button" class="tag-remove"
                    data-collection="${safe}" aria-label="Remove from ${safe}">&times;</button></span>`;
            }),
            ...genreTags.map((tag) => `<span class="tag-chip">${window.escapeHtml(tag)}</span>`),
            ...(currentGame.tags || []).map((tag) => {
                const safe = window.escapeHtml(tag);
                return `<span class="tag-chip tag-chip--own">${safe}<button type="button" class="tag-remove"
                    data-tag="${safe}" aria-label="Remove ${safe}">&times;</button></span>`;
            }),
            `<button type="button" class="tag-add-btn" id="detailTagPlus" aria-label="Add tag or collection" title="Add tag or collection">${icon('plus')}</button>`
        ].join('');
    }

    // Picking from the existing collections (rather than only free-typing)
    // stops the same idea being saved as "rpgs", "RPGs" and "Rpg".
    const tagPopover = document.createElement('div');
    tagPopover.className = 'popover popover--tags';
    tagPopover.hidden = true;
    tagPopover.innerHTML = '<div class="popover__inner notch-inner"></div>';
    container.querySelector('.detail-inner').appendChild(tagPopover);
    const tagPopoverInner = tagPopover.querySelector('.popover__inner');

    function renderTagPopover() {
        const all = window.getFolders(window.getWatchlist());
        const mine = new Set(currentGame.collections || []);

        tagPopoverInner.innerHTML = `
            <p class="popover__title">Tags</p>
            <div class="add-aspect-row">
                <input type="text" id="detailNewTag" placeholder="New tag…">
                <button type="button" id="detailAddTagBtn">Add</button>
            </div>

            <p class="popover__title">Collections</p>
            <div class="popover__list">
                ${all.length ? all.map((name) => {
                    const safe = window.escapeHtml(name);
                    return `<button type="button" class="popover__item${mine.has(name) ? ' is-on' : ''}" data-toggle-collection="${safe}">
                        <span class="popover__check">${mine.has(name) ? '✓' : ''}</span>${safe}
                    </button>`;
                }).join('') : '<p class="field-hint">No collections yet.</p>'}
            </div>
            <div class="add-aspect-row">
                <input type="text" id="detailNewCollection" placeholder="New collection…">
                <button type="button" id="detailAddCollectionBtn">Add</button>
            </div>
        `;
    }

    function addTag(name) {
        currentGame.tags = currentGame.tags || [];
        if (!currentGame.tags.includes(name)) currentGame.tags.push(name);
        renderTags();
        persistAndRefreshCards();
    }

    function toggleCollection(name) {
        currentGame.collections = currentGame.collections || [];
        const index = currentGame.collections.indexOf(name);
        if (index === -1) currentGame.collections.push(name);
        else currentGame.collections.splice(index, 1);
        renderTags();
        renderTagPopover();
        persistAndRefreshCards();
    }

    els.tags.addEventListener('click', (event) => {
        const removeTag = event.target.closest('.tag-remove[data-tag]');
        if (removeTag) {
            currentGame.tags = (currentGame.tags || []).filter((t) => t !== removeTag.dataset.tag);
            renderTags();
            persistAndRefreshCards();
            return;
        }

        const removeCollection = event.target.closest('.tag-remove[data-collection]');
        if (removeCollection) {
            currentGame.collections = (currentGame.collections || []).filter((c) => c !== removeCollection.dataset.collection);
            renderTags();
            persistAndRefreshCards();
            return;
        }

        const plus = event.target.closest('#detailTagPlus');
        if (!plus) return;
        event.stopPropagation();
        if (tagPopover.hidden) {
            renderTagPopover();
            const anchor = plus.getBoundingClientRect();
            const host = container.getBoundingClientRect();
            tagPopover.style.left = `${anchor.left - host.left}px`;
            tagPopover.style.top = `${anchor.bottom - host.top + 8}px`;
            tagPopover.hidden = false;
        } else {
            tagPopover.hidden = true;
        }
    });

    tagPopover.addEventListener('click', (event) => {
        const item = event.target.closest('[data-toggle-collection]');
        if (item) return toggleCollection(item.dataset.toggleCollection);

        if (event.target.closest('#detailAddTagBtn')) {
            const input = tagPopover.querySelector('#detailNewTag');
            const name = input.value.trim();
            input.value = '';
            if (name) addTag(name);
            return;
        }

        if (event.target.closest('#detailAddCollectionBtn')) {
            const input = tagPopover.querySelector('#detailNewCollection');
            const name = input.value.trim();
            input.value = '';
            if (!name) return;
            window.createFolder(name);
            if (!(currentGame.collections || []).includes(name)) toggleCollection(name);
            else renderTagPopover();
        }
    });

    tagPopover.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (event.target.id === 'detailNewTag') tagPopover.querySelector('#detailAddTagBtn').click();
        else if (event.target.id === 'detailNewCollection') tagPopover.querySelector('#detailAddCollectionBtn').click();
    });

    // ---- Open / close ----
    document.addEventListener('click', (event) => {
        if (!els.colorPopup.hidden && !els.colorPopup.contains(event.target)) els.colorPopup.hidden = true;
        if (!tagPopover.hidden && !tagPopover.contains(event.target)) tagPopover.hidden = true;
        if (!els.awardsPopover.hidden && !els.awardsPopover.contains(event.target) && event.target !== els.awardsBtn && !els.awardsBtn.contains(event.target)) {
            els.awardsPopover.hidden = true;
        }
    });

    function closeDetail() {
        overlay.hidden = true;
        container.hidden = true;
        pixelBg.stop();
        currentGame = null;
        lastFocused?.focus?.();
    }

    els.closeBtn.addEventListener('click', closeDetail);
    overlay.addEventListener('click', closeDetail);

    container.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && editModal.hidden) closeDetail();
        window.trapFocus(container, event);
    });

    // ---- Related games ----
    let shownRelatedIds = [];

    function resetRelated() {
        shownRelatedIds = [];
    }

    async function loadRelatedGames() {
        if (typeof window.fetchRelatedGames !== 'function' || !currentGame?.title) {
            els.relatedSection.hidden = true;
            return;
        }

        els.relatedSection.hidden = false;
        els.relatedList.innerHTML = Array.from({ length: RELATED_LIMIT })
            .map(() => '<div class="related-card related-card--skeleton"></div>').join('');

        const game = currentGame;
        const fetched = await window.fetchRelatedGames(game.title, shownRelatedIds);
        if (currentGame !== game) return;

        if (!fetched.length) {
            els.relatedList.innerHTML = '<p class="field-hint">Nothing else found for these tags.</p>';
            return;
        }

        const games = fetched.slice(0, RELATED_LIMIT);
        shownRelatedIds = shownRelatedIds.concat(fetched.map((g) => g.id).filter((id) => id != null));

        els.relatedList.innerHTML = games.map((row) => `
            <a class="related-card" href="${window.escapeHtml(row.url || '#')}" target="_blank" rel="noopener"
                title="${window.escapeHtml(row.title)}">
                ${row.image
                    ? `<img src="${window.escapeHtml(row.image)}" alt="" loading="lazy">`
                    : '<span class="related-card-noimg"></span>'}
                <span class="related-card__name">${window.escapeHtml(row.title)}</span>
            </a>
        `).join('');
    }

    els.relatedRefresh.addEventListener('click', loadRelatedGames);

    async function loadBackdrop() {
        if (typeof window.fetchGameBackdrop !== 'function' || !currentGame?.title) return;
        const game = currentGame;
        const url = await window.fetchGameBackdrop(game.title);
        if (url && currentGame === game) {
            els.banner.style.setProperty('--bg-image', window.cssUrl(url));
        }
    }

    window.openDetailModal = function (game) {
        lastFocused = document.activeElement;
        currentGame = game;

        resetRelated();
        ratingEditing = false;
        reviewEditing = false;
        els.ratingMount.hidden = true;
        els.ratingDisplay.hidden = false;
        els.ratingEditBtn.classList.remove('is-active');
        els.colorPopup.hidden = true;
        tagPopover.hidden = true;

        refreshAll();
        overlay.hidden = false;
        container.hidden = false;
        pixelBg.start(window.activeSwatchColor(game.color));

        loadRelatedGames();
        loadBackdrop();
        els.closeBtn.focus();
    };
})();
