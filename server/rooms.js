/* ==================================
   GESTIONNAIRE MULTIJOUEUR WEBSOCKET - FOR2D ROYAL
   Salles de jeu temps-réel, synchronisation lobby & partie
   Adapté pour Node.js sur hébergement Hostinger (Business)
   ================================== */

const ROOM_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS_PER_ROOM = 4; // Escouade max par lobby
const MAX_FIGHTERS = 24;        // places sur la carte (même valeur que js/game/main.js)

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
    }

    getQueue(mode) {
        mode = (mode || 'duo').toLowerCase();
        if (!this.matchmakingQueues.has(mode)) {
            this.matchmakingQueues.set(mode, {
                rooms: new Set(),
                timer: null,
                secondsLeft: 30
            });
        }
        return this.matchmakingQueues.get(mode);
    }

    createRoom(ws, hostData) {
        // Nettoyer si déjà dans une salle
        this.leaveCurrentRoom(ws);

        let code;
        let attempts = 0;
        do {
            code = generateRoomCode();
            attempts++;
        } while (this.rooms.has(code) && attempts < 100);

        const room = {
            code,
            hostId: hostData.id,
            mode: hostData.mode || 'duo',
            // botFill = « Remplir la partie avec des bots » ; fillTeam = « Remplir l'équipe avec des bots »
            botFill: (hostData.fillMatch ?? hostData.botFill) !== false,
            fillTeam: hostData.fillTeam !== false,
            state: 'lobby',
            seed: Math.floor(Math.random() * 1000000),
            createdAt: Date.now(),
            players: new Map(),
            matchedRooms: null
        };

        const hostPlayer = {
            id: hostData.id,
            name: String(hostData.name || 'Hôte').slice(0, 16),
            skin: hostData.skin || 'recrue',
            backpack: hostData.backpack || null,
            colors: hostData.colors || null,
            pickaxeSkin: hostData.pickaxeSkin || 'pioche-defaut',
            ready: false,
            slot: 1, // Hôte toujours slot 1
            ws
        };

        room.players.set(hostPlayer.id, hostPlayer);
        this.rooms.set(code, room);
        this.playerRooms.set(ws, code);
        ws.playerId = hostPlayer.id;

        console.log(`[Multiplayer] Salle créée: ${code} par ${hostPlayer.name} (${hostPlayer.id}) [botFill: ${room.botFill}]`);

        this.send(ws, {
            type: 'room_created',
            roomCode: code,
            hostId: room.hostId,
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

    joinRoom(ws, code, playerData) {
        code = String(code || '').trim().toUpperCase();
        this.leaveCurrentRoom(ws);

        const room = this.rooms.get(code);
        if (!room) {
            return this.send(ws, { type: 'error', message: 'Code de salle introuvable.' });
        }

        const candidateId = playerData.id || playerData.player?.id;

        // Reconnexion d'un joueur existant (ex: passage à game.html ou refresh)
        if (candidateId && room.players.has(candidateId)) {
            const existingPlayer = room.players.get(candidateId);
            existingPlayer.ws = ws;
            existingPlayer.disconnectedAt = null;
            this.playerRooms.set(ws, code);
            ws.playerId = existingPlayer.id;
            console.log(`[Multiplayer] ${existingPlayer.name} (${existingPlayer.id}) reconnecté à la salle ${code} (state: ${room.state})`);

            // Page de jeu (inGame) ou retour au lobby après la partie
            existingPlayer.inLobby = room.state === 'game' ? !playerData.inGame : false;
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
                authorityId: room.authorityId || null,
                mode: room.mode,
                ...this.fillInfo(room),
                slot: existingPlayer.slot,
                seed: room.seed,
                state: room.state,
                players: room.state === 'game' ? this.matchPlayers(room) : this.serializePlayers(room)
            });

            if (room.state === 'game') {
                if (existingPlayer.inLobby) {
                    // Revenu au lobby : s'il menait la partie, un autre joueur prend le relais
                    if (room.authorityId === existingPlayer.id) this.migrateAuthority(room);
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

        // Partie en cours : seuls ses joueurs (même identifiant) peuvent y revenir.
        // (Prendre la place d'un autre mélangerait les identifiants entre les machines.)
        if (room.state === 'game') {
            return this.send(ws, { type: 'error', message: 'Cette partie a déjà commencé. Réessaie à la fin de la partie.' });
        }

        if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
            return this.send(ws, { type: 'error', message: 'La salle est complète (4 joueurs max).' });
        }

        // Trouver un numéro de slot libre (2, 3, ou 4)
        const usedSlots = new Set([...room.players.values()].map(p => p.slot));
        let freeSlot = 2;
        while (usedSlots.has(freeSlot) && freeSlot <= 4) freeSlot++;

        const newPlayer = {
            id: candidateId || `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: String(playerData.name || playerData.player?.name || `Joueur ${freeSlot}`).slice(0, 16),
            skin: playerData.skin || playerData.player?.skin || 'recrue',
            backpack: playerData.backpack || playerData.player?.backpack || null,
            colors: playerData.colors || playerData.player?.colors || null,
            pickaxeSkin: playerData.pickaxeSkin || playerData.player?.pickaxeSkin || 'pioche-defaut',
            ready: false,
            slot: freeSlot,
            ws
        };

        room.players.set(newPlayer.id, newPlayer);
        this.playerRooms.set(ws, code);
        ws.playerId = newPlayer.id;

        console.log(`[Multiplayer] ${newPlayer.name} a rejoint la salle ${code} (slot ${freeSlot})`);

        // Ajuster automatiquement le mode selon le nombre de joueurs présents
        const count = room.players.size;
        let modeChanged = false;
        if (count >= 2 && (!room.mode || room.mode === 'solo')) {
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

        // Confirmer au joueur qu'il a rejoint
        this.send(ws, {
            type: 'room_joined',
            roomCode: code,
            hostId: room.hostId,
            mode: room.mode,
            ...this.fillInfo(room),
            slot: freeSlot,
            players: this.serializePlayers(room)
        });

        // Notifier les autres joueurs
        this.broadcastToRoom(room, {
            type: 'player_joined',
            player: this.serializePlayer(newPlayer, room)
        }, ws);

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
        if (data.name) player.name = String(data.name).slice(0, 16);
        if (data.skin) player.skin = data.skin;
        if (data.backpack !== undefined) player.backpack = data.backpack;
        if (data.colors) player.colors = data.colors;
        if (data.pickaxeSkin) player.pickaxeSkin = data.pickaxeSkin;

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

        // Empêcher de choisir un mode avec moins de places que de joueurs réels dans le groupe
        const modeHierarchy = { solo: 1, duo: 2, trio: 3, section: 4 };
        if (data.mode && modeHierarchy[data.mode] && modeHierarchy[data.mode] < room.players.size) {
            console.log(`[Multiplayer] Mode ${data.mode} rejeté : ${room.players.size} joueurs dans le groupe`);
            return;
        }

        const oldMode = room.mode;
        if (data.mode) room.mode = data.mode;
        const fillMatch = typeof data.fillMatch === 'boolean' ? data.fillMatch : data.botFill;
        if (typeof fillMatch === 'boolean') room.botFill = fillMatch;
        if (typeof data.fillTeam === 'boolean') room.fillTeam = data.fillTeam;

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

    /* ===== LOGIQUE DE PRÉPARATION & LANCEMENT DU JEU ===== */

    checkRoomReadyState(room) {
        if (!room || room.state !== 'lobby') return;
        const allReady = room.players.size > 0 && [...room.players.values()].every(p => p.ready);

        if (allReady) {
            if (room.botFill !== false) {
                // AVEC BOTS : lancement direct avec le duo / équipe en ligne + bots pour le reste
                console.log(`[Multiplayer] Tous prêts dans ${room.code} (Avec bots) : lancement immédiat !`);
                this.startGameForRoom(room);
            } else {
                // SANS BOTS : mise en file d'attente matchmaking (nécessite >= 2 équipes)
                console.log(`[Multiplayer] Tous prêts dans ${room.code} (Sans bots) : mise en file d'attente (${room.mode})`);
                this.enqueueMatchmaking(room);
            }
        } else {
            // Un joueur a annulé ou la salle n'est plus prête
            this.dequeueMatchmaking(room);
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
            // Au moins 2 équipes : lancer le compte à rebours de 30 secondes !
            if (!queue.timer) {
                queue.secondsLeft = 30;
                console.log(`[Matchmaking] >= 2 équipes en ${room.mode} ! Début du chrono de 30 secondes.`);

                this.broadcastToQueue(queue, {
                    type: 'matchmaking_status',
                    state: 'countdown',
                    secondsLeft: queue.secondsLeft,
                    teamsCount: queue.rooms.size,
                    mode: room.mode
                });

                queue.timer = setInterval(() => {
                    queue.secondsLeft--;

                    this.broadcastToQueue(queue, {
                        type: 'matchmaking_status',
                        state: 'countdown',
                        secondsLeft: queue.secondsLeft,
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
            queue.secondsLeft = 30;
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
        const teamSize = { solo: 1, duo: 2, trio: 3, section: 4 }[mode] || 2;
        const maxTeams = Math.max(2, Math.floor(MAX_FIGHTERS / teamSize));
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
                    ready: p.ready,
                    slot: p.slot,
                    team: teamId,
                    isHost: (p.id === r.hostId)
                });
            }
        });

        // Un seul hôte pour toute la partie : le chef de la première salle
        const authorityId = validRooms[0].hostId;

        // Chaque équipe garde son choix « Remplir l'équipe » (sinon elle joue en sous-nombre)
        const teams = validRooms.map((r, i) => ({ team: i + 1, humans: r.players.size, fillTeam: r.fillTeam !== false }));

        // Relier les salles pour que les messages en cours de partie soient partagés
        validRooms.forEach((r, teamIdx) => {
            r.state = 'game';
            r.seed = sharedSeed;
            r.matchedRooms = validRooms;
            r.authorityId = authorityId;
            this.resetGameFlags(r, teamIdx + 1);

            this.broadcastToRoom(r, {
                type: 'game_start',
                roomCode: r.code,
                seed: sharedSeed,
                mode: r.mode,
                // Partie sans bots adverses : seulement les équipes de la file d'attente
                botFill: false,
                fillMatch: false,
                fillTeam: r.fillTeam !== false,
                myTeam: teamIdx + 1,
                authorityId,
                teams,
                players: allMatchPlayers
            });
        });
    }

    // Début de partie : tout le monde « en jeu », équipe notée sur chaque joueur
    resetGameFlags(room, team) {
        for (const p of room.players.values()) {
            p.inLobby = false;
            p.team = team;
            if (p.goneTimer) clearTimeout(p.goneTimer);
            p.goneTimer = null;
        }
        if (room.authorityTimer) clearTimeout(room.authorityTimer);
        room.authorityTimer = null;
        room.startedAt = Date.now();
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
                mode: room.mode,
                ...this.fillInfo(room),
                slot: p.slot,
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
    removePlayer(room, playerId) {
        const player = room.players.get(playerId);
        if (!player) return;
        room.players.delete(playerId);
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

        // Sans bots dans la partie : on passe par la file d'attente (au moins 2 équipes)
        if (room.botFill === false) this.enqueueMatchmaking(room);
        else this.startGameForRoom(room);
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
                    // Toujours absent après 20 s : il a quitté la partie pour de bon
                    if (player.goneTimer) clearTimeout(player.goneTimer);
                    player.goneTimer = setTimeout(() => {
                        player.goneTimer = null;
                        if (room.state === 'game' && !player.ws && !player.inLobby) {
                            player.inLobby = true; // ne compte plus parmi les joueurs en jeu
                            this.broadcastToMatch(room, { type: 'player_gone', playerId });
                            this.maybeReturnToLobby(room);
                        }
                    }, 20000);
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
            ready: p.ready,
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
}

module.exports = { RoomManager };
