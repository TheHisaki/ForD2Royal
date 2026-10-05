# Corrections Multijoueur — For2D Royal

## ✅ 1. Synchronisation des armes en main (Joueurs & Bots)

**Problème :** 
Sur la session d'un ami, les personnages (bots et coéquipier) effectuaient des animations de tir (flamme en bout de canon, bruitages) mais leurs mains apparaissaient vides (aucun fusil ou pioche visible).
- Pour les joueurs humains : `p_state` synchronisait uniquement l'indice du slot (`slot: player.slot`) mais jamais le contenu de l'inventaire (`player.inventory`). L'autre client avait donc `inventory[slot] === null` et dessinait les mains vides.
- Pour les bots : `b_sync` ne transmettait ni l'arme équipée ni sa rareté.

**Solution :**
1. **Synchronisation d'inventaire joueur :** `p_state` inclut désormais la structure compacte de l'inventaire (`inv: [{ kind, weaponId, rarity, pickaxeSkin }, ...]`). L'arme tenue par le coéquipier s'affiche avec son modèle et sa rareté exacte.
2. **Synchronisation d'arme bot :** `b_sync` transmet pour chaque bot son arme en main et sa rareté (`wId`, `wRarity`), instanciées directement dans `bot.inventory[0]`.
3. **Sécurité réactive lors du tir :** Les messages réseau `fire` et `bot_fire` forcent l'équipement immédiat de l'arme tirée, garantissant que l'arme est visible dès la première balle tirée.

**Fichiers :**
- [`main.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/main.js)
- [`draw.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/draw.js)

---

## ✅ 2. Dégâts des bots et ennemis sur les joueurs distants (`p_damage`)

**Problème :** 
Quand des bots tiraient sur le coéquipier invité, l'hôte voyait les balles toucher le coéquipier, mais le coéquipier ne subissait aucun dégât (vie et bouclier intacts, pas de son de blessure).
- L'hôte simulait les bots et appliquait les dégâts sur l'objet local `mate`.
- Mais l'hôte n'envoyait **aucun message réseau** à l'invité pour lui notifier ses dégâts.
- En prime, l'invité envoyait `p_state` avec sa vie locale (100 HP), ce qui écrasait et soignait instantanément les dégâts enregistrés par l'hôte !

**Solution :**
1. **Nouveau message `p_damage` :** Dès qu'un joueur distant subit des dégâts sur la machine de l'hôte (tir de bot, coup de pioche, etc.), l'hôte diffuse `p_damage` avec l'ID de la cible, les points de dégâts, les PV/bouclier restants et l'état K.O. (DBNO).
2. **Relay serveur :** Ajout de `case 'p_damage':` dans `server.js` pour relayer le message en temps réel.
3. **Réception et effets :** Sur le client de la victime, `p_damage` applique la baisse de PV/bouclier, déclenche le son de blessure (`hurt`), la secousse d'écran (`shake`), le flash rouge de combat (`combatHud.hurt`), et l'état K.O. (DBNO) ou élimination si les PV tombent à 0.
4. **Protection anti-écrasement (`_lastHostDamageTime`) :** Empêche les anciens paquets `p_state` en transit d'annuler les dégâts autoritaires infligés par l'hôte.

**Fichiers :**
- [`main.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/main.js)
- [`server/server.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/server/server.js)

---

## ✅ 3. Fluidité des bots en multijoueur (alliés et ennemis)

- Suppression des conflits d'IA sur le client invité (`updateGuest`).
- Lissage d'interpolation linéaire 60 FPS (lerp).
- Synchronisation de l'altitude pour les atterrissages en parachute.
- Fréquence de rafraîchissement portée à 10 Hz.

**Fichiers :**
- [`bots.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/bots.js)
- [`main.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/main.js)

---

## ✅ 4. Désynchronisation de la corruption

- L'hôte déclenche `corruption.start()` et diffuse `corruption_start`. Les invités démarrent exactement au même moment.

**Fichiers :**
- [`main.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/main.js)
- [`server/server.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/server/server.js)

---

## ✅ 5. Groupe préservé au retour lobby

- Transmission du code de groupe via `#party=CODE`.
- Reconnexion automatique au lobby commun.
- Réinitialisation de l'état de la salle côté serveur.

**Fichiers :**
- [`game.html`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/game.html)
- [`network.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/network.js)
- [`server/rooms.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/server/rooms.js)

---

## ✅ 6. Éjection automatique du bus

- Éjection anticipée 1.5s avant la sortie de la map sur terre ferme.

**Fichier :** [`main.js`](file:///c:/Users/thehisaki/OneDrive%20-%20LYCEE%20GASTON%20BERGER/projet/For2DRoyal/js/game/main.js)
