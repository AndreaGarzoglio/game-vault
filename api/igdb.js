// Vercel serverless function — deployed automatically at /api/igdb when
// this repo is imported into Vercel. Same job as server.js's proxy (used
// for local dev): gets/caches a Twitch app token and forwards Apicalypse
// queries to IGDB, so the Client ID/Secret never reach the browser.
// IGDB also has no CORS support at all, so this proxy is the only way a
// browser can talk to it, not just a security nicety.
// Set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in the Vercel project's
// Environment Variables before deploying.

let cachedToken = null; // Promise<{ token, expiresAt }> — reused across warm invocations

async function getIgdbToken(clientId, clientSecret) {
    if (cachedToken) {
        const current = await cachedToken;
        if (current.expiresAt > Date.now() + 60_000) return current.token;
    }
    cachedToken = (async () => {
        const url = `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
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

module.exports = async function handler(req, res) {
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        res.status(500).json({ error: 'IGDB_CLIENT_ID / IGDB_CLIENT_SECRET are not set on this Vercel project' });
        return;
    }
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method not allowed' });
        return;
    }

    const payload = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const query = typeof payload.query === 'string' ? payload.query : '';
    const endpoint = payload.endpoint === 'games' ? 'games' : null;
    if (!endpoint || !query || query.length > 2000) {
        res.status(400).json({ error: 'invalid request' });
        return;
    }

    try {
        const token = await getIgdbToken(clientId, clientSecret);
        const igdbRes = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
            method: 'POST',
            headers: {
                'Client-ID': clientId,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'text/plain'
            },
            body: query
        });
        const body = await igdbRes.text();
        res.status(igdbRes.status).setHeader('Content-Type', 'application/json').send(body);
    } catch {
        res.status(502).json({ error: 'upstream request to IGDB failed' });
    }
};
