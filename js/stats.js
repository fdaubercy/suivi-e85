/* ─── Stats live : conso, coût, économies E85 vs SP98 + sparkline prix multi-carburant + prédiction ─── */
import { state } from './state.js';
import { FUEL_CONFIG, DEFAULT_SURCONSO, KIT_PRIX_KEY, DEFAULT_KIT_PRIX,
         BUDGET_KEY, CO2_E85_PER_L,
         CO2_OBJECTIF_KEY, DEFAULT_CO2_OBJECTIF, CO2_THERMIQUE_PER_KM, CO2_ARBRE_PAR_AN,
         SURCONSO_KEY, SURCONSO_MIN, SURCONSO_MAX,
         COUT_POSE_KEY, COUT_CARTEGRISE_KEY, COUT_ENTRETIEN_KEY,
         SURCOUT_ASSURANCE_KEY, AIDE_DEDUITE_KEY, ECART_REF_KEY, DEFAULT_ECART_REF,
         CARBURANT_REF_KEY, DEFAULT_CARBURANT_REF, PROJ_NB_RECENTS_KEY,
         CONSO_DIESEL_REF_KEY, VEHICULE_DIESEL_REF_KEY } from './config.js';
import { computeConsoMoy, buildRefModel } from './refmodel.js';
import { getVehicules } from './vehicules.js';
import { pushParam } from './parametres.js';
import { getAllRecords, forceRefreshHistorique } from './historique.js';
import { renderComparatif } from './comparatif.js';
import { getCachedServerStats, getServerStats } from './statsApi.js';
import { getSectorSeries, loadSectorPricesFor } from './secteur.js';

/* ─── Prix du boîtier (kit) de conversion (localStorage, défaut = B6 Excel) ─── */
export function getKitPrix() {
  const raw = localStorage.getItem(KIT_PRIX_KEY);
  const n = Number(raw);
  return raw != null && raw !== '' && isFinite(n) && n >= 0 ? n : DEFAULT_KIT_PRIX;
}

/* ─── X68 — Poste de coût one-off (≥ 0, défaut 0) ─── */
function getCoutPoste(key) {
  const n = Number(localStorage.getItem(key));
  return isFinite(n) && n > 0 ? n : 0;
}

/* ─── X68 — Coût TOTAL de conversion (= COUT_TOTAL Excel) ───
   boîtier + pose + carte grise + entretien + assurance − aide (borné ≥ 0). */
export function getCoutTotalConversion() {
  const total = getKitPrix()
    + getCoutPoste(COUT_POSE_KEY)
    + getCoutPoste(COUT_CARTEGRISE_KEY)
    + getCoutPoste(COUT_ENTRETIEN_KEY)
    + getCoutPoste(SURCOUT_ASSURANCE_KEY)
    - getCoutPoste(AIDE_DEDUITE_KEY);
  return Math.max(0, total);
}

/* ─── X67 — Écart €/L retranché au prix SP98 pour la référence (≥ 0, défaut 0) ─── */
export function getEcartRef() {
  const n = Number(localStorage.getItem(ECART_REF_KEY));
  return isFinite(n) && n >= 0 ? n : DEFAULT_ECART_REF;
}

/* ─── Carburant de référence courant (SP98 par défaut) ─── */
export function getCarburantRef() {
  return localStorage.getItem(CARBURANT_REF_KEY) || DEFAULT_CARBURANT_REF;
}
/** Libellé court d'un carburant (ex. 'GAZOLE' → 'Gazole', repli sur la clé). */
export function refShortOf(refKey) {
  return (FUEL_CONFIG[refKey] && FUEL_CONFIG[refKey].short) || refKey;
}

/* ─── Modèle de référence pour la comparaison (essence ou diesel) ───
   Lit les réglages localStorage puis délègue au module pur refmodel.js.
   La conso diesel est mesurée sur TOUT l'historique (le véhicule diesel de
   référence est distinct du véhicule E85 courant). */
function getRefModelForStats(byVeh, surconso) {
  return buildRefModel({
    refKey:   getCarburantRef(),
    consoE85: computeConsoMoy(byVeh, 'E85'),
    surconso,
    ecartRef: getEcartRef(),
    allRecords: getAllRecords(),
    vehiculeDieselRef:   localStorage.getItem(VEHICULE_DIESEL_REF_KEY) || '',
    consoDieselManuelle: Number(localStorage.getItem(CONSO_DIESEL_REF_KEY)) || 0,
  });
}
/** Colonne « prix station » du carburant de référence, par plein E85. */
function refPriceCol(isDiesel) {
  return isDiesel ? 'Gazole station (€/L)' : 'SP98 station (€/L)';
}
/** Surconso E85 exprimée vs le carburant de référence (pour l'affichage). */
function surconsoVsRef(ratioConso) {
  return ratioConso > 0 ? (1 / ratioConso - 1) : 0;
}

/* ─── X70 — Borne de plausibilité de la surconso E85 (= clamp Excel J8) ─── */
export function clampSurconso(s) {
  return Math.min(SURCONSO_MAX, Math.max(SURCONSO_MIN, s));
}

/* ─── W39 — Objectif de budget carburant mensuel (€, localStorage) ───
   0 / vide / invalide = budget désactivé (aucune barre affichée). */
export function getBudgetMensuel() {
  const n = Number(localStorage.getItem(BUDGET_KEY));
  return isFinite(n) && n > 0 ? n : 0;
}

/* ─── W51 — Objectif CO₂ annuel évité (kg, localStorage) ───
   Vide / invalide = valeur par défaut DEFAULT_CO2_OBJECTIF. */
export function getObjectifCo2() {
  const raw = localStorage.getItem(CO2_OBJECTIF_KEY);
  const n = Number(raw);
  return raw != null && raw !== '' && isFinite(n) && n > 0 ? n : DEFAULT_CO2_OBJECTIF;
}

/* ─── P1 — Surconso de repli (partagée avec Excel via l'onglet Parametres) ───
   Quand l'app ne peut PAS calculer la surconso dynamiquement (pas de pleins
   S98), elle utilise la valeur saisie côté Excel (cellule J7) si elle a été
   synchronisée, sinon DEFAULT_SURCONSO. */
function getSurconsoFallback() {
  const raw = localStorage.getItem(SURCONSO_KEY);
  const n = Number(raw);
  return raw != null && raw !== '' && isFinite(n) && n > 0 ? n : DEFAULT_SURCONSO;
}

/** Clé 'YYYY-MM' du mois courant. */
function _currentMonthKey() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
}

/* ─── Surconsommation E85 dynamique (cellule J7 Excel) ───
   conso moyenne E85 / conso moyenne S98 − 1, calculée à partir des pleins.
   Défaut DEFAULT_SURCONSO si pas de données S98 exploitables. */
function computeSurconso(records) {
  const sorted = records
    .filter(r => Number(r['Km compteur'] || 0) > 0)
    .sort((a, b) => {
      const da = new Date(String(a.Date || a.Horodatage || '').replace(' ', 'T'));
      const db = new Date(String(b.Date || b.Horodatage || '').replace(' ', 'T'));
      return da - db;
    });
  const consoE85 = [], consoS98 = [];
  for (let i = 1; i < sorted.length; i++) {
    const km0 = Number(sorted[i - 1]['Km compteur'] || 0);
    const km1 = Number(sorted[i]['Km compteur'] || 0);
    const lit = Number(sorted[i]['Nb. Litres'] || 0);
    const dk  = km1 - km0;
    if (dk <= 0 || lit <= 0) continue;
    const conso = (lit / dk) * 100;
    if (matchType(sorted[i].Type, 'E85')) consoE85.push(conso);
    else if (matchType(sorted[i].Type, 'SP98')) consoS98.push(conso);
  }
  if (!consoE85.length || !consoS98.length) return getSurconsoFallback();
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const s = avg(consoE85) / avg(consoS98) - 1;
  // X70 — borne de plausibilité [0,15 ; 0,40] (échantillon S98 souvent faible).
  return isFinite(s) && s > 0 ? clampSurconso(s) : getSurconsoFallback();
}

const MONTHS_WINDOW = 6;
const SPARK_KEY = 'suivi_e85_spark_fuels';

/* ─── W34 — Couleurs des courbes par carburant ─── */
const SPARK_COLORS = {
  E85:    '#1D9E75',
  SP98:   '#2E75B6',
  SP95:   '#60a5fa',
  E10:    '#10b981',
  GAZOLE: '#94a3b8',
  GPLC:   '#f59e0b',
};

