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

// Déplace le bouton central d'un stick tactile (0, 0 = au centre)
function setKnob(knob, dx, dy) {
    knob?.style.setProperty('transform', `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`);
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
        // Commandes tactiles (voir bindTouchControls) : un doigt par commande
        this.touch = {
            moveId: null, moveX: 0, moveY: 0,         // joystick de déplacement (gauche)
            originX: 0, originY: 0, moveRadius: 48,
            fireId: null, fireX: 0, fireY: 0, fireRadius: 48, // stick de tir (droite)
            aimX: 1, aimY: 0, aiming: false, fired: false, holdTimer: 0,
            actionId: null                             // bouton Action (maintenu = réanimer)
        };
        this._touchEls = {};

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
            const slot = /^Digit([1-6])$/.exec(e.code);
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
            this.resetTouch();
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

    /*
       Commandes tactiles (game.html, #touchControls) — volontairement réduites à l'essentiel :
       - joystick GAUCHE flottant : il apparaît sous le doigt, n'importe où dans la zone de gauche ;
       - stick de TIR à droite : glisser = viser et tirer dans cette direction,
         maintenir sans glisser = tirer devant soi, simple appui = un tir (ou utiliser un soin) ;
       - bouton ACTION : sauter du vaisseau, ouvrir / ramasser, maintenu = réanimer ;
       - bouton SAC : inventaire. La carte s'ouvre en touchant la minimap (hud.js).
    */
    bindTouchControls(handlers) {
        const moveZone = document.getElementById('touchMoveZone');
        const joystick = moveZone?.querySelector('.touch-joystick');
        const moveKnob = joystick?.querySelector('.touch-stick');
        const fire = document.getElementById('touchFire');
        const fireKnob = fire?.querySelector('.touch-fire-knob');
        const actionBtn = document.getElementById('touchAction');
        const invBtn = document.getElementById('touchInventory');
        this._touchEls = { moveZone, joystick, moveKnob, fire, fireKnob, actionBtn };

        const t = this.touch;
        const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch { /* déjà relâché */ } };
        const ends = ['pointerup', 'pointercancel', 'lostpointercapture'];
        // Décalage du doigt limité au rayon du stick : position du bouton + direction (-1..1)
        const stick = (dx, dy, radius) => {
            const dist = Math.hypot(dx, dy);
            const k = dist > radius ? radius / dist : 1;
            const cx = dx * k;
            const cy = dy * k;
            return { cx, cy, nx: cx / radius, ny: cy / radius, amount: Math.min(1, dist / radius) };
        };

        /* ----- Joystick de déplacement (flottant) ----- */
        const updateMove = (e) => {
            if (t.moveId !== e.pointerId) return;
            e.preventDefault();
            const v = stick(e.clientX - t.originX, e.clientY - t.originY, t.moveRadius);
            const moving = v.amount > 0.15; // petite zone morte : le personnage ne glisse pas tout seul
            t.moveX = moving ? v.nx : 0;
            t.moveY = moving ? v.ny : 0;
            setKnob(moveKnob, v.cx, v.cy);
        };
        moveZone?.addEventListener('pointerdown', (e) => {
            if (t.moveId !== null || !joystick) return;
            e.preventDefault();
            const zone = moveZone.getBoundingClientRect();
            const r = (joystick.offsetWidth || 120) / 2;
            // Le joystick vient sous le doigt, sans dépasser de la zone
            const x = Math.min(Math.max(e.clientX - zone.left, r), Math.max(r, zone.width - r));
            const y = Math.min(Math.max(e.clientY - zone.top, r), Math.max(r, zone.height - r));
            t.moveId = e.pointerId;
            t.originX = zone.left + x;
            t.originY = zone.top + y;
            t.moveRadius = r * 0.78;
            joystick.style.left = `${x - r}px`;
            joystick.style.top = `${y - r}px`;
            joystick.style.bottom = 'auto';
            moveZone.classList.add('is-active');
            capture(moveZone, e);
            updateMove(e);
        }, { passive: false });
        moveZone?.addEventListener('pointermove', updateMove, { passive: false });
        ends.forEach(type => moveZone?.addEventListener(type, (e) => {
            if (t.moveId === e.pointerId) this.resetMove();
        }));

        /* ----- Stick de tir ----- */
        const startFiring = () => {
            if (t.fired) return;
            t.fired = true;
            this.mouse.down = true;
            this.mouse.pressed = true;
            this.mouse.released = false;
            this.mouse.downAt = performance.now();
        };
        fire?.addEventListener('pointerdown', (e) => {
            if (t.fireId !== null) return;
            e.preventDefault();
            const rect = fire.getBoundingClientRect();
            t.fireId = e.pointerId;
            t.fireX = rect.left + rect.width / 2;
            t.fireY = rect.top + rect.height / 2;
            t.fireRadius = rect.width * 0.42;
            t.fired = false;
            t.aiming = false;
            fire.classList.add('is-active');
            capture(fire, e);
            // Maintenu sans glisser : tir automatique droit devant
            clearTimeout(t.holdTimer);
            const id = e.pointerId;
            t.holdTimer = setTimeout(() => { if (t.fireId === id) startFiring(); }, 180);
        }, { passive: false });
        fire?.addEventListener('pointermove', (e) => {
            if (t.fireId !== e.pointerId) return;
            e.preventDefault();
            const v = stick(e.clientX - t.fireX, e.clientY - t.fireY, t.fireRadius);
            setKnob(fireKnob, v.cx, v.cy);
            if (v.amount < 0.25) return; // un appui un peu de travers ne change pas la visée
            const len = Math.hypot(v.cx, v.cy) || 1;
            t.aimX = v.cx / len;
            t.aimY = v.cy / len;
            t.aiming = true;
            startFiring();
        }, { passive: false });
        ends.forEach(type => fire?.addEventListener(type, (e) => {
            if (t.fireId !== e.pointerId) return;
            // Simple appui (relâché avant le tir auto) : un seul tir, ou utiliser le soin en main
            if (!t.fired && type === 'pointerup') {
                this.mouse.pressed = true;
                this.mouse.downAt = performance.now();
            }
            this.resetFire();
        }));

        /* ----- Bouton Action (sauter / ouvrir / ramasser ; maintenu = réanimer) ----- */
        const runAction = () => {
            handlers.onJump?.();     // ne fait rien hors du vaisseau
            handlers.onInteract?.(); // ne fait rien hors du sol
        };
        actionBtn?.addEventListener('pointerdown', (e) => {
            if (t.actionId !== null) return;
            e.preventDefault();
            t.actionId = e.pointerId;
            capture(actionBtn, e);
            actionBtn.classList.add('is-pressed');
            this.keys.add('KeyE'); // la réanimation se fait tant que E est « enfoncé »
            runAction();
        }, { passive: false });
        ends.forEach(type => actionBtn?.addEventListener(type, (e) => {
            if (t.actionId === e.pointerId) this.resetAction();
        }));
        // Activation au clavier (Entrée / Espace sur le bouton) : même action
        actionBtn?.addEventListener('click', (e) => { if (e.detail === 0) runAction(); });

        /* ----- Bouton Sac (inventaire) ----- */
        invBtn?.addEventListener('click', () => handlers.onInventory?.());
    }

    resetMove() {
        const { moveZone, joystick, moveKnob } = this._touchEls;
        this.touch.moveId = null;
        this.touch.moveX = 0;
        this.touch.moveY = 0;
        moveZone?.classList.remove('is-active');
        joystick?.style.removeProperty('left');
        joystick?.style.removeProperty('top');
        joystick?.style.removeProperty('bottom');
        setKnob(moveKnob, 0, 0);
    }

    resetFire() {
        const { fire, fireKnob } = this._touchEls;
        const t = this.touch;
        clearTimeout(t.holdTimer);
        const wasHeld = t.fireId !== null;
        t.fireId = null;
        t.aiming = false;
        t.fired = false;
        if (wasHeld) {
            this.mouse.down = false;
            this.mouse.released = true;
            this.mouse.pressDuration = Math.max(0, performance.now() - this.mouse.downAt);
        }
        fire?.classList.remove('is-active');
        setKnob(fireKnob, 0, 0);
    }

    resetAction() {
        this.touch.actionId = null;
        this.keys.delete('KeyE');
        this._touchEls.actionBtn?.classList.remove('is-pressed');
    }

    resetTouch() {
        this.resetMove();
        this.resetFire();
        this.resetAction();
    }

    // HUD tactile affiché (dernier moyen utilisé = le doigt, voir js/mobile-screen.js)
    get touchMode() {
        return document.documentElement.classList.contains('touch-ui');
    }

    // Direction visée avec le stick de tir (vecteur unitaire), ou null s'il n'est pas tenu
    touchAimDir() {
        const t = this.touch;
        return t.fireId !== null && t.aiming ? { x: t.aimX, y: t.aimY } : null;
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

    // Direction voulue : -1, 0 ou 1 sur chaque axe au clavier, valeurs continues au joystick
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
