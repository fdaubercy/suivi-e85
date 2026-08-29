# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

## [5.32.5.0] — 2026-08-29

### Added
- **Web — Jauge « Atteinte de rentabilité » sous la tuile Économie nette (W89)** — nouvelle barre de progression (`buildRentaBar`) affichant le **% d'amortissement de la conversion** : `progression = économie brute cumulée / coût total de conversion`, plafonnée à 100 %. Reprend le style des jauges existantes (`gauge-track`/`gauge-tick`/`gauge-scale`, transition de remplissage), teinte bleue distincte de l'objectif CO₂ ; passe au vert « 🎉 rentabilité atteinte » quand l'économie nette repasse ≥ 0, sinon affiche « reste X € à amortir » et le pourcentage. `js/stats.js`, `css/style.css`.

## [5.32.4.0] — 2026-08-14

### Added
- **Excel — liste déroulante « Carburant de référence » sur N12 (W89)** — `modRentabilite.EnsureCarburantRefDropdown` pose une validation de données de type **liste** intégrée à la cellule `Suivi Carburant`!N12 (**SP98 / SP95 / E10 / GAZOLE**), avec message d'aide, et **déverrouille N12** (`Locked = False`) pour la rendre éditable même feuille protégée. Idempotent (re-posé par `InstallerParametresRentabilite`). L'utilisateur choisit le carburant de comparaison directement dans la cellule (flèche déroulante), `GAZOLE` activant le mode diesel. Vérifié live (Type=xlValidateList, InCellDropdown, N12 déverrouillée). `vba/modRentabilite.bas`.

## [5.32.3.0] — 2026-08-14

### Added
- **Excel — CO₂ évité diesel-aware (W89, tuiles + graphique)** — le CO₂ évité du dashboard Excel honore désormais `carburant_ref = GAZOLE` (avant : toujours essence). Généralisé sur le modèle du web (`refEq = litres × ratioConso ; CO₂ = refEq × co2Ref − litres × CO2_E85`) :
  - **`modDashboardKPI.ComputeDashboardStats`** (tuile KPI CO₂) : `ratioConso`/`co2RefPerL` selon N12 — essence `1/(1+surconso)`×2,21 (**inchangé**), diesel `consoDiesel/consoE85`×2,68 avec `consoDiesel = CONSO_DIESEL_REF (R15)` et `consoE85 = B7×(1+J8)`. Helpers `CarburantRef`/`ConsoDieselRef`/`ConsoE85Ref`. Vérifié live : SP98 **261,78 kg** (baseline inchangée) → GAZOLE **422,94 kg**.
  - **`modGraphData.BuildAggregates`** (graphique gCo2, série mensuelle) : même généralisation via helper `RefModelCO2`. Recompilé + `CreerGraphiquesWeb` relancé sans erreur.
  - Constante `CO2_GAZOLE_PER_L = 2,68` ajoutée (`modGraphCfg` + `modDashboardKPI`). `vba/modDashboardKPI.bas`, `vba/modGraphData.bas`, `vba/modGraphCfg.bas`.

## [5.32.2.0] — 2026-08-14

### Added
- **Excel — dashboard rentabilité en mode diesel (W89 Phase 2, complète)** — le calcul d'économie du classeur honore désormais `carburant_ref = GAZOLE`. `modRentabilite` :
  - **`EnsureDieselRefParams`** (nouveau) pose la zone auxiliaire diesel sur « Suivi Carburant » : `R13` conso diesel manuelle (Name `CONSO_DIESEL_MANUEL`, défaut 5,5), `R14` véhicule diesel de référence (Name `VEHICULE_DIESEL_REF`), `R15` conso diesel **effective** (Name `CONSO_DIESEL_REF`) = mesurée sur les pleins gazole du véhicule choisi (`AVERAGEIFS … "*azole*"`), sinon manuelle, sinon 5,5.
  - **`EnsureEquivRefFormula`** rendue **conditionnelle** : branche essence (X67, `litres/(1+surconso)×(Prix S98 − ECART_REF)`) **strictement préservée** ; branche diesel = `litres × (CONSO_DIESEL_REF / consoE85) × prix gazole du plein`, avec `consoE85 = B7×(1+J8)` et le prix gazole récupéré **inline** via `INDEX(GS_Pleins[Gazole station], …)` (aucune colonne ajoutée à `Tableau2`). Plein sans prix gazole relevé → équiv vide (dégradation propre).
  - **`modSyncParametres`** transporte `conso_diesel_ref` → `R13` et `vehicule_diesel_ref` → `R14` (P1, LWW). Déployé COM + `InstallerParametresRentabilite` exécuté (compile OK), vérifié live (essence somme 567,42 inchangée ; diesel somme 440,38 ; N12 restauré). `vba/modRentabilite.bas`, `vba/modSyncParametres.bas`.
- **Limite connue** : la tuile CO₂ du dashboard Excel reste basée sur l'essence (le CO₂ évité vs diesel est calculé côté app web). Le facteur CO₂ gazole (2,68) n'est pas encore câblé dans les tuiles Excel.

## [5.32.1.0] — 2026-08-14

### Fixed
- **GAS — whitelist `PARAM_KEYS` étendue (W89 Phase 2 partielle + correctif latent)** — `handleSetParametres` filtre les clés entrantes par `PARAM_KEYS` (anti-pollution, `Code.gs:1079`) ; la liste ne contenait que les 10 clés d'origine. Conséquence : les **8 clés de rentabilité X67-X70** (`cout_pose`, `cout_carte_grise`, `cout_entretien`, `surcout_assurance`, `aide_deduite`, `carburant_ref`, `ecart_ref`, `proj_nb_recents`) — pourtant poussées par l'app et Excel depuis v5.31.9.0 — étaient **silencieusement rejetées côté serveur** (jamais persistées → pas de sync cross-appareil). Ajout de ces 8 clés **+ `conso_diesel_ref`, `vehicule_diesel_ref`** (comparaison E85 vs diesel). Déployé en prod (GAS **v62**, URL `/exec` inchangée). `Code.gs`.

### Notes
- **W89 côté Excel (dashboard rentabilité en mode diesel) : différé.** Les écritures COM `vba-agent set-module` ont hangé (machine chargée) ; le calcul dashboard Excel en mode gazole exige de surcroît un changement structurel (colonne « Prix Gazole jour » à ajouter à `Tableau2`, qui n'expose pas le prix gazole). La fonctionnalité **fonctionne intégralement web↔GS** sans ce lot. Repris via tâche dédiée + `docs/superpowers/plans/2026-08-14-comparaison-e85-diesel.md` (Tasks 8-9).

## [5.32.0.0] — 2026-08-14

### Added
- **Web — comparaison E85 vs carburant au choix, dont le diesel (Phase 1)** — le sélecteur « Carburant de référence » (⚙️ Réglages → Conversion E85) accepte désormais **Gazole (diesel)** en plus de SP98/SP95/E10. Le choix pilote **toute** la rentabilité affichée : économie brute/nette, CO₂ évité, bannière temps réel de station et rapport mensuel. Nouveau module pur **`js/refmodel.js`** (modèle de référence unifié : `litresEquiv = litres_E85 × ratioConso`, `ratioConso = consoRef/consoE85` — essence `1/(1+surconso)`, diesel `consoDiesel/consoE85`), couvert par `tests/refmodel.test.js` (13 tests). En mode diesel, un **sélecteur de véhicule diesel de référence** apparaît : la conso L/100 est **mesurée sur ses pleins gazole**, sinon une conso de repli saisie, sinon **5,5 L/100** (berline). Prix de référence = prix gazole de la station ; facteur **CO₂ gazole = 2,68 kg/L**. Le calcul essence existant (SP98 − écart) est **strictement préservé**. Sync P1 étendue (clés `conso_diesel_ref`, `vehicule_diesel_ref`). Non-régression : 83 tests OK. `js/config.js`, `js/refmodel.js`, `js/stats.js`, `js/rentabilite.js`, `js/parametres.js`, `index.html`, `tests/refmodel.test.js`.
- ℹ️ **Parité Excel / Google Sheets (Phase 2)** à suivre : whitelist GAS `PARAM_KEYS` + `modRentabilite`/`modSyncParametres` (voir `docs/superpowers/plans/2026-08-14-comparaison-e85-diesel.md`).

## [5.31.10.0] — 2026-07-26

### Fixed
- **Excel — export PNG fiable des graphiques du Tableau de bord (X66)** — nouvel utilitaire `modGraphiques.ExportChartPNG(chartName, [filePath])` : `Chart.Export(…, "PNG")` renvoyait **0 octet** sur `gKitProj` (nuage `xlXYScatter` + courbe de tendance) tant que le graphique n'était pas **activé** au préalable (quirk Excel confirmé live : sans `Activate` → 0 o ; avec → ~10 Ko). La fonction active le graphe, exporte, puis **vérifie la taille du fichier** et renvoie `True`/`False` → plus d'échec silencieux qui troue un rapport. Déployé COM + prouvé live (`ExportChartPNG("gKitProj")` → **9890 octets**, `True`). Utilitaire `Public` appelable ; aucun pipeline d'export PNG ne l'invoque encore (`ExporterGraphiquesPDF` exporte la feuille entière en PDF, mécanisme distinct). `vba/modGraphiques.bas`.

## [5.31.9.0] — 2026-07-26

### Added
- **Web — paramétrage de la rentabilité dans Réglages (X67/X68/X69)** — la carte « 🔧 Conversion E85 » expose désormais tous les postes de coût one-off (**boîtier, pose, carte grise, entretiens supplémentaires, surcoût d'assurance, aide déduite**, 0 € accepté), le **carburant de référence** (SP98/SP95/E10) et l'**écart €/L vs SP98**, plus le **nombre de pleins récents** pour la projection. Champs `aria-label`és (a11y), câblés par `stats.js:initRentabiliteSettings` (persistance localStorage + propagation P1 `pushParam` vers le Sheet/Excel + `renderStats`). Sync : 8 nouveaux paramètres ajoutés à `parametres.js` (dont un type `str` pour `carburant_ref`). `index.html`, `js/stats.js`, `js/parametres.js`, `js/config.js`, `js/main.js`.

### Changed
- **Web — économie nette sur le coût total de conversion (X68)** — `stats.js` : nouveau `getCoutTotalConversion()` (boîtier + postes − aide, borné ≥ 0) ; l'économie nette se calcule sur ce total au lieu du seul boîtier. Le sous-texte de la tuile « Économie nette » indique « − conversion » au lieu de « − kit ». `js/stats.js`.
- **Web — carburant de référence configurable (X67)** — l'économie brute compare chaque plein E85 à `max(0 ; prix SP98 − écart)` (`getEcartRef()`, défaut 0 = SP98). `js/stats.js`.
- **Web — seuil de rentabilité temps réel dynamique (X67)** — la bannière station (`rentabilite.js`) n'utilise plus le seuil figé 0,66 : `seuilRentable(surconso) = 1/(1+surconso)` (+ marge « limite » de 0,04), surconso lue de la valeur synchronisée bornée. `js/rentabilite.js`.

### Fixed
- **Web — fiabilité de la surconso (X70)** — `computeSurconso` borne la surconso mesurée à `[0,15 ; 0,40]` (`clampSurconso`, aligné sur le clamp Excel J8) pour absorber un échantillon de pleins SP98 trop faible. `js/stats.js`.

## [5.31.8.0] — 2026-07-26

### Changed
- **Excel — carburant de référence configurable (X67)** — la colonne `Tableau2[Coût Plein équiv. S98]` compare désormais chaque plein E85 à `MAX(0 ; prix SP98 du jour − ECART_REF)` (au lieu du prix SP98 brut). `ECART_REF` (€/L, cellule N13, défaut 0) permet de comparer à un carburant réellement utilisé (E10/SP95 ≈ SP98 − écart). Écart 0 = comportement d'origine. `vba/modRentabilite.bas` (`EnsureEquivRefFormula`).
- **Excel — reste à amortir & progression sur le coût total (X68)** — `B12` = `MAX(0 ; COUT_TOTAL − B11)` et `J13` = `MIN(B11/COUT_TOTAL ; 1)` s'appuient sur **COÛT TOTAL de conversion** (boîtier + pose + carte grise + entretien + assurance − aide) au lieu du seul boîtier B6. `vba/modRentabilite.bas` (`EnsureCoutTotalWiring`).
- **Excel — date de rentabilité médiane + marge (X69)** — `J11` n'est plus une date sèche extrapolée du taux moyen : deux projections (taux **moyen** tout-historique `DATE_A` et taux **récent** sur les `PROJ_NB_RECENTS` derniers pleins E85 `DATE_B`) → `J11` = **médiane** des deux, annotée **« ± N j »** (cellule L11). Cellules auxiliaires nommées en zone technique (R4:S12). `vba/modRentabilite.bas` (`EnsureProjection`).

### Added
- **Excel — sync des paramètres de rentabilité (X67/X68/X69)** — `modSyncParametres.ParamDefs` mappe 8 nouveaux paramètres (`cout_pose`, `cout_carte_grise`, `cout_entretien`, `surcout_assurance`, `aide_deduite`, `carburant_ref`, `ecart_ref`, `proj_nb_recents`) entre « Suivi Carburant » (N6:N14), le miroir « Notes » et l'onglet Google Sheet « Parametres ». Round-trip vérifié (`SyncParametresManuel`). `vba/modSyncParametres.bas`.

### Fixed
- **Excel — fiabilité de la surconso (X70)** — `J8` borne la surconso à `[0,15 ; 0,40]` (`MEDIAN`) pour absorber un échantillon de pleins SP98 trop faible/bruité ; nouvel avertissement (L8) « ⚠ surconso peu fiable (n<4 pleins SP98) » quand moins de 4 pleins de référence. `vba/modRentabilite.bas` (`EnsureSurconsoGuard`).

## [5.31.7.0] — 2026-07-26

### Added
- **Excel — bloc « COÛT DE CONVERSION » paramétrable (X68, structure)** — nouveau module versionné et idempotent `vba/modRentabilite.bas` (`InstallerParametresRentabilite`) posant sur « Suivi Carburant » (colonnes M/N/O, lignes 5-14) les postes de coût one-off (**pose, carte grise, entretiens supplémentaires, surcoût d'assurance, aide/subvention déduite**, tous 0 € par défaut), la cellule **COÛT TOTAL** (`=MAX(0 ; boîtier + postes − aide)`), le carburant de référence (écart €/L) et le N de pleins récents pour la projection. 10 Names classeur associés (`COUT_BOITIER`→B6, `COUT_POSE`, `COUT_CARTEGRISE`, `COUT_ENTRETIEN`, `SURCOUT_ASSURANCE`, `AIDE_DEDUITE`, `COUT_TOTAL`, `CARBURANT_REF`, `ECART_REF`, `PROJ_NB_RECENTS`). **Strictement additif** : valeurs par défaut écrites uniquement si la cellule est vide (préserve les saisies au re-run) ; aucune donnée de plein touchée (Tableau2 : 25 lignes avant/après) ; feuille déprotégée/reprotégée. B6 relabelé « Coût du boîtier (kit) », valeur 514,54 € conservée. Déployé COM + exécuté live (compile-proof, idempotent). `vba/modRentabilite.bas`.

## [5.31.6.0] — 2026-07-03

### Changed
- **Excel — styles de galerie des graphiques du Tableau de bord (X64)** — application d'un `ChartStyle` de galerie à chaque graphique via le nouveau `modGraphRender.ApplyChartStyles`, appelé par `CreerGraphiquesWeb` après création de tous les graphiques (donc **persistant aux reconstructions** déclenchées par un changement de filtre) : gCost=13, gPrice=9, gVeh=11, gBudget=6, gCo2=9, gKitCumul=9, gCoutKm=12, gKitProj=6, gEcoDate=10, gScatterE85=6, gConso=10. Cas particuliers : titre de **gVeh** sur 2 lignes (retour après « Comparaison vehicules », idempotent) ; **gKitProj** conserve sa courbe de tendance en **orange** (`C_OBJ`) pointillé, réappliquée après le style. Injecté COM + `CreerGraphiquesWeb` relancé/vérifié live (11 `ChartStyle` conformes). `vba/modGraphRender.bas`, `vba/modGraphiques.bas`.

### Fixed
- **Excel — accumulation des courbes de tendance de `gKitProj`** — `AddKitProjChart` ajoutait une tendance à **chaque** reconstruction sans purger les précédentes (graphique réutilisé via `EnsureChart`, jamais recréé) → **45 tendances empilées** constatées en live. Purge des tendances existantes (`Do While .Trendlines.count > 0 … Delete`) avant d'en ajouter une → exactement 1 tendance après rebuild. `vba/modGraphRender.bas`.

## [5.31.5.0] — 2026-07-03

### Added
- **ROADMAP — propositions web app (W85–W88)** : W85 icônes PWA raster PNG 192/512 + maskable (manifest ne référence que `icon.svg`), W86 `screenshots` dans le manifest (invite d'installation enrichie), W87 modularisation des modules JS > 500 l. (`stats.js` 1184, `ticket.js` 759, `historique.js` 739, `stationsmap.js` 566), W88 raccourcis d'app supplémentaires (Carte, Stats). Aucune implémentation — propositions seules. `ROADMAP.md`.

## [5.31.4.0] — 2026-07-03

### Changed
- **Excel — modularisation VBA `modSyncGS` (X44, Phase 4 — module 4/4, fin de phase)** — extraction du diagnostic + rafraîchissement prix hors de `modSyncGS` (763 → 521 l.) vers **`modSyncDiag.bas`** (259 l.) : `TestConnexion` (HTTP GET brut), `SyncDiagnose` (comparaison GS↔Excel), `RafraichirPrixHistory` (refresh Power Query marché), toutes `Public`. Helpers `SetStatus`/`SetStatusBlock` **dupliqués `Private`** dans `modSyncDiag` (et non rendus Public : `SetStatus` est déjà `Public` dans `ModuleImportGS` → collision « Nom ambigu » évitée) ; `SetStatusBlock` retiré de `modSyncGS` (devenu code mort après extraction). `SyncSecretQS` reste `Public` dans `modSyncGS`. Config via `modSyncCfg`, HTTP via `modSyncNet`, JSON via `modSyncJson`. Injecté COM (`import` remove/import séparés) + Debug→Compile + run read-only (`GraphSheetExists`). `vba/modSyncGS.bas`, `vba/modSyncDiag.bas`.
- **X44 Phase 4 terminée** (4/4 modules) : tous les gros modules dashboard/sync découpés (`modGraphData`→`modGraphBlocks`, `modGraphRender`→`modGraphChrome`, `modSyncEngine`→`modSyncExport`, `modSyncGS`→`modSyncDiag`).

## [5.31.3.0] — 2026-07-03

### Changed
- **Excel — modularisation VBA `modSyncEngine` (X44, Phase 4 — module 3/4)** — extraction de l'export Excel→GS hors de `modSyncEngine` (677 → 458 l., < 500) vers **`modSyncExport.bas`** (231 l.) : `ExportExcelToGS` (bulkAdd), `ExportModificationsToGS` (bulkUpdate), `PushStationsToGS` (syncStations) rendus `Public` (appelés par `SyncCore`) + `RowToJson` (Private, sérialisation d'une ligne). `IsGarbageSid` passe `Public` dans `modSyncEngine` (partagé import/export). `modSyncEngine` conserve `SyncCore` + l'import GS→Excel + `ApplyGSDeletions`/`ToNum`/`LogToSyncLog`. Config via `modSyncCfg`, JSON via `modSyncJson`, HTTP via `modSyncNet` (déjà Public). Injecté COM (`import` remove/import séparés) + Debug→Compile + run read-only (`GraphSheetExists`). `vba/modSyncEngine.bas`, `vba/modSyncExport.bas`.

## [5.31.2.0] — 2026-07-03

### Changed
- **Excel — modularisation VBA `modGraphRender` (X44, Phase 4 — module 2/4)** — extraction du « chrome » du dashboard (bloc paramètres + bandeau + boutons image) hors de `modGraphRender` (550 → 432 l., < 500) vers **`modGraphChrome.bas`** (126 l.) : `EnsureParamBlock`, `EnsureHeaderBand`, `EnsureButtons` (Public) + `EnsurePictureButton` (Private). `StyleShape` passe `Public` dans `modGraphRender` (partagé entre `BuildKPICards` resté et `EnsurePictureButton` déplacé). `modGraphRender` conserve les `Add*Chart` + `BuildKPICards` + `EnsureChart`/`EnsureShape`/`DeleteChartByName`/`PurgeUnknown`. Config via `modGraphCfg` (consts Public). Injecté COM (`import` remove/import séparés) + Debug→Compile + compile-proof live (`CreerGraphiquesWeb` → dashboard régénéré). `vba/modGraphRender.bas`, `vba/modGraphChrome.bas`.

## [5.31.1.0] — 2026-07-03

### Changed
- **Excel — modularisation VBA `modGraphData` (X44, Phase 4 — module 1/4)** — extraction des constructeurs de blocs du dashboard hors de `modGraphData` (702 → 359 l., < 500) vers **`modGraphBlocks.bas`** (372 l.) : `BuildPriceBlockMerged`, `BuildConsoBlock`, `BuildVehiculesBlock` (Public) + helpers `InCsvSel`/`FindListObject`/`AddToSum` (Private). `modGraphData` conserve l'orchestration `BuildAggregates` + les helpers purs (`FuelKey`, `KitCost`, `EnsureDataSheet`…). Injecté COM (`import` remove/import séparés) + compile-proof live (`CreerGraphiquesWeb` → dashboard régénéré sans erreur). `vba/modGraphData.bas`, `vba/modGraphBlocks.bas`.

## [5.31.0.0] — 2026-07-02

### Added
- **GAS — dashboard Google Sheets enrichi + filtrage par compte (G4)** — `Dashboard.gs` / `construireDashboard(email)` :
  - **Filtrage par email (U7)** : le bilan n'agrège plus TOUS les comptes mais uniquement les pleins du propriétaire (`_rowBelongsTo_`, repli `OWNER_EMAIL`). `doGet?action=buildDashboard` résout le compte via `resolveOwner_` (idToken → ce compte, sinon owner). `Code.gs`.
  - **Graphiques additionnels** : consommation **L/100 km** par mois (méthode full-to-full), **prix moyen par carburant** (barres), **budget vs dépense mensuelle** (si `budget_mensuel` défini dans `Parametres`), en plus des 2 graphiques G3 (dépense mensuelle, CO₂ évité).
  - **Rafraîchissement** : menu `onOpen` « ⛽ Bilan → Rafraîchir le bilan » (toast de confirmation) + déclencheur quotidien optionnel (`installerTriggerDashboard`/`supprimerTriggerDashboard`, ~6 h).
  - ⚠️ Redéploiement GAS requis pour activer (Code.gs + Dashboard.gs).
- **Excel — auto-maintenance des listes de saisie (G5)** — `modValidation` : après un import réel (`ModuleImportGS.ImporterNouveauxPleins`), `RafraichirListesSaisie` alimente `tbl_vehicule` / `tbl_stationEssence` avec les valeurs déjà saisies dans `Tableau2` mais absentes des tables (dedup insensible à la casse, ordre d'apparition, valeurs vides ignorées), puis réinstalle les validations. Les dropdowns (G1) restent à jour sans intervention quand un nouveau véhicule/station apparaît. Idempotent, tolérant (un échec ne casse jamais l'import). `vba/modValidation.bas`, `vba/ModuleImportGS.bas`. Injecté COM + vérifié live (`RafraichirListesSaisie` OK).

### Fixed
- **Cohérence libellés carburant « Super 95/98 » (C1)** — `modGraphData.FuelKey` (agrégats dashboard) et `modPrixStation.FuelKeyP` reconnaissent désormais « Super 95 »/« Super 98 » (test `95`/`98` nu, avec `E10` prioritaire sur `95`) → un plein saisi « Super 95 » via la dropdown G1 est classé **SP95** (auparavant conservé en libellé brut → mauvais classement). Aligné sur la logique du GAS `statsFuelKey_` (déjà correcte, inchangé). Vérifié live : `FuelKeyP('Super 95')='SP95'`, `('Super 98')='SP98'`, `('E10')='E10'`. `vba/modGraphData.bas`, `vba/modPrixStation.bas`.

## [5.30.11.0] — 2026-07-02

### Added
- **GAS — onglet « Tableau de bord » natif Google Sheets (G3)** — consultation du bilan sur mobile/web sans ouvrir le `.xlsm` :
  - `Dashboard.gs` / `construireDashboard()` : agrège `_ImportGS` (exclut le soft-delete col `Supprimé`), calcule la **dépense mensuelle**, le **CO₂ évité** (E85, surconso dynamique réutilisée via `statsComputeSurconso_`) et les **KPIs** de l'année récente.
  - (Re)crée l'onglet « Tableau de bord » avec la table des mois, un bloc KPIs, et **2 graphiques natifs** (colonnes = dépense, courbe = CO₂ évité) via `insertChart`. Idempotent (supprime les charts existants avant reconstruction), placé en tête du classeur. **Additif** : ne modifie jamais les données sources.
  - Déclenchable via `GET ?action=buildDashboard&token=APP_TOKEN` (dispatcher `doGet`) ou depuis l'éditeur Apps Script.
  - Déployé en production (version GAS v60). Vérifié via l'API Sheets : onglet présent (index 0), 2 charts, 4 mois de données + KPIs. `Dashboard.gs`, `Code.gs`.

## [5.30.10.0] — 2026-07-02

### Added
- **Excel — listes déroulantes de saisie (G1)** — validation de données (listes déroulantes) sur le tableau de saisie `Suivi Carburant`/`Tableau2` :
  - **Type** → `tbl_carburant` (onglet `Notes`), **Station essence** → `tbl_stationEssence`, **Véhicule** → `tbl_vehicule`.
  - Nouvelle table `tbl_vehicule` créée dans `Notes` (colonne J), initialisée avec les véhicules distincts déjà saisis.
  - Sources exposées via plages nommées `lst_carburant`/`lst_station`/`lst_vehicule` référençant le **corps des tables** (=tbl_xxx) → les listes suivent l'ajout de valeurs sans reparamétrage.
  - Mode **avertissement** (`xlValidAlertWarning`) : la dropdown guide la saisie manuelle sans interdire une valeur nouvelle ; les écritures programmatiques (import GS/Excel) ne sont pas bloquées.
  - Macro versionnée **`modValidation.InstallerValidationsSaisie`** (idempotente), déverrouille la feuille protégée le temps de l'opération.
  - `tbl_carburant` nettoyé de ses 2 lignes vides finales. Vérifié par COM (3 dropdowns `xlValidateList` actives). `vba/modValidation.bas`.

## [5.30.9.0] — 2026-07-02

### Added
- **Excel — rebuild ciblé des objectifs (X43c-opt)** — nouveau scope de rebuild `rsCheap` : lorsque **seuls le budget (B2) et/ou l'objectif CO₂ (B3)** changent (véhicule/carburant/période/année/source des données inchangés, présence de la jauge budget préservée), le tableau de bord ne recalcule plus que les **cellules objectif** dérivées des paramètres — objectif CO₂ cumulé (col E), objectif budget 6 mois (col U), jauge budget annuel (AD3) — via `RefreshObjectifs`, **sans re-parcourir les données ni recréer les graphiques** (redraw automatique par liaison de plage). Complète le no-op `rsNone` de X43c. `ClassifyFilterDelta` distingue désormais `rsNone(0)`/`rsTargeted(1)`/`rsFull(2)`/`rsCheap(3)`. Vérifié par COM (col E recalculée pour CO₂=240 puis restaurée, col U/AD3 cohérents). `vba/modFiltres.bas`.

## [5.30.8.0] — 2026-07-02

### Fixed
- **Web — conformité a11y WCAG AA + gate bloquant (W81)** — correction des violations graves relevées par l'audit axe-core (W79), désormais **0 sur saisie/stats/historique** :
  - `select-name` (critical) : `#vehiculeSel` (sélecteur véhicule de la saisie) n'avait aucun nom accessible → ajout d'`aria-label="Véhicule du plein"`.
  - `color-contrast` (serious) : les boutons carburant **inactifs** (`.type-btn`/`.type-btn-sm` — SP98/SP95/E10/GAZOLE/GPLc) et `.scan-hint` utilisaient `--text-muted` (#6B7280 sur fond `--toggle-bg` #e5e7eb ≈ 3,65:1). Nouvelle variable thème-aware `--text-muted-strong` (#4b5563 clair / #cbd5e1 sombre) ≥ 4,5:1.
- **CI — durcissement du job `a11y` (W81)** — l'audit passe de non-bloquant à **bloquant** : `tests/a11y.spec.js` assère 0 violation grave (quand l'audit s'exécute ; une instabilité de navigation reste tolérée), `continue-on-error` retiré du workflow + `pipefail` pour ne plus masquer l'échec via `| tee`. `index.html`, `css/style.css`, `tests/a11y.spec.js`, `.github/workflows/ci.yml`.

## [5.30.7.0] — 2026-07-02

### Added
- **Excel — tests unitaires des fonctions pures VBA (X45)** — nouveau module versionné `vba/modTests.bas` (mini-framework d'assertions + `RunAllTests`) verrouillant les régressions de calcul (dont le bug date 6 sept/9 juin de v5.12.0.0). **32 assertions, 32/32 OK** en local. Couvre `FuelKeyK`, `FuelInSel`, `FuelKeyP`, `ParseGoogleDate` (US m/j/a vs FR j/m/a), `CoutPlein`, `ConsoL100`.
  - Fonctions rendues `Public` pour être testables : `ParseGoogleDate` (`ModuleImportGS`), `FuelKeyP` (`modPrixStation`), `CoutPlein` (`modHistorique`) — noms uniques, aucune collision.
  - Nouveau helper pur `ConsoL100(litres, distKm)` (`modDashboardKPI`), désormais utilisé par `ComputeDashboardStats` (le test protège le calcul réellement affiché).
  - Exécution **locale** (`Alt+F8 → RunAllTests`) : le VBA ne tourne pas en CI headless ; la présence/cohérence du module est garantie par `check_vba_drift` (X18). Lint VBA (X40) 0 violation. `vba/modTests.bas`, `vba/modDashboardKPI.bas`, `vba/ModuleImportGS.bas`, `vba/modPrixStation.bas`, `vba/modHistorique.bas`.

## [5.30.6.0] — 2026-07-02

### Removed
- **Excel — nettoyage code mort économie E85 (X53)** — suite à X47 (carte KPI « éco E85 » remplacée par « Rentabilité kit »), l'économie calculée n'était plus affichée :
  - `modDashboardGraphiques` : suppression de `vEcon` (assigné depuis `ds.eco`, jamais lu).
  - `modDashboardKPI` : suppression du champ `eco` du type `DashStats`, du calcul `ds.eco` dans `ComputeDashboardStats` (le CO₂ conserve `essEq`), et — constaté mort à l'analyse (aucun appelant, 3 params `ByRef` → non déclenchable par `OnAction`) — du `Sub ComputeKPIs` entier ainsi que de la fonction `DernierPrixSP98` (uniquement appelée par ce code mort). `ciSP98` retiré de `ComputeDashboardStats` (devenu inutile).
  - Vérifié : lint VBA (X40) 0 violation, injection COM + `MAJ_Dashboard_Graphiques` réexécuté sans erreur (compilation OK). `vba/modDashboardKPI.bas`, `vba/modDashboardGraphiques.bas`.

## [5.30.5.0] — 2026-07-02

### Fixed
- **Excel — dates des abscisses du Tableau de bord au format français (X61)** — tous les graphiques temporels affichent désormais les dates en format FR (`JJ/MM/AAAA` / `MM/AAAA`), au lieu de formats US ou anglais :
  - **gPrice / gConso** (quotidien) : `m/d/yyyy` (mois/jour US) → **`dd/mm/yyyy`**.
  - **gCost / gCo2 / gBudget** (mensuel) : `mmm-yy` (« juin-26 ») → **`mm/yyyy`**.
  - **gEcoDate** : `mm/yy` → **`mm/yyyy`** ; **gScatterE85** : `mmm aa` → **`dd/mm/yyyy`**.
  - Cause racine : `AddChartXY` fixait `Axes(xlCategory).NumberFormat` (sans effet sur l'affichage) au lieu de `TickLabels.NumberFormat` ; et les abscisses mensuelles étaient écrites en chaîne « yyyy-mm » coercée en date par Excel (format d'axe hérité `mmm-yy`).
  - Correctifs : `modGraphData` écrit de **vraies dates** (`DateSerial`, 1er du mois, helper `MoisDate`) en col A/S ; `modGraphRender.AddChartXY` prend un paramètre `catFmt` et pose `TickLabels.NumberFormat` + `NumberFormatLinked=False` ; formats mensuels ajoutés à `AddCo2MonthlyChart`/`AddBudgetTrendChart`. Injecté COM, `CreerGraphiquesWeb` régénéré et vérifié (formats d'axe contrôlés programmatiquement). `vba/modGraphData.bas`, `vba/modGraphRender.bas`, `vba/modGraphiques.bas`.

## [5.30.4.0] — 2026-07-02

### Changed
- **Excel — modularisation VBA `modGraphiques` (X44, Phase 3)** — découpe du monolithe dashboard (`modGraphiques.bas` 1627 → 416 l., **< 500** ✓) en trois nouveaux modules versionnés :
  - **`modGraphCfg.bas`** (~40 l.) — configuration partagée en `Public` : feuilles (`WS_GRAPH`/`WS_CARB`/`WS_DATA`/`T2_NAME`/`GS_SHEET`/`PH_TABLE`), cellules (`CELL_*`), couleurs (`C_*`), CO2/surconso, dimensions, **+ état module `mPerDeb`/`mPerFin`** (bornes de période, écrites par l'orchestrateur, lues par les agrégats).
  - **`modGraphData.bas`** (~690 l.) — agrégats : `BuildAggregates` + blocs véhicules/conso/prix + helpers (`FuelKey`/`NumOr0`/`FindListObject`/`SheetByName`…). Public : `BuildAggregates`, `EnsureDataSheet`, `EnsurePeriodNames`, `KitCost`, `SheetByName`, `NumOr0`.
  - **`modGraphRender.bas`** (~545 l.) — rendu : tous les `Add*Chart` + `BuildKPICards` + `Ensure*`/`Style`/`Purge`. Public : les `Add*Chart` + `Ensure(Buttons/HeaderBand/ParamBlock)` + `Delete/Purge` appelés par l'orchestrateur.
  - `modGraphiques.bas` conserve l'**orchestration** (`CreerGraphiquesWeb`, `GraphAutoActif`, `ExporterGraphiquesPDF`) + `SetStatusG`. Ses appels `SheetByName`/`NumOr0`/`BuildAggregates`… se résolvent vers `modGraphData` ; config via `modGraphCfg`.
- Injecté en live par COM, **compilé sans erreur**, `CreerGraphiquesWeb` exécuté et **idempotent** en réel (12 graphiques régénérés sur le dashboard). Linter X40 : 0 violation. Classeur enregistré.

_Note : X44 substantiellement avancé — `modGraphiques` (416 l.) et `modSyncGS` (762 l., cible historique) désormais gérables ; `modGraphData` (690), `modGraphRender` (545), `modSyncEngine` (677) restent > 500 l. (découpe fine ultérieure optionnelle)._

## [5.30.3.0] — 2026-07-01

### Changed
- **Excel — modularisation VBA `modSyncGS` (X44, Phase 2)** — découpe du moteur de synchronisation hors du monolithe (`modSyncGS.bas` 1420 → 762 l.) en deux nouveaux modules versionnés :
  - **`modSyncCfg.bas`** (~16 l.) — configuration partagée en `Public Const` : `GAS_URL`, `APP_TOKEN`, `WS_NAME`, `COL_SYNC_ID`, `COL_PHOTO`, `COL_MODIFIED`, `STATIONS_WS`, `STATIONS_TBL`. Les homonymes `Private` ailleurs (modSuppression/modFuelPanel/modHistorique/modSyncParametres) restent locaux (aucune collision).
  - **`modSyncEngine.bas`** (~677 l.) — moteur `SyncCore` + import (GS→Excel) + export (Excel→GS) + helpers (`BuildLocalIndex`, `ImportGSToExcel`, `RowToJson`, `ApplyGSDeletions`, `PushStationsToGS`, `ToNum`, `LogToSyncLog`…). `Public` : `SyncCore`, `BuildLocalIndex`, `GraphSheetExists`, `ImportGSToExcel` (appelés par modSyncGS). Config via `modSyncCfg`, JSON via `modSyncJson`, HTTP via `modSyncNet`.
  - `modSyncGS.bas` conserve les **points d'entrée/commandes** (`TestConnexion`, `SyncManuel`, `ForceResync`, `SyncDiagnose`, `RafraichirPrixHistory`, `SupprimerPleinExcel`, `EnsureGSHeaders`…) + helpers statut/secret. `SyncSecretQS` et `EnsureModifiedColHeader` passés `Public` (appelés par le moteur). `SetStatus` (homonyme `Public` dans `ModuleImportGS`) **dupliqué en `Private`** dans le moteur pour éviter la collision.
- Injecté en live par COM (`Import`), **Débogage→Compiler** sans erreur ; `TestConnexion`/`GenerateUUID` OK et **`SyncDiagnose` exécuté en réel** (`GS=21 | XL=22 | dirty:1`) → le moteur lit les vraies données GS. Linter X40 : 0 violation, 0 doublon `Public`. Classeur enregistré.

_Note : X44 avance mais n'est pas clos — `modSyncGS` (762 l.), `modSyncEngine` (677 l.) et `modGraphiques.bas` (~1500 l.) restent > 500 l. Phase 3 (`modGraphiques`) à venir ; découpe fine du moteur optionnelle._

## [5.30.2.0] — 2026-07-01

### Changed
- **Excel — modularisation VBA `modSyncGS` (X44, Phase 1)** — extraction des helpers **purs** hors du monolithe `modSyncGS.bas` (1663 l.) vers deux nouveaux modules versionnés :
  - **`modSyncJson.bas`** (~220 l.) — helpers JSON/format sans état (`jS`, `jN`, `JEsc`, `JsonGet`, `ParseRecords`, `ParseDeletedIds`, `ParseDt`, `IsoToDate`, `GenerateUUID`, `k`, `Euro`, `eAcc`), rendus `Public`.
  - **`modSyncNet.bas`** (~50 l.) — couche HTTP (`CreateHttp`, `HttpGet`, `HttpPost`) + timeouts `T_*`, rendus `Public`.
  - `modSyncGS.bas` allégé **1663 → 1420 l.** (comportement identique, flux de données inchangé). `RowToJson` (dépend de `COL_MODIFIED`) et `ToNum` (collision avec `modSaisie.ToNum` `Public`) **conservés** dans `modSyncGS` — décidés par audit de pureté/collision.
- **Excel — déduplication `modSyncParametres`** — retrait des copies privées `JEsc`/`JsonGet`/`CreateHttp`/`HttpGet`/`HttpPost` (prouvées équivalentes) + consts `T_*` orphelines → appels résolus vers `modSyncJson`/`modSyncNet` ; **555 → 480 l.**
- Injecté en live par COM (`Import` du `.bas` canonique), **Débogage→Compiler** sans erreur, `GenerateUUID` + `TestConnexion` exécutés (couche HTTP + JSON fonctionnelles), classeur enregistré. Linter X40 : 0 violation, 0 doublon `Public`.

_Note : X44 n'est pas terminé — `modSyncGS` (1420 l.) et `modGraphiques.bas` restent > 500 l. Phases suivantes à venir (découpe du moteur `SyncCore` / import-export ; `modGraphiques`)._

## [5.30.1.0] — 2026-07-01

### Added
- **Excel — garde-fou des en-têtes `GS_Pleins` (X48)** — nouvelle fonction `modSyncGS.EnsureGSHeaders()` appelée au démarrage (`OpenTask_Import`, avant l'import et les KPI) : vérifie les en-têtes **KPI-critiques** de la table `GS_Pleins` (`Date`/`Type`/`Km`/`Litres`/`PrixL`/`Station essence`/`Vehicule`/`SP98 station`/`Photo ticket`) et les **répare par position** (l'ordre des colonnes est figé par la requête Power Query) si un nom a été corrompu/renommé. Défense en profondeur : un en-tête cassé faisait renvoyer `ColIdx → 0` → **KPI à zéro silencieux** (aucune erreur visible). Idempotente (0 réparation si tout est sain). Testée en live : sain → 0 ; `SP98 station` renommé → réparé (retour 1) ; re-run → 0. `vba/modSyncGS.bas`, `vba/modWorkbook.bas`.

### Changed
- **X47 clôturé — obsolète (économies E85/CO2 négatives)** — enquête sur l'item ROADMAP X47 : le chemin visé (`ComputeDashboardStats.eco`, `ComputeKPIs.outEco`) est devenu **code mort** (calculé mais plus affiché — la carte KPI a été remplacée par « Rentabilité kit E85 »). L'économie réellement affichée (graphe X9) lit la colonne **formule** « Économie cumulée (€) » de `Tableau2`, qui possède déjà des gardes `ISNUMBER` ; vérifié dans le classeur en cours : **18 valeurs, 0 négative** (10,17 → 227,38 €). La moitié « CO2 évité négatif » venait de l'ancien bug `surconso` (J7 au lieu de J8), **déjà corrigé** (défaut 0,20 + garde `0<v≤1`). X47 est donc sans objet ; nettoyage du code mort proposé au ROADMAP.

## [5.30.0.0] — 2026-07-01

### Added
- **Rapport mensuel illustré (S13)** — l'e-mail HTML de `RapportMensuel.gs` insère désormais un **mini-graphe QuickChart** (image `<img>`, aucune pièce jointe) de l'évolution du prix payé sur le mois. `calculerStatsRapport` collecte `detailPleins` (`{d, prix, type}` par plein valide, trié chronologiquement) ; nouvelle fonction `construireUrlGraphePrix` construisant une URL QuickChart (Chart.js line, série unique « prix payé », coloration **point par point** selon le carburant — vert `#1D9E75` E85 / bleu `#2E75B6` autre, ligne de tendance grise) ; le graphe n'apparaît que si ≥ 2 pleins détaillés. `Google Drive/…/RapportMensuel.gs`.
- **Lint VBA pré-commit (X40)** — nouveau `scripts/check_vba_compile.py` (stdlib) détectant deux classes de bugs « compile-on-demand » invisibles hors clic réel : (a) `Const`/`Dim`/`Type`/`Enum` au niveau module déclarés **après** la 1ʳᵉ procédure, (b) `Call`/`.OnAction`/`OnTime`/`Run` vers une procédure **inexistante** dans les modules versionnés. Intégré comme **gate bloquant** à l'étape « Lint » de `commit.sh` (JS + VBA). Le linter distingue les noms **qualifiés par module** (`modSidebar.NavSidebar_0`) et **ignore les cibles concaténées dynamiques** (`"modSidebar.NavSidebar_" & k`) pour éviter les faux positifs. Au passage, module `General.bas` (vivant dans le classeur mais non versionné) **versionné** dans `vba/` → 0 violation. `scripts/check_vba_compile.py`, `commit.sh`, `vba/General.bas`.

### Changed
- **Lazy-load carte / Google Maps (W78)** — la chaîne la plus lourde du bundle (`gmaprender.js` + `gmap.js`, chargeur Google Maps JS API + clusterer) n'est plus tirée au démarrage : `carte.js`, `cartealentour.js` et `stationsmap.js` importent désormais un loader partagé `js/gmaprenderLazy.js` (`import()` dynamique) au lieu d'importer `gmaprender.js` statiquement. Vite en fait un **chunk séparé** (`gmaprender-*.js`, ~6,5 kB) chargé à la 1ʳᵉ consultation d'une carte. Vérifié : au boot, seul `gmaprenderLazy.js` est requêté (pas `gmaprender.js`/`gmap.js`) ; build → chunk isolé. `js/gmaprenderLazy.js`, `js/carte.js`, `js/cartealentour.js`, `js/stationsmap.js`.

### Fixed
- **Anti-rebond du retry `visibilitychange` (W82)** — `initOffline` retentait `syncQueue()` à **chaque** retour au premier plan (bascule d'onglet, verrouillage/déverrouillage mobile), même juste après une sync réussie. Garde ajoutée : le retry est ignoré si moins de **30 s** se sont écoulées depuis la dernière tentative de sync (`_lastSyncAttemptTs`, mis à jour dans `syncQueue`). Réduit le bruit réseau sur mobile. `js/offline.js`.

## [5.29.0.4] — 2026-07-01

### Fixed
- **Excel — pleins supprimés qui réapparaissaient (S3, soft-delete honoré partout)** — un plein effacé (app ou Excel) revenait dans « Suivi Carburant » à chaque activation de l'onglet. Deux couches d'import **ignoraient la colonne « Supprimé »** (horodatage de soft-delete côté GAS) : (1) la requête Power Query `GS_Pleins` (filtrait l'e-mail mais pas « Supprimé ») → `powerquery/GS_Pleins.m` : rename `Column18`→`Supprimé` + `Table.SelectRows … [Supprimé] = null or ""` ; (2) l'import VBA `ModuleImportGS.ImporterNouveauxPleins` (appelé par `Worksheet_Activate` de « Suivi Carburant » → `ImporterNouveauxPleinsAuto`), qui réimportait le CSV gviz sans filtre → détection de la colonne « Supprimé » + saut des lignes marquées. Vérifié : après nettoyage, N°21 (doublon 29/06 Km 14089) ne revient plus sur 2 ré-activations. `powerquery/GS_Pleins.m`, `vba/ModuleImportGS.bas`.

### Added
- **Excel — suppression d'un plein accessible à l'utilisateur (S5)** — module `modSuppression` (désormais **versionné** — son absence du repo avait causé un double-import → « Nom ambigu ») : construit par code le UserForm `frmSupprimerPlein` (liste des pleins, filtres) et supprime via `sync_id` (local + propagation Google Sheets `bulkDelete`). Entrées `SupprimerUnPlein` / `AccSupprimerPlein`. Bouton « ✖ Supprimer un plein » posé sur l'Accueil. Form agrandi (hauteur 388, boutons non tronqués). `vba/modSuppression.bas`.

### Changed
- **Excel — bandeau de navigation toujours en arrière-plan (`modSidebar`)** — `PoserSidebarSurFeuille` envoie le fond `sb_bg` en arrière-plan (`ZOrder msoSendToBack`) à chaque régénération : les boutons d'action propres à une feuille (GS_Pleins : Synchroniser / Nouveau plein / Supprimer) restent visibles devant la barre au lieu d'être masqués. `vba/modSidebar.bas`.

## [5.29.0.3] — 2026-06-30

### Fixed
- **Web — feedback du badge hors-ligne enfin visible (W82)** — cliquer le badge `📵 N hors-ligne` (présent dans le header, donc cliquable depuis **toutes** les vues) ne produisait « rien » à l'écran : `syncQueue({ manual })` appelait bien `showFeedback()` (ex. « 🔐 Reconnexion requise » sur session expirée), mais l'élément `#feedback` vivait **à l'intérieur de `view-saisie`**. Quand une autre vue était active (l'app démarre sur **`view-accueil`**), cette vue est en `display:none` → le message s'écrivait dans un conteneur masqué → invisible. Reproduit au navigateur : `feedbackText` correctement rempli mais élément hors écran. Correctif : `#feedback` sorti des vues et remonté en enfant direct de `#app-main`, restylé en **toast `position:fixed`** (haut, centré, `z-index`, `safe-area-inset`) → visible quelle que soit la vue active. Garde null ajoutée à `showFeedback()` (un `#feedback` absent ne tue plus le handler en silence). Vérifié au navigateur (mobile 375 px) : toast 343 px affiché en haut depuis l'accueil. `index.html`, `css/style.css`, `js/ui.js`.

## [5.29.0.2] — 2026-06-30

### Fixed
- **PWA — versionnage du Service Worker réparé (W82)** — le plugin Vite `swVersionPlugin` qui substitue `__SW_VERSION__` dans `sw.js` (nom du cache indexé sur `APP_VERSION`) était **défini mais jamais enregistré** dans `plugins: []` (`vite.config.js`) : il ne tournait ni en dev ni au build. Le `sw.js` déployé gardait donc le littéral `__SW_VERSION__`, son contenu ne changeait **jamais** d'un déploiement à l'autre → le navigateur ne détectait aucune mise à jour du SW → l'invite « Actualiser » (W23) ne se déclenchait pas → la PWA mobile restait **figée sur l'ancien code** après chaque déploiement (symptôme : badge hors-ligne v5.29.0.1 jamais reçu sur le portable, clic sans effet). Plugin désormais enregistré ; le hook `closeBundle` est en plus rendu robuste (lecture de repli sur `public/sw.js` si `dist/sw.js` absent au moment du hook). Vérifié : `dist/sw.js` contient bien `...shell-v5.29.0.2` après build. `vite.config.js`.

## [5.29.0.1] — 2026-06-30

### Fixed
- **Web — synchronisation hors-ligne débloquée (W80)** — `syncQueue()` (`js/offline.js`) abandonnait **en silence** quand la session Google était expirée (`id_token` ~1 h ; reconnexion silencieuse GIS souvent en échec sur Safari/iOS) : les pleins restaient en file sans aucun retour. La fonction prend désormais une option `manual` : en mode manuel elle affiche un feedback explicite (« 🔐 Reconnexion requise », « Rien à synchroniser », « 📵 Toujours hors-ligne ») et **relance la connexion** via `promptLogin()` quand la session est expirée — l'événement `auth-changed` enchaîne alors la sync. Le mode automatique reste silencieux (pas de spam). Nouveau déclencheur `visibilitychange` : la sync est retentée à chaque retour au premier plan, supprimant la dépendance à l'événement `online` peu fiable sur PWA mobile. `js/offline.js`, `tests/offline.test.js` (17 tests).

### Added
- **Web — badge hors-ligne cliquable (W80)** — le badge header `📵 N hors-ligne` devient un bouton accessible (`role="button"`, `tabindex`, `aria-label`, clavier Enter/Espace, `:focus-visible`) qui force une synchronisation manuelle de la file. `js/offline.js`, `css/style.css`.

## [5.29.0.0] — 2026-06-29

### Changed
- **Excel — rebuild dashboard incrémental hybride (X43c)** — `modFiltres.DebouncedRebuild` consulte désormais une **signature d'état** (filtres B5/B6/B9/B10 + budget B2 / CO2 B3 / année B4 + **empreinte des données source** : nb lignes & max Date/Km de `Tableau2`, nb lignes `GS_Pleins`) avant de reconstruire. Classification `ClassifyFilterDelta` → `rsNone` (signature identique → **skip total instantané**, plus de rebuild ~20-30 s au re-clic du même filtre), `rsTargeted` (carburant/budget/CO2/année), `rsFull` (véhicule/période/données → tout en dépend). Signature stockée dans `_GraphData!ZZ1`, écrite après chaque rebuild réussi + à l'ouverture (`SyncFiltersAndRebuildOnOpen`). Un import de pleins change l'empreinte → rebuild forcé (pas de no-op à tort). *Note : pour cet incrément, `rsTargeted` se replie sur un rebuild complet — le recalcul par bloc est différé en X43c-opt ; le gain livré est le **no-op skip**.* Complète X43a/b (debounce, v5.13.0.0). `vba/modFiltres.bas`.

## [5.28.0.0] — 2026-06-29

### Added
- **CI — audit accessibilité automatisé (W79)** — nouveau job CI `a11y` **non-bloquant** (`continue-on-error: true`) qui passe **axe-core** (WCAG 2.0/2.1 A & AA) via Playwright sur les 3 vues principales (saisie, stats, historique), résumé des violations graves publié dans le récap du job. Test `tests/a11y.spec.js` (mocks réseau + session authentifiée seedée pour franchir le mur U7 sur stats/historique ; reporter résilient : une instabilité de vue n'échoue jamais le test). Script `npm run test:a11y`, devDep `@axe-core/playwright`. Premières violations relevées : `select-name` (critique, `#stationSel`) et `color-contrast` (sérieux) → suivi en W81.

## [5.27.0.0] — 2026-06-29

### Fixed
- **Excel — garde-erreur sur l'import auto à l'activation de « Suivi Carburant » (X41)** — `Feuil2.Worksheet_Activate` enrobe désormais l'appel `ImporterNouveauxPleinsAuto` d'un `On Error Resume Next` … `On Error GoTo 0` (modèle `Feuil7`/Réglages). Un échec réseau/GAS de l'import ne bloque plus la navigation vers l'onglet. Doc-module `Feuil2` désormais versionné (`vba/Feuil2.cls`).
- **Excel — projection de rentabilité du kit (`Suivi Carburant`!J11/J12) filtrée par véhicule (X51)** — la date (J11) et le km (J12) estimés de rentabilité passaient par des `LOOKUP`/`INDEX` **globaux** sur `Tableau2[Date]`/`[Km compteur]` (tous véhicules confondus). Remplacés par des `MAXIFS`/`MINIFS` filtrés sur le véhicule sélectionné (idiome `IF($B$3="(tous)","*",$B$3)`, cohérent avec B11/J7/J8). Cohérence multi-véhicule de la projection (latent tant qu'un seul véhicule existe).

## [5.26.0.0] — 2026-06-28

### Added
- **Google Sheets — dégradé couleur prix par carburant (G2)** — `appliquerMFCPrix()` colore `_PrixHistory!D` (Prix €/L) en dégradé **vert→jaune→rouge** (vert = prix bas), min/max calculés **par carburant** (colonne `Type`) sur une **fenêtre glissante de 90 jours** (repli sur l'historique complet pour un carburant sans relevé récent). Coloration `setBackgrounds` en batch (la MFC native « échelle de couleurs » ne sait pas grouper par carburant). Branché en fin de `refreshPrixCarburants()` (rafraîchissement quotidien) + fonction manuelle `reappliquerMFCPrix` pour un premier passage sur l'historique. `RefreshPrix.gs`.

## [5.25.0.0] — 2026-06-28

### Added
- **Excel — santé de la sync dans `Réglages` (X46)** — nouvelle section « 🔁 Santé de la sync » (statut **OK/KO**, horodatage, lignes échangées ← / →, durée de la dernière sync) lue depuis `_SyncLog`, affichée par `AfficherSanteSyncReglages` (idempotent) et branchée dans `CreerFeuilleReglages`. `vba/modReglages.bas`.

### Changed
- **Excel — `_SyncLog` journalise désormais le statut (X46)** — `LogToSyncLog` (`modSyncGS`) gagne une 5ᵉ colonne **« Statut »** écrite à chaque sync, **succès comme échec** : les chemins d'échec de `SyncCore` (réseau vide, réponse non-JSON, `ErrHandler`) journalisent un `KO …` au lieu de ne rien écrire. Migration automatique des journaux 4 colonnes antérieurs (en-tête ajouté, anciens logs présumés OK). `vba/modSyncGS.bas`.

## [5.24.1.0] — 2026-06-28

### Removed
- **Excel — orphelin VBA `synchroniseGoogleForm.bas` (X42)** — module supprimé du dépôt (procédure unique `SyncStationsVersGoogleSheets`, déjà reprise par `modSyncGS`). `Module1` et le composant `synchroniseGoogleForm` étaient déjà absents du classeur → cohérence disque ↔ classeur rétablie. `vba/synchroniseGoogleForm.bas`.

### Changed
- **ROADMAP — X39 retiré du Top 5** : l'accumulation journalière des prix marché (X39) a été livrée en v5.20.1.0 ; sa ligne traînait encore à tort en priorité n°1. Top 5 recalé (X43c, W78, C9, X40, X44).

## [5.24.0.0] — 2026-06-28

### Added
- **Excel — écran d'attente au démarrage (splash X60)** — un `UserForm` modeless plein cadre (`frmSplash` : logo ⛽, titre, libellé d'étape, **barre de progression**) s'affiche en tête de `Workbook_Open` et masque le « montage » des onglets pendant l'ouverture. Progression **par étapes** (1→6 synchrones, puis import / rebuild / synchro différés), mise à jour via `modSplash.SplashStep` avec `DoEvents`/`.Repaint` entre les blocs. Fermeture **coordonnée** sur la fin des 3 tâches différées (`SplashMarkImport`/`SplashMarkRebuild`/`SplashMarkSync`) + **fermeture de sécurité** `SplashForceClose` planifiée à +90 s si une tâche n'aboutit pas. Limite assumée (VBA mono-thread) : pas d'animation continue, pas de moteur web embarqué. Aperçu : Alt+F8 → `SplashDemo`. `vba/frmSplash.frm`, `vba/modSplash.bas`, `vba/ThisWorkbook.cls`, `vba/modWorkbook.bas`.

## [5.23.0.0] — 2026-06-28

### Added
- **Excel — cartes en Google Maps (W82)** — les trois cartes générées par le classeur (carte stations, « Stations à proximité », itinéraire) utilisent désormais **Google Maps JavaScript** (`AdvancedMarkerElement`) au lieu de Leaflet/OSM, comme demandé. Marqueurs = mêmes badges logo d'enseigne + pastille prix (DOM réutilisé), cercle de rayon, polyligne d'itinéraire, marqueur « ma position », popups Google Maps/Waze. Moteur de carte **unifié** (`MapEngineJs`) : une seule source pour les deux rendus, les générateurs ne préparent plus qu'un objet `cfg`. **Repli automatique sur OpenStreetMap/Leaflet** si la clé est absente ou en cas de `gm_authFailure` (zéro régression). Vérifié dans le vrai Chrome (Google Maps actif, 19 marqueurs, 0 logo rogné). `vba/modCarte.bas`.

### Fixed
- **Cartes Excel — boutons zoom +/- rétablis** — le rendu Google Maps (`renderGoogle`) ne déclarait pas `zoomControl`, masquant les boutons +/- sur les pages « Ouvrir la carte » / « Stations à proximité ». Ajout explicite de `zoomControl:true`. `vba/modCarte.bas`.

### Changed
- **Clé Google Maps locale hors dépôt** — la carte Excel s'ouvrant en `file://`, elle exige une clé **non restreinte par référent** (incompatible avec la clé `config.js` restreinte à `fdaubercy.github.io`). Cette clé est stockée dans le **registre local HKCU** (`GetSetting/SaveSetting "SuiviE85","Maps","ApiKey"`, pattern `SYNC_SECRET`), **jamais commitée** (dépôt public). Macro `PoserCleMaps` (Alt+F8) pour la (re)saisir/effacer. Map ID public surchargeable (`…,"Maps","MapId"`).

## [5.22.9.0] — 2026-06-27

### Fixed
- **Excel — logos de marqueurs rognés (« Intermarché » → « ermarc ») — CAUSE RACINE** — le vrai défaut derrière tous les retours « trop zoomé » : `.b-pin` est un conteneur **flex** et l'`<img>` (flex-item) avait `min-width:auto` par défaut → `width:100%` était ignoré, l'image prenait sa **largeur intrinsèque** et **débordait**, rognée par `overflow:hidden` (on ne voyait qu'un fragment central du logo). Visible uniquement dans un vrai navigateur (Chrome/Edge), pas dans les rendus isolés. Correctif : `min-width:0;min-height:0` sur `.b-pin img` → `object-fit:contain` contraint enfin l'image, les logos (wordmarks compris) s'affichent **en entier**. Vérifié dans Chrome installé (0 marqueur débordant / 19). `vba/modCarte.bas`.

## [5.22.8.0] — 2026-06-27

### Changed
- **Excel — plafond de largeur sur les marqueurs très larges (Intermarché)** — sur retour utilisateur, Intermarché (ratio 5.4:1) restait trop large/« zoomé » en pleine largeur (~126 px). Ajout d'un plafond de largeur 72 px : au-delà, la largeur est bornée à 72 px et la **hauteur réduite proportionnellement** (`H = round(64/ratio)+8`) pour que l'encadré continue d'épouser le logo entier (pas de bord vide). Intermarché → 72×20, Système U → 72×28 ; logos plus étroits (Total, Carrefour…) inchangés. `vba/modCarte.bas`.

## [5.22.7.0] — 2026-06-27

### Changed
- **Excel — encadré des marqueurs ajusté à la largeur du logo entier (wordmarks)** — sur retour utilisateur, les logos-texte (`total` rendu « TE », `intermarche`, `systeme-u`) restaient tassés/illisibles car la pastille était plafonnée à 58 px. Le plafond est retiré : la largeur de `.b-pin` épouse désormais le logo complet à hauteur compacte constante (`W = round(22·ratio) + 8`, hauteur 30 px inchangée) → le wordmark s'affiche en entier et lisible (`Intermarché` ~126 px, `Système U` ~77 px), les logos carrés (Carrefour/Leclerc/Auchan) restent à 30 px. Logos inchangés. `vba/modCarte.bas`.

## [5.22.6.0] — 2026-06-27

### Changed
- **Excel — marqueurs de cartes plus compacts (moins « zoomés »)** — sur retour utilisateur, les marqueurs étaient trop gros (l'élargissement des wordmarks en v5.22.5.0 accentuait l'effet). Taille réduite ~21 % : pastille `.b-pin` 38→**30 px**, plafond d'élargissement wordmark 84→**58 px**, badge prix `font 12→10 px`/`padding 4×8→3×6`, `iconSize`/`iconAnchor` ajustés (66→54). Logos et prix restent lisibles ; marqueurs plus discrets sur la carte. Validé en prévisualisation Playwright (comparatif 3 tailles). `vba/modCarte.bas`.

## [5.22.5.0] — 2026-06-27

### Fixed
- **Excel — logos de marqueurs « wordmark » trop zoomés/illisibles sur les cartes** — les logos très larges (`intermarche` ratio 5.4:1, `systeme-u` 3.2:1) étaient écrasés dans le carré 38 px du marqueur (`object-fit:contain`) → bande illisible (marqueurs rouges « écrasés » signalés). La pastille `.b-pin` s'**élargit désormais selon le ratio largeur/hauteur du SVG** (`W = min(round(38·ratio), 84)` si ratio > 1.3) → un wordmark s'affiche dans une pastille horizontale lisible, un logo carré reste carré. Nouveau lecteur `SvgAspect` (viewBox prioritaire, sinon `width`/`height`, cache `g_arCache`) + map JS `LOGOS_AR` consommée par `stIcon` (`iconSize`/`iconAnchor` ajustés). Les SVG sans `viewBox` (`shell`, `eni`) ne sont plus à risque de rognage. `vba/modCarte.bas`.

## [5.22.4.0] — 2026-06-27

### Fixed
- **Excel — enseignes réelles + logos sur la carte « Stations à proximité » (et itinéraire)** — les marqueurs affichaient « Station » sans logo. Nouveau `EnrichEnseignesOSM` : une requête Overpass groupée récupère la marque réelle (`brand` > `name` > `operator`) du nœud `amenity=fuel` OSM le plus proche (≤ 300 m), puis renomme en « Enseigne - Ville » → `BrandSlugColor` retrouve le logo (vérifié : 16/19 stations enrichies, Leclerc/Auchan/Carrefour/Total/Intermarché…). Corrige au passage : requête Overpass URL-encodée (`EncodeURL`), en-tête `User-Agent` (Overpass renvoie 406 sans), découpe du JSON indenté sur la clé `"type"`, décodage des `\uXXXX` (villes type « Courrières »), dédup proximité/itinéraire par coordonnées (et non par nom). `vba/modCarte.bas`.

## [5.22.3.0] — 2026-06-26

### Changed
- **Excel — marqueurs cartes avec logo d'enseigne** — les 3 cartes affichent desormais le LOGO de l'enseigne (badge blanc bordure couleur de marque + pastille prix coloree), comme l'app web, au lieu du pin goutte generique. Les SVG de `public/icons/brands/` sont embarques en data URI base64 (autonomes, hors-ligne). Slug + couleur detectes par marque (memes patterns/couleurs que `brand.js`), repli `generic.svg`. `vba/modCarte.bas`.

## [5.22.2.0] — 2026-06-26

### Added
- **Excel — geolocalisation automatique** — nouveau bouton « Me localiser (auto) » + repli automatique : la position utilisateur est detectee par IP (API `ip-api.com`, sans GPS ni saisie) et ecrite dans `Carte_Position`. La carte a proximite se localise seule si la cellule est vide. `vba/modCarte.bas`.

### Changed
- **Excel — nommage stations « enseigne - ville »** — les stations des cartes proximite/itineraire sont nommees selon le protocole de l'app : enseigne detectee depuis l'adresse (liste de marques Total/Leclerc/Intermarche/Carrefour/…) + ville en casse propre (1er segment). Repli « Station » si enseigne inconnue. `vba/modCarte.bas`.

## [5.22.1.0] — 2026-06-26

### Changed
- **Excel — marqueurs cartes style app** — les 3 cartes HTML (stations, proximite, itineraire) utilisent desormais le meme style de marqueurs que l'app web : pin en goutte verte avec emoji carburant + badge prix bleu fonce au-dessus ; position utilisateur = pastille bleue avec emoji voiture. CSS factorise dans `HtmlHead()`, factory JS `stIcon()`. `vba/modCarte.bas`.

## [5.22.0.0] — 2026-06-26

### Added
- **Excel — Carte a proximite** — nouveau bouton « Stations a proximite » : requete live API prix gouv (rayon 5/10/15/20 km configurable), carte Leaflet avec cercle de rayon, medailles TOP 3, distance haversine, popups Google Maps + Waze. `vba/modCarte.bas`.
- **Excel — Carte itineraire** — nouveau bouton « Carte itineraire » : saisie depart/arrivee, trace OSRM (routage public), stations-service le long du trajet (5 points echantillonnes, rayon 5 km), polyline + marqueurs prix sur carte Leaflet. `vba/modCarte.bas`.
- **Excel — Controles feuille Carte** — cellules nommees `Carte_Rayon` (C5), `Carte_Depart` (C6), `Carte_Arrivee` (C7) + 2 boutons supplementaires. Tableau prix decale en ligne 9 pour eviter le chevauchement.

## [5.21.13.0] — 2026-06-26

### Changed
- **Excel — `gScatterE85` : charte couleur + barres elargies arrondies** — barres conso restent vertes (`C_E85`) avec bevel subtil (coins arrondis) et `GapWidth = 60` ; courbe prix passe en bleu mid (`C_SP98` #2E75B6) avec ligne fine (1.5pt) et marqueurs cercle discrets (taille 3) pour contraster sans surcharger. `vba/modGraphiques.bas`.

## [5.21.12.0] — 2026-06-26

### Fixed
- **Excel — `gPrice` : marqueurs discrets + dates en abscisse** — marqueurs remplacés par petits cercles (taille 3) au lieu de supprimés ; axe X forcé en `xlTimeScale` avec format `dd/mm` pour afficher des dates lisibles (au lieu des numéros de série Excel). `vba/modGraphiques.bas`.

## [5.21.11.0] — 2026-06-26

### Fixed
- **Excel — `gPrice` : marqueurs supprimés sur les courbes de prix** — `AddChartXY` ne forçait pas `MarkerStyle = xlMarkerStyleNone` ; Excel affichait des points surdimensionnés sur les lignes. Ajout du flag dans la boucle `smooth`. `vba/modGraphiques.bas`.
- **Excel — `gScatterE85` : scatter prix/conso réparé** — `SetSourceData` avec `PlotBy:=xlColumns` causait une double-interprétation des colonnes (deux séries distinctes au lieu de X/Y). Remplacement par affectation explicite `.XValues` / `.Values` (AP2:AP[n] = prix, AQ2:AQ[n] = conso, sans en-tête). Ajout d'un vidage des séries existantes, garde `nPts >= 3` pour la trendline, et axes non ancrés à 0 (`MinimumScaleIsAuto`). `vba/modGraphiques.bas`.

## [5.21.10.0] — 2026-06-26

### Changed
- **Excel — ouverture silencieuse : onglet « Accueil » reste au 1er plan** — `Workbook_Open` gèle l'affichage (`ScreenUpdating=False`) et active « Accueil » **avant toute autre opération**, puis rétablit l'affichage avant le plein-écran. L'utilisateur ne voit plus les autres onglets défiler pendant le démarrage. `vba/ThisWorkbook.cls`.
- **Excel — sélecteur « Vehicule » repositionné dans le bandeau bleu (lignes 2-3)** — nouvelle macro `SuiviVehicule_PositionnerDansBandeau` qui déplace le slicer « Vehicule » et les 2 boutons (*Analyse locale* / *Suivre le dashboard*) **à l'intérieur du bandeau bleu** (lignes 2-3 de l'onglet *Suivi Carburant*), à la place des cellules A3+B3. Les boutons sont repositionnés horizontalement à droite du slicer dans le même bandeau. `SuiviVehicule_EnsureBoutons` délègue désormais à cette nouvelle proc (idempotente). `vba/modSuiviVehicule.bas`.

## [5.21.9.0] — 2026-06-25

### Added
- **Excel — sélecteur véhicule LOCAL optionnel sur « Suivi Carburant » (X54)** — nouveau module `vba/modSuiviVehicule.bas` permettant d'analyser un véhicule sur l'onglet *Suivi Carburant* **sans changer le dashboard**. La cellule `B3` (« Véhicule analysé ») bascule entre deux modes via 2 boutons placés sous le segment « Vehicule » : **Suivre le dashboard** (défaut, inchangé : `B3` = formule miroir de `'Tableau de bord'!B5`, verrouillée, fond blanc — piloté par le slicer `slcVehicule`) et **Analyse locale** (`B3` = valeur figée choisie via une **liste de validation dynamique** des véhicules de `GS_Pleins` (`modDashboardKPI.KPIVehiculeList`), cellule déverrouillée, fond jaune pâle comme repère). **Aucune formule d'indicateur n'est modifiée** : tous les indicateurs (`B7/B8/J6/J7/J8/B11`…) filtrent déjà sur `$B$3` → ils suivent automatiquement, et le mode « suivre » reproduit exactement le comportement actuel (non-régression garantie). Helpers réutilisés : `DeverrouillerSuivi`/`VerrouillerSuivi` (`ModuleImportGS`), `KPI_TOUS`/`KPIVehiculeList` (`modDashboardKPI`). Procédures : `SuiviVehicule_ModeLocal`, `SuiviVehicule_SuivreDashboard`, `SuiviVehicule_EnsureBoutons` (création idempotente des boutons). **Vérifié** (COM, classeur réel) : bascule local → `B3` éditable + liste de validation + fond jaune pâle ; retour dashboard → formule miroir restaurée + verrouillé + fond blanc + validation supprimée. `vba/modSuiviVehicule.bas`.

## [5.21.8.0] — 2026-06-24

### Fixed
- **Excel — surconso E85 partagée lue sur la mauvaise cellule (`J7` au lieu de `J8`)** — le paramètre `surconso` synchronisé (app ↔ Excel ↔ rapports GAS) et le champ `Reg_Surconso` des Réglages lisaient/écrivaient **`Suivi Carburant!J7`** (= « Conso E85 réf. (km/L) », ~15) au lieu de **`J8`** (« Surconsommation E85 (%) », ~0,23). `J8` étant une **formule calculée** (jamais saisie), le partage est désormais **en lecture seule** : nouveau drapeau `cellRO` dans `ParamDef` + helper `MkRO` (`modSyncParametres`) → la sync **lit** `J8` mais ne l'écrase **jamais** (garde `Not cellRO` sur `WriteCell`, en plus du garde `HasFormula` existant) ; côté Réglages, le **pull** lit `J8` et le **push** de la surconso est **supprimé** (`modReglages`). **Vérifié** : `ReglagePullParametres` → `Reg_Surconso = 0,227 = J8` (avant : ~15). `vba/modSyncParametres.bas`, `vba/modReglages.bas`. *(Note : le texte des rapports GAS mentionne encore « Excel J7 » — cosmétique ; la valeur partagée est désormais correcte, à rafraîchir au prochain déploiement GAS.)*

## [5.21.7.0] — 2026-06-24

### Fixed
- **Excel — coût du kit lu sur la mauvaise cellule (`B5` au lieu de `B6`)** — `KitCost` (graphiques de rentabilité), `modSyncParametres` (`kit_prix`) et `modReglages` (`Reg_KitPrix`, pull/push) lisaient/écrivaient le prix du kit en **`Suivi Carburant!B5`** (cellule **vide** sous le titre « PARAMÈTRES »), alors que la feuille saisit et calcule avec **`B6`** (libellé « Coût du kit éthanol », `514,54 €` ; `B12`/`J13` utilisent B6). `KitCost` ne s'en sortait que par un **repli `Find("kit")` fragile** qui tombait en réalité sur le **titre** `A2` (« …KIT ÉTHANOL ») → valeur figée au défaut `514,54 €` quel que soit B6. Les 3 usages pointent désormais **`B6`** (repli `Find` supprimé). **Vérifié** : `B6 = 601 €` → seuil « coût kit » des graphiques de rentabilité = 601 (avant : figé à 514,54). `vba/modGraphiques.bas`, `vba/modReglages.bas`, `vba/modSyncParametres.bas`.

## [5.21.6.0] — 2026-06-23

### Changed
- **Excel — Suivi Carburant : sélection du véhicule par un vrai SEGMENT (slicer)** — le sélecteur de l'onglet *Suivi Carburant* est désormais un **segment « Véhicule » identique à `slcVehicule`** du Tableau de bord, **branché sur le même cache `Segment_Vehicule`** → la sélection est **synchronisée** entre les deux onglets (sélectionner sur l'un coche l'autre). Le changement met à jour `'Tableau de bord'!B5` → `Suivi Carburant!B3` → indicateurs conso/éco + carte « Rentabilité kit ». La cellule `B3` (formule `=B5`) reste le relais lu par les formules ; le segment est le dispositif de sélection. Robustesse : la colonne `Véhicule` de `Tableau2` est une **formule de colonne** (se propage aux nouveaux pleins) et les indicateurs en **références structurées** `Tableau2[...]` suivent la hauteur variable du tableau (vérifié : un plein E85 ajouté → éco cumulée passée de 176 à 192 €). `excel/Suivi Conso Carburants.xlsm`.

## [5.21.5.0] — 2026-06-23

### Added
- **Excel — Onglet « Suivi Carburant » réactif au véhicule sélectionné (X50)** — nouvelle colonne `Véhicule` dans `Tableau2` (miroir de `GS_Pleins[Vehicule]`) + sélecteur **« Véhicule analysé »** (cellule `B3`, intégré au bandeau d'en-tête) **lié au véhicule du Tableau de bord** (`slcVehicule` → `'Tableau de bord'!B5` → `B3`). Les indicateurs de **conso de référence** (`B7`/`B8` S98, `J6`/`J7` E85, `J8` surconso) et l'**économie cumulée** (`B11`, recalculée en `SUMPRODUCT` de l'économie € par plein E85 = `Coût équiv. S98 − Coût plein`) se **filtrent désormais selon le véhicule sélectionné** ; `B12`/`B13`/`J13` (reste à amortir, éco/km, progression) en dépendent automatiquement. La carte **« Rentabilité kit E85 »** du Tableau de bord (qui lit `B11`/`B6`/`J13`) devient donc véhicule-réactive — **source unique = `slcVehicule`**. Formules array écrites en `.Formula2` (préserve les tableaux dynamiques 365). **Non-régression vérifiée** (un seul véhicule : `(tous)` = `Z900`, valeurs identiques). Limite connue : la projection de date/km de rentabilité (`J11`/`J12`) reste globale (à filtrer quand plusieurs véhicules). `excel/Suivi Conso Carburants.xlsm`.

## [5.21.4.0] — 2026-06-23

### Changed
- **Excel — Tableau de bord : carte « ÉCONOMIES E85 vs SP98 » → « RENTABILITÉ KIT E85 »** — la carte affiche désormais l'**économie cumulée rapportée au coût du kit** (`176 € / 515 €`) avec une **barre de progression d'amortissement** (`amorti 34 %`), en **reprenant les indicateurs déjà calculés par l'onglet `Suivi Carburant`** (`B11` éco cumulée, `B6` coût kit, `J13` progression) plutôt qu'un recalcul VBA divergent. `vba/modDashboardGraphiques.bas` (nouvelles `ReadKitStats` + `AddKpiCardKit`).

### Fixed
- **Excel — surconsommation E85 lue au mauvais endroit (bandeau KPI + graphiques faussés)** — `modDashboardKPI` et `modGraphiques` lisaient la surconso en `Suivi Carburant!J7`, cellule qui contient en réalité « Conso E85 référence (km/L) » (~15) ; la vraie surconsommation est en **`J8`** (« Surconsommation E85 (%) », ~0,23). Conséquence : `essEq = litres/(1+15)` → économie E85 et **CO2 évité** du bandeau très faussés. Lecture corrigée vers `J8` + **garde-fou de plausibilité** (fraction `0 < x ≤ 1`, sinon défaut 0,20). Le CO2 évité du bandeau repasse à une valeur réaliste (~138 kg). `vba/modDashboardKPI.bas`, `vba/modGraphiques.bas`.

## [5.21.3.0] — 2026-06-23

### Fixed
- **App — Onglet « Historique » : plein fantôme daté du 01/01/1970** — la ligne affichée n'est pas un vrai plein mais l'**echo d'une ligne d'en-tête** de l'onglet `_ImportGS` du Google Sheet (cellules contenant les libellés de colonnes : `Type="Type"`, `sync_id="sync_id"`, date non parsable coercée à `0` → `new Date(0)` = 01/01/1970). Le correctif serveur de v5.21.1.0 (filtre GAS `handleExport` + gardes Excel `IsGarbageSid` + suppression à la source) bloque la propagation, **mais la ligne survivait dans le cache `localStorage` du navigateur** (et le filtre GAS ne couvrait que `sync_id==="sync_id"`). Ajout d'un garde-fou **côté app** (`js/historique.js`) : nouveau prédicat exporté `estPleinValide(r)` qui écarte (1) les echos d'en-tête (`sync_id`/`Type` = libellé de colonne) et (2) les dates absentes ou epoch Unix (année ≤ 1970). Appliqué **à la lecture du cache** (`_loadCache` → couvre le fallback réseau et la tuile « reprendre » de l'accueil) **et avant persistance/affichage** (`chargerHistorique`, avant `_saveCache`). La ligne fantôme disparaît au prochain chargement de l'onglet et n'est plus jamais remise en cache. → **réponse à la question utilisateur : c'est une erreur (ligne technique), à supprimer — ce que le correctif fait automatiquement, sans toucher aux vrais pleins.** 7 tests de non-régression (`tests/historique.test.js`).

## [5.21.2.0] — 2026-06-21

### Fixed
- **App — Carte « E85 les moins chers autour de moi » ne s'affiche pas après un rechargement direct (F5 / deep-link) sur l'onglet Carte** — l'écouteur `viewchange` (`js/main.js`) qui déclenche `renderAlentour()` / `renderStationsCard()` était enregistré **après** `initRouter()`, lequel émet un `viewchange` **synchrone** au chargement. Sur un accès direct à `#/carte` (rechargement / lien), ce premier événement était perdu → la carte ne se rendait jamais (en navigation par onglets, l'app étant déjà initialisée, l'écouteur existait → la carte s'affichait normalement, d'où la confusion). Écouteur `viewchange` (+ `_curView` / `_refreshVehBar`) déplacé **avant** `initRouter()` : la carte alentour et la carte des stations habituelles se rendent désormais aussi sur un rechargement direct de l'onglet Carte. `js/main.js`.
- **Excel — « Prix S98 jour » manquant pour le plein du 22/05 (Tableau2 ligne 26)** — ce plein n'a pas de prix SP98 station saisi (`_ImportGS` col J vide) et le relevé marché SP98 (`_PrixHistory`) ne commence qu'au 30/05 → les deux branches de la formule col K échouaient → cellule vide. Repli ajouté à la formule de **K26** : en dernier recours, moyenne marché SP98 du **30/05 (2,022 €/L)** via `AVERAGEIFS`. K26 = 2,022 ; le « Coût Plein équiv. S98 » (L26) se recalcule. Approximation ciblée (cette cellule uniquement) ; si le vrai prix station est saisi plus tard, il primera.

### Docs
- **Découpe de `CLAUDE.md`** (335 → 193 lignes) : le détail de référence (architecture, charte UI, règles VBA, outils/pouvoirs) déplacé dans `docs/ARCHITECTURE.md`, `docs/UI-WORKFLOW.md`, `docs/VBA.md`, `docs/OUTILS.md`, référencé par pointeurs texte (lecture à la demande) pour alléger le démarrage de session.

## [5.21.1.0] — 2026-06-20

### Fixed
- **Prix marché bloqués au 16/06 / graphe `gPrice` incomplet (GAZOLE vide)** — la requête Power Query `PrixHistory` du classeur était en réalité **une copie de `GS_Pleins`** (elle lisait l'onglet `_ImportGS` des pleins, 16 colonnes) au lieu des relevés marché `_PrixHistory` (format long `Station/Date/Type/Prix`). `BuildPriceBlockMerged` (X39) ne trouvait donc pas la colonne `Prix` → SOURCE 2 vide → seuls les prix aux dates de pleins s'affichaient. Requête re-synchronisée sur `powerquery/PrixHistory.m` → **3922 relevés, dates jusqu'au jour courant, E85/SP98/GAZOLE… en courbes continues**. `excel/Suivi Conso Carburants.xlsm` (requête `PrixHistory`).
- **`Suivi Carburant` / `Tableau2` col K « Prix S98 jour » vide (lignes récentes)** — formule résiduelle `=IF([@Type]="Super 98",…)` qui ne remplissait que les pleins SP98. Remplacée par une formule traçable : **`GS_Pleins[SP98 station]` du plein, sinon moyenne marché SP98 de la date** (`PrixHistory`, arrondie). `excel/Suivi Conso Carburants.xlsm`.
- **En-têtes de la requête `GS_Pleins` corrompus** (`Date`→`01/01/1970`, `Km`→`0`, `SP98 station`→`Colonne2`…) par une ligne « fantôme » (echo d'en-tête, `sync_id="sync_id"`) entrée dans le Google Sheet `_ImportGS` le 17/06. Ligne fantôme **supprimée à la source** (Sheets API) + en-têtes réparés par refresh.
- **Corruption de la synchronisation bidirectionnelle** — gardes `IsGarbageSid` ajoutées dans `vba/modSyncGS.bas` (import + re-push) et **filtre `handleExport`** côté GAS (déployé en v56) : la ligne « echo d'en-tête » ne peut plus se propager (Excel ↔ Google Sheet) ni être servie à l'app. `vba/modSyncGS.bas`, `Google Drive/.../Google Apps Script/Code.gs`.

### Changed
- **App — Carte « E85 les moins chers autour de moi » : zoom adapté aux stations** — le cadrage par défaut s'ajuste désormais à **la zone des stations trouvées** (selon le rayon choisi) au lieu d'afficher tout le cercle de rayon. Option opt-in `fitStationsOnly` (le cercle reste dessiné mais n'impose plus le zoom) — sans impact sur la carte Saisie ni la carte habituelles. `js/gmaprender.js`, `js/carte.js`, `js/cartealentour.js`.

### Docs
- **CLAUDE.md** — règle explicite « toujours communiquer en français » avec l'utilisateur.

## [5.21.0.0] — 2026-06-18

### Changed
- **App — Carte « E85 les moins chers autour de moi » alignée sur « Stations habituelles »** (`js/cartealentour.js`, `js/carte.js`, `css/style.css`). La carte alentour (D3) adopte désormais toute l'ergonomie de la carte des stations habituelles : (1) **sélecteur de carburant** en tête de carte (🌿 E85 / ⚫ Gazole / 💧 SP98) qui re-trie sans re-géolocaliser ; (2) les **3 stations les moins chères** du carburant sélectionné affichées **au-dessus** de la carte (médailles 🥇🥈🥉) ; (3) le **reste des stations sous la carte** dans une liste défilante de hauteur réduite (~3 stations visibles, ascenseur) ; (4) toutes les stations **renommées « Enseigne - Ville »** via enrichissement OSM (`enrichStationsBulk`) ; (5) chaque **marqueur affiche l'icône d'enseigne + le prix** du carburant sélectionné (badge prix, top‑3 en vert) ; (6) ajout du **rayon 5 km** (5 / 10 / 15 / 20, défaut 15) ; (7) boutons **zoom +/− et plein écran** au même format que l'autre carte (`zoomGoogleMap`, `mapfullscreen.js`). `renderMiniMap()` rend désormais le badge prix et le pin ⛽ centré (top‑3 vert #1D9E75, autres bleu #2E75B6). Aucun changement backend.

## [5.20.1.0] — 2026-06-18

### Fixed
- **Excel — X39 : le graphe « Prix » (`gPrice`) ne traçait pas le relevé marché quotidien** (`vba/modGraphiques.bas`, `BuildPriceBlockMerged` SOURCE 2). La table Power Query `PrixHistory` (miroir de l'onglet `_PrixHistory` du Google Sheet, relevé ~7h des 6 carburants déjà **accumulé** par `RefreshPrix.gs`) est en **format long** `Station | Date | Type | Prix`. SOURCE 2 cherchait à tort des colonnes **larges** `"E85 station"`, `"SP98 station"`, … **inexistantes** dans cette table → `phFuelCols` tous nuls → SOURCE 2 n'écrivait rien → `gPrice` ne traçait que SOURCE 1 (les pleins), d'où SP95/GAZOLE quasi vides. Désormais SOURCE 2 lit `Date`/`Type`/`Prix`, mappe via `FuelKey(Type)` et agrège par jour+carburant (moyenne, cohérent avec SOURCE 1) → le relevé marché quotidien (6 carburants, continu) alimente le graphe ; SP95/E10/GPLc/GAZOLE deviennent des courbes exploitables. Déployé dans le classeur live via `vba-agent set-module` (miroir disque + COM). Aucune modif GAS ni Power Query (déjà corrects). Le volet « accumulation journalière » du X39 d'origine (ROADMAP) était déjà résolu côté backend.

## [5.20.0.0] — 2026-06-18

### Added
- **App — Carte des stations essence les moins chères autour de moi (D3, onglet Carte)** : nouvelle carte EN HAUT de l'onglet Carte (au-dessus des stations habituelles), alimentée par l'API live `data.economie.gouv.fr`. Géolocalisation → stations dans un rayon réglable (**sélecteur 10 / 15 / 20 km**, défaut 15, persistant) → tri par prix du carburant courant → **top‑3 mises en valeur** (marqueurs verts + médailles 🥇🥈🥉 sur la carte, liste triée du - cher au + cher dessous). Repli propre si géoloc refusée. Nouveau module `js/cartealentour.js` + renderer générique `renderMiniMap()` dans `js/carte.js` (indépendant de la carte Saisie). `index.html` (carte `#alentourCard`), `js/main.js` (déclenchement à l'ouverture de l'onglet + au changement de véhicule), `css/style.css`.
- **App — Graphique « Prix carburants » : superposition marché + mes pleins (D2, onglet Stats)** : la sparkline trace désormais, par carburant, **2 courbes** — le **relevé quotidien du marché** (le moins cher du secteur, `_PrixHistory` via `?action=sectorPrices`, déjà collecté par `RefreshPrix.gs` ~7h, en tirets) **et** le **prix payé à mes pleins** (plein trait). Légende + pied enrichi (payé / marché). Aucun changement backend. `js/stats.js`, `js/secteur.js` (exports `getSectorSeries`, `loadSectorPricesFor`), `css/style.css`.

### Changed
- **App — Mise à jour globale après un nouveau plein (D1)** : à l'enregistrement d'un plein, l'app rafraîchit désormais **l'ensemble des parties dédiées** (5 derniers, KPIs, sparkline prix, CO₂/budget, prédiction, Wrapped, badges, tuile accueil) et **invalide le cache des agrégats serveur** (périmé ≤ 1 h) — fin des graphiques figés jusqu'au rechargement. Hub central `refreshAfterPlein()` (main.js) déclenché par un événement `plein-added` émis par `js/formulaire.js`. `js/main.js`, `js/formulaire.js`, `tests/formulaire.test.js`.

## [5.19.0.0] — 2026-06-17

### Changed
- **Excel — MAJ d'ouverture en arrière-plan (« Accueil » figé au 1er plan)** : à l'ouverture, les tâches différées (import +2 s, rebuild +3 s, synchro +5 s) s'exécutent écran gelé via des wrappers `OpenTask_Import/Rebuild/Sync` (drapeau `gSilentOpen`, helper `RunSilentTask`). La feuille active (« Accueil » par défaut, ou celle sur laquelle on navigue pendant les MAJ) reste au 1er plan — fin de la bascule visible vers « Tableau de bord »/log. L'activation cosmétique de `MAJ_Dashboard_Graphiques` est neutralisée quand `gSilentOpen=True` (l'activation porteuse de `PrepareSheet` reste, invisible car écran gelé). `vba/modWorkbook.bas`, `vba/modDashboardGraphiques.bas`, `vba/ThisWorkbook.cls`.

## [5.18.0.0] — 2026-06-16

### Fixed
- **Excel — KPI du Tableau de bord figés à 0 (cause racine : en-têtes `GS_Pleins` corrompus)** : la table `GS_Pleins` avait sa ligne d'en-tête (ligne 2) écrasée (`Date`→`01/01/1970`, `Km`→`0`, `Litres`→`2`, `PrixL`→`3`, prix station→`Colonne1..6`). `ComputeDashboardStats` faisait `ColIdx("Km") = 0` → `Exit Sub` → tous les KPI à 0. En-têtes restaurés (données intactes) → KPI réels (6,4 L/100 km, 14 pleins, 192 €, 80 % E85).
- **Excel — Récidive de la corruption d'en-tête** (`Feuil4.cls`, `Worksheet_Change`) : le garde-fou `Intersect(…, Rows("2:…"))` excluait la ligne 1, mais la table a son en-tête en **ligne 2** → toute écriture sur l'en-tête y estampillait `Modifie_local = Now()`. Corrigé : exclusion de la vraie ligne d'en-tête de la table (`ListObjects(1).HeaderRowRange.Row + 1`).
- **Excel — B7 « Graphiques auto » corrompu** (`modGraphiques.bas`) : la cellule contenait une liste de carburants au lieu de `Oui/Non` → `GraphAutoActif() = Faux`. Réinitialisation forcée à `Oui` si la valeur n'est ni `Oui` ni `Non` (auparavant : seulement si vide).
- **Excel — Boutons de navigation superposés** (`modSidebar.bas`, `PoserSidebarSurFeuille`) : 2ᵉ passe de distribution qui repositionne les 6 items selon leur largeur finale réelle (gaps égaux ~4 pt, zéro chevauchement).
- **Excel — Boutons Actualiser/Recréer/Export débordant sur le segment Véhicule** (`modDashboardGraphiques.bas`, `modGraphiques.bas`) : réalignés en rangée horizontale propre en bas à gauche du bandeau (x = 16/66/116, 26 pt, libellés sous les icônes), entièrement contenus dans le bandeau.

### Changed
- **Excel — `hdrBand` supprimé** (`modGraphiques.bas`, `EnsureHeaderBand`) : le bandeau-titre « TABLEAU DE BORD · Suivi Conso Carburants » (doublon visuel masqué derrière `dash_banner`) n'est plus créé ; `EnsureHeaderBand` le supprime désormais s'il existe.
- **Excel — Bandeau du Tableau de bord remonté, écart réduit** (`modDashboardGraphiques.bas`, `BuildHeaderAndKPIs`) : `ht = NavbarBottom(ws) + 3` (écart blanc ~3 px sous la barre de navigation, au lieu de 10).
- **Excel — `dash_banner` et `slcPeriode` rentrés dans le cadre** : largeur du bandeau réduite (`bnLeft + 6`, `bnW − 12`) et largeur du segment Période réduite de 8 pt (`modFiltres.bas`, `PlaceSlicers`) → leurs bords droits ne sont plus posés sur la ligne de la colonne (impression « tient dans le cadre »).
- **Excel — `dash_meta_params` : « Auto: … » masqué** (`modDashboardGraphiques.bas`, `AddBannerParamsInfo`) : affiche uniquement « Mise à jour: … ».

### Added
- **Excel — Reconstruction du Tableau de bord à l'ouverture** (`ThisWorkbook.cls`, `modFiltres.bas`) : `Workbook_Open` planifie `SyncFiltersAndRebuildOnOpen` (+3 s, après l'import) qui recale `B5/B6` sur les segments véhicule/carburant restaurés par Excel puis reconstruit le tableau → KPI à jour et dernier véhicule/carburant restitués dès l'ouverture.

## [5.17.0.0] — 2026-06-14

### Changed
- **Excel — `btnPleinEcran` déplacé sur l'onglet Réglages** (`Affichage.bas`) : le bouton « Quitter le plein écran » n'est plus posé sur tous les onglets (col K ligne 1, masqué par la navbar). Il est désormais affiché uniquement sur l'onglet `Réglages`, aligné sous `btnReg2` (même Left = col F, Top = btnReg2.Top + hauteur + 8 pts). `.Placement = xlFreeFloating` ajouté. Les autres onglets ont leur `btnPleinEcran` nettoyé à l'exécution de `PoserBoutonsPleinEcran`.
- **Excel — Bannière du tableau de bord en largeur dynamique** (`modDashboardGraphiques.bas`) : `WTOT()` ne renvoie plus une constante 1160 pts mais lit le nombre de colonnes configuré pour `Tableau de bord` dans la table Zoom de l'onglet `Réglages` (via `Affichage.ZoomColsForSheet`), puis somme les largeurs réelles des N premières colonnes. La bannière, les cartes KPI, les bandeaux méta et la grille de graphiques s'adaptent ainsi automatiquement à la mise en page zoom de chaque onglet.
- **Excel — `ZoomColsForSheet` rendu public** (`Affichage.bas`) : la fonction (précédemment `Private`) est maintenant `Public` pour être appelée depuis `modDashboardGraphiques`.

### Added
- **Excel — Barre de progression à l'ouverture** (`ThisWorkbook.cls`, architecture classeur v2.8) : `Workbook_Open` affiche 6 étapes en barre d'état (`Application.StatusBar` + `DoEvents`) ; les opérations lourdes restent différées (import des pleins +2 s, synchro Google Sheets +5 s) pour rendre le classeur visible et interactif immédiatement.
- **Excel — Libellés des boutons de navigation** (`modDashboardGraphiques.bas`, `modSidebar.bas`) : `NavbarBottom()` + `AddButtonLabels()` posent les étiquettes texte sous les icônes de la barre de navigation ; placement raffiné dans `PoserSidebarSurFeuille`.

### Fixed
- **Excel — Erreur de compilation `-2146788248` au clic sélecteur véhicule** (`modGraphiques.bas`, `EnsureHeaderBand`) : `hdrTop`/`btnTop` (issus de `NavbarBottom() As Single`) étaient passés `ByRef` à des paramètres `As Double` → « Type argument ByRef incompatible » (compile-on-demand). Types alignés en `Double` (leçon #33).

## [5.16.3.0] — 2026-06-14

### Changed
- **Excel — Sidebar : refonte en bandeau horizontal** (`modSidebar.bas`) : abandon de la sidebar mobile avec survol (bugs DPI/zoom insolubles). Nouvelle navigation = barre horizontale fixe en haut de chaque feuille (#1B3A5C), 6 items cliquables (icône + label, 108 × 30 pts visuels), onglet actif en vert (#1D9E75) + texte blanc gras, autres en bleu sombre + texte grisé. Zéro timer, zéro Win32 API, zéro hover. Suppression de toutes les déclarations `Declare` et du code `SetTimer`/`GetCursorPos`/`g_IcoOrigW`. Zoom corrigé par feuille (`ws.Activate` + `ZoomFactor()` dans `PoserSidebarSurTousLesOnglets`). Shapes parasites (`sb_bg`, `sb_ham`, `sb_ico_*`, etc.) nettoyées à chaque appel.

## [5.16.2.3] — 2026-06-14

### Fixed
- **Excel — Sidebar hover : double stratégie de détection** (`modSidebar.bas`) : passe 1 = `RangeFromPoint` (zéro conversion) ; passe 2 = fallback comparaison de coordonnées calibrée (si passe 1 retourne Nothing). Les deux sont désormais actives.
- **Excel — Sidebar icônes trop grandes sur certains onglets** (`modSidebar.bas`, `PoserSidebarSurTousLesOnglets`) : le zoom de l'onglet **actif** était appliqué à **tous** les onglets. `PoserSidebarSurTousLesOnglets` active maintenant chaque feuille (`ws.Activate` + `ScreenUpdating = False`) pour lire son zoom réel avant de placer les shapes, puis restaure l'onglet d'origine.

## [5.16.2.2] — 2026-06-14

### Fixed
- **Excel — Sidebar hover : `RangeFromPoint` toujours silencieux** (`modSidebar.bas`) : `v = win.RangeFromPoint(...)` sans `Set` sur une variable `Variant` fait appeler la propriété par défaut de l'objet retourné — échoue silencieusement pour Shape, `hotIdx` reste -1. Corrigé : `Dim v As Object` + `Set v = win.RangeFromPoint(...)`.

## [5.16.2.1] — 2026-06-14

### Fixed
- **Excel — Sidebar hover : zones toujours décalées après calibration** (`modSidebar.bas`) : la calibration `PointsToScreenPixelsX` précédente était mathématiquement équivalente à l'approche directe et donc identiquement fausse (les deux mélangent pixels physiques/logiques). Nouvelle approche : `Window.RangeFromPoint(pt.x, pt.y)` prend directement les coordonnées de `GetCursorPos` et retourne l'objet sous le curseur — aucune conversion DPI/zoom, 100 % fiable. Détection par `TypeName(v) = "Shape"` + préfixe `sb_ico_`/`sb_lbl_`.

## [5.16.2.0] — 2026-06-14

### Fixed
- **Excel — Sidebar hover : zones de détection décalées corrigées** (`modSidebar.bas`) : le survol de l'icône « Prix/Stations » déclenchait le label de « Paramètres » (et autres décalages similaires). Cause : `PointsToScreenPixelsX/Y` renvoie des pixels logiques, `GetCursorPos` des pixels physiques — l'écart est amplifié par le zoom. Correction par **calibration** : `ox = PointsToScreenPixelsX(0)`, `ppx = (PointsToScreenPixelsX(72) − ox) / 72` → curseur converti en points document (`docX = (pt.x − ox) / ppx`) puis comparé directement avec `ico.Left`/`ico.Top` (aussi en points document, invariants par rapport au zoom). Suppression de `g_IcoOrigW(5)` (snapshot stale) : `ExpandIconHover`/`CollapseIconHover` recalculent la largeur initiale à la volée depuis `(W_COLLAPSED − 4) / ZoomFactor()`.

## [5.16.1.0] — 2026-06-13

### Fixed
- **Excel — Sidebar hover Win32 (Option C)** (`modSidebar.bas`) : le label ne s'affichait pas au survol des icônes. Implémentation complète via `GetCursorPos` + `SetTimer` 200 ms (`HoverTimerProc`/`DoHoverCheck`/`ExpandIconHover`/`CollapseIconHover`). Survol d'une icône → label glisse instantanément à droite (texte aligné gauche, fond icône élargi à 220 pt) ; sortie de zone → repli instantané. Clic icône ou label → navigation directe (`NavSidebar_N`). Suppression du code preview-click (`PreviewSidebar_N`, `ExpandIcon`, `CollapseIcon`, `g_Snap*`) remplacé par le timer Win32.

## [5.16.0.0] — 2026-06-13

### Changed
- **Excel — Sidebar refonte : colonne d'icônes + aperçu titre par icône** (`modSidebar.bas`) : état par défaut **seul ☰** visible sur chaque onglet ; clic ☰ → dépli progressif de la **colonne d'icônes** (sans libellés) ; clic icône → shape s'étend vers la droite révélant le titre aligné à gauche, **icône immobile** (snapshot géométrie exacte) ; repli progressif automatique après ~2 s avec **restauration pixel-perfect** (snapshot/restauration, jamais recalcul depuis le zoom — corrige le décalage de taille). `vba/modSidebar.bas` (variables `g_Snap*`, `ExpandSidebar`/`CollapseSidebar`/`HideIconColumn`/`ExpandIcon`/`CollapseIcon`/`SiblingWidth`/`RestoreSnap`).

### Removed
- **Excel — Module mort `modNavMenu` supprimé** : `modNavMenu.bas` (module VBA + miroir disque) et le bloc appel orphelin `Application.Run "modNavMenu.PoserBoutonsNavMenu"` dans `Affichage.bas` retirés. Aucun `OnAction`/`Call` orphelin — compilation propre.

## [5.15.0.0] — 2026-06-13

### Added
- **Excel — Vignette du ticket de caisse dans l'onglet « Hist. Carburant »** : nouvelle colonne **« Ticket »** du tableau `tblHistorique` affichant la photo du ticket via la fonction **`IMAGE()`** (Microsoft 365). L'URL Drive stockée en colonne P de `GS_Pleins` (forme `.../file/d/{id}/view`, alimentée par W9 : app → GAS → Drive) est convertie en URL **vignette** (`https://drive.google.com/thumbnail?id={id}&sz=w800`, une vraie image affichable, contrairement à l'URL `/view` qui renvoie une page). Les lignes ne sont rehaussées (60 px) que si **au moins un** plein possède une photo — tableau compact sinon. `vba/modHistorique.bas` (helpers `TicketImageFormula` / `DriveFileId`, colonne J). Le pipeline de capture/stockage (W9) et l'import Power Query de la col P (v4.3.0.5) étaient déjà en place ; cette version ajoute l'**affichage** dans le classeur local.

### Changed
- **Versions** — `APP_VERSION` / `package.json` 5.14.2.0 → 5.15.0.0.

## [5.14.2.0] — 2026-06-13

### Fixed
- **App — Prix des autres carburants non importés lors d'un plein (cause racine du `#VALEUR!` sur la dernière ligne du dashboard)** : à la soumission, si la liste multi-carburants de la station n'avait pas eu le temps de se charger (`state._stationPrices` vide), seul l'**E85 de repli** partait → les 5 autres prix station (SP98 / SP95 / E10 / Gazole / GPLc) manquaient côté Sheet / Excel. Nouveau repli `fetchStationPricesSilent(lat, lon)` (`js/prix.js`) : recharge **silencieusement** (sans effet de bord UI) les 6 prix station par cercles croissants (500 m → 5 km) et les injecte dans le payload avant envoi (`js/formulaire.js`). Le chemin nominal (prix déjà chargés) est **inchangé** — aucun appel réseau supplémentaire.
- **Excel — `#VALEUR!` sur la dernière ligne du dashboard (« Suivi Carburant »)** : faute de prix SP98 station, `K` (« Prix S98 jour ») = "" → `L` (« Coût équiv. S98 ») = "" → les formules `M` (« Economie sur le plein ») et `N` (« Économie cumulée ») faisaient `("" − coût) / ""` sans protéger contre un `L` non numérique. Formules `M` / `N` rendues robustes (renvoient vide / reportent le cumul quand le prix SP98 manque). Vérifié : **0 cellule en erreur** sur toute la feuille, cumuls et pourcentages historiques **inchangés**.

### Changed
- **Tests** — `tests/formulaire.test.js` : 2 cas ajoutés (rechargement silencieux des 6 prix station à la soumission ; non-appel quand les prix sont déjà chargés).
- **Versions** — `APP_VERSION` / `package.json` 5.14.1.0 → 5.14.2.0.

## [5.14.1.0] — 2026-06-12

### Fixed
- **Style — Bouton de rayon sélectionné illisible en thème sombre** : en mode sombre, le bouton de rayon actif (`.radius-btn.active`, ex. « 5 km ») affichait un texte sombre (`#0f172a`) sur un fond `var(--blue-dark)` lui aussi sombre (`#0f1e30`) → contraste **1.06:1**, label invisible. Le fond de l'état actif passe désormais à `var(--blue-mid)` (bleu vif `#60a5fa`), alignant le bouton sur le patron `.submit-btn` → contraste **7.02:1** (AA), label net et état sélectionné bien distinct. `css/style.css`.
- **Versions** — `APP_VERSION` / `package.json` 5.14.0.0 → 5.14.1.0.

## [5.14.0.0] — 2026-06-12

### Added
- **App — Cercle de rayon sur la carte Saisie (W81)** : la recherche manuelle par adresse trace désormais un **cercle vert** (charte `--green`) autour du point sélectionné, matérialisant le rayon choisi (2 / 5 / 10 / 20 / 50 km). Rendu via `google.maps.Circle` (moteur Google) et **cercle CSS proportionnel** (mètres → pixels Web-Mercator) en repli OpenStreetMap ; le cadrage de la carte **s'étend** pour montrer tout le périmètre. `js/gmaprender.js`, `js/carte.js`, `js/recherche.js`. La géoloc « autour de moi » et le mode « Ville seule » restent **sans** cercle (pas de rayon explicite).
- **App — Partage image du bilan « Wrapped » (W57)** : bouton **« Partager »** sur la carte de bilan annuel → rend une image **1080×1350** (carte charte dessinée sur `<canvas>`, **sans dépendance**) → **Web Share API** (`navigator.share` avec fichier PNG) sur mobile, **repli téléchargement PNG** sur navigateur sans partage de fichiers. Bouton masqué tant qu'aucune carte n'est rendue. `js/wrapped.js`, `index.html`.

### Changed
- **ESLint** — ajout du global navigateur `File` (Web Share API). `eslint.config.js`.
- **Tests** — `tests/carte.test.js` (cercle de rayon en repli OSM) ; nouveau `tests/wrapped.test.js` (branchement partage fichier / repli téléchargement / annulation).
- **Versions** — `APP_VERSION` / `package.json` 5.13.0.1 → 5.14.0.0.

## [5.13.0.1] — 2026-06-12

### Fixed
- **Excel — Bouton « Synchroniser » (X1) hors écran** : `EnsureSyncButtonGSPleins` plaçait le bouton **à droite** de l'en-tête de la table `GS_Pleins` (≈ 1720 pt de large, 19 colonnes) → invisible sans défilement horizontal. Repositionné en **haut à gauche fixe** (coin A1, `ZOrder` premier plan), indépendant de la largeur de la table → toujours visible à l'ouverture de la feuille. `vba/modSyncGS.bas`.
- **Excel/JS — `WB_VERSION` / `APP_VERSION`** 5.13.0.0 → 5.13.0.1.

### Changed
- **ROADMAP** — items terminés **retirés** des tableaux « à faire » (fin des lignes barrées : X1, X9, X15, X20, X21, C8) ; le « Top 5 » est rafraîchi avec les priorités courantes (X39, X43c, W78, C9, W57). L'historique des versions reste la seule trace des items livrés.

## [5.13.0.0] — 2026-06-11

### Added
- **Excel — Bouton « Synchroniser » sur la feuille `GS_Pleins` (X1)** : bouton vert posé à droite de l'en-tête de la table `GS_Pleins` (jamais par-dessus les données), `OnAction = SyncManuel` → lance la synchro Excel ↔ Google Sheets **sans passer par Alt+F11/Alt+F8**. Macro idempotente `EnsureSyncButtonGSPleins` (`vba/modSyncGS.bas`), câblée dans `Installer` (`vba/modWorkbook.bas`) et lançable seule (`Alt+F8`).

### Changed
- **Excel — Rebuild du tableau de bord non bloquant & coalescé (X43)** : `modFiltres.ApplyFiltersFromControls` ne relance plus un `RecreerDashboardComplet` complet (~20-30 s) **à chaque** changement de segment/chronologie.
  1. **Écriture de B5/B6 à événements OFF** → supprime le cascade `Feuil3.Worksheet_Change(B2:B6)` qui déclenchait un rebuild complet pour **chaque** cellule écrite, en plus du rebuild explicite (jusqu'à **3 rebuilds** par changement).
  2. **Debounce** via `Application.OnTime` (~1 s, plancher fiable) : N filtres changés à la suite (Véhicule → Carburant → Période) = **un seul** rebuild (`DebouncedRebuild`).
  3. Rebuild **silencieux** (chemin `CreerGraphiquesWeb silent:=True` + `MAJ_Dashboard_Graphiques`, comme `Worksheet_Change`) + **sablier** (`xlWait`) et barre d'état pendant le calcul.
  Nouveaux helpers `ScheduleRebuild` / `CancelPendingRebuild` / `DebouncedRebuild` dans `vba/modFiltres.bas`.
- **Excel — `WB_VERSION` / `APP_VERSION`** 5.12.0.0 → 5.13.0.0.

## [5.12.0.0] — 2026-06-11

### Added
- **Excel — Filtres natifs du tableau de bord (Segments + Chronologie)** : barre de 3 contrôles sous la bannière — Segment **Véhicule** (`slcVehicule`), Segment **Carburant** (`slcCarburant`, 6 carburants canoniques E85/SP95/SP98/E10/GAZOLE/GPLc toujours présents via *seed*) et **Chronologie « Période »** (`slcPeriode`, cache `tlPeriode`). Hébergés par un TCD caché `ptFiltres` (table `tFilterSrc` dérivée de `GS_Pleins`). Toute sélection déclenche `Workbook_SheetPivotTableUpdate` → `modFiltres.ApplyFiltersFromControls` → écrit l'état (B5/B6 + B9/B10) → `RecreerDashboardComplet` recalcule **tous** les graphiques. Nouveau module `vba/modFiltres.bas`. La chronologie est **créée par programmation (COM)** : `SlicerCaches.Add2(ptFiltres,"Date",nom,2)` puis `cache.Slicers.Add` (le handoff manuel n'est plus nécessaire).
- **Excel — `gConso` : 1 courbe L/100 km par véhicule** (source `GS_Pleins`) : `BuildConsoBlock` (col BC de `_GraphData`), conso = Litres ÷ Δkm × 100 avec garde-fou 0–60.
- **Excel — Filtre Période sur toutes les séries datées** : noms `PERIODE_DEB`/`PERIODE_FIN` (cellules d'état B9/B10) bornant prix, coût mensuel, CO2, conso, rentabilité kit, coût/km, éco cumulée, scatter et KPI annuels (`gVeh` reste une comparaison tous-véhicules, sans dimension date).
- **Excel — Calage automatique de la Chronologie à la 1ʳᵉ ouverture** (`modFiltres.ApplyDefaultPeriodOnce`) : à la première activation du Tableau de bord dans la session, les poignées de la chronologie sont calées sur **[1ᵉʳ plein ; dernier plein]** (jours pleins, `Int`) et la période reste **non bornée** (B9/B10 vidés = tous les pleins). Sémantique **« once »** : un réglage manuel ultérieur n'est plus écrasé. `modFiltres.RefreshFilterData` rafraîchit en outre les données de filtre (`tFilterSrc` ← `GS_Pleins` + seeds carburants) **à chaque ouverture** de l'onglet, en préservant la sélection et sans détruire TCD / segments / chronologie.

### Changed
- **Excel — `gPrice` respecte la multi-sélection carburant** (B6 en CSV) : `BuildPriceBlockMerged(selFuels)` construit un `wantSet` (FuelKey) appliqué aux 2 sources (pleins Tableau2 + marché `PrixHistory`).
- **Excel — `btnRecreerGraph` reproduit le rendu d'ouverture** : `RecreerDashboardComplet` = `CreerGraphiquesWeb` + `MAJ_Dashboard_Graphiques`.
- **Excel — Cellules d'état masquées (P6)** : les listes déroulantes B5/B6 (validation) et le panneau carburant dessiné (`fup_btn` / `modFuelPanel`) sont **retirés**, remplacés par les segments. Le bloc paramètres A1:B10 est rendu invisible (police/fond blancs) en **conservant la géométrie** (largeurs A/B → bannière ; hauteurs 1–6 → bande segments). B2..B10 deviennent des cellules d'état cachées lues par le moteur.
- **Excel — Barre de filtres sur 1 rangée** : 3 contrôles alignés à largeur égale (Véhicule / Carburant / Chronologie) couvrant le bandeau, en **bleu charte** (`SlicerStyleLight5` / `TimeSlicerStyleLight5`, réappliqué à chaque MAJ).
- **Excel — Bannière pleine largeur** (`dash_banner` posée après le rail d'icônes via `SidebarRailRight`) ; titre 22 pt gras **centré** + sous-titre centré.
- **Excel — 3 boutons d'action verts à gauche** (Actualiser / Recréer / Export) avec **mini-titres** (`dash_btnlbl_0..2`) ; libellé méta « Dernière gen » → « Mise à jour ».
- **Excel — `WB_VERSION` / `APP_VERSION`** 5.11.2.0 → 5.12.0.0.

### Fixed
- **Excel — Sidebar préservée au rebuild** : `PurgeUnknown` (`CreerGraphiquesWeb`) ne détruit plus les shapes `sb_*` / `fup_*` ; `RecreerDashboardComplet` / `btnRecreerGraph` ne cassent plus la barre latérale (22 shapes conservées).
- **Excel — Date du dernier plein décalée (6 sept. au lieu de 9 juin)** : `ModuleImportGS.ImporterNouveauxPleins` re-parsait une vraie date via `CStr` (FR jj/mm) interprétée en M/J US (jour ≤ 12 ⇒ mois). Corrigé : `If IsDate(cell.value) Then CDate(cell.value)` (lecture du sérial, locale-indépendant).
- **Excel — Calage chronologie sans effet (no-op)** : `TimelineState.SetFilterDateRange` ignore silencieusement une borne portant une **heure** (dernier plein à 02:00). Bornes **arrondies au jour plein** (`Int`) dans `ApplyDefaultPeriodOnce`, séquence à **événements OFF** pour qu'un `RecreerDashboardComplet` ne ré-applique pas l'ancien filtre.

## [5.11.2.0] — 2026-06-09

### Changed
- **Excel — Boutons d'action du tableau de bord en ICÔNES** : « Recréer les graphiques » (`btnRecreerGraph`, glyphe graphique), « Exporter en PDF » (`btnExportGraph`, glyphe fichier PDF) et « Actualiser » (`dash_btn`, glyphe synchro) deviennent des boutons-image carrés 28×28 — glyphes Segoe MDL2 Assets blancs sur vert charte #1D9E75 — **groupés et alignés dans le bas de la bannière bleue** (Top 88, Left 338/374/410), avec info-bulle au survol (`AlternativeText`). PNG générés par `excel/assets/_make_final_icons.ps1`. `vba/modGraphiques.bas` (`EnsureButtons`/`EnsurePictureButton`), `vba/modDashboardGraphiques.bas` (`AddButton` → image, ex-shape texte « Actualiser »).
- **Excel — `WB_VERSION` / `APP_VERSION`** 5.11.1.0 → 5.11.2.0.

### Fixed
- **Excel — Dérive horizontale des boutons-image (+23 pt)** : les boutons héritaient du `Placement` par défaut `xlMoveAndSize` et se décalaient à droite quand `StyleParamsPanel` élargissait les colonnes A:B (Left 374 rendu à 397.6…). `Placement = xlFreeFloating` ajouté sur les boutons-image → positionnement absolu stable à tout zoom. `vba/modGraphiques.bas`, `vba/modDashboardGraphiques.bas`.

### Removed
- **Dépôt — `extract.json`** (0 o) à la racine : parasite de redirection shell, supprimé (committé par mégarde en 5.11.1.0 via `git add -A`).

## [5.11.1.0] — 2026-06-09

### Fixed
- **Excel — Clic sur une icône du menu latéral (« Variable non définie »)** : `Private Const PREVIEW_DELAY` était déclarée au milieu de `modSidebar.bas` (après des procédures). Sous « Compile à la demande », l'erreur ne surgissait qu'au premier appel de `PreviewIcon` (donc au clic sur une icône). Constante remontée en section déclarations. `vba/modSidebar.bas`.
- **Excel — Navigation « Réglages » impossible (erreur -2146788248)** : `Private Const WS_CARB` déclarée après la fonction `WS_REG` dans `modReglages.bas` → `WS_CARB` non reconnue → `CarbSheet()` levait « Variable non définie », propagée par `Worksheet_Activate` → `ReglagePullParametres`. Constante remontée en déclarations. `vba/modReglages.bas`.
- **Excel — Navigation « Suivi Carburant » impossible (erreur -2146788248)** : `Worksheet_Activate` → `ImporterNouveauxPleinsAuto` → `ImporterNouveauxPleins` contenait un appel orphelin `Call SyncStationsVersGoogleSheets` (procédure du module `synchroniseGoogleForm` supprimé) → « Sub or Function not defined ». Appel retiré ; le push de stations vers GS est désormais assuré par `modSyncGS`. `vba/ModuleImportGS.bas`.
- **Excel — `modWorkbook.bas`** : `Private Const WS_DATA` déclarée après la fonction `WS_REG` (même classe de bug latent) → remontée en déclarations (préventif).

### Changed
- **Excel — Bouton « Exporter en PDF » (`btnExportGraph`) en vert** : PNG `excel/assets/btn_export_pdf.png` régénéré avec le dégradé vert #1D9E75 (identique à « Recréer les graphiques ») ; couleur de repli `C_COUT` → `C_E85` dans `EnsureButtons`. `excel/assets/_make_buttons.ps1`, `vba/modGraphiques.bas`.
- **Excel — `WB_VERSION`** 5.11.0.0 → 5.11.1.0. `vba/modWorkbook.bas`.
- **Version unifiée — `APP_VERSION`** (`js/config.js`) 5.10.0.0 → 5.11.1.0 : rattrapage du retard de la PWA sur le CHANGELOG / `WB_VERSION`.

### Removed
- **Excel — Code mort liste carburant** : procédures `SetupFuelListBox`, `RefreshFuelListBox`, `SyncFuelFromListBox`, `ApplyFuelSelection` (ancienne ListBox ActiveX) retirées de `modDashboardGraphiques.bas` (−143 lignes), remplacées par le panneau Option C `modFuelPanel`.

## [5.11.0.0] — 2026-06-07

### Added
- **Excel — Sidebar Variante C "Pill coulissant"** : `modSidebar.bas` réécrit entièrement. Shapes fixes (`sb_*`) sur chaque onglet, sans UserForm. Pill `msoShapeRoundedRectangle` avec `xlFreeFloating` ; largeur 44 pt → 220 pt animée (8 frames, step 22). Auto-repli 4 s. 6 items de navigation. `RepositionSidebar` remet l'état expanded à zéro lors d'un changement d'onglet.
- **Excel — Charte graphique** : nouveau module `modCharte.bas`. 6 cellules nommées `C_Primaire`, `C_Vert`, `C_Ambre`, `C_Rouge`, `C_Texte`, `C_Subtil` dans la feuille Réglages. L'admin modifie le remplissage via Excel, puis clique « Appliquer la charte » → `AppliquerCharte` reconstruit la sidebar et le dashboard avec les nouvelles couleurs.
- **Excel — Zoom par onglet** : table « Zoom par onglet » dans Réglages (plage nommée `Zoom_TableStart`). `AutoZoomFitCols` dans `Affichage.bas` lit le nombre de colonnes cible par onglet et calcule le zoom exact ; repli sur `AutoZoomFitWidth` si l'onglet n'est pas configuré. Appelée depuis `Workbook_SheetActivate` (remplace `AutoZoomFitWidth`).
- **Excel — ListBox multi-sélection carburant** : `SetupFuelListBox` dans `modDashboardGraphiques.bas` pose un ActiveX `Forms.ListBox.1` (`fmMultiSelectExtended`) sur « Tableau de bord » près de B6. Bouton « ↻ Rafraîchir » appelle `ApplyFuelSelection` → `SyncFuelFromListBox` écrit la sélection comma-séparée dans B6 → `MAJ_Dashboard_Graphiques`. `RefreshFuelListBox` pré-sélectionne les items selon la valeur actuelle de B6.

### Changed
- **Excel — `modReglages.bas`** : `CreerFeuilleReglages` crée deux nouvelles sections : « Zoom par onglet » (table + plage nommée `Zoom_TableStart`) et « Charte graphique » (cellules colorées + bouton « Appliquer »).
- **Excel — `ThisWorkbook`** : `Workbook_SheetActivate` appelle désormais `AutoZoomFitCols` au lieu de `AutoZoomFitWidth`.

## [5.10.0.0] — 2026-06-07

### Added
- **Excel — Filtre carburant multi-sélection** : `FuelInSel(fk, sel)` dans `modDashboardKPI.bas` (public) — interprète `sel` comme une liste séparée par virgules (ex. `"E85, SP95"`) ; retourne `True` si `fk` appartient à la sélection ou si `sel` vaut `KPI_TOUS`/vide.
- **Excel — `FuelKeyK` public** : la fonction de normalisation des clés carburant est désormais accessible depuis tous les modules.

### Changed
- **Excel — `modDashboardKPI.bas`** : toutes les comparaisons directes `fk <> fuel` remplacées par `Not FuelInSel(fk, fuel)` dans les deux passes de `ComputeConsumption` et `ComputeDashboardStats` (4 sites). Le calcul du prix moyen utilise désormais `FuelInSel` pour inclure tous les carburants sélectionnés.
- **Excel — `modGraphiques.bas`** : filtre `fk <> selFuel` remplacé par `Not modDashboardKPI.FuelInSel(fk, selFuel)`. `BuildPriceBlockMerged` reçoit `""` (tous) quand la sélection contient une virgule — affiche toutes les courbes de prix en mode multi-carburant.
- **Excel — `modDashboardGraphiques.bas`** : `EnsureSelectors` ne réinitialise plus B6 quand la valeur contient une virgule (sélection multi-carburant préservée).

## [5.9.0.0] — 2026-06-07

### Added
- **Excel — Sidebar navigation (Variante A)** : `modSidebar.bas` (nouveau module). UserForm modeless persistant sur tous les onglets ; largeur 44 pt au repos (icônes seules), 182 pt à l'ouverture (icône + libellé). Hamburger ☰ déclenche l'animation, auto-repli après 4 s via `Application.OnTime`. 6 destinations : Accueil, Tableau de bord, Carte, Suivi Carburant, Prix/Station, Réglages. Appelée depuis `Workbook_Open` ; `RepositionSidebar` à chaque `SheetActivate`.
- **Excel — Auto-zoom centralisé** : `AutoZoomFitWidth` dans `Affichage.bas` (calcule le rapport `UsedRange.Width / ActiveWindow.Width`, borne à [50 %–200 %]). Appelée depuis `Workbook_SheetActivate` dans `ThisWorkbook`.
- **Excel — B7 liste déroulante** : `EnsureParamBlock` dans `modGraphiques.bas` écrit "Oui"/"Non" dans les cellules BB1:BB2 (col. 54, masquée) et pose une validation `xlValidateList` sur B7 depuis cette plage (indépendant de la locale Excel).
- **Excel — Infos B7/B8 dans le bandeau** : sous-programme `AddBannerParamsInfo` dans `modDashboardGraphiques.bas` ; insère une textbox `dash_meta_params` en bas-droit du bandeau bleu, police 8 pt, couleur #8CAAC8, texte « Auto: [B7]   Dernière gén: [B8 formaté] ».

### Fixed
- **Excel — Boutons `btnRecreerGraph` / `btnExportGraph` masqués** : repositionnés à `Top=88` (sous le texte titre/sous-titre du bandeau `dash_banner`) dans `modGraphiques.EnsureButtons` ; `ZOrder msoBringToFront` appliqué dans `EnsureButtons` ET dans `MAJ_Dashboard_Graphiques`.
- **Excel — Liste B6 carburants exhaustive** : `EnsureSelectors` dans `modDashboardGraphiques.bas` commence désormais par la liste fixe (tous), E85, SP95, SP98, Gazole, GPL, E10, puis ajoute les valeurs distinctes de `GS_Pleins` absentes de cette liste.

### Changed
- **ThisWorkbook** : ajout `Workbook_SheetActivate` (auto-zoom + repositionnement sidebar) ; `Workbook_BeforeClose` appelle `modSidebar.HideSidebar` avant `DesactiverPleinEcran`.
- **`APP_VERSION` 5.8.0.0 → 5.9.0.0** (`js/config.js`, incrément MINOR : nouvelles fonctionnalités Excel — sidebar, auto-zoom, améliorations dashboard)

## [5.8.0.0] — 2026-06-07

### Added
- **Web — Onglet Saisie** : boutons ⛶ Plein écran et ✕ Fermer déplacés en superposition semi-transparente sur la carte (coin haut-droit), `.smap-ctrl-overlay` ; la barre `.map-header` est supprimée. `index.html`, `css/style.css`.
- **Web — Onglet Carte** : boutons zoom +/− personnalisés (34×34 px, même taille que le bouton Plein écran) ; contrôle natif Google Maps `zoomControl` désactivé ; `zoomGoogleMap()` exportée. `js/gmaprender.js`, `js/stationsmap.js`, `css/style.css`.
- **Web — Google Maps** : bouton de rotation/direction (`rotateControl`) supprimé de la carte Saisie. `js/gmaprender.js`.
- **Excel — X9** : graphique « Économies cumulées E85 vs SP98 » (courbe par date, bloc `AM:AN` dans `_GraphData`). `vba/modGraphiques.bas`.
- **Excel — X15** : graphique scatter « Prix E85 €/L vs Conso L/100 km » avec droite de tendance (corrélation comportementale, bloc `AP:AQ` dans `_GraphData`). `vba/modGraphiques.bas`.
- **Excel — X20** : interrupteur « Graphiques auto » (cellule B7 sur « Tableau de bord », Oui/Non, défaut Oui) ; `modSyncGS.SyncCore` ne déclenche `CreerGraphiquesWeb` que si actif. `vba/modGraphiques.bas`, `vba/modSyncGS.bas`.
- **Excel — X21** : horodatage de dernière génération en B8 sur « Tableau de bord », écrit à chaque `CreerGraphiquesWeb`. `vba/modGraphiques.bas`.
- **Excel — Menu hamburger** : couleur du bouton ☰ alignée sur la charte graphique (#1D9E75 vert → #1B3A5C bleu foncé). `vba/modNavMenu.bas`.
- **C8 — Versionnage GAS** : script `scripts/sync-gas.sh` (déploie via `gas-deploy.mjs` puis git-commit les fichiers `.gs`).

### Changed
- **`APP_VERSION` 5.7.0.0 → 5.8.0.0** (`js/config.js`, incrément MINOR : nouvelles fonctionnalités utilisateur)

## [5.7.0.0] — 2026-06-07

### Added
- **U9 — Filtre véhicule global persistant** — sélecteur `#vehiculeSelGlobal` en header ; synchronise le périmètre véhicule sur toutes les vues (Stats, Carte, Historique) via l'événement `vehicule-changed`. `index.html`, `js/vehicules.js`, `js/main.js`.
- **W58 — Prochain plein estimé** — la vue Stats affiche « prochain plein ≈ le JJ/MM » calculé depuis le rythme moyen (km/jour × autonomie). `js/stats.js` (`buildPrediction`).
- **W73 — Coût réel dans les agrégats Excel** — `CoutPlein()` (`modHistorique.bas`) lit la colonne T (Coût € exact, W71) si renseignée et > 0, sinon recalcule `litres × prix`. `modDashboardKPI.bas` (`ComputeKPIs`, `ComputeDashboardStats`) adapté avec le même garde-fou `UBound(a,2) >= 20`. `vba/modHistorique.bas`, `vba/modDashboardKPI.bas`.

### Fixed
- **Excel — Validation B5/B6 (sélecteur véhicule/carburant)** — menu déroulant du Tableau de bord inaccessible ; `EnsureSelectors` recrée les listes AZ/BA et pose la validation sur B5/B6 après `MAJ_Dashboard_Graphiques`.
- **Excel — Menu hamburger repositionné et centré** — `modNavMenu.bas` : largeur 210 → 280 px, marges intérieures normalisées (`Left=10`, `Width=FW-20`), `StartUpPosition=1` pour centrage sur la fenêtre Excel.
- **CSS — Overflow des boutons rayon** — `.radius-label { flex-basis: 100% }` empêche les libellés de déborder du cadre. `css/style.css`.
- **Bouton plein écran sans annotation** — `<span>` de libellé retiré du bouton ⛶ sur la carte stations. `index.html`, `js/stationsmap.js`.

### Changed
- **`APP_VERSION` 5.6.0.0 → 5.7.0.0** (`js/config.js`, incrément MINOR : nouvelles fonctionnalités utilisateur U9, W58, W73)

## [5.6.0.0] — 2026-06-06

### Changed
- **Découvrabilité des boutons-icônes — libellés visibles sur 10 boutons (W77)** — les boutons jusque-là icône-seule exposent désormais une icône + un mot lisible au doigt, sans changer leur action :
  - **Groupe A — en-têtes** (`.hist-btn--lbl`, pilule icône-au-dessus-du-libellé) : 🏍️ « Véhicule / tous » (`wrappedScopeBtn`), 📜 « Tout voir » (`voirTout`), 📋 « Dupliquer » (`dupliquerDernier`), ↻ « Actualiser » (`chargerHistorique`), 📥 « Export filtré » (`histExportBtn`), 📦 « Export tout » (`histExportAllBtn`), ✕ « Fermer » (`histFullCloseBtn`). Nouvelle classe `.hist-header--stack` (titre puis actions en colonne) pour loger `[select année] + [🏍️ Véhicule / tous]` sans débordement sur la carte Bilan annuel.
  - **Groupe B — champs de saisie** (pilule horizontale icône + mot) : 🎤 « Dicter » (`voiceKmBtn`, SVG conservé) et 📍 « Ma position » (`geoBtn`, **sorti de la superposition du champ Station** vers `.station-wrap` pour ne plus chevaucher le texte saisi).
  - **Groupe C — superposition carte** : ⛶ « Plein écran » / ✕ « Quitter le plein écran » (`.map-fs-btn--lbl`, les deux instances déclarées en dur — carte station et carte « stations habituelles ») ; libellé préservé au bascule plein écran via `setFsButtonState`.
  - Chaque bouton porte un `aria-label` complet (couvert par `tests/buttons-a11y.test.js`, 9 cas) et conserve son `title` (infobulle au survol desktop). Couleur du libellé = `var(--text-muted)` (contraste ≥ 6,9:1 en mode sombre, conforme WCAG AA).
  - **Non-régression** : base `.hist-btn`/`.geo-btn`/`.voice-btn`/`.map-fs-btn` intacte — les boutons `.card-fs-btn` injectés dynamiquement (plein écran générique des cartes) restent icône-seule, inchangés.
- **`APP_VERSION` 5.5.2.0 → 5.6.0.0** (`js/config.js`, incrément MINOR = nouvelle fonctionnalité utilisateur visible)

## [5.5.2.0] — 2026-06-05

### Fixed
- **Cycle d'import circulaire brisé** — `historique.js` importait `renderStats` depuis `stats.js`, qui lui-même importait `renderComparatif` depuis `comparatif.js`, qui importait `getAllRecords` depuis `historique.js` (cycle 3-fichiers). Résolution Option A : suppression de l'import `renderStats` et de ses 3 appels dans `historique.js` ; `main.js` (qui importe déjà `renderStats`) appelle désormais `renderStats()` explicitement après chaque `chargerHistorique()` et `rerenderHistorique()`. Aucun changement de comportement visible — 235 tests au vert.

### Changed
- **`APP_VERSION` 5.5.1.1 → 5.5.2.0** (`js/config.js`)

## [5.5.1.1] — 2026-06-05

### Changed
- **Migration CI vers Node.js 24** — tous les jobs CI (`lint`, `test`, `coverage`, `audit`) passent de `node-version: '20'` à `node-version: '24'` avant la deadline GitHub du 16 juin 2026. `engines.node` dans `package.json` mis à jour en `>=24`.
- **`APP_VERSION` 5.5.1.0 → 5.5.1.1** (`js/config.js`, `package.json`)

## [5.5.1.0] — 2026-06-05

### Added
- **Suite de tests unitaires Vitest — 9 modules non couverts (W72)** — `tests/state.test.js`, `ui.test.js`, `carburant.test.js`, `recherche.test.js`, `formulaire.test.js`, `offline.test.js`, `geo.test.js`, `carte.test.js`, `pwa.test.js`. Couvrent les fonctions à haute valeur : `state` (valeurs/refs par défaut), `ui` (`computeTriplet`, `setFieldPrice`, status setters), `carburant` (`_buildTypeToggle`, `initTypeToggle`, badges), `recherche` (`buildSearchClause` CP/ville, `buildStations` filtre/tri, debounce), `formulaire` (`saveDraft`/`restoreDraft`/`clearDraft`, `checkDuplicate`, `_parseSpeechToNumber`, `submitForm` — gate auth/validation/POST/repli offline), `offline` (`getQueue`/`queuePlein`/`syncQueue`), `geo` (`renderNearby`, `pickStation`), `carte` (`tileXY`, rendu OSM), `pwa` (bannière, `dismiss`, smoke `initPWA`). Exécutés automatiquement par le job `test` de la CI. **154 → 235 tests, tous au vert (22 fichiers).**
- **Couverture de code dans la CI (W72)** — `@vitest/coverage-v8@4.1.7` + script `test:coverage` ; bloc `test.coverage` dans `vite.config.js` (provider `v8` ; rapports `text`/`text-summary`/`html`/`lcov` ; `include: js/**` ; `main.js`/`config.js` exclus ; **aucun seuil**). Nouveau job CI **`coverage`** non-bloquant (`continue-on-error: true`) qui publie le résumé dans `$GITHUB_STEP_SUMMARY`. `coverage/` ajouté au `.gitignore`.

### Changed
- **Exports test-only minimes (zéro changement de comportement)** — `js/formulaire.js` expose `_parseSpeechToNumber` (parsing vocal FR, fonction pure) et `js/carte.js` expose `tileXY` (math de tuiles Web-Mercator), dans la lignée des `_`-exports existants.
- **`APP_VERSION` 5.5.0.0 → 5.5.1.0** (`js/config.js`, incrément PATCH = amélioration technique) ; `package.json` aligné ; README mis à jour (section CI : 4 → 5 jobs, « 93 cas » → 235 cas).

## [5.5.0.0] — 2026-06-05

### Added
- **Champ « Coût du plein » éditable + calcul tri-directionnel (W71)** — le montant total du plein est désormais un **champ de saisie** (`#fCout`) placé sous Litres/Prix dans le formulaire. Logique tri-directionnelle : **Coût = Litres × Prix** (si les deux sont connus) ; **Litres = Coût ÷ Prix** (si Prix connu) ; **Prix = Coût ÷ Litres** (si Prix inconnu mais Litres + Coût saisis). Le champ manquant est calculé automatiquement dès la saisie de l'un des trois champs. Nouveau module `calcTriplet(L, C, P, source)` (fonction pure, testable sans DOM) + DOM wrapper `computeTriplet(source)` en remplacement de l'ancienne boîte read-only. `js/ui.js`, `index.html`, `js/main.js`, `js/formulaire.js`, `js/secteur.js`.
- **Persistance du coût dans Google Sheets (W71)** — le montant exact est transmis dans le payload GAS (`cout`) et stocké en **colonne T « Coût € »** de l'onglet `_ImportGS`. `HEADERS` et `appendRow` mis à jour, `ensureSyncColumns_` étendue pour ajouter col T sur les feuilles existantes. `Code.gs`.
- **Tests `calcTriplet` (W71)** — `tests/cout.test.js` : 13 cas (source litres/cout/prix, déductions croisées, cas limites valeurs zéro/négatives, précision décimales). 154/154 tests passent.

## [5.4.0.0] — 2026-06-05

### Added
- **Sélection de station depuis le popup de carte (W67)** — un bouton « Sélectionner cette station » apparaît dans la popup Google Maps des stations de recherche ; un clic coche la station dans la liste et ferme la carte sans effacer la saisie en cours. `js/itineraire.js` (`showStationPopup`), `js/formulaire.js`, `css/style.css`.
- **Repli de nom de station par adresse (`resolveEnseigne`)** — quand l'enseigne OSM est inconnue, le nom de la station est construit depuis l'adresse (numéro + rue ou ville) plutôt que laissé vide. Appliqué au module principal `js/prix.js` et à la recherche manuelle `js/recherche.js`.

## [5.3.0.0] — 2026-06-05

### Added
- **Logos d'enseignes sur les marqueurs des cartes (W66)** — sur les **deux** cartes Google Maps (recherche/géoloc `carte.js` **et** onglet « Carte » des stations habituelles `stationsmap.js`, via le rendu partagé `gmaprender.js`), chaque marqueur affiche désormais le **logo de l'enseigne** (badge blanc bordé de la couleur de marque) au-dessus de la **pastille de prix conservée**, en remplacement de l'ancien bandeau texte coloré (W63). Le logo vient de `brand.js` (`brandIconUrl(slug)` → `public/icons/brands/<slug>.svg`) ; `generic.svg` (pompe) sert de **repli pour une enseigne inconnue**. L'état **sélectionné** (halo) est conservé. `js/gmaprender.js` (`_markerEl`, import `brandIconUrl`), `css/style.css` (`.gmap-pin`, `.gmap-marker.has-logo`). *(Marqueurs classiques de repli : pastille prix colorée inchangée — un SVG externe n'est pas embarquable dans une icône data-URL.)*

### Fixed
- **Excel — un plein importé depuis Google Sheets n'apparaissait pas dans « Suivi Carburant »** — l'onglet « Suivi Carburant » (`Tableau2`) est une **vue dérivée** de `GS_Pleins` (colonnes brutes tirées par formules `INDEX`, nombre de lignes réaligné par VBA). `SyncTableau2DepuisGS` (`modFeatures.bas`) était bien appelée lors d'une **saisie manuelle** (UserForm, `modSaisie`) mais **jamais après une synchro Google Sheets** : `SyncCore` (`modSyncGS.bas`) importait le plein dans `GS_Pleins` sans réaligner `Tableau2`. Résultat : le plein du **02/06/2026** figurait dans `GS_Pleins` (12 lignes) mais pas dans « Suivi Carburant » (resté à 11). **Correctif** : `SyncCore` enchaîne désormais `modFeatures.SyncTableau2DepuisGS` dès qu'une ligne est **ajoutée ou supprimée** côté GS → la vue dérivée est réalignée et tire ses colonnes par `INDEX`. *(Réparation immédiate du classeur ouvert effectuée en parallèle : Tableau2 repassé à 12 lignes, dernier plein = 02/06/2026.)*

## [5.2.1.2] — 2026-06-04

### Fixed
- **Excel — erreur 1004 « fonctionnalités du tableau indisponibles, feuille protégée » à l'import** — la feuille **« Suivi Carburant »** est protégée (`UserInterfaceOnly:=True`), ce qui **n'autorise pas** les opérations structurelles de tableau (`ListRows.Add/Delete`) → l'import (`ImporterNouveauxPleins`, déclenché à l'ouverture +3 s ou par le bouton « Importer pleins ») échouait. Ajout de helpers **`DeverrouillerSuivi` / `VerrouillerSuivi`** (`ModuleImportGS.bas`) : la feuille est **déverrouillée avant** les opérations de tableau puis **reverrouillée après** (sortie normale **et** chemin d'erreur). Même garde-fou appliqué à **`SyncTableau2DepuisGS`** (`modFeatures.bas`, rebuild de la vue Tableau2). 
- **Excel — purge automatique de Z1 sur erreur 1004** — sur erreur **1004**, le handler de `ImporterNouveauxPleins` **vide `'Suivi Carburant'!Z1`** (marqueur du dernier import) afin de **forcer un import complet** au lancement suivant, avec un message explicite. *(Le reverrouillage reste garanti dans tous les cas.)*

### Fixed
- **Système de prévisualisation (preview_*) réparé** — le harness lançait `npm run dev` dans `…/Github/suivi-e85` (chemin dérivé du **surnom** du projet) au lieu du dossier réel `…/Github/suivi-conso-carburant` → `npm ENOENT` (package.json introuvable), le serveur mourait aussitôt (« No running servers »). Le harness ignore le champ `cwd` de `.claude/launch.json`. **Correctif** : une **jonction de dossier** locale `suivi-e85 → suivi-conso-carburant` (sans droits admin) fait pointer le mauvais chemin vers le vrai projet. Durcissement `vite.config.js` : bloc `server` (`port = PORT || 5173`, `strictPort`, `host`) pour éviter le glissement silencieux de port. `preview_start → resize → screenshot` validés. *(La jonction est locale à la machine, non versionnée.)*

### Changed
- **Bandeau du haut épuré (menu ⋯)** — le header était surchargé (⛽ + titre + version + 📲 + badge hors-ligne + 🏠 + 🌙 + compte + badge E85), au point que le bouton « Se connecter » poussait le badge E85 hors écran et que le **titre d'onglet débordait sur 3 lignes**. Refonte (option 1 retenue) : le titre d'onglet (ellipse propre, plus de retour à la ligne) + le badge **🌿 E85** + le **compte** restent visibles ; les actions secondaires **🏠 Accueil / 🌙 Thème / 📲 Installer** sont regroupées dans un **menu déroulant ⋯** (fermeture au clic extérieur, sur un item, ou via **Échap**). Les boutons gardent leurs `id` d'origine (handlers `main.js` inchangés) ; `theme.js` met à jour l'icône + le libellé de l'item thème. `index.html`, `css/style.css` (`.hmenu*`, titre `min-width:0` + ellipse), `js/main.js`, `js/theme.js`.
- **Icônes d'enseignes : vrais logos officiels (W65)** — là où un logo est fourni (Total, Carrefour, Esso, Shell, Leclerc, Système U, Intermarché, BP, Casino, Auchan, Cora, Eni…), il remplace le monogramme initial ; **repli badge monogramme** original pour les enseignes sans logo (Colruyt, Dyneff, Élan, Avia) et `generic.svg` pour une enseigne inconnue. `avia.svg` (fichier devenu vide) réparé. Affichage harmonisé : `.brand-ico` passe en `object-fit:contain` sur fond blanc → n'importe quel ratio de logo (carré, large, vertical) tient dans le carré sans déformation. *(L'usage des logos de marques déposées relève du propriétaire du dépôt.)*

## [5.2.0.0] — 2026-06-04

### Fixed
- **Suppression d'un plein sans effet (poubelle 🗑️)** — la fusion différentielle de l'historique ré-ajoutait à **chaque** rafraîchissement les enregistrements **sans `sync_id`** (`historique.js`), créant des **doublons « fantômes »** ; et le bouton 🗑️ n'était rendu **que** pour les lignes avec `sync_id` → un doublon fantôme n'avait aucun bouton (clic sans effet). Désormais : dédup par **clé composite** (date/km/litres/station/type) quand `sync_id` manque, la poubelle est rendue sur **toutes** les lignes, et une ligne sans `sync_id` est **purgée localement** du cache (sans appel serveur). 
- **Synchro Excel bloquée depuis les comptes Google (U7)** — depuis `REQUIRE_AUTH=1`, l'export GAS exige un idToken que le VBA ne peut pas fournir → `{"error":"unauthorized"}` ; **aucun plein ne descendait plus** dans Excel. Ajout d'une **clé propriétaire privée** : `resolveOwner_` (Auth.gs) accepte un `syncSecret` (propriété de script `SYNC_SECRET`) qui résout vers le compte propriétaire — **sans** ouvrir l'accès web (l'app web ne connaît pas ce secret, contrairement à `APP_TOKEN`). Le VBA lit le secret dans le **registre local** (`GetSetting`, jamais commité) et l'ajoute à l'export/`getParametres`/`setParametres` (`modSyncGS.bas`, `modSyncParametres.bas`). Nouveaux : `genererSyncSecret()` / `regenererSyncSecret()` (Auth.gs), `PoserSyncSecret` (VBA).
- **Barre d'onglets (« footer ») à position incohérente selon l'onglet** — le `<footer>` texte « Données enregistrées… » vivait **dans le flux** et se déplaçait selon la hauteur du contenu. Il est retiré (le crédit passe en note discrète en bas de l'onglet **Réglages**, `.view-credit`) : le bas d'écran n'expose plus que la **barre d'onglets fixe** (`position:fixed`), identique sur tous les onglets.

### Added
- **Plein écran généralisé à toutes les cartes (W64)** — le mécanisme ⛶ (W63, cartes géo) est étendu à **toutes les `.card`** de contenu (stats, graphiques, rapport, bilan, historique, comparatif…). Un bouton ⛶ est **injecté automatiquement** (dans la barre d'actions si elle existe, sinon en coin haut-droit) et **réinjecté** après chaque re-rendu via un `MutationObserver` (synchrone → sans clignotement). Plein écran CSS (`position:fixed`, défilement interne), sortie **✕**/**Échap** restaurant l'onglet courant. `js/mapfullscreen.js`, styles `.card-fs-btn` / `.card.map-fs`.
- **Icônes d'enseignes (W65)** — bibliothèque de **pictos originaux** (badge couleur de l'enseigne + monogramme, **pas de logos déposés**) dans `public/icons/brands/*.svg` (Total, Leclerc, Carrefour, Intermarché, Système U, Auchan, Esso, Avia, BP, Shell, Eni, Dyneff, Cora, Casino, Élan, Colruyt) + `generic.svg` (enseigne inconnue). `brand.js` expose `brandInfo()`/`brandIconUrl()` ; l'icône s'affiche dans l'**historique**. Les **enseignes inconnues** sont **journalisées** (console + `localStorage` `brand_unknown_v1`, `getUnknownBrands()`) pour ajouter facilement leur icône ensuite (voir `public/icons/brands/README.md`).

## [5.1.2.0] — 2026-06-04

### Added
- **Plein écran des cartes (W63)** — un bouton **⛶** est ajouté sur **chaque carte** (recherche/géoloc dans l'en-tête, onglet « Carte » en superposition). Il bascule la carte en **plein écran** ; en sortir (bouton **✕** ou touche **Échap**) restaure exactement l'**onglet/vue où l'utilisateur se trouvait** (aucun changement de navigation). Implémentation **CSS** (la carte passe en `position:fixed` plein viewport) plutôt que l'API Fullscreen — non supportée pour un élément sur **iOS Safari / PWA** ; fonctionne donc partout. Google Maps se redimensionne automatiquement. Nouveau `js/mapfullscreen.js` (délégation + sortie Échap), styles `.map-fs`/`.map-fs-btn`, conteneur `#staticMapFsWrap` pour l'onglet Carte.

## [5.1.1.0] — 2026-06-04

### Added
- **Marqueurs distingués par enseigne (W63)** — sur les **deux cartes** Google Maps (recherche **et** onglet « Carte »), chaque marqueur affiche désormais un **bandeau enseigne** (nom court + couleur d'identité : Total, Leclerc, Carrefour, Intermarché, Système U, Esso, BP, Shell, Avia…) **au-dessus de la pastille de prix** (le prix du carburant sélectionné reste affiché). Détection par nom via le nouveau `js/brand.js` (`detectBrand`). Repli couleur par défaut pour une enseigne inconnue. *(Distinction par nom + couleur, sans logo déposé.)*

### Fixed
- **`TypeError: Map is not a constructor` en console (W63)** — avec `loading=async`, les classes Google ne sont disponibles qu'après `google.maps.importLibrary()`. Le rendu chargeait la lib `marker` mais utilisait `new maps.Map()` sans charger la lib `maps` → erreur, puis repli OSM. Correction : `gmaprender.js` récupère désormais `Map` / `core` / `marker` via **`importLibrary`** (méthode officielle), avec repli sur l'accès direct au namespace. Plus d'erreur, plus de repli intempestif.
- **Avertissement `apple-mobile-web-app-capable` déprécié** — ajout de `<meta name="mobile-web-app-capable" content="yes">` (`index.html`).

### Changed
- **Onglet « Carte » : réutilisation de l'instance Google Maps (perf)** — `renderStationsCard` (`stationsmap.js`) construit un **squelette persistant** (`.smap-top` / `#staticStationMap` / `.smap-bottom`) : le conteneur de carte n'est plus reconstruit à chaque changement de carburant/tri/épingle → l'instance Google Maps est **réutilisée** (les marqueurs sont juste rafraîchis) au lieu d'être recréée, ce qui évite des chargements de carte superflus.

## [5.1.0.5] — 2026-06-04

### Fixed
- **Géocodage d'adresse (BAN) bloqué par la CSP (W63)** — la recherche par adresse échouait silencieusement (« Adresse ou commune introuvable », repli sur la commune) car `connect-src` n'autorisait pas **`https://api-adresse.data.gouv.fr`** (oubli lors de l'ajout de la fonctionnalité v5.1.0.0). Domaine ajouté à la CSP (`index.html` **et** `_headers`) → l'adresse précise est de nouveau géocodée.

### Added
- **Carte de l'onglet « Carte » en Google Maps (W63)** — la carte des **stations habituelles** (`js/stationsmap.js`, `#staticStationMap`) devient elle aussi **Google Maps interactif** (zoom, glisser, clusters, pastilles de prix moyens, clic → popup itinéraire S11) quand la clé est configurée, avec repli sur le rendu OpenStreetMap maison sinon.

### Changed
- **Refactor — module de rendu partagé `js/gmaprender.js`** : le rendu Google Maps de stations (création carte, marqueurs Advanced/classiques, clusters, marqueur de référence, cadrage, repli `gm_authFailure`) est factorisé et réutilisé par **les deux cartes** (`carte.js` recherche/géoloc **et** `stationsmap.js` onglet Carte) → une seule implémentation à maintenir.

## [5.1.0.4] — 2026-06-04

### Changed
- **Marqueurs Google « Advanced » (W63)** — migration de `google.maps.Marker` (**déprécié** depuis février 2024) vers **`AdvancedMarkerElement`** pour supprimer l'avertissement de dépréciation en console. Les marqueurs (pastilles de prix), le point de recherche et les **bulles de clusters** sont désormais du **HTML/CSS** (`.gmap-badge`, `.gmap-userdot`, `.gmap-cluster`) au lieu d'icônes SVG. `js/gmap.js` charge la librairie `marker` ; `js/carte.js` gère l'attache Advanced (`.map`) vs classique (`setMap`) et un renderer de cluster `AdvancedMarkerElement`.
- **Repli double** : si `GOOGLE_MAPS_MAP_ID` n'est pas renseigné, on retombe sur `google.maps.Marker` classique (le warning réapparaît mais tout fonctionne) ; si aucune clé Google → rendu OpenStreetMap maison. Aucune régression.

### Note
- ⚠️ **Pour supprimer le warning, un Map ID est requis** : Google Cloud Console → Google Maps → « Gestion des cartes » → créer un **ID de carte** (type JavaScript) → le coller dans `GOOGLE_MAPS_MAP_ID` (`js/config.js`). `AdvancedMarkerElement` exige une carte initialisée avec un `mapId`.

## [5.1.0.3] — 2026-06-04

### Fixed
- **Repli OSM si Google refuse l'authentification (W63)** — quand Google rejette l'auth (clé invalide, referrer non autorisé, ou **facturation non activée** → `BillingNotEnabledMapError`), l'erreur est émise **de façon asynchrone** par Google et n'était donc pas rattrapée par le `try/catch` de `_renderGoogleMap` → l'utilisateur voyait une carte cassée au lieu du repli. Ajout du hook `window.gm_authFailure` (`js/carte.js`) : bascule immédiate sur le **rendu OpenStreetMap maison** + mémorisation de l'échec pour la session (plus de nouvelle tentative Google). Garantit qu'une carte fonctionnelle s'affiche toujours.

### Note
- ⚠️ **Pour afficher la carte Google Maps, la facturation doit être activée** sur le projet Google Cloud (Maps JavaScript API l'exige, même pour le quota gratuit). Sans cela → `BillingNotEnabledMapError` et repli automatique sur OpenStreetMap. Activer dans Google Cloud Console → Facturation → associer un compte de facturation au projet.

## [5.1.0.2] — 2026-06-04

### Fixed
- **CSP bloquait Google Maps (W63)** — la **Content-Security-Policy** (`<meta>` d'`index.html`, appliquée sur GitHub Pages, + `_headers`) n'autorisait pas les domaines Google : le script `maps.googleapis.com/maps/api/js` était **bloqué** (`script-src`) et la carte retombait sur le repli OpenStreetMap. Ajout des domaines Google selon la liste officielle Maps JS : `script-src`/`connect-src` → `https://maps.googleapis.com https://maps.gstatic.com` ; `img-src` → `https://*.googleapis.com https://*.gstatic.com` ; `style-src` → `https://fonts.googleapis.com` ; `font-src` → `https://fonts.gstatic.com` (sans `'unsafe-eval'`). La librairie de clustering passe d'**unpkg** (hors `script-src`) à **jsDelivr** (déjà autorisé) — `js/gmap.js`.

## [5.1.0.1] — 2026-06-04

### Changed
- **Activation de la carte Google Maps (W63)** — `GOOGLE_MAPS_API_KEY` renseignée dans `js/config.js` (clé « Maps JavaScript API » restreinte par referrer aux origines `fdaubercy.github.io` + localhost). La carte des résultats de recherche/géoloc passe donc au **rendu Google Maps interactif** (zoom, glisser, clusters) sur le site déployé ; le repli OpenStreetMap reste actif en cas d'indisponibilité de l'API.

## [5.1.0.0] — 2026-06-04

### Added
- **Recherche de station par adresse (W63)** — le champ « Saisie manuelle » accepte désormais **ville, code postal OU adresse complète** (n° + rue + ville). L'adresse est géocodée via la **Base Adresse Nationale** (gouv.fr, gratuit, sans clé — `BAN_API` dans `js/config.js`), puis les stations sont recherchées **dans le rayon choisi autour de ce point** (`distance(geom, POINT, rayon)`). Repli transparent sur les coordonnées de la commune (dataset prix-carburants) si la BAN est indisponible. Nouveau libellé « Ville, code postal ou adresse » et **rayons fins** `2 / 5 / 10 / 20 / 50 km · Ville seule` (défaut **5 km**, adapté à une recherche autour d'un point précis). `js/recherche.js` (`geocodeAddress`, distances calculées depuis l'adresse résolue), `index.html`, `js/state.js`, `js/main.js`.
- **Carte interactive Google Maps (W63)** — quand une clé `GOOGLE_MAPS_API_KEY` (`js/config.js`) est renseignée, la carte des résultats de recherche/géoloc devient **entièrement interactive** : **zoom** (pinch / molette / boutons +/−), **glisser-déplacer** (un doigt sur mobile, `gestureHandling:'greedy'`), et **regroupement des stations proches en clusters** qui s'ouvrent au zoom (`@googlemaps/markerclusterer`) → permet d'**identifier la bonne station quand il y en a beaucoup**. Marqueurs = pastilles de prix ; clic → sélection + popup itinéraire (S11) existante. Nouveau module `js/gmap.js` (chargeur de l'API Google Maps + clustering, mémorisé, tolérant aux pannes).

### Changed
- **`js/carte.js` — deux moteurs de rendu, même point d'entrée `showMap()`** : Google Maps si une clé est configurée, sinon **repli sur le rendu OpenStreetMap « maison »** (tuiles statiques, zoom auto) — strictement **inchangé**. Le repli s'active aussi automatiquement si l'API Google échoue à charger (réseau / clé invalide). 👉 **Zéro régression** : tant que `GOOGLE_MAPS_API_KEY` reste vide (cas par défaut committé), tous les utilisateurs gardent le comportement actuel.
- Le service worker laisse déjà passer les requêtes cross-origin (Google Maps, BAN, CDN clustering) — aucune modification nécessaire.

### Note
- **Activation de Google Maps** : créer une clé « Maps JavaScript API » dans Google Cloud Console (projet avec **facturation activée**), la **restreindre par referrer HTTP** (`https://fdaubercy.github.io/*`, `http://localhost:5173/*`, `http://localhost:4173/*`) et à l'API « Maps JavaScript API », puis la coller dans `GOOGLE_MAPS_API_KEY` (`js/config.js`). Voir le commentaire détaillé dans `config.js`.

## [5.0.0.3] — 2026-06-04

### Fixed
- **Header tassé après l'ajout du bloc identité (U7)** — l'avatar + prénom + déconnexion serraient les autres icônes (« moins clair qu'avant »). Compactage du bloc `.auth-user` (gaps et padding réduits, avatar 26→24 px, `flex:none` pour éviter l'écrasement), **prénom masqué sous 430 px de large** (l'avatar suffit sur mobile), header légèrement aéré (`gap` 10→7 px et padding horizontal réduit). Aucun changement fonctionnel.

### Note
- **Barre d'onglets « qui bouge » en bas** : comportement d'**iOS Safari (navigateur)** où une barre `position:fixed; bottom:0` suit la barre d'outils dynamique — non reproduit dans la **PWA installée** (plein écran). Le CSS de `.bottom-nav` est inchangé par v5.0.0.x.

## [5.0.0.2] — 2026-06-04

### Fixed
- **CI vert (Node 20)** — `js/notifications.js` : l'IIFE `isIOSBrowser` lisait `navigator`/`window` au **top-level** → `ReferenceError: navigator is not defined` aux tests **en CI (Node 20)** via la chaîne `prix.js → notifications.js`. Échec **présent depuis plusieurs versions** (v4.18/v4.19…), masqué en local par Node 22 (qui expose `navigator`) et par le workflow Pages distinct. Ajout d'un garde `typeof navigator/window === 'undefined'` → module importable hors navigateur. Aucun changement de comportement côté navigateur.

## [5.0.0.1] — 2026-06-04

### Added
- **Activation des comptes Google** : intégration du **Client ID OAuth réel** (`js/config.js` + `Auth.gs`) → l'authentification « Se connecter avec Google » est désormais **active**. Backend Apps Script redéployé (v53).

### Fixed
- **Confidentialité au démarrage (U7)** — les chargements de données **personnelles** (historique, stats, paramètres, file hors-ligne) sont désormais **conditionnés à la connexion** (`js/main.js`, garde `persoAllowed = !authEnabled() || isAuthed()`). Un visiteur non connecté ne déclenche plus aucun appel perso : les pleins du propriétaire ne transitent plus par son cache local. À la connexion, tout se charge via l'événement `auth-changed`.

### Changed
- **`Auth.gs`** : utilitaires `activerAuthObligatoire()` / `desactiverAuthObligatoire()` pour basculer la propriété `REQUIRE_AUTH` depuis l'éditeur Apps Script.
- **Tests** : `tests/auth.test.js` rendu robuste à la valeur réelle du Client ID (vérifie la cohérence `authEnabled()` ↔ config plutôt qu'une valeur figée).

## [5.0.0.0] — 2026-06-04

### Added
- **Comptes utilisateurs — « Se connecter avec Google » (U7)** : passage **mono → multi-utilisateur**. L'app s'ouvre à **tout public** ; chaque personne se connecte avec **son compte Google** (Google Identity Services) et ne voit **que ses propres pleins, stats, historique et réglages**. Les données de tous restent sur **le compte Google du propriétaire** (Sheet + Apps Script inchangés), **séparées par une colonne `email`**.
  - **Nouveau `js/auth.js`** — SDK GIS : reconnexion silencieuse (One-Tap, propose le compte du téléphone sur Android), session locale (`localStorage`), `getIdToken()`/`isAuthed()`/`getUser()`/`signOut()`, bloc identité du header (avatar + déconnexion), événement `auth-changed`. **Bascule souple** : tant que `GOOGLE_CLIENT_ID` (config.js) vaut le placeholder, l'auth est **inactive** et l'app fonctionne comme avant.
  - **Nouveau `Auth.gs`** (GAS) — `verifyIdToken_()` vérifie le JWT via l'endpoint Google `tokeninfo` (contrôle `aud`/`iss`/`email_verified`/`exp`, cache `CacheService`), `requireUser_()`/`resolveOwner_()` renvoient l'**email de confiance** (jamais l'email envoyé par le client). Propriété de script **`REQUIRE_AUTH`** = bascule stricte.
  - **Mur de connexion** (`js/router.js`) : les vues **Stats / Historique / Réglages** exigent la connexion ; **Accueil / Carte** restent publiques ; la **Saisie** reste consultable (prix/comparateur) mais l'**enregistrement** d'un plein exige la connexion (`js/formulaire.js`).
  - **Suppression de compte / RGPD** (`Code.gs` → `handleDeleteAccount`, bouton « 🗑️ Supprimer mon compte » dans ⚙️ Réglages) : purge définitive des pleins, paramètres et abonnements push du compte. Mention de consentement au login.
  - **Tests** : `tests/auth.test.js` (bascule souple + validité de session).

### Changed
- **`Code.gs`** — schéma `_ImportGS` étendu : **col S « Email »** (compte propriétaire de chaque plein). `doPost` (enregistrement), `handleExport`, `handleStats`, `handleDeletePlein` **filtrent/écrivent par email** ; helper `_rowBelongsTo_` (les lignes héritées sans email = propriétaire). Migration `migrerMultiUser()` (idempotente) → rattache l'existant à `fdaubercy@gmail.com`.
- **Onglet `Parametres`** — passe à **4 colonnes** (`cle · valeur · modifie_le · email`) : réglages **par utilisateur** (`js/parametres.js` joint l'`idToken`). Email ajouté en **dernière** colonne pour préserver la lecture Excel A:C.
- **`_PushSubs`** — colonne **`Email`** (I) : abonnements push rattachés au compte (`WebPush.gs`, `js/notifications.js`).
- **Véhicules** (`js/vehicules.js`) — en mode multi-utilisateur, plus de *seed* depuis l'onglet global (un nouveau compte n'hérite pas des véhicules du propriétaire) ; liste locale par appareil.
- **Requêtes perso** — `js/offline.js` (file hors-ligne : `idToken` rafraîchi au flush), `js/historique.js`, `js/statsApi.js` joignent l'`idToken`.
- **Excel / Power Query** (`powerquery/GS_Pleins.m`) — lit 19 colonnes (A→S) et **filtre `Email = propriétaire`** (sinon le classeur agrégerait les pleins de tous). À recoller dans l'Éditeur avancé.
- **`index.html`** — CSP élargie aux domaines `accounts.google.com/gsi/*` (+ avatars `googleusercontent.com`), SDK GIS, `#authSlot`, mur `#loginGate`.

### Déploiement / Activation (séquence)
1. **Créer l'OAuth Client ID** (Google Cloud Console → écran de consentement *External*/Publié + ID client *Web*, origines `https://fdaubercy.github.io` + `localhost:5173/4173`). Voir `README.md`.
2. Coller le Client ID dans **`js/config.js`** (`GOOGLE_CLIENT_ID`) **et** **`Auth.gs`** (même valeur).
3. **`npm run gas:deploy "v5.0.0.0 multi-user"`** puis exécuter **`migrerMultiUser()`** une fois (rattache l'existant au propriétaire).
4. Recoller **`powerquery/GS_Pleins.m`** dans Excel (Éditeur avancé) → Actualiser.
5. Tester (2 comptes Google → isolation), puis poser la propriété de script **`REQUIRE_AUTH = 1`** pour rendre l'idToken obligatoire.
   > Tant que ces étapes ne sont pas faites, l'app reste en **mode propriétaire** (rétrocompatible, aucune régression).

## [4.19.0.0] — 2026-06-04

### Added
- **Prix historique à la saisie étendu à SP95 / E10 / GPLc (W62)** — complète W60/W61 : à la saisie d'un **plein à une date passée**, le champ **Prix** se remplit désormais depuis `_PrixHistory` pour les **6 carburants** (avant : E85/Gazole/SP98 seulement ; SP95/E10/GPLc affichaient « non relevé — prix du jour conservé »). La cascade de résolution (prix station ce jour-là → relevé le plus proche avant → repli mini secteur) et la note de provenance `#histNote` s'appliquent aux 3 nouveaux carburants.
  - **GAS** (`Code.gs` → `handleSectorPrices`) : `TOKENS` étendu (SP95/E10/GPLc) ; lecture de `SECTOR_BEST_TODAY` rendue **insensible à la casse** (clé `GPLc` ↔ paramètre `GPLC` issu du `toUpperCase`). ⚠️ **Redéploiement de la Web App requis** (dégradation propre entre-temps : repli « prix du jour »).
  - **App** (`js/secteur.js`) : `HIST_FUELS` passe aux **6 carburants** (clés `FUEL_CONFIG`) ; préchargement cache localStorage aligné sur cette liste. Repli inchangé si un carburant n'a aucun relevé avant la date → saisie manuelle.
  - **Tests** : `tests/prix-historique.test.js` — le cas SP95 vérifie désormais la **résolution effective** (au lieu de la note « non suivi »).

## [4.18.0.0] — 2026-06-04

### Added
- **Relevé marché de 3 carburants supplémentaires — SP95, E10, GPLc (W61)** : le relevé quotidien ~7h (`RefreshPrix.gs` → `refreshPrixCarburants`) suit désormais **6 carburants** (E85, Gazole, SP98 **+ SP95, E10, GPLc**) au lieu de 3. Ajout de 3 entrées à la constante `FUELS` (champs API ODS `sp95_prix` / `e10_prix` / `gplc_prix`, vérifiés sur le dataset). Les 3 nouveaux carburants sont **loggés dans l'onglet `_PrixHistory`** (colonne `Type`) pour les stations curées **et** le scan géo 15 km, et **mémorisés** par carburant dans `SECTOR_BEST_TODAY` / `LAST_LOW_PRICES`.
  - **Synchronisation Excel** : la requête Power Query `powerquery/PrixHistory.m` recopiant les 4 colonnes telles quelles, **aucune modification fonctionnelle n'était requise** — un simple *Données → Actualiser tout* fait apparaître les nouveaux carburants. La feuille **« Prix par Station »** (`vba/modPrixStation.bas` → `MAJ_PrixParStation`) crée dynamiquement une colonne par carburant détecté.

### Fixed
- **VBA — E10 fusionné dans SP95 (`vba/modPrixStation.bas` → `FuelKeyP`)** : le test `InStr(s,"sp95") Or InStr(s,"e10")` rangeait à tort les relevés **E10 dans la colonne SP95** de la feuille « Prix par Station ». E10 est désormais **testé avant** SP95 et **distinct**. Le GPL y est normalisé en **« GPLc »** (cohérent avec `_PrixHistory`).

### Changed
- **VBA — libellé carburant harmonisé** : `vba/modGraphiques.bas` (`FuelKey` + `prefOrder`) et `vba/modPrixStation.bas` (`FuelOrder`) affichent désormais **« GPLc »** au lieu de « GPL », cohérent avec la colonne `Type` de `_PrixHistory`.
- **Push inchangé (par conception)** : les 3 nouveaux carburants **ne déclenchent aucune notification** — `_PushSubs` n'expose que `SeuilE85/Gazole/SP98`, donc `WebPush.gs` (`envoyerPushPrixBasMulti`) les ignore (seuil absent ⇒ jamais sous le seuil).
- **App (`js/secteur.js`)** : commentaire `HIST_FUELS` clarifié — SP95/E10/GPLc sont relevés dans `_PrixHistory` mais **non encore résolus à la saisie** d'un plein passé (les `TOKENS` de `handleSectorPrices` restent E85/Gazole/SP98). Documenté comme évolution (ROADMAP).

### Déploiement
- **GAS** : recoller `RefreshPrix.gs` (ou `npm run gas:deploy`), puis exécuter **`testRefreshPrix()`** — vérifier dans les logs `… SP95=x.xxx  E10=x.xxx  GPLc=x.xxx` et les nouvelles lignes dans `_PrixHistory`. Le trigger quotidien reste valide.
- **Excel** : *Données → Actualiser tout* (Power Query) ; réimporter `vba/modPrixStation.bas` (+ `vba/modGraphiques.bas`) puis relancer `MAJ_PrixParStation`. Voir `Google Apps Script/GAS_UPDATE.md` (§ W61).

## [4.17.0.1] — 2026-06-03

### Added
- **Déploiement GAS automatisé (`gas-deploy.mjs`, `npm run gas:deploy`)** — pousse les `.gs`/`.html` locaux, crée une version et **met à jour le déploiement Web App existant (URL `/exec` inchangée)** via l'API REST `script.googleapis.com`, sans éditeur web ni copier-coller. Auth OAuth 2.0 (refresh_token) lue dans `.claude/gas-config.json` (gitignoré). **Fusion sans suppression** : GET du projet en ligne → écrase/ajoute uniquement les fichiers présents en local → **conserve** les fichiers en ligne absents du repo (manifeste `appsscript`, etc.). Modes `--check` (auth + accès), `--diff` (compare local ↔ en ligne), `--pull` (liste), `--no-deploy` (HEAD sans redéploiement), normalisation CRLF→LF. Procédure de génération des identifiants OAuth documentée (INSTALL.md + `oauth._howto`). Vérifié de bout en bout (version v50 déployée, endpoint `?action=sectorPrices` → `byStationDate` 27 stations).

## [4.17.0.0] — 2026-06-03

### Added
- **Prix historique à la saisie d'un plein passé (W60)** — quand une **date ≠ aujourd'hui** est choisie dans la Saisie, le champ **Prix** se remplit automatiquement depuis `_PrixHistory` (au lieu du prix live du jour, faux pour une date passée). Résolution en cascade : **(1)** prix de la **station sélectionnée** ce jour-là (relevé exact) → **(2)** sinon le **relevé le plus proche AVANT** la date → **(3)** sinon repli sur le **mini secteur** du jour (`byDate`). Carburant non suivi dans l'historique (SP95/E10/GPLc) → note info + prix du jour conservé ; retour à aujourd'hui → prix live restauré. Une **note** sous le champ indique la provenance (« 📅 Prix E85 le 20/05/2026 · Leclerc Douai » ou « relevé du 18/05 · moins cher du secteur »). Le prix se ré-applique aussi au changement de station/carburant tant qu'une date passée est active.
  - **Front** (`js/secteur.js`) : `resolveHistPrice()` (logique pure, *nearest-prior*) + `applyHistPriceToForm()` ; câblé sur `#fDate` (`js/main.js`), après chaque résolution de prix live (`js/prix.js`) et au changement de carburant (`js/carburant.js`). Note `#histNote` (`index.html` + classe `.hist-note` dans `css/style.css`).
  - **GAS** (`Code.gs` → `handleSectorPrices`) : l'endpoint `?action=sectorPrices` renvoie désormais aussi **`byStationDate`** `{ station : { date : prix } }` (rétrocompatible). ⚠️ **Redéploiement de la Web App requis** pour activer le prix station-spécifique ; **dégradation propre** entre-temps (repli sur le mini secteur, donnée déjà disponible).
  - **Tests** : `tests/prix-historique.test.js` (8 tests vitest — résolution + effets sur le formulaire) + `tests/prix-historique.spec.js` (E2E Playwright + capture d'écran).

## [4.16.0.0] — 2026-06-03

### Added
- **GAS — e-mail « Wrapped » annuel** (`Google Apps Script/WrappedAnnuel.gs`) : bilan de fin d'année envoyé par mail, pendant annuel du rapport mensuel et de la carte Wrapped de l'app (W37). Design « modèle » cohérent : **hero festif** (« 🎉 Votre année AAAA en E85 » + économie cumulée + CO₂ évité), **grille 8 KPI** (pleins · litres · dépensé · prix moyen E85 · km parcourus · moyenne L/100 km · CO₂ évité · surconso E85), bandeaux **⭐ station préférée** + **📅 mois le plus cher**. Calculs alignés sur `js/wrapped.js` (économie E85 cumulée vs SP98, surconso partagée Excel J7, CO₂ à distance égale, km = somme des deltas max−min par véhicule).
  - **Trigger** : 1er du mois 8h, mais le handler **n'envoie qu'en janvier** (bilan de l'année écoulée) — GAS n'a pas de déclencheur annuel natif. Fonctions : `installerTriggerWrappedAnnuel()` (une fois), `testWrappedAnnuel()` (envoi immédiat de l'année la plus récente), `supprimerTriggerWrappedAnnuel()`. Réutilise `lireSurconsoParam` / `computeSurconsoDynamique` (RapportMensuel.gs) et `CO2_*_PER_L_GS` (Code.gs).

## [4.15.1.0] — 2026-06-03

### Added
- **GAS — rapport mensuel enrichi (3 indicateurs)** (`RapportMensuel.gs`) : ajoutés au calcul (`calculerStatsRapport`) **et** au mail (`construireCorpsRapport`) :
  - **🌱 CO₂ évité du mois** — carte verte ; méthode de l'app (W40) : `litresE85 / (1 + surconso) × 2,21 − litresE85 × 1,105` (constantes `CO2_ESSENCE_PER_L_GS` / `CO2_E85_PER_L_GS` de Code.gs) ;
  - **🌿 Prix moyen E85 du mois** — carte ; pondéré (coût E85 / litres E85), 3 décimales ;
  - **⭐ Station préférée** — bandeau (la plus fréquente du mois + nb de pleins), masqué s'il n'y en a pas.
  Le pied rappelle la méthode CO₂ quand il y a des pleins E85.

## [4.15.0.0] — 2026-06-03

### Added
- **GAS — rapport mensuel : nouveau design « modèle »** (`RapportMensuel.gs` → `construireCorpsRapport`) : en-tête bandeau bleu marine + logo ⛽ vert + mois, **hero vert** mettant en avant l'**économie E85**, **cartes KPI** (pleins · dépensé · litres · distance) avec icônes, bandeau **consommation moyenne**, pied de page soigné. Mise en page 100 % compatible clients mail (tableaux, styles inline, couleurs solides). Maquette validée visuellement avant implémentation.
- **Excel — bouton « Quitter le plein écran »** (`vba/Affichage.bas` + `vba/modWorkbook.bas`) : icône cliquable (haut-droite, `OnAction = DesactiverPleinEcran`) posée sur les onglets du dashboard (Accueil / Reglages / Historique / Carte / Tableau de bord) — indispensable car le ruban est masqué en mode kiosque. `AjouterBoutonPleinEcran(ws)` (une feuille) + `PoserBoutonsPleinEcran` (tous les onglets), posés automatiquement par `CreerAccueil` et `InstallerDashboard`. Le raccourci **Ctrl+F11** reste disponible en complément.

### Changed
- **GAS — surconsommation E85 affichée avec 1 décimale** dans le pied du rapport (ex. **+20,4 %** au lieu de +20 %).

## [4.14.0.7] — 2026-06-03

### Fixed
- **Excel — `_PrixHistory` figé / dates manquantes** (`vba/modSyncGS.bas`) : la Power Query `PrixHistory` (prix marché quotidien) n'était **jamais rafraîchie par le VBA** (contrairement à `GS_Pleins`), donc l'onglet local restait bloqué à la dernière actualisation manuelle (ex. **01/06** alors que le Google Sheet allait au **03/06**). Nouvelle macro **`RafraichirPrixHistory`** — refresh **synchrone** (`BackgroundQuery = False` → aucune donnée loupée), voie principale `QueryTable` de la table `PrixHistory` + repli connexion Power Query — appelée automatiquement à chaque `SyncCore` (donc à l'ouverture via `SyncOnOpen` et à chaque `SyncManuel`) ; lançable seule (Alt+F8).

## [4.14.0.6] — 2026-06-03

### Added
- **VBA — `PousserParametresExcel`** (`vba/modSyncParametres.bas`) : push **forcé** vers l'onglet `Parametres` du Google Sheet des cellules métier mappées (`kit_prix` B5, `budget_mensuel` B2, `objectif_co2` B3, **`surconso` J7**) avec horodatage = maintenant. Contourne la *baseline* `ts=0` qui empêchait ces valeurs (dont J7) de remonter dans le Sheet → le rapport mensuel GAS (et l'app) peuvent enfin lire la surconsommation du classeur au lieu du repli 20 %. À lancer **une fois** (Alt+F8) après avoir renseigné J7.

## [4.14.0.5] — 2026-06-03

### Fixed
- **GAS — rapport mensuel : surconso = valeur Excel J7 (et non 20 % par défaut)** (`RapportMensuel.gs`) : sans pleins SP98 dans l'historique (cas « 100 % E85 »), le calcul dynamique retombait sur le repli 20 %. Le rapport lit désormais **en priorité la surconso partagée** — onglet `Parametres`, clé `surconso` = cellule Excel `Suivi Carburant!J7`, synchronisée app/Excel — via `lireSurconsoParam` (réutilise `readParamsMap_`/`getOrCreateParamsSheet_` de Code.gs), puis le calcul dynamique, puis 20 % en dernier recours. Tolère une valeur saisie en % (22 → 0,22). Le pied de l'e-mail indique « valeur partagée Excel J7 / app ».
- **Excel — onglet Historique vide + feuille orpheline non renommée** (`vba/modHistorique.bas`) : (1) si `GS_Pleins` est introuvable ou vide, `RafraichirHistorique` écrit désormais la cause **directement sur la feuille** (le message en barre d'état est invisible en plein écran) avec l'action à mener (« lancez `SyncManuel` ») ; (2) `GetOrCreateSheet` **supprime la feuille orpheline** créée par `Sheets.Add` si le renommage échoue (plus de « Feuil# » vide) et réutilise la feuille existante.

## [4.14.0.4] — 2026-06-03

### Changed
- **GAS — rapport mensuel : surconsommation E85 dynamique** (`RapportMensuel.gs`) : l'économie E85 vs SP98 utilisait une surconso **fixe 20 %** ; elle est désormais **mesurée sur l'historique** (conso moyenne E85 / conso moyenne SP98 − 1, sur les pleins consécutifs d'un **même véhicule**), **même méthode que l'app web et le dashboard Excel**, avec repli 20 % si pas assez de données (`computeSurconsoDynamique`). Le pied de l'e-mail affiche le % réellement appliqué. Fonction déclenchée par trigger → **un simple enregistrement dans l'éditeur Apps Script suffit** (pas de redéploiement Web App).

### Fixed
- **Excel — tuile « Historique » de l'Accueil sans effet** (`vba/modWorkbook.bas`) : quand la feuille cible n'existait pas (création échouée lors du conflit modCarte/modHistorique), `GoSheet` postait un avertissement en **barre d'état — invisible en mode plein écran** (module `Affichage`) → bouton apparemment « mort ». `GoSheet` **construit maintenant la feuille manquante** via son créateur (`BuilderFor` → `CreerFeuilleReglages`/`CreerFeuilleHistorique`/`CreerFeuilleCarte`/`CreerGraphiquesWeb`/`CreerAccueil`) avant de l'activer — navigation **auto-réparante** pour toutes les tuiles de l'Accueil.

## [4.14.0.3] — 2026-06-03

### Added
- **VBA — outil de diagnostic `ListerProceduresDupliquees`** (`vba/modOutils.bas`) : parcourt tout le projet VBA et liste, dans Exécution (Ctrl+G) + barre d'état, les procédures **publiques** (Sub/Function/Property) définies dans **plusieurs modules** — cause de l'erreur de compilation « Nom ambigu détecté » (typiquement un module clone `modXxx1` créé par un réimport par-dessus un module déjà présent). Ignore les procédures Private/Friend (jamais ambiguës entre modules). Prérequis : « Accès approuvé au modèle objet du projet VBA ».

## [4.14.0.2] — 2026-06-03

### Added
- **VBA — module `Affichage.bas` enfin versionné** (`vba/Affichage.bas`) : mode plein écran « kiosk » (`ActiverPleinEcran` / `DesactiverPleinEcran` / `BasculerPleinEcran`), appelé par `ThisWorkbook` (`Workbook_Open`/`Workbook_BeforeClose`) et le raccourci **Ctrl+F11**. Ce module **n'avait jamais été commité** (il ne vivait que dans le `.xlsm`, d'où sa disparition lors d'un « supprimer/réimporter ») ; **récupéré à l'identique** du snapshot v4.7.0.0 du classeur via `olevba` et ajouté au dépôt pour qu'il ne soit plus jamais perdu.

## [4.14.0.1] — 2026-06-03

### Fixed
- **VBA — `InstallerDashboard` appelait le module legacy `modDashboard.CreerTableauDeBord`** (retiré en v4.11, qui recréait une feuille « Tableau de bord » **en conflit** avec le dashboard moderne `modGraphiques`, et imposait une **dépendance de compilation** sur un module potentiellement absent). Corrigé : la feuille Stats est montée via **`modGraphiques.CreerGraphiquesWeb`** (propriétaire moderne de « Tableau de bord »), en appel **tolérant** `Application.Run "CreerGraphiquesWeb", True` (pas de dépendance de compilation, `silent:=True`). L'étape « Graphiques web » redondante de la macro maître `Installer` est supprimée (désormais incluse dans `InstallerDashboard`) → `Installer` = Dashboard+Stats → Analyse → Vérification.

## [4.14.0.0] — 2026-06-03

### Added
- **VBA — macro maître « GO ! » `Installer`** (`vba/modWorkbook.bas`) : installation complète en **un clic** (Alt+F8 → `Installer`), à lancer après import des `.bas` + collage des snippets. Enchaîne, **de façon tolérante** (une étape en échec n'interrompt pas les suivantes), `InstallerDashboard` (qui monte aussi la feuille Stats) → `RafraichirFeatures` (modFeatures) → `VerifierInstallation` ; bilan détaillé dans Exécution (Ctrl+G) + résumé en barre d'état. Helper `RunStep` (exécution par nom via `Application.Run`, comptage OK/échec).
- **VBA — `InstallerDashboard` branche la feuille Stats** (`vba/modWorkbook.bas`) : la macro monte désormais aussi le **« Tableau de bord » (Stats)** via `CreerGraphiquesWeb` (modGraphiques), en plus de Reglages / Historique / Carte / Accueil. Appel **tolérant** (`Application.Run`, `silent:=True`) : un classeur sans données / sans module ne bloque pas la création des autres feuilles.

### Changed
- **Recherche de stations — refonte fiabilité + UX (web)** (`js/osm.js`, `js/geo.js`, `js/recherche.js`) :
  - **Une seule requête Overpass groupée** (union de clauses `around` par station) remplace les N requêtes en série → anti-attente, anti-429.
  - **Appariement par seuil de proximité** (≤ 200 m) : au-delà, on conserve le nom gouvernemental → **plus jamais de faux nom d'enseigne** (« être sûr de trouver le bon nom »).
  - **Affichage immédiat** des stations (noms gouv.) puis **renommage « Enseigne - Ville » au fur et à mesure** en arrière-plan (mise à jour live de chaque ligne, `updateNearbyName`) — l'utilisateur ne patiente plus pendant le nommage.
  - **Annulable** : relancer une recherche **ou choisir une station** (liste déroulante via `onStationChange`, ou liste de proximité via `pickStation`) **avorte la requête OSM en vol** (`AbortController` + jeton) et poursuit la sélection — `cancelOsmEnrich`.
- **Duplication d'un plein — prix tous-carburants fiabilisés (web)** (`js/formulaire.js`, `js/stationsmap.js`) : à la sélection d'une station (donc lors d'une **duplication du dernier plein**), les prix sont relevés **à la position réelle de la station** (coordonnées mémorisées via le nouveau `getStationCoords`) plutôt qu'autour du GPS courant. Garantit que les colonnes **I→N** (E85/SP98/SP95/E10/Gazole/GPLc) du Google Sheet / Excel sont renseignées pour la **bonne** station, même en dupliquant à distance, après la requête HTTP de prix.

### Fixed
- **Géoloc & recherche par ville alignées sur la nouvelle API OSM** (`js/geo.js`, `js/recherche.js` `searchStationsCityOnly`) : ces deux chemins référençaient encore `enrichWithOsmSerial` (retirée par la refonte) → migrés vers `enrichStationsBulk`, supprimant une référence non définie qui aurait cassé la géolocalisation.

## [4.13.2.0] — 2026-06-02

### Added
- **Carte : mise à jour automatique du tableau au changement de carburant** (`vba/modCarte.bas` + `vba/Carte_snippet.bas`) : nouvelle macro `RafraichirTableauCarte` (recalcul des prix moyens + rendu du tableau, **sans réseau**) déclenchée par un `Worksheet_Change` sur la cellule C3 (`Carte_Fuel`). Changer E85 / Gazole / SP98 met à jour le titre et les prix instantanément (le géocodage et la carte restent sur les boutons). Garde `Application.EnableEvents` anti-boucle.

## [4.13.1.1] — 2026-06-02

### Fixed
- **Carte : erreur d'import VBA « Trop de caractères de continuité de ligne »** (`vba/modCarte.bas`) : après l'ajout des liens itinéraire, la génération du HTML Leaflet concaténait ~31 lignes en **une seule instruction** (limite VBA = 25 continuations `_`). Découpée en 3 instructions (`h = … : h = h & … : GenererHtmlCarte = h`).

## [4.13.1.0] — 2026-06-02

### Added
- **Carte — marqueurs cliquables vers itinéraire** (`vba/modCarte.bas`) : le popup de chaque station propose un lien **Google Maps** (`maps/dir`) et **Waze** (`waze.com/ul`) vers la station, comme l'app PWA (ouverture dans le navigateur / l'app de navigation).

### Changed
- **Carte : la « carte interactive ouverte dans le navigateur » est retenue comme solution définitive** (zoom, marqueurs cliquables, itinéraire). L'embarquement *dans* une fenêtre Excel a été écarté après analyse : une carte dynamique exige un moteur de navigateur embarqué, or le contrôle natif d'Office (moteur Internet Explorer, abandonné) est trop fragile et incompatible Leaflet récent, et WebView2 (Chromium) impose un composant tiers à installer (hors périmètre fiable).

## [4.13.0.0] — 2026-06-02

### Added
- **Dashboard Excel « miroir de l'app » — Étape 3 : onglet Carte** (`vba/modCarte.bas`) : reproduit la vue Carte de la PWA.
  - **Tableau des stations habituelles + prix moyens** par carburant (E85/Gazole/SP98 via la cellule `Carte_Fuel`), trié par prix, ⭐ favori (≥ 4 pleins), ★ meilleur prix — fidèle à `computeStationAverages`, calculé depuis `GS_Pleins`.
  - **Carte OSM interactive** (Leaflet via CDN), ouverte dans le navigateur : tuiles OpenStreetMap, marqueurs prix (tooltip permanent + popup nom/prix), pan/zoom, cadrage automatique (`fitBounds`). **Marqueur de position** de l'utilisateur (point GPS bleu pulsant) via la cellule `Carte_Position` (`lat;lon` ou ville géocodée par la Base Adresse Nationale) ou la géolocalisation live du navigateur.
  - **Géocodage** des stations via l'API gouv. v2.1 (champ `geom = {lon,lat}`) avec **désambiguïsation des homonymes** (candidat le plus proche du barycentre des autres stations) ; cache éditable feuille masquée `_StationCoords`. Macros utilitaires `ReinitialiserCoords` et `DiagnoseCarte`.
  - Note : la vue **Stats** de l'app étant déjà reproduite par le tableau de bord existant (`modDashboardGraphiques`/`modDashboardKPI`), l'étape 2 a été absorbée. L'**embarquement** de la carte interactive *dans* Excel (option A) nécessite WebView2 (le contrôle IE ne peut pas exécuter Leaflet) — traité séparément.

## [4.12.0.0] — 2026-06-02

### Added
- **Dashboard Excel « miroir de l'app » — Étape 1/3** (`vba/modWorkbook.bas`, `vba/modHistorique.bas`, `vba/modReglages.bas`, `vba/Reglages_snippet.bas`) : trois feuilles reproduisant des onglets de la PWA dans le classeur.
  - **Accueil** (`modWorkbook`) : portail à tuiles (⛽ Saisie · 📊 Stats · 🗺️ Carte · 📜 Historique · ⚙️ Réglages) + raccourcis (Nouveau plein, Dupliquer le dernier) + tuile « reprendre » (résumé du dernier plein lu dans `GS_Pleins`). Navigation `Nav*` (formes cliquables), `AfficherVueDeDepart` (vue de départ selon Réglages) branchée dans `Workbook_Open`, et installeur groupé `InstallerEtape1`.
  - **Historique** (`modHistorique`) : vue triée (récent → ancien) de `GS_Pleins` en tableau `tblHistorique` avec **filtre auto** Véhicule/Carburant (équivalent des filtres de l'app), carte « 5 derniers pleins », colonne Coût calculée, et **export CSV** vue filtrée / tout avec séparateur `;`/`,` en UTF-8 (aligné W54).
  - **Reglages** (`modReglages`) : préférences propres au classeur (page d'ouverture, séparateur CSV, dernière vue) **+ surface des paramètres métier synchronisés** (kit/budget/CO₂/surconso) lus/écrits dans leurs **cellules canoniques** (`Suivi Carburant!B5/J7`, `Tableau de bord!B2/B3`) avec boutons « Appliquer + Synchroniser » (réutilise `SyncParametresManuel`) / « Recharger depuis l'app ». Pas de stockage en double ; seuils d'alerte laissés à l'app.

### Fixed
- **Synchro budget / objectif CO₂ app↔Excel cassée depuis le renommage d'onglet** (`vba/modSyncParametres.bas`) : la constante `WS_GRAPH` pointait encore sur `"Graphiques"`, renommé **« Tableau de bord »** en v4.11.0.0 → `budget_mensuel` (B2) et `objectif_co2` (B3) n'étaient plus ni relus ni écrits par la synchro des paramètres. Corrigé (`WS_GRAPH = "Tableau de bord"`).

## [4.11.0.3] — 2026-06-01

### Added
- **X37 — « Station préférée » dans le 2ᵉ bandeau méta** (`vba/modDashboardKPI.bas`, `vba/modDashboardGraphiques.bas`) : seule donnée non reprise lors du retrait du bloc « Bilan annuel », elle revient dans le dashboard. `ComputeDashboardStats` gagne le champ `stationTop` = station la plus fréquentée sur le périmètre **véhicule** (comptage des occurrences dans `GS_Pleins`, colonne `Station essence`). Affichée en fin de 2ᵉ bandeau : « Dépense totale · Prix moyen · Dernier plein · **Station préférée** ».

## [4.11.0.2] — 2026-06-01

### Fixed / Removed
- **X36 — Titre bleu « Bilan annuel » tronqué (« 26 ») + bloc en doublon** (`vba/modGraphiques.bas`, `vba/modDashboardGraphiques.bas`) : le bloc `BuildKPICards` (titre bleu + 5 cartes Pleins/Litres/€/Km/Station) était dessiné à une position fixe par `modGraphiques`, mais `modDashboardGraphiques.LayoutCharts` réorganise les **graphiques** dans sa grille 3 colonnes **sans** repositionner ces **formes** → un graphique se posait par-dessus, ne laissant dépasser que « 26 » du titre. Ce bloc faisait par ailleurs **doublon** avec les 2 bandeaux méta ajoutés en Phase 2. **Retiré** : appel `BuildKPICards` supprimé ; `CleanupDashShapes` purge désormais aussi les formes résiduelles `kpiTitle`/`kpiCard*`. Dashboard propre, sans chevauchement.

## [4.11.0.1] — 2026-06-01

### Fixed
- **X36 — Listes déroulantes Véhicule/Carburant (B5/B6) cassées après le renommage** (`vba/modDashboardGraphiques.bas`, `ApplyListValidation`) : la formule de validation utilisait `=" & ws.Name & "!"`, non quotée. Tant que la feuille s'appelait « Graphiques » (sans espace) ça passait ; renommée en **« Tableau de bord »** (avec espaces), la formule devenait invalide → `.Add` échouait silencieusement → **plus de menu déroulant**. Correctif : quotes simples autour du nom de feuille (`='" & ws.Name & "'!"`), valide avec ou sans espaces. Les widgets/graphiques eux sont régénérés par `CreerGraphiquesWeb` + `MAJ_Dashboard_Graphiques` (relancer après compilation OK).

## [4.11.0.0] — 2026-06-01

### Changed
- **X36/X37 — Refonte du tableau de bord Excel (Phase 2)** :
  - **Renommage des onglets** : l'onglet visuel « Graphiques » devient le **« Tableau de bord »** principal ; l'ancien « Tableau de bord » (liste de 10 KPI, `modDashboard.bas`) est renommé temporairement « Tableau de bord 2 » puis **supprimé après fusion** (voir README). Constantes VBA mises à jour : `modGraphiques.WS_GRAPH`, `modDashboardGraphiques.WS_DASH`, `modSyncGS.GraphSheetExists` (repli sur l'ancien nom tant que le renommage n'est pas fait).
  - **Découplage** (`modDashboardGraphiques.BuildHeaderAndKPIs`) : le dashboard ne lit plus aucune valeur dans un autre onglet. Toutes les valeurs (KPI + bandeau méta + CO2) sont calculées en direct depuis `GS_Pleins` via le nouveau `modDashboardKPI.ComputeDashboardStats` (méthode full-to-full, type `DashStats`).
  - **Réactivité totale au filtre véhicule/carburant (X36)** : KPI, bandeau méta, carte CO2 **et tous les graphiques temporels** se recalculent selon les sélecteurs `B5` (véhicule) / `B6` (carburant). `modGraphiques.BuildAggregates` filtre désormais la boucle `Tableau2` (véhicule + carburant) et `BuildPriceBlockMerged` se limite au carburant sélectionné. La comparaison véhicules reste globale (croisée par nature). Le module feuille (`Graphiques_snippet.bas`) gagne un `Worksheet_Change` sur `B2:B6` qui reconstruit données filtrées + mise en page.
  - **Fusion des KPI de l'ancien dashboard** : un 2ᵉ bandeau méta ajoute **Dépense totale (€)**, **Prix moyen (€/L)** du carburant filtré et **Date du dernier plein** — valeurs auparavant uniquement sur l'onglet « Tableau de bord ».

### Removed
- **Module legacy `modDashboard.bas`** (ex-`CreerTableauDeBord`/`CreerGraphiques`, v2.5.0.0) : devenu inutile (appelé par aucun flux automatique, écrivait des graphiques concurrents sur l'onglet du dashboard). À supprimer manuellement (guide README) en même temps que l'onglet « Tableau de bord 2 ».

## [4.10.0.3] — 2026-05-31

### Added
- **C6 — Renouvellement automatique du token OAuth** : section `oauth` ajoutée dans `.claude/gas-config.json` (`client_id`, `client_secret`, `refresh_token`, `token_endpoint`) ; l'artifact GAS Manager renouvelle automatiquement le token via `POST oauth2.googleapis.com/token` sur erreur 401. Guide d'obtention dans `_howto`.
- **C7 — Historique des déploiements** : section `deployHistory` ajoutée dans `.claude/gas-config.json` (date, version X.Y.Z.W, versionNumber GAS, description) ; onglet Historique dans `/gasManager`.
- **C10 — Hook PostToolUse Chrome** : second matcher `mcp__.*__navigate` ajouté dans `.claude/settings.json` ; détecte les navigations vers `script.google.com` et suggère de mettre à jour `deployHistory` si l'URL contient `deployments`.

### Changed
- **`gasManager.md`** : commande mise à jour pour le renouvellement auto du token, l'onglet Historique et le badge de statut `renouvellement…`.

## [4.10.0.2] — 2026-05-31

### Added
- **C1 — Skill `gas-api`** : nouvelle skill `.claude/skills/gas-api/SKILL.md` dédiée aux appels API REST Google Apps Script et Sheets API (distincte de `gas-sync` qui couvre l'éditeur web et clasp) ; pattern complet modifier → versionner → redéployer ; référence `gas-config.json`.
- **C2 — Commande `/gasManager`** : `.claude/commands/gasManager.md` recharge l'artifact GAS Manager avec les IDs de `.claude/gas-config.json` sans ressaisie.
- **C3 — Sécurité `.gitignore`** : ajout de `.claude/gas-config.json` pour éviter la publication des IDs GAS (scriptId, sheetId, deployId) sur GitHub.

## [4.10.0.1] — 2026-05-31

# Changelog

Toutes les modifications notables de ce projet sont documentées ici.

Format : [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/)

## [4.10.0.1] — 2026-05-31

### Changed
- **P1 — Miroir local des paramètres dans l'onglet `Notes`** (`vba/modSyncParametres.bas`) : au lieu de créer un nouvel onglet `Parametres` dans le classeur, le miroir local `cle | valeur | modifie_le` est désormais stocké dans les **colonnes libres F/G/H de l'onglet technique `Notes`** (déjà masqué, qui contient déjà `tbl_carburant` en col B et `tbl_stationEssence` en col D). En-tête en ligne 2, aligné sur les tables voisines. Aucun nouvel onglet créé ; `tbl_carburant`/`tbl_stationEssence` intacts. L'onglet `Parametres` du **Google Sheet** (source de vérité cloud) reste inchangé.

## [4.10.0.0] — 2026-05-31

### Ajouté
- **P1 — Paramètres métier partagés (Phase 1)** : les paramètres modifiables par l'utilisateur étaient jusqu'ici cloisonnés dans 3 silos non synchronisés (localStorage de l'app web, cellules du classeur Excel, rien dans le Google Sheet sauf les véhicules). Ils sont désormais centralisés dans un **onglet `Parametres` du Google Sheet** (table `cle | valeur | modifie_le`) servant de **source de vérité unique**, synchronisé entre l'app et le classeur Excel par **last-write-wins** sur horodatage epoch (ms UTC), clé par clé.
  - Périmètre **métier uniquement** : `kit_prix`, `budget_mensuel`, `objectif_co2`, `surconso`, `seuil_E85/GAZOLE/SP98` (+ `_enabled`). Les préférences d'affichage propres à l'appareil (thème, vue de départ, blocs repliés, tri carte, séparateur CSV) restent locales. Les véhicules conservent leur mécanisme existant (onglet `Vehicules`).
  - **GAS** (`Code.gs`) : nouvel onglet `Parametres` + endpoints `doGet ?action=getParametres` et `doPost action=setParametres` (upsert LWW filtré sur les clés métier autorisées). ⚠️ **Redéploiement du Web App requis**.
  - **App** (`js/parametres.js` nouveau) : mapping clés Sheet ↔ localStorage, horodatages locaux par clé (`suivi_e85_params_meta`), `pushParam()` (envoi à l'édition) et `syncParametres()` (réconciliation au démarrage). Câblé dans `stats.js` (kit/budget/objectif CO₂), `notifications.js` (seuils + activation) et `main.js` (sync au démarrage + rafraîchissement UI sur l'événement `parametres-synced`). La surconso synchronisée sert désormais de **valeur de repli** dans `getSurconsoFallback()` quand l'app n'a pas de données SP98.
  - **Excel/VBA** (`vba/modSyncParametres.bas` nouveau) : onglet technique `Parametres` (miroir cle/valeur/ts), `SyncParametres()` (pull/push LWW, horodatage UTC via `SWbemDateTime`), mapping vers les cellules `Suivi Carburant!B5` (kit) / `J7` (surconso) et `Graphiques!B2` (budget) / `B3` (objectif CO₂) avec garde-fou anti-écrasement de formule. Branché en fin de `SyncCore` (`modSyncGS.bas`).

## [4.9.0.1] — 2026-05-31

### Changed
- **X35 — Graphique `gPrice` : fusion des sources de prix + tous carburants** (`vba/modGraphiques.bas`) :
  - `BuildPriceBlockMerged` remplace `BuildPriceBlockFromHistory` : **union** des prix de `PrixHistory` (marché quotidien) **et** des prix des pleins (`Tableau2`) — pour chaque jour × carburant, le minimum des deux sources est retenu. L'historique couvre désormais tout l'historique des pleins + les relevés quotidiens.
  - Carburants **détectés dynamiquement** (plus de colonnes fixes E85/Gazole/SP98) : l'en-tête `_GraphData!G1:…` est écrit à la volée selon les carburants présents ; ordre préféré E85 → SP98 → GAZOLE → SP95 → E10 → GPL → autres.
  - `rPriceCols` (nombre de colonnes carburant) transmis à l'appelant pour que le graphique `gPrice` soit dimensionné dynamiquement (`Resize(rPrice, 1 + rPriceCols)`).
  - `FuelKey` étendu : SP95, E10, GPL, et libellé brut conservé pour les carburants inconnus (HVO, GNV…).

## [4.9.0.5] — 2026-05-31

### Fixed
- **KPI Conso moyenne / Coût 100 km — méthode full-to-full** (`vba/modDashboardKPI.bas`) : `ComputeKPIs` exclut désormais le **1er plein** (plein de référence) du cumul litres/coût. Le 1er plein établit le km de départ mais son volume représente du carburant consommé avant la fenêtre de mesure (km inconnu → kmMin). Les pleins suivants couvrent exactement la distance kmMin → kmMax. Passage à 2 passes : passe 1 = trouver kmMin, passe 2 = cumuler en excluant le plein à kmMin. Impact sur Z900+E85 : 7,4 → **6,6 L/100 km**.

## [4.9.0.3] — 2026-05-31

### Changed
- **X35 — `gPrice` : carburants filtrés sur ceux présents dans les pleins** (`vba/modGraphiques.bas`) : la source `PrixHistory` (marché quotidien) enrichit maintenant **uniquement** les séries de carburants déjà présents dans les pleins (`Tableau2` / `GS_Pleins`). Avant : PrixHistory pouvait introduire des séries supplémentaires (ex. Gazole) même si l'utilisateur n'en avait jamais fait le plein → graphique pollué. Après : `fuelSet` est défini exclusivement par les pleins ; PrixHistory ne fait qu'apporter plus de points de données pour ces carburants (dates plus denses, comblant les jours sans plein). Changement d'une seule ligne dans `BuildPriceBlockMerged`.

## [4.9.0.0] — 2026-05-31

### Ajouté
- **X34 — Requête Power Query `PrixHistory`** (`powerquery/PrixHistory.m`) : importe l'onglet `_PrixHistory` du Google Sheet (relevé quotidien ~7h, alimenté par `RefreshPrix.gs → refreshPrixCarburants`) dans une table Excel locale `PrixHistory` (colonnes Station | Date | Type | Prix). Source de vérité des **prix marché** dans le classeur, accessible hors-ligne.
- **X32 — Sélecteurs Véhicule / Carburant** dans l'onglet « Graphiques » : listes déroulantes en `B5` (véhicule) et `B6` (carburant), alimentées par les valeurs distinctes de `GS_Pleins`. Valeur par défaut = véhicule et carburant du **dernier plein**. Sources de validation stockées dans des colonnes techniques masquées (AZ/BA).
- **X33 — KPI dynamiques filtrés** (`vba/modDashboardKPI.bas`, nouveau module) : les cartes **Conso moyenne**, **Coût aux 100 km** et **Économies E85 vs SP98** dépendent désormais du véhicule + carburant sélectionnés. Calcul à la volée depuis `GS_Pleins` (`ComputeKPIs`), surconso E85 lue dans `Suivi Carburant!J7` (défaut 0,20). Le périmètre de filtrage est rappelé en sous-titre de chaque carte.

### Modifié
- **X30 — Graphique `gPrice` (évolution du prix)** : l'historique des prix provient maintenant de la table marché `PrixHistory` (prix le moins cher par jour et par carburant) au lieu des prix tirés des pleins. Repli automatique sur les prix des pleins si la table `PrixHistory` est absente (`modGraphiques` : `HasPriceHistory` / `BuildPriceBlockFromHistory`).
- **X31 — Feuille « Prix par Station »** (`vba/modPrixStation.bas`, nouveau module) : affiche désormais le **dernier prix marché** par couple Station + Carburant lu dans `PrixHistory` (tableau pivot Station × Carburant + colonne « Maj le »), au lieu des prix tirés des pleins.
- **Onglet « Graphiques » — rafraîchissement automatique** (`vba/Graphiques_snippet.bas`) : `Worksheet_Activate` régénère le tableau de bord à l'ouverture de l'onglet (anti-rebond 15 s) ; `Worksheet_Change` recalcule les KPI dès qu'on change le véhicule (B5) ou le carburant (B6). Panneau Paramètres étendu aux lignes 1→6.

## [4.8.0.0] — 2026-05-31

### Added
- **Tableau de bord Excel — 3 graphiques « Rentabilité du kit » restaurés** (`vba/modGraphiques.bas` v4.8.0.0, repris de l'ancien classeur `Suivi conso E85_v2.xlsm`) :
  - **X27 — Économie cumulée vs coût du kit** (courbe + seuil) : économie cumulée par plein E85 (`Tableau2[Économie cumulée (€)]`) avec ligne-seuil **coût du kit** (`Suivi Carburant!B5`, repli recherche du libellé « kit », défaut 514,54 €).
  - **X28 — Coût au km c€/km par plein** (barres) : `Tableau2[Coût c€/km]` par numéro de plein.
  - **X29 — Projection de rentabilité du kit** (nuage de points + **tendance linéaire projetée** de 5 pleins) pour estimer le point de rentabilité.
- **Boutons du tableau de bord en VRAIES IMAGES cliquables** (`excel/assets/btn_recreer.png`, `btn_export_pdf.png`, générés par `excel/assets/_make_buttons.ps1`). La macro insère les PNG via `AddPicture` (`OnAction` conservé) avec **repli automatique sur une Shape stylée** si le fichier est absent.
- **Rafraîchissement auto à l'ouverture de l'onglet** (`vba/Graphiques_snippet.bas`, nouveau) : `Worksheet_Activate` relance `CreerGraphiquesWeb(silent:=True)` (anti-rebond 15 s) → le dashboard est à jour **sans aucune manipulation**.
- **S3 — Suppression bidirectionnelle Excel ↔ Google Sheets** (`Code.gs` v3.8.0.0, `vba/modSyncGS.bas` v2.10.0.0, `js/historique.js`). Soft-delete via **tombstone** (col R `Supprimé`) au lieu d'un hard delete ; `handleExport` exclut les lignes supprimées de `records` et renvoie `deleted:[sync_id…]`. Nouvelle action GAS `bulkDelete` + macro VBA **`SupprimerPleinExcel`** (supprime le plein sélectionné et propage à GS). L'app web purge son cache des `sync_id` supprimés.
- **S4 — `ForceResync` (VBA)** : vide la table `GS_Pleins` et **ré-importe tout** depuis Google Sheets (reset en cas de désalignement, confirmation requise).
- **S5 — Résolution de conflit par horodatage** (`Code.gs`, `vba/modSyncGS.bas`). Nouvelle colonne GS Q `Modifié_le` ; en cas de modification du même `sync_id` des 2 côtés, on garde le **plus récent** (col Q Excel vs `Modifié_le` GS) au lieu d'un *Excel-wins* systématique. `modifiedAt` envoyé dans `bulkUpdate` → arbitrage aussi côté serveur.

### Changed
- **Dashboard Excel — mise en page « moderne »** : **bandeau-titre**, bloc **paramètres espacé des boutons**, **graphiques décalés vers le bas** (`TOP_BASE` 90 → 150), et **charte graphique alignée sur l'app web** (vert `#1D9E75`, bleu foncé `#1B3A5C`, bleu `#2E75B6`, ambre `#F0A500`, rouge `#E24B4A`).
- **`commit.sh` — sortie verbeuse EN DIRECT** : tee vers un journal `commit.log` + line-buffering (`stdbuf`) des étapes npm, et **vitest en `--reporter=verbose`** → les étapes (lint, tests) s'affichent au fil de l'eau dans l'interface au lieu d'apparaître seulement à la fin.
- **Versions** : `js/config.js` `APP_VERSION` 4.8.0.0 · `Code.gs` v3.8.0.0 · `modGraphiques.bas` v4.8.0.0 · `modSyncGS.bas` v2.10.0.0.

### ⚠️ Installation
1. **Apps Script** : copier `Code.gs` puis **Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer** (S3/S5 : ajoute les colonnes Q `Modifié_le` et R `Supprimé` automatiquement au 1ᵉ appel).
2. **Excel** : réimporter `vba/modGraphiques.bas` et `vba/modSyncGS.bas` ; coller `vba/Graphiques_snippet.bas` dans le module de la **feuille** `Graphiques`. Garder le dossier `excel/assets/` à côté du classeur pour les boutons PNG (sinon repli Shape). `CreerGraphiquesWeb` régénère le tableau de bord ; `SupprimerPleinExcel` / `ForceResync` assignables à des boutons.

## [4.7.0.0] — 2026-05-31

### Added
- **S12 — Endpoint GAS `action=stats` pré-agrégé** (`Code.gs`). Nouvelle route `?action=stats[&veh=&year=]` qui calcule côté serveur les **agrégats mensuels** (coût, litres, CO₂ évité), les **KPIs annuels** (pleins, litres, € dépensés, km, station préférée) et le **comparatif par véhicule** (conso & coût /100 km), puis renvoie un **JSON compact** mis en **cache `CacheService` ~1 h** (clé = véhicule|année|nb lignes). Surconso E85 dynamique + constantes CO₂ alignées sur `js/config.js`. **⚠️ Redéploiement de la Web App requis** (nouvelle version).
- **W59 — Consommation des agrégats serveur côté app** (`js/statsApi.js`, nouveau). Client tolérant aux pannes : `getServerStats(veh, year)` (cache localStorage TTL 1 h), `getCachedServerStats` (rendu instantané), `prewarmServerStats` (pré-chauffe au démarrage, appelée dans `main.js`). Helpers purs testés (`buildStatsUrl`/`isFresh`/`readStatsCache`/`writeStatsCache`) → `tests/statsApi.test.js` (**+12 tests**).
- **W59 — Carte « Bilan annuel ⚡ serveur »** (vue Stats). Nouveau bloc `#serverSummary` rendu **instantanément** depuis le cache (ou un **repli local** calculé depuis l'historique si l'endpoint n'est pas encore déployé), puis rafraîchi en tâche de fond. KPIs année : pleins, litres, €, km, station préférée. Styles `.srv-*` (clair + sombre).
- **X26 — Mini-jauge budget annuel** (`vba/modGraphiques.bas`). 13ᵉ visuel `gBudgetYear` (colonne gauche) : barres **Dépense de l'année cible vs Objectif (Budget mensuel `B2` × 12)**, affichée seulement si un budget est renseigné ; dépense en **rouge si dépassement**, vert sinon, objectif en orange. Réutilise `coutAnnee`/`anneeCible` (donc respecte le sélecteur d'année `B4`).

### Changed
- **U8 — Thème sombre** : vérifié et finalisé (déjà présent : `js/theme.js`, bouton `#themeToggle`, init `prefers-color-scheme` + persistance, surcharges CSS `[data-theme="dark"]`). Couverture étendue au nouveau bloc résumé serveur.
- **Versions** : `js/config.js` `APP_VERSION` 4.7.0.0 · `Code.gs` v3.7.0.0 · `modGraphiques.bas` v4.7.0.0.

### ⚠️ Installation
1. **Apps Script** : copier `Code.gs` puis **Déployer → Gérer les déploiements → ✏️ → Nouvelle version → Déployer** (sinon `action=stats` renvoie le HTML et le client bascule en repli local — aucune erreur visible).
2. **Excel** : réimporter `vba/modGraphiques.bas` ; la jauge budget annuel apparaît au prochain `CreerGraphiquesWeb` si `B2` est renseigné.

## [4.6.0.0] — 2026-05-31

### Added
- **X23 — Export PDF du tableau de bord** (`vba/modGraphiques.bas`). Nouveau bouton **« Exporter en PDF »** sur l'onglet Graphiques (`btnExportGraph`, à côté de « Recréer ») → macro `ExporterGraphiquesPDF` : `ExportAsFixedFormat` de l'onglet vers `Tableau de bord - AAAA-MM-JJ.pdf` dans le dossier du classeur (repli `Documents`), ouverture automatique après export.
- **X24 — Sélecteur d'année du bilan annuel** (`vba/modGraphiques.bas`). Nouveau paramètre **`Graphiques!B4`** (« Année bilan », vide = année la plus récente) lu par `CreerGraphiquesWeb` puis `BuildAggregates` : les **KPIs** (pleins, litres, € dépensés, km, station préférée) et la **jauge CO₂** sont recalculés pour l'année choisie (`anneeCible`) au lieu de l'`anneeMax` figée. Permet de comparer 2025 vs 2026.

### Changed
- **X25 — Rafraîchissement incrémental des graphiques** (`vba/modGraphiques.bas`). Les 7 `ChartObjects` et les 6 cartes KPI sont désormais **nommés** (`gPrice`/`gCost`/`gConso`/`gVeh`/`gBudget`/`gCo2`/`gGauge`, `kpiTitle`/`kpiCard1..5`) puis **réutilisés** (repositionnement + `SetSourceData`) au lieu d'être supprimés/recréés à chaque passage (helpers `EnsureChart`/`EnsureShape`). `ClearAllCharts` (destruction totale) remplacé par `PurgeUnknown` qui ne supprime que les objets **inconnus** (anciennes versions). Résultat : appel auto plus rapide et sans clignotement, surtout sur gros historique. Un graphique dont les données disparaissent est retiré par `DeleteChartByName`.
- **X22 — Garde-fou « onglet pré-existant »** (`vba/modSyncGS.bas`). La recréation automatique en fin de `SyncCore` (v4.5.0.0) ne se déclenche désormais que si l'onglet **« Graphiques » existe déjà** (`GraphSheetExists`) : la synchro ne crée plus seule l'onglet + les 8 graphes sur un classeur où l'utilisateur ne s'en sert pas. Premier affichage = un clic manuel sur « Recréer les graphiques ».

### ⚠️ Installation dans le classeur
Réimporter **les deux modules** (`Alt+F11` → Fichier → Importer un fichier…) : `vba/modGraphiques.bas` **et** `vba/modSyncGS.bas`. L'onglet Graphiques gagne le bouton « Exporter en PDF » et la cellule `B4` (année) au prochain `CreerGraphiquesWeb`.

## [4.5.0.0] — 2026-05-31

### Added
- **Recréation automatique des graphiques après synchronisation** — `vba/modGraphiques.bas` + `vba/modSyncGS.bas`. La macro `CreerGraphiquesWeb` est désormais appelée **automatiquement en fin de `SyncCore`** (donc à l'ouverture du classeur via `SyncOnOpen` **et** après un `SyncManuel`), **uniquement si des données ont changé** (lignes ajoutées ou mises à jour, GS→Excel ou Excel→GS : `addedFromGS + updFromGS + sentToGS + sentUpdToGS > 0`). Plus besoin de cliquer « Recréer les graphiques » : le tableau de bord reflète les derniers pleins dès l'ouverture.

### Changed
- **`CreerGraphiquesWeb` gagne un paramètre optionnel `silent`** (`Optional silent As Boolean = False`). En **appel automatique** (`silent:=True`), aucune `MsgBox` bloquante n'est affichée — une éventuelle erreur est reportée **en barre d'état** seulement, pour ne jamais interrompre l'ouverture du classeur. Le **bouton « Recréer les graphiques »** (appel sans argument) conserve la `MsgBox` d'erreur.
- **Garde-fou non bloquant côté sync** : l'appel auto est encadré par `On Error Resume Next` dans `SyncCore`, donc une erreur de génération de graphiques n'interrompt jamais la synchronisation.

### ⚠️ Installation dans le classeur
Réimporter **les deux modules** (`Alt+F11` → Fichier → Importer un fichier…) : `vba/modGraphiques.bas` **et** `vba/modSyncGS.bas`. Aucune autre action : à la prochaine synchro porteuse de changements, les graphiques se recréent seuls.

## [4.4.0.0] — 2026-05-31

### Added
- **Tableau de bord graphique Excel — `vba/modGraphiques.bas` (macro `CreerGraphiquesWeb`)** — recrée sur l'onglet **« Graphiques » (remis à zéro)** les visualisations de l'app web, en **graphiques natifs Excel**, alimentés par `Tableau2` / `GS_Pleins` :
  1. **Évolution du prix** (une courbe par carburant E85 / Gazole / SP98, X = Date) ;
  2. **Coût mensuel** (histogramme, agrégat des `Coût Plein` par mois) ;
  3. **Tendance dépenses 6 mois + objectif** (barres + ligne budget) ;
  4. **Comparaison véhicules** (barres horizontales conso L/100 km & coût €/100 km, km = max−min compteur par véhicule, depuis `GS_Pleins`) ;
  5. **CO₂ évité — cumul mensuel** vs trajectoire d'objectif (constantes alignées sur `js/config.js` : 2,21 kg/L essence, 1,105 kg/L E85, surconso = `Suivi Carburant!J7`) ;
  6. **Jauge objectif CO₂ annuel** (réalisé vs objectif) ;
  7. **Consommation L/100 km** (refonte) ;
  8. **Bilan annuel — KPIs** (année, pleins, litres, € dépensés, km, station préférée).
  - **Agrégats calculés en VBA** (lecture des tables en tableaux + `Scripting.Dictionary`) et écrits dans une feuille technique **`_GraphData`** (très masquée) ; aucun onglet métier pollué.
  - **Paramètres pilotables** sur l'onglet Graphiques : `B2` = **Budget mensuel (€)** (vide = pas de ligne objectif), `B3` = **Objectif CO₂ annuel (kg)** (défaut 200). La surconso reste `Suivi Carburant!J7`.
  - **Rejouable** : bouton **« Recréer les graphiques »** (lié à `CreerGraphiquesWeb`) ; supprime/recrée tous les `ChartObjects` + cartes KPI, préserve le bouton.
  - **Robustesse import** : aucun emoji ni `€` littéral (le `€` et les caractères accentués des libellés de colonnes — ex. « Coût Plein (€) » — passent par `ChrW`), pour un import `.bas` ANSI sans corruption ; gestion d'erreur avec `MsgBox` + barre d'état.

### ⚠️ Installation dans le classeur
1. `Alt+F11` → **Fichier → Importer un fichier…** → `vba/modGraphiques.bas`.
2. Exécuter **`CreerGraphiquesWeb`** (ou cliquer le bouton créé sur l'onglet Graphiques).
3. Renseigner éventuellement **Budget mensuel** (Graphiques `B2`) ; l'objectif CO₂ `B3` se pré-remplit à 200.
   *(Pré-requis : `Tableau2` à jour — lancer `SyncTableau2DepuisGS` au besoin ; `GS_Pleins` pour la comparaison véhicules.)*

## [4.3.0.7] — 2026-05-31

### Fixed
- **Colonne « Date » de `Tableau2` (Suivi Carburant) affichée en texte US au lieu de `JJ/MM/AAAA`.** La requête typait `Date` en **texte**, et le CSV gviz la renvoie en **`M/d/yyyy h:mm:ss`** (US) ; `Tableau2` tirant `GS_Pleins[Date]` par `INDEX`, la cellule contenait alors du **texte** (« 5/22/2026 2:00:00 ») auquel le format `dd/mm/yyyy` ne peut **pas** s'appliquer. **Correctif** (`powerquery/GS_Pleins.m`) : `Date` est désormais **convertie en vraie date** (sans heure, culture en-US) via `Date.From(DateTime.From(_, "en-US"))` → la colonne s'affiche en **JJ/MM/AAAA** dans `Tableau2`. Le **tri** chronologique se fait directement sur cette vraie date (colonne technique `_tri` supprimée, devenue inutile).

## [4.3.0.6] — 2026-05-31

### Changed
- **Power Query `GS_Pleins` : tri chronologique ascendant par Date** (`powerquery/GS_Pleins.m`). Le CSV gviz renvoie les dates en **format US `M/d/yyyy h:mm:ss`** et **n'est pas trié** (vérifié : ligne 1 = 22/05, ligne 2 = 19/04). Un tri **texte** serait donc faux (`"10/1/2025" < "5/22/2026"`). Ajout d'une colonne technique `_tri` parsée en **culture en-US** (`DateTime.From([Date], "en-US")`), tri ascendant, puis retrait de la colonne. La vue dérivée `Tableau2` (« Suivi Carburant »), qui tire les lignes de `GS_Pleins` par position (`INDEX … ROW()-…`), est ainsi chronologique → calculs de **Δkm / conso / cumul** cohérents.

### Fixed
- **`Tableau2` col N « Économie cumulée (€) » : `#VALEUR!` sur la 1ʳᵉ ligne quand c'est un plein E85.** La formule du cumul référence la ligne précédente : pour la **1ʳᵉ ligne de données (16)**, `N15` est la **cellule d'en-tête** (texte). Le test `IF(N15<>"" ; N15+… ; …)` était donc **vrai** → `texte + nombre = #VALEUR!`. Exposé par le tri ascendant (la plus ancienne ligne, désormais en tête, peut être un E85). **Correctif** : remplacer `N15<>""` par **`ISNUMBER(N15)`** (l'en-tête texte → on démarre le cumul au lieu de l'additionner) — comportement identique pour les lignes normales, plus de `#VALEUR!`. Formule de colonne (tableau) à coller dans **N16** :
  ```
  =IF(Tableau2[[#This Row],[Type]]<>"SuperEthanol E85","",
     IF(Tableau2[[#This Row],[Coût Plein (€)]]="","",
        IF(ISNUMBER(N15),
           N15+(L16-Tableau2[[#This Row],[Coût Plein (€)]]),
           L16-Tableau2[[#This Row],[Coût Plein (€)]])))
  ```
  *(Formules de calcul de `Tableau2` non versionnées : `SyncTableau2DepuisGS` ne régénère que les colonnes brutes et préserve les colonnes de calcul.)*

## [4.3.0.5] — 2026-05-31

### Added
- **Import de la colonne `Photo ticket` dans le classeur Excel (`GS_Pleins`)** — l'URL Drive de la photo du ticket (saisie par la web app, col P du Google Sheet) est désormais **ramenée dans le classeur**, en même temps que les autres colonnes, **à la fois par la Power Query et par la synchro VBA**.
  - **Disposition des colonnes de la table `GS_Pleins`** : `A→N` données · `O` `sync_id` · **`P` `Photo ticket` (nouveau)** · **`Q` `Modifie_local` (déplacé de P en Q)**. La table est ainsi un **miroir exact A→P** du schéma GAS, le marqueur de synchro local étant rejeté à droite (col Q, hors GS).
  - **`powerquery/GS_Pleins.m`** : passe à **16 colonnes A→P** (ajout `Column16 → "Photo ticket"`, type texte).
  - **`vba/modSyncGS.bas`** : nouvelle const `COL_PHOTO = 16` ; **`COL_MODIFIED` passe de 16 à 17** ; `ImportGSToExcel` écrit la photo en col P pour les nouvelles lignes (plage étendue à la col Q) ; `UpdateRowFromGS` met aussi à jour la photo ; `EnsureModifiedColHeader` initialise l'en-tête « Photo ticket » (col P) **sans écraser** celui posé par la requête, et « Modifie_local » (col Q). La photo est **import-only** : elle n'est jamais renvoyée vers le GS (`bulkAdd`/`bulkUpdate` n'écrivent pas la col P côté GAS).
  - **`vba/GS_Pleins_snippet.bas`** : `COL_PHOTO = 16`, `COL_MODIFIED = 17` ; le `Worksheet_Change` reste restreint à `A:N`, donc éditer O/P/Q ne déclenche ni dirty-flag ni validations.

### ⚠️ Application dans le classeur (snippets fournis)
1. Coller **`powerquery/GS_Pleins.m`** (16 col) puis *Actualiser* : `Photo ticket` apparaît en col P, et la colonne `Modifie_local` existante glisse en col Q.
2. Réimporter **`vba/modSyncGS.bas`** et **`vba/GS_Pleins_snippet.bas`** (consts `COL_PHOTO`/`COL_MODIFIED` à jour).
3. Vérifier après *Actualiser* : en-tête col P = « Photo ticket », col Q = « Modifie_local » (réinitialisé à la prochaine ouverture / `ForceFormatDates`).

## [4.3.0.4] — 2026-05-31

### Audit — alignement du classeur Excel local ↔ GAS / Google Sheet
Vérification complète du `.xlsm` (VBA décompilé + Power Query décodée + tables). Bilan : les modules de **synchro VBA** sont fonctionnellement conformes au backend, mais **la requête Power Query était cassée** et le **classeur local est en retard** sur les sources canoniques `vba/*.bas` du dépôt.

### Added
- **`vba/synchroniseGoogleForm.bas`** — module **désormais versionné** (il manquait dans `vba/` alors que `vba/ModuleImportGS.bas:195` l'appelle — **référence pendante** comblée). Version corrigée **avec le token S6** : `SyncStationsVersGoogleSheets` postait `action=syncStations` **sans token** → le backend renvoyait `{"success":false,"error":"unauthorized","code":401}` (HTTP 200 + corps d'erreur), d'où le MsgBox « Réponse inattendue » à chaque fin d'import. Token ajouté au payload (identique à `js/config.js` / `vba/modSyncGS.bas`).
- **`powerquery/GS_Pleins.m`** — la requête Power Query `GS_Pleins` est désormais **versionnée dans le dépôt** (elle n'avait aucun miroir traçable, contrairement aux modules `vba/*.bas`). Fichier prêt à coller dans l'Éditeur avancé Power Query, avec en-tête expliquant le mapping A→O et la raison de l'exclusion de `Photo ticket`.

### Fixed
- **Requête Power Query `GS_Pleins` désynchronisée du schéma GAS (bug réel et vivant)** — le code M lisait `Columns=15` et mappait encore `Column7 → "PrixS98"`, alors que la colonne « Prix S98 jour » a été **supprimée du GAS en v2.3.0.0** (`migrateRemoveS98`). Conséquence à chaque *Actualiser* : décalage d'une colonne à partir de la 7 (« Station essence » recevait le véhicule, les prix carburants glissaient d'un cran, `sync_id` atterrissait dans « GPLc station »), et `Photo ticket` (col P) jamais lue. La table cible `GS_Pleins` (A1:P12, 16 col) lue **par index** par `modSyncGS` était donc corrompue après tout rafraîchissement. La requête active est confirmée par `vba/ThisWorkbook_snippet.bas` (`ForceFormatDates` « au cas où Power Query l'a écrasé »).
  - **Correctif** (`powerquery/GS_Pleins.m`) : `PrixS98` retirée, lecture des **16 colonnes** du CSV, **mapping A→O exact** (Horodatage … `sync_id`), endpoint **gviz** ciblant l'onglet `_ImportGS` par son **nom** (comme `vba/ModuleImportGS.bas`).
  - **Choix délibéré — `Photo ticket` (col P du Sheet) N'EST PAS importée.** Dans la table Excel `GS_Pleins`, la **col P = marqueur VBA `Modifie_local`** (synchro bidirectionnelle dirty-flag). La lier à `Photo ticket` écraserait ce marqueur ; la requête conserve donc seulement les **15 colonnes A→O**.

### ⚠️ Action requise dans le classeur (snippets fournis, binaire non modifié)
Le `.xlsm` doit être resynchronisé manuellement avec les sources à jour du dépôt :
1. **Power Query** : coller `powerquery/GS_Pleins.m` (ci-dessus) puis *Actualiser*.
2bis. **`synchroniseGoogleForm`** : réimporter `vba/synchroniseGoogleForm.bas` (token ajouté) — c'est ce module qui provoque le MsgBox « Réponse inattendue / 401 » en fin d'import.
2. **`modSyncGS`** : le classeur **n'envoie pas le token S6** (`APP_TOKEN`). La version canonique `vba/modSyncGS.bas` ajoute `&token=APP_TOKEN` (GET) et `"token"` (POST bulkAdd/bulkUpdate). **🔴 401 confirmé le 2026-05-31** : la propriété de script `APP_TOKEN` **est posée et appliquée** côté GAS (`?action=export` sans token → `{"success":false,"error":"unauthorized","code":401}` ; avec token → `{"records":[…]}`). La synchro VBA du classeur actuel est donc **cassée** → **réimport de `vba/modSyncGS.bas` obligatoire** (et y coller la même valeur `APP_TOKEN` que `js/config.js`). *(La Power Query n'est pas concernée : elle lit le CSV public via gviz, indépendant de l'`APP_TOKEN`.)*
3. **`modFeatures`** : classeur en **v3.3.0.9**, dépôt en **v3.3.0.10** → réimporter `vba/modFeatures.bas`.
4. **Fonction `General.SyncStationsGoogleForm` (legacy) — à retirer (retrait chirurgical, PAS tout le module).** Elle utilise une **ancienne URL GAS** (`AKfycbyXzMUh2…` ≠ URL courante `AKfycbwIyCfZ…`) et poste `{"stations":[…]}` **sans `action:"syncStations"`** → le backend actuel l'interpréterait comme un enregistrement de plein invalide. C'est un doublon obsolète de `synchroniseGoogleForm.SyncStationsVersGoogleSheets` / `modSyncGS.PushStationsToGS`. → (a) supprimer la ligne `Call SyncStationsGoogleForm` dans `OuvrirFormulairePlein` ; (b) supprimer le **Sub** `SyncStationsGoogleForm` lui-même. **Conserver** le reste du module `General` : `AjouterStationSiInconnue`, `TrierStationsAlpha`, `EffacerStatusBar` sont encore utilisées par `frmNouveauPlein`, `ModuleImportGS` et `Feuil2` — supprimer le module entier les casserait.

### Changed
- **Version 4.3.0.4** — `APP_VERSION` (`js/config.js`) et `package.json` alignés (la web app n'est pas modifiée ; bump de cohérence projet, comme en v4.3.0.3).
- **Modules VBA conformes (rappel d'audit)** — `modSyncGS` (export/bulkAdd/bulkUpdate/syncStations, `sync_id`=col O, `Modifie_local`=col P, clés `stationPrices` {E85,SP98,SP95,E10,GAZOLE,GPLC}), `ModuleImportGS` (import CSV gviz, **détection des colonnes par nom d'en-tête** → résilient au schéma), `synchroniseGoogleForm` et le code-feuille `GS_Pleins` : tous alignés sur le backend `Code.gs`.

## [4.3.0.3] — 2026-05-30

### Changed
- **Renommage du Google Sheet → « Réponses - Suivi Conso Carburants »** — alignement du nom d''usage du classeur source. **Aucun paramétrage technique à modifier** : tous les accès passent par l''**ID** du classeur (`GS_SHEET_ID` dans `js/config.js`, `SPREADSHEET_ID` dans le GAS `Code.gs`, `GS_SHEET_ID` dans `vba/ModuleImportGS.bas`) et par les **noms d''onglets internes** (`_ImportGS`, `Stations`, `Vehicules`, `_PrixHistory`, `_PushSubs`), jamais par le nom du fichier classeur — qui n''a donc aucun impact fonctionnel sur la web app, le GAS ou la synchro VBA.
  - **Fichier d''export local renommé** : `Google Drive/Réponses - Suivi E85.xlsx` → `Google Drive/Réponses - Suivi Conso Carburants.xlsx`.
  - **Classeur Excel renommé** : `excel/Suivi conso E85.xlsm` → `excel/Suivi Conso Carburants.xlsm` ; références `README.md`/`INSTALL.md` et chemin de backup `ROADMAP.md` (X12) alignés.
  - **Inchangé** : `GAS_URL`, `GS_SHEET_ID`, `APP_TOKEN`, clés VAPID, onglets et clés localStorage `suivi_e85_*` (zéro perte de données).
## [4.3.0.2] — 2026-05-30

### Changed
- **Renommage du projet `suivi-e85` → `suivi-conso-carburant`** — alignement du nom technique sur le nom d'usage « Suivi Conso. Carburants » (multi-carburant, plus seulement E85).
  - **Dépôt GitHub** renommé → nouvelle URL **GitHub Pages : https://fdaubercy.github.io/suivi-conso-carburant/** (GitHub redirige l'ancienne URL un temps).
  - **`vite.config.js`** : `base` de build `/suivi-e85/` → **`/suivi-conso-carburant/`** ; **`package.json`** : `name` + script `preview --base` mis à jour ; **`package-lock.json`** : `name`.
  - **PWA** : nom du cache Service Worker `suivi-conso-carburant-shell-v…` (`public/sw.js`), commentaire `BASE_URL` (`js/pwa.js`). `manifest.json` inchangé (chemins déjà relatifs `./`).
  - **Exports CSV** : préfixe des fichiers téléchargés `suivi-conso-carburant-historique-…` / `-comparatif-…` (`js/historique.js`, `js/comparatif.js`).
  - **Outillage** : `README.md` (URL d'accès, arborescence), `CLAUDE.md`, `.claude/launch.json`, `.claude/settings.json` (rappel + hook de push + agent doc) et `.claude/commands/*.md` pointent vers le nouveau nom et le futur dossier local `…/Github/suivi-conso-carburant`.
  - **Inchangé (volontairement)** : `GAS_URL` et `GS_SHEET_ID` (IDs de déploiement/feuille, indépendants du nom), `APP_TOKEN` / clés VAPID, et les **clés localStorage `suivi_e85_*`** (conservées pour ne pas effacer réglages/cache/épingles des utilisateurs).

## [4.3.0.1] — 2026-05-30

### Fixed
- **Carte Budget / Tendance « invisibles » (W39/W50)** — quand **aucun budget mensuel n'était défini**, la barre de budget *et* la tendance 6 mois disparaissaient **sans explication**, donnant l'impression d'un bug. Désormais, s'il y a des dépenses ce mois-ci, un **encart d'état vide** s'affiche dans la carte Stats : « 🎯 Budget \<mois\> · X € ce mois · 💡 Définissez un budget mensuel… ». Le lien **navigue vers ⚙️ Réglages, déplie le bloc Budget si replié, fait défiler jusqu'au champ et le focalise** (`buildBudgetBar` dans `js/stats.js`, handler `data-focus` dans `js/main.js`, CSS `.budget-box.hint` / `.budget-hint-link`). Une fois un budget saisi, la barre de progression, la tendance 6 mois et l'alerte anticipée (W56) apparaissent normalement.

## [4.3.0.0] — 2026-05-30

### Added
- **Export comparatif véhicules en CSV (W52)** — bouton « 📥 » dans l'en-tête de la carte **Comparaison véhicules** (`#comparatifCard`, vue Stats). Exporte le tableau **Véhicule / Pleins / Conso (L/100 km) / Coût (€/100 km) / Total dépensé / Litres cumulés / Km parcourus** en `.csv` au format **Excel FR** (séparateur `;`, **BOM UTF-8**, virgule décimale). Fonction pure `buildComparatifCSV()` (couverte par `tests/comparatif.test.js`) + `exportComparatifCSV()` + `initComparatifExport()` (délégation d'événements) dans `js/comparatif.js`, câblé depuis `js/main.js`. *(L'option capture image PNG a été écartée : le comparatif est en HTML/CSS, une capture imposerait une lib externe contraire au principe « zéro dépendance front » du projet.)*
- **Favori manuel épinglé 📌 (W53)** — bouton **📌** cliquable sur chaque station habituelle (vue Carte) pour l'**épingler en tête** de la liste, **indépendamment du prix et du seuil de fréquentation automatique ⭐**. Les stations épinglées remontent en haut dans l'ordre de tri courant (prix ou fréquentation). Persistance `localStorage` (`PINNED_STATIONS_KEY`) via `_loadPinned` / `_togglePinned` (`js/stationsmap.js`). CSS `.smap-pin-btn` (état actif/inactif) et `.smap-item.pinned` (`css/style.css`). Le 📌 manuel est volontairement distinct du badge ⭐ « favorite auto » (W36) pour éviter toute confusion.
- **Export CSV global + choix du séparateur (W54)** — dans la carte « Tous les pleins » : second bouton **📦** exportant **tout l'historique** (hors filtres, trié du plus récent au plus ancien) à côté de l'export 📥 de la vue filtrée. Nouveau sélecteur de **séparateur** `#csvSepSel` : `;` (Excel FR) ou `,` (tableurs anglo-saxons), **persisté** (`CSV_SEP_KEY`). `buildHistoriqueCSV(records, sep)` est désormais paramétré : en mode `,` les **décimales passent au point** pour lever l'ambiguïté avec la virgule. Ajouts `exportHistoriqueAllCSV()` + `initCsvSepSetting()` (`js/historique.js`), boutons/sélecteur dans `index.html`, câblage dans `js/main.js`. Tests étendus (`tests/historique.test.js`).
- **Objectif CO₂ : palier mensuel + courbe cumulée (W55)** — sous la jauge CO₂ annuelle (carte Stats), nouveau graphe SVG « **CO₂ évité — cumul \<année\>** » : courbe verte du **CO₂ évité cumulé mois par mois** confrontée à la **trajectoire d'objectif** (droite pointillée orange, **cible mensuelle = objectif annuel / 12**). Pied de carte indiquant si l'on est **en avance** ou **en retard** sur la cible. `computeCo2Monthly()` / `buildCo2Monthly()` (`js/stats.js`, même méthode « distance égale » que l'annuel), CSS `.co2m-*` (`css/style.css`).
- **Alerte de dépassement budget anticipée (W56)** — sous la barre Budget (carte Stats), encart **« ⏰ À ce rythme, budget dépassé le JJ/MM · ≈ X € en fin de mois »**, calculé sur le **rythme du mois en cours** (dépense cumulée ÷ jours écoulés → projection à fin de mois et date de franchissement). Affiché **uniquement** si le budget n'est pas encore dépassé et que le franchissement est prévu **avant la fin du mois**. Fonction pure `computeBudgetForecast()` (couverte par `tests/stats.test.js`), intégrée à `buildBudgetBar` (`js/stats.js`), CSS `.budget-forecast` (`css/style.css`).

### Changed
- **Version 4.3.0.0** — `APP_VERSION` (`js/config.js`) et `package.json` alignés. Nouvelles clés localStorage : `PINNED_STATIONS_KEY` (W53), `CSV_SEP_KEY` (W54).
- **Tests** — **93 → 111** tests Vitest au vert : nouveau `tests/comparatif.test.js` (5 cas : agrégation véhicules + CSV), `tests/stats.test.js` (6 cas : projection budget W56), et 3 cas ajoutés à `tests/historique.test.js` (séparateur CSV configurable W54).

## [4.2.0.0] — 2026-05-30

### Added
- **Vue de départ configurable (U4)** — nouveau bloc « 🚀 Démarrage » dans Réglages (`#startView`) : choix de la page d'ouverture entre **Accueil**, **Saisie** ou **Dernière vue consultée**. Persisté (`START_VIEW_KEY`), résolu au démarrage par `resolveStartView()` (`js/router.js`) ; un deep-link `#/<vue>` reste prioritaire. La dernière vue « utile » (≠ accueil) est mémorisée à chaque navigation (`LAST_VIEW_KEY`).
- **Tuile « reprendre » sur l'Accueil (U5)** — bouton en tête de l'accueil (`#homeResume`) affichant **↩️ Reprendre — <dernière vue>** (ou « 📜 Voir l'historique » à défaut) et un résumé du **dernier plein** (date · station · €/L). Clic → navigation directe. `getLastRecordSummary()` (`js/historique.js`) lit la mémoire vive ou le cache `localStorage` (fonctionne avant le 1er chargement réseau) ; rendu par `renderHomeResume()` (`js/preferences.js`) à l'ouverture et à chaque retour sur l'accueil.
- **Blocs Réglages repliables (U6)** — chaque carte de Réglages (`.card.collapsible`) se replie/déplie au clic sur son titre (chevron ▾/▸), **état persistant** par bloc (`COLLAPSE_PREFIX`). Titre accessible au clavier (`role=button`, Entrée/Espace). `initCollapsibles()` (`js/preferences.js`), CSS `.collapse-chevron` / `.card.collapsed` (`css/style.css`).
- **Repères de cible sur les jauges (U7)** — la barre **Budget** et la jauge **CO₂ annuel** (carte Stats) affichent désormais une **marque à 50 %** sur la piste (`.gauge-tick`) et une **échelle `0 · 50 % · 🎯 <cible> · 100 %`** sous la barre (`.gauge-scale` / `.gauge-target`), rendant explicite que la valeur saisie = le **maximum (100 %)** de la jauge (`buildBudgetBar` / `buildCo2Annuel`, `js/stats.js`).

### Changed
- **Nouveau module `js/preferences.js`** — regroupe le câblage U4/U5/U6 (`initPreferences()` appelé depuis `js/main.js`).

## [4.1.0.0] — 2026-05-30

### Added
- **Réglages : maximum de jauge explicite** — les libellés des champs **Budget mensuel** et **Objectif CO₂ annuel** précisent désormais qu'ils définissent le **maximum (100 %)** de la barre budget / de la jauge CO₂ de la carte Stats. Aucun nouveau stockage : la valeur saisie sert déjà de plafond (`getBudgetMensuel` / `getObjectifCo2`, `js/stats.js`).

### Changed
- **Vue d'accueil par défaut à la connexion** — `DEFAULT_VIEW` passe de `saisie` à `accueil` (`js/router.js`). Au démarrage sans hash, l'app ouvre la page **Accueil** (tuiles) plutôt que le formulaire de saisie. Un deep-link `#/<vue>` reste respecté.
- **Page Réglages réorganisée par bloc** — chaque type de paramètre est désormais **regroupé visuellement** (`.param-group`, `css/style.css`) : **Alertes + Seuil** d'un même carburant (E85, Gazole, SP98) dans un encadré commun (`buildFuelRows`, `js/notifications.js`), puis cartes distinctes **Conversion E85** (prix du kit), **Budget mensuel** et **Objectif CO₂** (`index.html`). Lecture plus claire : on identifie d'un coup d'œil à quel carburant se rapporte chaque seuil.
- **Mise en page pleine hauteur** — `body` passe en **flex colonne** (`min-height: 100dvh`) et `#app-main` en `flex: 1` (`css/style.css`). Le **footer reste collé en bas de l'écran** quelle que soit la page, même quand le contenu ne remplit pas la hauteur (ex. page Réglages courte). La barre d'onglets fixe est inchangée.

## [4.0.0.0] — 2026-05-30

### Added
- **Tendance du budget mensuel (W50)** — sous la barre de budget (carte Stats), mini-histogramme SVG des dépenses des **6 derniers mois** avec **ligne d'objectif** pointillée (orange) au niveau du budget configuré. Réutilise `buildMonthlyReport` mois par mois (`buildBudgetTrend` dans `js/stats.js`) ; barres **vertes** sous l'objectif, **rouges** au-dessus, étiquettes de mois abrégées. Affiché uniquement si un budget mensuel est défini et qu'au moins un mois présente des dépenses. CSS `.trend-*` (`css/style.css`).
- **Objectif CO₂ / éco-score annuel (W51)** — dans la carte Stats, jauge « **X kg CO₂ évités cette année** » vers un objectif annuel (par défaut **200 kg**, configurable dans ⚙️ via `#objectifCo2` / `CO2_OBJECTIF_KEY`). États go / near / done (objectif atteint). Équivalents parlants : **km de conduite thermique évités** (`CO2_THERMIQUE_PER_KM = 0,12 kg/km`) et **arbres** (`CO2_ARBRE_PAR_AN = 25 kg/an`). Calcul à distance égale sur les pleins E85 de l'année courante uniquement (`computeCo2Annuel` / `buildCo2Annuel` / `getObjectifCo2` / `initCo2ObjectifSetting` dans `js/stats.js`). CSS `.co2y-*` (`css/style.css`).
- **Export CSV de l'historique (W25)** — bouton « 📥 » dans l'en-tête de la carte « Tous les pleins » (vue Historique). Exporte la **vue filtrée courante** (filtres véhicule / carburant actifs) en `.csv` via `Blob` + `URL.createObjectURL` + ancre `download` (`exportHistoriqueCSV` dans `js/historique.js`). Format **Excel FR** : séparateur `;`, **BOM UTF-8**, décimales à la **virgule**, colonnes Date / Horodatage / Véhicule / Type / Km compteur / Litres / Prix €/L / Total € / Station. Fonction pure `buildHistoriqueCSV` couverte par `tests/historique.test.js` (4 cas : en-tête, virgule décimale + total, échappement du séparateur, nombre de lignes). Justificatif remboursement employeur / fiscalité, zéro backend.

### Changed
- **`commit.sh` verbeux** — sortie entièrement réécrite : chaque étape est annoncée (1/9 → 9/9) avec un séparateur, une icône, un titre et le **temps écoulé** (`+Ns`), la liste des fichiers modifiés à l'étape 2, des messages `✅ / ℹ️ / ⚠️ / ❌` distincts, et un **bilan final** (durée totale, branche, hash court du commit). Comportement et garde-fous (gate lint/tests, sync version, pull --rebase) inchangés.
- **Version 4.0.0.0** — passage à la majeure : palier de maturité du tableau de bord Stats (budget + CO₂ + comparatif + tendances). `APP_VERSION` (`js/config.js`) et `package.json` alignés.
- **`eslint.config.js`** — ajout du global navigateur `Blob` (utilisé par l'export CSV).

## [3.12.3.0] — 2026-05-30

### Fixed
- **Swipe inopérant entre les vues (W44)** — le balayage horizontal gauche/droite ne changeait jamais de page. Cause : `#app-main` n'avait pas de `touch-action`, donc au moindre mouvement vertical le navigateur démarrait le scroll natif et **annulait le pointer** (`pointercancel` → `tracking = false`), si bien que `pointerup` ne déclenchait jamais `navigateRelative`. Correctif : `#app-main { touch-action: pan-y pinch-zoom; }` (`css/style.css`) — le scroll vertical et le pinch-zoom restent natifs, les gestes **horizontaux** sont réservés au JS du swipe. Vérifié en preview : `saisie → stats` (gauche) et `stats → saisie` (droite), vue/onglet/titre synchronisés. Rappel des sens : **balayage vers la gauche = vue suivante**, vers la droite = précédente.

## [3.12.2.0] — 2026-05-30

### Added
- **Hook `pre-commit` — husky + lint-staged (T8)** — `husky` et `lint-staged` ajoutés en devDependencies ; `.husky/pre-commit` lance `npx lint-staged` à **chaque** `git commit` (y compris depuis l'IDE, hors `commit.sh`). Config `lint-staged` (package.json) : sur les fichiers `js/**/*.js` mis en scène → `eslint --max-warnings=0` puis `vitest related --run` (tests liés aux fichiers modifiés). Script `prepare: husky` pour réinstaller le hook après `npm ci`.
- **Synchronisation de version dans `commit.sh` (T9)** — si le message contient `[vX.Y.Z.W]`, le script extrait la version, **avertit** si `APP_VERSION` (`js/config.js`) diverge, et **aligne automatiquement** `version` dans `package.json` (corrige le désalignement historique `package.json` 3.11.0.0 ↔ `config.js` 3.12.x). Étape exécutée avant `git add` pour être incluse au commit.
- **Tests du parsing OCR `ticket.js` (T10)** — `tests/ticket.test.js` (22 cas, env `jsdom`, `tesseract.js` mocké) couvrant `parseOCRText` : date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DD/MM/YY, « 15 janvier 2024 »), volume (+ bornes), prix €/L (dont artefact OCR `1,799 e/l`), montant total + fallbacks (litres × prix, total ÷ litres), kilométrage (contigu / séparateur espace), station (anti ligne de prix) et mapping carburant — dont la zone de l'ancienne clé dupliquée `sp 95-e10`. **71 → 93 tests Vitest.**

### Changed
- **Lint strict `--max-warnings=0` (T11)** — script `lint` (`package.json`) et donc le job CI ESLint + `commit.sh` échouent désormais au moindre warning, empêchant la dette lint de se reformer.
- **`package.json`** — `version` alignée sur `APP_VERSION` → `3.12.2.0` (désormais maintenue par `commit.sh`).

### Fixed
- **7 warnings ESLint résorbés** — bindings d'erreur `catch` inutilisés (`no-unused-vars`) passés en **catch binding optionnel** `catch { … }` (`notifications.js` ×2, `prix.js`, `stationsmap.js` ×3) ; import `FUEL_KEYS` inutilisé retiré de `carburant.js`.

## [3.12.1.0] — 2026-05-30

### Added
- **Script `commit.sh` (T7)** — script d'aide au versionnement référencé par `CLAUDE.md` mais absent du dépôt. Enchaîne : vérification du message → `npm run lint` → `npm test` (vitest) → `git add -A` → `git commit` → `git pull --rebase origin <branche>` → `git push`. Abandonne proprement si le message manque, si l'arbre est propre, ou si lint/tests échouent (gate qualité). Usage : `./commit.sh "feat(scope): description [vX.Y.Z.W]"`.

### Fixed
- **Doublon de carburant `ticket.js`** — la table `FUEL_LABEL_MAP` déclarait deux fois la clé `'sp 95-e10'` (`no-dupe-keys`) ; doublon supprimé (mappage `→ E10` inchangé).
- **Lint propre — gate `commit.sh` opérationnel** — le dépôt comptait 43 erreurs ESLint qui auraient bloqué `commit.sh`. Corrections sans impact comportemental :
  - `eslint.config.js` : ajout des globals navigateur manquants `Option` et `sessionStorage`.
  - `ticket.js` : retrait des `\` inutiles **à l'intérieur de classes de caractères** des regex OCR (`[,\.]`→`[,.]`, `[\/\-]`→`[/-]`, `[\/\\|Il]`→`[/\\|Il]`) — strictement équivalents.
  - `geo.js`, `historique.js` : blocs `catch {}` vides annotés (`no-empty`).

## [3.12.0.0] — 2026-05-30

### Added
- **Station favorite (W36)** — dans la vue Carte, une station habituelle devient « favorite » (badge ⭐) à partir de `FAVORITE_MIN_PLEINS` pleins (défaut 4, configurable dans `config.js`), distinct du ★ « meilleur prix ». Nouveau bouton de tri **💶 Prix ↔ ⭐ Fréquentation** au-dessus de la liste, choix persisté (`STATION_SORT_KEY`). `computeStationAverages` inchangée ; tri d'affichage appliqué dans `renderStationsCard` (`stationsmap.js`). Pistes retenues (a)+(c) ; le favori manuel épinglé (b) reste en roadmap (W53).
- **Écran d'accueil à tuiles (W43)** — 6ᵉ vue `#/accueil` : 5 grandes tuiles cliquables (Saisie, Stats, Carte, Historique, Réglages) + 2 raccourcis (« Nouveau plein », « Dupliquer le dernier ») ; bouton 🏠 dans le header pour y revenir. La vue de départ reste la Saisie ; l'accueil est hors séquence d'onglets (`index.html`, `router.js`, `main.js`).
- **Gestes de navigation — swipe (W44)** — `js/swipe.js` : balayage horizontal gauche/droite (pointer events tactile/stylet) pour passer d'une vue à l'autre selon l'ordre des onglets (`SWIPE_ORDER`), avec transition latérale directionnelle (`view--slide-next` / `view--slide-prev`). Garde-fous : geste nettement horizontal, zones interactives ignorées (cartes, formulaires, sélecteurs), bord gauche réservé au « retour » natif.
- **Badges de notification sur les onglets (W45)** — `js/badges.js` : pastille sur ⚙️ Réglages (alertes non configurées), compteur sur 📜 Historique (pleins importés non consultés, persistant — se vide à l'ouverture), pastille sur 🗺️ Carte (meilleur prix secteur relevé aujourd'hui, se vide à l'ouverture, se réarme chaque jour). Rafraîchi sur `viewchange`, après chargement historique/secteur et changement d'alerte.

### Changed
- **`js/router.js`** — ajout de la vue `accueil`, de `SWIPE_ORDER`, `currentView()`, `navigateRelative()` et de la direction de transition (slide latéral) ; l'événement `viewchange` est désormais aussi consommé par les badges.
- **`js/config.js`** — `APP_VERSION` → `3.12.0.0` ; ajout `STATION_SORT_KEY`, `HIST_SEEN_KEY`, `CARTE_SEEN_KEY`, `FAVORITE_MIN_PLEINS`.
- **`css/style.css`** — styles `.smap-sort*`, `.home-btn`, `.home-tiles`/`.home-tile`, `.home-shortcut*`, `.view--slide-*`, `.nav-badge*`.

## [3.11.0.1] — 2026-05-30

### Fixed
- **Nettoyage ESLint** — `js/stats.js` : bloc `catch {}` vide commenté (`no-empty`) ; `js/main.js` : retrait de l'import `resetForm` inutilisé (`no-unused-vars`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.11.0.1`.

## [3.11.0.0] — 2026-05-30

### Added
- **Budget carburant mensuel (W39)** — objectif € configurable dans ⚙️ Réglages (`#budgetMensuel`, clé `suivi_e85_budget_mensuel`).
  - `js/stats.js` : `getBudgetMensuel()` + `buildBudgetBar()` affiche une **barre de progression** dans la carte Stats comparant la dépense du **mois en cours** (véhicule sélectionné, réutilise `buildMonthlyReport`) à l'objectif ; 3 états — vert (< 80 %), orange (≥ 80 %), **rouge + « ⚠️ +X € au-dessus »** au dépassement. `initBudgetSetting()` câble le champ (vide = désactivé).
  - Alerte **visuelle uniquement** (zéro permission, zéro réseau).
- **Empreinte CO₂ E85 vs essence (W40)** — tuile « 🌱 X kg CO₂ évités » dans la carte Stats.
  - Référence essence **SP95-E10 ≈ 2,21 kg CO₂/L** ; E85 ≈ **−50 % à la combustion** (`config.js` : `CO2_ESSENCE_PER_L`, `CO2_E85_RATIO`, `CO2_E85_PER_L`).
  - Calcul **à distance égale** : litres essence équivalents = litres E85 / (1 + surconsommation dynamique), `CO₂ évité = essenceEquiv × CO2_ESSENCE − litresE85 × CO2_E85` (cumul de tous les pleins E85). Méthodologie affichée en sous-texte.
- **Comparaison entre véhicules (W41)** — nouveau module `js/comparatif.js` + carte `#comparatifCard` (vue Stats).
  - `computeVehicleComparison()` agrège **tous les véhicules** de l'historique : conso (L/100 km) et coût (€/100 km) ; barres horizontales normalisées (SVG/CSS pur, aucune librairie), véhicule courant surligné, « plus économe » mis en avant. Masquée tant que **< 2 véhicules** ont des données exploitables. `renderComparatif()` appelée depuis `renderStats()` (toujours à jour).
- **Tests des modules récents (T6)** — `jsdom` ajouté (devDependency) ; environnement `// @vitest-environment jsdom` par fichier.
  - `tests/itineraire.test.js` (10 cas) : popup station, liens Waze/Google Maps, échappement HTML, distance, fermetures (Échap / fond / ×), remplacement.
  - `tests/notifications.test.js` (13 cas) : seuils (défauts, bornes), activation par carburant, déclenchement foreground `checkPrixAlert` (Notification mockée).
  - `tests/stationsmap.test.js` (10 cas) : `computeStationAverages` (moyennes, tri, filtre carburant, robustesse) + `cacheStationCoords` (`getAllRecords` mocké). **71 tests au total, tous au vert.**

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.11.0.0` ; ajout `BUDGET_KEY` + constantes CO₂.
- **`js/stats.js`** — `computeStats` retourne `co2Evite` / `totLitresE85` ; `renderStats` insère tuile CO₂ + barre budget + déclenche le comparatif.
- **`css/style.css`** — styles `.co2-tile`, `.budget-box`/`.budget-fill`, `.cmp-*` (+ dark mode).
- **`package.json`** — `version` → `3.11.0.0`, `jsdom` en devDependencies.

## [3.10.0.0] — 2026-05-30

> ⚠️ **Redéploiement Google Apps Script requis** (3 fichiers) — voir `Google Apps Script/GAS_UPDATE.md` § v3.10.0.0. Sans redéploiement, l'E85 continue de fonctionner ; Gazole/SP98 (secteur + push) restent inactifs.

### Added
- **« Moins cher du secteur » par carburant (W48)** — le relevé quotidien GAS (~7h) couvre désormais **E85, Gazole et SP98**.
  - `RefreshPrix.gs` : boucle sur les 3 carburants (`fetchPricesForVille_` + `scanGeoAllFuels_`, 1 requête API par ville / par scan géo), log dans `_PrixHistory` avec le bon `Type`, `SECTOR_BEST_TODAY` / `LAST_LOW_PRICES` deviennent des objets **par carburant**.
  - `Code.gs` : `?action=sectorPrices&fuel=E85|GAZOLE|SP98` (défaut E85) + nouvelle `?action=lowprices` (meilleurs prix du jour par carburant, lue par le Service Worker).
  - Front : la **vue Carte** affiche « 🏆 Moins cher du secteur » pour le carburant du sélecteur (W47), prix live — utile même sans historique de pleins. `js/secteur.js` gère un cache par carburant (E85 garde l'ancienne clé/comportement pour la carte Saisie et l'écart par plein).
- **Alertes push par carburant (W49)** — l'alerte prix bas planifiée passe de l'E85 seul à **un interrupteur + un seuil indépendants par carburant** (E85/Gazole/SP98).
  - Réglages : 3 lignes toggle + seuil (générées par `js/notifications.js`, conteneur `#notifFuelRows`) ; seuils par défaut 0,850 / 1,600 / 1,800 €/L.
  - `WebPush.gs` : `envoyerPushPrixBasMulti(best)` réveille un abonné dès qu'un carburant passe sous **son** seuil ; `_PushSubs` gagne 3 colonnes `SeuilE85/SeuilGazole/SeuilSP98` (migration automatique, colonne `Seuil` héritée = E85).
  - `public/sw.js` : à la réception du push, lit `?action=lowprices` + les seuils mis en cache par l'app (`caches['suivi-prefs']['/_push_thresholds']`) et affiche **une notification par carburant** sous son seuil ; clic → vue Carte.
  - Alertes **foreground** (app ouverte) généralisées aux 3 carburants (`prix.js` → `checkPrixAlert(fuel, prix, station)`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.10.0.0`.
- **`eslint.config.js`** — globals navigateur ajoutés (`Response`, `caches`, `Notification`, `atob`) : corrige aussi des `no-undef` préexistants.

### Migration
- `_PrixHistory` : aucune (colonne `Type` déjà présente). `_PushSubs` : colonnes seuils ajoutées au 1er ré-abonnement. Anciens lecteurs E85 (`?action=lowprice`, format plat) toujours servis.

## [3.9.0.0] — 2026-05-30

### Added
- **Sélecteur de carburant sur la vue Carte (W47)** — la carte des stations habituelles n'est plus limitée à l'E85 : un sélecteur **E85 / Gazole / SP98** en haut de la carte bascule le classement et la mini-carte affichés.
  - `js/stationsmap.js` : `computeStationAverages(fuelKey)` paramétré par carburant (matcher tolérant `_fuelMatch` : `e85/ethanol`, `gazole/diesel/gasoil`, `sp98/super 98`) ; titre, libellés et popup d'itinéraire dynamiques selon le carburant choisi.
  - **Défaut intelligent** : le carburant présélectionné est celui du **dernier plein du véhicule courant** (`_defaultFuelForVehicle`), repli E85. Le choix se ré-évalue quand on change de véhicule (`renderStationsCard` appelée depuis `onVehiculeChange`), sauf si l'utilisateur a explicitement cliqué le sélecteur dans la session.
  - Quand un carburant n'a aucun plein pour ce véhicule, la carte reste visible avec le sélecteur et affiche « Aucun plein <carburant> enregistré pour ce véhicule » (la carte n'est masquée que si **aucun** des 3 carburants n'a de station habituelle).
  - `css/style.css` : segmented control `.smap-fuel-sel` / `.smap-fuel-btn` (+ dark mode) et message `.smap-empty`.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.9.0.0`.

> ℹ️ Étapes suivantes possibles pour couvrir pleinement Gazole/SP98 (non incluses ici) : carte « moins cher du secteur » par carburant (backend `RefreshPrix.gs` + `secteur.js`) et alertes push par carburant (seuils indépendants).

## [3.8.0.0] — 2026-05-30

### Added
- **Pull-to-refresh — tirer vers le bas pour recharger (W46)** — `js/pullrefresh.js` (nouveau) : en haut de page, un **tir vers le bas** affiche un indicateur circulaire (↻) qui suit le doigt avec résistance ; au-delà du seuil (70 px), le relâchement **recharge l'application** (`window.location.reload()`). Conçu surtout pour la **PWA standalone iOS**, où Safari n'offre aucun pull-to-refresh natif (et où `body { overscroll-behavior-y: none }` coupe déjà le rebond).
  - Activé **uniquement sur appareils tactiles** (`'ontouchstart' in window`) — aucun effet au pointeur/souris.
  - `touchmove` non passif pour bloquer le scroll/overscroll natif pendant le geste ; **n'interfère pas** avec le défilement (déclenché seulement quand la page est tout en haut) ni avec les conteneurs à défilement interne (détection d'un ancêtre `overflow-y` encore défilable) ni avec la **carte interactive** `#stationMap` (exclue pour préserver le panoramique).
  - `css/style.css` : indicateur `.ptr` (fixe, safe-area iPhone, spinner `ptrSpin`, état « armé » en vert), respect de `prefers-reduced-motion`.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.8.0.0`.

## [3.7.0.0] — 2026-05-30

### Added
- **Navigation par vues — onglets + pages (W42)** — fin du long scroll unique : l'application est désormais découpée en **5 vues** présentées comme des pages, accessibles via une **barre d'onglets fixe en bas** (style appli native) :
  - ⛽ **Saisie** (vue par défaut au démarrage) : formulaire, véhicule, carburant, scan ticket, station, comparateur (W30), secteur (W38), bouton « Enregistrer ».
  - 📊 **Statistiques** : stats live (W7), rapport mensuel (X16), bilan annuel « Wrapped » (W37).
  - 🗺️ **Carte** : carte des stations habituelles + prix moyens (X10).
  - 📜 **Historique** : 5 derniers pleins + historique complet filtrable (W32).
  - ⚙️ **Réglages** : notifications, mode hors-ligne, prix du kit.
  - `js/router.js` (nouveau) : routeur léger par **hash** (`#/saisie`, `#/stats`, `#/carte`, `#/historique`, `#/params`). Le **bouton retour** du navigateur et de l'OS fonctionne nativement (chaque vue a son URL) ; aucun fallback serveur nécessaire (compatible GitHub Pages). Onglet actif surligné (`aria-current="page"`), titre du header mis à jour par vue, remontée en haut à chaque changement de page.
  - Le bouton 📋 « Dupliquer le dernier plein » (vue Historique) bascule automatiquement vers la vue Saisie pour montrer le formulaire pré-rempli.
  - La carte statique des stations, rendue hors écran, est **re-cadrée** au premier affichage de l'onglet Carte (événement `viewchange`) pour un dimensionnement correct.

### Changed
- **`index.html`** — cartes regroupées dans `<main>` sous 5 `<section class="view" data-view="…">` ; ajout de la `<nav class="bottom-nav">` (5 onglets) ; `#feedback` et le bouton submit déplacés dans la vue Saisie.
- **`css/style.css`** — styles `.view` / `.view--active` (transition d'entrée, respect de `prefers-reduced-motion`), `.bottom-nav` + `.nav-tab` (fixe, safe-area iPhone), variable `--nav-h` ; le bouton submit colle désormais **au-dessus** de la barre d'onglets ; `padding-bottom` du body ajusté.
- **`js/config.js`** — `APP_VERSION` → `3.7.0.0`.

## [3.6.0.0] — 2026-05-30

### Added
- **Token secret sur les endpoints GAS (S6)** — sécurise les appels au backend (l'URL GAS étant publique, tout le monde pouvait lire/écrire l'historique).
  - `Code.gs` : helper `tokenOk_(e, payload)` + `unauthorizedResponse_()`. **Mode souple** : le contrôle ne s'active que si la **propriété de script** `APP_TOKEN` est définie côté Apps Script — tant qu'elle n'est pas posée, tout fonctionne sans token (rétrocompatible, aucun déploiement bloquant). Une fois posée, chaque requête de données doit fournir le même token (`?token=` en GET, champ `token` du JSON en POST). La **page HTML** reste servie sans token.
  - `js/config.js` : nouvelle constante `APP_TOKEN`, injectée dans tous les appels GAS (`formulaire.js`, `offline.js`, `ticket.js`, `notifications.js`, `stations.js`, `historique.js`, `geo.js`).
  - `vba/modSyncGS.bas` : constante `APP_TOKEN` ajoutée au GET `?action=export` et aux POST `bulkAdd` / `bulkUpdate` / `syncStations`.
  - ⚠️ Sécurité par obscurité : le token, présent dans le bundle public (GitHub Pages), relève le niveau d'accès mais n'est pas un secret cryptographique. **Activation** : coller la valeur d'`APP_TOKEN` dans les Propriétés du script GAS (clé `APP_TOKEN`) — la même que `js/config.js` et `vba/modSyncGS.bas`.
- **Bilan annuel « Wrapped » (W37)** — nouvelle carte `#wrappedCard` + module `js/wrapped.js` : récap d'une année (litres totaux, € dépensés, km parcourus, économie E85 cumulée vs SP98, station préférée, mois le plus cher). **Sélecteur d'année** (années présentes dans l'historique) + **bascule de périmètre** 🏍️/🚗🏍️ (véhicule courant ↔ tous véhicules, persistée). Le périmètre « véhicule » suit le véhicule sélectionné en haut de page. Km parcourus = somme des deltas max−min par véhicule ; économie alignée sur la méthode du dashboard (surconsommation E85 dynamique).
- **Prix payé vs moins cher du secteur (W38)** — pour chaque plein E85, l'historique affiche « 💸 +X €/L vs le moins cher du secteur (Y €/L) » ou « ✅ Au meilleur prix du secteur ».
  - `RefreshPrix.gs` : le relevé quotidien (~7h) complète les stations curées par un **scan des stations E85 les moins chères dans 15 km autour de la dernière position connue** (`fetchCheapestE85AroundGeo_`), logue le tout dans `_PrixHistory` et mémorise le meilleur prix du jour (`SECTOR_BEST_TODAY`).
  - `Code.gs` : action `saveLastGeo` (mémorise la dernière position connue, propriété `LAST_GEO`) + action `sectorPrices` (renvoie le prix E85 mini du secteur **par jour** depuis `_PrixHistory`, et le meilleur prix du jour).
  - `js/geo.js` : la géolocalisation pousse la position au serveur (fire-and-forget) pour alimenter le scan.
  - `js/secteur.js` (nouveau) : charge le snapshot (cache localStorage 2 h), fournit `getSectorMinForDate()` à l'historique et rend la carte « 🏆 Moins cher du secteur » (`#secteurCard`).
  - Comportement **prospectif** : l'écart n'apparaît que pour les pleins dont le jour a un relevé secteur (à partir du 1er refresh ~7h après déploiement) ; les pleins antérieurs restent neutres.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.6.0.0` ; nouvelles clés `SECTOR_CACHE_KEY`, `WRAPPED_SCOPE_KEY`, `APP_TOKEN`.

## [3.5.0.1] — 2026-05-30

### Fixed
- **Clic sans effet sur les marqueurs de la carte « stations habituelles »** (Windows + iPhone) (`css/style.css`) : la règle de base `.smap-marker { pointer-events: none; }` (héritée de l'époque où ces marqueurs n'étaient pas interactifs) laissait les clics traverser vers les tuiles OSM, donc la popup d'itinéraire S11 ne s'ouvrait jamais. Ajout de `pointer-events: auto` sur `.smap-marker`. La carte recherche/géoloc n'était pas concernée.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.5.0.1`.

## [3.5.0.0] — 2026-05-30

### Added
- **Itinéraire vers une station au clic sur un marqueur (S11)** — nouveau module `js/itineraire.js` (`showStationPopup`). Au clic sur un marqueur — **carte des stations habituelles** (`js/stationsmap.js`) **ou** carte des recherches par **géolocalisation / saisie manuelle** (`js/carte.js` → `selectStationFromMap`) — une **popup** affiche les renseignements de la station (nom, prix, distance depuis la position connue, adresse si disponible) puis **demande** l'itinéraire (« Obtenir l'itinéraire vers cette station ? »). Deux boutons : **🚗 Itinéraire Waze** (`https://waze.com/ul?ll=<lat>,<lon>&navigate=yes`, trajet depuis la position GPS de l'utilisateur) et **🗺️ Google Maps** en repli (`maps/dir/?api=1&destination=…`) si Waze n'est pas installé. Le clic sur le bouton sert de **confirmation explicite** avant de lancer l'app de navigation.
  - `js/stationsmap.js` : marqueurs `.smap-marker` rendus cliquables (`data-smap-idx`) + `initStationsMapInteractions()` (délégation sur la card `#stationsMapCard`).
  - `js/main.js` : `selectStationFromMap()` ouvre désormais la popup en plus de la sélection ; init de `initStationsMapInteractions()`.
  - `css/style.css` : styles `.stpop-*` (overlay modal, boutons Waze/Maps, dark mode).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.5.0.0`.

## [3.4.0.5] — 2026-05-30

### Fixed
- **Carte habituelles — marqueur d'une station placé sur une ville homonyme** (`js/stationsmap.js`) : le géocodage prenait le **1er résultat** de l'API pour la ville extraite du nom (ex. « Carrefour - Flers » → plusieurs « Flers » en France : Orne, Escrebieux…), plaçant parfois le marqueur à des centaines de km (hors carte, ex. constaté sur iPhone). Désormais le candidat retenu est le **plus proche d'un point de référence** (position de l'utilisateur, sinon barycentre des stations choisies à la main). Les coordonnées auto-géocodées **aberrantes** déjà en cache (> 80 km de la référence) sont **re-géocodées automatiquement** ; les coordonnées choisies manuellement (`src:'pick'`) restent intactes. `cacheStationCoords()` gagne un paramètre `src` (`'pick'`/`'geo'`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.4.0.5`.

## [3.4.0.4] — 2026-05-30

### Added
- **Carte « Stations habituelles » — marqueur de la position de l'utilisateur** (`js/stationsmap.js` + `css/style.css`) : pastille bleue avec **icône du véhicule courant** (🏍️ moto / 🚗 voiture, déduite du nom du véhicule via `_vehicleIcon`). Position récupérée depuis `state.userLat/userLon` (bouton 📍) ou demandée une fois en arrière-plan (`_ensureUserPos`). Le cadrage de la carte inclut désormais la position pour qu'elle reste visible avec les stations.

### Changed
- **Push prix E85 — seuil propre à chaque appareil (S10)** (`RefreshPrix.gs` + `WebPush.gs`) : `envoyerPushPrixBas()` n'envoie à un abonné que si le prix ≤ **son** seuil (colonne `Seuil` de `_PushSubs`, alimentée par le réglage du toggle dans l'app), avec repli sur la propriété `SEUIL_PUSH_E85` puis `SEUIL_PUSH_E85_DEFAULT`. Un seul réglage (toggle de l'app) pilote alertes locales **et** push. `testEnvoyerPush()` force l'envoi (ignore le seuil).
- **`js/config.js`** — `APP_VERSION` → `3.4.0.4`.

## [3.4.0.3] — 2026-05-30

### Changed
- **Carte « Stations E85 habituelles » — marqueurs ⛽ distinctifs + cadrage fiable** (`js/stationsmap.js` + `css/style.css`) : nouveau marqueur en **goutte verte E85 avec icône ⛽** (classes `.smap-marker` / `.smap-marker-pin`) à la place de l'ancien point. Moteur de rendu réécrit pour **centrer sur l'empreinte des marqueurs** (et non plus sur la grille de tuiles) et choisir le zoom qui les fait **tous tenir** dans la carte — corrige le cas où un marqueur tombait sous la zone visible (`top` > hauteur de la carte) et restait invisible.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.4.0.3`.

## [3.4.0.2] — 2026-05-30

### Fixed
- **`WebPush.gs` — `ReferenceError: navigator is not defined`** au chargement de jsrsasign (`generateVapidKeys()` / `envoyerPushPrixBas()`) : la librairie référence `navigator`/`window` (globals navigateur) absents en GAS. Ajout de **shims** `var navigator = {…}; var window = {};` juste avant `eval(src)` (scope partagé par l'`eval` direct).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.4.0.2`.

## [3.4.0.1] — 2026-05-30

### Fixed
- **`WebPush.gs` — « parse error : unexpected token illegal » à l'enregistrement** : Apps Script (V8) **ne supporte pas `BigInt`** ; les littéraux `…n` de l'implémentation P-256 maison cassaient le script. Signature ECDSA **ES256/P-256 déléguée à la librairie [jsrsasign](https://github.com/kjur/jsrsasign)** chargée à la volée depuis cdnjs (`eval`) — `KEYUTIL.generateKeypair` pour `generateVapidKeys()`, `KJUR.jws.JWS.sign('ES256', …)` pour le JWT VAPID. Plus aucun `BigInt`.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.4.0.1`.

## [3.4.0.0] — 2026-05-30

### Added
- **Refresh quotidien des prix (S8)** — nouveau `Google Apps Script/RefreshPrix.gs` : trigger temporel `ScriptApp.newTrigger('refreshPrixCarburants').timeBased().everyDays(1).atHour(7)` qui parcourt l'onglet `Stations`, extrait la ville de chaque nom (`Enseigne - Ville`), fetch le prix **E85 le plus bas** de la ville via l'API gouv (`order_by=e85_prix asc`), et logue chaque résultat dans un nouvel onglet **`_PrixHistory`** (Station, Date, Type, Prix €/L). `installerTriggerRefreshPrix()` (une fois) + `testRefreshPrix()`.
- **Notification push depuis GAS (S10)** — nouveau `Google Apps Script/WebPush.gs` : **Web Push VAPID sans payload** (RFC 8030). JWT **ES256 / courbe P-256** signé via la librairie **jsrsasign** (cf. correctif 3.4.0.1). Quand `refreshPrixCarburants()` détecte un prix E85 ≤ seuil (`SEUIL_PUSH_E85`, défaut 0,700 €/L), il mémorise le meilleur prix (`LAST_LOW_PRICE`) et appelle `envoyerPushPrixBas()` → push à tous les abonnés, **app fermée**. `generateVapidKeys()` (une fois) génère la paire et stocke la privée dans les Propriétés du script.
  - Côté client (`js/notifications.js`) : `registerPushSubscription()` s'abonne au `PushManager` (clé `VAPID_PUBLIC_KEY`) et envoie l'abonnement à GAS (`action=savePushSub`, stocké dans l'onglet `_PushSubs`) à l'activation des alertes, au démarrage et au changement de seuil ; `unregisterPushSubscription()` au désabonnement.
  - Service Worker (`public/sw.js`) : handlers `push` (push sans payload → `fetch ?action=lowprice` pour enrichir la notification avec station + prix) et `notificationclick` (focus/ouverture de l'app).
  - `Code.gs` : routes `doPost action=savePushSub` (→ `handleSavePushSub`) et `doGet ?action=lowprice`.

### Changed
- **Renommage « Suivi E85 » → « Suivi Conso. Carburants »** :
  - Rapport mensuel envoyé (`RapportMensuel.gs`) — sujet de l'e-mail, nom de l'expéditeur (`name`) et en-têtes HTML (`<h2>`).
  - App / page web — `<title>`, `apple-mobile-web-app-title`, `footer` (`index.html` + miroir GAS), `name`/`short_name`/`description` du `manifest.json`, `setTitle()` de `Code.gs`.
- **`js/config.js`** — `APP_VERSION` → `3.4.0.0` ; nouvelle constante `VAPID_PUBLIC_KEY` (vide par défaut → push désactivé, alertes locales conservées).

### Fixed
- **Carte « Stations E85 habituelles » — marqueurs invisibles** (`js/stationsmap.js`) : seules les stations dont les coordonnées étaient en cache (sélectionnées via géoloc) apparaissaient ; les stations saisies autrement n'avaient aucun marqueur. Ajout d'un **géocodage de secours** (`_geocodeMissing`) — la ville est extraite du nom de station, résolue via l'API gouv, mise en cache, puis la carte est re-rendue avec tous les marqueurs.

### Note
- Le **rapport mensuel est consultable dans l'app** depuis la v3.3.0.x (carte « 📅 Rapport mensuel » avec sélecteur de mois, `js/stats.js` `renderRapportMensuel`) ; le mois y est déjà au format « nom propre » (ex. « Avril 2026 »).

## [3.3.0.11] — 2026-05-30

### Fixed
- **Rapport mensuel — « Économie E85 vs SP98 » à 0 €** (`RapportMensuel.gs`) : le prix SP98 de repli n'était calculé que sur les pleins E85 **du mois** ; un mois sans prix SP98 renseigné donnait une économie nulle. Désormais calculé sur **tout l'historique**, avec deux sources (prix SP98 relevé des pleins E85 + prix payé des pleins Super 98, dont le prix est un prix SP98) — aligné sur l'app web / le `Tableau2` Excel.
- **Rapport mensuel — mois en anglais** : `Utilities.formatDate(..., 'MMMM yyyy')` suivait la locale (anglaise) du script → « April 2026 ». Nouvelle fonction `moisEnFrancais()` (libellé FR en dur, ex. « avril 2026 »), indépendante de la locale.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.11`.

## [3.3.0.10] — 2026-05-30

### Fixed
- **`SyncTableau2DepuisGS` : position de ligne robuste** (`vba/modFeatures.bas`) — le `ROW()-15` codé en dur (en-tête supposé ligne 15) cassait si la table `Tableau2` était décalée. Remplacé par `ROW()-ROW(Tableau2[#Headers])` (position calculée dynamiquement, sans numéro de ligne en dur). La formule est posée via `.Formula` (séparateurs US auto-traduits par Excel selon la locale) — ne pas la taper à la main en Excel français (séparateurs `;` + noms `SIERREUR`/`LIGNE`/`[#En-têtes]` requis).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.10`.

## [3.3.0.9] — 2026-05-30

### Added
- **`Tableau2` (Suivi Carburant) = vue dérivée de `GS_Pleins`** (`vba/modFeatures.bas` `SyncTableau2DepuisGS`) : les 6 colonnes **brutes** (Date, Type, Km compteur, Nb. Litres, Prix €/L, Station essence) sont tirées de `GS_Pleins` par formules `INDEX` ; les 9 colonnes de **calcul** (N°, Nb. km, Coût c€/km, Coût Plein, Conso L/100km, Prix S98 jour, Coût équiv. S98, Économie plein, Économie cumulée) sont **conservées intactes**. Le nombre de lignes de `Tableau2` est aligné sur `GS_Pleins`. L'onglet « Suivi Carburant » est conservé. Appelé par `RafraichirFeatures` **et** automatiquement après chaque `EnregistrerPlein` (les deux formulaires).
- **`VerifierInstallation`** (`vba/modFeatures.bas`) : contrôle la présence des feuilles/tableaux requis (`GS_Pleins`, `Suivi Carburant`/`Tableau2`, `Notes`/`tbl_stationEssence`, `Vehicules`, `Suivi (auto)`) et affiche le bilan dans la barre d'état + l'Immediate Window.
- **`INSTALL.md`** : récapitulatif complet d'installation/mise à jour (modules VBA, formulaires, GAS, vérification, schéma d'architecture des données).

### Changed
- **`modSaisie.EnregistrerPlein`** déclenche `modFeatures.SyncTableau2DepuisGS` en fin d'enregistrement (vue `Tableau2` toujours à jour, zéro double saisie).
- **`js/config.js`** — `APP_VERSION` → `3.3.0.9`.

## [3.3.0.8] — 2026-05-30

### Added
- **`frmNouveauPlein` — sélecteur de véhicule multi-véhicules** (`cmbVehicule`) : peuplé par `modSaisie.RemplirCombo` (feuille `Vehicules` ∪ valeurs distinctes de `GS_Pleins` col H), pré-sélection du dernier véhicule utilisé (`DernierVehicule`). Le véhicule choisi est enregistré en col H de `GS_Pleins` ; validation « Choisissez un véhicule » ajoutée.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.8`.

## [3.3.0.7] — 2026-05-30

### Added
- **`vba/frmNouveauPlein.frm` + `.frx`** versionnés dans le repo (formulaire de saisie personnalisé de l'utilisateur, présentation conservée).
- **`modSaisie.EnregistrerPlein` — paramètre optionnel `prixS98Str`** → écrit le prix SP98 du jour dans la colonne **J « SP98 station (€/L) »** de `GS_Pleins` (rétro-compatible : `frmPleinE85` ne le fournit pas).
- **`modSaisie.DernierVehicule()`** — renvoie le véhicule du dernier plein de `GS_Pleins` ; sert de valeur par défaut aux formulaires sans sélecteur de véhicule.

### Changed
- **`frmNouveauPlein` enregistre désormais au même endroit que `frmPleinE85`** : le bouton « Enregistrer » écrit dans **`GS_Pleins`** (via `modSaisie.EnregistrerPlein`, avec `Horodatage` + `sync_id` UUID + détection de doublon) **au lieu de** `Suivi Carburant`/`Tableau2`. Le prix S98 du jour va en col J, le véhicule = dernier connu. Présentation, formatage de date, coût live et chargement des stations (`Notes`/`tbl_stationEssence`) **inchangés**.
- **`js/config.js`** — `APP_VERSION` → `3.3.0.7`.

## [3.3.0.6] — 2026-05-30

### Fixed
- **Formulaire de saisie : « Erreur de compilation : Instruction d'option dupliquée »** (`vba/modSaisie.bas`) — quand le VBE a « Déclaration des variables obligatoire » activé, le module de code du UserForm `frmPleinE85` nouvellement créé contient déjà un `Option Explicit`, et `InjecterCode` en ajoutait un second. Correctif : le module de code est vidé (`DeleteLines`) avant `AddFromString`, garantissant un seul `Option Explicit`.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.6`.

## [3.3.0.5] — 2026-05-30

### Fixed
- **MFC « Prix €/L » : « Colonnes introuvables sur GS_Pleins »** (`vba/modFeatures.bas`) — `DetecterColonnes` exigeait des en-têtes exacts (`date`, `type`) et un prix contenant `/l`. Détection assouplie : Date = `date` ou contient « date » (hors « horodatage ») ; Type = contient « type » ou « carburant » ; Prix = contient « prix » (hors station/S98/SP98), priorité aux en-têtes avec « /l » et repli sinon. Plage de scan élargie (25 lignes × 40 colonnes).
- **Diagnostic d'échec amélioré** — en cas de non-détection, l'Immediate Window (Ctrl+G) liste désormais les index trouvés (Date/Type/Prix) **et** le contenu réel de la ligne d'en-tête (helper `ListerEntetes`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.5`.

## [3.3.0.4] — 2026-05-30

### Changed
- **Barre d'état généralisée + réutilisation du helper existant** : tous les `MsgBox` non bloquants des modules VBA convertis en `Application.StatusBar` via le helper **public `SetStatus`** déjà présent dans `ModuleImportGS.bas` (suppression du doublon `Statut` créé en v3.3.0.3 dans `modFeatures.bas`).
  - `modFeatures.bas` : appelle désormais `SetStatus` (plus de helper local).
  - `modSaisie.bas` : erreur + message « Plein enregistré » → barre d'état.
  - `modDashboard.bas` : 7 messages (feuille/tableau absent, bilan KPIs, données absentes, « Graphiques mis à jour ») → barre d'état.
  - `ModuleImportGS.bas` : messages d'import, nettoyage doublons, réseau/HTTP et diagnostic → barre d'état ; `Fin:` ne réinitialise plus la barre pour laisser le message final/erreur visible.
  - `GS_Pleins_snippet.bas` : alertes inline km rétrograde [F3] et doublon [F4] → barre d'état (condensées sur une ligne).
- **`MsgBox` conservés uniquement pour les décisions/gates bloquants** : confirmation doublon (Oui/Non), confirmation « Réinitialiser l'import ? » (Oui/Non), et instructions d'activation de l'« Accès au modèle objet VBA ».
- **`js/config.js`** — `APP_VERSION` → `3.3.0.4`.

## [3.3.0.3] — 2026-05-30

### Changed
- **Messages en barre d'état plutôt que MsgBox** (`vba/modFeatures.bas`) : tous les `MsgBox` (succès, erreurs non bloquantes) remplacés par un helper `Statut` qui écrit dans `Application.StatusBar` (retour discret, non bloquant, sans clic). `RafraichirFeatures`, `AppliquerMFCPrix` et `CreerSuiviAuto` n'interrompent plus le flux.
- **`js/config.js`** — `APP_VERSION` → `3.3.0.3`.

## [3.3.0.2] — 2026-05-30

### Fixed
- **MFC « Prix €/L » — Erreur 5 « Argument ou appel de procédure incorrect » en Excel français** (`vba/modFeatures.bas`) : `FormatConditions.Add` interprète `Formula1` selon les paramètres régionaux ; la formule `AVERAGEIFS`/`AND` construite avec des virgules (séparateur US) était rejetée. Ajout des helpers `AjouterRegleMFC` (essaie la formule anglaise puis sa version localisée en repli) et `TraduireFormuleLocale` (traduction via `FormulaLocal` d'une cellule tampon). MFC désormais robuste FR/US, sans crash.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.2`.

## [3.3.0.1] — 2026-05-30

### Changed
- **`README.md`** — bloc `oauthScopes` du manifeste `appsscript.json` complété pour le rapport mensuel (X16) : ajout de `script.scriptapp` (déclencheurs), `script.send_mail` (`MailApp.sendEmail`) et `userinfo.email` (`Session.getEffectiveUser`), + tableau récapitulatif scope → usage.
- **`js/config.js`** — `APP_VERSION` → `3.3.0.1`.

### Fixed
- **Doc dépannage** — nouvelle entrée pour l'erreur `Specified permissions are not sufficient to call ScriptApp.getProjectTriggers` rencontrée à l'exécution de `installerTriggerRapportMensuel()` : cause (scopes figés non autorisés) + correction en 4 étapes (manifeste → ré-autorisation, sans redéploiement).

## [3.3.0.0] — 2026-05-30

### Added
- **Mise en forme conditionnelle « Prix €/L » (X4)** — `vba/modFeatures.bas` : `AppliquerMFCPrix` colore la colonne Prix en **vert** si le prix de la ligne est inférieur à la moyenne des 30 jours précédents pour le **même carburant**, en **rouge** s'il est supérieur. Appliquée sur `GS_Pleins` **et** `Suivi Carburant` (détection des colonnes Date/Type/Prix par en-tête, formule `AVERAGEIFS` glissante).
- **Onglet « Suivi (auto) » — vue dérivée (X14)** — `vba/modFeatures.bas` : `CreerSuiviAuto` reconstruit une table en **lecture seule** (formules `INDEX` sur le tableau de `GS_Pleins`) : Date, Type, Véhicule, Km, Nb km, Litres, Prix, Coût plein, L/100 km, Station. Source unique de vérité, plus de double saisie. Bouton « ↻ Rafraîchir » intégré ; `RafraichirFeatures` lance MFC + vue d'un coup.
- **Formulaire de saisie d'un plein** — `vba/modSaisie.bas` : `NouveauPlein` construit par code le UserForm `frmPleinE85` (Véhicule/Carburant/Date/Km/Litres/Prix/Station) avec listes déroulantes auto (feuilles `Vehicules`/`Stations` ∪ valeurs distinctes de `GS_Pleins`), coût live, **validation km rétrograde** + **détection de doublon** (date+km+litres), puis ajoute la ligne dans `GS_Pleins` avec `Horodatage` + `sync_id` UUID. `AjouterBoutonSaisie` place un bouton « + Nouveau plein ». Nécessite « Accès approuvé au modèle objet du projet VBA ».
- **Rapport mensuel automatique (X16)** — `Google Apps Script/RapportMensuel.gs` : trigger temporel le **1er du mois** → `MailApp.sendEmail()` avec le bilan du mois écoulé (nb pleins, total €, litres, distance, conso moyenne, économie E85 vs SP98 surconsommation +20 % incluse). `installerTriggerRapportMensuel()` à exécuter une fois ; `testRapportMensuel()` pour tester ; destinataire = compte du script (ou `RAPPORT_EMAIL`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.3.0.0`.

## [3.2.0.1] — 2026-05-29

### Added
- **Champ « Prix du kit E85 » visible dans la carte ⚙️ Paramètres** (`#kitPrix`, style `seuil-row`, sous le seuil d'alerte) — permet d'ajuster le prix du kit qui sert au calcul de l'économie nette. La v3.2.0.0 avait livré la logique mais le champ HTML n'avait pas été inséré (ancre introuvable).

### Fixed
- **`js/config.js`** — `APP_VERSION` → `3.2.0.1`.

## [3.2.0.0] — 2026-05-29

### Added
- **Économie nette E85 (kit déduit)** — ligne « 💰 Économie nette » : économie brute − prix du kit (réplique J31 Excel).
- **Champ « Prix du kit E85 (€) »** dans Paramètres (#kitPrix), localStorage suivi_e85_kit_prix, défaut **514,54 €** (cellule B5).
- **getKitPrix(), computeSurconso(), initKitSetting()** (js/stats.js) ; DEFAULT_SURCONSO, KIT_PRIX_KEY, DEFAULT_KIT_PRIX (js/config.js).

### Changed
- **Calcul économie fidèle au dashboard Excel** (feuille « Suivi Carburant ») : surconsommation E85 dynamique (conso E85 / conso S98 − 1, cellule J7, défaut 20 %), litres SP98 équiv. = litres / (1 + surconso) (corrige ~124 € → ~106 €) ; brute = Σ coût équiv. S98 − Σ coût E85 (J29 − B35 = J30) ; 4e tuile « éco. brute E85 ».

### Fixed
- **js/config.js** — APP_VERSION → 3.2.0.0.

## [3.1.0.13] — 2026-05-29

### Added
- **Sparkline multi-carburant : bouton 🔄 rechargement forcé** — un bouton "🔄" apparaît dans l'en-tête du graphique Prix carburants. Un clic vide le cache localStorage (`suivi_e85_hist_cache` + `suivi_e85_hist_since`) et force un rechargement complet depuis le GAS, garantissant que toutes les colonnes de prix (SP95, E10, Gazole, GPLc) sont à jour.
- **`forceRefreshHistorique()`** (`js/historique.js`) — nouvelle fonction exportée qui purge le cache différentiel et relance `chargerHistorique()`.

### Changed
- **Seuil d'affichage du sparkline abaissé à 1 point** — un carburant (SP95, E10, Gazole, GPLc…) apparaît désormais comme toggle dès qu'il possède **au moins 1 point de donnée** dans l'historique (au lieu de 2), évitant que les données récentes soient invisibles.

### Fixed
- **`js/config.js`** — `APP_VERSION` → `3.1.0.13`.

## [3.1.0.12] — 2026-05-29

### Changed
- **Excel — déduplication immunisée contre les dates** : la clé `PleinKey` ne dépend plus de la date (qui pouvait être mal parsée par l'ancien module et créer des doublons), mais de **`km | litres | prix`**. Le compteur kilométrique étant strictement croissant, il identifie un plein de façon fiable indépendamment du format de date.

### Added
- **`NettoyerDoublons()`** (`vba/ModuleImportGS.bas`) : macro qui supprime les doublons déjà présents dans le tableau *Suivi Carburant* (clé `km|litres|prix`), en conservant la **première occurrence** (la ligne d'origine, bien datée) et en supprimant les copies plus bas (ex. lignes réimportées avec une mauvaise date par l'ancien module). À lancer une fois via `Alt+F8`.

### Fixed
- **`js/config.js`** — `APP_VERSION` → `3.1.0.12`.

## [3.1.0.11] — 2026-05-29

### Fixed
- **Excel — doublons à l'import** : la déduplication reposait sur un repère d'horodatage (`Z1`), or la colonne *Horodatage* du Google Sheet est incohérente (la plupart des lignes n'ont pas d'heure) → repère inexploitable, l'import re-ajoutait des pleins déjà présents. Remplacé par une **déduplication par contenu** (`PleinKey` = `date|km|litres`) : un index des pleins déjà présents dans la table *Suivi Carburant* est construit avant la boucle, et chaque ligne entrante déjà connue est ignorée (y compris les doublons au sein d'un même lot). L'import devient idempotent quel que soit l'état de `Z1`.
- À **réimporter** dans le classeur (`vba/ModuleImportGS.bas`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.1.0.11`.

## [3.1.0.10] — 2026-05-29

### Fixed
- **Excel — dates des pleins importés à `02/01/1900`** : le CSV gviz renvoie la colonne *Date* au format US **avec l'heure** (`5/22/2026 2:00:00`). `ParseGoogleDate` (dans `ModuleImportGS`) ne retirait pas l'heure pour le format à slashes → `CLng("2026 2:00:00")` échouait → date de repli `1900`. De plus la branche « ambiguë » supposait J/M/A alors que gviz renvoie **M/J/A**. Corrigé : suppression de la partie heure (séparateur espace, comme pour `T`) + interprétation M/J/A (mois en premier). Vérifié sur les 10 pleins (dont le cas ambigu `5/4/2026` → 04/05/2026).
- À **réimporter** dans le classeur (`vba/ModuleImportGS.bas`).

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.1.0.10`.

## [3.1.0.9] — 2026-05-29

### Changed
- **Encart « 📵 Mode hors-ligne » affiché uniquement hors-ligne** : auparavant toujours visible dans les Paramètres, il n'apparaît désormais que lorsque l'appareil est réellement hors-ligne (`navigator.onLine === false`), et disparaît au retour du réseau.

### Added
- Feedback « 📵 Hors-ligne » au passage hors-ligne (événement `offline`), en complément du « 🌐 Connexion rétablie » existant.

### Fixed
- **`index.html`** — la ligne `#offlineRow` est `hidden` par défaut.
- **`js/offline.js`** — nouvelle `updateOfflineRow()` (bascule selon `navigator.onLine`) appelée à l'init et sur les événements `online`/`offline`.
- **`js/config.js`** — `APP_VERSION` → `3.1.0.9`.

## [3.1.0.8] — 2026-05-29

### Fixed
- **Excel — « Import échoué : Erreur 13 Incompatibilité de type »** : `ModuleImportGS.ImporterNouveauxPleins` lisait le prix SP98 dans la **colonne 7** (mapping hérité de l'ancienne colonne G « Prix S98 jour » supprimée en v2.3). Or la colonne 7 de l'export est désormais **« Station essence »** (texte) → `ToDouble("E.Leclerc - Beuvry")` levait l'erreur 13 et l'import entier échouait. Conséquence cachée : l'import plantant **avant** l'appel final `SyncStationsVersGoogleSheets`, la liste curée des stations n'était jamais repoussée vers le Google Sheet (d'où sa « disparition »).
- Correctifs (`vba/ModuleImportGS.bas`, à **réimporter** dans le classeur) : (1) le prix SP98 est lu depuis la colonne **détectée par en-tête** (« SP98 station (€/L) »), jamais la colonne 7 ; (2) `ToDouble()` est blindé (`On Error` → 0) et ne peut plus jamais lever d'erreur 13 sur du texte.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.1.0.8`.
- **`vba/ModuleImportGS.bas`** — module exporté du classeur dans le dépôt (était auparavant uniquement interne au `.xlsm`).

## [3.1.0.7] — 2026-05-29

### Added
- **Liste des stations à jour automatiquement (GS ∪ historique + push Excel)** : le menu déroulant « Stations habituelles » se construit désormais à partir de **l'union** des stations curées (feuille « Stations » du Google Sheet) **et** des stations réellement vues dans l'historique des pleins — la liste ne peut donc plus « disparaître ». En parallèle, la synchro Excel (VBA `modSyncGS`) pousse à chaque exécution le tableau `tbl_stationEssence` (onglet *Notes*) vers la feuille « Stations » du GS (action `syncStations`).

### Changed
- **`js/stations.js`** — réécrit : `chargerStations()` mémorise la liste curée (`_gsStations`) ; nouvelle `mergeHistoryStations()` (stations de l'historique) ; `_renderStationOptions()` fusionne, déduplique (insensible à la casse) et trie ; `syncStationSiNouvelle()` met à jour l'état interne.
- **`js/main.js`** — après `chargerHistorique()`, appel de `mergeHistoryStations(getAllRecords()…)`.
- **`vba/modSyncGS.bas`** — nouvelle `PushStationsToGS()` (lit `tbl_stationEssence`, pousse via `syncStations` avec en-tête en ligne 1) + helper `JEsc()` ; appelée dans `SyncCore` (Direction 3) ; bilan enrichi.
- **`js/config.js`** — `APP_VERSION` → `3.1.0.7`.

### Fixed
- Restauration de la liste des 6 stations curées (perdue côté Google Sheet) : `Carrefour - Flers`, `E.Leclerc - Beuvry`, `Intermarché`, `Leclerc - Douai`, `Total Access`, `Total Waziers`.

## [3.1.0.6] — 2026-05-29

### Fixed
- **Suppression d'un plein : « Plein introuvable (sync_id inconnu) »** — `handleDeletePlein()` retrouvait le `sync_id` via un index de colonne codé en dur (14). Or `handleExport()` (qui alimente le `sync_id` côté client) lit la colonne **par son en-tête**. Si la colonne `sync_id` n'est pas exactement en position O, la correspondance échouait. La suppression recherche désormais la colonne `sync_id` par en-tête (repli sur l'index 14) et compare les valeurs après `trim()`. Version backend → `v3.1.0.6`. ⚠️ Nécessite un **redéploiement** de l'application web.
- **`js/config.js`** — `APP_VERSION` → `3.1.0.6`.

## [3.1.0.5] — 2026-05-29

### Added
- **Suppression d'un plein (UI + Google Sheet)** : chaque entrée de l'historique (liste des 5 derniers pleins et historique complet) affiche désormais un bouton 🗑️. Au clic, une confirmation est demandée, puis la ligne correspondante est supprimée dans le Google Sheet `_ImportGS` (action `deletePlein`, recherche par `sync_id` colonne O) ainsi que du cache local et de l'affichage. Les statistiques et la carte des stations sont rafraîchies.

### Changed
- **`js/historique.js`** — bouton 🗑️ (`data-sync-id`) ajouté à `renderItem()` ; nouvelles fonctions `initHistoireDelete()` (délégation sur `#historiqueList` et `#histoireFullList`) et `_renderLists()` (réaffichage après suppression).
- **`js/main.js`** — import et appel de `initHistoireDelete()`.
- **`Code.gs`** — nouvelle action `deletePlein` + fonction `handleDeletePlein(ss, syncId)` (suppression de la ligne par `sync_id`, col O index 14). Version backend → `v3.1.0.5`. ⚠️ Nécessite un **redéploiement** de l'application web.
- **`css/style.css`** — style `.hist-delete` (calqué sur `.hist-share`).
- **`js/config.js`** — `APP_VERSION` → `3.1.0.5`.

## [3.1.0.4] — 2026-05-29

### Added
- **Station reconnue → recherche automatique des prix carburant + format "Enseigne - Ville"** : Gemini renvoie désormais `enseigne` et `ville` séparément. `fillFormFromTicket()` résout la station en 3 temps : (1) si elle existe dans la liste déroulante → sélection + prix GPS ; (2) sinon recherche ODS de la commune (`_findStationInCommune`) → coordonnées de la station → `fetchPricesAtCoords()` peuple les prix sur les boutons carburant ; (3) sinon saisie manuelle avec le nom composé via `composeStationName()` (ex. « Carrefour - Flers »). Fini le message « Aucune commune trouvée » déclenché par l'envoi du nom complet dans le champ de recherche.
- Le prix payé lu sur le ticket est désormais réinjecté **après** la recherche des prix station, pour qu'il ne soit pas écrasé par le prix ODS courant (qui sert, lui, à alimenter les boutons).

### Changed
- **`Code.gs`** — prompt Gemini : ajout des champs `enseigne` (enseigne seule) et `ville` (commune seule) dans le JSON, en plus de `station`. Version backend → `v3.1.0.4`.
- **`js/ticket.js`** — `fillFormFromTicket()` devient asynchrone ; nouvelles fonctions `applyTicketStation()` et `_findStationInCommune()` ; ordre des champs réagencé (station avant prix).
- **`js/config.js`** — `APP_VERSION` → `3.1.0.4`.

## [3.1.0.3] — 2026-05-29

### Added
- **Station reconnue toujours reportée dans le formulaire** : Gemini lit déjà l'enseigne (ex. « Carrefour Flers-en-Escrebieux »), mais `fillFormFromTicket()` ne remplissait le champ Station que si elle existait déjà dans la liste déroulante. Désormais, si la station lue n'y figure pas, le formulaire bascule automatiquement en **saisie manuelle** (`__autre`) et reporte le nom détecté dans le champ `fAutre`. Le nom n'est plus perdu.

### Changed
- **`js/config.js`** — `APP_VERSION` → `3.1.0.3`.

## [3.1.0.2] — 2026-05-29

### Fixed
- **`Code.gs`** — scan Gemini renvoyait « Réponse non parseable » avec `gemini-2.5-flash` : ce modèle « thinking » consommait tout `maxOutputTokens: 512` en jetons de réflexion, laissant le texte de réponse vide. Correction : `thinkingConfig.thinkingBudget = 0` (désactive le thinking) + `maxOutputTokens` porté à `1024`. Version backend → `v3.1.0.2`.
- **`js/config.js`** — `APP_VERSION` → `3.1.0.2`.

## [3.1.0.1] — 2026-05-29

### Changed
- **`Code.gs`** — `handleScanTicket()` : modèle Gemini `gemini-2.0-flash` → **`gemini-2.5-flash`**. Le free tier de `gemini-2.0-flash` renvoyait `RESOURCE_EXHAUSTED` avec `limit: 0` sur certains projets ; bascule vers le modèle 2.5 dont le quota gratuit est attribué séparément. Version backend → `v3.1.0.1`.
- **`js/config.js`** — `APP_VERSION` → `3.1.0.1`.

## [3.1.0.0] — 2026-05-29

### Added
- **W17 — Gemini 2.0 Flash réactivé comme moteur principal de scan** : le scan de ticket utilise désormais l'IA vision **Gemini 2.0 Flash** (via GAS `action=scanTicket`) en priorité, avec **Tesseract.js en fallback** automatique (hors-ligne ou si Gemini échoue : clé absente, quota, réseau). Gemini comprend le contexte du ticket et lit les tickets froissés, flous ou mal cadrés bien mieux que l'OCR par regex. Clé API gratuite sur [aistudio.google.com](https://aistudio.google.com) (1 500 req/jour), stockée côté GAS (`GEMINI_API_KEY`), jamais exposée au client.
- **`scanWithGemini()`** dans `js/ticket.js` — POST vers `GAS_URL` (même pattern fetch que le reste de l'app, sans header pour éviter le preflight CORS) ; normalise le JSON renvoyé (nombres en chaînes → `Number`) pour qu'il ait la même forme que `parseOCRText()`.

### Changed
- **`js/ticket.js`** — `initScanner()` : nouvelle séquence Gemini → fallback Tesseract ; bouton affiche "⏳ Analyse IA…" pendant l'appel Gemini. La photo couleur (W9) est envoyée à la fois à Drive et à Gemini.
- **`Code.gs`** — `handleScanTicket()` : modèle `gemini-1.5-flash` (`/v1/`) → **`gemini-2.0-flash`** (`/v1beta/`) ; prompt enrichi (tickets abîmés, libellés français Quantite/Prix unit., années 2 chiffres, exclusion TVA, contrôle de cohérence litres × prix ≈ total) ; parsing JSON robuste (retrait des clôtures markdown ```json). Version backend → `v3.1.0.0`.
- **`js/config.js`** — `APP_VERSION` → `3.1.0.0`.

## [3.0.1.1] — 2026-05-28

### Fixed
- **Litres — "Quantite" sans accent** : ajout de `quantite` et `qte` (variantes non accentuées fréquentes après OCR) dans le pattern de label volume. Permet de lire `Quantite = 13.23 L` sur les tickets Carrefour/TPE.
- **Prix — "Prix unit." abrégé** : pattern ③ étendu à `prix\s+unit(?:aire)?\.?` pour capturer les formats `Prix unit. = 0,849 EUR` sans le mot "unitaire" complet.
- **`js/config.js`** — `APP_VERSION` → `3.0.1.1`.

## [3.0.1.0] — 2026-05-28

### Added
- **`FRENCH_MONTHS`** — table de correspondance noms de mois français → MM, utilisée pour détecter les dates textuelles (ex. "15 janvier 2024", "15 jan. 2024").
- **`preprocessImage()`** — nouvelle fonction de prétraitement OCR : conversion en niveaux de gris + courbe S de contraste (facteur 1,4) + résolution max portée à 1 600 px (vs 1 200 px auparavant). La photo couleur pour Drive passe toujours par `resizeImage()` (inchangée).
- **`normalizeNumericText()`** — corrige les substitutions Tesseract les plus fréquentes dans les séquences numériques : O → 0 et S → 5 (uniquement entre chiffres, sans risque de corrompre le texte).

### Changed
- **`js/ticket.js`** — `parseOCRText()` amélioré :
  - **Date** : 4 niveaux de fallback (DD/MM/YYYY → YYYY-MM-DD → DD/MM/YY 2 chiffres → mois français littéral).
  - **Litres** : 5 patterns (ajout "LITRES 42,58" label avant nombre + ligne débutant par quantité × prix).
  - **Prix/L** : ajout pattern ⑥ — libellé carburant suivi du prix sur la même ligne (ex. "SuperEthanol E85 0,798").
  - **Total** : ajout pattern "RÈGLEMENT / SOLDE" (certains TPE).
  - **Station** : ajout AVIA, Netto, Agip, Gulf, Total Access, E.Leclerc, Géant Casino ; filtre `isPriceLine` pour rejeter les lignes "TOTAL TTC 76,61" qui ne sont pas des noms de station.
  - **Km** : ajout tentative 3 — séparateur milliers point (ex. "87.450 km") ; libellé "index" reconnu.
  - Toutes les extractions numériques utilisent `normText` (texte après correction O/S).
- **`js/ticket.js`** — `initScanner()` : OCR sur `ocrBlob` (prétraité) ; photo Drive stockée séparément depuis `blob` couleur.
- **`js/config.js`** — `APP_VERSION` → `3.0.1.0`.

### Fixed
- **Station "TOTAL TTC"** : la ligne de total du ticket n'est plus confondue avec le nom de la station TotalEnergies grâce au filtre `isPriceLine`.
- **FUEL_LABEL_MAP** : ajout `'b10'`, `'hvo'` → GAZOLE ; `'super ethanol'`, `'se-b5'` → E85.

## [3.0.0.4] — 2026-05-28

### Fixed
- **CSP `script-src` — WebAssembly bloqué** : `WebAssembly.instantiate()` de Tesseract.js était rejeté par la CSP car `'wasm-unsafe-eval'` était absent de `script-src`. Ajouté dans `index.html` et `_headers`.

### Changed
- **`index.html`** + **`_headers`** — `script-src` : ajout de `'wasm-unsafe-eval'`.
- **`js/config.js`** — `APP_VERSION` → `3.0.0.4`.

## [3.0.0.3] — 2026-05-28

### Fixed
- **CSP `script-src` / `worker-src` — scan ticket bloqué** : `importScripts()` du worker Tesseract.js était bloqué par la CSP car `https://cdn.jsdelivr.net` était absent de `script-src` (et `worker-src`). Ajouté dans les deux directives dans `index.html` et `_headers`.

### Changed
- **`index.html`** + **`_headers`** — `script-src` et `worker-src` : ajout de `https://cdn.jsdelivr.net`.
- **`js/config.js`** — `APP_VERSION` → `3.0.0.3`.

## [3.0.0.2] — 2026-05-28

### Changed
- **W33 — Prédiction prochain plein dynamique** : la carte "Prochain plein" affiche désormais le **km et le nombre de jours restants calculés depuis aujourd'hui**, et non plus l'intervalle moyen figé depuis le dernier plein. Formules : `daysLeft = avgDay − (today − lastFillUpDate)` · `kmLeft = avgKm − daysElapsed × avgKm/avgDay`. Trois états possibles : "Prochain plein dans ~X km · ~Y j" / "... · aujourd'hui" / "Plein prévu il y a Y j" (si dépassé). Le km cible absolu reste toujours visible en sous-titre.
- **`js/stats.js`** — `_computePrediction()` retourne désormais `lastDate` (date du dernier plein) ; `buildPrediction()` recalcule le restant dynamiquement à l'ouverture de l'app.
- **`js/config.js`** — `APP_VERSION` → `3.0.0.2`.

## [3.0.0.1] — 2026-05-28

### Fixed
- **Placeholder km obsolète** : le placeholder statique `"11 596"` (valeur figée dans le HTML) était confondu avec une prédiction. Remplacé par `"km compteur"` (neutre) + injection dynamique `≥ X km` après chargement de l'historique, où X est le dernier km connu du véhicule courant.
- **Warning rétrograde absent à la restauration du brouillon** : `onKmInput()` n'était pas appelé dans `restoreDraft()`, donc si un brouillon contenait un km inférieur au dernier plein, aucun avertissement n'était affiché. Corrigé.

### Changed
- **`index.html`** — `placeholder="11 596"` → `placeholder="km compteur"`.
- **`js/main.js`** — Import `getMaxKmForVehicule` depuis `historique.js` ; placeholder `fKm` mis à jour dynamiquement à `≥ X km` dans le `setTimeout` 800 ms.
- **`js/formulaire.js`** — `restoreDraft()` appelle `onKmInput()` après restauration du km.
- **`js/config.js`** — `APP_VERSION` → `3.0.0.1`.

## [3.0.0.0] — 2026-05-28

### Added
- **W35 — Pré-remplissage km + dictée vocale** : le champ "Km compteur" est pré-rempli automatiquement au démarrage avec la valeur estimée par W33 (prochain kilométrage prédit), si aucun brouillon n'est en cours. Bouton **🎤** à côté du champ : un tap lance la reconnaissance vocale (`SpeechRecognition fr-FR`), l'utilisateur dicte le kilométrage (ex. "douze mille quatre cent trente"), le champ est rempli et validé automatiquement. Le bouton pulse en rouge pendant l'écoute. Masqué automatiquement sur les navigateurs sans `SpeechRecognition`. Conçu pour les utilisateurs portant des gants (moto).

### Changed
- **`js/stats.js`** — Refactoring `buildPrediction()` : extraction de `_computePrediction(veh)` (helper partagé retournant `{ avgKm, avgDay, lastKm, nextKm, count }` ou `null`) ; nouvelle export `getNextKmPrediction()` pour le pré-remplissage du champ km (W35).
- **`js/formulaire.js`** — Ajout `initVoiceKm()` (W35) : `SpeechRecognition fr-FR`, parser `_parseSpeechToNumber()` (chiffres directs + mots français courants), gestion état `mic-active`, appels `onKmInput()` / `checkDuplicate()` / `saveDraft()` après reconnaissance.
- **`js/main.js`** — Imports `initVoiceKm` + `getNextKmPrediction` ; pré-remplissage `fKm` dans le `setTimeout` 800 ms (W35) ; appel `initVoiceKm()` dans la séquence d'init.
- **`index.html`** — Champ `fKm` enveloppé dans `.km-input-wrap` avec bouton `#voiceKmBtn`.
- **`css/style.css`** — Styles `.km-input-wrap`, `.voice-btn`, `.voice-btn.mic-active`, animation `@keyframes mic-pulse` ; icône SVG mic style iOS (`currentColor`, rouge pendant l'écoute).
- **`js/config.js`** — `APP_VERSION` → `3.0.0.0`.

## [2.17.0.0] — 2026-05-28

### Added
- **W34 — Sparkline multi-carburant avec filtres** : le mini-graphique SVG des prix évolue d'une courbe E85 unique vers un graphique multi-séries affichant simultanément jusqu'à 6 carburants (E85, SP98, SP95, E10, Gazole, GPLc). Nouvelle fonction `buildPrixSparkline()` (remplace `buildE85Sparkline()`), `buildFuelSeries()` pour extraire et dédupliquer les séries par carburant, et `initSparkToggles()` (délégation sur `#statsBox`) pour activer/désactiver les carburants. Axe temporel partagé (`date.getTime()`) pour aligner toutes les courbes. Chaque carburant a sa couleur via la propriété CSS `--spark-color`. Les fuels actifs sont persistés en localStorage (`suivi_e85_spark_fuels`). Seuls les carburants avec ≥ 2 points de données affichent un toggle. La sélection vide est impossible (au moins un carburant reste actif).

### Changed
- **`js/stats.js`** — `buildE85Sparkline()` remplacée par `buildPrixSparkline()` + `buildFuelSeries()` ; ajout constantes `SPARK_KEY`, `SPARK_COLORS`, `FUEL_PRICE_COL` ; export `initSparkToggles()`.
- **`js/main.js`** — Import `initSparkToggles` depuis `stats.js` ; appel `initSparkToggles()` dans la séquence d'init.
- **`js/config.js`** — `APP_VERSION` → `2.17.0.0`.
- **`css/style.css`** — Ajout styles `.spark-toggles`, `.spark-toggle`, `.spark-toggle.active`, `.spark-footer`, `.spark-price-tag`, `.spark-empty`.

## [2.16.0.0] — 2026-05-28

### Added
- **W26 — Web Share API** : bouton 📤 sur chaque entrée historique → partage les détails d'un plein (type, litres, prix/L, station, date) via le menu natif iOS/Android. Détection de support : si `navigator.share` n'est pas disponible (desktop Chrome…), les boutons sont masqués via CSS (`body.no-share`). Délégation d'événements sur `#historiqueList` et `#histoireFullList` via `initHistoireShare()`.
- **W15 — Auto-save brouillon** : à chaque frappe dans le formulaire (km, litres, prix, station, date, saisie manuelle), le brouillon est sauvegardé en localStorage (`suivi_e85_draft`). Au prochain chargement, il est restauré automatiquement après 800 ms (délai permettant aux stations de se charger) avec toast "📝 Brouillon restauré". Effacé après soumission réussie ou réinitialisation du formulaire via `clearDraft()`.
- **S7 — Rate limiting côté GAS** : `rateLimit(cid)` dans `Code.gs` — max 10 requêtes/min par client via `CacheService.getScriptCache()`, clé `rl_<cid>_<minute>`, TTL 90 s. L'app génère et persiste un UUID client (`suivi_e85_client_id`) via `crypto.randomUUID()` et l'envoie dans chaque payload GAS (`cid`). GAS retourne `{ success: false, error: 'Trop de requêtes…' }` si le quota est dépassé.
- **S9 — Audit dépendances npm** : job `audit` ajouté dans `.github/workflows/ci.yml` (`npm audit --audit-level=moderate`, non-bloquant `continue-on-error: true`). Nouveau fichier `.github/dependabot.yml` : MAJ npm hebdomadaires (lundi 09h00 Europe/Paris) + github-actions mensuellement.

### Changed
- **`js/config.js`** — Ajout de `DRAFT_KEY = 'suivi_e85_draft'` et `CLIENT_ID_KEY = 'suivi_e85_client_id'` ; `APP_VERSION` → `2.16.0.0`.
- **`js/formulaire.js`** — Fonctions `saveDraft()`, `restoreDraft()`, `clearDraft()` exportées (W15) ; `_getClientId()` pour le rate limiting (S7) ; `submitForm()` inclut `cid` dans le payload ; `resetForm()` appelle `clearDraft()` et `updateRentabilite()`.
- **`js/historique.js`** — `renderItem()` : ajout bouton `.hist-share` avec attributs `data-share-*` ; `initHistoireShare()` exportée (W26) avec détection `navigator.share` et délégation sur `#historiqueList` + `#histoireFullList`.
- **`js/main.js`** — Imports `saveDraft`, `restoreDraft` depuis `formulaire.js` ; import `initHistoireShare` depuis `historique.js` ; import `showFeedback` depuis `ui.js` ; `setTimeout` 800 ms pour restauration du brouillon ; `saveDraft()` ajouté aux listeners `fDate`, `fKm`, `fLitres`, `fPrix`, `stationSel`, `fAutre` ; appel `initHistoireShare()`.
- **`css/style.css`** — Styles `.hist-share` et `.hist-share:active` dans `.hist-row1` ; règle `body.no-share .hist-share { display: none }`.
- **`Code.gs`** — Fonction `rateLimit(cid)` (S7) ; appel dans `doPost` avant l'enregistrement d'un plein ; version → `v2.16.0.0`.
- **`.github/workflows/ci.yml`** — Ajout job `audit` (S9).
- **`.github/dependabot.yml`** — Nouveau fichier Dependabot (S9).

## [2.15.0.1] — 2026-05-28

### Fixed
- **CSP `connect-src`** : ajout de `https://script.googleusercontent.com` dans la directive `connect-src` (index.html + `_headers`). Les appels GAS redirigent de `script.google.com` vers `script.googleusercontent.com` — l'absence de ce domaine bloquait silencieusement tous les fetch GAS (historique, soumission de pleins), provoquant "Failed to fetch" dans la carte "5 Derniers Pleins" et l'état "Chargement…" figé dans la carte Statistiques.
- **`js/config.js`** — `APP_VERSION` → `2.15.0.1`.

## [2.15.0.0] — 2026-05-28

### Added
- **Cache mémoire API ODS (TTL 5 min)** : les résultats de l'API prix carburants sont mis en cache dans une `Map` par clé `(lat, lon, rayon)` avec expiration 5 minutes. Élimine les appels réseau redondants quand l'utilisateur change de type de carburant sans changer de station ni de position — la réponse mise en cache est réutilisée immédiatement.
- **Content Security Policy** : en-têtes CSP ajoutés via `<meta http-equiv="Content-Security-Policy">` dans `index.html` ET via le fichier `_headers` (Netlify). Origines autorisées : `data.economie.gouv.fr`, `script.google.com`, `docs.google.com`, `overpass-api.de`, `cdn.jsdelivr.net`, `unpkg.com`, `tile.openstreetmap.org`. Règles complémentaires : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self)`.
- **Sync différentielle `?since=`** : le GAS accepte désormais `?action=export&since=ISO_TIMESTAMP` et ne retourne que les enregistrements dont l'`Horodatage` (col A) est postérieur à `since`. L'app web stocke le timestamp de la dernière sync en localStorage (`suivi_e85_hist_since`) et passe ce paramètre à chaque chargement d'historique, évitant de retélécharger l'intégralité des données à chaque session.
- **Cache localStorage historique** : `chargerHistorique()` conserve l'ensemble des enregistrements en localStorage (`suivi_e85_hist_cache`). En cas d'erreur réseau, l'historique en cache est affiché en fallback plutôt qu'un message d'erreur vide.

### Changed
- **`js/prix.js`** — Ajout de `_odsCache` (Map), `_ODS_TTL = 5 min`, fonctions `_ck / _cget / _cset`. `fetchPricesAtCoords()` vérifie le cache avant chaque appel fetch et l'alimente en cas de succès.
- **`js/historique.js`** — Import de `HIST_CACHE_KEY` / `HIST_SINCE_KEY` depuis `config.js` ; `chargerHistorique()` refactorisé avec helpers `_loadCache / _saveCache / _loadSince / _saveSince` ; fusion différentielle des enregistrements entrants avec le cache (déduplication par `sync_id`) ; fallback cache en cas d'erreur réseau.
- **`js/config.js`** — Ajout de `HIST_CACHE_KEY = 'suivi_e85_hist_cache'` et `HIST_SINCE_KEY = 'suivi_e85_hist_since'` ; `APP_VERSION` → `2.15.0.0`.
- **`index.html`** — Meta `Content-Security-Policy` ajoutée juste après `<meta charset>`.
- **`_headers`** — Nouveau fichier de configuration Netlify avec CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` et `Permissions-Policy`.
- **`Code.gs`** — `doGet` passe maintenant `e` à `handleExport(e)` ; `handleExport` filtre les lignes par `Horodatage >= since` quand le paramètre `?since=` est fourni ; retourne `{ records, since }` ; version → `v2.15.0.0`.

## [2.14.0.0] — 2026-05-28

### Added
- **W32 — Historique complet + filtres** : bouton 📜 dans la carte "Derniers pleins" ouvre une carte `#histoireFullCard` affichant tous les pleins triés du plus récent au plus ancien. Deux filtres dynamiques (véhicule et type de carburant) peuplés depuis les données réelles. Compteur "(N pleins)" affiché dans le titre. Bouton ✕ pour fermer. Auto-rafraîchi à chaque `chargerHistorique()`. Scroll interne (max 420 px).
- **W33 — Prédiction prochain plein** : bloc `prediction-box` affiché dans la carte Statistiques sous la sparkline. Calcule l'intervalle moyen en km et en jours entre les pleins consécutifs du véhicule courant (valeurs aberrantes filtrées : Δkm < 50 ou > 5 000, Δjours > 120). Affiche "Prochain plein dans ~X km · ~Y j" et l'estimation du prochain compteur. Nécessite ≥ 3 pleins avec kilométrage.

### Changed
- **`js/historique.js`** — Import `state` ajouté ; exports `voirTout`, `renderFullHistory`, `initHistoireFilters` ; `chargerHistorique()` rafraîchit `#histoireFullCard` si ouvert.
- **`js/stats.js`** — `buildPrediction()` ajouté ; appelé dans `renderStats()` après la sparkline.
- **`js/main.js`** — Import `voirTout`, `initHistoireFilters` ; handler `data-action="voirTout"` ; appel `initHistoireFilters()`.
- **`index.html`** — Bouton `data-action="voirTout"` dans `.hist-actions` ; carte `#histoireFullCard` avec filtres `#histVehFilter` / `#histTypeFilter`.
- **`css/style.css`** — Styles `.hist-full-card`, `.hist-filters`, `.hist-filter-sel`, `.hist-count`, `#histoireFullList` (W32) et `.prediction-box`, `.pred-*` (W33) avec variantes dark mode.
- **`js/config.js`** — `APP_VERSION` → `2.14.0.0`.

## [2.13.0.0] — 2026-05-27

### Added
- **W9 — Photo du ticket uploadée avec le plein** : lors du scan du ticket de caisse, l'image redimensionnée est encodée en base64 et transmise au GAS. Le GAS la sauvegarde dans un dossier Drive `Suivi E85 - Tickets`, rend le fichier public en lecture, et enregistre l'URL dans une nouvelle colonne P `Photo ticket` de la feuille `_ImportGS`. Indicateur `📷 Photo jointe` visible dans le formulaire après scan.
- **W30 — Comparateur multi-stations** : après une géolocalisation, toutes les stations ayant un prix E85 (jusqu'à 40) sont affichées dans une carte dédiée `#comparateurCard`, triées par prix E85 croissant. La station la moins chère est mise en évidence (fond vert). Les données sont conservées dans `state._geoStations`.
- **W31 — Géoloc mémorisée (localStorage)** : la dernière position et la liste des stations sont persistées en localStorage (`suivi_e85_last_geo`, TTL 1 h). Au prochain clic 📍, les stations précédentes s'affichent immédiatement pendant que la géolocalisation GPS se met à jour en arrière-plan.
- **T3 — Versioning dynamique du cache SW** : le nom du cache Service Worker (`suivi-e85-shell-v__SW_VERSION__`) est injecté avec `APP_VERSION` via un plugin Vite (`swVersionPlugin`) — en dev par middleware, en build par remplacement de chaîne dans `dist/sw.js`. Garantit l'invalidation automatique du cache à chaque version.

### Changed
- **T2 — Refactoring onclick HTML → addEventListener** : suppression de tous les `onclick=`, `oninput=`, `onchange=`, `onkeydown=` inline dans `index.html` (~20 handlers). Câblage déplacé dans les modules JS via `initStaticHandlers()`, `initTypeToggle()`, `initNearbyList()`, `initMapInteractions()`. Sélecteur CSS `[onclick]` → `[data-map-pin-idx]` dans `style.css`.
- **`js/geo.js`** — `renderNearby()` : attribut `data-nearby-idx` remplace `onclick` inline ; `renderComparateur()` génère la table `.comp-table` dans `#comparateurCard`.
- **`js/carburant.js`** — `_buildTypeToggle()` : attribut `data-fuel-key` remplace `onclick="setType(...)"` ; `initTypeToggle()` ajoute la délégation sur `#typeToggle`.
- **`js/carte.js`** — `showMap()` : `data-map-pin-idx` remplace les attributs `onclick`/`onmouseenter`/`ontouchstart` ; `initMapInteractions()` gère la délégation sur `#stationMap`.
- **`js/ticket.js`** — `blobToBase64()` helper ; après OCR, l'image base64 (sans préfixe `data:`) est stockée dans `state._ticketPhoto` et l'indicateur `#ticketPhotoIndicator` est affiché.
- **`js/formulaire.js`** — `submitForm()` : joint `payload.ticketPhoto` si disponible. `resetForm()` : efface `state._ticketPhoto` et masque `#ticketPhotoIndicator`.
- **`css/style.css`** — Ajout `.scan-info`, `.ticket-photo-badge` (W9) et styles `.comp-table` / `.comp-best` (W30) avec variantes dark mode.
- **`Code.gs`** — `HEADERS` étendu à 16 colonnes (col P `Photo ticket`) ; `getOrCreateTicketFolder()` ; upload photo base64 → Drive dans le handler plein par défaut ; `getOrCreateSheet()` migre les feuilles existantes à 15 colonnes vers 16.
- **`vite.config.js`** — Plugin `swVersionPlugin` (T3).
- **`js/config.js`** — `APP_VERSION` → `2.13.0.0`.

## [2.12.3.0] — 2026-05-27

### Fixed
- **`js/notifications.js`** — Toggle iOS browser : suppression du `disabled` sur le toggle. Le bouton répond désormais visuellement au tap (bref flash vert → retour à off) au lieu d'être silencieux. Le message d'installation `#notifIOS` s'anime en ambre pour attirer l'attention. `initNotifications()` câble toujours l'écouteur `change`, même sur iOS browser.
- **`css/style.css`** — Ajout de l'animation `.notif-flash` / `@keyframes notif-highlight` (fond ambre transitoire 1.4 s) pour mettre en évidence le message iOS quand l'utilisateur tape le toggle.

### Changed
- **`js/config.js`** — `APP_VERSION` → `2.12.3.0`

## [2.12.2.0] — 2026-05-27

### Fixed
- **`css/style.css`** — Règle globale `[hidden] { display: none !important; }` ajoutée en tête de fichier : les éléments utilisant `display: flex/grid` en CSS ne peuvent plus écraser l'attribut HTML `[hidden]`. Corrige l'affichage parasite des deux messages de notification (`#notifNoSupport`, `#notifDenied`) sur iOS Safari et le seuil d'alerte (`#notifSeuilRow`) toujours visible.
- **`js/notifications.js`** — Détection iOS en mode navigateur (`isIOSBrowser`) : sur iPhone/iPad non installé en PWA, l'API est considérée non disponible → toggle désactivé dès le chargement, aucun appel à `requestPermission()`. Supprime le comportement incohérent (toggle sans réaction, messages contradictoires). Ajout d'un `try/catch` autour de `requestPermission()` pour les navigateurs qui lèvent une exception. Ordre d'initialisation corrigé : `updateNotifUI()` appelé en premier dans `initNotifications()`.
- **`index.html`** — Nouveau `<div id="notifIOS">` : message spécifique iPhone "Sur iPhone, les alertes nécessitent l'app installée — Safari → Partager → Sur l'écran d'accueil (iOS ≥ 16.4)". Remplace les messages génériques "non supporté" / "bloqué" qui s'affichaient simultanément sur iOS.

### Changed
- **`js/config.js`** — `APP_VERSION` → `2.12.2.0`

## [2.12.1.0] — 2026-05-27

### Added
- **`tests/e2e.spec.js`** — Suite Playwright E2E (5 scénarios, mode mock GAS) :
  - **TC-01** E85 complet → feedback succès + formulaire réinitialisé + historique rechargé (2ème GET GAS renvoie `HIST_RECORD` via flag `submissionDone`)
  - **TC-02** SP98 complet → feedback succès + formulaire réinitialisé
  - **TC-03** Champs obligatoires manquants → feedback `error` "Champs manquants", formulaire conservé
  - **TC-04** Station non sélectionnée → feedback `error` "Station manquante"
  - **TC-05** Erreur GAS (`success: false`) → feedback `error` "Erreur serveur", champs conservés
  - Mocks réseau : GAS (`script.google.com/**`), API prix (`data.economie.gouv.fr/**`), Google Sheets stations (`docs.google.com/**` → abort → fallback), Overpass (`overpass-api.de/**`)
- **`playwright.config.js`** — Configuration Playwright : serveur Vite (`npm run dev`), 1 worker séquentiel, Chromium headless, `testMatch: '**/*.spec.js'` (séparé de Vitest)
- **`package.json`** — `@playwright/test ^1.44.0` en devDependency + scripts `test:e2e`, `test:e2e:ui`, `test:e2e:headed`, `test:e2e:report`
- **`.gitignore`** — Entrées `playwright-report/` et `test-results/`

### Changed
- **`js/config.js`** — `APP_VERSION` → `2.12.1.0`

## [2.12.0.0] — 2026-05-27

### Added
- **`index.html`** — `<div id="swUpdateBanner">` : bannière "🔄 Mise à jour disponible" (W23), masquée par défaut, avec bouton "Actualiser". Placée avant le header pour apparaître en premier plan sans JavaScript d'affichage.
- **`js/pwa.js`** — `_showUpdateBanner(reg)` : détecte `reg.installing` (via `statechange`) et `reg.waiting` (SW déjà en attente au chargement). Câble le bouton "Actualiser" → `reg.waiting.postMessage({ type: 'SKIP_WAITING' })`. Reload automatique via `controllerchange`.
- **`public/sw.js`** — handler `message` pour `SKIP_WAITING` : déclenche `self.skipWaiting()`, ce qui active le nouveau SW immédiatement → `controllerchange` → `window.location.reload()`.
- **`js/stats.js`** — `buildE85Sparkline()` : courbe SVG inline des 10 derniers prix E85 payés (`getAllRecords()`). Tri chronologique, `polyline` SVG, cercle sur le dernier point, couleur selon tendance (baisse=vert, hausse=rouge, stable=bleu). Affiché sous la grille 2×2 dans la carte Statistiques.

### Changed
- **`js/formulaire.js`** — `submitForm()` : `window.scrollTo({ top: 0, behavior: 'smooth' })` ajouté après enregistrement réussi **et** après mise en file hors-ligne (W24). Le formulaire repasse automatiquement en vue, sans geste manuel.
- **`js/stats.js`** — `renderStats()` : appel `buildE85Sparkline()` intégré à la fin du HTML généré.
- **`js/pwa.js`** — `initPWA()` : appel SW registration refactorisé pour intégrer la détection de mise à jour W23 + listener `controllerchange`.
- **`css/style.css`** — ajout des styles `.update-banner`, `.update-apply-btn` (W23) et `.e85-sparkline`, `.spark-*` (W28) avec variantes dark mode et couleur dynamique selon tendance.
- **`js/config.js`** — `APP_VERSION` → `2.12.0.0`.

## [2.11.0.0] — 2026-05-27

### Added
- **`public/sw.js`** — Service Worker (Cache-First shell + Network-First dynamique).
  - Cache statique de la coquille applicative (HTML/CSS/JS/icônes) pour démarrage hors-ligne.
  - Stratégie Network-First pour les requêtes GET du même domaine ; fallback vers le cache si hors réseau.
  - Skip des ressources externes (GAS, ODS API, CDN) pour ne pas interférer avec la logique métier.
  - Fallback navigation : sert `index.html` depuis le cache pour toutes les routes SPA.
  - Background Sync : sur tag `sync-pleins`, notifie les clients `window` via `postMessage` pour déclencher la synchronisation.
- **`js/offline.js`** — Gestion de la file d'attente hors-ligne.
  - `queuePlein(payload)` : sauvegarde un plein dans `localStorage` quand la soumission échoue (hors réseau).
  - `syncQueue()` : envoie chaque entrée à GAS au retour de la connexion ; retire les succès, arrête sur erreur réseau persistante.
  - `updateOfflineBadge()` : met à jour le badge `📵 N hors-ligne` dans le header.
  - `initOffline()` : écoute `window.online`, messages Service Worker (`SYNC_PLEINS`), et enregistre un Background Sync.
- **`js/notifications.js`** — Alertes prix E85 via Web Notifications API.
  - `toggleNotifications(enable)` : demande la permission, enregistre l'état et envoie une notification de confirmation.
  - `checkPrixE85Alert(prix, station)` : émet une notification `tag: 'e85-price-alert'` (anti-spam) si le prix E85 est sous le seuil configuré.
  - `getSeuil() / setSeuil()` : seuil persisté en localStorage (`notif_e85_seuil`), défaut 0,850 €/L.
  - `updateNotifUI()` : synchronise le toggle, la ligne seuil, et les messages permission denied / not supported.
  - `initNotifications()` : câble le toggle et l'input seuil au chargement.
- **`index.html`** — Éléments UI pour les nouvelles fonctionnalités.
  - Badge `#offlineBadge` dans le header (visible si des pleins sont en attente de sync).
  - Carte « Paramètres » avec section hors-ligne (informatif) et section alertes prix E85 (toggle + seuil + messages denied/no-support).
- **`js/pwa.js`** — Enregistrement du Service Worker dans `initPWA()` (portée `import.meta.env.BASE_URL`).
- **`css/style.css`** — Styles pour les nouvelles fonctionnalités.
  - `.offline-badge` : badge ambre pulsant (`@keyframes pulse-badge`) dans le header.
  - `.notif-card`, `.notif-row`, `.notif-label`, `.notif-sub` : carte paramètres et ses composants.
  - `.switch`, `.switch-track` : toggle iOS-style (checked/disabled variants).
  - `.seuil-row`, `.seuil-input`, `.seuil-unit` : ligne saisie du seuil d'alerte.
  - `.feedback.info` : variante bleue du feedback (manquait pour les messages hors-ligne).

### Changed
- **`js/formulaire.js`** — `submitForm()` : en cas d'erreur réseau (`NetworkError` / `!navigator.onLine`), appelle `queuePlein(payload)` au lieu d'afficher une simple erreur, puis `resetForm()` et `updateOfflineBadge()`.
- **`js/prix.js`** — `applyPricesResult()` : appelle `checkPrixE85Alert()` après chaque chargement de prix station.
- **`js/main.js`** — Appels `initOffline()`, `initNotifications()`, `syncQueue()` au démarrage.

## [2.10.0.5] — 2026-05-27

### Fixed
- **`js/ticket.js`** — Deux bugs critiques dans le remplissage du formulaire post-scan.
  - **Ordre `setType` → `fPrix`** : `setType()` efface `fPrix.value = ''` (ligne 66 de `carburant.js`). `fillFormFromTicket` appelait `setType` *après* avoir rempli `fPrix`, effaçant immédiatement le prix détecté. Correction : `setType` est désormais appelé **en premier**, avant tout remplissage de champ numérique.
  - **`montant_total` faux** : le pattern `ttc` (seul) dans `totalPatterns` capturait "Prix unitaire **TTC** 1,799" → `montant_total = 1.799` au lieu de 76,61. Correction : `ttc` retiré de l'alternance principale ; seul `total ttc` et `montant ttc` restent valides comme déclencheurs.

## [2.10.0.4] — 2026-05-27

### Fixed
- **`js/ticket.js`** — Extraction prix/L refondée pour robustesse maximale.
  - **Collecte multi-candidats** : au lieu de s'arrêter au premier match, tous les candidats prix/L valides ([0,3–3,5]) sont collectés puis le **maximum** est retenu — élimine automatiquement TICPE (0,691 €/L) et autres taxes inférieures au prix carburant réel.
  - **Pattern ① élargi** : `€?` → `[€e£é]?` — gère l'artefact OCR "€" → "e"/"E"/"£" (fréquent avec Tesseract sur texte imprimé).
  - **`.matchAll()`** remplace `.match()` — permet de trouver tous les candidats dans le texte, pas seulement le premier.
  - **Km — séparateur milliers espace** : "87 450 km" (format français) désormais reconnu → 87450. 4 niveaux de fallback km (contigu, espace, libellé+contigu, libellé+espace).
  - **Station** : "totalenergies" ajouté à la liste des mots-clés.
  - **Log diagnostic** : `console.group('[OCR]…')` affiche le texte brut et les candidats prix dans la console DevTools pour faciliter le débogage.

## [2.10.0.3] — 2026-05-27

### Fixed
- **`js/ticket.js`** — Extraction du prix/L robustifiée pour les formats tickets courants.
  - **Pattern ② (EUR/L)** : `eur?` → `eur(?:os?)?` — couvre désormais "eur", "euro" et "euros" (avec `s` final). Exemple : `1,799 Euros/L` désormais reconnu.
  - **Pattern ③ (libellé)** : ajout de `prix unitaire` et `prix/litre(s)` — corrige la non-détection du libellé le plus courant sur les tickets de station (Total, Leclerc, Carrefour…).
  - **Pattern ④ (multiplication)** : `\d{2}` → `\d{2,3}` — quantité avec 3 décimales (ex. `25,000 L`) désormais prise en charge.
  - **Totaux** : `\d{2}` → `\d{2,3}` dans les deux patterns — capture les montants à 3 décimales (ex. `44,975 €`), ce qui rend le fallback `total ÷ litres` fonctionnel même lorsque le prix/L n'est pas lisible directement.

## [2.10.0.2] — 2026-05-27

### Fixed
- **`js/ticket.js`** — Extraction du prix/L améliorée (5 niveaux de fallback).
  - **Plage étendue** : `[01]` → `[0-3]` — couvre désormais SP98 (~2,09 €/L), GPLc (~0,85 €/L) et tout carburant jusqu'à 3,5 €/L.
  - **Artefacts OCR** : le séparateur `/L` toléré sous ses formes déformées `|L`, `\L`, `Il`, `lL` (erreurs Tesseract courantes sur les petits caractères).
  - **Nouveaux libellés** : `Prix au litre`, `Prix/l`, `prixlitre` ajoutés au pattern libellé.
  - **Fallback ⑤ — `montant_total ÷ litres`** : si le prix/L n'a pas été trouvé directement mais que le montant et le volume sont connus, le prix est calculé par division (arrondi à 3 décimales). Les grands nombres (ex. `36,23 €`, `20,14 L`) sont bien mieux reconnus par l'OCR que `1,799 €/L` — ce fallback est donc très fiable.

## [2.10.0.1] — 2026-05-27

### Fixed
- **`js/ticket.js`** — Détection du carburant "SP 95-E10" (E10) corrigée.
  - **`FUEL_LABEL_MAP`** : patterns composés (`sp95-e10`, `sp 95-e10`, `95-e10`, `sp95 e10`, `sp 95 e10`, `sans plomb 95-e10`…) positionnés **avant** `sp95` et `e10` séparément — ordre critique car `"sp95-e10".includes("sp95")` est vrai et causait un match prématuré sur `SP95`.
  - **Regex fallback** (codes courts) : pattern dédié `\bSP\s?95[\s-]E10\b|\b95[\s-]E10\b` testé avant l'alternance simple `SP95|E10` pour éviter que "SP95-E10" soit capturé par `SP95`.

## [2.10.0.0] — 2026-05-27

### Changed
- **`js/ticket.js`** — Suppression complète de la dépendance Gemini/GAS pour le scan de ticket.
  - Remplacé par **Tesseract.js** (OCR 100 % côté client, aucune clé API, fonctionne hors-ligne après premier chargement).
  - Nouveau flux : photo → redimensionnement canvas (max 1 200 px) → `Tesseract.recognize()` langue `fra` → `parseOCRText()` → champs auto-remplis.
  - `parseOCRText()` : extraction par regex heuristiques (date, litres, prix/L, montant, type carburant, station, km).
  - Barre de progression : affichage du % pendant la reconnaissance (`recognizing text`).
  - Validations : litres 0,5–200 L, prix 0,3–3,5 €/L pour rejeter les faux positifs OCR.

### Added
- **`package.json`** : dépendance `tesseract.js` (OCR navigateur, multi-langues).

### Removed
- Appel `fetch(GAS_URL, { action: 'scanTicket', imageBase64, … })` dans `ticket.js`.
- Fonction `compressImage()` remplacée par `resizeImage()` (même logique, renvoie Blob pour Tesseract).
- Import `GAS_URL` dans `ticket.js` (plus nécessaire pour le scan).
- Fonction `handleScanTicket` dans `Code.gs` : inopérante (`gemini-1.5-flash` non supporté sur endpoint `/v1/`), conservée dans GAS mais plus jamais appelée par l'app web.

## [2.9.0.2] — 2026-05-27

### Fixed
- **`Google Drive/.../Code.gs`** : `gemini-2.0-flash` non disponible sur le plan gratuit (quota `limit: 0`) → retour à `gemini-1.5-flash`, endpoint `v1` conservé (le problème précédent était `v1beta`, pas le nom du modèle).

---

## [2.9.0.1] — 2026-05-26

### Fixed
- **`Google Drive/.../Code.gs`** : modèle Gemini mis à jour `gemini-1.5-flash` (déprécié en `v1beta`) → `gemini-2.0-flash` via endpoint `v1`. Corrige l'erreur *"models/gemini-1.5-flash is not found for API version v1beta"* lors du scan de ticket.

---

## [2.9.0.0] — 2026-05-26

### Added

#### 🔄 Sync bidirectionnel Excel ↔ Google Sheets — complet

**VBA — `vba/GS_Pleins_snippet.bas`** (nouveau module feuille) :
- **[F1] Auto sync_id à la saisie** : `Worksheet_Change` génère un UUID en col O dès qu'une cellule de données (A:N) est modifiée sur une ligne active (Date ou Km renseigné). Le sync_id n'attend plus le prochain `SyncManuel()`.
- **[F2] Marquage modification locale** : toute modification sur A:N inscrit `Now()` en col P (`last_modified`). Flag consommé par `ExportModificationsToGS`.
- **[F3] Validation kilométrage** : warning `vbExclamation` si le km saisi est inférieur au max km enregistré pour le même véhicule. Comparaison par véhicule si renseigné, global sinon.
- **[F4] Détection doublons** : warning si Date + Km + Litres (au centilitre) correspondent à une ligne existante. Déclenché sur modification de col B, D ou E.

**VBA — `vba/modSyncGS.bas`** — mise à jour v2.9.0.0 :
- **Col P `Modifie_local`** : nouvelle colonne 16 (`COL_MODIFIED`). Initialisée automatiquement par `EnsureModifiedColHeader` (appelée à chaque `SyncCore` et `ForceFormatDates`).
- **`ExportModificationsToGS`** : collecte les lignes avec sync_id déjà dans GS + col P renseignée → POST `action=bulkUpdate`. Efface col P après succès HTTP 200. Tolère l'absence du handler GAS (conserve col P si réponse vide ou erreur).
- **`ImportGSToExcel`** — MAJ bidirectionnelle : pour les lignes existantes (sync_id connu), si col P vide (pas de modif locale) et valeurs GS différentes (Date/Km/Litres) → `UpdateRowFromGS` met à jour les cols 2–14. Si col P renseignée → Excel gagne, skip GS.
- **`BuildLocalRowMap`** : dictionnaire `sync_id → numéro de ligne` pour les MAJ GS→Excel.
- **`RowMatchesGS`** : compare Date (yyyy-mm-dd), Km (±0.5), Litres (±0.01) local vs GS.
- **`UpdateRowFromGS`** : écrase cols 2–14 depuis le record GS (préserve col 1 horodatage, col 15 sync_id, col 16 modified).
- **`SyncDiagnose`** : affiche le nombre de lignes dirty (col P set) dans le rapport.
- **`SyncCore`** : statut détaillé — `<-N nouv. +M MAJ / ->N nouv. +M MAJ`.

**GAS — `Google Drive/.../Code.gs`** — mise à jour v2.9.0.0 :
- **`handleBulkUpdate(ss, rows)`** : upsert par `sync_id` — ligne trouvée → MAJ cols B–N (préserve col A Horodatage) ; ligne absente → `appendRow` (cas de désync). Retourne `{ status:'ok', updated:N, added:M }`.
- Dispatch `action === 'bulkUpdate'` dans `doPost`.

**GAS — `Google Drive/.../GAS_UPDATE.md`** :
- Réécrit entièrement (était v2.1.3.0). Documente désormais toutes les actions `doGet`/`doPost` (`export`, `addStation`, `syncStations`, `addVehicule`, `removeVehicule`, `bulkAdd`, `bulkUpdate`, `scanTicket`), le schéma complet A→O, les fonctions de migration et l'historique des versions GAS.

### Changed
- **`excel/Suivi conso E85.xlsm`** : modules VBA mis à jour — `modSyncGS` (v2.9.0.0, sync bidir. complet) + module feuille `GS_Pleins` (F1–F4 : auto sync_id, dirty flag, validation km, doublons).
- **`package.json`** : `version` → `2.9.0.0`.

---

## [2.8.0.1] — 2026-05-26

### Fixed
- **`css/style.css`** : marqueurs de carte passaient au premier plan lors du défilement derrière le header sticky. Cause : `z-index:10` des marqueurs et `z-index:10` du header étaient dans le même stacking context racine — ordre DOM décidait, marqueurs gagnaient. Fix : `isolation:isolate` ajouté sur `#stationMap` et `.static-map` → chaque carte forme désormais un stacking context fermé, les z-index internes ne s'échappent plus vers le contexte racine où le header règne.

---

## [2.8.0.0] — 2026-05-26

### Added

#### 🗺️ Carte statique Stations habituelles + prix moyens
- **`js/stationsmap.js`** (nouveau module) : calcule le prix moyen E85 par station depuis l'historique complet (`getAllRecords()`), trie par prix croissant, rend une card `#stationsMapCard` avec liste et mini-carte OSM statique (non-interactive, labels prix toujours visibles).
- **`js/geo.js`** : `pickStation()` appelle désormais `cacheStationCoords(name, lat, lon)` — les coordonnées de chaque station sélectionnée sont persistées en `localStorage` sous `suivi_e85_station_coords`. La carte statique se peuple automatiquement au fil des sessions.
- **`js/historique.js`** : appel `renderStationsCard()` après chaque chargement d'historique pour maintenir la card à jour.
- **`index.html`** : card `#stationsMapCard` insérée après le bloc Statistiques. Masquée (`hidden`) tant qu'aucun historique E85 n'est disponible.
- **`css/style.css`** : styles `.static-map`, `.smap-pin`, `.smap-pin-dot`, `.smap-list`, `.smap-item`, `.smap-name`, `.smap-prix`, `.smap-count`, `.smap-best` — adaptés dark mode.

#### ⚠️ Détection de doublons dans le formulaire
- **`js/formulaire.js`** : nouvelle fonction `checkDuplicate()` — compare date + km + litres (au centilitre près) avec tous les enregistrements existants via `getAllRecords()`. Warning inline `#dupeWarn` si correspondance trouvée. Confirmation `confirm()` supplémentaire lors de la soumission si doublon détecté.
- **`index.html`** : `<div id="dupeWarn">` ajouté sous les champs litres/prix ; `onchange="checkDuplicate()"` sur `fDate`, `oninput` enrichi sur `fKm` et `fLitres`.

---

## [2.7.0.4] — 2026-05-26

### Fixed
- **`js/carte.js`** : marqueurs de carte qui débordaient au-dessus du conteneur `#stationMap`. Cause : le `offY` (décalage vertical de la grille de tuiles) peut être très négatif quand la grille est plus haute que les 220 px de la carte ; les marqueurs nord avaient `top = offY + p.y - 30 < 0`, leur pin dépassait au-dessus de `.map-header`. Fix en deux points : ① `offY` est recalé à `max(offY, PIN_H - minPy)` pour garantir que le marqueur le plus haut reste dans l'espace visible ; ② `overflow:hidden` ajouté sur le conteneur `<div>` de tuiles comme filet de sécurité supplémentaire.

---

## [2.7.0.3] — 2026-05-26

### Changed
- **`js/pwa.js`** : bannière Android flottante (`#installBanner`) remplacée par un bouton 📲 discret dans le header (`#pwaInstallBtn`). Le bouton n'apparaît que lorsque `beforeinstallprompt` se déclenche et disparaît après installation — plus de sessionStorage nécessaire côté Android.
- **`index.html`** : suppression du `<div id="installBanner">` ; ajout `<button id="pwaInstallBtn">` dans le header entre le titre et le toggle thème. Le banner iOS (`#iosBanner`) est conservé (seule option sur Safari).
- **`css/style.css`** : suppression `.pwa-btn` (bouton flottant Android) ; ajout `.pwa-install-btn` (style identique au `.theme-toggle` — fond semi-transparent, arrondi, hover) ; nettoyage `.pwa-banner` (iOS uniquement).

---

## [2.7.0.2] — 2026-05-26

### Fixed
- **`vite.config.js`** : `minify: 'esbuild'` remplacé par `minify: true` — `esbuild` est déprécié dans Vite 8.x (qui utilise rolldown/OXC) et n'est plus embarqué ; le build CI échouait silencieusement depuis v2.7.0.0.
- **`manifest.json` → `public/manifest.json`** : déplacement dans `public/` pour éviter que Vite hash le fichier dans `assets/` (ex. `assets/manifest-CcE5tYcX.json`). Depuis ce sous-dossier, le chemin relatif `icons/icon.svg` se résolvait en `/suivi-e85/assets/icons/icon.svg` au lieu de `/suivi-e85/icons/icon.svg` → 404 sur l'icône PWA. Désormais le manifest est à `dist/manifest.json` et l'icône à `dist/icons/icon.svg` — chemins cohérents.

---

## [2.7.0.1] — 2026-05-25

### Fixed
- **`css/style.css`** : ajout `.pwa-banner[hidden] { display: none; }` — `display:flex` sur `.pwa-banner` écrasait l'attribut HTML `hidden`, rendant les 2 bannières PWA toujours visibles et les boutons ✕ inopérants. La règle `[hidden]` a une spécificité plus haute (0-2-0 vs 0-1-0) et corrige l'affichage.

---

## [2.7.0.0] — 2026-05-25

### Added — Vite bundler (W12) + Tests unitaires Vitest (W14)

#### ⚡ W12 — Vite bundler
- **`vite.config.js`** : config Vite — `base: '/suivi-e85/'` en build (GitHub Pages), `'/'` en dev (localhost) via `command === 'build'` ; `outDir: dist` ; config Vitest intégrée (`globals: true`, `environment: node`).
- **`public/icons/icon.svg`** : icône déplacée dans `public/` — Vite la copie sans hash dans `dist/icons/`, garantissant un chemin prévisible pour le manifest PWA.
- **`manifest.json`** : chemin icône mis à jour `images/icons/icon.svg` → `icons/icon.svg` (cohérent avec `public/icons/`).
- **`index.html`** : `<link rel="apple-touch-icon">` mis à jour `href="images/icons/icon.svg"` → `href="icons/icon.svg"`.
- **`.github/workflows/deploy.yml`** : nouveau workflow — `push main` → `npm ci` → `vite build` → `actions/upload-pages-artifact@v3` → `actions/deploy-pages@v4`. Prérequis : Settings → Pages → Source → **GitHub Actions**.
- **`.gitignore`** : ajout `dist/` et `.vite/`.

#### 🧪 W14 — Tests unitaires Vitest
- **`tests/utils.test.js`** : 30 assertions sur les 8 fonctions pures de `utils.js` — `haversine` (distance, symétrie), `escHtml` (XSS chars), `getCoords` (formats ODS lat/lon et GeoJSON), `stationLabel`, `stationSubLabel`, `formatVille`, `composeStationName`, `odsUrl`.
- **`tests/prix.test.js`** : 8 scénarios sur `fetchNearestE85Price` avec `global.fetch` mocké — prix trouvé au 1er rayon, fallback sur 2e/3e rayon, 3 rayons exhaustés, vérification des valeurs `1000m`/`5000m`/`15000m` dans les URLs, lat/lon dans la requête, erreur réseau, HTTP non-ok, `e85_prix: null` ignoré. Modules DOM (`ui.js`, `carburant.js`, `rentabilite.js`) mockés via `vi.mock()`.

### Changed
- **`package.json`** : scripts ajoutés `dev` (vite), `build` (vite build), `preview`, `test` (vitest run) ; `version` → `2.7.0.0`.
- **`.github/workflows/ci.yml`** : ajout job `test` (Vitest) en parallèle de `lint` et `version-check`.
- **`js/config.js`** : `APP_VERSION` → `2.7.0.0`.
- **`ROADMAP.md`** : W12 et W14 retirés de leurs tableaux, ajoutés à "✅ Idées déjà implémentées".

---

## [2.6.0.0] — 2026-05-25

### Added — PWA (W4)
- **`manifest.json`** : manifeste PWA — `name`, `short_name`, `display: standalone`, `theme_color: #1B3A5C`, `background_color`, icône SVG `any` + `maskable`, shortcut "Nouveau plein"
- **`images/icons/icon.svg`** : icône app 512×512 — fond bleu foncé, emoji ⛽, texte "E85" vert — compatible maskable (contenu dans la safe zone 80%)
- **`js/pwa.js`** : module `initPWA()` — détection `beforeinstallprompt` (Android/Chrome) → affiche bannière avec bouton "Installer" ; détection iOS Safari → bannière instruction manuelle après 4 s ; `sessionStorage` pour éviter la ré-affichage en session ; `triggerInstall()` + `dismiss()` exposés sur `window`
- **`index.html`** : `<meta name="theme-color">`, `<link rel="manifest">`, `<link rel="apple-touch-icon">`, bannières `#installBanner` (Android) et `#iosBanner` (iOS) en `hidden` par défaut
- **`css/style.css`** : classes `.pwa-banner`, `.pwa-btn`, `.pwa-close`, `.pwa-banner--ios` + dark mode

### Changed
- **`js/main.js`** : import + appel `initPWA()` après `initScanner()`
- **`js/config.js`** : `APP_VERSION` passée à `2.6.0.0`
- **`ROADMAP.md`** : W4 retiré du tableau "Quick wins", ajouté à "Idées déjà implémentées"

---

## [2.5.0.3] — 2026-05-25

### Fixed
- **`vba/modDashboard.bas`** : correction `ws.Activate` avant `ws.Range().Select` (erreur 1004)
- **`vba/modDashboard.bas`** : suppression `ChrW(128200)` hors BMP dans `BuildX7Chart` (erreur 5)
- **`vba/modDashboard.bas`** : remplacement de tous les tirets em `—` et flèches `→` par des équivalents ASCII pour compatibilité encodage ANSI à l'import VBA

### Changed
- **`README.md`** : ajout tuto complet `<details>` pour obtenir et configurer la clé API Gemini (AI Studio → GAS Script Properties → redéploiement)

---

## [2.5.0.0] — 2026-05-25

### Added

#### 🧾 W17 — Scan ticket de caisse → auto-complétion du formulaire
- **`js/ticket.js`** (nouveau module) : bouton "🧾 Scanner le ticket" → sélecteur de fichier (galerie ou caméra) → compression canvas (max 1 200 px, JPEG ≤ 800 Ko) → envoi base64 à GAS → Gemini Vision API → JSON parsé → pré-remplissage automatique des champs date / km / litres / prix / type carburant / station. Mapping robuste des libellés carburant (`FUEL_LABEL_MAP`) + correspondance partielle sur le dropdown station.
- **`Google Drive/.../Code.gs`** : nouvelle action `scanTicket` dans `doPost` → appelle `handleScanTicket(imageBase64, mimeType)` → API Gemini `gemini-1.5-flash` via `UrlFetchApp` avec clé `GEMINI_API_KEY` stockée dans les propriétés de script. Prompt structuré → JSON `{ date, km, litres, prix_litre, montant_total, type_carburant, station }`. Extraction robuste du JSON dans la réponse texte.
- **`index.html`** : bloc `.scan-row` avec `#scanTicketBtn` (🧾 Scanner le ticket) + texte d'aide, inséré entre le toggle carburant et les champs du plein.
- **`style.css`** : classes `.scan-row`, `.scan-btn`, `.scan-hint` — design cohérent avec les autres actions (border blue-mid, active inverted, dark mode).

#### 🔁 W13 — GitHub Actions CI
- **`.github/workflows/ci.yml`** : deux jobs parallèles —  `lint` (ESLint sur `js/`) et `version-check` (compare `APP_VERSION` dans `config.js` au dernier tag Git, avertissement seulement). Déclenchement sur `push` et `pull_request` toutes branches.
- **`package.json`** : configuration npm avec `"type": "module"`, script `lint`, dépendances dev `eslint` + `@eslint/js` v9.
- **`eslint.config.js`** : flat config ESLint 9 — `js.configs.recommended` + règles `no-unused-vars` (warn), `no-undef` (error), `no-var` (error), `prefer-const` (warn), `eqeqeq` (warn), `no-duplicate-imports` (error) + globals browser complets.
- **`.gitignore`** : ajout `node_modules/`.

#### 📈 X7 + X8 — Graphiques Excel (`modDashboard.bas`)
- **`vba/modDashboard.bas` — `CreerGraphiques()`** : nouvelle procédure publique créant / régénérant la feuille "Graphiques". Appelée automatiquement en fin de `CreerTableauDeBord()` ; exécutable seule si les KPIs sont déjà en place.
- **X7 — Prix E85 dans le temps** : helper data Date|Prix E85|Station (filtré sur Type contenant "E85") + graphique ligne bleu (`xlLineMarkers`) avec axe X dates (format `mmm yy`) et axe Y `€/L`.
- **X8 — Consommation L/100 km** : helper data Date|L/100km|Véhicule — conso calculée entre pleins consécutifs du même véhicule (bubble sort sur véhicule+km, filtre aberrations : delta 10–3 000 km, conso 3–25 L/100) + graphique ligne vert. Permet de détecter une dérive mécanique dans le temps.

### Changed
- **`js/main.js`** : import + appel de `initScanner()` après le chargement des données.
- **`js/config.js`** : `APP_VERSION` passée à `2.5.0.0`.
- **`ROADMAP.md`** : nettoyage complet — les items réalisés sont retirés de leurs tableaux d'origine (plus de strikethrough) et ajoutés uniquement dans "✅ Idées déjà implémentées". Suppression des 2 entrées W16 (absorbées par W17). W13, W17, X7, X8 ajoutés au tableau implemented.

---

## [2.4.5.1] — 2026-05-25

### Added
- **`ROADMAP.md` — nouvel item W17** : *"🧾 Scan ticket de caisse → auto-complétion du formulaire"* — reconnaissance OCR / API vision (Claude Vision, Gemini Vision, GPT-4 Vision) du ticket de caisse imprimé par la pompe ; extrait date, heure, type carburant, litres, prix/L, montant total et nom de station pour pré-remplir automatiquement tous les champs du formulaire en ligne. Avantage vs W16 : ticket papier imprimé, structuré, sans reflets — données plus fiables qu'un afficheur de pompe. Deux approches : (a) envoi base64 à GAS → API Vision → JSON parsé ; (b) Tesseract.js local pour tickets bien contrastés. Effort estimé : 3-5 h.

---

## [2.4.5.0] — 2026-05-25

### Added
- **`js/utils.js` — `formatVille(city)`** : premier segment d'une ville (avant `-` ou espace) converti en proper case. Ex : `FLERS-EN-ESCREBIEUX` → `Flers`, `DOUAI` → `Douai`.
- **`js/utils.js` — `composeStationName(name, ville)`** : compose le label final `"Nom - Ville"` (ex : `Carrefour - Flers`). Si l'un manque, retourne l'autre.
- **`ROADMAP.md` — nouvel item W16** : *"Photo ticket + OCR/AI"* — capture caméra → OCR (Tesseract.js côté client OU Vision API Claude/Gemini côté GAS) → parse date/litres/prix/station → pré-remplit le formulaire. Évolution naturelle de W9 (stockage photo seul).

### Changed
- **`js/geo.js` — `searchNearby`** : utilise `composeStationName(rawName, c.r.ville)` au lieu de `osmNames[i] || stationLabel(c.r)`. Les stations affichent désormais `Carrefour - Flers` au lieu de `Carrefour`. La détection "connue" reste basée sur le `rawName` brut pour ne pas casser le matching avec les stations habituelles.
- **`js/recherche.js`** :
  - `buildStations` stocke maintenant `ville` dans chaque station + compose le name via `composeStationName`.
  - Les deux callsites OSM (`searchStationSuggestions`, `searchStationsCityOnly`) recomposent le nom final avec ville après enrichissement OSM.
- **`js/stats.js`** :
  - Helper `matchType(rType, fuelKey)` qui mappe un Type GS (label complet "SuperEthanol E85") avec une clé `FUEL_CONFIG` (E85).
  - `computeStats` filtre désormais conso & coût/100km **par carburant courant** (`state.currentType`). Total dépensé et économies E85 vs SP98 restent globaux.
  - `renderStats` affiche un mini-tag `<span class="stat-tag">E85</span>` à côté des unités L/100km et €/100km. Affiche `—` si <2 pleins de ce type.
- **`style.css`** : nouvelle classe `.stat-tag` (badge bleu compact 9 px).
- **`js/carburant.js` — `setType`** : appelle `window.renderStats()` après chaque changement de carburant → les tuiles conso/€/100km se recalculent instantanément.
- **`js/config.js`** : `APP_VERSION` passée à `2.4.5.0`.

---

## [2.4.4.0] — 2026-05-25

### Added — 📈 Stats live (ROADMAP W7)
- **`js/stats.js`** : nouveau module exportant `renderStats()`. Calcule 4 KPIs filtrés sur le **véhicule courant** + fenêtre **6 derniers mois** :
  1. **Conso L/100 km** : `total_litres_véhicule × 100 / (km_max − km_min)`
  2. **Coût aux 100 km** : `conso × prix_moyen_récent`
  3. **Total dépensé** sur la fenêtre (Σ litres × prix)
  4. **Économies E85 vs SP98** : Σ (sp98_station − prix_payé) × litres pour chaque plein E85 récent
- **Carte HTML `<div class="card stats-card">`** insérée entre les cards du formulaire et la carte historique.
- **`style.css` — grille 2×2 `.stats-grid`** : 4 tuiles avec valeurs en tabular-nums, fond `var(--toggle-bg)`, dark mode supporté. Variante `.pos` (vert) / `.neg` (rouge) pour les économies.

### Changed
- **`js/historique.js`** :
  - Nouveau `export function getAllRecords()` qui retourne `_allRecords` (utilisé par stats.js).
  - `chargerHistorique` appelle `renderStats()` après le rendu de la liste — les stats se mettent à jour dès que les données arrivent.
- **`js/vehicules.js` — `onVehiculeChange`** : appelle aussi `window.renderStats()` car les KPIs sont filtrés par véhicule.
- **`js/main.js`** : import + exposition `renderStats` sur `window`.
- **`js/config.js`** : `APP_VERSION` passée à `2.4.4.0`.
- **`ROADMAP.md`** :
  - **W7 marqué ✅**
  - **W10** marqué ❌ "redondant avec W2 (📋 Dupliquer dernier)" — concept à redéfinir
  - **W8, W9, W11** annotés avec effort réaliste (3-4 h chacune)
  - **W15 nouveau** : Auto-save brouillon (formulaire → localStorage, restauré au reload)
  - **S8 nouveau** : Refresh quotidien des prix via GAS trigger temporel + onglet `_PrixHistory`

---

## [2.4.3.0] — 2026-05-25

### Added — 🌿 Badge rentabilité E85 (ROADMAP W5)
- **`js/config.js` — `E85_RENTABLE_RATIO = 0.66`** : nouvelle constante exportée. Seuil basé sur la surconsommation typique de l'E85 (~30 % de plus que SP98). Tant que `prix_E85 / prix_SP98 < 0.66`, le plein E85 est économiquement rentable malgré la surconsommation.
- **`js/prix.js` — `evalRentabiliteE85()`** : fonction exportée qui met à jour l'élément `#rentaBadge`. Affiche un badge vert (rentable) si le rapport prix est favorable, orange sinon. Masqué si l'un des deux prix est manquant.
- **`js/rentabilite.js`** : nouveau module léger qui expose `updateRentabilite()` — appelé depuis `formulaire.js` après chaque récupération de prix.
- **`style.css`** : `.renta-badge.ok` (vert + border) et `.renta-badge.warn` (amber + border) + surcharges dark mode.

### Changed
- **`js/formulaire.js`** : `onStationChange()` et `resetForm()` appellent `evalRentabiliteE85()` pour mettre à jour / effacer le badge.
- **`js/config.js`** : `APP_VERSION` passée à `2.4.3.0`.
