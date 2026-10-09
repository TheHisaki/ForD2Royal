/* ==================================
   COSMÉTIQUES - FOR2D ROYAL
   Catalogue (tenues, sacs à dos, planeurs, emotes) + profil du joueur
   (Pixies, objets possédés, chargement équipé), gardé dans le navigateur.
   Partagé par le lobby (casier, boutique, personnage) et le jeu (apparence).

   API (module ES, aussi en window.FOR2D_COSMETICS) :
   - TYPES, SLOTS, RARITY, SKINS (tenues), ITEMS (tout), getSkin(id), getItem(id)
   - Cosmetics.pixies, Cosmetics.owns(id)
   - Cosmetics.hasRedeemed(codeId), Cosmetics.redeem(codeId, montant) : code secret validé par le serveur
   - Cosmetics.grantItem(id), addPixies(n), spendPixies(n) : récompenses / achat du Passe de combat
   - Objets pass: true : gagnés dans le Passe de combat, jamais vendus en boutique
   - Cosmetics.equipped / equippedId       : la tenue équipée (compatibilité)
   - Cosmetics.equippedOf(type, i = 0)     : objet équipé d'une catégorie (emote : case i)
   - Cosmetics.buy(id)                      -> { ok, reason: 'owned' | 'funds' | 'unknown' }
   - Cosmetics.equip(id, i)                 : équipe un objet possédé (emote : case i)
   - Cosmetics.unequipEmote(i)
   - Cosmetics.claimGift(), giftClaimed, giftAmount
   - Cosmetics.onChange(fn)
   ================================== */

const STORAGE_KEY = 'for2d-profile';
const WELCOME_GIFT = 2500;
export const EMOTE_SLOTS = 4;

export const RARITY = {
    common:    { name: 'Commun',     color: '#9aa3ad' },
    uncommon:  { name: 'Peu commun', color: '#3fbf4a' },
    rare:      { name: 'Rare',       color: '#3a8dff' },
    epic:      { name: 'Épique',     color: '#b05cff' },
    legendary: { name: 'Légendaire', color: '#ffb21f' }
};

// Catégories (ordre = ordre d'affichage dans le casier et la boutique)
export const TYPES = {
    outfit:   { name: 'Tenue',     plural: 'Tenues' },
    backpack: { name: 'Sac à dos', plural: 'Sacs à dos' },
    pickaxe:  { name: 'Pioche',    plural: 'Pioches' },
    glider:   { name: 'Planeur',   plural: 'Planeurs' },
    emote:    { name: 'Emote',     plural: 'Emotes' }
};

// Emplacements du chargement (casier)
export const SLOTS = [
    { type: 'outfit' },
    { type: 'backpack' },
    { type: 'pickaxe' },
    { type: 'glider' },
    ...Array.from({ length: EMOTE_SLOTS }, (_, i) => ({ type: 'emote', index: i }))
];

