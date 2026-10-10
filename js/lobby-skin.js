/* ==================================
   SKINS DU LOBBY - FOR2D ROYAL
   Personnages cartoon en SVG (viewBox 140 x 276, même silhouette pour tous).
   Styles : 'default' (coiffures + lunettes), 'knight', 'skeleton', 'ninja', 'astro',
   'chef', 'pirate', 'mecha', 'mage', 'viking', 'pumpkin', 'dragon'.
   Les couleurs viennent des variables CSS (--skin, --hair, --outfit, --outfit-dark,
   --pants, --shoes, --pack, --accent...), posées par la place du lobby (css/lobby.css)
   ou par renderSkinInto() à partir du catalogue (js/cosmetics.js).
   Les petits détails ont la classe sk-detail (cachés sur une place vide).

   API :
   - skinMarkup(skinId)        : balise <svg> du skin
   - renderSkinInto(el, skinId): couleurs + SVG dans n'importe quel conteneur
   - window.FOR2D_SKINS = { markup, render }
   ================================== */

import { Cosmetics, getSkin, getItem } from './cosmetics.js';
import { itemArt } from './item-art.js';

/* ===================== OUTILS ===================== */

// Trait épais façon cartoon : contour sombre puis couleur (classe CSS) par-dessus
function thick(d, cls, extra = '') {
    return `<path class="s-out ${extra}" d="${d}"/><path class="${cls} ${extra}" d="${d}"/>`;
}

/* ===================== STYLE PAR DÉFAUT ===================== */

// Coiffures (tête : ellipse centrée en 70, 58, rayons 32 x 34)
const HAIR = {
    spiky:
        '<path class="f-hair" d="M37 58 Q33 30 54 20 L50 8 L66 15 L74 2 L82 16 L98 10 L95 26 Q107 38 103 58 Q97 46 87 43 L82 50 L73 41 L63 49 L57 41 Q45 45 37 58 Z"/>' +
        '<path class="s-shine sk-detail" d="M50 30 Q56 22 64 20"/>',
    swoop:
        '<path class="f-hair" d="M37 60 Q32 22 70 18 Q106 18 104 54 Q100 42 92 40 Q80 54 50 50 Q42 52 37 60 Z"/>' +
        '<path class="s-shine sk-detail" d="M48 32 Q62 22 82 24"/>',
    bun:
        '<circle class="f-hair" cx="70" cy="17" r="12"/>' +
        '<path class="f-hair" d="M37 58 Q36 26 70 24 Q104 26 103 58 Q98 44 88 42 Q70 48 52 42 Q42 46 37 58 Z"/>' +
        '<path class="s-shine sk-detail" d="M64 10 Q70 7 76 10"/>',
    mohawk:
        '<path class="f-hair f-hair-soft" d="M38 56 Q38 34 58 30 L84 30 Q102 34 102 56 Q96 46 84 42 Q70 46 56 42 Q44 46 38 56 Z"/>' +
        '<path class="f-hair" d="M58 36 L55 10 L66 18 L70 0 L77 18 L87 10 L84 36 Q71 42 58 36 Z"/>' +
        '<path class="s-shine sk-detail" d="M62 30 L61 18"/>'
};

// Lunettes de ski posées sur le front
const GOGGLES =
    '<path class="s-strap" d="M37 42 Q70 30 103 42"/>' +
    '<path class="s-accent" d="M37 42 Q70 30 103 42"/>' +
    '<rect class="f-lens" x="49" y="28" width="19" height="14" rx="6"/>' +
    '<rect class="f-lens" x="72" y="28" width="19" height="14" rx="6"/>' +
    '<rect class="f-belt" x="67" y="32" width="6" height="5" rx="1.5"/>' +
    '<path class="s-shine sk-detail" d="M53 32 L57 31 M76 32 L80 31"/>';

// Visage souriant (commun au style par défaut)
const FACE =
    '<g class="sk-detail">' +
    '<path class="s-brow" d="M50 53 Q56 49 64 52 M76 52 Q84 49 90 53"/>' +
    '<g class="sk-eyes">' +
    '<ellipse class="f-line" cx="58" cy="64" rx="5" ry="6.5"/>' +
    '<ellipse class="f-line" cx="82" cy="64" rx="5" ry="6.5"/>' +
    '<circle class="f-white" cx="59.8" cy="61.6" r="1.8"/>' +
    '<circle class="f-white" cx="83.8" cy="61.6" r="1.8"/>' +
    '</g>' +
    '<ellipse class="f-blush" cx="49" cy="76" rx="5" ry="3"/>' +
    '<ellipse class="f-blush" cx="91" cy="76" rx="5" ry="3"/>' +
    '<path class="s-nose" d="M71 67 Q68 72 72 73"/>' +
    '<path class="f-mouth" d="M62 79 Q72 89 82 79 Q72 83 62 79 Z"/>' +
    '</g>';

function defaultBody(hair, goggles) {
    return (
        // Sac à dos (derrière)
        '<rect class="f-pack" x="40" y="88" width="60" height="76" rx="16"/>' +
        // Jambes + genouillères
        '<rect class="f-pants" x="46" y="160" width="22" height="94" rx="7"/>' +
        '<rect class="f-pants" x="72" y="160" width="22" height="94" rx="7"/>' +
        '<rect class="f-shade" x="84" y="166" width="8" height="84" rx="3"/>' +
        '<rect class="f-accent" x="44" y="204" width="26" height="16" rx="5"/>' +
        '<rect class="f-accent" x="70" y="204" width="26" height="16" rx="5"/>' +
        // Baskets
        '<rect class="f-shoes" x="32" y="246" width="36" height="21" rx="9"/>' +
        '<rect class="f-shoes" x="72" y="246" width="36" height="21" rx="9"/>' +
        '<rect class="f-sole" x="31" y="261" width="38" height="9" rx="4"/>' +
        '<rect class="f-sole" x="71" y="261" width="38" height="9" rx="4"/>' +
        '<path class="s-accent sk-detail" d="M40 253 L56 253 M84 253 L100 253"/>' +
        // Veste
        '<path class="f-outfit" d="M44 102 Q70 92 96 102 Q100 136 99 168 Q70 176 41 168 Q40 136 44 102 Z"/>' +
        '<path class="f-shade" d="M72 96 Q86 97 96 102 Q100 136 99 168 Q86 172 72 173 Z"/>' +
        '<path class="s-zip" d="M70 108 V158"/>' +
        '<rect class="f-belt" x="66" y="112" width="8" height="10" rx="2"/>' +
        // Bretelles du sac + sangle de poitrine
        '<path class="s-strap" d="M51 101 L57 164 M89 101 L83 164 M54 134 H86"/>' +
        '<path class="s-pack" d="M51 101 L57 164 M89 101 L83 164 M54 134 H86"/>' +
        '<rect class="f-accent" x="63" y="129" width="14" height="10" rx="2"/>' +
        // Ceinture
        '<rect class="f-belt" x="41" y="158" width="58" height="11" rx="3"/>' +
        '<rect class="f-accent" x="63" y="158" width="14" height="11" rx="2"/>' +
        // Bras (manches) + mains
        '<path class="f-outfit-d" d="M46 104 Q34 106 30 120 L24 158 Q24 166 32 167 Q40 167 41 160 L47 124 Z"/>' +
        '<path class="f-outfit-d" d="M94 104 Q106 106 110 120 L116 158 Q116 166 108 167 Q100 167 99 160 L93 124 Z"/>' +
        '<path class="s-shine sk-detail" d="M35 122 L31 148"/>' +
        '<circle class="f-skin" cx="30" cy="170" r="9.5"/>' +
        '<circle class="f-skin" cx="110" cy="170" r="9.5"/>' +
        '<rect class="f-accent" x="21" y="156" width="20" height="7" rx="3"/>' +
        '<rect class="f-accent" x="99" y="156" width="20" height="7" rx="3"/>' +
        // Cou, col, écharpe
        '<rect class="f-skin" x="61" y="84" width="18" height="14" rx="4"/>' +
        '<path class="f-outfit-d" d="M56 99 L70 112 L84 99 Q78 94 70 94 Q62 94 56 99 Z"/>' +
        '<path class="f-accent sk-scarf" d="M80 98 L93 119 L84 121 L75 102 Z"/>' +
        '<path class="f-accent" d="M53 97 Q70 107 87 97 L87 89 Q70 98 53 89 Z"/>' +
        // Tête
        '<circle class="f-skin" cx="39" cy="62" r="7"/>' +
        '<circle class="f-skin" cx="101" cy="62" r="7"/>' +
        '<ellipse class="f-skin" cx="70" cy="58" rx="32" ry="34"/>' +
        '<path class="f-shade-soft" d="M84 28 Q104 40 102 62 Q100 84 80 92 Q96 76 96 58 Q96 40 84 28 Z"/>' +
        (HAIR[hair] || HAIR.spiky) +
        (goggles ? GOGGLES : '') +
        FACE
    );
}

/* ===================== CHEVALIER D'ACIER ===================== */

