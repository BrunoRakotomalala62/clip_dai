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

### 2. Téléchargement de vidéo
```
GET /download?video=<URL_VIDEO>&type=<MP3|MP4>&qualite=<360p|480p|720p|1080p>
```
**Paramètres:**
- `video` (requis): URL de la vidéo Dailymotion
- `type` (optionnel): MP3 ou MP4 (défaut: MP4)
- `qualite` (optionnel): 360p, 480p, 720p, 1080p (défaut: 360p)

**Exemple:** `/download?video=https://www.dailymotion.com/video/x9bcqyw&type=MP4&qualite=720p`

## Structure du Projet
```
clip_dai/
├── index.js          # Serveur Express avec les routes API
├── package.json      # Dépendances Node.js
├── vercel.json       # Configuration pour déploiement Vercel
├── web.html          # Référence structure page Dailymotion
└── replit.md         # Cette documentation
```

## Technologies
- Node.js 20
- Express.js 4.18
- Axios pour les requêtes HTTP
- CORS activé

## API Dailymotion Utilisée
- Endpoint: `https://api.dailymotion.com/videos`
- Pas de clé API requise pour la recherche basique
- Limite: 100 résultats par requête

## Déploiement
- **Développement:** `npm start` (port 5000)
- **Vercel:** Configuré via vercel.json

## Recent Changes
- **2025-12-02:** Création initiale de l'API avec routes /recherche et /download
