// ============================================
// SORTING / RANKING
// Reorders the same grid instead of opening a separate page.
// ============================================
(function () {
    const ASPECT_LABELS = {
        _order: 'Date added',
        _title: 'Title (A–Z)',
        _year: 'Release year',
        _score: 'Final score',
        ...window.DEFAULT_ASPECTS
    };

    const select = document.getElementById('rankingSelect');
    let sortKey = '_order';
    let renderedKeys = '';

    function getValueFor(game, key) {
        if (key === '_score') return window.computeRatingAverage(game.ratings);
        const value = game.ratings?.[key];
        return typeof value === 'number' ? value : null;
    }

    function collectCustomAspects(list) {
        const seen = new Set();
        list.forEach((game) => {
            Object.keys(game.ratings || {}).forEach((key) => {
                if (!(key in ASPECT_LABELS)) seen.add(key);
            });
        });
        return Array.from(seen).sort((a, b) => a.localeCompare(b));
    }

    function syncSelectOptions(list) {
        if (!select) return;

        const keys = [...Object.keys(ASPECT_LABELS), ...collectCustomAspects(list)];
        const signature = keys.join('|');
        // Rebuilding the <option> list on every render would reset the
        // open dropdown and drop keyboard focus; only touch it when the
        // available aspects actually changed.
        if (signature === renderedKeys) return;

        renderedKeys = signature;
        select.innerHTML = keys
            .map((key) => `<option value="${window.escapeHtml(key)}">${window.escapeHtml(ASPECT_LABELS[key] || key)}</option>`)
            .join('');
        select.value = sortKey;
    }

    window.getRenderOrder = function (list) {
        syncSelectOptions(list);
        if (sortKey === '_order') return list;

        if (sortKey === '_title') {
            return [...list].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        }

        if (sortKey === '_year') {
            return [...list].sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
        }

        return [...list].sort((a, b) => {
            const valueA = getValueFor(a, sortKey);
            const valueB = getValueFor(b, sortKey);
            if (valueA === null && valueB === null) return 0;
            if (valueA === null) return 1;
            if (valueB === null) return -1;
            return valueB - valueA;
        });
    };

    select?.addEventListener('change', (event) => {
        sortKey = event.target.value;
        window.renderShows?.();
    });
})();
