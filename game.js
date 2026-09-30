// Configuration du jeu
const CONFIG = {
    canvasWidth: 1600,
    canvasHeight: 900,
    playerSpeed: 5,
    jumpPower: 15,
    gravity: 0.8,
    bulletSpeed: 10,
    enemySpeed: 2
};

// Variables globales
let canvas, ctx;
let gameState = 'menu'; // 'menu' ou 'playing'
let keys = {};
let player;
let enemies = [];
let bullets = [];
let items = [];
let buildings = [];
let particles = [];
let storm = { radius: 2000, x: 800, y: 450, shrinking: false };
let playersAlive = 100;
let stormTimer = 150; // secondes

// Classe Joueur
class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 60;
        this.velocityX = 0;
        this.velocityY = 0;
        this.health = 100;
        this.shield = 0;
        this.isJumping = false;
        this.onGround = false;
        this.direction = 1; // 1 = droite, -1 = gauche
        this.weapon = { type: 'rifle', ammo: 30, damage: 20 };
        this.materials = { wood: 0, brick: 0, metal: 0 };
        this.color = '#FF6B35';
    }

    update() {
        // Mouvement horizontal
        if (keys['ArrowLeft'] || keys['q']) {
            this.velocityX = -CONFIG.playerSpeed;
            this.direction = -1;
        } else if (keys['ArrowRight'] || keys['d']) {
            this.velocityX = CONFIG.playerSpeed;
            this.direction = 1;
        } else {
            this.velocityX *= 0.8;
        }

        // Saut
        if ((keys['ArrowUp'] || keys[' '] || keys['z']) && this.onGround) {
            this.velocityY = -CONFIG.jumpPower;
            this.isJumping = true;
            this.onGround = false;
        }

        // Gravité
        this.velocityY += CONFIG.gravity;

        // Mise à jour position
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Collision avec le sol
        if (this.y + this.height >= CONFIG.canvasHeight - 50) {
            this.y = CONFIG.canvasHeight - 50 - this.height;
            this.velocityY = 0;
            this.onGround = true;
            this.isJumping = false;
        }

        // Limites du canvas
        if (this.x < 0) this.x = 0;
        if (this.x + this.width > CONFIG.canvasWidth) this.x = CONFIG.canvasWidth - this.width;

        // Vérifier collision avec les bâtiments
        this.checkBuildingCollision();

        // Vérifier si dans la tempête
        this.checkStormDamage();
    }

    checkBuildingCollision() {
        buildings.forEach(building => {
            if (this.x < building.x + building.width &&
                this.x + this.width > building.x &&
                this.y < building.y + building.height &&
                this.y + this.height > building.y) {
                
                // Collision par le haut
                if (this.velocityY > 0 && this.y + this.height - this.velocityY <= building.y) {
                    this.y = building.y - this.height;
                    this.velocityY = 0;
                    this.onGround = true;
                    this.isJumping = false;
                }
            }
        });
    }

    checkStormDamage() {
        const dx = this.x + this.width / 2 - storm.x;
        const dy = this.y + this.height / 2 - storm.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > storm.radius) {
            this.takeDamage(1);
        }
    }

    shoot() {
        if (this.weapon.ammo > 0) {
            const bulletX = this.x + (this.direction > 0 ? this.width : 0);
            const bulletY = this.y + this.height / 2;
            bullets.push(new Bullet(bulletX, bulletY, this.direction));
            this.weapon.ammo--;
            updateWeaponUI();
            
            // Particules de tir
            for (let i = 0; i < 5; i++) {
                particles.push(new Particle(bulletX, bulletY, '#FFD700'));
            }
        }
    }

    takeDamage(amount) {
        if (this.shield > 0) {
            this.shield -= amount;
            if (this.shield < 0) {
                this.health += this.shield;
                this.shield = 0;
            }
        } else {
            this.health -= amount;
        }
        
        this.health = Math.max(0, this.health);
        this.shield = Math.max(0, this.shield);
        updateHealthUI();
        
        if (this.health <= 0) {
            gameOver();
        }
    }

    collectItem(item) {
        switch(item.type) {
            case 'weapon':
                this.weapon = item.data;
                showNotification(`Arme récupérée: ${item.data.type}`, 'item');
                break;
            case 'shield':
                this.shield = Math.min(100, this.shield + item.data.amount);
                showNotification(`+${item.data.amount} Bouclier`, 'item');
                break;
            case 'health':
                this.health = Math.min(100, this.health + item.data.amount);
                showNotification(`+${item.data.amount} Vie`, 'item');
                break;
            case 'material':
                this.materials[item.data.material] += item.data.amount;
                showNotification(`+${item.data.amount} ${item.data.material}`, 'item');
                updateMaterialsUI();
                break;
        }
        updateHealthUI();
    }

    draw() {
        // Ombre
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.ellipse(this.x + this.width / 2, this.y + this.height, this.width / 2, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Corps du joueur
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Tête
        ctx.fillStyle = '#FFB88C';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 15, 12, 0, Math.PI * 2);
        ctx.fill();

        // Arme
        ctx.fillStyle = '#333';
        if (this.direction > 0) {
            ctx.fillRect(this.x + this.width, this.y + 25, 15, 5);
        } else {
            ctx.fillRect(this.x - 15, this.y + 25, 15, 5);
        }

        // Nom du joueur
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('VOUS', this.x + this.width / 2, this.y - 10);
    }
}

