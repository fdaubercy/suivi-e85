// ============================================================
//  SUIVI CONSO E85 — Web App Backend               v3.8.0.0
//
//  v3.8.0.0 — S3 / S5 Sync : suppression bidirectionnelle + conflits
//  ⚠️ Nécessite un REDÉPLOIEMENT de la Web App (nouvelle version).
//  • Schéma _ImportGS étendu : col Q « Modifié_le » (S5, horodatage de
//    dernière modif) et col R « Supprimé » (S3, tombstone soft-delete).
//    ensureSyncColumns_() ajoute les en-têtes manquants automatiquement.
//  • S3 — action=deletePlein devient un SOFT-delete (pose le tombstone
//    col R au lieu de supprimer la ligne) ; nouvelle action=bulkDelete
//    (ids[]) pour les suppressions venues d'Excel. handleExport exclut
//    les lignes supprimées de « records » et renvoie « deleted:[…] »
//    (placé AVANT records) pour que les autres clients effacent leur copie.
//  • S5 — handleBulkUpdate arbitre par horodatage : une MAJ Excel n'écrase
//    GS que si row.modifiedAt >= col Q existante (sinon le serveur, plus
//    récent, gagne). Tout enregistrement/MAJ pose col Q.
//
//  v3.7.0.0 — S12 Endpoint stats pré-agrégé
//  • action=stats[&veh=&year=] : agrégats mensuels (coût/litres/CO₂),
//    KPIs annuels (pleins/litres/€/km/station) et comparatif véhicules,
//    calculés côté serveur et mis en cache CacheService ~1 h. Consommé
//    par le client (W59, js/statsApi.js) pour un démarrage plus rapide.
//    ⚠️ Nécessite un redéploiement de la Web App (nouvelle version).
//
//  v3.6.0.0 — S6 Token secret (souple) + W38 prix secteur
//  • S6 : si la propriété de script APP_TOKEN est définie, toute requête
//    de données (doPost + doGet?action=…) doit fournir le même token
//    (?token= en GET, "token" dans le JSON en POST). Si APP_TOKEN n'est
//    pas définie → aucun contrôle (rétrocompatible). La page HTML reste
//    toujours servie sans token.
//  • W38 : action=saveLastGeo (mémorise la dernière position connue côté
//    serveur, propriété LAST_GEO) + action=sectorPrices (renvoie le prix
//    E85 mini du secteur par jour, calculé depuis _PrixHistory, et le
//    meilleur prix du jour SECTOR_BEST_TODAY). Le snapshot quotidien est
//    produit par refreshPrixCarburants() (RefreshPrix.gs, ~7h).
//
//  ⚠️  BREAKING CHANGE v2.3.0.0 : suppression colonne G "Prix S98 jour"
//  La colonne K "SP98 station (€/L)" est désormais la seule source SP98.
//  → exécuter migrateRemoveS98() une fois pour migrer les données.
//
//  W17 — Scan ticket de caisse (v3.1.0.1 : modèle Gemini 2.5 Flash) :
//  Moteur principal = Gemini 2.5 Flash (vision) via action=scanTicket.
//  Fallback côté client = Tesseract.js (hors-ligne ou si Gemini échoue).
//  Configurer la clé Gemini dans : Extensions → Apps Script
//  → Paramètres du projet → Propriétés de script → GEMINI_API_KEY
//  Clé gratuite : https://aistudio.google.com (1 500 req/jour)
//
//  v2.9.0.0 — Sync bidirectionnel complet (Excel ↔ GS)
//  Nouveau : action=bulkUpdate — upsert par sync_id depuis Excel VBA
//    • Ligne trouvée par sync_id → MAJ cols B–N (préserve col A horodatage)
//    • Ligne absente du GS      → ajout (upsert)
//    • Retourne { status:'ok', updated:N, added:M }
//
//  v2.15.0.0 — Sync différentielle
//  ?action=export&since=ISO_TIMESTAMP → retourne uniquement les lignes
//  dont l'Horodatage (col A) est >= since ; null si since absent.
//
//  v2.16.0.0 — Rate limiting (S7)
//  rateLimit(cid) : max 10 req/min par client (CacheService, TTL 90s).
//  Appliqué sur l'enregistrement d'un plein (doPost principal).
// ============================================================
const SPREADSHEET_ID    = '1uN170kt_n45sBRwqs2krTYfhapU3dMKjTguD-qSUqCE';
const SHEET_NAME        = '_ImportGS';
const STATIONS_SHEET    = 'Stations';
const VEHICULES_SHEET   = 'Vehicules';
const PARAMS_SHEET      = 'Parametres';   // P1 — paramètres métier partagés app ⇆ Excel
const TICKET_FOLDER_NAME = 'Suivi E85 - Tickets';

// P1 — clés métier autorisées dans l'onglet Parametres (filtre anti-pollution).
// Source de vérité unique synchronisée par horodatage (last-write-wins par clé).
const PARAM_KEYS = [
  'kit_prix', 'budget_mensuel', 'objectif_co2', 'surconso',
  'seuil_E85', 'seuil_GAZOLE', 'seuil_SP98',
  'seuil_E85_enabled', 'seuil_GAZOLE_enabled', 'seuil_SP98_enabled',
  // X67/X68/X69 — rentabilité honnête (partagés avec Excel N6:N14)
  'cout_pose', 'cout_carte_grise', 'cout_entretien', 'surcout_assurance',
  'aide_deduite', 'carburant_ref', 'ecart_ref', 'proj_nb_recents',
  // W89 — comparaison E85 vs diesel (carburant de référence Gazole)
  'conso_diesel_ref', 'vehicule_diesel_ref',
  // W91d — coûts de conversion par véhicule (blob JSON, LWW sur l'ensemble)
  'conversion_veh'
];

// U7 — colonne « email » de l'onglet Parametres (multi-utilisateur). En DERNIÈRE
// position (D) pour préserver la lecture Excel/PowerQuery des colonnes A:C.
//   A cle · B valeur · C modifie_le · D email
const IDX_PARAM_EMAIL = 3;   // 0-based (colonne D)

// W91 — Dépenses d'entretien PAR VÉHICULE (synchro par ligne, LWW sur `id`).
//   A id · B vehicule · C date · D categorie · E intitule · F montant
//   G modifie_le · H supprime · I email
// email en DERNIÈRE colonne (I) pour préserver la lecture Excel/PowerQuery A:H.
const DEPENSES_SHEET  = 'Depenses';
const DEP_HEADERS     = ['id', 'vehicule', 'date', 'categorie', 'intitule', 'montant', 'modifie_le', 'supprime', 'email'];
const IDX_DEP_EMAIL   = 8;   // 0-based (colonne I)

const HEADERS = [
  'Horodatage', 'Date', 'Type', 'Km compteur',         // A B C D
  'Nb. Litres', 'Prix €/L', 'Station essence',         // E F G
  'Véhicule',                                           // H
  'E85 station (€/L)', 'SP98 station (€/L)',           // I J
  'SP95 station (€/L)', 'E10 station (€/L)',           // K L
  'Gazole station (€/L)', 'GPLc station (€/L)',        // M N
  'sync_id',                                            // O — identifiant unique
  'Photo ticket',                                       // P — URL Drive photo ticket
  'Modifié_le',                                         // Q — S5 horodatage derniere modif (ISO)
  'Supprimé',                                           // R — S3 tombstone soft-delete (ISO, vide = actif)
  'Email',                                              // S — U7 compte propriétaire de la ligne
  'Coût €'                                              // T — W71 coût exact du plein saisi par l'utilisateur
];

// Index 0-based des colonnes dans les tableaux getValues()
const IDX_SYNC     = 14;  // O
const IDX_PHOTO    = 15;  // P
const IDX_MODIFIED = 16;  // Q — S5
const IDX_DELETED  = 17;  // R — S3
const IDX_EMAIL    = 18;  // S — U7
const IDX_COUT     = 19;  // T — W71 coût exact du plein

// U7 — Une ligne appartient-elle au compte ? Les lignes héritées sans email
// (avant migration) sont rattachées au propriétaire (OWNER_EMAIL, défini dans Auth.gs).
function _rowBelongsTo_(rowEmail, email) {
  var re = String(rowEmail || '').trim().toLowerCase();
  if (re === '') return email === OWNER_EMAIL;
  return re === email;
}