/* ─── Colonnes GS pour les prix station ─── */
const FUEL_PRICE_COL = {
  E85:    'E85 station (€/L)',
  SP98:   'SP98 station (€/L)',
  SP95:   'SP95 station (€/L)',
  E10:    'E10 station (€/L)',
  GAZOLE: 'Gazole station (€/L)',
  GPLC:   'GPLc station (€/L)',
};

/** Matche un Type GS (label complet "SuperEthanol E85") avec une cle FUEL_CONFIG (E85). */
function matchType(rType, fuelKey) {
  if (!rType || !fuelKey) return false;
  const t = String(rType).toLowerCase();
  const cfg = FUEL_CONFIG[fuelKey];
  if (!cfg) return false;
  return t === cfg.label.toLowerCase()
      || t.includes(cfg.short.toLowerCase())
      || (fuelKey === 'E85' && t.includes('ethanol'));
}

/* ─── LocalStorage : carburants actifs sur le sparkline ─── */
function _loadSparkFuels(availFuels) {
  try {
    const raw = localStorage.getItem(SPARK_KEY);
    if (!raw) return availFuels.includes('E85') ? ['E85'] : [availFuels[0]];
    const saved = JSON.parse(raw);
    const valid = saved.filter(k => availFuels.includes(k));
    return valid.length ? valid : (availFuels.includes('E85') ? ['E85'] : [availFuels[0]]);
  } catch { return availFuels.includes('E85') ? ['E85'] : [availFuels[0]]; }
}

function _saveSparkFuels(fuels) {
  try { localStorage.setItem(SPARK_KEY, JSON.stringify(fuels)); } catch { /* quota / navigation privée */ }
}

/* ─── D2 — Relevé marché : chargé une fois par session pour superposer la courbe
   « marché » (relevé quotidien) aux prix payés. Les points proviennent ensuite
   du cache en mémoire (secteur.js) ; un re-render affiche la superposition. ─── */
let _marketLoadDone = false;
function _ensureMarketData(fuels) {
  if (_marketLoadDone) return;
  _marketLoadDone = true;
  loadSectorPricesFor(fuels)
    .then(() => { if (typeof window !== 'undefined' && typeof window.renderStats === 'function') window.renderStats(); })
    .catch(() => { /* best-effort : on garde les pleins seuls */ });
}

/* ─── Construction des séries de prix par carburant ─── */
function buildFuelSeries(records, veh) {
  const filtered = veh
    ? records.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh)
    : records;

  const series = {};

  filtered.forEach(r => {
    const dateStr = String(r.Date || r.Horodatage || '').replace(' ', 'T');
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return;

    const isE85Plein = matchType(r.Type, 'E85');

    // E85 : Prix €/L pour les pleins E85, colonne station pour les autres
    const e85Price = isE85Plein
      ? Number(r['Prix €/L'] || 0)
      : Number(r[FUEL_PRICE_COL.E85] || 0);
    if (e85Price > 0) {
      if (!series.E85) series.E85 = [];
      series.E85.push({ date, price: e85Price });
    }

    // Autres carburants : colonnes station uniquement
    ['SP98', 'SP95', 'E10', 'GAZOLE', 'GPLC'].forEach(key => {
      const p = Number(r[FUEL_PRICE_COL[key]] || 0);
      if (p > 0) {
        if (!series[key]) series[key] = [];
        series[key].push({ date, price: p });
      }
    });
  });

  // Tri chronologique + déduplication (dernier prix par jour) + 20 points max
  Object.keys(series).forEach(key => {
    const sorted = series[key].sort((a, b) => a.date - b.date);
    const byDay = new Map();
    sorted.forEach(pt => byDay.set(pt.date.toISOString().slice(0, 10), pt));
    series[key] = Array.from(byDay.values()).slice(-20);
  });

  return series;
}

