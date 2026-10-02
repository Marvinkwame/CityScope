import type SvgIcon from '@mui/material/SvgIcon';
import AttractionsIcon from '@mui/icons-material/Attractions';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import HotelIcon from '@mui/icons-material/Hotel';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import LocalGroceryStoreIcon from '@mui/icons-material/LocalGroceryStore';
import MuseumIcon from '@mui/icons-material/Museum';
import ParkIcon from '@mui/icons-material/Park';
import PlaceIcon from '@mui/icons-material/Place';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SportsBarIcon from '@mui/icons-material/SportsBar';

export type CategoryIconComponent = typeof SvgIcon;

/**
 * One Material icon per POI category: the 11 in the backend's
 * poiCategories.ts. Material has no playground glyph; ChildCare reads closest
 * (Toys renders as a toy car).
 */
export const CATEGORY_ICONS: Readonly<Partial<Record<string, CategoryIconComponent>>> = {
  restaurant: RestaurantIcon,
  cafe: LocalCafeIcon,
  pub: SportsBarIcon,
  bar: LocalBarIcon,
  supermarket: LocalGroceryStoreIcon,
  bakery: BakeryDiningIcon,
  park: ParkIcon,
  playground: ChildCareIcon,
  attraction: AttractionsIcon,
  museum: MuseumIcon,
  hotel: HotelIcon,
};

/** The icon for any category not in the map. */
export const FALLBACK_ICON: CategoryIconComponent = PlaceIcon;
