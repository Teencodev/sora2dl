const express = require('express');
const axios = require('axios');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const app = express();

// === CORS FIX - CHO PHÉP TẤT CẢ TÊN MIỀN ===
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});
// ===========================================

app.use(express.json({ limit: '100mb' }));

app.post('/remove-watermark', async (req, res) => {
    const { url } = req.body;
    if (!url || !url.includes('sora.chatgpt.com/p/')) {
        return res.status(400).json({ error: 'Invalid Sora URL!' });
    }

    try {
        const videoId = url.split('/p/')[1];
        const videoUrl = `https://sora.chatgpt.com/video/${videoId}.mp4`;

        const inputPath = path.join(os.tmpdir(), `input_${Date.now()}.mp4`);
        const outputPath = path.join(os.tmpdir(), `clean_${Date.now()}.mp4`);
        
        const videoRes = await axios({ 
            url: videoUrl, 
            method: 'GET', 
            responseType: 'stream' 
        });
        
        await new Promise((resolve, reject) => {
            videoRes.data.pipe(fs.createWriteStream(inputPath))
                .on('finish', resolve)
                .on('error', reject);
        });

        await new Promise((resolve, reject) => {
            const cmd = `ffmpeg -i "${inputPath}" -vf "delogo=x=W-w-20:y=H-h-20:w=140:h=50" -c:a copy "${outputPath}" -y`;
            exec(cmd, (err) => {
                fs.unlinkSync(inputPath);
                if (err) return reject(err);
                resolve();
            });
        });

        const cleanBuffer = fs.readFileSync(outputPath);
        const cleanBase64 = cleanBuffer.toString('base64');
        fs.unlinkSync(outputPath);

        res.json({
            cleanUrl: `data:video/mp4;base64,${cleanBase64}`,
            size: `${(cleanBuffer.length / 1024 / 1024).toFixed(1)} MB`
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Video processing failed: ' + err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
