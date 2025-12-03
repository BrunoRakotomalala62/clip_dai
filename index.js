const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const DAILYMOTION_API = 'https://api.dailymotion.com';
const MIN_DURATION_SECONDS = 2 * 60;
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

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Mo';
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
        const kb = bytes / 1024;
        return `${kb.toFixed(1)} Ko`;
    }
    return `${mb.toFixed(1)} Mo`;
}

function estimateVideoSize(durationSeconds, quality) {
    const bitrateMap = {
        '1080p': 4000,
        '720p': 2500,
        '480p': 1000,
        '360p': 600,
        '240p': 300
    };
    
    const bitrateKbps = bitrateMap[quality] || bitrateMap['360p'];
    const sizeBytes = (bitrateKbps * 1000 / 8) * durationSeconds;
    
    return {
        bytes: Math.round(sizeBytes),
        formatted: formatFileSize(sizeBytes)
    };
}

async function getVideoFileSize(streamUrl) {
    try {
        const response = await axios.head(streamUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.dailymotion.com/'
            },
            timeout: 5000
        });
        
        const contentLength = response.headers['content-length'];
        if (contentLength) {
            const bytes = parseInt(contentLength, 10);
            return {
                bytes: bytes,
                formatted: formatFileSize(bytes),
                source: 'exact'
            };
        }
        return null;
    } catch (error) {
        return null;
    }
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
                path: '/download?video=<URL_VIDEO>&type=<MP3|MP4>',
                description: 'Télécharger directement une vidéo en MP3 ou MP4 (qualité 360p)',
                exemple: '/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4',
                note: 'Le fichier se télécharge directement sur votre appareil en qualité 360p'
            },
            videoinfo: {
                method: 'GET',
                path: '/videoinfo?video=<URL_VIDEO_OU_ID>',
                description: 'Obtenir les informations détaillées d\'une vidéo (qualité 360p)',
                exemple: '/videoinfo?video=x9bcqyw'
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
            .filter(video => video.duration >= MIN_DURATION_SECONDS && video.duration <= MAX_DURATION_SECONDS)
            .map(video => {
                const taille360p = estimateVideoSize(video.duration, '360p');
                
                return {
                    Titre: video.title,
                    Duree: formatDuration(video.duration),
                    Duree_secondes: video.duration,
                    Id_video: video.id,
                    Image_url: video.thumbnail_360_url || video.thumbnail_url,
                    Video_url: video.url,
                    Embed_url: video.embed_url,
                    Taille_estimee_360p: taille360p.formatted
                };
            });

        res.json({
            recherche: searchQuery,
            total_resultats: videosFiltered.length,
            filtre: 'Vidéos entre 2 et 15 minutes uniquement',
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
        const { video, type = 'MP4' } = req.query;
        
        if (!video) {
            return res.status(400).json({
                error: 'Paramètre manquant',
                message: 'Veuillez fournir l\'URL de la vidéo avec le paramètre "video"',
                exemple: '/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4'
            });
        }

        const validTypes = ['MP3', 'MP4'];
        const fileType = type.toUpperCase();
        const quality = '360p';
        
        if (!validTypes.includes(fileType)) {
            return res.status(400).json({
                error: 'Type invalide',
                message: 'Le type doit être MP3 ou MP4',
                types_valides: validTypes
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

app.get('/videoinfo', async (req, res) => {
    try {
        const { video } = req.query;
        
        if (!video) {
            return res.status(400).json({
                error: 'Paramètre manquant',
                message: 'Veuillez fournir l\'URL ou l\'ID de la vidéo avec le paramètre "video"',
                exemple: '/videoinfo?video=x9bcqyw'
            });
        }

        let videoId = video;
        const urlMatch = video.match(/dailymotion\.com\/video\/([a-zA-Z0-9]+)/);
        if (urlMatch) {
            videoId = urlMatch[1];
        }

        const metadataUrl = `https://www.dailymotion.com/player/metadata/video/${videoId}`;
        
        const response = await axios.get(metadataUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json',
                'Referer': 'https://www.dailymotion.com/'
            }
        });
        
        const data = response.data;
        const title = data.title || 'video';
        const duration = data.duration || 0;
        
        const taille360p = estimateVideoSize(duration, '360p');
        
        let disponible360p = false;
        if (data.qualities && data.qualities['380']) {
            disponible360p = true;
        }

        res.json({
            video_id: videoId,
            titre: title,
            duree: formatDuration(duration),
            duree_secondes: duration,
            qualite: '360p',
            disponible: disponible360p,
            taille_estimee: taille360p.formatted,
            taille_bytes: taille360p.bytes,
            note: 'Taille estimée basée sur le bitrate moyen 360p'
        });

    } catch (error) {
        console.error('Erreur videoinfo:', error.message);
        res.status(500).json({
            error: 'Erreur lors de la récupération des informations',
            message: error.message
        });
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
            .filter(v => v.duration >= MIN_DURATION_SECONDS && v.duration <= MAX_DURATION_SECONDS)
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
    console.log(`  GET /download?video=<url>&type=<MP3|MP4> - Téléchargement direct (360p uniquement)`);
    console.log(`  GET /videoinfo?video=<id> - Informations vidéo (360p)`);
});
