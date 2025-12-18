/**
 * External Proxy Server for YouTube Downloads
 * Uses youtubei.js (Innertube) for reliable YouTube access
 */

const express = require('express');
const cors = require('cors');
const ytsr = require('ytsr');
const { Innertube } = require('youtubei.js');

app.use(cors({ origin: '*' }));
app.use(express.json());

let yt = null;

// Initialize Innertube
async function initYT() {
    if (!yt) {
        console.log('[Proxy] Initializing Innertube...');
        yt = await Innertube.create({
            cache: false,
            generate_session_locally: true
        });
        console.log('[Proxy] Innertube ready');
    }
    return yt;
}

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Search YouTube
app.get('/api/search', async (req, res) => {
    const query = req.query.q || '';
    console.log(`[Proxy] Search: ${query}`);

    try {
        const results = await ytsr(query, { limit: 20 });
        const videos = results.items
            .filter(i => i.type === 'video')
            .map(v => ({
                id: v.id,
                title: v.title,
                artist: v.author?.name || 'Unknown',
                thumbnail: v.bestThumbnail?.url || `https://img.youtube.com/vi/${v.id}/hqdefault.jpg`,
                duration: v.duration,
                authorId: v.author?.channelID || ''
            }));

        res.json({ items: videos });
    } catch (e) {
        console.error('[Proxy] Search error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Get audio URL using youtubei.js
app.get('/api/audio-url/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Audio URL: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const youtube = await initYT();
        const info = await youtube.getBasicInfo(videoId);

        // Get streaming data
        const format = info.streaming_data?.adaptive_formats
            ?.filter(f => f.mime_type?.includes('audio'))
            ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (format && format.decipher) {
            const url = format.decipher(youtube.session.player);
            res.json({ url, videoId });
        } else if (format && format.url) {
            res.json({ url: format.url, videoId });
        } else {
            throw new Error('No audio format found');
        }
    } catch (e) {
        console.error('[Proxy] Audio URL error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Stream audio directly
app.get('/api/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Stream: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).send('Invalid video ID');
    }

    try {
        const youtube = await initYT();
        const info = await youtube.getBasicInfo(videoId);

        // Get best audio format
        const format = info.streaming_data?.adaptive_formats
            ?.filter(f => f.mime_type?.includes('audio'))
            ?.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (!format) {
            throw new Error('No audio format available');
        }

        let audioUrl;
        if (format.decipher) {
            audioUrl = format.decipher(youtube.session.player);
        } else if (format.url) {
            audioUrl = format.url;
        } else {
            throw new Error('Cannot get audio URL');
        }

        // Redirect to audio URL
        res.redirect(audioUrl);
    } catch (e) {
        console.error('[Proxy] Stream error:', e.message);
        if (!res.headersSent) {
            res.status(500).send('Stream error: ' + e.message);
        }
    }
});

// Download endpoint - redirects to stream
app.get('/api/download/:videoId', (req, res) => {
    res.redirect(`/api/stream/${req.params.videoId}`);
});

// Initialize and start
initYT().then(() => {
    app.listen(PORT, () => {
        console.log(`External Proxy Server running on port ${PORT}`);
    });
}).catch(e => {
    console.error('Failed to initialize Innertube:', e);
    // Start anyway, will retry on first request
    app.listen(PORT, () => {
        console.log(`External Proxy Server running on port ${PORT} (Innertube will init on first request)`);
    });
});
