/* ==================================
   STOCKAGE MYSQL - FOR2D ROYAL
   Comptes, amis, sessions et profils persistants.
   ================================== */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { isAdminName } = require('./admin-config.js');

const DATA_ROOT = path.resolve(__dirname, '..');
const ACCOUNT_ID_RE = /^acc_[a-f0-9]{32}$/;
const USERNAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}_. -]{2,15}$/u;
const PASSWORD = { N: 65536, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const KEY_LEN = 64;
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const PROFILE_MAX_BYTES = 256 * 1024;

function canonicalName(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('fr-FR');
}

function displayName(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function validPassword(value) {
    return typeof value === 'string' && value.length >= 8 && value.length <= 128;
}

function publicAccount(account) {
    return account ? {
        id: account.id,
        name: account.name,
        isAdmin: isAdminName(account.name)
    } : null;
}

function scryptAsync(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, KEY_LEN, PASSWORD, (error, key) => error ? reject(error) : resolve(key));
    });
}

function parseJson(raw, fallback = null) {
    try { return JSON.parse(raw); } catch { return fallback; }
}

function safeInt(value, max = 1000000000) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : 0;
}

function safeIds(value, max = 500) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id) => typeof id === 'string' && /^[a-z0-9][a-z0-9_.-]{0,63}$/i.test(id)).slice(0, max))];
}

function localPassword() {
    if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim()) return process.env.DB_PASSWORD.trim();
    // Fallback uniquement pour le développement local. En production, utiliser DB_PASSWORD.
    for (const filename of ['mdp.md', 'mdp']) {
        try {
            const value = fs.readFileSync(path.join(DATA_ROOT, filename), 'utf8').replace(/^\uFEFF/, '').trim();
            if (value) return value;
        } catch {}
    }
    return '';
}

function dbConfig() {
    const password = localPassword();
    if (!password) console.error('[DB] DB_PASSWORD manquante. Configure cette variable dans Hostinger.');
    return {
        host: process.env.DB_HOST || 'srv1179.hstgr.io',
        port: Number(process.env.DB_PORT || 3306),
        user: process.env.DB_USER || 'u644174852_Root_Royal',
        password,
        database: process.env.DB_NAME || 'u644174852_For2DRoyal',
        connectTimeout: 10000,
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
        queueLimit: 0,
        charset: 'utf8mb4'
    };
}

const DB_RETRY_DELAY = 15000; // ms entre deux tentatives de reconnexion à MySQL

class MySqlStore {
    constructor() {
        this.pool = mysql.createPool(dbConfig());
        this.available = false;
        this.lastAttempt = 0;
        this.pending = null;
        this.ready = this.ensureReady(true);
    }

    // Prépare la base (tables). En cas d'échec, une nouvelle tentative est faite
    // au plus toutes les 15 s : le serveur se répare seul si MySQL revient.
    ensureReady(force = false) {
        if (this.available) return Promise.resolve(true);
        if (this.pending) return this.pending;
        if (!force && Date.now() - this.lastAttempt < DB_RETRY_DELAY) return Promise.resolve(false);
        this.lastAttempt = Date.now();
        this.pending = this.initSchema()
            .then(() => {
                this.available = true;
                this.readyError = null;
                console.log('[DB] MySQL prêt.');
                return true;
            })
            .catch((error) => {
                this.readyError = error;
                console.error(`[DB] MySQL indisponible (${error.code || 'UNKNOWN'}): ${error.message}`);
                return false;
            })
            .finally(() => { this.pending = null; });
        return this.pending;
    }

