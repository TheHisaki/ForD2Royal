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
            { key: 'Clic G', name: 'Marteau-fusée', text: 'Grand coup en arc devant lui (85 dégâts) qui touche et repousse tous les ennemis proches.' },
            { key: 'Clic D', name: 'Bastion', text: 'Maintenir : bouclier frontal de 1200 PV qui bloque tous les tirs. Ralentit. Se recharge baissé, se brise à 0 (5 s).' },
            { key: 'Maj', name: 'Charge', text: 'Fonce (virage lent à la souris), emporte le premier ennemi et l\'écrase contre un mur : 300 dégâts. Maj pour arrêter.' },
            { key: 'E', name: 'Frappe de feu', text: 'Vague de flammes (100 dégâts) qui traverse les ennemis et les boucliers.' },
            { key: 'Q', name: 'Fracas', text: 'Ultime : onde en cône (170 dégâts) qui renverse les ennemis 2,4 s. Bloquée par les boucliers.', ult: true }
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
            { key: 'Clic G', name: 'Canons à fusion', text: 'Deux canons automatiques à courte portée, dévastateurs de près. Ralentit en tirant.' },
            { key: 'Clic D', name: 'Matrice défensive', text: 'Maintenir : détruit les projectiles ennemis devant le méca (jauge de 3 s). Ne bloque pas les tirs instantanés.' },
            { key: 'Maj', name: 'Propulseurs', text: 'Vole 2 s vers la souris et repousse les ennemis touchés. Maj pour arrêter.' },
            { key: 'E', name: 'Micro-missiles', text: 'Salve de 18 roquettes explosives en 1 s.' },
            { key: 'Q', name: 'Surcharge', text: 'Ultime : la pilote s\'éjecte, le méca fonce puis explose après 3 s (1000 dégâts : abritez-vous derrière un mur !).', ult: true },
            { key: 'Passif', name: 'Éjection', text: 'Méca détruit : Volta continue à pied (150 PV, pistolet). Son ultime rappelle alors un méca neuf.' }
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
            { key: 'Clic G', name: 'Pistolets à impulsion', text: 'Deux pistolets automatiques (40 balles), moins forts de loin. R pour recharger.' },
            { key: 'Maj', name: 'Transfert', text: 'Téléportation courte dans le sens du déplacement. 3 charges (3 s chacune).' },
            { key: 'E', name: 'Retour', text: 'Revient là où elle était il y a 3 s avec sa meilleure vie de ces 3 s, et recharge. Intouchable pendant le retour.' },
            { key: 'Q', name: 'Bombe à impulsion', text: 'Ultime : bombe collante (ennemi ou mur) qui explose après 1 s : 350 dégâts.', ult: true }
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
            { key: 'Clic G', name: 'Lance-grenades', text: 'Grenades (5 par chargeur) qui rebondissent 3 fois et explosent au contact d\'un ennemi.' },
            { key: 'Clic D', name: 'Mine commotion', text: 'Lance une mine, Clic D à nouveau pour l\'exploser : dégâts et grosse poussée (Kraz aussi, pour sauter). 2 charges.' },
            { key: 'E', name: 'Piège d\'acier', text: 'Piège au sol (armé en 1 s) : immobilise 1,5 s le premier ennemi et inflige 80 dégâts.' },
            { key: 'Q', name: 'Pneu infernal', text: 'Ultime : pilote un pneu à la souris pendant 10 s, Clic G pour l\'exploser (600 dégâts). Le pneu peut être abattu.', ult: true },
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
            { key: 'Clic G', name: 'Bâton de soin', text: 'Maintenir vers un allié : le soigne en continu (55 PV/s).' },
            { key: 'Clic D', name: 'Rayon d\'amplification', text: 'Maintenir vers un allié : ses dégâts augmentent de 30 %.' },
            { key: 'Maj', name: 'Envol', text: 'Vole jusqu\'à l\'allié relié, ou le plus proche de la souris.' },
            { key: 'E', name: 'Résurrection', text: 'Ramène à la vie un allié tombé à côté d\'elle (1 s immobile).' },
            { key: 'Q', name: 'Valkyrie', text: 'Ultime (15 s) : rayons propagés aux alliés proches de la cible, plus de vitesse et régénération.', ult: true }
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
            { key: 'Clic G', name: 'Ampli sonique', text: 'Rafales de 4 projectiles soniques (20 dégâts chacun).' },
            { key: 'Clic D', name: 'Onde de choc', text: 'Repousse violemment les ennemis devant lui (idéal pour les sortir du point).' },
            { key: 'Maj', name: 'Changement de piste', text: 'Bascule l\'aura : Soin (vert) ou Vitesse +25 % (jaune) pour les alliés autour.' },
            { key: 'E', name: 'Volume à fond', text: 'Aura très renforcée pendant 3 s (gros soin ou +60 % de vitesse).' },
            { key: 'Q', name: 'Mur du son', text: 'Ultime : +650 PV de bouclier temporaire pour tous les alliés autour de lui.', ult: true },
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
