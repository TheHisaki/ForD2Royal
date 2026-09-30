# 🎮 FOR2D ROYAL - Battle Royale 2D

Un jeu de type Battle Royale en 2D inspiré de Fortnite, avec un système de jeu en réseau local.

![Version](https://img.shields.io/badge/version-0.1.0--alpha-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## ✨ Fonctionnalités

### 🏠 Lobby Style Fortnite
- **Design moderne** avec dégradés bleus et effets néon cyan
- **4 emplacements joueurs** avec plateformes illuminées
- **Système de statut** (Ready/Not Ready)
- **Chat en temps réel** pour communiquer avec les autres joueurs
- **Informations de saison** et progression de niveau
- **Interface responsive** et animations fluides

### 🌐 Système de Réseau Local
- **Connexion P2P** avec WebRTC (PeerJS)
- **Créer une partie** et obtenir un code de salle à 6 caractères
- **Rejoindre une partie** avec le code de salle
- **Communication en temps réel** entre tous les joueurs du réseau local
- **Synchronisation** des statuts et messages de chat

### 🎯 Gameplay (À venir)
- Combat Battle Royale 2D
- Système d'armes et de matériaux
- Tempête qui rétrécit
- Construction de structures

## 🚀 Installation et Lancement

### Prérequis
- Un navigateur web moderne (Chrome, Firefox, Edge, Safari)
- Connexion au même réseau local pour le mode multijoueur

### Lancement
1. Ouvrez le fichier `index.html` dans votre navigateur
2. Vous arrivez directement dans le lobby

### Mode Réseau Local

#### Créer une partie (Hôte)
1. Cliquez sur le bouton **"🏠 Créer une partie"**
2. Un code de salle à 6 caractères s'affiche
3. Partagez ce code avec vos amis sur le même réseau

#### Rejoindre une partie
1. Cliquez sur le bouton **"🔗 Rejoindre"**
2. Entrez le code de salle à 6 caractères
3. Cliquez sur **"Rejoindre"**

## 📁 Structure du Projet

```
For2DRoyal/
├── index.html              # Page principale
├── game.js                 # Logique de jeu (ancien, à refactoriser)
├── style.css               # Styles anciens (à supprimer)
│
├── css/
│   ├── main.css           # Styles globaux et variables
│   └── lobby.css          # Styles spécifiques au lobby
│
├── js/
│   ├── main.js            # Point d'entrée de l'application
│   ├── lobby.js           # Gestion du lobby et des joueurs
│   ├── network.js         # Système de réseau P2P
│   └── game.js            # Logique du jeu (à créer)
│
├── assets/                 # Images et ressources (à ajouter)
└── server/                 # Scripts serveur optionnels
```

## 🎮 Contrôles

### Dans le Lobby
- **Clic sur READY** - Changer votre statut
- **Ctrl + Enter** - Toggle Ready/Not Ready
- **F11** - Plein écran
- **ESC** - Menu (à venir)

### Dans le Jeu (À implémenter)
- **Q/D ou ←/→** - Déplacement
- **Z ou ↑ ou Espace** - Sauter
- **E ou Clic souris** - Tirer
- **1-5** - Changer d'arme

## 🔧 Technologies Utilisées

- **HTML5** - Structure
- **CSS3** - Design et animations
- **JavaScript (Vanilla)** - Logique applicative
- **PeerJS** - Connexions P2P WebRTC
- **Canvas API** - Rendu du jeu

## 🌐 Système de Réseau

Le jeu utilise **PeerJS** qui implémente WebRTC pour établir des connexions peer-to-peer entre les joueurs. 

### Comment ça marche ?
1. L'hôte crée une partie et génère un code de salle
2. Le code est stocké dans le `localStorage` pour la découverte locale
3. Les autres joueurs sur le même réseau peuvent rejoindre avec ce code
4. Les connexions sont établies directement entre les navigateurs (P2P)
5. Toutes les données de jeu transitent directement entre les joueurs

### Avantages
- ✅ Pas besoin de serveur dédié
- ✅ Faible latence (connexion directe)
- ✅ Fonctionne sur réseau local
- ✅ Gratuit et open-source

### Limitations
- ⚠️ Nécessite que tous les joueurs soient sur le même réseau
- ⚠️ Le navigateur doit supporter WebRTC
- ⚠️ Connexion Internet requise pour le serveur de signaling PeerJS

## 🎨 Personnalisation

### Modifier les couleurs
Éditez les variables CSS dans `css/main.css` :

```css
:root {
    --primary-bg: #0a1428;
    --accent-cyan: #00d9ff;
    --accent-blue: #1e90ff;
    /* ... */
}
```

### Ajouter des personnages
Les personnages sont dans `.character-body`. Modifiez les gradients dans `lobby.css`.

## 🐛 Dépannage

### Le réseau ne fonctionne pas
- Vérifiez que tous les joueurs sont sur le même réseau WiFi
- Assurez-vous que PeerJS se charge (vérifiez la console)
- Essayez de rafraîchir la page
- Vérifiez que votre pare-feu ne bloque pas WebRTC

### Les animations sont saccadées
- Fermez les autres onglets du navigateur
- Désactivez les extensions qui peuvent ralentir la page
- Essayez un autre navigateur

### Le code de salle ne fonctionne pas
- Le code est sensible à la casse
- Vérifiez qu'il contient exactement 6 caractères
- L'hôte doit avoir créé la partie avant que vous rejoigniez

## 📝 TODO

- [ ] Implémenter le gameplay complet
- [ ] Ajouter des sons et effets audio
- [ ] Créer un système de skins pour les personnages
- [ ] Ajouter un lobby vocal
- [ ] Implémenter le système de construction
- [ ] Optimiser les performances réseau
- [ ] Ajouter un mode solo contre IA
- [ ] Créer un système de replay

## 👥 Développement

### Contribuer
Les contributions sont les bienvenues ! N'hésitez pas à :
1. Fork le projet
2. Créer une branche pour votre fonctionnalité
3. Commiter vos changements
4. Pusher vers la branche
5. Ouvrir une Pull Request

### Console de Debug
Ouvrez la console du navigateur (F12) pour voir les logs de réseau et de jeu.

Commandes utiles :
```javascript
FOR2D.version          // Afficher la version
FOR2D.disconnect()     // Se déconnecter du réseau
FOR2D.showLobby()      // Retour au lobby
```

## 📜 Licence

MIT License - Libre d'utilisation et de modification

## 🙏 Crédits

Inspiré par Fortnite (Epic Games)  
Développé avec ❤️ pour l'apprentissage et le fun

---

**Note** : Ce jeu est un projet éducatif et n'est pas affilié à Epic Games ou Fortnite.
