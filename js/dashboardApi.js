/* ─── W83/W84 — Client du bilan Google Sheets (endpoint GAS action=buildDashboard) ───
   Permet, depuis l'app, de reconstruire à la demande l'onglet dashboard du Google
   Sheet (comme le menu onOpen + le déclencheur quotidien de G4) et d'ouvrir le
   classeur. L'action est filtrée par compte côté GAS (resolveOwner_ via idToken),
   donc réservée aux sessions connectées.
   Tolérant aux pannes : renvoie { ok:false } si l'endpoint est absent / hors-ligne. */
import { GAS_URL, APP_TOKEN, GS_SHEET_ID } from './config.js';
import { getIdToken } from './auth.js';

/** URL de reconstruction du dashboard (testable, sans I/O). */
export function buildDashboardUrl(base, token, idToken = '') {
  let url = base + '?action=buildDashboard';
  if (token)   url += '&token=' + encodeURIComponent(token);
  if (idToken) url += '&idToken=' + encodeURIComponent(idToken);   // U7 — identité du compte
  return url;
}

/** URL d'édition du Google Sheet (testable). Null si aucun identifiant. */
export function sheetEditUrl(sheetId = GS_SHEET_ID) {
  return sheetId ? `https://docs.google.com/spreadsheets/d/${sheetId}/edit` : null;
}

/**
 * Déclenche la reconstruction du dashboard côté serveur.
 * Renvoie { ok:true, data } en cas de succès, { ok:false, error } sinon.
 */
export async function refreshDashboard() {
  const idToken = getIdToken();
  if (!idToken) return { ok: false, error: 'not-authed' };
  try {
    const url  = buildDashboardUrl(GAS_URL, APP_TOKEN, idToken);
    const resp = await fetch(url, { redirect: 'follow' });
    if (!resp.ok) return { ok: false, error: 'http-' + resp.status };
    const data = await resp.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}
