import {FareBreakdown, GeoPoint, OklahomaLocation} from '../types/rideapp';

export const OKLAHOMA_LANDMARKS: OklahomaLocation[] = [
  {
    id: 'devon-tower',
    label: 'Devon Energy Center (Downtown OKC)',
    address: '333 W Sheridan Ave, Oklahoma City, OK 73102',
    city: 'OKC Metro',
    lat: 35.4668,
    lng: -97.5181,
  },
  {
    id: 'crystal-bridge',
    label: 'Myriad Botanical Gardens & Crystal Bridge',
    address: '301 W Reno Ave, Oklahoma City, OK 73102',
    city: 'OKC Metro',
    lat: 35.4644,
    lng: -97.5177,
  },
  {
    id: 'will-rogers-airport',
    label: 'Will Rogers World Airport (OKC)',
    address: '7100 Terminal Dr, Oklahoma City, OK 73159',
    city: 'Will Rogers World Airport',
    lat: 35.3931,
    lng: -97.6007,
  },
  {
    id: 'bricktown-canal',
    label: 'Bricktown Canal District',
    address: '100 E California Ave, Oklahoma City, OK 73104',
    city: 'OKC Metro',
    lat: 35.4655,
    lng: -97.5082,
  },
  {
    id: 'midtown-plaza',
    label: 'Midtown & Plaza District OKC',
    address: '1745 NW 16th St, Oklahoma City, OK 73106',
    city: 'OKC Metro',
    lat: 35.4855,
    lng: -97.5403,
  },
  {
    id: 'edmond-uco',
    label: 'Downtown Edmond / UCO Campus',
    address: '100 N University Dr, Edmond, OK 73034',
    city: 'Edmond',
    lat: 35.6552,
    lng: -97.4714,
  },
  {
    id: 'norman-ou',
    label: 'OU Campus Corner (Norman)',
    address: '900 Asp Ave, Norman, OK 73019',
    city: 'Norman',
    lat: 35.2098,
    lng: -97.4458,
  },
  {
    id: 'moore-station',
    label: 'The Station at Central Park (Moore)',
    address: '700 S Broadway Ave, Moore, OK 73160',
    city: 'Moore',
    lat: 35.3315,
    lng: -97.4867,
  },
  {
    id: 'yukon-main',
    label: 'Historic Route 66 Main St (Yukon)',
    address: '500 W Main St, Yukon, OK 73099',
    city: 'Yukon',
    lat: 35.5067,
    lng: -97.7625,
  },
  {
    id: 'tulsa-gathering-place',
    label: 'Gathering Place & Brookside (Tulsa)',
    address: '2650 S John Williams Way, Tulsa, OK 74114',
    city: 'Tulsa',
    lat: 36.1257,
    lng: -95.9845,
  },
  {
    id: 'tulsa-airport',
    label: 'Tulsa International Airport (TUL)',
    address: '7777 Airport Dr, Tulsa, OK 74115',
    city: 'Tulsa',
    lat: 36.1984,
    lng: -95.8881,
  },
];

// Oklahoma geographical bounding box (including Panhandle + Metro corridors)
const OK_BOUNDS = {
  minLat: 33.615,
  maxLat: 37.002,
  minLng: -103.002,
  maxLng: -94.43,
};

const OUT_OF_STATE_PATTERNS: RegExp[] = [
  /\b(dallas|fort worth|dfw|austin|houston|san antonio|plano|frisco|arlington|lubbock|amarillo|wichita falls|texas)\b/i,
  /\b(wichita|topeka|overland park|kansas city|kansas|missouri|st\.?\s*louis|springfield|joplin)\b/i,
  /\b(fort smith|little rock|fayetteville|bentonville|arkansas)\b/i,
  /\b(denver|colorado springs|boulder|colorado|albuquerque|santa fe|new mexico)\b/i,
  /\b(new york|los angeles|chicago|miami|atlanta|seattle|phoenix|las vegas|boston|san francisco|california|florida|illinois|nevada|arizona)\b/i,
  /,\s*(TX|KS|MO|AR|CO|NM|NY|CA|FL|IL|WA|AZ|NV|GA|TN|LA|OH|PA|MI|NC|VA|MA)\b/,
];