/* ─── Rendu SVG multi-courbes sur axe temporel partagé ─── */
function buildSparklineSVG(activeSeries) {
  const allPts   = activeSeries.flatMap(s => s.points);
  if (!allPts.length) return '';

  const allPrices = allPts.map(p => p.price);
  const allTimes  = allPts.map(p => p.date.getTime());

  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const minT = Math.min(...allTimes);
  const maxT = Math.max(...allTimes);

  const priceRange = maxP - minP || 0.01;
  const timeRange  = maxT - minT || 1;

  const W = 220, H = 52, padX = 6, padY = 6;
  const toX = t => padX + ((t  - minT) / timeRange)  * (W - 2 * padX);
  const toY = p => H - padY - ((p - minP) / priceRange) * (H - 2 * padY);

  const elements = activeSeries.map(({ points, color, dashed }) => {
    if (!points.length) return '';
    const dash = dashed ? ' stroke-dasharray="3 2"' : '';
    const op   = dashed ? ' opacity="0.7"' : '';
    if (points.length === 1) {
      const x = toX(points[0].date.getTime()).toFixed(1);
      const y = toY(points[0].price).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="3" fill="${color}"${op}/>`;
    }
    const pts = points.map(pt =>
      `${toX(pt.date.getTime()).toFixed(1)},${toY(pt.price).toFixed(1)}`
    ).join(' ');
    const lx = toX(points[points.length - 1].date.getTime()).toFixed(1);
    const ly = toY(points[points.length - 1].price).toFixed(1);
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"${dash}${op}/>`
         + `<circle cx="${lx}" cy="${ly}" r="2.5" fill="${color}"${op}/>`;
  }).join('');

  return `<svg class="spark-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${elements}</svg>`;
}

/**
 * W34 — Sparkline multi-carburant avec filtres cliquables.
 * Sources : Prix €/L (pleins) + colonnes station (€/L) du Google Sheet.
 */
function buildPrixSparkline() {
  const all = getAllRecords();
  const veh = state.currentVehiculeNom;

  const series     = buildFuelSeries(all, veh);
  const availFuels = Object.keys(SPARK_COLORS).filter(k => (series[k] || []).length >= 1);

  if (!availFuels.length) return '';

  // D2 — charge en tâche de fond (1×/session) les relevés marché des carburants suivis,
  // puis re-render pour superposer la courbe « marché » (relevé quotidien) aux pleins.
  _ensureMarketData(availFuels);

  const activeFuels = _loadSparkFuels(availFuels);

  const togglesHtml = availFuels.map(k => {
    const cfg     = FUEL_CONFIG[k];
    const isActive = activeFuels.includes(k);
    const color   = SPARK_COLORS[k];
    return `<button class="spark-toggle${isActive ? ' active' : ''}" data-spark-fuel="${k}" style="--spark-color:${color}" title="${cfg.label}">${cfg.icon} ${cfg.short}</button>`;
  }).join('');

  // Par carburant actif : courbe « marché » (relevé quotidien, tirets) + courbe « payé »
  // (mes pleins, plein trait). L'axe est partagé (domaine calculé sur tous les points).
  const activeSeries = [];
  let hasMarket = false;
  activeFuels.forEach(k => {
    const market = getSectorSeries(k);
    if (market.length) { activeSeries.push({ key: k, points: market, color: SPARK_COLORS[k], dashed: true }); hasMarket = true; }
    const pleins = series[k] || [];
    if (pleins.length) activeSeries.push({ key: k, points: pleins, color: SPARK_COLORS[k], dashed: false });
  });

  const svgHtml = activeSeries.length
    ? buildSparklineSVG(activeSeries)
    : '<div class="spark-empty">Sélectionnez un carburant ci-dessus</div>';

  // Pied : par carburant actif, dernier prix payé et/ou dernier relevé marché.
  const footerParts = activeFuels.map(k => {
    const pleins = series[k] || [];
    const market = getSectorSeries(k);
    const bits   = [];
    if (pleins.length) bits.push(`payé ${pleins[pleins.length - 1].price.toFixed(3)}`);
    if (market.length) bits.push(`marché ${market[market.length - 1].price.toFixed(3)}`);
    if (!bits.length) return '';
    return `<span class="spark-price-tag" style="color:${SPARK_COLORS[k]}">${FUEL_CONFIG[k].icon} ${bits.join(' · ')} €/L</span>`;
  }).filter(Boolean);
  const footerHtml = footerParts.length
    ? `<div class="spark-footer">${footerParts.join('')}</div>`
    : '';

  const legendHtml = hasMarket
    ? '<div class="spark-legend"><span class="spark-leg-solid"></span> payé (mes pleins)<span class="spark-leg-dash"></span> marché (relevé quotidien)</div>'
    : '';

  return `
    <div class="e85-sparkline">
      <div class="spark-header">
        <span class="spark-label">Prix carburants</span>
        <button class="spark-refresh-btn" data-spark-refresh title="Recharger les prix depuis le serveur">🔄</button>
      </div>
      <div class="spark-toggles">${togglesHtml}</div>
      ${svgHtml}
      ${legendHtml}
      ${footerHtml}
    </div>`;
}

/** Calcule les KPIs filtrés sur le véhicule courant + fenêtre N derniers mois. */
function computeStats() {
  const all = getAllRecords();
  if (!all.length) return null;

  const veh = state.currentVehiculeNom;
  const byVeh = veh
    ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh)
    : all;

  if (!byVeh.length) return null;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - MONTHS_WINDOW);

  const recent = byVeh.filter(r => {
    const d = new Date(String(r.Date || r.Horodatage).replace(' ', 'T'));
    return !isNaN(d) && d >= cutoff;
  });

  const fuelKey  = state.currentType;
  const fuelCfg  = FUEL_CONFIG[fuelKey];
  const byFuel   = byVeh.filter(r => matchType(r.Type, fuelKey));

  const kmsFuel = byFuel
    .map(r => Number(r['Km compteur'] || 0))
    .filter(n => isFinite(n) && n > 0);
  const kmDeltaFuel     = kmsFuel.length > 1 ? Math.max(...kmsFuel) - Math.min(...kmsFuel) : 0;
  const totalLitresFuel = byFuel.reduce((s, r) => s + (Number(r['Nb. Litres']) || 0), 0);
  const consoFuel       = kmDeltaFuel > 0 ? (totalLitresFuel / kmDeltaFuel) * 100 : 0;

  const recentFuel = recent.filter(r => matchType(r.Type, fuelKey));
  const prixMoyenF = recentFuel.length
    ? recentFuel.reduce((s, r) => s + (Number(r['Prix €/L']) || 0), 0) / recentFuel.length
    : 0;
  const coutPer100 = consoFuel * prixMoyenF;

  const totalCout = recent.reduce(
    (s, r) => s + (Number(r['Nb. Litres']) || 0) * (Number(r['Prix €/L']) || 0), 0
  );

  // Économie E85 vs SP98 — méthode du dashboard Excel (feuille « Suivi Carburant ») :
  //   • sur TOUS les pleins E85 (pas la fenêtre 6 mois) pour refléter le ROI cumulé du kit ;
  //   • surconsommation E85 dynamique → litres SP98 équivalents = litres / (1 + surconso) ;
  //   • un plein E85 sans prix SP98 enregistré utilise le prix SP98 moyen connu
  //     (dans Excel chaque plein a toujours un « Prix S98 jour » ; on évite ainsi de
  //     sous-estimer l'économie quand le Google Sheet a une cellule SP98 vide).
  const surconso = computeSurconso(byVeh);
  const e85Pleins = byVeh.filter(r =>
    matchType(r.Type, 'E85') && Number(r['Prix €/L']) > 0 && Number(r['Nb. Litres']) > 0
  );

  // Modèle de référence : essence (SP98/SP95/E10 − écart) ou diesel (gazole).
  const rm     = getRefModelForStats(byVeh, surconso);
  const refCol = refPriceCol(rm.isDiesel);
  // Prix de référence moyen sur les pleins E85 qui en ont un (repli pour les autres).
  const refConnus = e85Pleins.map(r => Number(r[refCol]) || 0).filter(p => p > 0);
  const refMoyen  = refConnus.length
    ? refConnus.reduce((s, p) => s + p, 0) / refConnus.length
    : 0;

  // Économie à parité de coût/km : litres réf. équivalents = litres E85 × ratioConso.
  let totCoutE85 = 0, totCoutRefEquiv = 0;
  e85Pleins.forEach(r => {
    const prix = Number(r['Prix €/L']);
    const lit  = Number(r['Nb. Litres']);
    totCoutE85      += lit * prix;
    totCoutRefEquiv += lit * rm.ratioConso * rm.refPriceFromFill(r, refMoyen);
  });

  const econBrute = totCoutRefEquiv - totCoutE85;    // = J30 (J29 − B35)
  const kitPrix   = getKitPrix();                    // = B6 (boîtier seul)
  // X68 — économie nette sur le COÛT TOTAL de conversion (pas le boîtier seul).
  const coutTotalConversion = getCoutTotalConversion();
  const econNette = econBrute - coutTotalConversion; // = J31 (sur COUT_TOTAL)

  // W89 (A1) — durée d'usage E85 (1er → dernier plein E85), en mois, pour projeter
  // la date d'atteinte de rentabilité au rythme moyen d'économie brute observé.
  const e85Dates = e85Pleins
    .map(r => new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T')))
    .filter(d => !isNaN(d))
    .sort((a, b) => a - b);
  const e85SpanMonths = e85Dates.length > 1
    ? (e85Dates[e85Dates.length - 1] - e85Dates[0]) / (1000 * 60 * 60 * 24 * 30.44)
    : 0;

  // W40 — CO₂ évité par l'E85 vs le carburant de référence, à distance égale.
  //   litres réf. équivalents = litres E85 × ratioConso ;
  //   CO₂ évité = réfEquiv × CO2_réf − litresE85 × CO2_E85.
  const totLitresE85 = e85Pleins.reduce((s, r) => s + (Number(r['Nb. Litres']) || 0), 0);
  const refEquivL = totLitresE85 * rm.ratioConso;
  const co2Evite  = refEquivL * rm.co2RefPerL - totLitresE85 * CO2_E85_PER_L;

  return {
    fuelKey,
    fuelShort: fuelCfg?.short || '',
    conso: consoFuel,
    coutPer100,
    nbPleinsFuel: byFuel.length,
    totalCout,
    econBrute,
    econNette,
    kitPrix,
    coutTotalConversion,
    surconso,
    refKey: rm.refKey,
    refShort: refShortOf(rm.refKey),
    isDieselRef: rm.isDiesel,
    surconsoVsRef: surconsoVsRef(rm.ratioConso),
    co2Evite,
    totLitresE85,
    e85SpanMonths,
    nbPleins: recent.length,
    vehiculeName: veh || 'tous véhicules'
  };
}

/** W33 — Calcule les données de prédiction (partagé par buildPrediction + getNextKmPrediction). */
function _computePrediction(veh) {
  const all = getAllRecords();

  const records = (veh
    ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh)
    : all
  )
  .filter(r => Number(r['Km compteur'] || 0) > 0)
  .sort((a, b) => {
    const da = new Date(String(a.Date || a.Horodatage || '').replace(' ', 'T'));
    const db = new Date(String(b.Date || b.Horodatage || '').replace(' ', 'T'));
    return da - db;
  });

  if (records.length < 3) return null;

  const kmDeltas  = [];
  const dayDeltas = [];

  for (let i = 1; i < records.length; i++) {
    const km0 = Number(records[i - 1]['Km compteur'] || 0);
    const km1 = Number(records[i]['Km compteur']     || 0);
    const dk  = km1 - km0;
    if (dk > 50 && dk < 5000) {
      kmDeltas.push(dk);
      const d0 = new Date(String(records[i - 1].Date || records[i - 1].Horodatage || '').replace(' ', 'T'));
      const d1 = new Date(String(records[i].Date     || records[i].Horodatage     || '').replace(' ', 'T'));
      const dd = (d1 - d0) / 86400000;
      if (dd > 0 && dd < 120) dayDeltas.push(dd);
    }
  }

  if (kmDeltas.length < 2) return null;

  const avgKm  = Math.round(kmDeltas.reduce((s, v) => s + v, 0) / kmDeltas.length);
  const avgDay = dayDeltas.length
    ? Math.round(dayDeltas.reduce((s, v) => s + v, 0) / dayDeltas.length)
    : null;

  const lastRecord = records[records.length - 1];
  const lastKm   = Number(lastRecord['Km compteur']);
  const lastDateRaw = String(lastRecord.Date || lastRecord.Horodatage || '').replace(' ', 'T');
  const lastDate = new Date(lastDateRaw);
  return {
    avgKm, avgDay, lastKm,
    nextKm: lastKm + avgKm,
    count: kmDeltas.length,
    lastDate: isNaN(lastDate.getTime()) ? null : lastDate,
  };
}