// S3/S5/W71 — garantit la presence des en-tetes Q (Modifié_le), R (Supprimé) et T (Coût €)
// sur un onglet _ImportGS deja existant.
function ensureSyncColumns_(sheet) {
  const lastCol = sheet.getLastColumn();
  if (lastCol < IDX_MODIFIED + 1) sheet.getRange(1, IDX_MODIFIED + 1).setValue('Modifié_le');
  if (lastCol < IDX_DELETED  + 1) sheet.getRange(1, IDX_DELETED  + 1).setValue('Supprimé');
  if (lastCol < IDX_COUT     + 1) sheet.getRange(1, IDX_COUT     + 1).setValue('Coût €');
}

// Horodatage ISO local (timezone du classeur) — base de comparaison S5.
function nowIso_(ss) {
  const tz = (ss || SpreadsheetApp.openById(SPREADSHEET_ID)).getSpreadsheetTimeZone();
  return Utilities.formatDate(new Date(), tz, "yyyy-MM-dd HH:mm:ss");
}

// ─────────────────────────────────────────────────────────────
//  S6 — Token secret (souple)
//  Retourne true si la requête est autorisée. Si la propriété de
//  script APP_TOKEN n'est pas définie → aucun contrôle (true).
//  Sinon, exige un token identique en GET (?token=) ou POST (payload.token).
// ─────────────────────────────────────────────────────────────
function tokenOk_(e, payload) {
  const expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) return true;                       // contrôle désactivé tant que non posé
  let provided = '';
  if (payload && payload.token != null) provided = String(payload.token);
  else if (e && e.parameter && e.parameter.token != null) provided = String(e.parameter.token);
  return provided === expected;
}

function unauthorizedResponse_() {
  return jsonResponse({ success: false, error: 'unauthorized', code: 401 });
}

// ─────────────────────────────────────────────────────────────
//  S7 — Rate limiting : max 10 requêtes/min par client
//  Clé CacheService : rl_<cid>_<minute> — TTL 90 s
//  Retourne true si le client est bloqué, false sinon.
// ─────────────────────────────────────────────────────────────
function rateLimit(cid) {
  if (!cid) return false;
  try {
    const cache = CacheService.getScriptCache();
    const key   = 'rl_' + cid + '_' + Math.floor(Date.now() / 60000);
    const count = Number(cache.get(key) || 0);
    if (count >= 10) return true;
    cache.put(key, String(count + 1), 90);
    return false;
  } catch (e) {
    Logger.log('rateLimit error: ' + e.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
//  doGet
//  • ?action=export              → JSON de tous les enregistrements
//  • ?action=export&since=ISO    → JSON des enreg. après le timestamp
//  • ?v=mobile                   → page HTML mobile
//  • (aucun param)               → page HTML index
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  // S6 — contrôle du token sur les actions de données (la page HTML reste libre)
  if (e.parameter.action && !tokenOk_(e, null)) return unauthorizedResponse_();

  if (e.parameter.action === 'export') {
    return handleExport(e);
  }

  // U7 — debug : confirme la vérification serveur de l'idToken (?action=whoami&idToken=…&token=…)
  if (e.parameter.action === 'whoami') {
    return handleWhoami(e);
  }

  // S8 — dernier prix E85 bas détecté (rétrocompat, push E85 sans payload)
  if (e.parameter.action === 'lowprice') {
    const raw = PropertiesService.getScriptProperties().getProperty('LAST_LOW_PRICE');
    return jsonResponse(raw ? JSON.parse(raw) : {});
  }

  // W49 — meilleurs prix du jour PAR CARBURANT (lus par le Service Worker)
  // → { E85:{station,prix,date}, GAZOLE:{...}, SP98:{...} }
  if (e.parameter.action === 'lowprices') {
    const props = PropertiesService.getScriptProperties();
    const raw   = props.getProperty('LAST_LOW_PRICES');
    if (raw) return jsonResponse(JSON.parse(raw));
    // Repli : ancienne propriété E85 seule.
    const e85 = props.getProperty('LAST_LOW_PRICE');
    return jsonResponse(e85 ? { E85: JSON.parse(e85) } : {});
  }

  // W38/W48 — prix mini du secteur par jour + meilleur prix du jour, par
  // carburant via &fuel=E85|GAZOLE|SP98 (défaut E85).
  if (e.parameter.action === 'sectorPrices') {
    return handleSectorPrices(e);
  }

  // S12 — agrégats pré-calculés (mensuel, KPIs annuels, comparatif véhicules)
  //   ?action=stats[&veh=Nom][&year=2026] — réponse JSON compacte, cache 1 h.
  if (e.parameter.action === 'stats') {
    return handleStats(e);
  }

  // P1 — paramètres métier partagés (lus par l'app et par Excel/VBA)
  //   ?action=getParametres → { params: [{cle, valeur, modifie_le}] }
  if (e.parameter.action === 'getParametres') {
    const pEmail = resolveOwner_(e, null);
    if (!pEmail) return unauthorizedResponse_();
    return handleGetParametres(pEmail);
  }

  // W91 — dépenses d'entretien par véhicule (lues par l'app et par Excel/VBA)
  //   ?action=getDepenses → { depenses: [{id, vehicule, date, categorie, intitule, montant, modifie_le, supprime}] }
  if (e.parameter.action === 'getDepenses') {
    const pEmail = resolveOwner_(e, null);
    if (!pEmail) return unauthorizedResponse_();
    return handleGetDepenses(pEmail);
  }

  // G3/G4 — (re)construction de l'onglet « Tableau de bord » natif Sheets,
  // filtré sur le compte propriétaire résolu (idToken → ce compte ; sinon owner).
  if (e.parameter.action === 'buildDashboard') {
    const pEmail = resolveOwner_(e, null) || OWNER_EMAIL;
    return jsonResponse(construireDashboard(pEmail));
  }

  const isMobile = (e.parameter.v === 'mobile');
  return HtmlService
    .createHtmlOutputFromFile(isMobile ? 'iphone' : 'index')
    .setTitle('Suivi Conso. Carburants — Saisie plein')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ─────────────────────────────────────────────────────────────
//  handleExport — retourne les enreg. de _ImportGS en JSON
//  Filtre par Horodatage >= since si le paramètre ?since= est fourni.
// ─────────────────────────────────────────────────────────────
function handleExport(e) {
  // U7 — filtrage par compte (email du token vérifié ; ou propriétaire en mode souple).
  const email = resolveOwner_(e, null);
  if (!email) return unauthorizedResponse_();

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);
  ensureSyncColumns_(sheet);
  const data  = sheet.getDataRange().getValues();
  const tz    = ss.getSpreadsheetTimeZone();

  // Paramètre optionnel ?since=ISO_TIMESTAMP
  const sinceParam = e && e.parameter && e.parameter.since ? e.parameter.since : null;
  const sinceDate  = sinceParam ? new Date(sinceParam) : null;
  const hasSince   = sinceDate && !isNaN(sinceDate.getTime());

  if (data.length <= 1) {
    return jsonResponse({ since: sinceParam || null, deleted: [], records: [] });
  }

  const headers = data[0].map(String);
  const horoIdx = headers.indexOf('Horodatage');

  // Anti-corruption : ignore toute ligne « echo d'en-tete » (sync_id === libelle
  // "sync_id"). Un vrai sync_id est un UUID ; cette valeur ne peut venir que d'une
  // ligne fantome (cf. _ImportGS du 17/06 : Type="Type", Date=1970). On la retire
  // ici pour ne JAMAIS la servir — ni a l'app, ni a Excel.
  const rows = data.slice(1)
    .filter(row => String(row[IDX_SYNC] || '').trim().toLowerCase() !== 'sync_id');

  // S3 — sync_id des lignes supprimées (tombstone col R). Filtré par since
  // sur la date de suppression si elle est parseable (sinon toujours inclus).
  const deleted = rows
    .filter(row => String(row[IDX_DELETED] || '').trim() !== '')
    .filter(row => _rowBelongsTo_(row[IDX_EMAIL], email))   // U7 — suppressions du compte uniquement
    .filter(row => {
      if (!hasSince) return true;
      const dv = row[IDX_DELETED];
      const dd = dv instanceof Date ? dv : new Date(String(dv));
      return isNaN(dd.getTime()) ? true : dd >= sinceDate;
    })
    .map(row => String(row[IDX_SYNC] || '').trim())
    .filter(Boolean);

  // records — lignes ACTIVES uniquement (col R vide)
  const records = rows
    .filter(row => String(row[IDX_DELETED] || '').trim() === '')
    .filter(row => _rowBelongsTo_(row[IDX_EMAIL], email))   // U7 — pleins du compte uniquement
    .filter(row => {
      if (!hasSince || horoIdx < 0) return true;
      const v = row[horoIdx];
      const d = v instanceof Date ? v : new Date(String(v));
      return !isNaN(d.getTime()) && d >= sinceDate;
    })
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const v = row[i];
        obj[h] = (v instanceof Date)
          ? Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm:ss")
          : v;
      });
      return obj;
    });

  // Ordre des clés : « records » EN DERNIER (le parseur VBA ParseRecords
  // vise la dernière « ] » via InStrRev ; deleted doit donc précéder).
  return jsonResponse({ since: sinceParam || null, deleted, records });
}

