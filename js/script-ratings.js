// ============================================
// MULTI-ASPECT RATINGS
// Each game is scored on several aspects (the defaults plus any custom
// aspect the user names) which average into one final score. The editor
// is a reusable inline component mounted inside the detail view rather
// than its own popup.
// ============================================
(function () {
    const DEFAULT_ASPECTS = {
        gameplay: 'Gameplay',
        story: 'Story',
        graphics: 'Graphics',
        music: 'Music',
        enjoyment: 'Enjoyment'
    };
    window.DEFAULT_ASPECTS = DEFAULT_ASPECTS;

    function computeAverage(ratings) {
        const values = Object.values(ratings || {}).filter((v) => typeof v === 'number' && !Number.isNaN(v));
        if (!values.length) return null;
        return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    }

    function renderAspectRow(key, label, value, removable, onChange, onRemove) {
        const row = document.createElement('div');
        row.className = 'aspect-row';
        row.innerHTML = `
            <label>${window.escapeHtml(label)}</label>
            <input type="number" min="0" max="10" step="0.1" value="${value}" class="aspect-input"
                aria-label="${window.escapeHtml(label)} score">
            ${removable ? '<button type="button" class="aspect-remove" aria-label="Remove aspect">&times;</button>' : '<span></span>'}
        `;

        const input = row.querySelector('.aspect-input');
        input.addEventListener('input', () => {
            if (input.value === '') return;
            const parsed = parseFloat(input.value);
            if (Number.isNaN(parsed)) return;
            onChange(key, Math.max(0, Math.min(10, parsed)));
        });
        // Clamping only on the way out keeps typing "10" from fighting the
        // user at the intermediate "1".
        input.addEventListener('blur', () => {
            const parsed = parseFloat(input.value);
            input.value = Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(10, parsed));
        });

        row.querySelector('.aspect-remove')?.addEventListener('click', () => {
            row.remove();
            onRemove(key);
        });

        return row;
    }

    // Mounts a live, auto-saving rating editor for `game` inside `container`.
    window.mountRatingEditor = function (container, game, onUpdate) {
        container.innerHTML = '';
        game.ratings = game.ratings || {};

        const fieldsEl = document.createElement('div');
        fieldsEl.className = 'aspect-rows';

        const addRow = document.createElement('div');
        addRow.className = 'add-aspect-row';
        addRow.innerHTML = `
            <input type="text" placeholder="New aspect (e.g. Level design)" class="newAspectInput">
            <button type="button" class="addAspectBtn">Add</button>
        `;

        const averageEl = document.createElement('p');
        averageEl.className = 'rating-average';

        container.append(fieldsEl, addRow, averageEl);

        function updateAverage() {
            const avg = computeAverage(game.ratings);
            averageEl.textContent = avg === null ? 'No ratings yet' : `Final score: ${avg} / 10`;
        }

        function persist() {
            window.saveWatchlist?.();
            onUpdate?.();
        }

        function addAspectRow(key, label, removable) {
            const value = game.ratings[key] ?? 5;
            game.ratings[key] = value;
            fieldsEl.appendChild(renderAspectRow(key, label, value, removable, (k, v) => {
                game.ratings[k] = v;
                updateAverage();
                persist();
            }, (k) => {
                delete game.ratings[k];
                updateAverage();
                persist();
            }));
        }

        Object.entries(DEFAULT_ASPECTS).forEach(([key, label]) => addAspectRow(key, label, false));
        Object.keys(game.ratings)
            .filter((key) => !(key in DEFAULT_ASPECTS))
            .forEach((key) => addAspectRow(key, key, true));

        const input = addRow.querySelector('.newAspectInput');

        function commitNewAspect() {
            const name = input.value.trim();
            input.value = '';
            if (!name || name in game.ratings) return;
            addAspectRow(name, name, true);
            updateAverage();
            persist();
        }

        addRow.querySelector('.addAspectBtn').addEventListener('click', commitNewAspect);
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            commitNewAspect();
        });

        updateAverage();
    };

    window.computeRatingAverage = computeAverage;

    window.renderRatingBadge = function (game) {
        const avg = computeAverage(game.ratings);
        if (avg === null) return '';
        return `<span class="rating-seal" title="Final score">${avg}</span>`;
    };

    // Ten separated pixels, always present, fixed in place. A whole point
    // grows a pixel to a full square; a decimal grows it proportionally —
    // 9.7 draws as 9 full squares plus a 10th square at 70% size. Blocks
    // also darken toward the left, brightening into full color toward
    // the right end of the bar.
    function renderBlocks(value) {
        const color = 'var(--card-accent)';
        const blocks = [];
        for (let i = 0; i < 10; i++) {
            const fill = Math.max(0, Math.min(1, value - i));
            const pos = (i / 9).toFixed(2);
            blocks.push(`<span class="pixel-block" style="--fill:${fill.toFixed(2)};--pos:${pos}"><span class="pixel-block-dot"></span></span>`);
        }
        return `<span class="aspect-bar-track" style="--bar-color:${color}">${blocks.join('')}</span>`;
    }

    // `compact` renders exactly the 5 default aspects, one per line with
    // the label and bar side by side — the library card's space is too
    // tight for the detail view's label-above-bar-below layout times
    // five. Missing scores show as an empty bar rather than being
    // skipped, so every card's block is the same height.
    window.renderRatingBars = function (game, { compact } = {}) {
        const entries = compact
            ? Object.entries(DEFAULT_ASPECTS).map(([key]) => [key, game.ratings?.[key]])
            : Object.entries(game.ratings || {});
        if (!compact && !entries.length) return '';

        const bars = entries
            .map(([key, value]) => {
                const hasValue = typeof value === 'number';
                return `
                    <div class="aspect-bar">
                        <div class="aspect-bar-head">
                            <span class="aspect-bar-label">${window.escapeHtml(DEFAULT_ASPECTS[key] || key)}</span>
                            <span class="aspect-bar-value">${hasValue ? value : '—'}</span>
                        </div>
                        ${renderBlocks(hasValue ? value : 0)}
                    </div>
                `;
            })
            .join('');

        return `<div class="aspect-bars${compact ? ' aspect-bars--compact' : ''}">${bars}</div>`;
    };
})();
