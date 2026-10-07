/* ==================================
   ONGLET ADMINISTRATION - FOR2D ROYAL
   Gestion des parties en direct (multijoueur et bots),
   rejoindre en spawn direct et fermeture avec expulsion.
   ================================== */

export class LobbyAdmin {
    constructor() {
        this.games = [];
        this.timer = null;
        this.active = false;
        this.init();
    }

    init() {
        document.addEventListener('for2d:view', (ev) => {
            if (ev.detail?.view === 'admin') {
                this.onOpen();
            } else {
                this.onClose();
            }
        });

        const refreshBtn = document.getElementById('adminRefreshBtn');
        refreshBtn?.addEventListener('click', () => {
            this.refreshGames();
            window.SFX?.play?.('click');
        });

        const container = document.getElementById('adminGamesList');
        container?.addEventListener('click', (ev) => {
            const btn = ev.target.closest('button[data-admin-action]');
            if (!btn) return;
            const action = btn.dataset.adminAction;
            const roomCode = btn.dataset.roomCode;
            if (action === 'join') {
                this.joinGame(roomCode);
            } else if (action === 'close') {
                this.closeGame(roomCode);
            }
        });

        // Liaison avec les callbacks de NetworkManager
        if (window.networkManager) {
            window.networkManager.onAdminGames = (games) => this.renderGames(games);
            window.networkManager.onAdminGameClosed = (roomCode, message) => {
                window.lobbyManager?.showToast?.(message || `Partie ${roomCode} fermée.`);
                this.refreshGames();
            };
        }
    }

    onOpen() {
        const net = window.networkManager;
        const isAdmin = Boolean(net?.isAuthenticated?.() && net?.isAdmin);
        if (!isAdmin) {
            window.FOR2D_STORE?.show('lobby');
            window.lobbyManager?.showToast?.('Accès réservé aux administrateurs.');
            return;
        }
        this.active = true;
        this.refreshGames();
        clearInterval(this.timer);
        this.timer = setInterval(() => {
            if (this.active) this.refreshGames(true);
        }, 3000);
    }

    onClose() {
        this.active = false;
        clearInterval(this.timer);
    }

    refreshGames(silent = false) {
        const net = window.networkManager;
        if (!net?.isConnected?.() || !net?.isAdmin || !net?.isAuthenticated?.()) {
            this.renderEmpty('Accès réservé aux administrateurs.');
            if (window.FOR2D_STORE?.view === 'admin') {
                window.FOR2D_STORE.show('lobby');
            }
            return;
        }
        net.getAdminGames?.();
    }

    joinGame(roomCode) {
        if (!roomCode) return;
        const net = window.networkManager;
        if (!net?.isAuthenticated?.() || !net?.isAdmin) {
            window.lobbyManager?.showToast?.('Accès réservé aux administrateurs.');
            return;
        }
        const game = this.games.find(g => g.roomCode === roomCode);
        const map = game?.mapId || 'default';
        const mode = game?.mode || 'solo';
        const seed = game?.seed || '';

        window.SFX?.play?.('launch');
        window.lobbyManager?.showToast?.(`Connexion à la partie ${roomCode}...`);

        const myId = window.networkManager?.getPlayerId?.() || `admin_${Date.now()}`;
        const myName = window.networkManager?.getPlayerName?.() || 'Admin';

        const config = {
            mode,
            mapId: map,
            modeName: mode.toUpperCase(),
            teamSize: 1,
            isMultiplayer: true,
            roomCode,
            seed,
            mySlot: 99,
            myPlayerId: myId,
            myTeam: 99,
            isHost: false,
            isAdmin: true,
            adminJoin: true
        };

        try {
            sessionStorage.setItem('for2d-game-mode', JSON.stringify(config));
            localStorage.setItem('for2d-game-mode', JSON.stringify(config));
        } catch { /* ignore */ }

        setTimeout(() => {
            window.location.href = `game.html?room=${encodeURIComponent(roomCode)}&adminJoin=1&pid=${encodeURIComponent(myId)}&name=${encodeURIComponent(myName)}&mode=${encodeURIComponent(mode)}&map=${encodeURIComponent(map)}&seed=${encodeURIComponent(seed)}`;
        }, 350);
    }