// ─────────────────────────────────────────────────────────────
//  doPost — dispatcher principal
// ─────────────────────────────────────────────────────────────
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const ss      = SpreadsheetApp.openById(SPREADSHEET_ID);

  // S6 — contrôle du token (souple : actif seulement si APP_TOKEN est posé)
  if (!tokenOk_(e, payload)) return unauthorizedResponse_();

  // W38 — mémorise la dernière position connue (pour le scan 15 km du refresh 7h)
  if (payload.action === 'saveLastGeo') {
    return handleSaveLastGeo(payload);
  }

  if (payload.action === 'addStation') {
    const sheet = ss.getSheetByName(STATIONS_SHEET);
    sheet.appendRow([payload.station]);
    return jsonResponse({ success: true });
  }

  // S8 — enregistrement d'un abonnement Web Push (voir WebPush.gs)
  // U7 — rattache l'abonnement au compte (email vérifié, ou null/legacy en mode souple).
  if (payload.action === 'savePushSub') {
    return handleSavePushSub(ss, payload, requireUser_(e, payload));
  }

  if (payload.action === 'syncStations') {
    const sheet = ss.getSheetByName(STATIONS_SHEET);
    if (sheet && payload.stations && payload.stations.length > 0) {
      sheet.clearContents();
      payload.stations.forEach((s, i) => sheet.getRange(i + 1, 1).setValue(s));
    }
    return jsonResponse({ success: true });
  }

  if (payload.action === 'addVehicule') {
    const sheet = ss.getSheetByName(VEHICULES_SHEET) || ss.insertSheet(VEHICULES_SHEET);
    const values = sheet.getDataRange().getValues();
    if (!values.some(r => r[0] === payload.vehicule)) sheet.appendRow([payload.vehicule]);
    return jsonResponse({ success: true });
  }

  if (payload.action === 'removeVehicule') {
    const sheet = ss.getSheetByName(VEHICULES_SHEET);
    if (sheet) {
      const data = sheet.getDataRange().getValues();
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i][0] === payload.vehicule) { sheet.deleteRow(i + 1); break; }
      }
    }
    return jsonResponse({ success: true });
  }

  // P1 — paramètres métier partagés : upsert last-write-wins par clé.
  //   body { action:'setParametres', params:[{cle, valeur, modifie_le}] }
  //   → renvoie l'état autoritatif fusionné pour réconciliation côté client.
  if (payload.action === 'setParametres') {
    const pEmail = resolveOwner_(e, payload);
    if (!pEmail) return unauthorizedResponse_();
    return handleSetParametres(ss, payload.params || [], pEmail);
  }

  // W91 — dépenses d'entretien : upsert last-write-wins par `id` (tombstone `supprime`).
  //   body { action:'setDepenses', depenses:[{id, vehicule, date, categorie, intitule, montant, modifie_le, supprime}] }
  //   → renvoie l'état autoritatif fusionné pour réconciliation côté client.
  if (payload.action === 'setDepenses') {
    const pEmail = resolveOwner_(e, payload);
    if (!pEmail) return unauthorizedResponse_();
    return handleSetDepenses(ss, payload.depenses || [], pEmail);
  }

  // ── Suppression d'un plein par sync_id (col O, index 14) ──
  // S3 : soft-delete (tombstone col R) au lieu d'un hard delete.
  if (payload.action === 'deletePlein') {
    const delEmail = resolveOwner_(e, payload);
    if (!delEmail) return unauthorizedResponse_();
    return handleDeletePlein(ss, payload.sync_id, delEmail);
  }

  // U7 — suppression de compte (RGPD) : exige un idToken vérifié (jamais le repli propriétaire).
  if (payload.action === 'deleteAccount') {
    const daEmail = requireUser_(e, payload);
    if (!daEmail) return unauthorizedResponse_();
    return handleDeleteAccount(ss, daEmail);
  }

  // ── S3 — suppression en lot depuis Excel (ids[]) → tombstones ──
  if (payload.action === 'bulkDelete') {
    return handleBulkDelete(ss, payload.ids || []);
  }

  if (payload.action === 'bulkAdd') {
    return handleBulkAdd(ss, payload.rows || []);
  }

  // ── v2.9.0.0 — Sync bidir. : MAJ de lignes existantes depuis Excel ──
  if (payload.action === 'bulkUpdate') {
    return handleBulkUpdate(ss, payload.rows || []);
  }

  // ── W17 — Scan ticket de caisse via Gemini Vision ──
  if (payload.action === 'scanTicket') {
    return handleScanTicket(payload.imageBase64, payload.mimeType);
  }

  // ── U7 — Identité : email du compte (idToken vérifié) ou propriétaire (mode souple) ──
  const ownerEmail = resolveOwner_(e, payload);
  if (!ownerEmail) return unauthorizedResponse_();   // auth obligatoire et idToken absent/invalide

  // ── S7 — Rate limiting pour l'enregistrement d'un plein ──
  if (rateLimit(payload.cid)) {
    return jsonResponse({ success: false, error: 'Trop de requêtes. Réessayez dans une minute.' });
  }

  // ── Enregistrement d'un plein depuis l'app web (A→S, 19 col) ──
  const sp     = payload.stationPrices || {};
  const syncId = payload.sync_id || Utilities.getUuid();
  const sheet  = getOrCreateSheet(ss);

  // W9 — Upload photo ticket vers Drive si fournie
  let photoUrl = '';
  if (payload.ticketPhoto) {
    try {
      const folder   = getOrCreateTicketFolder();
      const bytes    = Utilities.base64Decode(payload.ticketPhoto);
      const blob     = Utilities.newBlob(bytes, 'image/jpeg',
        'ticket_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.jpg');
      const file     = folder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      photoUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';
    } catch (photoErr) {
      Logger.log('W9 photo upload error: ' + photoErr.message);
    }
  }

  sheet.appendRow([
    new Date(),                                         // A — Horodatage
    new Date(payload.date),                             // B — Date
    payload.type,                                       // C — Type
    Number(payload.km),                                 // D — Km compteur
    Number(payload.litres),                             // E — Nb. Litres
    Number(payload.prix),                               // F — Prix €/L
    payload.station,                                    // G — Station essence
    payload.vehicule || '',                             // H — Véhicule
    sp.E85    ? Number(sp.E85)    : '',                 // I — E85 station
    sp.SP98   ? Number(sp.SP98)   : '',                 // J — SP98 station
    sp.SP95   ? Number(sp.SP95)   : '',                 // K — SP95 station
    sp.E10    ? Number(sp.E10)    : '',                 // L — E10 station
    sp.GAZOLE ? Number(sp.GAZOLE) : '',                 // M — Gazole station
    sp.GPLC   ? Number(sp.GPLC)   : '',                 // N — GPLc station
    syncId,                                             // O — sync_id
    photoUrl,                                           // P — URL Drive photo ticket
    new Date(),                                         // Q — Modifié_le (S5)
    '',                                                 // R — Supprimé (S3, actif)
    ownerEmail,                                         // S — U7 email du compte
    payload.cout ? Number(payload.cout) : '',           // T — W71 coût exact du plein
  ]);

  return jsonResponse({ success: true, sync_id: syncId });
}

