const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();

// CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '100mb' }));

app.get('/', (req, res) => {
    res.json({ status: 'API Ready' });
});

app.post('/remove-watermark', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.includes('sora.chatgpt.com/p/')) {
        return res.status(400).json({ error: 'Invalid Sora URL' });
    }

    try {
        const videoId = url.split('/p/')[1];
        const directUrl = `https://sora.chatgpt.com/video/${videoId}.mp4`;

        // DÙNG PROXY cors.sh ĐỂ BỎ CHẶN
        const proxyUrl = `https://cors.sh/${directUrl}`;
        let videoStream;
        try {
            const response = await axios({
                url: proxyUrl,
                method: 'GET',
                responseType: 'stream',
                headers: { 'x-cors-api-key': 'temp_1234567890' },
                timeout: 20000
            });
            videoStream = response.data;
        } catch (err) {
            return res.status(404).json({ 
                error: 'Video không tải được. OpenAI chặn server. Thử lại sau 1 phút!' 
            });
        }

        const input = `/tmp/input_${Date.now()}.mp4`;
        const output = `/tmp/clean_${Date.now()}.mp4`;

        const writer = fs.createWriteStream(input);
        videoStream.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        // FFmpeg
        const cmd = `ffmpeg -i "${input}" -vf "delogo=x=W-w-20:y=H-h-20:w=140:h=50" -c:a copy "${output}" -y`;
        await new Promise((resolve, reject) => {
            exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
                fs.unlinkSync(input);
                if (error || stderr.includes('Invalid data')) {
                    if (fs.existsSync(output)) fs.unlinkSync(output);
                    return reject(new Error('FFmpeg failed'));
                }
                resolve();
            });
        });

        const buffer = fs.readFileSync(output);
        const base64 = buffer.toString('base64');
        fs.unlinkSync(output);

        res.json({
            cleanUrl: `data:video/mp4;base64,${base64}`,
            size: `${(buffer.length / 1024 / 1024).toFixed(1)} MB`
        });

    } catch (err) {
        res.status(500).json({ error: 'Server error: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    exec('ffmpeg -version', (err) => {
        console.log(err ? 'FFmpeg missing!' : 'FFmpeg OK');
    });
});
