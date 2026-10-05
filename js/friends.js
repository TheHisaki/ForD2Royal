/* ==================================
   PANNEAU AMIS - FOR2D ROYAL
   Compte serveur + liste d'amis + invitations de groupe.
   ================================== */

(() => {
    class FriendsPanel {
        constructor() {
            this.panel = document.getElementById('friendsPanel');
            if (!this.panel) return;
            this.network = window.networkManager;
            this.state = { account: null, friends: [], incoming: [], outgoing: [] };
            this.invites = [];
            this.popupInvite = null;
            this.popupBusy = false;
            this.invitePopupTimer = null;
            this.bind();
            this.network?.onFriendEvent?.((msg) => this.handle(msg));
            for (const msg of this.network?.takePendingGroupInvites?.() || []) this.handle(msg);
            // La session a pu être restaurée avant la création du panneau (page rapide) :
            // on repart de l'état déjà connu du réseau au lieu d'afficher « déconnecté »
            this.syncFromNetwork();
            this.render();
        }

        syncFromNetwork() {
            const net = this.network;
            if (!net?.account) return;
            const saved = net.friendsState;
            const list = (key) => (saved && Array.isArray(saved[key]) ? saved[key] : []);
            this.state = {
                account: net.account,
                friends: list('friends'),
                incoming: list('incoming'),
                outgoing: list('outgoing')
            };
        }

        bind() {
            const $ = (id) => document.getElementById(id);
            this.btn = $('friendsBtn');
            this.closeBtn = $('friendsClose');
            this.auth = $('friendsAuth');
            this.account = $('friendsAccount');
            this.authName = $('friendsName');
            this.authPassword = $('friendsPassword');
            this.authMessage = $('friendsAuthMessage');
            this.actionMessage = $('friendsActionMessage');
            this.accountName = $('friendsAccountName');
            this.requests = $('friendsRequests');
            this.list = $('friendsList');
            this.invitesEl = $('friendsInvites');
            this.badge = $('friendsBadge');
            this.invitePopup = $('groupInvitePopup');
            this.invitePopupFrom = $('groupInviteFrom');
            this.invitePopupMode = $('groupInviteMode');
            this.invitePopupMessage = $('groupInviteMessage');
            this.inviteAcceptBtn = $('groupInviteAccept');
            this.inviteRejectBtn = $('groupInviteReject');

            this.btn?.addEventListener('click', () => this.toggle());
            this.closeBtn?.addEventListener('click', () => this.close());
            this.inviteAcceptBtn?.addEventListener('click', () => this.acceptPopupInvite());
            this.inviteRejectBtn?.addEventListener('click', () => this.rejectPopupInvite());
            document.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && !this.panel.hidden) this.close();
            });
            $('friendsRegister')?.addEventListener('click', () => this.authenticate('register'));
            $('friendsLogin')?.addEventListener('click', () => this.authenticate('login'));
            $('friendsLogout')?.addEventListener('click', () => this.logout());
            $('friendsAddForm')?.addEventListener('submit', (event) => {
                event.preventDefault();
                const input = $('friendsAddName');
                const name = input?.value.trim();
                if (!name) return;
                if (!this.network?.isAuthenticated?.()) {
                    this.setMessage(this.actionMessage, 'Connecte-toi pour envoyer une demande.', true);
                    return;
                }
                this.pendingFriendName = name;
                this.setMessage(this.actionMessage, 'Envoi de la demande...', false);
                this.network.requestFriend(name);
            });
        }

        toggle() {
            if (this.panel.hidden) {
                this.panel.hidden = false;
                requestAnimationFrame(() => this.panel.classList.add('is-open'));
                this.authName?.focus();
            } else this.close();
        }

        close() {
            this.panel.classList.remove('is-open');
            setTimeout(() => { this.panel.hidden = true; }, 180);
            this.btn?.focus();
        }

        openForInvite() {
            if (this.panel.hidden) {
                this.panel.hidden = false;
                requestAnimationFrame(() => this.panel.classList.add('is-open'));
            }
            this.invitesEl?.scrollIntoView?.({ block: 'nearest' });
        }

        currentPopupInvite() {
            return this.popupInvite?.invitationId
                ? this.invites.find((invite) => invite.invitationId === this.popupInvite.invitationId) || null
                : null;
        }

        showInvitePopup(invite) {
            if (!this.invitePopup || !invite) return;
            this.popupInvite = invite;
            this.popupBusy = false;
            this.invitePopupFrom.textContent = invite.from?.name || 'Un ami';
            this.invitePopupMode.textContent = `Mode ${(invite.mode || 'duo').toUpperCase()} · Salle ${invite.roomCode || '—'}`;
            this.invitePopupMessage.textContent = 'Veux-tu rejoindre son groupe ?';
            this.invitePopupMessage.classList.remove('is-error', 'is-ok');
            this.inviteAcceptBtn.disabled = false;
            this.inviteRejectBtn.disabled = false;
            this.invitePopup.hidden = false;
            requestAnimationFrame(() => this.invitePopup.classList.add('is-visible'));
            clearTimeout(this.invitePopupTimer);
            this.invitePopupTimer = setTimeout(() => {
                if (this.popupInvite?.invitationId === invite.invitationId) this.hideInvitePopup();
            }, 5000);
        }

        hideInvitePopup() {
            clearTimeout(this.invitePopupTimer);
            this.invitePopupTimer = null;
            if (!this.invitePopup) return;
            this.invitePopup.classList.remove('is-visible');
            setTimeout(() => {
                if (!this.invitePopup.classList.contains('is-visible')) this.invitePopup.hidden = true;
            }, 180);
            this.popupInvite = null;
            this.popupBusy = false;
        }

        setPopupBusy(busy, message = '') {
            this.popupBusy = busy;
            if (this.inviteAcceptBtn) this.inviteAcceptBtn.disabled = busy;
            if (this.inviteRejectBtn) this.inviteRejectBtn.disabled = busy;
            if (message && this.invitePopupMessage) this.invitePopupMessage.textContent = message;
        }

        acceptPopupInvite() {
            const invite = this.currentPopupInvite();
            if (!invite || this.popupBusy) return;
            this.setPopupBusy(true, 'Vérification du groupe...');
            this.network?.acceptGroupInvite?.(invite.invitationId);
        }

        rejectPopupInvite() {
            const invite = this.currentPopupInvite();
            if (!invite || this.popupBusy) return;
            this.setPopupBusy(true, 'Refus de l’invitation...');
            this.network?.rejectGroupInvite?.(invite.invitationId);
        }

        authenticate(action) {
            const name = this.authName?.value.trim();
            const password = this.authPassword?.value || '';
            if (!name || password.length < 8) {
                this.setMessage(this.authMessage, 'Pseudo et mot de passe de 8 caractères requis.', true);
                return;
            }
            if (!this.network) {
                this.setMessage(this.authMessage, 'Service en ligne indisponible.', true);
                return;
            }
            // Déjà connecté (affichage pas encore à jour), session en cours de restauration...
            const blocked = this.network.authBlockReason?.() || '';
            if (blocked) {
                if (blocked === 'authenticated') {
                    this.syncFromNetwork();
                    this.render();
                }
                const reasons = {
                    authenticated: `Tu es déjà connecté en tant que ${this.network.account?.name || 'ce compte'}.`,
                    restoring: 'Reconnexion à ton compte en cours, patiente un instant...',
                    pending: 'Une demande est déjà en cours, patiente un instant...',
                    reloading: 'Chargement du compte...'
                };
                this.setMessage(this.authMessage, reasons[blocked] || 'Patiente un instant...', blocked !== 'authenticated');
                return;
            }
            const sent = action === 'register'
                ? this.network.registerAccount(name, password)
                : this.network.loginAccount(name, password);
            if (sent === false) return;
            this.setAuthBusy(true);
            this.setMessage(this.authMessage, action === 'register' ? 'Création du compte...' : 'Connexion...', false);
        }

        setAuthBusy(busy) {
            for (const id of ['friendsRegister', 'friendsLogin']) {
                const button = document.getElementById(id);
                if (button) button.disabled = busy;
            }
        }

        // La déconnexion recharge la page (profil temporaire rangé, ou écran de bienvenue)
        logout() {
            const button = document.getElementById('friendsLogout');
            if (button) button.disabled = true;
            this.setMessage(this.actionMessage, 'Déconnexion...', false);
            this.network?.logoutAccount();
        }

        setMessage(el, text, error) {
            if (!el) return;
            el.textContent = text || '';
            el.classList.toggle('is-error', !!error);
            el.classList.toggle('is-ok', !!text && !error);
        }

        handle(msg) {
            if (msg.type === 'account_authenticated') {
                this.state.account = msg.account || null;
                this.setMessage(this.authMessage, msg.isNewAccount ? 'Compte créé, transfert du profil...' : 'Connexion réussie, chargement du profil...', false);
                this.render();
                return;
            }
            if (msg.type === 'account_ready') {
                this.setMessage(this.authMessage, msg.warning || 'Compte chargé, actualisation...', !!msg.warning);
                this.setMessage(this.actionMessage, msg.warning || 'Compte chargé, actualisation...', !!msg.warning);
                return;
            }
            if (msg.type === 'profile_ready') {
                this.setAuthBusy(false);
                this.setMessage(this.authMessage, '', false);
                this.syncFromNetwork();
                this.render();
                return;
            }
            if (msg.type === 'account_updated') {
                // js/network.js met à jour le profil local et l'accueil
                this.state.account = msg.account || this.state.account;
                this.render();
                const input = document.getElementById('profileName');
                const message = document.getElementById('profileNameMsg');
                if (input) input.value = this.state.account?.name || input.value;
                if (message) message.textContent = `Pseudo enregistré : ${this.state.account?.name || ''}`;
                return;
            }
            if (msg.type === 'account_logged_out') {
                this.state = { account: null, friends: [], incoming: [], outgoing: [] };
                this.render();
                return;
            }
            if (msg.type === 'friends_state') {
                this.state = {
                    account: msg.account || this.state.account,
                    friends: Array.isArray(msg.friends) ? msg.friends : [],
                    incoming: Array.isArray(msg.incoming) ? msg.incoming : [],
                    outgoing: Array.isArray(msg.outgoing) ? msg.outgoing : []
                };
                this.render();
                return;
            }
            if (msg.type === 'friend_success') {
                this.setMessage(this.actionMessage, msg.message || 'Action effectuée.', false);
                if (msg.action === 'friend_request') {
                    const input = document.getElementById('friendsAddName');
                    if (input && (!this.pendingFriendName || input.value.trim() === this.pendingFriendName)) {
                        input.value = '';
                    }
                    this.pendingFriendName = '';
                }
                return;
            }
            if (msg.type === 'account_error' || msg.type === 'friend_error') {
                const authAction = msg.action === 'register' || msg.action === 'login' || msg.action === 'session';
                if (authAction) this.setAuthBusy(false);
                if (msg.action === 'rename') {
                    const profileMessage = document.getElementById('profileNameMsg');
                    if (profileMessage) profileMessage.textContent = msg.message || 'Pseudo refusé.';
                }
                let text = msg.message;
                if (msg.action === 'session') {
                    // js/network.js gère la suite : retour au temporaire (session invalide) ou nouvel essai
                    text = msg.code === 'session_invalid'
                        ? 'Session expirée : retour au profil local...'
                        : 'Compte momentanément hors ligne, nouvelle tentative automatique...';
                }
                this.setMessage(authAction ? this.authMessage : this.actionMessage, text, true);
                return;
            }
            if (msg.type === 'profile_error' && msg.code !== 'conflict') {
                this.setMessage(this.actionMessage, msg.message || 'Profil non sauvegardé.', true);
                return;
            }
            if (msg.type === 'group_invite' || msg.type === 'friend_invite') {
                const invitationId = msg.invitationId || `${msg.roomCode}:${msg.from?.id || 'ami'}`;
                const senderId = msg.from?.id || 'ami';
                const existingInvite = this.invites.find((item) =>
                    item.invitationId === invitationId
                    || (item.from?.id === senderId && item.roomCode === msg.roomCode)
                );
                if (existingInvite) {
                    // Même ami + même salle = une seule ligne, même si un ancien serveur
                    // renvoie un nouvel identifiant d’invitation.
                    existingInvite.invitationId = invitationId;
                    existingInvite.from = msg.from || existingInvite.from;
                    existingInvite.mode = msg.mode || existingInvite.mode;
                    existingInvite.expiresAt = msg.expiresAt || existingInvite.expiresAt;
                    this.render();
                    return;
                }
                const invite = {
                    invitationId,
                    from: msg.from,
                    roomCode: msg.roomCode,
                    mode: msg.mode,
                    expiresAt: msg.expiresAt
                };
                this.invites.push(invite);
                this.render();
                this.showInvitePopup(invite);
                window.SFX?.play?.('toast');
                return;
            }
            if (msg.type === 'group_invite_sent') {
                this.setMessage(this.actionMessage, msg.message || 'Invitation envoyée.', false);
                return;
            }
            if (msg.type === 'group_invite_accepted') {
                if (msg.invitationId) {
                    this.invites = this.invites.filter((invite) => invite.invitationId !== msg.invitationId);
                    if (this.popupInvite?.invitationId === msg.invitationId) this.hideInvitePopup();
                }
                if (msg.player?.name) this.setMessage(this.actionMessage, `${msg.player.name} a accepté ton invitation.`, false);
                this.render();
                return;
            }
            if (msg.type === 'group_invite_rejected') {
                if (msg.invitationId) {
                    this.invites = this.invites.filter((invite) => invite.invitationId !== msg.invitationId);
                    if (this.popupInvite?.invitationId === msg.invitationId) this.hideInvitePopup();
                }
                if (msg.by?.name) this.setMessage(this.actionMessage, `${msg.by.name} a refusé l’invitation.`, true);
                this.render();
                return;
            }
            if (msg.type === 'group_invite_error') {
                const invite = msg.invitationId ? this.invites.find((item) => item.invitationId === msg.invitationId) : null;
                const terminal = new Set(['invite_invalid', 'invite_expired', 'inviter_unavailable', 'room_full', 'already_in_group', 'join_failed']);
                if (msg.invitationId && terminal.has(msg.code)) {
                    this.invites = this.invites.filter((item) => item.invitationId !== msg.invitationId);
                }
                if (invite && this.popupInvite?.invitationId === invite.invitationId) {
                    this.setPopupBusy(false, msg.message || 'Invitation impossible.');
                    this.invitePopupMessage?.classList.add('is-error');
                    if (terminal.has(msg.code)) {
                        this.inviteAcceptBtn.disabled = true;
                        this.inviteRejectBtn.disabled = true;
                        setTimeout(() => this.hideInvitePopup(), 1800);
                    }
                }
                this.setMessage(this.actionMessage, msg.message || 'Invitation impossible.', true);
                this.render();
                return;
            }
            if (msg.type === 'friend_invite_sent') {
                this.setMessage(this.actionMessage, 'Invitation envoyée.', false);
            }
        }

        open() {
            if (this.panel.hidden) this.toggle();
        }

        render() {
            const logged = !!this.state.account;
            this.auth.hidden = logged;
            this.account.hidden = !logged;
            // Session en cours de restauration : pas de formulaire « vide » trompeur
            if (!logged && this.network?.hasPendingSession?.() && !this.authMessage?.textContent) {
                this.setMessage(this.authMessage, 'Reconnexion à ton compte...', false);
            }
            if (logged) {
                this.accountName.textContent = this.state.account.name;
                this.renderRequests();
                this.renderFriends();
                this.renderInvites();
            }
            const count = this.state.incoming.length + this.invites.length;
            this.badge.hidden = !count;
            this.badge.textContent = count > 9 ? '9+' : String(count);
        }

        makeRow() {
            const row = document.createElement('div');
            row.className = 'friend-row';
            return row;
        }

        makeName(account, online = false) {
            const wrap = document.createElement('span');
            wrap.className = 'friend-row-name';
            const dot = document.createElement('i');
            dot.className = `friend-presence${online ? ' is-online' : ''}`;
            dot.setAttribute('aria-hidden', 'true');
            const text = document.createElement('span');
            text.textContent = account.name;
            wrap.append(dot, text);
            return wrap;
        }

        button(label, className, handler) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = className;
            button.textContent = label;
            button.addEventListener('click', handler);
            return button;
        }

        renderRequests() {
            this.requests.replaceChildren();
            if (!this.state.incoming.length) {
                this.requests.append(this.empty('Aucune demande en attente.'));
                return;
            }
            for (const account of this.state.incoming) {
                const row = this.makeRow();
                row.append(this.makeName(account));
                const actions = document.createElement('span');
                actions.className = 'friend-row-actions';
                actions.append(
                    this.button('Accepter', 'friends-primary mini', () => this.network.acceptFriend(account.id)),
                    this.button('Refuser', 'friends-secondary mini', () => this.network.rejectFriend(account.id))
                );
                row.append(actions);
                this.requests.append(row);
            }
        }

        renderFriends() {
            this.list.replaceChildren();
            if (!this.state.friends.length) {
                this.list.append(this.empty('Ajoute un ami avec son pseudo.'));
                return;
            }
            for (const account of this.state.friends) {
                const row = this.makeRow();
                row.append(this.makeName(account, account.online));
                const actions = document.createElement('span');
                actions.className = 'friend-row-actions';
                actions.append(
                    this.button('Inviter', 'friends-primary mini', () => this.network.inviteFriend(account.id)),
                    this.button('×', 'friends-secondary mini', () => this.network.removeFriend(account.id))
                );
                row.append(actions);
                this.list.append(row);
            }
        }

        renderInvites() {
            this.invitesEl.replaceChildren();
            if (!this.invites.length) {
                this.invitesEl.append(this.empty('Aucune invitation.'));
                return;
            }
            for (const invite of this.invites) {
                const row = this.makeRow();
                row.append(this.makeName(invite.from || { name: 'Ami' }));
                const actions = document.createElement('span');
                actions.className = 'friend-row-actions';
                actions.append(
                    this.button('Accepter', 'friends-primary mini', () => this.showInvitePopup(invite)),
                    this.button('Refuser', 'friends-secondary mini', () => {
                        this.network.rejectGroupInvite?.(invite.invitationId);
                        this.setMessage(this.actionMessage, 'Refus de l’invitation...', false);
                    })
                );
                row.append(actions);
                this.invitesEl.append(row);
            }
        }

        empty(text) {
            const el = document.createElement('p');
            el.className = 'friends-empty';
            el.textContent = text;
            return el;
        }
    }

    const start = () => {
        window.FOR2D_FRIENDS = new FriendsPanel();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
