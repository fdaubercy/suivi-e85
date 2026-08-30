/* ─── Historique des 5 derniers pleins (via GET ?action=export) ─── */
import { GAS_URL, APP_TOKEN, FUEL_CONFIG, HIST_CACHE_KEY, HIST_SINCE_KEY, CSV_SEP_KEY } from './config.js';
import { getIdToken } from './auth.js';
import { state } from './state.js';
import { showFeedback } from './ui.js';
import { renderStationsCard } from './stationsmap.js';
import { getSectorMinForDate } from './secteur.js';   // W38 — prix mini du secteur par jour
import { brandInfo } from './brand.js';                // W65 — icône d'enseigne (+ log inconnues)

let _lastRecord  = null;   // memorise le plein le plus recent pour dupliquerDernier()
let _allRecords  = [];     // memorise TOUS les enregistrements pour validation km retrograde
let _consoByKey  = new Map();   // conso L/100 par plein (méthode plein-à-plein), cf. _consoFor
let _consoSrc    = null;        // référence de _allRecords ayant servi au dernier calcul

/* ─── Cache localStorage ─── */
function _loadCache() {
  try {
    const arr = JSON.parse(localStorage.getItem(HIST_CACHE_KEY) || '[]');
    return Array.isArray(arr) ? arr.filter(estPleinValide) : [];   // anti-fantôme (01/01/1970)
  } catch { return []; }
}
function _saveCache(records) {
  try { localStorage.setItem(HIST_CACHE_KEY, JSON.stringify(records)); } catch { /* quota / private */ }
}
function _loadSince() {
  try { return localStorage.getItem(HIST_SINCE_KEY) || null; } catch { return null; }
}
function _saveSince(ts) {
  try { localStorage.setItem(HIST_SINCE_KEY, ts); } catch { /* quota / private */ }
}

/** Clé stable d'un enregistrement, pour dédupliquer / supprimer une ligne
 *  quand le sync_id manque (plein local jamais synchronisé, doublon fantôme).
 *  Combine date + km + litres + prix + station + type normalisés. */
function _recordKey(r) {
  return [
    isoDate(r.Date || r.Horodatage),
    Number(r['Km compteur'] || 0),
    Number(r['Nb. Litres'] || 0),
    Number(r['Prix €/L'] || 0),
    String(r['Station essence'] || '').trim().toLowerCase(),
    String(r.Type || '').trim().toLowerCase(),
  ].join('|');
}

/** Anti-corruption (bug « plein au 01/01/1970 ») : écarte les lignes « fantômes »
 *  qui survivent dans le cache localStorage même après le filtre serveur (GAS
 *  `handleExport`) — soit un echo d'en-tête de l'onglet `_ImportGS` (cellule
 *  Type/sync_id contenant le libellé de colonne), soit une date epoch Unix
 *  (`new Date(0)` = 01/01/1970, issue d'une date non parsable coercée à 0). */
export function estPleinValide(r) {
  if (!r) return false;
  // Ligne d'en-tête dupliquée (echo de `_ImportGS`) renvoyée ou mise en cache
  if (String(r.sync_id || r['sync_id'] || '').trim().toLowerCase() === 'sync_id') return false;
  if (String(r.Type || '').trim().toLowerCase() === 'type') return false;
  // Date absente ou epoch Unix → enregistrement corrompu (01/01/1970)
  const raw = String(r.Date || r.Horodatage || '').trim();
  if (!raw) return false;
  const d = new Date(raw.replace(' ', 'T'));
  return !isNaN(d.getTime()) && d.getFullYear() > 1970;
}

/** Vide le cache historique et force un rechargement complet depuis le GAS. */
export async function forceRefreshHistorique() {
  try { localStorage.removeItem(HIST_CACHE_KEY); } catch { /* best-effort */ }
  try { localStorage.removeItem(HIST_SINCE_KEY); } catch { /* best-effort */ }
  _allRecords = [];
  return chargerHistorique();
}

