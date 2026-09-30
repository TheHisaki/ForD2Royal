/* ==================================
   GESTION RÉSEAU MULTIJOUEUR - FOR2D ROYAL
   Client WebSocket haute performance avec gestion de salles (codes à 6 lettres),
   session locale dans le navigateur et synchronisation temps-réel du lobby et des parties.
   ================================== */

const SESSION_KEY = 'for2d-session';

function getOrInitSession() {
    let session = null;
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (raw) session = JSON.parse(raw);
    } catch { /* parse error */ }

    if (!session || !session.playerId) {
        session = {
            playerId: 'usr_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36),
            created: Date.now()
        };
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        } catch { /* storage full */ }
    }
    return session;
}

class NetworkManager {
    constructor() {
        this.session = getOrInitSession();
        this.ws = null;
        this.connected = false;
        this.isHost = false;
        this.roomCode = null;
        this.roomPlayers = [];
        this.slot = 1;
        this.reconnectTimer = null;
        this.pendingAction = null;
        this.gameDataHandlers = [];

        this.init();
    }

    getPlayerId() {
        return this.session.playerId;
    }

    getPlayerName() {
        if (window.FOR2D_PROGRESS && window.FOR2D_PROGRESS.name) {
            return window.FOR2D_PROGRESS.name;
        }
        return localStorage.getItem('for2d-player-name') || 'Joueur';
    }

    getPlayerSkinData() {
        const cos = window.FOR2D_COSMETICS;
        const skin = cos?.equipped?.id || 'recrue';
        const pickaxe = cos?.equippedOf('pickaxe')?.id || 'pioche-defaut';
        const backpack = cos?.equippedOf('backpack')?.id || null;
        const colors = cos?.equipped?.game || null;
        return { skin, pickaxeSkin: pickaxe, backpack, colors };
    }

