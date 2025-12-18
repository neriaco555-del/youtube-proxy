/**
 * External Proxy Server for YouTube Downloads
 * Deploy this on a cloud service (Render, Railway, Vercel, etc.)
 * Uses play-dl for streaming (no external binary needed)
 */

const express = require('express');
const cors = require('cors');
const ytsr = require('ytsr');
const play = require('play-dl');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

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

// Get audio URL using play-dl
app.get('/api/audio-url/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Audio URL: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const info = await play.video_info(url);

        // Get highest quality audio format
        const format = info.format.filter(f => f.mimeType?.includes('audio'))
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

        if (format && format.url) {
            res.json({ url: format.url, videoId });
        } else {
            throw new Error('No audio format found');
        }
    } catch (e) {
        console.error('[Proxy] Audio URL error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// Stream audio directly using play-dl
app.get('/api/stream/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Stream: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).send('Invalid video ID');
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const stream = await play.stream(url, { quality: 2 });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');

        stream.stream.pipe(res);

        stream.stream.on('error', (err) => {
            console.error('[Proxy] Stream error:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Stream error');
            }
        });

        res.on('close', () => {
            stream.stream.destroy();
        });
    } catch (e) {
        console.error('[Proxy] Stream setup error:', e.message);
        if (!res.headersSent) {
            res.status(500).send('Stream error');
        }
    }
});

// Download endpoint - just streams for now
app.get('/api/download/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Download: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).send('Invalid video ID');
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const stream = await play.stream(url, { quality: 2 });

        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${videoId}.mp3"`);

        stream.stream.pipe(res);

        stream.stream.on('error', (err) => {
            console.error('[Proxy] Download error:', err.message);
            if (!res.headersSent) {
                res.status(500).send('Download error');
            }
        });
    } catch (e) {
        console.error('[Proxy] Download setup error:', e.message);
        if (!res.headersSent) {
            res.status(500).send('Download error');
        }
    }
});

app.listen(PORT, () => {
    console.log(`External Proxy Server running on port ${PORT}`);
});
