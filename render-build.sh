#!/usr/bin/env bash
# exit on error
set -o errexit

npm install

# Télécharger ffmpeg statique si non présent
if ! command -v ffmpeg &> /dev/null
then
    echo "FFmpeg non trouvé, installation de la version statique..."
    mkdir -p bin
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ -C bin --strip-components 1
    export PATH=$PATH:$(pwd)/bin
else
    echo "FFmpeg est déjà installé"
fi