// ─────────────────────────────────────────────────────────────
//  handleScanTicket — W17
//  Analyse une photo de ticket de caisse via l'API Gemini Vision
// ─────────────────────────────────────────────────────────────
function handleScanTicket(imageBase64, mimeType) {
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  if (!apiKey) {
    return jsonResponse({
      success: false,
      error:   'Clé GEMINI_API_KEY non configurée. ' +
               'Extensions → Apps Script → Paramètres du projet → Propriétés de script → Ajouter GEMINI_API_KEY.'
    });
  }

  const prompt =
    'Tu es un expert en lecture de tickets de caisse de stations-service françaises, ' +
    'y compris froissés, flous, mal éclairés ou mal cadrés.\n' +
    'Analyse l\'image et extrais les informations du plein de carburant.\n\n' +
    'Règles d\'interprétation :\n' +
    '- "Quantité" / "Quantite" / "Volume" en litres → litres\n' +
    '- "Prix unitaire" / "Prix unit." / "Prix/L" / "P.U." → prix_litre (le prix AU LITRE, jamais la TVA ni une taxe)\n' +
    '- "Montant" / "Montant réel" / "Total" / "Net à payer" → montant_total\n' +
    '- Carburant possible : E85 (SuperEthanol), SP98, SP95, E10 (SP95-E10), Gazole (Diesel, B7), GPLc\n' +
    '- Le kilométrage est presque toujours ABSENT sur ces tickets → null si non visible\n' +
    '- Date au format YYYY-MM-DD. ATTENTION années à 2 chiffres : "26" = 2026, "25" = 2025\n' +
    '- enseigne : nom commercial de la station SEUL, sans la ville (ex. "Carrefour", "Total", "Leclerc", "Intermarché", "Avia", "Esso", "Système U"). null si illisible.\n' +
    '- ville : commune de la station SEULE, sans l\'enseigne (ex. "Flers-en-Escrebieux", "Douai"). Souvent dans l\'adresse ou l\'en-tête. null si absente.\n' +
    '- station : enseigne + ville réunies si présentes (ex. "Carrefour Flers-en-Escrebieux")\n' +
    '- Cohérence : litres × prix_litre ≈ montant_total. Si un champ est douteux, recalcule-le.\n\n' +
    'Réponds UNIQUEMENT avec cet objet JSON (aucun markdown, aucun backtick, aucun texte autour) :\n' +
    '{\n' +
    '  "date": "YYYY-MM-DD" ou null,\n' +
    '  "km": entier ou null,\n' +
    '  "litres": décimal ou null,\n' +
    '  "prix_litre": décimal ou null,\n' +
    '  "montant_total": décimal ou null,\n' +
    '  "type_carburant": "E85"|"SP98"|"SP95"|"E10"|"Gazole"|"GPLc" ou null,\n' +
    '  "enseigne": "texte" ou null,\n' +
    '  "ville": "texte" ou null,\n' +
    '  "station": "texte" ou null\n' +
    '}';

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + apiKey;

  try {
    const resp = UrlFetchApp.fetch(url, {
      method:      'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType || 'image/jpeg', data: imageBase64 } }
          ]
        }],
        generationConfig: {
          temperature:     0.1,
          maxOutputTokens: 1024,
          // Gemini 2.5 = modèle "thinking" : sans ce budget à 0, les jetons de
          // réflexion épuisent maxOutputTokens et le texte de réponse revient vide.
          thinkingConfig:  { thinkingBudget: 0 }
        }
      })
    });

    const result = JSON.parse(resp.getContentText());

    if (result.error) {
      return jsonResponse({ success: false, error: result.error.message || 'Erreur API Gemini.' });
    }

    let text = (result.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();

    // Retire d'éventuelles clôtures markdown ```json ... ```
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return jsonResponse({ success: false, error: 'Réponse non parseable.', raw: text });
    }

    const data = JSON.parse(jsonMatch[0]);
    return jsonResponse({ success: true, data });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ─────────────────────────────────────────────────────────────
//  handleDeletePlein — supprime la ligne dont sync_id (col O = index 14)
//  correspond. Parcourt de la dernière ligne vers la 1ère (saute l'en-tête).
// ─────────────────────────────────────────────────────────────
function handleDeletePlein(ss, syncId, email) {
  if (!syncId) return jsonResponse({ success: false, error: 'sync_id manquant' });

  const sheet = getOrCreateSheet(ss);
  ensureSyncColumns_(sheet);
  const data  = sheet.getDataRange().getValues();
  if (data.length <= 1) return jsonResponse({ success: false, error: 'Aucun plein enregistré' });

  // Retrouve la colonne sync_id par en-tête (comme handleExport), repli sur O (index 14)
  const headers  = data[0].map(String);
  let   syncIdx  = headers.indexOf('sync_id');
  if (syncIdx < 0) syncIdx = IDX_SYNC;

  const target = String(syncId).trim();
  const stamp  = nowIso_(ss);

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][syncIdx]).trim() === target) {
      // U7 — défense en profondeur : on ne supprime QUE ses propres pleins.
      if (email && !_rowBelongsTo_(data[i][IDX_EMAIL], email)) {
        return jsonResponse({ success: false, error: 'forbidden', code: 403 });
      }
      // S3 — soft-delete : pose le tombstone (col R) + horodatage modif (col Q)
      // au lieu de supprimer physiquement la ligne, pour que la suppression
      // se propage aux autres clients (Excel, app web) via handleExport.
      sheet.getRange(i + 1, IDX_DELETED  + 1).setValue(stamp);
      sheet.getRange(i + 1, IDX_MODIFIED + 1).setValue(stamp);
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ success: false, error: 'Plein introuvable (sync_id inconnu)' });
}

// ─────────────────────────────────────────────────────────────
//  U7 — handleDeleteAccount (RGPD)
//  Supprime DÉFINITIVEMENT toutes les données du compte `email` :
//  pleins (_ImportGS), paramètres (Parametres) et abonnements push (_PushSubs).
//  ⚠️ Appelée UNIQUEMENT avec un email issu d'un idToken vérifié (jamais le
//  repli propriétaire), afin qu'un appel anonyme ne puisse pas purger de données.
// ─────────────────────────────────────────────────────────────
function handleDeleteAccount(ss, email) {
  if (!email) return unauthorizedResponse_();
  var deleted = { pleins: 0, params: 0, push: 0, depenses: 0 };

  // 1. Pleins — suppression physique des lignes du compte.
  var sheet = getOrCreateSheet(ss);
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (_rowBelongsTo_(data[i][IDX_EMAIL], email)) { sheet.deleteRow(i + 1); deleted.pleins++; }
  }

  // 2. Paramètres du compte.
  var pSheet = getOrCreateParamsSheet_(ss);
  var pData  = pSheet.getDataRange().getValues();
  for (var j = pData.length - 1; j >= 1; j--) {
    if (_rowBelongsTo_(pData[j][IDX_PARAM_EMAIL], email)) { pSheet.deleteRow(j + 1); deleted.params++; }
  }

  // 3. Abonnements push du compte (_PushSubs, col I = Email).
  try {
    var psh = ss.getSheetByName(PUSHSUBS_SHEET);
    if (psh && psh.getLastRow() > 1) {
      var psData = psh.getDataRange().getValues();
      for (var k = psData.length - 1; k >= 1; k--) {
        if (String(psData[k][8] || '').trim().toLowerCase() === email) { psh.deleteRow(k + 1); deleted.push++; }
      }
    }
  } catch (e) { Logger.log('deleteAccount push cleanup: ' + e.message); }

  // 4. W91 — dépenses d'entretien du compte.
  try {
    var dSheet = getOrCreateDepensesSheet_(ss);
    var dData  = dSheet.getDataRange().getValues();
    for (var m = dData.length - 1; m >= 1; m--) {
      if (_rowBelongsTo_(dData[m][IDX_DEP_EMAIL], email)) { dSheet.deleteRow(m + 1); deleted.depenses++; }
    }
  } catch (e2) { Logger.log('deleteAccount depenses cleanup: ' + e2.message); }

  Logger.log('🗑️ deleteAccount(' + email + ') — ' +
    deleted.pleins + ' pleins, ' + deleted.params + ' params, ' + deleted.push + ' push, ' +
    deleted.depenses + ' depenses.');
  return jsonResponse({ success: true, deleted: deleted });
}

