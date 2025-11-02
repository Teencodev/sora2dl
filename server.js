const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const app = express();

// === CORS ===
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
// ============

app.use(express.json({ limit: '100mb' }));

app.get('/', (req, res) => {
    res.json({ status: 'API Ready', ffmpeg: 'Checking...' });
});

app.post('/remove-watermark', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.includes('sora.chatgpt.com/p/')) {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    try {
        const videoId = url.split('/p/')[1];
        const videoUrl = `https://sora.chatgpt.com/video/${videoId}.mp4`;

        // Kiểm tra video
        const head = await axios.head(videoUrl).catch(() => null);
        if (!head) return res.status(404).json({ error: 'Video not found' });

        const input = `/tmp/input_${Date.now()}.mp4`;
        const output = `/tmp/clean_${Date.now()}.mp4`;

        // Tải video
        const writer = fs.createWriteStream(input);
        const videoStream = await axios({ url: videoUrl, method: 'GET', responseType: 'stream' });
        videoStream.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // FFmpeg command
        const cmd = `ffmpeg -i "${input}" -vf "delogo=x=W-w-20:y=H-h-20:w=140:h=50" -c:a copy "${output}" -y`;

        // Chạy FFmpeg với log
        exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
            fs.unlinkSync(input);
            if (error || stderr.includes('Invalid data')) {
                console.error('FFmpeg Error:', error?.message || stderr);
                if (fs.existsSync(output)) fs.unlinkSync(output);
                return res.status(500).json({ error: 'FFmpeg failed: ' + (error?.message || stderr).slice(0, 100) });
            }

            const buffer = fs.readFileSync(output);
            const base64 = buffer.toString('base64');
            fs.unlinkSync(output);

            res.json({
                cleanUrl: `data:video/mp4;base64,${base64}`,
                size: `${(buffer.length / 1024 / 1024).toFixed(1)} MB`
            });
        });

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    // Test FFmpeg
    exec('ffmpeg -version', (err, stdout) => {
        if (err) console.error('FFmpeg not found!');
        else console.log('FFmpeg OK');
    });
});
