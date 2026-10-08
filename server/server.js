const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { RoomManager } = require('./rooms.js');

// Configuration (compatible avec l'hébergement Hostinger Node.js)
const PORT = process.env.PORT || 3000;
const ROOT = path.resolve(__dirname, '..');

// Types MIME autorisés : tout autre fichier n'est jamais envoyé
const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.wav': 'audio/wav'
};

// Dossiers jamais servis (le code du serveur et les codes secrets restent privés)
const BLOCKED_DIRS = new Set(['server', 'node_modules']);

/* ===================== CODES SECRETS ===================== */
/*
   Les codes ne sont jamais écrits en clair : server/codes.js ne contient
   qu'une empreinte scrypt (lente et gourmande en mémoire, avec un sel
   propre à chaque code). La vérification se fait uniquement ici, côté
   serveur ; le navigateur ne voit jamais la liste des codes.
   Pour ajouter un code : node server/hash-code.js <code> <récompense>
*/
const SCRYPT = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const CODE_MAX_LEN = 32;
const BODY_MAX = 1024;
const ATTEMPTS_MAX = 6;                 // essais par adresse IP...
const ATTEMPTS_WINDOW = 10 * 60 * 1000; // ... sur 10 minutes
const MAX_IN_FLIGHT = 4;                // calculs scrypt simultanés

let CODES = [];
try {
    CODES = require('./codes.js').filter(c =>
        c && typeof c.id === 'string' && Number.isInteger(c.reward) && c.reward > 0 &&
        /^[0-9a-f]{32,}$/.test(c.salt) && /^[0-9a-f]{64}$/.test(c.hash));
} catch {
    console.warn('Aucun fichier server/codes.js : les codes secrets sont désactivés.');
}

const scryptAsync = (secret, salt) => new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 32, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
});

// Même normalisation que hash-code.js : sans espaces, en minuscules
function normalizeCode(raw) {
    return String(raw).normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

async function findCode(code) {
    for (const c of CODES) {
        const key = await scryptAsync(code, Buffer.from(c.salt, 'hex'));
        if (crypto.timingSafeEqual(key, Buffer.from(c.hash, 'hex'))) return c;
    }
    return null;
}

// Limite d'essais par IP (contre les essais en masse)
const attempts = new Map();
let inFlight = 0;

function takeAttempt(ip) {
    const now = Date.now();
    let a = attempts.get(ip);
    if (!a || now > a.reset) {
        a = { count: 0, reset: now + ATTEMPTS_WINDOW };
        attempts.set(ip, a);
    }
    if (a.count >= ATTEMPTS_MAX) return Math.ceil((a.reset - now) / 1000);
    a.count++;
    return 0;
}

setInterval(() => {
    const now = Date.now();
    for (const [ip, a] of attempts) if (now > a.reset) attempts.delete(ip);
}, 60 * 1000).unref();

function sendJson(res, status, data, extra = {}) {
    res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...extra
    });
    res.end(JSON.stringify(data));
}

function handleRedeem(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, reason: 'method' }, { Allow: 'POST' });
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        return sendJson(res, 415, { ok: false, reason: 'format' });
    }

    let body = '';
    let tooBig = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
        if (tooBig) return;
        body += chunk;
        if (body.length > BODY_MAX) {
            tooBig = true;
            sendJson(res, 413, { ok: false, reason: 'format' });
            req.destroy();
        }
    });
    req.on('end', async () => {
        if (tooBig) return;
        let code = '';
        try {
            code = normalizeCode(JSON.parse(body).code ?? '');
        } catch {
            return sendJson(res, 400, { ok: false, reason: 'format' });
        }
        if (!code || code.length > CODE_MAX_LEN) return sendJson(res, 400, { ok: false, reason: 'invalid' });

        const ip = req.socket.remoteAddress || 'inconnu';
        const wait = takeAttempt(ip);
        if (wait) return sendJson(res, 429, { ok: false, reason: 'rate', retryAfter: wait }, { 'Retry-After': String(wait) });
        if (inFlight >= MAX_IN_FLIGHT) return sendJson(res, 503, { ok: false, reason: 'busy' });

        inFlight++;
        try {
            const found = await findCode(code);
            if (found) sendJson(res, 200, { ok: true, id: found.id, reward: found.reward });
            else sendJson(res, 200, { ok: false, reason: 'invalid' });
        } catch {
            sendJson(res, 500, { ok: false, reason: 'server' });
        } finally {
            inFlight--;
        }
    });
}