// ─────────────────────────────────────────────────────────────
//  S3 — handleBulkDelete
//  Suppressions en lot venues d'Excel (action=bulkDelete, ids[]).
//  Soft-delete : pose le tombstone col R sur chaque sync_id trouvé.
//  Retourne { status:'ok', deleted:N, missing:M }.
// ─────────────────────────────────────────────────────────────
function handleBulkDelete(ss, ids) {
  if (!ids || ids.length === 0) {
    return jsonResponse({ status: 'ok', deleted: 0, missing: 0 });
  }
  const sheet = getOrCreateSheet(ss);
  ensureSyncColumns_(sheet);
  const data  = sheet.getDataRange().getValues();

  const want = new Set(ids.map(x => String(x).trim()).filter(Boolean));
  const stamp = nowIso_(ss);

  let deleted = 0;
  for (let i = 1; i < data.length && want.size > 0; i++) {
    const sid = String(data[i][IDX_SYNC] || '').trim();
    if (sid && want.has(sid)) {
      // ne re-tombstone pas une ligne déjà supprimée
      if (String(data[i][IDX_DELETED] || '').trim() === '') {
        sheet.getRange(i + 1, IDX_DELETED  + 1).setValue(stamp);
        sheet.getRange(i + 1, IDX_MODIFIED + 1).setValue(stamp);
        deleted++;
      }
      want.delete(sid);
    }
  }
  return jsonResponse({ status: 'ok', deleted, missing: want.size });
}

// ─────────────────────────────────────────────────────────────
//  handleBulkAdd — insère des lignes envoyées par Excel
//  Déduplique par sync_id (col O = index 14)
// ─────────────────────────────────────────────────────────────
function handleBulkAdd(ss, rows) {
  const sheet = getOrCreateSheet(ss);
  ensureSyncColumns_(sheet);
  const data  = sheet.getDataRange().getValues();

  const existingIds = new Set(
    data.slice(1).map(r => r[IDX_SYNC]).filter(id => id !== '' && id !== null && id !== undefined)
  );

  let added = 0;
  rows.forEach(row => {
    if (!row.sync_id || existingIds.has(row.sync_id)) return;

    const sp = row.stationPrices || {};
    // S5 — Modifié_le : horodatage fourni par Excel, repli sur l'horodatage
    const modAt = row.modifiedAt ? new Date(row.modifiedAt)
                : (row.horodatage ? new Date(row.horodatage) : new Date());
    sheet.appendRow([
      row.horodatage ? new Date(row.horodatage) : new Date(), // A
      new Date(row.date),                                      // B
      row.type       || '',                                    // C
      Number(row.km)     || 0,                                 // D
      Number(row.litres) || 0,                                 // E
      Number(row.prix)   || 0,                                 // F
      row.station    || '',                                    // G
      row.vehicule   || '',                                    // H
      sp.E85    ? Number(sp.E85)    : '',                      // I
      sp.SP98   ? Number(sp.SP98)   : '',                      // J
      sp.SP95   ? Number(sp.SP95)   : '',                      // K
      sp.E10    ? Number(sp.E10)    : '',                      // L
      sp.GAZOLE ? Number(sp.GAZOLE) : '',                      // M
      sp.GPLC   ? Number(sp.GPLC)   : '',                      // N
      row.sync_id,                                             // O
      '',                                                      // P — Photo ticket
      modAt,                                                   // Q — Modifié_le (S5)
      '',                                                      // R — Supprimé (S3)
    ]);

    existingIds.add(row.sync_id);
    added++;
  });

  return jsonResponse({ success: true, added, skipped: rows.length - added });
}

// ─────────────────────────────────────────────────────────────
//  handleBulkUpdate — v2.9.0.0
//  Propage les modifications Excel → GS (sync bidirectionnel).
//  Appelé par VBA ExportModificationsToGS (action=bulkUpdate).
//
//  Comportement par ligne :
//    • sync_id trouvé dans GS → MAJ cols B–N (préserve col A horodatage)
//    • sync_id absent du GS  → upsert (appendRow, cas bord de désync)
//
//  Retourne : { status:'ok', updated:N, added:M }
//  Le VBA efface la col P (last_modified) si status === 'ok'.
// ─────────────────────────────────────────────────────────────
function handleBulkUpdate(ss, rows) {
  if (!rows || rows.length === 0) {
    return jsonResponse({ status: 'ok', updated: 0, added: 0, skipped: 0 });
  }

  const sheet = getOrCreateSheet(ss);
  ensureSyncColumns_(sheet);
  const data  = sheet.getDataRange().getValues();

  // Map sync_id → infos ligne { sheetRow (1-based), modAt (Date|null), deleted }
  const info = {};
  for (let i = 1; i < data.length; i++) {
    const sid = String(data[i][IDX_SYNC] || '').trim();
    if (!sid) continue;
    const mv = data[i][IDX_MODIFIED];
    info[sid] = {
      sheetRow: i + 1,                                    // ligne 1 du sheet = en-têtes
      modAt:    mv instanceof Date ? mv : (mv ? new Date(String(mv)) : null),
      deleted:  String(data[i][IDX_DELETED] || '').trim() !== ''
    };
  }

  let updated = 0, added = 0, skipped = 0;

  rows.forEach(row => {
    if (!row.sync_id) return;

    const sp = row.stationPrices || {};
    const incomingMod = row.modifiedAt ? new Date(row.modifiedAt) : new Date();

    // Valeurs cols B–O (cols 2–15 du sheet)
    const colsBtoO = [
      row.date ? new Date(row.date) : '',           // B — Date
      row.type || '',                                // C — Type
      Number(row.km)     || 0,                       // D — Km compteur
      Number(row.litres) || 0,                       // E — Nb. Litres
      Number(row.prix)   || 0,                       // F — Prix €/L
      row.station   || '',                           // G — Station essence
      row.vehicule  || '',                           // H — Véhicule
      sp.E85    ? Number(sp.E85)    : '',            // I — E85 station
      sp.SP98   ? Number(sp.SP98)   : '',            // J — SP98 station
      sp.SP95   ? Number(sp.SP95)   : '',            // K — SP95 station
      sp.E10    ? Number(sp.E10)    : '',            // L — E10 station
      sp.GAZOLE ? Number(sp.GAZOLE) : '',            // M — Gazole station
      sp.GPLC   ? Number(sp.GPLC)   : '',            // N — GPLc station
      row.sync_id,                                   // O — sync_id (inchangé)
    ];

    const it = info[row.sync_id];
    if (it) {
      // S3 — ne pas ressusciter une ligne supprimée
      if (it.deleted) { skipped++; return; }

      // S5 — arbitrage : GS n'est écrasé que si Excel est aussi récent ou
      // plus récent que la dernière modif serveur. Sinon le serveur gagne.
      if (it.modAt && incomingMod < it.modAt) { skipped++; return; }

      sheet.getRange(it.sheetRow, 2, 1, colsBtoO.length).setValues([colsBtoO]);
      sheet.getRange(it.sheetRow, IDX_MODIFIED + 1).setValue(incomingMod);  // Q
      updated++;

    } else {
      // ── Ligne absente (desync edge case) : upsert complet A–R ──
      sheet.appendRow([
        row.horodatage ? new Date(row.horodatage) : new Date(),  // A
        ...colsBtoO,                                             // B–O
        '',                                                       // P — Photo ticket
        incomingMod,                                              // Q — Modifié_le
        '',                                                       // R — Supprimé
      ]);
      info[row.sync_id] = { sheetRow: sheet.getLastRow(), modAt: incomingMod, deleted: false };
      added++;
    }
  });

  return jsonResponse({ status: 'ok', updated, added, skipped });
}

// ─────────────────────────────────────────────────────────────
//  W38 — handleSaveLastGeo
//  Mémorise la dernière position connue (propriété LAST_GEO) pour
//  que le refresh quotidien (~7h) scanne les prix 15 km autour.
// ─────────────────────────────────────────────────────────────
function handleSaveLastGeo(payload) {
  const lat = Number(payload.lat);
  const lon = Number(payload.lon);
  if (!isFinite(lat) || !isFinite(lon)) {
    return jsonResponse({ success: false, error: 'coordonnées invalides' });
  }
  PropertiesService.getScriptProperties().setProperty('LAST_GEO',
    JSON.stringify({ lat, lon, ts: new Date().toISOString() }));
  return jsonResponse({ success: true });
}