function knightBody() {
    return (
        // Cape rouge derrière
        '<path class="f-pack" d="M42 98 Q70 90 98 98 L114 236 Q92 246 70 240 Q48 246 26 236 Z"/>' +
        '<path class="f-shade" d="M74 94 Q88 95 98 98 L114 236 Q96 244 80 240 Z"/>' +
        '<path class="s-fold sk-detail" d="M50 120 L42 228 M62 118 L60 232"/>' +
        // Jambières + genouillères
        '<rect class="f-pants" x="46" y="164" width="22" height="88" rx="6"/>' +
        '<rect class="f-pants" x="72" y="164" width="22" height="88" rx="6"/>' +
        '<rect class="f-shade" x="84" y="168" width="8" height="80" rx="3"/>' +
        '<ellipse class="f-outfit" cx="57" cy="212" rx="14" ry="11"/>' +
        '<ellipse class="f-outfit" cx="83" cy="212" rx="14" ry="11"/>' +
        '<path class="s-shine sk-detail" d="M50 208 Q56 203 62 205 M76 208 Q82 203 88 205"/>' +
        // Solerets (bouts pointus)
        '<path class="f-shoes" d="M30 266 Q30 248 46 246 L68 246 L68 268 Z"/>' +
        '<path class="f-shoes" d="M72 246 L94 246 Q110 248 110 266 L72 268 Z"/>' +
        '<path class="s-plate sk-detail" d="M40 256 H66 M74 256 H100"/>' +
        // Tassettes (plaques des hanches)
        '<path class="f-outfit-d" d="M42 160 L68 162 L66 186 L46 182 Z"/>' +
        '<path class="f-outfit-d" d="M98 160 L72 162 L74 186 L94 182 Z"/>' +
        // Plastron
        '<path class="f-outfit" d="M42 104 Q70 92 98 104 Q102 136 98 166 Q70 174 42 166 Q38 136 42 104 Z"/>' +
        '<path class="f-shade" d="M72 97 Q86 98 98 104 Q102 136 98 166 Q86 170 72 171 Z"/>' +
        '<path class="s-plate" d="M70 102 V168"/>' +
        '<path class="s-shine sk-detail" d="M50 112 Q54 104 62 102"/>' +
        '<path class="s-plate sk-detail" d="M46 146 Q70 154 94 146"/>' +
        // Blason doré (écu + croix)
        '<path class="f-accent" d="M58 112 H82 V128 Q82 140 70 146 Q58 140 58 128 Z"/>' +
        '<path class="f-pack sk-detail" d="M67 116 H73 V124 H79 V130 H73 V140 H67 V130 H61 V124 H67 Z" style="stroke-width:2"/>' +
        // Ceinture
        '<rect class="f-belt" x="40" y="158" width="60" height="10" rx="3"/>' +
        '<rect class="f-accent" x="63" y="157" width="14" height="12" rx="2"/>' +
        // Bras en acier + gantelets
        '<path class="f-outfit-d" d="M44 110 Q32 112 29 124 L24 158 Q24 165 32 166 Q40 166 41 159 L46 128 Z"/>' +
        '<path class="f-outfit-d" d="M96 110 Q108 112 111 124 L116 158 Q116 165 108 166 Q100 166 99 159 L94 128 Z"/>' +
        '<path class="s-plate sk-detail" d="M27 138 L42 140 M113 138 L98 140"/>' +
        '<path class="f-outfit" d="M20 158 Q30 150 42 158 L40 176 Q30 182 22 176 Z"/>' +
        '<path class="f-outfit" d="M120 158 Q110 150 98 158 L100 176 Q110 182 118 176 Z"/>' +
        // Épaulières arrondies (par-dessus)
        '<path class="f-outfit" d="M24 118 Q24 96 48 96 Q58 98 58 110 Q46 110 38 122 Z"/>' +
        '<path class="f-outfit" d="M116 118 Q116 96 92 96 Q82 98 82 110 Q94 110 102 122 Z"/>' +
        '<path class="s-shine sk-detail" d="M30 110 Q34 102 44 100 M110 110 Q106 102 96 100"/>' +
        '<path class="s-plate sk-detail" d="M28 112 Q40 104 54 106 M112 112 Q100 104 86 106"/>' +
        // Gorgerin
        '<path class="f-outfit-d" d="M52 94 Q70 102 88 94 L88 86 Q70 94 52 86 Z"/>' +
        // Panache (derrière le heaume)
        '<path class="f-pack sk-plume" d="M66 22 Q70 -4 100 2 Q112 4 118 18 Q104 12 96 20 Q104 26 104 40 Q92 26 80 30 Z"/>' +
        '<path class="s-fold sk-detail" d="M76 18 Q90 6 108 10"/>' +
        // Heaume fermé
        '<path class="f-hair" d="M38 60 Q36 22 70 20 Q104 22 102 60 L100 86 Q70 96 40 86 Z"/>' +
        '<path class="f-shade" d="M80 21 Q104 26 102 60 L100 86 Q90 90 80 91 Q94 70 92 48 Q90 30 80 21 Z"/>' +
        '<path class="s-plate" d="M70 22 V52"/>' +
        '<path class="s-shine sk-detail" d="M46 46 Q48 30 62 25"/>' +
        // Visière à fentes (lueur dorée derrière)
        '<rect class="f-line" x="44" y="52" width="52" height="11" rx="4"/>' +
        '<rect class="f-glow sk-detail sk-glow" x="52" y="55" width="12" height="4" rx="2"/>' +
        '<rect class="f-glow sk-detail sk-glow" x="76" y="55" width="12" height="4" rx="2"/>' +
        // Trous de respiration
        '<g class="sk-detail">' +
        '<circle class="f-line" cx="58" cy="74" r="2.2"/><circle class="f-line" cx="66" cy="76" r="2.2"/>' +
        '<circle class="f-line" cx="74" cy="76" r="2.2"/><circle class="f-line" cx="82" cy="74" r="2.2"/>' +
        '</g>' +
        '<path class="s-plate" d="M40 70 Q70 80 100 70"/>'
    );
}

/* ===================== OS MAUDIT (SQUELETTE) ===================== */

function skeletonBody() {
    const bone = (d) => thick(d, 's-bone');
    return (
        // Flammèches de corruption qui flottent (derrière)
        '<g class="sk-detail">' +
        '<path class="f-glow sk-wisp" d="M22 120 Q14 104 24 92 Q24 104 32 108 Q32 118 22 120 Z"/>' +
        '<path class="f-glow sk-wisp sk-wisp-b" d="M118 150 Q128 134 118 122 Q118 134 110 138 Q110 148 118 150 Z"/>' +
        '<path class="f-glow sk-wisp sk-wisp-c" d="M112 64 Q120 52 114 42 Q112 52 106 54 Q106 62 112 64 Z"/>' +
        '</g>' +
        // Jambes en os (fémur, genou, tibia)
        bone('M57 186 V206 M83 186 V206') +
        '<ellipse class="f-skin" cx="57" cy="210" rx="7" ry="6"/>' +
        '<ellipse class="f-skin" cx="83" cy="210" rx="7" ry="6"/>' +
        bone('M57 214 V246 M83 214 V246') +
        // Short en lambeaux
        '<path class="f-pants" d="M42 160 H98 L96 192 L88 186 L82 194 L74 186 L70 192 L66 186 L58 194 L52 186 L44 192 Z"/>' +
        '<path class="f-shade" d="M74 160 H98 L96 192 L88 186 L82 194 L74 186 Z"/>' +
        // Bottes usées
        '<path class="f-shoes" d="M34 266 Q32 248 48 244 L66 244 L68 268 Z"/>' +
        '<path class="f-shoes" d="M72 244 L92 244 Q108 248 106 266 L72 268 Z"/>' +
        '<path class="s-fold sk-detail" d="M44 254 L54 252 M86 252 L96 254"/>' +
        // Cage thoracique (fond sombre + côtes)
        '<path class="f-outfit-d" d="M50 102 Q70 96 90 102 L92 150 Q70 158 48 150 Z"/>' +
        bone('M70 104 V156') +
        bone('M54 114 Q62 110 70 114 Q78 110 86 114 M52 126 Q61 121 70 126 Q79 121 88 126 M53 138 Q61 133 70 138 Q79 133 87 138') +
        '<path class="f-glow sk-detail sk-glow" d="M70 118 Q64 112 64 120 Q64 126 70 130 Q76 126 76 120 Q76 112 70 118 Z" style="stroke-width:2.5"/>' +
        // Veste ouverte en lambeaux
        '<path class="f-outfit" d="M42 102 Q52 96 58 98 L56 160 L50 154 L46 166 L40 158 Q38 130 42 102 Z"/>' +
        '<path class="f-outfit" d="M98 102 Q88 96 82 98 L84 160 L90 154 L94 166 L100 158 Q102 130 98 102 Z"/>' +
        '<path class="f-shade" d="M98 102 Q88 96 82 98 L84 160 L90 154 L94 166 L100 158 Q102 130 98 102 Z"/>' +
        '<path class="s-fold sk-detail" d="M46 116 L52 124 M92 118 L88 128"/>' +
        // Bassin
        '<path class="f-skin" d="M54 150 Q70 162 86 150 L84 162 Q70 168 56 162 Z"/>' +
        // Manches déchirées + avant-bras en os + mains
        '<path class="f-outfit-d" d="M44 104 Q32 106 29 120 L28 136 L34 132 L38 140 L44 132 L47 122 Z"/>' +
        '<path class="f-outfit-d" d="M96 104 Q108 106 111 120 L112 136 L106 132 L102 140 L96 132 L93 122 Z"/>' +
        bone('M34 140 L28 164 M106 140 L112 164') +
        '<circle class="f-skin" cx="27" cy="170" r="8"/>' +
        '<circle class="f-skin" cx="113" cy="170" r="8"/>' +
        '<path class="s-fold sk-detail" d="M23 176 L21 182 M28 178 L28 184 M117 176 L119 182 M112 178 L112 184"/>' +
        // Vertèbres du cou
        '<rect class="f-skin" x="63" y="86" width="14" height="7" rx="2"/>' +
        '<rect class="f-skin" x="64" y="93" width="12" height="7" rx="2"/>' +
        // Crâne + mâchoire
        '<path class="f-skin" d="M38 58 Q38 22 70 22 Q102 22 102 58 Q102 74 92 80 L92 86 L48 86 L48 80 Q38 74 38 58 Z"/>' +
        '<path class="f-shade-soft" d="M84 26 Q104 36 102 60 Q100 76 90 82 Q96 66 94 50 Q92 34 84 26 Z"/>' +
        '<path class="s-shine sk-detail" d="M48 42 Q52 30 64 27"/>' +
        '<path class="s-fold sk-detail" d="M88 30 L82 40 L86 46"/>' +
        // Orbites + pupilles violettes
        '<ellipse class="f-line" cx="56" cy="58" rx="10" ry="11"/>' +
        '<ellipse class="f-line" cx="84" cy="58" rx="10" ry="11"/>' +
        '<g class="sk-detail sk-eyes">' +
        '<circle class="f-glow sk-glow" cx="57" cy="59" r="4.2"/>' +
        '<circle class="f-glow sk-glow" cx="83" cy="59" r="4.2"/>' +
        '<circle class="f-white" cx="58.5" cy="57.5" r="1.4"/>' +
        '<circle class="f-white" cx="84.5" cy="57.5" r="1.4"/>' +
        '</g>' +
        // Nez + dents
        '<path class="f-line" d="M70 66 L64 76 H76 Z"/>' +
        '<rect class="f-white" x="52" y="78" width="36" height="9" rx="2" style="stroke:#0a1030;stroke-width:2.5"/>' +
        '<path class="s-fold" d="M58 78 V87 M64 78 V87 M70 78 V87 M76 78 V87 M82 78 V87"/>'
    );
}

/* ===================== NINJA NÉON ===================== */