/*
   Tenue : style de dessin ('default' | 'knight' | 'skeleton' | 'ninja' | 'astro' |
   'chef' | 'pirate' | 'mecha' | 'mage' | 'viking' | 'pumpkin' | 'dragon'),
   look = couleurs du lobby, game = couleurs en jeu (player.colors).
*/
export const SKINS = [
    {
        id: 'recrue', name: 'Recrue', rarity: 'common', price: 0, starter: true,
        series: 'Essentiels', style: 'default', hair: 'spiky', goggles: true,
        desc: 'Prêt à sauter du vaisseau, lunettes sur le front.',
        look: { skin: '#f2c29b', hair: '#3b2415', outfit: '#ff4d5a', outfitDark: '#c42847', pants: '#232845', shoes: '#1a1f33', pack: '#ffc93c', accent: '#2ee6c8' },
        game: { skin: '#f2c29b', hair: '#3b2415', outfit: '#ff4d5a', pack: '#ffc93c' }
    },
    {
        id: 'eclaireuse', name: 'Éclaireuse', rarity: 'uncommon', price: 0, starter: true,
        series: 'Essentiels', style: 'default', hair: 'bun', goggles: true,
        desc: 'Toujours la première à repérer un coffre.',
        look: { skin: '#ffd8b8', hair: '#f0c040', outfit: '#1fc27a', outfitDark: '#138a55', pants: '#3b2a1a', shoes: '#1a1f33', pack: '#ff5d8f', accent: '#ffe03d' },
        game: { skin: '#ffd8b8', hair: '#f0c040', outfit: '#1fc27a', pack: '#ff5d8f' }
    },
    {
        id: 'chef-raclette', name: 'Chef Raclette', rarity: 'uncommon', price: 400,
        series: 'Essentiels', style: 'chef',
        desc: 'Toque, moustache et baguette dans le dos. Il ne lâche jamais sa cuillère en bois.',
        look: { skin: '#f2c29b', hair: '#5a3a22', outfit: '#f4f6fb', outfitDark: '#d7dde8', pants: '#2b2f45', shoes: '#1a1f33', pack: '#e9b26a', accent: '#e8323c' },
        game: { skin: '#f2c29b', hair: '#5a3a22', outfit: '#f4f6fb', pack: '#e8323c' }
    },
    {
        id: 'corsaire', name: 'Capitaine Corsaire', rarity: 'rare', price: 900,
        series: 'Royaume déchu', style: 'pirate',
        desc: 'Tricorne, cache-œil, jambe de bois et un perroquet qui répète tout.',
        look: { skin: '#e0a57a', hair: '#2a1a12', outfit: '#b3262e', outfitDark: '#7a1a20', pants: '#efe2c4', shoes: '#2a1a12', pack: '#1c1f33', accent: '#ffd24a' },
        game: { skin: '#e0a57a', hair: '#2a1a12', outfit: '#b3262e', pack: '#ffd24a' }
    },
    {
        id: 'mecha-titan', name: 'Mécha Titan', rarity: 'epic', price: 1400,
        series: 'Au-delà du vaisseau', style: 'mecha',
        desc: 'Armure de combat blindée, cœur à fusion et réacteurs dans le dos.',
        look: { skin: '#5b6680', hair: '#f4f6fb', outfit: '#3a8dff', outfitDark: '#2563c9', pants: '#2b3245', shoes: '#1c2236', pack: '#ffd23a', accent: '#4fe8ff' },
        game: { skin: '#f4f6fb', hair: '#4fe8ff', outfit: '#3a8dff', pack: '#ffd23a' }
    },
    {
        id: 'archimage', name: 'Archimage Céleste', rarity: 'legendary', price: 2200,
        series: 'Nuit de la corruption', style: 'mage',
        desc: 'Sa robe est cousue de constellations. Un cercle de runes tourne toujours sous ses pieds.',
        look: { skin: '#f2c29b', hair: '#0d0a24', outfit: '#3b2a8f', outfitDark: '#261a66', pants: '#261a66', shoes: '#1a1240', pack: '#ffd24a', accent: '#7ff0ff' },
        game: { skin: '#f2c29b', hair: '#7ff0ff', outfit: '#3b2a8f', pack: '#ffd24a' }
    },
    {
        id: 'ninja', name: 'Ninja Néon', rarity: 'rare', price: 800,
        series: 'Ombres de la ville', style: 'ninja',
        desc: 'Silencieux comme une ombre, brillant comme une enseigne.',
        look: { skin: '#e8b48a', hair: '#12121c', outfit: '#1c1a2e', outfitDark: '#0e0d1a', pants: '#15142a', shoes: '#0c0b16', pack: '#2b2940', accent: '#ff2fd0' },
        game: { skin: '#e8b48a', hair: '#12121c', outfit: '#1c1a2e', pack: '#ff2fd0' }
    },
    {
        id: 'chevalier', name: "Chevalier d'Acier", rarity: 'epic', price: 1200,
        series: 'Royaume déchu', style: 'knight',
        desc: 'Une armure étincelante et un panache qui ne recule jamais.',
        look: { skin: '#f2c29b', hair: '#c8d2de', outfit: '#9fb0c4', outfitDark: '#6b7a8e', pants: '#5a6475', shoes: '#3a4252', pack: '#b3262e', accent: '#ffd24a' },
        game: { skin: '#c8d2de', hair: '#e8323c', outfit: '#9fb0c4', pack: '#b3262e' }
    },
    {
        id: 'astro', name: 'Astro Pionnier', rarity: 'epic', price: 1500,
        series: 'Au-delà du vaisseau', style: 'astro',
        desc: "Il a sauté d'un peu plus haut que les autres.",
        look: { skin: '#f2c29b', hair: '#5a3419', outfit: '#f4f6fb', outfitDark: '#c9d2e0', pants: '#dfe6f0', shoes: '#8d97a8', pack: '#ff8a1f', accent: '#3a8dff' },
        game: { skin: '#f4f6fb', hair: '#6fd0ff', outfit: '#f4f6fb', pack: '#ff8a1f' }
    },
    {
        id: 'squelette', name: 'Os Maudit', rarity: 'legendary', price: 2000,
        series: 'Nuit de la corruption', style: 'skeleton',
        desc: 'Revenu de la corruption, il ne lui reste que les os et un regard violet.',
        look: { skin: '#ece6d3', hair: '#ece6d3', outfit: '#1b1426', outfitDark: '#0e0a16', pants: '#1b1426', shoes: '#0e0a16', pack: '#3b0a66', accent: '#b04cff' },
        game: { skin: '#ece6d3', hair: '#ece6d3', outfit: '#1b1426', pack: '#b04cff' }
    },
    {
        id: 'campeur', name: 'Campeur Malin', rarity: 'common', price: 300,
        series: 'Essentiels', style: 'default', hair: 'spiky', goggles: false,
        desc: "Gourde, boussole et carte pliée : il connaît chaque sentier de l'île.",
        look: { skin: '#e8b48a', hair: '#7a4a22', outfit: '#6f9a3a', outfitDark: '#4d6e26', pants: '#5a4630', shoes: '#3a2a1c', pack: '#ff8a1f', accent: '#ffd24a' },
        game: { skin: '#e8b48a', hair: '#7a4a22', outfit: '#6f9a3a', pack: '#ff8a1f' }
    },
    {
        id: 'surfeuse', name: 'Surfeuse Solaire', rarity: 'uncommon', price: 500,
        series: 'Essentiels', style: 'default', hair: 'swoop', goggles: true,
        desc: 'Lunettes de soleil sur la tête, elle attend la vague parfaite depuis le premier saut.',
        look: { skin: '#c98a5e', hair: '#ffe07a', outfit: '#21c4d9', outfitDark: '#1690a3', pants: '#ff7a59', shoes: '#f4f6fb', pack: '#ffd23a', accent: '#ff5d8f' },
        game: { skin: '#c98a5e', hair: '#ffe07a', outfit: '#21c4d9', pack: '#ffd23a' }
    },
    {
        id: 'jarl-viking', name: 'Jarl du Fjord', rarity: 'rare', price: 900,
        series: 'Royaume déchu', style: 'viking',
        desc: "Casque à cornes, barbe tressée et bouclier peint : il a ramé jusqu'à l'île.",
        look: { skin: '#f2c29b', hair: '#e07a2a', outfit: '#3d6b8f', outfitDark: '#2a4d68', pants: '#6b4a2e', shoes: '#3a2a1c', pack: '#d63c3c', accent: '#c9d2dd' },
        game: { skin: '#f2c29b', hair: '#e07a2a', outfit: '#3d6b8f', pack: '#d63c3c' }
    },
    {
        id: 'roi-citrouille', name: 'Roi Citrouille', rarity: 'epic', price: 1300,
        series: 'Nuit de la corruption', style: 'pumpkin',
        desc: "Sa tête brille dans le noir et son sac déborde de bonbons. Personne n'ose lui en demander.",
        look: { skin: '#ff8a1f', hair: '#ffe03d', outfit: '#3b2a4f', outfitDark: '#261a36', pants: '#2a1f38', shoes: '#1a1226', pack: '#3fbf4a', accent: '#ffe03d' },
        game: { skin: '#ff8a1f', hair: '#ffe03d', outfit: '#3b2a4f', pack: '#3fbf4a' }
    },
    {
        id: 'dragon-ancestral', name: 'Dragon Ancestral', rarity: 'legendary', price: 2200,
        series: 'Royaume déchu', style: 'dragon',
        desc: 'Écailles émeraude, ailes de braise et un souffle qui crépite. Le dernier gardien du royaume.',
        look: { skin: '#2ec27e', hair: '#ffe7a1', outfit: '#1f8f5a', outfitDark: '#146b42', pants: '#146b42', shoes: '#0e4a2e', pack: '#ff6a1f', accent: '#ffb21f' },
        game: { skin: '#2ec27e', hair: '#ffe7a1', outfit: '#1f8f5a', pack: '#ff6a1f' }
    },

    /* ----- Passe de combat (pass: true) : pas en vente, gagnés en montant de palier ----- */
    {
        id: 'pass-explo', name: 'Explo Pixel', rarity: 'rare', price: 0, pass: true,
        series: 'Passe Saison 1', style: 'default', hair: 'mohawk', goggles: true,
        desc: 'Crête rose et lunettes de pilote : la tenue du palier 1.',
        look: { skin: '#e8b48a', hair: '#ff4fc8', outfit: '#2b3a8f', outfitDark: '#1b2566', pants: '#1a1f33', shoes: '#ff4fc8', pack: '#2ee6c8', accent: '#ff8fdc' },
        game: { skin: '#e8b48a', hair: '#ff4fc8', outfit: '#2b3a8f', pack: '#2ee6c8' }
    },
    {
        id: 'pass-ombre', name: 'Ombre Rose', rarity: 'epic', price: 0, pass: true,
        series: 'Passe Saison 1', style: 'ninja',
        desc: 'Une ninja qui laisse une traînée de paillettes roses.',
        look: { skin: '#f2c29b', hair: '#2a0f2a', outfit: '#3a1238', outfitDark: '#220a21', pants: '#2a0f2a', shoes: '#150713', pack: '#4a1848', accent: '#ff8fdc' },
        game: { skin: '#f2c29b', hair: '#2a0f2a', outfit: '#3a1238', pack: '#ff8fdc' }
    },
    {
        id: 'pass-gardien', name: 'Gardien Royal', rarity: 'legendary', price: 0, pass: true,
        series: 'Passe Saison 1', style: 'knight',
        desc: "L'armure dorée du dernier palier. Seuls les plus tenaces la portent.",
        look: { skin: '#f2c29b', hair: '#ffe7a1', outfit: '#e0b23a', outfitDark: '#a67c16', pants: '#6b3fa0', shoes: '#3b2266', pack: '#6b3fa0', accent: '#ff8fdc' },
        game: { skin: '#ffe7a1', hair: '#ff8fdc', outfit: '#e0b23a', pack: '#6b3fa0' }
    }
].map(s => ({ ...s, type: 'outfit' }));

