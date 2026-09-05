/* ═══════════════════════════════════════════════════════════════════════
   depenses.js — W91 · Dépenses d'entretien & coûts de conversion PAR VÉHICULE

   Deux données, toutes deux rattachées au véhicule courant :

   1. Coûts de conversion FIXES (boîtier, pose, carte grise, assurance, aide).
      Historiquement des scalaires GLOBAUX (clés COUT_*_KEY, synchro Excel).
      Désormais surchargeables par véhicule via CONV_BY_VEH_KEY, avec REPLI
      sur la valeur globale legacy tant qu'un véhicule n'a pas sa propre valeur
      (non destructif : les valeurs déjà saisies/synchronisées restent le défaut).

   2. Dépenses d'entretien : liste éditable (intitulé + montant + date +
      catégorie), ajoutable au fil de l'eau. Total automatique par véhicule,
      intégré au coût total de conversion (calcul de rentabilité).

   Stockage local uniquement (Phase A). La synchro Sheet/Excel viendra en
   Phase B/C (id + tombstone `supprime` déjà prévus pour un LWW par ligne).
   ═══════════════════════════════════════════════════════════════════════ */

import { DEPENSES_KEY, CONV_BY_VEH_KEY, DEPENSE_CATEGORIES,
         KIT_PRIX_KEY, COUT_POSE_KEY, COUT_CARTEGRISE_KEY,
         SURCOUT_ASSURANCE_KEY, AIDE_DEDUITE_KEY, DEFAULT_KIT_PRIX,
         GAS_URL, APP_TOKEN } from './config.js';
import { state } from './state.js';
import { getIdToken, isAuthed, authEnabled } from './auth.js';

/* ─── Postes de coût de conversion FIXES (par véhicule, repli global) ─── */
export const CONV_FIELDS = [
  { field: 'kit_prix',          legacy: KIT_PRIX_KEY,          def: DEFAULT_KIT_PRIX },
  { field: 'cout_pose',         legacy: COUT_POSE_KEY,         def: 0 },
  { field: 'cout_carte_grise',  legacy: COUT_CARTEGRISE_KEY,   def: 0 },
  { field: 'surcout_assurance', legacy: SURCOUT_ASSURANCE_KEY, def: 0 },
  { field: 'aide_deduite',      legacy: AIDE_DEDUITE_KEY,      def: 0 },
];
const CONV_BY_FIELD = Object.fromEntries(CONV_FIELDS.map(d => [d.field, d]));

function _convMap() {
  try { return JSON.parse(localStorage.getItem(CONV_BY_VEH_KEY) || '{}') || {}; }
  catch { return {}; }
}
function _saveConvMap(m) {
  try { localStorage.setItem(CONV_BY_VEH_KEY, JSON.stringify(m)); } catch { /* quota */ }
}
function _vehKey(veh) { return veh || '__global__'; }
function _isValidNum(v) { const n = Number(v); return v !== '' && v != null && isFinite(n) && n >= 0; }

/** Override par véhicule d'un poste, ou null si absent. */
function _override(field, veh) {
  const per = _convMap()[_vehKey(veh)];
  return per && _isValidNum(per[field]) ? Number(per[field]) : null;
}

/**
 * Valeur d'un poste de conversion pour un véhicule :
 *   override véhicule → valeur globale legacy → défaut du poste.
 */
export function getConvField(field, veh = state.currentVehiculeNom) {
  const d = CONV_BY_FIELD[field];
  if (!d) return 0;
  const ov = _override(field, veh);
  if (ov != null) return ov;
  const raw = localStorage.getItem(d.legacy);
  if (_isValidNum(raw)) return Number(raw);
  return d.def;
}

/**
 * Valeur à AFFICHER dans le champ de saisie : vide si aucune valeur explicite
 * (ni override véhicule ni legacy global) — sauf kit_prix qui montre son défaut.
 */
export function convInputValue(field, veh = state.currentVehiculeNom) {
  const d = CONV_BY_FIELD[field];
  if (!d) return '';
  if (_override(field, veh) != null) return getConvField(field, veh);
  if (_isValidNum(localStorage.getItem(d.legacy))) return getConvField(field, veh);
  return field === 'kit_prix' ? d.def : '';
}

/**
 * Écrit/efface l'override d'un poste pour un véhicule.
 * value '' / null / négatif = efface l'override (repli sur global/défaut).
 * value 0 = zéro EXPLICITE conservé.
 */
export function setConvField(field, veh, value) {
  if (!CONV_BY_FIELD[field]) return;
  const m = _convMap();
  const k = _vehKey(veh);
  const bucket = m[k] || {};
  if (value === '' || value == null || !isFinite(Number(value)) || Number(value) < 0) {
    delete bucket[field];
  } else {
    bucket[field] = Number(value);
  }
  if (Object.keys(bucket).length) m[k] = bucket; else delete m[k];
  _saveConvMap(m);
}