function ninjaBody() {
    return (
        // Katana dans le dos (poignée au-dessus de l'épaule droite)
        '<g transform="rotate(35 70 130)">' +
        '<rect class="f-pack" x="64" y="68" width="12" height="130" rx="4"/>' +
        '<rect class="f-accent" x="57" y="62" width="26" height="7" rx="3"/>' +
        '<rect class="f-belt" x="65" y="30" width="10" height="32" rx="3"/>' +
        '<path class="s-accent sk-detail" d="M65 36 L75 42 M65 44 L75 50 M65 52 L75 58"/>' +
        '<circle class="f-accent" cx="70" cy="29" r="4"/>' +
        '</g>' +
        // Pantalon + bandes aux chevilles
        '<path class="f-pants" d="M44 160 H69 L67 244 H47 Z"/>' +
        '<path class="f-pants" d="M71 160 H96 L93 244 H73 Z"/>' +
        '<path class="f-shade" d="M84 162 H96 L93 244 H84 Z"/>' +
        '<g class="sk-detail">' +
        '<rect class="f-belt" x="46" y="228" width="22" height="16" rx="3"/>' +
        '<rect class="f-belt" x="72" y="228" width="22" height="16" rx="3"/>' +
        '<path class="s-accent" d="M47 232 L67 238 M73 238 L93 232"/>' +
        '</g>' +
        // Tabi (pouce séparé)
        '<rect class="f-shoes" x="34" y="244" width="34" height="23" rx="9"/>' +
        '<rect class="f-shoes" x="72" y="244" width="34" height="23" rx="9"/>' +
        '<path class="s-fold sk-detail" d="M42 250 V266 M98 250 V266"/>' +
        // Kimono croisé avec liserés néon
        '<path class="f-outfit" d="M44 102 Q70 92 96 102 Q100 136 98 166 Q70 174 42 166 Q40 136 44 102 Z"/>' +
        '<path class="f-shade" d="M72 96 Q86 97 96 102 Q100 136 98 166 Q86 170 72 171 Z"/>' +
        '<path class="f-outfit-d" d="M54 98 L86 150 L92 104 Q86 98 78 97 Z"/>' +
        thick('M54 98 L86 150', 's-neon') +
        '<path class="s-shine sk-detail" d="M50 114 Q52 106 58 104"/>' +
        // Ceinture obi + nœud néon
        '<rect class="f-outfit-d" x="40" y="152" width="60" height="16" rx="3"/>' +
        '<path class="s-neon" d="M42 160 H98"/>' +
        '<path class="f-accent" d="M46 158 L36 176 L46 172 L50 180 Z"/>' +
        // Manches + bandages + mains
        '<path class="f-outfit-d" d="M46 104 Q34 106 30 120 L25 150 L42 150 L47 124 Z"/>' +
        '<path class="f-outfit-d" d="M94 104 Q106 106 110 120 L115 150 L98 150 L93 124 Z"/>' +
        '<rect class="f-belt" x="23" y="146" width="20" height="16" rx="4"/>' +
        '<rect class="f-belt" x="97" y="146" width="20" height="16" rx="4"/>' +
        '<path class="s-accent sk-detail" d="M24 151 L42 155 M98 155 L116 151"/>' +
        '<circle class="f-skin" cx="32" cy="169" r="9"/>' +
        '<circle class="f-skin" cx="108" cy="169" r="9"/>' +
        // Cou
        '<rect class="f-hair" x="60" y="84" width="20" height="16" rx="4"/>' +
        // Pans du bandeau qui flottent derrière la tête
        '<path class="f-accent sk-scarf" d="M98 40 Q116 34 126 44 Q116 44 110 50 Q118 56 124 68 Q108 60 98 52 Z"/>' +
        // Cagoule
        '<ellipse class="f-hair" cx="70" cy="58" rx="33" ry="35"/>' +
        '<path class="f-shade" d="M84 26 Q104 38 103 60 Q102 84 80 93 Q96 76 96 58 Q96 40 84 26 Z"/>' +
        '<path class="s-shine sk-detail" d="M46 40 Q50 30 60 26"/>' +
        // Bandeau néon
        '<path class="f-accent" d="M37 44 Q70 32 103 44 L103 52 Q70 40 37 52 Z"/>' +
        '<rect class="f-white" x="64" y="38" width="12" height="9" rx="2" style="stroke:#0a1030;stroke-width:2.5"/>' +
        // Fente des yeux (peau) + regard déterminé
        '<path class="f-skin" d="M42 60 Q70 52 98 60 Q98 72 94 74 Q70 68 46 74 Q42 72 42 60 Z"/>' +
        '<g class="sk-detail">' +
        '<path class="s-brow" d="M50 60 L64 64 M90 60 L76 64"/>' +
        '<g class="sk-eyes">' +
        '<ellipse class="f-line" cx="59" cy="67" rx="4.5" ry="4"/>' +
        '<ellipse class="f-line" cx="81" cy="67" rx="4.5" ry="4"/>' +
        '<circle class="f-white" cx="60.5" cy="65.8" r="1.4"/>' +
        '<circle class="f-white" cx="82.5" cy="65.8" r="1.4"/>' +
        '</g>' +
        '<path class="s-fold" d="M52 84 Q70 90 88 84"/>' +
        '</g>'
    );
}

/* ===================== ASTRO PIONNIER ===================== */

function astroBody() {
    return (
        // Sac réacteur + propulseurs + flammes
        '<rect class="f-pack" x="34" y="90" width="72" height="84" rx="14"/>' +
        '<rect class="f-belt" x="38" y="170" width="18" height="16" rx="4"/>' +
        '<rect class="f-belt" x="84" y="170" width="18" height="16" rx="4"/>' +
        '<g class="sk-detail sk-flame">' +
        '<path class="f-flame" d="M40 186 Q47 208 54 186 Z"/>' +
        '<path class="f-flame" d="M86 186 Q93 208 100 186 Z"/>' +
        '<path class="f-flame2" d="M43 186 Q47 198 51 186 Z" style="stroke-width:2"/>' +
        '<path class="f-flame2" d="M89 186 Q93 198 97 186 Z" style="stroke-width:2"/>' +
        '</g>' +
        // Jambes rembourrées
        '<rect class="f-pants" x="44" y="160" width="24" height="90" rx="10"/>' +
        '<rect class="f-pants" x="72" y="160" width="24" height="90" rx="10"/>' +
        '<rect class="f-shade" x="85" y="166" width="9" height="80" rx="4"/>' +
        '<path class="s-fold sk-detail" d="M46 190 H66 M46 216 H66 M74 190 H94 M74 216 H94"/>' +
        // Bottes lunaires
        '<rect class="f-shoes" x="32" y="240" width="38" height="28" rx="10"/>' +
        '<rect class="f-shoes" x="70" y="240" width="38" height="28" rx="10"/>' +
        '<rect class="f-sole" x="30" y="262" width="42" height="9" rx="4"/>' +
        '<rect class="f-sole" x="68" y="262" width="42" height="9" rx="4"/>' +
        '<path class="s-accent sk-detail" d="M36 248 H66 M74 248 H104"/>' +
        // Combinaison
        '<path class="f-outfit" d="M40 104 Q70 90 100 104 Q104 138 100 168 Q70 178 40 168 Q36 138 40 104 Z"/>' +
        '<path class="f-shade" d="M72 96 Q88 97 100 104 Q104 138 100 168 Q86 173 72 174 Z"/>' +
        '<path class="s-shine sk-detail" d="M48 114 Q52 106 60 104"/>' +
        // Panneau de contrôle + voyants
        '<rect class="f-belt" x="56" y="118" width="28" height="22" rx="4"/>' +
        '<g class="sk-detail">' +
        '<circle class="f-accent sk-glow" cx="63" cy="125" r="3" style="stroke-width:1.5"/>' +
        '<circle class="f-red" cx="71" cy="125" r="3" style="stroke-width:1.5"/>' +
        '<circle class="f-flame2" cx="79" cy="125" r="3" style="stroke-width:1.5"/>' +
        '<rect class="f-lens" x="60" y="131" width="20" height="5" rx="2" style="stroke-width:1.5"/>' +
        '</g>' +
        // Ceinture
        '<rect class="f-belt" x="38" y="156" width="64" height="11" rx="4"/>' +
        '<rect class="f-pack" x="63" y="155" width="14" height="13" rx="3"/>' +
        // Bras rembourrés + gants
        '<path class="f-outfit-d" d="M44 104 Q30 106 27 122 L22 156 Q22 166 32 167 Q42 167 43 158 L47 124 Z"/>' +
        '<path class="f-outfit-d" d="M96 104 Q110 106 113 122 L118 156 Q118 166 108 167 Q98 167 97 158 L93 124 Z"/>' +
        '<path class="s-fold sk-detail" d="M26 136 L44 138 M114 136 L96 138"/>' +
        '<circle class="f-shoes" cx="30" cy="170" r="10.5"/>' +
        '<circle class="f-shoes" cx="110" cy="170" r="10.5"/>' +
        // Écusson sur l'épaule
        '<circle class="f-accent" cx="36" cy="116" r="7.5" style="stroke-width:3"/>' +
        '<path class="f-white sk-detail" d="M36 111 L37.5 114.6 L41 115 L38.3 117.3 L39.2 121 L36 119 L32.8 121 L33.7 117.3 L31 115 L34.5 114.6 Z"/>' +
        // Col du casque
        '<rect class="f-belt" x="46" y="86" width="48" height="14" rx="6"/>' +
        // Antenne
        '<path class="s-plate" d="M92 30 L104 4"/>' +
        '<circle class="f-red sk-glow" cx="104" cy="4" r="4.5" style="stroke-width:3"/>' +
        // Casque : coque, visage deviné, visière teintée, reflets
        '<circle class="f-outfit" cx="70" cy="56" r="38"/>' +
        '<path class="f-shade" d="M86 22 Q110 36 108 58 Q106 84 84 92 Q100 74 100 56 Q100 36 86 22 Z"/>' +
        '<g class="sk-detail">' +
        '<ellipse class="f-skin" cx="70" cy="62" rx="22" ry="21" style="stroke:none"/>' +
        '<ellipse class="f-line" cx="62" cy="62" rx="3.5" ry="4.5"/>' +
        '<ellipse class="f-line" cx="78" cy="62" rx="3.5" ry="4.5"/>' +
        '<path class="s-fold" d="M63 72 Q70 77 77 72"/>' +
        '</g>' +
        '<path class="f-visor" d="M40 56 Q40 32 70 32 Q100 32 100 56 Q100 84 70 86 Q40 84 40 56 Z"/>' +
        '<path class="f-visor-shine sk-detail" d="M48 50 Q50 38 64 36 Q54 44 54 54 Z"/>' +
        '<path class="s-shine sk-detail" d="M84 76 Q92 72 94 64"/>'
    );
}

// Petite étoile à 4 branches (constellations, scintillements)
function star(x, y, s, cls = 'f-white') {
    return `<path class="${cls}" d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z"/>`;
}

/* ===================== CHEF RACLETTE (peu commun) ===================== */