/** Charge et affiche les 5 derniers pleins dans #historiqueList.
 *  Utilise un cache localStorage + sync différentielle (?since=) pour
 *  limiter les données téléchargées sur les chargements successifs. */
export async function chargerHistorique() {
  const el = document.getElementById('historiqueList');
  if (!el) return;

  el.innerHTML = '<div class="hist-msg">Chargement…</div>';

  try {
    const cachedRecords = _loadCache();
    const since         = _loadSince();

    // Mode différentiel si on a déjà un cache : n'envoyer que les nouveaux
    const idToken = getIdToken();   // U7 — identité du compte
    const url = GAS_URL + '?action=export'
      + (since && cachedRecords.length ? '&since=' + encodeURIComponent(since) : '')
      + '&token=' + encodeURIComponent(APP_TOKEN)   // S6
      + (idToken ? '&idToken=' + encodeURIComponent(idToken) : '');   // U7

    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();

    const incoming = data.records || [];
    let allRecords;

    if (since && cachedRecords.length) {
      // Fusion différentielle : n'ajouter que les enregistrements absents du
      // cache. Clé = sync_id si présent, SINON clé composite (date/km/litres/
      // station/type). Sans cette clé de repli, une ligne SANS sync_id était
      // ré-ajoutée à CHAQUE sync → doublon « fantôme » jamais supprimable.
      const existingIds  = new Set(
        cachedRecords.map(r => String(r.sync_id || r['sync_id'] || '')).filter(Boolean)
      );
      const existingKeys = new Set(cachedRecords.map(_recordKey));
      const newRecords = incoming.filter(r => {
        const sid = String(r.sync_id || r['sync_id'] || '');
        return sid ? !existingIds.has(sid) : !existingKeys.has(_recordKey(r));
      });
      allRecords = newRecords.length ? [...cachedRecords, ...newRecords] : cachedRecords;
    } else {
      // Chargement complet (premier démarrage ou cache absent)
      allRecords = incoming;
    }

    // S3 — suppression bidirectionnelle : purge les pleins effacés ailleurs
    // (Excel / autre client). Le serveur renvoie « deleted:[sync_id,…] ».
    const deletedIds = Array.isArray(data.deleted) ? data.deleted.map(String) : [];
    if (deletedIds.length) {
      const delSet = new Set(deletedIds);
      allRecords = allRecords.filter(
        r => !delSet.has(String(r.sync_id || r['sync_id'] || ''))
      );
    }

    // Anti-fantôme (bug 01/01/1970) : écarter les lignes d'en-tête dupliquées et
    // les dates epoch qui survivent dans le cache malgré le filtre serveur (GAS),
    // AVANT persistance et affichage.
    allRecords = allRecords.filter(estPleinValide);

    // Mettre à jour le cache et le timestamp de dernière sync
    _saveCache(allRecords);
    _saveSince(new Date().toISOString());

    if (!allRecords.length) {
      el.innerHTML = '<div class="hist-msg">Aucun plein enregistré.</div>';
      _lastRecord = null;
      _allRecords = [];
      return;
    }

    _allRecords = allRecords;

    // Tri descendant par Horodatage, puis 5 premiers
    const recent = allRecords
      .slice()
      .sort((a, b) => (b.Horodatage || '').localeCompare(a.Horodatage || ''))
      .slice(0, 5);

    _lastRecord = recent[0];
    el.innerHTML = recent.map(renderItem).join('');
    renderStationsCard();

    // W32 — Rafraîchir l'historique complet s'il est ouvert
    const fullCard = document.getElementById('histoireFullCard');
    if (fullCard && !fullCard.hidden) {
      renderFullHistory(
        document.getElementById('histVehFilter')?.value || '',
        document.getElementById('histTypeFilter')?.value || ''
      );
    }
  } catch (e) {
    // Fallback : afficher le cache local en cas d'erreur réseau
    const cached = _loadCache();
    if (cached.length) {
      _allRecords = cached;
      const recent = cached
        .slice()
        .sort((a, b) => (b.Horodatage || '').localeCompare(a.Horodatage || ''))
        .slice(0, 5);
      _lastRecord = recent[0];
      el.innerHTML = recent.map(renderItem).join('');
      renderStationsCard();
    } else {
      el.innerHTML = '<div class="hist-msg err">Erreur — ' + (e.message || 'réseau') + '</div>';
      _lastRecord = null;
      _allRecords = [];
    }
  }
}