/*
   Sac à dos : couleur (en jeu et sur le personnage du lobby) + motif dessiné.
   "default" = le sac de la tenue (pas de changement de couleur).
*/
const BACKPACKS = [
    { id: 'sac-tenue', name: 'Blue Crab Shell', rarity: 'common', price: 0, starter: true, none: true,
        series: 'Essentiels', motif: 'shell', color: '#1b89c9', accent: '#48d9ff',
        desc: 'Une carapace brillante inspirée des profondeurs.' },
    { id: 'sac-baroudeur', name: 'Blue Fairy Wings', rarity: 'uncommon', price: 300,
        series: 'Essentiels', motif: 'wings', color: '#6e78c8', accent: '#b7c7ff',
        desc: 'Deux ailes légères qui semblent prêtes à décoller.' },
    { id: 'sac-fusee', name: 'Blue Falcon Cape', rarity: 'rare', price: 600,
        series: 'Au-delà du vaisseau', motif: 'cape', color: '#1e4e92', accent: '#48b9ff',
        desc: 'Une cape aérodynamique aux plumes bleues.' },
    { id: 'sac-ecu', name: 'Blue Fish Tail', rarity: 'epic', price: 800,
        series: 'Royaume déchu', motif: 'fishtail', color: '#2875a8', accent: '#71d8f2',
        desc: 'Une queue marine souple, faite pour les grands plongeons.' },
    { id: 'sac-lanterne', name: 'Blue Pack', rarity: 'legendary', price: 1000,
        series: 'Nuit de la corruption', motif: 'tech', color: '#1a78a8', accent: '#55e6f4',
        desc: 'Un pack compact et technologique aux reflets cyan.' },
    { id: 'sac-rando', name: 'Sac de Rando', rarity: 'common', price: 200,
        series: 'Essentiels', motif: 'bedroll', color: '#7a8f3a', accent: '#ff8a1f',
        desc: 'Un vrai sac de randonnée, avec son duvet roulé sur le dessus.' },
    { id: 'sac-surf', name: 'Planche de Surf', rarity: 'uncommon', price: 400,
        series: 'Essentiels', motif: 'surfboard', color: '#21c4d9', accent: '#ffd23a',
        desc: 'Toujours prête pour la prochaine vague, même en pleine tempête.' },
    { id: 'sac-tonneau', name: 'Tonneau du Fjord', rarity: 'rare', price: 650,
        series: 'Royaume déchu', motif: 'barrel', color: '#b97a3c', accent: '#c9d2dd',
        desc: "Un petit tonneau cerclé de fer. On n'ose pas demander ce qu'il contient." },
    { id: 'sac-citrouille', name: 'Lanterne Citrouille', rarity: 'epic', price: 900,
        series: 'Nuit de la corruption', motif: 'jack', color: '#ff8a1f', accent: '#ffe03d',
        desc: "Une citrouille sculptée dont le sourire s'allume dans le noir." },
    { id: 'sac-oeuf', name: 'Œuf de Dragon', rarity: 'legendary', price: 1200,
        series: 'Royaume déchu', motif: 'egg', color: '#3a1f5c', accent: '#ffb21f',
        desc: 'Il est encore chaud et ses fissures brillent. Quelque chose bouge à l\'intérieur.' },
    { id: 'pass-sac-pixel', name: 'Cœur Pixel', rarity: 'rare', price: 0, pass: true,
        series: 'Passe Saison 1', motif: 'pixel', color: '#2ee6c8', accent: '#ff4fc8',
        desc: 'Un cœur en gros pixels, offert à tous les joueurs du passe.' },
    { id: 'pass-sac-couronne', name: 'Écrin Royal', rarity: 'epic', price: 0, pass: true,
        series: 'Passe Saison 1', motif: 'shield', color: '#6b3fa0', accent: '#e0b23a',
        desc: 'Le sac assorti au Gardien Royal.' }
].map(s => ({ ...s, type: 'backpack' }));

