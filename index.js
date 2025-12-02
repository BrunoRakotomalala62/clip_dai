const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const DAILYMOTION_API = 'https://api.dailymotion.com';
const MAX_DURATION_SECONDS = 15 * 60;

function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9\u00C0-\u024F\s\-_]/g, '').trim().substring(0, 100) || 'video';
}

async function getVideoStreamUrl(videoId, requestedQuality = '360p') {
    const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
    
    const qualityMap = {
        '1080p': '1080',
        '720p': '720',
        '480p': '480',
        '360p': '380',
        '240p': '240'
    };
    
    try {
        const response = await axios.get(metadataUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.dailymotion.com/'
            }
        });
        
        const data = response.data;
        const title = data.title || 'video';
        const duration = data.duration || 0;
        
        let streamUrl = null;
        let selectedQuality = null;
        
        if (data.qualities) {
            const qualities = data.qualities;
            const targetQuality = qualityMap[requestedQuality] || '380';
            
            if (qualities[targetQuality] && Array.isArray(qualities[targetQuality])) {
                for (const stream of qualities[targetQuality]) {
                    if (stream.url) {
                        streamUrl = stream.url;
                        selectedQuality = requestedQuality;
                        break;
                    }
                }
            }
            
            if (!streamUrl) {
                const fallbackOrder = ['1080', '720', '480', '380', '240', 'auto'];
                for (const q of fallbackOrder) {
                    if (qualities[q] && Array.isArray(qualities[q])) {
                        for (const stream of qualities[q]) {
                            if (stream.url) {
                                streamUrl = stream.url;
                                selectedQuality = Object.keys(qualityMap).find(key => qualityMap[key] === q) || q;
                                break;
                            }
                        }
                        if (streamUrl) break;
                    }
                }
            }
        }
        
        return { streamUrl, title, duration, selectedQuality };
    } catch (error) {
        console.error('Erreur metadata:', error.message);
        return { streamUrl: null, title: 'video', duration: 0, selectedQuality: null };
    }
}

app.get('/', (req, res) => {
    res.json({
        message: 'Bienvenue sur clip_dai API',
        endpoints: {
            recherche: {
                method: 'GET',
                path: '/recherche?clip=<terme de recherche>',
                description: 'Rechercher des clips Dailymotion (moins de 15 minutes)',
                exemple: '/recherche?clip=Naël clip'
            },
            download: {
                method: 'GET',
                path: '/download?video=<URL_VIDEO>&type=<MP3|MP4>&qualite=<360p|480p|720p>',
                description: 'Télécharger directement une vidéo en MP3 ou MP4',
                exemple: '/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4&qualite=720p',
                note: 'Le fichier se télécharge directement sur votre appareil'
            }
        }
    });
});

app.get('/recherche', async (req, res) => {
    try {
        const searchQuery = req.query.clip;
        
        if (!searchQuery) {
            return res.status(400).json({
                error: 'Paramètre manquant',
                message: 'Veuillez fournir un terme de recherche avec le paramètre "clip"',
                exemple: '/recherche?clip=Naël clip'
            });
        }

        const fields = 'id,title,duration,thumbnail_url,thumbnail_360_url,thumbnail_720_url,url,embed_url';
        const limit = 100;
        
        const apiUrl = `${DAILYMOTION_API}/videos?search=${encodeURIComponent(searchQuery)}&fields=${fields}&limit=${limit}`;
        
        const response = await axios.get(apiUrl);
        const data = response.data;
        
        const videosFiltered = data.list
            .filter(video => video.duration <= MAX_DURATION_SECONDS)
            .map(video => ({
                Titre: video.title,
                Duree: formatDuration(video.duration),
                Duree_secondes: video.duration,
                Id_video: video.id,
                Image_url: video.thumbnail_720_url || video.thumbnail_360_url || video.thumbnail_url,
                Video_url: video.url,
                Embed_url: video.embed_url
            }));

        res.json({
            recherche: searchQuery,
            total_resultats: videosFiltered.length,
            filtre: 'Vidéos de moins de 15 minutes uniquement',
            resultats: videosFiltered
        });

    } catch (error) {
        console.error('Erreur recherche:', error.message);
        res.status(500).json({
            error: 'Erreur lors de la recherche',
            message: error.message
        });
    }
});