/** Retourne tous les enregistrements GS. */
export function getAllRecords() {
  return _allRecords;
}

/** U5 — Résumé du plein le plus récent pour la tuile « reprendre » de l'accueil.
 *  Lit la mémoire vive si disponible, sinon le cache localStorage (fonctionne
 *  donc avant même le 1er chargement réseau). Retourne null si aucun plein. */
export function getLastRecordSummary() {
  let r = _lastRecord;
  if (!r) {
    const cached = _loadCache();
    if (!cached.length) return null;
    r = cached.slice().sort((a, b) => (b.Horodatage || '').localeCompare(a.Horodatage || ''))[0];
  }
  if (!r) return null;
  const litres = Number(r['Nb. Litres'] || 0);
  const prix   = Number(r['Prix €/L']   || 0);
  return {
    date:    fmtDate(r.Date || r.Horodatage),
    station: String(r['Station essence'] || '—').slice(0, 40),
    type:    String(r.Type || ''),
    litres,
    prix,
    total:   litres * prix,
  };
}

/** Retourne le km maximum enregistré pour un véhicule donné. */
export function getMaxKmForVehicule(vehiculeNom) {
  if (!_allRecords.length) return null;
  const filtered = vehiculeNom
    ? _allRecords.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === vehiculeNom)
    : _allRecords;
  if (!filtered.length) return null;
  const kms = filtered
    .map(r => Number(r['Km compteur'] || 0))
    .filter(n => isFinite(n) && n > 0);
  return kms.length ? Math.max(...kms) : null;
}

/** Pré-remplit le formulaire avec le dernier plein. */
export function dupliquerDernier() {
  if (!_lastRecord) {
    showFeedback('error', 'Rien à dupliquer', 'Chargez l\'historique d\'abord (bouton ↻).');
    return;
  }

  const r = _lastRecord;

  ['fKm', 'fLitres', 'fPrix'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.value = ''; el.classList.remove('autofilled'); }
  });

  const veh = r['Véhicule'] || r['Vehicule'] || '';
  if (veh) setSelectValue('vehiculeSel', veh);

  const label = r.Type;
  const typeKey = Object.keys(FUEL_CONFIG).find(k => FUEL_CONFIG[k].label === label);
  if (typeKey && typeof window.setType === 'function') window.setType(typeKey);

  const station = r['Station essence'];
  if (station) {
    const sel = document.getElementById('stationSel');
    if (sel) {
      const matches = Array.from(sel.options).some(o => o.value === station);
      if (matches) {
        sel.value = station;
      } else {
        sel.value = '__autre';
        const fa = document.getElementById('fAutre');
        if (fa) fa.value = station;
      }
      sel.dispatchEvent(new Event('change'));
    }
  }

  showFeedback('success', 'Plein pré-rempli ✓',
    'Vérifiez le véhicule, le type et la station — puis saisissez km / litres / prix.');
}

// ═══════════════════════════════════════
//  W32 — Historique complet + filtres
// ═══════════════════════════════════════