/**
 * W35 — Retourne le prochain kilométrage estimé (pour pré-remplissage du champ fKm).
 * Retourne null si pas assez de données.
 */
export function getNextKmPrediction() {
  const data = _computePrediction(state.currentVehiculeNom);
  return data ? data.nextKm : null;
}

/**
 * W33 — Prédiction prochain plein basée sur l'intervalle moyen entre pleins.
 * Renvoie '' si moins de 3 pleins disponibles.
 */
function buildPrediction() {
  const data = _computePrediction(state.currentVehiculeNom);
  if (!data) return '';

  const { avgKm, avgDay, nextKm, count, lastDate } = data;

  let mainText, subText;
  if (avgDay && lastDate) {
    // W58 — date calendaire estimée du prochain plein : dernier plein + intervalle moyen.
    const daysElapsed = (Date.now() - lastDate.getTime()) / 86400000;
    const daysLeft    = avgDay - daysElapsed;
    const kmLeft      = Math.round(avgKm - daysElapsed * (avgKm / avgDay));
    const nextDate    = new Date(lastDate.getTime() + avgDay * 86400000);
    const dateStr     = nextDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

    if (daysLeft > 1) {
      mainText = `Prochain plein <strong>≈ le ${dateStr}</strong>`;
      subText  = `dans ~${Math.round(daysLeft)} j · ~${Math.max(0, kmLeft).toLocaleString('fr-FR')} km · vers ${nextKm.toLocaleString('fr-FR')} km`;
    } else if (daysLeft > 0) {
      mainText = `Prochain plein <strong>aujourd'hui</strong> (≈ ${dateStr})`;
      subText  = `~${Math.max(0, kmLeft).toLocaleString('fr-FR')} km restants · vers ${nextKm.toLocaleString('fr-FR')} km`;
    } else {
      const overdue = Math.round(-daysLeft);
      mainText = `Plein prévu <strong>≈ le ${dateStr}</strong>`;
      subText  = `il y a ${overdue} j · vers ${nextKm.toLocaleString('fr-FR')} km`;
    }
    subText += ` · ${count} plein${count > 1 ? 's' : ''}`;
  } else {
    mainText = `Prochain plein dans <strong>~${avgKm.toLocaleString('fr-FR')} km</strong>`;
    subText  = `vers ${nextKm.toLocaleString('fr-FR')} km · basé sur ${count} plein${count > 1 ? 's' : ''}`;
  }

  return `
    <div class="prediction-box">
      <span class="pred-icon">🔮</span>
      <div class="pred-content">
        <div class="pred-main">${mainText}</div>
        <div class="pred-sub">${subText}</div>
      </div>
    </div>`;
}

/** Affiche les stats dans #statsBox. */
export function renderStats() {
  renderRapportMensuel();          // rafraîchit aussi le rapport mensuel consultable
  const el = document.getElementById('statsBox');
  if (!el) return;

  const s = computeStats();
  if (!s || s.nbPleins === 0) {
    el.innerHTML = '<div class="stats-msg">Pas assez de données pour calculer les stats.</div>';
    return;
  }

  const bruteClass = s.econBrute > 0 ? 'pos' : (s.econBrute < 0 ? 'neg' : '');
  const bruteSign  = s.econBrute > 0 ? '+' : '';
  const netClass   = s.econNette > 0 ? 'pos' : (s.econNette < 0 ? 'neg' : '');
  const netSign    = s.econNette > 0 ? '+' : '';
  const fuelTag    = s.fuelShort ? '<span class="stat-tag">' + s.fuelShort + '</span>' : '';

  const consoCell = s.nbPleinsFuel > 1
    ? `<div class="stat-val">${s.conso.toFixed(1)}</div>
       <div class="stat-unit">L / 100 km ${fuelTag}</div>`
    : `<div class="stat-val">—</div>
       <div class="stat-unit">L / 100 km ${fuelTag}</div>`;

  const coutCell = s.nbPleinsFuel > 1
    ? `<div class="stat-val">${s.coutPer100.toFixed(1)} €</div>
       <div class="stat-unit">/ 100 km ${fuelTag}</div>`
    : `<div class="stat-val">—</div>
       <div class="stat-unit">/ 100 km ${fuelTag}</div>`;

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat">${consoCell}</div>
      <div class="stat">${coutCell}</div>
      <div class="stat">
        <div class="stat-val">${s.totalCout.toFixed(0)} €</div>
        <div class="stat-unit">dépensés ${MONTHS_WINDOW} mois</div>
      </div>
      <div class="stat ${bruteClass}">
        <div class="stat-val">${bruteSign}${s.econBrute.toFixed(0)} €</div>
        <div class="stat-unit">éco. brute vs ${s.refShort}</div>
      </div>
    </div>
    <div class="stats-sub">${s.nbPleins} plein(s) · ${s.vehiculeName} · ${MONTHS_WINDOW} derniers mois</div>
    <div class="econ-net ${netClass}">
      <span class="econ-net-label">💰 Économie nette</span>
      <span class="econ-net-val">${netSign}${s.econNette.toFixed(0)} €</span>
      <span class="econ-net-sub">brute ${s.econBrute.toFixed(0)} € − conversion ${(s.coutTotalConversion ?? s.kitPrix).toFixed(2)} € · surconso +${Math.round(s.surconsoVsRef * 100)}% vs ${s.refShort} · total</span>
    </div>
    ${buildRentaBar(s)}
    ${buildCO2Tile(s)}
    ${buildCo2Annuel()}
    ${buildCo2Monthly()}
    ${buildBudgetBar()}
    ${buildBudgetTrend()}
    ${buildPrixSparkline()}
    ${buildPrediction()}
  `;

  renderComparatif();   // W41 — graphe comparatif inter-véhicules (vue Stats)
  renderServerSummary();   // W59 — résumé annuel pré-agrégé (serveur)
}

/* ─── W59 — Résumé annuel pré-agrégé côté serveur (endpoint GAS S12) ───
   Affichage instantané depuis le cache, puis rafraîchi en tâche de fond.
   Repli local si l'endpoint n'est pas (encore) déployé. */
function _serverSummaryHTML(d) {
  if (!d || !d.kpis) return '';
  const k = d.kpis;
  const cells = [
    ['Pleins', k.pleins ?? '—'],
    ['Litres', (k.litres != null ? Math.round(k.litres) : '—') + ' L'],
    ['Dépensé', (k.cost != null ? k.cost : '—') + ' €'],
    ['Km', (k.km != null ? k.km : '—') + ' km'],
  ].map(([lab, val]) => `<div class="srv-kpi"><div class="srv-kpi-val">${val}</div><div class="srv-kpi-lab">${lab}</div></div>`).join('');
  const station = k.station ? `<div class="srv-station">⛽ Station préférée : <strong>${escHtmlLocal(k.station)}</strong></div>` : '';
  return `
    <p class="section-title">Bilan ${k.year || ''} <span class="srv-badge" title="Agrégé côté serveur (Apps Script), mis en cache 1 h">⚡ serveur</span></p>
    <div class="srv-grid">${cells}</div>
    ${station}`;
}

function escHtmlLocal(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Repli local : KPIs annuels calculés depuis getAllRecords (si pas de serveur). */
function _localAnnualKpis(veh) {
  const all = getAllRecords();
  if (!all.length) return null;
  const byVeh = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;
  let yearMax = 0;
  byVeh.forEach(r => {
    const dt = new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T'));
    if (!isNaN(dt) && dt.getFullYear() > yearMax) yearMax = dt.getFullYear();
  });
  if (!yearMax) return null;
  const yr = byVeh.filter(r => {
    const dt = new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T'));
    return !isNaN(dt) && dt.getFullYear() === yearMax;
  });
  const kmByVeh = {}, stationCnt = {};
  let litres = 0, cost = 0;
  yr.forEach(r => {
    litres += Number(r['Nb. Litres'] || 0);
    cost   += Number(r['Nb. Litres'] || 0) * Number(r['Prix €/L'] || 0);
    const st = String(r['Station essence'] || '').trim();
    if (st) stationCnt[st] = (stationCnt[st] || 0) + 1;
    const km = Number(r['Km compteur'] || 0);
    if (km > 0) {
      const v = r['Véhicule'] || r['Vehicule'] || '';
      const o = kmByVeh[v] || (kmByVeh[v] = { min: km, max: km });
      if (km < o.min) o.min = km; if (km > o.max) o.max = km;
    }
  });
  let km = 0; Object.values(kmByVeh).forEach(o => { km += o.max - o.min; });
  let station = '', top = -1;
  Object.entries(stationCnt).forEach(([s, n]) => { if (n > top) { top = n; station = s; } });
  return { kpis: { year: yearMax, pleins: yr.length, litres: Math.round(litres), cost: Math.round(cost), km: Math.round(km), station } };
}

export function renderServerSummary() {
  const el = document.getElementById('serverSummary');
  if (!el) return;
  const veh = state.currentVehiculeNom || '';

  const cached = getCachedServerStats(veh) || _localAnnualKpis(veh);
  const html = _serverSummaryHTML(cached);
  if (html) { el.innerHTML = html; el.classList.remove('hidden'); }
  else { el.classList.add('hidden'); }

  // Rafraîchissement serveur en tâche de fond (silencieux si endpoint absent)
  getServerStats(veh).then(d => {
    const h = _serverSummaryHTML(d);
    if (h) { el.innerHTML = h; el.classList.remove('hidden'); }
  }).catch(() => { /* repli déjà affiché */ });
}

/* ─── W89 — Jauge « % d'atteinte de rentabilité » (amortissement de la conversion) ───
   Progression = économie brute cumulée / coût total de conversion. La rentabilité
   est atteinte quand l'économie nette repasse ≥ 0 (brute ≥ coût de conversion).
   A1 — projette la date de rentabilité au rythme moyen d'économie brute observé.
   A2 — jauge annoncée aux lecteurs d'écran (role="progressbar" + aria-valuetext).
   A3 — tooltip explicitant le calcul (brute cumulée ÷ coût total). */
function buildRentaBar(s) {
  if (!s) return '';
  const cout = s.coutTotalConversion ?? s.kitPrix;
  if (!(cout > 0)) return '';
  const brute = s.econBrute;
  const pct = Math.max(0, Math.min(100, (brute / cout) * 100));
  const w   = pct.toFixed(0);
  const atteint = s.econNette >= 0;
  const cls = atteint ? 'done' : (pct >= 70 ? 'near' : 'go');
  const right = atteint
    ? `<span class="renta-done">🎉 rentabilité atteinte</span>`
    : `<span class="renta-left">reste ${(cout - brute).toFixed(0)} € à amortir</span>`;

  // A1 — extrapolation : économie brute par mois × mois restants → date estimée.
  //   rythme = brute cumulée / durée d'usage E85 ; seulement si assez de recul (≥ 2 mois).
  let etaHtml = '';
  if (!atteint) {
    const rateMois = s.e85SpanMonths >= 2 ? brute / s.e85SpanMonths : 0;
    if (rateMois > 0) {
      const moisRestants = (cout - brute) / rateMois;
      if (moisRestants <= 120) {
        const d = new Date();
        d.setDate(1);
        d.setMonth(d.getMonth() + Math.ceil(moisRestants));
        const quand = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        etaHtml = `<div class="renta-eta">⏳ rentable vers <strong>${quand}</strong> <span class="renta-eta-sub">au rythme observé (${Math.round(s.e85SpanMonths)} mois d'E85)</span></div>`;
      } else {
        etaHtml = `<div class="renta-eta">⏳ rentabilité à <strong>plus de 10 ans</strong> au rythme actuel</div>`;
      }
    }
  }

  const tip = `Progression = économie brute cumulée (${brute.toFixed(0)} €) ÷ coût total de conversion (${cout.toFixed(0)} €). Rentabilité atteinte quand l'économie nette repasse ≥ 0.`;
  const ariaText = `Atteinte de rentabilité ${Math.round(pct)} % — ${brute.toFixed(0)} sur ${cout.toFixed(0)} euros amortis`;
  return `
    <div class="renta-box ${cls}" title="${tip}">
      <div class="renta-head">
        <span class="renta-label">📈 Atteinte de rentabilité</span>
        <span class="renta-amount">${brute.toFixed(0)} / ${cout.toFixed(0)} €</span>
      </div>
      <div class="renta-track gauge-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w}" aria-valuetext="${ariaText}">
        <div class="renta-fill" style="width:${w}%"></div>
        <span class="gauge-tick" style="left:50%"></span>
      </div>
      <div class="gauge-scale"><span>0</span><span>50 %</span><span class="gauge-target">🎯 ${cout.toFixed(0)} € · 100 %</span></div>
      <div class="renta-foot">${right} · ${Math.round(pct)} %</div>
      ${etaHtml}
    </div>`;
}

