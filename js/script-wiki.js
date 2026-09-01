// ============================================
// IGDB AUTOFILL
// Fetches a description, cover art, genre and developer when the user
// types a game title, so the form isn't editable-but-empty. Everything
// stays editable before you save.
//
// All requests go through this app's own /api/igdb proxy (server.js /
// api/igdb.js) — IGDB requires a Twitch OAuth token and has no CORS
// support at all, so a direct browser call isn't possible regardless of
// how credentials are handled.
// ============================================
(function () {
    let lastFetched = { image: null, genre: null, developer: null, screenshot: null };

    window.getWikiImage = function () {
        return lastFetched.image;
    };

    window.getWikiGenre = function () {
        return lastFetched.genre;
    };

    window.getWikiDeveloper = function () {
        return lastFetched.developer;
    };

    window.getWikiScreenshot = function () {
        return lastFetched.screenshot;
    };

    window.resetWikiStatus = function () {
        lastFetched = { image: null, genre: null, developer: null, screenshot: null };
        const statusEl = document.getElementById('wikiStatus');
        if (statusEl) statusEl.textContent = '';
    };

    async function igdbQuery(query) {
        const response = await fetch('/api/igdb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: 'games', query })
        });
        if (!response.ok) throw new Error('request failed');
        return response.json();
    }

    function imageUrl(imageId, size) {
        return imageId ? `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg` : null;
    }

    const GAME_FIELDS = 'name,first_release_date,summary,genres.id,genres.name,themes.id,'
        + 'keywords,game_modes,player_perspectives,similar_games,franchises,'
        + 'total_rating,total_rating_count,'
        + 'involved_companies.company.name,involved_companies.developer,'
        + 'cover.image_id,screenshots.image_id,url';

    // Fields needed to render a suggestion card and judge how good/known
    // the game is.
    const CARD_FIELDS = 'name,cover.image_id,url,first_release_date,genres,themes,keywords,'
        + 'game_modes,player_perspectives,total_rating,total_rating_count';

    // `category = 0` ("main game", excluding DLC/expansions/ports/remakes)
    // looked like the right filter, but IGDB's JSON responses omit any
    // field left at its zero-value default — Deltarune itself comes back
    // with no `category` key at all — and that same default-omission
    // breaks server-side matching against it: `category = 0` (and every
    // `category != N` tried as a workaround) silently excludes rows that
    // are actually at the default, main-game value. `version_parent`
    // isn't affected the same way, so that's the only piece kept; the
    // real "is this a real game" signal is `total_rating_count` below.
    const MAIN_GAME = 'version_parent = null';

    // A game with a 95 from 12 people isn't better known than an 85 from
    // 4000, so rank on score *and* sample size rather than score alone.
    function qualityScore(game) {
        const rating = game.total_rating || 0;
        const votes = game.total_rating_count || 0;
        return rating * Math.log10(1 + votes);
    }

    // Opening a game's detail view fires off the backdrop fetch and the
    // related-games fetch back to back — both look up the same title, so
    // caching the match avoids issuing the same IGDB search twice.
    const searchCache = new Map();

    function searchGame(title) {
        const key = title.toLowerCase();
        if (!searchCache.has(key)) {
            searchCache.set(key, (async () => {
                const safeTitle = title.replace(/"/g, '');
                const results = await igdbQuery(`search "${safeTitle}"; fields ${GAME_FIELDS}; limit 5;`);
                return results.length ? (results.find((g) => g.name.toLowerCase() === key) || results[0]) : null;
            })());
        }
        return searchCache.get(key);
    }

    function extractDeveloper(match) {
        return (match.involved_companies || [])
            .filter((c) => c.developer)
            .map((c) => c.company?.name)
            .filter(Boolean)
            .join(', ');
    }

    async function lookupGame(title) {
        const match = await searchGame(title);
        if (!match) throw new Error('no results');

        const genre = (match.genres || []).map((g) => g.name).join(', ');
        const developer = extractDeveloper(match);
        const year = match.first_release_date
            ? String(new Date(match.first_release_date * 1000).getUTCFullYear())
            : null;
        const description = (match.summary || '').split(/\n{2,}/)[0] || '';
        const image = imageUrl(match.cover?.image_id, 'cover_big');
        const shots = (match.screenshots || []).map((s) => s.image_id).filter(Boolean);
        const screenshot = shots.length ? imageUrl(shots[Math.floor(Math.random() * shots.length)], 'screenshot_big') : null;

        return { match, image, description, genre, developer, year, screenshot };
    }

    // One title in, one best-guess IGDB match out (or null) — used by bulk
    // add/paste flows, which look games up one at a time (awaited in
    // sequence by the caller) rather than all at once, to stay under
    // IGDB's rate limit.
    window.lookupGameForBulk = async function (title) {
        try {
            const data = await lookupGame(title);
            return {
                title: data.match.name, year: data.year, description: data.description,
                genre: data.genre, developer: data.developer, image: data.image, screenshot: data.screenshot
            };
        } catch {
            return null;
        }
    };

    // Cards only ever show cover art, never a gameplay screenshot (those
    // are reserved for the detail view's backdrop).
    window.fetchRandomCoverImage = async function (title) {
        if (!title) return null;
        try {
            const match = await searchGame(title);
            return imageUrl(match?.cover?.image_id, 'cover_big');
        } catch {
            return null;
        }
    };

    // A wider screenshot for the detail view's banner, distinct from the
    // card's cover image.
    window.fetchGameBackdrop = async function (title) {
        if (!title) return null;
        try {
            const match = await searchGame(title);
            const shots = (match?.screenshots || []).map((s) => s.image_id).filter(Boolean);
            if (shots.length) {
                const pick = shots[Math.floor(Math.random() * shots.length)];
                return imageUrl(pick, 'screenshot_huge');
            }
            return imageUrl(match?.cover?.image_id, 'cover_big');
        } catch {
            return null;
        }
    };

    function toCard(game) {
        return {
            id: game.id,
            title: game.name,
            image: imageUrl(game.cover?.image_id, 'cover_big'),
            url: game.url,
            year: game.first_release_date
                ? new Date(game.first_release_date * 1000).getUTCFullYear()
                : null
        };
    }

    // Suggestions in two passes, best-known first:
    //
    //  1. IGDB's own `similar_games` — editorially curated, so it catches
    //     "same vibe" links that no amount of tag overlap would (Outer
    //     Wilds → Subnautica), ordered by how well-reviewed they are.
    //  2. A tag query as filler, matching on genres/themes/keywords/modes
    //     rather than genre alone, restricted to main games with a real
    //     number of reviews.
    //
    // `excludeIds` lets the refresh button cycle to the next batch instead
    // of showing the same faces again.
    window.fetchRelatedGames = async function (title, excludeIds = []) {
        if (!title) return [];

        try {
            const match = await searchGame(title);
            if (!match) return [];

            const skip = new Set([match.id, ...excludeIds]);
            const sameName = (g) => g.name.toLowerCase() === title.toLowerCase();

            const genreIds = (match.genres || []).map((g) => g.id).filter(Boolean);
            const themeIds = (match.themes || []).map((t) => t.id).filter(Boolean);
            const keywordIds = (match.keywords || []).slice(0, 20);
            const modeIds = match.game_modes || [];

            const picks = [];
            const seen = new Set();

            function collect(games) {
                games
                    .filter((g) => g.cover && !skip.has(g.id) && !seen.has(g.id) && !sameName(g))
                    .forEach((g) => {
                        seen.add(g.id);
                        picks.push(g);
                    });
            }

            // Pass 1 — IGDB's curated "similar games".
            const similarIds = (match.similar_games || []).filter((id) => !skip.has(id));
            if (similarIds.length) {
                const similar = await igdbQuery(
                    `fields ${CARD_FIELDS}; where id = (${similarIds.join(',')}) & ${MAIN_GAME}; limit 40;`
                );
                collect(similar.sort((a, b) => qualityScore(b) - qualityScore(a)));
            }

            // Pass 2 — tag overlap, only if we still need more.
            if (picks.length < 12) {
                const groups = [];
                if (genreIds.length) groups.push(`genres = (${genreIds.join(',')})`);
                if (themeIds.length) groups.push(`themes = (${themeIds.join(',')})`);
                if (keywordIds.length) groups.push(`keywords = (${keywordIds.join(',')})`);

                if (groups.length) {
                    const byTag = await igdbQuery(
                        `fields ${CARD_FIELDS};`
                        + ` where (${groups.join(' | ')}) & ${MAIN_GAME} & total_rating_count > 20;`
                        + ' sort total_rating_count desc; limit 80;'
                    );

                    // Weighted so a shared genre counts for more than a
                    // shared keyword, then best-reviewed first within a tier.
                    const scored = byTag.map((g) => {
                        const overlap =
                            (g.genres || []).filter((id) => genreIds.includes(id)).length * 3 +
                            (g.themes || []).filter((id) => themeIds.includes(id)).length * 2 +
                            (g.keywords || []).filter((id) => keywordIds.includes(id)).length * 2 +
                            (g.game_modes || []).filter((id) => modeIds.includes(id)).length;
                        return { game: g, overlap };
                    })
                        .filter((row) => row.overlap > 0)
                        .sort((a, b) => (b.overlap - a.overlap) || (qualityScore(b.game) - qualityScore(a.game)))
                        .map((row) => row.game);

                    collect(scored);
                }
            }

            return picks.slice(0, 12).map(toCard);
        } catch {
            return [];
        }
    };

    // Free-text search used by the game picker (tier lists, About me,
    // top-10s) to pull in games that aren't in the library.
    // "Rich" fields — real genre/platform *names* rather than just ids —
    // for the tier maker's selection modal, which needs to both display
    // and facet-filter by them.
    const RICH_FIELDS = 'name,cover.image_id,url,first_release_date,summary,screenshots.image_id,genres.name,themes.name,platforms.name,total_rating,total_rating_count';

    function toRichCard(game) {
        const shots = (game.screenshots || []).map((s) => s.image_id).filter(Boolean);
        return {
            id: game.id,
            title: game.name,
            image: imageUrl(game.cover?.image_id, 'cover_big'),
            screenshot: shots.length ? imageUrl(shots[Math.floor(Math.random() * shots.length)], 'screenshot_big') : null,
            year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
            description: (game.summary || '').split(/\n{2,}/)[0] || '',
            genres: (game.genres || []).map((g) => g.name).filter(Boolean),
            platforms: (game.platforms || []).map((p) => p.name).filter(Boolean)
        };
    }

    // Whatever's broadly popular right now, no search term needed — seeds
    // the selection modal's IGDB list the moment it opens, before any tag
    // has narrowed it down.
    window.fetchPopularGamesIgdbRich = async function ({ limit = 20, offset = 0 } = {}) {
        try {
            const results = await igdbQuery(
                `fields ${RICH_FIELDS}; where ${MAIN_GAME} & total_rating_count > 50;`
                + ` sort total_rating_count desc; limit ${limit}; offset ${offset};`
            );
            return results.map(toRichCard);
        } catch {
            return [];
        }
    };

    // Name search with genre/platform names attached, used by the
    // selection modal's "Names" search.
    window.searchGamesIgdbRich = async function (term, { limit = 20, offset = 0 } = {}) {
        const clean = (term || '').trim();
        if (!clean) return [];
        try {
            const results = await igdbQuery(
                `search "${clean.replace(/"/g, '')}"; fields ${RICH_FIELDS}; where ${MAIN_GAME}; limit ${limit}; offset ${offset};`
            );
            return results.map(toRichCard);
        } catch {
            return [];
        }
    };

    // Pulls in the most popular games matching *every* selected tag (AND
    // across tags, OR across the genre/theme/keyword/platform fields
    // within one tag) — so a second tag narrows the result set instead of
    // widening it. `offset` lets the caller page in another batch of the
    // same combo.
    window.searchGamesIgdbByTagsRich = async function (tags, { limit = 10, offset = 0 } = {}) {
        const clean = (tags || []).map((tag) => String(tag).trim().replace(/"/g, '')).filter(Boolean);
        if (!clean.length) return [];
        try {
            const clauses = clean
                .map((tag) => `(genres.name ~ *"${tag}"* | themes.name ~ *"${tag}"* | keywords.name ~ *"${tag}"* | platforms.name ~ *"${tag}"*)`)
                .join(' & ');
            const results = await igdbQuery(
                `fields ${RICH_FIELDS}; where ${clauses} & ${MAIN_GAME};`
                + ` sort total_rating_count desc; limit ${limit}; offset ${offset};`
            );
            return results.map(toRichCard);
        } catch {
            return [];
        }
    };

    async function autofillFromIgdb(title) {
        const statusEl = document.getElementById('wikiStatus');
        const descriptionField = document.getElementById('showDescription');
        const imageField = document.getElementById('showImg');
        const genreField = document.getElementById('showGenre');
        const yearField = document.getElementById('showYear');
        if (!title) return;

        if (statusEl) statusEl.textContent = 'Looking it up...';

        try {
            const data = await lookupGame(title);

            lastFetched = {
                image: data.image || null,
                genre: data.genre || null,
                developer: data.developer || null,
                screenshot: data.screenshot || null
            };

            if (descriptionField && !descriptionField.value.trim() && data.description) {
                descriptionField.value = data.description;
            }
            if (imageField && !imageField.value.trim() && lastFetched.image) {
                imageField.value = lastFetched.image;
            }
            if (genreField && !genreField.value.trim() && lastFetched.genre) {
                genreField.value = lastFetched.genre;
            }
            if (yearField && !yearField.value.trim() && data.year) {
                yearField.value = data.year;
            }

            if (statusEl) {
                statusEl.textContent = lastFetched.image
                    ? 'Found it — feel free to edit the fields.'
                    : 'Found it, but no cover — paste one manually if you have it.';
            }
        } catch {
            if (statusEl) statusEl.textContent = 'Nothing found: enter the details manually.';
        }
    }

    // The Add-game form is built by script.js's createDialog call, which
    // loads after this file — #showName doesn't exist in the DOM yet at
    // this script's top-level eval time, so wiring it up has to wait for
    // an explicit call once that dialog exists, instead of running here.
    window.initAddGameAutofill = function () {
        const titleField = document.getElementById('showName');
        titleField?.addEventListener('blur', () => {
            autofillFromIgdb(titleField.value.trim());
        });

        // ---- Title autocomplete: type-ahead IGDB matches in a dropdown,
        // picking one fills the whole form straight from that result instead
        // of waiting on a second lookup once the field loses focus. ----
        const suggestBox = document.getElementById('showNameSuggest');

        function fillFromRichCard(ref) {
            lastFetched = {
                ...lastFetched,
                image: ref.image || null,
                genre: (ref.genresList || []).join(', ') || null,
                screenshot: ref.screenshot || null
            };

            const yearField = document.getElementById('showYear');
            const genreField = document.getElementById('showGenre');
            const descriptionField = document.getElementById('showDescription');
            const imageField = document.getElementById('showImg');
            const statusEl = document.getElementById('wikiStatus');

            titleField.value = ref.title;
            if (yearField && ref.year) yearField.value = ref.year;
            if (genreField && lastFetched.genre) genreField.value = lastFetched.genre;
            if (descriptionField && ref.description) descriptionField.value = ref.description;
            if (imageField && ref.image) imageField.value = ref.image;
            if (statusEl) statusEl.textContent = 'Found it — feel free to edit the fields.';
        }

        if (titleField && suggestBox && typeof window.pickGameSingle === 'function') {
            window.pickGameSingle({
                inputEl: titleField,
                resultsEl: suggestBox,
                includeLibrary: false,
                renderHint: (ref) => ref.year || '',
                onPick: fillFromRichCard
            });
        }
    };
})();
