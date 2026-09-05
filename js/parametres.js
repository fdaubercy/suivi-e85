/* ═══════════════════════════════════════════════════════════════════════
   parametres.js — Synchronisation des paramètres MÉTIER (P1)

   Source de vérité unique : onglet « Parametres » du Google Sheet
   (table clé / valeur / modifie_le). Les mêmes paramètres sont éditables
   dans l'app web ET dans le classeur Excel local ; la synchro résout les
   conflits par **last-write-wins** sur un horodatage epoch (ms), clé par clé.

   Périmètre (métier uniquement — pas les préférences d'affichage locales) :
     kit_prix · budget_mensuel · objectif_co2 · surconso
     seuil_E85/GAZOLE/SP98 (+ _enabled)
   Les véhicules conservent leur propre mécanisme (onglet « Vehicules »).

   Flux :
     • Au démarrage (et sur demande) : syncParametres() — pull serveur,
       réconciliation LWW, push des clés localement plus récentes.
     • À chaque édition utilisateur : pushParam(cle) — horodate + envoie.
   ═══════════════════════════════════════════════════════════════════════ */

import { GAS_URL, APP_TOKEN, KIT_PRIX_KEY, BUDGET_KEY, CO2_OBJECTIF_KEY,
         SURCONSO_KEY, PARAMS_META_KEY,
         COUT_POSE_KEY, COUT_CARTEGRISE_KEY, COUT_ENTRETIEN_KEY,
         SURCOUT_ASSURANCE_KEY, AIDE_DEDUITE_KEY,
         CARBURANT_REF_KEY, ECART_REF_KEY, PROJ_NB_RECENTS_KEY,
         CONSO_DIESEL_REF_KEY, VEHICULE_DIESEL_REF_KEY, CONV_BY_VEH_KEY } from './config.js';
import { getIdToken, isAuthed, authEnabled, getUser, signOut } from './auth.js';

/* Mapping clé Sheet ↔ clé localStorage.
   kind : 'num'  → valeur numérique (chaîne) ; absente = non définie
          'bool' → '1' présent = activé ; clé absente = désactivé (0)
          'str'  → chaîne libre (ex. carburant de référence) */
const DEFS = [
  { cle: 'kit_prix',            local: KIT_PRIX_KEY,           kind: 'num'  },
  { cle: 'budget_mensuel',      local: BUDGET_KEY,             kind: 'num'  },
  { cle: 'objectif_co2',        local: CO2_OBJECTIF_KEY,       kind: 'num'  },
  { cle: 'surconso',            local: SURCONSO_KEY,           kind: 'num'  },
  { cle: 'seuil_E85',           local: 'notif_E85_seuil',      kind: 'num'  },
  { cle: 'seuil_GAZOLE',        local: 'notif_GAZOLE_seuil',   kind: 'num'  },
  { cle: 'seuil_SP98',          local: 'notif_SP98_seuil',     kind: 'num'  },
  { cle: 'seuil_E85_enabled',   local: 'notif_E85_enabled',    kind: 'bool' },
  { cle: 'seuil_GAZOLE_enabled', local: 'notif_GAZOLE_enabled', kind: 'bool' },
  { cle: 'seuil_SP98_enabled',  local: 'notif_SP98_enabled',   kind: 'bool' },
  // X67/X68/X69 — rentabilité honnête (partagés avec Excel N6:N14)
  { cle: 'cout_pose',           local: COUT_POSE_KEY,          kind: 'num'  },
  { cle: 'cout_carte_grise',    local: COUT_CARTEGRISE_KEY,    kind: 'num'  },
  { cle: 'cout_entretien',      local: COUT_ENTRETIEN_KEY,     kind: 'num'  },
  { cle: 'surcout_assurance',   local: SURCOUT_ASSURANCE_KEY,  kind: 'num'  },
  { cle: 'aide_deduite',        local: AIDE_DEDUITE_KEY,       kind: 'num'  },
  { cle: 'ecart_ref',           local: ECART_REF_KEY,          kind: 'num'  },
  { cle: 'proj_nb_recents',     local: PROJ_NB_RECENTS_KEY,    kind: 'num'  },
  { cle: 'carburant_ref',       local: CARBURANT_REF_KEY,      kind: 'str'  },
  // Comparaison E85 vs diesel — véhicule diesel de référence + conso de repli.
  { cle: 'conso_diesel_ref',    local: CONSO_DIESEL_REF_KEY,   kind: 'num'  },
  { cle: 'vehicule_diesel_ref', local: VEHICULE_DIESEL_REF_KEY, kind: 'str' },
  // W91d — coûts de conversion PAR VÉHICULE (map JSON) synchronisés cross-appareils.
  // Blob opaque (LWW sur l'ensemble) : petite map éditée rarement.
  { cle: 'conversion_veh',      local: CONV_BY_VEH_KEY,        kind: 'str' },
];
const DEF_BY_CLE  = Object.fromEntries(DEFS.map(d => [d.cle, d]));
/** Clés métier exposées (utilisé par les modules appelants). */
export const PARAM_CLES = DEFS.map(d => d.cle);
/** clé localStorage → clé Sheet (pour pushParam déclenché par les setters). */
export const LOCAL_TO_CLE = Object.fromEntries(DEFS.map(d => [d.local, d.cle]));

