/* ─── W87 — Rendus visuels des stats (sparkline, jauges, tuiles, graphes SVG) ───
   Extrait de stats.js : les fonctions « build » / « compute » qui produisent du HTML
   ou du SVG à partir des données et des réglages. Dépend de statsParams (feuille) +
   données/secteur, jamais du cœur stats.js → pas de cycle (stats.js → statsCharts). */
import { CO2_E85_PER_L, CO2_THERMIQUE_PER_KM, CO2_ARBRE_PAR_AN } from './config.js';
import { state } from './state.js';
import { getAllRecords } from './historique.js';
import { MOIS_FR_LONG, matchType,
         getObjectifCo2, getBudgetMensuel, computeSurconso, getRefModelForStats,
         refPriceCol, refShortOf, currentMonthKey, monthKeyOf, monthLabelOf } from './statsParams.js';
/* ════════════════════════════════════════════════════════════
   JAUGE RENTABILITÉ (W89) + TUILES/JAUGES CO₂ (W40/W51/W55)
   ════════════════════════════════════════════════════════════ */

/* ─── W89 — Jauge « % d'atteinte de rentabilité » (amortissement de la conversion) ───
   Progression = économie brute cumulée / coût total de conversion. La rentabilité
   est atteinte quand l'économie nette repasse ≥ 0 (brute ≥ coût de conversion).
   A1 — projette la date de rentabilité au rythme moyen d'économie brute observé.
   A2 — jauge annoncée aux lecteurs d'écran (role="progressbar" + aria-valuetext).
   A3 — tooltip explicitant le calcul (brute cumulée ÷ coût total). */
export function buildRentaBar(s) {
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
export function buildCO2Tile(s) {
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
export function buildCo2Annuel() {
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
export function buildCo2Monthly() {
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

/* ════════════════════════════════════════════════════════════
   BUDGET MENSUEL (W39/W50/W56)
   ════════════════════════════════════════════════════════════ */

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
export function buildBudgetBar() {
  const budget = getBudgetMensuel();
  const r = buildMonthlyReport(currentMonthKey());
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
export function buildBudgetTrend() {
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
   RAPPORT MENSUEL — calculs (réplique le mail GAS RapportMensuel.gs)
   Le rendu DOM (renderRapportMensuel) reste dans stats.js.
   ════════════════════════════════════════════════════════════ */

/** Mois présents dans l'historique (clé 'YYYY-MM'), du plus récent au plus ancien. */
export function getReportMonths() {
  const veh = state.currentVehiculeNom;
  const all = getAllRecords();
  const rows = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;
  const set = new Set();
  rows.forEach(r => { const k = monthKeyOf(r); if (k) set.add(k); });
  return [...set].sort().reverse();
}

/** Bilan d'un mois 'YYYY-MM' pour le véhicule courant (mêmes calculs que le mail). */
export function buildMonthlyReport(monthKey) {
  const veh = state.currentVehiculeNom;
  const all = getAllRecords();
  const byVeh = veh ? all.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === veh) : all;
  const rows = byVeh.filter(r => monthKeyOf(r) === monthKey);
  if (!rows.length) return { monthKey, label: monthLabelOf(monthKey), nbPleins: 0 };

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

  return { monthKey, label: monthLabelOf(monthKey), nbPleins, nbE85,
           totalCout, totalLitres, kmParcourus, consoMoy, econBrute, surconso,
           refShort: refShortOf(rm.refKey) };
}