/* ─── Dépenses d'entretien (liste) ─── */
function _list() {
  try { const a = JSON.parse(localStorage.getItem(DEPENSES_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function _saveList(a) {
  try { localStorage.setItem(DEPENSES_KEY, JSON.stringify(a)); } catch { /* quota */ }
}
function _newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

/** Date du jour au format ISO court (YYYY-MM-DD). */
export function todayISO() {
  const t = new Date();
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0')
       + '-' + String(t.getDate()).padStart(2, '0');
}

/** Toutes les dépenses brutes (tombstones inclus) — usage sync interne. */
export function getAllDepenses() { return _list(); }

/** Dépenses actives d'un véhicule, triées par date décroissante. */
export function getDepenses(veh = state.currentVehiculeNom) {
  return _list()
    .filter(d => !d.supprime && (d.vehicule || '') === (veh || ''))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

/** Total € des dépenses actives d'un véhicule. */
export function getDepensesTotal(veh = state.currentVehiculeNom) {
  return getDepenses(veh).reduce((s, d) => s + (Number(d.montant) || 0), 0);
}

/** Ajoute une dépense (renvoie l'objet créé). */
export function addDepense({ vehicule, date, categorie, intitule, montant }) {
  const item = {
    id: _newId(),
    vehicule: vehicule || '',
    date: date || todayISO(),
    categorie: DEPENSE_CATEGORIES.includes(categorie) ? categorie : DEPENSE_CATEGORIES[0],
    intitule: String(intitule || '').trim(),
    montant: Math.max(0, Number(montant) || 0),
    modifie_le: Date.now(),
    supprime: 0,
  };
  const a = _list();
  a.push(item);
  _saveList(a);
  return item;
}

/** Suppression logique (tombstone) — propagation sync par `id`. Renvoie l'item. */
export function removeDepense(id) {
  const a = _list();
  const it = a.find(d => d.id === id);
  if (!it) return null;
  it.supprime = 1;
  it.montant = 0;
  it.modifie_le = Date.now();
  _saveList(a);
  return it;
}

/* ─── W91b — Synchronisation Sheet (LWW par `id`, tombstone) ─── */
async function _post(body) {
  if (authEnabled() && !isAuthed()) return null;   // pas de push sans compte connecté
  try {
    const resp = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // évite le preflight CORS
      body:    JSON.stringify(body),
    });
    return await resp.json().catch(() => null);
  } catch (e) { console.warn('[Dépenses] push échoué :', e?.message || e); return null; }
}

/** Normalise une dépense venue du serveur (types cohérents). */
function _fromServer(s) {
  return {
    id: String(s.id), vehicule: String(s.vehicule || ''), date: String(s.date || ''),
    categorie: DEPENSE_CATEGORIES.includes(s.categorie) ? s.categorie : DEPENSE_CATEGORIES[0],
    intitule: String(s.intitule || ''), montant: Math.max(0, Number(s.montant) || 0),
    modifie_le: Number(s.modifie_le) || 0, supprime: Number(s.supprime) ? 1 : 0,
  };
}

/** Pousse des dépenses (déjà écrites en local) vers le Sheet. */
export function pushDepenses(items) {
  if (!items || !items.length) return;
  _post({ action: 'setDepenses', depenses: items, token: APP_TOKEN, idToken: getIdToken() });
}

/**
 * Réconciliation complète : pull serveur + LWW par `id`, applique en local les
 * lignes serveur plus récentes, pousse les lignes locales plus récentes/absentes.
 * Émet 'depenses-synced' (detail.changed = true si le local a changé).
 */
export async function syncDepenses() {
  if (!navigator.onLine) return false;
  if (authEnabled() && !isAuthed()) return false;
  let server;
  try {
    const idToken = getIdToken();
    const url = GAS_URL + '?action=getDepenses&token=' + encodeURIComponent(APP_TOKEN)
              + (idToken ? '&idToken=' + encodeURIComponent(idToken) : '');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    server = await resp.json();
  } catch (e) { console.warn('[Dépenses] sync (pull) échouée :', e?.message || e); return false; }

  const srv = {};
  (server?.depenses || []).forEach(d => { if (d && d.id != null) srv[String(d.id)] = d; });

  const local = _list();
  const byId  = {};
  local.forEach(d => { if (d && d.id != null) byId[String(d.id)] = d; });

  let changed = false;
  const toPush = [];

  Object.keys(srv).forEach(id => {
    const s = _fromServer(srv[id]);
    const l = byId[id];
    if (!l) { local.push(s); changed = true; }
    else if (s.modifie_le > (Number(l.modifie_le) || 0)) { Object.assign(l, s); changed = true; }
    else if ((Number(l.modifie_le) || 0) > s.modifie_le) { toPush.push(l); }
  });
  local.forEach(l => { if (l && l.id != null && !srv[String(l.id)]) toPush.push(l); });

  if (changed) _saveList(local);
  if (toPush.length) pushDepenses(toPush);

  try { window.dispatchEvent(new window.CustomEvent('depenses-synced', { detail: { changed } })); }
  catch { /* non bloquant */ }
  return changed;
}

/* ─── Rendu UI ─── */
const _fmtEur = n => (Math.round(n * 100) / 100).toLocaleString('fr-FR', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
}) + ' €';

function _fmtDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  return (d && m && y) ? `${d}/${m}/${y}` : (iso || '');
}

function _row(dep) {
  const li = document.createElement('li');
  li.className = 'depense-item';

  const cat = document.createElement('span');
  cat.className = 'depense-cat depense-cat-' + (dep.categorie || 'Autre').toLowerCase();
  cat.textContent = dep.categorie || 'Autre';

  const main = document.createElement('div');
  main.className = 'depense-main';
  const titre = document.createElement('span');
  titre.className = 'depense-titre';
  titre.textContent = dep.intitule || '(sans intitulé)';
  const date = document.createElement('span');
  date.className = 'depense-date';
  date.textContent = _fmtDate(dep.date);
  main.append(titre, date);

  const montant = document.createElement('span');
  montant.className = 'depense-montant';
  montant.textContent = _fmtEur(Number(dep.montant) || 0);

  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'depense-del';
  del.dataset.delId = dep.id;
  del.setAttribute('aria-label', 'Supprimer cette dépense');
  del.textContent = '🗑';

  li.append(cat, main, montant, del);
  return li;
}

/** (Re)dessine la liste des dépenses + le total pour un véhicule. */
export function renderDepenses(veh = state.currentVehiculeNom) {
  const list    = document.getElementById('depensesList');
  const totalEl = document.getElementById('depensesTotal');
  const vehLbl  = document.getElementById('depensesVehLabel');
  const addBox  = document.getElementById('depenseAdd');

  if (vehLbl) vehLbl.textContent = veh ? '— ' + veh : '— aucun véhicule sélectionné';
  if (addBox) addBox.classList.toggle('hidden', !veh);

  if (list) {
    list.innerHTML = '';
    const items = getDepenses(veh);
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'depense-empty';
      li.textContent = veh
        ? 'Aucune dépense enregistrée pour ce véhicule.'
        : 'Sélectionnez un véhicule pour saisir ses dépenses.';
      list.appendChild(li);
    } else {
      items.forEach(d => list.appendChild(_row(d)));
    }
  }
  if (totalEl) totalEl.textContent = _fmtEur(getDepensesTotal(veh));
}