    closeGame(roomCode) {
        if (!roomCode) return;
        const net = window.networkManager;
        if (!net?.isAuthenticated?.() || !net?.isAdmin) {
            window.lobbyManager?.showToast?.('Accès réservé aux administrateurs.');
            return;
        }
        if (!confirm(`Confirmer la fermeture de la partie #${roomCode} ?\nTous les joueurs seront expulsés.`)) return;
        window.networkManager?.closeAdminGame?.(roomCode);
    }

    renderGames(games = []) {
        this.games = Array.isArray(games) ? games : [];
        const total = this.games.length;
        const multi = this.games.filter(g => !g.isBotGame).length;
        const bots = this.games.filter(g => g.isBotGame).length;
        const players = this.games.reduce((acc, g) => acc + (g.playersCount || 0), 0);

        const elTotal = document.getElementById('adminStatTotal');
        const elMulti = document.getElementById('adminStatMulti');
        const elBots = document.getElementById('adminStatBots');
        const elPlayers = document.getElementById('adminStatPlayers');
        if (elTotal) elTotal.textContent = total;
        if (elMulti) elMulti.textContent = multi;
        if (elBots) elBots.textContent = bots;
        if (elPlayers) elPlayers.textContent = players;

        const container = document.getElementById('adminGamesList');
        if (!container) return;

        if (total === 0) {
            this.renderEmpty('Aucune partie en cours sur le serveur.');
            return;
        }

        container.innerHTML = this.games.map(g => {
            const isBot = g.isBotGame;
            const modeLabel = (g.mode || 'solo').toUpperCase();
            const mapLabel = g.mapId === 'duel-two-towns' ? 'Duel 2 Villes' : 'Classique';
            const durationM = Math.floor((g.duration || 0) / 60);
            const durationS = (g.duration || 0) % 60;
            const durationStr = `${durationM}:${durationS.toString().padStart(2, '0')}`;
            const playerNames = (g.players || []).map(p => {
                const badge = p.isHost ? ' 👑' : '';
                const adm = p.isAdmin ? ' [Admin]' : '';
                return `<span class="admin-player-pill" title="${p.id}">${escapeHtml(p.name)}${badge}${adm}</span>`;
            }).join(' ');

            return `
                <div class="admin-game-row ${isBot ? 'is-bot-game' : 'is-multi-game'}">
                    <div class="admin-col-room">
                        <span class="admin-game-type-badge ${isBot ? 'badge-bot' : 'badge-multi'}">
                            ${isBot ? '🤖 BOTS' : '🎮 MULTI'}
                        </span>
                        <span class="admin-room-code">#${escapeHtml(g.roomCode)}</span>
                    </div>
                    <div class="admin-col-mode">
                        <span class="admin-mode-name">${modeLabel}</span>
                        <span class="admin-map-sub">${mapLabel}</span>
                    </div>
                    <div class="admin-col-players">
                        <span class="admin-players-count">${g.playersCount} joueur(s)</span>
                        <div class="admin-player-pills-list">${playerNames || 'Aucun'}</div>
                    </div>
                    <div class="admin-col-time">
                        <span class="admin-time-val">⏱️ ${durationStr}</span>
                    </div>
                    <div class="admin-col-actions">
                        <button type="button" class="admin-btn admin-btn-join" data-admin-action="join" data-room-code="${escapeHtml(g.roomCode)}" title="Rejoindre et spawn directement sur la carte">
                            <span>🎮 Rejoindre</span>
                        </button>
                        <button type="button" class="admin-btn admin-btn-close" data-admin-action="close" data-room-code="${escapeHtml(g.roomCode)}" title="Fermer la partie et expulser les joueurs">
                            <span>❌ Fermer</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderEmpty(msg) {
        const container = document.getElementById('adminGamesList');
        if (!container) return;
        container.innerHTML = `
            <div class="admin-empty-state">
                <span class="admin-empty-icon">🛡️</span>
                <p class="admin-empty-text">${escapeHtml(msg)}</p>
                <button type="button" class="shop-filter" id="adminEmptyRefreshBtn">Actualiser</button>
            </div>
        `;
        document.getElementById('adminEmptyRefreshBtn')?.addEventListener('click', () => this.refreshGames());
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    window.FOR2D_ADMIN = new LobbyAdmin();
});