    init() {
        this.connect();
        this.checkUrlForRoomCode();

        if (typeof window !== 'undefined' && window.FOR2D_COSMETICS) {
            window.FOR2D_COSMETICS.onChange(() => {
                if (this.isConnected() && this.roomCode) {
                    this.sendPlayerStatus(window.lobbyManager?.localPlayerReady || false);
                }
            });
        }
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

            if (this.pendingAction) {
                const act = this.pendingAction;
                this.pendingAction = null;
                act();
            }
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
            // Mettre en file d'attente
            this.pendingAction = () => this.send(data);
            if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
                this.connect();
            }
        }
    }

    /* ===== ACTIONS DE SALLE ===== */

    createRoom(mode = 'duo', botFill = true) {
        const skinData = this.getPlayerSkinData();
        const payload = {
            type: 'create_room',
            id: this.getPlayerId(),
            name: this.getPlayerName(),
            mode: mode || 'duo',
            botFill: botFill !== false,
            skin: skinData.skin,
            backpack: skinData.backpack,
            pickaxeSkin: skinData.pickaxeSkin,
            colors: skinData.colors
        };

        this.send(payload);
        this.updateConnectionStatus('Création en cours...', '#ffd700');
    }

    joinRoom(roomCode) {
        if (!roomCode) return;
        roomCode = roomCode.trim().toUpperCase();

        const skinData = this.getPlayerSkinData();
        const payload = {
            type: 'join_room',
            roomCode,
            id: this.getPlayerId(),
            name: this.getPlayerName(),
            skin: skinData.skin,
            backpack: skinData.backpack,
            pickaxeSkin: skinData.pickaxeSkin,
            colors: skinData.colors
        };

        this.send(payload);
        this.updateConnectionStatus('Connexion à la salle...', '#ffd700');
    }

    leaveRoom() {
        if (this.roomCode) {
            this.send({ type: 'leave_room' });
            this.roomCode = null;
            this.isHost = false;
            this.hostId = null;
            this.roomPlayers = [];
            this.slot = 1;
            this.updateRoomCodeUI('-');
            this.updateConnectionStatus('En ligne', '#00ff88');

            if (window.lobbyManager) {
                window.lobbyManager.resetTeammateSlots?.();
                window.lobbyManager.addChatMessage?.('Tu as quitté la salle.');
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
            colors: skinData.colors
        });
    }

    sendRoomConfig(mode, botFill) {
        if (!this.isHost) return;
        this.send({
            type: 'update_config',
            mode,
            botFill
        });
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

    sendGameData(type, payload) {
        this.send({
            type,
            ...payload
        });
    }

    /* ===== GESTION DES MESSAGES SERVEUR ===== */

    handleMessage(msg) {
        switch (msg.type) {
            case 'room_created':
                this.isHost = true;
                this.hostId = this.getPlayerId();
                this.roomCode = msg.roomCode;
                this.slot = 1;
                this.roomPlayers = msg.players || [];
                this.updateRoomCodeUI(this.roomCode);
                this.updateConnectionStatus(`Chef du groupe (Salle ${this.roomCode})`, '#00ff88');

                this.copyCodeToClipboard(this.roomCode);

                if (window.lobbyManager) {
                    window.lobbyManager.addChatMessage(`Partie créée ! Code : ${this.roomCode}`);
                    window.lobbyManager.addChatMessage('Partage ce code ou le lien d\'invitation avec tes amis !');
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
                break;

            case 'room_joined':
                this.hostId = msg.hostId;
                this.isHost = (msg.hostId === this.getPlayerId());
                this.roomCode = msg.roomCode;
                this.slot = msg.slot || 2;
                this.roomPlayers = msg.players || [];
                this.updateRoomCodeUI(this.roomCode);
                this.updateConnectionStatus(this.isHost ? `Chef du groupe (Salle ${this.roomCode})` : `Membre du groupe (Salle ${this.roomCode})`, '#00ff88');

                if (window.lobbyManager) {
                    window.lobbyManager.addChatMessage(`Connecté à la salle ${this.roomCode} !`);
                    if (msg.mode) window.lobbyManager.setGameModeSilently?.(msg.mode);
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
                break;

            case 'player_joined':
                if (msg.player) {
                    // Mettre à jour la liste des joueurs
                    this.roomPlayers = this.roomPlayers.filter(p => p.id !== msg.player.id);
                    this.roomPlayers.push(msg.player);

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
                    window.lobbyManager.addChatMessage(`${msg.playerName || 'Un joueur'} a quitté le groupe.`);
                    window.lobbyManager.syncPartyMembers?.(this.roomPlayers);
                    window.lobbyManager.updateLeaderPermissions?.();
                }
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
                    if (msg.mode) window.lobbyManager.setGameModeSilently?.(msg.mode);
                    if (typeof msg.botFill === 'boolean') {
                        window.lobbyManager.botsEnabled = msg.botFill;
                        window.lobbyManager.updateBotFillUI?.();
                    }
                    const fillText = msg.botFill !== false ? 'Avec bots' : 'Sans bots (Matchmaking en ligne)';
                    window.lobbyManager.addChatMessage(`Configuration : Mode ${(msg.mode || 'duo').toUpperCase()} · ${fillText}`, 'Système');
                }
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
            window.lobbyManager.handleMatchmakingStatus?.({ state: 'idle' });
        }

        // Sauvegarder la configuration de la partie dans le localStorage pour game.html
        const teamSize = msg.mode === 'duo' ? 2 : msg.mode === 'trio' ? 3 : msg.mode === 'section' ? 4 : 1;
        const config = {
            mode: msg.mode || 'duo',
            modeName: (msg.mode || 'duo').toUpperCase(),
            teamSize,
            bots: msg.botFill !== false,
            isMultiplayer: true,
            roomCode: msg.roomCode,
            seed: msg.seed,
            mySlot: this.slot,
            myPlayerId: this.getPlayerId(),
            myTeam: msg.myTeam || 1,
            roomPlayers: msg.players || this.roomPlayers
        };

        try {
            localStorage.setItem('for2d-game-mode', JSON.stringify(config));
        } catch { /* ignore */ }

        if (window.lobbyManager) {
            window.lobbyManager.addChatMessage('🚀 La partie commence maintenant !');
            window.SFX?.play?.('launch');
        }

        setTimeout(() => {
            window.location.href = `game.html?room=${msg.roomCode}`;
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
            setTimeout(() => {
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