// Classe Ennemi
class Enemy {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 40;
        this.height = 60;
        this.velocityY = 0;
        this.health = 100;
        this.direction = Math.random() > 0.5 ? 1 : -1;
        this.moveTimer = 0;
        this.shootTimer = 0;
        this.color = '#' + Math.floor(Math.random()*16777215).toString(16);
        this.onGround = false;
    }

    update() {
        // IA simple
        this.moveTimer++;
        this.shootTimer++;

        // Changer de direction aléatoirement
        if (this.moveTimer > 120) {
            this.direction *= -1;
            this.moveTimer = 0;
        }

        // Mouvement
        this.x += this.direction * CONFIG.enemySpeed;

        // Gravité
        this.velocityY += CONFIG.gravity;
        this.y += this.velocityY;

        // Collision sol
        if (this.y + this.height >= CONFIG.canvasHeight - 50) {
            this.y = CONFIG.canvasHeight - 50 - this.height;
            this.velocityY = 0;
            this.onGround = true;
        }

        // Limites
        if (this.x < 0 || this.x + this.width > CONFIG.canvasWidth) {
            this.direction *= -1;
            this.x = Math.max(0, Math.min(this.x, CONFIG.canvasWidth - this.width));
        }

        // Tirer vers le joueur
        if (this.shootTimer > 180 && Math.random() > 0.7) {
            const distToPlayer = Math.abs(this.x - player.x);
            if (distToPlayer < 400) {
                const shootDir = this.x < player.x ? 1 : -1;
                bullets.push(new Bullet(this.x + this.width / 2, this.y + this.height / 2, shootDir, true));
                this.shootTimer = 0;
            }
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        // Créer des particules
        for (let i = 0; i < 20; i++) {
            particles.push(new Particle(this.x + this.width / 2, this.y + this.height / 2, this.color));
        }
        
        // Drop items
        if (Math.random() > 0.5) {
            items.push(new Item(this.x, this.y, 'material', { material: 'wood', amount: 30 }));
        }
        if (Math.random() > 0.7) {
            items.push(new Item(this.x + 30, this.y, 'shield', { amount: 25 }));
        }
        
        playersAlive--;
        updatePlayersAliveUI();
        showNotification('Élimination confirmée! +50 XP', 'elimination');
        
        const index = enemies.indexOf(this);
        if (index > -1) enemies.splice(index, 1);
    }

    draw() {
        // Ombre
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(this.x + this.width / 2, this.y + this.height, this.width / 2, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Corps
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);

        // Tête
        ctx.fillStyle = '#FFB88C';
        ctx.beginPath();
        ctx.arc(this.x + this.width / 2, this.y + 15, 12, 0, Math.PI * 2);
        ctx.fill();

        // Barre de vie
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(this.x, this.y - 10, this.width, 5);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(this.x, this.y - 10, this.width * (this.health / 100), 5);
    }
}

// Classe Balle
class Bullet {
    constructor(x, y, direction, isEnemy = false) {
        this.x = x;
        this.y = y;
        this.width = 8;
        this.height = 4;
        this.direction = direction;
        this.speed = CONFIG.bulletSpeed;
        this.isEnemy = isEnemy;
        this.damage = 20;
    }

    update() {
        this.x += this.direction * this.speed;

        // Collision avec ennemis
        if (!this.isEnemy) {
            enemies.forEach(enemy => {
                if (this.x < enemy.x + enemy.width &&
                    this.x + this.width > enemy.x &&
                    this.y < enemy.y + enemy.height &&
                    this.y + this.height > enemy.y) {
                    enemy.takeDamage(this.damage);
                    this.remove();
                }
            });
        } else {
            // Collision avec le joueur
            if (this.x < player.x + player.width &&
                this.x + this.width > player.x &&
                this.y < player.y + player.height &&
                this.y + this.height > player.y) {
                player.takeDamage(this.damage);
                this.remove();
            }
        }

        // Hors limites
        if (this.x < -10 || this.x > CONFIG.canvasWidth + 10) {
            this.remove();
        }
    }

    remove() {
        const index = bullets.indexOf(this);
        if (index > -1) bullets.splice(index, 1);
    }

