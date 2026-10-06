/* ==================================
   GESTION RÉSEAU MULTIJOUEUR - FOR2D ROYAL
   Client WebSocket haute performance avec gestion de salles (codes à 6 lettres),
   session locale dans le navigateur et synchronisation temps-réel du lobby et des parties.
   ================================== */

const SESSION_KEY = 'for2d-session';

function getOrInitSession() {
    let session = null;
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (raw) session = JSON.parse(raw);
    } catch { /* parse error */ }

    if (!session || !session.playerId) {
        // Priorité à un ID fourni dans l'URL si présent (ex: game.html?pid=...)
        const urlPid = (typeof window !== 'undefined') ? new URLSearchParams(window.location.search).get('pid') : null;
        session = {
            playerId: urlPid || ('usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36)),
            created: Date.now()
        };
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
            if (!localStorage.getItem(SESSION_KEY)) {
                localStorage.setItem(SESSION_KEY, JSON.stringify(session));
            }
        } catch { /* storage full */ }
    }
    return session;
}

/* ===== IDENTITÉ DU NAVIGATEUR : PROFIL TEMPORAIRE OU COMPTE =====
   Le profil actif (progression + casier) est toujours dans for2d-progress / for2d-profile :
   - profil temporaire : for2d-profile-owner absent ;
   - compte : for2d-profile-owner = identifiant du compte (copie locale du profil serveur).
   Un profil temporaire mis de côté pendant qu'on joue sur un compte (connexion à un compte
   existant) est rangé dans for2d-temp-* et revient à la déconnexion. Chaque changement
   d'identité recharge la page : tous les modules relisent un état propre. */
const ID_KEYS = {
    token: 'for2d-account-token',
    owner: 'for2d-profile-owner',
    sync: 'for2d-profile-sync',
    progress: 'for2d-progress',
    cosmetics: 'for2d-profile',
    tempProgress: 'for2d-temp-progress',
    tempCosmetics: 'for2d-temp-profile',
    welcomed: 'for2d-welcomed',
    name: 'for2d-player-name'
};
const ACCOUNT_TIMEOUT = 12000;        // ms avant d'abandonner une demande de compte
const SESSION_RETRY_DELAY = 15000;    // ms entre deux reconnexions au compte si la base est indisponible

function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}

function lsRemove(...keys) {
    for (const key of keys) {
        try { localStorage.removeItem(key); } catch { /* stockage indisponible */ }
    }
}

function parseJson(raw) {
    try { return JSON.parse(raw || 'null'); } catch { return null; }
}

function readRoomReconnectToken() {
    for (const store of [sessionStorage, localStorage]) {
        try {
            const cfg = parseJson(store.getItem('for2d-game-mode'));
            if (typeof cfg?.roomReconnectToken === 'string' && /^[a-f0-9]{64}$/.test(cfg.roomReconnectToken)) return cfg.roomReconnectToken;
        } catch { /* stockage indisponible */ }
    }
    return '';
}

// JSON à clés triées : même contenu = même texte (pour détecter un profil modifié)
function stableStringify(value) {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value ?? null);
}