/** Affiche ou masque la carte historique complet. */
export function voirTout() {
  const card = document.getElementById('histoireFullCard');
  if (!card) return;

  if (!card.hidden) {
    card.hidden = true;
    return;
  }

  // Peupler le filtre véhicules
  const vehSel = document.getElementById('histVehFilter');
  if (vehSel) {
    const vehs = [...new Set(_allRecords
      .map(r => r['Véhicule'] || r['Vehicule'] || '')
      .filter(Boolean)
    )].sort();
    vehSel.innerHTML = '<option value="">Tous les véhicules</option>'
      + vehs.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
    if (state.currentVehiculeNom) vehSel.value = state.currentVehiculeNom;
  }

  // Peupler le filtre type carburant
  const typeSel = document.getElementById('histTypeFilter');
  if (typeSel) {
    const types = [...new Set(_allRecords.map(r => r.Type || '').filter(Boolean))].sort();
    typeSel.innerHTML = '<option value="">Tous les carburants</option>'
      + types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  }

  renderFullHistory(vehSel?.value || '', typeSel?.value || '');

  card.hidden = false;
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Applique les filtres véhicule/carburant et trie du plus récent au plus ancien. */
function _filteredRecords(vehFilter, typeFilter) {
  let filtered = _allRecords
    .slice()
    .sort((a, b) => (b.Horodatage || '').localeCompare(a.Horodatage || ''));
  if (vehFilter)
    filtered = filtered.filter(r => (r['Véhicule'] || r['Vehicule'] || '') === vehFilter);
  if (typeFilter)
    filtered = filtered.filter(r => (r.Type || '') === typeFilter);
  return filtered;
}

/** Génère la liste filtrée dans #histoireFullList. */
export function renderFullHistory(vehFilter, typeFilter) {
  const listEl  = document.getElementById('histoireFullList');
  const countEl = document.getElementById('histFullCount');
  if (!listEl) return;

  if (!_allRecords.length) {
    listEl.innerHTML = '<div class="hist-msg">Aucun plein enregistré.</div>';
    if (countEl) countEl.textContent = '';
    return;
  }

  const filtered = _filteredRecords(vehFilter, typeFilter);

  if (!filtered.length) {
    listEl.innerHTML = '<div class="hist-msg">Aucun plein correspondant au filtre.</div>';
    if (countEl) countEl.textContent = '';
    return;
  }

  if (countEl) countEl.textContent = filtered.length + ' plein' + (filtered.length > 1 ? 's' : '');
  listEl.innerHTML = filtered.map(renderItem).join('');
}

/**
 * W32 — Câble les filtres et le bouton fermer de l'historique complet.
 * Appelée une seule fois depuis main.js.
 */
export function initHistoireFilters() {
  document.getElementById('histVehFilter')?.addEventListener('change', () => {
    renderFullHistory(
      document.getElementById('histVehFilter').value,
      document.getElementById('histTypeFilter')?.value || ''
    );
  });
  document.getElementById('histTypeFilter')?.addEventListener('change', () => {
    renderFullHistory(
      document.getElementById('histVehFilter')?.value || '',
      document.getElementById('histTypeFilter').value
    );
  });
  document.getElementById('histFullCloseBtn')?.addEventListener('click', () => {
    const card = document.getElementById('histoireFullCard');
    if (card) card.hidden = true;
  });
}

/* ═══════════════════════════════════════
   W25 / W54 — Export CSV de l'historique
   (vue filtrée OU tout l'historique · séparateur ; ou , au choix)
   ═══════════════════════════════════════ */

const CSV_COLS = [
  ['Date',          r => isoDate(r.Date || r.Horodatage)],
  ['Horodatage',    r => String(r.Horodatage || '')],
  ['Véhicule',      r => r['Véhicule'] || r['Vehicule'] || ''],
  ['Type',          r => r.Type || ''],
  ['Km compteur',   (r, dc) => _num(r['Km compteur'], dc)],
  ['Litres',        (r, dc) => _num(r['Nb. Litres'], dc)],
  ['Prix €/L',      (r, dc) => _num(r['Prix €/L'], dc)],
  ['Total €',       (r, dc) => _num(((Number(r['Nb. Litres']) || 0) * (Number(r['Prix €/L']) || 0)).toFixed(2), dc)],
  ['Station',       r => r['Station essence'] || ''],
];

/**
 * Nombre pour CSV.
 *  decimalComma=true  → virgule décimale (Excel FR, séparateur ';')
 *  decimalComma=false → point décimal (tableurs anglo-saxons, séparateur ',')
 * Retourne '' si vide.
 */
function _num(v, decimalComma) {
  const n = Number(v);
  const raw = (!isFinite(n) || n === 0)
    ? (v == null || v === '' ? '' : String(v))
    : String(n);
  return decimalComma ? raw.replace('.', ',') : raw;
}

/** Échappe une cellule CSV (guillemets si séparateur, guillemet ou saut de ligne). */
function _csvCell(v, sep) {
  const s = String(v == null ? '' : v);
  const re = new RegExp('["\\n\\r' + sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ']');
  return re.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Construit le contenu CSV (sans BOM) à partir d'une liste d'enregistrements.
 * @param {Array} records
 * @param {string} [sep=';'] séparateur de colonnes (';' Excel FR, ',' anglo)
 * Quand sep=',', les décimales utilisent le point (sinon ambiguïté avec la virgule).
 */
export function buildHistoriqueCSV(records, sep = ';') {
  const decimalComma = sep !== ',';
  const header = CSV_COLS.map(c => _csvCell(c[0], sep)).join(sep);
  const lines = records.map(r => CSV_COLS.map(c => _csvCell(c[1](r, decimalComma), sep)).join(sep));
  return [header, ...lines].join('\r\n');
}

/** Séparateur CSV choisi dans l'UI (#csvSepSel), défaut ';' (Excel FR). */
function _csvSep() {
  const v = document.getElementById('csvSepSel')?.value;
  return v === ',' ? ',' : ';';
}

/** Génère le Blob CSV et déclenche le téléchargement (BOM UTF-8). */
function _downloadCSV(records, suffix) {
  const csv = '﻿' + buildHistoriqueCSV(records, _csvSep());
  const stamp = isoDate(new Date().toISOString());
  const name = `suivi-conso-carburant-historique${suffix ? '-' + suffix : ''}-${stamp}.csv`;
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showFeedback('success', 'Export CSV ✓', `${records.length} plein(s) exporté(s) — ${name}`);
  } catch (e) {
    showFeedback('error', 'Export impossible', e.message || 'erreur navigateur');
  }
}

/**
 * W25 — Exporte la vue filtrée courante de l'historique complet en .csv.
 * Lit les filtres véhicule/carburant actifs + le séparateur choisi (W54).
 */
export function exportHistoriqueCSV() {
  if (!_allRecords.length) {
    showFeedback('error', 'Rien à exporter', 'Chargez l\'historique d\'abord (bouton ↻).');
    return;
  }
  const vehFilter  = document.getElementById('histVehFilter')?.value || '';
  const typeFilter = document.getElementById('histTypeFilter')?.value || '';
  const records = _filteredRecords(vehFilter, typeFilter);
  if (!records.length) {
    showFeedback('error', 'Aucun plein', 'Aucun enregistrement ne correspond aux filtres actifs.');
    return;
  }
  _downloadCSV(records, 'filtre');
}

/**
 * W54 — Exporte TOUT l'historique (sans tenir compte des filtres), trié du
 * plus récent au plus ancien. Séparateur choisi via #csvSepSel.
 */
export function exportHistoriqueAllCSV() {
  if (!_allRecords.length) {
    showFeedback('error', 'Rien à exporter', 'Chargez l\'historique d\'abord (bouton ↻).');
    return;
  }
  const records = _allRecords
    .slice()
    .sort((a, b) => (b.Horodatage || '').localeCompare(a.Horodatage || ''));
  _downloadCSV(records, 'complet');
}

/** W54 — Persiste le choix de séparateur CSV (#csvSepSel) et le restaure. */
export function initCsvSepSetting() {
  const el = document.getElementById('csvSepSel');
  if (!el) return;
  try {
    const saved = localStorage.getItem(CSV_SEP_KEY);
    if (saved === ',' || saved === ';') el.value = saved;
  } catch { /* navigation privée */ }
  el.addEventListener('change', () => {
    try { localStorage.setItem(CSV_SEP_KEY, el.value === ',' ? ',' : ';'); }
    catch { /* quota */ }
  });
}

/* ═══════════════════════════════════════
   W26 — Web Share API
   ═══════════════════════════════════════ */

/**
 * Câble le bouton "Partager" sur les entrées historique (délégation d'événements).
 * Si l'API navigator.share n'est pas disponible, masque tous les boutons via CSS.
 */
export function initHistoireShare() {
  if (!('share' in navigator)) {
    document.body.classList.add('no-share');
    return;
  }

  const handler = async (e) => {
    const btn = e.target.closest('.hist-share');
    if (!btn) return;
    const { shareLitres, sharePrix, shareStation, shareDate, shareType } = btn.dataset;
    try {
      await navigator.share({
        title: 'Plein carburant',
        text:  `${shareType} · ${shareLitres} L à ${sharePrix} €/L — ${shareStation} (${shareDate})`,
      });
    } catch (err) {
      if (err.name !== 'AbortError') console.warn('Share failed:', err);
    }
  };

  document.getElementById('historiqueList')?.addEventListener('click', handler);
  document.getElementById('histoireFullList')?.addEventListener('click', handler);
}

/* ═══════════════════════════════════════
   Suppression d'un plein (UI + GoogleSheet)
   ═══════════════════════════════════════ */

/** Réaffiche les 5 derniers pleins + l'historique complet ouvert. */
function _renderLists() {
  const el = document.getElementById('historiqueList');
  if (el) {
    if (!_allRecords.length) {
      el.innerHTML = '<div class="hist-msg">Aucun plein enregistré.</div>';
      _lastRecord = null;
    } else {
      const recent = _allRecords
        .slice()
        .sort((a, b) => (b.Horodatage || '').localeCompare(a.Horodatage || ''))
        .slice(0, 5);
      _lastRecord = recent[0];
      el.innerHTML = recent.map(renderItem).join('');
    }
  }
  renderStationsCard();

  const fullCard = document.getElementById('histoireFullCard');
  if (fullCard && !fullCard.hidden) {
    renderFullHistory(
      document.getElementById('histVehFilter')?.value || '',
      document.getElementById('histTypeFilter')?.value || ''
    );
  }
}

/**
 * Câble le bouton "Supprimer" 🗑️ sur les entrées historique (délégation d'événements).
 * Confirme, supprime la ligne dans le GoogleSheet (action=deletePlein via sync_id),
 * puis retire l'enregistrement du cache et réaffiche les listes.
 */
export function initHistoireDelete() {
  const handler = async (e) => {
    const btn = e.target.closest('.hist-delete');
    if (!btn) return;

    const sid    = String(btn.dataset.syncId || '');
    const rowKey = String(btn.dataset.rowKey || '');

    if (!window.confirm('Supprimer définitivement ce plein ?\nCette action est irréversible.')) return;

    // Plein SANS sync_id : ligne purement locale (jamais synchronisée, ou doublon
    // fantôme du cache). Le serveur ne la connaît pas → purge locale immédiate
    // (sinon la poubelle resterait sans effet — bug signalé).
    if (!sid) {
      _allRecords = _allRecords.filter(r => _recordKey(r) !== rowKey);
      _saveCache(_allRecords);
      _renderLists();
      showFeedback('success', 'Plein retiré ✓', 'Doublon local supprimé de cet appareil.');
      return;
    }

    btn.disabled = true;
    try {
      const resp = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'deletePlein', sync_id: sid, token: APP_TOKEN, idToken: getIdToken() }),
        redirect: 'follow',
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const result = await resp.json().catch(() => ({}));
      if (result && result.success === false) {
        throw new Error(result.error || 'suppression refusée');
      }

      _allRecords = _allRecords.filter(r => String(r.sync_id || '') !== sid);
      _saveCache(_allRecords);
      _renderLists();
      showFeedback('success', 'Plein supprimé ✓', 'L\'enregistrement a été retiré.');
    } catch (err) {
      btn.disabled = false;
      showFeedback('error', 'Suppression échouée', err.message || 'erreur réseau');
    }
  };

  document.getElementById('historiqueList')?.addEventListener('click', handler);
  document.getElementById('histoireFullList')?.addEventListener('click', handler);
}