/* ─── W40 — Tuile « kg CO₂ évités » (cumul des pleins E85) ─── */
function buildCO2Tile(s) {
  if (!s || !(s.totLitresE85 > 0) || !(s.co2Evite > 0)) return '';
  const kg = s.co2Evite;
  const val = kg >= 1000 ? (kg / 1000).toFixed(2) + ' t' : kg.toFixed(0) + ' kg';
  return `
    <div class="co2-tile">
      <span class="co2-ico">🌱</span>
      <div class="co2-content">
        <div class="co2-main"><strong>${val}</strong> de CO₂ évités</div>
        <div class="co2-sub">E85 vs essence (≈ −50 % à la combustion) · ${s.totLitresE85.toFixed(0)} L E85 · distance égale</div>
      </div>
    </div>`;
}

/* ─── W51 — CO₂ évité sur l'année en cours (cumul des pleins E85) ───
   Même méthode que computeStats (distance égale), restreint à l'année courante
   et au véhicule sélectionné. */
function computeCo2Annuel() {
  const all = getAllRecords();
  const veh = state.currentVehiculeNom;
  const byVeh = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;

  const year = new Date().getFullYear();
  const surconso = computeSurconso(byVeh);

  const e85Annee = byVeh.filter(r => {
    if (!matchType(r.Type, 'E85') || !(Number(r['Nb. Litres']) > 0)) return false;
    const d = new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T'));
    return !isNaN(d) && d.getFullYear() === year;
  });

  const totLitresE85 = e85Annee.reduce((s, r) => s + (Number(r['Nb. Litres']) || 0), 0);
  const rm = getRefModelForStats(byVeh, surconso);
  const co2 = totLitresE85 * rm.ratioConso * rm.co2RefPerL - totLitresE85 * CO2_E85_PER_L;

  return { year, co2, totLitresE85 };
}

/* ─── W51 — Jauge « X kg CO₂ évités cette année » + objectif + équivalents parlants ─── */
function buildCo2Annuel() {
  const { year, co2 } = computeCo2Annuel();
  if (!(co2 > 0)) return '';

  const obj   = getObjectifCo2();
  const pct   = Math.min(100, (co2 / obj) * 100);
  const w     = pct.toFixed(0);
  const atteint = co2 >= obj;
  const cls   = atteint ? 'done' : (pct >= 70 ? 'near' : 'go');

  const kmTherm = Math.round(co2 / CO2_THERMIQUE_PER_KM);
  const arbres  = co2 / CO2_ARBRE_PAR_AN;
  const arbresTxt = arbres >= 1
    ? `${Math.round(arbres)} arbre${arbres >= 2 ? 's' : ''} sur un an`
    : `${(arbres * 12).toFixed(0)} mois d'absorption d'un arbre`;

  const right = atteint
    ? `<span class="co2y-done">🎉 objectif atteint</span>`
    : `<span class="co2y-left">reste ${(obj - co2).toFixed(0)} kg</span>`;

  return `
    <div class="co2y-box ${cls}">
      <div class="co2y-head">
        <span class="co2y-label">🌍 CO₂ évité ${year}</span>
        <span class="co2y-amount">${co2.toFixed(0)} / ${obj.toFixed(0)} kg</span>
      </div>
      <div class="co2y-track gauge-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w}" aria-valuetext="CO₂ évité ${year} : ${co2.toFixed(0)} sur ${obj.toFixed(0)} kg — ${Math.round(pct)} %">
        <div class="co2y-fill" style="width:${w}%"></div>
        <span class="gauge-tick" style="left:50%"></span>
      </div>
      <div class="gauge-scale"><span>0</span><span>50 %</span><span class="gauge-target">🎯 ${obj.toFixed(0)} kg · 100 %</span></div>
      <div class="co2y-foot">${right} · ${Math.round(pct)} %</div>
      <div class="co2y-equiv">≈ <strong>${kmTherm.toLocaleString('fr-FR')} km</strong> de conduite thermique évités · ${arbresTxt} 🌳</div>
    </div>`;
}

