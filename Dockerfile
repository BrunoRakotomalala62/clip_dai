# Utiliser une image Node.js officielle comme base
FROM node:20-slim

# Installer FFmpeg et les dépendances système nécessaires
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Créer le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers de configuration des dépendances
COPY package*.json ./

# Installer les dépendances (y compris les dépendances de production uniquement)
RUN npm install --only=production

# Copier le reste du code source
COPY . .

# Créer le dossier bin pour FFmpeg (même si on utilise celui du système)
# pour assurer la compatibilité avec le code actuel qui cherche dans ./bin
RUN mkdir -p bin && ln -s /usr/bin/ffmpeg bin/ffmpeg

# Exposer le port sur lequel l'application tourne
EXPOSE 5000

# Commande de démarrage
CMD [ "npm", "start" ]