function hashText(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

class NetworkManager {
    constructor() {
        this.session = getOrInitSession();
        this.ws = null;
        this.connected = false;
        this.isHost = false;
        this.roomCode = null;
        this.roomPlayerId = null;
        this.roomPlayers = [];
        this.roomReconnectToken = readRoomReconnectToken();
        this.slot = 1;
        this.reconnectTimer = null;
        this.roomJoinTimer = null;
        this.cancelRoomOnCreate = false;
        this.pendingMessages = [];
        this.friendHandlers = new Set();
        this.account = null;
        this.isAdmin = false;
        this.matchmakingCountdownSeconds = 30;
        this.friendsState = null;      // dernier état amis reçu (relu par le panneau Amis)
        this.pendingGroupInvites = []; // invitations reçues avant le montage du panneau social
        this.gameDataHandlers = [];

        // État du compte
        this.authFlow = null;          // demande en cours : 'register' | 'login' | 'session'
        this.authContext = null;       // connexion validée en attente du profil
        this.profileSyncReady = false; // vrai seulement quand le profil local appartient au compte connecté
        this.applyingProfile = false;  // vrai pendant qu'on charge un profil serveur (pas de sauvegarde)
        this.profileSaveTimer = null;
        this.pendingSaveHash = '';
        this.accountRequestTimer = null;
        this.sessionRetryTimer = null;
        this.reloading = false;
        this.logoutDone = null;

        this.bootIdentity();
        this.accountToken = lsGet(ID_KEYS.token) || '';

        this.init();
    }

    /* ===== IDENTITÉ : ÉTAT LOCAL ===== */

    // Avant que les modules (progression, casier) ne lisent le stockage : remet l'état d'aplomb
    bootIdentity() {
        const token = lsGet(ID_KEYS.token);
        const owner = lsGet(ID_KEYS.owner);
        if (owner && !token) {
            // Copie d'un compte sans session (déconnexion dans un autre onglet, stockage partiel)
            this.switchToTemporaryStorage();
        } else if (token && lsGet(ID_KEYS.welcomed) !== '1') {
            lsSet(ID_KEYS.welcomed, '1');
        }
    }

    // Quitte le compte côté navigateur : profil temporaire rangé, sinon rien (écran de bienvenue)
    switchToTemporaryStorage() {
        const tempProgress = lsGet(ID_KEYS.tempProgress);
        const tempCosmetics = lsGet(ID_KEYS.tempCosmetics);
        lsRemove(ID_KEYS.token, ID_KEYS.owner, ID_KEYS.sync);
        if (tempProgress || tempCosmetics) {
            if (tempProgress) lsSet(ID_KEYS.progress, tempProgress); else lsRemove(ID_KEYS.progress);
            if (tempCosmetics) lsSet(ID_KEYS.cosmetics, tempCosmetics); else lsRemove(ID_KEYS.cosmetics);
            lsRemove(ID_KEYS.tempProgress, ID_KEYS.tempCosmetics);
            const name = parseJson(tempProgress)?.name;
            if (name) lsSet(ID_KEYS.name, name); else lsRemove(ID_KEYS.name);
            lsSet(ID_KEYS.welcomed, '1');
            return 'temporary';
        }
        lsRemove(ID_KEYS.progress, ID_KEYS.cosmetics, ID_KEYS.name, ID_KEYS.welcomed);
        return 'empty';
    }

    // Connexion réussie depuis un profil temporaire : on le met de côté
    archiveTemporaryStorage() {
        if (lsGet(ID_KEYS.owner)) return;
        if (lsGet(ID_KEYS.welcomed) === '1') {
            const progress = lsGet(ID_KEYS.progress);
            const cosmetics = lsGet(ID_KEYS.cosmetics);
            if (progress) lsSet(ID_KEYS.tempProgress, progress); else lsRemove(ID_KEYS.tempProgress);
            if (cosmetics) lsSet(ID_KEYS.tempCosmetics, cosmetics); else lsRemove(ID_KEYS.tempCosmetics);
        } else {
            // Navigateur neuf (écran de bienvenue) : aucun profil temporaire à garder
            lsRemove(ID_KEYS.tempProgress, ID_KEYS.tempCosmetics);
        }
    }

    // Profil du serveur -> stockage local du compte (null = profil neuf)
    writeAccountProfile(account, profile) {
        const progress = profile?.progress && typeof profile.progress === 'object'
            ? { ...profile.progress, name: account.name }
            : { name: account.name };
        lsSet(ID_KEYS.progress, JSON.stringify(progress));
        if (profile?.cosmetics && typeof profile.cosmetics === 'object') lsSet(ID_KEYS.cosmetics, JSON.stringify(profile.cosmetics));
        else lsRemove(ID_KEYS.cosmetics);
        lsSet(ID_KEYS.owner, account.id);
        lsSet(ID_KEYS.welcomed, '1');
        lsSet(ID_KEYS.name, account.name);
    }

    readSync() {
        const sync = parseJson(lsGet(ID_KEYS.sync));
        return sync && typeof sync === 'object' ? sync : null;
    }

    writeSync(accountId, updatedAt, hash) {
        lsSet(ID_KEYS.sync, JSON.stringify({ accountId, updatedAt: Number(updatedAt) || 0, hash: hash || '' }));
    }

    // Empreinte du profil tel que les modules le voient (après leurs propres corrections)
    profileHash() {
        const progress = window.FOR2D_PROGRESS?.exportData?.() ?? parseJson(lsGet(ID_KEYS.progress));
        const cosmetics = window.FOR2D_COSMETICS?.exportData?.() ?? parseJson(lsGet(ID_KEYS.cosmetics));
        return hashText(stableStringify({ progress, cosmetics }));
    }

    // Les modules ES (progression, casier) s'exécutent après ce script : on les attend
    whenProfileModules(fn) {
        const ready = () => window.FOR2D_PROGRESS && window.FOR2D_COSMETICS;
        if (ready() || typeof document === 'undefined') return fn();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => fn(), { once: true });
            return;
        }
        let tries = 0;
        const timer = setInterval(() => {
            if (ready() || ++tries > 60) {
                clearInterval(timer);
                fn();
            }
        }, 50);
    }

    // Relit le stockage dans les modules sans déclencher de sauvegarde
    refreshProfileModules() {
        this.applyingProfile = true;
        try {
            window.FOR2D_PROGRESS?.reloadFromStorage?.();
            window.FOR2D_COSMETICS?.reloadFromStorage?.();
        } finally {
            this.applyingProfile = false;
        }
    }

    reloadPage(delay = 0) {
        if (this.reloadScheduled) return;
        this.reloadScheduled = true;
        this.reloading = true;
        this.profileSyncReady = false;
        clearTimeout(this.profileSaveTimer);
        setTimeout(() => window.location.reload(), delay);
    }

    getPlayerId() {
        return this.roomPlayerId || this.session.playerId;
    }

    getPlayerName() {
        if (window.FOR2D_PROGRESS && window.FOR2D_PROGRESS.name) {
            return window.FOR2D_PROGRESS.name;
        }
        return localStorage.getItem('for2d-player-name') || 'Joueur';
    }

    isAuthenticated() {
        return !!this.account && !!this.accountToken;
    }

    // Compte en cours de reconnexion (session gardée, réponse du serveur attendue)
    hasPendingSession() {
        return !this.account && !!this.accountToken;
    }

    beginAccountRequest(flow) {
        clearTimeout(this.accountRequestTimer);
        this.authFlow = flow;
        this.accountRequestTimer = setTimeout(() => {
            this.accountRequestTimer = null;
            this.pendingMessages = this.pendingMessages.filter((m) => !String(m.type).startsWith('account_'));
            const wasFlow = this.authFlow;
            this.authFlow = null;
            this.authContext = null;
            if (wasFlow === 'session') this.scheduleSessionRetry();
            this.emitFriend({
                type: 'account_error',
                action: wasFlow || flow,
                code: 'timeout',
                local: true,
                message: 'Le serveur des comptes ne répond pas. Réessaie dans un instant.'
            });
        }, ACCOUNT_TIMEOUT);
    }

    finishAccountRequest() {
        clearTimeout(this.accountRequestTimer);
        this.accountRequestTimer = null;
        this.authFlow = null;
    }

    startSession() {
        if (!this.accountToken || this.reloading) return;
        clearTimeout(this.sessionRetryTimer);
        this.beginAccountRequest('session');
        this.send({ type: 'account_session', token: this.accountToken });
    }

    // Base injoignable : on garde la session et la copie locale, et on réessaie plus tard
    scheduleSessionRetry() {
        clearTimeout(this.sessionRetryTimer);
        if (!this.accountToken || this.reloading) return;
        this.sessionRetryTimer = setTimeout(() => {
            if (this.isConnected() && !this.account) this.startSession();
        }, SESSION_RETRY_DELAY);
    }

    onFriendEvent(handler) {
        if (typeof handler === 'function') this.friendHandlers.add(handler);
        return () => this.friendHandlers.delete(handler);
    }

    emitFriend(msg) {
        for (const handler of this.friendHandlers) {
            try { handler(msg); } catch (error) { console.error('[Amis] UI:', error); }
        }
        window.dispatchEvent(new CustomEvent('friends-event', { detail: msg }));
    }

    // Pourquoi une connexion / création n'est pas possible maintenant ('' = possible)
    authBlockReason() {
        if (this.reloading) return 'reloading';
        if (this.isAuthenticated()) return 'authenticated';
        if (this.authFlow) return this.authFlow === 'session' ? 'restoring' : 'pending';
        return '';
    }

    registerAccount(name, password) {
        if (this.authBlockReason()) return false;
        this.beginAccountRequest('register');
        this.send({ type: 'account_register', name, password });
        return true;
    }

    loginAccount(name, password) {
        if (this.authBlockReason()) return false;
        this.beginAccountRequest('login');
        this.send({ type: 'account_login', name, password });
        return true;
    }

    renameAccount(name) {
        if (this.isAuthenticated()) this.send({ type: 'account_rename', name });
    }

    // Déconnexion : dernière sauvegarde, révocation de la session, puis page rechargée
    // avec le profil temporaire rangé (ou rien : écran de bienvenue)
    logoutAccount() {
        if (this.reloading) return;
        const finish = () => {
            if (this.logoutDone !== finish) return;
            this.logoutDone = null;
            clearTimeout(this.logoutTimer);
            this.account = null;
            this.accountToken = '';
            this.isAdmin = false;
            this.matchmakingCountdownSeconds = 30;
            this.switchToTemporaryStorage();
            this.reloadPage(0);
        };
        this.logoutDone = finish;
        if (this.accountToken && this.isConnected()) {
            if (this.isAuthenticated()) this.sendProfileSave(true);
            this.send({ type: 'account_logout' });
            this.reloading = true;
            this.profileSyncReady = false;
            this.logoutTimer = setTimeout(finish, 1500);
        } else {
            finish();
        }
    }

    requestFriend(name) { this.send({ type: 'friend_request', name }); }
    acceptFriend(id) { this.send({ type: 'friend_accept', id }); }
    rejectFriend(id) { this.send({ type: 'friend_reject', id }); }
    removeFriend(id) { this.send({ type: 'friend_remove', id }); }
    inviteFriend(id) { this.send({ type: 'group_invite', id }); }

    setRoomReconnectToken(token) {
        this.roomReconnectToken = typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? token : '';
        for (const store of [sessionStorage, localStorage]) {
            try {
                const cfg = parseJson(store.getItem('for2d-game-mode')) || {};
                if (this.roomReconnectToken) cfg.roomReconnectToken = this.roomReconnectToken;
                else delete cfg.roomReconnectToken;
                store.setItem('for2d-game-mode', JSON.stringify(cfg));
            } catch { /* stockage indisponible */ }
        }
    }

    getPlayerPayload() {
        const skinData = this.getPlayerSkinData();
        return {
            id: this.getPlayerId(),
            name: this.getPlayerName(),
            ...skinData
        };
    }

    acceptGroupInvite(invitationId) {
        if (!invitationId) return false;
        this.send({ type: 'group_invite_accept', invitationId, player: this.getPlayerPayload() });
        return true;
    }

    rejectGroupInvite(invitationId) {
        if (!invitationId) return false;
        this.send({ type: 'group_invite_reject', invitationId });
        return true;
    }

    kickPlayer(playerId) {
        if (!playerId || !this.roomCode) return false;
        this.send({ type: 'kick_player', playerId });
        return true;
    }

    takePendingGroupInvites() {
        const pending = this.pendingGroupInvites;
        this.pendingGroupInvites = [];
        return pending;
    }

    getLocalProfileSnapshot() {
        return {
            schemaVersion: 1,
            progress: window.FOR2D_PROGRESS?.exportData?.() || parseJson(lsGet(ID_KEYS.progress)),
            cosmetics: window.FOR2D_COSMETICS?.exportData?.() || parseJson(lsGet(ID_KEYS.cosmetics))
        };
    }

    // Envoie le profil local au compte (seulement s'il appartient bien à ce compte)
    sendProfileSave(force = false) {
        clearTimeout(this.profileSaveTimer);
        this.profileSaveTimer = null;
        if (!this.isAuthenticated() || (!this.profileSyncReady && !force)) return;
        if (lsGet(ID_KEYS.owner) !== this.account.id) return;
        const hash = this.profileHash();
        const sync = this.readSync();
        if (sync && sync.accountId === this.account.id && sync.hash === hash) return;
        this.pendingSaveHash = hash;
        this.send({ type: 'account_profile_save', profile: this.getLocalProfileSnapshot() });
    }

    queueProfileSave() {
        if (!this.profileSyncReady || this.reloading) return;
        clearTimeout(this.profileSaveTimer);
        this.profileSaveTimer = setTimeout(() => this.sendProfileSave(), 400);
    }

    onProfileChanged() {
        if (this.applyingProfile || this.reloading) return;
        this.queueProfileSave();
    }

    getPlayerSkinData() {
        const cos = window.FOR2D_COSMETICS;
        const skin = cos?.equipped?.id || 'recrue';
        const pickaxe = cos?.equippedOf('pickaxe')?.id || 'pioche-defaut';
        const backpack = cos?.equippedOf('backpack')?.id || null;
        const colors = cos?.equipped?.game || null;
        const glider = cos?.equippedOf('glider')?.id || null;
        return { skin, pickaxeSkin: pickaxe, backpack, colors, glider };
    }

    init() {
        this.connect();
        this.checkUrlForRoomCode();

        // Les modules progression / casier sont chargés après ce script : on s'y branche ensuite
        this.whenProfileModules(() => {
            window.FOR2D_COSMETICS?.onChange?.(() => {
                this.onProfileChanged();
                if (this.isConnected() && this.roomCode) {
                    this.sendPlayerStatus(window.lobbyManager?.localPlayerReady || false);
                }
            });
            window.FOR2D_PROGRESS?.onChange?.(() => this.onProfileChanged());
        });

        // Connexion / déconnexion dans un autre onglet : on recharge pour rester cohérent
        window.addEventListener('storage', (event) => {
            if (this.reloading) return;
            if (event.key === ID_KEYS.token || event.key === ID_KEYS.owner) this.reloadPage(50);
        });
    }

    connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        const isHttps = window.location.protocol === 'https:';
        const host = window.location.host;
        // Si ouvert via file:// ou sans serveur WS local actif, fallback propre
        if (!host || window.location.protocol === 'file:') {
            console.warn('[Network] Exécution hors serveur HTTP : multijoueur désactivé.');
            this.updateConnectionStatus('Hors ligne (serveur requis)', '#ffaa00');
            return;
        }

        const wsUrl = `${isHttps ? 'wss:' : 'ws:'}//${host}/`;
        console.log('[Network] Connexion WebSocket vers', wsUrl);

        try {
            this.ws = new WebSocket(wsUrl);
        } catch (e) {
            console.warn('[Network] Impossible d\'établir la connexion WebSocket:', e);
            this.updateConnectionStatus('Hors ligne', '#ff4757');
            return;
        }

        this.ws.onopen = () => {
            console.log('[Network] Connecté au serveur multijoueur !');
            this.connected = true;
            this.updateConnectionStatus(this.roomCode ? `Connecté (${this.roomCode})` : 'En ligne', '#00ff88');
            // Nouvelle connexion : le serveur ne connaît pas encore le compte, on le restaure
            if (this.accountToken && !this.reloading) {
                this.account = null;
                this.profileSyncReady = false;
                this.startSession();
            }

            const queued = this.pendingMessages;
            this.pendingMessages = [];
            for (const data of queued) this.send(data);
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                this.handleMessage(msg);
            } catch (err) {
                console.error('[Network] Message invalide reçu:', err);
            }
        };

        this.ws.onclose = () => {
            this.connected = false;
            // Les sauvegardes reprendront après la restauration du compte
            this.profileSyncReady = false;
            if (this.roomCode) {
                this.updateConnectionStatus('Déconnecté (reconnexion...)', '#ff4757');
            } else {
                this.updateConnectionStatus('Déconnecté', '#888');
            }

            // Tentative de reconnexion automatique après 3 secondes
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = setTimeout(() => this.connect(), 3000);
        };

        this.ws.onerror = (err) => {
            console.warn('[Network] Erreur WebSocket:', err);
        };
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        } else {
            // Mettre en file d'attente (la session est renvoyée à chaque connexion)
            if (data?.type !== 'account_session') {
                this.pendingMessages.push(data);
                if (this.pendingMessages.length > 30) this.pendingMessages.shift();
            }
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                this.connect();
            }
        }
    }

    /* ===== ACTIONS DE SALLE ===== */

    // fillMatch/fillTeam restent acceptés pour compatibilité ; le choix de match
    // peut désormais être fourni au lancement de l'auto-room.
    createRoom(mode = 'duo', fillMatch = true, fillTeam = true, startChoice = null) {
        clearTimeout(this.roomJoinTimer);
        this.roomJoinTimer = null;
        this.cancelRoomOnCreate = false;
        const skinData = this.getPlayerSkinData();
        const payload = {
            type: 'create_room',
            id: this.getPlayerId(),
            accountToken: this.accountToken || undefined,
            reconnectToken: this.roomReconnectToken || undefined,
            name: this.getPlayerName(),
            mode: mode || 'duo',
            botFill: fillMatch !== false,
            fillMatch: fillMatch !== false,
            fillTeam: fillTeam !== false,
            ...(startChoice === 'bots' || startChoice === 'players' ? { startChoice } : {}),
            skin: skinData.skin,
            backpack: skinData.backpack,
            pickaxeSkin: skinData.pickaxeSkin,
            glider: skinData.glider,
            colors: skinData.colors
        };

        this.send(payload);
        this.updateConnectionStatus('Création en cours...', '#ffd700');
    }

    joinRoom(roomCode) {
        if (!roomCode) return;
        clearTimeout(this.roomJoinTimer);
        this.roomJoinTimer = null;
        roomCode = roomCode.trim().toUpperCase();

        const skinData = this.getPlayerSkinData();
        const payload = {
            type: 'join_room',
            roomCode,
            id: this.getPlayerId(),
            accountToken: this.accountToken || undefined,
            reconnectToken: this.roomReconnectToken || undefined,
            name: this.getPlayerName(),
            skin: skinData.skin,
            backpack: skinData.backpack,
            pickaxeSkin: skinData.pickaxeSkin,
            glider: skinData.glider,
            colors: skinData.colors
        };

        this.send(payload);
        this.updateConnectionStatus('Connexion à la salle...', '#ffd700');
    }

    // silent : pas de message dans le chat (salle automatique quittée au retour d'une partie)
    leaveRoom(silent = false) {
        clearTimeout(this.roomJoinTimer);
        this.roomJoinTimer = null;
        window.lobbyManager?.closeStartChoice?.();
        if (this.roomCode) {
            this.send({ type: 'leave_room' });
            this.roomCode = null;
            this.roomPlayerId = null;
            this.setRoomReconnectToken('');
            this.isHost = false;
            this.hostId = null;
            this.roomPlayers = [];
            this.slot = 1;
            this.updateRoomCodeUI('-');
            this.updateConnectionStatus('En ligne', '#00ff88');

            // Oublier la salle dans la config enregistrée : la prochaine partie hors ligne
            // ne doit pas essayer de rejoindre une salle qui n'existe plus
            for (const store of [sessionStorage, localStorage]) {
                try {
                    const cfg = JSON.parse(store.getItem('for2d-game-mode') || '{}');
                    for (const k of ['isMultiplayer', 'roomCode', 'seed', 'mySlot', 'myPlayerId', 'myTeam',
                        'isHost', 'isAdmin', 'authorityId', 'roomPlayers', 'teams', 'returningFromGame', 'autoRoom']) {
                        delete cfg[k];
                    }
                    store.setItem('for2d-game-mode', JSON.stringify(cfg));
                    store.removeItem('for2d-room-players');
                } catch { /* stockage indisponible */ }
            }

            if (window.lobbyManager) {
                window.lobbyManager.resetTeammateSlots?.();
                if (!silent) window.lobbyManager.addChatMessage?.('Tu as quitté la salle.');
                window.lobbyManager.updateLeaderPermissions?.();
            }
        }
    }

    sendPlayerStatus(ready) {
        const skinData = this.getPlayerSkinData();
        this.send({
            type: 'update_status',
            ready: !!ready,
            name: this.getPlayerName(),
            skin: skinData.skin,
            backpack: skinData.backpack,
            pickaxeSkin: skinData.pickaxeSkin,
            glider: skinData.glider,
            colors: skinData.colors
        });
    }

    sendRoomConfig(mode, fillMatch, fillTeam) {
        if (!this.isHost) return;
        const msg = { type: 'update_config', mode };
        if (typeof fillMatch === 'boolean') { msg.fillMatch = fillMatch; msg.botFill = fillMatch; }
        if (typeof fillTeam === 'boolean') msg.fillTeam = fillTeam;
        this.send(msg);
    }

    sendStartChoice(choice) {
        if (choice !== 'bots' && choice !== 'players') return false;
        this.send({ type: 'start_choice', choice });
        return true;
    }

    sendChatMessage(text) {
        if (!text) return;
        this.send({
            type: 'chat',
            message: text
        });
    }

    startGame() {
        if (!this.isHost) return;
        this.send({ type: 'start_game' });
    }

    skipMatchmakingCountdown(mode) {
        if (!this.isAuthenticated() || !this.isAdmin) return false;
        if (typeof mode !== 'string' || !/^(duel|solo|duo|trio|section)$/i.test(mode)) return false;
        this.send({ type: 'admin_skip_matchmaking_countdown', mode: mode.toLowerCase() });
        return true;
    }

    sendGameData(type, payload) {
        this.send({
            type,
            ...payload
        });
    }

    /* ===== COMPTE : RÉPONSES DU SERVEUR ===== */

    handleAccountAuthenticated(msg) {
        if (this.reloading || !msg.account?.id) return;
        const flow = this.authFlow || 'session';
        clearTimeout(this.sessionRetryTimer);
        this.account = msg.account;
        this.isAdmin = !!msg.account.isAdmin;
        this.matchmakingCountdownSeconds = msg.matchmakingCountdownSeconds === 3 ? 3 : 30;
        this.profileSyncReady = false;
        if (msg.token) {
            this.accountToken = msg.token;
            lsSet(ID_KEYS.token, msg.token);
        }
        this.authContext = { flow, isNew: !!msg.isNewAccount, accountId: msg.account.id };

        if (flow !== 'session') {
            // Le temporaire actuel est mis de côté (ou fusionné dans un nouveau compte)
            this.archiveTemporaryStorage();
            if (msg.isNewAccount) {
                this.whenProfileModules(() => {
                    if (this.authContext?.accountId !== msg.account.id) return;
                    this.send({ type: 'account_profile_import', profile: this.getLocalProfileSnapshot() });
                });
            }
        }
        this.emitFriend(msg);
    }

    handleProfileState(msg) {
        const ctx = this.authContext;
        const account = this.account;
        if (this.reloading || !account || (msg.accountId && msg.accountId !== account.id)) return;

        // Connexion ou création depuis cette page : on enregistre le profil puis on recharge
        if (ctx && ctx.flow !== 'session') {
            if (ctx.isNew && !msg.imported) return; // on attend la réponse à l'import
            this.finishAccountRequest();
            if (ctx.isNew) lsRemove(ID_KEYS.tempProgress, ID_KEYS.tempCosmetics); // données transférées au compte
            this.writeAccountProfile(account, msg.profile);
            this.refreshProfileModules();
            // Profil absent sur le serveur : empreinte vide pour l'envoyer au prochain chargement
            this.writeSync(account.id, msg.profile?.updatedAt || 0, msg.profile ? this.profileHash() : '');
            this.authContext = null;
            this.emitFriend({ type: 'account_ready', account, isNewAccount: ctx.isNew });
            this.reloadPage(400);
            return;
        }

        // Restauration de session (chargement de la page, reconnexion)
        this.finishAccountRequest();
        this.authContext = null;
        const owner = lsGet(ID_KEYS.owner);
        const sync = this.readSync();
        const localHash = this.profileHash();
        const serverAt = Number(msg.profile?.updatedAt || 0);
        const syncedAt = sync && sync.accountId === account.id ? Number(sync.updatedAt || 0) : -1;
        // La copie locale du compte a changé (ex : partie jouée) sans que le serveur ait bougé
        const localNewer = owner === account.id && sync?.accountId === account.id
            && localHash !== sync.hash && serverAt <= syncedAt;
        let push = false;
        if (owner === account.id && (!msg.profile || localNewer)) {
            push = true;
        } else {
            this.writeAccountProfile(account, msg.profile);
            this.refreshProfileModules();
            this.writeSync(account.id, serverAt, this.profileHash());
            push = !msg.profile;
        }
        lsSet(ID_KEYS.welcomed, '1');
        lsSet(ID_KEYS.name, account.name);
        if (window.FOR2D_PROGRESS && window.FOR2D_PROGRESS.name !== account.name) {
            this.applyingProfile = true;
            try { window.FOR2D_PROGRESS.setName?.(account.name); } finally { this.applyingProfile = false; }
            push = true;
        }
        this.profileSyncReady = true;
        if (push) {
            // Empreinte vide : la copie locale est forcément envoyée
            this.writeSync(account.id, serverAt, '');
            this.sendProfileSave();
        }
        this.emitFriend({ type: 'profile_ready', account });
    }

    handleProfileError(msg) {
        const ctx = this.authContext;
        const account = this.account;
        if (this.reloading || !account) return this.emitFriend(msg);
        if (ctx && ctx.flow !== 'session' && ctx.isNew) {
            // Import impossible : le compte démarre avec son profil serveur (ou neuf),
            // le profil temporaire reste rangé et reviendra à la déconnexion
            this.finishAccountRequest();
            this.writeAccountProfile(account, msg.profile || null);
            this.refreshProfileModules();
            this.writeSync(account.id, msg.profile?.updatedAt || 0, '');
            this.authContext = null;
            this.emitFriend({ type: 'account_ready', account, isNewAccount: true, warning: msg.message });
            this.reloadPage(400);
            return;
        }
        if (msg.code === 'db_unavailable' || msg.code === 'not_authenticated') this.profileSyncReady = false;
        this.emitFriend(msg);
    }

    handleAccountError(msg) {
        const action = msg.action;
        if (action === 'register' || action === 'login' || action === 'session') {
            this.finishAccountRequest();
            this.authContext = null;
        }
        if (action === 'session') {
            if (msg.code === 'session_invalid' && !this.reloading) {
                // Session expirée ou révoquée : retour au profil temporaire rangé (ou à l'accueil)
                this.account = null;
                this.accountToken = '';
                this.isAdmin = false;
                this.matchmakingCountdownSeconds = 30;
                this.switchToTemporaryStorage();
                this.emitFriend(msg);
                this.reloadPage(800);
                return;
            }
            // Base indisponible : on garde la session et on réessaie
            this.scheduleSessionRetry();
        }
        this.emitFriend(msg);
    }

    /* ===== GESTION DES MESSAGES SERVEUR ===== */

    handleMessage(msg) {
        switch (msg.type) {
            case 'account_authenticated':
                this.handleAccountAuthenticated(msg);
                break;
            case 'account_updated':
                this.account = msg.account || this.account;
                this.isAdmin = !!this.account?.isAdmin;
                this.matchmakingCountdownSeconds = this.isAdmin && msg.matchmakingCountdownSeconds === 3 ? 3 : 30;
                if (this.account?.name) {
                    lsSet(ID_KEYS.name, this.account.name);
                    // Nouveau pseudo : copie locale mise à jour puis sauvegardée sur le compte
                    this.whenProfileModules(() => window.FOR2D_PROGRESS?.setName?.(this.account.name));
                }
                this.emitFriend(msg);
                break;
            case 'account_logged_out':
                this.isAdmin = false;
                this.matchmakingCountdownSeconds = 30;
                if (this.logoutDone) this.logoutDone();
                else if (!this.reloading && this.accountToken) {
                    // Session fermée par le serveur
                    this.switchToTemporaryStorage();
                    this.reloadPage(0);
                }
                this.emitFriend(msg);
                break;
            case 'profile_state':
                this.whenProfileModules(() => this.handleProfileState(msg));
                break;
            case 'profile_saved':
                if (this.account && msg.accountId === this.account.id) {
                    this.writeSync(this.account.id, msg.updatedAt, this.pendingSaveHash);
                    // Modifié pendant l'envoi : nouvelle sauvegarde
                    if (this.profileHash() !== this.pendingSaveHash) this.queueProfileSave();
                }
                this.emitFriend(msg);
                break;
            case 'profile_error':
                this.whenProfileModules(() => this.handleProfileError(msg));
                break;
            case 'account_error':
                this.handleAccountError(msg);
                break;
            case 'admin_countdown_updated':
                this.matchmakingCountdownSeconds = msg.seconds === 3 ? 3 : 30;
                break;
            case 'admin_countdown_skipped':
                window.lobbyManager?.showToast?.('Compte à rebours accéléré à 3 secondes.');
                break;
            case 'friends_state':
                // Gardé en mémoire : le panneau Amis peut être créé après cette réponse
                this.friendsState = msg;
                this.emitFriend(msg);
                break;
            case 'friend_error':
            case 'friend_success':
            case 'friends_changed':
            case 'friend_invite':
            case 'friend_invite_sent':
            case 'group_invite_sent':
            case 'group_invite_accepted':
            case 'group_invite_rejected':
            case 'group_invite_error':
                this.emitFriend(msg);
                if (msg.type === 'group_invite_error' && msg.code !== 'invite_cooldown') {
                    this.showError(msg.message || 'Invitation impossible.');
                }
                break;
            case 'group_invite':
                if (!this.friendHandlers.size) this.pendingGroupInvites.push(msg);
                this.emitFriend(msg);
                break;
            case 'room_created':
                this.roomPlayerId = msg.playerId || this.session.playerId;
                this.setRoomReconnectToken(msg.reconnectToken);
                this.isHost = true;
                this.hostId = this.getPlayerId();
                this.roomCode = msg.roomCode;
                this.slot = 1;
                this.roomPlayers = msg.players || [];
                this.updateRoomCodeUI(this.roomCode);
                this.updateConnectionStatus(`Chef du groupe (Salle ${this.roomCode})`, '#00ff88');

                if (this.cancelRoomOnCreate) {
                    this.cancelRoomOnCreate = false;
                    this.readyAfterCreate = false;
                    this.leaveRoom(true);
                    break;
                }

                if (this.readyAfterCreate) {
                    const me = this.roomPlayers.find(p => p.id === this.getPlayerId());
                    if (me) me.ready = true; // évite que le bouton « Prêt » clignote
                }
                if (window.lobbyManager) {
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
                // Salle créée juste pour la file d'attente (« Prêt » sans remplir la partie) :
                // on se met prêt tout de suite, pas besoin de partager le code
                if (this.readyAfterCreate) {
                    this.readyAfterCreate = false;
                    this.sendPlayerStatus(true);
                    break;
                }

                this.copyCodeToClipboard(this.roomCode);
                if (window.lobbyManager) {
                    window.lobbyManager.addChatMessage(`Partie créée ! Code : ${this.roomCode}`);
                    window.lobbyManager.addChatMessage('Partage ce code ou le lien d\'invitation avec tes amis !');
                }
                break;

            case 'room_joined':
                this.roomPlayerId = msg.playerId || this.roomPlayerId || this.session.playerId;
                this.setRoomReconnectToken(msg.reconnectToken);
                this.hostId = msg.hostId;
                this.isHost = (msg.hostId === this.getPlayerId());
                this.roomCode = msg.roomCode;
                this.slot = msg.slot || this.slot || 2;
                this.roomPlayers = msg.players || [];
                this.updateRoomCodeUI(this.roomCode);
                this.updateConnectionStatus(this.isHost ? `Chef du groupe (Salle ${this.roomCode})` : `Membre du groupe (Salle ${this.roomCode})`, '#00ff88');

                if (window.lobbyManager) {
                    // Si on revient d'une partie, afficher un message adapté
                    let returning = false;
                    try {
                        const cfg = JSON.parse(sessionStorage.getItem('for2d-game-mode') || '{}');
                        if (cfg.returningFromGame) {
                            returning = true;
                            // Salle créée seulement pour la file d'attente : on la quittera
                            // dès qu'elle redevient un lobby (retour à l'accueil comme avant)
                            if (cfg.autoRoom) this.leaveAutoRoom = true;
                            // Nettoyer le flag
                            delete cfg.returningFromGame;
                            delete cfg.autoRoom;
                            sessionStorage.setItem('for2d-game-mode', JSON.stringify(cfg));
                            localStorage.setItem('for2d-game-mode', JSON.stringify(cfg));
                        }
                    } catch {}

                    // Retour d'une partie lancée seul depuis l'accueil : on quitte la salle
                    // automatique et on retrouve l'accueil tel qu'il était (même mode, pas de salle)
                    if (this.leaveAutoRoom && this.roomPlayers.length <= 1) {
                        if (msg.mode) window.lobbyManager.setGameModeSilently?.(msg.mode);
                        // Partie encore marquée « en cours » : le serveur renvoie la salle en
                        // lobby juste après (on est le seul joueur), on la quittera à ce moment-là
                        if (msg.state === 'game') {
                            // Filet de sécurité si ce message n'arrive pas
                            setTimeout(() => {
                                if (!this.leaveAutoRoom) return;
                                this.leaveAutoRoom = false;
                                this.leaveRoom(true);
                            }, 3000);
                            break;
                        }
                        this.leaveAutoRoom = false;
                        this.leaveRoom(true);
                        break;
                    }
                    this.leaveAutoRoom = false;

                    if (returning) {
                        window.lobbyManager.addChatMessage(`Retour dans le groupe (Salle ${this.roomCode}) !`);
                    } else {
                        window.lobbyManager.addChatMessage(`Connecté à la salle ${this.roomCode} !`);
                    }
                    if (msg.mode) window.lobbyManager.setGameModeSilently?.(msg.mode);
                    window.lobbyManager.applyFillConfig?.(msg);
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
                break;

            case 'player_joined':
                if (msg.player) {
                    const lobby = window.lobbyManager;
                    const isLocalDuplicate = Boolean(
                        lobby?.autoRoom
                        && String(msg.player.id) !== String(this.getPlayerId())
                        && msg.player.name === this.getPlayerName()
                    );
                    if (isLocalDuplicate) break;

                    // Mettre à jour la liste des joueurs
                    this.roomPlayers = this.roomPlayers.filter(p => p.id !== msg.player.id);
                    this.roomPlayers.push(msg.player);
                    if (lobby) lobby.autoRoom = false;

                    if (window.lobbyManager) {
                        window.lobbyManager.addChatMessage(`${msg.player.name} a rejoint le groupe !`);
                        window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                        window.lobbyManager.updateLeaderPermissions?.();
                        window.SFX?.play?.('click');
                    }
                }
                break;

            case 'player_updated':
                if (msg.player) {
                    const idx = this.roomPlayers.findIndex(p => p.id === msg.player.id);
                    if (idx >= 0) this.roomPlayers[idx] = { ...this.roomPlayers[idx], ...msg.player };
                    else this.roomPlayers.push(msg.player);

                    if (window.lobbyManager) {
                        window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    }
                }
                break;

            case 'player_left':
                this.roomPlayers = this.roomPlayers.filter(p => p.id !== msg.playerId);
                if (window.lobbyManager) {
                    window.lobbyManager.addChatMessage(`${msg.playerName || 'Un joueur'} ${msg.kicked ? 'a été retiré du groupe.' : 'a quitté le groupe.'}`);
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
                break;

            case 'player_kicked':
                if (window.lobbyManager) {
                    window.lobbyManager.showToast?.(msg.message || 'Tu as été retiré du groupe.');
                    window.lobbyManager.addChatMessage?.(msg.message || 'Tu as été retiré du groupe.');
                }
                this.leaveRoom(true);
                break;

            case 'new_host':
                this.hostId = msg.hostId;
                this.isHost = (msg.hostId === this.getPlayerId());
                this.roomPlayers.forEach(p => { p.isHost = (p.id === msg.hostId); });
                if (window.lobbyManager) {
                    if (this.isHost) {
                        window.lobbyManager.addChatMessage('👑 Tu es maintenant le chef du groupe !');
                        window.lobbyManager.showToast?.('Tu es maintenant le chef du groupe !');
                    } else {
                        const newLeader = this.roomPlayers.find(p => p.id === msg.hostId);
                        if (newLeader) window.lobbyManager.addChatMessage(`👑 ${newLeader.name} est maintenant le chef du groupe.`);
                    }
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
                break;

            case 'room_config':
                if (window.lobbyManager) {
                    if (msg.mode && !window.lobbyManager.autoRoom) window.lobbyManager.setGameModeSilently?.(msg.mode);
                    window.lobbyManager.applyFillConfig?.(msg);
                    const fm = (msg.fillMatch ?? msg.botFill) !== false;
                    const ft = msg.fillTeam !== false;
                    window.lobbyManager.addChatMessage(
                        `Configuration : Mode ${(msg.mode || 'duo').toUpperCase()} · Équipe ${ft ? 'remplie de bots' : 'sans bots'} · Partie ${fm ? 'remplie de bots' : 'en file d\'attente (vrais joueurs)'}`,
                        'Système');
                }
                break;

            case 'start_choice_required':
                window.lobbyManager?.openStartChoice?.(msg);
                break;

            case 'matchmaking_status':
                if (window.lobbyManager) {
                    window.lobbyManager.handleMatchmakingStatus?.(msg);
                }
                break;

            case 'chat':
                if (window.lobbyManager) {
                    window.lobbyManager.addChatMessage(msg.message, msg.author);
                }
                break;

            case 'game_start':
                this.handleGameStart(msg);
                break;

            case 'error':
                this.showError(msg.message || 'Erreur réseau');
                break;

            // In-game messages
            case 'p_state':
            case 'p_action':
            case 'p_hit':
            case 'p_revive':
            case 'p_kill':
                for (const handler of this.gameDataHandlers) {
                    try { handler(msg); } catch (e) { console.error(e); }
                }
                break;
        }
    }

    onGameData(fn) {
        this.gameDataHandlers.push(fn);
    }

    handleGameStart(msg) {
        console.log('[Network] Lancement de la partie multijoueur !', msg);

        // Fermer l'overlay de matchmaking si ouvert
        if (window.lobbyManager) {
            window.lobbyManager.closeStartChoice?.();
            window.lobbyManager.handleMatchmakingStatus?.({ state: 'idle' });
        }

        // Sauvegarder la configuration de la partie dans sessionStorage ET localStorage pour game.html
        const teamSize = msg.mode === 'duo' ? 2 : msg.mode === 'trio' ? 3 : msg.mode === 'section' ? 4 : 1;
        const mapId = msg.mapId || (msg.mode === 'duel' ? 'duel-two-towns' : 'default');
        const roomPlayers = (Array.isArray(msg.players) && msg.players.length > 0) ? msg.players : this.roomPlayers;
        const localPlayer = roomPlayers.find(p => p?.id === this.getPlayerId());
        const isAdmin = localPlayer ? localPlayer.isAdmin === true : this.isAdmin === true;
        const config = {
            mode: msg.mode || 'duo',
            mapId,
            modeName: (msg.mode || 'duo').toUpperCase(),
            teamSize,
            bots: (msg.fillMatch ?? msg.botFill) !== false,
            fillMatch: (msg.fillMatch ?? msg.botFill) !== false,
            fillTeam: msg.fillTeam !== false,
            // Équipes de vrais joueurs de la partie (pour calculer les bots pareil partout)
            teams: Array.isArray(msg.teams) ? msg.teams : null,
            isMultiplayer: true,
            roomCode: msg.roomCode,
            seed: msg.seed,
            roomReconnectToken: this.roomReconnectToken,
            mySlot: this.slot,
            myPlayerId: this.getPlayerId(),
            myTeam: msg.myTeam || 1,
            isHost: !!this.isHost,
            isAdmin,
            // Joueur qui simule les bots / la corruption pour toute la partie (désigné par le serveur)
            authorityId: msg.authorityId || null,
            // Salle créée toute seule (« Prêt » seul sans remplir la partie) : quittée au retour
            autoRoom: !!window.lobbyManager?.autoRoom && this.roomPlayers.length <= 1,
            roomPlayers
        };

        try {
            sessionStorage.setItem('for2d-game-mode', JSON.stringify(config));
            sessionStorage.setItem('for2d-room-players', JSON.stringify(roomPlayers));
            localStorage.setItem('for2d-game-mode', JSON.stringify(config));
            localStorage.setItem('for2d-room-players', JSON.stringify(roomPlayers));
        } catch { /* ignore */ }

        if (window.lobbyManager) {
            window.lobbyManager.addChatMessage('🚀 La partie commence maintenant !');
            window.SFX?.play?.('launch');
        }

        setTimeout(() => {
            const pid = encodeURIComponent(this.getPlayerId());
            const seed = encodeURIComponent(msg.seed || '');
            const mode = encodeURIComponent(msg.mode || 'duo');
            const map = encodeURIComponent(mapId);
            const auth = encodeURIComponent(msg.authorityId || '');
            window.location.href = `game.html?room=${msg.roomCode}&slot=${this.slot}&pid=${pid}&seed=${seed}&mode=${mode}&map=${map}&auth=${auth}`;
        }, 1200);
    }

    /* ===== OUTILS UI ET COPIE ===== */

    copyCodeToClipboard(code) {
        if (!code || code === '-') return;
        const url = `${window.location.origin}${window.location.pathname}#party=${code}`;

        navigator.clipboard?.writeText(code).then(() => {
            if (window.lobbyManager) {
                window.lobbyManager.showToast?.(`Code ${code} copié dans le presse-papier !`);
            }
        }).catch(() => {});
    }

    copyInviteLinkToClipboard(code) {
        const c = code || this.roomCode;
        if (!c || c === '-') return;
        const url = `${window.location.origin}${window.location.pathname}#party=${c}`;

        navigator.clipboard?.writeText(url).then(() => {
            if (window.lobbyManager) {
                window.lobbyManager.showToast?.(`Lien d'invitation copié !`);
            }
        }).catch(() => {});
    }

    checkUrlForRoomCode() {
        // Détecter #party=CODE ou #join=CODE ou ?room=CODE
        const hash = window.location.hash;
        const search = window.location.search;
        let foundCode = null;

        const partyMatch = hash.match(/#(?:party|join)=([A-Z0-9]{4,8})/i);
        if (partyMatch) foundCode = partyMatch[1];
        else {
            const queryMatch = search.match(/[?&]room=([A-Z0-9]{4,8})/i);
            if (queryMatch) foundCode = queryMatch[1];
        }

        if (foundCode) {
            console.log('[Network] Code de salle trouvé dans l\'URL:', foundCode);
            clearTimeout(this.roomJoinTimer);
            this.roomJoinTimer = setTimeout(() => {
                this.roomJoinTimer = null;
                if (this.roomCode || this.readyAfterCreate || this.cancelRoomOnCreate) return;
                this.joinRoom(foundCode);
                // Nettoyer le hash après détection
                history.replaceState(null, '', window.location.pathname);
            }, 800);
        }
    }

    updateConnectionStatus(status, color = '#00ff88') {
        const el = document.getElementById('connectionStatus');
        if (el) {
            el.textContent = status;
            el.style.color = color;
        }
    }

    updateRoomCodeUI(code) {
        const el = document.getElementById('roomCode');
        if (el) {
            el.textContent = code || '-';
            el.classList.toggle('has-code', !!code && code !== '-');
        }
    }

    showError(msg) {
        if (window.lobbyManager) {
            window.lobbyManager.showToast?.(`❌ ${msg}`);
            window.lobbyManager.addChatMessage?.(`❌ ${msg}`);
        } else {
            alert(msg);
        }
        this.updateConnectionStatus('Erreur', '#ff4757');
    }

    isConnected() {
        return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
    }
}

// Initialisation globale
const networkManager = new NetworkManager();
window.networkManager = networkManager;
