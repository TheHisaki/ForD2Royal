/*
   Codes secrets de FOR2D ROYAL (lus uniquement par server/server.js).
   Aucun code n'est écrit en clair : seulement une empreinte scrypt + un sel.
   Ce dossier n'est jamais envoyé aux navigateurs par le serveur Node.

   Ajouter un code : node server/hash-code.js <code> <récompense> [id]
   puis coller la ligne affichée ci-dessous et redémarrer le serveur.
   id : identifiant court, permet au jeu de refuser un code déjà utilisé.
*/
module.exports = [
    { id: 'c1', reward: 13500, salt: '41af5706cd75ec6ffcd57018b81101a7', hash: '9073bfeefff9d443a509fe2ba09fec041098ee3ae47716f7411418ec7e9eaa38' }
];
