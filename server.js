const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const os = require('os');

const app = express();

// === CORS FIX – CHO PHÉP TẤT CẢ (HOẶC CHỈ sora2dl.com) ===
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); // hoặc 'https://sora2dl.com'
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
// =================================================

app.use(express.json({ limit: '100mb' }));

app.get('/', (req, res) => {
    res.json({ status: 'API Ready - SaveSora VN' });
});

app.post('/remove-watermark', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.includes('sora.chatgpt.com/p/s_')) {
        return res.status(400).json({ error: 'Invalid Sora URL' });
    }

    try {
        const videoId = url.split('/p/')[1];
        const directUrl = `https://sora.chatgpt.com/video/${videoId}.mp4`;

        // DÙNG CORS-ANYWHERE – BỎ CHẶN
        const proxyUrl = `https://cors-anywhere.herokuapp.com/${directUrl}`;
        let videoStream;
        try {
            const response = await axios({
                url: proxyUrl,
                method: 'GET',
                responseType: 'stream',
                headers: { 'Origin': 'https://sora2dl.com' },
                timeout: 30000
            });
            videoStream = response.data;
        } catch (err) {
            return res.status(404).json({ 
                error: 'Video không tải được. Thử lại sau 1 phút!' 
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
