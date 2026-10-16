/* ==================================
   NEXUS - HÉROS
   6 héros (2 par rôle), chacun inspiré d'un héros d'Overwatch dont le
   style de jeu marche bien en vue de dessus.
   Les pouvoirs sont seulement décrits pour l'instant : ils ne sont pas encore jouables.
   Touches prévues : Clic gauche (arme), Clic droit, Maj, E, Q (capacité ultime).
   ================================== */

export const ROLES = {
    tank: {
        id: 'tank', name: 'Tank', plural: 'Tank', slots: 1, color: '#4f9dff',
        passive: 'Résistance : moins repoussé par les attaques, et donne moins de charge d\'ultime à l\'adversaire.'
    },
    damage: {
        id: 'damage', name: 'Dégâts', plural: 'Dégâts', slots: 2, color: '#ff5a5a',
        passive: 'Blessure : les cibles touchées reçoivent moins de soins pendant un court instant.'
    },
    support: {
        id: 'support', name: 'Soutien', plural: 'Soutiens', slots: 2, color: '#5ee08a',
        passive: 'Récupération : régénère sa vie après quelques secondes sans subir de dégâts.'
    }
};

export const ROLE_ORDER = ['tank', 'damage', 'support'];

// Composition imposée d'une équipe (comme la file par rôle d'Overwatch)
export const TEAM_COMPOSITION = { tank: 1, damage: 2, support: 2 };