const OKLAHOMA_CITY_HUBS: Array<{pattern: RegExp; coords: GeoPoint; city: string}> = [
  {pattern: /\b(will rogers|airport|73159|terminal)\b/i, coords: {lat: 35.3931, lng: -97.6007}, city: 'Will Rogers World Airport'},
  {pattern: /\b(devon|sheridan|downtown okc|73102)\b/i, coords: {lat: 35.4668, lng: -97.5181}, city: 'OKC Metro'},
  {pattern: /\b(myriad|crystal bridge|reno)\b/i, coords: {lat: 35.4644, lng: -97.5177}, city: 'OKC Metro'},
  {pattern: /\b(bricktown|california ave|73104|paycom)\b/i, coords: {lat: 35.4655, lng: -97.5082}, city: 'OKC Metro'},
  {pattern: /\b(midtown|plaza district|paseo|mesta park|heritage hills|73103|73106)\b/i, coords: {lat: 35.4855, lng: -97.5362}, city: 'OKC Metro'},
  {pattern: /\b(penn square|nichols hills|classen|73116|73118|73112)\b/i, coords: {lat: 35.5256, lng: -97.5512}, city: 'OKC Metro'},
  {pattern: /\b(edmond|uco|73034|73003|73012|73013)\b/i, coords: {lat: 35.6552, lng: -97.4714}, city: 'Edmond'},
  {pattern: /\b(norman|campus corner|asp ave|ou|sooner|73019|73069|73071|73072)\b/i, coords: {lat: 35.2098, lng: -97.4458}, city: 'Norman'},
  {pattern: /\b(moore|73160|19th st)\b/i, coords: {lat: 35.3395, lng: -97.4867}, city: 'Moore'},
  {pattern: /\b(yukon|mustang|73099|73064)\b/i, coords: {lat: 35.5067, lng: -97.7625}, city: 'Yukon'},
  {pattern: /\b(midwest city|del city|tinker|73110|73115)\b/i, coords: {lat: 35.4495, lng: -97.3967}, city: 'OKC Metro'},
  {pattern: /\b(tulsa|gathering place|brookside|cherry street|bok center|broken arrow|jenks|bixby|owasso|741\d\d|740\d\d)\b/i, coords: {lat: 36.1539, lng: -95.9928}, city: 'Tulsa'},
  {pattern: /\b(stillwater|lawton|enid|shawnee|el reno|guthrie|bethany|warr acres|the village|oklahoma city|okc|\bok\b|73\d{3}|74\d{3})\b/i, coords: {lat: 35.4729, lng: -97.5216}, city: 'OKC Metro'},
];

export function isPointInsideOklahoma(point: GeoPoint): boolean {
  if (
    point.lat < OK_BOUNDS.minLat ||
    point.lat > OK_BOUNDS.maxLat ||
    point.lng < OK_BOUNDS.minLng ||
    point.lng > OK_BOUNDS.maxLng
  ) {
    return false;
  }
  // Exclude Texas Panhandle cutout south of 36.5°N and west of -100.0°W
  if (point.lng < -100.0 && point.lat < 36.5) {
    return false;
  }
  return true;
}

function deterministicJitter(text: string): {dLat: number; dLng: number} {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  const norm1 = ((hash & 0xffff) / 0xffff - 0.5) * 0.014;
  const norm2 = (((hash >> 8) & 0xffff) / 0xffff - 0.5) * 0.014;
  return {dLat: norm1, dLng: norm2};
}

export interface GeofenceResolution {
  valid: boolean;
  coords?: GeoPoint;
  normalizedAddress?: string;
  zoneLabel?: string;
  error?: string;
}

