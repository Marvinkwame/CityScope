import { describe, it, expect } from 'vitest';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import PlaceIcon from '@mui/icons-material/Place';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import { CATEGORY_ICONS, FALLBACK_ICON } from './categoryIcons';

// The backend's 11 categories (cityscope-backend/src/lib/poiCategories.ts).
const CATEGORIES = [
  'restaurant', 'cafe', 'pub', 'bar', 'supermarket', 'bakery',
  'park', 'playground', 'attraction', 'museum', 'hotel',
];

describe('category icons', () => {
  it('gives every backend category its own icon', () => {
    const icons = CATEGORIES.map((c) => CATEGORY_ICONS[c]);
    icons.forEach((icon, i) => {
      expect(icon, CATEGORIES[i]).toBeDefined();
      expect(icon, CATEGORIES[i]).not.toBe(FALLBACK_ICON);
    });
    expect(new Set(icons).size).toBe(CATEGORIES.length);
  });

  it('maps no category the backend does not have', () => {
    expect(Object.keys(CATEGORY_ICONS).sort()).toEqual([...CATEGORIES].sort());
  });

  it('uses the agreed glyphs', () => {
    expect(CATEGORY_ICONS.restaurant).toBe(RestaurantIcon);
    // Material has no playground glyph; Toys renders as a toy car.
    expect(CATEGORY_ICONS.playground).toBe(ChildCareIcon);
  });

  it('falls back to a pin for unknown categories', () => {
    expect(CATEGORY_ICONS.spaceport).toBeUndefined();
    expect(FALLBACK_ICON).toBe(PlaceIcon);
  });
});
