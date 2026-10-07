/* ==================================
   GESTIONNAIRE MULTIJOUEUR WEBSOCKET - FOR2D ROYAL
   Salles de jeu temps-réel, synchronisation lobby & partie
   Adapté pour Node.js sur hébergement Hostinger (Business)
   ================================== */

const crypto = require('crypto');
const { MySqlStore } = require('./mysql-store.js');
const { INITIAL_MATCHMAKING_COUNTDOWN, isAdminName, parseMatchmakingCountdown } = require('./admin-config.js');

const ROOM_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS_PER_ROOM = 4; // Escouade max par lobby
const MAX_FIGHTERS = 24;        // places sur la carte (même valeur que js/game/main.js)
const DUEL_MODE = 'duel';
const MODE_TEAM_SIZES = { duel: 1, solo: 1, duo: 2, trio: 3, section: 4 };
const FLIGHT_DELAY = 6000;      // ms entre le lancement et le départ du vaisseau (chargement des pages)
const PLAYER_GONE_DELAY = 10000; // ms sans connexion avant qu'un joueur soit éliminé (parti pour de bon)
const EMOTE_MIN_GAP = 2500;      // ms minimum entre deux emotes d'un même joueur (anti-spam)
const GROUP_INVITE_TTL = 90 * 1000; // une invitation de groupe reste valable 90 secondes
const GROUP_INVITE_COOLDOWN = 20 * 1000; // délai minimum avant de réinviter le même ami
const AUTH_WINDOW = 10 * 60 * 1000;   // fenêtre de comptage des tentatives
const AUTH_MAX_PER_IP = 20;           // connexions + créations par adresse IP
const AUTH_MAX_FAILS_PER_NAME = 8;    // mots de passe faux pour un même pseudo
const ADMIN_WEAPON_IDS = new Set(['pistol', 'crossbow', 'ricochet', 'smg', 'ar', 'shotgun', 'sniper']);
const ADMIN_MAX_RARITY = 4;
const ADMIN_POWERS = new Set(['invisibility', 'heal_health', 'heal_shield', 'invincible', 'speed', 'noclip']);
const ADMIN_ACTIONS = new Set(['kill_target', 'heal_health', 'heal_shield', 'teleport_to_target', 'teleport_target_here', 'give_weapon', 'give_heal', 'kick_target']);
const ADMIN_HEAL_IDS = new Set(['bandage', 'medkit', 'shieldPotion', 'healingSpray', 'stimPatch']);

// Nom court de l'action renvoyé au client (le formulaire sait quoi débloquer)
const ACCOUNT_ACTIONS = {
    account_register: 'register',
    account_login: 'login',
    account_session: 'session',
    account_logout: 'logout',
    account_rename: 'rename',
    account_profile_import: 'profile',
    account_profile_save: 'profile',
    admin_set_matchmaking_countdown: 'admin_countdown',
    admin_skip_matchmaking_countdown: 'admin_countdown_skip'
};

// Identifiant de planeur reçu d'un client : court texte sûr, sinon rien
function gliderId(v) {
    return typeof v === 'string' && /^[a-z0-9-]{1,32}$/.test(v) ? v : null;
}

function playerName(v, fallback = 'Joueur') {
    const cleaned = String(v ?? '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .replace(/[^\p{L}\p{N}_. -]/gu, '')
        .trim()
        .slice(0, 16);
    return cleaned || fallback;
}

function newReconnectToken() {
    return crypto.randomBytes(32).toString('hex');
}

function sameReconnectToken(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(actual) || !/^[a-f0-9]{64}$/.test(expected)) return false;
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function generateRoomCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    }
    return code;
}

class RoomManager {
    constructor() {
        this.rooms = new Map();             // roomCode -> Room
        this.playerRooms = new Map();       // ws -> roomCode
        this.matchmakingQueues = new Map(); // mode -> { rooms: Set<roomCode>, timer: interval, secondsLeft: number }
        this.matchmakingCountdownSeconds = INITIAL_MATCHMAKING_COUNTDOWN;
        this.friends = new MySqlStore();
        this.ready = this.friends.ready;
        this.accountSockets = new Map();    // accountId -> Set<ws>
        this.groupInvites = new Map();      // invitationId -> invitation temporaire
        this.groupInviteCooldowns = new Map(); // fromId:targetId -> timestamp autorisé
        this.authAttempts = new Map();      // clé (ip / pseudo) -> { count, reset }
        setInterval(() => {
            const now = Date.now();
            for (const [key, entry] of this.authAttempts) if (now > entry.reset) this.authAttempts.delete(key);
            for (const [id, invite] of this.groupInvites) if (now > invite.expiresAt) this.groupInvites.delete(id);
            for (const [key, expiresAt] of this.groupInviteCooldowns) if (now > expiresAt) this.groupInviteCooldowns.delete(key);
        }, 60 * 1000).unref?.();
    }

    get dbReady() {
        return this.friends.available;
    }

    adminInfo(ws) {
        if (!ws?.isAdmin) return {};
        return {
            isAdmin: true,
            matchmakingCountdownSeconds: this.matchmakingCountdownSeconds
        };
    }

    /* ----- Limite des tentatives de connexion / création (anti force brute) ----- */

    authBlockedFor(key, max) {
        const entry = this.authAttempts.get(key);
        if (!entry || Date.now() > entry.reset) return 0;
        return entry.count >= max ? Math.ceil((entry.reset - Date.now()) / 60000) : 0;
    }

    authHit(key) {
        const now = Date.now();
        let entry = this.authAttempts.get(key);
        if (!entry || now > entry.reset) {
            entry = { count: 0, reset: now + AUTH_WINDOW };
            this.authAttempts.set(key, entry);
        }
        entry.count++;
    }

    // Message d'erreur quand MySQL est injoignable (le type dépend de l'action)
    unavailableMessage(type) {
        const message = 'Service des comptes temporairement indisponible. Réessaie dans un instant.';
        if (type === 'account_profile_import' || type === 'account_profile_save') {
            return { type: 'profile_error', code: 'db_unavailable', message };
        }
        if (type.startsWith('friend_')) return { type: 'friend_error', action: type, code: 'db_unavailable', message };
        if (type.startsWith('group_invite')) return { type: 'group_invite_error', action: type, code: 'db_unavailable', message };
        return { type: 'account_error', action: ACCOUNT_ACTIONS[type] || type, code: 'db_unavailable', message };
    }

    /* ===================== COMPTES ET AMIS ===================== */

    sendFriend(ws, data) {
        this.send(ws, data);
    }

    async bindAccount(ws, accountId) {
        const account = await this.friends.get(accountId);
        if (!account) return false;
        if (ws.accountId && ws.accountId !== accountId) this.unbindAccount(ws);
        ws.accountId = accountId;
        ws.accountName = account.name;
        ws.isAdmin = isAdminName(account.name);
        let sockets = this.accountSockets.get(accountId);
        if (!sockets) {
            sockets = new Set();
            this.accountSockets.set(accountId, sockets);
        }
        sockets.add(ws);

        // Si l’authentification arrive alors que cette socket est déjà dans une salle,
        // les autres joueurs doivent voir immédiatement le nouveau pseudo et son statut admin.
        const code = this.playerRooms.get(ws);
        const room = code ? this.rooms.get(code) : null;
        const player = room?.players.get(ws.playerId);
        if (player) {
            player.name = account.name;
            player.isAdmin = ws.isAdmin;
            this.broadcastToRoom(room, { type: 'player_updated', player: this.serializePlayer(player, room) });
        }

        return true;
    }

    unbindAccount(ws) {
        const id = ws?.accountId;
        if (!id) return;
        const sockets = this.accountSockets.get(id);
        sockets?.delete(ws);
        if (sockets && !sockets.size) this.accountSockets.delete(id);
        delete ws.accountId;
        delete ws.accountName;
        delete ws.isAdmin;
        delete ws.accountToken;
    }

    async authenticateToken(ws, token) {
        if (!this.dbReady) return false;
        const session = await this.friends.authenticateSession(token);
        if (!session || !(await this.bindAccount(ws, session.accountId))) return false;
        ws.accountToken = token;
        return true;
    }

    async accountToken(ws) {
        const token = await this.friends.createSession(ws.accountId);
        ws.accountToken = token;
        return token;
    }

    async friendState(ws) {
        if (!ws.accountId) return null;
        const state = await this.friends.list(ws.accountId);
        if (!state) return null;
        const online = (account) => ({ ...account, online: this.accountSockets.has(account.id) });
        return {
            account: state.account,
            friends: state.friends.map(online),
            incoming: state.incoming.map(online),
            outgoing: state.outgoing.map(online)
        };
    }

    async sendFriendState(ws) {
        const state = await this.friendState(ws);
        if (state) this.sendFriend(ws, { type: 'friends_state', ...state });
    }

    notifyAccount(accountId, data) {
        for (const socket of this.accountSockets.get(accountId) || []) this.sendFriend(socket, data);
    }

    notifyAdmins(data, excludeWs = null) {
        for (const sockets of this.accountSockets.values()) {
            for (const socket of sockets) {
                if (socket !== excludeWs && socket.isAdmin) this.sendFriend(socket, data);
            }
        }
    }

    roomForSocket(ws) {
        const code = this.playerRooms.get(ws);
        return code ? this.rooms.get(code) || null : null;
    }

    accountRoom(accountId) {
        for (const socket of this.accountSockets.get(accountId) || []) {
            const room = this.roomForSocket(socket);
            if (!room) continue;
            const player = room.players.get(socket.playerId || accountId);
            if (player) return { room, player, socket };
        }
        return null;
    }

