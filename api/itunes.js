// Apple iTunes Search proxy.
// Browsers on mobile get redirected by Apple to a `musics://` deep link, and
// Cloudflare Workers are rate-limited by Apple — but a server-side fetch with a
// desktop User-Agent returns clean JSON. This proxies that and adds CORS so the
// static site can call it from any device.

const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function upscale(url) {
  return (url || '').replace(/\/(\d+)x(\d+)(bb)?\.(jpg|png)/, '/300x300$3.$4');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const q = (req.query.q || req.query.term || '').toString().trim();
  if (!q) return res.status(400).json({ error: 'missing ?q=' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 15, 1), 25);

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}` +
    `&media=music&entity=song&limit=${limit}&country=US`;

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': DESKTOP_UA, Accept: 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'itunes ' + r.status });
    const data = await r.json();
    const results = (data.results || [])
      .filter((t) => t.trackName && t.artistName)
      .map((t) => ({
        id: String(t.trackId),
        title: t.trackName,
        artist: t.artistName,
        album: t.collectionName || '',
        artwork: upscale(t.artworkUrl100 || t.artworkUrl60 || ''),
        previewUrl: t.previewUrl || '',
        appleMusicUrl: t.trackViewUrl || t.collectionViewUrl || '',
        source: 'apple',
      }));
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ count: results.length, results });
  } catch (e) {
    return res.status(502).json({ error: String(e) });
  }
}