export function resolveOklahomaAddress(input: string, knownCoords?: GeoPoint): GeofenceResolution {
  const trimmed = input.trim();
  if (!trimmed) {
    return {
      valid: false,
      error: 'Please enter an Oklahoma pickup or drop-off address.',
    };
  }

  // 1. Check explicit out-of-state patterns first
  for (const regex of OUT_OF_STATE_PATTERNS) {
    if (regex.test(trimmed)) {
      return {
        valid: false,
        error:
          'Oklahoma-Only Geofence Notice: Out-of-state rides are disabled. RideApp exclusively serves Oklahoma communities (OKC Metro, Edmond, Norman, Moore, Yukon, Tulsa, and Will Rogers World Airport).',
      };
    }
  }

  // 2. If exact GPS coordinates were passed (e.g. from native phone GPS)
  if (knownCoords) {
    if (!isPointInsideOklahoma(knownCoords)) {
      return {
        valid: false,
        error:
          'Oklahoma-Only Geofence Notice: Your GPS coordinates fall outside Oklahoma state borders. Please select an Oklahoma pickup point.',
      };
    }
    return {
      valid: true,
      coords: knownCoords,
      normalizedAddress: trimmed,
      zoneLabel: 'Verified Oklahoma GPS',
    };
  }

  // 3. Match exact curated landmark
  const exactLandmark = OKLAHOMA_LANDMARKS.find(
    (l) =>
      l.address.toLowerCase() === trimmed.toLowerCase() ||
      l.label.toLowerCase() === trimmed.toLowerCase()
  );
  if (exactLandmark) {
    return {
      valid: true,
      coords: {lat: exactLandmark.lat, lng: exactLandmark.lng},
      normalizedAddress: exactLandmark.address,
      zoneLabel: exactLandmark.city,
    };
  }

  // 4. Match Oklahoma city/district/ZIP patterns
  for (const hub of OKLAHOMA_CITY_HUBS) {
    if (hub.pattern.test(trimmed)) {
      const {dLat, dLng} = deterministicJitter(trimmed);
      return {
        valid: true,
        coords: {
          lat: Number((hub.coords.lat + dLat).toFixed(5)),
          lng: Number((hub.coords.lng + dLng).toFixed(5)),
        },
        normalizedAddress: /\b(OK|Oklahoma)\b/i.test(trimmed) ? trimmed : `${trimmed}, OK`,
        zoneLabel: hub.city,
      };
    }
  }

  // 5. Reject unrecognized addresses that don't specify an Oklahoma city or ZIP
  return {
    valid: false,
    error:
      'Oklahoma Geofence Check: Please include a supported Oklahoma city or district (OKC, Edmond, Norman, Moore, Yukon, Tulsa, or Will Rogers Airport) so we can verify in-state routing.',
  };
}

/**
 * Exact Haversine GPS distance in statute miles.
 */
export function calculateHaversineMiles(a: GeoPoint, b: GeoPoint): number {
  const R_MILES = 3958.7613;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const rawMiles = R_MILES * c;
  return Math.max(0.8, Number(rawMiles.toFixed(2)));
}

/**
 * Transparent Co-Op Pricing Engine:
 * Flat $6.00 upfront reservation hold fee + $1.50 per Haversine mile.
 * 70% Direct to Driver | 5% Local Oklahoma Charities | 25% Co-op Operations.
 */
export function calculateCoopFare(
  pickup: GeoPoint,
  dropoff: GeoPoint,
  stop1?: GeoPoint
): FareBreakdown {
  const miles = stop1
    ? Number(
        (calculateHaversineMiles(pickup, stop1) + calculateHaversineMiles(stop1, dropoff)).toFixed(
          2
        )
      )
    : calculateHaversineMiles(pickup, dropoff);
  const holdFee = 6.0;
  const mileageCharge = Number((miles * 1.5).toFixed(2));
  const totalFare = Number((holdFee + mileageCharge).toFixed(2));
  const driverPayout70 = Number((totalFare * 0.7).toFixed(2));
  const charityShare5 = Number((totalFare * 0.05).toFixed(2));
  const operationsShare25 = Number((totalFare - driverPayout70 - charityShare5).toFixed(2));

  return {
    miles,
    holdFee,
    mileageCharge,
    totalFare,
    driverPayout70,
    charityShare5,
    operationsShare25,
  };
}