/* ─── Helpers ─── */
function setSelectValue(id, value) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const matches = Array.from(sel.options).some(o => o.value === value);
  if (matches) {
    sel.value = value;
    sel.dispatchEvent(new Event('change'));
  }
}

/* ─── Conso L/100 km par plein (méthode plein-à-plein) — fonction pure/testable ───
   conso = litres du plein courant / (km courant − km du plein précédent du MÊME
   véhicule) × 100. Le 1er plein d'un véhicule n'a pas de prédécesseur → pas de conso.
   Bornée à [1 ; 60] pour écarter les valeurs aberrantes (pleins partiels, saisie
   manquante, remise à zéro du compteur). Indépendante du type de carburant :
   les litres du plein courant compensent ce qui a été consommé depuis le précédent.
   Renvoie une Map(record → conso) keyée par IDENTITÉ d'objet (les mêmes références
   circulent de _allRecords vers renderItem). */
export function computeConsoByFill(records) {
  const map = new Map();
  const byVeh = {};
  records.forEach(r => {
    const v = r['Véhicule'] || r['Vehicule'] || '';
    (byVeh[v] || (byVeh[v] = [])).push(r);
  });
  Object.values(byVeh).forEach(list => {
    const sorted = list
      .filter(r => Number(r['Km compteur'] || 0) > 0)
      .sort((a, b) => {
        const da = new Date(String(a.Date || a.Horodatage || '').replace(' ', 'T'));
        const db = new Date(String(b.Date || b.Horodatage || '').replace(' ', 'T'));
        return da - db;
      });
    for (let i = 1; i < sorted.length; i++) {
      const dk  = Number(sorted[i]['Km compteur'] || 0) - Number(sorted[i - 1]['Km compteur'] || 0);
      const lit = Number(sorted[i]['Nb. Litres'] || 0);
      if (dk > 0 && lit > 0) {
        const conso = (lit / dk) * 100;
        if (conso >= 1 && conso <= 60) map.set(sorted[i], conso);
      }
    }
  });
  return map;
}

