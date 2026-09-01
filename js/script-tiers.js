// ============================================
// TIER MAKER
// Custom S/A/B/C tier boards. The tray below the tiers is a deliberate
// "selection" you build via a search modal (by game name, genre, or
// console/platform) rather than your whole library dumped in — click
// "Create new selection" to search and check off games (library or IGDB),
// then drag them out of the tray into a tier.
// ============================================
(function () {
    const root = document.getElementById('tierView');
    if (!root) return;

    const TIER_COLORS = ['#a855f7', '#ef4444', '#f59e0b', '#fbbf24', '#22c55e', '#22d3ee', '#6366f1', '#ec4899', '#64748b'];
    const DEFAULT_TIERS = [
        ['S', '#a855f7'],
        ['A', '#ef4444'],
        ['B', '#f59e0b'],
        ['C', '#fbbf24'],
        ['D', '#22c55e']
    ];

    const icon = window.icon;
    const refKey = window.refKey;

    function newBoard(name) {
        return {
            id: window.uid(),
            name,
            tiers: DEFAULT_TIERS.map(([label, color]) => ({ id: window.uid(), label, color, items: [] })),
            extras: []
        };
    }

    const stored = window.vaultStore.read(window.VAULT_KEYS.tiers, null);
    const boards = Array.isArray(stored) && stored.length ? stored : [newBoard('My tier list')];

    // One-time migration: boards created before the S/A default swap kept
    // the old red-S/orange-A colors — nudge untouched ones to the new
    // defaults without touching tiers a user has since recolored.
    boards.forEach((b) => {
        const s = b.tiers?.find((t) => t.label === 'S');
        if (s && s.color === '#ef4444') s.color = '#a855f7';
        const a = b.tiers?.find((t) => t.label === 'A');
        if (a && a.color === '#f59e0b') a.color = '#ef4444';
    });

    const collection = window.createCollection({
        storageKey: window.VAULT_KEYS.tiers,
        ns: 'tier',
        icon: 'layers',
        labelKey: 'name',
        nouns: { item: 'tier list', newTitle: 'New tier list', placeholder: 'e.g. Best soundtracks' },
        items: boards,
        create: (name) => newBoard(name),
        onChange: () => renderBody()
    });

    const board = () => collection.current();
    const save = () => collection.save();

    root.innerHTML = `
        <header class="view-head">
            <div class="view-head__main">
                <h2 class="view-title">Tier maker</h2>
                <p class="view-sub">Drag games from the tray into a tier.</p>
            </div>
            <div class="view-head__tools">
                ${window.collectionTools('tier', { item: 'tier list', newTitle: 'New tier list' })}
                <button class="icon-btn" type="button" id="tierExportBtn" title="Save as image" aria-label="Save as image">${icon('download')}</button>
            </div>
        </header>

        <div class="tier-scroll" id="tierScroll">
            <div class="tier-board" id="tierBoard"></div>
        </div>

        <section class="tray">
            <div class="tray__bar">
                <button class="btn-notch cancelBtn" type="button" id="openSelectionBtn"><span class="btn-notch__inner" id="openSelectionLabel">Create new selection</span></button>
            </div>
            <div class="tray__items" id="tierTray" data-drop="tray"></div>
        </section>
    `;

    const els = {
        board: root.querySelector('#tierBoard'),
        tray: root.querySelector('#tierTray'),
        openSelectionLabel: root.querySelector('#openSelectionLabel')
    };

    // ---- Tier editor modal (name + color) ----
    const editorDialog = window.createDialog({
        className: 'confirm',
        html: `
            <h2 class="confirm__title">Edit tier</h2>
            <div class="formEntry">
                <label for="tierEditorName">Name</label>
                <input type="text" id="tierEditorName">
            </div>
            <div class="formEntry">
                <label>Color</label>
                <div class="swatch-row" id="tierEditorSwatches"></div>
            </div>
            <div class="form-buttons">
                <button type="button" class="submitBtn btn-notch" id="tierEditorSave"><span class="btn-notch__inner">Save</span></button>
                <button type="button" class="cancelBtn btn-notch" id="tierEditorCancel"><span class="btn-notch__inner">Cancel</span></button>
            </div>
        `,
        onClose: () => { editingTierId = null; }
    });
    const editorBox = editorDialog.el;

    const editorEls = {
        name: editorBox.querySelector('#tierEditorName'),
        swatches: editorBox.querySelector('#tierEditorSwatches'),
        save: editorBox.querySelector('#tierEditorSave'),
        cancel: editorBox.querySelector('#tierEditorCancel')
    };

    let editingTierId = null;
    let editingColor = null;

    function renderEditorSwatches() {
        editorEls.swatches.innerHTML = window.renderSwatchRow(editingColor, { colors: window.GAME_SWATCH_COLORS || TIER_COLORS, attr: 'tier-color' });
    }

    function openEditor(tier) {
        editingTierId = tier.id;
        editingColor = tier.color;
        editorEls.name.value = tier.label;
        renderEditorSwatches();
        editorDialog.open(editorEls.name);
        editorEls.name.select();
    }

    editorEls.swatches.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-tier-color]');
        if (!btn) return;
        editingColor = btn.dataset.tierColor;
        renderEditorSwatches();
    });

    function saveEditor() {
        const tier = board().tiers.find((t) => t.id === editingTierId);
        if (tier) {
            const label = editorEls.name.value.trim();
            if (label) tier.label = label;
            tier.color = editingColor;
            save();
            renderBoard();
        }
        editorDialog.close();
    }

    editorEls.save.addEventListener('click', saveEditor);
    editorEls.cancel.addEventListener('click', () => editorDialog.close());
    editorBox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && document.activeElement === editorEls.name) saveEditor();
    });

    // ---- Derived tray ----
    function placedKeys() {
        const keys = new Set();
        board().tiers.forEach((tier) => tier.items.forEach((ref) => keys.add(refKey(ref))));
        return keys;
    }

    function trayRefs() {
        const placed = placedKeys();
        return board().extras
            .filter((ref) => !placed.has(refKey(ref)));
    }

    function findRef(key) {
        for (const tier of board().tiers) {
            const ref = tier.items.find((item) => refKey(item) === key);
            if (ref) return ref;
        }
        return trayRefs().find((ref) => refKey(ref) === key)
            || board().extras.find((ref) => refKey(ref) === key)
            || (window.getWatchlist?.() || [])
                .map((g) => ({ gameId: g.id, title: g.title, image: g.image || null }))
                .find((ref) => refKey(ref) === key);
    }

    function removeKey(key) {
        board().tiers.forEach((tier) => {
            tier.items = tier.items.filter((item) => refKey(item) !== key);
        });
    }

    function addExtras(refs) {
        const known = new Set(board().extras.map(refKey));
        let added = 0;
        refs.forEach((ref) => {
            if (known.has(refKey(ref))) return;
            known.add(refKey(ref));
            board().extras.push(ref);
            added++;
        });
        if (added) save();
        return added;
    }

    function removeExtra(key) {
        board().extras = board().extras.filter((ref) => refKey(ref) !== key);
        save();
        renderTray();
    }

    // ---- Rendering ----

    function tierRowMarkup(tier, { forExport = false } = {}) {
        return `
            <div class="tier" data-tier="${tier.id}">
                <button class="tier__label" type="button" data-tier-edit="${tier.id}"
                    style="--tier:${tier.color}" title="Click to edit">
                    <span>${window.escapeHtml(tier.label)}</span>
                </button>
                <div class="tier__items" data-drop="tier" data-tier="${tier.id}">
                    ${tier.items.map((ref) => itemMarkup(ref, { tierColor: tier.color })).join('')}
                </div>
                ${forExport ? '' : `
                    <div class="tier__actions">
                        <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-tier-delete="${tier.id}" title="Delete tier" aria-label="Delete tier">${icon('trash')}</button>
                    </div>
                `}
            </div>
        `;
    }

    function renderBoard() {
        els.board.innerHTML = board().tiers.map((tier) => tierRowMarkup(tier)).join('') + `
            <button class="tier-add" type="button" id="tierAddRow">${icon('plus')} Add tier</button>
        `;
        window.onTierRendered?.();
    }

    function itemMarkup(ref, { tierColor, removable } = {}) {
        const style = [`--bg-image:${window.cssUrl(ref.image)}`];
        if (tierColor) style.push(`--tier-color:${tierColor}`);
        const key = window.escapeHtml(refKey(ref));
        return `<div class="tier-item show-frame" draggable="true" data-key="${key}"
            style="${window.escapeHtml(style.join(';'))}" title="${window.escapeHtml(ref.title)}">
            ${removable ? `<button type="button" class="tier-item__remove" data-extra-remove="${key}" title="Remove" aria-label="Remove ${window.escapeHtml(ref.title)}">${icon('close')}</button>` : ''}
            <span class="tier-item__name">${window.escapeHtml(ref.title)}</span>
        </div>`;
    }

    function renderTray() {
        const refs = trayRefs();
        els.tray.innerHTML = refs.length
            ? refs.map((ref) => itemMarkup(ref, { removable: true })).join('')
            : '<p class="field-hint">No games in this selection yet — click “Create new selection” to add some.</p>';
        els.openSelectionLabel.textContent = board().extras.length ? 'Edit selection' : 'Create new selection';
        window.onTierRendered?.();
    }

    // The board name/picker chrome is the collection's; this is the part
    // that is actually the tier maker.
    function renderBody() {
        renderBoard();
        renderTray();
    }

    // ---- Drag & drop ----
    // Reordering within a tier (or dropping mid-list) used to always land
    // "before whatever DOM node happens to be under the cursor" — with no
    // visual cue of where that would be, it took a few blind tries to slot
    // a card between two others. A thin indicator now follows the pointer
    // to the left/right half of the hovered card, and the drop lands
    // exactly where the indicator was.
    let draggedKey = null;

    function dropIndicator() {
        let el = root.querySelector('.tier-drop-indicator');
        if (!el) {
            el = document.createElement('div');
            el.className = 'tier-drop-indicator';
            el.setAttribute('aria-hidden', 'true');
        }
        return el;
    }

    function removeDropIndicator() {
        root.querySelector('.tier-drop-indicator')?.remove();
    }

    root.addEventListener('dragstart', (event) => {
        const item = event.target.closest('.tier-item');
        if (!item) return;
        // A tilted card would drag as a rotated ghost image.
        resetTilt();
        draggedKey = item.dataset.key;
        event.dataTransfer.effectAllowed = 'move';
        // Firefox refuses to start a drag unless some data is set.
        event.dataTransfer.setData('text/plain', draggedKey);
        item.classList.add('is-dragging');
    });

    root.addEventListener('dragend', (event) => {
        event.target.closest('.tier-item')?.classList.remove('is-dragging');
        root.querySelectorAll('.is-over').forEach((el) => el.classList.remove('is-over'));
        removeDropIndicator();
        draggedKey = null;
    });

    root.addEventListener('dragover', (event) => {
        const zone = event.target.closest('[data-drop]');
        if (!zone) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        zone.classList.add('is-over');

        if (zone.dataset.drop !== 'tier') {
            removeDropIndicator();
            return;
        }

        // Which side of the hovered card the pointer is on decides
        // before-it vs after-it; hovering empty tray space just appends.
        const indicator = dropIndicator();
        const overItem = event.target.closest('.tier-item');
        if (overItem && overItem.dataset.key !== draggedKey) {
            const rect = overItem.getBoundingClientRect();
            const before = event.clientX < rect.left + rect.width / 2;
            zone.insertBefore(indicator, before ? overItem : overItem.nextSibling);
        } else if (!overItem) {
            zone.appendChild(indicator);
        }
    });

    root.addEventListener('dragleave', (event) => {
        const zone = event.target.closest('[data-drop]');
        if (zone && !zone.contains(event.relatedTarget)) {
            zone.classList.remove('is-over');
            if (zone.contains(dropIndicator())) removeDropIndicator();
        }
    });

    root.addEventListener('drop', (event) => {
        const zone = event.target.closest('[data-drop]');
        if (!zone) return;
        event.preventDefault();
        zone.classList.remove('is-over');

        const key = draggedKey || event.dataTransfer.getData('text/plain');
        const ref = findRef(key);
        removeDropIndicator();
        if (!ref) return;

        if (zone.dataset.drop === 'tier') {
            const tier = board().tiers.find((t) => t.id === zone.dataset.tier);
            if (!tier) return;

            // Resolve the target index from the tier's current item list
            // (before the dragged card is pulled out of it), the same way
            // the indicator was positioned above.
            const overItem = event.target.closest('.tier-item');
            let index = tier.items.length;
            if (overItem && overItem.dataset.key !== key) {
                const overIndex = tier.items.findIndex((item) => refKey(item) === overItem.dataset.key);
                if (overIndex !== -1) {
                    const rect = overItem.getBoundingClientRect();
                    const before = event.clientX < rect.left + rect.width / 2;
                    index = before ? overIndex : overIndex + 1;
                }
            }

            // If the card was already in this same tier ahead of the drop
            // point, removing it first shifts everything after it left by
            // one — compensate so the index still lands where shown.
            const originalIndex = tier.items.findIndex((item) => refKey(item) === key);
            removeKey(key);
            if (originalIndex !== -1 && originalIndex < index) index -= 1;

            tier.items.splice(Math.max(0, Math.min(index, tier.items.length)), 0, ref);
        } else {
            removeKey(key);
        }

        save();
        renderBoard();
        renderTray();
    });

    // ---- Export as image: the real tier-row markup, laid out off-screen ----
    async function exportImage() {
        const b = board();
        if (!b.tiers.some((t) => t.items.length)) return window.toast('Nothing to export yet — drag some games into a tier first');

        const boardEl = document.createElement('div');
        boardEl.className = 'tier-board';
        boardEl.innerHTML = b.tiers.map((tier) => tierRowMarkup(tier, { forExport: true })).join('');

        await window.exportNodeAsPoster({
            innerNode: boardEl,
            width: 900,
            title: b.name || 'Tier list',
            subtitle: 'Game Vault · Tier list',
            filename: `${b.name || 'tier-list'}.png`
        });
    }

    // ---- Events ----
    async function openSelection() {
        const refs = await window.pickGamesMulti({ title: 'Build a selection' });
        if (!refs || !refs.length) return;
        const added = addExtras(refs);
        renderBody();
        window.toast(`Added ${added} game${added === 1 ? '' : 's'} to your selection`);
    }

    root.addEventListener('click', (event) => {
        const target = event.target;

        if (target.closest('#tierAddRow')) {
            board().tiers.push({ id: window.uid(), label: 'New', color: TIER_COLORS[board().tiers.length % TIER_COLORS.length], items: [] });
            save();
            return renderBoard();
        }

        const editBtn = target.closest('[data-tier-edit]');
        if (editBtn) {
            const tier = board().tiers.find((t) => t.id === editBtn.dataset.tierEdit);
            if (tier) openEditor(tier);
            return;
        }

        const deleteBtn = target.closest('[data-tier-delete]');
        if (deleteBtn) {
            board().tiers = board().tiers.filter((t) => t.id !== deleteBtn.dataset.tierDelete);
            save();
            return renderBody();
        }

        const extraRemoveBtn = target.closest('[data-extra-remove]');
        if (extraRemoveBtn) return removeExtra(extraRemoveBtn.dataset.extraRemove);

        if (target.closest('#openSelectionBtn')) openSelection();
        if (target.closest('#tierExportBtn')) exportImage();
    });

    // Clicking a placed item pops it back to the tray — a keyboard/touch
    // path that doesn't depend on drag and drop working.
    els.board.addEventListener('dblclick', (event) => {
        const item = event.target.closest('.tier-item');
        if (!item) return;
        removeKey(item.dataset.key);
        save();
        renderBody();
    });

    const resetTilt = window.attachTilt(root, { selector: '.tier-item', max: 14, perspective: 500, scale: 1.06 });

    window.registerAwardProvider({
        view: 'tiers',
        label: 'Tier lists',
        gameIds: () => boards.flatMap((b) => b.tiers.flatMap((t) => t.items.map((ref) => ref.gameId))).filter(Boolean),
        findFor: (gameId) => boards.flatMap((b) => b.tiers
            .filter((t) => t.items.some((ref) => ref.gameId === gameId))
            .map((t) => ({ id: b.id, chip: t.label, chipColor: t.color, text: b.name }))),
        focus: (id) => collection.switchTo(id)
    });

    window.refreshTierView = () => collection.render();
    collection.render();
})();
