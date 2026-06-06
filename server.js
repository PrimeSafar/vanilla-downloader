// 1. ALL imports MUST be at the very top of the file
import express from 'express';
import { spawn } from 'child_process';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000; // Render automatically injects its own port number here

// 2. Middleware to read incoming JSON request bodies safely
app.use(express.json());

// Basic sanity-check route
app.get('/api/hello', (req, res) => {
    res.json({ message: "Hello from the backend!" });
});

// ==========================================
// POST ROUTE: LINK ANALYSIS (PROCESS BUTTON)
// ==========================================
app.post('/api/info', (req, res) => {
    // Safety Guard: Detect empty bodies instantly
    const VideoUrl = req.body ? req.body.url : null;

    if (!VideoUrl) {
        return res.status(400).json({ error: "URL is required!" });
    }

    console.log("Backend caught the link. Running optimized yt-dlp analysis for:", VideoUrl);

    // Spawn the child process tool globally for the cloud system layout
    const ytDlp = spawn('./bin/yt-dlp', [
        "--dump-json",
        "--no-playlist",
        "--no-check-certificates",
        "--extractor-args", "youtube:player_client=web,android",
        VideoUrl
    ]);

    let outputData = "";
    let errorData = "";
    
    ytDlp.on('error', (err) => {
        console.error("Failed to start yt-dlp binary:", err);
        return res.status(500).json({ error: "yt-dlp engine not found or failed to start." });
    });

    ytDlp.stderr.on('data', (chunk) => {
        errorData += chunk;
    });
    
    ytDlp.stdout.on('data', (chunk) => {
        outputData += chunk;
    });

    ytDlp.on('close', (code) => {
        console.log("yt-dlp process closed with exit code:", code);
        
        if (code !== 0) {
            console.error("yt-dlp error output:", errorData);
            return res.status(500).json({ 
                error: "YouTube extraction failed. Check your link or try another one.", 
                details: errorData 
            });
        }

        try {
            const fullData = JSON.parse(outputData);

            if (!fullData.formats) {
                return res.status(500).json({ error: "No downloadable formats found for this URL." });
            }

            // --- 1. SEPARATE & CLEAN MUSIC FORMATS ---
            let audioFormats = fullData.formats
                .filter(item => {
                    const noVideo = !item.vcodec || item.vcodec === 'none' || item.vcodec === null;
                    const hasAudio = item.acodec && item.acodec !== 'none' && item.acodec !== null;
                    return noVideo && hasAudio;
                })
                .map(item => ({
                    formatId: item.format_id,
                    quality: item.abr ? `${Math.round(item.abr)}kbps` : (item.tbr ? `${Math.round(item.tbr)}kbps` : '128kbps'),
                    ext: 'mp3'
                }));

            if (audioFormats.length === 0) {
                audioFormats = fullData.formats
                    .filter(item => item.acodec && item.acodec !== 'none' && item.acodec !== null)
                    .slice(0, 2)
                    .map(item => ({
                        formatId: item.format_id,
                        quality: item.abr ? `${Math.round(item.abr)}kbps` : '128kbps',
                        ext: 'mp3'
                    }));
            }

            audioFormats = audioFormats
                .sort((a, b) => (parseFloat(b.quality) || 0) - (parseFloat(a.quality) || 0))
                .slice(0, 3);

            // --- 2. SEPARATE & CLEAN VIDEO FORMATS ---
            let videoFormats = fullData.formats
                .filter(item => {
                    const hasVideo = item.vcodec && item.vcodec !== 'none' && item.vcodec !== null;
                    const hasAudio = item.acodec && item.acodec !== 'none' && item.acodec !== null;
                    return hasVideo && hasAudio && item.height;
                })
                .map(item => ({
                    formatId: item.format_id,
                    quality: `${item.height}p`,
                    ext: item.ext || 'mp4'
                }))
                .filter((v, i, a) => a.findIndex(t => t.quality === v.quality) === i)
                .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))
                .slice(0, 4);

            if (videoFormats.length === 0) {
                const bestVideoOnly = fullData.formats
                    .filter(item => item.vcodec && item.vcodec !== 'none' && item.height)
                    .sort((a, b) => (b.height || 0) - (a.height || 0))
                    .slice(0, 1)
                    .map(item => ({
                        formatId: item.format_id,
                        quality: `${item.height}p (No Audio)`,
                        ext: item.ext || 'mp4'
                    }));
                videoFormats.push(...bestVideoOnly);
            }

            // --- 3. RESPOND WITH CLEAN NORMALIZED JSON DATA ---
            const responsePayload = {
                message: "Data filtered successfully!",
                videoDetails: {
                    title: fullData.title || "Unknown Video",
                    thumbnail: fullData.thumbnail || "",
                    duration: fullData.duration_string || "0:00",
                },
                buttonFormats: {
                    music: audioFormats,
                    video: videoFormats
                }
            };

            console.log("=== API Response Data ===\n", JSON.stringify(responsePayload, null, 2));
            return res.status(200).json(responsePayload);

        } catch (error) {
            console.error("Parse error inside try block:", error);
            return res.status(500).json({ error: "Failed to parse YouTube data packet structures." });
        }
    });
});

// ==========================================================
// GET ROUTE: HIGH-SPEED SECURE DIRECT STREAM PIPELINE
// ==========================================================
app.get('/api/download', (req, res) => {
    const { formatId, url, title, type } = req.query;
    
    if (!formatId || !url || !type) {
        return res.status(400).send("Security parameters 'formatId', 'url', and 'type' are required.");
    }

    if (!/^\d+$/.test(formatId)) {
        return res.status(400).send("Security Violation: Invalid Format ID format pattern.");
    }

    if (!url.startsWith('https://youtube.com') && !url.startsWith('https://youtu.be') && !url.startsWith('https://youtube.com')) {
        return res.status(403).send("Security Violation: Resource request blocked outside YouTube ecosystem.");
    }

    const safeTitle = (title || 'media_file').replace(/[/\\?%*:|"<>]/g, '_');
    
    let ytDlpArgs = [];

    if (type === 'music') {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        
        ytDlpArgs = [
            '-f', formatId,
            '-x',
            '--audio-format', 'mp3',
            '-o', '-',
            '--no-playlist',
            '--no-check-certificates',
            '--extractor-args', "youtube:player_client=web,android",
            url
        ];
    } else {
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp4"`);
        
        ytDlpArgs = [
            '-f', formatId,
            '-o', '-',
            '--no-playlist',
            '--no-check-certificates',
            '--extractor-args', "youtube:player_client=web,android",
            url
        ];
    }

    console.log(`[INSTANT STREAM] Spawning cloud pipeline for file: ${safeTitle}`);
    const downloadProcess = spawn('./bin/yt-dlp', ytDlpArgs);

    downloadProcess.stdout.pipe(res);

    downloadProcess.stderr.on('data', (data) => {
        console.log(`[Stream Log]: ${data}`);
    });

    downloadProcess.on('error', (err) => {
        console.error("Downloader engine execution failed:", err);
        if (!res.headersSent) {
            res.status(500).send("Streaming pipeline crashed.");
        }
    });

    downloadProcess.on('close', (code) => {
        console.log(`Streaming channel process closed with status code: ${code}`);
    });
});

// Serve compiled static Vite frontend files out of the dist folder
const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'dist')));

// Fallback catch-all to route frontend refreshes cleanly back to your single page app index
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running smoothly on port ${PORT}`);
});
