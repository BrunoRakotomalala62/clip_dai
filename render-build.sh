#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Télécharger ffmpeg statique si non présent
if [ ! -f "./bin/ffmpeg" ]; then
    echo "FFmpeg non trouvé dans ./bin, installation de la version statique..."
    mkdir -p bin
    # Utilisation d'un miroir plus stable si possible ou vérification du téléchargement
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ -C bin --strip-components 1
    chmod +x bin/ffmpeg
    echo "FFmpeg installé avec succès dans ./bin"
else
    echo "FFmpeg est déjà présent dans ./bin"
fi
