/* ─── W87 — Séries temporelles des stats : sparkline prix + prédiction prochain plein ───
   Extrait de statsCharts.js : les rendus « série dans le temps » (courbes de prix
   multi-carburant W34 et prédiction W33/W35/W58). Dépend de statsParams (feuille) +
   données/secteur, jamais du cœur stats.js → pas de cycle. */
import { FUEL_CONFIG } from './config.js';
import { state } from './state.js';
import { getAllRecords } from './historique.js';
import { getSectorSeries, loadSectorPricesFor } from './secteur.js';
import { SPARK_COLORS, FUEL_PRICE_COL, SPARK_KEY, matchType } from './statsParams.js';

/* ════════════════════════════════════════════════════════════
   SPARKLINE PRIX MULTI-CARBURANT (W34)
   ════════════════════════════════════════════════════════════ */

/* ─── LocalStorage : carburants actifs sur le sparkline ─── */
export function loadSparkFuels(availFuels) {
  try {
    const raw = localStorage.getItem(SPARK_KEY);
    if (!raw) return availFuels.includes('E85') ? ['E85'] : [availFuels[0]];
    const saved = JSON.parse(raw);
    const valid = saved.filter(k => availFuels.includes(k));
    return valid.length ? valid : (availFuels.includes('E85') ? ['E85'] : [availFuels[0]]);
  } catch { return availFuels.includes('E85') ? ['E85'] : [availFuels[0]]; }
}

export function saveSparkFuels(fuels) {
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
export function buildFuelSeries(records, veh) {
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
export function buildPrixSparkline() {
  const all = getAllRecords();
  const veh = state.currentVehiculeNom;

  const series     = buildFuelSeries(all, veh);
  const availFuels = Object.keys(SPARK_COLORS).filter(k => (series[k] || []).length >= 1);

  if (!availFuels.length) return '';

  // D2 — charge en tâche de fond (1×/session) les relevés marché des carburants suivis,
  // puis re-render pour superposer la courbe « marché » (relevé quotidien) aux pleins.
  _ensureMarketData(availFuels);

  const activeFuels = loadSparkFuels(availFuels);

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

/* ════════════════════════════════════════════════════════════
   PRÉDICTION PROCHAIN PLEIN (W33 / W35 / W58)
   ════════════════════════════════════════════════════════════ */

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
export function buildPrediction() {
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
