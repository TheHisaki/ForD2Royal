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
        // Deux options distinctes :
        // - botsEnabled = « Remplir l'équipe avec des bots » (places vides de MON équipe)
        // - fillMatch   = « Remplir la partie avec des bots » (sinon : file d'attente avec de vrais joueurs)
        this.botsEnabled = true;
        this.fillMatch = true;
        this.autoRoom = false; // salle créée toute seule pour la file d'attente

        // Charger le dernier mode choisi
        try {
            const saved = localStorage.getItem('for2d-game-mode');
            if (saved) {
                const cfg = JSON.parse(saved);
                if (cfg.modeName) this.currentGameMode = cfg.modeName;
                if (cfg.teamSize) this.teamSize = cfg.teamSize;
                if (cfg.mode) this._pendingMode = cfg.mode;
                if (typeof cfg.fillTeam === 'boolean') this.botsEnabled = cfg.fillTeam;
                if (typeof cfg.fillMatch === 'boolean') this.fillMatch = cfg.fillMatch;
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
        this.setupWelcomeModal();
        this.updateBotFillUI();
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
        const roomInput = document.getElementById('roomInput');
        if (joinRoomBtn) {
            joinRoomBtn.addEventListener('click', () => this.joinRoom());
        }
        if (roomInput) {
            roomInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.joinRoom();
            });
        }

        // Actions de groupe (copie de code, lien, quitter)
        document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
            const code = window.networkManager?.roomCode;
            if (code) window.networkManager.copyCodeToClipboard(code);
        });

        document.getElementById('copyLinkBtn')?.addEventListener('click', () => {
            const code = window.networkManager?.roomCode;
            if (code) window.networkManager.copyInviteLinkToClipboard(code);
        });

        document.getElementById('leavePartyBtn')?.addEventListener('click', () => {
            window.networkManager?.leaveRoom();
        });

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

        // Accueil : « Remplir l'équipe avec des bots » (au-dessus du bouton Prêt)
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

        // Annuler la recherche en file d'attente (matchmaking)
        document.getElementById('mmCancelBtn')?.addEventListener('click', () => {
            if (this.localPlayerReady) {
                this.toggleReady();
            }
            this.handleMatchmakingStatus({ state: 'idle' });
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

        // Si on annule, fermer immédiatement l'overlay de matchmaking
        if (!this.localPlayerReady) {
            this.handleMatchmakingStatus({ state: 'idle' });
        }

        const net = window.networkManager;
        if (net && net.isConnected() && net.roomCode) {
            // Dans une salle : c'est le serveur qui lance la partie quand tout le monde est prêt
            // (tout de suite si la partie est remplie de bots, sinon file d'attente)
            net.sendPlayerStatus(this.localPlayerReady);
            // Salle créée seulement pour la file d'attente : on la quitte en annulant
            if (!this.localPlayerReady && this.autoRoom && this.getRealPartyPlayerCount() <= 1) {
                this.autoRoom = false;
                net.leaveRoom();
            }
        } else if (this.localPlayerReady && !this.fillMatch) {
            // Pas de bots dans la partie : il faut le serveur pour trouver d'autres équipes
            if (net && net.isConnected()) {
                this.autoRoom = true;
                net.readyAfterCreate = true;
                net.createRoom(this.currentGameMode.toLowerCase(), false, this.botsEnabled);
                this.handleMatchmakingStatus({ state: 'searching', teamsCount: 1, teamsNeeded: 2, mode: this.currentGameMode.toLowerCase() });
            } else {
                this.showToast('File d\'attente impossible hors ligne : active « Remplir la partie avec des bots ».');
                this.localPlayerReady = false;
                this.players[0].ready = false;
                readyBtn.classList.remove('is-ready');
                readyBtn.querySelector('.ready-text').textContent = 'PRÊT';
                this.updatePlayerStatus(0, false);
            }
        } else if (this.localPlayerReady) {
            // Hors ligne / Solo : on lance la partie
            this.startGame();
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

        // Deux interrupteurs : remplir l'équipe / remplir la partie (clic sur la ligne entière aussi)
        const bindSwitch = (rowId, toggleId, action) => {
            const row = document.getElementById(rowId);
            const toggle = document.getElementById(toggleId);
            const onClick = (e) => {
                e?.preventDefault?.();
                e?.stopPropagation?.();
                if (toggle?.disabled) return;
                action();
            };
            if (toggle) {
                toggle.disabled = false;
                toggle.addEventListener('click', onClick);
            }
            if (row) {
                row.style.cursor = 'pointer';
                row.addEventListener('click', onClick);
            }
        };
        bindSwitch('modeOptFillTeam', 'modeFillTeamToggle', () => this.toggleBotTeammates());
        bindSwitch('modeOptFillMatch', 'modeFillMatchToggle', () => this.toggleFillMatch());

        // Confirm button
        const confirmBtn = document.getElementById('modeConfirmBtn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => this.confirmMode());
        }
    }

    getRealPartyPlayerCount() {
        if (window.networkManager?.roomCode && Array.isArray(window.networkManager?.roomPlayers) && window.networkManager.roomPlayers.length > 0) {
            return window.networkManager.roomPlayers.length;
        }
        return this.players.filter(p => !p.isBot).length || 1;
    }

    isCurrentPartyLeader() {
        if (!window.networkManager?.roomCode) return true;
        return Boolean(window.networkManager?.isHost);
    }

    updateLeaderPermissions() {
        const inParty = Boolean(window.networkManager?.roomCode);
        const isLeader = this.isCurrentPartyLeader();

        const section = document.getElementById('gameModeSection') || document.querySelector('.game-mode-section');
        const btn = document.getElementById('changeModeBtn') || document.querySelector('.change-mode-btn');

        if (section) {
            section.classList.toggle('is-disabled', inParty && !isLeader);
            section.title = (inParty && !isLeader) ? 'Seul le chef du groupe peut changer le mode de jeu' : 'Cliquer pour changer de mode';
        }
        if (btn) {
            if (inParty && !isLeader) {
                btn.disabled = true;
                btn.classList.add('is-disabled');
                btn.textContent = '👑 Chef uniquement';
                btn.title = 'Seul le chef du groupe peut changer le mode de jeu';
            } else {
                btn.disabled = false;
                btn.classList.remove('is-disabled');
                btn.textContent = 'Changer de mode';
                btn.title = 'Changer le mode de jeu';
            }
        }

        // Si le sélecteur est ouvert et qu'on n'est pas le chef, le fermer
        if (inParty && !isLeader) {
            const overlay = document.getElementById('modeSelector');
            if (overlay && !overlay.hidden) {
                this.closeModeSelector();
            }
        }
    }

    updateModeSelectorLockState() {
        const overlay = document.getElementById('modeSelector');
        if (!overlay) return;

        const partyCount = this.getRealPartyPlayerCount();
        const modeHierarchy = { solo: 1, duo: 2, trio: 3, section: 4 };

        overlay.querySelectorAll('.mode-card').forEach(card => {
            const mode = card.dataset.mode;
            const cap = modeHierarchy[mode] || 1;
            const isLocked = (cap < partyCount);

            card.classList.toggle('is-locked', isLocked);
            card.setAttribute('aria-disabled', String(isLocked));

            const lockEl = card.querySelector('.mode-card-lock .lock-text');
            if (lockEl) {
                if (isLocked) {
                    lockEl.textContent = `🔒 Min. ${partyCount} joueurs`;
                }
            }
        });
    }

    openModeSelector() {
        if (!this.isCurrentPartyLeader()) {
            this.showToast('Seul le chef du groupe peut changer le mode de jeu ! 👑');
            window.SFX?.play('click');
            return;
        }

        const overlay = document.getElementById('modeSelector');
        if (!overlay) return;
        this._pendingMode = this.currentGameMode.toLowerCase();
        // Map ESCOUADE -> section for the selector
        if (this._pendingMode === 'escouade') this._pendingMode = 'section';

        this.updateModeSelectorLockState();

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
        const partyCount = this.getRealPartyPlayerCount();
        const modeHierarchy = { solo: 1, duo: 2, trio: 3, section: 4 };
        if (modeHierarchy[mode] && modeHierarchy[mode] < partyCount) {
            const requiredName = partyCount === 2 ? 'Duo, Trio ou Section' : partyCount === 3 ? 'Trio ou Section' : 'Section';
            this.showToast(`Impossible en groupe de ${partyCount} joueurs : choisissez ${requiredName}.`);
            window.SFX?.play('click');
            return;
        }

        this._pendingMode = mode;
        const modeMap = { solo: 'SOLO', duo: 'DUO', trio: 'TRIO', section: 'ESCOUADE' };
        const teamSizes = { solo: 1, duo: 2, trio: 3, section: 4 };

        this.currentGameMode = modeMap[mode] || 'SOLO';
        this.teamSize = teamSizes[mode] || 1;

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
        this.updateBotFillUI();
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
        const teamText = ts > 1 ? ` · Équipe ${this.botsEnabled ? 'complétée par des bots' : 'sans bots'}` : '';
        const matchText = this.fillMatch ? 'Partie remplie de bots' : 'File d\'attente (vrais joueurs)';
        detailEl.textContent = `${modePlayers[this._pendingMode] || '1 joueur'}${teamText} · ${matchText}`;
    }

    // Met à jour les 3 boutons (accueil + 2 interrupteurs du menu des modes)
    updateBotFillUI() {
        const solo = this.teamSize <= 1;
        const leader = this.isCurrentPartyLeader();
        const fillToggle = document.getElementById('botFillToggle');
        if (fillToggle) {
            fillToggle.setAttribute('aria-pressed', String(this.botsEnabled && !solo));
            fillToggle.textContent = solo ? 'Solo' : this.botsEnabled ? 'Activé' : 'Désactivé';
            fillToggle.classList.toggle('is-disabled-fill', solo || !this.botsEnabled);
            fillToggle.disabled = solo;
            fillToggle.title = solo
                ? 'En solo, il n\'y a pas d\'équipe à remplir'
                : leader ? 'Les places vides de ton équipe sont prises par des bots' : 'Seul le chef du groupe peut changer cette option';
        }

        const teamSwitch = document.getElementById('modeFillTeamToggle');
        if (teamSwitch) {
            teamSwitch.setAttribute('aria-checked', String(this.botsEnabled));
            teamSwitch.disabled = solo;
        }
        document.getElementById('modeOptFillTeam')?.classList.toggle('is-disabled', solo);

        const matchSwitch = document.getElementById('modeFillMatchToggle');
        if (matchSwitch) matchSwitch.setAttribute('aria-checked', String(this.fillMatch));

        this.updateModeFooter();
    }

    // Réglages reçus du serveur (le chef du groupe les a changés)
    applyFillConfig(msg) {
        if (!msg) return;
        const fm = msg.fillMatch ?? msg.botFill;
        if (typeof fm === 'boolean') this.fillMatch = fm;
        if (typeof msg.fillTeam === 'boolean') this.botsEnabled = msg.fillTeam;
        this.syncBotTeammates();
        this.saveGameConfig();
        this.updateBotFillUI();
        this.updateUI();
    }

    sendFillConfig() {
        if (window.networkManager?.roomCode && this.isCurrentPartyLeader()) {
            window.networkManager.sendRoomConfig(this.currentGameMode.toLowerCase(), this.fillMatch, this.botsEnabled);
        }
    }

    // « Remplir l'équipe avec des bots »
    toggleBotTeammates() {
        if (!this.isCurrentPartyLeader()) {
            this.showToast('Seul le chef du groupe peut changer les options de bots ! 👑');
            window.SFX?.play('click');
            return;
        }
        if (this.teamSize <= 1) {
            this.showToast('En solo, il n\'y a pas d\'équipe à remplir.');
            return;
        }

        this.botsEnabled = !this.botsEnabled;
        this.updateBotFillUI();
        this.syncBotTeammates();
        this.saveGameConfig();
        this.updateUI();
        window.SFX?.play('click');
        this.sendFillConfig();

        this.showToast(this.botsEnabled
            ? 'Équipe complétée par des bots'
            : 'Équipe sans bots : vous jouerez en sous-nombre s\'il manque des joueurs');
        this.addChatMessage(`Remplir l'équipe avec des bots : ${this.botsEnabled ? 'Activé' : 'Désactivé'}`, 'Système');
    }

    // « Remplir la partie avec des bots »
    toggleFillMatch() {
        if (!this.isCurrentPartyLeader()) {
            this.showToast('Seul le chef du groupe peut changer les options de bots ! 👑');
            window.SFX?.play('click');
            return;
        }
        if (this.localPlayerReady) {
            this.showToast('Annule « Prêt » avant de changer cette option.');
            return;
        }

        this.fillMatch = !this.fillMatch;
        this.updateBotFillUI();
        this.saveGameConfig();
        window.SFX?.play('click');
        this.sendFillConfig();

        this.showToast(this.fillMatch
            ? 'Partie remplie avec des bots : lancement immédiat'
            : 'Sans bots dans la partie : file d\'attente avec de vrais joueurs');
        this.addChatMessage(`Remplir la partie avec des bots : ${this.fillMatch ? 'Activé' : 'Désactivé (file d\'attente)'}`, 'Système');
    }

    syncBotTeammates() {
        const local = this.players[0] || { id: 1, name: 'Joueur 1', ready: this.localPlayerReady, isLocal: true };
        local.ready = this.localPlayerReady;

        // Vrais joueurs du groupe (moi d'abord), puis des bots dans les places libres si
        // « Remplir l'équipe » est activé (ex. Trio à 2 : 1 bot ; sinon on reste à 2)
        const real = [local, ...this.players.slice(1).filter(p => !p.isBot)];
        const list = real.slice(0, Math.max(1, this.teamSize));
        if (this.botsEnabled && this.teamSize > 1) {
            for (let i = 0; list.length < this.teamSize; i++) {
                list.push({
                    id: `bot_${i + 2}`,
                    name: BOT_TEAMMATE_NAMES[i] || `Bot ${i + 2}`,
                    ready: true, // Les bots sont toujours prêts !
                    isLocal: false,
                    isBot: true
                });
            }
        }
        // Les vrais joueurs ne sont jamais cachés, même au-delà de la taille d'équipe
        this.players = list.concat(real.slice(list.filter(p => !p.isBot).length));
    }

    saveGameConfig() {
        try {
            const modeMap = { SOLO: 'solo', DUO: 'duo', TRIO: 'trio', ESCOUADE: 'section' };
            const m = modeMap[this.currentGameMode] || 'solo';

            // Préserver la configuration réseau existante si présente
            let existing = {};
            try {
                const s = sessionStorage.getItem('for2d-game-mode') || localStorage.getItem('for2d-game-mode');
                if (s) existing = JSON.parse(s);
            } catch { /* parse error */ }

            const cfg = {
                ...existing,
                mode: m,
                modeName: this.currentGameMode,
                teamSize: this.teamSize,
                bots: this.fillMatch,
                fillMatch: this.fillMatch,
                fillTeam: this.botsEnabled
            };
            // Partie hors ligne : pas d'équipes reçues du serveur
            if (!window.networkManager?.roomCode) delete cfg.teams;

            // Si connecté à une salle réseau, préserver les identifiants et membres
            if (window.networkManager?.roomCode) {
                cfg.isMultiplayer = true;
                cfg.roomCode = window.networkManager.roomCode;
                cfg.mySlot = window.networkManager.slot;
                cfg.myPlayerId = window.networkManager.getPlayerId();
                cfg.isHost = !!window.networkManager.isHost;
                if (Array.isArray(window.networkManager.roomPlayers) && window.networkManager.roomPlayers.length > 0) {
                    cfg.roomPlayers = window.networkManager.roomPlayers;
                }
            }

            sessionStorage.setItem('for2d-game-mode', JSON.stringify(cfg));
            localStorage.setItem('for2d-game-mode', JSON.stringify(cfg));
        } catch { /* quota dépassé */ }
    }

    confirmMode() {
        const modeMap = { solo: 'SOLO', duo: 'DUO', trio: 'TRIO', section: 'ESCOUADE' };
        const teamSizes = { solo: 1, duo: 2, trio: 3, section: 4 };
        this.currentGameMode = modeMap[this._pendingMode] || 'SOLO';
        this.teamSize = teamSizes[this._pendingMode] || 1;
        window.SFX?.play('mode');

        if (this.isCurrentPartyLeader() && window.networkManager?.roomCode) {
            window.networkManager.sendRoomConfig(this._pendingMode, this.fillMatch, this.botsEnabled);
        }

        this.syncBotTeammates();
        this.saveGameConfig();
        this.updateBotFillUI();
        this.updateUI();
        const display = this.currentGameMode === 'ESCOUADE' ? 'SECTION' : this.currentGameMode;
        const teamTxt = this.teamSize > 1 ? (this.botsEnabled ? ' · équipe complétée par des bots' : ' · équipe sans bots') : '';
        this.addChatMessage(`Mode de jeu : ${display} (équipe de ${this.teamSize})${teamTxt} · ${this.fillMatch ? 'partie remplie de bots' : 'file d\'attente'}`, 'Système');
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
        
        hostBtn?.classList.add('active');
        joinBtn?.classList.remove('active');
        if (joinForm) joinForm.style.display = 'none';
        
        // Créer une salle multijoueur sur le serveur
        if (window.networkManager) {
            this.autoRoom = false;
            window.networkManager.createRoom(this.currentGameMode.toLowerCase(), this.fillMatch, this.botsEnabled);
        }
        
        this.addChatMessage('Création d\'une salle multijoueur...');
    }

    handleJoinGame() {
        const hostBtn = document.getElementById('hostBtn');
        const joinBtn = document.getElementById('joinBtn');
        const joinForm = document.getElementById('joinForm');
        
        hostBtn?.classList.remove('active');
        joinBtn?.classList.add('active');
        if (joinForm) joinForm.style.display = 'flex';
        
        const roomInput = document.getElementById('roomInput');
        roomInput?.focus();
        this.addChatMessage('Entre le code à 6 lettres de la salle pour la rejoindre.');
    }

    joinRoom() {
        const roomInput = document.getElementById('roomInput');
        const roomCode = (roomInput?.value || '').trim().toUpperCase();
        
        if (roomCode.length >= 4) {
            if (window.networkManager) {
                window.networkManager.joinRoom(roomCode);
                this.addChatMessage(`Connexion à la salle ${roomCode}...`);
            }
        } else {
            this.showToast('Code de salle trop court (6 caractères requis).');
        }
    }

    /* ===== MODALE DE BIENVENUE (PREMIÈRE VISITE) ===== */
    setupWelcomeModal() {
        const modal = document.getElementById('welcomeModal');
        const form = document.getElementById('welcomeForm');
        const nameInput = document.getElementById('welcomeNameInput');
        const randomBtn = document.getElementById('welcomeRandomBtn');
        if (!modal || !form || !nameInput) return;

        const welcomed = localStorage.getItem('for2d-welcomed');
        if (welcomed) return;

        const RANDOM_NAMES = [
            'NinjaPixel', 'ShadowRoyale', 'VortexKing', 'AuraSniper',
            'LaserStorm', 'PixelKnight', 'NovaHunter', 'CosmicHero',
            'CyberGhost', 'OmegaLegend', 'StrikeForce', 'RoyalBlade'
        ];
        const pickRandom = () => RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] + Math.floor(Math.random() * 90 + 10);

        const currentName = window.FOR2D_PROGRESS?.name || localStorage.getItem('for2d-player-name') || pickRandom();
        nameInput.value = currentName;

        randomBtn?.addEventListener('click', () => {
            nameInput.value = pickRandom();
            nameInput.focus();
            window.SFX?.play?.('click');
        });

        // Afficher la modale
        modal.hidden = false;
        requestAnimationFrame(() => modal.classList.add('is-visible'));

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const chosen = (nameInput.value || '').trim();
            if (!chosen) return;

            if (window.FOR2D_PROGRESS?.setName) {
                window.FOR2D_PROGRESS.setName(chosen);
            }
            localStorage.setItem('for2d-player-name', chosen);
            localStorage.setItem('for2d-welcomed', '1');

            this.players[0].name = chosen;
            const playerNameEl = document.querySelector('.player-slot .player-name');
            if (playerNameEl) playerNameEl.textContent = chosen;

            window.SFX?.play?.('purchase');
            this.showToast(`Bienvenue dans l'arène, ${chosen} !`);

            modal.classList.remove('is-visible');
            setTimeout(() => { modal.hidden = true; }, 350);
        });
    }

    /* ===== SYNCHRONISATION DU GROUPE MULTIJOUEUR ===== */
    syncPartyMembers(members) {
        if (!Array.isArray(members)) return;
        const myId = window.networkManager?.getPlayerId();
        const me = members.find(m => m.id === myId) || members[0];
        const others = members.filter(m => m.id !== myId);

        if (me) {
            this.players[0].name = me.name || this.players[0].name;
            this.players[0].ready = !!me.ready;
            this.localPlayerReady = !!me.ready;
            const readyBtn = document.getElementById('readyBtn');
            if (readyBtn) {
                readyBtn.classList.toggle('is-ready', this.localPlayerReady);
                readyBtn.querySelector('.ready-text').textContent = this.localPlayerReady ? 'ANNULER' : 'PRÊT';
            }
        }

        const newPlayers = [this.players[0]];
        others.forEach((p) => {
            newPlayers.push({
                id: p.id,
                name: p.name,
                ready: !!p.ready,
                isBot: false,
                isHost: !!p.isHost,
                skin: p.skin,
                backpack: p.backpack || null,
                colors: p.colors,
                pickaxeSkin: p.pickaxeSkin
            });
        });

        this.players = newPlayers;
        if (others.length > 0) this.autoRoom = false; // des amis ont rejoint : c'est un vrai groupe
        this.enforceMinModeForParty();
        this.syncBotTeammates();
        this.updateLeaderPermissions();
        this.updateBotFillUI();
        this.updateUI();
        // Lancement : décidé par le serveur quand tout le monde est prêt
        // (direct si la partie est remplie de bots, sinon file d'attente)

        const partyActions = document.getElementById('partyActions');
        if (partyActions) {
            partyActions.classList.toggle('is-active', !!window.networkManager?.roomCode);
        }
    }

    /* ===== GESTION DE LA FILE D'ATTENTE (MATCHMAKING SANS BOTS) ===== */
    handleMatchmakingStatus(msg) {
        const overlay = document.getElementById('matchmakingOverlay');
        if (!overlay) return;

        if (!msg || msg.state === 'idle') {
            overlay.classList.remove('is-visible');
            setTimeout(() => { overlay.hidden = true; }, 300);
            return;
        }

        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('is-visible'));

        const modeBadge = document.getElementById('mmModeBadge');
        const title = document.getElementById('mmTitle');
        const subtitle = document.getElementById('mmSubtitle');
        const teamsWrap = document.getElementById('mmTeamsIndicator');
        const teamsCount = document.getElementById('mmTeamsCount');
        const countdownWrap = document.getElementById('mmCountdownWrap');
        const countdownNumber = document.getElementById('mmCountdownNumber');

        const modeLabel = (msg.mode || this.currentGameMode || 'DUO').toUpperCase();
        if (modeBadge) modeBadge.textContent = `MODE ${modeLabel}`;

        if (msg.state === 'searching') {
            if (title) title.textContent = 'RECHERCHE D\'ADVERSAIRES';
            if (subtitle) subtitle.textContent = 'Recherche d\'autres équipes en ligne...';
            if (teamsWrap) teamsWrap.hidden = false;
            if (teamsCount) teamsCount.textContent = `${msg.teamsCount || 1} / ${msg.teamsNeeded || 2}`;
            if (countdownWrap) countdownWrap.hidden = true;
        } else if (msg.state === 'countdown') {
            const n = msg.teamsCount || 2;
            if (title) title.textContent = 'ADVERSAIRES TROUVÉS !';
            if (subtitle) subtitle.textContent = `${n} équipes prêtes dans la partie.`;
            // Compteur à jour (il reste visible : d'autres équipes peuvent encore arriver)
            if (teamsWrap) teamsWrap.hidden = false;
            if (teamsCount) teamsCount.textContent = String(n);
            if (countdownWrap) countdownWrap.hidden = false;
            if (countdownNumber) {
                countdownNumber.textContent = msg.secondsLeft;
                countdownNumber.classList.add('tick');
                setTimeout(() => countdownNumber.classList.remove('tick'), 250);
            }
            if (msg.secondsLeft <= 5 && msg.secondsLeft > 0) {
                window.SFX?.play?.('click');
            } else if (msg.secondsLeft === 30) {
                window.SFX?.play?.('toast');
            }
        }
    }

    enforceMinModeForParty() {
        const partyCount = this.getRealPartyPlayerCount();
        const isLeader = this.isCurrentPartyLeader();
        let targetMode = null;

        if (partyCount >= 2 && this.currentGameMode === 'SOLO') {
            targetMode = 'duo';
        } else if (partyCount >= 3 && (this.currentGameMode === 'SOLO' || this.currentGameMode === 'DUO')) {
            targetMode = 'trio';
        } else if (partyCount >= 4 && this.currentGameMode !== 'ESCOUADE' && this.currentGameMode !== 'SECTION') {
            targetMode = 'section';
        }

        if (targetMode) {
            const modeMap = { solo: 'SOLO', duo: 'DUO', trio: 'TRIO', section: 'ESCOUADE' };
            const modeName = modeMap[targetMode] || targetMode.toUpperCase();
            this.setGameModeSilently(targetMode);

            if (isLeader && window.networkManager?.roomCode) {
                window.networkManager.sendRoomConfig(targetMode, this.fillMatch, this.botsEnabled);
            }

            const icons = { duo: '👥', trio: '👥‍👤', section: '🎖️' };
            const display = modeName === 'ESCOUADE' ? 'SECTION' : modeName;
            this.addChatMessage(`Groupe de ${partyCount} joueurs : Mode ${display} activé d'office ! ${icons[targetMode] || ''}`, 'Système');
            this.showToast(`Mode ${display} activé d'office (${partyCount} joueurs dans le groupe)`);
        }
    }

    resetTeammateSlots() {
        this.players = [this.players[0]];
        this.syncBotTeammates();
        this.updateLeaderPermissions();
        this.updateUI();
        const partyActions = document.getElementById('partyActions');
        if (partyActions) partyActions.classList.remove('is-active');
    }

    setGameModeSilently(mode) {
        if (!mode) return;
        const upper = mode.toUpperCase();
        this.currentGameMode = upper === 'SECTION' ? 'ESCOUADE' : upper;
        const display = document.getElementById('currentModeDisplay') || document.querySelector('.mode-display');
        if (display) display.textContent = this.currentGameMode === 'ESCOUADE' ? 'SECTION' : this.currentGameMode;
        const modeSizes = { SOLO: 1, DUO: 2, TRIO: 3, ESCOUADE: 4 };
        this.teamSize = modeSizes[this.currentGameMode] || 2;
        this.saveGameConfig();
        this.updateUI();
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
                const crown = slot.querySelector('.party-leader-crown');
                
                if (crown) crown.style.display = 'none';
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
        const inParty = Boolean(window.networkManager?.roomCode);
        const hostId = window.networkManager?.hostId;

        this.players.forEach((player, index) => {
            if (slots[index]) {
                const nameElement = slots[index].querySelector('.player-name');
                const statusElement = slots[index].querySelector('.player-status');
                const muteBtn = slots[index].querySelector('.mute-btn');

                const isLeader = inParty
                    ? (player.isHost || (hostId && player.id === hostId) || (index === 0 && window.networkManager?.isHost))
                    : (index === 0);

                if (nameElement) {
                    nameElement.textContent = player.name;
                    nameElement.title = player.name;

                    // Assurer l'existence du conteneur .player-name-box
                    let box = nameElement.parentElement;
                    if (!box || !box.classList.contains('player-name-box')) {
                        box = document.createElement('div');
                        box.className = 'player-name-box';
                        nameElement.parentNode.insertBefore(box, nameElement);
                        box.appendChild(nameElement);
                    }

                    // Couronne du chef de groupe : au-dessus et centrée sur le pseudo
                    let crown = box.querySelector('.party-leader-crown') || slots[index].querySelector('.party-leader-crown');
                    if (isLeader) {
                        if (!crown) {
                            crown = document.createElement('span');
                            crown.className = 'party-leader-crown';
                            crown.setAttribute('title', 'Chef du groupe');
                            crown.setAttribute('aria-label', 'Chef du groupe');
                            crown.textContent = '👑';
                            box.insertBefore(crown, nameElement);
                        } else if (crown.parentElement !== box) {
                            box.insertBefore(crown, nameElement);
                        }
                        crown.style.display = '';
                    } else if (crown) {
                        crown.style.display = 'none';
                    }
                }
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
            const n = this.players.filter(p => !p.isBot).length || 1; // vrais joueurs seulement
            partyCount.textContent = String(n);
            partyCount.setAttribute('aria-label', `${n} joueur${n > 1 ? 's' : ''} dans le groupe`);
        }

        // Boutons « Remplir l'équipe » (accueil) et interrupteurs du menu des modes
        this.updateBotFillUI();

        // Mettre à jour le mode de jeu
        const modeDisplay = document.querySelector('.mode-display');
        if (modeDisplay) {
            const displayName = this.currentGameMode === 'ESCOUADE' ? 'SECTION' : this.currentGameMode;
            modeDisplay.textContent = displayName;
        }

        this.updateLeaderPermissions();
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
        const allReady = this.players.every(p => p.ready);
        
        if (allReady) {
            if (window.networkManager && window.networkManager.isConnected() && window.networkManager.roomCode) {
                // Le serveur lance (ou met en file d'attente) quand tout le groupe est prêt
                this.addChatMessage('En attente des autres joueurs du groupe...');
                return;
            }

            this.addChatMessage('Démarrage de la partie...');
            this.saveGameConfig();

            clearTimeout(this.startTimer);
            window.SFX?.play('launch');
            this.startTimer = setTimeout(() => {
                if (this.localPlayerReady) window.location.href = 'game.html';
            }, 1500);
        } else {
            this.addChatMessage('Tous les joueurs doivent être prêts !');
        }
    }
}

// Initialisation
let lobbyManager;

document.addEventListener('DOMContentLoaded', () => {
    lobbyManager = new LobbyManager();
    window.lobbyManager = lobbyManager;
});
