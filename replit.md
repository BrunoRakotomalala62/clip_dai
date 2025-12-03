# clip_dai

## Project Overview
API de scraping Dailymotion pour rechercher et télécharger des clips vidéo de moins de 15 minutes.

## Endpoints API

### 1. Recherche de clips
```
GET /recherche?clip=<terme de recherche>
```
**Exemple:** `/recherche?clip=Naël clip`

**Réponse JSON:**
```json
{
  "recherche": "Naël clip",
  "total_resultats": 25,
  "filtre": "Vidéos de moins de 15 minutes uniquement",
  "resultats": [
    {
      "Titre": "Nael - MITETE (Official Video)",
      "Duree": "1:29",
      "Duree_secondes": 89,
      "Id_video": "x9bcqyw",
      "Image_url": "https://s1.dmcdn.net/.../x720",
      "Video_url": "https://www.dailymotion.com/video/x9bcqyw",
      "Embed_url": "https://geo.dailymotion.com/player.html?video=x9bcqyw"
    }
  ]
}
```

### 2. Téléchargement direct de vidéo
```
GET /download?video=<URL_VIDEO>&type=<MP3|MP4>&qualite=<360p|480p|720p|1080p>
```
**Paramètres:**
- `video` (requis): URL de la vidéo Dailymotion
- `type` (optionnel): MP3 ou MP4 (défaut: MP4)
- `qualite` (optionnel): 360p, 480p, 720p, 1080p (défaut: 360p)

**Exemple:** `/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4&qualite=720p`

**Note:** Le fichier se télécharge directement sur votre appareil (téléphone, ordinateur) sans passer par des services externes.

## Structure du Projet
```
clip_dai/
├── index.js          # Serveur Express avec les routes API
├── package.json      # Dépendances Node.js
├── vercel.json       # Configuration pour déploiement Vercel
└── replit.md         # Cette documentation
```

## Technologies
- Node.js 20
- Express.js 4.18
- Axios pour les requêtes HTTP
- FFmpeg pour la conversion vidéo/audio
- CORS activé

## API Dailymotion Utilisée
- Endpoint recherche: `https://api.dailymotion.com/videos`
- Endpoint metadata: `https://www.dailymotion.com/player/metadata/video/{id}`
- Pas de clé API requise
- Limite: 100 résultats par requête

## Fonctionnalités
- Recherche de vidéos Dailymotion
- Filtrage automatique des vidéos de moins de 15 minutes
- Téléchargement direct MP4 (streaming via FFmpeg)
- Conversion et téléchargement MP3 (extraction audio)
- Sélection de qualité (360p, 480p, 720p, 1080p avec fallback)

## Déploiement
- **Développement:** `npm start` (port 5000)
- **Vercel:** Configuré via vercel.json

## Configuration Keep-Alive (Anti-veille Render.com)
L'API inclut un système d'auto-ping pour éviter la mise en veille sur Render.com.

**Configuration sur Render.com:**
1. Dans les paramètres de votre service, ajoutez une variable d'environnement:
   - `API_URL` = `https://votre-app.onrender.com`
   
   OU Render.com définit automatiquement `RENDER_EXTERNAL_URL`

2. L'API se "pingera" automatiquement toutes les 14 minutes pour rester éveillée.

## Recent Changes
- **2025-12-03:** Ajout du système Keep-Alive auto-ping pour éviter la mise en veille sur Render.com
- **2025-12-02:** Implémentation du téléchargement direct via FFmpeg streaming
- **2025-12-02:** Support MP3 avec conversion audio en temps réel
- **2025-12-02:** Sélection de qualité vidéo avec fallback automatique
- **2025-12-02:** Création initiale de l'API avec routes /recherche et /download
