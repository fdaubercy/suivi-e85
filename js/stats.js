/* ─── Stats live : orchestration (compute central + rendu principal + rapport + wiring) ───
   Découpé (W87) pour rester sous ~500 lignes :
     • statsParams.js  → réglages localStorage + helpers de calcul partagés (feuille) ;
     • statsCharts.js  → rendus visuels (sparkline, jauges, tuiles, graphes, prédiction,
                          calcul du rapport mensuel).
   Ce module garde le calcul central (computeStats), le rendu de la carte Stats, le
   résumé serveur, le rendu DOM du rapport mensuel et le câblage des réglages. Il
   ré-exporte l'API publique historique pour main.js et les tests. */
import { state } from './state.js';
import { FUEL_CONFIG, CO2_E85_PER_L } from './config.js';
import { getAllRecords } from './historique.js';
import { renderComparatif } from './comparatif.js';
import { getCachedServerStats, getServerStats } from './statsApi.js';
import { isAuthed } from './auth.js';
import { refreshDashboard, sheetEditUrl } from './dashboardApi.js';
import { MONTHS_WINDOW, matchType, refShortOf,
         getKitPrix, getCoutTotalConversion,
         computeSurconso, getRefModelForStats, refPriceCol, surconsoVsRef,
         monthLabelOf } from './statsParams.js';
import { buildRentaBar, buildCO2Tile, buildCo2Annuel, buildCo2Monthly,
         buildBudgetBar, buildBudgetTrend,
         getReportMonths, buildMonthlyReport } from './statsCharts.js';
import { buildPrixSparkline, buildPrediction } from './statsSparkline.js';

// ─── Ré-exports : API publique préservée après le découpage W87 ───
export { getKitPrix, getCoutTotalConversion, refShortOf, getReportMonths, buildMonthlyReport };
export { getEcartRef, getCarburantRef, clampSurconso,
         getBudgetMensuel, getObjectifCo2 } from './statsParams.js';
export { computeBudgetForecast } from './statsCharts.js';
export { getNextKmPrediction } from './statsSparkline.js';
// Câblage des réglages (init*) : déplacé dans statsSettings.js (W87). main.js les importe de là.

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
  const kitPrix   = getKitPrix(veh);                 // = B6 (boîtier seul), par véhicule
  // X68/W91 — économie nette sur le COÛT TOTAL de conversion (pas le boîtier seul),
  // rattaché au véhicule courant (postes fixes + dépenses d'entretien).
  const coutTotalConversion = getCoutTotalConversion(veh);
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
  renderBilanSheet();   // W83/W84 — carte « Bilan Google Sheets » (si connecté)
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

/* ─── W83/W84 — Carte « Bilan Google Sheets » : reconstruire + ouvrir le classeur ───
   Visible seulement si connecté (l'action buildDashboard est filtrée par compte). */
export function renderBilanSheet() {
  const card = document.getElementById('bilanSheetCard');
  if (!card) return;
  card.classList.toggle('hidden', !isAuthed());
}

let _bilanWired = false;
export function initBilanSheet() {
  if (_bilanWired) return;
  _bilanWired = true;
  const card = document.getElementById('bilanSheetCard');
  if (!card) return;
  const status = document.getElementById('bilanStatus');

  card.querySelector('[data-action="openBilan"]')?.addEventListener('click', () => {
    const url = sheetEditUrl();
    if (url) window.open(url, '_blank', 'noopener');
  });

  card.querySelector('[data-action="refreshBilan"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    if (status) { status.className = 'bilan-status pending'; status.textContent = '⏳ Reconstruction du bilan…'; }
    const res = await refreshDashboard();
    btn.disabled = false;
    if (!status) return;
    if (res.ok) {
      status.className = 'bilan-status ok';
      status.textContent = '✅ Bilan reconstruit — ouvrez le Google Sheet pour le consulter.';
    } else if (res.error === 'not-authed') {
      status.className = 'bilan-status err';
      status.textContent = '🔒 Connectez-vous pour rafraîchir le bilan.';
    } else {
      status.className = 'bilan-status err';
      status.textContent = '⚠️ Échec du rafraîchissement (' + res.error + ').';
    }
  });
}

/* ════════════════════════════════════════════════════════════
   RAPPORT MENSUEL CONSULTABLE — rendu DOM (calculs dans statsCharts.js)
   ════════════════════════════════════════════════════════════ */

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
    sel.innerHTML = months.map(k => `<option value="${k}">${monthLabelOf(k)}</option>`).join('');
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
