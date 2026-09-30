/* ==================================
   GESTION RÉSEAU - FOR2D ROYAL
   Système de jeu en réseau local avec PeerJS
   ================================== */

class NetworkManager {
    constructor() {
        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.roomCode = null;
        this.playerData = {
            id: this.generatePlayerId(),
            name: 'Joueur 1',
            ready: false
        };
        this.init();
    }

    init() {
        // Initialiser PeerJS pour la connexion P2P
        // En production, vous devriez utiliser votre propre serveur PeerJS
        try {
            this.peer = new Peer(this.playerData.id, {
                debug: 0 // Niveau de debug (0-3)
            });

            this.setupPeerListeners();
        } catch (error) {
            console.warn('PeerJS non disponible. Le mode réseau sera limité.');
            this.useFallbackMode();
        }
    }

    useFallbackMode() {
        // Mode de secours sans PeerJS (simulation locale)
        console.log('Mode réseau en simulation locale');
        this.updateConnectionStatus('Simulation locale', 'orange');
    }

    setupPeerListeners() {
        if (!this.peer) return;

        this.peer.on('open', (id) => {
            console.log('Connexion P2P établie avec ID:', id);
            this.updateConnectionStatus('Prêt', '#00ff88');
        });

        this.peer.on('connection', (conn) => {
            console.log('Nouvelle connexion entrante');
            this.handleIncomingConnection(conn);
        });

        this.peer.on('error', (err) => {
            console.error('Erreur PeerJS:', err);
            this.updateConnectionStatus('Erreur: ' + err.type, '#ff4757');
            
            // Messages d'erreur plus conviviaux
            if (err.type === 'peer-unavailable') {
                this.showError('Code de salle invalide ou partie inexistante.');
            } else if (err.type === 'network') {
                this.showError('Erreur réseau. Vérifiez votre connexion.');
            }
        });

        this.peer.on('disconnected', () => {
            console.log('Déconnecté du serveur de signaling');
            this.updateConnectionStatus('Déconnecté', '#ff4757');
        });
    }

    generatePlayerId() {
        return 'player_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    createRoom() {
        if (!this.peer) {
            this.showError('Service réseau non disponible.');
            return;
        }

        this.isHost = true;
        this.roomCode = this.generateRoomCode();
        
        // Afficher le code de salle
        document.getElementById('roomCode').textContent = this.roomCode;
        this.updateConnectionStatus('Hôte actif', '#00ff88');
        
        // Sauvegarder l'ID de l'hôte avec le code de salle
        this.hostPeerId = this.peer.id;
        
        console.log('Partie créée avec le code:', this.roomCode);
        console.log('ID de l\'hôte:', this.hostPeerId);
        
        if (window.lobbyManager) {
            window.lobbyManager.addChatMessage(`Partie créée! Code: ${this.roomCode}`);
            window.lobbyManager.addChatMessage('Partagez ce code avec vos amis!');
        }

        // Sauvegarder dans le localStorage pour la découverte
        this.saveRoomToLocalStorage();
    }

    saveRoomToLocalStorage() {
        const roomData = {
            code: this.roomCode,
            hostId: this.hostPeerId,
            timestamp: Date.now()
        };
        localStorage.setItem('for2d_room_' + this.roomCode, JSON.stringify(roomData));
    }

    joinRoom(roomCode) {
        if (!this.peer) {
            this.showError('Service réseau non disponible.');
            return;
        }

        this.roomCode = roomCode;
        
        // Chercher le room dans le localStorage
        const roomDataStr = localStorage.getItem('for2d_room_' + roomCode);
        
        if (roomDataStr) {
            const roomData = JSON.parse(roomDataStr);
            const hostId = roomData.hostId;
            
            console.log('Connexion à l\'hôte:', hostId);
            
            // Se connecter à l'hôte
            const conn = this.peer.connect(hostId, {
                reliable: true
            });
            
            this.setupConnection(conn);
            this.updateConnectionStatus('Connexion...', '#ffd700');
            
        } else {
            this.showError('Code de salle introuvable. L\'hôte doit être sur le même réseau.');
        }
    }

    handleIncomingConnection(conn) {
        console.log('Joueur en cours de connexion:', conn.peer);
        
        this.setupConnection(conn);
        
        // Envoyer les données de la partie au nouveau joueur
        conn.on('open', () => {
            this.sendToConnection(conn, {
                type: 'welcome',
                host: this.isHost,
                roomCode: this.roomCode,
                players: window.lobbyManager ? window.lobbyManager.players : []
            });
        });
    }