    async initSchema() {
        const statements = [
            `CREATE TABLE IF NOT EXISTS accounts (
                id VARCHAR(64) NOT NULL PRIMARY KEY,
                name VARCHAR(16) NOT NULL,
                canonical VARCHAR(64) NOT NULL UNIQUE,
                password_salt CHAR(32) NOT NULL,
                password_hash CHAR(128) NOT NULL,
                created_at BIGINT UNSIGNED NOT NULL,
                updated_at BIGINT UNSIGNED NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS friend_requests (
                from_id VARCHAR(64) NOT NULL,
                to_id VARCHAR(64) NOT NULL,
                created_at BIGINT UNSIGNED NOT NULL,
                PRIMARY KEY (from_id, to_id),
                INDEX idx_friend_requests_to (to_id),
                CONSTRAINT fk_friend_requests_from FOREIGN KEY (from_id) REFERENCES accounts(id) ON DELETE CASCADE,
                CONSTRAINT fk_friend_requests_to FOREIGN KEY (to_id) REFERENCES accounts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS friend_links (
                account_id VARCHAR(64) NOT NULL,
                friend_id VARCHAR(64) NOT NULL,
                created_at BIGINT UNSIGNED NOT NULL,
                PRIMARY KEY (account_id, friend_id),
                CONSTRAINT fk_friend_links_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
                CONSTRAINT fk_friend_links_friend FOREIGN KEY (friend_id) REFERENCES accounts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS account_sessions (
                token_hash CHAR(64) NOT NULL PRIMARY KEY,
                account_id VARCHAR(64) NOT NULL,
                created_at BIGINT UNSIGNED NOT NULL,
                last_used_at BIGINT UNSIGNED NOT NULL,
                expires_at BIGINT UNSIGNED NOT NULL,
                INDEX idx_account_sessions_account (account_id),
                CONSTRAINT fk_account_sessions_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
            `CREATE TABLE IF NOT EXISTS account_profiles (
                account_id VARCHAR(64) NOT NULL PRIMARY KEY,
                schema_version INT UNSIGNED NOT NULL DEFAULT 1,
                profile_json LONGTEXT NOT NULL,
                created_at BIGINT UNSIGNED NOT NULL,
                updated_at BIGINT UNSIGNED NOT NULL,
                CONSTRAINT fk_account_profiles_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        ];
        for (const statement of statements) await this.pool.query(statement);
    }

    validateUsername(raw) {
        const name = displayName(raw);
        if (!USERNAME_RE.test(name)) return { ok: false, reason: 'Pseudo : 3 à 16 caractères, lettres, chiffres, espaces, _ . ou -.' };
        return { ok: true, name, canonical: canonicalName(name) };
    }

    async get(id) {
        if (!id) return null;
        const [rows] = await this.pool.execute(
            'SELECT id, name, canonical, password_salt AS salt, password_hash AS hash, created_at AS createdAt FROM accounts WHERE id = ? LIMIT 1',
            [id]
        );
        return rows[0] || null;
    }

    async getPublic(id) {
        return publicAccount(await this.get(id));
    }

    async findByName(raw) {
        const [rows] = await this.pool.execute(
            'SELECT id, name, canonical, password_salt AS salt, password_hash AS hash, created_at AS createdAt FROM accounts WHERE canonical = ? LIMIT 1',
            [canonicalName(raw)]
        );
        return rows[0] || null;
    }

    async register(rawName, password) {
        const checked = this.validateUsername(rawName);
        if (!checked.ok) return checked;
        if (!validPassword(password)) return { ok: false, reason: 'Mot de passe : 8 à 128 caractères.' };

        const id = `acc_${crypto.randomBytes(16).toString('hex')}`;
        const salt = crypto.randomBytes(16);
        const hash = await scryptAsync(password, salt);
        const now = Date.now();
        try {
            await this.pool.execute(
                `INSERT INTO accounts (id, name, canonical, password_salt, password_hash, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [id, checked.name, checked.canonical, salt.toString('hex'), hash.toString('hex'), now, now]
            );
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return { ok: false, reason: 'Ce pseudo est déjà utilisé.' };
            throw error;
        }
        return { ok: true, account: { id, name: checked.name }, isNew: true };
    }

    async verify(rawName, password) {
        const account = await this.findByName(rawName);
        if (!account || !validPassword(password)) return { ok: false, reason: 'Pseudo ou mot de passe incorrect.' };
        const expected = Buffer.from(account.hash, 'hex');
        const actual = await scryptAsync(password, Buffer.from(account.salt, 'hex'));
        if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
            return { ok: false, reason: 'Pseudo ou mot de passe incorrect.' };
        }
        return { ok: true, account: publicAccount(account), isNew: false };
    }

    async rename(id, rawName) {
        const account = await this.get(id);
        if (!account) return { ok: false, reason: 'Compte introuvable.' };
        const checked = this.validateUsername(rawName);
        if (!checked.ok) return checked;
        if (account.canonical === checked.canonical) return { ok: true, account: publicAccount(account) };
        try {
            await this.pool.execute('UPDATE accounts SET name = ?, canonical = ?, updated_at = ? WHERE id = ?', [checked.name, checked.canonical, Date.now(), id]);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') return { ok: false, reason: 'Ce pseudo est déjà utilisé.' };
            throw error;
        }
        return { ok: true, account: { id, name: checked.name } };
    }

    async list(id) {
        const account = await this.getPublic(id);
        if (!account) return null;
        const [friends] = await this.pool.execute(
            `SELECT a.id, a.name FROM friend_links l JOIN accounts a ON a.id = l.friend_id
             WHERE l.account_id = ? ORDER BY a.name`, [id]
        );
        const [incoming] = await this.pool.execute(
            `SELECT a.id, a.name FROM friend_requests r JOIN accounts a ON a.id = r.from_id
             WHERE r.to_id = ? ORDER BY r.created_at`, [id]
        );
        const [outgoing] = await this.pool.execute(
            `SELECT a.id, a.name FROM friend_requests r JOIN accounts a ON a.id = r.to_id
             WHERE r.from_id = ? ORDER BY r.created_at`, [id]
        );
        return { account, friends, incoming, outgoing };
    }

    async request(fromId, rawTarget) {
        const target = await this.findByName(rawTarget);
        if (!target) return { ok: false, reason: 'Pseudo introuvable.' };
        if (fromId === target.id) return { ok: false, reason: 'Tu ne peux pas t’ajouter toi-même.' };
        if (await this.areFriends(fromId, target.id)) return { ok: false, reason: 'Vous êtes déjà amis.' };

        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            const [reverse] = await connection.execute('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? FOR UPDATE', [target.id, fromId]);
            if (reverse.length) {
                await connection.execute('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [target.id, fromId, fromId, target.id]);
                await connection.execute('INSERT IGNORE INTO friend_links (account_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)', [fromId, target.id, Date.now(), target.id, fromId, Date.now()]);
                await connection.commit();
                return { ok: true, target: publicAccount(target), autoAccepted: true };
            }
            const [existing] = await connection.execute('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?', [fromId, target.id]);
            if (existing.length) {
                await connection.rollback();
                return { ok: false, reason: 'Demande déjà envoyée.' };
            }
            await connection.execute('INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)', [fromId, target.id, Date.now()]);
            await connection.commit();
            return { ok: true, target: publicAccount(target), autoAccepted: false };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async accept(userId, requesterId) {
        const connection = await this.pool.getConnection();
        try {
            await connection.beginTransaction();
            const [request] = await connection.execute('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ? FOR UPDATE', [requesterId, userId]);
            if (!request.length) {
                await connection.rollback();
                return { ok: false, reason: 'Demande introuvable.' };
            }
            await connection.execute('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?', [requesterId, userId]);
            await connection.execute('INSERT IGNORE INTO friend_links (account_id, friend_id, created_at) VALUES (?, ?, ?), (?, ?, ?)', [userId, requesterId, Date.now(), requesterId, userId, Date.now()]);
            await connection.commit();
            return { ok: true };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async reject(userId, requesterId) {
        const [result] = await this.pool.execute('DELETE FROM friend_requests WHERE from_id = ? AND to_id = ?', [requesterId, userId]);
        return result.affectedRows ? { ok: true } : { ok: false, reason: 'Demande introuvable.' };
    }

    async remove(userId, friendId) {
        const [result] = await this.pool.execute(
            'DELETE FROM friend_links WHERE (account_id = ? AND friend_id = ?) OR (account_id = ? AND friend_id = ?)',
            [userId, friendId, friendId, userId]
        );
        if (!result.affectedRows) return { ok: false, reason: 'Ami introuvable.' };
        await this.pool.execute('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', [userId, friendId, friendId, userId]);
        return { ok: true };
    }

    async areFriends(a, b) {
        const [rows] = await this.pool.execute('SELECT 1 FROM friend_links WHERE account_id = ? AND friend_id = ? LIMIT 1', [a, b]);
        return rows.length > 0;
    }

    tokenHash(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    async createSession(accountId) {
        const token = crypto.randomBytes(32).toString('hex');
        const now = Date.now();
        await this.pool.execute(
            'INSERT INTO account_sessions (token_hash, account_id, created_at, last_used_at, expires_at) VALUES (?, ?, ?, ?, ?)',
            [this.tokenHash(token), accountId, now, now, now + SESSION_TTL]
        );
        return token;
    }

    async authenticateSession(token) {
        if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
        const hash = this.tokenHash(token);
        const [rows] = await this.pool.execute(
            `SELECT s.account_id, s.expires_at, a.name FROM account_sessions s
             JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? LIMIT 1`, [hash]
        );
        const session = rows[0];
        if (!session || Number(session.expires_at) < Date.now()) {
            await this.pool.execute('DELETE FROM account_sessions WHERE token_hash = ?', [hash]);
            return null;
        }
        const expires = Date.now() + SESSION_TTL;
        await this.pool.execute('UPDATE account_sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?', [Date.now(), expires, hash]);
        return { accountId: session.account_id, name: session.name, expiresAt: expires };
    }

    async revokeSession(token) {
        if (typeof token !== 'string' || !token) return;
        await this.pool.execute('DELETE FROM account_sessions WHERE token_hash = ?', [this.tokenHash(token)]);
    }

    normalizeProfile(raw, accountName) {
        const source = raw && typeof raw === 'object' ? raw : {};
        const p = source.progress && typeof source.progress === 'object' ? source.progress : {};
        const statsSource = p.stats && typeof p.stats === 'object' ? p.stats : {};
        const statKeys = ['matches', 'wins', 'top10', 'top3', 'kills', 'deaths', 'damage', 'chests', 'timePlayed', 'bestKills', 'bestPlace', 'totalXp'];
        const stats = Object.fromEntries(statKeys.map((key) => [key, safeInt(statsSource[key])]));
        const history = Array.isArray(p.history) ? p.history.slice(0, 20).map((h) => ({
            date: safeInt(h?.date, 9007199254740991), win: h?.win === true, place: safeInt(h?.place, 1000), total: safeInt(h?.total, 1000),
            kills: safeInt(h?.kills), damage: safeInt(h?.damage), survival: safeInt(h?.survival, 9007199254740991), xp: safeInt(h?.xp)
        })) : [];
        const c = source.cosmetics && typeof source.cosmetics === 'object' ? source.cosmetics : {};
        const cleanCosmetics = {
            pixies: safeInt(c.pixies, 10000000), owned: safeIds(c.owned), equipped: typeof c.equipped === 'string' ? c.equipped.slice(0, 64) : 'recrue',
            backpack: typeof c.backpack === 'string' ? c.backpack.slice(0, 64) : null,
            pickaxe: typeof c.pickaxe === 'string' ? c.pickaxe.slice(0, 64) : null,
            glider: typeof c.glider === 'string' ? c.glider.slice(0, 64) : null,
            emotes: Array.isArray(c.emotes) ? c.emotes.slice(0, 4).map((id) => typeof id === 'string' ? id.slice(0, 64) : null) : [],
            giftClaimed: c.giftClaimed === true, redeemed: safeIds(c.redeemed, 100)
        };
        return {
            schemaVersion: 1,
            progress: { name: accountName, level: Math.max(1, safeInt(p.level, 100000)), xp: safeInt(p.xp), stats, history, premium: p.premium === true, claimed: safeIds(p.claimed, 100) },
            cosmetics: cleanCosmetics
        };
    }

    async getProfile(accountId) {
        const [rows] = await this.pool.execute('SELECT schema_version, profile_json, updated_at FROM account_profiles WHERE account_id = ? LIMIT 1', [accountId]);
        if (!rows.length) return null;
        const profile = parseJson(rows[0].profile_json, null);
        return profile ? { ...profile, schemaVersion: rows[0].schema_version, updatedAt: Number(rows[0].updated_at) } : null;
    }

    async importProfile(accountId, rawProfile) {
        const account = await this.get(accountId);
        if (!account) return { ok: false, reason: 'Compte introuvable.' };
        const normalized = this.normalizeProfile(rawProfile, account.name);
        const json = JSON.stringify(normalized);
        if (Buffer.byteLength(json, 'utf8') > PROFILE_MAX_BYTES) return { ok: false, reason: 'Profil trop volumineux.' };
        const now = Date.now();
        try {
            // Import unique : jamais d'écrasement d'un profil existant (clé primaire account_id)
            await this.pool.execute(
                'INSERT INTO account_profiles (account_id, schema_version, profile_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
                [accountId, 1, json, now, now]
            );
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                return { ok: false, reason: 'Ce compte possède déjà un profil.', conflict: true, profile: await this.getProfile(accountId) };
            }
            throw error;
        }
        return { ok: true, imported: true, profile: { ...normalized, updatedAt: now }, updatedAt: now };
    }

    async saveProfile(accountId, rawProfile) {
        const account = await this.get(accountId);
        if (!account) return { ok: false, reason: 'Compte introuvable.' };
        const normalized = this.normalizeProfile(rawProfile, account.name);
        const json = JSON.stringify(normalized);
        if (Buffer.byteLength(json, 'utf8') > PROFILE_MAX_BYTES) return { ok: false, reason: 'Profil trop volumineux.' };
        const now = Date.now();
        await this.pool.execute(
            `INSERT INTO account_profiles (account_id, schema_version, profile_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE schema_version = VALUES(schema_version), profile_json = VALUES(profile_json), updated_at = VALUES(updated_at)`,
            [accountId, 1, json, now, now]
        );
        return { ok: true, profile: { ...normalized, updatedAt: now }, updatedAt: now };
    }
}

module.exports = { MySqlStore, publicAccount, SESSION_TTL };