// Planeur : 2 couleurs (utilisées en jeu) ; style = forme dessinée par js/glider-art.js
// (sans style : aile classique en chevron, dessinée par js/game/drop.js)
const GLIDERS = [
    { id: 'aile-standard', name: 'Aile Standard', rarity: 'common', price: 0, starter: true,
        series: 'Essentiels', colors: ['#ffe03d', '#3a8dff'], desc: 'Fiable, jaune et bleue.' },
    { id: 'feuille-geante', name: 'Grande Feuille', rarity: 'uncommon', price: 400,
        series: 'Essentiels', style: 'leaf', colors: ['#9ad94e', '#3f8f3a'],
        desc: 'Une feuille de ginkgo assez grande pour planer. Silencieuse et écolo.' },
    { id: 'voile-neon', name: 'Soucoupe Néon', rarity: 'rare', price: 700,
        series: 'Ombres de la ville', style: 'saucer', colors: ['#ff2fd0', '#4a4f7a'],
        desc: 'Une soucoupe bordée de néons. Ses propriétaires la cherchent encore.' },
    { id: 'dirigeable', name: 'Gros Dirigeable', rarity: 'rare', price: 800,
        series: 'Au-delà du vaisseau', style: 'blimp', colors: ['#b4bfd0', '#ff5470'],
        desc: 'Lent, énorme, et pourtant il arrive toujours à bon port.' },
    { id: 'aile-dragon', name: 'Aile de Dragon', rarity: 'epic', price: 1000,
        series: 'Royaume déchu', style: 'dragon', colors: ['#e8323c', '#ffb21f'],
        desc: 'De vraies ailes de dragon, griffes et queue comprises.' },
    { id: 'scarabee-bionique', name: 'Scarabée Bionique', rarity: 'epic', price: 1200,
        series: 'Ombres de la ville', style: 'beetle', colors: ['#2f7cf6', '#ffd23a'],
        desc: 'Carapace blindée, ailes qui vibrent et petits réacteurs dans le dos.' },
    { id: 'grue-origami', name: 'Grue en Origami', rarity: 'rare', price: 700,
        series: 'Ombres de la ville', style: 'origami', colors: ['#8a6cff', '#ffd24a'],
        desc: 'Pliée dans une seule feuille de papier. À ne pas sortir sous la pluie.' },
    { id: 'montgolfiere', name: 'Montgolfière Festive', rarity: 'epic', price: 1100,
        series: 'Essentiels', style: 'balloon', colors: ['#ff5470', '#ffe03d'],
        desc: 'Douze fuseaux, des pompons partout et une étoile au sommet.' },
    { id: 'grimoire-maudit', name: 'Grimoire Maudit', rarity: 'legendary', price: 1600,
        series: 'Nuit de la corruption', style: 'grimoire', colors: ['#c04cff', '#3d4258'],
        desc: 'Un livre de sorts qui vole sur deux lames d\'acier. Sa rune brille dans la corruption.' },
    { id: 'nuee-corrompue', name: 'Nuée Corrompue', rarity: 'legendary', price: 1500,
        series: 'Nuit de la corruption', colors: ['#b04cff', '#1b1426'], desc: 'Un planeur tissé dans la corruption elle-même.' },
    { id: 'pass-aile-pixel', name: 'Aile Pixel', rarity: 'epic', price: 0, pass: true,
        series: 'Passe Saison 1', colors: ['#ff4fc8', '#2ee6c8'], desc: 'Rose et turquoise, comme un vieux jeu d\'arcade.' },
    { id: 'pass-aile-royale', name: 'Envol Royal', rarity: 'legendary', price: 0, pass: true,
        series: 'Passe Saison 1', colors: ['#e0b23a', '#6b3fa0'], desc: 'Or et violet : on te voit arriver de loin.' }
].map(s => ({ ...s, type: 'glider' }));

