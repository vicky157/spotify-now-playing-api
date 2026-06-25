// Spotify catalog search via the Client Credentials flow. Reuses the same
// SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET this project already uses for
// now-playing — no user token or extra scopes needed for catalog search.

let tokenCache = { value: '', exp: 0 };

async function getAppToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp) return tokenCache.value;
  const basic = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
  ).toString('base64');
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('no token: ' + JSON.stringify(d));
  tokenCache = { value: d.access_token, exp: Date.now() + ((d.expires_in || 3600) - 60) * 1000 };
  return tokenCache.value;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = (req.query.q || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'missing ?q=' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 25);

  try {
    const token = await getAppToken();
    const u = `https://api.spotify.com/v1/search?type=track&limit=${limit}&q=${encodeURIComponent(q)}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return res.status(502).json({ error: 'spotify ' + r.status });
    const data = await r.json();
    const results = (data.tracks?.items || [])
      .filter((t) => t.id && t.name)
      .map((t) => ({
        id: String(t.id),
        title: t.name,
        artist: (t.artists || []).map((a) => a.name).join(', '),
        album: t.album?.name || '',
        artwork: t.album?.images?.[0]?.url || '',
        previewUrl: t.preview_url || '',
        spotifyUrl: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
        source: 'spotify',
      }));
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
    return res.status(200).json({ count: results.length, results });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
