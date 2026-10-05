# ⚡ FOR2D ROYAL — Battle Royale 2D Multijoueur

**FOR2D ROYAL** est un jeu web Battle Royale 2D en vue du dessus (Top-Down) inspiré de l'univers de *Fortnite*. Développé en HTML5 Canvas et JavaScript moderne, il intègre un moteur de jeu fluide, des graphismes vectoriels soignés, une ambiance sonore spatiale et un système **multijoueur temps réel en WebSocket** propulsé par **Node.js**.

---

## 🎯 Fonctionnalités Clés

### 🕹️ Gameplay Battle Royale Complet
- **Largage Aérien & Planeur** : Départ synchronisé dans le vaisseau de transport avec trajectoire commune, phase de chute libre et déploiement du planeur.
- **Carte Procédurale & Bâtiments** : Génération de terrain par bruit de Perlin (biomes herbe, sable, eau, toits traversables et intérieurs masqués).
- **Arsenal & Butin** : 
  - Armes par raretés (Fusil d'assaut, Fusil à pompe, Sniper, Pistolet-mitrailleur, Lance-roquettes, Pioche).
  - Objets de soin et bouclier (Mini-potions, Grosse potion, Bandages, Kit de soins).
  - Coffres sonores avec butin animé.
- **Zone de Corruption (Tempête)** : Rétrécissement progressif en plusieurs phases avec dégâts continus et ambiance sonore dédiée.
- **Escouades & Réanimation (DBNO)** :
  - Modes **Solo**, **Duo**, **Trio** et **Section** (1 à 4 joueurs).
  - Système de K.O. : les joueurs à terre rampent à 4 pattes à vitesse réduite et peuvent être réanimés par leurs alliés.
  - Indicateurs directionnels à l'écran pointant vers les coéquipiers hors champ.
- **Bots Intelligents** : IA autonome avec ciblage, ouverture de coffres, suivi d'escouade et repli stratégique en zone sûre.
- **Mode Spectateur & Écran de Fin** : Statistiques complètes de la partie (éliminations, dégâts, survie, coffres, XP) et caméra spectateur dynamique après élimination.

---

### 🎨 Casier, Boutique & Cosmétiques
- **Personnalisation** : Skins de personnages, pioches originales animées, planeurs et sacs à dos.
- **Boutique d'Objets & Passe de Combat** : Progression par niveaux et acquisition de cosmétiques.
- **Codes Secrets** : Système de récompenses sécurisé par empreintes cryptographiques `scrypt` côté serveur.

---

### 🌐 Multijoueur Temps Réel (Node.js + WebSockets)
- **Codes de Salle à 6 Caractères** : Création instantanée de salon privé, partage par simple code ou lien direct (`https://mon-site.com/#party=CODE`).
- **Attribution des Rôles** : Gestion d'escouade avec couleur de slot unique (Slot 1 : Cyan, Slot 2 : Jaune, Slot 3 : Rose, Slot 4 : Vert).
- **Synchronisation Haute Fréquence (20 Hz)** : Déplacements, visée, tirs, largage, réanimations et états de santé relayés instantanément.
- **Sauvegarde Navigateur (`localStorage`)** :
  - Aucune base de données complexe requise.
  - Pop-up de bienvenue lors de la première connexion pour choisir son pseudo de combat avec avertissement sur la persistance locale des données.

---

## 🎮 Commandes de Jeu

### 🏠 Dans le Salon (Lobby)
| Action | Raccourci |
|---|---|
| Changer le statut Prêt / Pas Prêt | `Clic sur PRÊT` ou `Ctrl + Entrée` |
| Plein écran | `F11` |
| Ouvrir le Casier / Boutique / Paramètres | `Clic sur les onglets du haut` |

### ⚔️ En Partie
| Action | Touche / Contrôle |
|---|---|
| **Se déplacer** | `Z, Q, S, D` ou `W, A, S, D` ou `Touches Fléchées` |
| **Viser** | `Souris` (orientation du regard et du réticule) |
| **Tirer / Frapper** | `Clic gauche` |
| **Sauter du vaisseau** | `Espace` ou `Clic gauche` |
| **Interagir / Ramasser / Réanimer** | `E` ou `F` (maintenir pour réanimer un allié K.O.) |
| **Recharger** | `R` |
| **Sélectionner un objet** | `1, 2, 3, 4, 5` ou `Molette de la souris` |
| **Inventaire détaillé** | `I` ou `Clic molette` |
| **Ouvrir la Carte** | `M` ou `Tab` |
| **Couper / Activer le son** | `N` |
| **Menu des Paramètres** | `P` ou `Échap` |

---

## 🚀 Installation & Lancement en Local

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée).

### Étapes
1. Ouvrez un terminal dans le dossier du jeu :
   ```bash
   npm install
   ```
2. Démarrez le serveur :
   ```bash
   npm start
   ```
