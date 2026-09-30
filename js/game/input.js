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
   F12 / Ctrl+Maj+I (outils de dév.), Ctrl + / - / 0 (zoom), Ctrl+W / Ctrl+T (onglets),
   Échap, et tout ce qui se tape dans un vrai champ de texte.
*/
const KEEP_FKEYS = new Set(['F5', 'F11', 'F12']);
const BLOCKED_CTRL = new Set([
    'KeyF', 'KeyG', 'KeyS', 'KeyP', 'KeyD', 'KeyU', 'KeyH', 'KeyB', 'KeyE', 'KeyK', 'KeyO', 'KeyJ', 'KeyA', 'KeyQ', 'KeyZ'
]);

function isTextField(el) {
    if (!(el instanceof Element)) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset'].includes(el.type);
}

// true = le navigateur ne doit pas réagir à cette touche
function shouldBlock(e) {
    if (isTextField(e.target)) return false;
    // Entrée / Espace sur un bouton du HUD (paramètres, inventaire) : on garde l'activation
    if ((e.key === 'Enter' || e.code === 'Space') && e.target instanceof Element && e.target.closest('button, a')) {
        return false;
    }
    if (/^F\d+$/.test(e.code)) return !KEEP_FKEYS.has(e.code); // F1 aide, F3 recherche, F7 curseur...
    if (e.code === 'Escape') return false;
    if (e.ctrlKey || e.metaKey) {
        if (e.shiftKey && ['KeyI', 'KeyJ', 'KeyC', 'KeyR'].includes(e.code)) return false; // outils de dév.
        return BLOCKED_CTRL.has(e.code); // Ctrl+F (chercher), Ctrl+S (enregistrer), Ctrl+P (imprimer)...
    }
    // Toutes les autres touches (lettres, chiffres, ' / Alt, Retour arrière...) servent au jeu
    return true;
}

export class Input {
    constructor(canvas, handlers = {}) {
        this.keys = new Set();
        this.mouse = { x: innerWidth / 2 + 100, y: innerHeight / 2 };

        addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            // Pas de raccourci du navigateur pendant la partie (recherche rapide, défilement, focus...)
            if (shouldBlock(e)) e.preventDefault();
            if (e.repeat) return;

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
        // Évite de "rester bloqué" en marche (ou carte ouverte) quand la fenêtre perd le focus
        addEventListener('blur', () => {
            if (this.keys.has('Tab')) handlers.onMapHold?.(false);
            this.keys.clear();
        });

        canvas.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });

        // Clic gauche : down = maintenu, pressed = vient d'être enfoncé (remis à false par consumePress)
        this.mouse.down = false;
        this.mouse.pressed = false;
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            this.mouse.down = true;
            this.mouse.pressed = true;
        });
        addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouse.down = false;
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
            handlers.onZoom?.(e.deltaY < 0 ? 1.1 : 1 / 1.1);
        }, { passive: false });
    }

    // Renvoie true une seule fois par clic
    consumePress() {
        const p = this.mouse.pressed;
        this.mouse.pressed = false;
        return p;
    }

    // Direction voulue (-1, 0 ou 1 sur chaque axe)
    axis() {
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
