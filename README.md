# ⛽ Suivi Conso. Carburants — Formulaire de saisie

Formulaire mobile pour saisir les pleins de carburant (SuperEthanol E85 / Super 98)
et les enregistrer automatiquement dans Google Sheets.

> 📋 Voir [`ROADMAP.md`](ROADMAP.md) pour les améliorations envisagées (web, Excel, sync).
> 🔖 Version courante : **v5.0.0.0**

## 🌐 Accès

| Ressource | Lien |
|---|---|
| 📱 Application | **https://fdaubercy.github.io/suivi-conso-carburant/** |
| 📊 Google Sheet | https://docs.google.com/spreadsheets/d/1uN170kt_n45sBRwqs2krTYfhapU3dMKjTguD-qSUqCE/edit |
| ⚙️ Google Apps Script | Google Sheet → Extensions → Apps Script |

Ajouter à l'écran d'accueil iPhone : Safari → Partager → « Sur l'écran d'accueil »

---

## 👤 Comptes utilisateurs — connexion Google (U7, v5.0.0.0)

L'application est **multi-utilisateur** : chacun se connecte avec **son compte Google**
(« Se connecter avec Google ») et ne voit **que ses propres** pleins, statistiques,
historique et réglages. Toutes les données restent sur **le compte Google du propriétaire**
(le Google Sheet et l'Apps Script ne changent pas), **séparées par une colonne `email`**.

- **Connexion** : Google Identity Services (GIS). Sur Android, Chrome propose directement
  le compte du téléphone (One-Tap). L'email est **vérifié côté serveur** (Apps Script valide
  le JWT via l'endpoint Google `tokeninfo`) — le client ne peut pas usurper une identité.
- **Accès** : la **Carte** et les prix restent **publics** ; **Saisie** (enregistrement),
  **Stats**, **Historique** et **Réglages** exigent la connexion.
- **RGPD** : ⚙️ Réglages → **« 🗑️ Supprimer mon compte »** efface définitivement vos données.

### ⚙️ Mise en place (propriétaire) — créer l'OAuth Client ID

1. **[console.cloud.google.com](https://console.cloud.google.com)** → projet lié au Sheet.
2. **APIs & Services → Écran de consentement OAuth** : type **External**, renseigner le nom
   de l'app + e-mail, scopes par défaut (`openid`, `email`, `profile`), puis **Publier**
   (statut *En production* — pas de vérification requise pour ces scopes non sensibles).
3. **Identifiants → Créer → ID client OAuth → Application Web** :
   - **Origines JavaScript** : `https://fdaubercy.github.io`, `http://localhost:5173`, `http://localhost:4173`.
   - Copier l'**ID client** (`…apps.googleusercontent.com`).
4. Coller cet ID dans **`js/config.js`** (`GOOGLE_CLIENT_ID`) **et** **`Auth.gs`** (même valeur).
5. **`npm run gas:deploy`** puis exécuter **`migrerMultiUser()`** (rattache l'existant au
   propriétaire), recoller **`powerquery/GS_Pleins.m`** dans Excel, tester avec 2 comptes,
   puis poser la propriété de script **`REQUIRE_AUTH = 1`** (rend l'idToken obligatoire).

> 🔒 **Bascule souple** : tant que `GOOGLE_CLIENT_ID` reste le placeholder, l'authentification
> est **inactive** et l'app fonctionne exactement comme avant (mode propriétaire, aucune régression).

---

## ✨ Fonctionnalités

### 🧭 Navigation par vues — onglets + pages (W42)
L'application est organisée en **5 vues** (pages) accessibles via une **barre d'onglets fixe en bas**, comme une appli native — fini le long scroll unique :

| Onglet | Contenu |
|---|---|
| ⛽ **Saisie** | Formulaire, véhicule, carburant, scan ticket, station, comparateur, secteur, « Enregistrer » |
| 📊 **Stats** | Statistiques live, **budget mensuel** (W39) + **tendance 6 mois** (W50) + **alerte de dépassement anticipée** (W56), **CO₂ évité** (W40) + **objectif CO₂ annuel** (W51) + **cumul mensuel** (W55), **comparatif véhicules** (W41) + **export CSV** (W52), rapport mensuel, bilan annuel « Wrapped » |
| 🗺️ **Carte** | **Stations les moins chères autour de moi** (W64/D3 — **sélecteur E85/Gazole/SP98**, rayon réglable **5/10/15/20 km**, top‑3 au-dessus de la carte + reste en liste défilante, marqueurs enseigne + prix, zoom/plein écran), puis carte des stations habituelles + prix moyens, **sélecteur E85/Gazole/SP98** (W47), **épinglage manuel 📌** (W53) |
| 📜 **Historique** | 5 derniers pleins + historique complet filtrable + **export CSV filtré / global, séparateur `;` ou `,`** (W25 + W54) |
| ⚙️ **Réglages** | Réglages **regroupés par bloc repliable** (v4.1/v4.2) : **🚀 démarrage** (vue d'ouverture), alertes prix par carburant (alerte + seuil groupés), **conversion E85** (coût total paramétrable : boîtier + pose + carte grise + entretien + surcoût assurance − aide, **carburant de référence** SP98/SP95/E10 **ou Gazole/diesel** + écart €/L, nb pleins récents pour la projection — X67/X68/X69/X70, W89 ; en mode diesel : véhicule diesel de référence + conso L/100 de repli), **budget mensuel**, **objectif CO₂ annuel** |

- **Routeur par hash** (`js/router.js`) : chaque vue a son URL (`#/saisie`, `#/stats`, `#/carte`, `#/historique`, `#/params`) → le **bouton retour** du navigateur et de l'OS fonctionne nativement, et l'URL est partageable. Aucun fallback serveur nécessaire (compatible GitHub Pages).
- **Vue de départ configurable** (v4.2.0.0) — dans ⚙️ Réglages → « 🚀 Démarrage », choisir l'ouverture sur **Accueil**, **Saisie** ou **dernière vue consultée**. Par défaut Accueil ; un deep-link `#/<vue>` reste prioritaire.
- **Mise en page pleine hauteur** (v4.1.0.0) — `body` en flex colonne (`min-height: 100dvh`), le footer reste collé en bas de l'écran sur toutes les pages, même courtes.

### 🏠 Écran d'accueil à tuiles (W43)
Une **6ᵉ vue `#/accueil`** sert de portail : une **tuile « reprendre »** (v4.2.0.0 — dernière vue consultée + résumé du dernier plein), **5 grandes tuiles** (Saisie · Stats · Carte · Historique · Réglages) + **2 raccourcis** (« Nouveau plein », « Dupliquer le dernier »). Un **bouton 🏠** dans le header y ramène à tout moment. Depuis **v4.1.0.0, c'est la vue de départ par défaut** (modifiable en v4.2.0.0) ; l'accueil reste hors de la séquence d'onglets.

### 👆 Gestes de navigation — swipe (W44)
**Balayage gauche/droite** (pointer events) pour passer d'un onglet à l'autre, avec **transition latérale** directionnelle, en complément de la barre d'onglets (`js/swipe.js`). Garde-fous : geste nettement horizontal uniquement, zones interactives ignorées (cartes, formulaires, sélecteurs), bord gauche réservé au geste « retour » natif iOS.

### 🔴 Badges de notification sur les onglets (W45)
Des **pastilles** attirent l'attention sans forcer l'ouverture des vues (`js/badges.js`) :
- **⚙️ Réglages** : point si aucune alerte prix n'est configurée (et que les notifications sont possibles) ;
- **📜 Historique** : **compteur** des pleins importés non encore consultés (persistant — se vide à l'ouverture) ;
- **🗺️ Carte** : point si un « moins cher du secteur » a été relevé aujourd'hui (se vide à l'ouverture, réarmé chaque jour).

### ⛽ Carte multi-carburant (W47 + W48)
- La carte des stations habituelles propose un **sélecteur E85 / Gazole / SP98** : le classement (par prix moyen payé) et la mini-carte suivent le carburant choisi.
- **Présélection** = carburant du **dernier plein du véhicule courant** ; se ré-ajuste au changement de véhicule. Un carburant sans plein affiche un message dédié plutôt que de masquer la carte.
- **Station favorite ⭐ (W36)** : une station habituelle est marquée ⭐ « favorite » dès `FAVORITE_MIN_PLEINS` pleins (défaut 4, `config.js`), distinct du ★ « meilleur prix ». Un **bouton de tri 💶 Prix ↔ ⭐ Fréquentation** (persisté) classe la liste par prix moyen ou par nombre de pleins.
- **Épinglage manuel 📌 (W53)** : un **bouton 📌** sur chaque station permet de l'**épingler en tête** de la liste, **indépendamment** du prix et du seuil de fréquentation auto — votre station de référence reste toujours visible en haut, quel que soit le tri. Persisté en `localStorage`.
- **« 🏆 Moins cher du secteur »** (W48) : prix live du jour pour le carburant sélectionné, relevé chaque matin (~7h) par le backend dans 15 km autour de votre dernière position + vos stations habituelles — utile même sans historique de pleins.

### 📊 Stats étendues — budget, CO₂, comparatif (W39 → W41, W50 → W52, W55, W56)
- **🎯 Budget carburant mensuel (W39)** — fixez un objectif € dans ⚙️ Réglages : la carte Stats affiche une **barre de progression** de la dépense du mois en cours (véhicule sélectionné) et passe en **rouge avec alerte** dès le dépassement. Laisser le champ vide désactive la barre.
- **📈 Tendance du budget — 6 mois (W50)** — sous la barre de budget, un **mini-histogramme** des dépenses des 6 derniers mois avec une **ligne d'objectif** pointillée au niveau du budget : barres **vertes** sous l'objectif, **rouges** au-dessus, pour visualiser la trajectoire et anticiper le dépassement. (Affiché uniquement si un budget est défini et qu'au moins un mois a des dépenses.)
- **⏰ Alerte de dépassement anticipée (W56)** — tant que le budget n'est pas encore dépassé, un encart **« À ce rythme, budget dépassé le JJ/MM · ≈ X € en fin de mois »** projette la dépense de fin de mois à partir du **rythme du mois en cours** (dépense cumulée ÷ jours écoulés). Action préventive plutôt que constat *a posteriori*. (Affiché uniquement si le franchissement est prévu avant la fin du mois.)
- **🌱 CO₂ évité (W40)** — tuile « kg CO₂ évités » par l'E85 vs essence (SP95-E10 ≈ 2,21 kg/L ; E85 ≈ −50 % à la combustion), calculée **à distance égale** (litres essence équivalents = litres E85 / (1 + surconsommation)) sur l'ensemble de vos pleins E85.
- **🌍 Objectif CO₂ / éco-score annuel (W51)** — jauge « **X kg CO₂ évités cette année** » vers un **objectif annuel** configurable dans ⚙️ Réglages (défaut **200 kg/an**), avec passage en mode « objectif atteint » et deux **équivalents parlants** : km de conduite thermique évités (≈ 120 g CO₂/km) et arbres (≈ 25 kg CO₂/an). Calculée sur les pleins E85 de l'**année en cours** (véhicule sélectionné).
- **🌿 CO₂ évité — cumul mensuel (W55)** — sous la jauge annuelle, une **courbe cumulée** du CO₂ évité mois par mois sur l'année, confrontée à la **trajectoire d'objectif** (droite pointillée, **cible mensuelle = objectif annuel / 12**) : on voit d'un coup d'œil si l'on est **en avance ou en retard** sur la cible.
- **🚗🏍️ Comparaison entre véhicules (W41 + W52)** — quand au moins **2 véhicules** ont des données, un graphe croise leur **consommation (L/100 km)** et leur **coût (€/100 km)** en barres normalisées ; le véhicule courant est surligné et le plus économe mis en avant. Un **bouton 📥** exporte le tableau conso/coût en **CSV** (Excel FR). (Les autres stats restent mono-véhicule.)

### 🔔 Alertes prix par carburant (W11 → W49)
- **Un interrupteur + un seuil par carburant** (E85 / Gazole / SP98) dans ⚙️ Réglages.
- **Foreground** (app ouverte) : alerte dès qu'un prix relevé passe sous son seuil. **Background** : push planifiée (~7h) via le Service Worker, qui lit les meilleurs prix du jour par carburant et vos seuils, app fermée. *(Nécessite le backend GAS redéployé et le Web Push configuré.)*

### 🔄 Pull-to-refresh (W46)
- **Tirer la page vers le bas** en haut d'écran affiche un indicateur ↻ qui suit le doigt ; au-delà du seuil, le relâchement **recharge l'application** (`js/pullrefresh.js`).
- Pensé pour la **PWA standalone iOS**, où Safari n'offre aucun pull-to-refresh natif. **Tactile uniquement** ; n'interfère ni avec le défilement de page, ni avec les listes à défilement interne, ni avec la carte interactive.

### Saisie du plein
- Formulaire rapide : date (pré-remplie à aujourd'hui), km compteur, litres, prix, station
- **Toggle multi-carburant** dynamique :
  - Ligne primaire : 🌿 E85 / 💧 SP98 (toujours visibles)
  - Ligne secondaire : 🔵 SP95, 🟢 E10, ⚫ Gazole, 🟡 GPLc — apparaît avec les prix dès qu'une station est sélectionnée
  - Mini-badges dans le bandeau : carburants disponibles ≠ type courant, cliquables pour changer de type
- **Calcul en temps réel** du coût du plein (litres × prix)
- **Détection de doublons** : warning inline si date + km + litres correspondent à un plein existant
- Version de l'application affichée dans le bandeau

### 🧾 Scan ticket de caisse (W17) + 📷 Photo jointe (W9)

Bouton **"🧾 Scanner le ticket"** dans le formulaire : sélection d'une photo (galerie ou caméra) →
**analyse IA [Gemini 2.0 Flash](https://ai.google.dev/) via le backend GAS** (moteur principal, en ligne) →
pré-remplissage automatique des champs. **Fallback automatique** : si Gemini est indisponible
(hors-ligne ou erreur), bascule sur l'**OCR [Tesseract.js](https://tesseract.projectnaptha.com/) 100 % navigateur**
(redimensionnement canvas max 1 200 px + prétraitement niveaux de gris/contraste + extraction par heuristiques).

Champs détectés : **date, km compteur, litres, prix/L, montant total, type de carburant, nom de la station**.

**Gemini** nécessite la clé `GEMINI_API_KEY` dans les Script Properties du projet GAS
([Google AI Studio](https://aistudio.google.com/), gratuit 1500 req/jour). Sans clé, le scan utilise
Tesseract.js localement, **sans aucune clé API**.

**W9 — Photo jointe automatiquement** : après le scan, l'image redimensionnée est encodée en base64
et transmise avec le plein lors de l'enregistrement. Le GAS la stocke dans un dossier Drive
**"Suivi E85 - Tickets"**, la rend publique en lecture et enregistre l'URL dans la colonne P du Sheet.
Un badge **📷 Photo jointe** confirme visuellement que l'image sera envoyée.

La vignette du ticket s'affiche aussi **dans le classeur Excel** : l'onglet **« Hist. Carburant »** comporte une
colonne **« Ticket »** qui rend la photo via la fonction `IMAGE()` (Microsoft 365), en convertissant l'URL Drive
(col P) en URL vignette (`https://drive.google.com/thumbnail?id={id}&sz=w800`). Les lignes ne sont rehaussées que
si au moins un plein possède une photo (v5.15.0.0).

> 💡 **Premier scan** : Tesseract.js télécharge ~4 Mo de données linguistiques françaises (CDN jsDelivr)
> puis les met en cache (IndexedDB). Les scans suivants sont instantanés.

Extraction heuristique par regex :

| Champ | Patterns détectés |
|---|---|
| Date | `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY-MM-DD` |
| Litres | `16,25 L`, `16.25 litres`, `Qté : 16,25`, `16,25 × 0,798` |
| Prix/L | `0,798 €/L`, `0.798€/l`, `Prix : 0,798`, `0,798 × 16,25` |
| Carburant | `SuperEthanol E85`, `SP98`, `Gazole`, codes courts |
| Station | Enseigne reconnue (Leclerc, Carrefour, Total, BP, Intermarché…) |
| Km | `11831 km`, `Km : 11831`, `compteur 11831` |

### Récupération automatique des prix — tous carburants
Dès la sélection d'une station, l'API gouvernementale `data.economie.gouv.fr` est interrogée
pour récupérer **tous les prix disponibles** (E85, SP98, SP95, E10, Gazole, GPLc) en une seule requête :
- Prix trouvé → champ pré-rempli en vert pendant 6 secondes
- Prix non trouvé → placeholder `--`, saisie manuelle disponible
- Stratégie progressive : rayon 500 m → 2 km → 5 km → fallback GPS → code postal
- **Cache API ODS (TTL 5 min)** : les résultats sont mis en cache par clé `(lat, lon, rayon)` dans une `Map`. Aucun appel réseau redondant lors du changement de type de carburant — la réponse est réutilisée immédiatement depuis la mémoire.

### 📅 Prix historique pour une date passée (W60)
Le prix live (ci-dessus) reflète **aujourd'hui** — faux pour un plein saisi à une date antérieure. Dès qu'une **date ≠ aujourd'hui** est choisie, le champ **Prix** est rempli depuis `_PrixHistory` (relevé quotidien ~7h, cf. § *Prix payé vs moins cher du secteur*) :
- **prix de la station sélectionnée** ce jour-là (relevé exact) ;
- sinon le **relevé le plus proche AVANT** la date (« 📅 relevé du 18/05 ») ;
- sinon repli sur le **moins cher du secteur** du jour ;
- **W62** : les **6 carburants** (E85/Gazole/SP98 **+ SP95/E10/GPLc**) sont désormais résolus à la saisie (`HIST_FUELS` + `TOKENS` de `handleSectorPrices`, alimentés par `_PrixHistory` — W61) ; un carburant sans aucun relevé avant la date → saisie manuelle ; retour à aujourd'hui → prix live restauré.

Une **note** sous le champ Prix indique la provenance. Côté serveur, `?action=sectorPrices` expose `byStationDate` (prix par station/date) en plus de `byDate` ; côté app `js/secteur.js` résout le prix (`resolveHistPrice`/`applyHistPriceToForm`). Tant que le GAS n'est pas redéployé, le repli **mini secteur** assure le bon fonctionnement.

### Identification des stations (v4.14.0.0 — refonte fiabilité + UX)
Les stations sont enrichies via **OpenStreetMap (Overpass API)** pour afficher le nom d'enseigne réel (`brand` / `name` / `operator`) au format **« Enseigne - Ville »**, aussi bien en géolocalisation qu'en recherche manuelle. Le renommage a été refondu pour ne plus faire patienter l'utilisateur ni risquer un faux nom (`js/osm.js` `enrichStationsBulk`) :

- **Une seule requête Overpass groupée** (union de clauses `around` par station) au lieu de N requêtes en série → réponse rapide, plus de risque d'erreur 429.
- **Appariement par seuil de proximité (≤ 200 m)** : on n'attribue l'enseigne OSM que si un point `amenity=fuel` est assez proche ; au-delà, **le nom gouvernemental est conservé** → on est sûr de ne jamais coller un mauvais nom.
- **Affichage immédiat** : la liste s'affiche aussitôt avec les noms gouvernementaux, puis chaque ligne est **renommée « Enseigne - Ville » au fur et à mesure** en arrière-plan.
- **Annulable** : relancer une recherche **ou choisir une station** (liste déroulante ou liste de proximité) **interrompt immédiatement** la requête et le renommage en cours (`AbortController` + `cancelOsmEnrich`), puis poursuit la sélection.

Exemple d'affichage :
```
Intermarché                    ← nom enseigne OSM (nom principal)
2 Rue de la Paix · BEUVRY      ← adresse · ville (sous-titre)
3,3 km · E85 0,798 €/L
```
Si OSM ne retourne pas de résultat (ou trop loin), l'adresse de l'API gouvernementale est utilisée en fallback.

### Duplication d'un plein (v4.14.0.0 — prix tous-carburants fiabilisés)
Le raccourci **« Dupliquer le dernier »** (accueil / onglet) pré-remplit le formulaire depuis le dernier plein (véhicule, type, station) et **relance une requête de prix** sur la station. Depuis la v4.14.0.0, la sélection d'une station connue (donc la duplication) relève les prix **à la position réelle de la station** — coordonnées mémorisées (`js/stationsmap.js` `getStationCoords`) — au lieu de chercher autour du GPS courant. Cela garantit que **les prix de tous les carburants (E85/SP98/SP95/E10/Gazole/GPLc, colonnes I→N)** sont bien enregistrés pour la bonne station, y compris en dupliquant loin de la pompe.

### Gestion des véhicules
- Liste stockée **100 % en localStorage** (aucune donnée envoyée côté serveur)
- **Import initial** au premier lancement depuis l'onglet `vehicules` du Google Sheet (si localStorage vide)
- **Ajout / suppression** directement depuis le sélecteur (local uniquement)
- **Dernier véhicule utilisé** auto-sélectionné au démarrage

### Carte interactive des résultats (W63 — Google Maps, repli OpenStreetMap)
La carte de **recherche / géoloc** dispose de **deux moteurs de rendu** derrière le même point d'entrée `showMap()` (`js/carte.js` + `js/gmap.js`) :
- **Google Maps interactif** *(si `GOOGLE_MAPS_API_KEY` est renseignée, cf. Configuration)* : **zoom** (pinch / molette / boutons +/−), **glisser-déplacer** (un doigt sur mobile), et **regroupement des stations proches en clusters** qui s'ouvrent au zoom → idéal pour **distinguer la bonne station quand il y en a beaucoup**. Marqueurs = **logo de l'enseigne** (W66 — Total, Leclerc, Shell, BP, Eni… ; `generic.svg` si inconnue) **+ pastille de prix** ; clic → sélection + popup itinéraire (S11).
- **Rendu OpenStreetMap « maison »** *(repli par défaut, sans aucune clé ni dépendance)* : tuiles OSM en JS pur, zoom auto-ajusté, marqueurs ⛽ cliquables, marqueur vert pour le point de recherche. **Activé automatiquement** tant qu'aucune clé Google n'est posée, ou si l'API Google échoue à charger → **zéro régression**.
- Communs aux deux moteurs : cliquer un marqueur **sélectionne** la station et met en surbrillance sa ligne ; synchronisation bidirectionnelle liste ↔ carte.
- **S11 — Itinéraire au clic** : sur la carte des **stations habituelles** comme sur celle de **recherche/géoloc**, cliquer un marqueur ouvre une popup d'infos (nom, prix, distance, adresse) puis propose l'**itinéraire Waze** (départ = position GPS) après confirmation, avec repli **Google Maps** si Waze n'est pas installé.

### Géolocalisation (+ W30 + W31)
- Bouton 📍 : détecte les stations E85 dans un rayon de **8 km**
- Liste des **7 stations les plus proches**, triées par distance, enrichies via OSM
- Badge « connue » pour les stations déjà présentes dans le dropdown
- Tap sur une station (liste ou carte) → sélection + récupération des prix
- **W30 — Comparateur multi-stations** : jusqu'à 40 stations retournées par l'API sont triées par prix E85 croissant dans une carte dédiée. La station la moins chère est mise en évidence (fond vert).
- **W31 — Géoloc mémorisée** : la dernière position GPS et la liste des stations sont persistées en localStorage (TTL 1 h). Au prochain tap 📍, les stations précédentes s'affichent immédiatement pendant que le GPS se met à jour — zéro attente perçue.

### Recherche manuelle par ville, code postal ou adresse (W63)
- Le champ accepte **ville, code postal OU adresse complète** (n° + rue + ville). Dès 3 caractères, recherche avec debounce 500 ms.
- **Géocodage via la Base Adresse Nationale** (gouv.fr, gratuit, sans clé) : l'adresse est convertie en coordonnées précises, puis les stations sont cherchées **dans le rayon choisi autour de ce point** (`js/recherche.js` `geocodeAddress`). Repli automatique sur les coordonnées de la commune (dataset prix-carburants) si la BAN est indisponible.
- **Rayons fins** : `2 / 5 / 10 / 20 / 50 km · Ville seule` (défaut **5 km**). Les distances affichées sont calculées **depuis l'adresse saisie** (la position GPS n'est pas écrasée).
- Affichage simultané : liste de suggestions + marqueurs sur la carte (Google Maps ou OSM selon la config) ; sélection possible depuis la liste **ou depuis la carte**.
- Sélection d'une suggestion → nom canonique, mise à jour dropdown, récupération des prix.

### Gestion des stations
- **Chargement dynamique** depuis l'onglet `Stations` du Google Sheet au démarrage
- **Synchronisation automatique** après chaque plein validé (nouvelles stations)
- Fallback sur liste statique si l'onglet `Stations` est inaccessible

### 📝 Auto-save brouillon (W15)
À chaque frappe (km, litres, prix, station, date), le formulaire est sauvegardé en localStorage (`suivi_e85_draft`).
Au prochain chargement, le brouillon est restauré automatiquement (après 800 ms pour laisser les stations se charger) avec un toast "📝 Brouillon restauré". Effacé après soumission réussie ou réinitialisation manuelle.

### Enregistrement
- Envoi vers Google Sheets via Google Apps Script
- Validation des champs obligatoires avant envoi
- Feedback visuel succès / erreur ; remise à zéro automatique du formulaire
- **Scroll-to-top automatique (W24)** après enregistrement réussi ou mise en file hors-ligne — le formulaire repasse en vue sans geste manuel

### 📤 Web Share API (W26)
Bouton **📤** sur chaque entrée de l'historique (recent et complet) → partage les détails d'un plein via le menu natif iOS/Android (WhatsApp, SMS, mail…).
Texte partagé : `<type> · <litres> L à <prix> €/L — <station> (<date>)`.
Si `navigator.share` n'est pas disponible (desktop Chrome, Firefox…), les boutons sont masqués automatiquement via la classe CSS `body.no-share`.

### 📜 Historique complet + filtres (W32)
Bouton **📜** dans la carte "Derniers pleins" → carte `#histoireFullCard` affichant **tous les pleins**
(aucune limite), triés du plus récent au plus ancien, avec :
- **Filtre véhicule** et **filtre type de carburant** peuplés dynamiquement depuis les données réelles
- Compteur "(N pleins)" en temps réel
- Scroll interne (max 420 px), bouton ✕ pour refermer
- Auto-rafraîchi à chaque rechargement de l'historique
- **Sync différentielle** : l'historique est mis en cache en localStorage (`suivi_e85_hist_cache`). Seuls les enregistrements postérieurs à la dernière sync (`suivi_e85_hist_since`) sont téléchargés — les sessions suivantes sont quasi-instantanées. En cas d'erreur réseau, le cache local est utilisé en fallback.

### 📥 Export CSV de l'historique (W25 + W54)
Dans l'en-tête de la carte "Tous les pleins", deux exports `.csv` :
- **📥 vue filtrée** → la **vue courante** (filtres véhicule / carburant actifs).
- **📦 tout l'historique** (W54) → **tous les pleins**, hors filtres, triés du plus récent au plus ancien.

Détails :
- Génération **100 % côté client** (`Blob` + `URL.createObjectURL` + ancre `download`), aucun aller-retour serveur.
- **Choix du séparateur** (W54) : sélecteur `;` (**Excel FR**, décimales à la **virgule**) ou `,` (**tableurs anglo-saxons**, décimales au **point** pour éviter l'ambiguïté). Choix **persisté**.
- **BOM UTF-8** (accents corrects) dans tous les cas.
- Colonnes : Date · Horodatage · Véhicule · Type · Km compteur · Litres · Prix €/L · Total € · Station.
- Nom de fichier horodaté : `suivi-conso-carburant-historique-{filtre|complet}-AAAA-MM-JJ.csv`.
- Idéal comme **justificatif** (remboursement employeur, fiscalité). Logique pure `buildHistoriqueCSV(records, sep)` couverte par tests unitaires.

### 🎤 Saisie km mains-libres (W35)
Le champ **Km compteur** est pré-rempli automatiquement au démarrage avec le kilométrage estimé par W33 (prochain plein prédit). Un bouton **🎤** permet de dicter le kilométrage à voix haute — conçu pour les motards avec des gants.

- Reconnaissance vocale `SpeechRecognition fr-FR` (API Web Speech, aucune clé requise)
- Interprète chiffres parlés : "douze mille quatre cent trente" → `12430`
- Pulse en rouge pendant l'écoute ; masqué si l'API n'est pas disponible (Firefox desktop)
- Après reconnaissance : champ rempli, validation km et contrôle doublon déclenchés automatiquement

### 🔮 Prédiction prochain plein (W33)
Affiché dans la carte Statistiques sous la sparkline : **"Prochain plein dans ~X km · ~Y j"**
et l'estimation du prochain compteur.
- Calcul basé sur les **intervalles moyens** entre pleins consécutifs (Δkm et Δjours)
- Filtre les valeurs aberrantes (Δkm < 50 ou > 5 000, Δjours > 120)
- Filtré sur le véhicule courant — nécessite ≥ 3 pleins avec kilométrage renseigné
- **Dynamique à l'ouverture** : affiche le km et les jours restants depuis aujourd'hui, pas l'intervalle figé. Si la date prévue est dépassée : "Plein prévu il y a X j"

### 📈 Graphique multi-carburant avec filtres (W28 + W34)
Courbe **SVG inline** affichée sous la grille de statistiques, avec **filtres par carburant** :
- **6 carburants** simultanés : E85, SP98, SP95, E10, Gazole, GPLc — chacun avec sa couleur dédiée
- **Toggles de filtre** : boutons par carburant activables/désactivables (persistés en localStorage `suivi_e85_spark_fuels`) — seuls les carburants avec ≥ 2 points de données s'affichent
- Axe temporel partagé (`date.getTime()`) pour aligner toutes les courbes sur une même échelle
- Tracé `<polyline>` + cercle sur le dernier point par carburant actif, sans librairie externe
- **E85** : utilise le prix payé (`Prix €/L`) sur les pleins E85 + le prix station sur les autres pleins — densité maximale
- **Autres carburants** : prix station enregistrés à chaque plein (colonnes I→N du Sheet)
- Filtré sur le véhicule courant, trié chronologiquement, 20 points max par carburant (déduplication journalière)

### 🎉 Bilan annuel « Wrapped » (W37)
Carte récap de fin d'année construite depuis l'historique (`js/wrapped.js`) :
- **Litres totaux**, **€ dépensés**, **km parcourus**, **économie E85 cumulée** (vs SP98), **station préférée**, **mois le plus cher**
- **Sélecteur d'année** (toutes les années présentes dans l'historique)
- **Bascule de périmètre** 🏍️ / 🚗🏍️ : véhicule courant ↔ tous véhicules (persistée `suivi_e85_wrapped_scope`) — le périmètre « véhicule » suit le véhicule sélectionné en haut de page
- Km parcourus = somme des deltas max−min par véhicule ; économie alignée sur la méthode du dashboard (surconsommation E85 dynamique)

### 💸 Prix payé vs moins cher du secteur (W38)
Pour chaque plein **E85**, l'historique indique l'écart au meilleur prix du secteur le jour du plein : « 💸 +X €/L vs le moins cher du secteur (Y €/L) » ou « ✅ Au meilleur prix du secteur ».
- Le **relevé quotidien (~7h)** (`RefreshPrix.gs`) complète les stations curées par un **scan des stations les moins chères dans 15 km autour de la dernière position connue** — pour **6 carburants** (E85, Gazole, SP98, SP95, E10, GPLc — *W61*) —, logue le tout dans `_PrixHistory` et mémorise le meilleur prix du jour par carburant (`SECTOR_BEST_TODAY`)
- L'app pousse la dernière position GPS au serveur (`action=saveLastGeo` → propriété `LAST_GEO`) ; elle lit le snapshot via `action=sectorPrices` (`js/secteur.js`, cache 2 h)
- Carte **« 🏆 Moins cher du secteur »** affichée à l'ouverture
- Comportement **prospectif** : l'écart n'apparaît que pour les pleins postérieurs au 1er refresh

### 🔐 Token secret sur les endpoints GAS (S6)
Le backend GAS peut exiger un **token partagé** (`APP_TOKEN`) sur toutes les requêtes de données.
- **Mode souple** : le contrôle ne s'active que si la **propriété de script** `APP_TOKEN` est définie côté Apps Script. Tant qu'elle n'est pas posée, tout fonctionne sans token (rétrocompatible).
- Token transmis en `?token=` (GET) et dans le JSON (POST) par l'app web (`js/config.js` → `APP_TOKEN`) **et** par la macro VBA (`vba/modSyncGS.bas`). La page HTML reste servie sans token.
- ⚠️ Sécurité par obscurité (le token est dans le bundle public) : relève le niveau d'accès sans être un secret cryptographique. **Activation** : poser la même valeur dans les Propriétés du script GAS (clé `APP_TOKEN`).

### 🔄 Bannière "Mise à jour disponible" (W23)
Détecte automatiquement quand un nouveau Service Worker est en attente d'activation :
- Bannière verte en haut de page avec bouton **"Actualiser"**
- Clic → `reg.waiting.postMessage({ type: 'SKIP_WAITING' })` → SW prend le contrôle immédiatement → rechargement automatique
- Détecte aussi les SW déjà en attente au chargement de la page

### 🧪 Tests E2E Playwright (T1)

Suite de 5 scénarios Playwright exécutés sur le serveur Vite local, en mode **mock GAS** (toutes les requêtes réseau sont interceptées via `page.route()`) :

| Cas | Scénario | Vérification |
|---|---|---|
| TC-01 | E85 complet → soumission succès | Feedback vert + formulaire réinitialisé + historique rechargé |
| TC-02 | SP98 complet → soumission succès | Feedback vert + formulaire réinitialisé |
| TC-03 | Champs obligatoires manquants | Feedback rouge "Champs manquants", valeurs conservées |
| TC-04 | Station non sélectionnée | Feedback rouge "Station manquante" |
| TC-05 | Erreur renvoyée par GAS | Feedback rouge "Erreur serveur" + message d'erreur + champs conservés |

```bash
npm run test:e2e          # headless Chromium
npm run test:e2e:headed   # navigateur visible
npm run test:e2e:report   # ouvre le rapport HTML
npm run test:a11y         # audit a11y axe-core (saisie/stats/historique), non-bloquant (W79)
```

### 🔁 CI — GitHub Actions (W13 + S9 + W72 + W79)
Six jobs automatiques sur chaque `push` / `pull_request` :
- **ESLint** : lint de tous les fichiers `js/` (règles `no-var`, `no-unused-vars`, `no-undef`…), **strict `--max-warnings=0`** (T11) — le moindre warning fait échouer le job
- **Tests Vitest** : **235 cas unitaires** sur 22 fichiers (utils, prix, itineraire, notifications, stationsmap, ticket/OCR, **+ state, ui, carburant, recherche, formulaire, offline, geo, carte, pwa — W72**), env `jsdom`
- **Couverture (W72)** : `npm run test:coverage` (`@vitest/coverage-v8`, provider v8) — résumé publié dans le récap du job, **non-bloquant** (`continue-on-error: true`, aucun seuil)
- **npm audit** (S9) : signale les vulnérabilités `moderate+` sur les dépendances — non-bloquant (`continue-on-error: true`)
- **Audit a11y (W79)** : `npm run test:a11y` (axe-core via Playwright sur saisie/stats/historique, WCAG 2.0/2.1 A & AA) — violations graves rapportées dans le récap du job, **non-bloquant** (`continue-on-error: true`)
- **Version check** : compare `APP_VERSION` dans `config.js` au dernier tag Git — avertissement si divergence

**Dependabot (S9)** : MAJ npm automatiques hebdomadaires (lundi 09h00 Europe/Paris) pour Tesseract.js, Vite, Vitest et les autres dépendances ; MAJ github-actions mensuellement.

### 🚀 Script de commit (`commit.sh`)

Script d'aide au versionnement (Git Bash) qui sécurise chaque commit avec le même gate que la CI :

```bash
./commit.sh "feat(scope): description [vX.Y.Z.W]"
```

Étapes : message obligatoire → **synchro de version** → `npm run lint` **+ lint VBA** (`scripts/check_vba_compile.py`, X40) → `npm test` → `git add -A` → `git commit` → `git pull --rebase origin <branche>` → `git push`. Le script **abandonne** si le message manque, si l'arbre est propre, ou si le lint JS / le lint VBA / les tests échouent. Le lint VBA (stdlib Python) détecte les `Const`/`Dim` mal placés et les appels `Call`/`OnAction`/`OnTime`/`Run` vers des procédures inexistantes dans `vba/`.

**Sortie verbeuse** : chaque étape est annoncée **`1/9` → `9/9`** avec un séparateur, une icône, un titre et le **temps écoulé** (`+Ns`) ; l'étape 2 liste les fichiers modifiés, les messages `✅ / ℹ️ / ⚠️ / ❌` distinguent succès, info, avertissement et erreur, et un **bilan final** affiche la durée totale, la branche et le hash court du commit.

**Synchro de version (T9)** : si le message contient `[vX.Y.Z.W]`, le script avertit quand `APP_VERSION` (`js/config.js`) diverge et aligne automatiquement `version` dans `package.json`.

**Hook `pre-commit` (T8)** : indépendamment de `commit.sh`, **chaque** `git commit` déclenche `lint-staged` (husky) qui passe `eslint --max-warnings=0` + `vitest related` sur les fichiers `js/` mis en scène. Réinstallé via `npm ci` (script `prepare`).

---

## 🗂️ Structure

```
suivi-conso-carburant/
├── index.html                       # Structure HTML
│
├── css/
│   └── style.css                    # Feuille de styles
│
├── excel/
│   └── Suivi Conso Carburants.xlsm        # Classeur Excel (Power Query + GS_Pleins + VBA sync v2.9)
│
├── js/                              # ── Web app (ES Modules) ────────────
│   ├── main.js                      # Point d'entrée
│   ├── router.js                    # W42 navigation par vues (onglets + hash #/saisie…) + W43 accueil + U4 vue de départ
│   ├── preferences.js               # U4 vue de départ · U5 tuile reprendre · U6 blocs Réglages repliables
│   ├── swipe.js                     # W44 gestes de navigation (swipe gauche/droite)
│   ├── badges.js                    # W45 pastilles de notification sur les onglets
│   ├── pullrefresh.js               # W46 pull-to-refresh (tirer vers le bas → recharge)
│   ├── config.js                    # APP_VERSION, FUEL_CONFIG, GAS_URL, GS_SHEET_ID, APP_TOKEN (S6)
│   ├── state.js                     # État partagé (currentType, _stationPrices…)
│   ├── utils.js                     # Fonctions pures (haversine, odsUrl…)
│   ├── ui.js                        # Helpers DOM
│   ├── vehicules.js                 # Gestion véhicules (localStorage)
│   ├── osm.js                       # Enrichissement Overpass (nom enseigne)
│   ├── carte.js                     # Carte des résultats : Google Maps (W63) ou repli tuiles OSM
│   ├── gmap.js                      # W63 chargeur Google Maps JS API + clustering (tolérant aux pannes)
│   ├── itineraire.js                # Popup infos station + itinéraire Waze/Google Maps (S11)
│   ├── carburant.js                 # Toggle type de carburant + badges header
│   ├── prix.js                      # API prix carburants + badge rentabilité E85
│   ├── rentabilite.js               # Badge rentabilité E85 vs SP98 (W5)
│   ├── geo.js                       # Géoloc + liste stations proches + W30 comparateur + W31 cache localStorage
│   ├── recherche.js                 # Recherche manuelle ville/CP/adresse (W63 géocodage BAN)
│   ├── formulaire.js                # Soumission, réinitialisation, détection doublons, auto-save brouillon W15, dictée vocale km W35
│   ├── stations.js                  # Chargement liste stations Google Sheets
│   ├── theme.js                     # Dark mode (toggle + persist localStorage)
│   ├── historique.js                # 5 derniers pleins + W32 historique complet + filtres + W26 Web Share + W90 conso L/100 par plein (computeConsoByFill)
│   ├── stats.js                     # W87 orchestration : computeStats + renderStats + résumé serveur + rapport mensuel (DOM) + carte bilan Sheets W83/W84
│   ├── statsParams.js               # W87 réglages localStorage + helpers de calcul partagés (feuille du graphe de deps)
│   ├── statsCharts.js               # W87 jauges/tuiles/graphes CO₂/budget/rentabilité (W40/W51/W55/W89) + calcul rapport mensuel
│   ├── statsSparkline.js            # W87 sparkline prix multi-carburant W28+W34 (W64/D2) + prédiction W33 + getNextKmPrediction W35
│   ├── statsSettings.js             # W87 câblage des champs de réglages (init* : kit, rentabilité, budget, objectif CO₂)
│   ├── dashboardApi.js              # W83/W84 client GAS buildDashboard (rafraîchir le bilan) + URL du Google Sheet
│   ├── statsApi.js                  # W59/S12 client agrégats serveur (cache 1 h) + résumé annuel ⚡
│   ├── theme.js                     # U8 thème clair/sombre (prefers-color-scheme + persistance)
│   ├── stationsmap.js               # Carte statique stations habituelles + prix moyens
│   ├── cartealentour.js             # W64/D3 carte stations essence les moins chères autour de moi (sélecteur carburant, rayon 5/10/15/20 km, top‑3, marqueurs enseigne+prix, zoom/plein écran)
│   ├── secteur.js                   # W38 prix mini secteur (relevé quotidien) + carte « moins cher du secteur » + W64/D2 série marché sparkline
│   ├── wrapped.js                   # W37 bilan annuel « Wrapped » (litres/€/km/éco/station/mois, véhicule↔tous)
│   ├── pwa.js                       # Installation PWA Android/iOS + bannière update W23 (W4)
│   └── ticket.js                    # Scan ticket OCR Tesseract.js + photo base64 W9 (W17)
│
├── vba/                             # ── Sync Excel ↔ Google Sheets ──────
│   ├── modSyncGS.bas                # Module sync bidir. (sync_id, bulkAdd/Update, WinHttp)
│   ├── GS_Pleins_snippet.bas        # Module feuille GS_Pleins (F1-F4 : auto sync_id,
│   │                                #   dirty flag, validation km, doublons)
│   ├── modDashboard.bas             # Tableau de bord : 10 KPIs + graphiques X7/X8
│   ├── modGraphiques.bas            # Onglet « Graphiques » : 11 graphes natifs + KPIs
│   │                                #   (CreerGraphiquesWeb) — dashboard moderne (bandeau,
│   │                                #   charte app), 3 graphes « rentabilité kit » (X27/X28/X29),
│   │                                #   boutons PNG cliquables, auto-recréé en fin de sync +
│   │                                #   à l'ouverture de l'onglet, refresh incrémental, export PDF
│   ├── Graphiques_snippet.bas       # Snippet feuille « Graphiques » : Worksheet_Activate
│   │                                #   → refresh auto à l'ouverture (anti-rebond 15 s)
│   ├── modFeatures.bas              # X4 MFC « Prix €/L » + X14 « Suivi (auto) » +
│   │                                #   Tableau2 vue dérivée + VerifierInstallation
│   ├── modSaisie.bas                # Moteur saisie (ValiderSaisie/EstDoublon/EnregistrerPlein
│   │                                #   /DernierVehicule) + UserForm frmPleinE85 généré par code
│   ├── frmNouveauPlein.frm/.frx     # Formulaire de saisie perso (présentation custom) →
│   │                                #   enregistre dans GS_Pleins via modSaisie
│   └── ThisWorkbook_snippet.bas     # Snippet Workbook_Open à coller
│
├── .github/
│   └── workflows/
│       ├── ci.yml                   # W13+S9 : ESLint + Tests + npm audit + APP_VERSION
│       ├── deploy.yml               # W12 : build Vite → GitHub Pages
│       └── dependabot.yml           # S9 : MAJ npm hebdo + github-actions mensuel
│
├── tests/
│   ├── e2e.spec.js                  # Tests E2E Playwright (TC-01 → TC-05, mock GAS)
│   └── *.test.js                    # Tests unitaires Vitest (utils, prix…)
│
├── package.json                     # Config npm (Vite + ESLint + Vitest + Playwright + Tesseract.js)
├── vite.config.js                   # Config Vite + Vitest
├── playwright.config.js             # Config Playwright (Chromium headless, webServer Vite)
├── eslint.config.js                 # Flat config ESLint 9
│
├── Google Drive/                    # ── Sauvegardes et exports externes ─
│   ├── Réponses - Suivi Conso Carburants.xlsx
│   └── Sauvegarde & Geolocalisation - Suivi conso SuperEthanol/
│       └── Google Apps Script/
│           ├── Code.gs              # Backend GAS (16 col + sync bidir. + ?since= + rate limiting + savePushSub/lowprice + S6 token + W38 saveLastGeo/sectorPrices)
│           ├── RapportMensuel.gs    # X16 trigger 1er du mois → MailApp.sendEmail() bilan mensuel
│           ├── RefreshPrix.gs       # S8/W38 trigger quotidien ~7h → _PrixHistory + scan 15 km autour LAST_GEO + SECTOR_BEST_TODAY
│           ├── WebPush.gs           # S10 Web Push VAPID (ES256/P-256 pur JS) — alerte prix E85 bas
│           ├── index.html           # Page HTML servie par GAS (standalone)
│           └── GAS_UPDATE.md        # Doc : actions doPost, schéma 16 cols, migrations
│
├── _headers                         # Headers Netlify (CSP, X-Frame-Options, Referrer-Policy…)
├── README.md
├── CHANGELOG.md
├── ROADMAP.md                       # Propositions d'amélioration (web/Excel/sync)
└── .claude/
    ├── settings.json
    └── commands/
        ├── commitMe.md
        └── majFilesMe.md
```

---

## ⚙️ Configuration

> 📊 **Google Sheet** : https://docs.google.com/spreadsheets/d/1uN170kt_n45sBRwqs2krTYfhapU3dMKjTguD-qSUqCE/edit
> ⚙️ **Google Apps Script** : Google Sheet → Extensions → Apps Script *(le fichier source est dans `Google Drive/Sauvegarde & Geolocalisation - Suivi conso SuperEthanol/Google Apps Script/Code.gs`)*

### 1. Google Apps Script (backend)

Le code complet et à jour se trouve dans [`Google Drive/.../Code.gs`](Google%20Drive/Sauvegarde%20%26%20Geolocalisation%20-%20Suivi%20conso%20SuperEthanol/Google%20Apps%20Script/Code.gs).
Voir [`GAS_UPDATE.md`](Google%20Drive/Sauvegarde%20%26%20Geolocalisation%20-%20Suivi%20conso%20SuperEthanol/Google%20Apps%20Script/GAS_UPDATE.md) pour les instructions de déploiement et le détail de toutes les actions.

Actions `doPost` disponibles :

| Action | Émetteur | Rôle |
|---|---|---|
| _(aucune)_ | App web | Enregistrement d'un plein (cols A→P) — col P = URL Drive photo ticket si scannée |
| `addStation` | App web | Ajout d'une station dans l'onglet `Stations` |
| `syncStations` | App web | Remplacement complet de l'onglet `Stations` |
| `addVehicule` | App web | Ajout d'un véhicule dans l'onglet `Vehicules` |
| `removeVehicule` | App web | Suppression d'un véhicule |
| `deletePlein` | App web | **S3** — suppression d'un plein : *soft-delete* (tombstone col R `Supprimé`), propagée aux autres clients via `deleted:[…]` |
| `bulkDelete` | VBA Excel | **S3** — suppressions en lot Excel → GS (`ids[]` → tombstones) |
| `bulkAdd` | VBA Excel | Import initial Excel → GS (dédupliqué par `sync_id`) |
| `bulkUpdate` | VBA Excel | MAJ bidirectionnelle Excel → GS — **S5** : arbitrage par horodatage (`modifiedAt` vs col Q `Modifié_le`) |
| `scanTicket` | App web | Analyse IA du ticket via Gemini 2.0 Flash → JSON (date, km, litres, prix/L, total, type, station) ; moteur principal du scan, fallback Tesseract.js côté navigateur si indisponible |
| `saveLastGeo` | App web | W38 — mémorise la dernière position connue (`LAST_GEO`) pour le scan 15 km du refresh ~7h |

Actions `doGet` (données) : `export` (historique JSON, `?since=` ; renvoie `records` actifs **+ `deleted:[sync_id…]`** pour la suppression bidirectionnelle S3), `lowprice` (dernier prix E85 bas), `sectorPrices` (W38 — prix mini secteur par jour + meilleur prix du jour), `stats` (S12 — agrégats pré-calculés).

> 🔐 **S6 — Token** : si la **propriété de script** `APP_TOKEN` est définie (Apps Script → Paramètres → Propriétés du script), toutes les actions de données exigent le même token (`?token=` en GET, champ `token` en POST). À défaut, aucun contrôle (rétrocompatible). Coller la même valeur dans `js/config.js` (`APP_TOKEN`) **et** `vba/modSyncGS.bas`.

### 2. Connecter le formulaire

Dans `js/config.js` :

```javascript
export const APP_VERSION    = '3.0.0.3';
export const GAS_URL        = 'https://script.google.com/macros/s/VOTRE_ID_GAS/exec';
export const GS_SHEET_ID    = 'VOTRE_ID_GOOGLE_SHEET';
export const HIST_CACHE_KEY = 'suivi_e85_hist_cache';   // cache localStorage historique
export const HIST_SINCE_KEY = 'suivi_e85_hist_since';   // timestamp dernière sync
export const DRAFT_KEY      = 'suivi_e85_draft';        // brouillon formulaire (W15)
export const CLIENT_ID_KEY  = 'suivi_e85_client_id';    // UUID client rate limiting (S7)
```

#### Carte Google Maps (optionnel — W63)

```javascript
export const GOOGLE_MAPS_API_KEY = '';   // vide ⇒ repli carte OpenStreetMap (défaut)
export const GOOGLE_MAPS_MAP_ID  = '';   // optionnel ⇒ marqueurs « Advanced » (supprime le warning de dépréciation)
```

La carte des résultats de recherche peut être rendue avec **Google Maps interactif** (zoom, glisser, clusters). Pour l'activer :

1. **Google Cloud Console** → créer/sélectionner un projet et **activer la facturation** (obligatoire, même pour le quota gratuit).
2. **APIs & Services** → activer **« Maps JavaScript API »**.
3. **Identifiants** → **Créer une clé API**, puis la **restreindre** :
   - *Restrictions d'API* → **Maps JavaScript API** uniquement ;
   - *Restrictions d'application* → **Sites web (referrers HTTP)** : `https://fdaubercy.github.io/*`, `http://localhost:5173/*`, `http://localhost:4173/*`.
4. Coller la clé dans **`js/config.js`** (`GOOGLE_MAPS_API_KEY`).
5. *(Optionnel, recommandé)* Pour des marqueurs **`AdvancedMarkerElement`** et **supprimer l'avertissement de dépréciation** `google.maps.Marker` : Google Maps → **« Gestion des cartes »** → créer un **ID de carte** (type *JavaScript*) → le coller dans `GOOGLE_MAPS_MAP_ID`. Sans Map ID, des marqueurs classiques (fonctionnels) sont utilisés.

> 🔒 Une clé d'API JS est **nécessairement publique** (servie au navigateur) : la **restriction par domaine** est la vraie protection. 👉 **Bascule souple** : tant que `GOOGLE_MAPS_API_KEY` reste vide, la carte utilise le **rendu OpenStreetMap maison** (comportement actuel) — aucune régression, aucune clé requise. Le géocodage d'adresse (Base Adresse Nationale) reste **gratuit et sans clé** dans tous les cas.

### 3. Google Sheet cible

**Onglet `_ImportGS`** (16 colonnes A→P) :

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Horodatage | Date | Type | Km | Litres | Prix €/L | Station | Véhicule | E85 st. | SP98 st. | SP95 st. | E10 st. | Gazole st. | GPLc st. | sync_id | Photo ticket |

> Les colonnes I→N sont remplies automatiquement par l'app via l'API prix carburants lors de la sélection d'une station.
>
> La colonne **O `sync_id`** est un UUID utilisé pour la déduplication et la synchronisation bidirectionnelle Excel ↔ Google Sheets.
>
> La colonne **P `Photo ticket`** (W9) contient l'URL Drive de la photo du ticket quand elle a été scannée avant l'enregistrement. Migration automatique : `getOrCreateSheet()` ajoute la colonne P si le Sheet existant n'en a que 15.

**Onglet `Stations`** · **Onglet `Vehicules`** : une entrée par ligne, colonne A, sans en-tête obligatoire.

---

## 🔄 Synchronisation bidirectionnelle Excel ↔ Google Sheets

Depuis v2.9.0.0 (suppression bidirectionnelle S3 en v4.8.0.0), le classeur `excel/Suivi Conso Carburants.xlsm` synchronise son onglet `GS_Pleins` avec `_ImportGS` :

### Principe
Chaque enregistrement est identifié par un **UUID** (`sync_id`, colonne O). À la saisie comme au sync, la macro VBA :

0. **Suppressions GS → Excel (S3)** : `handleExport` renvoie `deleted:[sync_id…]` (lignes *tombstone* col R `Supprimé` côté GS) → `ApplyGSDeletions` retire les lignes locales correspondantes
1. **GS → Excel (nouvelles lignes)** : lignes présentes dans GS et absentes d'Excel → `appendRow`
2. **GS → Excel (MAJ)** : lignes existantes non modifiées localement (col Q `Modifie_local` vide) + valeurs GS différentes → `UpdateRowFromGS`
3. **Excel → GS (nouvelles lignes)** : lignes locales absentes de GS → POST `action=bulkAdd`
4. **Excel → GS (modifications)** : lignes modifiées localement (col Q renseignée) et connues de GS → POST `action=bulkUpdate` ; col Q effacée après succès
5. **Excel → GS (suppression, S3)** : `SupprimerPleinExcel` → POST `action=bulkDelete` (`ids[]`) puis suppression de la ligne locale

**Résolution de conflits (S5, v4.8.0.0)** : si une ligne est modifiée des deux côtés, on garde le **plus récent** par horodatage — col Q Excel (`Modifie_local`) comparée au champ GS `Modifié_le`. L'arbitrage se fait côté VBA (`ImportGSToExcel`) **et** côté serveur (`handleBulkUpdate` n'écrase que si `modifiedAt` reçu ≥ `Modifié_le` existant). **`ForceResync`** (S4) vide la table locale et ré-importe tout depuis GS.

### P1 — Paramètres métier partagés (onglet `Parametres`)

Depuis **v4.10.0.0**, les paramètres **métier** modifiables par l'utilisateur ne vivent plus uniquement en `localStorage` (app) ou dans des cellules Excel : ils sont centralisés dans un **onglet `Parametres` du Google Sheet** (table `cle | valeur | modifie_le`), **source de vérité unique** synchronisée entre l'app web et le classeur Excel.

| Clé Sheet | App (`localStorage`) | Excel (cellule) |
|---|---|---|
| `kit_prix` | `suivi_e85_kit_prix` | `Suivi Carburant!B5` |
| `budget_mensuel` | `suivi_e85_budget_mensuel` | `Graphiques!B2` |
| `objectif_co2` | `suivi_e85_objectif_co2` | `Graphiques!B3` |
| `surconso` | `suivi_e85_surconso` (repli) | `Suivi Carburant!J7` |
| `seuil_E85/GAZOLE/SP98` (+`_enabled`) | `notif_<F>_seuil` / `_enabled` | `Notes` bloc F/G/H (miroir) |

- **Méthode : last-write-wins par clé** sur un horodatage epoch (ms **UTC**) — la même logique que la sync des pleins. Chaque côté conserve un horodatage local par clé (app : `suivi_e85_params_meta` ; Excel : colonne `modifie_le` du miroir). À la synchro, pour chaque clé la valeur la plus récente l'emporte ; les valeurs locales plus récentes sont poussées vers le Sheet.
- **App** : `syncParametres()` au démarrage (`js/parametres.js`) + `pushParam()` à chaque édition d'un réglage (kit/budget/objectif CO₂/seuils). L'UI se rafraîchit via l'événement `parametres-synced`.
- **Excel** : `modSyncParametres.SyncParametres()`, appelé en fin de `SyncCore` (`modSyncGS`). Le **miroir local** (cle/valeur/modifie_le) est stocké dans le bloc **F/G/H de l'onglet technique `Notes`** (déjà masqué, qui contient déjà `tbl_carburant` et `tbl_stationEssence`) — **aucun nouvel onglet créé**. Écriture traversante vers les cellules du dashboard (garde-fou : une cellule contenant une **formule** n'est jamais écrasée). Horodatage UTC via `SWbemDateTime`.
- **Endpoints GAS** : `?action=getParametres` (lecture) et `action=setParametres` (upsert LWW, clés métier filtrées). ⚠️ Nécessite un **redéploiement** du Web App.
- **Hors périmètre** (volontairement local à l'appareil) : thème, vue de départ, blocs repliés, tri carte, séparateur CSV. Les **véhicules** gardent leur propre onglet `Vehicules`.

> Note de migration : les réglages saisis dans l'app **avant** la v4.10.0.0 n'ont pas d'horodatage ; ils ne sont pas écrasés mais ne remontent au Sheet qu'à leur **prochaine modification**. Idem pour les valeurs par défaut des cellules Excel (seedées avec un horodatage `0`, donc l'app/le Sheet font foi).

### Col Q (Excel) — dirty flag · cols Q/R (GS) — S3/S5
La colonne **Q `Modifie_local`** (Excel, interne) est un horodatage `Now()` posé automatiquement par le module feuille `GS_Pleins` à chaque modification (A:N). Elle signale à `ExportModificationsToGS` que la ligne doit être propagée vers GS, sert d'horodatage de conflit (S5) et est effacée après confirmation du serveur (`status:'ok'`).

Côté **Google Sheet** (`_ImportGS`), v4.8.0.0 ajoute deux colonnes (créées automatiquement par `ensureSyncColumns_`) : **Q `Modifié_le`** (horodatage serveur de dernière modif — arbitrage S5) et **R `Supprimé`** (tombstone *soft-delete* S3 ; vide = actif). ⚠️ Ne pas confondre la col Q **Excel** (`Modifie_local`, hors schéma GS) et la col Q **GS** (`Modifié_le`).

### Événements temps réel dans GS_Pleins (v2.9.0.0)
Le module `GS_Pleins_snippet.bas` ajoute un `Worksheet_Change` qui se déclenche à chaque saisie :

| Feature | Déclencheur | Comportement |
|---|---|---|
| **[F1] Auto sync_id** | Toute modif A:N | UUID généré en col O si absent |
| **[F2] Dirty flag** | Toute modif A:N | `Now()` inscrit en col P |
| **[F3] Validation km** | Saisie col D | Warning si km < max km du véhicule |
| **[F4] Détection doublons** | Saisie col B, D ou E | Warning si Date + Km + Litres identiques |

### Installation
```
Alt+F11 → Fichier → Importer → vba/modSyncGS.bas + vba/modSyncParametres.bas + vba/modGraphiques.bas
                              + vba/modDashboardGraphiques.bas + vba/modDashboardKPI.bas + vba/modPrixStation.bas
Dans Microsoft Excel Objects → GS_Pleins : coller vba/GS_Pleins_snippet.bas
Dans Microsoft Excel Objects → Graphiques : coller vba/Graphiques_snippet.bas (refresh auto onglet + recalcul KPI au changement B5/B6)
Dans "ThisWorkbook" : coller vba/ThisWorkbook_snippet.bas
Power Query → GS_Pleins → Éditeur avancé : coller powerquery/GS_Pleins.m
Power Query → Requête vide « PrixHistory » → Éditeur avancé : coller powerquery/PrixHistory.m (conserver le nom de table « PrixHistory »)
GAS Editor → exécuter migrateSyncId() une seule fois (UUID sur lignes existantes)
GAS → Déployer → Nouvelle version (S3/S5 : colonnes Q/R ajoutées au 1ᵉ appel)
Boutons (facultatif) : assigner SupprimerPleinExcel et ForceResync (modSyncGS) à des shapes
Boutons PNG dashboard : garder le dossier excel/assets/ à côté du classeur (repli Shape sinon)
Token S6 : coller la valeur APP_TOKEN (js/config.js) dans vba/modSyncGS.bas
          ET dans GAS → Propriétés du script → APP_TOKEN (sinon le contrôle reste désactivé)
```

### Requête Power Query `GS_Pleins` (`powerquery/GS_Pleins.m`)
La table `GS_Pleins` est alimentée **à la fois** par la Power Query (lecture CSV de l'onglet `_ImportGS` via gviz) **et** par le VBA `modSyncGS`. Règle de colonnes à respecter pour éviter tout conflit :

| Colonnes | Source | Détail |
|---|---|---|
| **A → N** (14 cols data) | Power Query | Horodatage … GPLc station (le schéma GAS courant **ne contient plus** « Prix S98 jour », supprimée en v2.3.0.0) |
| **O** `sync_id` | Power Query + VBA | clé de synchro ; chargée par la requête, écrite aussi par le VBA |
| **P** `Photo ticket` | Power Query + VBA | URL Drive de la photo du ticket (saisie par la web app) ; **importée depuis le GS** (v4.3.0.5), jamais renvoyée vers le GS |
| **Q** `Modifie_local` | **VBA seul** | dirty-flag de synchro bidirectionnelle — colonne **interne** au classeur, hors schéma GS ; **déplacée de P en Q en v4.3.0.5** pour laisser la place à `Photo ticket` |

> ⚠️ Évolutions du code M : v4.3.0.4 a retiré l'ancienne `PrixS98` (supprimée du GAS en v2.3.0.0) qui décalait le mapping à partir de la col 7 ; v4.3.0.5 ajoute `Photo ticket` (col P) et déplace `Modifie_local` en col Q. **Les consts VBA `COL_PHOTO = 16` et `COL_MODIFIED = 17` (`modSyncGS.bas` / `GS_Pleins_snippet.bas`) doivent rester cohérentes avec cette disposition.** En cas de divergence classeur ↔ dépôt, **`powerquery/GS_Pleins.m` et `vba/*.bas` font foi**.

### Fonctions VBA exposées

| Fonction | Usage |
|---|---|
| `SyncOnOpen` | Sync silencieuse à l'ouverture (appelée par `Workbook_Open`) |
| `SyncManuel` | Sync manuelle complète (4 directions) avec compte-rendu |
| `EnsureSyncButtonGSPleins` | X1 — pose un bouton vert **« Synchroniser »** (→ `SyncManuel`) sur la feuille `GS_Pleins` ; idempotent, posé par `Installer` |
| `SyncDiagnose` | Compteurs GS/Excel/intersections/dirty pour debug |
| `TestConnexion` | Vérifie l'accès au GAS (code HTTP + extrait JSON) |
| `ForceFormatDates` | Applique le format date français + initialise col P |

### Architecture technique
- **HTTP** : `WinHttp.WinHttpRequest.5.1` (natif Windows, gère les redirections HTTPS Google), fallback `MSXML2.XMLHTTP60`
- **JSON parser** : minimaliste maison (Split sur `},{` — suffisant pour le JSON plat exporté)
- **Format dates** : `dd/mm/yyyy hh:mm:ss` appliqué automatiquement sur colonnes Horodatage et Date
- **Heure locale** : GAS exporte via `Utilities.formatDate(v, tz, "yyyy-MM-dd HH:mm:ss")` (timezone du Sheet, pas UTC)

---

## 📊 Analyse Excel — MFC, vue dérivée & saisie (v3.3.0.0)

Module `vba/modFeatures.bas` (X4 + X14) et `vba/modSaisie.bas` (formulaire).

### X4 — Mise en forme conditionnelle « Prix €/L »
`AppliquerMFCPrix` colore la colonne **Prix €/L** selon la rentabilité immédiate :
- 🟩 **vert** si le prix de la ligne est **inférieur** à la moyenne des **30 jours précédents** pour le **même carburant** ;
- 🟥 **rouge** s'il est **supérieur**.

Les colonnes Date / Type / Prix sont détectées **par en-tête** (pas d'index figé), la moyenne glissante est une formule `AVERAGEIFS` (prix du même type sur `[date−30 ; date]`). Appliquée sur **`GS_Pleins`** *et* **`Suivi Carburant`**.

### X14 — Onglet « Suivi (auto) » (vue dérivée)
`CreerSuiviAuto` reconstruit une table **en lecture seule** dont la **source unique de vérité** est le tableau de `GS_Pleins` : chaque cellule est une formule `INDEX(Tbl[Col]; k)`. Plus de double saisie ni de désynchronisation. Colonnes : Date · Type · Véhicule · Km compteur · Nb km · Litres · Prix €/L · Coût plein · L/100 km · Station. Bouton **« ↻ Rafraîchir »** intégré. `RafraichirFeatures` lance MFC + vue d'un coup.

### Formulaire de saisie d'un plein
`NouveauPlein` génère par code le UserForm **`frmPleinE85`** (Véhicule / Carburant / Date / Km / Litres / Prix / Station) : listes déroulantes auto (feuilles `Vehicules`/`Stations` ∪ valeurs distinctes de `GS_Pleins`), coût calculé en direct, **validation km rétrograde** et **détection de doublon** (date + km + litres), puis ajout dans `GS_Pleins` avec `Horodatage` + `sync_id` UUID. `AjouterBoutonSaisie` pose un bouton « + Nouveau plein ».

> ⚠️ La génération du UserForm par code nécessite **« Accès approuvé au modèle objet du projet VBA »** (Fichier → Options → Centre de gestion de la confidentialité → Paramètres des macros).

---

## 📧 Rapport mensuel automatique (X16)

Module `Google Apps Script/RapportMensuel.gs` : un **trigger temporel** (le **1er du mois**, ~8 h) appelle `envoyerRapportMensuel()` qui calcule le bilan du **mois écoulé** et l'envoie par **`MailApp.sendEmail()`** (corps HTML), signé **« Suivi Conso. Carburants »**. Le mois est affiché au format **nom propre** (ex. « Avril 2026 »).

Indicateurs : nombre de pleins (dont E85), total €, litres consommés, distance parcourue, consommation moyenne, **économie E85 vs SP98** (surconsommation +20 % prise en compte, même méthode que l'app web / le dashboard Excel).

| Fonction | Usage |
|---|---|
| `installerTriggerRapportMensuel()` | À exécuter **une fois** (autorise l'accès Gmail) |
| `testRapportMensuel()` | Envoie immédiatement le rapport du mois précédent |
| `supprimerTriggerRapportMensuel()` | Désactive le rapport |

Destinataire = compte qui exécute le script (`Session.getEffectiveUser`) ou adresse forcée via `RAPPORT_EMAIL`.

> 📱 **Consultable dans l'app** : la carte « 📅 Rapport mensuel » (avec sélecteur de mois) reproduit le bilan directement dans le formulaire web (`js/stats.js` `renderRapportMensuel`), sans attendre l'e-mail.

---

## 🔄 Refresh quotidien des prix + Web Push (S8 + S10)

Module `Google Apps Script/RefreshPrix.gs` : un **trigger temporel quotidien** (`everyDays(1)`, ~7 h) appelle `refreshPrixCarburants()` qui parcourt l'onglet **`Stations`**, extrait la ville de chaque nom (`Enseigne - Ville`), récupère le **prix le plus bas** de la commune (E85/Gazole/SP98) via l'API gouv + un scan 15 km autour de la dernière position, et logue chaque relevé dans un onglet **`_PrixHistory`** (Station, Date, Type, Prix €/L) → historique exploitable pour des graphiques d'évolution.

#### Côté Excel — prix marché (X30/X31/X34)

La requête Power Query **`PrixHistory`** (`powerquery/PrixHistory.m`) importe cet onglet `_PrixHistory` (gviz CSV `sheet=_PrixHistory`) dans une table locale `PrixHistory` (Station | Date | Type | Prix), **source de vérité des prix marché** côté classeur (accessible hors-ligne, rafraîchie à la demande). Elle alimente :
- le **graphique `gPrice`** « Évolution du prix » — `modGraphiques.BuildAggregates` reconstruit le bloc prix (`_GraphData!G:J`) à partir de `PrixHistory` (prix le moins cher du jour par carburant), avec **repli automatique** sur les prix des pleins si la table est absente ;
- la **feuille « Prix par Station »** — `modPrixStation.MAJ_PrixParStation` y écrit le **dernier prix marché** par couple Station × Carburant (`max(Date)`), plus une colonne « Maj le ».

#### Sélecteurs & KPI dynamiques de l'onglet « Graphiques » (X32/X33)

Deux listes déroulantes en **`B5` (véhicule)** et **`B6` (carburant)** — alimentées par les valeurs distinctes de `GS_Pleins`, défaut = **dernier plein** — pilotent le recalcul des 3 cartes KPI **Conso moyenne**, **Coût aux 100 km** et **Économies E85 vs SP98** (`modDashboardKPI.ComputeKPIs`, calcul à la volée depuis `GS_Pleins`, surconso E85 lue dans `Suivi Carburant!J7`). Le `Worksheet_Change` de la feuille relance le recalcul à chaque changement de sélection.

#### X36/X37 — « Graphiques » devient le « Tableau de bord » + réactivité totale (v4.11.0.0)

Refonte (Phase 2) faisant de l'onglet visuel l'unique tableau de bord, **entièrement réactif** aux sélecteurs véhicule/carburant.

- **Réactivité totale** : KPI, bandeau méta, carte CO2 **et tous les graphiques temporels** se recalculent selon `B5`/`B6`. `modGraphiques.BuildAggregates` filtre la boucle `Tableau2` (véhicule + carburant) ; `BuildPriceBlockMerged` se limite au carburant choisi ; la **comparaison véhicules** reste globale (croisée par nature). Le `Worksheet_Change` du module feuille couvre `B2:B6` et reconstruit données filtrées + mise en page.
- **Découplage** : `modDashboardGraphiques.BuildHeaderAndKPIs` ne lit plus aucun autre onglet ; tout vient de `modDashboardKPI.ComputeDashboardStats` (depuis `GS_Pleins`, full-to-full). Un 2ᵉ bandeau méta affiche **Dépense totale**, **Prix moyen** et **Date du dernier plein** (fusion de l'ancien dashboard).

##### Procédure de renommage (à faire dans Excel, dans cet ordre)

> L'ordre évite la collision de noms (deux onglets ne peuvent pas s'appeler « Tableau de bord »).

1. Clic droit sur l'onglet **« Tableau de bord »** (l'ancien, liste de KPI) → Renommer → **« Tableau de bord 2 »**.
2. Clic droit sur l'onglet **« Graphiques »** → Renommer → **« Tableau de bord »**.
3. `Alt+F11` → importer/réimporter `modGraphiques.bas`, `modDashboardGraphiques.bas`, `modDashboardKPI.bas`, `modSyncGS.bas` ; coller `Graphiques_snippet.bas` dans le **module feuille** du nouveau « Tableau de bord ». Puis **Débogage → Compiler VBAProject**.
4. Vérifier (checklist) : ouvrir le « Tableau de bord », changer `B5`/`B6` → KPI, méta, CO2 et graphiques se mettent à jour ; le 2ᵉ bandeau méta affiche dépense/prix moyen/dernier plein ; une synchro (`SyncManuel`) recrée bien les graphiques.

##### Modules / onglets devenus inutiles (à supprimer après validation)

| Élément | Pourquoi |
|---|---|
| Onglet **« Tableau de bord 2 »** | Ses valeurs utiles sont fusionnées dans le nouveau dashboard ; plus aucun code ne le lit. |
| Module **`modDashboard.bas`** | Legacy v2.5.0.0 : `CreerTableauDeBord`/`CreerGraphiques` ne sont appelés par aucun flux et écrivaient des graphiques concurrents. |
| Module **`synchroniseGoogleForm.bas`** *(optionnel)* | Ancienne synchro Google Form (URL GAS obsolète), remplacée par `modSyncGS`. |

> ⚠️ Ne supprimer qu'**après** avoir vérifié la checklist ci-dessus. Suppression VBA : `Alt+F11` → clic droit sur le module → *Supprimer*. Suppression onglet : clic droit → *Supprimer*.

| Fonction | Usage |
|---|---|
| `installerTriggerRefreshPrix()` | À exécuter **une fois** (installe le trigger quotidien) |
| `testRefreshPrix()` | Lance le refresh immédiatement |
| `supprimerTriggerRefreshPrix()` | Désactive le refresh |

**Notification push (S10)** — module `Google Apps Script/WebPush.gs` : quand le refresh détecte un prix E85 **≤ seuil** (`SEUIL_PUSH_E85`, défaut 0,700 €/L), une **Web Push VAPID** est envoyée aux appareils abonnés **même app fermée**. Push **sans payload** (le Service Worker récupère le détail via `?action=lowprice`) ; le JWT **ES256 / P-256** est signé via la librairie **jsrsasign** chargée à la volée (Apps Script ne supportant pas `BigInt`).

Mise en place (une fois) :

1. Apps Script → exécuter **`generateVapidKeys()`** → copier la clé publique loggée.
2. La coller dans `js/config.js` : `export const VAPID_PUBLIC_KEY = '<clé>';` puis redéployer l'app.
3. Activer le toggle **🔔 Alertes prix E85** dans l'app (abonnement envoyé à GAS → onglet `_PushSubs`).
4. (Optionnel) Propriétés du script : `VAPID_SUBJECT` (`mailto:…`), `SEUIL_PUSH_E85`.
5. Tester : `testEnvoyerPush()`.

> Sans clé VAPID configurée, le push est désactivé et seules les **alertes locales** (app ouverte) restent actives.

---

## 🗺️ Carte interactive

Moteur de rendu sans librairie externe :
- Tuiles OpenStreetMap chargées dynamiquement selon le bounding box
- Marqueurs positionnés via la projection Mercator (formule standard)
- Zoom optimal calculé automatiquement pour englober toutes les stations
- Attribution © OSM affichée conformément à la licence ODbL

---

## 🏷️ Identification des stations — Architecture

```
API gouvernementale (data.economie.gouv.fr)
        ↓  adresse, ville, cp, e85_prix, sp98_prix, geom, services
        ↓
enrichWithOsmSerial(stations, setStatus)
        ↓  requête Overpass around:2000m [amenity=fuel]
        ↓  priorité : brand > name > operator
        ↓
  → nom enseigne OSM    (ex. "Intermarché")
  → fallback : stationLabel(r) = adresse capitalisée

stationSubLabel(r)
  → adresse · cp · VILLE  (ex. "2 Rue de la Paix · 62660 · BEUVRY")
```

> L'enrichissement OSM s'applique désormais à la **géolocalisation ET à la recherche manuelle**.
> Fallback sur l'adresse gouvernementale si Overpass ne retourne aucun résultat.

---

## 🔧 Dépannage GAS

### "Vous n'êtes pas autorisé à appeler UrlFetchApp.fetch"

**Symptôme** : une action GAS utilisant `UrlFetchApp` retourne l'erreur :
> `Vous n'êtes pas autorisé à appeler UrlFetchApp.fetch. Autorisations requises : https://www.googleapis.com/auth/script.external_request`

**Cause** : le scope `script.external_request` (accès réseau externe) n'a pas été autorisé lors du déploiement initial.

**Correction — étape 1 : déclarer le scope dans le manifeste**

1. Ouvrir le Google Sheet → **Extensions → Apps Script**
2. **⚙️ Paramètres du projet** → cocher **"Afficher le fichier manifeste appsscript.json"**
3. Ouvrir `appsscript.json` et ajouter le bloc `oauthScopes` :
```json
{
  "timeZone": "Europe/Paris",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" },
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/script.scriptapp",
    "https://www.googleapis.com/auth/script.send_mail",
    "https://www.googleapis.com/auth/userinfo.email"
  ]
}
```

| Scope | Utilisé par |
|---|---|
| `spreadsheets` | lecture/écriture du Google Sheet |
| `script.external_request` | `UrlFetchApp.fetch` (scan Gemini, sync) |
| `script.scriptapp` | `ScriptApp` — déclencheurs du **rapport mensuel** (X16) |
| `script.send_mail` | `MailApp.sendEmail()` — **rapport mensuel** (X16) |
| `userinfo.email` | `Session.getEffectiveUser().getEmail()` — destinataire auto du rapport |

4. Sauvegarder (`Ctrl+S`)

**Correction — étape 2 : autoriser**

Exécuter n'importe quelle fonction dans l'éditeur (ex. `migrateSyncId`) :
- **Une fenêtre "Autorisation requise" s'ouvre** → Examiner les autorisations → choisir son compte → **Autoriser** → passer à l'étape 3.
- **Aucune fenêtre** → le scope est déjà autorisé pour ce compte (c'est normal). Passer directement à l'étape 3.

**Correction — étape 3 : redéployer**

**Déployer → Gérer les déploiements** → crayon ✏️ → **Nouvelle version → Déployer**

---

**Si l'erreur persiste après le redéploiement** — révoquer et réautoriser depuis zéro :

1. Aller sur [myaccount.google.com/permissions](https://myaccount.google.com/permissions)
2. Trouver **"Google Apps Script"** (ou le nom du script) → **Supprimer l'accès**
3. Retourner dans l'éditeur GAS → exécuter une fonction → la fenêtre réapparaît avec **tous** les scopes → **Autoriser**
4. Redéployer (nouvelle version)

> Le GAS s'exécute sous l'identité du propriétaire du script (« Execute as: Me »). Chaque scope doit être consenti par le propriétaire. Un déploiement n'hérite que des scopes autorisés au moment de sa création — d'où la nécessité de redéployer après toute nouvelle autorisation.

---

### ⏰ Erreur déclencheur rapport mensuel — *« Specified permissions are not sufficient to call ScriptApp.getProjectTriggers »*

À l'exécution de `installerTriggerRapportMensuel()` :

> `Exception: Specified permissions are not sufficient to call ScriptApp.getProjectTriggers. Required permissions: https://www.googleapis.com/auth/script.scriptapp`

**Cause** : le projet a été autorisé pour `Code.gs` mais sans les scopes `script.scriptapp` (déclencheurs) ni `script.send_mail` (envoi mail) requis par `RapportMensuel.gs`. La liste de scopes étant figée, GAS ne redemande pas l'autorisation seul.

**Correction** :
1. Ajouter `script.scriptapp`, `script.send_mail` et `userinfo.email` au bloc `oauthScopes` du manifeste (voir tableau ci-dessus) → **Ctrl+S**.
2. Ré-exécuter `installerTriggerRapportMensuel` → la fenêtre **« Autorisation requise »** s'ouvre (la liste de scopes a changé) → **Autoriser** (écran « non vérifiée » → *Paramètres avancés → Accéder à…*).
3. Vérifier le déclencheur créé dans l'icône ⏰ **Déclencheurs**. *(Pas de redéploiement nécessaire : un trigger temporel n'est pas l'application web.)*
4. Tester avec `testRapportMensuel` → réception immédiate du bilan du mois précédent.

---

## 🔒 Sécurité — Content Security Policy

Une CSP est appliquée via deux mécanismes complémentaires :

| Mécanisme | Fichier | Usage |
|---|---|---|
| `<meta http-equiv="Content-Security-Policy">` | `index.html` | Tous hébergeurs (GitHub Pages, etc.) |
| `Content-Security-Policy:` header HTTP | `_headers` | Netlify |

**Origines autorisées (`connect-src`)** :

| Domaine | Usage |
|---|---|
| `data.economie.gouv.fr` | API prix carburants ODS |
| `script.google.com` | Google Apps Script (POST pleins) |
| `docs.google.com` | Export CSV stations / véhicules |
| `overpass-api.de` | OSM Overpass (enrichissement enseignes) |
| `cdn.jsdelivr.net` / `unpkg.com` | Tesseract.js traineddata (OCR) |

**Autres directives** : `img-src` autorise `tile.openstreetmap.org` (tuiles carte) + `data:` + `blob:` ; `script-src` et `worker-src` autorisent `blob:` pour les workers Tesseract.js ; `style-src` inclut `'unsafe-inline'` (styles dynamiques JS).

**En-têtes complémentaires** (`_headers`) : `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self)`.

---

## 📦 Technologies

- HTML / CSS / JavaScript vanilla (ES Modules)
- [Vite](https://vitejs.dev/) — bundler + dev server + build GitHub Pages
- [Vitest](https://vitest.dev/) — tests unitaires
- [Playwright](https://playwright.dev/) — tests E2E (mock réseau, Chromium headless)
- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR client-side (scan ticket, langue `fra`)
- [API Prix des Carburants v2](https://data.economie.gouv.fr/explore/dataset/prix-des-carburants-en-france-flux-instantane-v2/) — stations et prix (géoloc + recherche)
- [OpenStreetMap](https://www.openstreetmap.org/) — tuiles cartographiques + Overpass (enseignes)
- Google Apps Script — backend (enregistrement pleins, gestion stations/véhicules, export JSON, bulkAdd, bulkUpdate)
- Google Sheets — stockage des données + onglets `Stations` / `vehicules`
- GitHub Pages — hébergement de l'app mobile
- Excel + VBA — formulaire local + sync bidirectionnelle (`WinHttp`, `Scripting.Dictionary`, `Worksheet_Change`)