/* ─── Horodatages locaux (méta) ──────────────────────────────────────── */
function _meta() {
  try { return JSON.parse(localStorage.getItem(PARAMS_META_KEY) || '{}') || {}; }
  catch { return {}; }
}
function _saveMeta(m) {
  try { localStorage.setItem(PARAMS_META_KEY, JSON.stringify(m)); } catch { /* quota */ }
}

/* ─── Lecture / écriture de la valeur locale normalisée ──────────────── */
/** Valeur locale normalisée : nombre (num), 0|1 (bool), ou null si non définie. */
function _readLocal(cle) {
  const d = DEF_BY_CLE[cle]; if (!d) return null;
  const raw = localStorage.getItem(d.local);
  if (d.kind === 'bool') return raw === '1' ? 1 : 0;
  if (raw == null || raw === '') return null;
  if (d.kind === 'str') return raw;
  const n = Number(raw);
  return isFinite(n) ? n : null;
}
/** Écrit une valeur venue du serveur dans le localStorage selon le type. */
function _writeLocal(cle, valeur) {
  const d = DEF_BY_CLE[cle]; if (!d) return;
  if (d.kind === 'bool') {
    if (Number(valeur) === 1) localStorage.setItem(d.local, '1');
    else                      localStorage.removeItem(d.local);
    return;
  }
  if (d.kind === 'str') {
    if (valeur == null || valeur === '') localStorage.removeItem(d.local);
    else localStorage.setItem(d.local, String(valeur));
    return;
  }
  const n = Number(valeur);
  if (valeur === '' || valeur == null || !isFinite(n)) localStorage.removeItem(d.local);
  else localStorage.setItem(d.local, String(n));
}

/* ─── Envoi vers le serveur ──────────────────────────────────────────── */
async function _post(params) {
  if (!params.length) return;
  if (authEnabled() && !isAuthed()) return;   // U7 — pas de push de réglages sans compte connecté
  try {
    await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // évite le preflight CORS
      body:    JSON.stringify({ action: 'setParametres', params, token: APP_TOKEN, idToken: getIdToken() }),
    });
  } catch (e) { console.warn('[Paramètres] push échoué :', e?.message || e); }
}

/**
 * pushParam — à appeler APRÈS qu'un setter a modifié le localStorage.
 * Horodate la clé (now) puis pousse la valeur courante vers le Sheet.
 * Accepte une clé Sheet ('kit_prix') ou une clé localStorage ('notif_E85_seuil').
 */
export function pushParam(cleOrLocal) {
  const cle = DEF_BY_CLE[cleOrLocal] ? cleOrLocal : LOCAL_TO_CLE[cleOrLocal];
  if (!cle) return;
  const ts = Date.now();
  const m = _meta(); m[cle] = ts; _saveMeta(m);
  const valeur = _readLocal(cle);
  _post([{ cle, valeur: valeur == null ? '' : valeur, modifie_le: ts }]);
}