    draw() {
        ctx.fillStyle = this.isEnemy ? '#ff6b6b' : '#FFD700';
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Traînée
        ctx.fillStyle = this.isEnemy ? 'rgba(255,107,107,0.3)' : 'rgba(255,215,0,0.3)';
        ctx.fillRect(this.x - this.direction * 10, this.y, 10, this.height);
    }
}

// Classe Item
class Item {
    constructor(x, y, type, data) {
        this.x = x;
        this.y = y;
        this.width = 30;
        this.height = 30;
        this.type = type;
        this.data = data;
        this.bobOffset = 0;
    }

    update() {
        this.bobOffset += 0.05;
        
        // Collision avec le joueur
        if (this.x < player.x + player.width &&
            this.x + this.width > player.x &&
            this.y < player.y + player.height &&
            this.y + this.height > player.y) {
            player.collectItem(this);
            const index = items.indexOf(this);
            if (index > -1) items.splice(index, 1);
        }
    }

    draw() {
        const bob = Math.sin(this.bobOffset) * 5;
        
        ctx.save();
        ctx.translate(this.x + this.width / 2, this.y + bob + this.height / 2);
        
        // Glow
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.getColor();
        
        switch(this.type) {
            case 'shield':
                ctx.fillStyle = '#00bfff';
                ctx.beginPath();
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'health':
                ctx.fillStyle = '#00ff00';
                ctx.fillRect(-10, -10, 20, 20);
                break;
            case 'material':
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(-10, -10, 20, 20);
                break;
            case 'weapon':
                ctx.fillStyle = '#FFD700';
                ctx.fillRect(-12, -4, 24, 8);
                break;
        }
        
        ctx.restore();
    }

    getColor() {
        switch(this.type) {
            case 'shield': return '#00bfff';
            case 'health': return '#00ff00';
            case 'material': return '#8B4513';
            case 'weapon': return '#FFD700';
            default: return 'white';
        }
    }
}

// Classe Particule
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.velocityX = (Math.random() - 0.5) * 8;
        this.velocityY = (Math.random() - 0.5) * 8;
        this.life = 1;
        this.decay = 0.02;
        this.size = Math.random() * 4 + 2;
        this.color = color;
    }

    update() {
        this.x += this.velocityX;
        this.y += this.velocityY;
        this.velocityY += 0.2;
        this.life -= this.decay;
    }

    draw() {
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.size, this.size);
        ctx.globalAlpha = 1;
    }
}

// Classe Bâtiment
class Building {
    constructor(x, y, width, height, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    draw() {
        // Ombre
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(this.x + 5, this.y + 5, this.width, this.height);
        
        // Bâtiment
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        
        // Contour
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(this.x, this.y, this.width, this.height);
        
        // Fenêtres
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < Math.floor(this.height / 40); j++) {
                ctx.fillRect(this.x + 10 + i * 25, this.y + 10 + j * 40, 15, 20);
            }
        }
    }
}

// Initialisation du jeu
function initGame() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = CONFIG.canvasWidth;
    canvas.height = CONFIG.canvasHeight;

    // Générer ID joueur aléatoire
    document.getElementById('player-id').textContent = Math.floor(Math.random() * 9000) + 1000;
}

// Démarrer le jeu
function startGame() {
    gameState = 'playing';
    document.getElementById('main-menu').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    
    // Initialiser le joueur
    player = new Player(100, 100);
    
    // Créer des ennemis
    for (let i = 0; i < 10; i++) {
        const x = Math.random() * (CONFIG.canvasWidth - 100) + 50;
        const y = 100;
        enemies.push(new Enemy(x, y));
    }
    
    // Créer des bâtiments
    buildings.push(new Building(300, CONFIG.canvasHeight - 200, 100, 150, '#8B4513'));
    buildings.push(new Building(600, CONFIG.canvasHeight - 250, 120, 200, '#A9A9A9'));
    buildings.push(new Building(1000, CONFIG.canvasHeight - 180, 80, 130, '#CD853F'));
    buildings.push(new Building(1300, CONFIG.canvasHeight - 220, 100, 170, '#708090'));
    
    // Créer des items
    spawnRandomItems();
    
    // Démarrer la boucle de jeu
    gameLoop();
}

function spawnRandomItems() {
    for (let i = 0; i < 15; i++) {
        const x = Math.random() * (CONFIG.canvasWidth - 100) + 50;
        const y = CONFIG.canvasHeight - 100;
        const rand = Math.random();
        
        if (rand > 0.7) {
            items.push(new Item(x, y, 'shield', { amount: 25 }));
        } else if (rand > 0.4) {
            items.push(new Item(x, y, 'material', { material: ['wood', 'brick', 'metal'][Math.floor(Math.random() * 3)], amount: 30 }));
        } else {
            items.push(new Item(x, y, 'health', { amount: 25 }));
        }
    }
}

