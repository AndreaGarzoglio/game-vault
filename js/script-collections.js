// ============================================
// NAMED COLLECTIONS
// Tier lists, About me boards and top lists are the same widget over
// different payloads: an array of named things with one active at a
// time, a <select> in the view header, a matching sidebar list, and
// add/rename/delete dialogs. All of that lives here once, so each view
// only has to render its own body.
//
// Views are identified by a short `ns` ("tier"/"about"/"top") which also
// names their DOM anchors: `#<ns>Select` and `#<ns>List`.
// ============================================
(function () {
    const registry = new Map();

    // The header strip every collection view shares: picker + CRUD.
    window.collectionTools = function (ns, nouns) {
        const esc = window.escapeHtml;
        const icon = window.icon;
        return `
            <label class="select">
                <select id="${ns}Select" aria-label="Choose a ${esc(nouns.item)}"></select>
                <svg class="icon select__caret" aria-hidden="true"><use href="#i-chevron-down"/></svg>
            </label>
            <button class="icon-btn" type="button" data-collection-add="${ns}"
                title="${esc(nouns.newTitle)}" aria-label="${esc(nouns.newTitle)}">${icon('plus')}</button>
            <button class="icon-btn" type="button" data-collection-rename="${ns}"
                title="Rename" aria-label="Rename this ${esc(nouns.item)}">${icon('pencil')}</button>
            <button class="icon-btn icon-btn--danger" type="button" data-collection-delete="${ns}"
                title="Delete" aria-label="Delete this ${esc(nouns.item)}">${icon('trash')}</button>
        `;
    };

    window.createCollection = function ({ storageKey, ns, icon: iconName, labelKey, nouns, items, create, onChange }) {
        let activeId = items[0].id;

        const label = (item) => item[labelKey];
        const current = () => items.find((i) => i.id === activeId) || items[0];

        function save() {
            window.vaultStore.write(storageKey, items);
            // Library cards show an awards badge sourced from these
            // collections; the library observes rather than being poked.
            window.vaultChanged?.();
        }

        function renderChrome() {
            const esc = window.escapeHtml;

            const select = document.getElementById(`${ns}Select`);
            if (select) {
                select.innerHTML = items.map((i) => `<option value="${i.id}">${esc(label(i))}</option>`).join('');
                select.value = activeId;
            }

            const list = document.getElementById(`${ns}List`);
            if (list) {
                list.innerHTML = items.map((i) => {
                    const id = esc(i.id);
                    const name = esc(label(i));
                    return `
                        <div class="nav__row${i.id === activeId ? ' is-active' : ''}">
                            <button class="nav__item" type="button" data-collection-open="${ns}:${id}">
                                ${window.icon(iconName)}
                                <span class="nav__label">${name}</span>
                            </button>
                            <button class="icon-btn icon-btn--sm" type="button" data-collection-rename="${ns}:${id}"
                                title="Rename" aria-label="Rename ${name}">${window.icon('pencil')}</button>
                            <button class="icon-btn icon-btn--sm icon-btn--danger" type="button" data-collection-delete="${ns}:${id}"
                                title="Delete" aria-label="Delete ${name}">${window.icon('trash')}</button>
                        </div>
                    `;
                }).join('');
            }
        }

        function render() {
            renderChrome();
            onChange();
        }

        async function addNew() {
            const name = await window.promptDialog({ title: nouns.newTitle, placeholder: nouns.placeholder });
            if (!name) return;
            const item = await create(name);
            if (!item) return;
            items.push(item);
            activeId = item.id;
            save();
            render();
        }

        async function rename(id = activeId) {
            const item = items.find((i) => i.id === id);
            if (!item) return;
            const name = await window.promptDialog({ title: `Rename ${nouns.item}`, value: label(item) });
            if (!name) return;
            item[labelKey] = name;
            save();
            render();
        }

        async function remove(id = activeId) {
            if (items.length === 1) return window.toast(`Keep at least one ${nouns.item}`);
            const item = items.find((i) => i.id === id);
            if (!item) return;
            const ok = await window.confirmDialog({
                title: `Delete this ${nouns.item}?`, message: `“${label(item)}” will be gone.`,
                confirmLabel: 'Delete', danger: true
            });
            if (!ok) return;
            items = items.filter((i) => i.id !== id);
            if (activeId === id) activeId = items[0].id;
            save();
            render();
        }

        function switchTo(id) {
            if (!items.some((i) => i.id === id)) return;
            activeId = id;
            render();
        }

        const api = { all: () => items, current, save, render, renderChrome, switchTo, addNew, rename, remove };
        registry.set(ns, api);
        return api;
    };

    // One delegated listener for every collection, rather than one per
    // view. The value is either "<ns>" (act on whatever is active, from
    // the header buttons) or "<ns>:<id>" (a specific row in the sidebar).
    function resolve(value) {
        const [ns, id] = value.split(':');
        return [registry.get(ns), id];
    }

    document.addEventListener('click', (event) => {
        const el = event.target.closest(
            '[data-collection-open],[data-collection-add],[data-collection-rename],[data-collection-delete]'
        );
        if (!el) return;

        const { collectionOpen, collectionAdd, collectionRename, collectionDelete } = el.dataset;
        if (collectionOpen) { const [c, id] = resolve(collectionOpen); return c?.switchTo(id); }
        if (collectionAdd) { return registry.get(collectionAdd)?.addNew(); }
        if (collectionRename) { const [c, id] = resolve(collectionRename); return c?.rename(id); }
        if (collectionDelete) { const [c, id] = resolve(collectionDelete); return c?.remove(id); }
    });

    document.addEventListener('change', (event) => {
        const select = event.target.closest('select[id$="Select"]');
        if (!select) return;
        const collection = registry.get(select.id.replace(/Select$/, ''));
        collection?.switchTo(select.value);
    });
})();