app.get('/download', async (req, res) => {
    try {
        const { video, type = 'MP4', qualite = '360p' } = req.query;
        
        if (!video) {
            return res.status(400).json({
                error: 'Paramètre manquant',
                message: 'Veuillez fournir l\'URL de la vidéo avec le paramètre "video"',
                exemple: '/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4&qualite=720p'
            });
        }

        const validTypes = ['MP3', 'MP4'];
        const validQualities = ['360p', '480p', '720p', '1080p'];
        
        const fileType = type.toUpperCase();
        const quality = qualite.toLowerCase();
        
        if (!validTypes.includes(fileType)) {
            return res.status(400).json({
                error: 'Type invalide',
                message: 'Le type doit être MP3 ou MP4',
                types_valides: validTypes
            });
        }
        
        if (!validQualities.includes(quality)) {
            return res.status(400).json({
                error: 'Qualité invalide',
                message: 'La qualité doit être 360p, 480p, 720p ou 1080p',
                qualites_valides: validQualities
            });
        }

        let videoId = video;
        const urlMatch = video.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
            videoId = urlMatch[1];
        }

        console.log(`Téléchargement vidéo: ${videoId}, type: ${fileType}, qualité: ${quality}`);
        
        const { streamUrl, title, duration, selectedQuality } = await getVideoStreamUrl(videoId, quality);
        
        if (!streamUrl) {
            return res.status(404).json({
                error: 'Stream non disponible',
                message: 'Impossible de récupérer le lien de téléchargement pour cette vidéo',
                video_id: videoId
            });
        }

        console.log(`Stream URL trouvée, durée: ${duration}s, qualité: ${selectedQuality}`);
        
        const safeTitle = sanitizeFilename(title);
        const filename = `${safeTitle}.${fileType.toLowerCase()}`;
        
        let ffmpegArgs;
        
        if (fileType === 'MP4') {
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            
            ffmpegArgs = [
                '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                '-i', streamUrl,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-bsf:a', 'aac_adtstoasc',
                '-movflags', 'frag_keyframe+empty_moov+faststart',
                '-f', 'mp4',
                'pipe:1'
            ];
        } else {
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
            
            ffmpegArgs = [
                '-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                '-i', streamUrl,
                '-vn',
                '-acodec', 'libmp3lame',
                '-ab', '192k',
                '-f', 'mp3',
                'pipe:1'
            ];
        }
        
        console.log('Démarrage FFmpeg streaming...');
        
        const ffmpeg = spawn('ffmpeg', ffmpegArgs);
        
        ffmpeg.stdout.pipe(res);
        
        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('frame=') || output.includes('time=')) {
                const timeMatch = output.match(/time=(\d+:\d+:\d+\.\d+)/);
                if (timeMatch) {
                    console.log(`Progression: ${timeMatch[1]}`);
                }
            }
        });
        
        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log('Téléchargement terminé avec succès');
            } else {
                console.error('FFmpeg terminé avec code:', code);
            }
        });
        
        ffmpeg.on('error', (err) => {
            console.error('FFmpeg erreur:', err.message);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Erreur FFmpeg' });
            }
        });
        
        req.on('close', () => {
            ffmpeg.kill('SIGKILL');
            console.log('Client déconnecté, FFmpeg arrêté');
        });

    } catch (error) {
        console.error('Erreur download:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Erreur lors du téléchargement',
                message: error.message
            });
        }
    }
});

app.get('/api/search', async (req, res) => {
    const { q, limit = 50 } = req.query;
    
    if (!q) {
        return res.status(400).json({ error: 'Paramètre q manquant' });
    }
    
    try {
        const fields = 'id,title,duration,thumbnail_720_url,url';
        const apiUrl = `${DAILYMOTION_API}/videos?search=${encodeURIComponent(q)}&fields=${fields}&limit=${limit}`;
        
        const response = await axios.get(apiUrl);
        const videos = response.data.list
            .filter(v => v.duration <= MAX_DURATION_SECONDS)
            .map(v => ({
                id: v.id,
                title: v.title,
                duration: v.duration,
                thumbnail: v.thumbnail_720_url,
                url: v.url
            }));
        
        res.json({ results: videos });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`clip_dai API démarré sur le port ${PORT}`);
    console.log(`Routes disponibles:`);
    console.log(`  GET / - Documentation API`);
    console.log(`  GET /recherche?clip=<terme> - Rechercher des clips`);
    console.log(`  GET /download?video=<url>&type=<MP3|MP4>&qualite=<360p|480p|720p> - Téléchargement direct`);
});
