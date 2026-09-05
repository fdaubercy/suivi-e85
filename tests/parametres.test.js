// @vitest-environment jsdom
/**
 * Tests — js/parametres.js (périmètre de synchro)
 * W91d : la map des coûts de conversion par véhicule (conversion_veh) fait
 * partie des clés métier synchronisées.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../js/auth.js', () => ({
  getIdToken: () => '', isAuthed: () => false, authEnabled: () => false,
  getUser: () => null, signOut: () => {},
}));

import { PARAM_CLES, LOCAL_TO_CLE } from '../js/parametres.js';

describe('périmètre de synchro des paramètres', () => {
  it('inclut conversion_veh (W91d)', () => {
    expect(PARAM_CLES).toContain('conversion_veh');
  });
  it('mappe la clé localStorage suivi_e85_conversion_veh → conversion_veh', () => {
    expect(LOCAL_TO_CLE['suivi_e85_conversion_veh']).toBe('conversion_veh');
  });
});