// Emote : pictogramme (dessin de l'aperçu) + animation de partie via la roue d'emotes.
const EMOTES = [
    { id: 'emote-salut', name: 'Salut !', rarity: 'common', price: 0, starter: true,
        series: 'Essentiels', icon: 'wave', color: '#ffe03d', desc: 'Un grand signe de la main.' },
    { id: 'emote-pouce', name: 'Bien joué', rarity: 'uncommon', price: 0, starter: true,
        series: 'Essentiels', icon: 'thumb', color: '#3fbf4a', desc: 'Pouce levé pour ton équipe.' },
    { id: 'emote-robot', name: 'Danse du Robot', rarity: 'rare', price: 500,
        series: 'Au-delà du vaisseau', icon: 'robot', color: '#3a8dff', desc: 'Bip. Boup. Victoire.' },
    { id: 'emote-flex', name: 'Gros Bras', rarity: 'epic', price: 800,
        series: 'Royaume déchu', icon: 'flex', color: '#b05cff', desc: 'Montre qui est le plus fort de la place.' },
    { id: 'emote-pluie', name: 'Pluie de Pixies', rarity: 'legendary', price: 1200,
        series: 'Nuit de la corruption', icon: 'rain', color: '#ffb21f', desc: 'Il pleut des Pixies (imaginaires).' },
    { id: 'pass-emote-gg', name: 'GG', rarity: 'uncommon', price: 0, pass: true,
        series: 'Passe Saison 1', icon: 'gg', color: '#3a8dff', desc: 'Bien joué, vraiment.' },
    { id: 'pass-emote-couronne', name: 'Couronne', rarity: 'epic', price: 0, pass: true,
        series: 'Passe Saison 1', icon: 'crown', color: '#b05cff', desc: 'Pour fêter une Victoire Royale.' }
].map(s => ({ ...s, type: 'emote' }));