/* ─── W55 — CO₂ évité mois par mois sur l'année en cours (cumul) ───
   Décline l'objectif annuel en cible mensuelle (objectif / 12) et calcule le
   CO₂ évité par mois (même méthode « distance égale » que computeCo2Annuel),
   restreint au véhicule courant et à l'année en cours. */
function computeCo2Monthly() {
  const all = getAllRecords();
  const veh = state.currentVehiculeNom;
  const byVeh = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;

  const year = new Date().getFullYear();
  const surconso = computeSurconso(byVeh);

  const litresParMois = Array(12).fill(0);
  byVeh.forEach(r => {
    if (!matchType(r.Type, 'E85')) return;
    const lit = Number(r['Nb. Litres']) || 0;
    if (!(lit > 0)) return;
    const d = new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T'));
    if (isNaN(d) || d.getFullYear() !== year) return;
    litresParMois[d.getMonth()] += lit;
  });

  const rm = getRefModelForStats(byVeh, surconso);
  const co2ParMois = litresParMois.map(L =>
    L * rm.ratioConso * rm.co2RefPerL - L * CO2_E85_PER_L);

  return { year, co2ParMois, surconso };
}

/* ─── W55 — Courbe cumulée du CO₂ évité + trajectoire d'objectif mensuel ───
   Ligne SVG du cumul réel (Jan → mois courant) vs droite d'objectif linéaire
   (cible mensuelle = objectif annuel / 12). Affichée si au moins un mois > 0. */
function buildCo2Monthly() {
  const { year, co2ParMois } = computeCo2Monthly();
  if (!co2ParMois.some(v => v > 0)) return '';

  const obj      = getObjectifCo2();
  const cibleMois = obj / 12;
  const moisCourant = (new Date().getFullYear() === year) ? new Date().getMonth() : 11;
  const n = moisCourant + 1;                       // Jan..mois courant inclus

  // Cumul réel mois par mois
  const cumul = [];
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += co2ParMois[i]; cumul.push(acc); }
  const cumulFinal = acc;

  // Échelle : max du cumul réel et de la trajectoire d'objectif sur la période
  const objLine = cibleMois * n;
  const maxV = Math.max(cumulFinal, objLine, cibleMois) || 1;

  const W = 240, H = 76, padT = 8, padB = 16, padL = 4, padR = 4;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const toX = i => (n === 1 ? padL + plotW / 2 : padL + (i / (n - 1)) * plotW);
  const toY = v => padT + (1 - v / maxV) * plotH;

  // Droite d'objectif (0 → cibleMois×(n)) : du début du mois 0 à la fin du mois n-1
  const objY0 = toY(cibleMois).toFixed(1);         // fin du 1er mois
  const objYn = toY(objLine).toFixed(1);           // fin du dernier mois
  const objLineSvg = `<line x1="${toX(0).toFixed(1)}" y1="${objY0}" x2="${toX(n - 1).toFixed(1)}" y2="${objYn}" class="co2m-objline"/>`;

  // Polyligne du cumul réel + point final
  const pts = cumul.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');
  const lastX = toX(n - 1).toFixed(1), lastY = toY(cumulFinal).toFixed(1);
  const lineSvg = n > 1
    ? `<polyline points="${pts}" fill="none" class="co2m-line"/><circle cx="${lastX}" cy="${lastY}" r="2.6" class="co2m-dot"/>`
    : `<circle cx="${lastX}" cy="${lastY}" r="3" class="co2m-dot"/>`;

  // Étiquettes de mois (3 lettres), une sur deux si trop de mois
  const step = n > 8 ? 2 : 1;
  const labels = cumul.map((_, i) =>
    (i % step === 0 || i === n - 1)
      ? `<text x="${toX(i).toFixed(1)}" y="${H - 4}" class="co2m-mlbl">${MOIS_FR_LONG[i].slice(0, 3)}</text>`
      : '').join('');

  const tempo = cumulFinal >= objLine ? 'ahead' : 'behind';
  const tempoTxt = cumulFinal >= objLine
    ? `✅ en avance sur la cible (${objLine.toFixed(0)} kg attendus)`
    : `reste ${(objLine - cumulFinal).toFixed(0)} kg pour suivre la cible`;

  return `
    <div class="co2m-box ${tempo}">
      <div class="co2m-head">
        <span class="co2m-label">🌿 CO₂ évité — cumul ${year}</span>
        <span class="co2m-cible">🎯 ${cibleMois.toFixed(0)} kg/mois</span>
      </div>
      <svg class="co2m-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
        ${objLineSvg}
        ${lineSvg}
        ${labels}
      </svg>
      <div class="co2m-foot">${cumulFinal.toFixed(0)} kg cumulés · ${tempoTxt}</div>
    </div>`;
}

/* ─── W56 — Projection de dépassement du budget au rythme du mois en cours ───
   À partir de la dépense cumulée et des jours écoulés, projette la dépense de
   fin de mois et la date de franchissement du budget. Fonction pure (testable).
   Renvoie null si pas de dépassement prévu ou pas assez de données.
     spent        : dépense cumulée du mois (€)
     daysElapsed  : jours écoulés dans le mois (≈ jour du mois, ≥ 1)
     daysInMonth  : nombre de jours du mois
     budget       : objectif mensuel (€)
   → { projected, crossDay, rate } */
export function computeBudgetForecast(spent, daysElapsed, daysInMonth, budget) {
  if (!(budget > 0) || !(spent > 0) || !(daysElapsed >= 2) || spent >= budget) return null;
  const rate      = spent / daysElapsed;          // €/jour à ce rythme
  const projected = rate * daysInMonth;           // dépense estimée en fin de mois
  if (projected <= budget) return null;           // budget tenu au rythme actuel
  const crossDay = Math.ceil(budget / rate);      // jour du mois où le budget est franchi
  if (crossDay > daysInMonth) return null;
  return { projected, crossDay, rate };
}

/* ─── W39 — Barre de progression du budget carburant mensuel ───
   Compare la dépense du mois courant (véhicule sélectionné) à l'objectif €.
   W56 — ajoute une alerte anticipée « budget dépassé le JJ/MM » au rythme actuel. */
function buildBudgetBar() {
  const budget = getBudgetMensuel();
  const r = buildMonthlyReport(_currentMonthKey());
  const spent = r.nbPleins ? (r.totalCout || 0) : 0;

  // W39 — état vide : aucun budget défini. Plutôt que de masquer silencieusement
  // la section (l'utilisateur ne comprend pas pourquoi elle manque), on invite à
  // en définir un — uniquement s'il y a des dépenses ce mois-ci. Le lien ouvre
  // Réglages et focalise le champ (data-focus, géré dans main.js).
  if (!budget) {
    if (spent <= 0) return '';
    return `
      <div class="budget-box hint">
        <div class="budget-head">
          <span class="budget-label">🎯 Budget ${r.label}</span>
          <span class="budget-amount">${spent.toFixed(0)} € ce mois</span>
        </div>
        <a class="budget-hint-link" href="#/params" data-focus="budgetMensuel">
          💡 Définissez un budget mensuel dans ⚙️ Réglages pour suivre vos dépenses et activer l'alerte de dépassement →
        </a>
      </div>`;
  }
  const pct   = (spent / budget) * 100;
  const over  = spent > budget;
  const cls   = over ? 'over' : (pct >= 80 ? 'warn' : 'ok');
  const w     = Math.min(100, Math.max(0, pct)).toFixed(0);

  const right = over
    ? `<span class="budget-over">⚠️ +${(spent - budget).toFixed(0)} € au-dessus</span>`
    : `<span class="budget-left">reste ${(budget - spent).toFixed(0)} €</span>`;

  // W56 — alerte anticipée (uniquement si pas encore dépassé)
  let forecastHtml = '';
  if (!over) {
    const now  = new Date();
    const dim  = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const fc   = computeBudgetForecast(spent, now.getDate(), dim, budget);
    if (fc) {
      const dd = String(fc.crossDay).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      forecastHtml = `<div class="budget-forecast">⏰ À ce rythme, budget dépassé le <strong>${dd}/${mm}</strong> · ≈ ${fc.projected.toFixed(0)} € en fin de mois</div>`;
    }
  }

  return `
    <div class="budget-box ${cls}">
      <div class="budget-head">
        <span class="budget-label">🎯 Budget ${r.label}</span>
        <span class="budget-amount">${spent.toFixed(0)} / ${budget.toFixed(0)} €</span>
      </div>
      <div class="budget-track gauge-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${w}" aria-valuetext="Budget ${r.label} : ${spent.toFixed(0)} sur ${budget.toFixed(0)} € — ${Math.round(pct)} %">
        <div class="budget-fill" style="width:${w}%"></div>
        <span class="gauge-tick" style="left:50%"></span>
      </div>
      <div class="gauge-scale"><span>0</span><span>50 %</span><span class="gauge-target">🎯 ${budget.toFixed(0)} € · 100 %</span></div>
      <div class="budget-foot">${right} · ${Math.round(pct)} %</div>
      ${forecastHtml}
    </div>`;
}