/**
 * Closest-Driver Cascade Fare Engine ($1.50/mile):
 * Total Mileage = Active Driver's Distance to Pickup + Pickup to Stop 1 (if added) + Stop 1/Pickup to Drop-off
 * Total Fare = (Total Mileage × $1.50) + ($6.00 Hold Fee if scheduled Reserve Ride)
 * 70% Direct to Driver | 5% Local Oklahoma Charities | 25% Co-op Operations.
 */
export function calculateCascadeFare(
  pickup: GeoPoint,
  dropoff: GeoPoint,
  driverDistanceToPickupMiles: number,
  isScheduledReserve: boolean,
  stop1?: GeoPoint
): FareBreakdown {
  const tripMiles = stop1
    ? calculateHaversineMiles(pickup, stop1) + calculateHaversineMiles(stop1, dropoff)
    : calculateHaversineMiles(pickup, dropoff);
  const totalMiles = Number((Math.max(0.2, driverDistanceToPickupMiles) + tripMiles).toFixed(2));
  const holdFee = isScheduledReserve ? 6.0 : 0.0;
  const mileageCharge = Number((totalMiles * 1.5).toFixed(2));
  const totalFare = Number((holdFee + mileageCharge).toFixed(2));
  const driverPayout70 = Number((totalFare * 0.7).toFixed(2));
  const charityShare5 = Number((totalFare * 0.05).toFixed(2));
  const operationsShare25 = Number((totalFare - driverPayout70 - charityShare5).toFixed(2));

  return {
    miles: totalMiles,
    holdFee,
    mileageCharge,
    totalFare,
    driverPayout70,
    charityShare5,
    operationsShare25,
  };
}

export function generateThirtyMinuteSlots(): string[] {
  const slots: string[] = [];
  for (let hour = 5; hour <= 23; hour++) {
    for (const minute of [0, 30]) {
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour % 12 === 0 ? 12 : hour % 12;
      const hh = displayHour.toString().padStart(2, '0');
      const mm = minute.toString().padStart(2, '0');
      slots.push(`${hh}:${mm} ${period}`);
    }
  }
  return slots;
}

export function parseScheduleTimestamp(dateStr: string, timeSlot: string): number {
  const match = timeSlot.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) {
    return Date.now() + 60 * 60 * 1000;
  }
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;

  const [year, month, day] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(year, (month || 1) - 1, day || 1, hours, minutes, 0, 0);
  return dt.getTime();
}

export function evaluateCancellationWindow(scheduledTimestamp: number, now = Date.now()): {
  isFreeRefund: boolean;
  minutesRemaining: number;
  summary: string;
} {
  const diffMs = scheduledTimestamp - now;
  const minutesRemaining = Math.round(diffMs / 60000);
  const isFreeRefund = diffMs >= 30 * 60 * 1000;

  return {
    isFreeRefund,
    minutesRemaining,
    summary: isFreeRefund
      ? 'Canceled 30+ mins ahead: Your $6.00 upfront hold fee has been refunded in full ($0 penalty).'
      : 'Canceled inside 30-min window: $6.00 hold fee transferred directly to compensate your reserved Oklahoma driver.',
  };
}

export function buildNativeNavigationLinks(coords: GeoPoint): {
  appleMaps: string;
  googleMaps: string;
  waze: string;
} {
  const lat = coords.lat.toFixed(6);
  const lng = coords.lng.toFixed(6);
  return {
    appleMaps: `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`,
    googleMaps: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
    waze: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`,
  };
}

export function getTodayDateInput(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getDefaultUpcomingSlot(): {date: string; timeSlot: string} {
  const target = new Date(Date.now() + 90 * 60 * 1000);
  const mins = target.getMinutes();
  if (mins > 30) {
    target.setHours(target.getHours() + 1, 0, 0, 0);
  } else {
    target.setMinutes(30, 0, 0);
  }
  const y = target.getFullYear();
  const m = String(target.getMonth() + 1).padStart(2, '0');
  const d = String(target.getDate()).padStart(2, '0');
  let h = target.getHours();
  if (h < 5) h = 8;
  const period = h >= 12 ? 'PM' : 'AM';
  const dh = String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0');
  const dm = String(target.getMinutes()).padStart(2, '0');
  return {
    date: `${y}-${m}-${d}`,
    timeSlot: `${dh}:${dm} ${period}`,
  };
}