function chefBody() {
    // Carreaux du pantalon de cuisine
    let checks = '';
    for (let row = 0; row < 5; row++) {
        const y = 170 + row * 16;
        const off = row % 2 ? 8 : 0;
        for (const x0 of [48, 74]) {
            checks += `<rect class="f-check" x="${x0 + off}" y="${y}" width="8" height="8"/>`;
        }
    }
    return (
        // Baguette en travers du dos
        '<g transform="rotate(-38 70 120)">' +
        '<rect class="f-wood" x="58" y="40" width="24" height="150" rx="12"/>' +
        '<path class="s-fold sk-detail" d="M62 64 L76 72 M62 90 L76 98 M62 116 L76 124 M62 142 L76 150 M62 168 L76 176"/>' +
        '</g>' +
        // Pantalon à carreaux
        '<rect class="f-pants" x="46" y="160" width="22" height="90" rx="7"/>' +
        '<rect class="f-pants" x="72" y="160" width="22" height="90" rx="7"/>' +
        `<g class="sk-detail">${checks}</g>` +
        '<rect class="f-shade" x="84" y="166" width="8" height="80" rx="3"/>' +
        // Sabots de cuisine
        '<path class="f-shoes" d="M30 268 Q28 248 48 246 H68 V268 Z"/>' +
        '<path class="f-shoes" d="M72 246 H92 Q112 248 110 268 H72 Z"/>' +
        '<rect class="f-sole" x="29" y="262" width="40" height="8" rx="4"/>' +
        '<rect class="f-sole" x="71" y="262" width="40" height="8" rx="4"/>' +
        // Veste de chef croisée + 2 rangées de boutons
        '<path class="f-outfit" d="M42 102 Q70 92 98 102 Q102 136 100 170 Q70 178 40 170 Q38 136 42 102 Z"/>' +
        '<path class="f-shade" d="M72 96 Q86 97 98 102 Q102 136 100 170 Q86 174 72 175 Z"/>' +
        '<path class="s-plate sk-detail" d="M56 100 Q64 112 62 136"/>' +
        '<circle class="f-gold" cx="58" cy="114" r="3.2" style="stroke-width:2"/><circle class="f-gold" cx="82" cy="114" r="3.2" style="stroke-width:2"/>' +
        '<circle class="f-gold" cx="59" cy="128" r="3.2" style="stroke-width:2"/><circle class="f-gold" cx="81" cy="128" r="3.2" style="stroke-width:2"/>' +
        // Tablier + poche + lacet
        '<path class="f-cloth" d="M48 136 H92 L97 208 Q70 216 43 208 Z"/>' +
        '<path class="f-shade" d="M72 136 H92 L97 208 Q84 212 72 213 Z"/>' +
        '<rect class="f-cloth" x="58" y="150" width="24" height="16" rx="3"/>' +
        '<path class="s-plate" d="M42 138 H98"/>' +
        '<path class="s-fold sk-detail" d="M56 176 L54 204 M84 176 L86 204"/>' +
        // Manches retroussées + mains + cuillère en bois
        '<path class="f-outfit-d" d="M46 104 Q34 106 30 120 L24 158 Q24 166 32 167 Q40 167 41 160 L47 124 Z"/>' +
        '<path class="f-outfit-d" d="M94 104 Q106 106 110 120 L116 158 Q116 166 108 167 Q100 167 99 160 L93 124 Z"/>' +
        '<rect class="f-outfit" x="21" y="148" width="22" height="10" rx="4"/>' +
        '<rect class="f-outfit" x="97" y="148" width="22" height="10" rx="4"/>' +
        thick('M112 174 L126 124', 's-wood') +
        '<ellipse class="f-wood" cx="128" cy="114" rx="8" ry="11" transform="rotate(16 128 114)"/>' +
        '<circle class="f-skin" cx="30" cy="170" r="9.5"/>' +
        '<circle class="f-skin" cx="110" cy="170" r="9.5"/>' +
        // Cou + foulard rouge noué
        '<rect class="f-skin" x="61" y="84" width="18" height="14" rx="4"/>' +
        '<path class="f-accent" d="M52 92 Q70 104 88 92 L86 102 Q70 112 54 102 Z"/>' +
        '<path class="f-accent sk-scarf" d="M68 104 L58 122 L69 118 L72 106 Z"/>' +
        '<circle class="f-accent" cx="70" cy="104" r="5"/>' +
        // Tête : oreilles, visage, favoris, yeux rieurs, gros nez, moustache
        '<circle class="f-skin" cx="39" cy="62" r="7"/>' +
        '<circle class="f-skin" cx="101" cy="62" r="7"/>' +
        '<ellipse class="f-skin" cx="70" cy="60" rx="31" ry="32"/>' +
        '<path class="f-shade-soft" d="M84 32 Q102 42 101 62 Q99 84 80 92 Q95 76 95 60 Q95 42 84 32 Z"/>' +
        '<path class="f-hair" d="M39 58 Q40 44 46 40 L48 64 Z M101 58 Q100 44 94 40 L92 64 Z"/>' +
        '<g class="sk-detail">' +
        '<path class="s-brow" d="M50 52 Q57 48 64 51 M76 51 Q83 48 90 52"/>' +
        '<path class="s-brow" d="M53 62 Q58 57 63 62 M77 62 Q82 57 87 62"/>' +
        '<ellipse class="f-blush" cx="49" cy="72" rx="5" ry="3"/><ellipse class="f-blush" cx="91" cy="72" rx="5" ry="3"/>' +
        '</g>' +
        '<ellipse class="f-skin" cx="70" cy="69" rx="7" ry="6"/>' +
        '<path class="f-hair" d="M70 75 Q60 71 52 75 Q46 79 41 73 Q43 86 56 83 Q64 82 70 78 Q76 82 84 83 Q97 86 99 73 Q94 79 88 75 Q80 71 70 75 Z"/>' +
        '<path class="f-mouth" d="M64 85 Q70 91 76 85 Z"/>' +
        // Toque bouffante
        '<path class="f-cloth" d="M44 28 Q30 20 36 8 Q40 -4 54 -2 Q60 -10 72 -8 Q86 -12 92 0 Q106 2 104 14 Q110 24 96 28 Z"/>' +
        '<path class="f-shade sk-detail" d="M84 -6 Q92 0 92 0 Q106 2 104 14 Q110 24 96 28 L84 28 Q90 12 84 -6 Z"/>' +
        '<path class="s-fold sk-detail" d="M56 24 Q54 10 58 0 M70 24 V-6 M84 24 Q86 10 82 0"/>' +
        '<rect class="f-cloth" x="42" y="22" width="56" height="16" rx="4"/>'
    );
}

/* ===================== CAPITAINE CORSAIRE (rare) ===================== */

function pirateBody() {
    return (
        // Pans du manteau (derrière les jambes), liseré doré
        '<path class="f-outfit-d" d="M40 150 L35 236 Q50 243 62 232 L66 168 Z M100 150 L105 236 Q90 243 78 232 L74 168 Z"/>' +
        '<path class="s-neon sk-detail" d="M35 236 Q50 243 62 232 M105 236 Q90 243 78 232"/>' +
        // Culotte crème
        '<rect class="f-pants" x="46" y="160" width="22" height="56" rx="7"/>' +
        '<rect class="f-pants" x="72" y="160" width="22" height="54" rx="7"/>' +
        '<rect class="f-shade" x="84" y="166" width="8" height="44" rx="3"/>' +
        // Botte à revers (gauche)
        '<path class="f-shoes" d="M44 206 H70 V246 L72 268 H32 Q30 252 46 248 Z"/>' +
        '<rect class="f-shoes" x="41" y="200" width="32" height="12" rx="3"/>' +
        '<path class="s-fold sk-detail" d="M48 228 L64 230"/>' +
        // Jambe de bois (droite) + sangle
        '<path class="f-wood" d="M76 212 H90 L86 262 H80 Z"/>' +
        '<path class="s-fold sk-detail" d="M79 232 H88 M80 248 H87"/>' +
        '<ellipse class="f-belt" cx="83" cy="264" rx="6.5" ry="4"/>' +
        '<rect class="f-belt" x="73" y="206" width="20" height="9" rx="3"/>' +
        // Chemise à jabot
        '<path class="f-cloth" d="M54 100 H86 L77 150 H63 Z"/>' +
        '<path class="s-fold sk-detail" d="M62 108 Q70 113 78 108 M63 118 Q70 123 77 118 M65 128 Q70 133 75 128 M66 138 Q70 142 74 138"/>' +
        // Manteau ouvert, revers dorés, boutons
        '<path class="f-outfit" d="M42 102 Q50 96 60 98 L68 152 L66 172 Q52 174 40 168 Q38 136 42 102 Z"/>' +
        '<path class="f-outfit" d="M98 102 Q90 96 80 98 L72 152 L74 172 Q88 174 100 168 Q102 136 98 102 Z"/>' +
        '<path class="f-shade" d="M98 102 Q90 96 80 98 L72 152 L74 172 Q88 174 100 168 Q102 136 98 102 Z"/>' +
        '<path class="s-neon" d="M60 98 L68 152 M80 98 L72 152"/>' +
        '<circle class="f-gold" cx="52" cy="118" r="3" style="stroke-width:2"/><circle class="f-gold" cx="53" cy="134" r="3" style="stroke-width:2"/>' +
        '<circle class="f-gold" cx="88" cy="118" r="3" style="stroke-width:2"/><circle class="f-gold" cx="87" cy="134" r="3" style="stroke-width:2"/>' +
        // Baudrier en diagonale
        '<path class="s-strap" d="M45 104 L95 150"/>' +
        '<path class="s-pack" d="M45 104 L95 150"/>' +
        // Large ceinture + boucle dorée
        '<rect class="f-belt" x="40" y="152" width="60" height="13" rx="3"/>' +
        '<rect class="f-gold" x="62" y="150" width="16" height="17" rx="3"/>' +
        '<rect class="f-belt" x="66" y="154" width="8" height="9" rx="1"/>' +
        // Manches + revers dorés, main gauche, crochet à droite
        '<path class="f-outfit" d="M46 104 Q34 106 30 120 L24 156 Q24 162 32 163 Q40 163 41 158 L47 124 Z"/>' +
        '<path class="f-outfit" d="M94 104 Q106 106 110 120 L116 156 Q116 162 108 163 Q100 163 99 158 L93 124 Z"/>' +
        '<rect class="f-gold" x="21" y="150" width="22" height="9" rx="3"/>' +
        '<rect class="f-gold" x="97" y="150" width="22" height="9" rx="3"/>' +
        '<circle class="f-skin" cx="30" cy="168" r="9.5"/>' +
        thick('M110 160 V174 Q110 188 99 186', 's-steel') +
        '<rect class="f-steel" x="101" y="157" width="18" height="8" rx="3"/>' +
        // Perroquet sur l'épaule gauche (il dodeline)
        '<g class="sk-bob">' +
        '<path class="f-red" d="M27 98 L18 122 L28 116 L32 102 Z"/>' +
        '<ellipse class="f-parrot" cx="32" cy="88" rx="11" ry="14"/>' +
        '<ellipse class="f-parrot-d" cx="27" cy="92" rx="6" ry="11"/>' +
        '<circle class="f-parrot" cx="35" cy="73" r="9"/>' +
        '<path class="f-gold" d="M42 69 Q50 72 46 82 Q44 76 40 76 Z" style="stroke-width:2.5"/>' +
        '<circle class="f-line" cx="37" cy="71" r="2.4"/>' +
        '<circle class="f-white" cx="37.8" cy="70.2" r="0.9"/>' +
        '</g>' +
        // Cou
        '<rect class="f-skin" x="61" y="84" width="18" height="14" rx="4"/>' +
        // Tête : oreilles, visage, cache-œil, barbe, sourire à dent en or
        '<circle class="f-skin" cx="39" cy="62" r="7"/>' +
        '<circle class="f-skin" cx="101" cy="62" r="7"/>' +
        '<ellipse class="f-skin" cx="70" cy="62" rx="31" ry="32"/>' +
        '<path class="f-shade-soft" d="M84 34 Q102 44 101 64 Q99 86 80 94 Q95 78 95 62 Q95 44 84 34 Z"/>' +
        '<path class="f-hair" d="M40 66 Q42 98 70 102 Q98 98 100 66 Q92 80 84 80 Q70 86 56 80 Q48 80 40 66 Z"/>' +
        '<path class="f-hair" d="M70 76 Q60 72 53 78 Q60 83 70 80 Q80 83 87 78 Q80 72 70 76 Z"/>' +
        '<path class="f-mouth" d="M60 85 Q70 93 80 85 Z"/>' +
        '<rect class="f-gold" x="71" y="85" width="4.5" height="4" rx="1" style="stroke-width:1.5"/>' +
        '<g class="sk-detail">' +
        '<path class="s-brow" d="M50 54 Q57 50 64 54"/>' +
        '<g class="sk-eyes"><ellipse class="f-line" cx="58" cy="64" rx="4.5" ry="6"/><circle class="f-white" cx="59.6" cy="61.6" r="1.6"/></g>' +
        '<path class="s-nose" d="M71 66 Q68 71 72 72"/>' +
        '</g>' +
        '<path class="s-strap" d="M38 50 L102 68"/>' +
        '<ellipse class="f-line" cx="82" cy="63" rx="8.5" ry="7.5"/>' +
        // Tricorne : plume, calotte, bord relevé doré, tête de mort
        '<path class="f-red sk-plume" d="M90 14 Q106 -6 124 0 Q112 4 106 18 Z"/>' +
        '<path class="f-pack" d="M44 36 Q44 6 70 6 Q96 6 96 36 Z"/>' +
        '<path class="f-pack" d="M22 26 Q30 46 70 46 Q110 46 118 26 Q100 38 70 36 Q40 38 22 26 Z"/>' +
        '<path class="s-neon" d="M22 26 Q40 38 70 36 Q100 38 118 26"/>' +
        '<circle class="f-cloth" cx="70" cy="22" r="6.5" style="stroke-width:2"/>' +
        '<path class="s-cross sk-detail" d="M61 30 L79 36 M79 30 L61 36"/>' +
        '<circle class="f-line" cx="67.5" cy="21.5" r="1.6"/><circle class="f-line" cx="72.5" cy="21.5" r="1.6"/>'
    );
}

