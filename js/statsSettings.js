/* ─── W87 — Câblage des réglages Stats/Rentabilité (Paramètres) ───
   Extrait de stats.js : les fonctions init* qui relient les champs de la carte
   Réglages au localStorage, propagent (P1 → pushParam) et rafraîchissent les stats.
   Dépend de stats.js (renderStats/renderRapportMensuel) + statsParams/statsCharts +
   config/historique/vehicules — pas de cycle (stats.js n'importe pas ce module). */
import { ECART_REF_KEY, PROJ_NB_RECENTS_KEY,
         CARBURANT_REF_KEY, DEFAULT_CARBURANT_REF, BUDGET_KEY, CO2_OBJECTIF_KEY,
         CONSO_DIESEL_REF_KEY, VEHICULE_DIESEL_REF_KEY } from './config.js';
import { state } from './state.js';
import { getVehicules } from './vehicules.js';
import { pushParam } from './parametres.js';
import { getAllRecords, forceRefreshHistorique } from './historique.js';
import { SPARK_COLORS, getBudgetMensuel, getObjectifCo2 } from './statsParams.js';
import { convInputValue, setConvField } from './depenses.js';
import { buildFuelSeries, loadSparkFuels, saveSparkFuels } from './statsSparkline.js';
import { renderStats, renderRapportMensuel } from './stats.js';

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

    let active = loadSparkFuels(availFuels);
    if (active.includes(fuel)) {
      active = active.filter(k => k !== fuel);
    } else {
      active = [...active, fuel];
    }
    if (!active.length) return;

    saveSparkFuels(active);
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
  // W91 — prix du boîtier par véhicule (repli sur la valeur globale existante).
  el.value = convInputValue('kit_prix');
  el.addEventListener('change', () => {
    setConvField('kit_prix', state.currentVehiculeNom, el.value);
    el.value = convInputValue('kit_prix');
    pushParam('conversion_veh');   // W91d — propage la map par véhicule (cross-appareils)
    renderStats();
  });
}

/**
 * W91 — Repeuple les champs de coût de conversion (boîtier + postes fixes)
 * selon le véhicule courant. À appeler sur 'vehicule-changed' / 'parametres-synced'.
 */
export function refreshConversionInputs(veh = state.currentVehiculeNom) {
  [['kitPrix', 'kit_prix'], ['coutPose', 'cout_pose'],
   ['coutCarteGrise', 'cout_carte_grise'], ['surcoutAssurance', 'surcout_assurance'],
   ['aideDeduite', 'aide_deduite']].forEach(([id, field]) => {
    const el = document.getElementById(id);
    if (el) el.value = convInputValue(field, veh);
  });
}

/**
 * X67/X68/X69 — Câble les champs de rentabilité (postes de coût, carburant de
 * référence, écart, N pleins récents). Persiste + propage (P1) + rafraîchit.
 */
export function initRentabiliteSettings() {
  // W91 — postes fixes de conversion : PAR VÉHICULE (repli global), sans pushParam
  // (la synchro Sheet/Excel par véhicule est prévue en Phase B/C).
  const convFields = [
    ['coutPose',         'cout_pose'],
    ['coutCarteGrise',   'cout_carte_grise'],
    ['surcoutAssurance', 'surcout_assurance'],
    ['aideDeduite',      'aide_deduite'],
  ];
  convFields.forEach(([id, field]) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.value = convInputValue(field);
    el.addEventListener('change', () => {
      setConvField(field, state.currentVehiculeNom, el.value);
      el.value = convInputValue(field);
      pushParam('conversion_veh');   // W91d — propage la map par véhicule (cross-appareils)
      renderStats();
    });
  });

  // Paramètres GLOBAUX (synchro P1) : écart réf. + N pleins récents pour la projection.
  const globalNum = [
    ['ecartRef',      ECART_REF_KEY,       'ecart_ref'],
    ['projNbRecents', PROJ_NB_RECENTS_KEY, 'proj_nb_recents'],
  ];
  globalNum.forEach(([id, key, cle]) => {
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
