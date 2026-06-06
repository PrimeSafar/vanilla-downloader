// 1. ALL imports MUST be at the very top of the file
import express from 'express';
import { spawn } from 'child_process';

const app = express();
const PORT = 3000;

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

    // Spawn the child process tool with reliable anti-blocking player flags
    const ytDlp = spawn('./bin/yt-dlp', [
        "--dump-json",
        "--no-playlist",
        "--no-check-certificates",
        "--js-runtime", "node",
        "--extractor-args", "youtube:player_client=web,android",
        VideoUrl
    ]);

    let outputData = "";
    let errorData = "";
    
    // Prevent crashes if the yt-dlp binary is completely missing
    ytDlp.on('error', (err) => {
        console.error("Failed to start yt-dlp binary:", err);
        return res.status(500).json({ error: "yt-dlp engine not found or failed to start." });
    });

    // Capture error output from the stream
    ytDlp.stderr.on('data', (chunk) => {
        errorData += chunk;
    });
    
    // Capture successful text data from the stream
    ytDlp.stdout.on('data', (chunk) => {
        outputData += chunk;
    });

    // Wait until the program finishes running completely before processing arrays
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
            // Convert raw string package into a usable JavaScript object
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

            // CRUCIAL FALLBACK: If YouTube hid separate audio tracks, extract audio from the video streams instead
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

            // Organize audio elements cleanly
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
                .filter((v, i, a) => a.findIndex(t => t.quality === v.quality) === i) // Remove duplicate heights
                .sort((a, b) => (parseInt(b.quality) || 0) - (parseInt(a.quality) || 0))
                .slice(0, 4);

            // VIDEO FALLBACK: If no streams contain sound natively, pull the highest video-only file 
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

            // CONSOLE LOG FOR RESPONSE INSPECTION:
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
    
    // 1. Structural Parameter Validation
    if (!formatId || !url || !type) {
        return res.status(400).send("Security parameters 'formatId', 'url', and 'type' are required.");
    }

    // 2. Strict Input Validation (Guards against terminal manipulation exploits)
    if (!/^\d+$/.test(formatId)) {
        return res.status(400).send("Security Violation: Invalid Format ID format pattern.");
    }

    // 3. SSRF / Domain Validation Guard (Ensures users only download from YouTube)
    if (!url.startsWith('https://youtube.com') && !url.startsWith('https://youtu.be') && !url.startsWith('https://youtube.com')) {
        return res.status(403).send("Security Violation: Resource request blocked outside YouTube ecosystem.");
    }

    // Clean special characters out of file titles safely
    const safeTitle = (title || 'media_file').replace(/[/\\?%*:|"<>]/g, '_');
    
    let ytDlpArgs = [];

    if (type === 'music') {
        // Set MP3 download file response attachment rules
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp3"`);
        
        ytDlpArgs = [
            '-f', formatId,
            '-x',                    // Extract pure audio track buffer
            '--audio-format', 'mp3',   // Convert incoming stream container straight to pure MP3 audio bits
            '-o', '-',               // Pipe directly to node standard output
            '--no-playlist',
            '--no-check-certificates',
            '--js-runtime', 'node',
            '--extractor-args', "youtube:player_client=web,android",
            url
        ];
    } else {
        // Set MP4 download video response attachment rules
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}.mp4"`);
        
        ytDlpArgs = [
            '-f', formatId,
            '-o', '-',               // Pipe directly to node standard output
            '--no-playlist',
            '--no-check-certificates',
            '--js-runtime', 'node',
            '--extractor-args', "youtube:player_client=web,android",
            url
        ];
    }

    console.log(`[INSTANT STREAM STARTING] Spawning pipeline for file download name: ${safeTitle}`);

    // Spawn the downloading terminal worker directly
    const downloadProcess = spawn('./bin/yt-dlp', ytDlpArgs);

    // Dynamic direct pipe connection! Stream directly into the browser hard-drive window bit-by-bit
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

// Serve frontend assets automatically
app.use(express.static(import.meta.dirname)); 

app.listen(PORT, () => {
