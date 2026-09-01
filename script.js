// ============================================
// CORE DATA
// ============================================
let myWatchlist = [];

function Game(title, year) {
    this.id = window.uid();
    this.title = title;
    this.year = year;
    this.status = 'backlog';
    this.description = '';
    this.genre = '';
    this.developer = '';
    this.image = null;
    this.screenshot = null;
    this.color = '';
    this.ratings = {};
    this.tags = [];
    this.collections = [];
    this.favorite = false;
    this.review = '';
}

function saveWatchlist() {
    window.vaultStore.write(window.VAULT_KEYS.games, myWatchlist);
}

// Games saved by older versions predate `favorite`/`review`/`tags`, so
// normalise on load rather than guarding for undefined at every use site.
function normalizeGame(game) {
    game.tags = Array.isArray(game.tags) ? game.tags : [];
    // Collections used to live in `tags` alongside freeform labels — split
    // out whatever already matches a saved collection name, once, the
    // first time a game is loaded without its own `collections` array.
    if (!Array.isArray(game.collections)) {
        const known = new Set(window.getFolders?.() || []);
        game.collections = game.tags.filter((t) => known.has(t));
        game.tags = game.tags.filter((t) => !known.has(t));
    }
    game.screenshot = typeof game.screenshot === 'string' ? game.screenshot : null;
    game.ratings = game.ratings && typeof game.ratings === 'object' ? game.ratings : {};
    game.favorite = !!game.favorite;
    game.review = typeof game.review === 'string' ? game.review : '';
    game.status = ['backlog', 'playing', 'completed'].includes(game.status) ? game.status : 'backlog';
    return game;
}

function loadWatchlist() {
    const parsed = window.vaultStore.read(window.VAULT_KEYS.games, null);
    if (!Array.isArray(parsed)) return false;
    myWatchlist = parsed.map(normalizeGame);
    return true;
}

function addGameToWatchlist({ title, year, advancedData }) {
    const game = new Game(title, year);

    if (typeof window.applyAdvancedDataToShow === 'function') {
        window.applyAdvancedDataToShow(game, advancedData);
    }

    myWatchlist.push(game);
    saveWatchlist();
    return game;
}

function removeGameFromWatchlist(id) {
    const index = myWatchlist.findIndex((game) => game.id === id);
    if (index === -1) return null;

    const [removed] = myWatchlist.splice(index, 1);
    saveWatchlist();
    return { game: removed, index };
}

// Removal always goes through here so every entry point (card ×, detail
// view) gets the same confirm + undo affordance.
async function requestRemoveGame(id) {
    const game = myWatchlist.find((item) => item.id === id);
    if (!game) return false;

    const ok = await window.confirmDialog({
        title: 'Remove this game?',
        message: `“${game.title}” will be taken out of your library.`,
        confirmLabel: 'Remove',
        danger: true
    });
    if (!ok) return false;

    const removed = removeGameFromWatchlist(id);
    renderShows();

    window.toast(`Removed “${game.title}”`, {
        actionLabel: 'Undo',
        onAction: () => {
            myWatchlist.splice(Math.min(removed.index, myWatchlist.length), 0, removed.game);
            saveWatchlist();
            renderShows();
        }
    });
    return true;
}

function toggleGameStatus(id) {
    const game = myWatchlist.find((item) => item.id === id);
    if (!game) return;

    if (typeof window.toggleAdvancedWatchedStatus === 'function') {
        window.toggleAdvancedWatchedStatus(game);
    }

    saveWatchlist();
}

// ============================================
// CORE UI
// ============================================
const showsContainer = document.getElementById('shows');
window.attachTilt(showsContainer, { selector: '.show-frame' });
const emptyState = document.getElementById('emptyState');
const resultCount = document.getElementById('resultCount');
const addBtn = document.querySelector('.addBtn');

