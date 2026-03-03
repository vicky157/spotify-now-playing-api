const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const NOW_PLAYING_ENDPOINT = 'https://api.spotify.com/v1/me/player/currently-playing';
const RECENTLY_PLAYED_ENDPOINT = 'https://api.spotify.com/v1/me/player/recently-played?limit=1';

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (!data.access_token) {
    throw new Error('Failed to get access token: ' + JSON.stringify(data));
  }
  return data.access_token;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = await getAccessToken();

    const nowPlayingRes = await fetch(NOW_PLAYING_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (nowPlayingRes.status === 204 || nowPlayingRes.status >= 400) {
      const recentRes = await fetch(RECENTLY_PLAYED_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!recentRes.ok) {
        return res.status(200).json({ isPlaying: false });
      }

      const recentData = await recentRes.json();
      if (!recentData.items || recentData.items.length === 0) {
        return res.status(200).json({ isPlaying: false });
      }

      const track = recentData.items[0].track;
      return res.status(200).json({
        isPlaying: false,
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        albumImageUrl: track.album.images[0]?.url,
        songUrl: track.external_urls.spotify,
        previewUrl: track.preview_url,
        progress: null,
        duration: track.duration_ms,
      });
    }

    const data = await nowPlayingRes.json();

    if (data.currently_playing_type !== 'track') {
      return res.status(200).json({ isPlaying: true, type: 'podcast' });
    }

    const track = data.item;
    return res.status(200).json({
      isPlaying: data.is_playing,
      title: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      album: track.album.name,
      albumImageUrl: track.album.images[0]?.url,
      songUrl: track.external_urls.spotify,
      previewUrl: track.preview_url,
      progress: data.progress_ms,
      duration: track.duration_ms,
    });
  } catch (error) {
    console.error('Spotify API error:', error);
    return res.status(200).json({ isPlaying: false });
  }
}