    accountIsPlaying(accountId) {
        for (const socket of this.accountSockets.get(accountId) || []) {
            const room = this.roomForSocket(socket);
            if (!room || room.state !== 'game') continue;
            const player = room.players.get(socket.playerId || accountId);
            if (player && !player.inLobby) return true;
        }
        return false;
    }

    groupInviteError(ws, code, message, invitationId = null) {
        this.sendFriend(ws, {
            type: 'group_invite_error',
            code,
            message,
            ...(invitationId ? { invitationId } : {})
        });
    }

    invitationFromMessage(ws, invitationId) {
        const invite = this.groupInvites.get(String(invitationId || ''));
        if (!invite || invite.targetId !== ws.accountId) {
            this.groupInviteError(ws, 'invite_invalid', 'Cette invitation n’est plus disponible.', invitationId);
            return null;
        }
        if (Date.now() > invite.expiresAt) {
            this.groupInvites.delete(invite.id);
            this.groupInviteError(ws, 'invite_expired', 'Cette invitation a expiré. Demande à ton ami de te réinviter.', invite.id);
            return null;
        }
        return invite;
    }

    async createGroupInvite(ws, targetId) {
        targetId = String(targetId || '').trim();
        const room = this.roomForSocket(ws);
        const player = room?.players.get(ws.playerId);

        if (!room) return this.groupInviteError(ws, 'no_lobby', 'Crée ou rejoins un groupe avant d’inviter un ami.');
        if (room.state === 'game' && player && !player.inLobby) {
            return this.groupInviteError(ws, 'inviter_in_game', 'Impossible d’inviter quelqu’un pendant une partie. Reviens d’abord dans le lobby.');
        }
        if (room.state !== 'lobby') {
            return this.groupInviteError(ws, 'lobby_required', 'Les invitations sont disponibles uniquement dans le lobby.');
        }
        if (!targetId || targetId === ws.accountId) {
            return this.groupInviteError(ws, 'invalid_target', 'Choisis un ami valide.');
        }
        if (!(await this.friends.areFriends(ws.accountId, targetId))) {
            return this.groupInviteError(ws, 'not_friend', 'Tu peux inviter uniquement un ami accepté.');
        }
        if (room.players.has(targetId)) {
            return this.groupInviteError(ws, 'already_in_group', 'Cet ami est déjà dans ton groupe.');
        }
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            return this.groupInviteError(ws, 'room_full', 'Ton groupe est déjà complet.');
        }
        if (!this.accountSockets.has(targetId)) {
            return this.groupInviteError(ws, 'target_offline', 'Cet ami est hors ligne. Il doit être connecté pour recevoir une invitation.');
        }
        if (this.accountIsPlaying(targetId)) {
            return this.groupInviteError(ws, 'target_in_game', 'Cet ami est déjà en partie. Il devra revenir au lobby avant de rejoindre ton groupe.');
        }

        const inviteKey = `${ws.accountId}:${targetId}`;
        const now = Date.now();
        const pendingInvite = [...this.groupInvites.values()].find((invite) =>
            invite.fromId === ws.accountId && invite.targetId === targetId
        );
        if (pendingInvite && now <= pendingInvite.expiresAt) {
            // Le destinataire a déjà cette invitation : ne renvoie rien et ne crée pas de doublon.
            return this.sendFriend(ws, {
                type: 'group_invite_sent',
                invitationId: pendingInvite.id,
                targetId,
                roomCode: pendingInvite.roomCode,
                mode: pendingInvite.mode,
                duplicate: true,
                message: 'Invitation déjà en attente chez ce joueur.'
            });
        }
        if (pendingInvite) this.groupInvites.delete(pendingInvite.id);

        const cooldownUntil = this.groupInviteCooldowns.get(inviteKey) || 0;
        if (cooldownUntil > now) {
            const retryAfter = Math.ceil((cooldownUntil - now) / 1000);
            return this.groupInviteError(ws, 'invite_cooldown', `Attends encore ${retryAfter} seconde${retryAfter > 1 ? 's' : ''} avant de réinviter cet ami.`);
        }

