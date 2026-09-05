/* ─── W87 — Paramètres & helpers partagés des stats (feuille du graphe de deps) ───
   Réglages localStorage (kit, coûts, budget, objectif CO₂, carburant de référence),
   modèle de comparaison (essence/diesel) et petits utilitaires. Ce module ne dépend
   que de config/refmodel/historique : il est importé aussi bien par le cœur (stats.js,
   computeStats) que par les rendus (statsCharts.js), sans créer de cycle. */
import { FUEL_CONFIG, DEFAULT_SURCONSO,
         BUDGET_KEY, CO2_OBJECTIF_KEY, DEFAULT_CO2_OBJECTIF,
         SURCONSO_KEY, SURCONSO_MIN, SURCONSO_MAX,
         ECART_REF_KEY, DEFAULT_ECART_REF,
         CARBURANT_REF_KEY, DEFAULT_CARBURANT_REF,
         CONSO_DIESEL_REF_KEY, VEHICULE_DIESEL_REF_KEY } from './config.js';
import { computeConsoMoy, buildRefModel } from './refmodel.js';
import { getAllRecords } from './historique.js';
import { getConvField, getDepensesTotal } from './depenses.js';
import { state } from './state.js';

/* ─── Constantes partagées ─── */
export const MONTHS_WINDOW = 6;
export const SPARK_KEY = 'suivi_e85_spark_fuels';

/* ─── W34 — Couleurs des courbes par carburant ─── */
export const SPARK_COLORS = {
  E85:    '#1D9E75',
  SP98:   '#2E75B6',
  SP95:   '#60a5fa',
  E10:    '#10b981',
  GAZOLE: '#94a3b8',
  GPLC:   '#f59e0b',
};

/* ─── Colonnes GS pour les prix station ─── */
export const FUEL_PRICE_COL = {
  E85:    'E85 station (€/L)',
  SP98:   'SP98 station (€/L)',
  SP95:   'SP95 station (€/L)',
  E10:    'E10 station (€/L)',
  GAZOLE: 'Gazole station (€/L)',
  GPLC:   'GPLc station (€/L)',
};

export const MOIS_FR_LONG = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                             'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

/** Matche un Type GS (label complet "SuperEthanol E85") avec une cle FUEL_CONFIG (E85). */
export function matchType(rType, fuelKey) {
  if (!rType || !fuelKey) return false;
  const t = String(rType).toLowerCase();
  const cfg = FUEL_CONFIG[fuelKey];
  if (!cfg) return false;
  return t === cfg.label.toLowerCase()
      || t.includes(cfg.short.toLowerCase())
      || (fuelKey === 'E85' && t.includes('ethanol'));
}

/* ─── Prix du boîtier (kit) de conversion — par véhicule (repli global) ─── */
export function getKitPrix(veh = state.currentVehiculeNom) {
  return getConvField('kit_prix', veh);
}

/* ─── W91 — Coût TOTAL de conversion pour un véhicule (= COUT_TOTAL Excel) ───
   boîtier + pose + carte grise + assurance − aide + Σ dépenses d'entretien
   du véhicule (borné ≥ 0). Postes fixes par véhicule avec repli global. */
export function getCoutTotalConversion(veh = state.currentVehiculeNom) {
  const total = getConvField('kit_prix', veh)
    + getConvField('cout_pose', veh)
    + getConvField('cout_carte_grise', veh)
    + getConvField('surcout_assurance', veh)
    - getConvField('aide_deduite', veh)
    + getDepensesTotal(veh);
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
export function getRefModelForStats(byVeh, surconso) {
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
export function refPriceCol(isDiesel) {
  return isDiesel ? 'Gazole station (€/L)' : 'SP98 station (€/L)';
}
/** Surconso E85 exprimée vs le carburant de référence (pour l'affichage). */
export function surconsoVsRef(ratioConso) {
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
export function getSurconsoFallback() {
  const raw = localStorage.getItem(SURCONSO_KEY);
  const n = Number(raw);
  return raw != null && raw !== '' && isFinite(n) && n > 0 ? n : DEFAULT_SURCONSO;
}

/** Clé 'YYYY-MM' du mois courant. */
export function currentMonthKey() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
}

/** Clé 'YYYY-MM' d'un enregistrement (null si date invalide). */
export function monthKeyOf(r) {
  const d = new Date(String(r.Date || r.Horodatage || '').replace(' ', 'T'));
  if (isNaN(d)) return null;
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
/** Libellé long d'une clé 'YYYY-MM' (ex. 'Août 2026'). */
export function monthLabelOf(key) {
  const [y, m] = key.split('-').map(Number);
  return MOIS_FR_LONG[m - 1] + ' ' + y;
}

/* ─── Surconsommation E85 dynamique (cellule J7 Excel) ───
   conso moyenne E85 / conso moyenne S98 − 1, calculée à partir des pleins.
   Défaut DEFAULT_SURCONSO si pas de données S98 exploitables. */
export function computeSurconso(records) {
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
