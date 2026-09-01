// Tiny static file server + a single proxy endpoint for the IGDB games API.
// The Twitch Client ID/Secret live only here (read from the environment)
// and are never sent to the browser. IGDB also has no CORS support at
// all, so a server-side proxy isn't just for key safety here — it's the
// only way a browser can talk to it.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 5173;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

// IGDB app tokens last ~60 days; cached in memory and refreshed lazily so
// we're not re-authenticating on every single game lookup. The promise
// itself is cached (not just its result) so concurrent lookups that land
// while the token is expired share one Twitch request instead of each
// firing their own.
let cachedToken = null; // Promise<{ token, expiresAt }>

async function getIgdbToken() {
    if (cachedToken) {
        const current = await cachedToken;
        if (current.expiresAt > Date.now() + 60_000) return current.token;
    }
    cachedToken = (async () => {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`;
        const res = await fetch(url, { method: 'POST' });
        if (!res.ok) throw new Error('failed to get IGDB token');
        const data = await res.json();
        return { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    })();
    try {
        return (await cachedToken).token;
    } catch (error) {
        cachedToken = null;
        throw error;
    }
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => { data += chunk; });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

async function handleIgdbProxy(req, res) {
    if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not set (see .env.example)' }));
        return;
    }

    let payload;
    try {
        payload = JSON.parse(await readBody(req));
    } catch {
        payload = {};
    }

    const query = typeof payload.query === 'string' ? payload.query : '';
    const endpoint = payload.endpoint === 'games' ? 'games' : null;
    if (!endpoint || !query || query.length > 2000) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid request' }));
        return;
    }

    try {
        const token = await getIgdbToken();
        const igdbRes = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
            method: 'POST',
            headers: {
                'Client-ID': IGDB_CLIENT_ID,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'text/plain'
            },
            body: query
        });
        const body = await igdbRes.text();
        res.writeHead(igdbRes.status, { 'Content-Type': 'application/json' });
        res.end(body);
    } catch {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'upstream request to IGDB failed' }));
    }
}

function serveStatic(req, res, url) {
    const safePath = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
    let filePath = path.join(__dirname, safePath === '/' ? 'index.html' : safePath);

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(data);
    });
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/igdb' && req.method === 'POST') {
        handleIgdbProxy(req, res);
        return;
    }
    serveStatic(req, res, url);
});

server.listen(PORT, () => {
    console.log(`Game Vault running at http://localhost:${PORT}`);
    if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
        console.warn('Warning: IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not set — see .env.example. Run with: node --env-file=.env server.js');
    }
});
