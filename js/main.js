/* ==================================
   MAIN - FOR2D ROYAL
   Point d'entrée principal de l'application
   ================================== */

class GameApplication {
    constructor() {
        this.currentScreen = 'lobby';
        this.init();
    }

    init() {
        console.log('🎮 FOR2D ROYAL - Initialisation...');
        
        // Vérifier les dépendances
        this.checkDependencies();
        
        // Configurer les gestionnaires globaux
        this.setupGlobalHandlers();
        
        // Démarrer l'écran de lobby
        this.showScreen('lobby');
        
        console.log('✅ Application initialisée');
    }

    checkDependencies() {
        const dependencies = {
            lobbyManager: window.lobbyManager,
            networkManager: window.networkManager
        };

        for (const [name, dep] of Object.entries(dependencies)) {
            if (!dep) {
                console.warn(`⚠️ ${name} non chargé encore`);
            } else {
                console.log(`✓ ${name} chargé`);
            }
        }
    }

    setupGlobalHandlers() {
        // Gestion des erreurs globales
        window.addEventListener('error', (e) => {
            console.error('Erreur globale:', e.error);
        });

        // Prévenir la fermeture accidentelle
        window.addEventListener('beforeunload', (e) => {
            if (window.networkManager && window.networkManager.isConnected()) {
                e.preventDefault();
                e.returnValue = 'Vous êtes connecté à une partie. Voulez-vous vraiment quitter?';
            }
        });

        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            this.handleGlobalKeyPress(e);
        });

        // Gestion du redimensionnement
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    handleGlobalKeyPress(e) {
        // ESC pour ouvrir le menu
        if (e.key === 'Escape') {
            this.toggleMenu();
        }

        // F11 pour plein écran
        if (e.key === 'F11') {
            e.preventDefault();
            this.toggleFullscreen();
        }

        // Ctrl+Enter pour Ready
        if (e.ctrlKey && e.key === 'Enter' && this.currentScreen === 'lobby') {
            if (window.lobbyManager) {
                window.lobbyManager.toggleReady();
            }
        }
    }

    toggleMenu() {
        console.log('Menu toggle');
        // À implémenter: overlay menu
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Erreur plein écran:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    handleResize() {
        // Ajuster le canvas si en jeu
        if (this.currentScreen === 'game' && window.gameManager) {
            window.gameManager.handleResize();
        }
    }

    showScreen(screenName) {
        // Cacher tous les écrans
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Afficher l'écran demandé
        const screen = document.getElementById(`${screenName}-screen`);
        if (screen) {
            screen.classList.add('active');
            this.currentScreen = screenName;
            console.log(`Écran actif: ${screenName}`);
        }
    }

    startGame() {
        this.showScreen('game');
        
        // Initialiser le jeu si pas déjà fait
        if (!window.gameManager) {
            // Le game.js sera chargé et initialisera le gameManager
            console.log('Démarrage du jeu...');
        } else {
            window.gameManager.start();
        }
    }

    returnToLobby() {
        this.showScreen('lobby');
        
        if (window.gameManager) {
            window.gameManager.stop();
        }
    }
}

// Initialisation de l'application
let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new GameApplication();
    window.app = app;
    
    // Message de bienvenue dans la console
    console.log('%c🎮 FOR2D ROYAL', 'font-size: 24px; font-weight: bold; color: #00d9ff;');
    console.log('%cBattle Royale 2D - Version Alpha', 'font-size: 14px; color: #1e90ff;');
    console.log('%cRaccourcis:', 'font-weight: bold; margin-top: 10px;');
    console.log('  ESC - Menu');
    console.log('  F11 - Plein écran');
    console.log('  Ctrl+Enter - Ready/Not Ready');
});

// Exposer les utilitaires globaux
window.FOR2D = {
    version: '0.1.0-alpha',
    showLobby: () => app.showScreen('lobby'),
    startGame: () => app.startGame(),
    disconnect: () => {
        if (window.networkManager) {
            window.networkManager.disconnect();
        }
    }
};
