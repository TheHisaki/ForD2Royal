# 🌐 Guide Réseau Local - FOR2D ROYAL

## 📋 Prérequis

- **Node.js** installé sur votre PC
  - Télécharger depuis : https://nodejs.org/ (version LTS recommandée)
  - Vérifiez l'installation : ouvrez PowerShell et tapez `node --version`

## 🚀 Démarrer le Serveur

### Méthode 1 : Double-clic (Windows)
1. Double-cliquez sur le fichier `LANCER_SERVEUR.bat`
2. Une fenêtre noire s'ouvre avec l'adresse IP de votre serveur

### Méthode 2 : Ligne de commande
1. Ouvrez PowerShell dans le dossier du projet
2. Tapez : `npm start` ou `node server/server.js`

## 📡 Connexion des Joueurs

### Étape 1 : Récupérer l'adresse IP
Après avoir lancé le serveur, notez l'adresse affichée :
```
🌐 Accès réseau local (autres appareils):
   👉 http://192.168.1.X:3000
```

### Étape 2 : Partager l'adresse
- Partagez cette adresse avec vos amis
- Ils doivent être sur le **même WiFi** que vous
- Ils accèdent au jeu via leur navigateur

### Étape 3 : Créer une partie
1. **L'hôte** (vous) cliquez sur "🏠 Créer une partie"
2. Un code de salle à **6 caractères** s'affiche (ex: ABC123)
3. Partagez ce code avec vos amis

### Étape 4 : Rejoindre la partie
1. Les autres joueurs cliquent sur "🔗 Rejoindre"
2. Ils entrent le **code de salle**
3. Ils cliquent sur "Rejoindre"
4. Ils apparaissent dans votre lobby !

## 🔧 Dépannage

### Le serveur ne démarre pas
- ✅ Vérifiez que Node.js est installé : `node --version`
- ✅ Vérifiez que le port 3000 n'est pas déjà utilisé
- ✅ Fermez et relancez le fichier .bat

### Les autres joueurs ne peuvent pas se connecter
- ✅ Vérifiez que tous sont sur le **même réseau WiFi**
- ✅ Vérifiez que le **pare-feu Windows** n'est pas bloqué
  - Panneau de configuration > Pare-feu Windows
  - Autoriser une application > Ajouter Node.js
- ✅ Désactivez temporairement le pare-feu pour tester
- ✅ Vérifiez l'adresse IP (elle peut changer si vous redémarrez le WiFi)

### Le code de salle ne fonctionne pas
- ✅ Vérifiez que l'hôte a bien créé une partie
- ✅ Le code est sensible à la casse (majuscules/minuscules)
- ✅ Le code contient exactement 6 caractères

### Comment trouver mon adresse IP manuellement
1. Ouvrez PowerShell
2. Tapez : `ipconfig`
3. Cherchez "Adresse IPv4" sous votre carte WiFi
4. Exemple : `192.168.1.15`

## 🔒 Sécurité

- ⚠️ Ce serveur est pour le **réseau local uniquement**
- ⚠️ Ne l'exposez **pas sur Internet** sans protection
- ⚠️ Fermez le serveur quand vous ne jouez pas (Ctrl+C)

## 📱 Jouer depuis un smartphone/tablette

Oui ! Les autres joueurs peuvent jouer depuis leur téléphone :
1. Connectez le téléphone au **même WiFi**
2. Ouvrez un navigateur web (Chrome, Safari, etc.)
3. Tapez l'adresse du serveur : `http://192.168.1.X:3000`
4. Le jeu s'affiche !

## 💡 Astuces

- 🔄 Si votre IP change, relancez le serveur pour voir la nouvelle
- 📍 Utilisez un **IP fixe** dans les paramètres du routeur pour plus de stabilité
- 🌐 Ajoutez le serveur en favori dans le navigateur des autres joueurs
- 💬 Utilisez le chat du jeu pour communiquer

## 🎮 Bon jeu !

Une fois connectés, tous les joueurs peuvent :
- 💬 Discuter dans le chat
- ✅ Se mettre "Prêt"
- 🎯 Lancer la partie quand tout le monde est prêt