function _refreshStats() {
  if (typeof window.renderStats === 'function') window.renderStats();
}

/** Câble le mini-formulaire d'ajout + la suppression (délégation). À appeler une fois. */
export function initDepensesUI() {
  const cat = document.getElementById('depCategorie');
  if (cat && !cat.options.length) {
    DEPENSE_CATEGORIES.forEach(c => cat.add(new Option(c, c)));
  }
  const dateEl = document.getElementById('depDate');
  if (dateEl && !dateEl.value) dateEl.value = todayISO();

  const addBtn = document.getElementById('depAddBtn');
  if (addBtn && addBtn.dataset.wired !== '1') {
    addBtn.dataset.wired = '1';
    addBtn.addEventListener('click', () => {
      const veh = state.currentVehiculeNom;
      if (!veh) return;
      const intituleEl = document.getElementById('depIntitule');
      const montantEl  = document.getElementById('depMontant');
      const montant = Number(montantEl?.value);
      if (!intituleEl?.value.trim() || !isFinite(montant) || montant <= 0) {
        montantEl?.focus();
        return;
      }
      const created = addDepense({
        vehicule:  veh,
        date:      dateEl?.value || todayISO(),
        categorie: cat?.value,
        intitule:  intituleEl.value,
        montant,
      });
      pushDepenses([created]);   // W91b — propage vers le Sheet
      intituleEl.value = '';
      if (montantEl) montantEl.value = '';
      if (dateEl) dateEl.value = todayISO();
      renderDepenses(veh);
      _refreshStats();   // met à jour l'économie nette / rentabilité
    });
  }

  const list = document.getElementById('depensesList');
  if (list && list.dataset.wired !== '1') {
    list.dataset.wired = '1';
    list.addEventListener('click', e => {
      const btn = e.target.closest('[data-del-id]');
      if (!btn) return;
      const removed = removeDepense(btn.dataset.delId);
      if (removed) pushDepenses([removed]);   // W91b — propage le tombstone
      renderDepenses(state.currentVehiculeNom);
      _refreshStats();
    });
  }

  renderDepenses(state.currentVehiculeNom);
}
