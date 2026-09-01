// ============================================
// MY TOP LISTS
// Pick a subject ("Best endings") and size it (up to 100) — every rank
// from 1 to that size exists as its own row from the start, empty ones
// just prompting "Choose a game". Clicking an empty rank or a filled
// one's cover opens the same single title search (same shape as Add a
// game); clicking elsewhere on a filled row opens the position/note
// editor. The "why it placed here" note lives right in the row, not
// just the editor. Entries are drag-reorderable. The list itself
// (naming, switching, add/rename/delete) is the shared collection
// widget from script-collections.js.
// ============================================
(function () {
    const root = document.getElementById('topsView');
    if (!root) return;

    const icon = window.icon;
    const esc = window.escapeHtml;
    const DEFAULT_SIZE = 10;
    const MAX_SIZE = 100;

    const clampSize = (n) => Math.max(1, Math.min(MAX_SIZE, Math.round(n) || DEFAULT_SIZE));
    const newList = (topic, size) => ({ id: window.uid(), topic, size: clampSize(size), entries: [] });

    // Entries have gone through a few shapes over time: a bare ref, a
    // { ref, note }, and a { refs: [...], note } tied slot — always
    // collapse down to one game per rank. Empty ranks are `null`.
    const normalizeEntry = (e) => {
        if (!e) return null;
        const ref = Array.isArray(e.refs) ? e.refs[0] : (e.ref || e);
        if (!ref) return null;
        return { ref, note: e.note || '', useReview: !!e.useReview };
    };

    // Every rank from 1..size is always a row — pad (or trim) the stored
    // array to match instead of only keeping whatever's filled.
    function padToSize(l) {
        l.entries.length = l.size;
        for (let i = 0; i < l.size; i++) l.entries[i] = l.entries[i] || null;
    }

    const stored = window.vaultStore.read(window.VAULT_KEYS.tops, null);
    const lists = (Array.isArray(stored) && stored.length ? stored : [newList('My top games', DEFAULT_SIZE)])
        .map((l) => {
            const list = {
                ...l,
                entries: (l.entries || []).map(normalizeEntry),
                // Older lists have no size — give them room for what they hold.
                size: clampSize(l.size || Math.max(DEFAULT_SIZE, (l.entries || []).filter(Boolean).length))
            };
            padToSize(list);
            return list;
        });

    const collection = window.createCollection({
        storageKey: window.VAULT_KEYS.tops,
        ns: 'top',
        icon: 'list',
        labelKey: 'topic',
        nouns: { item: 'top list', newTitle: 'New top list', placeholder: 'e.g. Best endings' },
        items: lists,
        create: (topic) => newList(topic, DEFAULT_SIZE),
        onChange: () => renderList()
    });

    const list = () => collection.current();
    const save = () => collection.save();

    root.innerHTML = `
        <header class="view-head">
            <div class="view-head__main">
                <h2 class="view-title">My top lists</h2>
                <p class="view-sub">Pick a subject, size it, then fill in the ranks.</p>
            </div>
            <div class="view-head__tools">
                ${window.collectionTools('top', { item: 'top list', newTitle: 'New top list' })}
                <button class="icon-btn" type="button" id="topResize" title="Set list size" aria-label="Set list size">${icon('list')}</button>
                <button class="icon-btn" type="button" id="topExportBtn" title="Save as image" aria-label="Save as image">${icon('download')}</button>
                <span class="top-count" id="topCount"></span>
            </div>
        </header>
        <div class="top-body" id="topBody"></div>
    `;

    const els = { body: root.querySelector('#topBody'), count: root.querySelector('#topCount') };

    const MEDALS = ['is-gold', 'is-silver', 'is-bronze'];

    // Ranks 1-3 get their medal color from the .is-gold/-silver/-bronze
    // classes; from #4 on there's no fixed palette to draw from, so the
    // title fades from a bright purple down to a darker one the further
    // down the list it sits (relative to how long the list actually is).
    function rankColor(index, size) {
        if (index < 3) return null;
        const span = Math.max(size - 3, 1);
        const t = Math.min((index - 3) / span, 1);
        // Used to fade down to 26% lightness at the bottom of a long
        // list — unreadably dark against the panel background. Floors at
        // 46% instead so even the last rank stays legible.
        const lightness = 68 - t * 22;
        return `hsl(271, 80%, ${lightness}%)`;
    }

    // Older refs (or ones added straight from a bare search result) were
    // never given a screenshot, so their row falls back to cover art —
    // fetch the missing ones live, the same way the detail modal's own
    // backdrop does, and cache by title so a game repeated across slots
    // or lists only costs one request.
    // The library's own review text for a ranked game, if it has one —
    // looked up live (not copied) so a slot marked "use my library
    // review" always reflects whatever the review currently says,
    // including edits made after this rank was set.
    function reviewFor(ref) {
        if (!ref.gameId) return '';
        const game = (window.getWatchlist?.() || []).find((g) => g.id === ref.gameId);
        return game?.review || '';
    }

    function noteFor(slot) {
        return slot.useReview ? reviewFor(slot.ref) : slot.note;
    }

    const backdropCache = new Map();
    function backdropFor(title) {
        if (!backdropCache.has(title)) {
            backdropCache.set(title, typeof window.fetchGameBackdrop === 'function'
                ? window.fetchGameBackdrop(title)
                : Promise.resolve(null));
        }
        return backdropCache.get(title);
    }

    async function hydrateScreenshots(entries) {
        const missing = new Map();
        entries.filter(Boolean).forEach((slot) => {
            const ref = slot.ref;
            if (!ref.screenshot && ref.title) {
                if (!missing.has(ref.title)) missing.set(ref.title, []);
                missing.get(ref.title).push(ref);
            }
        });
        if (!missing.size) return;

        let changed = false;
        await Promise.all([...missing].map(async ([title, refs]) => {
            const url = await backdropFor(title);
            if (url) {
                refs.forEach((ref) => { ref.screenshot = url; });
                changed = true;
            }
        }));
        if (changed && list()?.entries === entries) {
            save();
            renderList();
        }
    }

    function rowMarkup(slot, index) {
        if (!slot) return emptyRowMarkup(index);

        const ref = slot.ref;
        const color = rankColor(index, list().size);
        const meta = [ref.year, ref.developer].filter(Boolean).join(' · ');
        const note = noteFor(slot);

        return `
            <article class="top-row show-frame ${MEDALS[index] || ''}" draggable="true"
                data-index="${index}"
                style="${esc(`--bg-image:${window.cssUrl(ref.screenshot || ref.image)}${color ? `;--card-accent:${color}` : ''}`)}"
                role="button" tabindex="0" title="${esc(ref.title)}">
                <div class="top-row__bg"></div>
                <div class="top-row__cover" style="${esc(`--bg-image:${window.cssUrl(ref.image)}`)}"></div>
                <div class="cover-card__actions">
                    <button class="icon-btn icon-btn--sm" type="button" data-edit="${index}" title="Edit" aria-label="Edit this spot">${icon('pencil')}</button>
                    <button class="icon-btn icon-btn--sm" type="button" data-move="${index}" data-dir="-1"
                        title="Move up" aria-label="Move up"${index === 0 ? ' disabled' : ''}>${icon('chevron-down', { flip: true })}</button>
                    <button class="icon-btn icon-btn--sm" type="button" data-move="${index}" data-dir="1"
                        title="Move down" aria-label="Move down"${index === list().size - 1 ? ' disabled' : ''}>${icon('chevron-down')}</button>
                </div>
                <div class="top-row__body">
                    <p class="top-row__title">${esc(ref.title)}</p>
                    ${meta ? `<p class="top-row__meta">${esc(meta)}</p>` : ''}
                </div>
                ${note ? `<p class="top-row__note">“${esc(note)}”</p>` : ''}
                <span class="top-row__rank">${index + 1}</span>
            </article>
        `;
    }

    function emptyRowMarkup(index) {
        return `
            <article class="top-row top-row--empty" data-index="${index}" data-empty="${index}"
                role="button" tabindex="0" title="Choose a game for rank ${index + 1}">
                <button type="button" class="top-row__empty-fill">${icon('plus')} Choose a game</button>
                <span class="top-row__rank">${index + 1}</span>
            </article>
        `;
    }

    function renderList() {
        const l = list();
        const entries = l.entries;
        els.count.textContent = `${entries.filter(Boolean).length} / ${l.size}`;

        els.body.innerHTML = `<div class="top-rows">${entries.map(rowMarkup).join('')}</div>`;
        hydrateScreenshots(entries);
    }

    // ---- Jump to a specific game from a row's cover: into the library if
    // it's there, otherwise the add-game form pre-filled with its info. ----
    function goToGame(ref) {
        const game = ref.gameId ? (window.getWatchlist?.() || []).find((g) => g.id === ref.gameId) : null;
        window.showView?.('library');
        if (game) {
            window.openDetailModal?.(game);
        } else {
            window.openAddModalPrefilled?.({
                title: ref.title,
                year: ref.year,
                genre: ref.genre || (ref.genresList || [])[0] || '',
                description: ref.description,
                image: ref.image
            });
        }
    }

    // ---- Edit panel: position, note, and which games are tied here ----
    const modal = window.createDialog({
        className: 'ref-modal',
        html: `
            <button type="button" class="icon-btn ref-modal__close" data-dialog-close aria-label="Close">${icon('close')}</button>
            <div class="ref-modal__inner notch-inner">
                <div class="ref-modal__stage" id="topModalStage"></div>
                <div class="ref-modal__panel">
                    <div class="ref-modal__pager">
                        <button type="button" class="icon-btn icon-btn--sm" id="topModalPrev" aria-label="Previous entry">${icon('arrow-right', { flip: true })}</button>
                        <span class="ref-modal__eyebrow" id="topModalRank"></span>
                        <button type="button" class="icon-btn icon-btn--sm" id="topModalNext" aria-label="Next entry">${icon('arrow-right')}</button>
                    </div>
                    <p class="ref-modal__title" id="topModalName"></p>
                    <div class="formEntry">
                        <label for="topModalPos">Position</label>
                        <input type="number" id="topModalPos" min="1">
                    </div>
                    <div class="formEntry">
                        <label for="topModalNote">Why it placed here (optional)</label>
                        <textarea id="topModalNote" rows="3" placeholder="Say a bit more…"></textarea>
                        <button type="button" class="tag-chip" id="topModalUseReview">Use my library review instead</button>
                    </div>
                    <div class="ref-modal__row">
                        <button type="button" class="btn-notch cancelBtn" id="topModalChange"><span class="btn-notch__inner">${icon('plus')} Change game</span></button>
                    </div>
                    <div class="form-buttons">
                        <button type="button" class="submitBtn btn-notch" id="topModalSave"><span class="btn-notch__inner">Save</span></button>
                        <button type="button" class="cancelBtn btn-notch icon-btn--danger" id="topModalRemove"><span class="btn-notch__inner">${icon('trash')} Clear rank</span></button>
                    </div>
                </div>
            </div>
        `
    });

    const m = {
        stage: modal.el.querySelector('#topModalStage'),
        rank: modal.el.querySelector('#topModalRank'),
        name: modal.el.querySelector('#topModalName'),
        pos: modal.el.querySelector('#topModalPos'),
        note: modal.el.querySelector('#topModalNote'),
        useReview: modal.el.querySelector('#topModalUseReview'),
        change: modal.el.querySelector('#topModalChange')
    };
    let editingIndex = -1;
    // Same pattern as About me's alternative-title/subtitle link: the note
    // field gets taken over to preview the library review while "use my
    // review" is on, so what the user actually typed as a manual note
    // doesn't get lost if they switch back.
    let editingNote = '';
    let editingUseReview = false;

    window.attachTilt(m.stage, { selector: '.ref-modal__cover' });

    function syncNoteLink() {
        const slot = list().entries[editingIndex];
        if (!slot) return;
        const review = reviewFor(slot.ref);
        m.note.value = editingUseReview ? review : editingNote;
        m.note.disabled = editingUseReview;
        m.note.placeholder = editingUseReview ? 'No review written yet — open the game in your library to add one.' : 'Say a bit more…';
        m.useReview.classList.toggle('is-active', editingUseReview);
        m.useReview.disabled = !slot.ref.gameId;
        m.useReview.hidden = !slot.ref.gameId;
    }

    function refreshModal() {
        const slot = list().entries[editingIndex];
        if (!slot) return;
        m.stage.innerHTML = `<div class="cover-card ref-modal__cover" style="${esc(`--bg-image:${window.cssUrl(slot.ref.image)}`)}" title="${esc(slot.ref.title)}"></div>`;
        m.rank.textContent = `#${editingIndex + 1} of ${list().size} · ${list().topic}`;
        m.name.textContent = slot.ref.title;
        m.pos.max = list().size;
        m.pos.value = editingIndex + 1;
        editingNote = slot.note;
        editingUseReview = slot.useReview;
        syncNoteLink();
    }

    m.useReview.addEventListener('click', () => {
        editingUseReview = !editingUseReview;
        syncNoteLink();
    });

    m.note.addEventListener('input', () => {
        if (!m.note.disabled) editingNote = m.note.value;
    });

    function openEntry(index) {
        if (!list().entries[index]) return;
        editingIndex = index;
        refreshModal();
        modal.open(m.pos);
    }

    // Browse the rest of the (filled) ranking without closing and
    // reopening — empty ranks aren't worth paging through here.
    function page(step) {
        const entries = list().entries;
        const filledCount = entries.filter(Boolean).length;
        if (filledCount < 2) return;
        let next = editingIndex;
        do {
            next = (next + step + entries.length) % entries.length;
        } while (!entries[next]);
        openEntry(next);
    }

    modal.el.querySelector('#topModalPrev').addEventListener('click', () => page(-1));
    modal.el.querySelector('#topModalNext').addEventListener('click', () => page(1));
    modal.el.addEventListener('keydown', (event) => {
        if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return; // don't hijack arrow keys while editing a field
        if (event.key === 'ArrowLeft') page(-1);
        if (event.key === 'ArrowRight') page(1);
    });

    m.change.addEventListener('click', () => openPicker(editingIndex));

    modal.el.querySelector('#topModalSave').addEventListener('click', () => {
        const entries = list().entries;
        const slot = entries[editingIndex];
        if (!slot) return modal.close();

        // editingNote, not the field's current value — while "use my
        // review" is on the field is just previewing the review text, not
        // something the user typed.
        slot.note = editingNote.trim();
        slot.useReview = editingUseReview;
        const to = Math.max(0, Math.min(entries.length - 1, (parseInt(m.pos.value, 10) || 1) - 1));
        if (to !== editingIndex) [entries[to], entries[editingIndex]] = [entries[editingIndex], entries[to]];

        save();
        renderList();
        modal.close();
    });

    modal.el.querySelector('#topModalRemove').addEventListener('click', () => {
        list().entries[editingIndex] = null;
        save();
        renderList();
        modal.close();
    });

    // ---- Picking a game for an empty rank: one title search with
    // suggestions (library first, then IGDB), same shape as Add a game's
    // own autocomplete — not the multi-select checklist used for ties. ----
    const pickDialog = window.createDialog({
        html: `
            <h2>Choose a game</h2>
            <div class="formEntry">
                <label for="topPickSearch">Title</label>
                <div class="input-suggest-wrap">
                    <input type="text" id="topPickSearch" autocomplete="off" placeholder="Search your library or IGDB…">
                    <div class="tag-suggest" id="topPickSuggest" hidden></div>
                </div>
            </div>
            <div class="form-buttons">
                <button type="button" class="cancelBtn btn-notch" id="topPickCancel"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => { pickIndex = -1; }
    });

    const pick = {
        search: pickDialog.el.querySelector('#topPickSearch'),
        suggest: pickDialog.el.querySelector('#topPickSuggest'),
        cancel: pickDialog.el.querySelector('#topPickCancel')
    };
    let pickIndex = -1;

    const picker = window.pickGameSingle({
        inputEl: pick.search,
        resultsEl: pick.suggest,
        onPick: (ref) => {
            if (pickIndex === -1) return;
            const existingNote = list().entries[pickIndex]?.note || '';
            list().entries[pickIndex] = { ref, note: existingNote, useReview: false };
            save();
            renderList();
            if (pickIndex === editingIndex) refreshModal();
            pickDialog.close();
        }
    });

    function openPicker(index) {
        pickIndex = index;
        pick.search.value = '';
        picker.reset();
        pickDialog.open(pick.search);
    }

    pick.cancel.addEventListener('click', () => pickDialog.close());

    async function changeSize() {
        const value = await window.promptDialog({ title: 'List size', value: String(list().size), placeholder: `Up to ${MAX_SIZE}` });
        if (value == null) return;
        const size = clampSize(parseInt(value, 10));
        const l = list();
        const droppedFilled = l.entries.slice(size).filter(Boolean).length;
        l.size = size;
        padToSize(l);
        if (droppedFilled) window.toast(`Trimmed to the new size of ${size} — ${droppedFilled} filled rank${droppedFilled === 1 ? '' : 's'} dropped`);
        save();
        renderList();
    }

    // ---- Export as image: the real row markup for filled ranks only,
    // capped at the top 10, laid out off-screen. ----
    async function exportImage() {
        const filled = list().entries
            .map((slot, index) => ({ slot, index }))
            .filter((x) => x.slot)
            .slice(0, 10);
        if (!filled.length) return window.toast('Nothing to export yet — fill in a rank first');
        if (list().entries.filter(Boolean).length > 10) window.toast('Exporting the top 10 — the rest stay in the app');

        const rowsEl = document.createElement('div');
        rowsEl.className = 'top-rows';
        rowsEl.innerHTML = filled.map((x) => rowMarkup(x.slot, x.index)).join('');

        await window.exportNodeAsPoster({
            innerNode: rowsEl,
            width: 900,
            title: list().topic || 'Top list',
            subtitle: `Game Vault · Top ${filled.length}`,
            filename: `${list().topic || 'top-list'}.png`
        });
    }

    // ---- Events ----
    root.addEventListener('click', (event) => {
        if (event.target.closest('#topResize')) return changeSize();
        if (event.target.closest('#topExportBtn')) return exportImage();

        const moveBtn = event.target.closest('[data-move]');
        if (moveBtn) {
            const from = Number(moveBtn.dataset.move);
            const to = from + Number(moveBtn.dataset.dir);
            const entries = list().entries;
            if (to < 0 || to >= entries.length) return;
            [entries[from], entries[to]] = [entries[to], entries[from]];
            save();
            return renderList();
        }

        const editBtn = event.target.closest('[data-edit]');
        if (editBtn) return openEntry(Number(editBtn.dataset.edit));

        const coverEl = event.target.closest('.top-row__cover');
        if (coverEl) {
            const row = coverEl.closest('.top-row');
            const slot = list().entries[Number(row.dataset.index)];
            if (slot) goToGame(slot.ref);
            return;
        }

        const emptyRow = event.target.closest('[data-empty]');
        if (emptyRow) return openPicker(Number(emptyRow.dataset.empty));

        const row = event.target.closest('.top-row');
        if (row) openEntry(Number(row.dataset.index));
    });

    root.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const card = event.target.closest('.top-row');
        if (!card || event.target !== card) return;
        event.preventDefault();
        if (card.dataset.empty !== undefined) openPicker(Number(card.dataset.empty));
        else openEntry(Number(card.dataset.index));
    });

    // ---- Drag to reorder ----
    const resetTilt = window.attachTilt(els.body, { selector: '.top-row__cover' });
    let dragIndex = null;

    els.body.addEventListener('dragstart', (event) => {
        const card = event.target.closest('.top-row');
        if (!card) return;
        // A tilted card would drag as a rotated ghost image.
        resetTilt();
        dragIndex = Number(card.dataset.index);
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(dragIndex));
        card.classList.add('is-dragging');
    });

    els.body.addEventListener('dragend', (event) => {
        event.target.closest('.top-row')?.classList.remove('is-dragging');
        els.body.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
    });

    els.body.addEventListener('dragover', (event) => {
        const card = event.target.closest('.top-row');
        if (!card) return;
        event.preventDefault();
        els.body.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
        card.classList.add('is-over');
    });

    els.body.addEventListener('drop', (event) => {
        const card = event.target.closest('.top-row');
        if (!card || dragIndex === null) return;
        event.preventDefault();
        const entries = list().entries;
        const to = Number(card.dataset.index);
        [entries[dragIndex], entries[to]] = [entries[to], entries[dragIndex]];
        dragIndex = null;
        save();
        renderList();
    });

    window.registerAwardProvider({
        view: 'tops',
        label: 'Top lists',
        gameIds: () => lists.flatMap((l) => l.entries.filter(Boolean).map((slot) => slot.ref.gameId)).filter(Boolean),
        findFor: (gameId) => lists.flatMap((l) => {
            const rank = l.entries.findIndex((slot) => slot && slot.ref.gameId === gameId);
            return rank === -1 ? [] : [{ id: l.id, rank: rank + 1, text: l.topic }];
        }),
        focus: (id) => collection.switchTo(id)
    });

    window.refreshTopsView = () => collection.render();
    collection.render();
})();