    setupConnection(conn) {
        this.connections.push(conn);

        conn.on('open', () => {
            console.log('Connexion établie avec:', conn.peer);
            this.updateConnectionStatus('Connecté', '#00ff88');
            document.getElementById('roomCode').textContent = this.roomCode;
            
            // Envoyer nos données de joueur
            this.sendToConnection(conn, {
                type: 'playerJoin',
                player: this.playerData
            });
            
            if (window.lobbyManager) {
                window.lobbyManager.addChatMessage('Connecté à la partie!');
            }
        });

        conn.on('data', (data) => {
            this.handleMessage(data, conn);
        });

        conn.on('close', () => {
            console.log('Connexion fermée avec:', conn.peer);
            this.removeConnection(conn);
            
            if (window.lobbyManager) {
                window.lobbyManager.addChatMessage('Un joueur s\'est déconnecté.');
            }
        });

        conn.on('error', (err) => {
            console.error('Erreur de connexion:', err);
            this.removeConnection(conn);
        });
    }

    removeConnection(conn) {
        const index = this.connections.indexOf(conn);
        if (index > -1) {
            this.connections.splice(index, 1);
        }
        
        if (this.connections.length === 0 && !this.isHost) {
            this.updateConnectionStatus('Déconnecté', '#ff4757');
            document.getElementById('roomCode').textContent = '-';
        }
    }

    handleMessage(data, conn) {
        console.log('Message reçu:', data);

        switch(data.type) {
            case 'welcome':
                console.log('Bienvenue dans la partie!', data);
                break;

            case 'playerJoin':
                if (window.lobbyManager) {
                    window.lobbyManager.onPlayerJoined(data.player);
                }
                
                // Si on est l'hôte, informer les autres joueurs
                if (this.isHost) {
                    this.broadcastToOthers({
                        type: 'playerJoin',
                        player: data.player
                    }, conn);
                }
                break;

            case 'playerReady':
                if (window.lobbyManager) {
                    window.lobbyManager.onPlayerReadyChanged(data.playerId, data.ready);
                }
                
                // Relayer aux autres joueurs
                if (this.isHost) {
                    this.broadcastToOthers(data, conn);
                }
                break;

            case 'chat':
                if (window.lobbyManager) {
                    window.lobbyManager.addChatMessage(data.message, data.author);
                }
                
                // Relayer le message
                if (this.isHost) {
                    this.broadcastToOthers(data, conn);
                }
                break;

            case 'startGame':
                if (window.lobbyManager) {
                    window.lobbyManager.startGame();
                }
                break;

            case 'gameData':
                // Données de jeu (positions, actions, etc.)
                if (window.gameManager) {
                    window.gameManager.handleNetworkData(data);
                }
                break;
        }
    }

    sendToConnection(conn, data) {
        if (conn && conn.open) {
            conn.send(data);
        }
    }

    broadcast(data) {
        this.connections.forEach(conn => {
            this.sendToConnection(conn, data);
        });
    }

    broadcastToOthers(data, excludeConn) {
        this.connections.forEach(conn => {
            if (conn !== excludeConn) {
                this.sendToConnection(conn, data);
            }
        });
    }

    sendPlayerStatus(ready) {
        this.playerData.ready = ready;
        this.broadcast({
            type: 'playerReady',
            playerId: this.playerData.id,
            ready: ready
        });
    }

    sendChatMessage(message) {
        this.broadcast({
            type: 'chat',
            author: this.playerData.name,
            message: message
        });
    }

    sendGameData(gameData) {
        this.broadcast({
            type: 'gameData',
            data: gameData
        });
    }

    isConnected() {
        return this.connections.length > 0 || this.isHost;
    }

    updateConnectionStatus(status, color = '#00ff88') {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.color = color;
        }
    }

    showError(message) {
        if (window.lobbyManager) {
            window.lobbyManager.addChatMessage('❌ ' + message);
        }
        alert(message);
    }

    disconnect() {
        this.connections.forEach(conn => conn.close());
        this.connections = [];
        
        if (this.peer) {
            this.peer.disconnect();
        }
        
        this.isHost = false;
        this.roomCode = null;
        this.updateConnectionStatus('Déconnecté', '#ff4757');
        document.getElementById('roomCode').textContent = '-';
    }
}

// Initialisation
let networkManager;

// Attendre que le DOM soit chargé
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNetwork);
} else {
    initNetwork();
}

function initNetwork() {
    // Vérifier si PeerJS est disponible
    if (typeof Peer !== 'undefined') {
        networkManager = new NetworkManager();
        window.networkManager = networkManager;
        console.log('NetworkManager initialisé avec PeerJS');
    } else {
        console.warn('PeerJS non chargé. Chargement depuis CDN...');
        loadPeerJS();
    }
}

function loadPeerJS() {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    script.onload = () => {
        console.log('PeerJS chargé avec succès');
        networkManager = new NetworkManager();
        window.networkManager = networkManager;
    };
    script.onerror = () => {
        console.error('Impossible de charger PeerJS');
        // Créer un NetworkManager en mode simulation
        networkManager = new NetworkManager();
        window.networkManager = networkManager;
    };
    document.head.appendChild(script);
}