// Pioches : motif de dessin dans le casier/boutique + rendu spécifique en partie.
const PICKAXES = [
    { id: 'pioche-defaut', name: 'Pioche Classique', rarity: 'common', price: 0, starter: true,
        series: 'Essentiels', motif: 'classic',
        desc: 'Le fidèle outil de récolte standard. Simple, robuste et efficace.' },
    { id: 'pioche-laser', name: 'Faux Néon', rarity: 'rare', price: 500,
        series: 'Ombres de la ville', motif: 'laser',
        desc: 'Forgée dans l\'énergie pure de la mégapole. Découpe toute structure avec un sifflement électrique.' },
    { id: 'pioche-royale', name: 'Hache du Lion', rarity: 'epic', price: 800,
        series: 'Royaume déchu', motif: 'royal',
        desc: 'Lourde hache dorée frappée du sceau royal et sertie d\'un rubis flamboyant.' },
    { id: 'pioche-cosmique', name: 'Sonde Stellaire', rarity: 'epic', price: 800,
        series: 'Au-delà du vaisseau', motif: 'cosmic',
        desc: 'Équipement de forage pour astéroïdes doté d\'un micro-réacteur orbital orange vif.' },
    { id: 'pioche-maudite', name: 'Faux du Néant', rarity: 'legendary', price: 1200,
        series: 'Nuit de la corruption', motif: 'void',
        desc: 'Taillée dans un cristal d\'essence corrompue. Elle aspire la lumière et pulse d\'une aura ténébreuse.' },
    { id: 'pioche-bonbon', name: 'Sucre d\'Orge Piquant', rarity: 'uncommon', price: 300,
        series: 'Essentiels', motif: 'candy',
        desc: 'Un bâton de sucre géant taillé en biseau tranchant. Dangereusement sucré !' }
].map(s => ({ ...s, type: 'pickaxe' }));

export const ITEMS = [...SKINS, ...BACKPACKS, ...PICKAXES, ...GLIDERS, ...EMOTES];

const BY_ID = new Map(ITEMS.map(s => [s.id, s]));
const FIRST = {
    outfit: 'recrue',
    backpack: 'sac-tenue',
    pickaxe: 'pioche-defaut',
    glider: 'aile-standard',
    emote: 'emote-salut'
};

