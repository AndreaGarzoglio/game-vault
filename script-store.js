// ============================================
// STORAGE + BACKUP
// Everything lives in localStorage, which is per-browser and per-device
// and gets wiped by "clear site data". That's fine as the working store,
// but it's not a backup — so the whole vault can be exported to a single
// JSON file and imported on another machine.
//
// Why not a server: the IGDB proxy is stateless (it only hides the Twitch
// credentials), so there's no database today. Adding one means auth,
// hosting and someone else holding your data; a portable file covers the
// actual need — "don't lose it, move it between devices" — with none of
// that. `SCHEMA_VERSION` is what makes a file from an older build still
// readable later.
// ============================================
(function () {
    const SCHEMA_VERSION = 1;

    const KEYS = {
        games: 'gameVaultData',
        folders: 'gameVaultFolders',
        tiers: 'gameVaultTiers',
        about: 'gameVaultAbout',
        tops: 'gameVaultTops'
    };

    window.VAULT_KEYS = KEYS;

    // ---- First run / reset-to-template seed ----
    // A missing `games` key means either a first-ever visit or a fresh
    // "Reset to template" (clearDataBtn instead leaves it as an explicit
    // `[]`, which skips this). Runs here, before any other module reads
    // its own key, so the whole vault — not just the games list — is in
    // place by the time script.js/script-filter.js/script-tiers.js etc.
    // load their data.
    if (localStorage.getItem(KEYS.games) === null && window.TEMPLATE_VAULT?.data) {
        Object.entries(KEYS).forEach(([name, key]) => {
            const value = window.TEMPLATE_VAULT.data[name];
            if (value != null) localStorage.setItem(key, JSON.stringify(value));
        });
    }

    window.vaultStore = {
        read(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                if (raw === null) return fallback;
                const parsed = JSON.parse(raw);
                return parsed ?? fallback;
            } catch {
                return fallback;
            }
        },
        write(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                // Quota is the realistic failure here; silently losing the
                // write would be worse than saying so.
                window.toast?.('Could not save — browser storage is full');
                console.error(error);
                return false;
            }
        }
    };

    window.uid = function () {
        return crypto.randomUUID();
    };

    // ---- Change notification ----
    // Tier lists, About me and top lists all feed the library's awards
    // badge. Rather than each of them reaching into the library's
    // renderer, they announce that they saved and the library listens.
    const changeListeners = [];

    window.onVaultChange = function (fn) {
        changeListeners.push(fn);
    };

    window.vaultChanged = function () {
        changeListeners.forEach((fn) => fn());
    };

    // ---- Awards ----
    // Each view that can "award" a game something (a topic in About me, a
    // tier placement, a rank in a top list) registers a provider here, so
    // the library card badge doesn't need to know about any of them.
    //
    // A provider is { view, label, gameIds(), findFor(gameId), focus(id) }
    // where findFor returns [{ id, chip?, rank?, text }].
    window.awardProviders = [];

    window.registerAwardProvider = function (provider) {
        window.awardProviders.push(provider);
        window.vaultChanged();
    };

    // ---- Export ----
    function buildBackup() {
        const payload = { schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: {} };
        Object.entries(KEYS).forEach(([name, key]) => {
            payload.data[name] = window.vaultStore.read(key, null);
        });
        return payload;
    }

    function exportVault() {
        const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(0, 10);

        const link = document.createElement('a');
        link.href = url;
        link.download = `game-vault-${stamp}.json`;
        link.click();
        URL.revokeObjectURL(url);

        window.toast('Backup downloaded');
    }

    // ---- Import ----
    async function importVault(file) {
        let payload;
        try {
            payload = JSON.parse(await file.text());
        } catch {
            window.toast('That file isn’t a valid Game Vault backup');
            return;
        }

        if (!payload || typeof payload !== 'object' || !payload.data || !Array.isArray(payload.data.games)) {
            window.toast('That file isn’t a valid Game Vault backup');
            return;
        }

        if (payload.schema > SCHEMA_VERSION) {
            window.toast('That backup comes from a newer version of the app');
            return;
        }

        const count = payload.data.games.length;
        const ok = await window.confirmDialog({
            title: 'Replace everything?',
            message: `This backup holds ${count} game${count === 1 ? '' : 's'}. Importing overwrites your current library, collections, tier lists and rankings.`,
            confirmLabel: 'Import',
            danger: true
        });
        if (!ok) return;

        Object.entries(KEYS).forEach(([name, key]) => {
            const value = payload.data[name];
            if (value == null) localStorage.removeItem(key);
            else localStorage.setItem(key, JSON.stringify(value));
        });

        // A reload is the honest way to re-hydrate every module at once
        // rather than trying to hot-swap state module by module.
        location.reload();
    }

    document.getElementById('exportBtn')?.addEventListener('click', exportVault);

    const importInput = document.getElementById('importInput');
    document.getElementById('importBtn')?.addEventListener('click', () => importInput.click());
    importInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) importVault(file);
    });

    // ---- Clear / reset to template ----
    // Both wipe every key, but differ in what's left for the games key:
    // an explicit `[]` means "stay empty", while removing it entirely
    // triggers the seed above to repopulate TEMPLATE_VAULT on the next
    // load — same mechanism a first-ever visit goes through.
    document.getElementById('clearDataBtn')?.addEventListener('click', async () => {
        const ok = await window.confirmDialog({
            title: 'Clear all data?',
            message: 'This deletes every game, collection, tier list and ranking saved in this browser. This can’t be undone.',
            confirmLabel: 'Clear everything',
            danger: true
        });
        if (!ok) return;

        Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(KEYS.games, JSON.stringify([]));
        location.reload();
    });

    document.getElementById('resetTemplateBtn')?.addEventListener('click', async () => {
        const ok = await window.confirmDialog({
            title: 'Reset to template data?',
            message: 'This replaces everything in this browser with the example games, wiping your current library, collections, tier lists and rankings.',
            confirmLabel: 'Reset to template',
            danger: true
        });
        if (!ok) return;

        Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
        location.reload();
    });

    // ---- Save options menu: opens upward above its trigger, closes on
    // an outside click, Escape, or picking any action inside it. ----
    const dataActionsBtn = document.getElementById('dataActionsBtn');
    const dataActionsMenu = document.getElementById('dataActionsMenu');
    const dataActionsChevron = dataActionsBtn?.querySelector('.save-options__chevron');

    // The chevron's rotated state is set inline rather than through a
    // `.is-open` descendant selector — set directly here instead of
    // relying on the cascade.
    function setChevron(open) {
        if (dataActionsChevron) dataActionsChevron.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
    }

    function closeDataActions() {
        if (!dataActionsMenu || dataActionsMenu.hidden) return;
        dataActionsMenu.hidden = true;
        dataActionsBtn.classList.remove('is-open');
        dataActionsBtn.setAttribute('aria-expanded', 'false');
        setChevron(false);
    }

    dataActionsBtn?.addEventListener('click', () => {
        const opening = dataActionsMenu.hidden;
        dataActionsMenu.hidden = !opening;
        dataActionsBtn.classList.toggle('is-open', opening);
        dataActionsBtn.setAttribute('aria-expanded', String(opening));
        setChevron(opening);
    });

    dataActionsMenu?.addEventListener('click', (event) => {
        if (event.target.closest('button')) closeDataActions();
    });

    document.addEventListener('click', (event) => {
        if (event.target.closest('#dataActionsMenu, #dataActionsBtn')) return;
        closeDataActions();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeDataActions();
    });
})();
