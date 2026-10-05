/* ==================================
   CONTRÔLES - FOR2D ROYAL
   e.code = touche PHYSIQUE : ZQSD en AZERTY et WASD en QWERTY
   marchent donc tous les deux sans rien changer.
   ================================== */

/*
   Raccourcis du navigateur bloqués pendant la partie.
   Sans ça, par exemple, la touche 4 en AZERTY (le caractère ') ouvre la
   « Recherche rapide » de Firefox, et / ouvre la recherche dans la page.
   On garde ce qui est utile : F5 / Ctrl+R (recharger), F11 (plein écran),
   F12 / Ctrl+Maj+I (outils de dév.), Ctrl+W / Ctrl+T (onglets),
   Échap, et tout ce qui se tape dans un vrai champ de texte.
   Le zoom navigateur Ctrl/Cmd + / - / 0 est bloqué pendant le jeu.
*/
const KEEP_FKEYS = new Set(['F5', 'F11', 'F12']);
const BLOCKED_CTRL = new Set([
    'KeyF', 'KeyG', 'KeyS', 'KeyP', 'KeyD', 'KeyU', 'KeyH', 'KeyB', 'KeyE', 'KeyK', 'KeyO', 'KeyJ', 'KeyA', 'KeyQ', 'KeyZ'
]);
const BLOCKED_ZOOM = new Set(['Equal', 'Minus', 'Digit0', 'NumpadAdd', 'NumpadSubtract', 'Numpad0']);

function isTextField(el) {
    if (!(el instanceof Element)) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(el.type);
}