// Boucle de jeu principale
function gameLoop() {
    if (gameState !== 'playing') return;
    
    // Effacer le canvas
    ctx.clearRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
    
    // Dessiner le ciel
    const gradient = ctx.createLinearGradient(0, 0, 0, CONFIG.canvasHeight);
    gradient.addColorStop(0, '#87CEEB');
    gradient.addColorStop(1, '#E0F6FF');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
    
    // Dessiner la tempête
    drawStorm();
    
    // Dessiner le sol
    ctx.fillStyle = '#228B22';
    ctx.fillRect(0, CONFIG.canvasHeight - 50, CONFIG.canvasWidth, 50);
    
    // Grille du sol
    ctx.strokeStyle = '#1a6b1a';
    ctx.lineWidth = 1;
    for (let i = 0; i < CONFIG.canvasWidth; i += 50) {
        ctx.beginPath();
        ctx.moveTo(i, CONFIG.canvasHeight - 50);
        ctx.lineTo(i, CONFIG.canvasHeight);
        ctx.stroke();
    }
    
    // Dessiner les bâtiments
    buildings.forEach(building => building.draw());
    
    // Mettre à jour et dessiner les items
    items.forEach(item => {
        item.update();
        item.draw();
    });
    
    // Mettre à jour et dessiner les balles
    bullets.forEach(bullet => {
        bullet.update();
        bullet.draw();
    });
    
    // Mettre à jour et dessiner les ennemis
    enemies.forEach(enemy => {
        enemy.update();
        enemy.draw();
    });
    
    // Mettre à jour et dessiner le joueur
    player.update();
    player.draw();
    
    // Mettre à jour et dessiner les particules
    particles = particles.filter(particle => particle.life > 0);
    particles.forEach(particle => {
        particle.update();
        particle.draw();
    });
    
    // Mettre à jour le timer de la tempête
    updateStormTimer();
    
    requestAnimationFrame(gameLoop);
}

// Dessiner la tempête
function drawStorm() {
    ctx.save();
    
    // Zone dangereuse (rouge transparent)
    ctx.fillStyle = 'rgba(138, 43, 226, 0.2)';
    ctx.fillRect(0, 0, CONFIG.canvasWidth, CONFIG.canvasHeight);
    
    // Zone sûre (effacer)
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(storm.x, storm.y, storm.radius, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalCompositeOperation = 'source-over';
    
    // Bordure de la tempête
    ctx.strokeStyle = 'rgba(138, 43, 226, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.arc(storm.x, storm.y, storm.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    
    ctx.restore();
}

// Mettre à jour le timer de la tempête
function updateStormTimer() {
    stormTimer -= 1/60;
    if (stormTimer <= 0) {
        storm.radius = Math.max(200, storm.radius - 1);
        if (stormTimer <= -30) {
            stormTimer = 150;
        }
    }
    
    const minutes = Math.floor(Math.max(0, stormTimer) / 60);
    const seconds = Math.floor(Math.max(0, stormTimer) % 60);
    document.getElementById('storm-timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Gestion des événements clavier
document.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    if (gameState === 'playing') {
        if (e.key === 'e' || e.key === 'E') {
            player.shoot();
        }
    }
});

document.addEventListener('keyup', (e) => {
    keys[e.key] = false;
});

// Gestion du clic souris pour tirer
canvas?.addEventListener('click', () => {
    if (gameState === 'playing') {
        player.shoot();
    }
});

// Fonctions UI
function updateHealthUI() {
    document.getElementById('health-bar').style.width = player.health + '%';
    document.getElementById('health-value').textContent = Math.floor(player.health);
    document.getElementById('shield-bar').style.width = player.shield + '%';
    document.getElementById('shield-value').textContent = Math.floor(player.shield);
}

function updateWeaponUI() {
    const weaponSlot = document.querySelector('.weapon-slot.active .weapon-ammo');
    if (weaponSlot) {
        weaponSlot.textContent = player.weapon.ammo;
    }
}

function updateMaterialsUI() {
    document.getElementById('wood-count').textContent = player.materials.wood;
    document.getElementById('brick-count').textContent = player.materials.brick;
    document.getElementById('metal-count').textContent = player.materials.metal;
}

function updatePlayersAliveUI() {
    document.getElementById('players-alive').textContent = playersAlive;
}

function showNotification(message, type = '') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideIn 0.5s ease-out reverse';
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

function showSettings() {
    alert('Paramètres - En construction!');
}

function showStats() {
    alert('Statistiques - En construction!');
}

function gameOver() {
    gameState = 'menu';
    alert(`Game Over! Vous avez terminé à la place ${playersAlive + 1}/100`);
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('main-menu').classList.add('active');
}

// Initialiser au chargement de la page
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGame);
} else {
    initGame();
}
