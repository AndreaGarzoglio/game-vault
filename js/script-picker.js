// ============================================
// GAME PICKER
// The one "choose games" modal, shared by the tier maker, About me cards
// and top lists. It searches the local library first (instant, and the
// common case) and falls back to IGDB so you can also pick games you
// don't own or haven't added yet.
// ============================================
(function () {
    const icon = window.icon;

    // A game is referenced across views as a `ref` — a small
    // {gameId|igdbId, title, image} snapshot rather than a live game
    // object, so a tier list or top 10 survives the game being edited or
    // deleted. `refKey` is its identity.
    window.refKey = function (ref) {
        return ref.gameId ? `g:${ref.gameId}` : `i:${ref.igdbId}`;
    };

    // ============================================
    // MULTI-GAME SELECTION MODAL
    // Search box (name / genre / console) → three rows of toggleable
    // chips built from what was actually found → two checklists (library,
    // IGDB) filtered by the active chips → "Add N games" resolves with
    // whatever ended up checked. Shared by the tier maker (build a tray
    // selection) and About me (build a card's game stack).
    // ============================================
    const selDialog = window.createDialog({
        className: 'sel-modal',
        html: `
            <h2 id="selTitle">Build a selection</h2>
            <div class="search search--inline" id="selSearchWrap">
                <svg class="icon search__icon" aria-hidden="true"><use href="#i-search"/></svg>
                <input type="text" id="selSearch" placeholder="Search a game name, genre, or console…" autocomplete="off">
                <div class="tag-suggest" id="selSuggest" hidden></div>
            </div>
            <div class="chip-row" id="selActiveChips"></div>

            <div class="sel-toolbar">
                <button type="button" class="icon-btn" id="selRefreshBtn" title="Load more popular IGDB games" aria-label="Load more popular IGDB games">${icon('refresh')}</button>
                <button type="button" class="btn-notch cancelBtn" id="selPasteBtn"><span class="btn-notch__inner">Paste a list</span></button>
                <button type="button" class="btn-notch cancelBtn" id="selRandomBtn"><span class="btn-notch__inner">Random 10</span></button>
            </div>

            <div class="sel-section">
                <p class="sel-section__label">Your library
                    <button type="button" class="sel-section__action" id="selLibraryAllBtn">Select all</button>
                </p>
                <div class="sel-list" id="selLibraryList"></div>
            </div>
            <div class="sel-section" id="selIgdbSection">
                <p class="sel-section__label">Popular on IGDB</p>
                <div class="sel-list" id="selIgdbList"></div>
            </div>

            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch" id="selDoneBtn"><span class="btn-notch__inner">Add selected</span></button>
                <button type="button" class="cancelBtn btn-notch" id="selCancelBtn"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => {
            const resolve = selResolve;
            selResolve = null;
            resolve?.(null);
        }
    });
    const selModal = selDialog.el;

    const selEls = {
        title: selModal.querySelector('#selTitle'),
        search: selModal.querySelector('#selSearch'),
        suggest: selModal.querySelector('#selSuggest'),
        activeChips: selModal.querySelector('#selActiveChips'),
        libraryList: selModal.querySelector('#selLibraryList'),
        libraryAllBtn: selModal.querySelector('#selLibraryAllBtn'),
        igdbSection: selModal.querySelector('#selIgdbSection'),
        igdbList: selModal.querySelector('#selIgdbList'),
        refreshBtn: selModal.querySelector('#selRefreshBtn'),
        pasteBtn: selModal.querySelector('#selPasteBtn'),
        doneBtn: selModal.querySelector('#selDoneBtn')
    };

    // ---- Paste a list: one title per line, matched against the library
    // first and IGDB second, then checked off in the lists above like any
    // manual pick. Lookups run one at a time (awaited in sequence) rather
    // than in parallel, to stay under IGDB's rate limit.
    const pasteDialog = window.createDialog({
        className: 'sel-paste-modal',
        html: `
            <h2>Paste a list</h2>
            <div class="formEntry">
                <label for="selPasteText">One game title per line — matched against your library, then IGDB</label>
                <textarea id="selPasteText" rows="10" placeholder="Deltarune&#10;Outer Wilds&#10;Persona 5 Royal"></textarea>
            </div>
            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch" id="selPasteGoBtn"><span class="btn-notch__inner">Match &amp; add</span></button>
                <button type="button" class="cancelBtn btn-notch" id="selPasteCancelBtn"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `
    });
    const pasteText = pasteDialog.el.querySelector('#selPasteText');
    const pasteGoBtn = pasteDialog.el.querySelector('#selPasteGoBtn');

    function findLibraryByTitle(title) {
        const clean = title.trim().toLowerCase();
        return selLibraryAll.find((ref) => ref.title.trim().toLowerCase() === clean) || null;
    }

    async function matchAndCheckList(titles, onProgress) {
        const notFound = [];
        let matched = 0;

        for (const title of titles) {
            const inLibrary = findLibraryByTitle(title);
            if (inLibrary) {
                selChecked.add(window.refKey(inLibrary));
                matched++;
            } else if (selLibraryOnly || typeof window.searchGamesIgdbRich !== 'function') {
                notFound.push(title);
            } else {
                const results = await window.searchGamesIgdbRich(title, { limit: 1 });
                const hit = results[0];
                if (hit) {
                    ingestIgdbCards([hit]);
                    selChecked.add(window.refKey({ igdbId: hit.id }));
                    matched++;
                } else {
                    notFound.push(title);
                }
            }
            onProgress?.(matched + notFound.length, titles.length);
        }

        renderSelectionLists();

        const parts = [`${matched} matched`];
        if (notFound.length) parts.push(`${notFound.length} not found: ${notFound.join(', ')}`);
        window.toast(parts.join(' — '));
    }

    async function submitPasteList() {
        const titles = Array.from(new Set(
            pasteText.value.split('\n').map((line) => line.trim()).filter(Boolean)
        ));
        if (!titles.length) return;

        pasteGoBtn.disabled = true;
        const label = pasteGoBtn.querySelector('.btn-notch__inner');
        label.textContent = `Matching 0/${titles.length}…`;
        pasteDialog.close();

        await matchAndCheckList(titles, (done, total) => {
            label.textContent = `Matching ${done}/${total}…`;
        });

        pasteGoBtn.disabled = false;
        label.textContent = 'Match & add';
        pasteText.value = '';
    }

    pasteDialog.el.addEventListener('click', (event) => {
        if (event.target.closest('#selPasteGoBtn')) return submitPasteList();
        if (event.target.closest('#selPasteCancelBtn')) return pasteDialog.close();
    });

    // A curated fallback so the suggestion dropdown has something to offer
    // beyond your own library — IGDB has no lightweight "list all
    // genres/platforms" endpoint wired up.
    const CURATED_TAGS = [
        'RPG', 'Turn-based', 'Action', 'Adventure', 'Platformer', 'Shooter',
        'Puzzle', 'Strategy', 'Simulation', 'Roguelike', 'Metroidvania',
        'Survival', 'Horror', 'Stealth', 'Racing', 'Fighting', 'Sports',
        'Open world', 'Sandbox', 'Multiplayer', 'Co-op', 'Point-and-click',
        'Visual novel', 'Card & board game', 'Music', 'Tactical',
        'PC', 'PlayStation 5', 'PlayStation 4', 'Xbox Series X|S', 'Xbox One',
        'Nintendo Switch', 'Nintendo Switch 2'
    ];

    let selFetchToken = 0;
    let selIgdbOffset = 0;
    let selResolve = null;
    let selLibraryAll = []; // every library game, fixed for the life of one modal session
    let selIgdbPool = []; // { igdbId, title, image, genresList, platformsList } — popular, or tag/name matched
    let selPinned = []; // refs the caller pre-checked that may not be in either pool above
    let selActiveTags = []; // [{ name, type: 'name' | 'tag' }] — ANDed together
    let selChecked = new Set();
    let selLibraryOnly = false; // hides the IGDB section for callers that can only reference owned games

    function ingestIgdbCards(cards) {
        const existingIds = new Set(selIgdbPool.map((r) => r.igdbId));
        // A name search and a tag search can turn up the same game —
        // dedupe the incoming batch against itself too, not just against
        // what's already stored, or it ends up as two rows sharing one
        // refKey (and a checkbox count that silently drifts).
        const seenInBatch = new Set();
        const fresh = cards.filter((g) => {
            if (existingIds.has(g.id) || seenInBatch.has(g.id)) return false;
            seenInBatch.add(g.id);
            return true;
        });
        fresh.forEach((g) => {
            selIgdbPool.push({
                igdbId: g.id, title: g.title, image: g.image, screenshot: g.screenshot || null,
                year: g.year || null, description: g.description || '',
                genresList: g.genres || [], platformsList: g.platforms || []
            });
        });
        return fresh.length;
    }

    // Loads whatever the *current* active tags call for: a specific title
    // search if a game name is active, a genre/console tag search if not,
    // or just "what's popular right now" if nothing is active yet — this
    // is what keeps the IGDB list full from the moment the modal opens.
    async function loadIgdbPool(reset) {
        if (selLibraryOnly) return 0;
        if (reset) {
            selIgdbPool = [];
            selIgdbOffset = 0;
        }
        const nameTag = selActiveTags.find((t) => t.type === 'name');
        const tagNames = selActiveTags.filter((t) => t.type === 'tag').map((t) => t.name);
        const token = ++selFetchToken;

        let games = [];
        if (nameTag && typeof window.searchGamesIgdbRich === 'function') {
            games = await window.searchGamesIgdbRich(nameTag.name, { limit: 20, offset: selIgdbOffset });
        } else if (tagNames.length && typeof window.searchGamesIgdbByTagsRich === 'function') {
            games = await window.searchGamesIgdbByTagsRich(tagNames, { limit: 20, offset: selIgdbOffset });
        } else if (!selActiveTags.length && typeof window.fetchPopularGamesIgdbRich === 'function') {
            games = await window.fetchPopularGamesIgdbRich({ limit: 20, offset: selIgdbOffset });
        }
        if (token !== selFetchToken) return 0;

        selIgdbOffset += games.length;
        const added = ingestIgdbCards(games);
        renderSelectionLists();
        return added;
    }

    async function refreshIgdbPool() {
        const added = await loadIgdbPool(false);
        if (!added) window.toast('No more matches to load');
    }

    // Every active tag (a game name, or a genre/console) must match — name
    // tags check the title, everything else checks whichever genre/tag
    // lists the caller's ref shape actually has.
    function matchesActiveTags(ref, genreLists) {
        return selActiveTags.every((t) => (t.type === 'name' ? ref.title === t.name : genreLists.some((list) => list.includes(t.name))));
    }

    function visibleLibrary() {
        return selLibraryAll.filter((ref) => matchesActiveTags(ref, [(ref.genre || '').split(',').map((s) => s.trim()), ref.tags || [], ref.collections || []]));
    }

    function visibleIgdb() {
        // Pinned IGDB refs (pre-checked when the modal opened) might not be
        // in the freshly (re)loaded pool yet — merge them in so they don't
        // silently vanish from the list while still checked.
        const merged = [...selPinned.filter((r) => r.igdbId), ...selIgdbPool];
        const seen = new Set();
        const deduped = merged.filter((ref) => {
            const key = window.refKey(ref);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        return deduped.filter((ref) => matchesActiveTags(ref, [ref.genresList || [], ref.platformsList || []]));
    }

    function selRowMarkup(ref) {
        const key = window.escapeHtml(window.refKey(ref));
        const checked = selChecked.has(window.refKey(ref));
        return `<label class="sel-row tier-item show-frame${checked ? ' is-checked' : ''}"
            style="${window.escapeHtml(`--bg-image:${window.cssUrl(ref.image)}`)}" title="${window.escapeHtml(ref.title)}">
            <input type="checkbox" data-sel-key="${key}" ${checked ? 'checked' : ''}>
            <span class="tier-item__name">${window.escapeHtml(ref.title)}</span>
        </label>`;
    }

    function updateDoneLabel() {
        selEls.doneBtn.querySelector('.btn-notch__inner').textContent =
            selChecked.size ? `Add ${selChecked.size} game${selChecked.size === 1 ? '' : 's'}` : 'Add selected';
    }

    function renderSelectionLists() {
        const library = visibleLibrary();
        const igdb = visibleIgdb();

        selEls.libraryList.innerHTML = library.length
            ? library.map(selRowMarkup).join('')
            : '<p class="field-hint">No games in your library match.</p>';

        selEls.igdbList.innerHTML = igdb.length
            ? igdb.map(selRowMarkup).join('')
            : '<p class="field-hint">Loading…</p>';

        if (selEls.libraryAllBtn) {
            const allChecked = library.length > 0 && library.every((ref) => selChecked.has(window.refKey(ref)));
            selEls.libraryAllBtn.textContent = allChecked ? 'Deselect all' : 'Select all';
            selEls.libraryAllBtn.hidden = !library.length;
        }

        updateDoneLabel();
    }

    function renderActiveChips() {
        selEls.activeChips.innerHTML = selActiveTags.length
            ? selActiveTags.map((t) => `<button type="button" class="tag-chip is-active" data-sel-remove="${window.escapeHtml(t.name)}">
                ${window.escapeHtml(t.name)}<span class="tag-chip__x">×</span>
            </button>`).join('')
            : '';
    }

    // ---- Suggestion dropdown: live-filtered as you type ----
    function suggestionPool() {
        const list = window.getWatchlist?.() || [];
        const folders = window.getFolders?.(list) || [];
        const libraryGenres = new Set();
        list.forEach((g) => (g.genre || '').split(',').map((s) => s.trim()).filter(Boolean).forEach((x) => libraryGenres.add(x)));

        const igdbGenres = new Set();
        const igdbConsoles = new Set();
        selIgdbPool.forEach((r) => {
            (r.genresList || []).forEach((g) => igdbGenres.add(g));
            (r.platformsList || []).forEach((p) => igdbConsoles.add(p));
        });

        const names = new Set([...selLibraryAll.map((r) => r.title), ...selIgdbPool.map((r) => r.title)]);
        const tags = new Set([...folders, ...libraryGenres, ...igdbGenres, ...igdbConsoles, ...CURATED_TAGS]);

        return [
            ...Array.from(names).map((name) => ({ name, type: 'name' })),
            ...Array.from(tags).map((name) => ({ name, type: 'tag' }))
        ];
    }

    function renderSuggestions(term) {
        const clean = term.trim().toLowerCase();
        const pool = suggestionPool().filter((t) => !selActiveTags.some((a) => a.name === t.name));
        const matches = (clean ? pool.filter((t) => t.name.toLowerCase().includes(clean)) : pool).slice(0, 8);

        selEls.suggest.innerHTML = matches.length
            ? matches.map((t) => `<button type="button" class="tag-suggest__item" data-sel-suggest="${window.escapeHtml(t.name)}" data-sel-suggest-type="${t.type}">
                ${window.escapeHtml(t.name)}${t.type === 'name' ? '<span class="tag-suggest__hint">game</span>' : ''}
            </button>`).join('')
            : '<p class="tag-suggest__empty">Press Enter to add it as a new tag.</p>';
        selEls.suggest.hidden = false;
    }

    function hideSuggestions() {
        selEls.suggest.hidden = true;
    }

    function commitTag(name, type) {
        const clean = name.trim();
        if (!clean || selActiveTags.some((t) => t.name.toLowerCase() === clean.toLowerCase())) return;
        selActiveTags.push({ name: clean, type: type === 'name' ? 'name' : 'tag' });
        selEls.search.value = '';
        hideSuggestions();
        renderActiveChips();
        loadIgdbPool(true);
        renderSelectionLists();
    }

    function removeActiveTag(name) {
        selActiveTags = selActiveTags.filter((t) => t.name !== name);
        renderActiveChips();
        loadIgdbPool(true);
        renderSelectionLists();
    }

    function selRandomPick() {
        const pool = [...visibleLibrary(), ...visibleIgdb()].filter((ref) => !selChecked.has(window.refKey(ref)));
        if (!pool.length) {
            window.toast('Nothing left to pick from');
            return;
        }
        pool.sort(() => Math.random() - 0.5);
        pool.slice(0, 10).forEach((ref) => selChecked.add(window.refKey(ref)));
        renderSelectionLists();
    }

    // Checks (or, on a second click, unchecks) every library game that
    // matches the active tag filters — the same set shown in the "Your
    // library" list, not the whole vault regardless of what's filtered.
    function selLibraryToggleAll() {
        const visible = visibleLibrary();
        if (!visible.length) {
            window.toast('No library games match');
            return;
        }
        const allChecked = visible.every((ref) => selChecked.has(window.refKey(ref)));
        visible.forEach((ref) => {
            if (allChecked) selChecked.delete(window.refKey(ref));
            else selChecked.add(window.refKey(ref));
        });
        renderSelectionLists();
    }

    function finishSelection() {
        const pool = [...selPinned, ...selLibraryAll, ...selIgdbPool];
        const seen = new Set();
        const refs = [];
        pool.forEach((ref) => {
            const key = window.refKey(ref);
            if (selChecked.has(key) && !seen.has(key)) {
                seen.add(key);
                refs.push(ref);
            }
        });
        const resolve = selResolve;
        selResolve = null;
        selDialog.close();
        resolve?.(refs);
    }

    selEls.search.addEventListener('focus', () => renderSuggestions(selEls.search.value));
    selEls.search.addEventListener('input', () => renderSuggestions(selEls.search.value));
    selEls.search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commitTag(selEls.search.value, 'tag');
        } else if (event.key === 'Escape') {
            hideSuggestions();
        }
    });
    // Delayed so a click on a suggestion (which blurs the input first)
    // still registers before the list disappears.
    selEls.search.addEventListener('blur', () => setTimeout(hideSuggestions, 150));

    selModal.addEventListener('change', (event) => {
        const cb = event.target.closest('[data-sel-key]');
        if (!cb) return;
        if (cb.checked) selChecked.add(cb.dataset.selKey);
        else selChecked.delete(cb.dataset.selKey);
        cb.closest('.sel-row')?.classList.toggle('is-checked', cb.checked);
        updateDoneLabel();
    });

    selModal.addEventListener('click', (event) => {
        const suggestBtn = event.target.closest('[data-sel-suggest]');
        if (suggestBtn) {
            commitTag(suggestBtn.dataset.selSuggest, suggestBtn.dataset.selSuggestType);
            return;
        }
        const removeBtn = event.target.closest('[data-sel-remove]');
        if (removeBtn) {
            removeActiveTag(removeBtn.dataset.selRemove);
            return;
        }
        if (event.target.closest('#selRefreshBtn')) return refreshIgdbPool();
        if (event.target.closest('#selPasteBtn')) return pasteDialog.open(pasteText);
        if (event.target.closest('#selLibraryAllBtn')) return selLibraryToggleAll();
        if (event.target.closest('#selRandomBtn')) return selRandomPick();
        if (event.target.closest('#selDoneBtn')) return finishSelection();
        if (event.target.closest('#selCancelBtn')) return selDialog.close();
    });

    // Shared by the tier maker (games it can drag into tiers) and About me
    // (a card's game stack). Resolves with the checked refs, or null if
    // cancelled.
    // ============================================
    // SINGLE-GAME TYPE-AHEAD PICKER
    // Wires one text input + one dropdown into a "type a title, get
    // library-then-IGDB suggestions, pick one" widget. Not a modal of its
    // own — callers own the dialog/form around it and just hand over the
    // input/results elements. Shared by the wiki form's title autocomplete,
    // About me's per-card picker, and top-list's per-slot picker.
    // ============================================
    window.pickGameSingle = function ({
        inputEl,
        resultsEl,
        includeLibrary = true,
        minChars = 2,
        debounceMs = 250,
        libraryLimit = 5,
        igdbLimit = includeLibrary ? 6 : 8,
        renderHint = (ref) => (ref.gameId ? 'library' : (ref.year || 'game')),
        onPick
    }) {
        let results = [];
        let token = 0;
        let debounceTimer = null;

        function hide() {
            resultsEl.hidden = true;
        }

        async function renderSuggestions(term) {
            const clean = term.trim();
            if (clean.length < minChars) return hide();

            const myToken = ++token;
            const lower = clean.toLowerCase();
            const libMatches = includeLibrary
                ? (window.getWatchlist?.() || [])
                    .filter((g) => g.title.toLowerCase().includes(lower))
                    .slice(0, libraryLimit)
                    .map((g) => ({
                        gameId: g.id, title: g.title, image: g.image || null, screenshot: g.screenshot || null,
                        year: g.year || null, developer: g.developer || '', description: g.description || '', genre: g.genre || '', tags: g.tags || []
                    }))
                : [];

            const igdbCards = typeof window.searchGamesIgdbRich === 'function'
                ? await window.searchGamesIgdbRich(clean, { limit: igdbLimit })
                : [];
            if (myToken !== token) return;

            const known = new Set(libMatches.map((r) => r.title.toLowerCase()));
            const igdbMatches = igdbCards
                .filter((g) => !known.has(g.title.toLowerCase()))
                .map((g) => ({
                    igdbId: g.id, title: g.title, image: g.image || null, screenshot: g.screenshot || null,
                    year: g.year || null, description: g.description || '', genresList: g.genres || [], platformsList: g.platforms || []
                }));

            results = [...libMatches, ...igdbMatches];
            if (!results.length) return hide();

            resultsEl.innerHTML = results.map((ref, i) => {
                const hint = renderHint(ref);
                return `<button type="button" class="tag-suggest__item" data-pick-index="${i}">
                    ${window.escapeHtml(ref.title)}${hint ? `<span class="tag-suggest__hint">${window.escapeHtml(String(hint))}</span>` : ''}
                </button>`;
            }).join('');
            resultsEl.hidden = false;
        }

        inputEl.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => renderSuggestions(inputEl.value), debounceMs);
        });

        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') hide();
        });

        // Picked on mousedown (with the default prevented) rather than
        // click, so the field never blurs first — no race against a
        // blur-triggered handler using the stale, half-typed value.
        resultsEl.addEventListener('mousedown', (event) => {
            const btn = event.target.closest('[data-pick-index]');
            if (!btn) return;
            event.preventDefault();
            const ref = results[Number(btn.dataset.pickIndex)];
            hide();
            if (ref) onPick?.(ref);
        });

        inputEl.addEventListener('blur', () => setTimeout(hide, 150));

        return {
            hide,
            reset() {
                results = [];
                hide();
            }
        };
    };

    // Shared by the tier maker (games it can drag into tiers) and About me
    // (a card's game stack). Resolves with the checked refs, or null if
    // cancelled.
    window.pickGamesMulti = function ({ title = 'Build a selection', initialRefs = [], libraryOnly = false } = {}) {
        selEls.title.textContent = title;
        selActiveTags = [];
        selPinned = initialRefs.slice();
        selChecked = new Set(initialRefs.map(window.refKey));
        selIgdbPool = [];
        selIgdbOffset = 0;
        selLibraryOnly = libraryOnly;
        selEls.igdbSection.hidden = libraryOnly;
        selEls.refreshBtn.hidden = libraryOnly;
        selEls.search.value = '';
        hideSuggestions();
        renderActiveChips();

        selLibraryAll = (window.getWatchlist?.() || []).map((g) => ({
            gameId: g.id, title: g.title, image: g.image || null, screenshot: g.screenshot || null,
            year: g.year || null, description: g.description || '', genre: g.genre || '', tags: g.tags || [], collections: g.collections || []
        }));
        renderSelectionLists();

        selDialog.open(selEls.search);
        loadIgdbPool(true);

        return new Promise((resolve) => {
            selResolve = resolve;
        });
    };
})();