// true = le navigateur ne doit pas réagir à cette touche
function shouldBlock(e) {
    // Le zoom navigateur doit rester bloqué même si le focus est dans un champ texte.
    if ((e.ctrlKey || e.metaKey) && (BLOCKED_ZOOM.has(e.code) || e.key === '+' || e.key === '-')) return true;
    if (isTextField(e.target)) return false;
    // Entrée / Espace sur un bouton du HUD (paramètres, inventaire) : on garde l'activation
    if ((e.key === 'Enter' || e.code === 'Space') && e.target instanceof Element && e.target.closest('button, a')) {
        return false;
    }
    if (/^F\d+$/.test(e.code)) return !KEEP_FKEYS.has(e.code); // F1 aide, F3 recherche, F7 curseur...
    if (e.code === 'Escape') return false;
    if (e.ctrlKey || e.metaKey) {
        if (BLOCKED_ZOOM.has(e.code)) return true; // Ctrl/Cmd +/-/0 : zoom navigateur
        if (e.shiftKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyR'].includes(e.code)) return false; // outils de dév.
        return BLOCKED_CTRL.has(e.code); // Ctrl+F (chercher), Ctrl+S (enregistrer), Ctrl+P (imprimer)...
    }
    // Toutes les autres touches (lettres, chiffres, ' / Alt, Retour arrière...) servent au jeu
    return true;
}

export class Input {
    constructor(canvas, handlers = {}) {
        this.keys = new Set();
        this.mouse = {
            x: innerWidth / 2 + 100,
            y: innerHeight / 2,
            down: false,
            pressed: false,
            released: false,
            downAt: 0,
            pressDuration: 0,
            rdown: false        // clic droit maintenu (roue d'emotes)
        };
        this.touch = {
            moveId: null,
            aimId: null,
            actionIds: new Map(),
            moveX: 0,
            moveY: 0,
            active: false
        };

        addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            // Pas de raccourci du navigateur pendant la partie (recherche rapide, défilement, focus...)
            if (shouldBlock(e)) e.preventDefault();
            if (e.repeat) return;

            if ((e.code === 'Backquote' || e.key === '²') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTextField(e.target)) {
                handlers.onAdminPanel?.();
                return;
            }

            if (e.code === 'Tab') handlers.onMapHold?.(true);   // carte tant que Tab est enfoncé
            if (e.code === 'Space') handlers.onJump?.();
            if (e.code === 'KeyE' || e.code === 'KeyF') handlers.onInteract?.();
            if (e.code === 'KeyR') handlers.onReload?.();
            if (e.code === 'KeyI') handlers.onInventory?.();

            // Pour M on regarde le caractère (en AZERTY la touche M n'a pas le code "KeyM")
            if (e.key.toLowerCase() === 'm') handlers.onMap?.();
            if (e.code === 'Escape') handlers.onEscape?.();
            const slot = /^Digit([1-5])$/.exec(e.code);
            if (slot) handlers.onSlot?.(Number(slot[1]) - 1);
        });

        // Relâcher Alt afficherait la barre de menus (Firefox) : bloqué aussi
        addEventListener('keypress', (e) => { if (shouldBlock(e)) e.preventDefault(); });
        addEventListener('keyup', (e) => {
            if ((e.key === 'Alt' || e.key === 'AltGraph') && shouldBlock(e)) e.preventDefault();
            this.keys.delete(e.code);
            if (e.code === 'Tab') handlers.onMapHold?.(false);
        });
        addEventListener('blur', () => {
            if (this.keys.has('Tab')) handlers.onMapHold?.(false);
            this.keys.clear();
            this.mouse.down = false;
            this.mouse.rdown = false;
            this.mouse.released = true;
            this.mouse.pressDuration = 0;
            this.touch.moveId = null;
            this.touch.aimId = null;
            this.touch.moveX = 0;
            this.touch.moveY = 0;
            this.touch.actionIds.clear();
            this.touch.active = false;
            document.querySelector('#touchMoveZone .touch-stick')?.style.setProperty('transform', 'translate(-50%, -50%)');
        });

        canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        // Clic gauche : down = maintenu, pressed = vient d'être enfoncé.
        // Le relâchement est gardé jusqu'à la prochaine frame : cela permet de distinguer
        // un tir court d'un maintien qui ouvre la roue d'emotes.
        canvas.addEventListener('mousedown', (e) => {
            // Clic droit maintenu : roue d'emotes (le menu du navigateur est bloqué plus bas)
            if (e.button === 2) {
                this.mouse.rdown = true;
                return;
            }
            if (e.button !== 0) return;
            this.mouse.down = true;
            this.mouse.pressed = true;
            this.mouse.released = false;
            this.mouse.downAt = performance.now();
            this.mouse.pressDuration = 0;
        });
        addEventListener('mouseup', (e) => {
            if (e.button === 2) this.mouse.rdown = false;
            if (e.button !== 0) return;
            this.mouse.down = false;
            this.mouse.released = true;
            this.mouse.pressDuration = Math.max(0, performance.now() - this.mouse.downAt);
        });
        // Pas de menu clic droit ni de glisser d'image (icônes de la hotbar) dans le jeu
        addEventListener('contextmenu', (e) => { if (!isTextField(e.target)) e.preventDefault(); });
        addEventListener('dragstart', (e) => e.preventDefault());

        // Clic molette : inventaire (partout dans la page, même au-dessus du panneau)
        addEventListener('mousedown', (e) => {
            if (e.button !== 1) return;
            e.preventDefault(); // pas de défilement automatique du navigateur
            handlers.onInventory?.();
        });
        addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });
        addEventListener('blur', () => { this.mouse.down = false; });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (e.ctrlKey || e.metaKey) return; // Ctrl/Cmd+molette : aucun zoom, ni navigateur ni caméra
            handlers.onZoom?.(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }, { passive: false });

        // Empêche le zoom navigateur à la molette avec Ctrl/Cmd, même hors du canvas.
        addEventListener('wheel', (e) => {
            if (e.ctrlKey || e.metaKey) e.preventDefault();
        }, { passive: false });
        // Safari/iOS utilise ces événements pour le pincement au lieu de wheel.
        for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
            addEventListener(type, (e) => e.preventDefault(), { passive: false });
        }
        this.bindTouchControls(handlers);
    }

    bindTouchControls(handlers) {
        const moveZone = document.getElementById('touchMoveZone');
        const aimZone = document.getElementById('touchAimZone');
        const actionButtons = document.querySelectorAll('[data-touch-action]');
        const syncTouchActive = () => {
            this.touch.active = this.touch.moveId !== null || this.touch.aimId !== null || this.touch.actionIds.size > 0;
        };

        const resetMove = (event) => {
            if (this.touch.moveId !== event.pointerId) return;
            this.touch.moveId = null;
            this.touch.moveX = 0;
            this.touch.moveY = 0;
            moveZone?.classList.remove('is-active');
            moveZone?.querySelector('.touch-stick')?.style.setProperty('transform', 'translate(-50%, -50%)');
            syncTouchActive();
        };
        const updateMove = (event) => {
            if (this.touch.moveId !== event.pointerId || !moveZone) return;
            const rect = moveZone.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const radius = Math.max(20, Math.min(rect.width, rect.height) * 0.38);
            let dx = event.clientX - cx;
            let dy = event.clientY - cy;
            const distance = Math.hypot(dx, dy);
            if (distance > radius) { dx = dx / distance * radius; dy = dy / distance * radius; }
            const dead = radius * 0.12;
            this.touch.moveX = Math.abs(dx) < dead ? 0 : dx / radius;
            this.touch.moveY = Math.abs(dy) < dead ? 0 : dy / radius;
            moveZone.querySelector('.touch-stick')?.style.setProperty('transform', `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`);
        };
        moveZone?.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' || this.touch.moveId !== null) return;
            event.preventDefault(); this.touch.active = true; this.touch.moveId = event.pointerId;
            moveZone.setPointerCapture?.(event.pointerId); moveZone.classList.add('is-active'); updateMove(event);
        }, { passive: false });
        moveZone?.addEventListener('pointermove', updateMove, { passive: false });
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => moveZone?.addEventListener(type, resetMove));

        aimZone?.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' || this.touch.aimId !== null) return;
            event.preventDefault(); this.touch.active = true; this.touch.aimId = event.pointerId;
            aimZone.setPointerCapture?.(event.pointerId); this.mouse.x = event.clientX; this.mouse.y = event.clientY;
            this.mouse.down = true; this.mouse.pressed = true; this.mouse.released = false; this.mouse.downAt = performance.now();
        }, { passive: false });
        aimZone?.addEventListener('pointermove', (event) => {
            if (this.touch.aimId !== event.pointerId) return;
            event.preventDefault(); this.mouse.x = event.clientX; this.mouse.y = event.clientY;
        }, { passive: false });
        const releaseAim = (event) => {
            if (this.touch.aimId !== event.pointerId) return;
            this.touch.aimId = null; this.mouse.down = false; this.mouse.released = true;
            this.mouse.pressDuration = Math.max(0, performance.now() - this.mouse.downAt);
            syncTouchActive();
        };
        ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => aimZone?.addEventListener(type, releaseAim));

        actionButtons.forEach((button) => {
            const action = button.dataset.touchAction;
            const holdKey = button.dataset.touchHold;
            button.addEventListener('pointerdown', (event) => {
                if (event.pointerType === 'mouse') return;
                event.preventDefault(); this.touch.active = true;
                this.touch.actionIds.set(event.pointerId, { button, holdKey }); button.setPointerCapture?.(event.pointerId);
                if (holdKey) this.keys.add(holdKey);
                else if (action === 'jump') handlers.onJump?.();
                else if (action === 'reload') handlers.onReload?.();
                else if (action === 'interact') handlers.onInteract?.();
                else if (action === 'inventory') handlers.onInventory?.();
                else if (action === 'map') handlers.onMap?.();
                else if (action === 'emote') this.mouse.rdown = true;
            }, { passive: false });
            const releaseAction = (event) => {
                const current = this.touch.actionIds.get(event.pointerId); if (!current) return;
                this.touch.actionIds.delete(event.pointerId); if (current.holdKey) this.keys.delete(current.holdKey);
                if (action === 'emote') this.mouse.rdown = false;
                syncTouchActive();
            };
            ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => button.addEventListener(type, releaseAction));
        });
    }

    isTouchActive() {
        return this.touch.active || this.touch.moveId !== null || this.touch.aimId !== null;
    }

    // Renvoie true une seule fois par clic
    consumePress() {
        const p = this.mouse.pressed;
        this.mouse.pressed = false;
        return p;
    }

    // Renvoie true une seule fois au relâchement du clic gauche
    consumeRelease() {
        const r = this.mouse.released;
        this.mouse.released = false;
        return r;
    }

    // Direction voulue (-1, 0 ou 1 sur chaque axe)
    axis() {
        if (this.touch.moveId !== null) return { x: this.touch.moveX, y: this.touch.moveY };
        const k = this.keys;
        let x = 0;
        let y = 0;
        if (k.has('KeyD') || k.has('ArrowRight')) x++;
        if (k.has('KeyA') || k.has('ArrowLeft')) x--;
        if (k.has('KeyS') || k.has('ArrowDown')) y++;
        if (k.has('KeyW') || k.has('ArrowUp')) y--;
        return { x, y };
    }
}
