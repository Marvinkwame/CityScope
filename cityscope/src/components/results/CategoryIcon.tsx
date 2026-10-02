import { CATEGORY_ICONS, FALLBACK_ICON } from './categoryIcons';

/**
 * A category's icon. Decorative: the category's name is always next to it.
 *
 * The icon is looked up inline rather than through a helper function on
 * purpose. react-hooks/static-components rejects `<Icon />` when `Icon` comes
 * from a function call, but accepts a direct lookup.
 */
function CategoryIcon({ category, size = 15 }: { category: string; size?: number }) {
  const Icon = CATEGORY_ICONS[category.toLowerCase()] ?? FALLBACK_ICON;
  return <Icon aria-hidden sx={{ fontSize: size, color: 'rgba(255,255,255,0.62)' }} />;
}

export default CategoryIcon;
