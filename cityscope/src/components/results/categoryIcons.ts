import type SvgIcon from '@mui/material/SvgIcon';
import AttractionsIcon from '@mui/icons-material/Attractions';
import BakeryDiningIcon from '@mui/icons-material/BakeryDining';
import ChildCareIcon from '@mui/icons-material/ChildCare';
import DirectionsRailwayIcon from '@mui/icons-material/DirectionsRailway';
import HotelIcon from '@mui/icons-material/Hotel';
import LocalBarIcon from '@mui/icons-material/LocalBar';
import LocalCafeIcon from '@mui/icons-material/LocalCafe';
import LocalGroceryStoreIcon from '@mui/icons-material/LocalGroceryStore';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import LocalPharmacyIcon from '@mui/icons-material/LocalPharmacy';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import MuseumIcon from '@mui/icons-material/Museum';
import ParkIcon from '@mui/icons-material/Park';
import PlaceIcon from '@mui/icons-material/Place';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import SchoolIcon from '@mui/icons-material/School';
import SportsBarIcon from '@mui/icons-material/SportsBar';
import SubwayIcon from '@mui/icons-material/Subway';
import TrainIcon from '@mui/icons-material/Train';
import TramIcon from '@mui/icons-material/Tram';

export type CategoryIconComponent = typeof SvgIcon;

/**
 * One Material icon per displayed POI category: the 17 the backend serves from
 * poiCategories.ts, plus tram stops and metro entrances, which never reach the
 * place lists but can be a block's nearest station on the everyday reach card.
 * Material has no playground glyph; ChildCare reads closest (Toys renders as a
 * toy car).
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
  pharmacy: LocalPharmacyIcon,
  doctors: MedicalServicesIcon,
  clinic: LocalHospitalIcon,
  school: SchoolIcon,
  station: TrainIcon,
  halt: DirectionsRailwayIcon,
  tram_stop: TramIcon,
  subway_entrance: SubwayIcon,
};

/** The icon for any category not in the map. */
export const FALLBACK_ICON: CategoryIconComponent = PlaceIcon;