export function getItem(id) {
    return BY_ID.get(id) || null;
}

export function getSkin(id) {
    const s = BY_ID.get(id);
    return s && s.type === 'outfit' ? s : BY_ID.get(FIRST.outfit);
}

/* ===================== PROFIL ===================== */

function freshProfile() {
    return {
        pixies: 0,
        owned: ITEMS.filter(s => s.starter).map(s => s.id),
        equipped: FIRST.outfit,
        backpack: FIRST.backpack,
        pickaxe: FIRST.pickaxe,
        glider: FIRST.glider,
        emotes: ['emote-salut', 'emote-pouce', null, null],
        giftClaimed: false,
        redeemed: []                            // identifiants des codes secrets déjà utilisés
    };
}

// Objet possédé de la bonne catégorie, sinon valeur par défaut
function validFor(p, type, id, fallback) {
    const it = BY_ID.get(id);
    return it && it.type === type && p.owned.includes(id) ? id : fallback;
}

function load() {
    const p = freshProfile();
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            // Ancien profil : le solde « vbucks » est repris tel quel en Pixies
            const bal = Number.isFinite(saved.pixies) ? saved.pixies : saved.vbucks;
            if (Number.isFinite(bal) && bal >= 0) p.pixies = Math.floor(bal);
            if (Array.isArray(saved.redeemed)) {
                p.redeemed = saved.redeemed.filter(id => typeof id === 'string' && id.length <= 32).slice(0, 100);
            }
            if (Array.isArray(saved.owned)) {
                for (const id of saved.owned) if (BY_ID.has(id) && !p.owned.includes(id)) p.owned.push(id);
            }
            p.equipped = validFor(p, 'outfit', saved.equipped, p.equipped);
            p.backpack = validFor(p, 'backpack', saved.backpack, p.backpack);
            p.pickaxe = validFor(p, 'pickaxe', saved.pickaxe, p.pickaxe);
            p.glider = validFor(p, 'glider', saved.glider, p.glider);
            if (Array.isArray(saved.emotes)) {
                p.emotes = Array.from({ length: EMOTE_SLOTS }, (_, i) => validFor(p, 'emote', saved.emotes[i], null));
            }
            p.giftClaimed = saved.giftClaimed === true;
        }
    } catch {
        /* stockage indisponible ou corrompu : profil neuf */
    }
    return p;
}

let profile = load();
const listeners = [];

function save() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch {
        /* stockage indisponible : le profil reste valable pour cette page */
    }
    emit();
}

function emit() {
    for (const fn of listeners) {
        try { fn(profile); } catch { /* un écouteur raté ne bloque pas les autres */ }
    }
}

