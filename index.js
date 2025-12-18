/**
 * External Proxy Server for YouTube Downloads
 * Deploy this on a cloud service (Render, Railway, Vercel, etc.)
 * that has access to YouTube
 */

const express = require('express');
const cors = require('cors');
const ytdlp = require('yt-dlp-exec');
const ytsr = require('ytsr');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
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

// Get audio URL
app.get('/api/audio-url/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Audio URL: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).json({ error: 'Invalid video ID' });
    }

    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const result = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio[ext=m4a]/bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true
        });

        res.json({ url: result.trim(), videoId });
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
        const url = `https://www.youtube.com/watch?v=${videoId}`;

        // Get audio URL and redirect
        const result = await ytdlp(url, {
            getUrl: true,
            format: 'bestaudio[ext=m4a]/bestaudio/best',
            noCheckCertificates: true,
            noWarnings: true
        });

        const audioUrl = result.trim();
        res.redirect(audioUrl);
    } catch (e) {
        console.error('[Proxy] Stream error:', e.message);
        res.status(500).send('Stream error');
    }
});

// Download audio file
app.get('/api/download/:videoId', async (req, res) => {
    const videoId = req.params.videoId;
    console.log(`[Proxy] Download: ${videoId}`);

    if (!videoId || videoId.length !== 11) {
        return res.status(400).send('Invalid video ID');
    }

    const outputPath = path.join(DOWNLOADS_DIR, `${videoId}.mp3`);

    try {
        // Check cache
        if (fs.existsSync(outputPath)) {
            return res.sendFile(outputPath);
        }

        const url = `https://www.youtube.com/watch?v=${videoId}`;

        await ytdlp(url, {
            extractAudio: true,
            audioFormat: 'mp3',
            audioQuality: 0,
            output: outputPath.replace('.mp3', '.%(ext)s'),
            noCheckCertificates: true,
            noWarnings: true
        });

        // Find the downloaded file
        const files = fs.readdirSync(DOWNLOADS_DIR);
        const downloadedFile = files.find(f => f.startsWith(videoId));

        if (downloadedFile) {
            const actualPath = path.join(DOWNLOADS_DIR, downloadedFile);
            if (actualPath !== outputPath && fs.existsSync(actualPath)) {
                fs.renameSync(actualPath, outputPath);
            }
            return res.sendFile(outputPath);
        }

        res.status(500).send('Download failed');
    } catch (e) {
        console.error('[Proxy] Download error:', e.message);
        res.status(500).send('Download error');
    }
});

app.listen(PORT, () => {
    console.log(`External Proxy Server running on port ${PORT}`);
});
