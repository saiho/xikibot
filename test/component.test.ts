import { describe, expect, it, vi } from 'vitest';
import { initComponents } from '../src/component';

// Undo mocking initComponents in global.mock.ts
vi.unmock('../src/component');

describe('Components', () => {
  it('No duplicated persistentId', async () => {
    const components = initComponents();

    // Ensure that mocked initComponents is not used, as it would not create any components
    expect(components.length).toBeGreaterThan(0);

    const persistentIds = components
      .map(component => component.persistentId)
      .filter(persistentId => persistentId != undefined);

    expect((new Set(persistentIds)).size).toBe(persistentIds.length);
  });
});
