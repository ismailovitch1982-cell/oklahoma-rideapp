import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  CreditCard,
  Headphones,
  Heart,
  LocateFixed,
  Lock,
  LogOut,
  MapPin,
  MessageSquare,
  Navigation,
  PackageSearch,
  Phone,
  Plus,
  Radio,
  RotateCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  TicketPercent,
  Timer,
  Utensils,
  X,
} from 'lucide-react';
import {
  BusinessPerk,
  ChatMessage,
  GeoPoint,
  PaymentMethodType,
  RideReservation,
  RideStatus,
  SafetyReport,
  SupportChatMessage,
  UserAccount,
  UserRole,
} from '../types/rideapp';
import {
  OKLAHOMA_LANDMARKS,
  calculateCascadeFare,
  calculateHaversineMiles,
  evaluateCancellationWindow,
  generateThirtyMinuteSlots,
  getDefaultUpcomingSlot,
  isPointInsideOklahoma,
  parseScheduleTimestamp,
  resolveOklahomaAddress,
} from '../utils/oklahomaGeo';

interface RiderDashboardProps {
  user: UserAccount;
  reservations: RideReservation[];
  perks: BusinessPerk[];
  availableDrivers: UserAccount[];
  onUpdateUser: (updated: UserAccount) => void;
  onCreateReservation: (reservation: RideReservation) => void;
  onUpdateReservation: (updated: RideReservation) => void;
  onClaimPerk: (perkId: string) => void;
  onLogout: () => void;
}

type RiderTab = 'reserve' | 'rides' | 'impact';
type BookingMode = 'instant' | 'reserve';
type SupportSection = 'menu' | 'lost_found' | 'write_support';

interface QueuedOklahomaDriver {
  id: string;
  name: string;
  shortName: string;
  rating: number;
  phone: string;
  vehicle: string;
  distanceMiles: number;
  coordsOffsetLat: number;
  coordsOffsetLng: number;
}

const DEFAULT_OKC_COORDS: GeoPoint = {lat: 35.4668, lng: -97.5181};
const SUPPORT_PHONE_TEL = 'tel:+14055550199';
const SUPPORT_PHONE_DISPLAY = '(405) 555-0199';
const FREE_WAIT_LIMIT_SECONDS = 300;
const EXTRA_WAIT_RATE_PER_MIN = 0.2;

function formatTimerMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || 'OK';
}

function formatCountdown(scheduledTimestamp: number, nowMs: number): {
  label: string;
  isFreeRefund: boolean;
} {
  const diffMs = scheduledTimestamp - nowMs;
  if (diffMs <= 0) {
    return {
      label: 'Pickup window active · Cancel hold transfers to driver',
      isFreeRefund: false,
    };
  }
  const totalMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const timeText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const isFreeRefund = diffMs >= 30 * 60 * 1000;
  return {
    label: isFreeRefund
      ? `${timeText} until pickup · Free $6.00 refund eligible (30+ min rule)`
      : `${timeText} until pickup · Inside 30-min window ($6.00 transfers to driver)`,
    isFreeRefund,
  };
}

