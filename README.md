<p align="center">
  <img src="favicon.svg" width="72" height="72" alt="Game Vault logo">
</p>

<h1 align="center">Game Vault</h1>

<p align="center">Your game library, rated your way.</p>

Game Vault is a vanilla JavaScript, HTML and CSS video game tracker: add the games you've played or want to play, rate them across multiple aspects (gameplay, story, graphics, music, personal enjoyment... or anything else you can think of), and see your personal ranking sorted however you like.

Built as a [The Odin Project](https://www.theodinproject.com/) project, originally a TV show watchlist, later reworked into a game vault.

## Features

- **Game catalog** — add, remove, and track each game's status (Backlog / Playing / Completed).
- **IGDB autofill** — type a game's title and the form pulls a description, cover art, genre and developer from the [IGDB](https://api-docs.igdb.com/) games database. Everything stays editable before you save.
- **Detail view** — click a card to see everything about a game: rate it, tag it, edit its info, and browse other games sharing its genre (also pulled live from IGDB).
- **Multi-aspect ratings** — rate each game on Gameplay, Story, Graphics, Music and Enjoyment, plus any custom aspect you want to add (e.g. "Level design", "Boss fight music"...). The final score is the average of every rating entered.
- **Tags & folders** — genres become tags automatically; add your own custom tags to a game to group it into a "folder" (e.g. "Favorites").
- **Ranking view** — sort the library by final score or by a single aspect, to instantly see which game has the best story or the most fun gameplay.
- **Per-game color** — every card can have its own accent color; purple stays the interface's base color.
- **Local persistence** — your library is saved in the browser (`localStorage`); the small backend is only used to keep the IGDB credentials off the client, not to store your data.

## Usage

1. Copy `.env.example` to `.env` and fill in `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` — free from a [Twitch Developer](https://dev.twitch.tv/console/apps) app (IGDB runs on Twitch's identity platform).
2. Run `npm start` (plain Node, no dependencies to install) and open the printed local URL.
3. Click **Add game**, type the title, then move focus away from the field: if IGDB has a matching game, the description, image, genre and developer fill in automatically.
4. Click a card to open its detail view — rate it, tag it, or edit its info.
5. Use the **Sort by** menu and the genre/folder chips in the sidebar to filter and rank your library.

## Project structure

| File | Role |
|---|---|
| `index.html` | Page markup and the add-game modal |
| `style.css` | Visual theme (purple pixel-art palette, sidebar layout) |
| `script.js` | Core logic: data model, CRUD, grid rendering, persistence |
| `script-enhancements.js` | Game status, card color/cover, pixel-outline sizing |
| `script-detail.js` | The detail (focus) view: editing, tags, related games |
| `script-wiki.js` | Integration with the IGDB games API (via the `/api/igdb` proxy) |
| `script-ratings.js` | Multi-aspect rating system, custom aspects, average score |
| `script-ranking.js` | Sortable ranking view |
| `script-filter.js` | Search bar and genre/folder tag filtering |
| `script-background.js` | The animated pixel background |
| `server.js` | Local dev server: serves the static files and proxies `/api/igdb` to IGDB with the Twitch app token attached server-side |
| `api/igdb.js` | Same proxy, as a Vercel serverless function for deployment |

## Deploying

The IGDB credentials must never reach the browser, and IGDB's API has no CORS support at all — a plain static host (GitHub Pages included) can't call it directly, with or without hiding the key. The simplest free option:

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com) (free tier, no card required) — it auto-detects the static files and the `api/igdb.js` function.
3. In the Vercel project's Environment Variables, add `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`.
4. Deploy. No code changes needed — `api/igdb.js` is the exact same proxy `server.js` runs locally.

## Technical note

No external npm dependencies — `server.js` uses only Node's built-in `http`/`fs`, and the frontend is plain HTML/CSS/JS plus Google Fonts. The only external service is IGDB, called exclusively through this app's own `/api/igdb` proxy so the credentials stay server-side. The proxy also gets/caches the OAuth app token itself (Twitch's client-credentials grant) and scrubs it from anything echoed back before the response reaches the browser.