// Built on the shared dialog scaffold (script-ui.js), same as every other
// modal in the app — gives it Escape-to-close, a focus trap and a place
// in the dialog stack for free, instead of hand-wiring its own.
const addGameDialog = window.createDialog({
    className: 'add-game-modal',
    html: `
        <form id="showForm" autocomplete="off">
            <h2 id="showFormTitle">Add a game</h2>
            <div class="formEntry">
                <label for="showName">Title</label>
                <div class="input-suggest-wrap">
                    <input type="text" id="showName" required autocomplete="off">
                    <div class="tag-suggest" id="showNameSuggest" hidden></div>
                </div>
                <p id="wikiStatus" class="field-hint"></p>
            </div>
            <div class="form-grid">
                <div class="formEntry">
                    <label for="showYear">Release year</label>
                    <input type="number" id="showYear" placeholder="1998">
                </div>
                <div class="formEntry">
                    <label for="showStatus">Status</label>
                    <select id="showStatus">
                        <option value="backlog">Backlog</option>
                        <option value="playing">Playing</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>
            </div>
            <div class="formEntry">
                <label for="showGenre">Genre</label>
                <input type="text" id="showGenre" placeholder="e.g. RPG, Adventure">
            </div>
            <div class="formEntry">
                <label for="showDescription">Description</label>
                <textarea id="showDescription" rows="3" placeholder="Short description…"></textarea>
            </div>
            <div class="formEntry">
                <label for="showImg">Cover image (URL)</label>
                <input type="text" id="showImg" placeholder="Paste a URL or let IGDB find one">
            </div>
            <div class="formEntry">
                <label>Card color</label>
                <input type="hidden" id="showColor" value="">
                <div class="swatch-row" data-swatch-for="showColor"></div>
            </div>
            <div class="form-buttons">
                <button type="submit" class="submitBtn btn-notch" id="showFormSubmit">
                    <span class="btn-notch__inner">Add</span>
                </button>
                <button type="button" class="cancelBtn btn-notch" id="showFormCancelBtn">
                    <span class="btn-notch__inner">Cancel</span>
                </button>
            </div>
        </form>
    `,
    onClose: () => form.reset()
});

const form = addGameDialog.el.querySelector('#showForm');
const showFormTitle = addGameDialog.el.querySelector('#showFormTitle');

const formFields = {
    title: addGameDialog.el.querySelector('#showName'),
    year: addGameDialog.el.querySelector('#showYear'),
    genre: addGameDialog.el.querySelector('#showGenre'),
    status: addGameDialog.el.querySelector('#showStatus'),
    color: addGameDialog.el.querySelector('#showColor'),
    description: addGameDialog.el.querySelector('#showDescription'),
    image: addGameDialog.el.querySelector('#showImg')
};

// Colour is picked from swatches rather than a <select>: the value lives
// in a hidden input so getAdvancedFormData keeps reading `.value`.
const swatchRow = addGameDialog.el.querySelector('[data-swatch-for="showColor"]');

function paintSwatchRow() {
    swatchRow.innerHTML = window.renderSwatchRow(formFields.color.value);
}

swatchRow.addEventListener('click', (event) => {
    const swatch = event.target.closest('.swatch');
    if (!swatch) return;
    formFields.color.value = window.toggleSwatchSelection(formFields.color.value, swatch.dataset.color);
    paintSwatchRow();
});

addGameDialog.el.addEventListener('click', (event) => {
    if (event.target.closest('#showFormCancelBtn')) addGameDialog.close();
});

function openAddModal(prefill = {}) {
    form.reset();
    formFields.color.value = '';
    paintSwatchRow();
    showFormTitle.textContent = 'Add a game';
    if (typeof window.resetWikiStatus === 'function') {
        window.resetWikiStatus();
    }
    formFields.title.value = prefill.title || '';
    formFields.year.value = prefill.year || '';
    formFields.genre.value = prefill.genre || '';
    formFields.description.value = prefill.description || '';
    formFields.image.value = prefill.image || '';
    addGameDialog.open(formFields.title);
}

// Lets other views (tier maker, top lists, About me) hand off an IGDB
// pick that isn't in the library yet — same modal, pre-filled instead
// of starting blank.
window.openAddModalPrefilled = openAddModal;

function getWatchedLabel(game) {
    if (typeof window.getAdvancedWatchedLabel === 'function') {
        return window.getAdvancedWatchedLabel(game);
    }
    return game.status;
}

function getFormData() {
    const advancedData =
        typeof window.getAdvancedFormData === 'function'
            ? window.getAdvancedFormData(formFields)
            : {};

    return {
        title: formFields.title.value.trim(),
        year: formFields.year.value,
        advancedData
    };
}

function isUnreviewed(game) {
    return window.computeRatingAverage?.(game.ratings) == null;
}

