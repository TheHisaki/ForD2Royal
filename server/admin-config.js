/* ==================================
   CONFIGURATION ADMIN - FOR2D ROYAL
   Les droits sont calculés côté serveur à partir du pseudo du compte.
   ================================== */

const DEFAULT_ADMIN_USERNAMES = ['thehisaki'];

function normalizeAdminName(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLocaleLowerCase('fr-FR');
}

function configuredAdminNames() {
    const fromEnvironment = String(process.env.ADMIN_USERNAMES || '')
        .split(',')
        .map(normalizeAdminName)
        .filter(Boolean);

    return new Set([...DEFAULT_ADMIN_USERNAMES.map(normalizeAdminName), ...fromEnvironment]);
}

function isAdminName(name) {
    return configuredAdminNames().has(normalizeAdminName(name));
}

function parseMatchmakingCountdown(value, fallback = 30) {
    const seconds = Number(value);
    return seconds === 3 || seconds === 30 ? seconds : fallback;
}

const INITIAL_MATCHMAKING_COUNTDOWN = parseMatchmakingCountdown(
    process.env.MATCHMAKING_COUNTDOWN_SECONDS,
    30
);

module.exports = {
    INITIAL_MATCHMAKING_COUNTDOWN,
    isAdminName,
    parseMatchmakingCountdown
};