export const Cosmetics = {
    TYPES, SLOTS, RARITY, SKINS, ITEMS, EMOTE_SLOTS, getSkin, getItem,

    get pixies() { return profile.pixies; },
    get equipped() { return getSkin(profile.equipped); },
    get equippedId() { return profile.equipped; },
    get giftClaimed() { return profile.giftClaimed; },
    get giftAmount() { return WELCOME_GIFT; },
    owns(id) { return profile.owned.includes(id); },

    equippedOf(type, i = 0) {
        if (type === 'outfit') return getSkin(profile.equipped);
        if (type === 'backpack') return BY_ID.get(profile.backpack) || BY_ID.get(FIRST.backpack);
        if (type === 'pickaxe') return BY_ID.get(profile.pickaxe) || BY_ID.get(FIRST.pickaxe);
        if (type === 'glider') return BY_ID.get(profile.glider) || BY_ID.get(FIRST.glider);
        if (type === 'emote') return BY_ID.get(profile.emotes[i]) || null;
        return null;
    },

    // L'objet est-il équipé (dans n'importe quelle case pour les emotes) ?
    isEquipped(id) {
        return profile.equipped === id || profile.backpack === id || profile.pickaxe === id || profile.glider === id || profile.emotes.includes(id);
    },

    buy(id) {
        const s = BY_ID.get(id);
        if (!s) return { ok: false, reason: 'unknown' };
        if (profile.owned.includes(id)) return { ok: false, reason: 'owned' };
        if (profile.pixies < s.price) return { ok: false, reason: 'funds' };
        profile.pixies -= s.price;
        profile.owned.push(id);
        save();
        return { ok: true };
    },

    // i : case d'emote visée (sinon la 1re case vide, ou la 1re)
    equip(id, i) {
        const s = BY_ID.get(id);
        if (!s || !profile.owned.includes(id)) return false;
        if (s.type === 'outfit') profile.equipped = id;
        else if (s.type === 'backpack') profile.backpack = id;
        else if (s.type === 'pickaxe') profile.pickaxe = id;
        else if (s.type === 'glider') profile.glider = id;
        else if (s.type === 'emote') {
            let k = Number.isInteger(i) && i >= 0 && i < EMOTE_SLOTS ? i : profile.emotes.indexOf(null);
            if (k < 0) k = 0;
            // Déjà dans une autre case : on échange
            const old = profile.emotes.indexOf(id);
            if (old >= 0 && old !== k) profile.emotes[old] = profile.emotes[k];
            profile.emotes[k] = id;
        } else return false;
        save();
        return true;
    },

    unequipEmote(i) {
        if (!(i >= 0 && i < EMOTE_SLOTS) || !profile.emotes[i]) return false;
        profile.emotes[i] = null;
        save();
        return true;
    },

    claimGift() {
        if (profile.giftClaimed) return 0;
        profile.giftClaimed = true;
        profile.pixies += WELCOME_GIFT;
        save();
        return WELCOME_GIFT;
    },

    // Récompense (Passe de combat) : l'objet est ajouté sans payer
    grantItem(id) {
        if (!BY_ID.has(id) || profile.owned.includes(id)) return false;
        profile.owned.push(id);
        save();
        return true;
    },

    addPixies(n) {
        if (!Number.isInteger(n) || n <= 0) return false;
        profile.pixies += n;
        save();
        return true;
    },

    spendPixies(n) {
        if (!Number.isInteger(n) || n <= 0 || profile.pixies < n) return false;
        profile.pixies -= n;
        save();
        return true;
    },

    hasRedeemed(codeId) { return profile.redeemed.includes(codeId); },

    // Code secret déjà validé par le serveur : une seule utilisation par profil
    redeem(codeId, amount) {
        if (typeof codeId !== 'string' || !codeId || profile.redeemed.includes(codeId)) return false;
        if (!Number.isInteger(amount) || amount <= 0) return false;
        profile.redeemed.push(codeId);
        profile.pixies += amount;
        save();
        return true;
    },

    reset() {
        profile = freshProfile();
        save();
        return true;
    },

    // Relit le stockage (profil d'un compte chargé par js/network.js) sans réécrire
    reloadFromStorage() {
        profile = load();
        emit();
    },

    exportData() {
        return {
            pixies: profile.pixies,
            owned: [...profile.owned],
            equipped: profile.equipped,
            backpack: profile.backpack,
            pickaxe: profile.pickaxe,
            glider: profile.glider,
            emotes: [...profile.emotes],
            giftClaimed: profile.giftClaimed,
            redeemed: [...profile.redeemed]
        };
    },

    importData(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return false;
        const next = freshProfile();
        const balance = Number.isFinite(snapshot.pixies) ? snapshot.pixies : 0;
        next.pixies = Math.max(0, Math.floor(Math.min(balance, 10000000)));
        if (Array.isArray(snapshot.owned)) {
            for (const id of snapshot.owned) {
                if (BY_ID.has(id) && !next.owned.includes(id)) next.owned.push(id);
            }
        }
        next.equipped = validFor(next, 'outfit', snapshot.equipped, next.equipped);
        next.backpack = validFor(next, 'backpack', snapshot.backpack, next.backpack);
        next.pickaxe = validFor(next, 'pickaxe', snapshot.pickaxe, next.pickaxe);
        next.glider = validFor(next, 'glider', snapshot.glider, next.glider);
        if (Array.isArray(snapshot.emotes)) {
            next.emotes = Array.from({ length: EMOTE_SLOTS }, (_, i) => validFor(next, 'emote', snapshot.emotes[i], null));
        }
        next.giftClaimed = snapshot.giftClaimed === true;
        if (Array.isArray(snapshot.redeemed)) {
            next.redeemed = snapshot.redeemed.filter((id) => typeof id === 'string' && id.length <= 32).slice(0, 100);
        }
        profile = next;
        save();
        return true;
    },

    onChange(fn) {
        if (typeof fn === 'function') listeners.push(fn);
    }
};

if (typeof window !== 'undefined') {
    window.FOR2D_COSMETICS = Cosmetics;
    window.addEventListener('storage', (e) => {
        if (e.key !== STORAGE_KEY) return;
        profile = load();
        emit();
    });
}

export default Cosmetics;