// ─────────────────────────────────────────────────────────────
//  W38/W62 — handleSectorPrices
//  Renvoie, depuis l'onglet _PrixHistory (Station, Date, Type, Prix), pour le
//  carburant demandé (?fuel=, défaut E85 ; W62 : 6 carburants reconnus) :
//    • byDate        : { 'yyyy-MM-dd' : prix mini relevé ce jour-là }
//    • byStationDate : { 'station' : { 'yyyy-MM-dd' : prix mini } }
//    • today         : meilleur prix du jour (propriété SECTOR_BEST_TODAY)
//  Permet à l'app d'afficher, pour chaque plein, l'écart vs le moins cher
//  du secteur le jour du plein, et le prix historique à la saisie.
// ─────────────────────────────────────────────────────────────
function handleSectorPrices(e) {
  // Carburant demandé (défaut E85). Jetons de reconnaissance du champ Type.
  const fuel = String((e && e.parameter && e.parameter.fuel) || 'E85').toUpperCase();
  const TOKENS = {
    E85:    ['E85', 'ETHANOL'],
    GAZOLE: ['GAZOLE', 'DIESEL', 'GASOIL'],
    SP98:   ['SP98', 'SUPER 98', '98'],
    SP95:   ['SP95', 'SUPER 95', '95'],   // W62
    E10:    ['E10'],                       // W62
    GPLC:   ['GPLC', 'GPL'],              // W62 (Type _PrixHistory = « GPLc »)
  };
  const want = TOKENS[fuel] || TOKENS.E85;
  const matchType = function (t) {
    const u = String(t || '').toUpperCase();
    return want.some(function (tok) { return u.indexOf(tok) >= 0; });
  };

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('_PrixHistory');
  const byDate = {};
  const byStationDate = {};   // { 'Nom station' : { 'yyyy-MM-dd' : prix mini ce jour } }

  if (sh && sh.getLastRow() > 1) {
    const data = sh.getDataRange().getValues();
    const head = data[0].map(String);
    const iStation = head.indexOf('Station');
    const iDate = head.indexOf('Date');
    const iType = head.indexOf('Type');
    const iPrix = head.indexOf('Prix €/L');
    const tz    = ss.getSpreadsheetTimeZone();

    for (let i = 1; i < data.length; i++) {
      const row  = data[i];
      if (!matchType(row[iType])) continue;              // carburant demandé
      let d = row[iDate];
      const dStr = (d instanceof Date)
        ? Utilities.formatDate(d, tz, 'yyyy-MM-dd')
        : String(d || '').slice(0, 10);
      const prix = Number(row[iPrix]);
      if (!dStr || !isFinite(prix) || prix <= 0) continue;
      if (byDate[dStr] == null || prix < byDate[dStr]) byDate[dStr] = prix;

      // Prix par station / date (mini si plusieurs relevés le même jour) —
      // permet à la saisie d'un plein passé d'afficher le prix de LA station.
      const stn = String((iStation >= 0 ? row[iStation] : '') || '').trim();
      if (stn) {
        if (!byStationDate[stn]) byStationDate[stn] = {};
        const cur = byStationDate[stn][dStr];
        if (cur == null || prix < cur) byStationDate[stn][dStr] = prix;
      }
    }
  }

  // SECTOR_BEST_TODAY : objet par carburant (nouveau) ou plat E85 (ancien).
  const rawToday = PropertiesService.getScriptProperties().getProperty('SECTOR_BEST_TODAY');
  let today = null;
  if (rawToday) {
    const parsed = JSON.parse(rawToday);
    if (parsed && parsed.prix != null) {           // ancien format plat = E85
      today = (fuel === 'E85') ? parsed : null;
    } else if (parsed) {
      // W62 — clé insensible à la casse : SECTOR_BEST_TODAY peut contenir
      // « GPLc » (clé FUELS) alors que fuel vaut « GPLC » (toUpperCase).
      const k = Object.keys(parsed).find(function (kk) { return String(kk).toUpperCase() === fuel; });
      today = k ? parsed[k] : null;
    }
  }

  return jsonResponse({ byDate, byStationDate, today, fuel });
}

// ─────────────────────────────────────────────────────────────
//  migrateRemoveS98 — À exécuter UNE SEULE FOIS manuellement
// ─────────────────────────────────────────────────────────────
function migrateRemoveS98() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);

  const headerG = sheet.getRange(1, 7).getValue();
  if (headerG !== 'Prix S98 jour (€/L)') {
    Logger.log(`⚠️  Colonne G n'est pas "Prix S98 jour" (trouvé: "${headerG}"). Migration annulée.`);
    return;
  }

  sheet.deleteColumn(7);
  Logger.log('✅ migrateRemoveS98 — colonne G supprimée, schéma réduit à 15 colonnes (A→O).');
}

// ─────────────────────────────────────────────────────────────
//  migrateSyncId — À exécuter UNE SEULE FOIS (legacy)
// ─────────────────────────────────────────────────────────────
function migrateSyncId() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);
  const last  = sheet.getLastRow();

  const headerCell = sheet.getRange(1, 15);
  if (!headerCell.getValue()) {
    headerCell.setValue('sync_id');
    headerCell.setFontWeight('bold')
      .setBackground('#1B3A5C')
      .setFontColor('#FFFFFF')
      .setHorizontalAlignment('center');
    sheet.setColumnWidth(15, 260);
  }

  let count = 0;
  for (let i = 2; i <= last; i++) {
    const cell = sheet.getRange(i, 15);
    if (!cell.getValue()) {
      cell.setValue(Utilities.getUuid());
      count++;
    }
  }

  Logger.log(`✅ migrateSyncId — ${count} UUID générés sur ${last - 1} lignes.`);
}

// ─────────────────────────────────────────────────────────────
//  migrateHeaders — Réécrit les 15 en-têtes A→O
// ─────────────────────────────────────────────────────────────
function migrateHeaders() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);

  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#1B3A5C')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center');

  sheet.setFrozenRows(1);
  [8, 9, 10, 11, 12, 13, 14].forEach(col => sheet.setColumnWidth(col, 110));
  sheet.setColumnWidth(15, 260); // O — sync_id

  Logger.log('✅ migrateHeaders — ' + HEADERS.length + ' colonnes en ligne 1.');
}

// ─────────────────────────────────────────────────────────────
//  U7 — migrerMultiUser — À exécuter UNE FOIS (idempotente)
//  Pose l'en-tête col S « Email » (via getOrCreateSheet) et rattache toutes
//  les lignes existantes sans email au propriétaire OWNER_EMAIL (Auth.gs).
//  Sûr à relancer : ne touche que les cellules Email vides.
// ─────────────────────────────────────────────────────────────
function migrerMultiUser() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);   // pose l'en-tête col S si absent

  const last = sheet.getLastRow();
  if (last < 2) { Logger.log('migrerMultiUser — aucune ligne de données.'); return; }

  const rng  = sheet.getRange(2, IDX_EMAIL + 1, last - 1, 1);
  const vals = rng.getValues();
  let count = 0;
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || '').trim() === '') { vals[i][0] = OWNER_EMAIL; count++; }
  }
  rng.setValues(vals);
  Logger.log('✅ migrerMultiUser — _ImportGS : ' + count + ' ligne(s) rattachée(s) à ' + OWNER_EMAIL + '.');

  // Onglet Parametres : rattacher les lignes existantes (email vide) au propriétaire.
  const pSheet = getOrCreateParamsSheet_(ss);   // pose la col D « email » si absente
  const pLast  = pSheet.getLastRow();
  if (pLast >= 2) {
    const pRng  = pSheet.getRange(2, IDX_PARAM_EMAIL + 1, pLast - 1, 1);
    const pVals = pRng.getValues();
    let pCount = 0;
    for (let i = 0; i < pVals.length; i++) {
      if (String(pVals[i][0] || '').trim() === '') { pVals[i][0] = OWNER_EMAIL; pCount++; }
    }
    pRng.setValues(pVals);
    Logger.log('✅ migrerMultiUser — Parametres : ' + pCount + ' ligne(s) rattachée(s) à ' + OWNER_EMAIL + '.');
  }
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

// W9 — Retourne (ou crée) le dossier Drive pour les photos de tickets
function getOrCreateTicketFolder() {
  const folders = DriveApp.getFoldersByName(TICKET_FOLDER_NAME);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(TICKET_FOLDER_NAME);
}

