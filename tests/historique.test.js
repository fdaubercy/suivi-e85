// @vitest-environment jsdom
/**
 * Tests — js/historique.js (W25)
 * Logique pure : génération du CSV d'export de l'historique.
 */
import { describe, it, expect } from 'vitest';
import { buildHistoriqueCSV, estPleinValide, computeConsoByFill } from '../js/historique.js';

const plein = (o = {}) => ({
  Date: '2026-05-30 08:15:00',
  Horodatage: '2026-05-30 08:15:00',
  'Véhicule': 'Clio',
  Type: 'SuperEthanol E85',
  'Km compteur': 123456,
  'Nb. Litres': 40,
  'Prix €/L': 0.789,
  'Station essence': 'Total Lyon',
  ...o,
});

describe('buildHistoriqueCSV', () => {
  it('génère un en-tête avec séparateur point-virgule', () => {
    const csv = buildHistoriqueCSV([]);
    const header = csv.split('\r\n')[0];
    expect(header).toBe('Date;Horodatage;Véhicule;Type;Km compteur;Litres;Prix €/L;Total €;Station');
  });

  it('exporte une ligne avec virgule décimale et total calculé', () => {
    const csv = buildHistoriqueCSV([plein()]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain('Clio');
    expect(row).toContain('SuperEthanol E85');
    expect(row).toContain('0,789');          // virgule décimale (Excel FR)
    expect(row).toContain('31,56');           // 40 × 0,789
    expect(row).toContain('Total Lyon');
  });

  it('échappe les valeurs contenant le séparateur', () => {
    const csv = buildHistoriqueCSV([plein({ 'Station essence': 'Leclerc; Bron' })]);
    expect(csv).toContain('"Leclerc; Bron"');
  });

  it('produit une ligne par enregistrement (+ en-tête)', () => {
    const csv = buildHistoriqueCSV([plein(), plein(), plein()]);
    expect(csv.split('\r\n')).toHaveLength(4);
  });
});

describe('buildHistoriqueCSV — séparateur configurable (W54)', () => {
  it('utilise la virgule comme séparateur et le point décimal en mode anglo', () => {
    const csv = buildHistoriqueCSV([plein()], ',');
    const header = csv.split('\r\n')[0];
    expect(header).toBe('Date,Horodatage,Véhicule,Type,Km compteur,Litres,Prix €/L,Total €,Station');
    const row = csv.split('\r\n')[1];
    expect(row).toContain('0.789');     // point décimal (pas de virgule en mode ,)
    expect(row).toContain('31.56');     // total avec point
    expect(row).not.toContain('0,789');
  });

  it('garde le point-virgule + virgule décimale par défaut (Excel FR)', () => {
    const csv = buildHistoriqueCSV([plein()], ';');
    expect(csv.split('\r\n')[1]).toContain('0,789');
  });

  it('échappe une valeur contenant la virgule quand le séparateur est la virgule', () => {
    const csv = buildHistoriqueCSV([plein({ 'Station essence': 'Leclerc, Bron' })], ',');
    expect(csv).toContain('"Leclerc, Bron"');
  });
});

describe('estPleinValide — anti-fantôme « plein au 01/01/1970 »', () => {
  it('accepte un plein normal', () => {
    expect(estPleinValide(plein())).toBe(true);
  });

  it('accepte un plein daté par le seul Horodatage (Date absente)', () => {
    expect(estPleinValide(plein({ Date: '' }))).toBe(true);
  });

  it('rejette une date epoch Unix (01/01/1970)', () => {
    expect(estPleinValide(plein({ Date: '1970-01-01', Horodatage: '1970-01-01 00:00:00' }))).toBe(false);
  });

  it('rejette une ligne d’en-tête fantôme (sync_id = "sync_id")', () => {
    expect(estPleinValide(plein({ sync_id: 'sync_id' }))).toBe(false);
  });

  it('rejette une ligne d’en-tête fantôme (Type = "Type")', () => {
    expect(estPleinValide(plein({ Type: 'Type', Date: 'Date', Horodatage: '' }))).toBe(false);
  });

  it('rejette un enregistrement sans aucune date', () => {
    expect(estPleinValide(plein({ Date: '', Horodatage: '' }))).toBe(false);
  });

  it('rejette null / undefined', () => {
    expect(estPleinValide(null)).toBe(false);
    expect(estPleinValide(undefined)).toBe(false);
  });
});

describe('computeConsoByFill (conso L/100 par plein)', () => {
  const p = (veh, date, km, litres, type = '') => ({
    'Véhicule': veh, Type: type, Date: date, Horodatage: date, 'Km compteur': km, 'Nb. Litres': litres,
  });

  it('conso = litres / (Δkm) × 100 depuis le plein précédent du même véhicule', () => {
    const a1 = p('Clio', '2026-01-01', 1000, 40);
    const a2 = p('Clio', '2026-01-15', 1600, 42);   // 600 km, 42 L → 7.0
    const a3 = p('Clio', '2026-02-01', 2200, 39);   // 600 km, 39 L → 6.5
    const m = computeConsoByFill([a3, a1, a2]);      // ordre d'entrée quelconque
    expect(m.get(a1)).toBeUndefined();               // 1er plein : pas de prédécesseur
    expect(m.get(a2).conso).toBeCloseTo(7.0, 5);
    expect(m.get(a3).conso).toBeCloseTo(6.5, 5);
  });

  it('écarte les valeurs aberrantes (hors [1 ; 60] L/100)', () => {
    const a1 = p('Clio', '2026-01-01', 1000, 40);
    const a2 = p('Clio', '2026-01-02', 1005, 40);    // 5 km, 40 L → 800 → écarté
    const m = computeConsoByFill([a1, a2]);
    expect(m.get(a2)).toBeUndefined();
  });

  it('ne mélange pas les véhicules (conso par véhicule)', () => {
    const a1 = p('Clio', '2026-01-01', 1000, 40);
    const b1 = p('208',  '2026-01-05', 5000, 50);
    const b2 = p('208',  '2026-01-20', 5800, 44);    // 800 km, 44 L → 5.5
    const m = computeConsoByFill([a1, b1, b2]);
    expect(m.get(a1)).toBeUndefined();
    expect(m.get(b1)).toBeUndefined();
    expect(m.get(b2).conso).toBeCloseTo(5.5, 5);
  });

  it('ignore un km rétrograde ou nul (Δkm ≤ 0)', () => {
    const a1 = p('Clio', '2026-01-01', 2000, 40);
    const a2 = p('Clio', '2026-01-10', 1500, 40);    // compteur en arrière → pas de conso
    const m = computeConsoByFill([a1, a2]);
    expect(m.get(a2)).toBeUndefined();
  });

  it('niveau couleur relatif à la médiane du véhicule (eco / mid / high)', () => {
    // 4 pleins mesurés (Δkm 500 chacun) → conso 8, 10, 12, 10 → médiane 10.
    const a0 = p('Clio', '2026-01-01', 1000, 40);   // 1er : pas de conso
    const a1 = p('Clio', '2026-01-10', 1500, 40);   // 500 km, 40 L → 8.0  (≤ 9.5 → eco)
    const a2 = p('Clio', '2026-01-20', 2000, 50);   // 500 km, 50 L → 10.0 (±5 % → mid)
    const a3 = p('Clio', '2026-01-30', 2500, 60);   // 500 km, 60 L → 12.0 (≥ 10.5 → high)
    const a4 = p('Clio', '2026-02-10', 3000, 50);   // 500 km, 50 L → 10.0 (mid)
    const m = computeConsoByFill([a0, a1, a2, a3, a4]);
    expect(m.get(a1).level).toBe('eco');
    expect(m.get(a2).level).toBe('mid');
    expect(m.get(a3).level).toBe('high');
    expect(m.get(a4).level).toBe('mid');
  });

  it('pas de couleur si le véhicule a moins de 3 pleins mesurés (level = null)', () => {
    const a1 = p('Clio', '2026-01-01', 1000, 40);
    const a2 = p('Clio', '2026-01-15', 1600, 42);   // 1 seul plein mesuré → level null
    const m = computeConsoByFill([a1, a2]);
    expect(m.get(a2).conso).toBeCloseTo(7.0, 5);
    expect(m.get(a2).level).toBeNull();
  });

  it('couleur par carburant : E85 (conso haute) et SP98 ne se contaminent pas', () => {
    // Même véhicule, Δkm 500. SP98 ~7 L/100, E85 ~9 L/100 (≈ +29 %, réaliste).
    // Sans regroupement par carburant, la médiane globale (~8) mettrait tous les
    // E85 en rouge et tous les SP98 en vert. Avec regroupement : chacun 'mid'
    // dans sa propre famille.
    const s1 = p('Clio', '2026-01-01', 1000, 40, 'SP98');   // 1er SP98 : pas de conso
    const s2 = p('Clio', '2026-01-10', 1500, 35, 'SP98');   // 500 km, 35 L → 7.0
    const s3 = p('Clio', '2026-01-20', 2000, 35, 'SP98');   // → 7.0
    const s4 = p('Clio', '2026-01-30', 2500, 35, 'SP98');   // → 7.0  (médiane SP98 = 7)
    const e1 = p('Clio', '2026-02-10', 3000, 45, 'SuperEthanol E85');   // 500 km, 45 L → 9.0
    const e2 = p('Clio', '2026-02-20', 3500, 45, 'SuperEthanol E85');   // → 9.0
    const e3 = p('Clio', '2026-03-01', 4000, 45, 'SuperEthanol E85');   // → 9.0  (médiane E85 = 9)
    const m = computeConsoByFill([s1, s2, s3, s4, e1, e2, e3]);
    // E85 à 9.0 = médiane E85 → 'mid' (PAS 'high' malgré une conso > médiane globale)
    expect(m.get(e2).conso).toBeCloseTo(9.0, 5);
    expect(m.get(e2).level).toBe('mid');
    // SP98 à 7.0 = médiane SP98 → 'mid' (PAS 'eco' malgré une conso < médiane globale)
    expect(m.get(s3).conso).toBeCloseTo(7.0, 5);
    expect(m.get(s3).level).toBe('mid');
  });
});
