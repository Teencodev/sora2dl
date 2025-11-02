const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();

// CORS – Cho phép tất cả
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '100mb' }));

// Health check
app.get('/', (req, res) => {
    res.json({ status: 'SoraSave API Ready – Based on Sora-Video-Downloader' });
});

// API chính – Dựa trên code SoraSave
app.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.match(/(s_[0-9A-Za-z_-]{8,})/)) {
        return res.status(400).json({ error: 'Invalid Sora URL' });
    }

    const videoCode = url.match(/(s_[0-9A-Za-z_-]{8,})/)[1];

    try {
        // BƯỚC 1: Thử CDN SoraSave (không watermark HD)
        let videoUrl = `https://oscdn.dyysy.com/MP4/${videoCode}.mp4`;
        let response;
        try {
            response = await axios.head(videoUrl, { timeout: 5000 });
            if (response.status === 200) {
                console.log('CDN success');
            } else {
                throw new Error('CDN not available');
            }
        } catch (err) {
            // Fallback: Thử proxy SoraSave
            videoUrl = `https://sorasave.site/sora/download.php?url=${encodeURIComponent(videoUrl)}`;
            response = await axios.head(videoUrl, { timeout: 10000 });
            if (response.status !== 200) {
                // Fallback cuối: Tải từ Sora gốc (có watermark, xóa bằng FFmpeg)
                videoUrl = `https://sora.chatgpt.com/video/${videoCode}.mp4`;
                console.log('Fallback to Sora original');
            }
        }

        // BƯỚC 2: Tải video stream
        const inputPath = `/tmp/input_${Date.now()}.mp4`;
        const outputPath = `/tmp/clean_${Date.now()}.mp4`;

        const writer = fs.createWriteStream(inputPath);
        const streamResponse = await axios({ url: videoUrl, method: 'GET', responseType: 'stream', timeout: 30000 });
        streamResponse.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // BƯỚC 3: Xóa watermark bằng FFmpeg (nếu fallback)
        const cmd = `ffmpeg -i "${inputPath}" -vf "delogo=x=W-w-20:y=H-h-20:w=140:h=50:alpha=0.8" -c:a copy "${outputPath}" -y`;
        await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
                fs.unlinkSync(inputPath);
                if (error || stderr.includes('Invalid data')) {
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    return reject(new Error('FFmpeg failed'));
                }
                resolve();
            });
        });

        // BƯỚC 4: Trả video sạch
        const buffer = fs.readFileSync(outputPath);
        const base64 = buffer.toString('base64');
        fs.unlinkSync(outputPath);

        res.json({
            cleanUrl: `data:video/mp4;base64,${base64}`,
            size: `${(buffer.length / 1024 / 1024).toFixed(1)} MB`,
            filename: `${videoCode}.mp4`
        });

    } catch (err) {
        res.status(500).json({ error: 'Download failed: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SoraSave API running on port ${PORT}`);
});
