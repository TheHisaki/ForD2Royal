/* ==================================
   GESTIONNAIRE MULTIJOUEUR WEBSOCKET - FOR2D ROYAL
   Salles de jeu temps-réel, synchronisation lobby & partie
   Adapté pour Node.js sur hébergement Hostinger (Business)
   ================================== */

const ROOM_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_PLAYERS_PER_ROOM = 4; // Escouade max par lobby

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
            botFill: hostData.botFill !== false,
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
            botFill: room.botFill,
            players: this.serializePlayers(room)
        });

        return room;
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

            this.send(ws, {
                type: 'room_joined',
                roomCode: code,
                hostId: room.hostId,
                mode: room.mode,
                botFill: room.botFill,
                slot: existingPlayer.slot,
                seed: room.seed,
                state: room.state,
                players: this.serializePlayers(room)
            });

            if (room.state === 'game') {
                this.broadcastToRoom(room, {
                    type: 'player_reconnected',
                    player: this.serializePlayer(existingPlayer, room),
                    id: existingPlayer.id,
                    slot: existingPlayer.slot,
                    name: existingPlayer.name
                }, ws);

                // Si TOUS les joueurs sont reconnectés après une partie,
                // remettre la salle en état 'lobby' pour pouvoir relancer
                const allConnected = [...room.players.values()].every(p => p.ws && p.ws.readyState === 1);
                if (allConnected) {
                    console.log(`[Multiplayer] Tous les joueurs reconnectés dans ${code} : retour en lobby`);
                    room.state = 'lobby';
                    room.seed = Math.floor(Math.random() * 1000000);
                    // Réinitialiser l'état "prêt" de tout le monde
                    for (const p of room.players.values()) {
                        p.ready = false;
                    }
                    // Informer les clients que la salle est de retour en lobby
                    this.broadcastToRoom(room, {
                        type: 'room_joined',
                        roomCode: code,
                        hostId: room.hostId,
                        mode: room.mode,
                        botFill: room.botFill,
                        state: 'lobby',
                        players: this.serializePlayers(room)
                    });
                    // Nettoyer le timer de cleanup si actif
                    if (room.cleanupTimer) {
                        clearTimeout(room.cleanupTimer);
                        room.cleanupTimer = null;
                    }
                }
            }
            return room;
        }

        // Si la partie est déjà lancée : rattachement au slot déconnecté
        if (room.state === 'game') {
            const disconnectedPlayer = [...room.players.values()].find(p => (!p.ws || p.ws.readyState !== 1) && (typeof playerData.slot !== 'number' || p.slot === playerData.slot));
            if (disconnectedPlayer) {
                console.log(`[Multiplayer] Rattachement au slot ${disconnectedPlayer.slot} (${disconnectedPlayer.name}) pour ${candidateId || 'reconnexion'}`);
                disconnectedPlayer.ws = ws;
                disconnectedPlayer.disconnectedAt = null;
                this.playerRooms.set(ws, code);
                ws.playerId = disconnectedPlayer.id;

                this.send(ws, {
                    type: 'room_joined',
                    roomCode: code,
                    hostId: room.hostId,
                    mode: room.mode,
                    botFill: room.botFill,
                    slot: disconnectedPlayer.slot,
                    seed: room.seed,
                    state: room.state,
                    players: this.serializePlayers(room)
                });

                this.broadcastToRoom(room, {
                    type: 'player_reconnected',
                    player: this.serializePlayer(disconnectedPlayer, room),
                    id: disconnectedPlayer.id,
                    slot: disconnectedPlayer.slot,
                    name: disconnectedPlayer.name
                }, ws);
                return room;
            }
            return this.send(ws, { type: 'error', message: 'Cette partie a déjà commencé.' });
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
            botFill: room.botFill,
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
                botFill: room.botFill
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
        if (typeof data.botFill === 'boolean') room.botFill = data.botFill;

        console.log(`[Multiplayer] Config salle ${code}: mode=${room.mode}, botFill=${room.botFill}`);

        this.broadcastToRoom(room, {
            type: 'room_config',
            mode: room.mode,
            botFill: room.botFill
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

        const validRooms = roomCodes.map(code => this.rooms.get(code)).filter(r => r && r.state === 'lobby');
        if (validRooms.length === 0) return;

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

        // Relier les salles pour que les messages en cours de partie soient partagés
        validRooms.forEach((r, teamIdx) => {
            r.state = 'game';
            r.seed = sharedSeed;
            r.matchedRooms = validRooms;

            this.broadcastToRoom(r, {
                type: 'game_start',
                roomCode: r.code,
                seed: sharedSeed,
                mode: r.mode,
                botFill: false,
                myTeam: teamIdx + 1,
                players: allMatchPlayers
            });
        });
    }

    startGameForRoom(room) {
        if (!room || room.state !== 'lobby') return;
        this.dequeueMatchmaking(room);
        room.state = 'game';
        room.seed = Math.floor(Math.random() * 1000000);

        console.log(`[Multiplayer] Lancement de la partie pour la salle ${room.code} (seed: ${room.seed})`);

        const players = this.serializePlayers(room).map(p => ({
            ...p,
            team: 1 // Tous dans la même équipe
        }));

        this.broadcastToRoom(room, {
            type: 'game_start',
            roomCode: room.code,
            seed: room.seed,
            mode: room.mode,
            botFill: room.botFill !== false,
            myTeam: 1,
            players
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

        this.startGameForRoom(room);
    }

    relayGameMessage(ws, data) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        // Attacher l'id du joueur émetteur s'il n'est pas déjà précisé
        if (!data.id && ws.playerId) data.id = ws.playerId;

        // Relayer aux joueurs de la salle et des salles matchées (si matchmaking multi-équipes)
        if (room.matchedRooms && room.matchedRooms.length > 1) {
            for (const r of room.matchedRooms) {
                this.broadcastToRoom(r, data, ws);
            }
        } else {
            this.broadcastToRoom(room, data, ws);
        }
    }

    leaveCurrentRoom(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;

        this.playerRooms.delete(ws);
        const room = this.rooms.get(code);
        if (!room) return;

        const playerId = ws.playerId;
        const player = room.players.get(playerId);

        // IMPORTANT : Si la partie est en cours ('game'), les joueurs changent de page
        // (index.html -> game.html), ce qui ferme le socket temporairement.
        // On ne supprime PAS le joueur ni la salle tout de suite pour permettre la reconnexion !
        if (room.state === 'game') {
            if (player) {
                player.ws = null;
                player.disconnectedAt = Date.now();
            }
            console.log(`[Multiplayer] Joueur ${playerId || 'inconnu'} déconnecté temporairement de la partie ${code}`);

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

        room.players.delete(playerId);
        console.log(`[Multiplayer] Joueur ${playerId} a quitté la salle ${code}`);

        if (room.players.size === 0) {
            console.log(`[Multiplayer] Salle ${code} fermée (vide)`);
            this.dequeueMatchmaking(room);
            this.rooms.delete(code);
            return;
        }

        // Si l'hôte part, élire le joueur suivant comme hôte
        if (room.hostId === playerId) {
            const nextHost = room.players.values().next().value;
            if (nextHost) {
                room.hostId = nextHost.id;
                console.log(`[Multiplayer] Nouvel hôte pour ${code} : ${nextHost.name}`);
                this.broadcastToRoom(room, {
                    type: 'new_host',
                    hostId: nextHost.id
                });
            }
        }

        this.broadcastToRoom(room, {
            type: 'player_left',
            playerId,
            playerName: player ? player.name : 'Un joueur'
        });

        this.checkRoomReadyState(room);
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
