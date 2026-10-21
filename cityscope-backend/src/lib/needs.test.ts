import { describe, it, expect } from 'vitest';
import { POI_CATEGORIES } from './poiCategories';
import {
  NEEDS,
  NEED_IDS,
  MEASUREMENT_ONLY_CATEGORIES,
  PARK_MIN_AREA_M2,
  NONE_FOUND_METRES,
  completenessCategories,
} from './needs';

describe('NEEDS', () => {
  it('lists the six needs in display order', () => {
    expect(NEED_IDS).toEqual(['sm', 'ph', 'dr', 'sc', 'pk', 'st']);
    expect(NEEDS.map((n) => n.id)).toEqual(NEED_IDS);
  });

  it('labels each need for the reader', () => {
    expect(NEEDS.map((n) => n.label)).toEqual([
      'Supermarket', 'Pharmacy', 'Doctor', 'School', 'Park', 'Station',
    ]);
  });

  it('draws every pois need from categories the tagging rules produce', () => {
    for (const need of NEEDS.filter((n) => n.source === 'pois')) {
      expect(need.categories.length).toBeGreaterThan(0);
      for (const category of need.categories) {
        expect(POI_CATEGORIES).toContain(category);
      }
    }
  });

  it('maps the tags onto the needs', () => {
    const byId = Object.fromEntries(NEEDS.map((n) => [n.id, n.categories]));
    expect(byId.sm).toEqual(['supermarket']);
    expect(byId.ph).toEqual(['pharmacy']);
    expect(byId.dr).toEqual(['doctors', 'clinic']);
    expect(byId.sc).toEqual(['school']);
    expect(byId.st).toEqual(['station', 'halt', 'tram_stop', 'subway_entrance']);
  });

  it('takes parks from the park files, not from pois', () => {
    const pk = NEEDS.find((n) => n.id === 'pk');
    expect(pk?.source).toBe('parks');
    expect(pk?.categories).toEqual([]);
  });
});

describe('MEASUREMENT_ONLY_CATEGORIES', () => {
  it('is a subset of the station categories', () => {
    const st = NEEDS.find((n) => n.id === 'st');
    expect(MEASUREMENT_ONLY_CATEGORIES).toEqual(['tram_stop', 'subway_entrance']);
    for (const category of MEASUREMENT_ONLY_CATEGORIES) {
      expect(st?.categories).toContain(category);
    }
  });
});

describe('completenessCategories', () => {
  const need = (id: string) => {
    const found = NEEDS.find((n) => n.id === id);
    if (!found) throw new Error(`no need ${id}`);
    return found;
  };

  it('counts stations and halts for the station need, not tram stops or metro entrances', () => {
    expect(completenessCategories(need('st'))).toEqual(['station', 'halt']);
  });

  it('counts every category of the other needs', () => {
    for (const id of ['sm', 'ph', 'dr', 'sc', 'pk']) {
      expect(completenessCategories(need(id))).toEqual(need(id).categories);
    }
  });

  it('leaves the station need itself unchanged', () => {
    expect(need('st').categories).toEqual(['station', 'halt', 'tram_stop', 'subway_entrance']);
  });
});

describe('constants', () => {
  it('fixes the park minimum at 5000 m2 and the none-found sentinel at 65535 m', () => {
    expect(PARK_MIN_AREA_M2).toBe(5000);
    expect(NONE_FOUND_METRES).toBe(65535);
  });
});