/* ─── W50 — Tendance du budget : dépenses des 6 derniers mois + ligne d'objectif ───
   Mini histogramme SVG (réutilise buildMonthlyReport mois par mois). Affiché
   uniquement si un budget est défini et qu'au moins un mois a des dépenses. */
function buildBudgetTrend() {
  const budget = getBudgetMensuel();
  if (!budget) return '';

  // 6 derniers mois, du plus ancien au plus récent
  const now = new Date();
  const data = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const r = buildMonthlyReport(key);
    data.push({
      spent: r.nbPleins ? (r.totalCout || 0) : 0,
      mois:  MOIS_FR_LONG[d.getMonth()].slice(0, 3),
    });
  }
  if (!data.some(d => d.spent > 0)) return '';

  const maxV = Math.max(budget, ...data.map(d => d.spent)) || 1;
  const W = 240, H = 70, padT = 8, padB = 16, n = data.length;
  const slot = W / n, bw = slot * 0.5;
  const plotH = H - padT - padB;
  const toY = v => padT + (1 - v / maxV) * plotH;
  const objY = toY(budget).toFixed(1);

  const bars = data.map((d, i) => {
    const x = (i * slot + (slot - bw) / 2).toFixed(1);
    const y = toY(d.spent).toFixed(1);
    const h = Math.max(0, padT + plotH - parseFloat(y)).toFixed(1);
    const fill = d.spent > budget ? '#ef4444' : '#1D9E75';
    const label = `<text x="${(i * slot + slot / 2).toFixed(1)}" y="${H - 4}" class="trend-mlbl">${d.mois}</text>`;
    const bar = d.spent > 0
      ? `<rect x="${x}" y="${y}" width="${bw.toFixed(1)}" height="${h}" rx="2" fill="${fill}"/>`
      : '';
    return bar + label;
  }).join('');

  return `
    <div class="trend-box">
      <div class="trend-head">
        <span class="trend-label">📈 Tendance 6 mois</span>
        <span class="trend-obj">objectif ${budget.toFixed(0)} €</span>
      </div>
      <svg class="trend-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">
        <line x1="0" y1="${objY}" x2="${W}" y2="${objY}" class="trend-objline"/>
        ${bars}
      </svg>
    </div>`;
}

/* ════════════════════════════════════════════════════════════
   RAPPORT MENSUEL CONSULTABLE (réplique le mail GAS RapportMensuel.gs)
   ════════════════════════════════════════════════════════════ */
const MOIS_FR_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function _monthKey(r) {
  const d = new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T'));
  if (isNaN(d)) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return MOIS_FR_LONG[m - 1] + ' ' + y;
}

/** Mois présents dans l'historique (clé 'YYYY-MM'), du plus récent au plus ancien. */
export function getReportMonths() {
  const veh = state.currentVehiculeNom;
  const all = getAllRecords();
  const rows = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;
  const set = new Set();
  rows.forEach(r => { const k = _monthKey(r); if (k) set.add(k); });
  return [...set].sort().reverse();
}

/** Bilan d'un mois 'YYYY-MM' pour le véhicule courant (mêmes calculs que le mail). */
export function buildMonthlyReport(monthKey) {
  const veh = state.currentVehiculeNom;
  const all = getAllRecords();
  const byVeh = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;
  const rows = byVeh.filter(r => _monthKey(r) === monthKey);
  if (!rows.length) return { monthKey, label: _monthLabel(monthKey), nbPleins: 0 };

  let nbPleins = 0, totalCout = 0, totalLitres = 0, nbE85 = 0;
  let kmMin = Infinity, kmMax = -Infinity;
  rows.forEach(r => {
    const lit  = Number(r['Nb. Litres']) || 0;
    const prix = Number(r['Prix €/L']) || 0;
    const km   = Number(r['Km compteur']) || 0;
    if (lit > 0 && prix > 0) { nbPleins++; totalCout += lit * prix; totalLitres += lit; }
    if (km > 0) { kmMin = Math.min(kmMin, km); kmMax = Math.max(kmMax, km); }
    if (matchType(r.Type, 'E85')) nbE85++;
  });
  const kmParcourus = (kmMax > kmMin) ? (kmMax - kmMin) : 0;
  const consoMoy = kmParcourus > 0 ? (totalLitres / kmParcourus) * 100 : 0;

  // Prix de référence de repli sur TOUT l'historique : pleins E85 avec prix réf.
  // relevé (colonne station) + prix payé des pleins du carburant de référence.
  const surconso   = computeSurconso(byVeh);
  const rm         = getRefModelForStats(byVeh, surconso);
  const refCol     = refPriceCol(rm.isDiesel);
  const refFuelKey = rm.isDiesel ? 'GAZOLE' : 'SP98';
  const refRefs = [];
  byVeh.forEach(r => {
    if (matchType(r.Type, 'E85')) {
      const s = Number(r[refCol]) || 0;
      if (s > 0) refRefs.push(s);
    } else if (matchType(r.Type, refFuelKey)) {
      const p = Number(r['Prix €/L']) || 0;
      if (p > 0) refRefs.push(p);
    }
  });
  const refMoyen = refRefs.length ? refRefs.reduce((s, p) => s + p, 0) / refRefs.length : 0;

  let coutE85 = 0, coutRefEquiv = 0;
  rows.forEach(r => {
    if (!matchType(r.Type, 'E85')) return;
    const lit  = Number(r['Nb. Litres']) || 0;
    const prix = Number(r['Prix €/L']) || 0;
    if (lit <= 0 || prix <= 0) return;
    const refPrice = rm.refPriceFromFill(r, refMoyen);
    coutE85 += lit * prix;
    if (refPrice > 0) coutRefEquiv += lit * rm.ratioConso * refPrice;
  });
  const econBrute = coutRefEquiv - coutE85;

  return { monthKey, label: _monthLabel(monthKey), nbPleins, nbE85,
           totalCout, totalLitres, kmParcourus, consoMoy, econBrute, surconso,
           refShort: refShortOf(rm.refKey) };
}

/** Affiche le rapport mensuel dans #rapportBox et (re)peuple le sélecteur de mois. */
export function renderRapportMensuel() {
  const box = document.getElementById('rapportBox');
  if (!box) return;
  const sel = document.getElementById('rapportMois');

  const months = getReportMonths();
  if (!months.length) {
    if (sel) sel.innerHTML = '';
    box.innerHTML = '<div class="stats-msg">Aucun plein enregistré.</div>';
    return;
  }

  if (sel) {
    const prev = sel.value;
    sel.innerHTML = months.map(k => `<option value="${k}">${_monthLabel(k)}</option>`).join('');
    sel.value = months.includes(prev) ? prev : months[0];
  }
  const key = (sel && sel.value) || months[0];
  const s = buildMonthlyReport(key);

  if (!s.nbPleins) {
    box.innerHTML = `<div class="stats-msg">Aucun plein en ${s.label}.</div>`;
    return;
  }

  const ecoClass = s.nbE85 ? (s.econBrute > 0 ? 'pos' : (s.econBrute < 0 ? 'neg' : '')) : '';
  const ecoSign  = s.econBrute > 0 ? '+' : '';
  const ecoCell  = s.nbE85
    ? `<div class="stat-val">${ecoSign}${s.econBrute.toFixed(0)} €</div>
       <div class="stat-unit">éco. E85 vs ${s.refShort}</div>`
    : `<div class="stat-val">—</div>
       <div class="stat-unit">aucun plein E85</div>`;

  box.innerHTML = `
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-val">${s.nbPleins}</div>
        <div class="stat-unit">plein(s)${s.nbE85 ? ' · ' + s.nbE85 + ' E85' : ''}</div>
      </div>
      <div class="stat">
        <div class="stat-val">${s.totalCout.toFixed(0)} €</div>
        <div class="stat-unit">dépensés</div>
      </div>
      <div class="stat">
        <div class="stat-val">${s.totalLitres.toFixed(1)}</div>
        <div class="stat-unit">litres</div>
      </div>
      <div class="stat">
        <div class="stat-val">${s.kmParcourus.toLocaleString('fr-FR')}</div>
        <div class="stat-unit">km parcourus</div>
      </div>
      <div class="stat">
        <div class="stat-val">${s.consoMoy > 0 ? s.consoMoy.toFixed(1) : '—'}</div>
        <div class="stat-unit">L / 100 km</div>
      </div>
      <div class="stat ${ecoClass}">${ecoCell}</div>
    </div>
    <div class="stats-sub">${s.label} · ${state.currentVehiculeNom || 'tous véhicules'}</div>`;
}