3. Ouvrez votre navigateur sur :
   - Sur votre ordinateur : `http://localhost:3000`
   - Depuis un autre appareil sur le même réseau WiFi : `http://VOTRE_IP_LOCALE:3000`

---

## ☁️ Déploiement sur Hostinger (Plan Business Node.js)

Le serveur est nativement configuré pour écouter sur `process.env.PORT` et gérer simultanément les requêtes Web et WebSocket derrière le reverse proxy d'Hostinger.

### Étapes de configuration sur Hostinger :
1. **Téléversez les fichiers** dans le répertoire de votre site (via le Gestionnaire de Fichiers, FTP ou Git).
2. Dans le panneau de contrôle **hPanel**, ouvrez la section **Node.js** :
   - **Version de Node.js** : Sélectionnez **Node.js 18.x** ou **20.x**.
   - **Application root** : Le dossier contenant votre jeu (ex. `public_html`).
   - **Application startup file** : `server/server.js`.
3. Cliquez sur **NPM Install** pour installer la dépendance `ws`.
4. Cliquez sur **Start / Restart Application**.
5. Votre jeu est immédiatement accessible en `https://` avec le multijoueur actif sur `wss://` !

---

## 📁 Structure du Projet

```
For2DRoyal/
├── index.html              # Interface du salon (Lobby, Casier, Boutique, Salon multijoueur)
├── game.html               # Fenêtre de jeu Canvas et affichage HUD
├── package.json            # Configuration du projet et dépendances Node.js (ws)
├── README.md               # Documentation officielle du projet
│
├── css/                    # Feuilles de style modulaires
│   ├── welcome.css         # Pop-up d'accueil et enregistrement du pseudo
│   ├── lobby.css           # Design du salon, podiums et options multijoueur
│   ├── game.css            # Styles du HUD de combat, inventaire et zone
│   ├── mode-selector.css   # Sélecteur de mode (Solo, Duo, Trio, Section)
│   ├── cosmetics.css       # Casier et prévisualisation des skins
│   ├── shop.css            # Boutique d'objets
│   ├── battlepass.css      # Passe de combat
│   └── settings.css        # Panneau des paramètres audio et gameplay
│
├── js/                     # Logique applicative et client Web
│   ├── network.js          # Gestionnaire de réseau WebSocket & session locale
│   ├── lobby.js            # Contrôleur d'interface du salon
│   ├── cosmetics.js        # Définition des skins, pioches, sacs et planeurs
│   ├── sfx.js              # Moteur audio synthétique (Web Audio API)
│   ├── settings.js         # Paramètres utilisateur
│   │
│   └── game/               # Moteur de jeu Battle Royale
│       ├── main.js         # Boucle de jeu principale et synchronisation multijoueur
│       ├── player.js       # Physique et déplacements du joueur
│       ├── drop.js         # Vaisseau de largage, trajectoire et planeur
│       ├── combat.js       # Balistique, tirs, dégâts et système K.O./réanimation
│       ├── bots.js         # Intelligence artificielle et gestion des escouades bots
│       ├── world.js        # Générateur procédural de l'île
│       ├── loot.js         # Coffres, apparitions d'armes et ramassage
│       ├── corruption.js   # Gestion de la tempête (zone toxique)
│       ├── hud.js          # Affichage tête haute, boussole et minimap
│       ├── draw.js         # Rendu Canvas 2D (personnages, ombres, armes)
│       └── weapons.js      # Statistiques des armes et objets de soin
│
├── server/                 # Serveur Node.js
│   ├── server.js           # Serveur HTTP statique + passerelle WebSocket
│   ├── rooms.js            # Gestionnaire des salles, codes de partie et relais d'état
│   ├── admin-config.js     # Pseudos admin et durée du matchmaking
│   ├── codes.js            # Liste des empreintes scrypt pour les codes cadeaux
│   └── hash-code.js        # Utilitaire pour générer de nouveaux codes cadeaux
│
└── assets/                 # Ressources graphiques et sonores
```

---

## 📜 Licence

Ce projet est sous licence MIT. Libre à vous de l'utiliser, le modifier et l'héberger pour jouer entre amis !

## 🛡️ Administration du matchmaking

Le compte dont le pseudo est `thehisaki` est administrateur par défaut. Le serveur reconnaît les administrateurs uniquement après authentification du compte ; un pseudo temporaire ne peut donc pas obtenir ces droits.

Pour ajouter d’autres pseudos sans modifier le code, renseignez la variable d’environnement `ADMIN_USERNAMES` sur Hostinger, avec des pseudos séparés par des virgules (par exemple `thehisaki,moderateur`). Lorsqu’une file de matchmaking démarre son compte à rebours, un bouton rouge **ADMIN · PASSER À 3 S** apparaît uniquement dans cette fenêtre pour les administrateurs et accélère la file active à 3 secondes. La vérification est faite côté serveur.