/* ===================== FICHIERS DU JEU ===================== */

function sendText(res, status, text) {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    res.end(text);
}

// Chemin demandé -> fichier du projet, ou null s'il est interdit
function resolveFile(url) {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
    } catch {
        return null;
    }
    if (pathname.includes('\0')) return null;
    if (pathname.endsWith('/')) pathname += 'index.html';

    const filePath = path.resolve(ROOT, '.' + pathname);
    const rel = path.relative(ROOT, filePath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;

    const parts = rel.split(path.sep);
    if (BLOCKED_DIRS.has(parts[0].toLowerCase())) return null;
    if (parts.some(p => p.startsWith('.'))) return null;          // .git, .kiro, .env...
    if (!mimeTypes[path.extname(filePath).toLowerCase()]) return null;
    return filePath;
}

function serveFile(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' });
        return res.end();
    }
    const filePath = resolveFile(req.url);
    if (!filePath) return sendText(res, 404, '<h1>404 - Fichier non trouvé</h1>');

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT' || error.code === 'EISDIR') sendText(res, 404, '<h1>404 - Fichier non trouvé</h1>');
            else sendText(res, 500, 'Erreur serveur');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
            'Content-Type': mimeTypes[ext],
            'X-Content-Type-Options': 'nosniff',
            // Code du jeu : toujours la dernière version (tous les joueurs doivent avoir la même)
            ...(['.html', '.js', '.css', '.json'].includes(ext) ? { 'Cache-Control': 'no-cache' } : {})
        });
        res.end(req.method === 'HEAD' ? undefined : content);
    });
}

// Créer le serveur HTTP
const server = http.createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    if (pathname === '/api/redeem') return handleRedeem(req, res);
    serveFile(req, res);
});

// Créer le serveur WebSocket pour le multijoueur temps-réel
// Messages de partie relayés tels quels aux autres joueurs (l'émetteur est ajouté par le serveur)
const GAME_MESSAGES = new Set([
    'p_state', 'p_fire', 'p_throw', 'p_effect', 'p_hit', 'kill', 'dbno', 'revive', 'emote',
    'b_sync', 'world_sync', 'chest_open', 'loot_spawn', 'loot_take', 'admin_drop_weapon', 'admin_power', 'admin_action',
    'supply_spawn', 'supply_open_request', 'supply_open',
    'gungame_progress', 'gungame_winner']);

const ACCOUNT_MESSAGES = new Set([
    'account_register', 'account_login', 'account_session', 'account_logout', 'account_rename',
    'account_profile_import', 'account_profile_save', 'admin_set_matchmaking_countdown', 'admin_skip_matchmaking_countdown', 'friend_request', 'friend_accept',
    'friend_reject', 'friend_remove', 'friend_invite',
    'group_invite', 'group_invite_accept', 'group_invite_reject'
]);

// 256 Ko par message au plus (les plus gros, b_sync, font quelques Ko)
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });
const roomManager = new RoomManager();

// Messages compte / amis : traités un par un pour chaque connexion (ordre garanti :
// création du compte -> import du profil -> sauvegardes -> déconnexion)
async function handleAccountMessage(ws, msg) {
    const ready = await roomManager.friends.ensureReady();
    if (!ready) {
        // Base injoignable : la déconnexion locale reste possible
        if (msg.type === 'account_logout') {
            roomManager.unbindAccount(ws);
            return roomManager.send(ws, { type: 'account_logged_out' });
        }
        return roomManager.send(ws, roomManager.unavailableMessage(msg.type));
    }
    await roomManager.handleFriendMessage(ws, msg);
}