/** Conso L/100 d'un plein (undefined si non calculable). Recalcule la map une
 *  seule fois par changement de _allRecords (comparaison de référence). */
function _consoFor(r) {
  if (_consoSrc !== _allRecords) { _consoByKey = computeConsoByFill(_allRecords); _consoSrc = _allRecords; }
  return _consoByKey.get(r);
}

function renderItem(r) {
  const icon    = iconForType(r.Type);
  const date    = fmtDate(r.Date || r.Horodatage);
  const km      = fmtKm(r['Km compteur']);
  const litres  = Number(r['Nb. Litres'] || 0).toFixed(2);
  const prix    = Number(r['Prix €/L']   || 0).toFixed(3);
  const total   = (Number(litres) * Number(prix)).toFixed(2);
  const station = String(r['Station essence'] || '—').slice(0, 40);
  const brand   = brandInfo(r['Station essence']);   // W65 — icône enseigne (+ log inconnues)
  const type    = escapeHtml(r.Type || '');
  const syncId  = String(r.sync_id || '');
  const rowKey  = _recordKey(r);
  const secteur = sectorDeltaHtml(r);   // W38 — écart vs moins cher du secteur
  const conso   = _consoFor(r);         // conso L/100 km du plein (plein-à-plein)
  const consoHtml = (conso != null)
    ? ` · <span class="hist-conso" title="Consommation depuis le plein précédent (${conso.toFixed(1)} L/100 km)">${conso.toFixed(1)} L/100</span>`
    : '';

  // Poubelle rendue pour TOUTES les lignes : avec sync_id → suppression serveur ;
  // sans sync_id (plein local / doublon fantôme) → purge locale du cache.
  const deleteBtn =
    `<button class="hist-delete" type="button"
        data-sync-id="${escapeHtml(syncId)}"
        data-row-key="${escapeHtml(rowKey)}"
        aria-label="Supprimer ce plein">🗑️</button>`;

  return `
    <div class="hist-item">
      <div class="hist-row1">
        <span class="hist-icon">${icon}</span>
        <span class="hist-date">${date}</span>
        <span class="hist-total">${total} €</span>
        <button class="hist-share" type="button"
          data-share-litres="${litres}"
          data-share-prix="${prix}"
          data-share-station="${escapeHtml(station)}"
          data-share-date="${date}"
          data-share-type="${type}"
          aria-label="Partager ce plein">📤</button>
        ${deleteBtn}
      </div>
      <div class="hist-row2">
        <span>${litres} L · ${prix} €/L</span>
        <span class="hist-km">${km} km${consoHtml}</span>
      </div>
      <div class="hist-row3">
        <img class="brand-ico" src="${escapeHtml(brand.icon)}" alt="${escapeHtml(brand.label || 'Station')}" width="18" height="18" loading="lazy" decoding="async">
        <span>${escapeHtml(station)}</span>
      </div>
      ${secteur}
    </div>
  `;
}