// ─────────────────────────────────────────────────────────────
//  P1 — Paramètres métier partagés (onglet « Parametres »)
//  Table clé/valeur/horodatage : cle | valeur | modifie_le (epoch ms).
//  Source de vérité unique pour l'app web ET le classeur Excel.
//  Synchro = last-write-wins par clé sur modifie_le.
// ─────────────────────────────────────────────────────────────
function getOrCreateParamsSheet_(ss) {
  let sheet = ss.getSheetByName(PARAMS_SHEET);
  if (!sheet) sheet = ss.insertSheet(PARAMS_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['cle', 'valeur', 'modifie_le', 'email']);   // U7 — col D email
    sheet.getRange(1, 1, 1, 4)
      .setFontWeight('bold')
      .setBackground('#1B3A5C')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  } else if (String(sheet.getRange(1, IDX_PARAM_EMAIL + 1).getValue()).trim().toLowerCase() !== 'email') {
    // U7 — Migration douce : ajoute la colonne D « email » (multi-utilisateur)
    sheet.getRange(1, IDX_PARAM_EMAIL + 1).setValue('email')
      .setFontWeight('bold').setBackground('#1B3A5C').setFontColor('#FFFFFF');
  }
  return sheet;
}

// Lit l'onglet Parametres → { cle: { valeur, modifie_le } } pour UN compte
// (clés métier seules). U7 : ne retient que les lignes appartenant à `email`
// (les lignes héritées sans email sont rattachées au propriétaire).
function readParamsMap_(sheet, email) {
  const data = sheet.getDataRange().getValues();
  const map  = {};
  for (let i = 1; i < data.length; i++) {
    const cle = String(data[i][0] || '').trim();
    if (!cle || PARAM_KEYS.indexOf(cle) < 0) continue;
    if (!_rowBelongsTo_(data[i][IDX_PARAM_EMAIL], email)) continue;   // U7 — params du compte
    map[cle] = { row: i + 1, valeur: data[i][1], modifie_le: Number(data[i][2]) || 0 };
  }
  return map;
}

function handleGetParametres(email) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateParamsSheet_(ss);
  const map   = readParamsMap_(sheet, email);
  const params = Object.keys(map).map(cle => ({
    cle: cle, valeur: map[cle].valeur, modifie_le: map[cle].modifie_le
  }));
  return jsonResponse({ params: params });
}

function handleSetParametres(ss, incoming, email) {
  const sheet  = getOrCreateParamsSheet_(ss);
  const map    = readParamsMap_(sheet, email);

  (incoming || []).forEach(function (p) {
    const cle = String(p && p.cle || '').trim();
    if (!cle || PARAM_KEYS.indexOf(cle) < 0) return;          // clé hors périmètre → ignorée
    const ts  = Number(p.modifie_le) || 0;
    const cur = map[cle];
    if (cur) {
      // Last-write-wins : on n'écrase que si l'entrant est plus récent.
      if (ts >= cur.modifie_le) {
        sheet.getRange(cur.row, 2).setValue(p.valeur);
        sheet.getRange(cur.row, 3).setValue(ts);
        cur.valeur = p.valeur; cur.modifie_le = ts;
      }
    } else {
      sheet.appendRow([cle, p.valeur, ts, email]);   // U7 — email en col D
      map[cle] = { row: sheet.getLastRow(), valeur: p.valeur, modifie_le: ts };
    }
  });

  // État autoritatif fusionné (pour réconciliation immédiate côté client).
  const params = Object.keys(map).map(function (cle) {
    return { cle: cle, valeur: map[cle].valeur, modifie_le: map[cle].modifie_le };
  });
  return jsonResponse({ success: true, params: params });
}

// ─────────────────────────────────────────────────────────────
//  W91 — Dépenses d'entretien par véhicule (onglet « Depenses »)
//  Table par ligne : id | vehicule | date | categorie | intitule |
//                    montant | modifie_le | supprime | email
//  Synchro = last-write-wins par `id` sur modifie_le (epoch ms).
//  Tombstone `supprime` = 1 pour propager les suppressions.
// ─────────────────────────────────────────────────────────────
function getOrCreateDepensesSheet_(ss) {
  let sheet = ss.getSheetByName(DEPENSES_SHEET);
  if (!sheet) sheet = ss.insertSheet(DEPENSES_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(DEP_HEADERS);
    sheet.getRange(1, 1, 1, DEP_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1B3A5C')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Lit l'onglet Depenses → { id: { row, ... } } pour UN compte.
function readDepensesMap_(sheet, email) {
  const data = sheet.getDataRange().getValues();
  const map  = {};
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][0] || '').trim();
    if (!id) continue;
    if (!_rowBelongsTo_(data[i][IDX_DEP_EMAIL], email)) continue;
    map[id] = {
      row:        i + 1,
      vehicule:   data[i][1],
      date:       data[i][2],
      categorie:  data[i][3],
      intitule:   data[i][4],
      montant:    data[i][5],
      modifie_le: Number(data[i][6]) || 0,
      supprime:   Number(data[i][7]) || 0,
    };
  }
  return map;
}

function _depenseToObj_(id, r) {
  return {
    id: id, vehicule: r.vehicule, date: r.date, categorie: r.categorie,
    intitule: r.intitule, montant: r.montant, modifie_le: r.modifie_le, supprime: r.supprime,
  };
}

function handleGetDepenses(email) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateDepensesSheet_(ss);
  const map   = readDepensesMap_(sheet, email);
  const depenses = Object.keys(map).map(id => _depenseToObj_(id, map[id]));
  return jsonResponse({ depenses: depenses });
}

function handleSetDepenses(ss, incoming, email) {
  const sheet = getOrCreateDepensesSheet_(ss);
  const map   = readDepensesMap_(sheet, email);

  (incoming || []).forEach(function (d) {
    const id = String(d && d.id || '').trim();
    if (!id) return;
    const ts  = Number(d.modifie_le) || 0;
    const row = [
      id, d.vehicule || '', d.date || '', d.categorie || '',
      d.intitule || '', Number(d.montant) || 0, ts, Number(d.supprime) ? 1 : 0, email,
    ];
    const cur = map[id];
    if (cur) {
      // Last-write-wins : on n'écrase que si l'entrant est au moins aussi récent.
      if (ts >= cur.modifie_le) {
        sheet.getRange(cur.row, 1, 1, DEP_HEADERS.length).setValues([row]);
        cur.vehicule = row[1]; cur.date = row[2]; cur.categorie = row[3];
        cur.intitule = row[4]; cur.montant = row[5]; cur.modifie_le = ts;
        cur.supprime = row[7];
      }
    } else {
      sheet.appendRow(row);
      map[id] = {
        row: sheet.getLastRow(), vehicule: row[1], date: row[2], categorie: row[3],
        intitule: row[4], montant: row[5], modifie_le: ts, supprime: row[7],
      };
    }
  });

  const depenses = Object.keys(map).map(id => _depenseToObj_(id, map[id]));
  return jsonResponse({ success: true, depenses: depenses });
}

function getOrCreateSheet(ss) {
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1B3A5C')
      .setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
  } else {
    // W9 — Migration : ajouter col P "Photo ticket" si absente
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    if (headerRow.length < 16 || !headerRow[15]) {
      sheet.getRange(1, 16).setValue('Photo ticket')
        .setFontWeight('bold')
        .setBackground('#1B3A5C')
        .setFontColor('#FFFFFF');
      sheet.setColumnWidth(16, 200);
    }
    // U7 — Migration : ajouter col S "Email" si absente (multi-utilisateur)
    if (sheet.getLastColumn() < IDX_EMAIL + 1 ||
        String(sheet.getRange(1, IDX_EMAIL + 1).getValue()).trim() !== 'Email') {
      sheet.getRange(1, IDX_EMAIL + 1).setValue('Email')
        .setFontWeight('bold')
        .setBackground('#1B3A5C')
        .setFontColor('#FFFFFF');
      sheet.setColumnWidth(IDX_EMAIL + 1, 200);
    }
  }
  return sheet;
}

// ─────────────────────────────────────────────────────────────
//  S12 — agrégats pré-calculés côté serveur (allège le client : W59)
//  Réponse : { generatedAt, year, surconso, co2Total,
//              months:[{key,cost,litres,co2}],
//              kpis:{year,pleins,litres,cost,km,station},
//              vehicles:[{nom,litres,cost,km,consoPer100,costPer100}] }
//  Cache CacheService (script) ~1 h, clé = veh|year|nbLignes.
// ─────────────────────────────────────────────────────────────
const CO2_ESSENCE_PER_L_GS = 2.21;   // aligné sur js/config.js
const CO2_E85_PER_L_GS     = 1.105;
const DEFAULT_SURCONSO_GS  = 0.2;