        const id = crypto.randomBytes(16).toString('hex');
        const invite = {
            id,
            fromId: ws.accountId,
            targetId,
            roomCode: room.code,
            mode: room.mode,
            createdAt: Date.now(),
            expiresAt: Date.now() + GROUP_INVITE_TTL
        };
        this.groupInvites.set(id, invite);
        this.groupInviteCooldowns.set(inviteKey, now + GROUP_INVITE_COOLDOWN);
        this.notifyAccount(targetId, {
            type: 'group_invite',
            invitationId: id,
            from: await this.friends.getPublic(ws.accountId),
            roomCode: room.code,
            mode: room.mode,
            expiresAt: invite.expiresAt
        });
        return this.sendFriend(ws, {
            type: 'group_invite_sent',
            invitationId: id,
            targetId,
            roomCode: room.code,
            mode: room.mode,
            message: 'Invitation envoyée.'
        });
    }

    async rejectGroupInvite(ws, invitationId) {
        const invite = this.invitationFromMessage(ws, invitationId);
        if (!invite) return;
        this.groupInvites.delete(invite.id);
        this.sendFriend(ws, { type: 'group_invite_rejected', invitationId: invite.id, by: 'target' });
        this.notifyAccount(invite.fromId, {
            type: 'group_invite_rejected',
            invitationId: invite.id,
            by: await this.friends.getPublic(ws.accountId)
        });
    }

    async acceptGroupInvite(ws, invitationId, playerData = {}) {
        const invite = this.invitationFromMessage(ws, invitationId);
        if (!invite) return;

        if (this.accountIsPlaying(ws.accountId)) {
            return this.groupInviteError(ws, 'target_in_game', 'Tu es déjà en partie. Reviens dans le lobby avant d’accepter cette invitation.', invite.id);
        }

        const room = this.rooms.get(invite.roomCode);
        const inviter = room?.players.get(invite.fromId);
        if (!room || room.state !== 'lobby' || !inviter) {
            this.groupInvites.delete(invite.id);
            return this.groupInviteError(ws, 'inviter_unavailable', 'Le groupe de ton ami n’est plus disponible. Demande-lui de te réinviter.', invite.id);
        }
        if (room.players.has(ws.accountId)) {
            this.groupInvites.delete(invite.id);
            return this.groupInviteError(ws, 'already_in_group', 'Tu es déjà dans ce groupe.', invite.id);
        }
        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            this.groupInvites.delete(invite.id);
            return this.groupInviteError(ws, 'room_full', 'Ce groupe est maintenant complet.', invite.id);
        }

        const joined = await this.joinRoom(ws, invite.roomCode, playerData);
        if (!joined) {
            return this.groupInviteError(ws, 'join_failed', 'Le groupe a changé entre-temps. Réessaie ou demande une nouvelle invitation.', invite.id);
        }
        this.groupInvites.delete(invite.id);
        const acceptedBy = await this.friends.getPublic(ws.accountId);
        this.notifyAccount(invite.fromId, {
            type: 'group_invite_accepted',
            invitationId: invite.id,
            player: acceptedBy,
            roomCode: invite.roomCode,
            mode: joined.mode
        });
        this.sendFriend(ws, {
            type: 'group_invite_accepted',
            invitationId: invite.id,
            roomCode: invite.roomCode,
            mode: joined.mode
        });
    }

    async requireAccount(ws) {
        if (!ws.accountId || !ws.accountToken) return false;
        const session = await this.friends.authenticateSession(ws.accountToken);
        if (!session || session.accountId !== ws.accountId) {
            this.unbindAccount(ws);
            return false;
        }
        ws.accountName = session.name;
        ws.isAdmin = isAdminName(session.name);
        return true;
    }

    async sendProfileState(ws, extra = {}) {
        if (!ws.accountId) return;
        const profile = await this.friends.getProfile(ws.accountId);
        this.sendFriend(ws, { type: 'profile_state', profile, accountId: ws.accountId, ...extra });
    }

    async handleFriendMessage(ws, msg) {
        const type = msg?.type;
        if (type === 'admin_set_matchmaking_countdown') {
            return this.setMatchmakingCountdown(ws, msg.seconds);
        }
        if (type === 'admin_skip_matchmaking_countdown') {
            return this.skipMatchmakingCountdown(ws, msg.mode);
        }
        if (type === 'account_session') {
            if (!(await this.authenticateToken(ws, msg.token))) {
                return this.sendFriend(ws, { type: 'account_error', action: 'session', code: 'session_invalid', message: 'Session expirée, reconnecte-toi.' });
            }
            this.sendFriend(ws, {
                type: 'account_authenticated',
                token: msg.token,
                account: await this.friends.getPublic(ws.accountId),
                ...this.adminInfo(ws),
                isNewAccount: false
            });
            await this.sendFriendState(ws);
            await this.sendProfileState(ws, { initial: true });
            return;
        }
        if (type === 'account_register' || type === 'account_login') {
            const action = ACCOUNT_ACTIONS[type];
            if (await this.requireAccount(ws)) {
                return this.sendFriend(ws, { type: 'account_error', action, code: 'already_authenticated', message: 'Ce navigateur est déjà connecté à un compte.' });
            }
            const ipKey = `ip:${ws.clientIp || 'inconnue'}`;
            const nameKey = `name:${String(msg.name || '').normalize('NFKC').trim().toLowerCase().slice(0, 64)}`;
            const blocked = this.authBlockedFor(ipKey, AUTH_MAX_PER_IP)
                || (type === 'account_login' ? this.authBlockedFor(nameKey, AUTH_MAX_FAILS_PER_NAME) : 0);
            if (blocked) {
                return this.sendFriend(ws, { type: 'account_error', action, code: 'rate_limited', message: `Trop de tentatives. Réessaie dans ${blocked} min.` });
            }
            this.authHit(ipKey);
            const result = type === 'account_register'
                ? await this.friends.register(msg.name, msg.password)
                : await this.friends.verify(msg.name, msg.password);
            if (!result.ok) {
                if (type === 'account_login') this.authHit(nameKey);
                return this.sendFriend(ws, { type: 'account_error', action, code: 'invalid', message: result.reason });
            }
            if (type === 'account_login') this.authAttempts.delete(nameKey);
            await this.bindAccount(ws, result.account.id);
            const token = await this.accountToken(ws);
            const account = await this.friends.getPublic(ws.accountId);
            this.sendFriend(ws, {
                type: 'account_authenticated',
                token,
                account,
                ...this.adminInfo(ws),
                isNewAccount: !!result.isNew
            });
            await this.sendFriendState(ws);
            // Nouveau compte : le client envoie d'abord son profil temporaire (import)
            if (!result.isNew) await this.sendProfileState(ws, { initial: true });
            return;
        }
        if (type === 'account_logout') {
            await this.friends.revokeSession(ws.accountToken);
            this.unbindAccount(ws);
            return this.sendFriend(ws, { type: 'account_logged_out' });
        }
        if (type === 'account_rename') {
            if (!(await this.requireAccount(ws))) return this.sendFriend(ws, { type: 'account_error', action: 'rename', message: 'Connecte-toi d’abord.' });
            const result = await this.friends.rename(ws.accountId, msg.name);
            if (!result.ok) return this.sendFriend(ws, { type: 'account_error', action: 'rename', message: result.reason });
            ws.accountName = result.account.name;
            ws.isAdmin = isAdminName(ws.accountName);
            const code = this.playerRooms.get(ws);
            const room = code ? this.rooms.get(code) : null;
            const player = room?.players.get(ws.accountId);
            if (player) {
                player.name = result.account.name;
                player.isAdmin = !!ws.isAdmin;
                this.broadcastToRoom(room, { type: 'player_updated', player: this.serializePlayer(player, room) });
            }
            this.sendFriend(ws, {
                type: 'account_updated',
                account: await this.friends.getPublic(ws.accountId),
                ...this.adminInfo(ws)
            });
            await this.sendFriendState(ws);
            return;
        }
        if (type === 'account_profile_import' || type === 'account_profile_save') {
            if (!(await this.requireAccount(ws))) return this.sendFriend(ws, { type: 'profile_error', code: 'not_authenticated', message: 'Connecte-toi pour sauvegarder ton profil.' });
            const result = type === 'account_profile_import'
                ? await this.friends.importProfile(ws.accountId, msg.profile)
                : await this.friends.saveProfile(ws.accountId, msg.profile);
            if (!result.ok) {
                return this.sendFriend(ws, {
                    type: 'profile_error',
                    code: result.conflict ? 'conflict' : 'invalid',
                    message: result.reason,
                    profile: result.profile || null
                });
            }
            // Import : le client reçoit le profil final du compte. Sauvegarde : simple accusé.
            if (type === 'account_profile_import') {
                this.sendFriend(ws, { type: 'profile_state', imported: true, profile: result.profile, accountId: ws.accountId });
            } else {
                this.sendFriend(ws, { type: 'profile_saved', updatedAt: result.updatedAt, accountId: ws.accountId });
            }
            return;
        }
        if (!(await this.requireAccount(ws))) return this.sendFriend(ws, { type: 'account_error', action: type, message: 'Connecte-toi pour utiliser les amis.' });

        let result;
        if (type === 'group_invite' || type === 'friend_invite') {
            return this.createGroupInvite(ws, msg.id);
        } else if (type === 'group_invite_accept') {
            return this.acceptGroupInvite(ws, msg.invitationId, msg.player || {});
        } else if (type === 'group_invite_reject') {
            return this.rejectGroupInvite(ws, msg.invitationId);
        } else if (type === 'friend_request') result = await this.friends.request(ws.accountId, msg.name);
        else if (type === 'friend_accept') result = await this.friends.accept(ws.accountId, msg.id);
        else if (type === 'friend_reject') result = await this.friends.reject(ws.accountId, msg.id);
        else if (type === 'friend_remove') result = await this.friends.remove(ws.accountId, msg.id);
        else {
            return;
        }

        if (!result?.ok) return this.sendFriend(ws, { type: 'friend_error', action: type, message: result?.reason || 'Action impossible.' });
        const successMessages = {
            friend_request: 'Demande envoyée.',
            friend_accept: 'Demande acceptée.',
            friend_reject: 'Demande refusée.',
            friend_remove: 'Ami supprimé.'
        };
        this.sendFriend(ws, { type: 'friend_success', action: type, message: successMessages[type] || 'Action effectuée.' });
        await this.sendFriendState(ws);
        const otherId = result.target?.id || msg.id;
        if (otherId && await this.friends.get(otherId)) {
            this.notifyAccount(otherId, { type: 'friends_changed' });
            for (const socket of this.accountSockets.get(otherId) || []) await this.sendFriendState(socket);
        }
    }

    async skipMatchmakingCountdown(ws, rawMode) {
        if (!(await this.requireAccount(ws)) || !ws.isAdmin) {
            return this.sendFriend(ws, {
                type: 'account_error',
                action: 'admin_countdown_skip',
                code: 'admin_required',
                message: 'Droits administrateur requis.'
            });
        }

        const mode = String(rawMode || '').trim().toLowerCase();
        if (!/^(duel|solo|duo|trio|section)$/.test(mode)) {
            return this.sendFriend(ws, {
                type: 'account_error',
                action: 'admin_countdown_skip',
                code: 'invalid_mode',
                message: 'Mode de matchmaking invalide.'
            });
        }

        const room = this.roomForSocket(ws);
        const queue = this.matchmakingQueues.get(mode);
        if (!room || !queue?.timer || !queue.rooms.has(room.code)) {
            return this.sendFriend(ws, {
                type: 'account_error',
                action: 'admin_countdown_skip',
                code: 'not_in_countdown',
                message: 'Aucun compte à rebours actif dans ta file.'
            });
        }

        queue.secondsLeft = Math.min(queue.secondsLeft, 3);
        this.broadcastToQueue(queue, {
            type: 'matchmaking_status',
            state: 'countdown',
            secondsLeft: queue.secondsLeft,
            countdownDuration: 3,
            teamsCount: queue.rooms.size,
            mode: queue.mode
        });

        const update = {
            type: 'admin_countdown_skipped',
            seconds: queue.secondsLeft,
            mode: queue.mode,
            message: `Compte à rebours accéléré à ${queue.secondsLeft} secondes.`
        };
        this.sendFriend(ws, update);
        this.notifyAdmins(update, ws);
    }

    async setMatchmakingCountdown(ws, rawSeconds) {
        if (!(await this.requireAccount(ws)) || !ws.isAdmin) {
            return this.sendFriend(ws, {
                type: 'account_error',
                action: 'admin_countdown',
                code: 'admin_required',
                message: 'Droits administrateur requis.'
            });
        }

        const seconds = parseMatchmakingCountdown(rawSeconds, 0);
        if (!seconds) {
            return this.sendFriend(ws, {
                type: 'account_error',
                action: 'admin_countdown',
                code: 'invalid_value',
                message: 'La durée doit être de 3 ou 30 secondes.'
            });
        }

        this.matchmakingCountdownSeconds = seconds;
        for (const queue of this.matchmakingQueues.values()) {
            if (!queue.timer) continue;
            // Un raccourcissement est appliqué immédiatement ; un retour à 30 s
            // s’applique au prochain compte à rebours pour ne pas rallonger une partie déjà lancée.
            queue.secondsLeft = Math.min(queue.secondsLeft, seconds);
            this.broadcastToQueue(queue, {
                type: 'matchmaking_status',
                state: 'countdown',
                secondsLeft: queue.secondsLeft,
                countdownDuration: seconds,
                teamsCount: queue.rooms.size,
                mode: queue.mode
            });
        }

        const update = {
            type: 'admin_countdown_updated',
            seconds,
            message: `Compte à rebours configuré sur ${seconds} secondes.`
        };
        this.sendFriend(ws, update);
        this.notifyAdmins(update, ws);
    }

    getQueue(mode) {
        mode = (mode || 'duo').toLowerCase();
        if (!this.matchmakingQueues.has(mode)) {
            this.matchmakingQueues.set(mode, {
                mode,
                rooms: new Set(),
                timer: null,
                secondsLeft: this.matchmakingCountdownSeconds
            });
        }
        return this.matchmakingQueues.get(mode);
    }

    async createRoom(ws, hostData) {
        // Ne jamais débrancher un joueur d'une partie en cours pour créer une nouvelle salle.
        const currentRoom = this.roomForSocket(ws);
        const currentPlayer = currentRoom?.players.get(ws.playerId);
        if (currentRoom?.state === 'game' && currentPlayer && !currentPlayer.inLobby) {
            this.send(ws, { type: 'error', code: 'already_in_game', message: 'Impossible de créer un groupe pendant une partie. Reviens d’abord dans le lobby.' });
            return null;
        }
        // Nettoyer si déjà dans une salle
        // Un token de compte fourni doit être valide : sinon il ne doit jamais retomber en joueur invité.
        if (hostData?.accountToken && !ws.accountId && !(await this.authenticateToken(ws, hostData.accountToken))) {
            this.send(ws, { type: 'error', code: 'session_invalid', message: 'Session de compte invalide. Reconnecte-toi avant de créer un groupe.' });
            return null;
        }
        this.leaveCurrentRoom(ws);
        const accountId = ws.accountId || (typeof hostData.id === 'string' && hostData.id ? hostData.id.slice(0, 128) : `p_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
        const accountName = ws.accountName || hostData.name;

        let code;
        let attempts = 0;
        do {
            code = generateRoomCode();
            attempts++;
        } while (this.rooms.has(code) && attempts < 100);

        const room = {
            code,
            hostId: accountId,
            mode: Object.prototype.hasOwnProperty.call(MODE_TEAM_SIZES, hostData.mode) ? hostData.mode : 'duo',
            // botFill = « Remplir la partie avec des bots » ; fillTeam = « Remplir l'équipe avec des bots »
            botFill: (hostData.fillMatch ?? hostData.botFill) !== false,
            fillTeam: hostData.fillTeam !== false,
            // Le choix du type de partie est demandé à chaque lancement. Une auto-room
            // peut toutefois fournir « players » dès sa création après le choix local.
            startChoice: hostData.startChoice === 'bots' || hostData.startChoice === 'players' ? hostData.startChoice : null,
            startChoicePending: false,
            state: 'lobby',
            seed: Math.floor(Math.random() * 1000000),
            createdAt: Date.now(),
            players: new Map(),
            matchedRooms: null
        };

        const hostPlayer = {
            id: accountId,
            name: playerName(accountName, 'Hôte'),
            skin: hostData.skin || 'recrue',
            backpack: hostData.backpack || null,
            colors: hostData.colors || null,
            pickaxeSkin: hostData.pickaxeSkin || 'pioche-defaut',
            glider: gliderId(hostData.glider),
            ready: false,
            isAdmin: !!ws.isAdmin,
            slot: 1, // Hôte toujours slot 1
            reconnectToken: newReconnectToken(),
            ws
        };

        room.players.set(hostPlayer.id, hostPlayer);
        this.rooms.set(code, room);
        this.playerRooms.set(ws, code);
        ws.playerId = hostPlayer.id;
        if (ws.accountId) ws.accountName = hostPlayer.name;

        console.log(`[Multiplayer] Salle créée: ${code} par ${hostPlayer.name} (${hostPlayer.id}) [botFill: ${room.botFill}]`);

        this.send(ws, {
            type: 'room_created',
            roomCode: code,
            hostId: room.hostId,
            playerId: hostPlayer.id,
            reconnectToken: hostPlayer.reconnectToken,
            mode: room.mode,
            ...this.fillInfo(room),
            players: this.serializePlayers(room)
        });

        return room;
    }

    // Options de bots envoyées aux clients (botFill gardé pour les anciennes pages)
    fillInfo(room) {
        return { botFill: room.botFill !== false, fillMatch: room.botFill !== false, fillTeam: room.fillTeam !== false };
    }

    async joinRoom(ws, code, playerData = {}) {
        code = String(code || '').trim().toUpperCase();
        if (playerData.accountToken && !ws.accountId && !(await this.authenticateToken(ws, playerData.accountToken))) {
            return this.send(ws, { type: 'error', code: 'session_invalid', message: 'Session de compte invalide. Reconnecte-toi avant de rejoindre un groupe.' });
        }

        const room = this.rooms.get(code);
        if (!room) {
            return this.send(ws, { type: 'error', code: 'room_not_found', message: 'Code de salle introuvable.' });
        }

        const rawCandidateId = playerData.id || playerData.player?.id;
        const candidateId = ws.accountId || (typeof rawCandidateId === 'string' ? rawCandidateId.slice(0, 128) : '');
        const reconnectToken = playerData.reconnectToken || playerData.player?.reconnectToken;
        const currentRoom = this.roomForSocket(ws);
        const currentPlayer = currentRoom?.players.get(ws.playerId || candidateId);
        // Un joueur en pleine partie ne peut pas accepter un code ou une invitation pour une autre salle.
        if (currentRoom && currentRoom !== room && currentRoom.state === 'game' && currentPlayer && !currentPlayer.inLobby) {
            return this.send(ws, { type: 'error', code: 'already_in_game', message: 'Tu es déjà en partie. Reviens dans le lobby avant de rejoindre un autre groupe.' });
        }

        const existingPlayer = candidateId ? room.players.get(candidateId) : null;
        if (existingPlayer) {
            // Les comptes prouvent leur identité avec la session ; les profils temporaires
            // doivent présenter le secret de reconnexion remis lors de la création du slot.
            const authorized = ws.accountId
                ? existingPlayer.id === ws.accountId
                : sameReconnectToken(reconnectToken, existingPlayer.reconnectToken);
            if (!authorized) {
                return this.send(ws, { type: 'error', code: 'room_identity_invalid', message: 'Impossible de vérifier ton identité dans cette salle. Recrée ou rejoins le groupe avec une nouvelle session.' });
            }
        }

        const candidateName = ws.accountName || playerData.name || playerData.player?.name;
        this.leaveCurrentRoom(ws);

        // Reconnexion d'un joueur existant (ex: passage à game.html ou refresh)
        if (existingPlayer) {
            existingPlayer.ws = ws;
            existingPlayer.disconnectedAt = null;
            this.playerRooms.set(ws, code);
            ws.playerId = existingPlayer.id;
            console.log(`[Multiplayer] ${existingPlayer.name} (${existingPlayer.id}) reconnecté à la salle ${code} (state: ${room.state})`);

            // Page de jeu (inGame) ou retour au lobby après la partie
            const wasPlaying = room.state === 'game' && !existingPlayer.inLobby;
            existingPlayer.inLobby = room.state === 'game' ? !playerData.inGame : false;
            // Il a quitté la partie pour revenir au lobby : il est éliminé tout de suite
            // (sinon les autres attendent un joueur qui ne reviendra pas et personne ne gagne)
            const leftMatch = wasPlaying && existingPlayer.inLobby;
            if (existingPlayer.goneTimer) clearTimeout(existingPlayer.goneTimer);
            existingPlayer.goneTimer = null;
            if (room.cleanupTimer) {
                clearTimeout(room.cleanupTimer);
                room.cleanupTimer = null;
            }

            this.send(ws, {
                type: 'room_joined',
                roomCode: code,
                hostId: room.hostId,
                playerId: existingPlayer.id,
                reconnectToken: existingPlayer.reconnectToken,
                authorityId: room.authorityId || null,
                // Horloge de la partie : ms écoulées depuis le départ du vaisseau (négatif avant)
                clock: room.state === 'game' && room.flightAt ? Date.now() - room.flightAt : undefined,
                mode: room.mode,
                ...this.fillInfo(room),
                slot: existingPlayer.slot,
                seed: room.seed,
                state: room.state,
                // Page de jeu : tous les joueurs de la partie (y compris les autres équipes).
                // Retour au lobby : seulement son propre groupe (sinon un adversaire apparaît
                // comme coéquipier et le mode passe en duo)
                players: room.state === 'game' && !existingPlayer.inLobby
                    ? this.matchPlayers(room)
                    : this.serializePlayers(room)
            });

            if (room.state === 'game') {
                if (existingPlayer.inLobby) {
                    // Revenu au lobby : s'il menait la partie, un autre joueur prend le relais
                    // (AVANT d'annoncer son départ : le nouvel hôte fait tomber son butin)
                    if (room.authorityId === existingPlayer.id) this.migrateAuthority(room);
                    if (leftMatch) this.broadcastToMatch(room, { type: 'player_gone', playerId: existingPlayer.id });
                    this.maybeReturnToLobby(room);
                } else {
                    this.broadcastToMatch(room, {
                        type: 'player_reconnected',
                        player: this.serializePlayer(existingPlayer, room)
                    }, ws);
                    // L'hôte de la partie est parti depuis un moment : ce joueur peut prendre le relais
                    if (this.authorityLost(room)) this.migrateAuthority(room);
                }
            }
            return room;
        }

        // Partie en cours : seuls ses joueurs ou un administrateur authentifié peuvent y entrer.
        const isAdminJoining = Boolean(ws.isAdmin);

        if (room.state === 'game' && !isAdminJoining) {
            return this.send(ws, { type: 'error', code: 'room_in_game', message: 'Cette partie est déjà en cours.' });
        }

        if (!isAdminJoining) {
            if (room.mode === DUEL_MODE && room.players.size >= 2) {
                return this.send(ws, { type: 'error', code: 'duel_room_full', message: 'Une salle 1v1 ne peut accueillir que deux joueurs.' });
            }

            if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
                return this.send(ws, { type: 'error', code: 'room_full', message: 'La salle est complète (4 joueurs max).' });
            }
        }

        // Trouver un numéro de slot libre
        const usedSlots = new Set([...room.players.values()].map(p => p.slot));
        let freeSlot = 2;
        while (usedSlots.has(freeSlot) && freeSlot <= (isAdminJoining ? 99 : 4)) freeSlot++;

        const newPlayer = {
            id: candidateId || `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: playerName(candidateName, `Joueur ${freeSlot}`),
            skin: playerData.skin || playerData.player?.skin || 'recrue',
            backpack: playerData.backpack || playerData.player?.backpack || null,
            colors: playerData.colors || playerData.player?.colors || null,
            pickaxeSkin: playerData.pickaxeSkin || playerData.player?.pickaxeSkin || 'pioche-defaut',
            glider: gliderId(playerData.glider || playerData.player?.glider),
            ready: false,
            isAdmin: !!ws.isAdmin,
            slot: freeSlot,
            team: 1,
            reconnectToken: newReconnectToken(),
            ws
        };

        if (room.state === 'game') {
            const existingTeams = [...room.players.values()].map(p => p.team || 1);
            newPlayer.team = Math.max(1, ...existingTeams) + 1;
            newPlayer.inLobby = false;
        }

        room.players.set(newPlayer.id, newPlayer);
        this.playerRooms.set(ws, code);
        ws.playerId = newPlayer.id;

        console.log(`[Multiplayer] ${newPlayer.name} a rejoint la salle ${code} (slot ${freeSlot}, state: ${room.state}, admin: ${isAdminJoining})`);

        // Ajuster automatiquement le mode selon le nombre de joueurs présents (uniquement en lobby)
        let modeChanged = false;
        if (room.state === 'lobby') {
            const count = room.players.size;
            if (count >= 2 && (!room.mode || room.mode === 'solo' || room.mode === 'duel')) {
                room.mode = 'duo';
                modeChanged = true;
            }
            if (count >= 3 && (room.mode === 'solo' || room.mode === 'duo')) {
                room.mode = 'trio';
                modeChanged = true;
            }
            if (count >= 4 && room.mode !== 'section') {
                room.mode = 'section';
                modeChanged = true;
            }
        }

        // Confirmer au joueur qu'il a rejoint
        this.send(ws, {
            type: 'room_joined',
            roomCode: code,
            hostId: room.hostId,
            playerId: newPlayer.id,
            mode: room.mode,
            ...this.fillInfo(room),
            slot: freeSlot,
            team: newPlayer.team,
            reconnectToken: newPlayer.reconnectToken,
            state: room.state,
            authorityId: room.authorityId || null,
            seed: room.seed,
            clock: room.state === 'game' && room.flightAt ? Date.now() - room.flightAt : undefined,
            players: room.state === 'game' ? this.matchPlayers(room) : this.serializePlayers(room)
        });

        // Notifier les autres joueurs
        if (room.state === 'game') {
            this.broadcastToMatch(room, {
                type: 'player_joined',
                player: this.serializePlayer(newPlayer, room)
            }, ws);
        } else {
            this.broadcastToRoom(room, {
                type: 'player_joined',
                player: this.serializePlayer(newPlayer, room)
            }, ws);
        }

        // Si le mode a été ajusté automatiquement, diffuser la nouvelle config
        if (modeChanged) {
            this.broadcastToRoom(room, {
                type: 'room_config',
                mode: room.mode,
                ...this.fillInfo(room)
            });
        }

        // Vérifier si un changement de joueurs affecte l'état prêt
        this.checkRoomReadyState(room);

        return room;
    }

    updateStatus(ws, data) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room || !ws.playerId) return;

        const player = room.players.get(ws.playerId);
        if (!player) return;

        if (typeof data.ready === 'boolean') player.ready = data.ready;
        if (!ws.accountId && data.name) player.name = playerName(data.name, player.name);
        if (ws.accountId) player.name = ws.accountName || player.name;
        if (ws.accountId) player.isAdmin = !!ws.isAdmin;
        if (data.skin) player.skin = data.skin;
        if (data.backpack !== undefined) player.backpack = data.backpack;
        if (data.colors) player.colors = data.colors;
        if (data.pickaxeSkin) player.pickaxeSkin = data.pickaxeSkin;
        if (data.glider) player.glider = gliderId(data.glider);

        this.broadcastToRoom(room, {
            type: 'player_updated',
            player: this.serializePlayer(player, room)
        });

        // Vérifier l'état de préparation de la salle (lancement direct ou matchmaking)
        this.checkRoomReadyState(room);
    }

    updateConfig(ws, data) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room || room.hostId !== ws.playerId) return;

        if (data.mode && !Object.prototype.hasOwnProperty.call(MODE_TEAM_SIZES, data.mode)) {
            return this.send(ws, { type: 'error', code: 'invalid_mode', message: 'Mode de jeu invalide.' });
        }

        // Empêcher de choisir un mode avec moins de places que de joueurs réels dans le groupe
        const modeHierarchy = { duel: 1, solo: 1, duo: 2, trio: 3, section: 4 };
        if (data.mode && modeHierarchy[data.mode] && modeHierarchy[data.mode] < room.players.size) {
            const requiredName = room.players.size === 2 ? 'duo, trio ou section' : room.players.size === 3 ? 'trio ou section' : 'section';
            console.log(`[Multiplayer] Mode ${data.mode} rejeté : ${room.players.size} joueurs dans le groupe`);
            return this.send(ws, {
                type: 'error',
                code: 'mode_too_small',
                message: `Impossible de passer en ${String(data.mode).toUpperCase()} : ce groupe nécessite au moins ${requiredName}.`
            });
        }

        const oldMode = room.mode;
        if (data.mode) room.mode = data.mode;
        const fillMatch = typeof data.fillMatch === 'boolean' ? data.fillMatch : data.botFill;
        if (typeof fillMatch === 'boolean') room.botFill = fillMatch;
        if (typeof data.fillTeam === 'boolean') room.fillTeam = data.fillTeam;
        // Un changement de configuration invalide un choix de lancement en attente.
        room.startChoice = null;
        room.startChoicePending = false;

        console.log(`[Multiplayer] Config salle ${code}: mode=${room.mode}, remplir partie=${room.botFill}, remplir équipe=${room.fillTeam !== false}`);

        this.broadcastToRoom(room, {
            type: 'room_config',
            mode: room.mode,
            ...this.fillInfo(room)
        });

        // Si le mode a changé et qu'on était en file, retirer de l'ancienne file
        if (oldMode !== room.mode) {
            this.dequeueMatchmaking(room, oldMode);
        }

        this.checkRoomReadyState(room);
    }

    requestStartChoice(room) {
        const leader = room.players.get(room.hostId);
        if (!leader?.ws || leader.ws.readyState !== 1) return;
        this.send(leader.ws, {
            type: 'start_choice_required',
            mode: room.mode,
            playersCount: room.players.size
        });
    }

    chooseStartChoice(ws, data) {
        const code = this.playerRooms.get(ws);
        const room = code ? this.rooms.get(code) : null;
        if (!room || room.state !== 'lobby' || room.hostId !== ws.playerId) return;
        if (data.choice !== 'bots' && data.choice !== 'players') return;

        const allReady = room.players.size > 0 && [...room.players.values()].every(p => p.ready);
        if (!allReady) {
            room.startChoice = null;
            room.startChoicePending = false;
            return;
        }

        room.startChoicePending = false;
        room.startChoice = data.choice;
        if (data.choice === 'bots') {
            room.botFill = true;
            console.log(`[Multiplayer] Choix du chef dans ${room.code} : partie avec bots`);
            this.startGameForRoom(room);
        } else {
            // Ce choix signifie réellement « aucun bot », y compris dans les places d'équipe.
            room.botFill = false;
            room.fillTeam = false;
            console.log(`[Multiplayer] Choix du chef dans ${room.code} : vrais joueurs uniquement`);
            this.enqueueMatchmaking(room);
        }
    }

    /* ===== LOGIQUE DE PRÉPARATION & LANCEMENT DU JEU ===== */

    checkRoomReadyState(room) {
        if (!room || room.state !== 'lobby') return;
        const allReady = room.players.size > 0 && [...room.players.values()].every(p => p.ready);

        if (!allReady) {
            // Une annulation invalide le choix précédent : le prochain lancement redemandera.
            room.startChoice = null;
            room.startChoicePending = false;
            this.dequeueMatchmaking(room);
            return;
        }

        // Toujours demander le choix au chef pour ce nouveau lancement, même si une
        // ancienne configuration indiquait déjà bots ou matchmaking.
        if (!room.startChoice) {
            if (!room.startChoicePending) {
                room.startChoicePending = true;
                this.requestStartChoice(room);
            }
            return;
        }

        if (room.startChoice === 'bots') {
            console.log(`[Multiplayer] Tous prêts dans ${room.code} (Avec bots) : lancement immédiat !`);
            this.startGameForRoom(room);
        } else {
            console.log(`[Multiplayer] Tous prêts dans ${room.code} (Sans bots) : mise en file d'attente (${room.mode})`);
            this.enqueueMatchmaking(room);
        }
    }

    enqueueMatchmaking(room) {
        const queue = this.getQueue(room.mode);
        queue.rooms.add(room.code);

        const teamsCount = queue.rooms.size;
        console.log(`[Matchmaking] File ${room.mode}: ${teamsCount} équipes en attente`);

        if (teamsCount < 2) {
            // 1 seule équipe : recherche d'adversaires
            this.broadcastToRoom(room, {
                type: 'matchmaking_status',
                state: 'searching',
                teamsCount,
                teamsNeeded: 2,
                mode: room.mode
            });
        } else {
            // Au moins 2 équipes : lancer le compte à rebours configuré.
            if (!queue.timer) {
                queue.secondsLeft = this.matchmakingCountdownSeconds;
                console.log(`[Matchmaking] >= 2 équipes en ${room.mode} ! Début du chrono de ${queue.secondsLeft} secondes.`);

                this.broadcastToQueue(queue, {
                    type: 'matchmaking_status',
                    state: 'countdown',
                    secondsLeft: queue.secondsLeft,
                    countdownDuration: this.matchmakingCountdownSeconds,
                    teamsCount: queue.rooms.size,
                    mode: room.mode
                });

                queue.timer = setInterval(() => {
                    queue.secondsLeft--;

                    this.broadcastToQueue(queue, {
                        type: 'matchmaking_status',
                        state: 'countdown',
                        secondsLeft: queue.secondsLeft,
                        countdownDuration: this.matchmakingCountdownSeconds,
                        teamsCount: queue.rooms.size,
                        mode: room.mode
                    });

                    if (queue.secondsLeft <= 0) {
                        clearInterval(queue.timer);
                        queue.timer = null;
                        this.launchMatchmakingGame(room.mode);
                    }
                }, 1000);
            } else {
                // Compte à rebours déjà en cours : informer la nouvelle équipe
                this.broadcastToRoom(room, {
                    type: 'matchmaking_status',
                    state: 'countdown',
                    secondsLeft: queue.secondsLeft,
                    countdownDuration: this.matchmakingCountdownSeconds,
                    teamsCount: queue.rooms.size,
                    mode: room.mode
                });
            }
        }
    }

    dequeueMatchmaking(room, specificMode = null) {
        const mode = specificMode || room.mode;
        const queue = this.getQueue(mode);
        if (!queue.rooms.has(room.code)) return;

        queue.rooms.delete(room.code);
        this.broadcastToRoom(room, {
            type: 'matchmaking_status',
            state: 'idle',
            mode
        });

        console.log(`[Matchmaking] Salle ${room.code} retirée de la file ${mode}. Restant: ${queue.rooms.size}`);

        if (queue.rooms.size < 2 && queue.timer) {
            clearInterval(queue.timer);
            queue.timer = null;
            queue.secondsLeft = this.matchmakingCountdownSeconds;
            console.log(`[Matchmaking] Chrono annulé pour ${mode} (moins de 2 équipes).`);

            this.broadcastToQueue(queue, {
                type: 'matchmaking_status',
                state: 'searching',
                teamsCount: queue.rooms.size,
                teamsNeeded: 2,
                mode
            });
        }
    }

    broadcastToQueue(queue, data) {
        for (const code of queue.rooms) {
            const r = this.rooms.get(code);
            if (r) this.broadcastToRoom(r, data);
        }
    }

    launchMatchmakingGame(mode) {
        const queue = this.getQueue(mode);
        const roomCodes = [...queue.rooms];
        queue.rooms.clear();
        if (queue.timer) {
            clearInterval(queue.timer);
            queue.timer = null;
        }

        let validRooms = roomCodes.map(code => this.rooms.get(code)).filter(r => r && r.state === 'lobby');
        // Une équipe toute seule (les autres ont annulé) : elle continue d'attendre
        if (validRooms.length < 2) {
            for (const r of validRooms) this.enqueueMatchmaking(r);
            return;
        }
        // Pas plus d'équipes que la carte n'en accueille : les suivantes attendent la prochaine partie
        const teamSize = MODE_TEAM_SIZES[mode] || 2;
        const maxTeams = mode === DUEL_MODE ? 2 : Math.max(2, Math.floor(MAX_FIGHTERS / teamSize));
        const waiting = validRooms.slice(maxTeams);
        validRooms = validRooms.slice(0, maxTeams);
        setTimeout(() => { for (const r of waiting) if (r.state === 'lobby') this.enqueueMatchmaking(r); }, 0);

        const sharedSeed = Math.floor(Math.random() * 1000000);
        console.log(`[Matchmaking] Lancement match ${mode} pour ${validRooms.length} équipes (seed: ${sharedSeed})`);

        // Rassembler tous les joueurs réels et leur assigner une équipe par salle
        const allMatchPlayers = [];
        validRooms.forEach((r, teamIdx) => {
            const teamId = teamIdx + 1;
            for (const p of r.players.values()) {
                allMatchPlayers.push({
                    id: p.id,
                    name: p.name,
                    skin: p.skin,
                    backpack: p.backpack,
                    colors: p.colors,
                    pickaxeSkin: p.pickaxeSkin,
                    glider: p.glider || null,
                    ready: p.ready,
                    isAdmin: !!p.isAdmin,
                    slot: p.slot,
                    team: teamId,
                    isHost: (p.id === r.hostId)
                });
            }
        });

        // Un seul hôte pour toute la partie : le chef de la première salle
        const authorityId = validRooms[0].hostId;
        const flightAt = Date.now() + FLIGHT_DELAY; // même départ du vaisseau pour toutes les équipes

        // Le choix « vrais joueurs » interdit aussi les bots coéquipiers.
        const teams = validRooms.map((r, i) => ({ team: i + 1, humans: r.players.size, fillTeam: false }));

        // Relier les salles pour que les messages en cours de partie soient partagés
        validRooms.forEach((r, teamIdx) => {
            r.state = 'game';
            r.seed = sharedSeed;
            r.matchedRooms = validRooms;
            r.authorityId = authorityId;
            this.resetGameFlags(r, teamIdx + 1, flightAt);

            this.broadcastToRoom(r, {
                type: 'game_start',
                roomCode: r.code,
                seed: sharedSeed,
                mode: r.mode,
                mapId: r.mode === DUEL_MODE ? 'duel-two-towns' : 'default',
                // Partie sans bots adverses : seulement les équipes de la file d'attente
                botFill: false,
                fillMatch: false,
                fillTeam: false,
                myTeam: teamIdx + 1,
                authorityId,
                teams,
                players: allMatchPlayers
            });
        });
    }

    // Début de partie : tout le monde « en jeu », équipe notée sur chaque joueur
    resetGameFlags(room, team, flightAt = null) {
        for (const p of room.players.values()) {
            p.inLobby = false;
            p.team = team;
            if (p.goneTimer) clearTimeout(p.goneTimer);
            p.goneTimer = null;
        }
        if (room.authorityTimer) clearTimeout(room.authorityTimer);
        room.authorityTimer = null;
        room.startedAt = Date.now();
        // Heure commune de départ du vaisseau : le temps que tout le monde charge la carte.
        // Chaque page de jeu reçoit « clock » (ms depuis ce départ) et se cale dessus.
        room.flightAt = flightAt || room.startedAt + FLIGHT_DELAY;
    }

    /* ===== PARTIE EN COURS : joueurs, hôte, retour au lobby ===== */

    // Salles qui jouent la même partie (une seule, sauf matchmaking entre groupes)
    matchRooms(room) {
        if (room.matchedRooms && room.matchedRooms.length > 1) {
            return room.matchedRooms.filter(r => r.state === 'game' && this.rooms.get(r.code) === r);
        }
        return [room];
    }

    matchPlayers(room) {
        return this.matchRooms(room).flatMap(r => this.serializePlayers(r));
    }

    findMatchPlayer(room, id) {
        if (!id) return null;
        for (const r of this.matchRooms(room)) {
            const p = r.players.get(id);
            if (p) return p;
        }
        return null;
    }

    // Connecté ET sur la page de jeu
    isPlaying(p) {
        return !!p && !!p.ws && p.ws.readyState === 1 && !p.inLobby;
    }

    broadcastToMatch(room, data, excludeWs = null) {
        const msg = JSON.stringify(data);
        for (const r of this.matchRooms(room)) {
            for (const p of r.players.values()) {
                if (p.ws && p.ws !== excludeWs && p.ws.readyState === 1 && !p.inLobby) {
                    try { p.ws.send(msg); } catch { /* socket coupée */ }
                }
            }
        }
    }

    // Délai avant de remplacer un hôte absent (plus long au lancement : chargement de la carte)
    authorityGrace(room) {
        return Date.now() - (room.startedAt || 0) < 30000 ? 12000 : 4000;
    }

    authorityLost(room) {
        const p = this.findMatchPlayer(room, room.authorityId);
        if (!p || p.inLobby) return true;
        if (this.isPlaying(p)) return false;
        return !!p.disconnectedAt && Date.now() - p.disconnectedAt > this.authorityGrace(room);
    }

    // Nouvel hôte de la partie : le premier joueur encore en jeu (chef de salle d'abord)
    migrateAuthority(room) {
        const rooms = this.matchRooms(room);
        const current = this.findMatchPlayer(room, room.authorityId);
        if (this.isPlaying(current)) return;
        let next = null;
        for (const r of rooms) {
            const h = r.players.get(r.hostId);
            if (this.isPlaying(h)) { next = h; break; }
        }
        if (!next) {
            for (const r of rooms) {
                next = [...r.players.values()].find(p => this.isPlaying(p)) || null;
                if (next) break;
            }
        }
        if (!next) return;
        for (const r of rooms) r.authorityId = next.id;
        console.log(`[Multiplayer] Nouvel hôte de partie : ${next.name} (${next.id})`);
        this.broadcastToMatch(room, { type: 'authority', authorityId: next.id });
    }

    // Plus aucun joueur de la salle sur la page de jeu : la salle redevient un lobby
    maybeReturnToLobby(room) {
        if (room.state !== 'game') return;
        if ([...room.players.values()].some(p => this.isPlaying(p))) return;
        console.log(`[Multiplayer] Salle ${room.code} : retour au lobby`);
        room.state = 'lobby';
        room.matchedRooms = null;
        room.authorityId = null;
        room.startChoice = null;
        room.startChoicePending = false;
        room.seed = Math.floor(Math.random() * 1000000);
        if (room.authorityTimer) clearTimeout(room.authorityTimer);
        room.authorityTimer = null;
        for (const p of room.players.values()) {
            p.ready = false;
            p.inLobby = false;
            p.team = 1;
            if (p.goneTimer) clearTimeout(p.goneTimer);
            p.goneTimer = null;
        }
        for (const p of room.players.values()) {
            if (!p.ws || p.ws.readyState !== 1) continue;
            this.send(p.ws, {
                type: 'room_joined',
                roomCode: room.code,
                hostId: room.hostId,
                playerId: p.id,
                mode: room.mode,
                ...this.fillInfo(room),
                slot: p.slot,
                reconnectToken: p.reconnectToken,
                state: 'lobby',
                players: this.serializePlayers(room)
            });
        }
        // Joueurs qui ne sont jamais revenus (onglet fermé) : retirés après un court délai
        for (const p of room.players.values()) {
            if (p.ws && p.ws.readyState === 1) continue;
            setTimeout(() => {
                const still = room.players.get(p.id);
                if (still && (!still.ws || still.ws.readyState !== 1) && room.state === 'lobby') this.removePlayer(room, p.id);
            }, 20000);
        }
    }

    // Retire un joueur d'une salle en lobby (élit un nouveau chef si besoin)
    kickPlayer(ws, targetId) {
        const room = this.roomForSocket(ws);
        const target = room?.players.get(String(targetId || ''));
        if (!room) return this.send(ws, { type: 'error', code: 'no_lobby', message: 'Tu n’es dans aucun groupe.' });
        if (room.state !== 'lobby') return this.send(ws, { type: 'error', code: 'room_in_game', message: 'Impossible de retirer un joueur pendant une partie.' });
        if (room.hostId !== ws.playerId) return this.send(ws, { type: 'error', code: 'host_only', message: 'Seul le chef du groupe peut expulser un joueur.' });
        if (!target) return this.send(ws, { type: 'error', code: 'player_not_found', message: 'Ce joueur n’est plus dans le groupe.' });
        if (target.id === ws.playerId) return this.send(ws, { type: 'error', code: 'cannot_kick_host', message: 'Le chef ne peut pas s’expulser lui-même.' });

        const targetSocket = target.ws;
        const targetName = target.name;
        if (targetSocket) {
            this.send(targetSocket, {
                type: 'player_kicked',
                roomCode: room.code,
                playerId: target.id,
                playerName: targetName,
                message: 'Tu as été retiré du groupe par le chef.'
            });
            this.playerRooms.delete(targetSocket);
            delete targetSocket.playerId;
        }
        room.players.delete(target.id);
        this.broadcastToRoom(room, {
            type: 'player_left',
            playerId: target.id,
            playerName: targetName,
            kicked: true
        });
        this.checkRoomReadyState(room);
        return this.send(ws, {
            type: 'player_kicked_success',
            playerId: target.id,
            playerName: targetName,
            message: `${targetName} a été retiré du groupe.`
        });
    }

    removePlayer(room, playerId) {
        const player = room.players.get(playerId);
        if (!player) return;
        room.players.delete(playerId);
        if (room.state === 'lobby') {
            room.startChoice = null;
            room.startChoicePending = false;
        }
        console.log(`[Multiplayer] Joueur ${playerId} a quitté la salle ${room.code}`);

        if (room.players.size === 0) {
            console.log(`[Multiplayer] Salle ${room.code} fermée (vide)`);
            this.dequeueMatchmaking(room);
            this.rooms.delete(room.code);
            return;
        }

        if (room.hostId === playerId) {
            const nextHost = [...room.players.values()].find(p => p.ws && p.ws.readyState === 1) || room.players.values().next().value;
            if (nextHost) {
                room.hostId = nextHost.id;
                console.log(`[Multiplayer] Nouvel hôte pour ${room.code} : ${nextHost.name}`);
                this.broadcastToRoom(room, { type: 'new_host', hostId: nextHost.id });
            }
        }

        this.broadcastToRoom(room, {
            type: 'player_left',
            playerId,
            playerName: player.name
        });
        this.checkRoomReadyState(room);
    }

    startGameForRoom(room) {
        if (!room || room.state !== 'lobby') return;
        this.dequeueMatchmaking(room);
        room.startChoice = null;
        room.startChoicePending = false;
        room.state = 'game';
        room.seed = Math.floor(Math.random() * 1000000);
        room.matchedRooms = null;
        // L'hôte de la partie (bots, corruption, vaisseau) : le chef du groupe
        room.authorityId = room.hostId;
        this.resetGameFlags(room, 1); // Tous dans la même équipe

        console.log(`[Multiplayer] Lancement de la partie pour la salle ${room.code} (seed: ${room.seed})`);

        this.broadcastToRoom(room, {
            type: 'game_start',
            roomCode: room.code,
            seed: room.seed,
            mode: room.mode,
            mapId: room.mode === DUEL_MODE ? 'duel-two-towns' : 'default',
            ...this.fillInfo(room),
            myTeam: 1,
            authorityId: room.authorityId,
            // Équipes de vrais joueurs (les bots de la partie sont calculés pareil partout à partir de ça)
            teams: [{ team: 1, humans: room.players.size, fillTeam: room.fillTeam !== false }],
            players: this.serializePlayers(room)
        });
    }

    sendChat(ws, message) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room || !ws.playerId) return;

        const player = room.players.get(ws.playerId);
        const name = player ? player.name : 'Joueur';
        const cleanMsg = String(message || '').slice(0, 140).trim();
        if (!cleanMsg) return;

        this.broadcastToRoom(room, {
            type: 'chat',
            author: name,
            message: cleanMsg,
            time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
        });
    }

    startGame(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room || room.hostId !== ws.playerId) return;

        if (room.state !== 'lobby') return;
        const allReady = room.players.size > 0 && [...room.players.values()].every(p => p.ready);
        if (!allReady) return;
        if (!room.startChoice) {
            if (!room.startChoicePending) {
                room.startChoicePending = true;
                this.requestStartChoice(room);
            }
            return;
        }
        if (room.startChoice === 'players') {
            room.botFill = false;
            room.fillTeam = false;
            this.enqueueMatchmaking(room);
        } else {
            room.botFill = true;
            this.startGameForRoom(room);
        }
    }

    handleAdminAction(ws, room, data) {
        if (!ws.isAdmin) return;
        const action = String(data.action || '').toLowerCase();
        if (!ADMIN_ACTIONS.has(action)) return;

        const targetId = String(data.targetId || '');
        if (!targetId || targetId.length > 128) return;
        const target = this.findMatchPlayer(room, targetId);
        const targetIsHuman = !!target;
        if (target && (!target.ws || target.inLobby)) return;
        if (action === 'kick_target') {
            if (!targetIsHuman) return;
            return this.kickFromMatch(ws, room, target.id);
        }
        if (targetIsHuman && target.id === ws.playerId && (action === 'teleport_target_here' || action === 'teleport_to_target')) return;

        const payload = {
            type: 'admin_action_execute',
            action,
            targetId,
            sourceId: ws.playerId
        };
        if (action === 'give_weapon') {
            const weaponId = String(data.weaponId || '').toLowerCase();
            const rarity = Number(data.rarity);
            if (!ADMIN_WEAPON_IDS.has(weaponId) || !Number.isInteger(rarity) || rarity < 0 || rarity > ADMIN_MAX_RARITY) return;
            payload.weaponId = weaponId;
            payload.rarity = rarity;
        } else if (action === 'give_heal') {
            const itemId = String(data.itemId || '');
            const count = Math.max(1, Math.min(10, Number(data.count) | 0));
            if (!ADMIN_HEAL_IDS.has(itemId)) return;
            payload.itemId = itemId;
            payload.count = count;
        }

        const authority = this.findMatchPlayer(room, room.authorityId);
        const executor = action === 'teleport_to_target' ? ws : target?.ws || authority?.ws;
        if (!executor || executor.readyState !== 1) return;
        this.send(executor, payload);
    }

    kickFromMatch(ws, room, targetId) {
        if (!ws.isAdmin) return;
        const target = this.findMatchPlayer(room, targetId);
        if (!target || !target.ws) return;
        if (target.id === ws.playerId) return;

        const targetSocket = target.ws;
        this.send(targetSocket, {
            type: 'player_kicked',
            roomCode: room.code,
            playerId: target.id,
            message: 'Tu as été expulsé de la partie par un administrateur.'
        });

        const owningRoom = this.roomForSocket(targetSocket) || room;
        const targetRoomCode = this.playerRooms.get(targetSocket);
        if (targetRoomCode) this.playerRooms.delete(targetSocket);
        owningRoom.players.delete(target.id);
        delete targetSocket.playerId;
        target.ws = null;
        target.inLobby = true;

        if (room.authorityId === target.id) this.migrateAuthority(room);
        this.broadcastToMatch(room, { type: 'player_gone', playerId: target.id, kicked: true });
        try { targetSocket.close(4003, 'kicked'); } catch { /* socket déjà fermée */ }
        this.maybeReturnToLobby(room);
    }

    relayGameMessage(ws, data) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        // Seulement pendant une partie, et seulement depuis la socket actuelle du joueur
        if (room.state !== 'game' || !ws.playerId) return;
        const sender = room.players.get(ws.playerId);
        if (!sender || sender.ws !== ws || sender.inLobby) return;

        if (data.type === 'admin_action') {
            return this.handleAdminAction(ws, room, data);
        }

        if (data.type === 'admin_power') {
            if (!ws.isAdmin) return;
            const power = String(data.power || '').toLowerCase();
            if (!ADMIN_POWERS.has(power)) return;
            const enabled = data.enabled === true;
            const value = power === 'speed'
                ? Math.max(1, Math.min(3, Number(data.value) || 2))
                : undefined;
            room.adminPowerSeq = (room.adminPowerSeq || 0) + 1;
            this.broadcastToMatch(room, {
                type: 'admin_power_state',
                stateSeq: room.adminPowerSeq,
                targetId: ws.playerId,
                power,
                enabled,
                ...(value === undefined ? {} : { value })
            });
            return;
        }

        if (data.type === 'admin_drop_weapon') {
            if (!ws.isAdmin) return;
            const weaponId = String(data.weaponId || '').toLowerCase();
            const rarity = Number(data.rarity);
            if (!ADMIN_WEAPON_IDS.has(weaponId) || !Number.isInteger(rarity) || rarity < 0 || rarity > ADMIN_MAX_RARITY) return;
            this.broadcastToMatch(room, {
                type: 'admin_drop_weapon',
                id: ws.playerId,
                weaponId,
                rarity
            });
            return;
        }

        if (data.type === 'p_effect') {
            if (typeof data.e !== 'string' || data.e.length > 20 || !Number.isFinite(Number(data.t)) || !Number.isFinite(Number(data.v))) return;
            data.t = String(data.t).slice(0, 64);
            data.v = Math.max(0, Math.min(1, Number(data.v)));
            data.x = Number.isFinite(Number(data.x)) ? Number(data.x) : 0;
            data.y = Number.isFinite(Number(data.y)) ? Number(data.y) : 0;
        }

        if (data.type === 'p_throw') {
            if (typeof data.i !== 'string' || data.i.length > 32 || !Number.isFinite(Number(data.a)) || !Number.isFinite(Number(data.x)) || !Number.isFinite(Number(data.y))) return;
            data.a = Math.max(-Math.PI * 2, Math.min(Math.PI * 2, Number(data.a)));
            data.x = Math.max(-100000, Math.min(100000, Number(data.x)));
            data.y = Math.max(-100000, Math.min(100000, Number(data.y)));
            data.s = ws.playerId;
        }

        // Ravitaillements : identifiant court, position finie, contenu limité à quelques objets.
        if (data.type === 'supply_spawn' || data.type === 'supply_open_request' || data.type === 'supply_open') {
            if (typeof data.dropId !== 'string' || !data.dropId || data.dropId.length > 48) return;
            if (data.type === 'supply_spawn') {
                if (!Number.isFinite(Number(data.x)) || !Number.isFinite(Number(data.y)) || !Number.isFinite(Number(data.at))) return;
                if (!Array.isArray(data.contents) || data.contents.length > 4) return;
                data.x = Math.max(0, Math.min(100000, Number(data.x)));
                data.y = Math.max(0, Math.min(100000, Number(data.y)));
                data.at = Math.max(0, Number(data.at));
                data.contents = data.contents
                    .filter(c => c && typeof c === 'object')
                    .map(c => ({
                        kind: String(c.kind || '').slice(0, 16),
                        ...(c.weaponId !== undefined ? { weaponId: String(c.weaponId).slice(0, 32) } : {}),
                        ...(c.itemId !== undefined ? { itemId: String(c.itemId).slice(0, 32) } : {}),
                        ...(c.rarity !== undefined ? { rarity: Math.max(0, Math.min(ADMIN_MAX_RARITY, Number(c.rarity) | 0)) } : {}),
                        ...(c.mag !== undefined ? { mag: Math.max(0, Math.min(999, Number(c.mag) | 0)) } : {}),
                        ...(c.count !== undefined ? { count: Math.max(1, Math.min(10, Number(c.count) | 0)) } : {})
                    }));
            }
        }

        // Anti-spam des emotes : une toutes les 2,5 s au plus par joueur (le jeu en autorise une / 3 s)
        if (data.type === 'emote') {
            const now = Date.now();
            if (now - (sender.lastEmoteAt || 0) < EMOTE_MIN_GAP) return;
            sender.lastEmoteAt = now;
            if (typeof data.e !== 'string' || data.e.length > 32) return;
        }

        // L'émetteur est toujours celui de la socket (impossible de se faire passer pour un autre)
        data.id = ws.playerId;

        // Relayer aux joueurs en jeu de la partie (toutes les salles en cas de matchmaking)
        this.broadcastToMatch(room, data, ws);
    }

    leaveCurrentRoom(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;

        this.playerRooms.delete(ws);
        const room = this.rooms.get(code);
        if (!room) return;

        const playerId = ws.playerId;
        const player = room.players.get(playerId);

        // Ancienne socket du joueur (ex : celle du lobby, fermée APRÈS que la page de jeu
        // s'est reconnectée) : on l'ignore, sinon le joueur ne recevrait plus rien.
        if (player && player.ws && player.ws !== ws) return;

        // IMPORTANT : Si la partie est en cours ('game'), les joueurs changent de page
        // (index.html -> game.html), ce qui ferme le socket temporairement.
        // On ne supprime PAS le joueur ni la salle tout de suite pour permettre la reconnexion !
        if (room.state === 'game') {
            if (player) {
                player.ws = null;
                player.disconnectedAt = Date.now();
                const wasPlaying = !player.inLobby;
                console.log(`[Multiplayer] Joueur ${playerId} déconnecté de la partie ${code}`);

                if (wasPlaying) {
                    // L'hôte de la partie a coupé : un autre prend le relais s'il ne revient pas vite
                    if (room.authorityId === playerId) {
                        if (room.authorityTimer) clearTimeout(room.authorityTimer);
                        room.authorityTimer = setTimeout(() => {
                            room.authorityTimer = null;
                            if (room.state === 'game') this.migrateAuthority(room);
                        }, this.authorityGrace(room));
                    }
                    // Toujours absent après 10 s (onglet fermé, connexion perdue) : il a quitté
                    // la partie pour de bon. Un rechargement de page revient bien avant.
                    if (player.goneTimer) clearTimeout(player.goneTimer);
                    player.goneTimer = setTimeout(() => {
                        player.goneTimer = null;
                        if (room.state === 'game' && !player.ws && !player.inLobby) {
                            player.inLobby = true; // ne compte plus parmi les joueurs en jeu
                            // Nouvel hôte d'abord : c'est lui qui fait tomber le butin du partant
                            if (room.authorityId === playerId) this.migrateAuthority(room);
                            this.broadcastToMatch(room, { type: 'player_gone', playerId });
                            this.maybeReturnToLobby(room);
                        }
                    }, PLAYER_GONE_DELAY);
                }
            }

            // Si tous les joueurs sont déconnectés pendant plus de 3 minutes, nettoyer la salle
            if (!room.cleanupTimer) {
                room.cleanupTimer = setTimeout(() => {
                    const anyConnected = [...room.players.values()].some(p => p.ws && p.ws.readyState === 1);
                    if (!anyConnected) {
                        console.log(`[Multiplayer] Salle ${code} fermée après inactivité prolongée en jeu`);
                        this.rooms.delete(code);
                    } else {
                        room.cleanupTimer = null;
                    }
                }, 180000);
            }
            return;
        }

        if (player) this.removePlayer(room, playerId);
    }

    serializePlayer(p, room = null) {
        return {
            id: p.id,
            name: p.name,
            skin: p.skin,
            backpack: p.backpack || null,
            colors: p.colors,
            pickaxeSkin: p.pickaxeSkin,
            glider: p.glider || null,
            ready: p.ready,
            isAdmin: !!p.isAdmin,
            slot: p.slot,
            team: p.team || 1,
            isHost: room ? (p.id === room.hostId) : false
        };
    }

    serializePlayers(room) {
        return [...room.players.values()].map(p => this.serializePlayer(p, room));
    }

    send(ws, data) {
        if (ws && ws.readyState === 1) { // OPEN
            try {
                ws.send(JSON.stringify(data));
            } catch (err) {
                console.error('[Multiplayer] Erreur envoi ws:', err.message);
            }
        }
    }

    broadcastToRoom(roomOrCode, data, excludeWs = null) {
        const room = typeof roomOrCode === 'string' ? this.rooms.get(roomOrCode) : roomOrCode;
        if (!room || !room.players) return;
        const msg = JSON.stringify(data);
        for (const player of room.players.values()) {
            if (player.ws && player.ws !== excludeWs && (player.ws.readyState === undefined || player.ws.readyState === 1)) {
                try {
                    player.ws.send(msg);
                } catch { /* socket drop */ }
            }
        }
    }

    sendAdminGamesList(ws) {
        if (!ws.isAdmin) {
            return this.send(ws, { type: 'error', code: 'admin_required', message: 'Accès réservé aux administrateurs.' });
        }
        const games = [];
        for (const [code, r] of this.rooms) {
            if (r.state === 'game') {
                const activePlayers = [...r.players.values()].map(p => ({
                    id: p.id,
                    name: p.name,
                    isAdmin: !!p.isAdmin,
                    isHost: p.id === r.hostId,
                    inLobby: !!p.inLobby,
                    slot: p.slot,
                    team: p.team
                }));
                const isBotGame = (r.botFill !== false && r.players.size <= 1) || r.startChoice === 'bots';
                games.push({
                    roomCode: code,
                    mode: r.mode,
                    mapId: r.mode === DUEL_MODE ? 'duel-two-towns' : 'default',
                    seed: r.seed,
                    isBotGame,
                    botFill: !!r.botFill,
                    fillTeam: !!r.fillTeam,
                    playersCount: r.players.size,
                    players: activePlayers,
                    startedAt: r.startedAt || r.createdAt,
                    duration: Math.max(0, Math.floor((Date.now() - (r.startedAt || r.createdAt)) / 1000)),
                    authorityId: r.authorityId
                });
            }
        }
        this.send(ws, {
            type: 'admin_games_list',
            games
        });
    }

    closeGameByAdmin(ws, roomCode) {
        if (!ws.isAdmin) {
            return this.send(ws, { type: 'error', code: 'admin_required', message: 'Accès réservé aux administrateurs.' });
        }
        const code = String(roomCode || '').trim().toUpperCase();
        const room = this.rooms.get(code);
        if (!room) {
            return this.send(ws, { type: 'admin_error', message: 'Partie introuvable ou déjà terminée.' });
        }

        console.log(`[Admin] Fermeture de la partie ${code} par ${ws.accountName || ws.playerId}`);

        // Expulser tous les joueurs de la partie
        this.broadcastToMatch(room, {
            type: 'player_kicked',
            roomCode: room.code,
            message: 'La partie a été fermée par un administrateur.'
        });

        for (const p of room.players.values()) {
            if (p.ws && p.ws !== ws) {
                try {
                    this.send(p.ws, {
                        type: 'player_kicked',
                        roomCode: room.code,
                        message: 'La partie a été fermée par un administrateur.'
                    });
                    this.playerRooms.delete(p.ws);
                    delete p.ws.playerId;
                    p.ws.close?.(4003, 'admin_closed_game');
                } catch { /* ignore */ }
            }
        }

        this.dequeueMatchmaking(room);
        this.rooms.delete(code);

        this.send(ws, {
            type: 'admin_game_closed',
            roomCode: code,
            message: `La partie ${code} a été fermée.`
        });

        this.notifyAdminsWithGamesList();
    }

    notifyAdminsWithGamesList() {
        for (const sockets of this.accountSockets.values()) {
            for (const socket of sockets) {
                if (socket.isAdmin && socket.readyState === 1) {
                    this.sendAdminGamesList(socket);
                }
            }
        }
    }
}

module.exports = { RoomManager };
