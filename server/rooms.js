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
        this.rooms = new Map();           // roomCode -> Room
        this.playerRooms = new Map();     // ws -> roomCode
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
            players: new Map()
        };

        const hostPlayer = {
            id: hostData.id,
            name: String(hostData.name || 'Hôte').slice(0, 16),
            skin: hostData.skin || 'recrue',
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

        console.log(`[Multiplayer] Salle créée: ${code} par ${hostPlayer.name} (${hostPlayer.id})`);

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

        if (room.state !== 'lobby') {
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
            id: playerData.id || `p_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            name: String(playerData.name || `Joueur ${freeSlot}`).slice(0, 16),
            skin: playerData.skin || 'recrue',
            colors: playerData.colors || null,
            pickaxeSkin: playerData.pickaxeSkin || 'pioche-defaut',
            ready: false,
            slot: freeSlot,
            ws
        };

        room.players.set(newPlayer.id, newPlayer);
        this.playerRooms.set(ws, code);
        ws.playerId = newPlayer.id;

        console.log(`[Multiplayer] ${newPlayer.name} a rejoint la salle ${code} (slot ${freeSlot})`);

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
            player: this.serializePlayer(newPlayer)
        }, ws);

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
        if (data.colors) player.colors = data.colors;
        if (data.pickaxeSkin) player.pickaxeSkin = data.pickaxeSkin;

        this.broadcastToRoom(room, {
            type: 'player_updated',
            player: this.serializePlayer(player)
        });
    }

    updateConfig(ws, data) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room || room.hostId !== ws.playerId) return;

        if (data.mode) room.mode = data.mode;
        if (typeof data.botFill === 'boolean') room.botFill = data.botFill;

        this.broadcastToRoom(room, {
            type: 'room_config',
            mode: room.mode,
            botFill: room.botFill
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

        room.state = 'game';
        room.seed = Math.floor(Math.random() * 1000000);

        console.log(`[Multiplayer] Lancement de la partie pour la salle ${code} (seed: ${room.seed})`);

        this.broadcastToRoom(room, {
            type: 'game_start',
            roomCode: code,
            seed: room.seed,
            mode: room.mode,
            botFill: room.botFill,
            players: this.serializePlayers(room)
        });
    }

    relayGameMessage(ws, data) {
        const code = this.playerRooms.get(ws);
        if (!code) return;
        const room = this.rooms.get(code);
        if (!room) return;

        // Attacher l'id du joueur émetteur s'il n'est pas déjà précisé
        if (!data.id && ws.playerId) data.id = ws.playerId;

        // Relayer l'état ou l'action de jeu à tous les autres participants
        this.broadcastToRoom(room, data, ws);
    }

    leaveCurrentRoom(ws) {
        const code = this.playerRooms.get(ws);
        if (!code) return;

        this.playerRooms.delete(ws);
        const room = this.rooms.get(code);
        if (!room) return;

        const playerId = ws.playerId;
        const player = room.players.get(playerId);
        room.players.delete(playerId);

        console.log(`[Multiplayer] Joueur ${playerId} a quitté la salle ${code}`);

        if (room.players.size === 0) {
            console.log(`[Multiplayer] Salle ${code} fermée (vide)`);
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
    }

    serializePlayer(p) {
        return {
            id: p.id,
            name: p.name,
            skin: p.skin,
            colors: p.colors,
            pickaxeSkin: p.pickaxeSkin,
            ready: p.ready,
            slot: p.slot
        };
    }

    serializePlayers(room) {
        return [...room.players.values()].map(p => this.serializePlayer(p));
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
