// ============================================
// LIBRARY NAVIGATION
// Search, the library/status/favourites views, user-made collections and
// genre chips — everything that decides *which* games the grid shows.
//
// Collections are named lists a game can belong to (`game.collections`),
// kept separate from `game.tags` — the freeform labels a game carries on
// its own. A collection name is also stored on its own so an empty one
// survives without any game pointing at it yet.
// ============================================
(function () {
    let searchTerm = '';
    let view = 'all'; // all | favorites | backlog | playing | completed
    const activeGenres = new Set();
    let activeFolder = null;

    const els = {
        search: document.getElementById('gameSearch'),
        nav: document.getElementById('libraryNav'),
        folderList: document.getElementById('folderList'),
        folderHint: document.getElementById('folderHint'),
        newFolderBtn: document.getElementById('newFolderBtn'),
        genreSection: document.getElementById('genreSection'),
        genreBar: document.getElementById('genreBar'),
        activeFilters: document.getElementById('activeFilters')
    };

    // ---- Collections storage ----
    function loadFolders() {
        const parsed = window.vaultStore.read(window.VAULT_KEYS.folders, []);
        return Array.isArray(parsed) ? parsed.filter((n) => typeof n === 'string') : [];
    }

    let folders = loadFolders();

    function saveFolders() {
        window.vaultStore.write(window.VAULT_KEYS.folders, folders);
    }

    window.getFolders = function (list) {
        const used = new Set();
        (list || window.getWatchlist?.() || []).forEach((game) => {
            (game.collections || []).forEach((name) => used.add(name));
        });
        return Array.from(new Set([...folders, ...used])).sort((a, b) => a.localeCompare(b));
    };

    window.createFolder = function (name) {
        const clean = name.trim();
        if (!clean || folders.includes(clean)) return false;
        folders.push(clean);
        saveFolders();
        window.renderShows?.();
        return true;
    };

    function renameFolder(oldName, newName) {
        const clean = newName.trim();
        if (!clean || clean === oldName) return;

        folders = folders.map((f) => (f === oldName ? clean : f));
        if (!folders.includes(clean)) folders.push(clean);
        saveFolders();

        (window.getWatchlist?.() || []).forEach((game) => {
            game.collections = (game.collections || []).map((name) => (name === oldName ? clean : name));
            game.collections = Array.from(new Set(game.collections));
        });
        if (activeFolder === oldName) activeFolder = clean;

        window.saveWatchlist?.();
        window.renderShows?.();
    }

    function deleteFolder(name) {
        folders = folders.filter((f) => f !== name);
        saveFolders();

        (window.getWatchlist?.() || []).forEach((game) => {
            game.collections = (game.collections || []).filter((n) => n !== name);
        });
        if (activeFolder === name) activeFolder = null;

        window.saveWatchlist?.();
        window.renderShows?.();
    }

    function splitGenres(game) {
        return (game.genre || '').split(',').map((s) => s.trim()).filter(Boolean);
    }

    window.getGameTags = function (game) {
        return Array.from(new Set([...splitGenres(game), ...(game.tags || [])]));
    };

    // ---- Filtering ----
    function matchesView(game) {
        if (view === 'all') return true;
        if (view === 'favorites') return !!game.favorite;
        if (view === 'unreviewed') return window.computeRatingAverage?.(game.ratings) == null;
        return game.status === view;
    }

    function applyFilters(list) {
        const term = searchTerm.trim().toLowerCase();

        return list.filter((game) => {
            if (!matchesView(game)) return false;
            if (activeFolder && !(game.collections || []).includes(activeFolder)) return false;

            if (activeGenres.size) {
                const genres = splitGenres(game);
                // Every selected genre must be present: narrowing down with
                // a second genre should shrink the list, not widen it.
                for (const genre of activeGenres) {
                    if (!genres.includes(genre)) return false;
                }
            }

            if (!term) return true;
            return (game.title || '').toLowerCase().includes(term)
                || (game.developer || '').toLowerCase().includes(term)
                || (game.genre || '').toLowerCase().includes(term);
        });
    }

    // ---- Sidebar rendering ----
    function renderCounts(list) {
        const counts = { all: list.length, favorites: 0, backlog: 0, playing: 0, completed: 0, unreviewed: 0 };
        list.forEach((g) => {
            if (g.favorite) counts.favorites++;
            if (counts[g.status] !== undefined) counts[g.status]++;
            if (window.computeRatingAverage?.(g.ratings) == null) counts.unreviewed++;
        });

        els.nav.querySelectorAll('[data-count]').forEach((el) => {
            el.textContent = counts[el.dataset.count] ?? 0;
        });
        els.nav.querySelectorAll('[data-view]').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.view === view);
        });
    }

    function renderFolders(list) {
        const names = window.getFolders(list);
        els.folderHint.hidden = names.length > 0;

        els.folderList.innerHTML = names.map((name) => {
            const count = list.filter((game) => (game.collections || []).includes(name)).length;
            const safe = window.escapeHtml(name);
            return `
                <div class="nav__row${activeFolder === name ? ' is-active' : ''}">
                    <button class="nav__item" type="button" data-folder="${safe}">
                        <svg class="icon" aria-hidden="true"><use href="#i-folder"/></svg>
                        <span class="nav__label">${safe}</span>
                        <span class="nav__count">${count}</span>
                    </button>
                    <span class="nav__row-actions">
                        <button class="icon-btn icon-btn--sm" type="button" data-folder-edit="${safe}"
                            title="Rename" aria-label="Rename ${safe}">
                            <svg class="icon" aria-hidden="true"><use href="#i-pencil"/></svg>
                        </button>
                        <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-folder-delete="${safe}"
                            title="Delete" aria-label="Delete ${safe}">
                            <svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg>
                        </button>
                    </span>
                </div>
            `;
        }).join('');
    }

    function renderGenres(list) {
        const genres = new Set();
        list.forEach((game) => {
            splitGenres(game).forEach((g) => genres.add(g));
        });
        const sorted = Array.from(genres).sort((a, b) => a.localeCompare(b));

        els.genreSection.hidden = sorted.length === 0;
        els.genreBar.innerHTML = sorted.map((genre) => {
            const safe = window.escapeHtml(genre);
            return `<button type="button" class="tag-chip${activeGenres.has(genre) ? ' is-active' : ''}" data-genre="${safe}">${safe}</button>`;
        }).join('');
    }

    function renderActiveFilters() {
        const chips = [];
        if (view !== 'all') chips.push({ type: 'view', value: view, label: view });
        if (activeFolder) chips.push({ type: 'folder', value: activeFolder, label: activeFolder });
        activeGenres.forEach((genre) => chips.push({ type: 'genre', value: genre, label: genre }));
        if (searchTerm.trim()) chips.push({ type: 'search', value: '', label: `“${searchTerm.trim()}”` });

        els.activeFilters.hidden = chips.length === 0;
        if (!chips.length) return;

        els.activeFilters.innerHTML = chips.map((chip) => `
            <button type="button" class="filter-pill" data-clear-type="${chip.type}" data-clear-value="${window.escapeHtml(chip.value)}">
                ${window.escapeHtml(chip.label)}
                <svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>
            </button>
        `).join('') + '<button type="button" class="filter-pill filter-pill--clear" data-clear-type="all">Clear all</button>';
    }

    // Called from renderShows: filtering and the sidebar always describe
    // the same state, so they're refreshed from the same pass.
    window.getFilteredList = function (list) {
        renderCounts(list);
        renderFolders(list);
        renderGenres(list);
        renderActiveFilters();
        return applyFilters(list);
    };

    window.clearAllFilters = function () {
        view = 'all';
        activeFolder = null;
        activeGenres.clear();
        searchTerm = '';
        if (els.search) els.search.value = '';
        window.renderShows?.();
    };

    // ---- Events ----
    els.nav.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-view]');
        if (!btn) return;
        view = btn.dataset.view;
        window.renderShows?.();
    });

    els.folderList.addEventListener('click', async (event) => {
        const editBtn = event.target.closest('[data-folder-edit]');
        if (editBtn) {
            const name = editBtn.dataset.folderEdit;
            const next = await window.promptDialog({ title: 'Rename collection', value: name });
            if (next) renameFolder(name, next);
            return;
        }

        const deleteBtn = event.target.closest('[data-folder-delete]');
        if (deleteBtn) {
            const name = deleteBtn.dataset.folderDelete;
            const ok = await window.confirmDialog({
                title: 'Delete collection?',
                message: `“${name}” will be removed from every game in it. The games themselves stay.`,
                confirmLabel: 'Delete',
                danger: true
            });
            if (ok) deleteFolder(name);
            return;
        }

        const folderBtn = event.target.closest('[data-folder]');
        if (!folderBtn) return;
        const name = folderBtn.dataset.folder;
        activeFolder = activeFolder === name ? null : name;
        window.renderShows?.();
    });

    els.newFolderBtn.addEventListener('click', async () => {
        const name = await window.promptDialog({ title: 'New collection', placeholder: 'e.g. Comfort games' });
        if (!name) return;
        if (!window.createFolder(name)) return window.toast('That collection already exists');

        const refs = await window.pickGamesMulti?.({ title: `Add games to “${name}”` });
        if (!refs?.length) return;

        const list = window.getWatchlist?.() || [];
        refs.forEach((ref) => {
            // A ref from IGDB that isn't in the library yet has no game
            // object to tag — importing it first is what lets a collection
            // hold games you don't already own.
            const game = ref.gameId
                ? list.find((g) => g.id === ref.gameId)
                : window.addGameToWatchlist?.({
                    title: ref.title,
                    year: ref.year || null,
                    advancedData: {
                        genre: (ref.genresList || []).join(', '),
                        description: ref.description || '',
                        image: ref.image || null,
                        screenshot: ref.screenshot || null
                    }
                });
            if (!game) return;
            game.collections = Array.from(new Set([...(game.collections || []), name]));
        });
        window.saveWatchlist?.();
        window.renderShows?.();
    });

    els.genreBar.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-genre]');
        if (!chip) return;
        const genre = chip.dataset.genre;
        if (activeGenres.has(genre)) activeGenres.delete(genre);
        else activeGenres.add(genre);
        window.renderShows?.();
    });

    els.activeFilters.addEventListener('click', (event) => {
        const pill = event.target.closest('[data-clear-type]');
        if (!pill) return;

        const { clearType, clearValue } = pill.dataset;
        if (clearType === 'all') return window.clearAllFilters();
        if (clearType === 'view') view = 'all';
        if (clearType === 'folder') activeFolder = null;
        if (clearType === 'genre') activeGenres.delete(clearValue);
        if (clearType === 'search') {
            searchTerm = '';
            els.search.value = '';
        }
        window.renderShows?.();
    });

    // Typing shouldn't rebuild the grid on every keystroke — a short debounce
    // keeps a fast typist at one render instead of a dozen.
    let searchTimer = null;
    els.search.addEventListener('input', (event) => {
        searchTerm = event.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => window.renderShows?.(), 140);
    });

    els.search.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.target.value = '';
            searchTerm = '';
            window.renderShows?.();
            event.target.blur();
        }
    });

    // "/" focuses search, the way most library/search UIs do.
    document.addEventListener('keydown', (event) => {
        if (event.key !== '/' || event.metaKey || event.ctrlKey) return;
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        event.preventDefault();
        els.search.focus();
    });
})();