/** Variante groupée (ex. activation d'une alerte = enabled + seuil). */
export function pushParams(clesOrLocals) {
  const now = Date.now();
  const m = _meta();
  const params = [];
  clesOrLocals.forEach(k => {
    const cle = DEF_BY_CLE[k] ? k : LOCAL_TO_CLE[k];
    if (!cle) return;
    m[cle] = now;
    const valeur = _readLocal(cle);
    params.push({ cle, valeur: valeur == null ? '' : valeur, modifie_le: now });
  });
  _saveMeta(m);
  _post(params);
}

/**
 * syncParametres — réconciliation complète au démarrage / sur demande.
 * 1. GET getParametres → état serveur.
 * 2. Pour chaque clé : la plus récente (serveur vs local) gagne.
 * 3. Pousse les clés locales plus récentes que le serveur.
 * Émet l'événement 'parametres-synced' (detail.changed = clés appliquées
 * localement) pour que l'UI se rafraîchisse.
 * @returns {Promise<string[]>} clés dont la valeur locale a changé.
 */
export async function syncParametres() {
  if (!navigator.onLine) return [];
  if (authEnabled() && !isAuthed()) return [];   // U7 — pas de sync des réglages sans compte connecté
  let server;
  try {
    const idToken = getIdToken();
    const url  = GAS_URL + '?action=getParametres&token=' + encodeURIComponent(APP_TOKEN)
               + (idToken ? '&idToken=' + encodeURIComponent(idToken) : '');
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    server = await resp.json();
  } catch (e) {
    console.warn('[Paramètres] sync (pull) échouée :', e?.message || e);
    return [];
  }

  const srvMap = {};
  (server?.params || []).forEach(p => {
    if (DEF_BY_CLE[p.cle]) srvMap[p.cle] = { valeur: p.valeur, ts: Number(p.modifie_le) || 0 };
  });

  const meta    = _meta();
  const changed = [];
  const toPush  = [];

  DEFS.forEach(d => {
    const cle = d.cle;
    const srv = srvMap[cle];
    const lts = Number(meta[cle]) || 0;
    if (srv) {
      if (srv.ts > lts) {                 // serveur plus récent → applique en local
        _writeLocal(cle, srv.valeur);
        meta[cle] = srv.ts;
        changed.push(cle);
      } else if (lts > srv.ts) {          // local plus récent → à pousser
        toPush.push({ cle, valeur: _readLocal(cle) ?? '', modifie_le: lts });
      }
    } else {                              // absent du serveur
      const lv = _readLocal(cle);
      if (lts > 0 && lv != null) toPush.push({ cle, valeur: lv, modifie_le: lts });
    }
  });

  _saveMeta(meta);
  if (toPush.length) _post(toPush);

  try { window.dispatchEvent(new window.CustomEvent('parametres-synced', { detail: { changed } })); }
  catch { /* non bloquant */ }
  return changed;
}

/* ─── U7 — Suppression de compte (RGPD) ──────────────────────────────────
   Câble le bouton « Supprimer mon compte » de ⚙️ Réglages et affiche l'email
   connecté. La suppression purge le serveur (action=deleteAccount), vide le
   stockage local, déconnecte et recharge l'application. */
export function initCompteUI() {
  const emailP = document.getElementById('compteEmail');
  const u = getUser();
  if (emailP) emailP.textContent = u ? 'Connecté : ' + u.email : '';

  const btn = document.getElementById('deleteAccountBtn');
  if (!btn || btn.dataset.wired === '1') return;
  btn.dataset.wired = '1';
  btn.addEventListener('click', async () => {
    if (!isAuthed()) return;
    if (!confirm('Supprimer définitivement votre compte et TOUTES vos données '
      + '(pleins, réglages, alertes) ?\n\nCette action est irréversible.')) return;
    btn.disabled = true;
    try {
      const resp = await fetch(GAS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ action: 'deleteAccount', token: APP_TOKEN, idToken: getIdToken() }),
      });
      const r = await resp.json().catch(() => ({}));
      if (r && r.success) {
        try { localStorage.clear(); } catch { /* ignore */ }
        signOut();
        alert('Votre compte et vos données ont été supprimés.');
        window.location.reload();
      } else {
        btn.disabled = false;
        alert('Suppression impossible : ' + (r.error || 'erreur serveur') + '.');
      }
    } catch {
      btn.disabled = false;
      alert('Suppression impossible (problème réseau).');
    }
  });
}