/* ===================== MÉCHA TITAN (épique) ===================== */

function mechaBody() {
    return (
        // Réacteurs dorsaux + flammes cyan
        '<rect class="f-pack" x="28" y="84" width="22" height="70" rx="6"/>' +
        '<rect class="f-pack" x="90" y="84" width="22" height="70" rx="6"/>' +
        '<path class="s-fold sk-detail" d="M33 96 H45 M33 104 H45 M95 96 H107 M95 104 H107"/>' +
        '<rect class="f-pants" x="31" y="150" width="16" height="12" rx="3"/>' +
        '<rect class="f-pants" x="93" y="150" width="16" height="12" rx="3"/>' +
        '<g class="sk-detail sk-flame">' +
        '<path class="f-glow" d="M32 162 Q39 192 46 162 Z"/>' +
        '<path class="f-glow" d="M94 162 Q101 192 108 162 Z"/>' +
        '<path class="f-white" d="M36 162 Q39 177 42 162 Z"/>' +
        '<path class="f-white" d="M98 162 Q101 177 104 162 Z"/>' +
        '</g>' +
        // Cuisses (articulations), tibias blindés, genouillères blanches
        '<rect class="f-pants" x="47" y="160" width="20" height="42" rx="5"/>' +
        '<rect class="f-pants" x="73" y="160" width="20" height="42" rx="5"/>' +
        '<path class="f-outfit" d="M42 202 H70 L68 246 H46 Z"/>' +
        '<path class="f-outfit" d="M70 202 H98 L94 246 H72 Z"/>' +
        '<path class="f-shade" d="M84 202 H98 L94 246 H84 Z"/>' +
        '<path class="f-hair" d="M45 194 H67 L65 214 Q56 221 47 214 Z"/>' +
        '<path class="f-hair" d="M73 194 H95 L93 214 Q84 221 75 214 Z"/>' +
        '<path class="s-neon sk-detail" d="M50 230 H64 M76 230 H90"/>' +
        // Pieds massifs + bande jaune
        '<path class="f-shoes" d="M28 268 L32 246 H68 V268 Z"/>' +
        '<path class="f-shoes" d="M72 246 H108 L112 268 H72 Z"/>' +
        '<rect class="f-pack" x="36" y="253" width="28" height="5" rx="2" style="stroke-width:2"/>' +
        '<rect class="f-pack" x="76" y="253" width="28" height="5" rx="2" style="stroke-width:2"/>' +
        // Bassin
        '<path class="f-pants" d="M44 156 H96 L92 178 H48 Z"/>' +
        '<rect class="f-hair" x="62" y="158" width="16" height="17" rx="3"/>' +
        // Torse anguleux + plastron blanc + cœur à fusion
        '<path class="f-outfit" d="M40 104 L54 96 H86 L100 104 L96 160 H44 Z"/>' +
        '<path class="f-shade" d="M72 96 H86 L100 104 L96 160 H72 Z"/>' +
        '<path class="f-hair" d="M52 104 H88 L84 134 Q70 141 56 134 Z"/>' +
        '<circle class="f-belt" cx="70" cy="120" r="11.5"/>' +
        '<circle class="f-glow sk-glow" cx="70" cy="120" r="7"/>' +
        '<circle class="f-white" cx="67.5" cy="117.5" r="2"/>' +
        '<path class="s-plate sk-detail" d="M50 142 H64 M50 148 H64 M76 142 H90 M76 148 H90"/>' +
        '<path class="f-pack" d="M45 153 H95 L94.5 160 H45.5 Z" style="stroke-width:2.5"/>' +
        '<path class="s-fold sk-detail" d="M52 153 L48 160 M62 153 L58 160 M72 153 L68 160 M82 153 L78 160 M92 153 L88 160"/>' +
        // Bras mécaniques : articulations, avant-bras, poings
        '<rect class="f-pants" x="25" y="112" width="17" height="32" rx="5"/>' +
        '<rect class="f-pants" x="98" y="112" width="17" height="32" rx="5"/>' +
        '<path class="f-outfit-d" d="M21 138 H45 L43 166 H23 Z"/>' +
        '<path class="f-outfit-d" d="M95 138 H119 L117 166 H97 Z"/>' +
        '<path class="s-neon sk-detail" d="M27 150 H39 M101 150 H113"/>' +
        '<rect class="f-skin" x="20" y="163" width="24" height="19" rx="5"/>' +
        '<rect class="f-skin" x="96" y="163" width="24" height="19" rx="5"/>' +
        '<path class="s-plate sk-detail" d="M26 170 V178 M32 170 V178 M38 170 V178 M102 170 V178 M108 170 V178 M114 170 V178"/>' +
        // Épaulières en bloc + bande jaune + rivets
        '<path class="f-outfit" d="M16 108 Q18 92 36 90 H55 L53 120 H18 Z"/>' +
        '<path class="f-outfit" d="M124 108 Q122 92 104 90 H85 L87 120 H122 Z"/>' +
        '<rect class="f-pack" x="18" y="108" width="35" height="6" style="stroke-width:2.5"/>' +
        '<rect class="f-pack" x="87" y="108" width="35" height="6" style="stroke-width:2.5"/>' +
        '<g class="sk-detail"><circle class="f-line" cx="26" cy="99" r="2"/><circle class="f-line" cx="44" cy="97" r="2"/>' +
        '<circle class="f-line" cx="114" cy="99" r="2"/><circle class="f-line" cx="96" cy="97" r="2"/></g>' +
        '<path class="s-shine sk-detail" d="M22 102 Q26 95 36 94 M118 102 Q114 95 104 94"/>' +
        // Cou mécanique
        '<rect class="f-pants" x="60" y="84" width="20" height="16" rx="3"/>' +
        // Tête : oreillettes, casque, masque, visière lumineuse, crête en V
        '<rect class="f-outfit" x="31" y="44" width="11" height="26" rx="3"/>' +
        '<rect class="f-outfit" x="98" y="44" width="11" height="26" rx="3"/>' +
        '<path class="f-hair" d="M40 50 Q40 22 70 20 Q100 22 100 50 L98 82 Q70 92 42 82 Z"/>' +
        '<path class="f-shade" d="M80 21 Q100 26 100 50 L98 82 Q90 86 80 88 Q92 70 92 50 Q90 30 80 21 Z"/>' +
        '<path class="f-skin" d="M50 66 H90 L86 84 Q70 91 54 84 Z"/>' +
        '<path class="s-plate sk-detail" d="M60 72 V82 M66 72 V84 M74 72 V84 M80 72 V82"/>' +
        '<path class="f-line" d="M43 46 H97 L93 62 H47 Z"/>' +
        '<path class="f-glow sk-glow" d="M50 50 H66 L64 57 H52 Z" style="stroke:none"/>' +
        '<path class="f-glow sk-glow" d="M74 50 H90 L88 57 H76 Z" style="stroke:none"/>' +
        '<path class="f-pack" d="M70 38 L42 6 L51 3 L70 26 L89 3 L98 6 Z"/>' +
        '<path class="f-red" d="M64 32 L70 23 L76 32 L70 41 Z" style="stroke-width:2.5"/>' +
        '<path class="s-shine sk-detail" d="M48 40 Q52 28 64 25"/>'
    );
}

/* ===================== ARCHIMAGE CÉLESTE (légendaire) ===================== */