export const RiderDashboard: React.FC<RiderDashboardProps> = ({
  user,
  reservations,
  perks,
  availableDrivers,
  onUpdateUser,
  onCreateReservation,
  onUpdateReservation,
  onClaimPerk,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<RiderTab>('reserve');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // 1-second/15-second clock for countdown badges in My Rides
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  // Ride Mode & Live Driver Availability Demo Toggle
  const [bookingMode, setBookingMode] = useState<BookingMode>('instant');
  const [testDriverPoolMode, setTestDriverPoolMode] = useState<'online' | 'zero'>('online');
  const [showBookingFormOverride, setShowBookingFormOverride] = useState<boolean>(false);

  // Build ordered Closest-Driver Oklahoma Queue (Driver #1 syncs with live DriverDashboard user)
  const closestDriverQueue: QueuedOklahomaDriver[] = useMemo(() => {
    const primaryDriver =
      availableDrivers.find((d) => d.id === 'usr-driver-demo') || availableDrivers[0];

    const primaryName = primaryDriver?.name || 'Marcus Vance';
    const primaryParts = primaryName.trim().split(/\s+/);
    const primaryShort =
      primaryParts.length >= 2
        ? `${primaryParts[0]} ${primaryParts[1][0]}.`
        : primaryName;

    const primaryVehicle = primaryDriver?.vehicle
      ? `${primaryDriver.vehicle.year} ${primaryDriver.vehicle.make} ${primaryDriver.vehicle.model} · ${primaryDriver.vehicle.plate}`
      : '2024 Toyota Camry Hybrid XSE · OK · CVB-405';

    return [
      {
        id: primaryDriver?.id || 'usr-driver-demo',
        name: primaryName,
        shortName: primaryShort,
        rating: primaryDriver?.driverRating || 4.98,
        phone: primaryDriver?.phone || '(405) 555-0198',
        vehicle: primaryVehicle,
        distanceMiles: 1.2,
        coordsOffsetLat: 0.014,
        coordsOffsetLng: -0.011,
      },
      {
        id: 'drv-okc-elena',
        name: 'Elena Brooks',
        shortName: 'Elena B.',
        rating: 4.96,
        phone: '(405) 555-0164',
        vehicle: '2025 Lexus ES 300h · OK · OKC-812',
        distanceMiles: 2.8,
        coordsOffsetLat: -0.029,
        coordsOffsetLng: 0.025,
      },
      {
        id: 'drv-okc-caleb',
        name: 'Caleb Hayes',
        shortName: 'Caleb H.',
        rating: 4.95,
        phone: '(405) 555-0139',
        vehicle: '2024 Honda Accord Touring · OK · TUL-209',
        distanceMiles: 4.5,
        coordsOffsetLat: 0.048,
        coordsOffsetLng: 0.036,
      },
      {
        id: 'drv-okc-wyatt',
        name: 'Wyatt Monroe',
        shortName: 'Wyatt M.',
        rating: 4.93,
        phone: '(405) 555-0122',
        vehicle: '2024 Toyota Crown Limited · OK · EDM-514',
        distanceMiles: 6.1,
        coordsOffsetLat: -0.062,
        coordsOffsetLng: -0.044,
      },
    ];
  }, [availableDrivers]);

  const onlineDriversCount = testDriverPoolMode === 'online' ? closestDriverQueue.length : 0;

  // Booking Form State
  const defaultSchedule = useMemo(() => getDefaultUpcomingSlot(), []);
  const timeSlots = useMemo(() => generateThirtyMinuteSlots(), []);

  const [pickupInput, setPickupInput] = useState(
    user.homeAddress || '1745 NW 16th St, Plaza District, Oklahoma City, OK 73106'
  );
  const [pickupCoords, setPickupCoords] = useState<GeoPoint | undefined>({
    lat: 35.4855,
    lng: -97.5403,
  });
  const [hasStop1, setHasStop1] = useState<boolean>(false);
  const [stop1Input, setStop1Input] = useState<string>('');
  const [stop1Coords, setStop1Coords] = useState<GeoPoint | undefined>(undefined);
  const [dropoffInput, setDropoffInput] = useState(
    '333 W Sheridan Ave, Oklahoma City, OK 73102'
  );
  const [dropoffCoords, setDropoffCoords] = useState<GeoPoint | undefined>(DEFAULT_OKC_COORDS);
  const [rideDate, setRideDate] = useState(defaultSchedule.date);
  const [rideSlot, setRideSlot] = useState(defaultSchedule.timeSlot);
  const [scheduleQuickMode, setScheduleQuickMode] = useState<'standard' | 'late-test'>(
    'standard'
  );

  const [gpsStatusNotice, setGpsStatusNotice] = useState<string | null>(null);
  const [geofenceError, setGeofenceError] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  const showTemporaryToast = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => {
      setActionToast((prev) => (prev === message ? null : prev));
    }, 3600);
  };

  // Rider Reservations (newest first)
  const riderReservations = useMemo(
    () =>
      reservations
        .filter((r) => r.riderId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [reservations, user.id]
  );

  // Track the current live trip / search the user is viewing on Reserve tab
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // Auto-select any newly accepted or currently pending instant trip on Reserve tab
  const focusedTrip = useMemo(() => {
    if (showBookingFormOverride) return null;
    if (activeRequestId) {
      const match = riderReservations.find((r) => r.id === activeRequestId);
      if (match && (match.status === RideStatus.Pending || match.status === RideStatus.Accepted)) {
        return match;
      }
    }
    const accepted = riderReservations.find((r) => r.status === RideStatus.Accepted);
    if (accepted) return accepted;
    const instantPending = riderReservations.find(
      (r) => r.status === RideStatus.Pending && r.bookingMode === 'instant'
    );
    return instantPending || null;
  }, [activeRequestId, riderReservations, showBookingFormOverride]);

  const [cascadeFeedbackNote, setCascadeFeedbackNote] = useState<string | null>(null);
  const [waitTickMs, setWaitTickMs] = useState<number>(() => Date.now());

  // 1-second tick while driver is waiting at Pickup or Stop 1
  useEffect(() => {
    const stage = focusedTrip?.tripStage;
    if (
      !focusedTrip ||
      focusedTrip.status !== RideStatus.Accepted ||
      (stage !== 'arrived_pickup' && stage !== 'arrived_stop1')
    ) {
      return;
    }
    setWaitTickMs(Date.now());
    const id = window.setInterval(() => setWaitTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [
    focusedTrip?.id,
    focusedTrip?.status,
    focusedTrip?.tripStage,
    focusedTrip?.arrivedAtPickupTimestamp,
    focusedTrip?.arrivedAtStop1Timestamp,
    focusedTrip?.pickupExtraWaitStartedAt,
    focusedTrip?.stop1ExtraWaitStartedAt,
  ]);

  // Zero-Map Live Phone GPS Trigger (navigator.geolocation.watchPosition) when trip is Accepted
  const [liveRiderGps, setLiveRiderGps] = useState<GeoPoint | null>(null);
  const [gpsWatchStatus, setGpsWatchStatus] = useState<string>(
    'Oklahoma Phone GPS Standby'
  );
  const gpsWatchIdRef = useRef<number | null>(null);

  useEffect(() => {
    const hasAcceptedTrip = focusedTrip?.status === RideStatus.Accepted;
    if (!hasAcceptedTrip) {
      if (gpsWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
      setGpsWatchStatus('Oklahoma Phone GPS Standby');
      return;
    }

    if (!('geolocation' in navigator)) {
      setLiveRiderGps(focusedTrip.pickupCoords);
      setGpsWatchStatus('Live Phone GPS Active · OKC Metro Lock');
      return;
    }

    setGpsWatchStatus('Live Phone GPS Active · Tracking Pickup Proximity');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        if (isPointInsideOklahoma(coords)) {
          setLiveRiderGps(coords);
          setGpsWatchStatus('Live Phone GPS Active · Oklahoma Signal Locked');
        } else {
          setLiveRiderGps(focusedTrip.pickupCoords);
          setGpsWatchStatus('Live Phone GPS Active · OKC Metro Frame Lock');
        }
      },
      () => {
        setLiveRiderGps(focusedTrip.pickupCoords);
        setGpsWatchStatus('Live Phone GPS Active · OKC Coordinates Synced');
      },
      {enableHighAccuracy: true, maximumAge: 5000, timeout: 8000}
    );
    gpsWatchIdRef.current = watchId;

    return () => {
      if (gpsWatchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
        gpsWatchIdRef.current = null;
      }
    };
  }, [focusedTrip?.id, focusedTrip?.status, focusedTrip?.pickupCoords]);

  // Live Driver Distance & ETA Calculation (zero-map)
  const liveDriverTelemetry = useMemo(() => {
    if (!focusedTrip || focusedTrip.status !== RideStatus.Accepted) {
      return {distanceMiles: 0, etaMins: 0};
    }
    const riderAnchor = liveRiderGps || focusedTrip.pickupCoords;
    const targetCoords =
      focusedTrip.tripStage === 'in_progress'
        ? focusedTrip.dropoffCoords
        : focusedTrip.tripStage === 'en_route_stop1' && focusedTrip.stop1Coords
        ? focusedTrip.stop1Coords
        : riderAnchor;
    const driverPoint = focusedTrip.driverCoords || {
      lat: focusedTrip.pickupCoords.lat + 0.015,
      lng: focusedTrip.pickupCoords.lng - 0.012,
    };

    const atPickupCoords =
      Math.abs(driverPoint.lat - focusedTrip.pickupCoords.lat) < 0.0006 &&
      Math.abs(driverPoint.lng - focusedTrip.pickupCoords.lng) < 0.0006;

    if (
      focusedTrip.tripStage === 'arrived_pickup' ||
      focusedTrip.tripStage === 'arrived_stop1' ||
      (atPickupCoords && (!focusedTrip.tripStage || focusedTrip.tripStage === 'en_route_pickup'))
    ) {
      return {distanceMiles: 0.0, etaMins: 0};
    }

    const rawMiles = calculateHaversineMiles(driverPoint, targetCoords);
    const distanceMiles = Number(rawMiles.toFixed(1));
    const etaMins = Math.max(1, Math.round(distanceMiles * 2.8));
    return {distanceMiles, etaMins};
  }, [focusedTrip, liveRiderGps]);

  // Rotating Local OKC Business Perks Banner (rotates every 3 seconds)
  const activePerks = useMemo(() => perks.filter((p) => p.active), [perks]);
  const [perkIndex, setPerkIndex] = useState<number>(0);
  const [claimedPerkIds, setClaimedPerkIds] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (activePerks.length <= 1) return;
    const id = window.setInterval(() => {
      setPerkIndex((prev) => (prev + 1) % activePerks.length);
    }, 3000);
    return () => window.clearInterval(id);
  }, [activePerks.length]);

  const currentPerk = activePerks[perkIndex % Math.max(1, activePerks.length)] || null;

  // In-App Rider-to-Driver Chat Drawer
  const [showChatDrawer, setShowChatDrawer] = useState<boolean>(false);
  const [chatDraft, setChatDraft] = useState<string>('');
  const [callBanner, setCallBanner] = useState<string | null>(null);

  // Rate / Report Safety Modal
  const [rateReportTargetRide, setRateReportTargetRide] = useState<RideReservation | null>(null);
  const [rateReportTab, setRateReportTab] = useState<'rate' | 'report'>('rate');
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [reviewNote, setReviewNote] = useState<string>('');
  const [safetyCategory, setSafetyCategory] = useState<string>(
    'Route or Driving Safety Concern'
  );
  const [safetyDetails, setSafetyDetails] = useState<string>('');
  const [safetySubmittedMsg, setSafetySubmittedMsg] = useState<string | null>(null);

  // Support Modal (Opened from 4th Bottom Tab "Support")
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);
  const [supportSection, setSupportSection] = useState<SupportSection>('menu');
  const [lostFoundTripId, setLostFoundTripId] = useState<string>('');
  const [lostFoundItemDesc, setLostFoundItemDesc] = useState<string>('');
  const [lostFoundFeeAgreed, setLostFoundFeeAgreed] = useState<boolean>(false);
  const [supportTicketDraft, setSupportTicketDraft] = useState<string>('');
  const [supportCallNote, setSupportCallNote] = useState<string | null>(null);

  const riderTripsForLostFound = useMemo(
    () =>
      riderReservations.filter(
        (r) => r.status === RideStatus.Completed || r.status === RideStatus.Accepted
      ),
    [riderReservations]
  );

  // OKC Community Impact Metrics (from Rider's 5% fare contributions)
  const okcImpactMetrics = useMemo(() => {
    const qualifyingTrips = riderReservations.filter(
      (r) => r.status === RideStatus.Completed || r.status === RideStatus.Accepted
    );
    const totalCharityDollars = Number(
      qualifyingTrips.reduce((sum, r) => sum + (r.fare?.charityShare5 || 0), 0).toFixed(2)
    );
    const totalSpent = Number(
      qualifyingTrips.reduce((sum, r) => sum + (r.fare?.totalFare || 0), 0).toFixed(2)
    );
    // Transparent OKC Co-op impact ratios:
    // $1.75 per Oklahoma family meal | $4.50 per outreach care kit | $6.50 toward OKC kids school clothing
    const mealsFunded = Math.max(0, Math.round(totalCharityDollars / 1.75));
    const outreachKitsFunded = Math.max(0, Math.round(totalCharityDollars / 4.5));
    const schoolClothesFunded = Math.max(0, Math.round(totalCharityDollars / 6.5));

    return {
      qualifyingTrips,
      totalCharityDollars,
      totalSpent,
      mealsFunded,
      outreachKitsFunded,
      schoolClothesFunded,
    };
  }, [riderReservations]);

  // Handlers
  const handleUseCurrentPhoneGps = () => {
    setGeofenceError(null);
    setGpsStatusNotice('Reading native HTML5 Phone GPS...');

    if (!('geolocation' in navigator)) {
      setPickupCoords(DEFAULT_OKC_COORDS);
      setPickupInput('Phone GPS · 333 W Sheridan Ave, Downtown OKC, OK 73102');
      setGpsStatusNotice('Locked onto Downtown OKC Devon Tower GPS ($0 API cost).');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        if (isPointInsideOklahoma(coords)) {
          setPickupCoords(coords);
          setPickupInput(
            `Phone GPS (${coords.lat.toFixed(4)}°N, ${Math.abs(coords.lng).toFixed(4)}°W), OK`
          );
          setGpsStatusNotice('Locked onto your live Oklahoma Phone GPS coordinates.');
        } else {
          setPickupCoords(DEFAULT_OKC_COORDS);
          setPickupInput('Phone GPS · 333 W Sheridan Ave, Downtown OKC, OK 73102');
          setGpsStatusNotice(
            'Preview device outside OK border — snapped to Downtown OKC GPS Zone.'
          );
        }
      },
      () => {
        setPickupCoords(DEFAULT_OKC_COORDS);
        setPickupInput('Phone GPS · 333 W Sheridan Ave, Downtown OKC, OK 73102');
        setGpsStatusNotice('Phone GPS synced to Downtown OKC Devon Tower.');
      },
      {enableHighAccuracy: true, timeout: 6000}
    );
  };

  const handleSubmitRideRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setGeofenceError(null);
    setCascadeFeedbackNote(null);

    if (bookingMode === 'instant' && onlineDriversCount === 0) {
      setGeofenceError(
        'No instant drivers online right now — switch to Reserve Ride to guarantee your pickup.'
      );
      return;
    }

    const pRes = resolveOklahomaAddress(pickupInput, pickupCoords);
    if (!pRes.valid || !pRes.coords) {
      setGeofenceError(pRes.error || 'Please enter a valid Oklahoma pickup address.');
      return;
    }

    let validatedStop1Address: string | undefined;
    let validatedStop1Coords: GeoPoint | undefined;
    if (bookingMode === 'instant' && hasStop1) {
      const s1Res = resolveOklahomaAddress(stop1Input, stop1Coords);
      if (!s1Res.valid || !s1Res.coords) {
        setGeofenceError(
          s1Res.error || 'Please enter a valid Oklahoma address for Stop 1 or remove the stop.'
        );
        return;
      }
      validatedStop1Address = s1Res.normalizedAddress || stop1Input.trim();
      validatedStop1Coords = s1Res.coords;
    }

    const dRes = resolveOklahomaAddress(dropoffInput, dropoffCoords);
    if (!dRes.valid || !dRes.coords) {
      setGeofenceError(dRes.error || 'Please enter a valid Oklahoma drop-off address.');
      return;
    }

    const isScheduledReserve = bookingMode === 'reserve';
    const firstDriver = closestDriverQueue[0];
    const driverDistanceMiles = firstDriver?.distanceMiles ?? 1.2;

    // Silent $1.50/mile cascade calculation across every leg (NOT shown to rider until a driver accepts)
    const silentFare = calculateCascadeFare(
      pRes.coords,
      dRes.coords,
      driverDistanceMiles,
      isScheduledReserve,
      validatedStop1Coords
    );

    const scheduledTimestamp = isScheduledReserve
      ? scheduleQuickMode === 'late-test'
        ? Date.now() + 18 * 60 * 1000
        : Math.max(Date.now() + 65 * 60 * 1000, parseScheduleTimestamp(rideDate, rideSlot))
      : Date.now();

    const newReservation: RideReservation = {
      id: `res-okc-${Math.floor(1000 + Math.random() * 9000)}`,
      riderId: user.id,
      riderName: user.name,
      riderPhone: user.phone,
      riderScore: 4.96,
      pickupAddress: pRes.normalizedAddress || pickupInput.trim(),
      pickupCoords: pRes.coords,
      stop1Address: validatedStop1Address,
      stop1Coords: validatedStop1Coords,
      dropoffAddress: dRes.normalizedAddress || dropoffInput.trim(),
      dropoffCoords: dRes.coords,
      date: isScheduledReserve ? rideDate : new Date().toISOString().slice(0, 10),
      timeSlot: isScheduledReserve
        ? scheduleQuickMode === 'late-test'
          ? 'In 18 Mins (Window Test)'
          : rideSlot
        : 'Instant Pickup',
      scheduledTimestamp,
      status: RideStatus.Pending,
      bookingMode,
      driverQueueIndex: 0,
      driverDistanceToPickupMiles: driverDistanceMiles,
      fare: silentFare,
      declinedByDriverIds: [],
      chatMessages: [],
      safetyReports: [],
      createdAt: new Date().toISOString(),
    };

    onCreateReservation(newReservation);
    setActiveRequestId(newReservation.id);
    setShowBookingFormOverride(false);
    setCascadeFeedbackNote(
      'Checking closest Oklahoma Co-op driver quietly without revealing fare...'
    );
  };

  // Closest-Driver Cascade: Decline -> Automatically move to next closest driver & silently recalculate $1.50/mi fare
  const handleSimulateClosestDriverDeclines = (res: RideReservation) => {
    const currentIdx = res.driverQueueIndex ?? 0;
    const currentDriver = closestDriverQueue[currentIdx];
    const nextDeclinedIds = currentDriver
      ? Array.from(new Set([...res.declinedByDriverIds, currentDriver.id]))
      : res.declinedByDriverIds;

    const nextIdx = currentIdx + 1;
    if (nextIdx >= closestDriverQueue.length) {
      // Wrap or inform cleanly — offer next cycle or Reserve Ride
      setCascadeFeedbackNote(
        'All 4 nearby drivers declined this offer — cycling back to closest available Oklahoma drivers...'
      );
      const resetDriver = closestDriverQueue[0];
      const recalculatedFare = calculateCascadeFare(
        res.pickupCoords,
        res.dropoffCoords,
        resetDriver.distanceMiles,
        res.bookingMode === 'reserve',
        res.stop1Coords
      );
      onUpdateReservation({
        ...res,
        driverQueueIndex: 0,
        driverDistanceToPickupMiles: resetDriver.distanceMiles,
        fare: recalculatedFare,
        declinedByDriverIds: [],
      });
      return;
    }

    const nextDriver = closestDriverQueue[nextIdx];
    const recalculatedFare = calculateCascadeFare(
      res.pickupCoords,
      res.dropoffCoords,
      nextDriver.distanceMiles,
      res.bookingMode === 'reserve',
      res.stop1Coords
    );

    onUpdateReservation({
      ...res,
      driverQueueIndex: nextIdx,
      driverDistanceToPickupMiles: nextDriver.distanceMiles,
      fare: recalculatedFare,
      declinedByDriverIds: nextDeclinedIds,
    });

    setCascadeFeedbackNote(
      `Driver #${currentIdx + 1} (${currentDriver?.distanceMiles.toFixed(1)} mi away) passed — routed silently to Driver #${nextIdx + 1} (${nextDriver.distanceMiles.toFixed(1)} mi away) and recalculated fare in background.`
    );
  };

  // Closest-Driver Cascade: Accept -> Reveal Locked Driver Profile, Live GPS, and Final Fare
  const handleSimulateDriverAccepts = (res: RideReservation) => {
    const idx = Math.min(res.driverQueueIndex ?? 0, closestDriverQueue.length - 1);
    const matchedDriver = closestDriverQueue[idx];

    // Ensure fare matches the accepting driver's exact pickup distance + Stop 1 + trip distance at $1.50/mi
    const lockedFare = calculateCascadeFare(
      res.pickupCoords,
      res.dropoffCoords,
      matchedDriver.distanceMiles,
      res.bookingMode === 'reserve',
      res.stop1Coords
    );

    const startCoords: GeoPoint = {
      lat: Number((res.pickupCoords.lat + matchedDriver.coordsOffsetLat).toFixed(5)),
      lng: Number((res.pickupCoords.lng + matchedDriver.coordsOffsetLng).toFixed(5)),
    };

    const updated: RideReservation = {
      ...res,
      status: RideStatus.Accepted,
      tripStage: 'en_route_pickup',
      driverQueueIndex: idx,
      driverDistanceToPickupMiles: matchedDriver.distanceMiles,
      fare: lockedFare,
      driverId: matchedDriver.id,
      driverName: matchedDriver.name,
      driverPhone: matchedDriver.phone,
      driverVehicle: matchedDriver.vehicle,
      driverCoords: startCoords,
      chatMessages: [
        ...res.chatMessages,
        {
          id: `msg-acc-${Date.now()}`,
          senderRole: UserRole.Driver,
          senderName: matchedDriver.name,
          text: `Hi ${user.name.split(' ')[0]}! I accepted your RideApp Oklahoma trip and am heading toward your pickup now.`,
          timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
        },
      ],
    };

    onUpdateReservation(updated);
    setCascadeFeedbackNote(null);
  };

  const handleStepDriverCloserDemo = (res: RideReservation) => {
    if (!res.driverCoords) return;
    const nextLat = Number(
      (res.driverCoords.lat + (res.pickupCoords.lat - res.driverCoords.lat) * 0.55).toFixed(5)
    );
    const nextLng = Number(
      (res.driverCoords.lng + (res.pickupCoords.lng - res.driverCoords.lng) * 0.55).toFixed(5)
    );
    const remaining = calculateHaversineMiles({lat: nextLat, lng: nextLng}, res.pickupCoords);
    const arrived = remaining <= 0.9;

    onUpdateReservation({
      ...res,
      driverCoords: arrived ? res.pickupCoords : {lat: nextLat, lng: nextLng},
      tripStage: arrived ? 'arrived_pickup' : 'en_route_pickup',
      arrivedAtPickupTimestamp: arrived
        ? res.arrivedAtPickupTimestamp || Date.now()
        : res.arrivedAtPickupTimestamp,
    });
  };

  const handleCompleteTripDemo = (res: RideReservation) => {
    onUpdateReservation({
      ...res,
      status: RideStatus.Completed,
      tripStage: 'completed',
      completedTimestamp: Date.now(),
      durationMinutes: 18,
      driverCoords: res.dropoffCoords,
    });
    setRateReportTargetRide(res);
    setRateReportTab('rate');
    setSelectedStars(5);
    setReviewNote('');
    setSafetyDetails('');
    setSafetySubmittedMsg(null);
    showTemporaryToast('Trip completed! Thank you for riding with Oklahoma Co-op.');
  };

  const handleCancelReservation = (res: RideReservation) => {
    const policy = evaluateCancellationWindow(res.scheduledTimestamp);
    onUpdateReservation({
      ...res,
      status: RideStatus.Cancelled,
      refundedHoldFee: policy.isFreeRefund,
      cancellationNote: policy.summary,
    });
    if (activeRequestId === res.id) {
      setActiveRequestId(null);
    }
    showTemporaryToast(policy.summary);
  };

  const handleSendRiderChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!focusedTrip || !chatDraft.trim()) return;

    const riderMsg: ChatMessage = {
      id: `msg-rdr-${Date.now()}`,
      senderRole: UserRole.Rider,
      senderName: user.name,
      text: chatDraft.trim(),
      timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
    };

    const nextMessages = [...focusedTrip.chatMessages, riderMsg];
    const updatedTrip: RideReservation = {
      ...focusedTrip,
      chatMessages: nextMessages,
    };
    onUpdateReservation(updatedTrip);
    setChatDraft('');

    window.setTimeout(() => {
      const driverReply: ChatMessage = {
        id: `msg-drv-ack-${Date.now()}`,
        senderRole: UserRole.Driver,
        senderName: focusedTrip.driverName || 'Marcus Vance',
        text: 'Got your message — watching your pickup curb and will text when I pull up!',
        timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
      };
      onUpdateReservation({
        ...updatedTrip,
        chatMessages: [...nextMessages, driverReply],
      });
    }, 900);
  };

  const handleOpenRateReport = (ride: RideReservation, initialTab: 'rate' | 'report' = 'rate') => {
    setRateReportTargetRide(ride);
    setRateReportTab(initialTab);
    setSelectedStars(ride.riderRating || 5);
    setReviewNote(ride.riderReviewNote || '');
    setSafetyCategory('Route or Driving Safety Concern');
    setSafetyDetails('');
    setSafetySubmittedMsg(null);
  };

  const handleSaveDriverRating = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateReportTargetRide) return;
    onUpdateReservation({
      ...rateReportTargetRide,
      riderRating: selectedStars,
      riderReviewNote: reviewNote.trim() || rateReportTargetRide.riderReviewNote,
    });
    setRateReportTargetRide(null);
    showTemporaryToast(`Saved ${selectedStars} ★ rating for ${rateReportTargetRide.driverName || 'your driver'}.`);
  };

  const handleSubmitSafetyReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rateReportTargetRide || !safetyDetails.trim()) return;

    const newReport: SafetyReport = {
      id: `saf-${Date.now()}`,
      category: safetyCategory,
      details: safetyDetails.trim(),
      submittedBy: user.name,
      submittedByRole: 'rider',
      submittedAt: new Date().toLocaleString(),
      status: 'Queued for Co-op Human Safety Panel',
    };

    const updated: RideReservation = {
      ...rateReportTargetRide,
      safetyReports: [...(rateReportTargetRide.safetyReports || []), newReport],
    };
    onUpdateReservation(updated);
    setRateReportTargetRide(updated);
    setSafetyDetails('');
    setSafetySubmittedMsg(
      'Sent simultaneously to both your Driver’s Support Inbox (for contractor response & resolution) and RideApp Oklahoma Co-op Safety Desk.'
    );
  };

  const handleOpenSupportModal = (section: SupportSection = 'menu') => {
    if (!lostFoundTripId && riderTripsForLostFound[0]) {
      setLostFoundTripId(riderTripsForLostFound[0].id);
    }
    setSupportSection(section);
    setSupportCallNote(null);
    setShowSupportModal(true);
  };

  const handleSubmitLostFoundClaim = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lostFoundItemDesc.trim() || !lostFoundFeeAgreed) return;
    const targetTrip =
      riderTripsForLostFound.find((r) => r.id === lostFoundTripId) ||
      riderTripsForLostFound[0];
    if (!targetTrip) return;

    const updatedTrip: RideReservation = {
      ...targetTrip,
      lostFoundRiderRequested: true,
      lostFoundRiderItemDescription: lostFoundItemDesc.trim(),
      lostFoundRiderFeeAgreed: true,
      lostFoundRiderRequestedAt: new Date().toLocaleString(),
      chatMessages: [
        ...targetTrip.chatMessages,
        {
          id: `msg-lf-rdr-${Date.now()}`,
          senderRole: UserRole.Rider,
          senderName: user.name,
          text: `Lost & Found Claim: "${lostFoundItemDesc.trim()}". I agree to the $20.00 return fee paid directly to the driver upon item return.`,
          timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
        },
      ],
    };

    onUpdateReservation(updatedTrip);
    setLostFoundItemDesc('');
    setLostFoundFeeAgreed(false);
    setShowSupportModal(false);
    showTemporaryToast(
      `Lost & Found claim sent to ${targetTrip.driverName || 'your driver'} ($20.00 return fee authorized upon return).`
    );
  };

  const handleSendSupportTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportTicketDraft.trim()) return;
    const nowTime = new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    const nextMessages: SupportChatMessage[] = [
      ...(user.supportMessages || []),
      {
        id: `sup-rdr-${Date.now()}`,
        sender: 'rider',
        category: 'Rider Written Support',
        text: supportTicketDraft.trim(),
        timestamp: nowTime,
      },
      {
        id: `sup-ack-${Date.now() + 1}`,
        sender: 'support',
        category: 'Rider Written Support',
        text: 'Received by RideApp Oklahoma Rider Support. An OKC human team member will follow up with you directly.',
        timestamp: nowTime,
      },
    ];
    onUpdateUser({...user, supportMessages: nextMessages});
    setSupportTicketDraft('');
  };

  const upcomingScheduledRides = useMemo(
    () =>
      riderReservations.filter(
        (r) => r.status === RideStatus.Pending || r.status === RideStatus.Accepted
      ),
    [riderReservations]
  );

  const pastTripReceipts = useMemo(
    () =>
      riderReservations.filter(
        (r) => r.status === RideStatus.Completed || r.status === RideStatus.Cancelled
      ),
    [riderReservations]
  );

  const riderInitials = getInitials(user.name);
  const activeDriverIndex = Math.min(
    focusedTrip?.driverQueueIndex ?? 0,
    closestDriverQueue.length - 1
  );

  return (
    <div className="min-h-full bg-transparent text-[#DFC07D] pb-24">
      {/* ================================================================== */}
      {/* 1. TOP HEADER (AVATAR + RIDEAPP SERIF LOGO + LOG OUT)              */}
      {/* ================================================================== */}
      <header className="sticky top-0 z-30 bg-[#020612]/72 backdrop-blur-[10px] border-b border-[#C5A059]/30">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Rider Circular Gold-Framed Profile Avatar + RideApp Gold Serif Logo */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-br from-[#FFF2CC] via-[#DFC07D] to-[#7A5C29] shadow-[0_0_12px_rgba(223,192,125,0.28)] shrink-0">
              <div className="w-full h-full rounded-full bg-[#020612]/72 backdrop-blur-[10px] flex items-center justify-center overflow-hidden relative">
                <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
                  <defs>
                    <radialGradient id="riderAvatarGlow" cx="50%" cy="30%" r="70%">
                      <stop offset="0%" stopColor="#C5A059" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#020612" stopOpacity="1" />
                    </radialGradient>
                  </defs>
                  <rect width="64" height="64" fill="url(#riderAvatarGlow)" />
                  <circle
                    cx="32"
                    cy="24"
                    r="10"
                    fill="#DFC07D"
                    fillOpacity="0.18"
                    stroke="#DFC07D"
                    strokeWidth="1.5"
                  />
                  <path
                    d="M14 56c2-11 9.5-16 18-16s16 5 18 16"
                    fill="#DFC07D"
                    fillOpacity="0.16"
                    stroke="#DFC07D"
                    strokeWidth="1.5"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center font-cinzel text-[11px] font-bold text-[#DFC07D] tracking-wider">
                  {riderInitials}
                </span>
              </div>
            </div>

            <div className="min-w-0">
              <span className="font-cinzel text-lg sm:text-xl font-bold tracking-[0.14em] text-champagne-glow block leading-none">
                RideApp
              </span>
              <span className="text-[10px] tracking-[0.12em] uppercase text-[#B89650] block truncate mt-0.5">
                {user.name} · Oklahoma Co-op
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            className="h-10 px-3.5 rounded-lg border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-xs font-semibold text-[#DFC07D] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            <LogOut className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-3.5 sm:px-4 pt-3 flex flex-col gap-3">
        {/* Non-blocking Toast Banner */}
        {actionToast && (
          <div className="rounded-xl border border-[#DFC07D]/60 bg-[#C5A059]/15 px-4 py-3 text-xs font-semibold text-[#DFC07D] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#DFC07D] shrink-0" />
            <span>{actionToast}</span>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 1: RESERVE (BOOKING + CASCADE SEARCH + ACTIVE GPS + PERKS)   */}
        {/* ================================================================ */}
        {activeTab === 'reserve' && (
          <div className="flex flex-col gap-3">
            {/* CASE A: POST-ACCEPTANCE ACTIVE TRIP CARD (ZERO-MAP GPS) */}
            {focusedTrip && focusedTrip.status === RideStatus.Accepted ? (
              <section className="relative obsidian-login-card rounded-xl p-4 sm:p-5 space-y-4">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#C5A059] rounded-tl-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#C5A059] rounded-tr-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#C5A059] rounded-bl-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#C5A059] rounded-br-xl"
                />

                {/* Pulsing LIVE PHONE GPS ACTIVE Badge + Stage */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#DFC07D]/70 bg-[#C5A059]/15 text-[10.5px] font-bold tracking-[0.14em] uppercase text-[#DFC07D]">
                    <span className="w-2 h-2 rounded-full bg-[#DFC07D] animate-pulse shadow-[0_0_8px_#DFC07D]" />
                    <span>LIVE PHONE GPS ACTIVE</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowBookingFormOverride(true)}
                    className="text-[11px] font-semibold text-[#B89650] hover:text-[#DFC07D] underline cursor-pointer"
                  >
                    + New Booking
                  </button>
                </div>

                {/* Driver Profile Row */}
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-[#FFF2CC] via-[#DFC07D] to-[#7A5C29] shrink-0">
                      <div className="w-full h-full rounded-full bg-[#020612]/72 backdrop-blur-[10px] flex items-center justify-center relative">
                        <span className="font-cinzel text-xs font-bold text-[#DFC07D]">
                          {getInitials(focusedTrip.driverName || 'Marcus Vance')}
                        </span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-cinzel text-base font-bold text-champagne-glow truncate">
                          {focusedTrip.driverName || 'Marcus Vance'}
                        </h2>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[11px] font-bold text-[#DFC07D]">
                          <span>4.98</span>
                          <Star className="w-3 h-3 fill-[#DFC07D] text-[#DFC07D]" />
                        </span>
                      </div>
                      <p className="text-xs text-[#B89650] truncate mt-0.5">
                        {focusedTrip.driverVehicle ||
                          '2024 Toyota Camry Hybrid XSE · OK · CVB-405'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Zero-Map Live Distance & ETA Readout */}
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/55 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#B89650]">
                    <span className="inline-flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-[#DFC07D] animate-pulse" />
                      <span>{gpsWatchStatus}</span>
                    </span>
                    <span className="uppercase tracking-wider text-[#DFC07D]">
                      {focusedTrip.tripStage === 'arrived_pickup'
                        ? 'Driver At Pickup'
                        : focusedTrip.tripStage === 'arrived_stop1'
                        ? 'At Stop 1'
                        : focusedTrip.tripStage === 'en_route_stop1'
                        ? 'En Route to Stop 1'
                        : focusedTrip.tripStage === 'in_progress'
                        ? 'Heading to Drop-off'
                        : 'En Route'}
                    </span>
                  </div>

                  <div className="font-mono tabular-nums text-base sm:text-lg font-bold text-champagne-glow">
                    {focusedTrip.tripStage === 'arrived_pickup'
                      ? 'Driver Arrived at Pickup • 0.0 mi away'
                      : focusedTrip.tripStage === 'arrived_stop1'
                      ? 'Arrived at Stop 1 • Waiting on Errand'
                      : focusedTrip.tripStage === 'en_route_stop1'
                      ? `Heading to Stop 1 · ${liveDriverTelemetry.distanceMiles.toFixed(1)} mi remaining`
                      : focusedTrip.tripStage === 'in_progress'
                      ? `Heading to Drop-off · ${liveDriverTelemetry.distanceMiles.toFixed(1)} mi remaining`
                      : `Driver Distance: ${liveDriverTelemetry.distanceMiles.toFixed(1)} mi • ${liveDriverTelemetry.etaMins} mins away`}
                  </div>

                  <div
                    className={`grid grid-cols-1 ${
                      focusedTrip.stop1Address ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                    } gap-2 pt-1 text-[11px]`}
                  >
                    <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-2.5">
                      <span className="uppercase tracking-wider text-[10px] text-[#B89650]">
                        Pickup
                      </span>
                      <div className="font-semibold text-[#DFC07D] mt-0.5 truncate">
                        {focusedTrip.pickupAddress}
                      </div>
                    </div>
                    {focusedTrip.stop1Address && (
                      <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/45 p-2.5">
                        <span className="uppercase tracking-wider text-[10px] text-[#D4AF37] font-bold">
                          Stop 1 (Errand)
                        </span>
                        <div className="font-semibold text-[#DFC07D] mt-0.5 truncate">
                          {focusedTrip.stop1Address}
                        </div>
                      </div>
                    )}
                    <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-2.5">
                      <span className="uppercase tracking-wider text-[10px] text-[#B89650]">
                        Final Drop-off
                      </span>
                      <div className="font-semibold text-[#DFC07D] mt-0.5 truncate">
                        {focusedTrip.dropoffAddress}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {focusedTrip.tripStage !== 'arrived_pickup' &&
                      focusedTrip.tripStage !== 'in_progress' && (
                        <button
                          type="button"
                          onClick={() => handleStepDriverCloserDemo(focusedTrip)}
                          className="h-8 px-3 rounded-lg border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[11px] font-semibold text-[#DFC07D] cursor-pointer"
                        >
                          Update GPS Approach (Demo)
                        </button>
                      )}
                    <button
                      type="button"
                      onClick={() => handleCompleteTripDemo(focusedTrip)}
                      className="h-8 px-3 rounded-lg border border-[#DFC07D]/60 bg-[#C5A059]/12 text-[11px] font-semibold text-[#DFC07D] cursor-pointer"
                    >
                      Complete Trip &amp; Rate (Demo)
                    </button>
                  </div>
                </div>

                {/* Unlocked Final Fare & Co-op Split */}
                {(() => {
                  const stage = focusedTrip.tripStage;
                  const activeExtraStart =
                    stage === 'arrived_pickup' && focusedTrip.pickupExtraWaitActive
                      ? focusedTrip.pickupExtraWaitStartedAt
                      : stage === 'arrived_stop1' && focusedTrip.stop1ExtraWaitActive
                      ? focusedTrip.stop1ExtraWaitStartedAt
                      : undefined;
                  const activeExtraSec = activeExtraStart
                    ? Math.max(0, Math.floor((waitTickMs - activeExtraStart) / 1000))
                    : 0;
                  const activeExtraFee = activeExtraStart
                    ? Number(
                        (
                          Math.max(1, Math.ceil(activeExtraSec / 60)) *
                          EXTRA_WAIT_RATE_PER_MIN
                        ).toFixed(2)
                      )
                    : 0;
                  const liveTotalFare = Number(
                    (focusedTrip.fare.totalFare + activeExtraFee).toFixed(2)
                  );
                  const liveDriver70 = Number(
                    (focusedTrip.fare.driverPayout70 + activeExtraFee * 0.7).toFixed(2)
                  );
                  const liveCharity5 = Number(
                    (focusedTrip.fare.charityShare5 + activeExtraFee * 0.05).toFixed(2)
                  );

                  return (
                    <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/65 py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#B89650]">
                          Locked Final Fare ({focusedTrip.fare.miles} total mi @ $1.50/mi
                          {focusedTrip.fare.holdFee > 0 ? ' + $6 hold' : ''}
                          {activeExtraFee > 0 ? ` + $${activeExtraFee.toFixed(2)} wait` : ''})
                        </div>
                        <div className="font-mono tabular-nums text-2xl font-bold text-champagne-glow mt-0.5">
                          Total Fare: ${liveTotalFare.toFixed(2)}
                        </div>
                        <div className="text-xs font-semibold text-[#D4AF37] mt-0.5">
                          70% Direct to Driver (${liveDriver70.toFixed(2)}) • 5% OKC Charity ($
                          {liveCharity5.toFixed(2)})
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Live Trip Progress Tracker + Wait Countdown / Extra Wait Pill (Above TEXT DRIVER / CALL DRIVER) */}
                {(() => {
                  const stage = focusedTrip.tripStage || 'en_route_pickup';
                  const hasStop1 = Boolean(focusedTrip.stop1Address);
                  const milestones = hasStop1
                    ? ['En Route', 'Arrived', 'Stop 1', 'Drop-off']
                    : ['En Route', 'Arrived', 'In Progress', 'Drop-off'];
                  const activeStepIdx = hasStop1
                    ? stage === 'in_progress'
                      ? 3
                      : stage === 'arrived_stop1' || stage === 'en_route_stop1'
                      ? 2
                      : stage === 'arrived_pickup'
                      ? 1
                      : 0
                    : stage === 'in_progress'
                    ? 2
                    : stage === 'arrived_pickup'
                    ? 1
                    : 0;
                  const progressPct = Math.round(
                    ((activeStepIdx + 0.5) / milestones.length) * 100
                  );

                  const isWaitingPickup = stage === 'arrived_pickup';
                  const isWaitingStop1 = stage === 'arrived_stop1';
                  const anchorTs = isWaitingPickup
                    ? focusedTrip.arrivedAtPickupTimestamp
                    : isWaitingStop1
                    ? focusedTrip.arrivedAtStop1Timestamp
                    : undefined;
                  const elapsedWaitSec = anchorTs
                    ? Math.max(0, Math.floor((waitTickMs - anchorTs) / 1000))
                    : 0;
                  const remainingWaitSec = Math.max(
                    0,
                    FREE_WAIT_LIMIT_SECONDS - elapsedWaitSec
                  );
                  const isExtraWaitActive = isWaitingPickup
                    ? Boolean(focusedTrip.pickupExtraWaitActive)
                    : isWaitingStop1
                    ? Boolean(focusedTrip.stop1ExtraWaitActive)
                    : false;

                  return (
                    <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.14em] text-[#B89650]">
                        <span>Live Trip Progress Tracker</span>
                        <span className="text-[#DFC07D]">
                          {milestones[activeStepIdx]}
                        </span>
                      </div>

                      {/* Gold Progress Milestone Bar */}
                      <div className="space-y-1.5">
                        <div className="h-2 rounded-full bg-[#181510] border border-[#C5A059]/30 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#8A6D3B] via-[#DFC07D] to-[#FFF2CC] transition-all duration-300"
                            style={{width: `${progressPct}%`}}
                          />
                        </div>
                        <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold">
                          {milestones.map((label, idx) => (
                            <div
                              key={label}
                              className={`text-center truncate ${
                                idx <= activeStepIdx
                                  ? 'text-[#DFC07D] font-bold'
                                  : 'text-[#B89650]/55'
                              }`}
                            >
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Live Gold Countdown Alert directly below Milestone Bar */}
                      {(isWaitingPickup || isWaitingStop1) && (
                        <div className="rounded-lg border border-[#DFC07D]/65 bg-[#C5A059]/12 px-3 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[#DFC07D]">
                          <span className="flex items-center gap-1.5">
                            <Timer className="w-4 h-4 text-[#D4AF37] shrink-0" />
                            <span>
                              {isWaitingStop1 ? 'At Stop 1' : 'Driver arrived'} •{' '}
                              <span className="font-mono">
                                {formatTimerMMSS(remainingWaitSec)}
                              </span>{' '}
                              {isWaitingStop1
                                ? 'limit remaining'
                                : 'free wait remaining'}
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Live Extra Wait Fee Pill right under Progress Bar when Driver keeps waiting */}
                      {isExtraWaitActive && (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#DFC07D] bg-[#C5A059]/20 text-[11px] font-bold text-[#FFF2CC] shadow-[0_0_12px_rgba(223,192,125,0.22)]">
                          <Clock className="w-3.5 h-3.5 text-[#DFC07D] animate-pulse" />
                          <span>Extra Wait Time: +$0.20/min added to fare</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {callBanner && (
                  <div className="rounded-lg border border-[#DFC07D]/55 bg-[#C5A059]/15 px-3 py-2 text-xs font-semibold text-[#DFC07D]">
                    {callBanner}
                  </div>
                )}

                {/* Side-by-Side Metallic Gold TEXT DRIVER & CALL DRIVER Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setShowChatDrawer(true)}
                    className="h-12 rounded-xl btn-gold-luxury text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>TEXT DRIVER</span>
                  </button>

                  <a
                    href={`tel:${(focusedTrip.driverPhone || '(405) 555-0198').replace(
                      /[^\d+]/g,
                      ''
                    )}`}
                    onClick={() =>
                      setCallBanner(
                        `Dialing ${focusedTrip.driverName || 'your driver'} at ${
                          focusedTrip.driverPhone || '(405) 555-0198'
                        }...`
                      )
                    }
                    className="h-12 rounded-xl btn-gold-luxury text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>CALL DRIVER</span>
                  </a>
                </div>

                {/* Rate / Report Safety Link */}
                <div className="pt-1 flex items-center justify-between gap-2 border-t border-[#C5A059]/25 text-xs">
                  <button
                    type="button"
                    onClick={() => handleOpenRateReport(focusedTrip, 'report')}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#DFC07D] hover:text-[#FFF2CC] cursor-pointer py-1"
                  >
                    <ShieldAlert className="w-4 h-4 text-[#D4AF37]" />
                    <span className="underline">Rate / Report</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCancelReservation(focusedTrip)}
                    className="text-[11px] font-semibold text-rose-300/90 hover:text-rose-200 underline cursor-pointer py-1"
                  >
                    Cancel Ride
                  </button>
                </div>
              </section>
            ) : focusedTrip && focusedTrip.status === RideStatus.Pending ? (
              /* CASE B: HIDDEN FARE & CLOSEST-DRIVER CASCADE SEARCHING SCREEN */
              <section className="relative obsidian-login-card rounded-xl p-5 sm:p-6 space-y-5">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#C5A059] rounded-tl-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#C5A059] rounded-tr-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#C5A059] rounded-bl-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#C5A059] rounded-br-xl"
                />

                <div className="flex flex-col items-center text-center space-y-3 py-2">
                  {/* Pulsing Gold Status Indicator */}
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full border-2 border-[#DFC07D]/45 animate-ping" />
                    <span className="w-12 h-12 rounded-full border-2 border-[#DFC07D] bg-[#C5A059]/15 flex items-center justify-center shadow-[0_0_24px_rgba(223,192,125,0.35)]">
                      <Radio className="w-5 h-5 text-[#DFC07D] animate-pulse" />
                    </span>
                  </div>

                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#C5A059]/50 bg-[#020612]/72 backdrop-blur-[10px] text-[10.5px] font-bold tracking-[0.14em] uppercase text-[#DFC07D]">
                    <span className="w-2 h-2 rounded-full bg-[#DFC07D] animate-pulse" />
                    <span>
                      {focusedTrip.bookingMode === 'reserve'
                        ? 'MATCHING SCHEDULED OKC DRIVER'
                        : 'DISPATCHING CLOSEST OKLAHOMA DRIVER'}
                    </span>
                  </div>

                  <h2 className="font-cinzel text-lg sm:text-xl font-bold text-champagne-glow">
                    Please wait while we look for a ride for you...
                  </h2>

                  <div className="inline-flex items-center gap-1.5 text-xs text-[#B89650]">
                    <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>
                      Final fare unlocks only after an Oklahoma driver accepts your request.
                    </span>
                  </div>
                </div>

                {/* Route Summary (NO price shown!) */}
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35 p-3.5 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[11px] text-[#B89650]">
                    <span>
                      {focusedTrip.bookingMode === 'reserve'
                        ? `Scheduled · ${focusedTrip.date} at ${focusedTrip.timeSlot}`
                        : 'Instant Ride Dispatch'}
                    </span>
                    <span className="font-mono text-[#DFC07D]">
                      Queue #{activeDriverIndex + 1} of {closestDriverQueue.length}
                    </span>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                    <span className="text-[#DFC07D]">{focusedTrip.pickupAddress}</span>
                  </div>
                  {focusedTrip.stop1Address && (
                    <div className="flex items-start gap-2">
                      <Plus className="w-3.5 h-3.5 text-[#D4AF37] shrink-0 mt-0.5" />
                      <span className="text-[#DFC07D]">
                        <strong className="text-[#D4AF37]">Stop 1:</strong>{' '}
                        {focusedTrip.stop1Address}
                      </span>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <Navigation className="w-3.5 h-3.5 text-[#DFC07D] shrink-0 mt-0.5" />
                    <span className="text-[#DFC07D]">{focusedTrip.dropoffAddress}</span>
                  </div>
                </div>

                {cascadeFeedbackNote && (
                  <div className="rounded-lg border border-[#C5A059]/45 bg-[#C5A059]/10 px-3 py-2 text-[11.5px] text-[#DFC07D]">
                    {cascadeFeedbackNote}
                  </div>
                )}

                {/* Subtle Demo Testing Buttons */}
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 p-3.5 space-y-2.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B89650] text-center">
                    Closest-Driver Cascade Demo Controls
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSimulateClosestDriverDeclines(focusedTrip)}
                      className="h-10 px-3 rounded-lg border border-[#C5A059]/55 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-xs font-semibold text-[#DFC07D] cursor-pointer"
                    >
                      Simulate Closest Driver Declines
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSimulateDriverAccepts(focusedTrip)}
                      className="h-10 px-3 rounded-lg btn-gold-luxury text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Simulate Driver Accepts
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 text-xs">
                  <button
                    type="button"
                    onClick={() => handleCancelReservation(focusedTrip)}
                    className="text-rose-300/90 hover:text-rose-200 underline cursor-pointer"
                  >
                    Cancel Ride Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBookingFormOverride(true)}
                    className="text-[#B89650] hover:text-[#DFC07D] underline cursor-pointer"
                  >
                    Edit Pickup / Drop-off
                  </button>
                </div>
              </section>
            ) : (
              /* CASE C: MAIN BOOKING CARD (INSTANT VS. RESERVE) */
              <section className="relative obsidian-login-card rounded-xl p-4 sm:p-5 space-y-4">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#C5A059] rounded-tl-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#C5A059] rounded-tr-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#C5A059] rounded-bl-xl"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#C5A059] rounded-br-xl"
                />

                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h1 className="font-cinzel text-lg sm:text-xl font-bold text-champagne-glow">
                      Book Oklahoma Co-op Ride
                    </h1>
                    <p className="text-[11px] text-[#B89650]">
                      Oklahoma-only geofence · Zero surge pricing · 5% feeds OK families
                    </p>
                  </div>
                  {showBookingFormOverride && (
                    <button
                      type="button"
                      onClick={() => setShowBookingFormOverride(false)}
                      className="text-xs font-semibold text-[#DFC07D] underline cursor-pointer shrink-0"
                    >
                      Back to Active Ride
                    </button>
                  )}
                </div>

                {/* Two-Pill Mode Switch: [Instant Ride] and [Reserve Ride] */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35">
                  <button
                    type="button"
                    onClick={() => {
                      setBookingMode('instant');
                      setGeofenceError(null);
                    }}
                    className={`rounded-lg text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer ${
                      bookingMode === 'instant'
                        ? 'btn-gold-luxury'
                        : 'py-3 px-4 text-[#B89650] hover:text-[#DFC07D]'
                    }`}
                  >
                    Instant Ride
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBookingMode('reserve');
                      setGeofenceError(null);
                      setGpsStatusNotice(null);
                    }}
                    className={`rounded-lg text-xs sm:text-sm font-bold tracking-wide transition-all cursor-pointer ${
                      bookingMode === 'reserve'
                        ? 'btn-gold-luxury'
                        : onlineDriversCount === 0
                        ? 'py-3 px-4 border-2 border-[#DFC07D] bg-[#C5A059]/20 text-[#DFC07D] shadow-[0_0_16px_rgba(223,192,125,0.45)] animate-pulse'
                        : 'py-3 px-4 text-[#B89650] hover:text-[#DFC07D]'
                    }`}
                  >
                    Reserve Ride
                  </button>
                </div>

                {geofenceError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-400/50 bg-rose-950/35 p-3 text-xs text-rose-200 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-300 shrink-0 mt-0.5" />
                    <span>{geofenceError}</span>
                  </div>
                )}

                {bookingMode === 'instant' ? (
                  /* ======================================================== */
                  /* INSTANT RIDE FORM (Pickup + Add Stop + Drop-off)         */
                  /* ======================================================== */
                  <form onSubmit={handleSubmitRideRequest} className="flex flex-col gap-3">
                    {/* Live Online Driver Counter + Demo Driver Availability Toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 px-3.5 py-2.5">
                      <div className="inline-flex items-center gap-2 text-xs font-bold tracking-wider uppercase text-[#DFC07D]">
                        <span
                          className={`w-2.5 h-2.5 rounded-full ${
                            onlineDriversCount > 0
                              ? 'bg-[#DFC07D] animate-pulse shadow-[0_0_8px_#DFC07D]'
                              : 'bg-amber-500/80'
                          }`}
                        />
                        <span>● {onlineDriversCount} DRIVERS ONLINE NEARBY</span>
                      </div>

                      {/* Subtle Demo Toggle */}
                      <div className="flex items-center gap-1 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35 p-0.5 text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setTestDriverPoolMode('online')}
                          className={`px-2 py-1 rounded font-semibold cursor-pointer transition-colors ${
                            testDriverPoolMode === 'online'
                              ? 'bg-[#C5A059]/25 text-[#DFC07D] border border-[#DFC07D]/50'
                              : 'text-[#B89650]/80 hover:text-[#DFC07D]'
                          }`}
                        >
                          Test: 4 Drivers Online
                        </button>
                        <button
                          type="button"
                          onClick={() => setTestDriverPoolMode('zero')}
                          className={`px-2 py-1 rounded font-semibold cursor-pointer transition-colors ${
                            testDriverPoolMode === 'zero'
                              ? 'bg-[#C5A059]/25 text-[#DFC07D] border border-[#DFC07D]/50'
                              : 'text-[#B89650]/80 hover:text-[#DFC07D]'
                          }`}
                        >
                          Test: 0 Drivers Online
                        </button>
                      </div>
                    </div>

                    {/* Zero Drivers Online Fallback Gold Notice */}
                    {onlineDriversCount === 0 && (
                      <div className="rounded-xl border border-[#DFC07D]/70 bg-[#C5A059]/12 py-3 px-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-start gap-2.5 text-xs text-[#DFC07D]">
                          <AlertTriangle className="w-4 h-4 text-[#DFC07D] shrink-0 mt-0.5" />
                          <span className="font-semibold leading-relaxed">
                            No instant drivers online right now — switch to Reserve Ride to
                            guarantee your pickup
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBookingMode('reserve')}
                          className="rounded-lg btn-gold-luxury text-[11px] uppercase tracking-wider shrink-0 cursor-pointer"
                        >
                          Switch to Reserve Ride
                        </button>
                      </div>
                    )}

                    {gpsStatusNotice && (
                      <div className="rounded-xl border border-[#C5A059]/45 bg-[#C5A059]/10 px-3 py-2 text-xs text-[#DFC07D]">
                        {gpsStatusNotice}
                      </div>
                    )}

                    {/* 1. Pickup Location (Oklahoma Only) + One-Tap Current Location Autofill */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <label
                          htmlFor="rider-pickup-instant"
                          className="text-xs font-semibold text-[#DFC07D]"
                        >
                          Pickup Location (Oklahoma Only)
                        </label>
                        <button
                          type="button"
                          onClick={handleUseCurrentPhoneGps}
                          className="h-8 px-2.5 rounded-lg border border-[#C5A059]/55 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-[11px] font-semibold text-[#DFC07D] inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <LocateFixed className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Use Current Location</span>
                        </button>
                      </div>

                      <div className="relative">
                        <MapPin className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="rider-pickup-instant"
                          type="text"
                          value={pickupInput}
                          onChange={(e) => {
                            setPickupInput(e.target.value);
                            setPickupCoords(undefined);
                            setGeofenceError(null);
                          }}
                          placeholder="OKC, Edmond, Norman, Moore, Yukon, or Tulsa pickup"
                          className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] placeholder:text-[#B89650]/60 focus:outline-none focus:border-[#DFC07D]"
                          required
                        />
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {OKLAHOMA_LANDMARKS.slice(0, 3).map((lm) => (
                          <button
                            key={lm.id}
                            type="button"
                            onClick={() => {
                              setPickupInput(lm.address);
                              setPickupCoords({lat: lm.lat, lng: lm.lng});
                              setGeofenceError(null);
                            }}
                            className="h-7 px-2.5 rounded-lg border border-[#C5A059]/30 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-[10.5px] text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                          >
                            {lm.label.split(' (')[0]}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* 2. "+ Add a Stop" Button OR Stop 1 Location Input */}
                    {!hasStop1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setHasStop1(true);
                          if (!stop1Input) {
                            setStop1Input(OKLAHOMA_LANDMARKS[3].address);
                            setStop1Coords({
                              lat: OKLAHOMA_LANDMARKS[3].lat,
                              lng: OKLAHOMA_LANDMARKS[3].lng,
                            });
                          }
                        }}
                        className="w-full py-3 px-4 rounded-xl border border-[#C5A059]/65 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] hover:bg-[#C5A059]/10 text-xs font-bold tracking-wide text-[#DFC07D] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-4 h-4 text-[#D4AF37]" />
                        <span>+ Add a Stop (Round Trip / Errand)</span>
                      </button>
                    ) : (
                      <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/50 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="rider-stop1"
                            className="text-xs font-semibold text-[#DFC07D]"
                          >
                            Stop 1 Location (Oklahoma Only)
                          </label>
                          <button
                            type="button"
                            aria-label="Remove Stop 1"
                            onClick={() => {
                              setHasStop1(false);
                              setStop1Input('');
                              setStop1Coords(undefined);
                              setGeofenceError(null);
                            }}
                            className="h-7 w-7 rounded-lg border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D] flex items-center justify-center cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="relative">
                          <Plus className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="rider-stop1"
                            type="text"
                            value={stop1Input}
                            onChange={(e) => {
                              setStop1Input(e.target.value);
                              setStop1Coords(undefined);
                              setGeofenceError(null);
                            }}
                            placeholder="Store, pharmacy, or errand stop in Oklahoma..."
                            className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] placeholder:text-[#B89650]/60 focus:outline-none focus:border-[#DFC07D]"
                            required
                          />
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {[
                            {
                              label: 'Penn Square Store',
                              address: '1901 NW Expressway, Penn Square, OKC, OK 73118',
                              coords: {lat: 35.5256, lng: -97.5512},
                            },
                            {
                              label: 'Midtown Market',
                              address: '815 N Hudson Ave, Midtown OKC, OK 73102',
                              coords: {lat: 35.4765, lng: -97.5198},
                            },
                            {
                              label: 'Bricktown Stop',
                              address: OKLAHOMA_LANDMARKS[3].address,
                              coords: {
                                lat: OKLAHOMA_LANDMARKS[3].lat,
                                lng: OKLAHOMA_LANDMARKS[3].lng,
                              },
                            },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => {
                                setStop1Input(preset.address);
                                setStop1Coords(preset.coords);
                                setGeofenceError(null);
                              }}
                              className="h-7 px-2.5 rounded-lg border border-[#C5A059]/30 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-[10.5px] text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 3. Drop-off Location */}
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <label
                          htmlFor="rider-dropoff-instant"
                          className="text-xs font-semibold text-[#DFC07D]"
                        >
                          Drop-off Location
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDropoffInput(pickupInput);
                              setDropoffCoords(pickupCoords);
                              setGeofenceError(null);
                            }}
                            className="h-7 px-2.5 rounded-lg border border-[#DFC07D]/55 bg-[#C5A059]/12 hover:bg-[#C5A059]/22 text-[10.5px] font-semibold text-[#DFC07D] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3 text-[#D4AF37]" />
                            <span>Use Pickup Address (Round Trip Home)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDropoffInput('1200 Main St, Dallas, TX 75202');
                              setDropoffCoords(undefined);
                            }}
                            className="text-[10.5px] text-[#B89650] hover:text-[#DFC07D] underline cursor-pointer"
                          >
                            Test Out-of-State Block
                          </button>
                        </div>
                      </div>

                      <div className="relative">
                        <Navigation className="w-4 h-4 text-[#DFC07D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="rider-dropoff-instant"
                          type="text"
                          value={dropoffInput}
                          onChange={(e) => {
                            setDropoffInput(e.target.value);
                            setDropoffCoords(undefined);
                            setGeofenceError(null);
                          }}
                          placeholder="Will Rogers Airport, Downtown OKC, Norman, Edmond..."
                          className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] placeholder:text-[#B89650]/60 focus:outline-none focus:border-[#DFC07D]"
                          required
                        />
                      </div>

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {[
                          OKLAHOMA_LANDMARKS[2],
                          OKLAHOMA_LANDMARKS[6],
                          OKLAHOMA_LANDMARKS[5],
                        ].map((lm) => (
                          <button
                            key={lm.id}
                            type="button"
                            onClick={() => {
                              setDropoffInput(lm.address);
                              setDropoffCoords({lat: lm.lat, lng: lm.lng});
                              setGeofenceError(null);
                            }}
                            className="h-7 px-2.5 rounded-lg border border-[#C5A059]/30 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-[10.5px] text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                          >
                            {lm.city === 'Will Rogers World Airport'
                              ? 'Will Rogers Airport'
                              : lm.city}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Hidden Fare Notice (No price shown prior to driver acceptance!) */}
                    <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 px-3 py-2 flex items-center gap-2 text-[11px] text-[#B89650]">
                      <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>
                        Co-op $1.50/mile dispatch fare locks silently once your closest Oklahoma
                        driver accepts.
                      </span>
                    </div>

                    {/* Instant Ride Submit CTA */}
                    <button
                      type="submit"
                      disabled={onlineDriversCount === 0}
                      className={`w-full rounded-xl text-xs sm:text-sm tracking-[0.14em] uppercase transition-all ${
                        onlineDriversCount === 0
                          ? 'py-3 px-4 bg-[#1a1814] border border-[#C5A059]/30 text-[#B89650]/50 cursor-not-allowed'
                          : 'btn-gold-luxury cursor-pointer'
                      }`}
                    >
                      REQUEST INSTANT RIDE
                    </button>
                  </form>
                ) : (
                  /* ======================================================== */
                  /* RESERVE RIDE FORM (ONLY 4 INPUTS + SAVED PAYMENT $6 HOLD)*/
                  /* ======================================================== */
                  <form onSubmit={handleSubmitRideRequest} className="flex flex-col gap-3">
                    {/* 1. Pickup Location (Oklahoma Only) */}
                    <div>
                      <label
                        htmlFor="rider-pickup-reserve"
                        className="block text-xs font-semibold text-[#DFC07D] mb-1.5"
                      >
                        Pickup Location (Oklahoma Only)
                      </label>
                      <div className="relative">
                        <MapPin className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="rider-pickup-reserve"
                          type="text"
                          value={pickupInput}
                          onChange={(e) => {
                            setPickupInput(e.target.value);
                            setPickupCoords(undefined);
                            setGeofenceError(null);
                          }}
                          placeholder="OKC, Edmond, Norman, Moore, Yukon, or Tulsa pickup"
                          className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] placeholder:text-[#B89650]/60 focus:outline-none focus:border-[#DFC07D]"
                          required
                        />
                      </div>
                    </div>

                    {/* 2. Drop-off Location */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <label
                          htmlFor="rider-dropoff-reserve"
                          className="text-xs font-semibold text-[#DFC07D]"
                        >
                          Drop-off Location
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setDropoffInput('1200 Main St, Dallas, TX 75202');
                            setDropoffCoords(undefined);
                          }}
                          className="text-[10.5px] text-[#B89650] hover:text-[#DFC07D] underline cursor-pointer"
                        >
                          Test Out-of-State Block
                        </button>
                      </div>
                      <div className="relative">
                        <Navigation className="w-4 h-4 text-[#DFC07D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          id="rider-dropoff-reserve"
                          type="text"
                          value={dropoffInput}
                          onChange={(e) => {
                            setDropoffInput(e.target.value);
                            setDropoffCoords(undefined);
                            setGeofenceError(null);
                          }}
                          placeholder="Will Rogers Airport, Downtown OKC, Norman, Edmond..."
                          className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] placeholder:text-[#B89650]/60 focus:outline-none focus:border-[#DFC07D]"
                          required
                        />
                      </div>
                    </div>

                    {/* 3. Date & 4. Time (30-minute reservation window) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="rider-date"
                          className="block text-xs font-semibold text-[#DFC07D] mb-1.5"
                        >
                          Date
                        </label>
                        <div className="relative">
                          <Calendar className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            id="rider-date"
                            type="date"
                            value={rideDate}
                            onChange={(e) => {
                              setRideDate(e.target.value);
                              setScheduleQuickMode('standard');
                            }}
                            className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] focus:outline-none focus:border-[#DFC07D]"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="rider-slot"
                          className="block text-xs font-semibold text-[#DFC07D] mb-1.5"
                        >
                          Time (30-Minute Window)
                        </label>
                        <div className="relative">
                          <Clock className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <select
                            id="rider-slot"
                            value={rideSlot}
                            onChange={(e) => {
                              setRideSlot(e.target.value);
                              setScheduleQuickMode('standard');
                            }}
                            className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs sm:text-sm text-[#DFC07D] focus:outline-none focus:border-[#DFC07D]"
                          >
                            {timeSlots.map((slot) => (
                              <option key={slot} value={slot} className="bg-[#020612]">
                                {slot}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Saved Payment Method Row for $6.00 Reservation Hold */}
                    <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 p-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#C5A059]/25">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-[#C5A059]/15 border border-[#DFC07D]/45 flex items-center justify-center shrink-0">
                            <CreditCard className="w-4 h-4 text-[#DFC07D]" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-[#B89650]">
                              Saved Payment Method
                            </div>
                            <div className="text-xs font-semibold text-[#DFC07D] truncate">
                              {user.paymentMethod || PaymentMethodType.Card} ·{' '}
                              {user.paymentHandle || 'Visa •••• 4242'}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-[#DFC07D] shrink-0">
                          $6.00 Hold
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#B89650]">
                          Refundable in full if canceled 30+ mins before pickup.
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setScheduleQuickMode((m) =>
                              m === 'standard' ? 'late-test' : 'standard'
                            )
                          }
                          className="text-[10.5px] font-semibold text-[#C5A059] hover:text-[#DFC07D] underline shrink-0 cursor-pointer"
                        >
                          {scheduleQuickMode === 'late-test'
                            ? 'Reset <30m Test'
                            : 'Test <30m Rule'}
                        </button>
                      </div>
                    </div>

                    {/* Hidden Fare Notice (No price shown prior to driver acceptance!) */}
                    <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 px-3 py-2 flex items-center gap-2 text-[11px] text-[#B89650]">
                      <Lock className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                      <span>
                        Co-op $1.50/mile dispatch fare locks silently once your closest Oklahoma
                        driver accepts.
                      </span>
                    </div>

                    {/* Reserve Ride Submit CTA */}
                    <button
                      type="submit"
                      className="w-full rounded-xl text-xs sm:text-sm tracking-[0.14em] uppercase btn-gold-luxury cursor-pointer"
                    >
                      RESERVE RIDE ($6 HOLD)
                    </button>
                  </form>
                )}
              </section>
            )}

            {/* ============================================================== */}
            {/* 4. ROTATING LOCAL OKC BUSINESS PERKS BANNER (EVERY 3 SECONDS)  */}
            {/* ============================================================== */}
            {currentPerk && (
              <section
                aria-label="Local OKC Business Perks"
                className="obsidian-login-card rounded-xl p-4 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#D4AF37]">
                    <TicketPercent className="w-4 h-4" />
                    <span>LOCAL OKC BUSINESS PERKS · {currentPerk.district}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Previous local business perk"
                      onClick={() =>
                        setPerkIndex(
                          (prev) => (prev - 1 + activePerks.length) % activePerks.length
                        )
                      }
                      className="h-7 w-7 rounded-lg border border-[#C5A059]/35 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D] flex items-center justify-center cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next local business perk"
                      onClick={() => setPerkIndex((prev) => (prev + 1) % activePerks.length)}
                      className="h-7 w-7 rounded-lg border border-[#C5A059]/35 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D] flex items-center justify-center cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-champagne-glow">
                      {currentPerk.businessName} • {currentPerk.headline}
                    </p>
                    <p className="text-xs text-[#B89650] mt-0.5">{currentPerk.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setClaimedPerkIds((prev) => ({...prev, [currentPerk.id]: true}));
                      onClaimPerk(currentPerk.id);
                      showTemporaryToast(
                        `Perk unlocked at ${currentPerk.businessName}: Code ${currentPerk.promoCode}`
                      );
                    }}
                    className="h-10 px-4 rounded-lg btn-gold-luxury text-xs whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {claimedPerkIds[currentPerk.id]
                      ? `Code: ${currentPerk.promoCode}`
                      : 'Claim OKC Perk'}
                  </button>
                </div>

                {activePerks.length > 1 && (
                  <div className="flex items-center justify-center gap-1.5 pt-1">
                    {activePerks.map((p, idx) => (
                      <button
                        key={p.id}
                        type="button"
                        aria-label={`View perk ${idx + 1}`}
                        onClick={() => setPerkIndex(idx)}
                        className={`h-1.5 rounded-full transition-all cursor-pointer ${
                          idx === perkIndex % activePerks.length
                            ? 'w-5 bg-[#DFC07D]'
                            : 'w-1.5 bg-[#C5A059]/35'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: MY RIDES (UPCOMING 30-MIN COUNTDOWN + PAST RECEIPTS)      */}
        {/* ================================================================ */}
        {activeTab === 'rides' && (
          <div className="flex flex-col gap-3">
            {/* Upcoming Scheduled Reservations */}
            <section className="obsidian-login-card rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-cinzel text-lg font-bold text-champagne-glow">
                    Upcoming Reservations
                  </h2>
                  <p className="text-[11px] text-[#B89650]">
                    Free $6.00 hold refund when canceled 30+ minutes before pickup
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-[#DFC07D]">
                  {upcomingScheduledRides.length} Active
                </span>
              </div>

              {upcomingScheduledRides.length === 0 ? (
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 p-5 text-center space-y-2.5">
                  <p className="text-xs text-[#B89650]">
                    No upcoming scheduled or active rides right now.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab('reserve')}
                    className="h-9 px-4 rounded-lg btn-gold-luxury text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Book Oklahoma Ride
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingScheduledRides.map((ride) => {
                    const countdown = formatCountdown(ride.scheduledTimestamp, nowMs);
                    const isAccepted = ride.status === RideStatus.Accepted;
                    return (
                      <div
                        key={ride.id}
                        className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-4 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#D4AF37]">
                              {ride.date} · {ride.timeSlot} ·{' '}
                              {isAccepted ? 'Driver Confirmed' : 'Matching Co-op Driver'}
                            </div>
                            <div className="text-xs font-semibold text-[#DFC07D] mt-1">
                              {ride.pickupAddress}
                              {ride.stop1Address ? ` → Stop 1: ${ride.stop1Address}` : ''} →{' '}
                              {ride.dropoffAddress}
                            </div>
                          </div>

                          {/* Strict Hidden Fare Rule: Only show fare once Accepted */}
                          {isAccepted ? (
                            <div className="text-right shrink-0">
                              <div className="font-mono tabular-nums text-sm font-bold text-champagne-glow">
                                ${ride.fare.totalFare.toFixed(2)}
                              </div>
                              <div className="text-[10px] text-[#B89650]">Locked Fare</div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#B89650] shrink-0">
                              <Lock className="w-3 h-3 text-[#D4AF37]" />
                              <span>Fare Masked</span>
                            </span>
                          )}
                        </div>

                        {/* Live 30-Minute Free Cancellation Countdown */}
                        <div
                          className={`rounded-lg px-3 py-2 text-[11px] font-semibold flex items-center gap-2 border ${
                            countdown.isFreeRefund
                              ? 'border-[#C5A059]/45 bg-[#C5A059]/10 text-[#DFC07D]'
                              : 'border-amber-500/55 bg-amber-950/30 text-amber-200'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>{countdown.label}</span>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveRequestId(ride.id);
                              setShowBookingFormOverride(false);
                              setActiveTab('reserve');
                            }}
                            className="h-9 px-3.5 rounded-lg btn-gold-luxury text-xs cursor-pointer"
                          >
                            {isAccepted ? 'Open Live GPS Tracker' : 'View Dispatch Status'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCancelReservation(ride)}
                            className="h-9 px-3 rounded-lg border border-rose-400/45 bg-rose-950/25 text-xs font-semibold text-rose-200 cursor-pointer"
                          >
                            Cancel Reservation
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Past Trip Receipts */}
            <section className="obsidian-login-card rounded-xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-cinzel text-lg font-bold text-champagne-glow">
                  Past Trip Receipts
                </h2>
                <span className="font-mono text-xs text-[#B89650]">
                  {pastTripReceipts.length} Trips
                </span>
              </div>

              {pastTripReceipts.length === 0 ? (
                <p className="text-xs text-[#B89650] py-4 text-center">
                  No completed or canceled trips recorded yet.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {pastTripReceipts.map((trip) => {
                    const isCancelled = trip.status === RideStatus.Cancelled;
                    const lostFoundFee = trip.lostFoundFeeClaimed || 0;
                    const totalCharged = Number((trip.fare.totalFare + lostFoundFee).toFixed(2));

                    return (
                      <div
                        key={trip.id}
                        className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35 p-3.5 space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#B89650]">
                              {trip.date} · {trip.timeSlot} ·{' '}
                              {isCancelled ? 'CANCELED' : 'COMPLETED'}
                            </div>
                            <div className="text-xs font-semibold text-[#DFC07D] mt-0.5 truncate">
                              {trip.pickupAddress}
                              {trip.stop1Address ? ` → Stop 1: ${trip.stop1Address}` : ''} →{' '}
                              {trip.dropoffAddress}
                            </div>
                            {trip.driverName && (
                              <div className="text-[11px] text-[#B89650] mt-0.5">
                                Driver: {trip.driverName} · {trip.driverVehicle}
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            {isCancelled ? (
                              <span className="font-mono text-xs font-bold text-[#B89650]">
                                {trip.refundedHoldFee ? '$0.00 (Refunded)' : '$6.00 Hold'}
                              </span>
                            ) : (
                              <>
                                <div className="font-mono tabular-nums text-sm font-bold text-champagne-glow">
                                  ${totalCharged.toFixed(2)}
                                </div>
                                <div className="text-[10px] text-[#D4AF37]">
                                  5% OKC Charity: ${trip.fare.charityShare5.toFixed(2)}
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {trip.cancellationNote && (
                          <p className="text-[11px] text-[#B89650] rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/20 p-2">
                            {trip.cancellationNote}
                          </p>
                        )}

                        {(lostFoundFee > 0 || trip.lostFoundRiderRequested) && (
                          <div className="text-[11px] text-[#DFC07D] rounded-lg bg-[#C5A059]/10 border border-[#C5A059]/35 px-2.5 py-1.5">
                            Lost &amp; Found:{' '}
                            {lostFoundFee > 0
                              ? `Returned "${trip.lostFoundItemDescription}" · $20.00 return fee paid to driver`
                              : `Claim pending for "${trip.lostFoundRiderItemDescription}" ($20.00 return fee agreed)`}
                          </div>
                        )}

                        {!isCancelled && (
                          <div className="flex items-center justify-between pt-1 border-t border-[#C5A059]/20 text-[11px]">
                            <span className="text-[#B89650]">
                              {trip.riderRating
                                ? `Rated ${trip.riderRating} ★`
                                : 'Not yet rated'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenRateReport(trip, 'rate')}
                              className="font-semibold text-[#DFC07D] hover:text-[#FFF2CC] underline cursor-pointer"
                            >
                              Rate / Report
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: OKC IMPACT (5% FARE CONTRIBUTIONS TRACKER)                */}
        {/* ================================================================ */}
        {activeTab === 'impact' && (
          <div className="flex flex-col gap-3">
            <section className="relative obsidian-login-card rounded-xl p-5 space-y-4">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-[#C5A059] rounded-tl-xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-[#C5A059] rounded-tr-xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-[#C5A059] rounded-bl-xl"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-[#C5A059] rounded-br-xl"
              />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#D4AF37]">
                    <Heart className="w-3.5 h-3.5" />
                    <span>5% OKLAHOMA COMMUNITY IMPACT</span>
                  </div>
                  <h2 className="font-cinzel text-xl font-bold text-champagne-glow mt-1">
                    Your OKC Giving Footprint
                  </h2>
                  <p className="text-xs text-[#B89650] mt-0.5">
                    5% of every RideApp fare you take feeds struggling Oklahoma families, funds
                    homeless outreach kits, and outfits OKC kids for school.
                  </p>
                </div>

                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/55 px-3.5 py-2 text-right shrink-0">
                  <div className="text-[9.5px] font-bold uppercase tracking-wider text-[#B89650]">
                    5% Contributed
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-champagne-glow">
                    ${okcImpactMetrics.totalCharityDollars.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Three Impact Pillars */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-4 space-y-1.5">
                  <Utensils className="w-5 h-5 text-[#D4AF37]" />
                  <div className="font-mono tabular-nums text-2xl font-bold text-champagne-glow">
                    {okcImpactMetrics.mealsFunded}
                  </div>
                  <div className="text-xs font-bold text-[#DFC07D]">
                    Meals for Oklahoma Families
                  </div>
                  <p className="text-[11px] text-[#B89650]">
                    Hot meals &amp; pantry groceries across OKC Metro
                  </p>
                </div>

                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-4 space-y-1.5">
                  <Sparkles className="w-5 h-5 text-[#D4AF37]" />
                  <div className="font-mono tabular-nums text-2xl font-bold text-champagne-glow">
                    {okcImpactMetrics.outreachKitsFunded}
                  </div>
                  <div className="text-xs font-bold text-[#DFC07D]">
                    Homeless Outreach Kits
                  </div>
                  <p className="text-[11px] text-[#B89650]">
                    Hygiene, blankets &amp; weather protection packs
                  </p>
                </div>

                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-4 space-y-1.5">
                  <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
                  <div className="font-mono tabular-nums text-2xl font-bold text-champagne-glow">
                    {okcImpactMetrics.schoolClothesFunded}
                  </div>
                  <div className="text-xs font-bold text-[#DFC07D]">
                    School Clothes for OKC Kids
                  </div>
                  <p className="text-[11px] text-[#B89650]">
                    Winter coats, uniforms &amp; backpacks for students
                  </p>
                </div>
              </div>

              {/* Per-Trip 5% Contribution Ledger */}
              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-[#B89650]">
                  5% Fare Contributions by Trip ({okcImpactMetrics.qualifyingTrips.length})
                </h3>
                {okcImpactMetrics.qualifyingTrips.length === 0 ? (
                  <p className="text-xs text-[#B89650] py-3">
                    Complete your first Oklahoma Co-op trip to start funding local meals and
                    outreach kits.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {okcImpactMetrics.qualifyingTrips.map((trip) => (
                      <div
                        key={trip.id}
                        className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[#DFC07D] truncate">
                            {trip.date} · {trip.dropoffAddress}
                          </div>
                          <div className="text-[11px] text-[#B89650]">
                            Total Fare: ${trip.fare.totalFare.toFixed(2)}
                          </div>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-[#D4AF37] shrink-0">
                          +${trip.fare.charityShare5.toFixed(2)} (5%)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* IN-APP RIDER-TO-DRIVER TEXT CHAT DRAWER                            */}
      {/* ================================================================== */}
      {showChatDrawer && focusedTrip && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat with Driver"
          className="fixed inset-0 z-50 bg-[#02050E]/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="w-full max-w-lg obsidian-login-card rounded-t-2xl sm:rounded-2xl border-2 border-[#DFC07D] p-4 sm:p-5 space-y-3.5 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="font-cinzel text-base sm:text-lg font-bold text-champagne-glow">
                  Message {focusedTrip.driverName || 'Driver'}
                </h2>
                <p className="text-[11px] text-[#B89650]">
                  {focusedTrip.driverVehicle} · Direct Oklahoma Co-op Thread
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowChatDrawer(false)}
                className="h-8 w-8 rounded-lg border border-[#C5A059]/40 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 p-3 min-h-[200px] max-h-[340px]">
              {focusedTrip.chatMessages.length === 0 ? (
                <p className="text-xs text-[#B89650] text-center py-8">
                  Send pickup notes, gate codes, or curb landmarks directly to your driver.
                </p>
              ) : (
                focusedTrip.chatMessages.map((msg) => {
                  const isRider = msg.senderRole === UserRole.Rider;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isRider ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                          isRider
                            ? 'bg-[#C5A059]/22 border border-[#DFC07D]/55 text-[#DFC07D]'
                            : 'bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 text-[#B89650]'
                        }`}
                      >
                        <div className="text-[10px] font-bold text-[#D4AF37] mb-0.5">
                          {msg.senderName} · {msg.timestamp}
                        </div>
                        <div>{msg.text}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <form onSubmit={handleSendRiderChat} className="flex items-center gap-2">
              <input
                type="text"
                value={chatDraft}
                onChange={(e) => setChatDraft(e.target.value)}
                placeholder="Type pickup message for your driver..."
                className="flex-1 h-11 px-3.5 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs sm:text-sm text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
              />
              <button
                type="submit"
                className="h-11 px-4 rounded-xl btn-gold-luxury text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* RATE / REPORT SAFETY MODAL (SENDS TO BOTH DRIVER & COMPANY)        */}
      {/* ================================================================== */}
      {rateReportTargetRide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rate Driver or Submit Safety Report"
          className="fixed inset-0 z-50 bg-[#02050E]/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md obsidian-login-card rounded-2xl border-2 border-[#DFC07D] p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-cinzel text-lg font-bold text-champagne-glow">
                  Rate or Report Trip
                </h2>
                <p className="text-[11px] text-[#B89650]">
                  Driver: {rateReportTargetRide.driverName || 'Oklahoma Co-op Driver'} ·{' '}
                  {rateReportTargetRide.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRateReportTargetRide(null)}
                className="h-8 w-8 rounded-lg border border-[#C5A059]/40 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35">
              <button
                type="button"
                onClick={() => setRateReportTab('rate')}
                className={`h-9 rounded-lg text-xs font-bold cursor-pointer ${
                  rateReportTab === 'rate' ? 'btn-gold-luxury' : 'text-[#B89650]'
                }`}
              >
                Rate Driver (1–5 ★)
              </button>
              <button
                type="button"
                onClick={() => setRateReportTab('report')}
                className={`h-9 rounded-lg text-xs font-bold cursor-pointer ${
                  rateReportTab === 'report' ? 'btn-gold-luxury' : 'text-[#B89650]'
                }`}
              >
                Safety / Service Report
              </button>
            </div>

            {rateReportTab === 'rate' ? (
              <form onSubmit={handleSaveDriverRating} className="space-y-3.5">
                <div className="flex items-center justify-center gap-2 py-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setSelectedStars(star)}
                      aria-label={`Rate ${star} stars`}
                      className="h-11 w-11 rounded-xl border border-[#C5A059]/40 bg-[#020612]/72 backdrop-blur-[10px] flex items-center justify-center cursor-pointer"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          star <= selectedStars
                            ? 'fill-[#DFC07D] text-[#DFC07D]'
                            : 'text-[#B89650]/40'
                        }`}
                      />
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Optional compliment or ride feedback..."
                  className="w-full p-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                />

                <button
                  type="submit"
                  className="w-full h-11 rounded-xl btn-gold-luxury text-xs uppercase tracking-[0.14em] cursor-pointer"
                >
                  Save Driver Rating
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmitSafetyReport} className="space-y-3">
                <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-2.5 text-[11px] text-[#DFC07D] flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                  <span>
                    Reports are delivered simultaneously to both your{' '}
                    <strong>Driver&apos;s Support Inbox</strong> (for contractor response) and{' '}
                    <strong>RideApp Co-op Safety Desk</strong>.
                  </span>
                </div>

                {safetySubmittedMsg && (
                  <div className="rounded-lg border border-[#DFC07D]/60 bg-[#C5A059]/15 p-3 text-xs font-semibold text-[#DFC07D]">
                    {safetySubmittedMsg}
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-[#B89650] mb-1">
                    Issue Category
                  </label>
                  <select
                    value={safetyCategory}
                    onChange={(e) => setSafetyCategory(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] focus:outline-none"
                  >
                    <option value="Route or Driving Safety Concern">
                      Route or Driving Safety Concern
                    </option>
                    <option value="Pickup Curb or Wait Timing Issue">
                      Pickup Curb or Wait Timing Issue
                    </option>
                    <option value="Driver Conduct or Communication">
                      Driver Conduct or Communication
                    </option>
                    <option value="Vehicle Cleanliness or Mechanical Issue">
                      Vehicle Cleanliness or Mechanical Issue
                    </option>
                    <option value="Fare or Billing Question">Fare or Billing Question</option>
                  </select>
                </div>

                <textarea
                  rows={4}
                  value={safetyDetails}
                  onChange={(e) => setSafetyDetails(e.target.value)}
                  placeholder="Describe what happened so both your driver and the Co-op team can review and resolve it..."
                  className="w-full p-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                  required
                />

                <button
                  type="submit"
                  className="w-full h-11 rounded-xl btn-gold-luxury text-xs uppercase tracking-[0.14em] cursor-pointer"
                >
                  Submit Safety / Service Report
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 5. RIDER SUPPORT POP-UP (OPENED FROM 4TH BOTTOM TAB "SUPPORT")     */}
      {/* ================================================================== */}
      {showSupportModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Rider Support Hub"
          className="fixed inset-0 z-50 bg-[#02050E]/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-lg obsidian-login-card rounded-2xl border-2 border-[#DFC07D] p-5 space-y-4 max-h-[88vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {supportSection !== 'menu' && (
                  <button
                    type="button"
                    onClick={() => setSupportSection('menu')}
                    aria-label="Back to Support Options"
                    className="h-8 w-8 rounded-lg border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[#DFC07D] flex items-center justify-center cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h2 className="font-cinzel text-lg font-bold text-champagne-glow">
                    Rider Support &amp; Lost Items
                  </h2>
                  <p className="text-[11px] text-[#B89650]">
                    Oklahoma Co-op Support · 100% Human Coordinators
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                className="h-8 w-8 rounded-lg border border-[#C5A059]/40 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D] flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {supportSection === 'menu' && (
              <div className="space-y-3">
                {/* Lost & Found Claim ($20.00 return fee) */}
                <button
                  type="button"
                  onClick={() => setSupportSection('lost_found')}
                  className="w-full rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/50 hover:border-[#DFC07D] p-4 flex items-center justify-between gap-3 text-left cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg border border-[#DFC07D]/55 bg-[#C5A059]/12 flex items-center justify-center shrink-0">
                      <PackageSearch className="w-5 h-5 text-[#DFC07D]" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#DFC07D]">
                        Lost &amp; Found Claim ($20.00 Return Fee)
                      </div>
                      <p className="text-[11px] text-[#B89650] mt-0.5">
                        Left something behind? Report it here and authorize the $20.00 return fee
                        paid directly to your driver upon item return.
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#DFC07D] shrink-0" />
                </button>

                {/* Write to Support & Call Support */}
                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-[#C5A059]/25">
                  <button
                    type="button"
                    onClick={() => setSupportSection('write_support')}
                    className="h-12 rounded-xl btn-gold-luxury text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Write to Support</span>
                  </button>

                  <a
                    href={SUPPORT_PHONE_TEL}
                    onClick={() =>
                      setSupportCallNote(
                        `Connecting directly to RideApp OKC Support Desk at ${SUPPORT_PHONE_DISPLAY}...`
                      )
                    }
                    className="h-12 rounded-xl btn-gold-luxury text-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Phone className="w-4 h-4" />
                    <span>Call Support</span>
                  </a>
                </div>

                {supportCallNote && (
                  <div className="rounded-lg border border-[#DFC07D]/55 bg-[#C5A059]/12 px-3 py-2 text-xs text-[#DFC07D]">
                    {supportCallNote}
                  </div>
                )}
              </div>
            )}

            {supportSection === 'lost_found' && (
              <form onSubmit={handleSubmitLostFoundClaim} className="space-y-3">
                <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3 text-xs text-[#DFC07D]">
                  Select your trip and describe the item left in the vehicle. Your driver is
                  notified immediately.
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#B89650] mb-1">
                    Select Recent Trip
                  </label>
                  <select
                    value={lostFoundTripId}
                    onChange={(e) => setLostFoundTripId(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D]"
                  >
                    {riderTripsForLostFound.length === 0 ? (
                      <option value="">No recent trips available</option>
                    ) : (
                      riderTripsForLostFound.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.date} · {t.driverName || 'OKC Driver'} ({t.pickupAddress.split(',')[0]})
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#B89650] mb-1">
                    Lost Item Description
                  </label>
                  <input
                    type="text"
                    value={lostFoundItemDesc}
                    onChange={(e) => setLostFoundItemDesc(e.target.value)}
                    placeholder="e.g., Black leather wallet, house keys, or AirPods case"
                    className="w-full h-10 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/60 focus:outline-none focus:border-[#DFC07D]"
                    required
                  />
                </div>

                <label className="flex items-start gap-2.5 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/55 p-3 cursor-pointer text-xs text-[#DFC07D]">
                  <input
                    type="checkbox"
                    checked={lostFoundFeeAgreed}
                    onChange={(e) => setLostFoundFeeAgreed(e.target.checked)}
                    className="mt-0.5 accent-[#DFC07D] w-4 h-4 shrink-0"
                    required
                  />
                  <span>
                    I agree to the <strong>$20.00 return fee</strong> paid directly to the driver
                    upon item return.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={!lostFoundFeeAgreed || !lostFoundItemDesc.trim() || riderTripsForLostFound.length === 0}
                  className="w-full h-11 rounded-xl btn-gold-luxury text-xs uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                >
                  Submit Lost &amp; Found Claim ($20 Return Fee)
                </button>
              </form>
            )}

            {supportSection === 'write_support' && (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 p-3 space-y-2 max-h-[240px] overflow-y-auto">
                  {(user.supportMessages || []).length === 0 ? (
                    <p className="text-xs text-[#B89650] text-center py-6">
                      Send a message below — an Oklahoma Co-op support specialist replies directly.
                    </p>
                  ) : (
                    (user.supportMessages || []).map((msg) => {
                      const isRider = msg.sender === 'rider';
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isRider ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                              isRider
                                ? 'bg-[#C5A059]/20 border border-[#DFC07D]/50 text-[#DFC07D]'
                                : 'bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 text-[#B89650]'
                            }`}
                          >
                            <div className="text-[10px] font-bold text-[#D4AF37] mb-0.5">
                              {isRider ? 'You' : 'OKC Support Desk'} · {msg.timestamp}
                            </div>
                            <div>{msg.text}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendSupportTicket} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={supportTicketDraft}
                    onChange={(e) => setSupportTicketDraft(e.target.value)}
                    placeholder="Write your support question or ticket..."
                    className="flex-1 h-11 px-3.5 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                  />
                  <button
                    type="submit"
                    className="h-11 px-4 rounded-xl btn-gold-luxury text-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 5. FIXED 4-TAB BOTTOM NAVIGATION BAR (RESERVE | MY RIDES | OKC IMPACT | SUPPORT) */}
      {/* ================================================================== */}
      <nav
        aria-label="Rider Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#020612]/72 backdrop-blur-[10px] border-t border-[#C5A059]/35 grid grid-cols-4 items-center px-1 sm:px-2"
      >
        {(
          [
            {id: 'reserve', label: 'Reserve', Icon: Compass},
            {id: 'rides', label: 'My Rides', Icon: Calendar},
            {id: 'impact', label: 'OKC Impact', Icon: Heart},
          ] as const
        ).map(({id, label, Icon}) => {
          const active = activeTab === id && !showSupportModal;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setShowSupportModal(false);
                setActiveTab(id);
              }}
              className={`relative h-12 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
                active ? 'text-champagne-glow' : 'text-[#B89650]/70 hover:text-[#DFC07D]'
              }`}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 w-9 h-[2px] bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
                />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[10.5px] font-bold tracking-wide">{label}</span>
            </button>
          );
        })}

        {/* 4th Tab: Support */}
        <button
          type="button"
          onClick={() => handleOpenSupportModal('menu')}
          className={`relative h-12 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            showSupportModal
              ? 'text-champagne-glow'
              : 'text-[#D4AF37]/85 hover:text-[#DFC07D]'
          }`}
        >
          {showSupportModal && (
            <span
              aria-hidden="true"
              className="absolute top-0 w-9 h-[2px] bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
            />
          )}
          <Headphones className="w-5 h-5 text-[#D4AF37]" />
          <span className="text-[10.5px] font-bold tracking-wide">Support</span>
        </button>
      </nav>
    </div>
  );
};
