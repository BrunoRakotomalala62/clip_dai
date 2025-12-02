const express = require('express');
const axios = require('axios');
const cors = require('cors');

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
                description: 'Télécharger une vidéo en MP3 ou MP4',
                exemple: '/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4&qualite=720p'
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

        const videoInfoUrl = `${DAILYMOTION_API}/video/${videoId}?fields=id,title,duration,stream_h264_url,stream_h264_hd_url,stream_h264_hd1080_url,stream_h264_hq_url,stream_h264_ld_url`;
        
        let videoInfo;
        try {
            const infoResponse = await axios.get(videoInfoUrl);
            videoInfo = infoResponse.data;
        } catch (e) {
            const basicInfoUrl = `${DAILYMOTION_API}/video/${videoId}?fields=id,title,duration`;
            const basicResponse = await axios.get(basicInfoUrl);
            videoInfo = basicResponse.data;
        }

        const embedUrl = `https://www.dailymotion.com/embed/video/${videoId}`;
        
        let playerHtml;
        try {
            const playerResponse = await axios.get(embedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            playerHtml = playerResponse.data;
        } catch (e) {
            playerHtml = '';
        }

        let streamUrls = {};
        
        const qualityRegex = /"qualities":\s*\{([^}]+)\}/g;
        const urlRegex = /"(\d+)":\s*\[\s*\{\s*"type":\s*"[^"]+",\s*"url":\s*"([^"]+)"/g;
        
        let match;
        while ((match = urlRegex.exec(playerHtml)) !== null) {
            streamUrls[match[1]] = match[2].replace(/\\/g, '');
        }

        const qualityMap = {
            '360p': '380',
            '480p': '480',
            '720p': '720',
            '1080p': '1080'
        };

        const requestedQuality = qualityMap[quality];
        let downloadUrl = streamUrls[requestedQuality];
        
        if (!downloadUrl) {
            const fallbackQualities = ['720', '480', '380', '240'];
            for (const q of fallbackQualities) {
                if (streamUrls[q]) {
                    downloadUrl = streamUrls[q];
                    break;
                }
            }
        }

        const downloadServices = [
            `https://www.savethevideo.com/dailymotion-downloader?url=${encodeURIComponent(video)}`,
            `https://dailymotiondownloader.net/en/?url=${encodeURIComponent(video)}`,
            `https://veedmate.com/dailymotion-video-downloader/?url=${encodeURIComponent(video)}`
        ];

        res.json({
            video_info: {
                id: videoId,
                titre: videoInfo.title || 'Titre non disponible',
                duree: videoInfo.duration ? formatDuration(videoInfo.duration) : 'Non disponible',
                url_originale: video
            },
            telechargement: {
                type_demande: fileType,
                qualite_demandee: quality,
                instruction: 'Pour télécharger la vidéo, utilisez un des services ci-dessous ou copiez le lien direct si disponible',
                lien_direct: downloadUrl || null,
                services_download: downloadServices,
                note_mobile: 'Sur mobile, utilisez un des liens de service de téléchargement puis enregistrez le fichier dans votre galerie'
            },
            comment_telecharger_mobile: {
                android: [
                    '1. Cliquez sur un des liens de service de téléchargement',
                    '2. Collez l\'URL de la vidéo si nécessaire',
                    '3. Sélectionnez la qualité et le format (MP3/MP4)',
                    '4. Appuyez sur "Télécharger"',
                    '5. Le fichier sera sauvegardé dans votre dossier Téléchargements'
                ],
                iphone: [
                    '1. Cliquez sur un des liens de service de téléchargement',
                    '2. Collez l\'URL de la vidéo si nécessaire',
                    '3. Sélectionnez la qualité et le format',
                    '4. Maintenez appuyé sur le bouton de téléchargement',
                    '5. Choisissez "Télécharger le fichier lié"',
                    '6. Le fichier sera dans l\'app Fichiers'
                ]
            }
        });

    } catch (error) {
        console.error('Erreur download:', error.message);
        res.status(500).json({
            error: 'Erreur lors de la préparation du téléchargement',
            message: error.message,
            suggestion: 'Essayez de copier l\'URL de la vidéo et utilisez un service de téléchargement en ligne'
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
    console.log(`  GET /download?video=<url>&type=<MP3|MP4>&qualite=<360p|480p|720p>`);
});