function mageBody() {
    // Rune à 8 branches du cercle magique
    let rune = '';
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const b = ((i + 3) / 8) * Math.PI * 2;
        rune += `${i ? 'L' : 'M'}${(70 + Math.cos(a) * 56).toFixed(1)} ${(150 + Math.sin(a) * 56).toFixed(1)} ` +
            `L${(70 + Math.cos(b) * 56).toFixed(1)} ${(150 + Math.sin(b) * 56).toFixed(1)} `;
    }
    return (
        // Cercle de runes qui tourne derrière
        '<g class="sk-detail sk-spin">' +
        '<circle class="s-magic" cx="70" cy="150" r="66"/>' +
        '<circle class="s-magic s-magic-thin" cx="70" cy="150" r="56"/>' +
        `<path class="s-magic s-magic-thin" d="${rune}"/>` +
        '<circle class="f-glow" cx="70" cy="84" r="4" style="stroke-width:2"/>' +
        '<circle class="f-glow" cx="136" cy="150" r="4" style="stroke-width:2"/>' +
        '<circle class="f-glow" cx="70" cy="216" r="4" style="stroke-width:2"/>' +
        '<circle class="f-glow" cx="4" cy="150" r="4" style="stroke-width:2"/>' +
        '</g>' +
        // Orbes qui flottent autour
        '<g class="sk-detail">' +
        '<circle class="f-glow sk-orb" cx="14" cy="118" r="7"/>' +
        '<circle class="f-glow sk-orb sk-orb-b" cx="126" cy="96" r="6"/>' +
        '<circle class="f-glow sk-orb sk-orb-c" cx="124" cy="204" r="5"/>' +
        '</g>' +
        // Pieds sous la robe
        '<ellipse class="f-shoes" cx="54" cy="262" rx="12" ry="7"/>' +
        '<ellipse class="f-shoes" cx="86" cy="262" rx="12" ry="7"/>' +
        // Robe longue évasée
        '<path class="f-outfit" d="M44 100 Q70 90 96 100 L112 252 Q70 264 28 252 Z"/>' +
        '<path class="f-shade" d="M72 94 Q86 95 96 100 L112 252 Q92 258 72 259 Z"/>' +
        '<path class="f-pack" d="M64 160 H76 L80 259 Q70 261 60 259 Z"/>' +
        thick('M28 252 Q70 264 112 252', 's-gold') +
        // Constellations brodées
        '<g class="sk-detail">' +
        '<path class="s-const" d="M44 214 L52 196 L46 180 M92 220 L100 202 L94 188 L102 178"/>' +
        star(44, 214, 3.5) + star(52, 196, 4.5, 'f-white sk-twinkle') + star(46, 180, 3) +
        star(92, 220, 3.5) + star(100, 202, 4, 'f-white sk-twinkle sk-twinkle-b') + star(94, 188, 3) + star(102, 178, 3.5) +
        '</g>' +
        // Ceinture-écharpe + gemme
        '<path class="f-pack" d="M40 150 Q70 160 100 150 L100 162 Q70 172 40 162 Z"/>' +
        '<path class="f-glow sk-glow" d="M70 149 L77 158 L70 169 L63 158 Z" style="stroke-width:2.5"/>' +
        // Manches évasées + poignets dorés + mains
        '<path class="f-outfit-d" d="M46 104 Q32 106 28 124 L16 176 Q30 186 46 178 L50 128 Z"/>' +
        '<path class="f-outfit-d" d="M94 104 Q108 106 112 124 L124 176 Q110 186 94 178 L90 128 Z"/>' +
        thick('M16 176 Q30 186 46 178 M124 176 Q110 186 94 178', 's-gold') +
        '<circle class="f-skin" cx="32" cy="180" r="8"/>' +
        '<circle class="f-skin" cx="108" cy="180" r="8"/>' +
        // Orbe de lumière tenu dans la main droite
        '<circle class="f-glow sk-glow" cx="110" cy="162" r="11"/>' +
        '<circle class="f-white" cx="106" cy="158" r="3"/>' +
        // Col haut + broche
        '<path class="f-outfit-d" d="M44 96 Q70 112 96 96 L98 84 Q70 100 42 84 Z"/>' +
        thick('M42 84 Q70 100 98 84', 's-gold') +
        '<circle class="f-pack" cx="70" cy="104" r="7"/>' +
        '<circle class="f-glow sk-glow" cx="70" cy="104" r="3.8" style="stroke-width:2"/>' +
        // Capuche pointue + croissant de lune au bout
        '<path class="f-outfit" d="M34 74 Q30 30 60 14 Q78 4 104 -4 Q92 10 98 26 Q110 44 106 74 Q100 96 70 98 Q40 96 34 74 Z"/>' +
        '<path class="f-shade" d="M82 10 Q100 2 104 -4 Q92 10 98 26 Q110 44 106 74 Q100 96 70 98 Q96 80 96 56 Q96 30 82 10 Z"/>' +
        '<path class="f-pack" d="M100 -12 A8 8 0 1 0 112 2 A6 6 0 1 1 100 -12 Z" style="stroke-width:2.5"/>' +
        // Ouverture sombre + yeux lumineux + liseré doré
        '<path class="f-hair" d="M46 66 Q46 40 70 38 Q94 40 94 66 Q92 88 70 90 Q48 88 46 66 Z"/>' +
        '<g class="sk-eyes">' +
        '<ellipse class="f-glow sk-glow" cx="60" cy="64" rx="5.5" ry="3.5" style="stroke:none"/>' +
        '<ellipse class="f-glow sk-glow" cx="80" cy="64" rx="5.5" ry="3.5" style="stroke:none"/>' +
        '</g>' +
        thick('M46 66 Q46 40 70 38 Q94 40 94 66 Q92 88 70 90 Q48 88 46 66 Z', 's-gold') +
        '<path class="s-shine sk-detail" d="M42 56 Q44 36 58 24"/>' +
        // Étoiles qui scintillent autour de la capuche
        '<g class="sk-detail">' +
        star(20, 40, 4, 'f-white sk-twinkle') + star(120, 32, 3.5, 'f-white sk-twinkle sk-twinkle-b') +
        star(12, 84, 3, 'f-white sk-twinkle sk-twinkle-c') +
        '</g>'
    );
}

/* ===================== JARL DU FJORD (rare) ===================== */

function vikingBody() {
    return (
        // Bouclier rond peint dans le dos (dépasse à droite)
        '<circle class="f-wood" cx="106" cy="128" r="33"/>' +
        '<path class="f-pack" d="M106 128 V98 A30 30 0 0 1 136 128 Z M106 128 V158 A30 30 0 0 1 76 128 Z" style="stroke-width:2.5"/>' +
        '<circle class="s-steel" cx="106" cy="128" r="30"/>' +
        '<circle class="f-steel" cx="106" cy="128" r="7"/>' +
        // Jambes bandées + bottes fourrées
        '<rect class="f-pants" x="46" y="160" width="22" height="88" rx="7"/>' +
        '<rect class="f-pants" x="72" y="160" width="22" height="88" rx="7"/>' +
        '<rect class="f-shade" x="84" y="166" width="8" height="78" rx="3"/>' +
        '<path class="s-fold sk-detail" d="M48 196 L66 203 M48 211 L66 218 M48 226 L66 233 M74 196 L92 203 M74 211 L92 218 M74 226 L92 233"/>' +
        '<path class="f-shoes" d="M32 268 Q30 250 46 246 H68 V268 Z"/>' +
        '<path class="f-shoes" d="M72 246 H94 Q110 250 108 268 H72 Z"/>' +
        '<rect class="f-fur" x="42" y="236" width="30" height="13" rx="6"/>' +
        '<rect class="f-fur" x="68" y="236" width="30" height="13" rx="6"/>' +
        // Tunique longue, bordure dorée
        '<path class="f-outfit" d="M44 102 Q70 92 96 102 Q100 140 104 178 Q70 188 36 178 Q40 140 44 102 Z"/>' +
        '<path class="f-shade" d="M72 96 Q86 97 96 102 Q100 140 104 178 Q88 184 72 185 Z"/>' +
        thick('M36 178 Q70 188 104 178', 's-gold') +
        // Baudrier du bouclier + ceinture à boucle ronde
        '<path class="s-strap" d="M50 104 L92 146"/>' +
        '<path class="s-pack" d="M50 104 L92 146"/>' +
        '<rect class="f-belt" x="40" y="146" width="60" height="12" rx="3"/>' +
        '<circle class="f-gold" cx="70" cy="152" r="7"/>' +
        // Manches courtes, avant-bras nus, brassards d'acier, mains
        '<path class="f-outfit-d" d="M46 104 Q34 106 30 120 L28 136 H46 L47 124 Z"/>' +
        '<path class="f-outfit-d" d="M94 104 Q106 106 110 120 L112 136 H94 L93 124 Z"/>' +
        '<path class="f-skin" d="M28 134 H46 L42 164 H25 Z"/>' +
        '<path class="f-skin" d="M94 134 H112 L115 164 H98 Z"/>' +
        '<rect class="f-steel" x="24" y="146" width="21" height="14" rx="3"/>' +
        '<rect class="f-steel" x="96" y="146" width="20" height="14" rx="3"/>' +
        '<circle class="f-skin" cx="32" cy="170" r="9.5"/>' +
        '<circle class="f-skin" cx="108" cy="170" r="9.5"/>' +
        // Cou + cape de fourrure sur les épaules
        '<rect class="f-skin" x="61" y="82" width="18" height="14" rx="4"/>' +
        '<path class="f-fur" d="M32 110 Q32 92 52 92 Q60 86 70 90 Q80 86 88 92 Q108 92 108 110 Q100 118 92 111 Q86 120 78 111 Q70 120 62 111 Q54 120 48 111 Q40 118 32 110 Z"/>' +
        // Tresses sur les côtés du visage
        '<path class="f-hair" d="M34 54 Q30 76 36 94 L43 92 Q38 74 41 54 Z"/>' +
        '<path class="f-hair" d="M106 54 Q110 76 104 94 L97 92 Q102 74 99 54 Z"/>' +
        // Tête : oreilles, visage, grande barbe tressée, moustache
        '<circle class="f-skin" cx="39" cy="62" r="7"/>' +
        '<circle class="f-skin" cx="101" cy="62" r="7"/>' +
        '<ellipse class="f-skin" cx="70" cy="60" rx="31" ry="32"/>' +
        '<path class="f-shade-soft" d="M84 32 Q102 42 101 62 Q99 84 80 92 Q95 76 95 60 Q95 42 84 32 Z"/>' +
        '<path class="f-hair" d="M40 64 Q40 106 70 114 Q100 106 100 64 Q92 80 82 78 Q70 84 58 78 Q48 80 40 64 Z"/>' +
        thick('M63 108 L61 126 M77 108 L79 126', 's-hair') +
        '<rect class="f-steel" x="56" y="122" width="10" height="6" rx="2" style="stroke-width:2"/>' +
        '<rect class="f-steel" x="74" y="122" width="10" height="6" rx="2" style="stroke-width:2"/>' +
        '<path class="f-hair" d="M70 76 Q58 70 50 78 Q58 84 70 80 Q82 84 90 78 Q82 70 70 76 Z"/>' +
        '<path class="f-mouth" d="M63 86 Q70 92 77 86 Z"/>' +
        '<g class="sk-detail">' +
        '<path class="s-brow" d="M50 54 Q57 49 64 53 M76 53 Q83 49 90 54"/>' +
        '<g class="sk-eyes">' +
        '<ellipse class="f-line" cx="58" cy="63" rx="4.5" ry="6"/><ellipse class="f-line" cx="82" cy="63" rx="4.5" ry="6"/>' +
        '<circle class="f-white" cx="59.6" cy="60.8" r="1.6"/><circle class="f-white" cx="83.6" cy="60.8" r="1.6"/>' +
        '</g>' +
        '</g>' +
        // Casque : cornes, calotte, arête, bandeau rivé, nasal
        '<path class="f-horn" d="M40 42 Q20 38 14 16 Q12 6 18 0 Q22 20 42 30 Z"/>' +
        '<path class="f-horn" d="M100 42 Q120 38 126 16 Q128 6 122 0 Q118 20 98 30 Z"/>' +
        '<path class="s-fold" d="M21 28 L30 21 M119 28 L110 21"/>' +
        '<path class="f-steel" d="M36 50 Q36 16 70 14 Q104 16 104 50 Z"/>' +
        '<path class="f-shade" d="M80 15 Q104 20 104 50 H90 Q92 28 80 15 Z"/>' +
        '<path class="f-steel" d="M66 15 H74 V46 H66 Z" style="stroke-width:3"/>' +
        '<rect class="f-steel" x="33" y="43" width="74" height="10" rx="4"/>' +
        '<g class="sk-detail"><circle class="f-line" cx="44" cy="48" r="1.8"/><circle class="f-line" cx="57" cy="48" r="1.8"/>' +
        '<circle class="f-line" cx="83" cy="48" r="1.8"/><circle class="f-line" cx="96" cy="48" r="1.8"/></g>' +
        '<path class="f-steel" d="M66 52 H74 V72 Q70 76 66 72 Z" style="stroke-width:3"/>' +
        '<path class="s-shine sk-detail" d="M46 36 Q50 24 62 20"/>'
    );
}

