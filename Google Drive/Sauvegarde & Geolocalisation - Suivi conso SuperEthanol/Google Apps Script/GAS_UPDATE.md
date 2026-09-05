# Suivi E85 — Google Apps Script — v4.19.0.0

## Déploiement

1. Ouvrir le Google Sheet → **Extensions → Apps Script**
2. Remplacer tout le contenu de `Code.gs` par le fichier `Code.gs` de ce dossier
3. **Déployer → Gérer les déploiements → Nouvelle version → Déployer**
4. Copier l'URL de déploiement et la reporter dans `js/config.js` → `GAS_URL`

> ⚠️ **v3.7.0.0 (S12)** : l'endpoint `?action=stats` n'est actif **qu'après un redéploiement** (étape 3, *Nouvelle version*). Tant que ce n'est pas fait, l'app web bascule automatiquement sur son **calcul local** (aucune erreur visible, le résumé annuel reste affiché via le repli).

> ⚠️ **P1 (app v4.10.0.0)** : nouveaux endpoints `?action=getParametres` (GET) et `action=setParametres` (POST) pour les **paramètres métier partagés** (onglet `Parametres`, créé automatiquement au 1ᵉ appel). Actifs **qu'après un redéploiement** (*Nouvelle version*). Tant que ce n'est pas fait, l'app et Excel continuent d'utiliser leurs valeurs locales (aucune erreur visible, simplement pas de synchro des réglages).

> ⚠️ **W91b (app v5.33.6.0)** : nouveaux endpoints `?action=getDepenses` (GET) et `action=setDepenses` (POST) pour les **dépenses d'entretien par véhicule** (onglet `Depenses`, créé automatiquement au 1ᵉ appel). Synchro **par ligne**, last-write-wins sur `id` (tombstone `supprime`). Actifs **qu'après un redéploiement** (*Nouvelle version*). Tant que ce n'est pas fait, l'app stocke les dépenses en local uniquement (aucune erreur visible, pas de synchro). `handleDeleteAccount` (RGPD) purge aussi les dépenses du compte.

---

## Configuration requise

