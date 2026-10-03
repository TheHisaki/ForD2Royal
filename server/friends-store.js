/* ==================================
   COMPTES ET AMIS - FOR2D ROYAL
   Stockage privé côté serveur : server/data/friends.json
   ================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'friends.json');
const PASSWORD = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_LEN = 64;
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}_. -]{2,15}$/u;

function canonicalName(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('fr-FR');
}

function displayName(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function validPassword(value) {
    return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function scryptAsync(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, KEY_LEN, PASSWORD, (error, key) => {
            if (error) reject(error);
            else resolve(key);
        });
    });
}

function publicAccount(account) {
    return account ? { id: account.id, name: account.name } : null;
}

class FriendsStore {
    constructor() {
        this.data = this.load();
        try { fs.chmodSync(DATA_FILE, 0o600); } catch {}
        this.writeQueue = Promise.resolve();
        this.mutationQueue = Promise.resolve();
    }

    withMutation(fn) {
        const run = this.mutationQueue.then(fn);
        this.mutationQueue = run.catch(() => {});
        return run;
    }

    load() {
        try {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const data = JSON.parse(raw);
            if (data && data.version === 1 && data.accounts && data.usernames) return data;
        } catch (error) {
            if (error.code !== 'ENOENT') console.error('[Amis] JSON illisible, réinitialisation prudente.');
        }
        return { version: 1, accounts: {}, usernames: {} };
    }

    async save() {
        const snapshot = JSON.stringify(this.data, null, 2) + '\n';
        this.writeQueue = this.writeQueue.then(async () => {
            await fs.promises.mkdir(DATA_DIR, { recursive: true });
            const temp = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
            await fs.promises.writeFile(temp, snapshot, { encoding: 'utf8', mode: 0o600 });
            await fs.promises.rename(temp, DATA_FILE);
        });
        return this.writeQueue;
    }

    validateUsername(raw) {
        const name = displayName(raw);
        if (!USERNAME_RE.test(name)) {
            return { ok: false, reason: 'Pseudo : 3 à 16 caractères, lettres, chiffres, espaces, _ . ou -.' };
        }
        return { ok: true, name, canonical: canonicalName(name) };
    }

    get(id) {
        return id && this.data.accounts[id] ? this.data.accounts[id] : null;
    }

    getPublic(id) {
        return publicAccount(this.get(id));
    }

    findByName(raw) {
        const id = this.data.usernames[canonicalName(raw)];
        return this.get(id);
    }

    async register(rawName, password) {
        return this.withMutation(async () => {
            const checked = this.validateUsername(rawName);
        if (!checked.ok) return checked;
        if (!validPassword(password)) return { ok: false, reason: 'Mot de passe : 8 à 128 caractères.' };
        if (this.data.usernames[checked.canonical]) return { ok: false, reason: 'Ce pseudo est déjà utilisé.' };

        const id = `acc_${crypto.randomBytes(16).toString('hex')}`;
        const salt = crypto.randomBytes(16);
        const hash = await scryptAsync(password, salt);
        const account = {
            id,
            name: checked.name,
            canonical: checked.canonical,
            salt: salt.toString('hex'),
            hash: hash.toString('hex'),
            friends: [],
            incoming: [],
            outgoing: [],
            createdAt: Date.now()
        };
        this.data.accounts[id] = account;
        this.data.usernames[checked.canonical] = id;
        await this.save();
        return { ok: true, account: publicAccount(account) };
        });
    }

    async verify(rawName, password) {
        const account = this.findByName(rawName);
        if (!account || !validPassword(password)) return { ok: false, reason: 'Pseudo ou mot de passe incorrect.' };
        const expected = Buffer.from(account.hash, 'hex');
        const actual = await scryptAsync(password, Buffer.from(account.salt, 'hex'));
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
            return { ok: false, reason: 'Pseudo ou mot de passe incorrect.' };
        }
        return { ok: true, account: publicAccount(account) };
    }

    async rename(id, rawName) {
        return this.withMutation(async () => {
            const account = this.get(id);
        const checked = this.validateUsername(rawName);
        if (!account) return { ok: false, reason: 'Compte introuvable.' };
        if (!checked.ok) return checked;
        const other = this.data.usernames[checked.canonical];
        if (other && other !== id) return { ok: false, reason: 'Ce pseudo est déjà utilisé.' };
        if (account.canonical === checked.canonical) return { ok: true, account: publicAccount(account) };
        delete this.data.usernames[account.canonical];
        account.name = checked.name;
        account.canonical = checked.canonical;
        this.data.usernames[account.canonical] = id;
        await this.save();
        return { ok: true, account: publicAccount(account) };
        });
    }

    list(id) {
        const account = this.get(id);
        if (!account) return null;
        const profiles = (ids) => ids.map((friendId) => publicAccount(this.get(friendId))).filter(Boolean);
        return {
            account: publicAccount(account),
            friends: profiles(account.friends),
            incoming: profiles(account.incoming),
            outgoing: profiles(account.outgoing)
        };
    }

    async request(fromId, rawTarget) {
        return this.withMutation(async () => {
            const from = this.get(fromId);
        const target = this.findByName(rawTarget);
        if (!from || !target) return { ok: false, reason: 'Pseudo introuvable.' };
        if (from.id === target.id) return { ok: false, reason: 'Tu ne peux pas t’ajouter toi-même.' };
        if (from.friends.includes(target.id)) return { ok: false, reason: 'Vous êtes déjà amis.' };
        if (target.outgoing.includes(from.id)) {
            target.outgoing = target.outgoing.filter((id) => id !== from.id);
            from.incoming = from.incoming.filter((id) => id !== target.id);
            if (!from.friends.includes(target.id)) from.friends.push(target.id);
            if (!target.friends.includes(from.id)) target.friends.push(from.id);
            await this.save();
            return { ok: true, target: publicAccount(target), autoAccepted: true };
        }
        if (from.outgoing.includes(target.id)) return { ok: false, reason: 'Demande déjà envoyée.' };
        from.outgoing.push(target.id);
        target.incoming.push(from.id);
        await this.save();
        return { ok: true, target: publicAccount(target), autoAccepted: false };
        });
    }

    async accept(userId, requesterId) {
        return this.withMutation(async () => {
            const user = this.get(userId);
        const requester = this.get(requesterId);
        if (!user || !requester || !user.incoming.includes(requesterId)) return { ok: false, reason: 'Demande introuvable.' };
        user.incoming = user.incoming.filter((id) => id !== requesterId);
        requester.outgoing = requester.outgoing.filter((id) => id !== userId);
        if (!user.friends.includes(requesterId)) user.friends.push(requesterId);
        if (!requester.friends.includes(userId)) requester.friends.push(userId);
        await this.save();
        return { ok: true };
        });
    }

    async reject(userId, requesterId) {
        return this.withMutation(async () => {
            const user = this.get(userId);
        const requester = this.get(requesterId);
        if (!user || !requester) return { ok: false, reason: 'Demande introuvable.' };
        user.incoming = user.incoming.filter((id) => id !== requesterId);
        requester.outgoing = requester.outgoing.filter((id) => id !== userId);
        await this.save();
        return { ok: true };
        });
    }

    async remove(userId, friendId) {
        return this.withMutation(async () => {
            const user = this.get(userId);
        const friend = this.get(friendId);
        if (!user || !friend) return { ok: false, reason: 'Ami introuvable.' };
        user.friends = user.friends.filter((id) => id !== friendId);
        friend.friends = friend.friends.filter((id) => id !== userId);
        user.incoming = user.incoming.filter((id) => id !== friendId);
        user.outgoing = user.outgoing.filter((id) => id !== friendId);
        friend.incoming = friend.incoming.filter((id) => id !== userId);
        friend.outgoing = friend.outgoing.filter((id) => id !== userId);
        await this.save();
        return { ok: true };
        });
    }

    areFriends(a, b) {
        return !!this.get(a)?.friends?.includes(b);
    }
}

module.exports = { FriendsStore, publicAccount };
