// @vitest-environment jsdom
/**
 * Tests — js/depenses.js · synchro Sheet (W91b)
 * LWW par `id` : pull serveur → applique le plus récent, pousse le local plus
 * récent/absent. auth + fetch mockés.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../js/auth.js', () => ({
  authEnabled: () => false, isAuthed: () => true, getIdToken: () => 'tok',
}));

import { syncDepenses, getAllDepenses } from '../js/depenses.js';
import { DEPENSES_KEY } from '../js/config.js';

function setLocal(arr) { localStorage.setItem(DEPENSES_KEY, JSON.stringify(arr)); }

/** Mock fetch : GET renvoie serverRows ; POST est capturé dans `posts`. */
function mockFetch(serverRows) {
  const posts = [];
  globalThis.fetch = vi.fn(async (url, opts) => {
    if (opts && opts.method === 'POST') {
      posts.push(JSON.parse(opts.body));
      return { ok: true, json: async () => ({ success: true, depenses: serverRows }) };
    }
    return { ok: true, json: async () => ({ depenses: serverRows }) };
  });
  return posts;
}

const dep = (id, ts, over = {}) => ({
  id, vehicule: 'Clio', date: '2026-09-01', categorie: 'Entretien',
  intitule: 'X', montant: 10, modifie_le: ts, supprime: 0, ...over,
});

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('syncDepenses — réconciliation LWW par id', () => {
  it('applique une dépense serveur absente en local', async () => {
    mockFetch([dep('a', 100, { montant: 42 })]);
    const changed = await syncDepenses();
    expect(changed).toBe(true);
    const a = getAllDepenses().find(d => d.id === 'a');
    expect(a).toBeTruthy();
    expect(a.montant).toBe(42);
  });

  it('le serveur plus récent écrase le local', async () => {
    setLocal([dep('a', 100, { montant: 10 })]);
    mockFetch([dep('a', 200, { montant: 99 })]);
    const changed = await syncDepenses();
    expect(changed).toBe(true);
    expect(getAllDepenses().find(d => d.id === 'a').montant).toBe(99);
  });

  it('pousse le local plus récent (POST setDepenses)', async () => {
    setLocal([dep('a', 300, { montant: 55 })]);
    const posts = mockFetch([dep('a', 100, { montant: 10 })]);
    const changed = await syncDepenses();
    expect(changed).toBe(false);                       // le local ne change pas
    expect(getAllDepenses().find(d => d.id === 'a').montant).toBe(55);
    const push = posts.find(p => p.action === 'setDepenses');
    expect(push).toBeTruthy();
    expect(push.depenses.some(d => d.id === 'a' && d.montant === 55)).toBe(true);
  });

  it('pousse une dépense locale absente du serveur', async () => {
    setLocal([dep('local1', 300)]);
    const posts = mockFetch([]);
    await syncDepenses();
    const push = posts.find(p => p.action === 'setDepenses');
    expect(push.depenses.some(d => d.id === 'local1')).toBe(true);
  });

  it('propage un tombstone serveur (supprimé)', async () => {
    setLocal([dep('a', 100)]);
    mockFetch([dep('a', 200, { supprime: 1, montant: 0 })]);
    await syncDepenses();
    expect(getAllDepenses().find(d => d.id === 'a').supprime).toBe(1);
  });
});
