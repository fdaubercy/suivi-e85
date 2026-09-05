// @vitest-environment jsdom
/**
 * Tests — js/depenses.js (W91)
 * Coûts de conversion PAR VÉHICULE (override + repli global + défaut) et
 * dépenses d'entretien (liste + total + tombstone). Intégration au coût total.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/historique.js', () => ({ getAllRecords: () => [] }));

import { state } from '../js/state.js';
import {
  getConvField, convInputValue, setConvField,
  getDepenses, getDepensesTotal, addDepense, removeDepense, getAllDepenses, todayISO,
} from '../js/depenses.js';
import { getCoutTotalConversion, getKitPrix } from '../js/statsParams.js';

beforeEach(() => {
  localStorage.clear();
  state.currentVehiculeNom = '';
});

describe('getConvField — override véhicule → repli global → défaut', () => {
  it('renvoie le défaut du poste quand rien n\'est saisi', () => {
    expect(getConvField('kit_prix', 'Clio')).toBeCloseTo(514.54, 2);
    expect(getConvField('cout_pose', 'Clio')).toBe(0);
    expect(getConvField('aide_deduite', 'Clio')).toBe(0);
  });

  it('replie sur la valeur globale legacy tant qu\'aucun override véhicule', () => {
    localStorage.setItem('suivi_e85_cout_pose', '200');
    expect(getConvField('cout_pose', 'Clio')).toBe(200);
    expect(getConvField('cout_pose', 'Kangoo')).toBe(200);
  });

  it('l\'override véhicule prime sur le global (les autres véhicules gardent le repli)', () => {
    localStorage.setItem('suivi_e85_cout_pose', '200');
    setConvField('cout_pose', 'Clio', 50);
    expect(getConvField('cout_pose', 'Clio')).toBe(50);
    expect(getConvField('cout_pose', 'Kangoo')).toBe(200);
  });

  it('conserve un zéro EXPLICITE par véhicule (pas de repli sur le global)', () => {
    localStorage.setItem('suivi_e85_cout_pose', '200');
    setConvField('cout_pose', 'Clio', 0);
    expect(getConvField('cout_pose', 'Clio')).toBe(0);
  });

  it('effacer l\'override (\'\') fait retomber sur le global/défaut', () => {
    localStorage.setItem('suivi_e85_cout_pose', '200');
    setConvField('cout_pose', 'Clio', 50);
    setConvField('cout_pose', 'Clio', '');
    expect(getConvField('cout_pose', 'Clio')).toBe(200);
  });
});

describe('convInputValue — valeur à afficher dans le champ', () => {
  it('vide pour un poste à 0 non saisi, mais défaut pour kit_prix', () => {
    expect(convInputValue('cout_pose', 'Clio')).toBe('');
    expect(convInputValue('kit_prix', 'Clio')).toBeCloseTo(514.54, 2);
  });
  it('montre la valeur globale legacy si présente', () => {
    localStorage.setItem('suivi_e85_cout_pose', '200');
    expect(convInputValue('cout_pose', 'Clio')).toBe(200);
  });
});

describe('getKitPrix — par véhicule', () => {
  it('suit l\'override du véhicule courant', () => {
    setConvField('kit_prix', 'Clio', 600);
    expect(getKitPrix('Clio')).toBe(600);
    expect(getKitPrix('Kangoo')).toBeCloseTo(514.54, 2);
  });
});

describe('dépenses d\'entretien — liste, total, tombstone', () => {
  it('ajoute et totalise par véhicule', () => {
    addDepense({ vehicule: 'Clio', intitule: 'Vidange', montant: 80, categorie: 'Entretien' });
    addDepense({ vehicule: 'Clio', intitule: 'Filtre',  montant: 20, categorie: 'Réparation' });
    addDepense({ vehicule: 'Kangoo', intitule: 'Autre', montant: 999 });
    expect(getDepenses('Clio')).toHaveLength(2);
    expect(getDepensesTotal('Clio')).toBe(100);
    expect(getDepensesTotal('Kangoo')).toBe(999);
  });

  it('date par défaut = aujourd\'hui, catégorie invalide → Entretien, montant négatif → 0', () => {
    const it0 = addDepense({ vehicule: 'Clio', intitule: 'X', montant: -5, categorie: 'Bidon' });
    expect(it0.date).toBe(todayISO());
    expect(it0.categorie).toBe('Entretien');
    expect(it0.montant).toBe(0);
  });

  it('suppression = tombstone (exclu du total, conservé pour la synchro)', () => {
    const d = addDepense({ vehicule: 'Clio', intitule: 'Vidange', montant: 80 });
    removeDepense(d.id);
    expect(getDepenses('Clio')).toHaveLength(0);
    expect(getDepensesTotal('Clio')).toBe(0);
    const raw = getAllDepenses().find(x => x.id === d.id);
    expect(raw.supprime).toBe(1);
  });
});

describe('W91d — blob conversion_veh synchronisé alimente les postes par véhicule', () => {
  it('un blob CONV_BY_VEH (comme reçu du Sheet) est lu par getConvField', () => {
    localStorage.setItem('suivi_e85_conversion_veh',
      JSON.stringify({ Clio: { cout_pose: 250 }, Kangoo: { kit_prix: 700 } }));
    expect(getConvField('cout_pose', 'Clio')).toBe(250);
    expect(getConvField('kit_prix', 'Kangoo')).toBe(700);
    // véhicule sans override → défaut
    expect(getConvField('kit_prix', 'Clio')).toBeCloseTo(514.54, 2);
  });
});

describe('getCoutTotalConversion — intégration par véhicule (W91)', () => {
  it('somme postes fixes du véhicule + dépenses − aide, borné ≥ 0', () => {
    setConvField('kit_prix', 'Clio', 500);
    setConvField('cout_pose', 'Clio', 200);
    setConvField('aide_deduite', 'Clio', 100);
    addDepense({ vehicule: 'Clio', intitule: 'Vidange', montant: 80 });
    // 500 + 200 + 0 + 0 − 100 + 80 = 680
    expect(getCoutTotalConversion('Clio')).toBe(680);
  });

  it('les dépenses d\'un autre véhicule ne comptent pas', () => {
    setConvField('kit_prix', 'Clio', 500);
    addDepense({ vehicule: 'Kangoo', intitule: 'X', montant: 300 });
    expect(getCoutTotalConversion('Clio')).toBe(500);
  });

  it('borné à 0 si l\'aide dépasse tout', () => {
    setConvField('kit_prix', 'Clio', 100);
    setConvField('aide_deduite', 'Clio', 500);
    expect(getCoutTotalConversion('Clio')).toBe(0);
  });
});