/* ===================== ROI CITROUILLE (épique) ===================== */

function pumpkinBody() {
    return (
        // Lucioles
        '<g class="sk-detail">' +
        '<circle class="f-glow sk-orb" cx="12" cy="40" r="4"/>' +
        '<circle class="f-glow sk-orb sk-orb-b" cx="130" cy="104" r="3.5"/>' +
        '<circle class="f-glow sk-orb sk-orb-c" cx="126" cy="210" r="3"/>' +
        '</g>' +
        // Sac de bonbons sur l'épaule (derrière, à gauche)
        '<circle class="f-candy-a" cx="20" cy="88" r="7"/>' +
        '<circle class="f-candy-b" cx="32" cy="82" r="7"/>' +
        '<circle class="f-candy-c" cx="44" cy="88" r="6"/>' +
        '<ellipse class="f-burlap" cx="30" cy="128" rx="26" ry="34"/>' +
        '<path class="f-burlap" d="M18 100 L14 90 L30 96 L46 90 L42 100 Z"/>' +
        thick('M17 99 Q30 104 43 99', 's-vine') +
        '<path class="s-fold sk-detail" d="M14 120 L22 124 M12 138 L20 140"/>' +
        // Jambes à rayures, chaussures pointues recourbées
        '<rect class="f-pants" x="46" y="160" width="22" height="90" rx="7"/>' +
        '<rect class="f-pants" x="72" y="160" width="22" height="90" rx="7"/>' +
        '<path class="s-neon sk-detail" d="M47 202 H67 M47 218 H67 M47 234 H67 M73 202 H93 M73 218 H93 M73 234 H93"/>' +
        '<path class="f-shoes" d="M30 262 Q22 246 36 252 Q46 244 68 246 V268 H36 Q28 268 30 262 Z"/>' +
        '<path class="f-shoes" d="M110 262 Q118 246 104 252 Q94 244 72 246 V268 H104 Q112 268 110 262 Z"/>' +
        // Manteau aux pans déchirés, gilet de feuilles, boutons dorés
        '<path class="f-outfit" d="M44 100 Q70 90 96 100 Q100 140 104 186 L96 178 L90 190 L82 180 L74 192 L66 180 L58 192 L50 180 L44 190 L36 186 Q40 140 44 100 Z"/>' +
        '<path class="f-shade" d="M72 94 Q86 95 96 100 Q100 140 104 186 L96 178 L90 190 L82 180 L74 192 L72 188 Z"/>' +
        '<path class="f-pack" d="M58 100 H82 L78 148 H62 Z"/>' +
        '<path class="s-fold sk-detail" d="M70 104 V146 M70 114 L62 108 M70 124 L78 118 M70 134 L63 128"/>' +
        '<circle class="f-gold" cx="54" cy="116" r="3" style="stroke-width:2"/><circle class="f-gold" cx="86" cy="116" r="3" style="stroke-width:2"/>' +
        // Lien du sac en diagonale + ceinture à boucle citrouille
        '<path class="s-strap" d="M44 104 L94 150"/>' +
        '<path class="s-pack" d="M44 104 L94 150"/>' +
        '<rect class="f-belt" x="42" y="148" width="56" height="11" rx="3"/>' +
        '<rect class="f-skin" x="62" y="145" width="16" height="17" rx="6"/>' +
        // Manches aux poignets déchirés, gants sombres
        '<path class="f-outfit-d" d="M46 104 Q34 106 30 120 L22 160 L28 156 L32 164 L38 158 L44 162 L47 124 Z"/>' +
        '<path class="f-outfit-d" d="M94 104 Q106 106 110 120 L118 160 L112 156 L108 164 L102 158 L96 162 L93 124 Z"/>' +
        '<circle class="f-shoes" cx="31" cy="170" r="9.5"/>' +
        '<circle class="f-shoes" cx="109" cy="170" r="9.5"/>' +
        // Col haut en pointes + cou en tige
        '<rect class="f-pack" x="63" y="84" width="14" height="14" rx="3"/>' +
        '<path class="f-outfit-d" d="M40 98 L46 82 L55 93 L63 82 L70 93 L77 82 L85 93 L94 82 L100 98 Q70 110 40 98 Z"/>' +
        // Halo de la bougie, tête-citrouille à côtes
        '<circle class="f-glow sk-glow" cx="70" cy="58" r="50" style="stroke:none;fill-opacity:0.16"/>' +
        '<ellipse class="f-skin" cx="48" cy="58" rx="22" ry="32"/>' +
        '<ellipse class="f-skin" cx="92" cy="58" rx="22" ry="32"/>' +
        '<ellipse class="f-skin" cx="70" cy="58" rx="26" ry="35"/>' +
        '<path class="f-shade" d="M98 30 Q114 40 114 58 Q114 82 96 88 Q106 74 106 58 Q106 42 98 30 Z"/>' +
        '<path class="s-shine sk-detail" d="M32 50 Q34 38 42 32"/>' +
        // Visage sculpté qui vacille
        '<path class="f-carve sk-glow" d="M48 56 L62 48 L60 64 Z M92 56 L78 48 L80 64 Z" style="stroke-width:3"/>' +
        '<path class="f-carve sk-glow" d="M70 64 L75 72 H65 Z" style="stroke-width:2.5"/>' +
        '<path class="f-carve sk-glow" d="M44 76 L53 80 L60 75 L70 82 L80 75 L87 80 L96 76 Q88 96 70 96 Q52 96 44 76 Z" style="stroke-width:3"/>' +
        // Tige, feuille, vrille et petite couronne de travers
        '<path class="f-pack" d="M52 26 Q50 12 58 2 L66 6 Q60 14 62 26 Z"/>' +
        '<path class="f-pack" d="M52 14 Q36 0 22 10 Q36 22 52 14 Z" style="stroke-width:3"/>' +
        '<path class="s-vine sk-detail" d="M64 18 Q74 14 72 6 Q70 0 66 4"/>' +
        '<path class="f-gold" d="M78 24 L79 6 L88 15 L95 3 L100 17 L109 9 L107 29 Q92 33 78 24 Z"/>' +
        '<circle class="f-red" cx="93" cy="22" r="3" style="stroke-width:1.5"/>'
    );
}

/* ===================== DRAGON ANCESTRAL (légendaire) ===================== */