| Constante       | Valeur                                        |
|-----------------|-----------------------------------------------|
| `SPREADSHEET_ID`| ID du Google Sheet (extrait de l'URL)          |
| `SHEET_NAME`    | `_ImportGS` (créé automatiquement)             |
| `STATIONS_SHEET`| `Stations`                                    |
| `VEHICULES_SHEET`| `Vehicules`                                  |
| `PARAMS_SHEET`  | `Parametres` (créé automatiquement — P1)       |
| `DEPENSES_SHEET`| `Depenses` (créé automatiquement — W91b)       |

### Onglet `Parametres` (P1 — paramètres métier partagés app ⇆ Excel)
Table `cle | valeur | modifie_le` (horodatage epoch ms UTC). Source de vérité unique, synchronisée par **last-write-wins par clé**. Clés autorisées (constante `PARAM_KEYS`) : `kit_prix`, `budget_mensuel`, `objectif_co2`, `surconso`, `seuil_E85/GAZOLE/SP98` (+ `_enabled`), postes rentabilité (`cout_pose`, `cout_carte_grise`, `cout_entretien`, `surcout_assurance`, `aide_deduite`, `carburant_ref`, `ecart_ref`, `proj_nb_recents`, `conso_diesel_ref`, `vehicule_diesel_ref`), et **`conversion_veh`** (W91d — blob JSON des coûts de conversion par véhicule, LWW sur l'ensemble). Endpoints : `getParametres` (lecture) / `setParametres` (upsert, n'écrase que si `modifie_le` entrant ≥ stocké).

### Onglet `Depenses` (W91b — dépenses d'entretien par véhicule)
Table par ligne `id | vehicule | date | categorie | intitule | montant | modifie_le | supprime | email` (email en col I, préserve la lecture A:H pour Excel/PowerQuery). Synchro **last-write-wins par `id`** sur `modifie_le` (epoch ms) ; `supprime = 1` = tombstone propagé. Endpoints : `getDepenses` (lecture, renvoie tombstones inclus) / `setDepenses` (upsert LWW). Rattaché au compte via `email` (multi-utilisateur, comme `Parametres`).

### Clé Gemini (optionnel — scan ticket)
Extensions → Apps Script → Paramètres du projet → Propriétés de script  
→ Ajouter `GEMINI_API_KEY`

---

## Schema de la feuille `_ImportGS`

| Col | Lettre | Nom                   | Type       |
|-----|--------|-----------------------|------------|
| 1   | A      | Horodatage            | Date/heure |
| 2   | B      | Date                  | Date       |
| 3   | C      | Type                  | Texte      |
| 4   | D      | Km compteur           | Nombre     |
| 5   | E      | Nb. Litres            | Nombre     |
| 6   | F      | Prix €/L              | Nombre     |
| 7   | G      | Station essence       | Texte      |
| 8   | H      | Véhicule              | Texte      |
| 9   | I      | E85 station (€/L)     | Nombre     |
| 10  | J      | SP98 station (€/L)    | Nombre     |
| 11  | K      | SP95 station (€/L)    | Nombre     |
| 12  | L      | E10 station (€/L)     | Nombre     |
| 13  | M      | Gazole station (€/L)  | Nombre     |
| 14  | N      | GPLc station (€/L)    | Nombre     |
| 15  | O      | sync_id               | UUID       |

---

## Actions `doGet`

| Paramètre        | Comportement                              |
|------------------|-------------------------------------------|
| `?action=export` | Retourne tous les enregistrements en JSON |
| `?v=mobile`      | Page HTML mobile (iphone.html)            |
| _(aucun)_        | Page HTML index                           |

Réponse `export` : `{ records: [ { "Horodatage": "...", "Date": "...", ..., "sync_id": "..." }, ... ] }`

---

## Actions `doPost`

### Plein depuis l'app web _(aucun `action`)_
```json
{
  "date": "2025-05-15",
  "type": "E85",
  "km": 87543,
  "litres": 42.5,
  "prix": 0.799,
  "station": "Total Autobahn",
  "vehicule": "Kangoo",
  "sync_id": "uuid-optionnel",
  "stationPrices": { "E85": 0.799, "SP98": 2.089 }
}
```
Retourne : `{ "success": true, "sync_id": "uuid-généré-ou-fourni" }`

---

### `addStation`
```json
{ "action": "addStation", "station": "Leclerc Niort" }
```
Ajoute une ligne dans l'onglet `Stations`.

---

### `syncStations`
```json
{ "action": "syncStations", "stations": ["Leclerc Niort", "Total Autobahn"] }
```
Remplace tout le contenu de l'onglet `Stations`.

---

### `addVehicule`
```json
{ "action": "addVehicule", "vehicule": "Kangoo" }
```
Ajoute dans l'onglet `Vehicules` (dédupliqué).

---

### `removeVehicule`
```json
{ "action": "removeVehicule", "vehicule": "Kangoo" }
```
Supprime la première ligne correspondante dans `Vehicules`.

---

### `bulkAdd`
Envoyé par le VBA Excel lors du **premier sync** (import initial vers GS).  
Déduplique par `sync_id` — ne crée que les lignes absentes.

```json
{
  "action": "bulkAdd",
  "rows": [
    {
      "sync_id":     "uuid-1",
      "horodatage":  "2025-05-15 10:30:00",
      "date":        "2025-05-15",
      "type":        "E85",
      "km":          87543,
      "litres":      42.5,
      "prix":        0.799,
      "station":     "Total Autobahn",
      "vehicule":    "Kangoo",
      "stationPrices": { "E85": 0.799, "SP98": 2.089 }
    }
  ]
}
```
Retourne : `{ "success": true, "added": N, "skipped": M }`

---

### `bulkUpdate` _(v2.9.0.0 — sync bidirectionnel)_
Envoyé par le VBA Excel lors d'un **sync bidirectionnel** : propage les lignes modifiées dans Excel vers GS.

- Ligne trouvée par `sync_id` → MAJ cols **B–N** (col A `Horodatage` préservée)
- Ligne absente du GS → upsert (`appendRow`, cas de désynchronisation)

```json
{
  "action": "bulkUpdate",
  "rows": [
    {
      "sync_id":  "uuid-existant",
      "date":     "2025-05-16",
      "type":     "E85",
      "km":       87890,
      "litres":   41.0,
      "prix":     0.802,
      "station":  "Leclerc Niort",
      "vehicule": "Kangoo",
      "stationPrices": { "E85": 0.802 }
    }
  ]
}
```
Retourne : `{ "status": "ok", "updated": N, "added": M }`  
Le VBA vérifie l'absence de `"error"` dans la réponse avant d'effacer le marqueur `Modifie_local` (col P).

---

### `scanTicket` _(W17 — nécessite GEMINI_API_KEY)_
```json
{
  "action":      "scanTicket",
  "imageBase64": "<base64>",
  "mimeType":    "image/jpeg"
}
```
Retourne :
```json
{
  "success": true,
  "data": {
    "date": "2025-05-15",
    "km": 87543,
    "litres": 42.5,
    "prix_litre": 0.799,
    "montant_total": 33.95,
    "type_carburant": "E85",
    "station": "Total Autobahn"
  }
}
```

---

## Fonctions de migration (à exécuter manuellement une fois)

| Fonction              | Quand l'utiliser                                              |
|-----------------------|---------------------------------------------------------------|
| `migrateHeaders()`    | Réécrire les 15 en-têtes A→O (après changement de schéma)    |
| `migrateSyncId()`     | Générer les `sync_id` manquants sur les lignes existantes     |
| `migrateRemoveS98()`  | ⚠️ Supprimer l'ancienne col G "Prix S98 jour" (v2.3.0.0)     |

---

## 🆕 v4.19.0.0 — Prix historique à la saisie : 6 carburants (W62)

Complète W61 : à la saisie d'un **plein à une date passée**, l'app remplit le champ **Prix** depuis `_PrixHistory` aussi pour **SP95 / E10 / GPLc** (avant : E85/Gazole/SP98 ; les 3 autres affichaient « non relevé »).

### Fichier à recoller dans l'éditeur Apps Script
1. **`Code.gs`** — `handleSectorPrices` : `TOKENS` étendu (SP95/E10/GPLc) + lecture `SECTOR_BEST_TODAY` **insensible à la casse** (`GPLc` ↔ `GPLC`).

### Étapes de redéploiement
1. Recoller `Code.gs` (Extensions → Apps Script) **ou** `npm run gas:deploy`.
2. **Déployer → Gérer les déploiements → (crayon) → Nouvelle version → Déployer** *(même ID → `GAS_URL` inchangé)* — **requis** pour que `?action=sectorPrices&fuel=SP95|E10|GPLC` renvoie les données (dégradation propre entre-temps : repli « prix du jour »).
3. Test rapide (token requis) : `…/exec?action=sectorPrices&fuel=SP95&token=…` → `byDate` non vide une fois `_PrixHistory` peuplé (W61).

> Côté app, `js/config.js` (APP_VERSION) et `js/secteur.js` (`HIST_FUELS`) sont déjà à jour dans le repo.

---

## 🆕 v4.18.0.0 — 3 carburants de plus : SP95, E10, GPLc (W61)

Étend le relevé quotidien de **E85 + Gazole + SP98** à **6 carburants** (ajout **SP95, E10, GPLc**) dans `_PrixHistory`, avec synchronisation Excel.

### Fichier à recoller dans l'éditeur Apps Script
1. **`RefreshPrix.gs`** — constante `FUELS` étendue (champs API ODS `sp95_prix` / `e10_prix` / `gplc_prix`).

*(Aucun autre `.gs` à modifier : `WebPush.gs` et `Code.gs` sont inchangés.)*

### Étapes de redéploiement
1. Recoller `RefreshPrix.gs` (Extensions → Apps Script) **ou** `npm run gas:deploy`.
2. *(facultatif)* **Déployer → Gérer les déploiements → (crayon) → Nouvelle version → Déployer** — pour que `?action=lowprices` renvoie aussi les nouveaux carburants *(garder le même ID → `GAS_URL` inchangé)*.
3. Exécuter une fois **`testRefreshPrix()`** → vérifier dans les logs :
   `E85=… GAZOLE=… SP98=… SP95=… E10=… GPLc=…` et de nouvelles lignes dans `_PrixHistory`.
4. Le trigger quotidien (`installerTriggerRefreshPrix`) reste valide — rien à refaire.

### Côté Excel
- **Power Query** : *Données → Actualiser tout* (la requête `PrixHistory.m` recopie les 4 colonnes → les nouveaux carburants apparaissent **sans modification**).
- **Feuille « Prix par Station »** : réimporter `vba/modPrixStation.bas` (corrige **E10 ≠ SP95**, libellé **GPLc**) puis relancer `MAJ_PrixParStation`. Idem `vba/modGraphiques.bas` (libellé GPLc).

### Migration automatique (transparente)
- `_PrixHistory` : **aucune migration** (colonne `Type` existante ; on y écrit en plus `SP95`/`E10`/`GPLc`).
- **Push** : pas de notification pour ces 3 carburants — `_PushSubs` n'a pas de seuil SP95/E10/GPLc, donc `WebPush.gs` les ignore. Comportement voulu.

---

## 🆕 v3.10.0.0 — Prix secteur & alertes push MULTI-CARBURANT (W48 / W49)

Étend le relevé quotidien, le secteur et le push de l'**E85 seul** à **E85 + Gazole + SP98**.

### Fichiers à recoller dans l'éditeur Apps Script
1. **`RefreshPrix.gs`** — relevé des 3 carburants, `SECTOR_BEST_TODAY` / `LAST_LOW_PRICES` par carburant, push multi.
2. **`WebPush.gs`** — `envoyerPushPrixBasMulti`, `_PushSubs` avec seuils par carburant.
3. **`Code.gs`** — `action=sectorPrices&fuel=…`, nouvelle `action=lowprices`.

### Étapes de redéploiement
1. Recoller les 3 fichiers ci-dessus dans l'éditeur (Extensions → Apps Script).
2. **Déployer → Gérer les déploiements → (crayon) → Nouvelle version → Déployer**
   *(garder le même ID de déploiement → `GAS_URL` inchangé).*
3. Exécuter une fois **`testRefreshPrix()`** → vérifier dans les logs :
   `E85=0.xxx  GAZOLE=1.xxx  SP98=1.xxx` et des lignes ajoutées à `_PrixHistory`.
4. (Optionnel) **`testEnvoyerPush()`** → force une push de test (E85/Gazole/SP98) à tous les abonnés.
5. Le trigger quotidien (`installerTriggerRefreshPrix`) reste valide — rien à refaire.

### Migration automatique (transparente)
- `_PrixHistory` : **aucune migration** (la colonne `Type` existait déjà ; on y écrit `E85`/`GAZOLE`/`SP98`).
- `_PushSubs` : 3 colonnes ajoutées automatiquement au 1er enregistrement d'abonnement
  (`F SeuilE85 · G SeuilGazole · H SeuilSP98`) ; la colonne `D Seuil` (héritée) reste le seuil E85.
- `SECTOR_BEST_TODAY` (ancien format plat E85) est lu en repli → E85 jusqu'au 1er nouveau refresh.

### Nouvelles actions `doGet`
| Paramètre | Comportement |
|---|---|
| `?action=sectorPrices&fuel=GAZOLE` | byDate + meilleur prix du jour pour le carburant (défaut `E85`) |
| `?action=lowprices` | Meilleurs prix du jour par carburant `{ E85:{…}, GAZOLE:{…}, SP98:{…} }` (lu par le Service Worker) |
| `?action=lowprice` | _(rétrocompat)_ dernier prix E85 bas, format plat |

### `savePushSub` (doPost) — seuils par carburant
```json
{ "action": "savePushSub", "subscription": { "...": "..." },
  "seuils": { "E85": 0.85, "GAZOLE": 1.60, "SP98": null } }
```
`null` = carburant désactivé (pas d'alerte). L'ancien champ `"seuil"` reste accepté (→ E85).

---

## Historique des versions GAS

| Version   | Date       | Changements                                                         |
|-----------|------------|---------------------------------------------------------------------|
| 4.19.0.0  | 2026-06-04 | W62 : prix historique saisie SP95/E10/GPLc — `handleSectorPrices` `TOKENS` étendu + lecture `SECTOR_BEST_TODAY` insensible à la casse |
| 4.18.0.0  | 2026-06-04 | W61 : `FUELS` étendu à 6 carburants (+SP95/E10/GPLc) → `_PrixHistory` + sync Excel ; push inchangé |
| 3.10.0.0  | 2026-05-30 | Multi-carburant : relevé/secteur/push E85+Gazole+SP98 ; `lowprices`, `sectorPrices&fuel`, `_PushSubs` seuils par carburant |
| 2.9.0.0   | 2026-05-26 | Sync bidir. : `bulkUpdate` (Excel → GS, upsert par sync_id)        |
| 2.5.0.0   | —          | `bulkAdd`, `handleExport`, `action=export` doGet, Gemini scan       |
| 2.3.0.0   | —          | Suppression col G "Prix S98 jour" — `migrateRemoveS98()`            |
| 2.1.3.0   | —          | `addVehicule`, `removeVehicule`, onglet Vehicules                   |
| 2.0.0.0   | —          | `sync_id` col O, `migrateSyncId()`, `migrateHeaders()`              |
| 1.x       | —          | Saisie plein simple (A→I, 9 colonnes)                               |