function statsFuelKey_(type) {
  const t = String(type || '').toLowerCase();
  if (t.indexOf('e85') >= 0 || t.indexOf('ethanol') >= 0) return 'E85';
  if (t.indexOf('gazole') >= 0 || t.indexOf('diesel') >= 0 || t.indexOf('gasoil') >= 0) return 'GAZOLE';
  if (t.indexOf('98') >= 0) return 'SP98';
  if (t.indexOf('e10') >= 0) return 'E10';
  if (t.indexOf('95') >= 0) return 'SP95';
  if (t.indexOf('gpl') >= 0) return 'GPLC';
  return 'AUTRE';
}

function statsParseDate_(v) {
  if (v instanceof Date) return v;
  const d = new Date(String(v || '').replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function statsMonthKey_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Surconso E85 dynamique = avg(conso E85) / avg(conso SP98) − 1 (repli 0.2)
function statsComputeSurconso_(recs) {
  const sorted = recs.filter(r => Number(r.km) > 0)
    .sort((a, b) => (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0));
  const e85 = [], s98 = [];
  for (let i = 1; i < sorted.length; i++) {
    const dk = Number(sorted[i].km) - Number(sorted[i - 1].km);
    const lit = Number(sorted[i].litres);
    if (dk <= 0 || lit <= 0) continue;
    const conso = (lit / dk) * 100;
    if (sorted[i].fuel === 'E85') e85.push(conso);
    else if (sorted[i].fuel === 'SP98') s98.push(conso);
  }
  if (!e85.length || !s98.length) return DEFAULT_SURCONSO_GS;
  const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
  const s = avg(e85) / avg(s98) - 1;
  return isFinite(s) && s > 0 ? s : DEFAULT_SURCONSO_GS;
}

function handleStats(e) {
  // U7 — filtrage par compte (email du token vérifié ; ou propriétaire en mode souple).
  const email = resolveOwner_(e, null);
  if (!email) return unauthorizedResponse_();

  const veh  = e && e.parameter && e.parameter.veh  ? String(e.parameter.veh)  : '';
  const year = e && e.parameter && e.parameter.year ? parseInt(e.parameter.year, 10) : 0;

  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = getOrCreateSheet(ss);
  const data  = sheet.getDataRange().getValues();

  const cache    = CacheService.getScriptCache();
  const cacheKey = 'stats_v2|' + email + '|' + veh + '|' + year + '|' + data.length;
  const cached   = cache.get(cacheKey);
  if (cached) return jsonResponse(JSON.parse(cached));

  if (data.length <= 1) return jsonResponse({ months: [], kpis: null, vehicles: [], generatedAt: new Date().toISOString() });

  const headers = data[0].map(String);
  const idx = name => headers.indexOf(name);
  const iDate = idx('Date'), iType = idx('Type'), iKm = idx('Km compteur'),
        iLit = idx('Nb. Litres'), iPrix = idx('Prix €/L'),
        iVeh = idx('Véhicule'), iStation = idx('Station essence'),
        iSP98 = idx('SP98 station (€/L)'), iHoro = idx('Horodatage');

  // Normalisation des lignes (filtre véhicule optionnel)
  const recs = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    if (!_rowBelongsTo_(row[IDX_EMAIL], email)) continue;   // U7 — pleins du compte uniquement
    const vname = iVeh >= 0 ? String(row[iVeh] || '') : '';
    if (veh && vname !== veh) continue;
    const d = statsParseDate_(iDate >= 0 ? row[iDate] : (iHoro >= 0 ? row[iHoro] : ''));
    recs.push({
      date: d,
      fuel: statsFuelKey_(iType >= 0 ? row[iType] : ''),
      km: Number(iKm >= 0 ? row[iKm] : 0) || 0,
      litres: Number(iLit >= 0 ? row[iLit] : 0) || 0,
      prix: Number(iPrix >= 0 ? row[iPrix] : 0) || 0,
      sp98: Number(iSP98 >= 0 ? row[iSP98] : 0) || 0,
      veh: vname,
      station: iStation >= 0 ? String(row[iStation] || '').trim() : ''
    });
  }

  const surconso = statsComputeSurconso_(recs);

  // Année cible : paramètre ou année la plus récente
  let anneeMax = 0;
  recs.forEach(r => { if (r.date && r.date.getFullYear() > anneeMax) anneeMax = r.date.getFullYear(); });
  const anneeCible = year > 0 ? year : anneeMax;

  // Agrégats mensuels + CO2
  const months = {}, order = [];
  let co2Total = 0;
  recs.forEach(r => {
    if (!r.date) return;
    const k = statsMonthKey_(r.date);
    if (!months[k]) { months[k] = { key: k, cost: 0, litres: 0, co2: 0 }; order.push(k); }
    months[k].cost   += r.litres * r.prix;
    months[k].litres += r.litres;
    if (r.fuel === 'E85' && r.litres > 0) {
      const co2 = (r.litres / (1 + surconso)) * CO2_ESSENCE_PER_L_GS - r.litres * CO2_E85_PER_L_GS;
      months[k].co2 += co2;
      co2Total += co2;
    }
  });
  order.sort();
  const monthsArr = order.map(k => ({
    key: k,
    cost: Math.round(months[k].cost * 100) / 100,
    litres: Math.round(months[k].litres * 10) / 10,
    co2: Math.round(months[k].co2 * 10) / 10
  }));

  // KPIs de l'année cible
  const yearRecs = recs.filter(r => r.date && r.date.getFullYear() === anneeCible);
  const kmByVehYear = {}, stationCnt = {};
  let litresY = 0, costY = 0;
  yearRecs.forEach(r => {
    litresY += r.litres;
    costY   += r.litres * r.prix;
    if (r.station) stationCnt[r.station] = (stationCnt[r.station] || 0) + 1;
    if (r.km > 0) {
      const o = kmByVehYear[r.veh] || (kmByVehYear[r.veh] = { min: r.km, max: r.km });
      if (r.km < o.min) o.min = r.km;
      if (r.km > o.max) o.max = r.km;
    }
  });
  let kmY = 0;
  Object.keys(kmByVehYear).forEach(v => { kmY += kmByVehYear[v].max - kmByVehYear[v].min; });
  let topStation = '', topN = -1;
  Object.keys(stationCnt).forEach(s => { if (stationCnt[s] > topN) { topN = stationCnt[s]; topStation = s; } });

  const kpis = {
    year: anneeCible,
    pleins: yearRecs.length,
    litres: Math.round(litresY * 10) / 10,
    cost: Math.round(costY),
    km: Math.round(kmY),
    station: topStation
  };

  // Comparatif par véhicule (km = max−min compteur, conso & coût /100 km)
  const vAgg = {};
  recs.forEach(r => {
    if (!r.veh) return;
    const o = vAgg[r.veh] || (vAgg[r.veh] = { litres: 0, cost: 0, min: null, max: null });
    o.litres += r.litres;
    o.cost   += r.litres * r.prix;
    if (r.km > 0) {
      if (o.min === null || r.km < o.min) o.min = r.km;
      if (o.max === null || r.km > o.max) o.max = r.km;
    }
  });
  const vehicles = Object.keys(vAgg).map(v => {
    const o = vAgg[v];
    const dist = (o.min !== null && o.max !== null) ? o.max - o.min : 0;
    return {
      nom: v,
      litres: Math.round(o.litres * 10) / 10,
      cost: Math.round(o.cost),
      km: dist,
      consoPer100: dist > 0 ? Math.round(o.litres / dist * 100 * 100) / 100 : 0,
      costPer100:  dist > 0 ? Math.round(o.cost   / dist * 100 * 100) / 100 : 0
    };
  }).filter(x => x.km > 0).sort((a, b) => a.costPer100 - b.costPer100);

  const result = {
    generatedAt: new Date().toISOString(),
    year: anneeCible,
    surconso: Math.round(surconso * 1000) / 1000,
    co2Total: Math.round(co2Total * 10) / 10,
    months: monthsArr,
    kpis,
    vehicles
  };

  try { cache.put(cacheKey, JSON.stringify(result), 3600); } catch (err) { /* cache > 100 Ko : ignoré */ }
  return jsonResponse(result);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