function clientIp(req) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return (forwarded || req.socket?.remoteAddress || '').slice(0, 64);
}

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.clientIp = clientIp(req);
    ws.accountQueue = Promise.resolve();
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        if (!msg || typeof msg.type !== 'string') return;

        if (ACCOUNT_MESSAGES.has(msg.type)) {
            ws.accountQueue = ws.accountQueue.then(() => handleAccountMessage(ws, msg)).catch((error) => {
                console.error('[Comptes] Erreur:', error.code || '', error.message);
                const fallback = roomManager.unavailableMessage(msg.type);
                roomManager.send(ws, { ...fallback, code: 'server_error', message: 'Erreur serveur, réessaie dans un instant.' });
            });
            return;
        }

        (async () => {
            await roomManager.ready;
            switch (msg.type) {
                case 'create_room':
                    await roomManager.createRoom(ws, msg.player || msg);
                    break;
                case 'join_room':
                    await roomManager.joinRoom(ws, msg.roomCode || msg.code, msg.player || msg);
                    break;
                case 'update_status':
                    roomManager.updateStatus(ws, msg);
                    break;
                case 'update_config':
                    roomManager.updateConfig(ws, msg);
                    break;
                case 'start_choice':
                    roomManager.chooseStartChoice(ws, msg);
                    break;
                case 'chat':
                    roomManager.sendChat(ws, msg.message);
                    break;
                case 'start_game':
                    roomManager.startGame(ws);
                    break;
                case 'leave_room':
                    roomManager.leaveCurrentRoom(ws);
                    break;
                case 'kick_player':
                    roomManager.kickPlayer(ws, msg.playerId);
                    break;
                case 'admin_get_games':
                    roomManager.sendAdminGamesList(ws);
                    break;
                case 'admin_close_game':
                    roomManager.closeGameByAdmin(ws, msg.roomCode || msg.code);
                    break;
                default:
                    // Événements de synchronisation en partie (voir js/game/main.js)
                    if (GAME_MESSAGES.has(msg.type)) roomManager.relayGameMessage(ws, msg);
                    break;
            }
        })().catch((error) => {
            console.error('[Serveur] Erreur:', error.message);
            roomManager.send(ws, { type: 'error', message: 'Erreur serveur.' });
        });
    });

    ws.on('close', () => {
        roomManager.leaveCurrentRoom(ws);
        roomManager.unbindAccount(ws);
    });

    ws.on('error', () => {
        roomManager.leaveCurrentRoom(ws);
        roomManager.unbindAccount(ws);
    });
});

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(heartbeatInterval));

// Obtenir l'adresse IP locale
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Ignorer les adresses internes et non-IPv4
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
}

// Démarrer le serveur
server.listen(PORT, () => {
    const localIP = getLocalIP();

    console.log('\n========================================');
    console.log('  FOR2D ROYAL - SERVEUR LOCAL');
    console.log('========================================\n');
    console.log('Serveur demarre avec succes!\n');
    console.log('Acces local (sur cet ordinateur):');
    console.log(`   http://localhost:${PORT}`);
    console.log(`   http://127.0.0.1:${PORT}\n`);
    console.log('Acces reseau local (autres appareils):');
    console.log(`   http://${localIP}:${PORT}\n`);
    console.log('========================================\n');
    console.log('Instructions pour jouer en reseau local:\n');
    console.log('1. Partagez cette adresse avec vos amis:');
    console.log(`   http://${localIP}:${PORT}`);
    console.log('2. Creez une partie dans le jeu');
    console.log('3. Partagez le code de salle a 6 caracteres');
    console.log('4. Vos amis rejoignent avec ce code\n');
    console.log('========================================\n');
    console.log(`Codes secrets actifs : ${CODES.length}\n`);
    console.log('Tous les joueurs doivent etre sur le meme reseau WiFi\n');
    console.log('Appuyez sur Ctrl+C pour arreter le serveur\n');
});

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
    console.log('\n\nArret du serveur...');
    server.close(() => {
        console.log('Serveur arrete\n');
        process.exit(0);
    });
});

module.exports = { server, wss, roomManager };