/** Câble le sélecteur de mois du rapport. À appeler une fois depuis main.js. */
export function initRapport() {
  document.getElementById('rapportMois')?.addEventListener('change', () => renderRapportMensuel());
}

/**
 * W34 — Câble les boutons de filtre du sparkline multi-carburant.
 * Délégation sur #statsBox — à appeler une seule fois depuis main.js.
 */
export function initSparkToggles() {
  document.getElementById('statsBox')?.addEventListener('click', e => {
    if (e.target.closest('[data-spark-refresh]')) {
      const btn = e.target.closest('[data-spark-refresh]');
      btn.textContent = '⏳';
      btn.disabled = true;
      forceRefreshHistorique().finally(() => renderStats());
      return;
    }

    const btn = e.target.closest('[data-spark-fuel]');
    if (!btn) return;

    const fuel = btn.dataset.sparkFuel;
    const series = buildFuelSeries(getAllRecords(), state.currentVehiculeNom);
    const availFuels = Object.keys(SPARK_COLORS).filter(k => (series[k] || []).length >= 1);

    let active = _loadSparkFuels(availFuels);
    if (active.includes(fuel)) {
      active = active.filter(k => k !== fuel);
    } else {
      active = [...active, fuel];
    }
    if (!active.length) return;

    _saveSparkFuels(active);
    renderStats();
  });
}

/**
 * Câble le champ « prix du kit de conversion » de la carte Paramètres.
 * Persiste dans localStorage et rafraîchit les stats (économie nette).
 */
export function initKitSetting() {
  const el = document.getElementById('kitPrix');
  if (!el) return;
  el.value = getKitPrix();
  el.addEventListener('change', () => {
    const v = Number(el.value);
    if (el.value === '' || !isFinite(v) || v < 0) {
      localStorage.removeItem(KIT_PRIX_KEY);
      el.value = getKitPrix();
    } else {
      localStorage.setItem(KIT_PRIX_KEY, String(v));
    }
    pushParam('kit_prix');   // P1 — propage vers le Sheet (et Excel)
    renderStats();
  });
}

/**
 * X67/X68/X69 — Câble les champs de rentabilité (postes de coût, carburant de
 * référence, écart, N pleins récents). Persiste + propage (P1) + rafraîchit.
 */
export function initRentabiliteSettings() {
  const numFields = [
    ['coutPose',         COUT_POSE_KEY,         'cout_pose'],
    ['coutCarteGrise',   COUT_CARTEGRISE_KEY,   'cout_carte_grise'],
    ['coutEntretien',    COUT_ENTRETIEN_KEY,    'cout_entretien'],
    ['surcoutAssurance', SURCOUT_ASSURANCE_KEY, 'surcout_assurance'],
    ['aideDeduite',      AIDE_DEDUITE_KEY,      'aide_deduite'],
    ['ecartRef',         ECART_REF_KEY,         'ecart_ref'],
    ['projNbRecents',    PROJ_NB_RECENTS_KEY,   'proj_nb_recents'],
  ];
  numFields.forEach(([id, key, cle]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    el.value = (raw != null && raw !== '' && isFinite(n) && n >= 0) ? n : '';
    el.addEventListener('change', () => {
      const v = Number(el.value);
      if (el.value === '' || !isFinite(v) || v < 0) { localStorage.removeItem(key); el.value = ''; }
      else localStorage.setItem(key, String(v));
      pushParam(cle);      // P1 — propage vers le Sheet (et Excel)
      renderStats();
    });
  });
  // Bloc diesel : affiché quand le carburant de référence est le gazole.
  //   • véhicule diesel de référence (conso mesurée sur ses pleins gazole) ;
  //   • conso diesel manuelle de repli (L/100) ;
  //   • l'écart €/L (spécifique essence) est masqué en mode diesel.
  const dieselBlock = document.getElementById('dieselRefBlock');
  const ecartRow    = document.getElementById('ecartRefRow');
  function toggleDieselUI(refKey) {
    const diesel = refKey === 'GAZOLE';
    if (dieselBlock) dieselBlock.classList.toggle('hidden', !diesel);
    if (ecartRow)    ecartRow.classList.toggle('hidden', diesel);
  }

  const vehSel = document.getElementById('vehiculeDieselRef');
  if (vehSel) {
    const cur = localStorage.getItem(VEHICULE_DIESEL_REF_KEY) || '';
    vehSel.innerHTML = '';
    vehSel.add(new Option('— auto / défaut berline —', ''));
    getVehicules().forEach(nom => vehSel.add(new Option(nom, nom)));
    if (Array.from(vehSel.options).some(o => o.value === cur)) vehSel.value = cur;
    vehSel.addEventListener('change', () => {
      if (vehSel.value) localStorage.setItem(VEHICULE_DIESEL_REF_KEY, vehSel.value);
      else              localStorage.removeItem(VEHICULE_DIESEL_REF_KEY);
      pushParam('vehicule_diesel_ref');
      renderStats();
    });
  }

  const consoInput = document.getElementById('consoDieselRef');
  if (consoInput) {
    const raw = localStorage.getItem(CONSO_DIESEL_REF_KEY);
    const n = Number(raw);
    consoInput.value = (raw != null && raw !== '' && isFinite(n) && n > 0) ? n : '';
    consoInput.addEventListener('change', () => {
      const v = Number(consoInput.value);
      if (consoInput.value === '' || !isFinite(v) || v <= 0) { localStorage.removeItem(CONSO_DIESEL_REF_KEY); consoInput.value = ''; }
      else localStorage.setItem(CONSO_DIESEL_REF_KEY, String(v));
      pushParam('conso_diesel_ref');
      renderStats();
    });
  }

  const sel = document.getElementById('carburantRef');
  if (sel) {
    sel.value = localStorage.getItem(CARBURANT_REF_KEY) || DEFAULT_CARBURANT_REF;
    toggleDieselUI(sel.value);
    sel.addEventListener('change', () => {
      localStorage.setItem(CARBURANT_REF_KEY, sel.value);
      toggleDieselUI(sel.value);
      pushParam('carburant_ref');
      renderStats();
    });
  }
}

/**
 * W39 — Câble le champ « budget carburant mensuel » de la carte Paramètres.
 * 0 / vide désactive la barre ; toute valeur > 0 l'affiche dans les stats.
 */
export function initBudgetSetting() {
  const el = document.getElementById('budgetMensuel');
  if (!el) return;
  const cur = getBudgetMensuel();
  el.value = cur > 0 ? cur : '';
  el.addEventListener('change', () => {
    const v = Number(el.value);
    if (el.value === '' || !isFinite(v) || v <= 0) {
      localStorage.removeItem(BUDGET_KEY);
      el.value = '';
    } else {
      localStorage.setItem(BUDGET_KEY, String(v));
    }
    pushParam('budget_mensuel');   // P1 — propage vers le Sheet (et Excel)
    renderStats();
  });
}

/**
 * W51 — Câble le champ « objectif CO₂ annuel » de la carte Paramètres.
 * Vide → revient à la valeur par défaut (DEFAULT_CO2_OBJECTIF).
 */
export function initCo2ObjectifSetting() {
  const el = document.getElementById('objectifCo2');
  if (!el) return;
  el.value = getObjectifCo2();
  el.addEventListener('change', () => {
    const v = Number(el.value);
    if (el.value === '' || !isFinite(v) || v <= 0) {
      localStorage.removeItem(CO2_OBJECTIF_KEY);
      el.value = getObjectifCo2();
    } else {
      localStorage.setItem(CO2_OBJECTIF_KEY, String(v));
    }
    pushParam('objectif_co2');   // P1 — propage vers le Sheet (et Excel)
    renderStats();
  });
}
