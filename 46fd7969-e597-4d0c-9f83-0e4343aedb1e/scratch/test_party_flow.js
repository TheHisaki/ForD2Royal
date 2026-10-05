const path = require('path');
const { RoomManager } = require('c:/Users/thehisaki/OneDrive - LYCEE GASTON BERGER/projet/For2DRoyal/server/rooms.js');

class MockWS {
    constructor(name) {
        this.name = name;
        this.readyState = 1;
        this.sent = [];
    }
    send(str) {
        const data = JSON.parse(str);
        this.sent.push(data);
    }
    last() {
        return this.sent[this.sent.length - 1];
    }
}

const rm = new RoomManager();

console.log('--- TEST 1: Création salle par Hôte (Alice) ---');
const wsAlice = new MockWS('Alice');
const room = rm.createRoom(wsAlice, { id: 'usr_alice', name: 'Alice', mode: 'duo', botFill: true });
console.log('Room code:', room.code);
console.log('Alice received:', wsAlice.last().type, wsAlice.last().players);

console.log('\n--- TEST 2: Rejoint par Ami (Bob) ---');
const wsBob = new MockWS('Bob');
rm.joinRoom(wsBob, room.code, { id: 'usr_bob', name: 'Bob' });
console.log('Bob received:', wsBob.last().type, 'slot:', wsBob.last().slot);
console.log('Alice received update:', wsAlice.last().type, wsAlice.last().player?.name);

console.log('\n--- TEST 3: Bob se met prêt ---');
rm.updateStatus(wsBob, { ready: true });
console.log('Bob ready. Room state:', room.state);

console.log('\n--- TEST 4: Alice se met prête -> Lancement automatique ---');
rm.updateStatus(wsAlice, { ready: true });
console.log('Room state after both ready:', room.state);
console.log('Alice game_start msg:', wsAlice.last().type, 'seed:', wsAlice.last().seed, 'players:', wsAlice.last().players.map(p => ({ id: p.id, name: p.name, slot: p.slot, team: p.team })));
console.log('Bob game_start msg:', wsBob.last().type, 'seed:', wsBob.last().seed, 'players:', wsBob.last().players.map(p => ({ id: p.id, name: p.name, slot: p.slot, team: p.team })));

if (wsAlice.last().type !== 'game_start' || wsBob.last().type !== 'game_start') {
    throw new Error('Game start was not broadcast to both players!');
}
if (wsAlice.last().seed !== wsBob.last().seed) {
    throw new Error('Seed is not synchronized!');
}
if (wsAlice.last().players.length !== 2 || wsBob.last().players.length !== 2) {
    throw new Error('Players count in game_start is not 2!');
}

console.log('\n--- TEST 5: Reconnexion en jeu (game.html) ---');
// Simuler la fermeture de socket lobby lors de la redirection
rm.leaveCurrentRoom(wsAlice);
rm.leaveCurrentRoom(wsBob);

// Nouveaux sockets ouverts par game.html
const wsAliceGame = new MockWS('AliceGame');
rm.joinRoom(wsAliceGame, room.code, { id: 'usr_alice', name: 'Alice', slot: 1 });
console.log('Alice in game.html received:', wsAliceGame.last().type, 'slot:', wsAliceGame.last().slot, 'seed:', wsAliceGame.last().seed, 'players:', wsAliceGame.last().players.length);

const wsBobGame = new MockWS('BobGame');
rm.joinRoom(wsBobGame, room.code, { id: 'usr_bob', name: 'Bob', slot: 2 });
console.log('Bob in game.html received:', wsBobGame.last().type, 'slot:', wsBobGame.last().slot, 'seed:', wsBobGame.last().seed, 'players:', wsBobGame.last().players.length);
console.log('Alice received reconnect notification:', wsAliceGame.last().type, wsAliceGame.last().player?.name);

const aliceJoined = wsAliceGame.sent.find(m => m.type === 'room_joined');
const bobJoined = wsBobGame.sent.find(m => m.type === 'room_joined');

if (aliceJoined.slot !== 1 || bobJoined.slot !== 2) {
    throw new Error('Slots were not preserved!');
}
if (aliceJoined.seed !== bobJoined.seed) {
    throw new Error('Seeds do not match in game!');
}

console.log('\nTOUS LES TESTS SONT PASSES AVEC SUCCES !');