/* ─── W38 — date ISO (yyyy-mm-dd) d'un enregistrement ─── */
function isoDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d)) return String(s).slice(0, 10);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

/* ─── W38 — ligne « payé X €/L de plus que le moins cher du secteur ce jour-là » ───
   Affichée uniquement pour les pleins E85, quand le snapshot du secteur du jour
   existe (relevé quotidien ~7h) et que le prix payé dépasse le mini du secteur. */
function sectorDeltaHtml(r) {
  const t = String(r.Type || '').toLowerCase();
  const isE85 = t.includes('e85') || t.includes('ethanol');
  if (!isE85) return '';

  const paid = Number(r['Prix €/L'] || 0);
  if (!isFinite(paid) || paid <= 0) return '';

  const min = getSectorMinForDate(isoDate(r.Date || r.Horodatage));
  if (min == null || !isFinite(min) || min <= 0) return '';

  const delta = paid - min;
  if (delta > 0.0005) {
    return `<div class="hist-secteur over">💸 +${delta.toFixed(3)} €/L vs le moins cher du secteur (${min.toFixed(3)} €/L)</div>`;
  }
  // Payé au prix du secteur (ou mieux) → petit encouragement
  return `<div class="hist-secteur best">✅ Au meilleur prix du secteur (${min.toFixed(3)} €/L)</div>`;
}

/** W38 — Re-rend les listes d'historique (sans refetch), p.ex. quand les
 *  prix secteur viennent d'arriver. */
export function rerenderHistorique() {
  if (_allRecords.length) _renderLists();
}

function iconForType(type) {
  if (!type) return '⛽';
  const t = String(type).toLowerCase();
  if (t.includes('e85') || t.includes('ethanol')) return '🌿';
  if (t.includes('98'))                            return '💧';
  if (t.includes('e10'))                           return '🟢';
  if (t.includes('95'))                            return '🔵';
  if (t.includes('gazole') || t.includes('diesel')) return '⚫';
  if (t.includes('gpl'))                            return '🟡';
  return '⛽';
}

function fmtDate(s) {
  if (!s) return '—';
  const d = new Date(String(s).replace(' ', 'T'));
  if (isNaN(d)) return String(s).slice(0, 10);
  return [
    String(d.getDate()).padStart(2, '0'),
    String(d.getMonth() + 1).padStart(2, '0'),
    d.getFullYear()
  ].join('/');
}

function fmtKm(km) {
  const n = Number(km);
  if (!isFinite(n)) return '—';
  return n.toLocaleString('fr-FR');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
