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
            this.bind();
            this.network?.onFriendEvent?.((msg) => this.handle(msg));
            this.render();
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

            this.btn?.addEventListener('click', () => this.toggle());
            this.closeBtn?.addEventListener('click', () => this.close());
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
                this.network?.requestFriend(name);
                input.value = '';
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

        authenticate(action) {
            const name = this.authName?.value.trim();
            const password = this.authPassword?.value || '';
            if (!name || password.length < 8) {
                this.setMessage(this.authMessage, 'Pseudo et mot de passe de 8 caractères requis.', true);
                return;
            }
            this.setMessage(this.authMessage, action === 'register' ? 'Création du compte...' : 'Connexion...', false);
            if (action === 'register') this.network?.registerAccount(name, password);
            else this.network?.loginAccount(name, password);
        }

        logout() {
            this.network?.logoutAccount();
            this.state = { account: null, friends: [], incoming: [], outgoing: [] };
            this.invites = [];
            this.render();
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
                if (this.state.account?.name) {
                    window.FOR2D_PROGRESS?.setName?.(this.state.account.name);
                    try { localStorage.setItem('for2d-player-name', this.state.account.name); } catch {}
                }
                this.setMessage(this.authMessage, '', false);
                this.render();
                return;
            }
            if (msg.type === 'account_updated') {
                this.state.account = msg.account || this.state.account;
                if (this.state.account?.name) {
                    window.FOR2D_PROGRESS?.setName?.(this.state.account.name);
                    try { localStorage.setItem('for2d-player-name', this.state.account.name); } catch {}
                }
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
            if (msg.type === 'account_error' || msg.type === 'friend_error') {
                this.setMessage(msg.action === 'register' || msg.action === 'login' || msg.action === 'session' ? this.authMessage : this.actionMessage, msg.message, true);
                if (msg.action === 'session') {
                    try { localStorage.removeItem('for2d-account-token'); } catch {}
                    this.network.account = null;
                    this.network.accountToken = '';
                }
                return;
            }
            if (msg.type === 'friend_invite') {
                if (!this.invites.some((invite) => invite.roomCode === msg.roomCode && invite.from?.id === msg.from?.id)) {
                    this.invites.push({ from: msg.from, roomCode: msg.roomCode, mode: msg.mode });
                }
                this.render();
                this.open();
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
                actions.append(this.button('Rejoindre', 'friends-primary mini', () => {
                    this.network.joinRoom(invite.roomCode);
                    this.invites = this.invites.filter((item) => item !== invite);
                    this.render();
                }));
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
