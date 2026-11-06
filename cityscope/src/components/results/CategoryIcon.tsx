import { CATEGORY_ICONS, FALLBACK_ICON } from './categoryIcons';

/**
 * A category's icon. Decorative: the category's name is always next to it.
 * `colour` replaces the quiet white it is drawn in by default.
 *
 * The icon is looked up inline rather than through a helper function on
 * purpose. react-hooks/static-components rejects `<Icon />` when `Icon` comes
 * from a function call, but accepts a direct lookup.
 */
function CategoryIcon({
  category,
  size = 15,
  colour = 'rgba(255,255,255,0.62)',
}: {
  category: string;
  size?: number;
  colour?: string;
}) {
  const Icon = CATEGORY_ICONS[category.toLowerCase()] ?? FALLBACK_ICON;
  return <Icon aria-hidden sx={{ fontSize: size, color: colour }} />;
}

export default CategoryIcon;
