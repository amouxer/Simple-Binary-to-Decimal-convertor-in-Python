# PalaCraft Launcher

Launcher Minecraft premium style Paladium / NationGlory pour serveur PvP-Faction en 1.7.10.

![Electron](https://img.shields.io/badge/Electron-28-blue)
![Minecraft](https://img.shields.io/badge/Minecraft-1.7.10-green)
![Forge](https://img.shields.io/badge/Forge-10.13.4.1614-orange)

## Fonctionnalites

- **Connexion Microsoft OAuth** : Authentification complete via Microsoft (Xbox Live + Minecraft Services)
- **Mode Offline** : Connexion sans compte Microsoft pour les joueurs crack
- **Installation automatique** : Minecraft 1.7.10 + Forge + mods installes automatiquement
- **Barre de progression** : Suivi detaille de l'installation (assets, libraries, Forge, mods)
- **Interface NationGlory** : UI moderne avec sidebar, pages, animations et theme sombre
- **Systeme de grades** : Joueur, VIP, VIP+, MVP avec permissions detaillees
- **Boutique integree** : Grades, cosmetiques et boosters disponibles
- **Auto-updater** : Mise a jour automatique du launcher via GitHub Releases
- **Actualites** : Fil d'actualites du serveur integre
- **Profil joueur** : Stats, niveau, kills, temps de jeu
- **Parametres** : RAM, Java, resolution, plein ecran, auto-connexion

## Structure du Projet

```
palacraft-launcher/
├── main.js                    # Process principal Electron
├── preload.js                 # Bridge IPC securise
├── package.json               # Config et dependances
├── src/
│   ├── auth/
│   │   └── AuthManager.js     # Microsoft OAuth + Offline login
│   ├── installer/
│   │   └── MinecraftInstaller.js  # Install MC 1.7.10 + Forge + Mods
│   ├── server/
│   │   └── ServerManager.js   # Server ping, news, shop, grades
│   ├── updater/               # Auto-updater (via electron-updater)
│   ├── assets/
│   │   └── images/            # Icones et images
│   └── ui/
│       ├── css/
│       │   ├── common.css     # Styles globaux
│       │   ├── login.css      # Page de connexion
│       │   └── main.css       # Page principale
│       ├── js/
│       │   ├── particles.js   # Fond anime avec particules
│       │   ├── notifications.js  # Systeme de notifications
│       │   ├── login.js       # Logique page login
│       │   └── main.js        # Logique page principale
│       └── pages/
│           ├── login.html     # Page de connexion
│           └── main.html      # Page principale (accueil, boutique, grades, etc.)
```

## Installation pour le developpement

```bash
# Cloner le repo
git clone https://github.com/amouxer/palacraft-launcher.git
cd palacraft-launcher

# Installer les dependances
npm install

# Lancer en mode dev
npm start
```

## Build

```bash
# Windows
npm run build:win

# Linux
npm run build:linux

# macOS
npm run build:mac
```

## Configuration du serveur

Modifiez les constantes dans `main.js` :

```javascript
const LAUNCHER_CONFIG = {
  serverIp: 'play.palacraft.fr',    // IP du serveur
  serverPort: 25565,                  // Port du serveur
  mcVersion: '1.7.10',               // Version Minecraft
  forgeVersion: '10.13.4.1614',      // Version Forge
};
```

## Ajout de mods

Ajoutez vos mods dans `src/installer/MinecraftInstaller.js` :

```javascript
const MODS = [
  {
    name: 'ironchest-1.7.10-6.0.62.742-universal.jar',
    url: 'https://votre-url/mod.jar',
    fallbackUrl: 'https://url-de-secours/mod.jar',
  },
  // Ajoutez d'autres mods ici
];
```

## Mods inclus

| Mod | Version | Description |
|-----|---------|-------------|
| Iron Chest | 6.0.62.742 | Coffres ameliores en differents metaux |

## Microsoft OAuth

Le launcher utilise l'authentification Microsoft complete :

1. Obtention du code d'autorisation via fenetre OAuth
2. Echange contre des tokens Microsoft
3. Authentification Xbox Live (XBL)
4. Obtention du token XSTS
5. Authentification aupres des services Minecraft
6. Recuperation du profil joueur

## Technologies

- **Electron 28** : Framework desktop cross-platform
- **Node.js** : Backend du launcher
- **axios** : Requetes HTTP
- **adm-zip** : Extraction des archives Forge
- **electron-updater** : Auto-mise a jour
- **electron-log** : Journalisation

## Licence

MIT
