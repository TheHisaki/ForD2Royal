/* ==================================
   SKINS DU LOBBY - FOR2D ROYAL
   Personnages cartoon en SVG (viewBox 140 x 276, même silhouette pour tous).
   Styles : 'default' (coiffures + lunettes), 'knight', 'skeleton', 'ninja', 'astro'.
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

/* ===================== ASSEMBLAGE ===================== */

const BODIES = {
    knight: knightBody,
    skeleton: skeletonBody,
    ninja: ninjaBody,
    astro: astroBody
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
        body.innerHTML = svgOf('default', look.hair, look.goggles);
        body.dataset.skin = key;
    });
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
