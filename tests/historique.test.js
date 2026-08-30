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
  const p = (veh, date, km, litres) => ({
    'Véhicule': veh, Date: date, Horodatage: date, 'Km compteur': km, 'Nb. Litres': litres,
  });

  it('conso = litres / (Δkm) × 100 depuis le plein précédent du même véhicule', () => {
    const a1 = p('Clio', '2026-01-01', 1000, 40);
    const a2 = p('Clio', '2026-01-15', 1600, 42);   // 600 km, 42 L → 7.0
    const a3 = p('Clio', '2026-02-01', 2200, 39);   // 600 km, 39 L → 6.5
    const m = computeConsoByFill([a3, a1, a2]);      // ordre d'entrée quelconque
    expect(m.get(a1)).toBeUndefined();               // 1er plein : pas de prédécesseur
    expect(m.get(a2)).toBeCloseTo(7.0, 5);
    expect(m.get(a3)).toBeCloseTo(6.5, 5);
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
    expect(m.get(b2)).toBeCloseTo(5.5, 5);
  });

  it('ignore un km rétrograde ou nul (Δkm ≤ 0)', () => {
    const a1 = p('Clio', '2026-01-01', 2000, 40);
    const a2 = p('Clio', '2026-01-10', 1500, 40);    // compteur en arrière → pas de conso
    const m = computeConsoByFill([a1, a2]);
    expect(m.get(a2)).toBeUndefined();
  });
});
