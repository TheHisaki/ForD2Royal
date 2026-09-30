/* ==================================
   GESTION DU LOBBY - FOR2D ROYAL
   ================================== */

const BOT_TEAMMATE_NAMES = ['Agent Banane', 'Robo-Gamer', 'PiouPiou'];

class LobbyManager {
    constructor() {
        this.players = [
            { id: 1, name: 'Joueur 1', ready: false, isLocal: true }
        ];
        this.localPlayerReady = false;
        this.currentGameMode = 'SOLO';
        this.teamSize = 1;
        this._pendingMode = 'solo';
        this.botsEnabled = true;

        // Charger le dernier mode choisi
        try {
            const saved = localStorage.getItem('for2d-game-mode');
            if (saved) {
                const cfg = JSON.parse(saved);
                if (cfg.modeName) this.currentGameMode = cfg.modeName;
                if (cfg.teamSize) this.teamSize = cfg.teamSize;
                if (cfg.mode) this._pendingMode = cfg.mode;
                if (typeof cfg.bots === 'boolean') this.botsEnabled = cfg.bots;
            }
        } catch { /* parse error */ }

        // Cohérence absolue entre le mode et la taille d'équipe
        const mode = (this.currentGameMode || '').toUpperCase();
        if (mode === 'DUO') this.teamSize = 2;
        else if (mode === 'TRIO') this.teamSize = 3;
        else if (mode === 'ESCOUADE' || mode === 'SECTION') this.teamSize = 4;
        else this.teamSize = 1;

        this.init();
    }

    init() {
        this.syncBotTeammates();
        this.saveGameConfig();
        this.setupEventListeners();
        this.setupSounds();
        this.updateUI();
        this.startAnimations();
    }

    // Effets sonores de l'interface (window.SFX vient du module js/sfx.js).
    // Toujours avec "?." : si le module ne charge pas, le lobby marche quand même.
    setupSounds() {
        // Clic sur n'importe quel bouton (sauf ceux qui ont leur propre son)
        document.addEventListener('click', (e) => {
            if (!(e.target instanceof Element)) return;
            const btn = e.target.closest('button');
            if (!btn || btn.matches('#readyBtn, .change-mode-btn, #soundToggle')) return;
            window.SFX?.play('click');
        });

        // Survol : un seul son quand on entre dans un bouton (pas au tactile)
        document.addEventListener('pointerover', (e) => {
            if (e.pointerType === 'touch' || !(e.target instanceof Element)) return;
            const btn = e.target.closest('button');
            if (!btn || btn.disabled) return;
            // On bouge juste entre deux éléments du même bouton : pas de son
            if (e.relatedTarget instanceof Node && btn.contains(e.relatedTarget)) return;
            window.SFX?.play('hover');
        });

        // Bouton couper / activer le son
        const soundToggle = document.getElementById('soundToggle');
        if (!soundToggle) return;

        soundToggle.addEventListener('click', () => {
            if (!window.SFX) return;
            const muted = window.SFX.toggleMute();
            this.updateSoundButton(muted);
            if (!muted) window.SFX.play('click');
        });

        // État initial ; le module peut (rarement) s'exécuter après DOMContentLoaded,
        // donc repli sur la valeur sauvegardée puis nouvelle synchro au chargement complet
        this.updateSoundButton(this.isSoundMuted());
        window.addEventListener('load', () => this.updateSoundButton(this.isSoundMuted()), { once: true });
    }

    isSoundMuted() {
        if (window.SFX) return window.SFX.isMuted();
        try {
            return localStorage.getItem('for2d-sfx-muted') === '1';
        } catch (err) {
            return false;
        }
    }

    updateSoundButton(muted) {
        const soundToggle = document.getElementById('soundToggle');
        if (!soundToggle) return;
        const label = muted ? 'Activer le son' : 'Couper le son';
        this.setIcon(soundToggle, muted ? 'sound-off' : 'sound-on');
        soundToggle.setAttribute('aria-label', label);
        soundToggle.setAttribute('title', label);
        soundToggle.setAttribute('aria-pressed', String(muted));
        soundToggle.classList.toggle('is-muted', muted);
    }

    // Change l'icône SVG d'un bouton (emplacement [data-icon], rempli par js/lobby-icons.js).
    // Si le module n'est pas encore chargé, il posera la bonne icône à son démarrage.
    setIcon(btn, name) {
        const slot = btn?.querySelector('[data-icon]');
        if (!slot) return;
        slot.dataset.icon = name;
        window.FOR2D_ICONS?.set(slot, name);
    }