function dragonBody() {
    return (
        // Ailes de braise qui battent (doigts en écailles)
        '<g class="sk-wing">' +
        '<path class="f-pack" d="M50 104 L6 40 Q10 62 2 76 Q16 80 14 100 Q26 102 26 120 Q36 118 44 132 Z"/>' +
        thick('M50 104 L6 40 M48 110 L2 76 M46 118 L14 100 M44 126 L26 120', 's-bone') +
        '</g>' +
        '<g class="sk-wing sk-wing-r">' +
        '<path class="f-pack" d="M90 104 L134 40 Q130 62 138 76 Q124 80 126 100 Q114 102 114 120 Q104 118 96 132 Z"/>' +
        thick('M90 104 L134 40 M92 110 L138 76 M94 118 L126 100 M96 126 L114 120', 's-bone') +
        '</g>' +
        // Queue qui s'enroule, pointe en losange
        '<path class="f-skin" d="M80 170 Q124 190 122 234 Q120 252 132 254 L130 262 Q110 262 110 236 Q112 200 76 186 Z"/>' +
        '<path class="f-hair" d="M127 248 L140 256 L130 268 L121 258 Z"/>' +
        // Jambes écailleuses, pattes griffues
        '<path class="f-outfit" d="M44 160 H68 L66 248 H46 Z"/>' +
        '<path class="f-outfit" d="M72 160 H96 L94 248 H74 Z"/>' +
        '<path class="s-fold sk-detail" d="M50 190 q4 4 8 0 M57 208 q4 4 8 0 M50 226 q4 4 8 0 M78 190 q4 4 8 0 M85 208 q4 4 8 0 M78 226 q4 4 8 0"/>' +
        '<path class="f-shoes" d="M30 268 Q30 248 46 246 H68 V268 Z"/>' +
        '<path class="f-shoes" d="M72 246 H94 Q110 248 110 268 H72 Z"/>' +
        '<path class="f-hair" d="M31 266 L23 272 L35 271 Z M44 267 L40 275 L50 270 Z M96 267 L100 275 L90 270 Z M109 266 L117 272 L105 271 Z" style="stroke-width:2.5"/>' +
        // Corps, ventre en plaques dorées
        '<path class="f-outfit" d="M42 102 Q70 92 98 102 Q104 140 100 172 Q70 182 40 172 Q36 140 42 102 Z"/>' +
        '<path class="f-shade" d="M72 96 Q88 97 98 102 Q104 140 100 172 Q86 177 72 178 Z"/>' +
        '<path class="f-accent" d="M56 104 Q70 100 84 104 L82 168 Q70 174 58 168 Z"/>' +
        '<path class="s-plate sk-detail" d="M57 118 H83 M57 132 H83 M58 146 H82 M58 158 H82"/>' +
        // Bras écailleux, pointes aux épaules, mains griffues
        '<path class="f-skin" d="M46 104 Q34 106 30 120 L24 158 Q24 166 32 167 Q40 167 41 160 L47 124 Z"/>' +
        '<path class="f-skin" d="M94 104 Q106 106 110 120 L116 158 Q116 166 108 167 Q100 167 99 160 L93 124 Z"/>' +
        '<path class="s-fold sk-detail" d="M33 128 q4 4 8 0 M31 142 q4 4 8 0 M99 128 q4 4 8 0 M101 142 q4 4 8 0"/>' +
        '<path class="f-hair" d="M34 110 L22 96 L38 104 Z M106 110 L118 96 L102 104 Z" style="stroke-width:3"/>' +
        '<circle class="f-skin" cx="30" cy="170" r="9.5"/>' +
        '<circle class="f-skin" cx="110" cy="170" r="9.5"/>' +
        '<path class="f-hair" d="M23 175 L19 184 L28 179 Z M31 179 L31 188 L36 179 Z M109 179 L109 188 L104 179 Z M117 175 L121 184 L112 179 Z" style="stroke-width:2"/>' +
        // Cou
        '<rect class="f-skin" x="60" y="82" width="20" height="16" rx="5"/>' +
        // Nageoires-oreilles, cornes, crête
        '<path class="f-pack" d="M40 52 L20 42 L25 57 L16 66 L40 64 Z"/>' +
        '<path class="f-pack" d="M100 52 L120 42 L115 57 L124 66 L100 64 Z"/>' +
        '<path class="f-hair" d="M46 36 Q30 20 34 0 Q44 18 58 28 Z"/>' +
        '<path class="f-hair" d="M94 36 Q110 20 106 0 Q96 18 82 28 Z"/>' +
        // Tête, museau, naseaux, crocs
        '<ellipse class="f-skin" cx="70" cy="56" rx="32" ry="32"/>' +
        '<path class="f-shade-soft" d="M84 28 Q102 38 102 58 Q100 78 84 86 Q96 72 96 56 Q96 38 84 28 Z"/>' +
        '<path class="f-pack" d="M62 26 L70 10 L78 26 Z" style="stroke-width:3"/>' +
        '<ellipse class="f-skin" cx="70" cy="76" rx="22" ry="15"/>' +
        '<ellipse class="f-line" cx="63" cy="74" rx="2.5" ry="2"/>' +
        '<ellipse class="f-line" cx="77" cy="74" rx="2.5" ry="2"/>' +
        '<path class="s-brow" d="M56 84 Q70 92 84 84"/>' +
        '<path class="f-white" d="M60 86 L62 93 L65 88 Z M75 88 L78 93 L80 86 Z" style="stroke:var(--outline);stroke-width:1.5"/>' +
        // Yeux de feu à pupille fendue, sourcils froncés
        '<g class="sk-eyes">' +
        '<ellipse class="f-glow" cx="56" cy="52" rx="7" ry="6"/><ellipse class="f-glow" cx="84" cy="52" rx="7" ry="6"/>' +
        '<ellipse class="f-line" cx="56" cy="52" rx="1.8" ry="5"/><ellipse class="f-line" cx="84" cy="52" rx="1.8" ry="5"/>' +
        '</g>' +
        '<path class="s-brow" d="M46 42 L63 46 M94 42 L77 46"/>' +
        '<path class="s-shine sk-detail" d="M44 50 Q46 34 58 28"/>' +
        // Braises qui flottent
        '<g class="sk-detail">' +
        '<circle class="f-flame2 sk-orb" cx="118" cy="30" r="3.5"/>' +
        '<circle class="f-flame sk-orb sk-orb-b" cx="20" cy="22" r="3"/>' +
        '<circle class="f-flame2 sk-orb sk-orb-c" cx="12" cy="150" r="3"/>' +
        '</g>'
    );
}

/* ===================== ASSEMBLAGE ===================== */

const BODIES = {
    knight: knightBody,
    skeleton: skeletonBody,
    ninja: ninjaBody,
    astro: astroBody,
    chef: chefBody,
    pirate: pirateBody,
    mecha: mechaBody,
    mage: mageBody,
    viking: vikingBody,
    pumpkin: pumpkinBody,
    dragon: dragonBody
};

function svgOf(style, hair, goggles) {
    const body = BODIES[style] ? BODIES[style]() : defaultBody(hair, goggles);
    return `<svg class="skin-svg skin-${BODIES[style] ? style : 'default'}" viewBox="0 0 140 276" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Balise <svg> d'un skin du catalogue (id inconnu : skin par défaut)
export function skinMarkup(skinId) {
    const s = getSkin(skinId);
    return svgOf(s.style, s.hair, s.goggles !== false);
}

// Variables CSS de couleur d'un skin (look du catalogue)
const VARS = [
    ['skin', '--skin'], ['hair', '--hair'], ['outfit', '--outfit'], ['outfitDark', '--outfit-dark'],
    ['pants', '--pants'], ['shoes', '--shoes'], ['pack', '--pack'], ['accent', '--accent']
];

function applyLook(el, s) {
    for (const [k, v] of VARS) {
        if (s.look?.[k]) el.style.setProperty(v, s.look[k]);
    }
}

// Couleur du sac à dos équipé (null = celui de la tenue)
function packColor(pack) {
    const it = typeof pack === 'string' ? getItem(pack) : pack;
    return it && it.type === 'backpack' && !it.none ? it.color : null;
}

// Couleurs + dessin du skin dans n'importe quel conteneur (boutique, casier...)
// opts.pack : sac à dos à porter (id ou objet), sinon celui de la tenue
export function renderSkinInto(el, skinId, opts = {}) {
    if (!el) return;
    const s = getSkin(skinId);
    applyLook(el, s);
    const pc = packColor(opts.pack);
    if (pc) el.style.setProperty('--pack', pc);
    el.classList.remove('item-render');
    el.classList.add('skin-render');
    el.dataset.skinId = `${s.id}|${pc || ''}`;
    el.innerHTML = skinMarkup(s.id);
}

// N'importe quel objet du catalogue (tenue, sac, planeur, emote)
export function renderItemInto(el, itemId, opts = {}) {
    if (!el) return;
    const it = getItem(itemId);
    if (!it || it.type === 'outfit') {
        renderSkinInto(el, itemId, opts);
        return;
    }
    el.classList.remove('skin-render');
    el.classList.add('item-render');
    el.dataset.skinId = it.id;
    el.innerHTML = itemArt(it);
}

/* ===================== PERSONNAGES DU LOBBY ===================== */

// Coéquipiers (places 2 à 4) : un style de coiffure différent, couleurs dans css/lobby.css
const MATE_LOOKS = [
    { hair: 'swoop', goggles: false },
    { hair: 'bun', goggles: true },
    { hair: 'mohawk', goggles: false }
];

export function mountLobbySkins(root = document) {
    const players = window.lobbyManager?.players || [];
    root.querySelectorAll('.player-slot').forEach((slot, i) => {
        const body = slot.querySelector('.character-body');
        if (!body) return;
        const holder = slot.querySelector('.player-character') || body;

        if (i === 0) {
            // Place 1 : le skin équipé localement dans le casier (couleurs posées sur le personnage)
            const s = Cosmetics.equipped;
            const pc = packColor(Cosmetics.equippedOf('backpack'));
            const key = `local_${s.id}|${pc || ''}`;
            if (body.dataset.skin === key) return;
            applyLook(holder, s);
            if (pc) holder.style.setProperty('--pack', pc);
            else holder.style.removeProperty('--pack');
            body.innerHTML = skinMarkup(s.id);
            body.dataset.skin = key;
            return;
        }

        const p = players[i];
        if (p && !p.isBot) {
            // Vrai coéquipier connecté dans le salon : afficher son vrai skin et son vrai sac à dos en direct !
            const skinId = (typeof p.skin === 'string' ? p.skin : p.skin?.id) || 'recrue';
            const s = getSkin(skinId) || getSkin('recrue');
            const pc = packColor(p.backpack);
            const key = `rem_${p.id}_${s.id}|${pc || ''}`;
            if (body.dataset.skin === key) return;

            applyLook(holder, s);
            if (p.colors) {
                for (const [k, v] of VARS) {
                    if (p.colors[k]) holder.style.setProperty(v, p.colors[k]);
                }
            }
            if (pc) holder.style.setProperty('--pack', pc);
            else holder.style.removeProperty('--pack');

            body.innerHTML = skinMarkup(s.id);
            body.dataset.skin = key;
            return;
        }

        // Slot bot ou vide : style coéquipier par défaut
        const look = MATE_LOOKS[(i - 1) % MATE_LOOKS.length];
        const key = `bot_${look.hair}_${look.goggles}`;
        if (body.dataset.skin === key) return;
        // Effacer les couleurs d'un joueur parti : sinon elles cachent la silhouette grisée
        for (const [, v] of VARS) holder.style.removeProperty(v);
        body.innerHTML = svgOf('default', look.hair, look.goggles);
        body.dataset.skin = key;
    });
    revealLobbyStage();
}

/*
   Au chargement, la scène du lobby reste cachée (classe is-booting, voir css/lobby.css)
   tant que le salon n'a pas posé le bon mode, le bon pseudo et les vrais skins :
   sinon on voit une fraction de seconde 4 places « En attente… » et le personnage par défaut.
*/
function revealLobbyStage() {
    if (typeof document === 'undefined' || !window.lobbyManager) return;
    const stage = document.querySelector('.players-area.is-booting');
    if (!stage) return;
    // Une image de plus : le navigateur applique d'abord les classes du mode et les skins
    requestAnimationFrame(() => stage.classList.remove('is-booting'));
}

if (typeof window !== 'undefined') {
    window.FOR2D_SKINS = { markup: skinMarkup, render: renderSkinInto, renderItem: renderItemInto };
    window.mountLobbySkins = mountLobbySkins;
    Cosmetics.onChange(() => {
        mountLobbySkins();
        // Synchroniser instantanément avec les autres membres du groupe
        if (window.networkManager?.isConnected() && window.networkManager?.roomCode) {
            window.networkManager.sendPlayerStatus(window.lobbyManager?.localPlayerReady || false);
        }
    });
}
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountLobbySkins());
    else mountLobbySkins();
}