export const HEROES = [
    {
        id: 'gorvald',
        name: 'Gorvald',
        role: 'tank',
        inspiredBy: 'Reinhardt',
        title: 'Le Rempart de Fer',
        lore: 'Ancien chevalier de la garde de Kaïro. Il protège son équipe derrière son bouclier et écrase tout ce qui passe à portée de marteau.',
        color: '#c9a227',
        health: 650,
        stats: { health: 5, mobility: 1, difficulty: 1 },
        abilities: [
            { key: 'Clic G', name: 'Marteau-fusée', text: 'Grand coup en arc de cercle devant lui, touche plusieurs ennemis.' },
            { key: 'Clic D', name: 'Bastion', text: 'Bouclier frontal qui bloque les tirs tant qu\'il le tient. Il se brise s\'il prend trop de dégâts.' },
            { key: 'Maj', name: 'Charge', text: 'Fonce en ligne droite, attrape le premier ennemi et l\'écrase contre un mur.' },
            { key: 'E', name: 'Frappe de feu', text: 'Lance une vague de flammes qui traverse les ennemis.' },
            { key: 'Q', name: 'Fracas', text: 'Ultime : frappe le sol et renverse tous les ennemis dans un cône devant lui.', ult: true }
        ]
    },
    {
        id: 'volta',
        name: 'Volta',
        role: 'tank',
        inspiredBy: 'D.Va',
        title: 'Pilote de méca',
        lore: 'Championne d\'e-sport devenue pilote d\'élite. Son méca Volt-9 encaisse les coups et fond sur les ennemis isolés.',
        color: '#ff6fb5',
        health: 650,
        stats: { health: 4, mobility: 4, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Canons à fusion', text: 'Deux canons à courte portée, très puissants de près.' },
            { key: 'Clic D', name: 'Matrice défensive', text: 'Absorbe les projectiles ennemis dans un cône devant le méca.' },
            { key: 'Maj', name: 'Propulseurs', text: 'Vole dans la direction visée et repousse les ennemis touchés.' },
            { key: 'E', name: 'Micro-missiles', text: 'Salve de petites roquettes explosives.' },
            { key: 'Q', name: 'Surcharge', text: 'Ultime : éjecte la pilote, le méca explose quelques secondes plus tard sur une grande zone.', ult: true },
            { key: 'Passif', name: 'Éjection', text: 'Quand le méca est détruit, Volta continue à pied avec un pistolet et peut rappeler un nouveau méca.' }
        ]
    },
    {
        id: 'zephyr',
        name: 'Zéphyr',
        role: 'damage',
        inspiredBy: 'Tracer',
        title: 'L\'Éclair temporel',
        lore: 'Pilote d\'essai décalée dans le temps après un accident. Un accélérateur chronal la garde dans le présent... et la rend insaisissable.',
        color: '#ff9a1f',
        health: 175,
        stats: { health: 1, mobility: 5, difficulty: 3 },
        abilities: [
            { key: 'Clic G', name: 'Pistolets à impulsion', text: 'Deux pistolets automatiques très rapides, à courte portée.' },
            { key: 'Maj', name: 'Transfert', text: 'Se téléporte sur une courte distance. 3 charges.' },
            { key: 'E', name: 'Retour', text: 'Remonte le temps : revient là où elle était il y a 3 secondes, avec la vie qu\'elle avait.' },
            { key: 'Q', name: 'Bombe à impulsion', text: 'Ultime : lance une bombe collante qui explose après un court délai.', ult: true }
        ]
    },
    {
        id: 'kraz',
        name: 'Kraz',
        role: 'damage',
        inspiredBy: 'Chacal (Junkrat)',
        title: 'Le Ferrailleur fou',
        lore: 'Pilleur des décharges, passionné d\'explosifs. Ses grenades rebondissent partout et transforment les couloirs en piège.',
        color: '#f2c14e',
        health: 250,
        stats: { health: 2, mobility: 3, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Lance-grenades', text: 'Grenades qui rebondissent sur les murs et explosent au contact d\'un ennemi.' },
            { key: 'Clic D', name: 'Mine commotion', text: 'Pose une mine à faire exploser à distance : repousse tout le monde, Kraz compris.' },
            { key: 'E', name: 'Piège d\'acier', text: 'Mâchoire au sol qui immobilise le premier ennemi qui marche dessus.' },
            { key: 'Q', name: 'Pneu infernal', text: 'Ultime : pilote un pneu explosif qui roule à toute vitesse vers les ennemis.', ult: true },
            { key: 'Passif', name: 'Cadeau d\'adieu', text: 'Lâche une poignée de grenades à sa mort.' }
        ]
    },
    {
        id: 'seraphine',
        name: 'Séraphine',
        role: 'support',
        inspiredBy: 'Ange (Mercy)',
        title: 'L\'Ange gardien',
        lore: 'Médecin de génie équipée d\'une armure ailée. Elle reste près de ses alliés, les soigne et les ramène même au combat.',
        color: '#ffe27a',
        health: 225,
        stats: { health: 2, mobility: 4, difficulty: 1 },
        abilities: [
            { key: 'Clic G', name: 'Bâton de soin', text: 'Rayon qui soigne l\'allié visé en continu.' },
            { key: 'Clic D', name: 'Rayon d\'amplification', text: 'Rayon qui augmente les dégâts de l\'allié visé.' },
            { key: 'Maj', name: 'Envol', text: 'Vole jusqu\'à l\'allié visé.' },
            { key: 'E', name: 'Résurrection', text: 'Ramène à la vie un allié tombé près d\'elle.' },
            { key: 'Q', name: 'Valkyrie', text: 'Ultime : ses rayons se propagent à plusieurs alliés et elle se déplace plus vite.', ult: true }
        ]
    },
    {
        id: 'tempo',
        name: 'Tempo',
        role: 'support',
        inspiredBy: 'Lúcio',
        title: 'Le DJ des rues',
        lore: 'Star de la musique sur patins. Son ampli soigne ou accélère toute l\'équipe autour de lui, au rythme du son.',
        color: '#7ee34f',
        health: 225,
        stats: { health: 2, mobility: 5, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Ampli sonique', text: 'Rafales de 4 projectiles soniques.' },
            { key: 'Clic D', name: 'Onde de choc', text: 'Repousse violemment les ennemis devant lui.' },
            { key: 'Maj', name: 'Changement de piste', text: 'Bascule son aura entre Soin (vert) et Vitesse (jaune) pour les alliés proches.' },
            { key: 'E', name: 'Volume à fond', text: 'Renforce fortement l\'aura active pendant quelques secondes.' },
            { key: 'Q', name: 'Mur du son', text: 'Ultime : donne un gros bouclier temporaire à tous les alliés autour de lui.', ult: true },
            { key: 'Passif', name: 'Patins', text: 'Se déplace plus vite que les autres héros.' }
        ]
    }
];

export const HERO_BY_ID = Object.fromEntries(HEROES.map(h => [h.id, h]));

export function heroesOfRole(role) {
    return HEROES.filter(h => h.role === role);
}

// Équipe valide : bonne composition et pas deux fois le même héros
export function isValidTeam(heroIds) {
    if (new Set(heroIds).size !== heroIds.length) return false;
    const count = { tank: 0, damage: 0, support: 0 };
    for (const id of heroIds) {
        const h = HERO_BY_ID[id];
        if (!h) return false;
        count[h.role]++;
    }
    return ROLE_ORDER.every(r => count[r] === TEAM_COMPOSITION[r]);
}
