# On utilise l'image officielle Playwright (tout est déjà installé !)
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

# Création du dossier de travail
WORKDIR /app

# Copie des fichiers de dépendances
COPY package*.json ./

# Installation des dépendances Node.js
RUN npm install

# Copie de TOUT le code vers le dossier /app
# Note : Il y a bien DEUX points séparés par un espace
COPY . .

# Exposition du port
EXPOSE 3000

# Lancement du serveur
CMD ["node", "server.js"]