    setupEventListeners() {
        // Bouton Ready
        const readyBtn = document.getElementById('readyBtn');
        if (readyBtn) {
            readyBtn.addEventListener('click', () => this.toggleReady());
        }

        // Navigation
        const navBtns = document.querySelectorAll('.nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleNavigation(e.target));
        });

        // Boutons réseau
        const hostBtn = document.getElementById('hostBtn');
        const joinBtn = document.getElementById('joinBtn');
        
        if (hostBtn) {
            hostBtn.addEventListener('click', () => this.handleHostGame());
        }
        
        if (joinBtn) {
            joinBtn.addEventListener('click', () => this.handleJoinGame());
        }

        // Bouton rejoindre salle
        const joinRoomBtn = document.getElementById('joinRoomBtn');
        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => this.joinRoom());
        }

        // Input chat
        const chatInput = document.querySelector('.chat-input');
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && chatInput.value.trim()) {
                    this.sendChatMessage(chatInput.value);
                    chatInput.value = '';
                }
            });
        }

        // Changer de mode : ouvrir le sélecteur
        const changeModeBtn = document.querySelector('.change-mode-btn');
        if (changeModeBtn) {
            changeModeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openModeSelector();
            });
        }
        const gameModeSection = document.querySelector('.game-mode-section');
        if (gameModeSection) {
            gameModeSection.style.cursor = 'pointer';
            gameModeSection.addEventListener('click', () => this.openModeSelector());
        }

        // Mode selector
        this.setupModeSelector();

        // Remplissage / Jouer avec des bots
        const fillToggle = document.getElementById('botFillToggle') || document.querySelector('.fill-toggle');
        if (fillToggle) {
            fillToggle.addEventListener('click', () => {
                this.toggleBotTeammates();
            });
        }

        // Menu ☰ : panneau des paramètres (les interrupteurs sont gérés par js/settings.js)
        const menuBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        if (menuBtn && settingsPanel) {
            const setOpen = (open) => {
                if (settingsPanel.hidden === !open) return;
                settingsPanel.hidden = !open;
                if (open) settingsPanel.querySelector('[data-setting]')?.focus();
                else menuBtn.focus(); // on rend le focus au bouton qui a ouvert le panneau
            };
            menuBtn.addEventListener('click', () => setOpen(settingsPanel.hidden));
            settingsPanel.addEventListener('click', (e) => {
                // Fond sombre ou croix : fermeture
                if (e.target === settingsPanel || e.target.closest('[data-settings-close]')) setOpen(false);
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && !settingsPanel.hidden) setOpen(false);
            });
        }

        // "+" sur une place vide : créer une partie pour inviter des amis
        document.querySelectorAll('.invite-btn').forEach(btn => {
            btn.addEventListener('click', () => this.handleHostGame());
        });

        // Boutons mute
        const muteBtns = document.querySelectorAll('.mute-btn');
        muteBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => this.toggleMute(index));
        });
    }

    toggleReady() {
        this.localPlayerReady = !this.localPlayerReady;
        const readyBtn = document.getElementById('readyBtn');

        // Le style est géré par la classe CSS .is-ready
        readyBtn.classList.toggle('is-ready', this.localPlayerReady);
        readyBtn.querySelector('.ready-text').textContent = this.localPlayerReady ? 'ANNULER' : 'PRÊT';
        this.players[0].ready = this.localPlayerReady;
        this.addChatMessage(this.localPlayerReady ? 'Vous êtes prêt !' : 'Vous n\'êtes plus prêt.');
        window.SFX?.play(this.localPlayerReady ? 'ready' : 'unready');

        this.updatePlayerStatus(0, this.localPlayerReady);

        // Tout le monde est prêt : on lance la partie
        if (this.localPlayerReady) this.startGame();
        
        // Notifier le réseau si connecté
        if (window.networkManager && window.networkManager.isConnected()) {
            window.networkManager.sendPlayerStatus(this.localPlayerReady);
        }
    }

    updatePlayerStatus(slotIndex, ready) {
        const slots = document.querySelectorAll('.player-slot');
        if (slots[slotIndex]) {
            const statusElement = slots[slotIndex].querySelector('.player-status');
            const platformElement = slots[slotIndex].querySelector('.player-platform');
            
            if (statusElement) {
                if (ready) {
                    statusElement.textContent = 'Prêt';
                    statusElement.className = 'player-status ready';
                    platformElement?.classList.add('active');
                } else {
                    statusElement.textContent = 'Pas prêt';
                    statusElement.className = 'player-status not-ready';
                    platformElement?.classList.remove('active');
                }
            }
        }
    }

    handleNavigation(target) {
        const button = target.closest?.('.nav-btn') || target;
        const view = button.dataset.view || 'lobby';

        // Ajouter l'animation
        button.style.animation = 'pulse 0.3s ease';
        setTimeout(() => {
            button.style.animation = '';
        }, 300);

        // Tous les onglets sont des écrans gérés par js/lobby-store.js
        // (il synchronise aussi l'onglet actif et l'adresse #casier, #boutique, #passe...)
        if (window.FOR2D_STORE) window.FOR2D_STORE.show(view);
        else if (view !== 'lobby') this.showToast(`${button.textContent.trim()} : chargement...`);
    }

    /* ===== MODE SELECTOR ===== */

    setupModeSelector() {
        this.botsEnabled = true; // Bots always on for now
        this._pendingMode = this.currentGameMode.toLowerCase();

        const overlay = document.getElementById('modeSelector');
        if (!overlay) return;

        // Close button
        const closeBtn = document.getElementById('modeCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModeSelector());

        // Click outside panel to close
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.closeModeSelector();
        });

        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.hidden) this.closeModeSelector();
        });

        // Mode cards
        const cards = overlay.querySelectorAll('.mode-card');
        cards.forEach(card => {
            card.addEventListener('click', () => {
                if (card.classList.contains('is-locked')) return;
                this.selectMode(card.dataset.mode);
            });
            card.addEventListener('keydown', (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && !card.classList.contains('is-locked')) {
                    e.preventDefault();
                    this.selectMode(card.dataset.mode);
                }
            });
        });

        // Bots toggle (en cours de développement - toujours actif)
        const botsToggle = document.getElementById('modeBotsToggle');
        const botsRow = document.getElementById('modeOptBots');
        const onBotsAttempt = (e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            this.showToast('Mode sans bots en cours de développement ! Actuellement, seul le jeu avec des bots est disponible. 🤖');
            window.SFX?.play('click');
        };
        if (botsToggle) {
            botsToggle.disabled = false;
            botsToggle.addEventListener('click', onBotsAttempt);
        }
        if (botsRow) {
            botsRow.style.cursor = 'pointer';
            botsRow.addEventListener('click', onBotsAttempt);
        }

        // Confirm button
        const confirmBtn = document.getElementById('modeConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmMode());
        }
    }

    openModeSelector() {
        const overlay = document.getElementById('modeSelector');
        if (!overlay) return;
        this._pendingMode = this.currentGameMode.toLowerCase();
        // Map ESCOUADE -> section for the selector
        if (this._pendingMode === 'escouade') this._pendingMode = 'section';

        overlay.hidden = false;
        // Force reflow before animation
        void overlay.offsetWidth;
        overlay.classList.add('is-open');
        this.selectMode(this._pendingMode);
        window.SFX?.play('click');
    }

    closeModeSelector() {
        const overlay = document.getElementById('modeSelector');
        if (!overlay) return;
        overlay.classList.remove('is-open');
        window.SFX?.play('click');
        setTimeout(() => { overlay.hidden = true; }, 300);
    }

    selectMode(mode) {
        this._pendingMode = mode;
        const modeMap = { solo: 'SOLO', duo: 'DUO', trio: 'TRIO', section: 'ESCOUADE' };
        const teamSizes = { solo: 1, duo: 2, trio: 3, section: 4 };

        this.currentGameMode = modeMap[mode] || 'SOLO';
        this.teamSize = teamSizes[mode] || 1;
        this.botsEnabled = true;

        const overlay = document.getElementById('modeSelector');
        if (overlay) {
            // Update card selection
            overlay.querySelectorAll('.mode-card').forEach(card => {
                const selected = card.dataset.mode === mode;
                card.classList.toggle('is-selected', selected);
                card.setAttribute('aria-pressed', String(selected));
            });
        }

        window.SFX?.play('hover');
        this.updateModeOptions(mode);
        this.updateModeFooter();
        this.syncBotTeammates();
        this.saveGameConfig();
        this.updateUI();
    }

    updateModeOptions(mode) {
        // Bots are always enabled for all modes (real players coming soon)
        this.botsEnabled = true;
    }

    updateModeFooter() {
        const nameEl = document.getElementById('modeSelectedName');
        const detailEl = document.getElementById('modeSelectedDetail');
        if (!nameEl || !detailEl) return;

        const modeNames = { solo: 'SOLO', duo: 'DUO', trio: 'TRIO', section: 'SECTION' };
        const modePlayers = { solo: '1 joueur', duo: '2 joueurs', trio: '3 joueurs', section: '4 joueurs' };
        const teamSizes = { solo: 1, duo: 2, trio: 3, section: 4 };

        nameEl.textContent = modeNames[this._pendingMode] || 'SOLO';
        const ts = teamSizes[this._pendingMode] || 1;
        const teamText = ts > 1 ? ` · Équipe de ${ts}` : '';
        detailEl.textContent = `${modePlayers[this._pendingMode] || '1 joueur'}${teamText} · Avec bots`;
    }

    toggleBotTeammates() {
        // Le mode sans bots est en cours de développement : les bots restent activés
        this.botsEnabled = true;
        this.showToast('Mode multijoueur sans bots en cours de développement ! Seul le jeu avec bots est disponible pour l\'instant. 🤖');
        window.SFX?.play('click');
        this.syncBotTeammates();
        this.saveGameConfig();
        this.updateUI();
    }

    syncBotTeammates() {
        const local = this.players[0] || { id: 1, name: 'Joueur 1', ready: this.localPlayerReady, isLocal: true };
        local.ready = this.localPlayerReady;

        if (this.botsEnabled && this.teamSize > 1) {
            const list = [local];
            const needed = this.teamSize - 1;
            for (let i = 0; i < needed; i++) {
                list.push({
                    id: `bot_${i + 2}`,
                    name: BOT_TEAMMATE_NAMES[i] || `Bot ${i + 2}`,
                    ready: true, // Les bots sont toujours prêts !
                    isLocal: false,
                    isBot: true
                });
            }
            this.players = list;
        } else {
            this.players = [local];
        }
    }

    saveGameConfig() {
        try {
            const modeMap = { SOLO: 'solo', DUO: 'duo', TRIO: 'trio', ESCOUADE: 'section' };
            const m = modeMap[this.currentGameMode] || 'solo';
            localStorage.setItem('for2d-game-mode', JSON.stringify({
                mode: m,
                modeName: this.currentGameMode,
                teamSize: this.teamSize,
                bots: this.botsEnabled
            }));
        } catch { /* quota dépassé */ }
    }

    confirmMode() {
        const modeMap = { solo: 'SOLO', duo: 'DUO', trio: 'TRIO', section: 'ESCOUADE' };
        const teamSizes = { solo: 1, duo: 2, trio: 3, section: 4 };
        this.currentGameMode = modeMap[this._pendingMode] || 'SOLO';
        this.teamSize = teamSizes[this._pendingMode] || 1;
        this.botsEnabled = true;
        window.SFX?.play('mode');

        this.syncBotTeammates();
        this.saveGameConfig();
        this.updateUI();
        const display = this.currentGameMode === 'ESCOUADE' ? 'SECTION' : this.currentGameMode;
        this.addChatMessage(`Mode de jeu : ${display} (équipe de ${this.teamSize})`, 'Système');
        this.closeModeSelector();
    }

    cycleGameMode() {
        // Kept as fallback but no longer the primary method
        this.openModeSelector();
    }

    // Petite notification temporaire en haut de l'écran
    showToast(message) {
        let toast = document.getElementById('lobbyToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'lobbyToast';
            toast.className = 'lobby-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('visible');
        window.SFX?.play('toast');
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
    }

    handleHostGame() {
        const hostBtn = document.getElementById('hostBtn');
        const joinBtn = document.getElementById('joinBtn');
        const joinForm = document.getElementById('joinForm');
        
        hostBtn.classList.add('active');
        joinBtn.classList.remove('active');
        joinForm.style.display = 'none';
        
        // Créer une partie
        if (window.networkManager) {
            window.networkManager.createRoom();
        }
        
        this.addChatMessage('Création d\'une partie en réseau local...');
    }

    handleJoinGame() {
        const hostBtn = document.getElementById('hostBtn');
        const joinBtn = document.getElementById('joinBtn');
        const joinForm = document.getElementById('joinForm');
        
        hostBtn.classList.remove('active');
        joinBtn.classList.add('active');
        joinForm.style.display = 'flex';
        
        this.addChatMessage('Entrez le code de la salle pour rejoindre.');
    }

    joinRoom() {
        const roomInput = document.getElementById('roomInput');
        const roomCode = roomInput.value.trim().toUpperCase();
        
        if (roomCode.length === 6) {
            if (window.networkManager) {
                window.networkManager.joinRoom(roomCode);
                this.addChatMessage(`Tentative de connexion à la salle ${roomCode}...`);
            }
        } else {
            this.addChatMessage('Code de salle invalide (6 caractères requis).');
        }
    }

    addChatMessage(message, author = 'Party') {
        const chatMessages = document.querySelector('.chat-messages');
        if (!chatMessages) return;
        
        const time = new Date().toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message';

        // textContent (et pas innerHTML) : un message reçu du réseau ne peut pas injecter de HTML
        const parts = [
            ['chat-time', time],
            ['chat-author', `${author} : `],
            ['chat-text', message]
        ];
        parts.forEach(([className, text]) => {
            const span = document.createElement('span');
            span.className = className;
            span.textContent = text;
            messageElement.appendChild(span);
        });

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    sendChatMessage(message) {
        this.addChatMessage(message, 'Vous');
        window.SFX?.play('chat');
        
        // Envoyer via le réseau si connecté
        if (window.networkManager && window.networkManager.isConnected()) {
            window.networkManager.sendChatMessage(message);
        }
    }

    toggleMute(playerIndex) {
        const muteBtns = document.querySelectorAll('.mute-btn');
        const btn = muteBtns[playerIndex];
        if (!btn) return;

        // État porté par aria-pressed (l'icône est un SVG, plus un émoji à comparer)
        const muted = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(muted));
        btn.setAttribute('aria-label', muted ? 'Réactiver le micro' : 'Couper le micro');
        this.setIcon(btn, muted ? 'sound-off' : 'sound-on');
        if (muted) {
            this.addChatMessage(`${this.players[playerIndex].name} est maintenant muet.`);
        } else {
            this.addChatMessage(`${this.players[playerIndex].name} n'est plus muet.`);
        }
    }

    updateUI() {
        // Mettre à jour l'affichage des joueurs
        const slots = document.querySelectorAll('.player-slot');
        
        // Réinitialiser tous les slots à "En attente"
        slots.forEach((slot, index) => {
            if (index >= this.players.length) {
                const nameElement = slot.querySelector('.player-name');
                const statusElement = slot.querySelector('.player-status');
                const muteBtn = slot.querySelector('.mute-btn');
                
                if (nameElement) nameElement.textContent = 'Inviter';
                if (statusElement) {
                    statusElement.textContent = '-';
                    statusElement.className = 'player-status';
                }
                if (muteBtn) muteBtn.style.display = 'none';
                
                slot.classList.add('is-empty');
                slot.querySelector('.player-platform')?.classList.remove('active');
            }
        });
        
        // Afficher les joueurs présents
        this.players.forEach((player, index) => {
            if (slots[index]) {
                const nameElement = slots[index].querySelector('.player-name');
                const statusElement = slots[index].querySelector('.player-status');
                const muteBtn = slots[index].querySelector('.mute-btn');
                
                if (nameElement) nameElement.textContent = player.name;
                if (statusElement) {
                    statusElement.textContent = player.ready ? 'Prêt' : 'Pas prêt';
                    statusElement.className = player.ready ? 'player-status ready' : 'player-status not-ready';
                }
                if (muteBtn) muteBtn.style.display = player.isBot ? 'none' : '';
                
                slots[index].classList.remove('is-empty');
                
                if (player.ready) {
                    slots[index].querySelector('.player-platform')?.classList.add('active');
                } else {
                    slots[index].querySelector('.player-platform')?.classList.remove('active');
                }
            }
        });
        
        // Monter les skins des coéquipiers si nécessaire
        window.mountLobbySkins?.();

        // N'afficher que le nombre de places du mode (SOLO = 1 ... ESCOUADE = 4),
        // sans jamais cacher un joueur déjà présent
        const modeSizes = { SOLO: 1, DUO: 2, TRIO: 3, ESCOUADE: 4 };
        const visibleSlots = Math.max(modeSizes[this.currentGameMode] || 4, this.players.length);
        slots.forEach((slot, index) => {
            slot.classList.toggle('is-hidden', index >= visibleSlots);
        });
        const playersArea = document.querySelector('.players-area');
        if (playersArea) {
            playersArea.classList.toggle('is-solo', visibleSlots === 1);
            playersArea.classList.toggle('is-duo', visibleSlots === 2);
            playersArea.classList.toggle('is-trio', visibleSlots === 3);
            playersArea.classList.toggle('is-section', visibleSlots >= 4);
        }

        // Nombre réel de joueurs dans le groupe (en haut à droite)
        const partyCount = document.getElementById('partyCount');
        if (partyCount) {
            const n = this.players.length;
            partyCount.textContent = String(n);
            partyCount.setAttribute('aria-label', `${n} joueur${n > 1 ? 's' : ''} dans le groupe`);
        }

        // Mettre à jour le bouton Jouer avec des bots
        const botToggle = document.getElementById('botFillToggle') || document.querySelector('.fill-toggle');
        if (botToggle) {
            botToggle.setAttribute('aria-pressed', String(this.botsEnabled));
            botToggle.textContent = this.botsEnabled ? 'Activé' : 'Désactivé';
            botToggle.classList.toggle('active', this.botsEnabled);
        }

        // Mettre à jour le mode de jeu
        const modeDisplay = document.querySelector('.mode-display');
        if (modeDisplay) {
            const displayName = this.currentGameMode === 'ESCOUADE' ? 'SECTION' : this.currentGameMode;
            modeDisplay.textContent = displayName;
        }
    }

    startAnimations() {
        // Les animations (personnages, plateformes) sont maintenant en CSS :
        // plus fluide que des setInterval et respecte "réduire les animations".
    }

    // Méthodes appelées par le NetworkManager
    onPlayerJoined(playerData) {
        // Ajouter le nouveau joueur
        this.players.push({
            id: playerData.id,
            name: playerData.name,
            ready: false,
            isLocal: false
        });
        
        this.addChatMessage(`${playerData.name} a rejoint la partie.`);
        
        // Mettre à jour le mode de jeu si nécessaire
        if (this.players.length > 1 && this.currentGameMode === 'SOLO') {
            this.currentGameMode = 'DUO';
        }
        if (this.players.length > 2) {
            this.currentGameMode = this.players.length === 3 ? 'TRIO' : 'ESCOUADE';
        }
        
        this.updateUI();
    }

    onPlayerLeft(playerId) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            this.addChatMessage(`${player.name} a quitté la partie.`);
            this.players = this.players.filter(p => p.id !== playerId);
            
            // Mettre à jour le mode de jeu
            if (this.players.length === 1) {
                this.currentGameMode = 'SOLO';
            } else if (this.players.length === 2) {
                this.currentGameMode = 'DUO';
            }
            
            this.updateUI();
        }
    }

    onPlayerReadyChanged(playerId, ready) {
        const playerIndex = this.players.findIndex(p => p.id === playerId);
        if (playerIndex !== -1) {
            this.players[playerIndex].ready = ready;
            this.updatePlayerStatus(playerIndex, ready);
        }
    }

    updatePlayerList() {
        // Méthode supprimée - updateUI() est utilisée à la place
        this.updateUI();
    }

    startGame() {
        // Vérifier que tous les joueurs sont prêts
        const allReady = this.players.every(p => p.ready);
        
        if (allReady) {
            this.addChatMessage('Démarrage de la partie...');
            
            // S'assurer que la configuration de mode est bien persistée
            this.saveGameConfig();

            // Petit délai pour laisser le temps d'annuler
            clearTimeout(this.startTimer);
            // Son joué maintenant : la navigation vers game.html le couperait
            window.SFX?.play('launch');
            this.startTimer = setTimeout(() => {
                if (this.localPlayerReady) window.location.href = 'game.html';
            }, 1500);
        } else {
            this.addChatMessage('Tous les joueurs doivent être prêts!');
        }
    }
}

// Initialisation
let lobbyManager;

document.addEventListener('DOMContentLoaded', () => {
    lobbyManager = new LobbyManager();
    window.lobbyManager = lobbyManager;
});
