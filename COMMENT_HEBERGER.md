# 🖥️ Comment Héberger FOR2D ROYAL sur ton PC d'École

## 🎯 Objectif
Héberger le jeu sur **TON PC** et tes amis y accèdent juste avec une URL (rien à installer de leur côté).

## ✅ Solution 1 : Python (Le plus simple)

### Étape 1 : Vérifier si Python est installé
1. Ouvre **PowerShell** ou **Invite de commandes**
2. Tape : `python --version`
3. Si tu vois une version (ex: Python 3.10.0) → Python est installé ✅

### Étape 2 : Lancer le serveur
**Méthode A - Double-clic :**
- Double-clic sur `SERVEUR_SIMPLE.bat`

**Méthode B - Ligne de commande :**
```bash
# Ouvre PowerShell dans le dossier du jeu
python -m http.server 8080
```

### Étape 3 : Récupérer ton adresse IP
1. Dans PowerShell, tape : `ipconfig`
2. Cherche **"Adresse IPv4"** (ex: 192.168.1.15)
3. Ton adresse serveur est : `http://192.168.1.15:8080`

### Étape 4 : Partager avec tes amis
- Dis à tes amis d'ouvrir : `http://TON_IP:8080`
- Exemple : `http://192.168.1.15:8080`
- Ils verront le jeu dans leur navigateur !

---

## ✅ Solution 2 : Sans Python - Partage de fichiers réseau

Si Python ne marche pas, utilise le partage Windows :

### Étape 1 : Partager le dossier
1. **Clic droit** sur le dossier `For2DRoyal`
2. **Propriétés** → Onglet **Partage**
3. Clique sur **Partager**
4. Ajoute **Tout le monde** avec accès **Lecture**
5. Note le chemin réseau (ex: `\\TON-PC\For2DRoyal`)

### Étape 2 : Tes amis accèdent
1. Ils ouvrent **Explorateur de fichiers**
2. Dans la barre d'adresse, ils tapent : `\\TON-PC\For2DRoyal`
3. Ils double-cliquent sur `index.html`
4. Le jeu s'ouvre dans leur navigateur !

**⚠️ Problème potentiel :** Nécessite peut-être des autorisations réseau de l'école.

---

## ✅ Solution 3 : Hébergement en ligne (0% droits admin)

### Option A : GitHub Pages (Gratuit)
1. Crée un compte sur https://github.com
2. Crée un nouveau dépôt (repository)
3. Upload tous les fichiers du jeu
4. Va dans **Settings** → **Pages**
5. Active GitHub Pages
6. Ton jeu sera accessible via : `https://TON_USERNAME.github.io/For2DRoyal`

**Avantages :**
- ✅ Tes amis accèdent depuis n'importe où
- ✅ Pas besoin que ton PC soit allumé
- ✅ Fonctionne sur téléphone/tablette
- ✅ 100% gratuit

### Option B : Netlify (Gratuit, encore plus simple)
1. Va sur https://www.netlify.com
2. Glisse-dépose le dossier `For2DRoyal`
3. Tu obtiens une URL : `https://ton-jeu.netlify.app`
4. Partage cette URL avec tes amis

---

## 🎮 Quelle solution choisir ?

### Sur PC d'école AVEC Python :
→ **Solution 1 (Python)** - Le plus rapide

### Sur PC d'école SANS droits :
→ **Solution 3 (GitHub Pages ou Netlify)** - Hébergement en ligne gratuit

### Pour jouer MAINTENANT sans complications :
→ **Ouvre juste index.html** et utilise PeerJS (déjà intégré)
- Toi et tes amis ouvrez `index.html` localement
- Tu crées une partie → code 6 lettres
- Ils rejoignent avec le code
- ✅ Ça fonctionne !

---

## 🔍 Comment trouver ton IP manuellement

### Windows :
1. Ouvre **PowerShell**
2. Tape : `ipconfig`
3. Cherche **"Adresse IPv4"** sous ta carte réseau WiFi
4. Exemple : `192.168.1.15`

### Ta connexion :
- IP locale : `192.168.x.x` (réseau école)
- Tes amis utilisent : `http://192.168.x.x:8080`

---

## ⚡ Solution Ultra-Simple (Recommandée)

**Si tu veux juste jouer MAINTENANT :**

1. **Toi et tes amis** ouvrez `index.html` (double-clic)
2. **Tu crées une partie** → Note le code (ex: ABC123)
3. **Tes amis cliquent "Rejoindre"** → Entrent le code
4. **Connexion P2P automatique** via PeerJS (serveur public)

✅ **Pas besoin de serveur local**
✅ **Fonctionne partout**
✅ **Zéro configuration**

La seule chose : chacun doit avoir le dossier du jeu localement (ou tu le mets sur Google Drive/OneDrive partagé).

---

## 🆘 Support

### Le serveur Python ne démarre pas
- Vérifie que Python est installé : `python --version`
- Essaye un autre port : `python -m http.server 8000`
- Vérifie qu'aucun autre programme n'utilise le port 8080

### Les amis ne peuvent pas se connecter
- Vérifie que vous êtes sur le **même réseau WiFi**
- Vérifie ton **adresse IP** avec `ipconfig`
- Le pare-feu de l'école peut bloquer (→ utilise GitHub Pages)

### La connexion P2P ne fonctionne pas
- Vérifie la **connexion Internet** (PeerJS nécessite Internet)
- Recrée une nouvelle partie (nouveau code)
- Rafraîchis la page (F5)

---

🎮 **Bon jeu !**
