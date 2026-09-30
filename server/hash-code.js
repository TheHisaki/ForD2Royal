/*
   Génère l'empreinte d'un code secret pour server/codes.js.
   Le code en clair n'est jamais enregistré : seule l'empreinte l'est.

   Utilisation :  node server/hash-code.js <code> <récompense en Pixies> [id]
   Exemple    :  node server/hash-code.js MONCODE 1000 c2
   Colle ensuite la ligne affichée dans le tableau de server/codes.js,
   puis redémarre le serveur.
*/
const crypto = require('crypto');

// Mêmes réglages que server/server.js : ne pas les changer sans refaire tous les codes
const SCRYPT = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };

const [code, rewardArg, idArg] = process.argv.slice(2);
const reward = Number(rewardArg);
if (!code || !Number.isInteger(reward) || reward <= 0) {
    console.error('Utilisation : node server/hash-code.js <code> <récompense> [id]');
    process.exit(1);
}

const normalized = String(code).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
if (normalized.length > 32) {
    console.error('Code trop long (32 caractères maximum).');
    process.exit(1);
}

const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(normalized, salt, 32, SCRYPT);
const id = idArg || `c${crypto.randomBytes(3).toString('hex')}`;

console.log(`    { id: '${id}', reward: ${reward}, salt: '${salt.toString('hex')}', hash: '${hash.toString('hex')}' },`);
