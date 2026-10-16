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
        health: 700,
        stats: { health: 5, mobility: 1, difficulty: 1 },
        abilities: [
            { key: 'Clic G', name: 'Marteau-fusée', text: 'Grand coup en arc devant lui (85 dégâts) qui touche et repousse tous les ennemis proches.' },
            { key: 'Clic D', name: 'Bastion', text: 'Maintenir : bouclier frontal de 1200 PV qui bloque tous les tirs. Ralentit. Se recharge baissé, se brise à 0 (5 s).' },
            { key: 'Maj', name: 'Charge', text: 'Fonce (virage lent à la souris), emporte le premier ennemi et l\'écrase contre un mur : 225 dégâts. Maj pour arrêter.' },
            { key: 'E', name: 'Frappe de feu', text: 'Vague de flammes (90 dégâts) qui traverse les ennemis et les boucliers.' },
            { key: 'Q', name: 'Fracas', text: 'Ultime : onde en cône (250 dégâts) qui renverse les ennemis 2,5 s. Bloquée par les boucliers.', ult: true }
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
        health: 700,
        stats: { health: 4, mobility: 4, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Canons à fusion', text: 'Deux canons automatiques à courte portée, dévastateurs de près. Ralentit en tirant.' },
            { key: 'Clic D', name: 'Matrice défensive', text: 'Maintenir : détruit les projectiles ennemis devant le méca (jauge de 3 s). Ne bloque pas les tirs instantanés.' },
            { key: 'Maj', name: 'Propulseurs', text: 'Vole 2 s vers la souris et repousse les ennemis touchés. Maj pour arrêter.' },
            { key: 'E', name: 'Micro-missiles', text: 'Salve de 18 roquettes explosives en 1 s.' },
            { key: 'Q', name: 'Surcharge', text: 'Ultime : la pilote s\'éjecte, le méca fonce puis explose après 3 s (1000 dégâts : abritez-vous derrière un mur !).', ult: true },
            { key: 'Passif', name: 'Éjection', text: 'Méca détruit : Volta continue à pied (150 PV, pistolet de 18 dégâts). Son ultime rappelle alors un méca neuf.' }
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
            { key: 'Clic G', name: 'Lance-grenades', text: 'Grenades (5 par chargeur) : 40 dégâts au contact + 80 d\'explosion. Rebondissent 3 fois.' },
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
        health: 250,
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
        health: 250,
        stats: { health: 2, mobility: 5, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Ampli sonique', text: 'Rafales de 4 projectiles soniques (20 dégâts chacun).' },
            { key: 'Clic D', name: 'Onde de choc', text: 'Repousse violemment les ennemis devant lui (idéal pour les sortir du point).' },
            { key: 'Maj', name: 'Changement de piste', text: 'Bascule l\'aura : Soin (vert) ou Vitesse +25 % (jaune) pour les alliés autour.' },
            { key: 'E', name: 'Volume à fond', text: 'Aura très renforcée pendant 3 s (gros soin ou +60 % de vitesse).' },
            { key: 'Q', name: 'Mur du son', text: 'Ultime : +750 PV de bouclier temporaire pour tous les alliés autour de lui.', ult: true },
            { key: 'Passif', name: 'Patins', text: 'Se déplace plus vite que les autres héros.' }
        ]
    },

    /* ----- Nouveaux héros ----- */
    {
        id: 'ragnok',
        name: 'Ragnok',
        role: 'tank',
        inspiredBy: 'Chopper (Roadhog)',
        title: 'Le Boucher des Ferrailles',
        lore: 'Colosse masqué des terres brûlées. Il attrape ses proies au crochet et les achève à bout portant.',
        color: '#a0703a',
        health: 750,
        stats: { health: 5, mobility: 1, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Fusil à ferraille', text: 'Gerbe d\'éclats à courte portée : jusqu\'à 160 dégâts (6 tirs par chargeur).' },
            { key: 'Maj', name: 'Crochet', text: 'Lance une chaîne : le premier ennemi touché est tiré jusqu\'à lui et étourdi un instant.' },
            { key: 'E', name: 'Bouffée d\'air', text: 'Respire son masque : 350 PV rendus en 2 s et dégâts subis réduits de moitié.' },
            { key: 'Q', name: 'Porc entier', text: 'Ultime : 6 s de rafale continue d\'éclats qui repoussent tout devant lui.', ult: true }
        ]
    },
    {
        id: 'kodo',
        name: 'Kodo',
        role: 'tank',
        inspiredBy: 'Winston',
        title: 'Le Génie Primate',
        lore: 'Gorille scientifique élevé sur une base lunaire. Il saute au cœur de la mêlée, protégé par son dôme d\'énergie.',
        color: '#7d93b8',
        health: 625,
        stats: { health: 4, mobility: 4, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Canon Tesla', text: 'Arc électrique (70 PV/s) : touche jusqu\'à 3 ennemis, sans viser, même à travers les boucliers.' },
            { key: 'Maj', name: 'Bond', text: 'Saut vers la souris : à l\'atterrissage, dégâts et petite poussée autour de lui.' },
            { key: 'E', name: 'Dôme', text: 'Pose un dôme de 700 PV pendant 9 s : aucun tir ne le traverse, ni dans un sens ni dans l\'autre.' },
            { key: 'Q', name: 'Rage primale', text: 'Ultime (10 s) : +500 PV, coups de poing qui projettent les ennemis, Bond rechargé très vite.', ult: true }
        ]
    },
    {
        id: 'kade',
        name: 'Kade',
        role: 'damage',
        inspiredBy: 'Soldat : 76',
        title: 'Le Vétéran',
        lore: 'Ancien commandant revenu dans l\'ombre. Fusil fiable, roquettes et une visière qui ne rate jamais sa cible.',
        color: '#3d5fa8',
        health: 250,
        stats: { health: 2, mobility: 3, difficulty: 1 },
        abilities: [
            { key: 'Clic G', name: 'Fusil à impulsion', text: 'Fusil automatique précis : 18 dégâts par balle, 9 balles/s (30 par chargeur).' },
            { key: 'Clic D', name: 'Roquettes hélices', text: 'Salve de roquettes explosives (120 dégâts).' },
            { key: 'Maj', name: 'Sprint', text: 'Court 50 % plus vite. S\'arrête dès qu\'il tire.' },
            { key: 'E', name: 'Champ biotique', text: 'Pose une zone qui soigne les alliés à l\'intérieur pendant 5 s.' },
            { key: 'Q', name: 'Visière tactique', text: 'Ultime (6 s) : ses tirs se verrouillent tout seuls sur l\'ennemi visible le plus proche.', ult: true }
        ]
    },
    {
        id: 'nox',
        name: 'Nox',
        role: 'damage',
        inspiredBy: 'Faucheur (Reaper)',
        title: 'Le Spectre',
        lore: 'Mercenaire mi-homme mi-ombre. Il surgit derrière les lignes et fauche tout ce qui l\'entoure.',
        color: '#2b2b33',
        health: 300,
        stats: { health: 3, mobility: 3, difficulty: 2 },
        abilities: [
            { key: 'Clic G', name: 'Fusils infernaux', text: 'Deux fusils à pompe : jusqu\'à 108 dégâts par tir de près (8 tirs).' },
            { key: 'Maj', name: 'Forme spectrale', text: '3 s intouchable et plus rapide, mais sans pouvoir tirer.' },
            { key: 'E', name: 'Pas de l\'ombre', text: 'Après 0,9 s, se téléporte à l\'endroit visé (600 max).' },
            { key: 'Q', name: 'Fleur de mort', text: 'Ultime : tourne sur lui-même 3 s en tirant tout autour (170 dégâts/s).', ult: true },
            { key: 'Passif', name: 'Moisson', text: 'Récupère 30 % des dégâts qu\'il inflige.' }
        ]
    },
    {
        id: 'shirin',
        name: 'Shirin',
        role: 'support',
        inspiredBy: 'Ana',
        title: 'L\'Œil du Faucon',
        lore: 'Tireuse d\'élite légendaire sortie de sa retraite. Ses fléchettes soignent ses alliés et neutralisent ses ennemis.',
        color: '#5b7fb5',
        health: 250,
        stats: { health: 2, mobility: 2, difficulty: 3 },
        abilities: [
            { key: 'Clic G', name: 'Fusil biotique', text: 'Tir précis : soigne l\'allié touché (75) ou blesse l\'ennemi (75). Traverse la carte !' },
            { key: 'Maj', name: 'Fléchette soporifique', text: 'Endort le premier ennemi touché 5 s (il se réveille s\'il prend des dégâts).' },
            { key: 'E', name: 'Grenade biotique', text: 'Soigne les alliés et les rend plus faciles à soigner ; blesse les ennemis et bloque leurs soins 3 s.' },
            { key: 'Q', name: 'Nano-boost', text: 'Ultime : un allié visé inflige +50 % de dégâts et en subit 50 % de moins pendant 8 s.', ult: true }
        ]
    },
    {
        id: 'vespera',
        name: 'Vespera',
        role: 'support',
        inspiredBy: 'Moira',
        title: 'La Généticienne',
        lore: 'Scientifique brillante et sans scrupules. Une main soigne, l\'autre aspire la vie de ses ennemis.',
        color: '#9b4dca',
        health: 250,
        stats: { health: 2, mobility: 4, difficulty: 1 },
        abilities: [
            { key: 'Clic G', name: 'Étreinte : soin', text: 'Nuage doré en cône qui soigne tous les alliés devant elle (utilise de l\'énergie).' },
            { key: 'Clic D', name: 'Étreinte : drain', text: 'Rayon violet qui se fixe sur un ennemi : le blesse, la soigne et recharge son énergie.' },
            { key: 'Maj', name: 'Évanescence', text: 'Disparaît 0,8 s : intouchable et très rapide.' },
            { key: 'E', name: 'Orbe biotique', text: 'Orbe qui rebondit sur les murs et soigne les alliés qu\'il croise.' },
            { key: 'Q', name: 'Coalescence', text: 'Ultime (8 s) : long rayon qui soigne les alliés et blesse les ennemis sur sa trajectoire.', ult: true }
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
