// ============================================
// ABOUT ME
// A wall of prompt cards ("Favorite game of all time", "Favorite
// villain"…), each holding one game with its own subtitle and
// description. Clicking a card opens a panel with the cover big beside
// everything editable. The board itself (naming, switching,
// add/rename/delete) is the shared collection widget.
// ============================================
(function () {
    const root = document.getElementById('aboutView');
    if (!root) return;

    const icon = window.icon;
    const esc = window.escapeHtml;
    const MAX_CARDS = 27;

    // Row-major, 6 columns x 3 rows — the printable "about you" template.
    const TEMPLATE = [
        'Favorite Game of all Time', 'Favorite Series', 'Best Soundtrack', 'Favorite Protagonist', 'Favorite Villain', 'Best Story',
        'Have not played but want to', 'You Love Everyone Hates', 'You Hate Everyone Loves', 'Best Art Style', 'Favorite Ending', 'Favorite Boss Fight',
        'Childhood Game', 'Relaxing Game', 'Stressful Game', 'Game you always come back to', 'Guilty Pleasure', 'Tons of Hours Played'
    ];

    const newCard = (prompt) => ({ id: window.uid(), prompt, entry: null });
    const newBoard = (name, useTemplate) => ({
        id: window.uid(), name, cards: (useTemplate ? TEMPLATE : []).map(newCard)
    });

    // Accepts every shape this key has held: a flat card array, a `refs`
    // array, a bare `ref`, an `entries` array, or the current single
    // `entry` object — always collapses down to the one game a card now
    // holds.
    function normalizeCard(c) {
        let entry = null;
        if (c.entry && c.entry.ref) {
            entry = {
                ref: c.entry.ref, subtitle: c.entry.subtitle || '', description: c.entry.description || '',
                color: c.entry.color || '', customTitle: c.entry.customTitle || ''
            };
        } else if (Array.isArray(c.entries) && c.entries.length) {
            const e = c.entries[0];
            entry = e && e.ref
                ? { ref: e.ref, subtitle: e.subtitle || '', description: e.description || '', color: e.color || '', customTitle: e.customTitle || '' }
                : { ref: e, subtitle: '', description: '', color: '', customTitle: '' };
        } else if (Array.isArray(c.refs) && c.refs.length) {
            entry = { ref: c.refs[0], subtitle: c.subtitle || '', description: c.description || '', color: c.color || '', customTitle: '' };
        } else if (c.ref) {
            entry = { ref: c.ref, subtitle: c.subtitle || '', description: c.description || '', color: c.color || '', customTitle: '' };
        }
        return { id: c.id || window.uid(), prompt: c.prompt || '', entry };
    }

    const stored = window.vaultStore.read(window.VAULT_KEYS.about, null);
    const boards = !Array.isArray(stored) || !stored.length
        ? [newBoard('About me', true)]
        : ('cards' in stored[0]
            ? stored.map((b) => ({ ...b, cards: (b.cards || []).map(normalizeCard) }))
            : [{ id: window.uid(), name: 'About me', cards: stored.map(normalizeCard) }]);

    const collection = window.createCollection({
        storageKey: window.VAULT_KEYS.about,
        ns: 'about',
        icon: 'user',
        labelKey: 'name',
        nouns: { item: 'board', newTitle: 'New board', placeholder: 'e.g. My anime tastes' },
        items: boards,
        create: async (name) => newBoard(name, await window.confirmDialog({
            title: 'Start from the template?',
            message: 'Fill the board with the 18 starter topics, or start blank.',
            confirmLabel: 'Use template'
        })),
        onChange: () => render()
    });

    const board = () => collection.current();
    const save = () => collection.save();

    root.innerHTML = `
        <header class="view-head">
            <div class="view-head__main">
                <h2 class="view-title">About me</h2>
                <p class="view-sub">Your taste, one card at a time.</p>
            </div>
            <div class="view-head__tools">
                ${window.collectionTools('about', { item: 'board', newTitle: 'New board' })}
                <button class="icon-btn" type="button" id="aboutExportBtn" title="Save as image" aria-label="Save as image">${icon('download')}</button>
                <button class="btn-notch submitBtn" type="button" id="aboutAdd"><span class="btn-notch__inner">${icon('plus')} New card</span></button>
            </div>
        </header>
        <div class="about-grid" id="aboutGrid"></div>
    `;

    const grid = root.querySelector('#aboutGrid');
    window.attachTilt(grid, { selector: '.show-frame' });

    // ---- Card panel ----
    const modal = window.createDialog({
        className: 'ref-modal',
        html: `
            <div class="ref-modal__icon-row">
                <button type="button" class="detail-color-swatch" id="aboutModalColorSwatch" aria-label="Title color" title="Title color"></button>
                <button type="button" class="icon-btn" data-dialog-close aria-label="Close">${icon('close')}</button>
            </div>
            <div class="popover" id="aboutModalColorPopup" hidden>
                <div class="swatch-row" id="aboutModalColorRow"></div>
            </div>
            <div class="ref-modal__inner notch-inner">
                <div class="ref-modal__stage">
                    <div class="cover-card ref-modal__cover" id="aboutModalCover">
                        <span class="cover-card__empty" id="aboutModalNoImg">${icon('plus')}<span>No game chosen yet</span></span>
                    </div>
                </div>
                <div class="ref-modal__panel">
                    <input type="text" class="ref-modal__title" id="aboutModalName" placeholder="No game chosen yet" aria-label="Game title">
                    <div class="formEntry">
                        <label for="aboutModalPrompt">Topic</label>
                        <input type="text" id="aboutModalPrompt" placeholder="e.g. Best plot twist">
                    </div>
                    <div class="formEntry">
                        <label for="aboutModalSubtitle">Subtitle for this game (optional)</label>
                        <input type="text" id="aboutModalSubtitle" placeholder="e.g. a character name">
                    </div>
                    <div class="formEntry">
                        <label for="aboutModalDesc">Description for this game (optional)</label>
                        <textarea id="aboutModalDesc" rows="4" placeholder="Say a bit more…"></textarea>
                    </div>
                    <div class="ref-modal__row">
                        <button type="button" class="btn-notch cancelBtn" id="aboutModalChange"><span class="btn-notch__inner">${icon('plus')} Change game</span></button>
                        <button type="button" class="btn-notch cancelBtn" id="aboutModalLibrary" hidden><span class="btn-notch__inner">View in library</span></button>
                    </div>
                    <div class="form-buttons">
                        <button type="button" class="submitBtn btn-notch" id="aboutModalSave"><span class="btn-notch__inner">Save</span></button>
                        <button type="button" class="cancelBtn btn-notch icon-btn--danger" id="aboutModalDelete"><span class="btn-notch__inner">${icon('trash')} Delete card</span></button>
                    </div>
                </div>
            </div>
        `
    });

    const m = {};
    ['Cover', 'NoImg', 'Name', 'Prompt', 'Subtitle', 'ColorSwatch', 'ColorPopup', 'ColorRow', 'Desc', 'Change', 'Library', 'Save', 'Delete'].forEach((k) => {
        m[k.toLowerCase()] = modal.el.querySelector(`#aboutModal${k}`);
    });

    let editing = null;
    let editingColor = '';
    // The subtitle field gets taken over to preview the real game name
    // whenever an alternative title is active (see syncTitleLink) — this
    // is where the user's actual typed subtitle lives while that's
    // happening, so it doesn't get clobbered or lost when they clear the
    // alternative title back out.
    let editingSubtitle = '';
    window.attachTilt(m.cover, { perspective: 700, scale: 1.03 });

    // Same pattern as the library detail view's own card-color picker: a
    // small square button showing the current color that opens a popover
    // with the full swatch grid, instead of the grid sitting inline in
    // the form all the time.
    function paintColorRow() {
        const active = window.activeSwatchColor(editingColor);
        m.colorrow.innerHTML = window.renderSwatchRow(editingColor);
        m.colorswatch.style.setProperty('--swatch', active || 'var(--accent)');
        m.colorswatch.disabled = !editing?.entry;
        m.name.style.color = active || '';
    }

    // Default is title = the game, subtitle = whatever the user typed
    // (e.g. a character name). Typing an alternative title flips that:
    // the title becomes that text (e.g. the character) and the subtitle
    // field turns into a read-only preview of the game's real name — so
    // "Kris" as the title with "Deltarune" underneath needs only the one
    // field, not two.
    function syncTitleLink() {
        if (!editing?.entry) return;
        const title = m.name.value.trim();
        const altActive = !!title && title !== editing.entry.ref.title;
        m.subtitle.value = altActive ? editing.entry.ref.title : editingSubtitle;
        m.subtitle.disabled = altActive;
        m.subtitle.placeholder = altActive ? '' : 'e.g. a character name';
    }

    m.name.addEventListener('input', syncTitleLink);
    m.subtitle.addEventListener('input', () => {
        if (!m.subtitle.disabled) editingSubtitle = m.subtitle.value;
    });

    function refreshModal() {
        const card = editing;
        const entry = card.entry;

        m.colorpopup.hidden = true;
        m.cover.style.setProperty('--bg-image', entry ? window.cssUrl(entry.ref.image) : 'none');
        m.noimg.hidden = !!entry;
        m.name.value = entry ? (entry.customTitle || entry.ref.title) : '';
        m.name.disabled = !entry;
        m.library.hidden = !entry?.ref.gameId;
        m.prompt.value = card.prompt;
        editingSubtitle = entry?.subtitle || '';
        m.desc.value = entry?.description || '';
        m.subtitle.disabled = m.desc.disabled = !entry;
        syncTitleLink();
        editingColor = entry?.color || '';
        paintColorRow();
    }

    m.colorswatch.addEventListener('click', (event) => {
        event.stopPropagation();
        if (!editing?.entry) return;
        m.colorpopup.hidden = !m.colorpopup.hidden;
    });

    m.colorrow.addEventListener('click', (event) => {
        const swatch = event.target.closest('.swatch');
        if (!swatch || !editing?.entry) return;
        // Stopped here for the same reason as the detail view's picker:
        // re-rendering the row detaches the clicked button before the
        // document-level "click outside" listener runs, which would
        // otherwise see it as outside the popover and close it every pick.
        event.stopPropagation();
        editingColor = window.toggleSwatchSelection(editingColor, swatch.dataset.color);
        paintColorRow();
    });

    document.addEventListener('click', (event) => {
        if (!m.colorpopup.hidden && !m.colorpopup.contains(event.target) && event.target !== m.colorswatch) {
            m.colorpopup.hidden = true;
        }
    });

    function openCard(card) {
        editing = card;
        refreshModal();
        modal.open(m.prompt);
    }

    m.save.addEventListener('click', () => {
        const prompt = m.prompt.value.trim();
        if (prompt) editing.prompt = prompt;
        if (editing.entry) {
            // A blank title just falls back to the game's real name — typing
            // here only relabels this card, it's independent of "Change
            // game" below, which is what actually swaps the referenced game.
            const title = m.name.value.trim();
            editing.entry.customTitle = title && title !== editing.entry.ref.title ? title : '';
            // editingSubtitle, not the field's current value — while an
            // alternative title is active the field is just previewing the
            // game's name, not something the user typed.
            editing.entry.subtitle = editingSubtitle.trim();
            editing.entry.description = m.desc.value.trim();
            editing.entry.color = editingColor;
        }
        save();
        render();
        modal.close();
    });

    m.change.addEventListener('click', () => openPicker(editing));

    m.library.addEventListener('click', () => {
        const game = (window.getWatchlist?.() || []).find((g) => g.id === editing.entry?.ref.gameId);
        if (!game) return;
        modal.close();
        window.openDetailModal?.(game);
    });

    m.delete.addEventListener('click', async () => {
        const removed = await requestRemoveCard(editing.id);
        if (removed) modal.close();
    });

    // ---- Picking a game: one title search with suggestions (library
    // first, then IGDB) — same shape as Add a game's own autocomplete. ----
    const pickDialog = window.createDialog({
        html: `
            <h2>Choose a game</h2>
            <div class="formEntry">
                <label for="aboutPickSearch">Title</label>
                <div class="input-suggest-wrap">
                    <input type="text" id="aboutPickSearch" autocomplete="off" placeholder="Search your library or IGDB…">
                    <div class="tag-suggest" id="aboutPickSuggest" hidden></div>
                </div>
            </div>
            <div class="form-buttons">
                <button type="button" class="cancelBtn btn-notch" id="aboutPickCancel"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => { pickCard = null; }
    });

    const pick = {
        search: pickDialog.el.querySelector('#aboutPickSearch'),
        suggest: pickDialog.el.querySelector('#aboutPickSuggest'),
        cancel: pickDialog.el.querySelector('#aboutPickCancel')
    };
    let pickCard = null;

    const picker = window.pickGameSingle({
        inputEl: pick.search,
        resultsEl: pick.suggest,
        onPick: (ref) => {
            if (!pickCard) return;
            // Keep the subtitle/description/color/custom title already set if
            // picking the same game right back.
            pickCard.entry = pickCard.entry && window.refKey(pickCard.entry.ref) === window.refKey(ref)
                ? pickCard.entry
                : { ref, subtitle: '', description: '', color: '', customTitle: '' };
            save();
            render();
            if (editing === pickCard) refreshModal();
            pickDialog.close();
        }
    });

    function openPicker(card) {
        pickCard = card;
        pick.search.value = '';
        picker.reset();
        pickDialog.open(pick.search);
    }

    pick.cancel.addEventListener('click', () => pickDialog.close());

    // ---- Rendering ----
    function cellMarkup(card) {
        const { entry } = card;
        const stage = entry ? `<div class="cover-slice" style="${esc(`--bg-image:${window.cssUrl(entry.ref.image)}`)}"></div>` : '';
        const titleColor = entry ? window.activeSwatchColor(entry.color) : '';
        const title = entry ? (entry.customTitle || entry.ref.title) : '';
        // An alternative title bumps the game's real name down into the
        // subtitle slot — that's the whole point of setting one (e.g.
        // title "Kris", subtitle "Deltarune") — otherwise it's just
        // whatever the user typed as the subtitle.
        const subtitle = entry ? (entry.customTitle ? entry.ref.title : entry.subtitle) : '';
        const body = entry
            ? `<div class="cover-card__foot">
                <p class="cover-card__name"${titleColor ? ` style="${esc(`color:${titleColor}`)}"` : ''}>${esc(title)}</p>
                ${subtitle ? `<p class="cover-card__sub">${esc(subtitle)}</p>` : ''}
                ${entry.description ? `<p class="cover-card__note">${esc(entry.description)}</p>` : ''}
            </div>`
            : `<div class="cover-card__empty">${icon('plus')}<span>Choose a game</span></div>`;

        return `
            <div class="about-cell" data-cell="${card.id}">
                <p class="about-cell__label" title="${esc(card.prompt)}" draggable="true">
                    <span class="about-cell__label-text">${esc(card.prompt)}</span>
                    <button type="button" class="about-cell__label-edit" data-topic-edit="${card.id}"
                        title="Edit topic" aria-label="Edit topic “${esc(card.prompt)}”">${icon('pencil')}</button>
                </p>
                <div class="cover-card about-card show-frame" data-card="${card.id}"
                    role="button" tabindex="0" title="${esc(card.prompt)}">
                    <div class="cover-card__actions">
                        <button type="button" class="icon-btn icon-btn--sm icon-btn--danger" data-remove="${card.id}"
                            title="Remove card" aria-label="Remove card">${icon('trash')}</button>
                    </div>
                    ${stage}
                    ${body}
                </div>
            </div>
        `;
    }

    // Shrinks an element's font-size until it stops overflowing its
    // container. Re-measures from the CSS base size each time since the
    // fit depends on the element's own text.
    function shrinkToFit(el, min = 6) {
        let size = parseFloat(getComputedStyle(el).fontSize);
        while (el.scrollWidth > el.clientWidth + 1 && size > min) {
            size -= 0.5;
            el.style.fontSize = `${size}px`;
        }
    }

    // Shrinks a single-line label's font-size until it stops overflowing
    // its chip instead of wrapping — keeps every card's cover the same
    // height so the grid stays aligned.
    function fitLabel(el) {
        el.style.fontSize = '';
        // Lower floor than the shared default — narrow mobile cells (see
        // the about-grid mobile media query) leave long topics like
        // "Favorite Game of all Time" still clipped at 6px otherwise.
        shrinkToFit(el, 4.5);
    }

    function fitLabels() {
        // Shrinks the text span, not the whole label — the edit pencil next
        // to it is a fixed-size icon and shouldn't shrink along with it.
        grid.querySelectorAll('.about-cell__label-text').forEach(fitLabel);
    }

    // Game titles never get cut: a multi-word title just wraps (CSS
    // handles that on its own), but a single word has no space to wrap
    // at, so it'd otherwise spill past the card — shrink it instead, the
    // same way fitLabel does. Forcing nowrap while measuring matters: with
    // the CSS overflow-wrap:anywhere fallback left in place, the browser
    // would break the word onto a second line on its own, and scrollWidth
    // would then never exceed clientWidth — so the shrink loop below
    // would never fire at all.
    function fitTitle(el) {
        const singleWord = !/\s/.test(el.textContent.trim());
        el.style.fontSize = '';
        el.style.whiteSpace = singleWord ? 'nowrap' : '';
        if (!singleWord) return;

        shrinkToFit(el);
        // Still too wide even at the smallest readable size — last resort
        // is letting it break rather than spill past the card's edge.
        if (el.scrollWidth > el.clientWidth + 1) el.style.whiteSpace = '';
    }

    function fitTitles() {
        grid.querySelectorAll('.cover-card__name').forEach(fitTitle);
    }

    function render() {
        grid.innerHTML = board().cards.length
            ? board().cards.map(cellMarkup).join('')
            : '<p class="field-hint">No cards yet — add one to get started.</p>';
        fitLabels();
        fitTitles();
    }

    // The grid's columns resize with the viewport, so a label/title that
    // fit at one width may need re-shrinking (or can grow back) at another.
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            fitLabels();
            fitTitles();
        }, 150);
    });

    // Renaming a topic straight from the grid — hover the topic strip to
    // reveal the pencil — is the same promptDialog pattern as renaming a
    // collection, just without opening the full card panel for a one-line
    // edit.
    async function editTopic(cardId) {
        const card = board().cards.find((c) => c.id === cardId);
        if (!card) return;
        const next = await window.promptDialog({ title: 'Edit topic', value: card.prompt, placeholder: 'e.g. Best plot twist' });
        if (!next || next.trim() === card.prompt) return;
        card.prompt = next.trim();
        save();
        render();
    }

    // Shared by the grid's trash icon and the card panel's own delete
    // button — same confirm + undo affordance as removing a library game.
    // Resolves true if the card was actually removed (the caller uses
    // that to decide whether to also close the panel).
    async function requestRemoveCard(cardId) {
        const cards = board().cards;
        const index = cards.findIndex((c) => c.id === cardId);
        if (index === -1) return false;
        const card = cards[index];

        const ok = await window.confirmDialog({
            title: 'Remove this card?',
            message: `“${card.prompt}” will be gone.`,
            confirmLabel: 'Remove',
            danger: true
        });
        if (!ok) return false;

        cards.splice(index, 1);
        save();
        render();

        window.toast(`Removed “${card.prompt}”`, {
            actionLabel: 'Undo',
            onAction: () => {
                board().cards.splice(Math.min(index, board().cards.length), 0, card);
                save();
                render();
            }
        });
        return true;
    }

    // ---- Reordering: drag a card by its topic strip ----
    // Same indicator-bar pattern as the tier maker's drag reorder: a thin
    // bar tracks the pointer to the left/right half of the hovered card
    // and marks exactly where the drop will land, instead of just
    // highlighting whatever card is currently underneath the pointer.
    let draggedCardId = null;

    function dropIndicator() {
        let el = document.querySelector('.about-drop-indicator');
        if (!el) {
            el = document.createElement('div');
            el.className = 'about-drop-indicator';
            el.setAttribute('aria-hidden', 'true');
        }
        return el;
    }

    function removeDropIndicator() {
        document.querySelector('.about-drop-indicator')?.remove();
    }

    root.addEventListener('dragstart', (event) => {
        const label = event.target.closest('.about-cell__label');
        if (!label) return;
        draggedCardId = label.closest('.about-cell').dataset.cell;
        event.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag unless some data is set.
        event.dataTransfer.setData('text/plain', draggedCardId);
        label.classList.add('is-dragging');
    });

    root.addEventListener('dragend', (event) => {
        event.target.closest('.about-cell__label')?.classList.remove('is-dragging');
        removeDropIndicator();
        draggedCardId = null;
    });

    root.addEventListener('dragover', (event) => {
        const label = event.target.closest('.about-cell__label');
        if (!label || !draggedCardId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';

        const cell = label.closest('.about-cell');
        if (cell.dataset.cell === draggedCardId) return removeDropIndicator();

        // Anchored to the target card itself (absolute, at its left/right
        // edge) rather than inserted as a grid sibling — a lone indicator
        // landing alone in its own row (the common case at narrow, single-
        // column widths) would have nothing to size its height against.
        const rect = label.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        const indicator = dropIndicator();
        indicator.classList.toggle('is-before', before);
        indicator.classList.toggle('is-after', !before);
        cell.appendChild(indicator);
    });

    root.addEventListener('dragleave', (event) => {
        if (!event.target.closest('.about-grid') && !grid.contains(event.relatedTarget)) removeDropIndicator();
    });

    root.addEventListener('drop', (event) => {
        const label = event.target.closest('.about-cell__label');
        if (!label || !draggedCardId) return;
        event.preventDefault();

        const targetId = label.closest('.about-cell').dataset.cell;
        const cards = board().cards;
        const fromIndex = cards.findIndex((c) => c.id === draggedCardId);
        removeDropIndicator();
        if (fromIndex === -1 || targetId === draggedCardId) return;

        const [moved] = cards.splice(fromIndex, 1);
        let toIndex = cards.findIndex((c) => c.id === targetId);
        // Left half of the target card = land before it, right half =
        // after — the same convention the indicator above just showed.
        const rect = label.getBoundingClientRect();
        const before = event.clientX < rect.left + rect.width / 2;
        if (!before) toIndex += 1;

        cards.splice(Math.max(0, Math.min(toIndex, cards.length)), 0, moved);
        save();
        render();
    });

    async function addCard() {
        if (board().cards.length >= MAX_CARDS) return window.toast(`A board holds at most ${MAX_CARDS} cards`);
        const used = new Set(board().cards.map((c) => c.prompt));
        const prompt = await window.promptDialog({
            title: 'New card',
            value: TEMPLATE.find((p) => !used.has(p)) || '',
            placeholder: 'e.g. Best plot twist'
        });
        if (!prompt) return;
        const card = newCard(prompt);
        board().cards.push(card);
        save();
        render();
        openCard(card);
    }

    // ---- Export as image: the real card markup, laid out off-screen ----
    async function exportImage() {
        const filled = board().cards.filter((c) => c.entry);
        if (!filled.length) return window.toast('Nothing to export yet — add a game to a card first');

        const gridEl = document.createElement('div');
        gridEl.className = 'about-grid';
        gridEl.innerHTML = filled.map(cellMarkup).join('');

        await window.exportNodeAsPoster({
            innerNode: gridEl,
            width: 900,
            title: board().name || 'About me',
            subtitle: 'Game Vault · About me',
            filename: `${board().name || 'about-me'}.png`,
            // Same shrink-to-fit the live grid uses — this markup is built
            // fresh off-screen and never goes through render()/fitLabels().
            onMount: () => gridEl.querySelectorAll('.about-cell__label-text').forEach(fitLabel)
        });
    }

    // ---- Events ----
    root.addEventListener('click', (event) => {
        if (event.target.closest('#aboutAdd')) return addCard();
        if (event.target.closest('#aboutExportBtn')) return exportImage();

        const remove = event.target.closest('[data-remove]');
        if (remove) return requestRemoveCard(remove.dataset.remove);

        const topicEdit = event.target.closest('[data-topic-edit]');
        if (topicEdit) return editTopic(topicEdit.dataset.topicEdit);

        const cardEl = event.target.closest('.about-card');
        if (cardEl) {
            const card = board().cards.find((c) => c.id === cardEl.dataset.card);
            if (card) openCard(card);
        }
    });

    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const cardEl = event.target.closest('.about-card');
        if (!cardEl || event.target !== cardEl) return;
        event.preventDefault();
        const card = board().cards.find((c) => c.id === cardEl.dataset.card);
        if (card) openCard(card);
    });

    window.registerAwardProvider({
        view: 'about',
        label: 'About me',
        gameIds: () => boards.flatMap((b) => b.cards.map((c) => c.entry?.ref.gameId)).filter(Boolean),
        findFor: (gameId) => boards.flatMap((b) => b.cards
            .filter((c) => c.entry?.ref.gameId === gameId)
            .map((c) => ({ id: `${b.id}:${c.id}`, text: c.prompt }))),
        focus: (id) => {
            const [boardId, cardId] = id.split(':');
            collection.switchTo(boardId);
            requestAnimationFrame(() => {
                const el = grid.querySelector(`[data-cell="${cardId}"]`);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el?.classList.add('is-flash');
                setTimeout(() => el?.classList.remove('is-flash'), 1200);
            });
        }
    });

    window.refreshAboutView = () => collection.render();
    collection.render();
})();
