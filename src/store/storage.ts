import {
  AppState,
  BusinessPerk,
  PaymentMethodType,
  RideReservation,
  RideStatus,
  UserAccount,
  UserRole,
} from '../types/rideapp';
import {
  calculateCoopFare,
  getDefaultUpcomingSlot,
  parseScheduleTimestamp,
} from '../utils/oklahomaGeo';

const STORAGE_KEY = 'rideapp_oklahoma_coop_v1';

function buildInitialState(): AppState {
  const upcoming = getDefaultUpcomingSlot();
  const scheduledTs = parseScheduleTimestamp(upcoming.date, upcoming.timeSlot);

  const demoRider: UserAccount = {
    id: 'usr-rider-demo',
    role: UserRole.Rider,
    name: 'Maya Thornton',
    phone: '(405) 555-0142',
    email: 'rider@rideapp.ok',
    password: 'demo',
    createdAt: '2026-09-12T14:00:00Z',
    homeAddress: '1745 NW 16th St, Plaza District, Oklahoma City, OK 73106',
    workAddress: '333 W Sheridan Ave, Devon Energy Center, Oklahoma City, OK 73102',
    paymentMethod: PaymentMethodType.Venmo,
    paymentHandle: '@maya-okc',
  };

  const demoDriver: UserAccount = {
    id: 'usr-driver-demo',
    role: UserRole.Driver,
    name: 'Marcus Vance',
    phone: '(405) 555-0198',
    email: 'driver@rideapp.ok',
    password: 'demo',
    createdAt: '2026-08-04T10:30:00Z',
    driverApprovalStatus: 'approved',
    isOnline: true,
    driverRating: 4.98,
    cashedOutTotal: 0,
    vehicle: {
      make: 'Toyota',
      model: 'Camry Hybrid XSE',
      year: '2024',
      color: 'Midnight Metallic',
      plate: 'OK · CVB-405',
    },
    documents: [
      {
        id: 'license',
        title: "Driver's License",
        fileName: 'OK_REAL_ID_MarcusVance.jpg',
        uploadedAt: 'Verified Oct 2026',
        verified: true,
        expiryNote: 'Class D · Valid thru 08/15/2029',
        expirationDate: '2029-08-15',
        status: 'active',
      },
      {
        id: 'insurance',
        title: 'Proof of Insurance',
        fileName: 'OK_TNC_Policy_2026.pdf',
        uploadedAt: 'Verified Oct 2026',
        verified: true,
        expiryNote: '$1M Co-op TNC Coverage · Valid thru 04/30/2027',
        expirationDate: '2027-04-30',
        status: 'active',
      },
      {
        id: 'registration',
        title: 'Vehicle Registration',
        fileName: 'OK_TaxCommission_Tag_CVB405.pdf',
        uploadedAt: 'Verified Oct 2026',
        verified: true,
        expiryNote: 'Oklahoma County Tag · Valid thru 11/30/2027',
        expirationDate: '2027-11-30',
        status: 'active',
      },
      {
        id: 'ssn',
        title: 'Social Security Card',
        fileName: 'SSN_Identity_Verified.pdf',
        uploadedAt: 'Verified Oct 2026',
        verified: true,
        expiryNote: 'Identity & 1099 Payout Verified',
        expirationDate: 'Non-Expiring',
        status: 'active',
      },
    ],
  };

  const demoBusiness: UserAccount = {
    id: 'usr-business-demo',
    role: UserRole.Business,
    name: 'Elena Morales',
    phone: '(405) 555-0177',
    email: 'business@rideapp.ok',
    password: 'demo',
    createdAt: '2026-08-20T09:15:00Z',
    businessName: 'Elemental Coffee Roasters',
    businessDistrict: 'Midtown OKC',
    businessCategory: 'Local Roastery & Cafe',
    businessAddress: '815 N Hudson Ave, Oklahoma City, OK 73102',
  };

  const pickup1 = {lat: 35.4668, lng: -97.5181}; // Devon Tower
  const dropoff1 = {lat: 35.3931, lng: -97.6007}; // Will Rogers Airport

  const pickup2 = {lat: 35.4855, lng: -97.5403}; // Plaza District
  const dropoff2 = {lat: 35.4644, lng: -97.5177}; // Crystal Bridge

  const nowMs = Date.now();
  const todayStr = new Date(nowMs).toISOString().slice(0, 10);
  const twoDaysAgoStr = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const twelveDaysAgoStr = new Date(nowMs - 12 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const fortyDaysAgoStr = new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Calibrated seeded completed trips whose total 70% payouts + tips = $184.50 exact starting balance
  // Daily (today): $52.50 | Weekly (incl today): $96.25 | Monthly (incl week): $142.00 | Yearly (all): $184.50
  const seededReservations: RideReservation[] = [
    {
      id: 'res-okc-1002',
      riderId: demoRider.id,
      riderName: demoRider.name,
      riderPhone: demoRider.phone,
      riderScore: 4.96,
      pickupAddress: '333 W Sheridan Ave, Oklahoma City, OK 73102',
      pickupCoords: pickup1,
      dropoffAddress: '7100 Terminal Dr, Will Rogers World Airport, OK 73159',
      dropoffCoords: dropoff1,
      date: upcoming.date,
      timeSlot: upcoming.timeSlot,
      scheduledTimestamp: scheduledTs,
      status: RideStatus.Pending,
      fare: calculateCoopFare(pickup1, dropoff1),
      declinedByDriverIds: [],
      chatMessages: [],
      safetyReports: [],
      createdAt: new Date(nowMs - 18 * 60 * 1000).toISOString(),
    },
    {
      id: 'res-okc-hist-1',
      riderId: demoRider.id,
      riderName: 'Jordan Whitaker',
      riderPhone: '(405) 555-0131',
      riderScore: 4.94,
      pickupAddress: '333 W Sheridan Ave, Devon Tower, OKC, OK 73102',
      pickupCoords: pickup1,
      dropoffAddress: '7100 Terminal Dr, Will Rogers World Airport, OK 73159',
      dropoffCoords: dropoff1,
      date: todayStr,
      timeSlot: '08:30 AM',
      scheduledTimestamp: nowMs - 4 * 60 * 60 * 1000,
      completedTimestamp: nowMs - 3.5 * 60 * 60 * 1000,
      status: RideStatus.Completed,
      tripStage: 'completed',
      fare: {
        miles: 12.0,
        holdFee: 6.0,
        mileageCharge: 18.0,
        totalFare: 24.0,
        driverPayout70: 16.8,
        charityShare5: 1.2,
        operationsShare25: 6.0,
      },
      tipAmount: 5.0,
      durationMinutes: 22,
      driverId: demoDriver.id,
      driverName: demoDriver.name,
      driverPhone: demoDriver.phone,
      driverVehicle: '2024 Toyota Camry Hybrid XSE · OK · CVB-405',
      driverCoords: dropoff1,
      declinedByDriverIds: [],
      riderRatingByDriver: 5,
      chatMessages: [],
      safetyReports: [],
      createdAt: new Date(nowMs - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'res-okc-hist-2',
      riderId: demoRider.id,
      riderName: 'Claire Abernathy',
      riderPhone: '(405) 555-0155',
      riderScore: 4.99,
      pickupAddress: '100 N University Dr, Downtown Edmond, OK 73034',
      pickupCoords: {lat: 35.6552, lng: -97.4714},
      dropoffAddress: '100 E California Ave, Bricktown OKC, OK 73104',
      dropoffCoords: {lat: 35.4655, lng: -97.5082},
      date: todayStr,
      timeSlot: '11:00 AM',
      scheduledTimestamp: nowMs - 2 * 60 * 60 * 1000,
      completedTimestamp: nowMs - 1.5 * 60 * 60 * 1000,
      status: RideStatus.Completed,
      tripStage: 'completed',
      fare: {
        miles: 21.8,
        holdFee: 6.0,
        mileageCharge: 32.7,
        totalFare: 38.7,
        driverPayout70: 27.09,
        charityShare5: 1.94,
        operationsShare25: 9.67,
      },
      tipAmount: 3.61,
      durationMinutes: 29,
      driverId: demoDriver.id,
      driverName: demoDriver.name,
      driverPhone: demoDriver.phone,
      driverVehicle: '2024 Toyota Camry Hybrid XSE · OK · CVB-405',
      driverCoords: {lat: 35.4655, lng: -97.5082},
      declinedByDriverIds: [],
      riderRatingByDriver: 5,
      chatMessages: [],
      safetyReports: [],
      createdAt: new Date(nowMs - 2.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'res-okc-1001',
      riderId: demoRider.id,
      riderName: demoRider.name,
      riderPhone: demoRider.phone,
      riderScore: 4.96,
      pickupAddress: '1745 NW 16th St, Plaza District, Oklahoma City, OK 73106',
      pickupCoords: pickup2,
      dropoffAddress: '301 W Reno Ave, Myriad Botanical Gardens, OK 73102',
      dropoffCoords: dropoff2,
      date: twoDaysAgoStr,
      timeSlot: '07:00 PM',
      scheduledTimestamp: nowMs - 2 * 24 * 60 * 60 * 1000,
      completedTimestamp: nowMs - 2 * 24 * 60 * 60 * 1000,
      status: RideStatus.Completed,
      tripStage: 'completed',
      fare: {
        miles: 34.0,
        holdFee: 6.0,
        mileageCharge: 51.0,
        totalFare: 57.0,
        driverPayout70: 39.9,
        charityShare5: 2.85,
        operationsShare25: 14.25,
      },
      tipAmount: 3.85,
      durationMinutes: 38,
      driverId: demoDriver.id,
      driverName: demoDriver.name,
      driverPhone: demoDriver.phone,
      driverVehicle: '2024 Toyota Camry Hybrid XSE · OK · CVB-405',
      driverCoords: pickup2,
      declinedByDriverIds: [],
      riderRating: 5,
      riderReviewNote: 'Right on time in Plaza District and spotless ride downtown.',
      riderRatingByDriver: 5,
      chatMessages: [
        {
          id: 'msg-seed-1',
          senderRole: UserRole.Driver,
          senderName: 'Marcus Vance',
          text: 'Good evening Maya! Parked right in front of Lyric Theatre on NW 16th.',
          timestamp: '6:56 PM',
        },
        {
          id: 'msg-seed-2',
          senderRole: UserRole.Rider,
          senderName: 'Maya Thornton',
          text: 'Heading out the door right now, thank you Marcus!',
          timestamp: '6:57 PM',
        },
      ],
      safetyReports: [],
      createdAt: new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'res-okc-hist-3',
      riderId: demoRider.id,
      riderName: 'Devon & Priya Patel',
      riderPhone: '(405) 555-0188',
      riderScore: 4.92,
      pickupAddress: '900 Asp Ave, OU Campus Corner, Norman, OK 73019',
      pickupCoords: {lat: 35.2098, lng: -97.4458},
      dropoffAddress: '333 W Sheridan Ave, Downtown OKC, OK 73102',
      dropoffCoords: pickup1,
      date: twelveDaysAgoStr,
      timeSlot: '04:30 PM',
      scheduledTimestamp: nowMs - 12 * 24 * 60 * 60 * 1000,
      completedTimestamp: nowMs - 12 * 24 * 60 * 60 * 1000,
      status: RideStatus.Completed,
      tripStage: 'completed',
      fare: {
        miles: 35.5,
        holdFee: 6.0,
        mileageCharge: 53.25,
        totalFare: 59.25,
        driverPayout70: 41.48,
        charityShare5: 2.96,
        operationsShare25: 14.81,
      },
      tipAmount: 4.27,
      durationMinutes: 35,
      driverId: demoDriver.id,
      driverName: demoDriver.name,
      driverPhone: demoDriver.phone,
      driverVehicle: '2024 Toyota Camry Hybrid XSE · OK · CVB-405',
      driverCoords: pickup1,
      declinedByDriverIds: [],
      riderRatingByDriver: 5,
      chatMessages: [],
      safetyReports: [
        {
          id: 'saf-seed-1',
          category: 'Pickup Curb & Fare Timing Inquiry',
          details:
            'Rider reported waiting near Asp Ave bookstore entrance and asked for clarification on pickup curb pin & wait-time billing.',
          submittedBy: 'Devon & Priya Patel',
          submittedByRole: 'rider',
          submittedAt: new Date(nowMs - 2 * 60 * 60 * 1000).toLocaleString(),
          status: 'Queued for Co-op Human Safety Panel',
        },
      ],
      createdAt: new Date(nowMs - 12 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'res-okc-hist-4',
      riderId: demoRider.id,
      riderName: 'Hannah Brooks',
      riderPhone: '(405) 555-0112',
      riderScore: 4.89,
      pickupAddress: '500 W Main St, Yukon, OK 73099',
      pickupCoords: {lat: 35.5067, lng: -97.7625},
      dropoffAddress: '7100 Terminal Dr, Will Rogers World Airport, OK 73159',
      dropoffCoords: dropoff1,
      date: fortyDaysAgoStr,
      timeSlot: '06:00 AM',
      scheduledTimestamp: nowMs - 40 * 24 * 60 * 60 * 1000,
      completedTimestamp: nowMs - 40 * 24 * 60 * 60 * 1000,
      status: RideStatus.Completed,
      tripStage: 'completed',
      fare: {
        miles: 31.0,
        holdFee: 6.0,
        mileageCharge: 46.5,
        totalFare: 52.5,
        driverPayout70: 36.75,
        charityShare5: 2.63,
        operationsShare25: 13.12,
      },
      tipAmount: 5.75,
      durationMinutes: 31,
      driverId: demoDriver.id,
      driverName: demoDriver.name,
      driverPhone: demoDriver.phone,
      driverVehicle: '2024 Toyota Camry Hybrid XSE · OK · CVB-405',
      driverCoords: dropoff1,
      declinedByDriverIds: [],
      riderRatingByDriver: 5,
      chatMessages: [],
      safetyReports: [],
      createdAt: new Date(nowMs - 40 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  const seededPerks: BusinessPerk[] = [
    {
      id: 'perk-bricktown-brewery',
      businessId: 'biz-bricktown',
      businessName: 'Bricktown Brewery',
      district: 'Bricktown OKC',
      headline: '15% Off With RideApp Receipt',
      description: 'Present your same-day Oklahoma Co-op RideApp trip receipt at our E Sheridan Ave taproom.',
      promoCode: 'BREW15OKC',
      active: true,
      claimsCount: 148,
      createdAt: '2026-11-01T08:00:00Z',
    },
    {
      id: 'perk-okc-steakhouse',
      businessId: 'biz-midtown-2',
      businessName: 'OKC Steakhouse',
      district: 'Midtown OKC',
      headline: 'Free Appetizer',
      description: 'Complimentary artisan starter with any entrée when arriving via RideApp.',
      promoCode: 'STEAKOKC',
      active: true,
      claimsCount: 112,
      createdAt: '2026-11-03T12:00:00Z',
    },
    {
      id: 'perk-devon-cafe',
      businessId: 'biz-downtown',
      businessName: 'Devon Tower Café',
      district: 'Downtown OKC',
      headline: '$5 Off',
      description: 'Enjoy $5 off morning coffee, pastries, or lunch bowls at 333 W Sheridan Ave.',
      promoCode: 'DEVON5',
      active: true,
      claimsCount: 94,
      createdAt: '2026-11-05T15:00:00Z',
    },
    {
      id: 'perk-elemental',
      businessId: demoBusiness.id,
      businessName: 'Elemental Coffee Roasters',
      district: 'Midtown OKC',
      headline: '15% off espresso & breakfast tacos with RideApp receipt',
      description: 'Show today’s Oklahoma Co-op reservation pass at our N Hudson counter.',
      promoCode: 'RIDEOKC15',
      active: true,
      claimsCount: 84,
      createdAt: '2026-11-08T17:00:00Z',
    },
  ];

  return {
    accounts: [demoRider, demoDriver, demoBusiness],
    currentUserId: null,
    reservations: seededReservations,
    perks: seededPerks,
  };
}

export function loadAppState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = buildInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as AppState;
    if (!Array.isArray(parsed.accounts) || !Array.isArray(parsed.reservations)) {
      const fallback = buildInitialState();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return fallback;
    }
    // Ensure driver accounts always have 4-document expiration schema if loaded from older cache
    const normalizedAccounts = parsed.accounts.map((acc) => {
      if (acc.role !== UserRole.Driver) return acc;
      const existingDocs = acc.documents || [];
      const hasSsn = existingDocs.some((d) => d.id === 'ssn');
      const hasExp = existingDocs.every((d) => Boolean(d.expirationDate));
      if (hasSsn && hasExp) return acc;
      const defaultDocs = [
        {
          id: 'license' as const,
          title: "Driver's License",
          fileName: 'OK_REAL_ID_Driver.jpg',
          uploadedAt: 'Verified Oct 2026',
          verified: true,
          expiryNote: 'Class D · Valid thru 08/15/2029',
          expirationDate: '2029-08-15',
          status: 'active' as const,
        },
        {
          id: 'insurance' as const,
          title: 'Proof of Insurance',
          fileName: 'OK_TNC_Policy_2026.pdf',
          uploadedAt: 'Verified Oct 2026',
          verified: true,
          expiryNote: '$1M Co-op TNC Coverage · Valid thru 04/30/2027',
          expirationDate: '2027-04-30',
          status: 'active' as const,
        },
        {
          id: 'registration' as const,
          title: 'Vehicle Registration',
          fileName: 'OK_TaxCommission_Tag.pdf',
          uploadedAt: 'Verified Oct 2026',
          verified: true,
          expiryNote: 'Oklahoma County Tag · Valid thru 11/30/2027',
          expirationDate: '2027-11-30',
          status: 'active' as const,
        },
        {
          id: 'ssn' as const,
          title: 'Social Security Card',
          fileName: 'SSN_Identity_Verified.pdf',
          uploadedAt: 'Verified Oct 2026',
          verified: true,
          expiryNote: 'Identity & 1099 Payout Verified',
          expirationDate: 'Non-Expiring',
          status: 'active' as const,
        },
      ];
      return {
        ...acc,
        driverRating: acc.id === 'usr-driver-demo' ? 4.98 : acc.driverRating ?? 4.98,
        documents: defaultDocs.map((def) => {
          const prev = existingDocs.find((d) => d.id === def.id);
          return prev
            ? {
                ...def,
                ...prev,
                title: def.title,
                expirationDate: prev.expirationDate || def.expirationDate,
                status: prev.status || 'active',
              }
            : def;
        }),
      };
    });
    const hasSeededHist = parsed.reservations.some((r) => r.id === 'res-okc-hist-1');
    const normalizedReservations = hasSeededHist
      ? parsed.reservations
      : [
          ...parsed.reservations.map((r) =>
            r.id === 'res-okc-1001'
              ? {
                  ...r,
                  date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                  scheduledTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
                  completedTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000,
                  fare: {
                    miles: 34.0,
                    holdFee: 6.0,
                    mileageCharge: 51.0,
                    totalFare: 57.0,
                    driverPayout70: 39.9,
                    charityShare5: 2.85,
                    operationsShare25: 14.25,
                  },
                  tipAmount: 3.85,
                  durationMinutes: 38,
                }
              : r
          ),
          ...buildInitialState().reservations.filter((r) => r.id.startsWith('res-okc-hist-')),
        ];
    return {
      ...parsed,
      accounts: normalizedAccounts,
      reservations: normalizedReservations,
    };
  } catch {
    return buildInitialState();
  }
}

export function saveAppState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore quota errors in private browsing
  }
}