function buildCard(game) {
    const esc = window.escapeHtml;
    const card = document.createElement('article');
    card.className = `show-frame notch-frame${isUnreviewed(game) ? ' show-frame--unreviewed' : ''}`;
    card.dataset.showId = game.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open ${game.title}`);

    card.innerHTML = `
        <div class="show notch-inner" data-show-id="${game.id}">
            <div class="show__scan"></div>
            <div class="show__topbar">
                <div class="show__topleft">
                    <button class="removeXBtn" type="button" data-action="delete" data-show-id="${game.id}"
                        title="Remove" aria-label="Remove ${esc(game.title)}">
                        <svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>
                    </button>
                </div>
                <div class="show__seals">
                    <button type="button" class="favorite-badge${game.favorite ? ' is-active' : ''}" data-action="favorite" data-show-id="${game.id}"
                        title="${game.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-label="${game.favorite ? `Remove ${esc(game.title)} from favorites` : `Add ${esc(game.title)} to favorites`}">
                        <img class="pixel-star" src="imgs/pixel-star.png" alt="">
                    </button>
                    ${typeof window.renderRatingBadge === 'function' ? window.renderRatingBadge(game) : ''}
                </div>
            </div>
            <div class="show-info">
                <h2 class="show-title">${esc(game.title)}</h2>
                <p class="show-year">${esc([game.year, game.genre].filter(Boolean).join(' · '))}</p>
                ${typeof window.renderAdvancedInfo === 'function' ? window.renderAdvancedInfo(game) : ''}
                ${typeof window.renderRatingBars === 'function' ? window.renderRatingBars(game, { compact: true }) : ''}
            </div>
            <div class="show-actions">
                <button class="toggleWatchedBtn btn-notch" type="button" data-action="toggle" data-show-id="${game.id}">
                    <span class="btn-notch__inner">${esc(getWatchedLabel(game))}</span>
                </button>
            </div>
        </div>
    `;

    if (typeof window.applyAdvancedCardStyles === 'function') {
        window.applyAdvancedCardStyles(card, game);
    }
    return card;
}

function renderEmptyState(hasGames) {
    if (hasGames) {
        emptyState.hidden = true;
        return;
    }

    emptyState.hidden = false;
    emptyState.innerHTML = myWatchlist.length === 0
        ? `<div class="empty__art">🕹️</div>
           <h2 class="empty__title">Your vault is empty</h2>
           <p class="empty__text">Add your first game and start rating it your way.</p>
           <button class="submitBtn btn-notch" type="button" data-empty-action="add"><span class="btn-notch__inner">Add a game</span></button>`
        : `<div class="empty__art">🔍</div>
           <h2 class="empty__title">No games match</h2>
           <p class="empty__text">Try a different search or clear the active filters.</p>
           <button class="submitBtn btn-notch" type="button" data-empty-action="clear"><span class="btn-notch__inner">Clear filters</span></button>`;
}

emptyState.addEventListener('click', (event) => {
    const action = event.target.closest('[data-empty-action]')?.dataset.emptyAction;
    if (action === 'add') openAddModal();
    if (action === 'clear') window.clearAllFilters?.();
});

function renderShows() {
    const filteredList =
        typeof window.getFilteredList === 'function'
            ? window.getFilteredList(myWatchlist)
            : myWatchlist;

    const orderedList =
        typeof window.getRenderOrder === 'function'
            ? window.getRenderOrder(filteredList)
            : filteredList;

    // One fragment, one reflow — appending each card straight to the live
    // container would lay out the whole grid once per game.
    const fragment = document.createDocumentFragment();

    // Unrated games get their own section below the rest, so there's an
    // obvious "do this next" pile — it collapses back into the main grid
    // the moment a game picks up its first rating.
    const unreviewed = orderedList.filter(isUnreviewed);
    const reviewed = orderedList.filter((game) => !isUnreviewed(game));

    function sectionLabel(text) {
        const label = document.createElement('p');
        label.className = 'shows__section-label';
        label.textContent = text;
        return label;
    }

    reviewed.forEach((game) => fragment.appendChild(buildCard(game)));
    if (unreviewed.length) {
        fragment.appendChild(sectionLabel(`Not yet reviewed (${unreviewed.length})`));
        unreviewed.forEach((game) => fragment.appendChild(buildCard(game)));
    }

    showsContainer.replaceChildren(fragment);
    renderEmptyState(orderedList.length > 0);

    if (resultCount) {
        const total = myWatchlist.length;
        resultCount.textContent = orderedList.length === total
            ? `${total} game${total === 1 ? '' : 's'}`
            : `${orderedList.length} of ${total}`;
    }

    if (typeof window.onCardsRendered === 'function') window.onCardsRendered();
}

// ============================================
// CORE EVENTS
// ============================================
form.addEventListener('submit', (event) => {
    event.preventDefault();

    const game = addGameToWatchlist(getFormData());

    addGameDialog.close();
    renderShows();
    window.toast(`Added “${game.title}”`);
});

addBtn.addEventListener('click', () => openAddModal());

// ============================================
// BULK ADD
// Paste a list of titles, one per line. Each is looked up on IGDB one at
// a time — awaited in sequence rather than fired in parallel, to stay
// under IGDB's rate limit — and added with whatever data was found, or
// just the bare title if nothing matched. Anything already in the
// library (by title) is skipped rather than duplicated.
// ============================================
(function () {
    const bulkDialog = window.createDialog({
        className: 'sel-paste-modal',
        html: `
            <h2>Add multiple games</h2>
            <div class="formEntry">
                <label for="bulkAddText">One game title per line — looked up on IGDB automatically</label>
                <textarea id="bulkAddText" rows="10" placeholder="Deltarune&#10;Outer Wilds&#10;Persona 5 Royal"></textarea>
            </div>
            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch" id="bulkAddGoBtn"><span class="btn-notch__inner">Add games</span></button>
                <button type="button" class="cancelBtn btn-notch" id="bulkAddCancelBtn"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `
    });
    const bulkText = bulkDialog.el.querySelector('#bulkAddText');
    const bulkGoBtn = bulkDialog.el.querySelector('#bulkAddGoBtn');

    function alreadyInLibrary(title) {
        const clean = title.trim().toLowerCase();
        return myWatchlist.some((g) => g.title.trim().toLowerCase() === clean);
    }

    async function submitBulkAdd() {
        const titles = Array.from(new Set(
            bulkText.value.split('\n').map((line) => line.trim()).filter(Boolean)
        ));
        if (!titles.length) return;

        bulkGoBtn.disabled = true;
        const label = bulkGoBtn.querySelector('.btn-notch__inner');
        bulkDialog.close();

        let added = 0;
        let autofilled = 0;
        let skipped = 0;

        for (let i = 0; i < titles.length; i++) {
            const title = titles[i];
            label.textContent = `Adding ${i + 1}/${titles.length}…`;

            if (alreadyInLibrary(title)) {
                skipped++;
                continue;
            }

            const match = typeof window.lookupGameForBulk === 'function' ? await window.lookupGameForBulk(title) : null;
            addGameToWatchlist({
                title: match ? match.title : title,
                year: match ? match.year : '',
                advancedData: match ? {
                    description: match.description, genre: match.genre,
                    developer: match.developer, image: match.image, screenshot: match.screenshot
                } : undefined
            });
            if (match) autofilled++;
            added++;
        }

        renderShows();
        bulkGoBtn.disabled = false;
        label.textContent = 'Add games';
        bulkText.value = '';

        const parts = [`Added ${added} game${added === 1 ? '' : 's'}`];
        if (autofilled) parts.push(`${autofilled} autofilled from IGDB`);
        if (skipped) parts.push(`${skipped} already in your library`);
        window.toast(parts.join(' — '));
    }

    bulkDialog.el.addEventListener('click', (event) => {
        if (event.target.closest('#bulkAddGoBtn')) return submitBulkAdd();
        if (event.target.closest('#bulkAddCancelBtn')) return bulkDialog.close();
    });

    document.getElementById('bulkAddBtn')?.addEventListener('click', () => bulkDialog.open(bulkText));
})();

function openDetailFor(id) {
    const game = myWatchlist.find((item) => item.id === id);
    if (game && typeof window.openDetailModal === 'function') window.openDetailModal(game);
}

showsContainer.addEventListener('click', (event) => {
    const actionBtn = event.target.closest('[data-action]');

    if (actionBtn?.dataset.action === 'toggle') {
        toggleGameStatus(actionBtn.dataset.showId);
        renderShows();
        return;
    }

    if (actionBtn?.dataset.action === 'delete') {
        requestRemoveGame(actionBtn.dataset.showId);
        return;
    }

    if (actionBtn?.dataset.action === 'favorite') {
        const game = myWatchlist.find((item) => item.id === actionBtn.dataset.showId);
        if (game) {
            game.favorite = !game.favorite;
            saveWatchlist();
            renderShows();
        }
        return;
    }

    const card = event.target.closest('.show-frame');
    if (card) openDetailFor(card.dataset.showId);
});

// Cards are focusable, so they need to activate on Enter/Space too.
showsContainer.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest('.show-frame');
    if (!card || event.target !== card) return;
    event.preventDefault();
    openDetailFor(card.dataset.showId);
});

// A missing games key past this point (TEMPLATE_VAULT unavailable, or
// explicitly cleared) just means an empty library — emptyState already
// covers that.
loadWatchlist();

paintSwatchRow();
renderShows();

// Exposed so the wiki/ratings/ranking/detail/filter modules can persist and
// re-render after mutating a game object they received by reference.
window.saveWatchlist = saveWatchlist;
window.renderShows = renderShows;
window.getWatchlist = () => myWatchlist;

// ============================================
// AWARDS TRACKING
// Tracks which games are featured elsewhere (About me topics, tier
// placements, top list ranks) so the detail view's awards button knows
// whether to show itself. Each of those views registers a provider (see
// script-store.js), so this doesn't need to know about any of them.
// ============================================
(function () {
    let awarded = new Set();

    window.onVaultChange(() => {
        awarded = new Set(window.awardProviders.flatMap((p) => p.gameIds()));
    });

    window.gameHasAwards = (gameId) => awarded.has(gameId);
})();
