/* ==================================
   ÉCRAN MOBILE - FOR2D ROYAL
   Chargé tôt (script classique dans <head>) sur le lobby et le jeu :
   - classe "touch-ui" sur <html> quand on joue au doigt (le HUD tactile s'affiche),
     retirée dès qu'une vraie souris bouge (PC tactile, iPad avec trackpad) ;
   - plein écran automatique au premier toucher quand le navigateur le permet
     (Android, iPad) : la barre d'adresse et la barre de navigation disparaissent ;
   - iPhone : Safari ne permet PAS à une page de cacher sa barre. Le seul moyen est
     d'ouvrir le jeu depuis l'écran d'accueil (manifest.json) : une astuce l'explique.
   API : window.FOR2D_SCREEN = { toggleFullscreen(), isFullscreen(), canFullscreen }
   ================================== */
(() => {
    const root = document.documentElement;
    const mq = (q) => Boolean(window.matchMedia && window.matchMedia(q).matches);

    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS se présente comme un Mac
    const standalone = navigator.standalone === true || mq('(display-mode: standalone)') || mq('(display-mode: fullscreen)');
    const canFullscreen = Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

    root.classList.toggle('is-ios', isIOS);
    root.classList.toggle('is-standalone', standalone);
    root.classList.toggle('no-fullscreen', !canFullscreen);

    /* ----- HUD tactile : selon le dernier moyen utilisé (doigt ou souris) ----- */
    const setTouch = (on) => {
        if (root.classList.contains('touch-ui') === on) return;
        root.classList.toggle('touch-ui', on);
        // Le HUD change de taille (minimap...) : le jeu se recale comme pour un redimensionnement
        if (document.readyState !== 'loading') dispatchEvent(new Event('resize'));
    };
    // Test sur PC : ?touch=1 force le HUD tactile, ?touch=0 le désactive
    const forcedParam = new URLSearchParams(location.search).get('touch');
    const forced = forcedParam === '1' || forcedParam === '0';
    if (forced) setTouch(forcedParam === '1');
    else setTouch(mq('(hover: none) and (pointer: coarse)'));
    addEventListener('pointerdown', (e) => {
        if (!forced && (e.pointerType === 'touch' || e.pointerType === 'pen')) setTouch(true);
    }, { capture: true, passive: true });
    addEventListener('pointermove', (e) => {
        if (!forced && e.pointerType === 'mouse' && (e.movementX || e.movementY)) setTouch(false);
    }, { capture: true, passive: true });

    /* ----- Plein écran ----- */
    let autoAsked = false;   // une demande automatique est en cours ou a réussi
    let userLeft = false;    // le joueur a quitté le plein écran : on ne le force plus

    function lockLandscape() {
        try {
            const p = screen.orientation?.lock?.('landscape');
            p?.catch?.(() => {});
        } catch { /* non supporté : on garde l'orientation actuelle */ }
    }

    function requestFullscreen() {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen;
        if (!req || fsElement()) return Promise.resolve(false);
        try {
            return Promise.resolve(req.call(el, { navigationUI: 'hide' }))
                .then(() => { lockLandscape(); return true; })
                .catch(() => false);
        } catch {
            return Promise.resolve(false);
        }
    }

    function exitFullscreen() {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        try { Promise.resolve(exit?.call(document)).catch(() => {}); } catch { /* déjà sorti */ }
    }

    function toggleFullscreen() {
        if (fsElement()) {
            userLeft = true;
            exitFullscreen();
        } else {
            userLeft = false;
            requestFullscreen();
        }
    }

    for (const type of ['fullscreenchange', 'webkitfullscreenchange']) {
        document.addEventListener(type, () => {
            const on = Boolean(fsElement());
            root.classList.toggle('is-fullscreen', on);
            if (!on && autoAsked) userLeft = true; // geste retour, bouton... : choix du joueur respecté
        });
    }

    // Le navigateur n'accepte le plein écran que pendant un geste (fin de toucher)
    const autoFullscreen = (e) => {
        if (!root.classList.contains('touch-ui') || !canFullscreen || standalone) return;
        if (autoAsked || userLeft || fsElement()) return;
        if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        autoAsked = true;
        requestFullscreen().then((ok) => { if (!ok) autoAsked = false; }); // refusé : on réessaiera
    };
    addEventListener('pointerup', autoFullscreen, true);
    addEventListener('touchend', autoFullscreen, true);

    /* ----- iPhone dans Safari : expliquer comment jouer sans la barre ----- */
    const HINT_KEY = 'for2d-ios-fullscreen-hint';
    function showIosHint() {
        if (!isIOS || standalone || canFullscreen) return;
        try { if (localStorage.getItem(HINT_KEY) === 'off') return; } catch { /* stockage bloqué */ }
        if (document.getElementById('iosFsHint')) return;

        const style = document.createElement('style');
        style.textContent = `
#iosFsHint{position:fixed;left:50%;top:max(8px,env(safe-area-inset-top));z-index:9999;transform:translateX(-50%);
display:flex;align-items:center;gap:10px;width:min(92vw,520px);padding:9px 10px 9px 14px;border-radius:10px;
background:rgba(8,20,56,.95);border:1px solid rgba(255,224,61,.6);box-shadow:0 8px 24px rgba(0,0,0,.5);
color:#fff;font:600 13px/1.35 Rubik,'Segoe UI',Arial,sans-serif;pointer-events:auto;touch-action:manipulation}
#iosFsHint b{color:#ffe03d}
#iosFsHint button{flex:none;width:36px;height:36px;border:0;border-radius:50%;background:#ffe03d;color:#0b1d4a;
font:800 20px/1 Arial,sans-serif;cursor:pointer}`;
        document.head.appendChild(style);

        const hint = document.createElement('div');
        hint.id = 'iosFsHint';
        hint.setAttribute('role', 'status');
        const text = document.createElement('span');
        text.innerHTML = 'Plein écran sur iPhone : touche <b>Partager</b> puis <b>Sur l’écran d’accueil</b>, et lance le jeu depuis l’icône.';
        const close = document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Fermer l’astuce plein écran');
        close.addEventListener('click', () => {
            hint.remove();
            try { localStorage.setItem(HINT_KEY, 'off'); } catch { /* stockage bloqué */ }
        });
        hint.append(text, close);
        document.body.appendChild(hint);
        // Disparaît seule au bout de 12 s (réapparaît à la prochaine page tant qu'elle n'est pas fermée)
        setTimeout(() => hint.remove(), 12000);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showIosHint);
    else showIosHint();

    window.FOR2D_SCREEN = {
        toggleFullscreen,
        isFullscreen: () => Boolean(fsElement()),
        canFullscreen
    };
})();
