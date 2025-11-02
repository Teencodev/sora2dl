const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();

// ──────────────────────────────────────────────────────────────
// CORS – allow any origin (change to your domain if you prefer)
// ──────────────────────────────────────────────────────────────
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '100mb' }));

// ──────────────────────────────────────────────────────────────
// Simple health‑check endpoint
// ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'API Ready', ffmpeg: 'Checking...' });
});

// ──────────────────────────────────────────────────────────────
// Main endpoint – remove Sora watermark
// ──────────────────────────────────────────────────────────────
app.post('/remove-watermark', async (req, res) => {
    const { url } = req.body;

    // ---- Validate incoming URL ------------------------------------------------
    if (!url || !url.includes('sora.chatgpt.com/p/')) {
        return res.status(400).json({ error: 'Invalid Sora URL' });
    }

    try {
        // ---- Extract video ID ----------------------------------------------------
        const videoId = url.split('/p/')[1];
        const directUrl = `https://sora.chatgpt.com/video/${videoId}.mp4`;

        // ---- Download video (follow redirects automatically) --------------------
        let videoStream;
        try {
            const response = await axios({
                url: directUrl,
                method: 'GET',
                responseType: 'stream',
                maxRedirects: 5,          // follow 302/301 redirects
                timeout: 15000,
                validateStatus: status => status < 400
            });
            videoStream = response.data;
        } catch (err) {
            console.error('Video download failed:', err.response?.status || err.message);
            return res.status(404).json({
                error: 'Video not accessible. It may be private, deleted, or temporarily blocked.'
            });
        }

        // ---- Save stream to a temporary file ------------------------------------
        const inputPath = `/tmp/input_${Date.now()}.mp4`;
        const outputPath = `/tmp/clean_${Date.now()}.mp4`;

        const writer = fs.createWriteStream(inputPath);
        videoStream.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // ---- Run FFmpeg to remove the watermark ---------------------------------
        const ffmpegCmd = `ffmpeg -i "${inputPath}" -vf "delogo=x=W-w-20:y=H-h-20:w=140:h=50" -c:a copy "${outputPath}" -y`;

        await new Promise((resolve, reject) => {
            exec(ffmpegCmd, { timeout: 60000 }, (error, stdout, stderr) => {
                // Always delete the input file
                fs.unlinkSync(inputPath);

                if (error || stderr.includes('Invalid data')) {
                    console.error('FFmpeg error:', error?.message || stderr);
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    return reject(new Error('FFmpeg processing failed'));
                }
                resolve();
            });
        });

        // ---- Read the clean video and return it as base64 -----------------------
        const cleanBuffer = fs.readFileSync(outputPath);
        const base64 = cleanBuffer.toString('base64');
        fs.unlinkSync(outputPath);   // clean up

        res.json({
            cleanUrl: `data:video/mp4;base64,${base64}`,
            size: `${(cleanBuffer.length / 1024 / 1024).toFixed(1)} MB`
        });

    } catch (err) {
        console.error('Unexpected error:', err);
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

// ──────────────────────────────────────────────────────────────
// Start the server
// ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Verify FFmpeg is available
    exec('ffmpeg -version', (err, stdout) => {
        if (err) console.error('FFmpeg not found!');
        else console.log('FFmpeg OK');
    });
});
