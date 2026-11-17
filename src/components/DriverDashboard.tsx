import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileCheck2,
  FileText,
  Headphones,
  Home,
  LocateFixed,
  LogOut,
  MapPin,
  MessageSquare,
  Navigation,
  PackageCheck,
  Paperclip,
  Phone,
  Plus,
  Radio,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  Upload,
  UserCheck,
  Wallet,
  X,
} from 'lucide-react';
import {
  ActiveTripStage,
  ChatMessage,
  DriverDocument,
  GeoPoint,
  RideReservation,
  RideStatus,
  SafetyReport,
  SupportChatMessage,
  UserAccount,
  UserRole,
} from '../types/rideapp';
import {
  OKLAHOMA_LANDMARKS,
  calculateCoopFare,
  calculateHaversineMiles,
  getDefaultUpcomingSlot,
  isPointInsideOklahoma,
  parseScheduleTimestamp,
} from '../utils/oklahomaGeo';
import {DarkRadarMap} from './DarkRadarMap';

interface DriverDashboardProps {
  user: UserAccount;
  reservations: RideReservation[];
  onUpdateUser: (updated: UserAccount) => void;
  onUpdateReservation: (updated: RideReservation) => void;
  onCreateSampleDispatch: (newRes: RideReservation) => void;
  onLogout: () => void;
}

type DriverTab = 'home' | 'earnings' | 'profile' | 'support';
type EarningsTimeframe = 'daily' | 'weekly' | 'monthly' | 'yearly';

const OFFER_DURATION_SECONDS = 5;
const FREE_WAIT_LIMIT_SECONDS = 300; // 05:00 free wait / Stop 1 limit
const EXTRA_WAIT_RATE_PER_MIN = 0.2;

const MoneyBagGoldIcon: React.FC<{className?: string; active?: boolean}> = ({
  className = 'w-5 h-5',
  active = false,
}) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden="true"
  >
    <path
      d="M9 3.5L10.5 6.5H13.5L15 3.5C15.2 3.1 14.9 2.7 14.4 2.7H9.6C9.1 2.7 8.8 3.1 9 3.5Z"
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.25 : 0}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M8.5 7.5H15.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    />
    <path
      d="M10 7.5C6.5 9.8 5 13 5 16.2C5 19.4 7.8 21.3 12 21.3C16.2 21.3 19 19.4 19 16.2C19 13 17.5 9.8 14 7.5"
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.16 : 0}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M12 11V18M13.8 12.6C13.8 11.9 13 11.4 12 11.4C11 11.4 10.2 11.9 10.2 12.6C10.2 13.4 11 13.8 12 14.1C13 14.4 13.8 14.8 13.8 15.7C13.8 16.5 13 17 12 17C11 17 10.2 16.5 10.2 15.7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DEFAULT_DRIVER_DOCS: DriverDocument[] = [
  {
    id: 'license',
    title: "Driver's License",
    fileName: 'OK_REAL_ID_Driver.jpg',
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
    fileName: 'OK_TaxCommission_Tag.pdf',
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
];

function formatDurationMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function estimateEtaMinutes(miles: number): number {
  return Math.max(2, Math.round(miles * 2.1 + 1));
}

function triggerFileDownload(filename: string, content: string, mimeType = 'text/plain') {
  const blob = new Blob([content], {type: `${mimeType};charset=utf-8`});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const DriverDashboard: React.FC<DriverDashboardProps> = ({
  user,
  reservations,
  onUpdateUser,
  onUpdateReservation,
  onCreateSampleDispatch,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<DriverTab>('home');
  const [earningsTimeframe, setEarningsTimeframe] = useState<EarningsTimeframe>('daily');
  const [mapFocus, setMapFocus] = useState<{point: GeoPoint; request: number} | null>(null);

  // Driver documents normalized with 4 required credentials + expiration dates
  const docs: DriverDocument[] = useMemo(() => {
    const existing = user.documents || [];
    return DEFAULT_DRIVER_DOCS.map((def) => {
      const match = existing.find((d) => d.id === def.id);
      if (!match) return def;
      return {
        ...def,
        ...match,
        title: def.title,
        expirationDate: match.expirationDate || def.expirationDate,
        status: match.status || 'active',
      };
    });
  }, [user.documents]);

  const expiredDocs = useMemo(
    () => docs.filter((d) => d.status === 'expired'),
    [docs]
  );

  // Driver Online State (blocked if any doc is expired)
  const [isOnline, setIsOnline] = useState<boolean>(
    expiredDocs.length > 0 ? false : user.isOnline ?? true
  );
  const [showExpiredAlertModal, setShowExpiredAlertModal] = useState(false);

  // Native Phone HTML5 Geolocation state ($0 paid map APIs)
  const [liveGps, setLiveGps] = useState<GeoPoint>({lat: 35.4689, lng: -97.5214});
  const [gpsStatusText, setGpsStatusText] = useState<string>('Standby · Oklahoma Metro');
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number>(12);
  const watchIdRef = useRef<number | null>(null);
  const simApproachRef = useRef<number | null>(null);
  const [isSimulatingApproach, setIsSimulatingApproach] = useState(false);

  // Active & Incoming Reservation state
  const myCompletedRides = useMemo(
    () =>
      reservations
        .filter((r) => r.driverId === user.id && r.status === RideStatus.Completed)
        .sort(
          (a, b) =>
            (b.completedTimestamp || b.scheduledTimestamp) -
            (a.completedTimestamp || a.scheduledTimestamp)
        ),
    [reservations, user.id]
  );

  const activeAcceptedRide = useMemo(
    () =>
      reservations.find(
        (r) => r.driverId === user.id && r.status === RideStatus.Accepted
      ) || null,
    [reservations, user.id]
  );

  const incomingPendingRides = useMemo(
    () =>
      reservations.filter(
        (r) =>
          r.status === RideStatus.Pending && !r.declinedByDriverIds.includes(user.id)
      ),
    [reservations, user.id]
  );

  // Incoming Ride Reservation Pop-Up + Countdown Timer
  const [activeOfferId, setActiveOfferId] = useState<string | null>(null);
  const [offerSecondsLeft, setOfferSecondsLeft] = useState<number>(OFFER_DURATION_SECONDS);
  const [dismissedOfferIds, setDismissedOfferIds] = useState<string[]>([]);
  const [mapOfferOverlay, setMapOfferOverlay] = useState<HTMLDivElement | null>(null);

  // Active Trip Sheet visibility + Wait Timer + In-App Chat Drawer + Call Notice + Rating Modal
  const [isTripSheetOpen, setIsTripSheetOpen] = useState<boolean>(Boolean(activeAcceptedRide));
  const [waitSeconds, setWaitSeconds] = useState<number>(0);
  const [showChatDrawer, setShowChatDrawer] = useState<boolean>(false);
  const [driverChatDraft, setDriverChatDraft] = useState<string>('');
  const [callBanner, setCallBanner] = useState<string | null>(null);

  // Rate Rider 1-5 Star + Passenger Safety Report Pop-Up Modal
  const [ratingModalRide, setRatingModalRide] = useState<RideReservation | null>(null);
  const [selectedRiderStars, setSelectedRiderStars] = useState<number>(5);
  const [riderCompliments, setRiderCompliments] = useState<string[]>([]);
  const [showPassengerReportBox, setShowPassengerReportBox] = useState<boolean>(false);
  const [passengerIncidentTags, setPassengerIncidentTags] = useState<string[]>([]);
  const [passengerIncidentNotes, setPassengerIncidentNotes] = useState<string>('');

  // Rider Report Inbox & Contractor Dispute Resolution State
  const [respondingReportId, setRespondingReportId] = useState<string | null>(null);
  const [disputeStoryDraft, setDisputeStoryDraft] = useState<string>('');
  const [disputeEvidenceNote, setDisputeEvidenceNote] = useState<string>('');
  const [disputeAttachmentName, setDisputeAttachmentName] = useState<string | null>(null);
  const [disputeResolutionOffer, setDisputeResolutionOffer] = useState<string>(
    'Dashcam & GPS Verification Attached'
  );

  // Driver Support & Dispute Resolution Center + Lost & Found ($20 Return Fee)
  const [supportSection, setSupportSection] = useState<
    'menu' | 'reports' | 'lost_found' | 'fare_trip' | 'write_support'
  >('menu');
  const [selectedSupportTripId, setSelectedSupportTripId] = useState<string>('');
  const [tripIssueMode, setTripIssueMode] = useState<'fare' | 'passenger'>('fare');
  const [fareReviewNotes, setFareReviewNotes] = useState<string>('');
  const [supportPassengerTags, setSupportPassengerTags] = useState<string[]>([]);
  const [supportPassengerNotes, setSupportPassengerNotes] = useState<string>('');
  const [lostFoundItemDesc, setLostFoundItemDesc] = useState<string>('');
  const [supportDraft, setSupportDraft] = useState<string>('');
  const [supportCallBanner, setSupportCallBanner] = useState<string | null>(null);

  // Cash Out, Tax & Action Toast Notifications
  const [showCashOutModal, setShowCashOutModal] = useState(false);
  const [cashOutSuccessToast, setCashOutSuccessToast] = useState<string | null>(null);
  const [taxDownloadToast, setTaxDownloadToast] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Slider drag state for Stage-by-Stage Uber/Lyft Action Slider
  const sliderTrackRef = useRef<HTMLDivElement | null>(null);
  const [sliderProgress, setSliderProgress] = useState<number>(0);
  const [isDraggingSlider, setIsDraggingSlider] = useState<boolean>(false);
  const ringtoneContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);

  const stopOfferRingtone = () => {
    if (ringtoneIntervalRef.current !== null) {
      window.clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    const context = ringtoneContextRef.current;
    if (context && context.state === 'running') {
      void context.suspend().catch((error: unknown) => {
        console.error('Unable to pause incoming ride ringtone:', error);
      });
    }
  };

  const prepareRingtoneAudio = () => {
    if (!('AudioContext' in window)) return;
    let context = ringtoneContextRef.current;
    if (!context || context.state === 'closed') {
      context = new window.AudioContext();
      ringtoneContextRef.current = context;
    }
    void context.resume().catch((error: unknown) => {
      console.error('Unable to prepare incoming ride audio:', error);
    });
  };

  useEffect(
    () => () => {
      if (ringtoneIntervalRef.current !== null) {
        window.clearInterval(ringtoneIntervalRef.current);
      }
      const context = ringtoneContextRef.current;
      ringtoneContextRef.current = null;
      if (context && context.state !== 'closed') {
        void context.close().catch((error: unknown) => {
          console.error('Unable to close incoming ride audio:', error);
        });
      }
    },
    []
  );

  // If expired doc appears while online, pause online and show alert modal
  useEffect(() => {
    if (expiredDocs.length > 0 && isOnline) {
      setIsOnline(false);
      onUpdateUser({...user, isOnline: false});
      setShowExpiredAlertModal(true);
    }
  }, [expiredDocs.length]);

  // Trigger navigator.geolocation.watchPosition() when ONLINE or on an ACTIVE TRIP
  const gpsWatchActive = isOnline || Boolean(activeAcceptedRide);

  useEffect(() => {
    if (!gpsWatchActive) {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setGpsStatusText('Offline · Phone GPS paused');
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsStatusText('Live OKC Phone GPS Relay Active ($0 API)');
      return;
    }

    setGpsStatusText('Watching Native Phone GPS (watchPosition)...');
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const pt: GeoPoint = {
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
        };
        setGpsAccuracyMeters(Math.round(pos.coords.accuracy || 10));
        if (isPointInsideOklahoma(pt)) {
          setLiveGps(pt);
          setGpsStatusText(
            `Phone GPS Locked (${pt.lat.toFixed(4)}°N, ${Math.abs(pt.lng).toFixed(4)}°W)`
          );
        } else {
          setGpsStatusText('OKC Metro Co-op GPS Relay Active');
        }
      },
      () => {
        setGpsStatusText('OKC Metro Co-op GPS Relay Active');
      },
      {enableHighAccuracy: true, maximumAge: 3000, timeout: 8000}
    );
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [gpsWatchActive]);

  // Sync liveGps into activeAcceptedRide so Rider screen sees live distance/ETA updates too
  useEffect(() => {
    if (!activeAcceptedRide) return;
    if (
      activeAcceptedRide.driverCoords &&
      activeAcceptedRide.driverCoords.lat === liveGps.lat &&
      activeAcceptedRide.driverCoords.lng === liveGps.lng
    ) {
      return;
    }
    onUpdateReservation({
      ...activeAcceptedRide,
      driverCoords: liveGps,
    });
  }, [liveGps.lat, liveGps.lng]);

  // Separate Scheduled Reservations Feed vs. 5-Second Instant Ride Offers
  const instantPendingRides = useMemo(
    () => incomingPendingRides.filter((r) => r.bookingMode === 'instant'),
    [incomingPendingRides]
  );

  const reservedPendingRides = useMemo(
    () => incomingPendingRides.filter((r) => r.bookingMode !== 'instant'),
    [incomingPendingRides]
  );

  // Auto-open 5-Second Instant Ride Offer when ONLINE with an eligible instant ride
  const currentOfferRide = useMemo(() => {
    if (!isOnline || activeAcceptedRide) return null;
    if (activeOfferId) {
      return instantPendingRides.find((r) => r.id === activeOfferId) || null;
    }
    return (
      instantPendingRides.find((r) => !dismissedOfferIds.includes(r.id)) || null
    );
  }, [isOnline, activeAcceptedRide, activeOfferId, instantPendingRides, dismissedOfferIds]);

  useEffect(() => {
    if (currentOfferRide && currentOfferRide.id !== activeOfferId) {
      setActiveOfferId(currentOfferRide.id);
      setOfferSecondsLeft(OFFER_DURATION_SECONDS);
    } else if (!currentOfferRide && activeOfferId) {
      setActiveOfferId(null);
    }
  }, [currentOfferRide, activeOfferId]);

  // Glowing 5-Second Gold Countdown Timer for Instant Ride Offer
  useEffect(() => {
    if (!currentOfferRide) return;
    const timer = window.setInterval(() => {
      setOfferSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentOfferRide?.id]);

  useEffect(() => {
    if (!currentOfferRide || !('AudioContext' in window)) return;
    prepareRingtoneAudio();
    const context = ringtoneContextRef.current;
    if (!context) return;

    const ring = () => {
      if (context.state !== 'running') return;
      const startAt = context.currentTime;
      [0, 0.22, 0.52, 0.74].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = startAt + offset;
        oscillator.type = 'sine';
        oscillator.frequency.value = index % 2 === 0 ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.2);
      });
    };

    void context.resume().then(ring).catch((error: unknown) => {
      console.error('Unable to play incoming ride ringtone:', error);
    });
    ringtoneIntervalRef.current = window.setInterval(ring, 1500);

    return () => {
      if (ringtoneIntervalRef.current !== null) {
        window.clearInterval(ringtoneIntervalRef.current);
        ringtoneIntervalRef.current = null;
      }
      if (context.state === 'running') {
        void context.suspend().catch((error: unknown) => {
          console.error('Unable to pause incoming ride ringtone:', error);
        });
      }
    };
  }, [currentOfferRide?.id]);

  // Auto-decline and pass to next closest Oklahoma driver when the timer hits 0
  useEffect(() => {
    if (!currentOfferRide || offerSecondsLeft > 0) return;
    stopOfferRingtone();
    setDismissedOfferIds((prev) =>
      prev.includes(currentOfferRide.id) ? prev : [...prev, currentOfferRide.id]
    );
    setActiveOfferId(null);
    onUpdateReservation({
      ...currentOfferRide,
      declinedByDriverIds: currentOfferRide.declinedByDriverIds.includes(user.id)
        ? currentOfferRide.declinedByDriverIds
        : [...currentOfferRide.declinedByDriverIds, user.id],
      driverQueueIndex: (currentOfferRide.driverQueueIndex ?? 0) + 1,
    });
    showTemporaryToast('5s instant offer expired — passed to next closest Oklahoma driver.');
  }, [offerSecondsLeft, currentOfferRide, user.id, onUpdateReservation]);

  // Pickup & Stop 1 Wait Timer when Stage === 'arrived_pickup' or 'arrived_stop1'
  useEffect(() => {
    if (!activeAcceptedRide) {
      setWaitSeconds(0);
      return;
    }
    const stage = activeAcceptedRide.tripStage;
    const anchorTs =
      stage === 'arrived_pickup'
        ? activeAcceptedRide.arrivedAtPickupTimestamp
        : stage === 'arrived_stop1'
        ? activeAcceptedRide.arrivedAtStop1Timestamp
        : undefined;

    if ((stage !== 'arrived_pickup' && stage !== 'arrived_stop1') || !anchorTs) {
      setWaitSeconds(0);
      return;
    }

    const updateWait = () => {
      const elapsed = Math.floor((Date.now() - anchorTs) / 1000);
      setWaitSeconds(Math.max(0, elapsed));
    };
    updateWait();
    const id = window.setInterval(updateWait, 1000);
    return () => window.clearInterval(id);
  }, [
    activeAcceptedRide?.id,
    activeAcceptedRide?.tripStage,
    activeAcceptedRide?.arrivedAtPickupTimestamp,
    activeAcceptedRide?.arrivedAtStop1Timestamp,
  ]);

  useEffect(() => {
    if (activeAcceptedRide) {
      setIsTripSheetOpen(true);
    }
  }, [activeAcceptedRide?.id]);

  useEffect(() => {
    return () => {
      if (simApproachRef.current) {
        window.clearInterval(simApproachRef.current);
      }
    };
  }, []);

  // Rider Reports sent simultaneously to driver & Co-op Desk
  const riderComplaintsOnDriver = useMemo(() => {
    const items: Array<{reservation: RideReservation; report: SafetyReport}> = [];
    reservations
      .filter((r) => r.driverId === user.id || r.driverId === 'usr-driver-demo')
      .forEach((res) => {
        (res.safetyReports || []).forEach((rep) => {
          if (rep.submittedByRole !== 'driver') {
            items.push({reservation: res, report: rep});
          }
        });
      });
    return items;
  }, [reservations, user.id]);

  const openComplaintsCount = useMemo(
    () =>
      riderComplaintsOnDriver.filter(
        (item) => item.report.status === 'Queued for Co-op Human Safety Panel'
      ).length,
    [riderComplaintsOnDriver]
  );

  // Recent driver trips available for Lost & Found / Fare Review
  const driverTripsForSupport = useMemo(() => {
    const list = [...(activeAcceptedRide ? [activeAcceptedRide] : []), ...myCompletedRides];
    return list;
  }, [activeAcceptedRide, myCompletedRides]);

  // Earnings & Balance Calculations (includes 70% payouts + tips + $20 Lost & Found fees)
  const lifetimeNetAndTips = useMemo(
    () =>
      myCompletedRides.reduce(
        (sum, r) =>
          sum +
          r.fare.driverPayout70 +
          (r.tipAmount || 0) +
          (r.lostFoundFeeClaimed || 0),
        0
      ) + (activeAcceptedRide?.lostFoundFeeClaimed || 0),
    [myCompletedRides, activeAcceptedRide?.lostFoundFeeClaimed]
  );

  const availableBalance = Math.max(
    0,
    Number((lifetimeNetAndTips - (user.cashedOutTotal || 0)).toFixed(2))
  );

  const todayEarnings = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const todayTotal = myCompletedRides
      .filter((r) => (r.completedTimestamp || r.scheduledTimestamp) >= cutoff)
      .reduce(
        (sum, r) =>
          sum +
          r.fare.driverPayout70 +
          (r.tipAmount || 0) +
          (r.lostFoundFeeClaimed || 0),
        0
      );
    return Number(
      (todayTotal + (activeAcceptedRide?.lostFoundFeeClaimed || 0)).toFixed(2)
    );
  }, [myCompletedRides, activeAcceptedRide?.lostFoundFeeClaimed]);

  const earningsMetrics = useMemo(() => {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const filtered = myCompletedRides.filter((r) => {
      const ts = r.completedTimestamp || r.scheduledTimestamp;
      const age = now - ts;
      if (earningsTimeframe === 'daily') return age <= dayMs;
      if (earningsTimeframe === 'weekly') return age <= 7 * dayMs;
      if (earningsTimeframe === 'monthly') return age <= 30 * dayMs;
      return age <= 365 * dayMs;
    });

    const netPayouts = filtered.reduce((s, r) => s + r.fare.driverPayout70, 0);
    const tips = filtered.reduce((s, r) => s + (r.tipAmount || 0), 0);
    const lostFoundFees = filtered.reduce(
      (s, r) => s + (r.lostFoundFeeClaimed || 0),
      0
    );
    const totalEarnings = netPayouts + tips + lostFoundFees;
    const totalMinutes = filtered.reduce((s, r) => s + (r.durationMinutes || 24), 0);
    const baseOnlineShift =
      earningsTimeframe === 'daily'
        ? 3.2
        : earningsTimeframe === 'weekly'
        ? 11.5
        : earningsTimeframe === 'monthly'
        ? 42.0
        : 164.0;
    const onlineHours = Number((baseOnlineShift + totalMinutes / 60).toFixed(1));
    const totalMiles = filtered.reduce((s, r) => s + r.fare.miles, 0);

    return {
      trips: filtered,
      tripCount: filtered.length,
      netPayouts,
      tips,
      lostFoundFees,
      totalEarnings,
      onlineHours,
      totalMiles,
    };
  }, [myCompletedRides, earningsTimeframe]);

  // Handlers
  const handleToggleOnline = () => {
    if (!isOnline && expiredDocs.length > 0) {
      setShowExpiredAlertModal(true);
      return;
    }
    const next = !isOnline;
    if (next) prepareRingtoneAudio();
    setIsOnline(next);
    onUpdateUser({...user, isOnline: next});
  };

  const handleAcceptRide = (res: RideReservation) => {
    if (expiredDocs.length > 0) {
      setShowExpiredAlertModal(true);
      return;
    }
    stopOfferRingtone();

    // Immediately trigger HTML5 watchPosition reading
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const pt = {
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
          };
          if (isPointInsideOklahoma(pt)) {
            setLiveGps(pt);
          }
        },
        () => {
          // Keep active OKC coordinates
        },
        {enableHighAccuracy: true, timeout: 5000}
      );
    }

    const vehicleText = user.vehicle
      ? `${user.vehicle.year} ${user.vehicle.make} ${user.vehicle.model} · ${user.vehicle.plate}`
      : '2024 Toyota Camry Hybrid XSE · OK · CVB-405';

    const updated: RideReservation = {
      ...res,
      status: RideStatus.Accepted,
      tripStage: 'en_route_pickup',
      driverId: user.id,
      driverName: user.name,
      driverPhone: user.phone,
      driverVehicle: vehicleText,
      driverCoords: liveGps,
      chatMessages: [
        ...res.chatMessages,
        {
          id: `msg-${Date.now()}`,
          senderRole: UserRole.Driver,
          senderName: user.name,
          text: `Accepted your Oklahoma reservation! Driving ${vehicleText}. Sharing live phone GPS now.`,
          timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
        },
      ],
    };
    onUpdateReservation(updated);
    setActiveOfferId(null);
    setIsTripSheetOpen(true);
    setActiveTab('home');
    setSliderProgress(0);
  };

  const handleDeclineRide = (res: RideReservation) => {
    stopOfferRingtone();
    setDismissedOfferIds((prev) => [...prev, res.id]);
    setActiveOfferId(null);
    onUpdateReservation({
      ...res,
      declinedByDriverIds: [...res.declinedByDriverIds, user.id],
      driverQueueIndex: (res.driverQueueIndex ?? 0) + 1,
    });
  };

  const handleSpawnSampleDispatch = () => {
    if (expiredDocs.length > 0) {
      setShowExpiredAlertModal(true);
      return;
    }
    if (!isOnline) {
      setIsOnline(true);
      onUpdateUser({...user, isOnline: true});
    }

    const slot = getDefaultUpcomingSlot();
    const samplePairs: Array<{
      pickup: (typeof OKLAHOMA_LANDMARKS)[number];
      stop1?: {address: string; lat: number; lng: number};
      dropoff: (typeof OKLAHOMA_LANDMARKS)[number];
      rider: string;
      score: number;
    }> = [
      {
        pickup: OKLAHOMA_LANDMARKS[4],
        stop1: {
          address: '815 N Hudson Ave, Midtown Market, Oklahoma City, OK 73102',
          lat: 35.4765,
          lng: -97.5198,
        },
        dropoff: OKLAHOMA_LANDMARKS[4],
        rider: 'Maya Thornton',
        score: 4.96,
      },
      {
        pickup: OKLAHOMA_LANDMARKS[0],
        dropoff: OKLAHOMA_LANDMARKS[2],
        rider: 'Caleb Henderson',
        score: 4.95,
      },
      {
        pickup: OKLAHOMA_LANDMARKS[4],
        dropoff: OKLAHOMA_LANDMARKS[6],
        rider: 'Savannah Brooks',
        score: 4.98,
      },
      {
        pickup: OKLAHOMA_LANDMARKS[5],
        dropoff: OKLAHOMA_LANDMARKS[3],
        rider: 'Ethan Callahan',
        score: 4.91,
      },
    ];
    const pick = samplePairs[Math.floor(Math.random() * samplePairs.length)];
    const pCoords = {lat: pick.pickup.lat, lng: pick.pickup.lng};
    const s1Coords = pick.stop1 ? {lat: pick.stop1.lat, lng: pick.stop1.lng} : undefined;
    const dCoords = {lat: pick.dropoff.lat, lng: pick.dropoff.lng};

    const sample: RideReservation = {
      id: `res-okc-${Math.floor(2000 + Math.random() * 7900)}`,
      riderId: 'usr-rider-demo',
      riderName: pick.rider,
      riderPhone: '(405) 555-0164',
      riderScore: pick.score,
      pickupAddress: pick.pickup.address,
      pickupCoords: pCoords,
      stop1Address: pick.stop1?.address,
      stop1Coords: s1Coords,
      dropoffAddress: pick.dropoff.address,
      dropoffCoords: dCoords,
      date: slot.date,
      timeSlot: slot.timeSlot,
      bookingMode: 'instant',
      driverQueueIndex: 0,
      scheduledTimestamp: parseScheduleTimestamp(slot.date, slot.timeSlot),
      status: RideStatus.Pending,
      fare: calculateCoopFare(pCoords, dCoords, s1Coords),
      declinedByDriverIds: [],
      chatMessages: [],
      safetyReports: [],
      createdAt: new Date().toISOString(),
    };
    onCreateSampleDispatch(sample);
    setActiveOfferId(sample.id);
    setOfferSecondsLeft(OFFER_DURATION_SECONDS);
  };

  const computeCurrentStageExtraWaitFee = (res: RideReservation): number => {
    const stage = res.tripStage;
    const startedAt =
      stage === 'arrived_pickup' && res.pickupExtraWaitActive
        ? res.pickupExtraWaitStartedAt
        : stage === 'arrived_stop1' && res.stop1ExtraWaitActive
        ? res.stop1ExtraWaitStartedAt
        : undefined;
    if (!startedAt) return 0;
    const elapsedSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const billableMins = Math.max(1, Math.ceil(elapsedSec / 60));
    return Number((billableMins * EXTRA_WAIT_RATE_PER_MIN).toFixed(2));
  };

  const handleAdvanceTripStage = (res: RideReservation) => {
    const stage: ActiveTripStage = res.tripStage || 'en_route_pickup';
    const hasStop1 = Boolean(res.stop1Address && res.stop1Coords);

    if (stage === 'en_route_pickup') {
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        senderRole: UserRole.Driver,
        senderName: user.name,
        text: `I have arrived at your pickup location (${res.pickupAddress}).`,
        timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
      };
      onUpdateReservation({
        ...res,
        tripStage: 'arrived_pickup',
        arrivedAtPickupTimestamp: Date.now(),
        driverCoords: res.pickupCoords,
        chatMessages: [...res.chatMessages, msg],
      });
      setLiveGps(res.pickupCoords);
      setSliderProgress(0);
      return;
    }

    // Snapshot any active $0.20/min wait fee before leaving pickup or Stop 1
    const stageWaitFee = computeCurrentStageExtraWaitFee(res);
    const updatedWaitFeeTotal = Number(
      ((res.extraWaitFeeCharged || 0) + stageWaitFee).toFixed(2)
    );
    const updatedFare =
      stageWaitFee > 0
        ? {
            ...res.fare,
            totalFare: Number((res.fare.totalFare + stageWaitFee).toFixed(2)),
            driverPayout70: Number(
              (res.fare.driverPayout70 + stageWaitFee * 0.7).toFixed(2)
            ),
            charityShare5: Number(
              (res.fare.charityShare5 + stageWaitFee * 0.05).toFixed(2)
            ),
            operationsShare25: Number(
              (res.fare.operationsShare25 + stageWaitFee * 0.25).toFixed(2)
            ),
          }
        : res.fare;

    if (stage === 'arrived_pickup' && hasStop1 && res.stop1Coords) {
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        senderRole: UserRole.Driver,
        senderName: user.name,
        text: `Arrived at Stop 1 (${res.stop1Address}). 5:00 stop timer started!`,
        timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
      };
      onUpdateReservation({
        ...res,
        tripStage: 'arrived_stop1',
        arrivedAtStop1Timestamp: Date.now(),
        pickupExtraWaitActive: false,
        extraWaitFeeCharged: updatedWaitFeeTotal,
        fare: updatedFare,
        driverCoords: res.stop1Coords,
        chatMessages: [...res.chatMessages, msg],
      });
      setLiveGps(res.stop1Coords);
      setSliderProgress(0);
      return;
    }

    if (stage === 'arrived_pickup' || stage === 'arrived_stop1' || stage === 'en_route_stop1') {
      const msg: ChatMessage = {
        id: `msg-${Date.now()}`,
        senderRole: UserRole.Driver,
        senderName: user.name,
        text:
          stage === 'arrived_stop1'
            ? `Stop 1 complete! Continuing to final drop-off (${res.dropoffAddress}).`
            : `Trip started! En route to ${res.dropoffAddress}.`,
        timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
      };
      onUpdateReservation({
        ...res,
        tripStage: 'in_progress',
        pickupExtraWaitActive: false,
        stop1ExtraWaitActive: false,
        extraWaitFeeCharged: updatedWaitFeeTotal,
        fare: updatedFare,
        tripStartedTimestamp: res.tripStartedTimestamp || Date.now(),
        chatMessages: [...res.chatMessages, msg],
      });
      setSliderProgress(0);
      return;
    }

    if (stage === 'in_progress') {
      if (simApproachRef.current) {
        window.clearInterval(simApproachRef.current);
        simApproachRef.current = null;
        setIsSimulatingApproach(false);
      }
      const completedRide: RideReservation = {
        ...res,
        status: RideStatus.Completed,
        tripStage: 'completed',
        completedTimestamp: Date.now(),
        driverCoords: res.dropoffCoords,
        durationMinutes: Math.max(12, Math.round(res.fare.miles * 1.8)),
        tipAmount: res.tipAmount ?? 4.0,
      };
      onUpdateReservation(completedRide);
      setLiveGps(res.dropoffCoords);
      setIsTripSheetOpen(false);
      setShowChatDrawer(false);
      setSliderProgress(0);
      setSelectedRiderStars(5);
      setRiderCompliments([]);
      setRatingModalRide(completedRide);
      setShowPassengerReportBox(false);
      setPassengerIncidentTags([]);
      setPassengerIncidentNotes('');
    }
  };

  const handleFastForwardWaitTimer = (res: RideReservation) => {
    const expiredAnchor = Date.now() - FREE_WAIT_LIMIT_SECONDS * 1000;
    if (res.tripStage === 'arrived_stop1') {
      onUpdateReservation({
        ...res,
        arrivedAtStop1Timestamp: expiredAnchor,
      });
    } else {
      onUpdateReservation({
        ...res,
        arrivedAtPickupTimestamp: expiredAnchor,
      });
    }
    setWaitSeconds(FREE_WAIT_LIMIT_SECONDS);
  };

  const handleActivateExtraWait = (res: RideReservation) => {
    const isStop1 = res.tripStage === 'arrived_stop1';
    const alreadyActive = isStop1 ? res.stop1ExtraWaitActive : res.pickupExtraWaitActive;
    if (alreadyActive) return;

    const msg: ChatMessage = {
      id: `msg-wait-${Date.now()}`,
      senderRole: UserRole.Driver,
      senderName: user.name,
      text: isStop1
        ? '5:00 Stop 1 limit reached — keeping wait active (+$0.20/min added to fare).'
        : '5:00 free pickup wait elapsed — waiting extra (+$0.20/min added to fare).',
      timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
    };

    onUpdateReservation({
      ...res,
      ...(isStop1
        ? {stop1ExtraWaitActive: true, stop1ExtraWaitStartedAt: Date.now()}
        : {pickupExtraWaitActive: true, pickupExtraWaitStartedAt: Date.now()}),
      chatMessages: [...res.chatMessages, msg],
    });
    showTemporaryToast('Extra wait billing active (+$0.20/min added to rider fare).');
  };

  const handleClaimNoShow6 = (res: RideReservation) => {
    if (simApproachRef.current) {
      window.clearInterval(simApproachRef.current);
      simApproachRef.current = null;
      setIsSimulatingApproach(false);
    }
    setCallBanner(
      `Dialing ${res.riderName} (${res.riderPhone}) & claiming $6.00 No-Show protection...`
    );
    const noShowRide: RideReservation = {
      ...res,
      status: RideStatus.Completed,
      tripStage: 'completed',
      noShowClaimed: true,
      completedTimestamp: Date.now(),
      fare: {
        ...res.fare,
        holdFee: 6,
        totalFare: 6,
        driverPayout70: 6,
        charityShare5: 0,
        operationsShare25: 0,
      },
      tipAmount: 0,
      chatMessages: [
        ...res.chatMessages,
        {
          id: `msg-noshow-${Date.now()}`,
          senderRole: UserRole.Driver,
          senderName: user.name,
          text: 'Attempted call after 5:00 pickup wait limit. No-show protection ($6.00) claimed.',
          timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
        },
      ],
    };
    onUpdateReservation(noShowRide);
    setIsTripSheetOpen(false);
    setShowChatDrawer(false);
    setSliderProgress(0);
    showTemporaryToast('$6.00 No-Show Payout claimed & credited to your driver balance.');
  };

  const handleEndAtStopClaim50 = (res: RideReservation) => {
    if (simApproachRef.current) {
      window.clearInterval(simApproachRef.current);
      simApproachRef.current = null;
      setIsSimulatingApproach(false);
    }
    const extraFee = computeCurrentStageExtraWaitFee(res);
    const baseFare50 = Number((res.fare.totalFare * 0.5).toFixed(2));
    const claimTotal = Number((baseFare50 + extraFee).toFixed(2));
    const claimDriver = Number((claimTotal * 0.7).toFixed(2));
    const claimCharity = Number((claimTotal * 0.05).toFixed(2));
    const claimCoop = Number((claimTotal - claimDriver - claimCharity).toFixed(2));

    const endedAtStopRide: RideReservation = {
      ...res,
      status: RideStatus.Completed,
      tripStage: 'completed',
      endedAtStop1Claimed50: true,
      extraWaitFeeCharged: Number(((res.extraWaitFeeCharged || 0) + extraFee).toFixed(2)),
      completedTimestamp: Date.now(),
      fare: {
        ...res.fare,
        totalFare: claimTotal,
        driverPayout70: claimDriver,
        charityShare5: claimCharity,
        operationsShare25: claimCoop,
      },
      tipAmount: 0,
      chatMessages: [
        ...res.chatMessages,
        {
          id: `msg-stopend-${Date.now()}`,
          senderRole: UserRole.Driver,
          senderName: user.name,
          text: '5:00 Stop 1 wait limit reached. Trip ended at Stop 1 — 50% fare claimed per Co-op policy.',
          timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
        },
      ],
    };
    onUpdateReservation(endedAtStopRide);
    setIsTripSheetOpen(false);
    setShowChatDrawer(false);
    setSliderProgress(0);
    showTemporaryToast(
      `Trip ended at Stop 1 — 50% fare claimed ($${claimDriver.toFixed(2)} driver payout credited).`
    );
  };

  const handleSimulateGpsMovement = (res: RideReservation) => {
    if (simApproachRef.current) {
      window.clearInterval(simApproachRef.current);
      simApproachRef.current = null;
    }
    setIsSimulatingApproach(true);
    const start = res.driverCoords || liveGps;
    const target =
      res.tripStage === 'arrived_pickup' && res.stop1Coords
        ? res.stop1Coords
        : res.tripStage === 'arrived_stop1' || res.tripStage === 'in_progress'
        ? res.dropoffCoords
        : res.pickupCoords;
    let step = 0;
    const totalSteps = 10;

    simApproachRef.current = window.setInterval(() => {
      step += 1;
      const t = Math.min(1, step / totalSteps);
      const nextPt: GeoPoint = {
        lat: Number((start.lat + (target.lat - start.lat) * t).toFixed(5)),
        lng: Number((start.lng + (target.lng - start.lng) * t).toFixed(5)),
      };
      setLiveGps(nextPt);
      onUpdateReservation({
        ...res,
        driverCoords: nextPt,
      });
      if (t >= 1 && simApproachRef.current) {
        window.clearInterval(simApproachRef.current);
        simApproachRef.current = null;
        setIsSimulatingApproach(false);
      }
    }, 550);
  };

  const handleSendDriverChat = (e: React.FormEvent, quickText?: string) => {
    e.preventDefault();
    const text = (quickText ?? driverChatDraft).trim();
    if (!activeAcceptedRide || !text) return;
    const msg: ChatMessage = {
      id: `msg-${Date.now()}`,
      senderRole: UserRole.Driver,
      senderName: user.name,
      text,
      timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
    };
    onUpdateReservation({
      ...activeAcceptedRide,
      chatMessages: [...activeAcceptedRide.chatMessages, msg],
    });
    if (!quickText) setDriverChatDraft('');
  };

  const showTemporaryToast = (message: string) => {
    setActionToast(message);
    window.setTimeout(() => setActionToast(null), 4200);
  };

  const handleSubmitRiderRating = () => {
    if (!ratingModalRide) return;
    const hasIncident =
      (showPassengerReportBox || selectedRiderStars <= 3) &&
      (passengerIncidentTags.length > 0 || passengerIncidentNotes.trim().length > 0);

    const nextReports = [...(ratingModalRide.safetyReports || [])];
    if (hasIncident) {
      const incidentReport: SafetyReport = {
        id: `drv-saf-${Date.now()}`,
        category:
          passengerIncidentTags.length > 0
            ? passengerIncidentTags.join(' · ')
            : 'Driver Incident Report on Passenger',
        details:
          passengerIncidentNotes.trim() ||
          `Driver flagged passenger behavior (${passengerIncidentTags.join(', ')}).`,
        submittedBy: user.name,
        submittedByRole: 'driver',
        submittedAt: new Date().toLocaleString(),
        incidentTags: passengerIncidentTags,
        status: 'Queued for Co-op Human Safety Panel',
      };
      nextReports.push(incidentReport);
    }

    onUpdateReservation({
      ...ratingModalRide,
      riderRatingByDriver: selectedRiderStars,
      safetyReports: nextReports,
    });
    setRatingModalRide(null);
    setShowPassengerReportBox(false);
    setPassengerIncidentTags([]);
    setPassengerIncidentNotes('');

    if (hasIncident) {
      showTemporaryToast(
        'Passenger safety incident report logged with Oklahoma Co-op Safety Panel.'
      );
    }
  };

  const handleSubmitDisputeResponse = (
    reservation: RideReservation,
    reportId: string
  ) => {
    if (!disputeStoryDraft.trim() && !disputeEvidenceNote.trim()) return;
    const updatedReports = (reservation.safetyReports || []).map((rep) =>
      rep.id === reportId
        ? {
            ...rep,
            driverResponse: disputeStoryDraft.trim(),
            driverEvidenceNote: disputeEvidenceNote.trim() || undefined,
            driverAttachmentName: disputeAttachmentName || undefined,
            resolutionOffer: disputeResolutionOffer,
            respondedAt: new Date().toLocaleString(),
            status: 'Driver Response Submitted • Peer Co-op Review' as const,
          }
        : rep
    );

    onUpdateReservation({
      ...reservation,
      safetyReports: updatedReports,
    });
    setRespondingReportId(null);
    setDisputeStoryDraft('');
    setDisputeEvidenceNote('');
    setDisputeAttachmentName(null);
    showTemporaryToast(
      'Contractor response submitted. Account protected from automatic deactivation.'
    );
  };

  const handleSimulateRiderComplaint = () => {
    const target = myCompletedRides[0] || activeAcceptedRide;
    if (!target) return;
    const simulated: SafetyReport = {
      id: `saf-sim-${Date.now()}`,
      category: 'Route / Drop-off Inquiry',
      details:
        'Rider asked for confirmation of drop-off wait time & route segment along Sheridan Ave.',
      submittedBy: target.riderName,
      submittedByRole: 'rider',
      submittedAt: new Date().toLocaleString(),
      status: 'Queued for Co-op Human Safety Panel',
    };
    onUpdateReservation({
      ...target,
      safetyReports: [simulated, ...(target.safetyReports || [])],
    });
  };

  const activeSupportTrip = useMemo(
    () =>
      driverTripsForSupport.find((r) => r.id === selectedSupportTripId) ||
      driverTripsForSupport[0] ||
      null,
    [driverTripsForSupport, selectedSupportTripId]
  );

  const handleOpenSupportTab = (
    section: 'menu' | 'reports' | 'lost_found' | 'fare_trip' | 'write_support' = 'menu'
  ) => {
    if (!selectedSupportTripId && driverTripsForSupport[0]?.id) {
      setSelectedSupportTripId(driverTripsForSupport[0].id);
    }
    setSupportSection(section);
    setActiveTab('support');
  };

  const handleSubmitSupportPassengerIssue = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTrip = activeSupportTrip;
    if (!targetTrip) return;
    if (supportPassengerTags.length === 0 && !supportPassengerNotes.trim()) return;

    const newReport: SafetyReport = {
      id: `drv-saf-${Date.now()}`,
      category:
        supportPassengerTags.length > 0
          ? supportPassengerTags.join(' · ')
          : 'Driver Post-Trip Passenger Issue',
      details:
        supportPassengerNotes.trim() ||
        `Driver reported passenger issue (${supportPassengerTags.join(', ')}).`,
      submittedBy: user.name,
      submittedByRole: 'driver',
      submittedAt: new Date().toLocaleString(),
      incidentTags: supportPassengerTags,
      status: 'Queued for Co-op Human Safety Panel',
    };
    onUpdateReservation({
      ...targetTrip,
      safetyReports: [...(targetTrip.safetyReports || []), newReport],
    });
    setSupportPassengerTags([]);
    setSupportPassengerNotes('');
    setSupportSection('menu');
    showTemporaryToast(
      `Post-trip passenger report submitted for ${targetTrip.riderName}.`
    );
  };

  const handleClaimLostFoundFee = (e: React.FormEvent) => {
    e.preventDefault();
    const targetTrip = activeSupportTrip;
    if (!targetTrip || !lostFoundItemDesc.trim()) return;

    const alreadyClaimed = (targetTrip.lostFoundFeeClaimed || 0) > 0;
    const updatedTrip: RideReservation = {
      ...targetTrip,
      lostFoundFeeClaimed: 20,
      lostFoundItemDescription: lostFoundItemDesc.trim(),
      lostFoundClaimedAt: new Date().toLocaleString(),
      chatMessages: [
        ...targetTrip.chatMessages,
        {
          id: `msg-lf-${Date.now()}`,
          senderRole: UserRole.Driver,
          senderName: user.name,
          text: `Lost & Found Return Confirmed: "${lostFoundItemDesc.trim()}". $20.00 return fee applied to rider and credited to driver.`,
          timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
        },
      ],
    };
    onUpdateReservation(updatedTrip);
    setLostFoundItemDesc('');
    setSupportSection('menu');
    showTemporaryToast(
      alreadyClaimed
        ? `Lost & Found return updated for ${targetTrip.riderName}.`
        : `$20.00 Lost & Found Return Fee charged to ${targetTrip.riderName} & credited to your balance!`
    );
  };

  const handleSubmitFareReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fareReviewNotes.trim()) return;
    const targetTrip = activeSupportTrip;
    const nowTime = new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    const newMessages: SupportChatMessage[] = [
      ...(user.supportMessages || []),
      {
        id: `sup-drv-${Date.now()}`,
        sender: 'driver',
        category: 'Fare Review / Adjustment',
        text: `Trip ${targetTrip?.id || 'Recent'} (${targetTrip?.riderName || 'Rider'}): ${fareReviewNotes.trim()}`,
        timestamp: nowTime,
      },
      {
        id: `sup-ack-${Date.now() + 1}`,
        sender: 'support',
        category: 'Fare Review / Adjustment',
        text: 'OKC Co-op Payroll Desk received your fare review request. A human coordinator will verify GPS distance & wait time within 2 hours.',
        timestamp: nowTime,
      },
    ];
    onUpdateUser({...user, supportMessages: newMessages});
    setFareReviewNotes('');
    setSupportSection('write_support');
    showTemporaryToast('Fare adjustment inquiry opened with RideApp Oklahoma Payroll.');
  };

  const handleSendSupportMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportDraft.trim()) return;
    const nowTime = new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
    const newMessages: SupportChatMessage[] = [
      ...(user.supportMessages || []),
      {
        id: `sup-drv-${Date.now()}`,
        sender: 'driver',
        category: 'Written Support Inquiry',
        text: supportDraft.trim(),
        timestamp: nowTime,
      },
      {
        id: `sup-ack-${Date.now() + 1}`,
        sender: 'support',
        category: 'Written Support Inquiry',
        text: 'Received by RideApp Oklahoma Driver Support Desk. An OKC human specialist is reviewing your message — no automated bots.',
        timestamp: nowTime,
      },
    ];
    onUpdateUser({...user, supportMessages: newMessages});
    setSupportDraft('');
  };

  const handleConfirmCashOut = () => {
    if (availableBalance <= 0) {
      setShowCashOutModal(false);
      return;
    }
    const payout = availableBalance;
    onUpdateUser({
      ...user,
      cashedOutTotal: Number(((user.cashedOutTotal || 0) + payout).toFixed(2)),
    });
    setShowCashOutModal(false);
    setCashOutSuccessToast(`$${payout.toFixed(2)} sent via Instant Co-op Payout ($0 fee).`);
    window.setTimeout(() => setCashOutSuccessToast(null), 4000);
  };

  const handleRenewDocument = (docId: DriverDocument['id'], file: File | null) => {
    if (!file) return;
    const nextDocs = docs.map((d) =>
      d.id === docId
        ? {
            ...d,
            fileName: file.name,
            uploadedAt: `Renewed ${new Date().toLocaleDateString()}`,
            verified: true,
            status: 'active' as const,
            expirationDate: docId === 'ssn' ? 'Non-Expiring' : '2028-12-31',
            expiryNote:
              docId === 'ssn'
                ? 'Identity & 1099 Payout Verified'
                : 'Renewed & Verified · Active',
          }
        : d
    );
    onUpdateUser({...user, documents: nextDocs});
    if (nextDocs.every((d) => d.status !== 'expired')) {
      setShowExpiredAlertModal(false);
    }
  };

  const handleToggleDemoExpiredInsurance = () => {
    const ins = docs.find((d) => d.id === 'insurance');
    const currentlyExpired = ins?.status === 'expired';
    const nextDocs = docs.map((d) =>
      d.id === 'insurance'
        ? {
            ...d,
            status: currentlyExpired ? ('active' as const) : ('expired' as const),
            expirationDate: currentlyExpired ? '2027-04-30' : '2026-10-15',
            expiryNote: currentlyExpired
              ? '$1M Co-op TNC Coverage · Valid thru 04/30/2027'
              : 'EXPIRED 10/15/2026 — Re-upload required',
          }
        : d
    );
    const willBeExpired = !currentlyExpired;
    onUpdateUser({
      ...user,
      isOnline: willBeExpired ? false : user.isOnline,
      documents: nextDocs,
    });
    if (willBeExpired) {
      setIsOnline(false);
      setShowExpiredAlertModal(true);
    } else {
      setShowExpiredAlertModal(false);
    }
  };

  const handleDownloadTaxDoc = (
    kind: '1099' | 'mileage' | 'monthly',
    label: string
  ) => {
    const year = new Date().getFullYear();
    const totalEarnings = myCompletedRides.reduce(
      (s, r) => s + r.fare.driverPayout70 + (r.tipAmount || 0),
      0
    );
    const totalMiles = myCompletedRides.reduce((s, r) => s + r.fare.miles, 0);
    const irsDeduction = Number((totalMiles * 0.7).toFixed(2));

    if (kind === '1099') {
      const body = [
        `RIDEAPP OKLAHOMA COOPERATIVE — ${year} 1099-NEC / 1099-K TAX SUMMARY`,
        `Driver: ${user.name} (${user.email})`,
        `Vehicle: ${user.vehicle?.year || '2024'} ${user.vehicle?.make || 'Toyota'} ${user.vehicle?.model || 'Camry'} (${user.vehicle?.plate || 'OK'})`,
        `------------------------------------------------------------`,
        `Completed Oklahoma Trips: ${myCompletedRides.length}`,
        `Gross 70% Direct Driver Payouts + Tips: $${totalEarnings.toFixed(2)}`,
        `Oklahoma 5% Co-op Charity Contribution Generated: $${myCompletedRides
          .reduce((s, r) => s + r.fare.charityShare5, 0)
          .toFixed(2)}`,
        `Platform Co-op Fee Deductible: $0.00 (Already Net 70%)`,
        `Generated: ${new Date().toLocaleString()}`,
      ].join('\n');
      triggerFileDownload(`RideApp_${year}_1099_Summary.txt`, body, 'text/plain');
    } else if (kind === 'mileage') {
      const header = 'Trip ID,Date,Pickup,Dropoff,Haversine Miles,IRS Deduction ($0.70/mi)';
      const rows = myCompletedRides.map(
        (r) =>
          `"${r.id}","${r.date}","${r.pickupAddress}","${r.dropoffAddress}",${r.fare.miles.toFixed(
            2
          )},${(r.fare.miles * 0.7).toFixed(2)}`
      );
      rows.push(`"TOTAL","","","","${totalMiles.toFixed(2)}","$${irsDeduction.toFixed(2)}"`);
      triggerFileDownload(
        `RideApp_${year}_Annual_Mileage_Report.csv`,
        [header, ...rows].join('\n'),
        'text/csv'
      );
    } else {
      const header = 'Trip ID,Date,Time,Rider,Total Fare,70% Driver Net,Tip,5% OKC Charity';
      const rows = myCompletedRides.map(
        (r) =>
          `"${r.id}","${r.date}","${r.timeSlot}","${r.riderName}",${r.fare.totalFare.toFixed(
            2
          )},${r.fare.driverPayout70.toFixed(2)},${(r.tipAmount || 0).toFixed(
            2
          )},${r.fare.charityShare5.toFixed(2)}`
      );
      triggerFileDownload(
        `RideApp_${year}_Monthly_Statement.csv`,
        [header, ...rows].join('\n'),
        'text/csv'
      );
    }

    setTaxDownloadToast(`Downloaded ${label}`);
    window.setTimeout(() => setTaxDownloadToast(null), 3200);
  };

  // Slider pointer interaction handlers
  const handleSliderPointerMove = (clientX: number) => {
    if (!isDraggingSlider || !sliderTrackRef.current) return;
    const rect = sliderTrackRef.current.getBoundingClientRect();
    const usable = Math.max(1, rect.width - 56);
    const raw = (clientX - rect.left - 28) / usable;
    const clamped = Math.max(0, Math.min(1, raw));
    setSliderProgress(clamped);
  };

  const handleSliderPointerEnd = () => {
    if (!isDraggingSlider || !activeAcceptedRide) return;
    setIsDraggingSlider(false);
    if (sliderProgress >= 0.72) {
      handleAdvanceTripStage(activeAcceptedRide);
    } else {
      setSliderProgress(0);
    }
  };

  // Live Active Trip target metrics (switches Pickup -> Stop 1 -> Dropoff across stages)
  const activeTripStage: ActiveTripStage = activeAcceptedRide?.tripStage || 'en_route_pickup';
  const activeStop1Coords = activeAcceptedRide?.stop1Coords;
  const hasStop1 = Boolean(
    activeAcceptedRide?.stop1Address && activeStop1Coords
  );
  const isHeadingToStop1 =
    hasStop1 && (activeTripStage === 'arrived_pickup' || activeTripStage === 'en_route_stop1');
  const isHeadingToDropoff =
    activeTripStage === 'in_progress' || activeTripStage === 'arrived_stop1';
  const activeTargetCoords = activeAcceptedRide
    ? isHeadingToDropoff
      ? activeAcceptedRide.dropoffCoords
      : isHeadingToStop1 && activeAcceptedRide.stop1Coords
      ? activeAcceptedRide.stop1Coords
      : activeAcceptedRide.pickupCoords
    : null;
  const activeTargetAddress = activeAcceptedRide
    ? isHeadingToDropoff
      ? activeAcceptedRide.dropoffAddress
      : isHeadingToStop1 && activeAcceptedRide.stop1Address
      ? activeAcceptedRide.stop1Address
      : activeAcceptedRide.pickupAddress
    : '';
  const activeDistanceMiles = activeTargetCoords
    ? calculateHaversineMiles(liveGps, activeTargetCoords)
    : 0;
  const activeEtaMins = estimateEtaMinutes(activeDistanceMiles);
  const focusMapOn = (point: GeoPoint) => {
    setMapFocus((current) => ({point, request: (current?.request ?? 0) + 1}));
  };

  const sliderStageLabel =
    activeTripStage === 'en_route_pickup'
      ? 'SLIDE WHEN ARRIVED AT PICKUP'
      : activeTripStage === 'arrived_pickup'
      ? hasStop1
        ? 'SLIDE WHEN ARRIVED AT STOP 1'
        : 'SLIDE TO START TRIP (RIDER PICKED UP)'
      : activeTripStage === 'arrived_stop1'
      ? 'SLIDE TO CONTINUE TO DROP-OFF'
      : 'SLIDE TO COMPLETE DROP-OFF';

  const tripStageSlider = activeAcceptedRide && (
    <div className="space-y-1.5">
      <div
        ref={sliderTrackRef}
        className="relative h-12 rounded-xl border-2 border-[#DFC07D] bg-[#080808]/90 backdrop-blur-xl overflow-hidden select-none touch-none"
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#8A6D3B]/45 via-[#DFC07D]/35 to-[#FFF2CC]/45 transition-[width] duration-75"
          style={{width: `${Math.max(12, sliderProgress * 100)}%`}}
        />
        <button
          type="button"
          onClick={() => handleAdvanceTripStage(activeAcceptedRide)}
          className="absolute inset-0 flex h-full w-full items-center justify-center pl-10 text-xs font-extrabold tracking-[0.1em] text-champagne-glow cursor-pointer"
        >
          <span>{sliderStageLabel}</span>
        </button>
        <div
          role="slider"
          aria-label={sliderStageLabel}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(sliderProgress * 100)}
          tabIndex={0}
          onPointerDown={() => setIsDraggingSlider(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              handleAdvanceTripStage(activeAcceptedRide);
            }
          }}
          style={{
            transform: `translateX(calc(${sliderProgress} * (100% - 56px)))`,
          }}
          className="slider-thumb relative z-10 flex h-full w-12 items-center justify-center rounded-lg btn-gold-luxury cursor-grab active:cursor-grabbing"
        >
          <ChevronRight className="h-5 w-5 text-[#0B0B0D]" />
        </div>
      </div>
      <p className="text-center text-[10px] text-[#B89650]">
        Slide or tap to confirm
      </p>
    </div>
  );

  const driverInitials = user.name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={`bg-transparent text-[#DFC07D] ${
        activeTab === 'home'
          ? 'relative h-[calc(100dvh-64px)] min-h-[480px] overflow-hidden'
          : 'relative min-h-full pb-24'
      }`}
      onPointerMove={(e) => handleSliderPointerMove(e.clientX)}
      onPointerUp={handleSliderPointerEnd}
      onPointerCancel={handleSliderPointerEnd}
    >
      {activeTab === 'home' ? (
        <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={() => setActiveTab('earnings')}
            className="flex h-11 items-center gap-2 rounded-full border border-[#DFC07D]/90 bg-[#080808]/90 px-5 text-[#DFC07D] shadow-[0_0_22px_rgba(212,175,55,0.28)] backdrop-blur-xl"
            aria-label="Open Today's Earnings Breakdown"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#B89650]">
              Today's Earnings
            </span>
            <span className="font-mono text-sm font-extrabold tabular-nums">
              ${todayEarnings.toFixed(2)}
            </span>
          </button>
        </div>
      ) : (
      <header className="sticky top-0 z-30 bg-[#020612]/72 backdrop-blur-[10px] border-b border-[#C5A059]/30">
        <div className="max-w-3xl mx-auto grid grid-cols-3 items-center gap-2 px-3.5 sm:px-5 h-14">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-cinzel text-lg sm:text-xl font-bold tracking-[0.08em] text-champagne-glow whitespace-nowrap">
              RideApp
            </span>
          </div>

          {/* Top Center Pill: TODAY'S EARNINGS (Tapping opens Money Bag Earnings Tab) */}
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setActiveTab('earnings')}
              className="h-9 px-3.5 sm:px-4 rounded-full bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/80 hover:border-[#DFC07D] shadow-[0_0_16px_rgba(223,192,125,0.2)] flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
              aria-label="Open Today's Earnings Breakdown"
            >
              <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.1em] uppercase text-[#B89650]">
                TODAY:
              </span>
              <span className="font-mono tabular-nums text-xs sm:text-sm font-extrabold text-champagne-glow">
                ${todayEarnings.toFixed(2)}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-end gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold tracking-wider uppercase ${
                isOnline
                  ? 'border-[#DFC07D]/60 bg-[#C5A059]/12 text-[#DFC07D]'
                  : 'border-[#C5A059]/25 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650]'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </span>
          </div>
        </div>
      </header>
      )}

      <main
        className={
          activeTab === 'home'
            ? 'absolute inset-0 z-0 max-w-none overflow-hidden'
            : 'mx-auto flex max-w-3xl flex-col gap-3 px-3.5 pt-3 sm:px-5'
        }
      >
        <DarkRadarMap
          pickup={activeAcceptedRide?.pickupCoords}
          pickupLabel={activeAcceptedRide?.pickupAddress}
          stop1={activeAcceptedRide?.stop1Coords}
          stop1Label={activeAcceptedRide?.stop1Address}
          dropoff={activeAcceptedRide?.dropoffCoords}
          dropoffLabel={activeAcceptedRide?.dropoffAddress}
          driverCoords={liveGps}
          userGps={liveGps}
          activeTripStage={activeAcceptedRide ? activeTripStage : undefined}
          targetCoords={activeAcceptedRide ? activeTargetCoords : null}
          targetLabel={activeTargetAddress || undefined}
          focusCoords={mapFocus?.point}
          focusRequest={mapFocus?.request}
          gpsWatchActive={gpsWatchActive}
          overlayContainerRef={setMapOfferOverlay}
          heightClass={
            activeTab === 'home'
              ? 'h-full'
              : 'h-[300px] rounded-2xl border border-[#D4AF37]'
          }
          showRecenterButton={activeTab === 'home'}
          fullScreen={activeTab === 'home'}
        />

        {/* Subtle Success Notifications */}
        {activeTab !== 'home' && (cashOutSuccessToast || taxDownloadToast || actionToast) && (
          <div className="rounded-xl border border-[#DFC07D]/60 bg-[#C5A059]/15 px-4 py-3 text-xs font-semibold text-[#DFC07D] flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#DFC07D] shrink-0" />
              <span>{cashOutSuccessToast || taxDownloadToast || actionToast}</span>
            </span>
          </div>
        )}

        {/* Active Trip Return Banner if Driver Views Another Tab Mid-Trip */}
        {activeAcceptedRide && activeTab !== 'home' && (
          <div className="obsidian-login-card rounded-xl border-[#DFC07D] flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em] uppercase text-[#DFC07D]">
                <span className="w-2 h-2 rounded-full bg-[#DFC07D] animate-pulse" />
                <span>ACTIVE OKLAHOMA TRIP • LIVE GPS</span>
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#DFC07D] mt-0.5 truncate">
                {activeAcceptedRide.riderName} · {activeDistanceMiles.toFixed(1)} mi ({activeEtaMins} min)
              </div>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('home')}
              className="btn-gold-luxury rounded-lg text-xs tracking-wider uppercase shrink-0 cursor-pointer"
            >
              Return to Trip
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 1: HOME (CLEAN UBER-STYLE OKLAHOMA DISPATCH SCREEN)          */}
        {/* ================================================================ */}
        {activeTab === 'home' && (
          <div className="absolute bottom-3 left-3 right-3 z-30 max-h-[60%] overflow-y-auto rounded-2xl border border-[#D4AF37]/70 bg-[#080808]/90 p-3 shadow-[0_12px_42px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            <section className="mb-3 space-y-2.5 rounded-xl border border-[#D4AF37]/45 bg-black/55 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-[#DFC07D]">
                    {isOnline ? "You're online" : "You're offline"}
                  </div>
                  <div className="mt-0.5 text-[10px] text-[#B89650]">
                    {activeAcceptedRide
                      ? `${activeAcceptedRide.riderName} · ${activeTargetAddress}`
                      : 'Oklahoma City · Live phone GPS'}
                  </div>
                </div>
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                    isOnline ? 'animate-pulse bg-emerald-400' : 'bg-[#8c7770]'
                  }`}
                />
              </div>
              <button
                type="button"
                onClick={handleToggleOnline}
                aria-pressed={isOnline}
                className="btn-gold-luxury h-11 w-full rounded-xl text-xs font-extrabold tracking-[0.16em] shadow-[0_6px_20px_rgba(212,175,55,0.2)]"
              >
                {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
              </button>
              {isOnline && !activeAcceptedRide && (
                <button
                  type="button"
                  onClick={handleSpawnSampleDispatch}
                  disabled={Boolean(currentOfferRide)}
                  className="h-9 w-full rounded-lg border border-[#DFC07D]/55 bg-black/40 text-[11px] font-bold tracking-wider text-[#DFC07D] disabled:opacity-50"
                >
                  Test Instant Ride
                </button>
              )}
              {activeAcceptedRide &&
                (activeTripStage === 'arrived_pickup' ||
                  activeTripStage === 'arrived_stop1') && (
                  <div className="flex items-center justify-between rounded-lg border border-[#DFC07D]/40 bg-black/35 px-3 py-2 text-xs">
                    <span className="text-[#B89650]">RIDER WAIT</span>
                    <span className="font-mono text-sm font-extrabold text-[#DFC07D]">
                      {formatDurationMMSS(
                        Math.max(0, FREE_WAIT_LIMIT_SECONDS - waitSeconds)
                      )}
                    </span>
                  </div>
                )}
              {tripStageSlider}
            </section>

            <div className="flex flex-col gap-3">
            {/* Expired Document Blocking Alert (Compact Banner if Locked) */}
            {expiredDocs.length > 0 && (
              <div className="rounded-xl border border-amber-500/60 bg-amber-950/35 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 text-amber-200 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="truncate">
                    {expiredDocs.map((d) => d.title).join(', ')} expired — going online is locked.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="shrink-0 text-[11px] font-bold underline text-[#DFC07D] cursor-pointer"
                >
                  Fix Now
                </button>
              </div>
            )}

            {/* POST-ACCEPTANCE ACTIVE TRIP CARD (Replaces Feed/Offer when Ride Accepted) */}
            {activeAcceptedRide ? (
              <details className="space-y-2">
                <summary className="cursor-pointer rounded-lg border border-[#DFC07D]/35 bg-black/35 px-3 py-2 text-xs font-bold text-[#DFC07D]">
                  Trip details and rider tools
                </summary>
                <section
                  aria-label="Active Trip Card"
                  className="obsidian-login-card relative rounded-2xl border-2 border-[#DFC07D] p-4 sm:p-5 space-y-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.85)]"
                >
                {/* Header with Pulsing Gold Live GPS Badge & 70% Payout */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1 min-w-0">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#DFC07D]/80 bg-[#C5A059]/15 text-[10px] font-bold tracking-[0.12em] uppercase text-[#DFC07D]">
                      <span className="w-2 h-2 rounded-full bg-[#DFC07D] animate-pulse shadow-[0_0_8px_#DFC07D]" />
                      <span>LIVE PHONE GPS ACTIVE • SHARING WITH RIDER</span>
                    </div>
                    <div className="flex items-center gap-2 pt-0.5">
                      <h2 className="font-cinzel text-lg font-bold text-champagne-glow truncate">
                        {activeAcceptedRide.riderName}
                      </h2>
                      <span className="text-xs font-bold text-[#D4AF37] shrink-0">
                        {(activeAcceptedRide.riderScore || 4.95).toFixed(2)} ★
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                      70% Net Payout
                    </div>
                    <div className="font-mono tabular-nums text-xl font-extrabold text-champagne-glow">
                      ${activeAcceptedRide.fare.driverPayout70.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Live Distance / ETA Telemetry Box (Zero Paid Map APIs) */}
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-[#B89650] font-semibold">
                        {activeTripStage === 'in_progress'
                          ? hasStop1
                            ? 'Final Leg · Heading to Drop-off'
                            : 'Stage 3 · Heading to Drop-off'
                          : activeTripStage === 'arrived_stop1'
                          ? 'At Stop 1 · Ready for Final Drop-off'
                          : isHeadingToStop1
                          ? 'Pickup Complete · Next: Stop 1'
                          : activeTripStage === 'arrived_pickup'
                          ? 'Stage 2 · Waiting at Pickup'
                          : 'Stage 1 · En Route to Pickup'}
                      </div>
                      <div className="text-xs sm:text-sm font-semibold text-[#DFC07D] mt-0.5">
                        {activeTargetAddress}
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-lg font-extrabold text-champagne-glow">
                        {activeDistanceMiles.toFixed(1)} mi
                      </div>
                      <div className="font-mono text-[11px] text-[#B89650]">
                        ~{activeEtaMins} min ETA
                      </div>
                    </div>
                  </div>

                  {/* Route Legs Summary when Stop 1 is included */}
                  {hasStop1 && activeAcceptedRide.stop1Address && (
                    <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 px-2.5 py-2 text-[11px] text-[#DFC07D]">
                      <span className="font-bold text-[#D4AF37]">Route: </span>
                      {activeAcceptedRide.pickupAddress.split(',')[0]} →{' '}
                      <span className="font-semibold text-[#DFC07D]">
                        Stop 1 ({activeAcceptedRide.stop1Address.split(',')[0]})
                      </span>{' '}
                      → {activeAcceptedRide.dropoffAddress.split(',')[0]}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#C5A059]/20 text-[11px]">
                    <span className="font-mono text-[#B89650]">
                      GPS: {liveGps.lat.toFixed(4)}°N, {Math.abs(liveGps.lng).toFixed(4)}°W
                    </span>
                    <button
                      type="button"
                      onClick={() => handleSimulateGpsMovement(activeAcceptedRide)}
                      className="text-[11px] font-semibold underline text-[#DFC07D] cursor-pointer"
                    >
                      {isSimulatingApproach ? 'Moving GPS Pin...' : 'Simulate GPS Movement'}
                    </button>
                  </div>
                </div>

                {/* In-app map focus controls */}
                {activeTargetCoords && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          {id: 'driver', label: 'Driver', point: liveGps},
                          {id: 'pickup', label: 'Pickup', point: activeAcceptedRide.pickupCoords},
                          {id: 'destination', label: 'Destination', point: activeAcceptedRide.dropoffCoords},
                        ] as const
                      ).map((app) => (
                        <button
                          key={app.id}
                          type="button"
                          onClick={() => focusMapOn(app.point)}
                          className="h-8 rounded-lg border border-[#C5A059]/30 bg-[#020612]/72 text-[11px] font-semibold text-[#B89650] backdrop-blur-[10px] cursor-pointer transition-colors hover:border-[#DFC07D] hover:text-[#DFC07D]"
                        >
                          {app.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => focusMapOn(activeTargetCoords)}
                      className="w-full h-12 rounded-xl btn-gold-luxury text-xs sm:text-sm tracking-[0.14em] uppercase flex items-center justify-center gap-2 shadow-[0_0_22px_rgba(212,175,55,0.3)]"
                    >
                      <Navigation className="w-4 h-4 shrink-0" />
                      <span>
                        PRESS TO NAVIGATE ·{' '}
                        {isHeadingToDropoff
                          ? 'DROP-OFF'
                          : isHeadingToStop1
                          ? 'STOP 1'
                          : 'PICKUP'}
                      </span>
                    </button>

                    {activeStop1Coords &&
                      hasStop1 &&
                      !isHeadingToStop1 &&
                      !isHeadingToDropoff && (
                      <button
                        type="button"
                        onClick={() => focusMapOn(activeStop1Coords)}
                        className="w-full h-9 rounded-lg border border-[#C5A059]/55 bg-[#020612]/72 text-[11px] font-bold tracking-[0.12em] uppercase text-[#DFC07D] hover:border-[#DFC07D] flex items-center justify-center gap-1.5"
                      >
                        <Navigation className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>NAVIGATE TO STOP 1</span>
                      </button>
                    )}
                  </div>
                )}

                {/* 5-Minute Pickup / Stop 1 Wait Timer OR Expired Action Buttons (Right Above TEXT RIDER / CALL RIDER) */}
                {(activeTripStage === 'arrived_pickup' || activeTripStage === 'arrived_stop1') &&
                  (() => {
                    const isStop1Stage = activeTripStage === 'arrived_stop1';
                    const remainingWaitSeconds = Math.max(
                      0,
                      FREE_WAIT_LIMIT_SECONDS - waitSeconds
                    );
                    const isExtraActive = isStop1Stage
                      ? Boolean(activeAcceptedRide.stop1ExtraWaitActive)
                      : Boolean(activeAcceptedRide.pickupExtraWaitActive);
                    const extraFeeNow = computeCurrentStageExtraWaitFee(activeAcceptedRide);

                    if (remainingWaitSeconds > 0) {
                      return (
                        <div className="rounded-xl border border-[#DFC07D]/70 bg-[#C5A059]/12 px-3 py-2.5 flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-[11px] sm:text-xs font-bold tracking-[0.06em] uppercase text-[#DFC07D]">
                            <Timer className="w-4 h-4 text-[#D4AF37] shrink-0" />
                            <span>
                              <span className="font-mono text-sm font-extrabold">
                                {formatDurationMMSS(remainingWaitSeconds)}
                              </span>{' '}
                              {isStop1Stage
                                ? 'STOP LIMIT REMAINING'
                                : 'FREE WAIT REMAINING'}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleFastForwardWaitTimer(activeAcceptedRide)}
                            className="text-[11px] font-semibold underline text-[#DFC07D] hover:text-[#FFF2CC] whitespace-nowrap cursor-pointer"
                          >
                            [Fast-Forward 5:00]
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {isExtraActive && (
                          <div className="rounded-lg border border-[#DFC07D]/75 bg-[#C5A059]/18 px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-[#DFC07D]">
                            <span className="flex items-center gap-1.5">
                              <Timer className="w-3.5 h-3.5 text-[#D4AF37] animate-pulse" />
                              <span>EXTRA WAIT ACTIVE ($0.20/MIN)</span>
                            </span>
                            <span className="font-mono">+${extraFeeNow.toFixed(2)}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleActivateExtraWait(activeAcceptedRide)}
                            disabled={isExtraActive}
                            className={`h-10 px-2 rounded-xl border text-[10.5px] sm:text-[11px] font-bold tracking-wider uppercase cursor-pointer transition-colors ${
                              isExtraActive
                                ? 'border-[#DFC07D] bg-[#C5A059]/25 text-[#FFF2CC] cursor-default'
                                : 'border-[#DFC07D]/80 bg-[#020612]/72 backdrop-blur-[10px] hover:bg-[#C5A059]/18 text-[#DFC07D]'
                            }`}
                          >
                            {isStop1Stage
                              ? isExtraActive
                                ? 'WAITING (+$0.20/MIN)'
                                : 'KEEP WAITING ($0.20/MIN)'
                              : isExtraActive
                              ? 'WAITING (+$0.20/MIN)'
                              : 'WAIT EXTRA ($0.20/MIN)'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              isStop1Stage
                                ? handleEndAtStopClaim50(activeAcceptedRide)
                                : handleClaimNoShow6(activeAcceptedRide)
                            }
                            className="h-10 px-2 rounded-xl btn-gold-luxury text-[10.5px] sm:text-[11px] font-bold tracking-wider uppercase cursor-pointer"
                          >
                            {isStop1Stage
                              ? 'END AT STOP — CLAIM 50%'
                              : 'CALL & CLAIM NO-SHOW ($6)'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                {/* In-App Rider Communication: TEXT RIDER & CALL RIDER */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowChatDrawer((prev) => !prev)}
                    className="h-10 rounded-xl border border-[#DFC07D]/60 bg-[#020612]/72 backdrop-blur-[10px] hover:bg-[#C5A059]/15 text-xs font-bold tracking-wider uppercase text-[#DFC07D] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4 text-[#D4AF37]" />
                    <span>TEXT RIDER</span>
                    {activeAcceptedRide.chatMessages.length > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#C5A059]/25 text-[10px] font-mono">
                        {activeAcceptedRide.chatMessages.length}
                      </span>
                    )}
                  </button>

                  <a
                    href={`tel:${activeAcceptedRide.riderPhone.replace(/\D/g, '')}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setCallBanner(
                        `Calling ${activeAcceptedRide.riderName} via masked Oklahoma Co-op line (${activeAcceptedRide.riderPhone})...`
                      );
                      window.setTimeout(() => setCallBanner(null), 4000);
                    }}
                    className="h-10 rounded-xl border border-[#DFC07D]/60 bg-[#020612]/72 backdrop-blur-[10px] hover:bg-[#C5A059]/15 text-xs font-bold tracking-wider uppercase text-[#DFC07D] flex items-center justify-center gap-1.5 no-underline cursor-pointer"
                  >
                    <Phone className="w-4 h-4 text-[#D4AF37]" />
                    <span>CALL RIDER</span>
                  </a>
                </div>

                {callBanner && (
                  <div className="rounded-lg border border-[#DFC07D]/60 bg-[#C5A059]/15 px-3 py-2 text-xs text-[#DFC07D] flex items-center justify-between gap-2">
                    <span>{callBanner}</span>
                    <button
                      type="button"
                      onClick={() => setCallBanner(null)}
                      className="text-[#DFC07D] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Live In-App Chat Pop-Up Drawer */}
                {showChatDrawer && (
                  <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/50 p-3 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#DFC07D]">
                        In-App Rider Chat · {activeAcceptedRide.riderName}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowChatDrawer(false)}
                        className="text-xs text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                      >
                        Close
                      </button>
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                      {activeAcceptedRide.chatMessages.map((msg) => {
                        const isMe = msg.senderRole === UserRole.Driver;
                        return (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${
                                isMe
                                  ? 'bg-[#C5A059]/20 border border-[#C5A059]/45 text-[#DFC07D]'
                                  : 'bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/20 text-[#B89650]'
                              }`}
                            >
                              {msg.text}
                            </div>
                            <span className="text-[9px] text-[#B89650]/75 mt-0.5">
                              {msg.timestamp}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {["I'm outside!", '2 mins away', 'At main entrance'].map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          onClick={(e) => handleSendDriverChat(e, chip)}
                          className="px-2 py-1 rounded border border-[#C5A059]/40 bg-[#020612]/72 backdrop-blur-[10px] text-[10px] text-[#DFC07D] hover:bg-[#C5A059]/15 cursor-pointer"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    <form onSubmit={handleSendDriverChat} className="flex gap-2">
                      <input
                        type="text"
                        value={driverChatDraft}
                        onChange={(e) => setDriverChatDraft(e.target.value)}
                        placeholder="Message rider..."
                        className="flex-1 h-9 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                      />
                      <button
                        type="submit"
                        aria-label="Send message"
                        className="h-9 px-3 rounded-lg btn-gold-luxury flex items-center justify-center cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
                </section>
              </details>
            ) : (
              <details className="space-y-2">
                <summary className="cursor-pointer rounded-lg border border-[#DFC07D]/35 bg-black/35 px-3 py-2 text-xs font-bold text-[#DFC07D]">
                  Ride queue · {reservedPendingRides.length} scheduled
                </summary>
                <>
                {/* MIDDLE WORKSPACE: Dispatch Toolbar + Simulate Instant Ride */}
                <section className="obsidian-login-card rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2.5">
                    <div className="min-w-0">
                      <h1 className="font-cinzel text-base sm:text-lg font-bold text-champagne-glow">
                        Reserved Oklahoma Rides
                      </h1>
                      <p className="text-[11px] text-[#B89650] flex items-center gap-1.5 mt-0.5 truncate">
                        <Radio
                          className={`w-3 h-3 shrink-0 ${
                            gpsWatchActive ? 'text-[#DFC07D] animate-pulse' : 'text-[#B89650]/60'
                          }`}
                        />
                        <span className="truncate">
                          {gpsStatusText} · 70% Direct Net Payout
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={handleSpawnSampleDispatch}
                      className="btn-gold-luxury h-9 px-3.5 rounded-lg text-[11px] font-bold tracking-wider uppercase inline-flex items-center gap-1.5 cursor-pointer transition-transform active:scale-[0.98]"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Simulate Instant Ride</span>
                    </button>
                  </div>
                </section>

                {/* Upcoming Scheduled Reservations Feed */}
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-cinzel text-sm font-bold text-[#DFC07D] tracking-wide">
                      Upcoming Schedule ({reservedPendingRides.length})
                    </h2>
                    <span className="text-[11px] text-[#B89650]">No Algorithm Penalties</span>
                  </div>

                  {reservedPendingRides.length === 0 ? (
                    <div className="obsidian-login-card rounded-xl p-6 text-center space-y-3">
                      <p className="text-xs sm:text-sm text-[#B89650]">
                        No scheduled Oklahoma reservations in queue right now.
                      </p>
                      <button
                        type="button"
                        onClick={handleSpawnSampleDispatch}
                        className="btn-gold-luxury h-10 px-5 rounded-lg text-xs uppercase tracking-wider cursor-pointer"
                      >
                        Simulate Instant Ride
                      </button>
                    </div>
                  ) : (
                    reservedPendingRides.map((res) => {
                      const pickupDist = calculateHaversineMiles(liveGps, res.pickupCoords);
                      const pickupEta = estimateEtaMinutes(pickupDist);
                      const tripEta = estimateEtaMinutes(res.fare.miles);
                      return (
                        <div
                          key={res.id}
                          className="obsidian-login-card rounded-xl p-4 space-y-3.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-[11px] text-[#B89650]">
                                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />
                                <span>
                                  {res.date} · {res.timeSlot}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <h3 className="text-sm sm:text-base font-bold text-[#DFC07D] truncate">
                                  {res.riderName}
                                </h3>
                                <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[#D4AF37]">
                                  {(res.riderScore || 4.95).toFixed(2)} ★
                                </span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                                70% Net Payout
                              </div>
                              <div className="font-mono tabular-nums text-2xl font-extrabold text-champagne-glow">
                                ${res.fare.driverPayout70.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-3 space-y-2 text-xs">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-start gap-2 min-w-0">
                                <MapPin className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                                <span className="text-[#DFC07D]">{res.pickupAddress}</span>
                              </div>
                              <span className="font-mono text-[11px] text-[#B89650] whitespace-nowrap shrink-0">
                                {pickupDist.toFixed(1)} mi · {pickupEta}m
                              </span>
                            </div>
                            {res.stop1Address && (
                              <div className="flex items-start justify-between gap-2 pt-2 border-t border-[#C5A059]/15">
                                <div className="flex items-start gap-2 min-w-0">
                                  <Plus className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                                  <span className="text-[#DFC07D]">
                                    <strong className="text-[#D4AF37]">Stop 1:</strong>{' '}
                                    {res.stop1Address}
                                  </span>
                                </div>
                                <span className="font-mono text-[10px] font-semibold text-[#D4AF37] whitespace-nowrap shrink-0">
                                  Errand Stop
                                </span>
                              </div>
                            )}
                            <div className="flex items-start justify-between gap-2 pt-2 border-t border-[#C5A059]/15">
                              <div className="flex items-start gap-2 min-w-0">
                                <Navigation className="w-4 h-4 text-[#DFC07D] shrink-0 mt-0.5" />
                                <span className="text-[#DFC07D]">{res.dropoffAddress}</span>
                              </div>
                              <span className="font-mono text-[11px] text-[#B89650] whitespace-nowrap shrink-0">
                                {res.fare.miles.toFixed(1)} mi · {tripEta}m
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => handleDeclineRide(res)}
                              className="h-auto py-3 px-4 rounded-lg border border-[#B89650]/50 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-xs font-bold tracking-wider uppercase text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                            >
                              DECLINE
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAcceptRide(res)}
                              className="h-auto py-3 px-4 rounded-lg btn-gold-luxury text-xs tracking-wider uppercase flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                              <Navigation className="w-3.5 h-3.5" />
                              <span>START / NAVIGATE</span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </section>
                </>
              </details>
            )}
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: EARNINGS (DAILY, WEEKLY, MONTHLY, YEARLY)                 */}
        {/* ================================================================ */}
        {activeTab === 'earnings' && (
          <div className="flex flex-col gap-3">
            {/* Timeframe Filter Pills */}
            <div className="grid grid-cols-4 gap-2 p-1 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30">
              {(
                [
                  {id: 'daily', label: 'Daily'},
                  {id: 'weekly', label: 'Weekly'},
                  {id: 'monthly', label: 'Monthly'},
                  {id: 'yearly', label: 'Yearly'},
                ] as const
              ).map((pill) => {
                const active = earningsTimeframe === pill.id;
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setEarningsTimeframe(pill.id)}
                    className={`h-9 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
                      active
                        ? 'btn-gold-luxury'
                        : 'text-[#B89650] hover:text-[#DFC07D]'
                    }`}
                  >
                    {pill.label}
                  </button>
                );
              })}
            </div>

            {/* Hero Net Earnings & CASH OUT NOW Card */}
            <section className="obsidian-login-card rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[#B89650] font-semibold">
                    {earningsTimeframe} 70% Net Earnings + Tips
                  </div>
                  <div className="font-mono tabular-nums text-3xl sm:text-4xl font-extrabold text-champagne-glow mt-1">
                    ${earningsMetrics.totalEarnings.toFixed(2)}
                  </div>
                  <div className="text-xs text-[#B89650] mt-1">
                    Available for Instant Cash Out:{' '}
                    <span className="font-mono font-bold text-[#DFC07D]">
                      ${availableBalance.toFixed(2)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCashOutModal(true)}
                  className="btn-gold-luxury h-11 px-5 rounded-lg text-xs sm:text-sm tracking-[0.14em] uppercase inline-flex items-center gap-2 cursor-pointer transition-transform active:scale-[0.98]"
                >
                  <DollarSign className="w-4 h-4" />
                  <span>CASH OUT NOW</span>
                </button>
              </div>

              {/* 3 Stat Breakdown Tiles: Completed Trips | Online Hours | Tips */}
              <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-[#C5A059]/20">
                <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                    Completed Trips
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-[#DFC07D] mt-0.5">
                    {earningsMetrics.tripCount}
                  </div>
                </div>

                <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                    Online Hours
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-[#DFC07D] mt-0.5">
                    {earningsMetrics.onlineHours.toFixed(1)}h
                  </div>
                </div>

                <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                    Rider Tips
                  </div>
                  <div className="font-mono tabular-nums text-lg font-bold text-[#DFC07D] mt-0.5">
                    ${earningsMetrics.tips.toFixed(2)}
                  </div>
                </div>
              </div>
            </section>

            {/* Trip-by-Trip 70% Payout Breakdown */}
            <section className="space-y-2.5">
              <h3 className="font-cinzel text-sm sm:text-base font-bold text-[#DFC07D]">
                70% Direct Fare Payout Breakdown
              </h3>

              {earningsMetrics.trips.length === 0 ? (
                <div className="obsidian-login-card rounded-xl p-6 text-center text-xs text-[#B89650]">
                  No completed trips recorded in this timeframe yet.
                </div>
              ) : (
                earningsMetrics.trips.map((trip) => (
                  <div
                    key={trip.id}
                    className="obsidian-login-card rounded-xl p-4 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] text-[#B89650] flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-[#D4AF37]" />
                          <span>
                            {trip.date} · {trip.timeSlot} · {trip.fare.miles.toFixed(1)} mi
                          </span>
                        </div>
                        <div className="text-xs sm:text-sm font-bold text-[#DFC07D] mt-1 truncate">
                          {trip.pickupAddress.split(',')[0]}
                          {trip.stop1Address ? ` → ${trip.stop1Address.split(',')[0]}` : ''} →{' '}
                          {trip.dropoffAddress.split(',')[0]}
                        </div>
                        <div className="text-[11px] text-[#B89650] mt-0.5">
                          Rider: {trip.riderName}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="font-mono tabular-nums text-base sm:text-lg font-extrabold text-champagne-glow">
                          +$
                          {(
                            trip.fare.driverPayout70 +
                            (trip.tipAmount || 0) +
                            (trip.lostFoundFeeClaimed || 0)
                          ).toFixed(2)}
                        </div>
                        <div className="text-[10px] font-mono text-[#B89650]">
                          70% Net: ${trip.fare.driverPayout70.toFixed(2)}
                          {trip.tipAmount ? ` + $${trip.tipAmount.toFixed(2)} tip` : ''}
                        </div>
                        {(trip.lostFoundFeeClaimed || 0) > 0 && (
                          <div className="text-[10px] font-mono font-bold text-[#DFC07D]">
                            +$20.00 Lost &amp; Found Fee
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-[#C5A059]/15 text-[10px] font-mono text-[#B89650]">
                      <div>Gross Fare: ${trip.fare.totalFare.toFixed(2)}</div>
                      <div className="text-center text-[#DFC07D]">
                        Driver (70%): ${trip.fare.driverPayout70.toFixed(2)}
                      </div>
                      <div className="text-right">
                        OKC Charity (5%): ${trip.fare.charityShare5.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: PROFILE (BIO, VEHICLE, DOCUMENTS VAULT, TAX & LOG OUT)    */}
        {/* ================================================================ */}
        {activeTab === 'profile' && (
          <div className="flex flex-col gap-3">
            {/* Driver Bio Card: Large Gold-Framed Photo, Name, Rating, Tenure Badge, Vehicle Details */}
            <section className="obsidian-login-card relative rounded-xl p-5 space-y-4">
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

              <div className="flex flex-row items-start gap-3.5 sm:gap-4 text-left">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full p-[3px] bg-gradient-to-br from-[#FFF2CC] via-[#DFC07D] to-[#7A5C29] shadow-[0_0_24px_rgba(223,192,125,0.35)] shrink-0">
                  <div className="w-full h-full rounded-full bg-[#020612]/72 backdrop-blur-[10px] flex items-center justify-center overflow-hidden relative">
                    <svg viewBox="0 0 64 64" className="w-full h-full" aria-hidden="true">
                      <defs>
                        <radialGradient id="profileAvatarGlow" cx="50%" cy="30%" r="70%">
                          <stop offset="0%" stopColor="#C5A059" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#020612" stopOpacity="1" />
                        </radialGradient>
                      </defs>
                      <rect width="64" height="64" fill="url(#profileAvatarGlow)" />
                      <circle
                        cx="32"
                        cy="24"
                        r="11"
                        fill="#DFC07D"
                        fillOpacity="0.24"
                        stroke="#DFC07D"
                        strokeWidth="1.5"
                      />
                      <path
                        d="M13 56c2.5-11 10-16 19-16s16.5 5 19 16"
                        fill="#DFC07D"
                        fillOpacity="0.2"
                        stroke="#DFC07D"
                        strokeWidth="1.5"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center font-cinzel text-base sm:text-lg font-bold text-[#DFC07D] tracking-wider">
                      {driverInitials}
                    </span>
                  </div>
                </div>

                <div className="min-w-0 flex-1 text-left space-y-1.5">
                  <div className="flex items-center justify-start gap-2 flex-wrap">
                    <h2 className="font-cinzel text-lg sm:text-2xl font-bold text-champagne-glow">
                      {user.name}
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-[#DFC07D]/70 bg-[#C5A059]/15 text-xs font-bold text-[#DFC07D]">
                      <span>{(user.driverRating || 4.98).toFixed(2)}</span>
                      <Star className="w-3.5 h-3.5 fill-[#DFC07D] text-[#DFC07D]" />
                    </span>
                  </div>

                  {/* Tenure Badge */}
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[11px] font-semibold text-[#DFC07D]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                    <span>Member Since 2026 • 8 Months with RideApp</span>
                  </div>

                  <div className="text-xs text-[#B89650]">
                    {user.phone} · {user.email}
                  </div>
                </div>
              </div>

              {/* Vehicle Details Card (Left-Aligned Vehicle Make, Model, Year & Plate) */}
              <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3.5 space-y-2.5 text-left">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-[#DFC07D]">
                  <Car className="w-4 h-4 text-[#D4AF37]" />
                  <span>Registered Oklahoma Vehicle</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-left">
                  <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                      Year &amp; Make
                    </div>
                    <div className="font-bold text-[#DFC07D] mt-0.5">
                      {user.vehicle?.year || '2024'} {user.vehicle?.make || 'Toyota'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                      Model
                    </div>
                    <div className="font-bold text-[#DFC07D] mt-0.5 truncate">
                      {user.vehicle?.model || 'Camry Hybrid XSE'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                      Color
                    </div>
                    <div className="font-bold text-[#DFC07D] mt-0.5">
                      {user.vehicle?.color || 'Obsidian Black'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/55 p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                      License Plate
                    </div>
                    <div className="font-mono font-bold text-[#DFC07D] mt-0.5">
                      {user.vehicle?.plate || 'OK · CVB-405'}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Documents Vault */}
            <section className="obsidian-login-card rounded-xl p-4 sm:p-5 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-cinzel text-lg font-bold text-champagne-glow">
                    Documents Vault
                  </h2>
                  <p className="text-xs text-[#B89650] mt-0.5">
                    All 4 Oklahoma Co-op credentials must remain active to go online.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggleDemoExpiredInsurance}
                  className={`h-8 px-3 rounded-lg border text-[11px] font-bold cursor-pointer transition-colors ${
                    docs.find((d) => d.id === 'insurance')?.status === 'expired'
                      ? 'border-amber-400 bg-amber-950/40 text-amber-200'
                      : 'border-[#C5A059]/50 bg-[#020612]/72 backdrop-blur-[10px] text-[#DFC07D] hover:border-[#DFC07D]'
                  }`}
                >
                  {docs.find((d) => d.id === 'insurance')?.status === 'expired'
                    ? 'Demo: Insurance Expired (Click to Reset)'
                    : 'Demo: Simulate Expired Insurance'}
                </button>
              </div>

              <div className="space-y-3">
                {docs.map((doc) => {
                  const isExpired = doc.status === 'expired';
                  return (
                    <div
                      key={doc.id}
                      className={`rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border p-3.5 space-y-2.5 ${
                        isExpired ? 'border-amber-500/70' : 'border-[#C5A059]/30'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <FileCheck2
                              className={`w-4 h-4 shrink-0 ${
                                isExpired ? 'text-amber-400' : 'text-[#D4AF37]'
                              }`}
                            />
                            <span className="text-sm font-bold text-[#DFC07D]">
                              {doc.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                                isExpired
                                  ? 'bg-red-950/70 border-amber-500/70 text-amber-300'
                                  : 'bg-[#C5A059]/15 border-[#DFC07D]/60 text-[#DFC07D]'
                              }`}
                            >
                              {isExpired ? 'EXPIRED' : 'ACTIVE'}
                            </span>
                          </div>

                          <div className="text-[11px] text-[#B89650] mt-1">
                            File: <span className="text-[#DFC07D]">{doc.fileName || 'On File'}</span> ·
                            Expires:{' '}
                            <span
                              className={`font-mono font-semibold ${
                                isExpired ? 'text-amber-300' : 'text-[#DFC07D]'
                              }`}
                            >
                              {doc.expirationDate || 'Active'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <label className="w-full h-9 rounded-lg border border-[#DFC07D]/70 bg-[#020612]/72 backdrop-blur-[10px] hover:bg-[#C5A059]/15 text-[11px] font-bold tracking-wider uppercase text-[#DFC07D] flex items-center justify-center gap-1.5 cursor-pointer transition-colors">
                        <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>UPLOAD RENEWED DOCUMENT</span>
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          onChange={(e) =>
                            handleRenewDocument(doc.id, e.target.files?.[0] || null)
                          }
                          className="hidden"
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Tax Documents */}
            <section className="obsidian-login-card rounded-xl p-4 sm:p-5 space-y-3.5">
              <div>
                <h2 className="font-cinzel text-lg font-bold text-champagne-glow">
                  Tax Documents (1099-NEC / 1099-K)
                </h2>
                <p className="text-xs text-[#B89650] mt-0.5">
                  Download verified Oklahoma cooperative tax forms, mileage logs, and monthly statements.
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    id: '1099' as const,
                    title: 'Yearly 1099-NEC / 1099-K Tax Summary',
                    subtitle: `2026 Co-op Gross 70% Payouts · $${lifetimeNetAndTips.toFixed(2)}`,
                  },
                  {
                    id: 'mileage' as const,
                    title: 'Annual Deductible Mileage Report',
                    subtitle: `${myCompletedRides
                      .reduce((s, r) => s + r.fare.miles, 0)
                      .toFixed(1)} Verified Haversine Miles · IRS Deduction CSV`,
                  },
                  {
                    id: 'monthly' as const,
                    title: 'Monthly Tax Statements',
                    subtitle: 'Itemized 70% payout, rider tips & 5% OKC charity breakdown',
                  },
                ].map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <FileText className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-[#DFC07D]">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#B89650] truncate mt-0.5">
                          {item.subtitle}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadTaxDoc(item.id, item.title)}
                      className="btn-gold-luxury h-9 px-3 rounded-lg text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Prominent Gold-Outlined LOG OUT Button */}
            <button
              type="button"
              onClick={onLogout}
              className="w-full h-12 rounded-xl border-2 border-[#DFC07D] bg-[#020612]/72 backdrop-blur-[10px] hover:bg-[#C5A059]/15 text-sm font-bold tracking-[0.18em] uppercase text-[#DFC07D] flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <LogOut className="w-4 h-4 text-[#D4AF37]" />
              <span>LOG OUT</span>
            </button>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 4: SUPPORT (UBER-STYLE HELP & TRIP ISSUE SELECTOR)           */}
        {/* ================================================================ */}
        {activeTab === 'support' && (
          <div className="flex flex-col gap-3">
            <section className="obsidian-login-card rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  {supportSection !== 'menu' && (
                    <button
                      type="button"
                      onClick={() => setSupportSection('menu')}
                      aria-label="Back to Support Menu"
                      className="h-9 w-9 rounded-lg border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[#DFC07D] flex items-center justify-center cursor-pointer"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div>
                    <h2 className="font-cinzel text-lg sm:text-xl font-bold text-champagne-glow">
                      Driver Support &amp; Dispute Center
                    </h2>
                    <p className="text-xs text-[#B89650]">
                      Oklahoma Co-op Contractor Protection · Zero Auto-Deactivation
                    </p>
                  </div>
                </div>
              </div>

              {/* Select a Past Ride Dropdown + Tap List */}
              <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3.5 space-y-2.5">
                <label
                  htmlFor="support-ride-dropdown"
                  className="block text-[11px] font-bold uppercase tracking-[0.14em] text-[#DFC07D]"
                >
                  Select a Past Ride
                </label>

                {driverTripsForSupport.length === 0 ? (
                  <p className="text-xs text-[#B89650]">
                    No Oklahoma rides recorded yet — complete or accept a ride to attach a trip issue.
                  </p>
                ) : (
                  <>
                    <select
                      id="support-ride-dropdown"
                      value={activeSupportTrip?.id || ''}
                      onChange={(e) => setSelectedSupportTripId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/60 text-xs font-semibold text-[#DFC07D] focus:outline-none focus:border-[#DFC07D]"
                    >
                      {driverTripsForSupport.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.date} · {t.riderName} · {t.pickupAddress.split(',')[0]} →{' '}
                          {t.dropoffAddress.split(',')[0]} (${t.fare.driverPayout70.toFixed(2)} Net)
                        </option>
                      ))}
                    </select>

                    {/* Quick Tap Ride Cards (top 3 recent rides) */}
                    <div className="space-y-1.5 pt-1">
                      {driverTripsForSupport.slice(0, 3).map((trip) => {
                        const isSelected = activeSupportTrip?.id === trip.id;
                        return (
                          <button
                            key={trip.id}
                            type="button"
                            onClick={() => setSelectedSupportTripId(trip.id)}
                            className={`w-full rounded-lg border px-3 py-2 text-left flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                              isSelected
                                ? 'border-[#DFC07D] bg-[#C5A059]/15'
                                : 'border-[#C5A059]/25 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#C5A059]/60'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-[#DFC07D] truncate">
                                {trip.date} · {trip.riderName}
                              </div>
                              <div className="text-[11px] text-[#B89650] truncate">
                                {trip.pickupAddress.split(',')[0]} → {trip.dropoffAddress.split(',')[0]}
                              </div>
                            </div>
                            <span className="font-mono text-xs font-bold text-[#DFC07D] shrink-0">
                              ${trip.fare.driverPayout70.toFixed(2)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Support Category Hub Menu */}
              {supportSection === 'menu' && (
                <div className="space-y-3">
                  {/* 1. Issues with Fares / Missing Fare Adjustment */}
                  <button
                    type="button"
                    onClick={() => {
                      setTripIssueMode('fare');
                      setSupportSection('fare_trip');
                    }}
                    className="w-full rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 hover:border-[#DFC07D] p-3.5 text-left space-y-1 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-xs sm:text-sm font-bold text-[#DFC07D]">
                          1. Issues with Fares / Missing Fare Adjustment
                        </span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#B89650] shrink-0" />
                    </div>
                    <p className="text-[11px] text-[#B89650]">
                      Review mileage, pickup/stop wait time ($0.20/min), or missing stop fees for the selected ride.
                    </p>
                  </button>

                  {/* 2. Problems with a Ride / Rider Safety & Disrespect Report + Anti-Deactivation Inbox */}
                  <button
                    type="button"
                    onClick={() => setSupportSection('reports')}
                    className={`w-full rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border p-3.5 text-left space-y-1.5 cursor-pointer transition-colors ${
                      openComplaintsCount > 0
                        ? 'border-[#DFC07D] bg-[#C5A059]/10'
                        : 'border-[#C5A059]/45 hover:border-[#DFC07D]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Scale className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-xs sm:text-sm font-bold text-[#DFC07D]">
                          2. Problems with a Ride / Rider Safety &amp; Disrespect Report
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-extrabold shrink-0 ${
                          openComplaintsCount > 0
                            ? 'bg-[#DFC07D] text-[#0B0B0D]'
                            : 'border border-[#C5A059]/50 text-[#DFC07D]'
                        }`}
                      >
                        {openComplaintsCount > 0
                          ? `${openComplaintsCount} Open`
                          : 'Contractor Protection'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#B89650] leading-snug">
                      Submit a rider safety/disrespect incident OR view &amp; respond to rider complaints directly without unfair deactivation.
                    </p>
                  </button>

                  {/* 3. Lost & Found ($20 Return Fee) */}
                  <button
                    type="button"
                    onClick={() => setSupportSection('lost_found')}
                    className="w-full rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/70 hover:bg-[#C5A059]/10 p-3.5 text-left space-y-1 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <PackageCheck className="w-4 h-4 text-[#D4AF37]" />
                        <span className="text-xs sm:text-sm font-bold text-[#DFC07D]">
                          3. Lost &amp; Found ($20 Return Fee)
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-[#C5A059]/20 text-[10px] font-mono font-bold text-[#DFC07D] shrink-0">
                        +$20 EARNINGS
                      </span>
                    </div>
                    <p className="text-[11px] text-[#B89650]">
                      Report a found item from the selected ride and claim the $20.00 return fee charged to the rider.
                    </p>
                  </button>
                </div>
              )}

              {/* Section 1: Fare Review & Missing Adjustment */}
              {supportSection === 'fare_trip' && (
                <form onSubmit={handleSubmitFareReview} className="space-y-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3.5">
                  <div className="text-xs font-bold text-[#DFC07D]">
                    Fare Adjustment Request · {activeSupportTrip?.riderName || 'General Inquiry'}
                  </div>
                  {activeSupportTrip && (
                    <div className="text-[11px] text-[#B89650] rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/25 px-3 py-2">
                      {activeSupportTrip.date} · {activeSupportTrip.pickupAddress.split(',')[0]} →{' '}
                      {activeSupportTrip.dropoffAddress.split(',')[0]} ·{' '}
                      <span className="font-mono text-[#DFC07D]">
                        {activeSupportTrip.fare.miles.toFixed(1)} mi (${activeSupportTrip.fare.driverPayout70.toFixed(2)} Net)
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-[#B89650] mb-1">
                      Describe Mileage, Wait Time, or Stop Fee Issue
                    </label>
                    <textarea
                      rows={3}
                      value={fareReviewNotes}
                      onChange={(e) => setFareReviewNotes(e.target.value)}
                      placeholder="Explain detour mileage, highway construction, Stop 1 duration, or wait-time adjustment..."
                      className="w-full p-2.5 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-10 rounded-lg btn-gold-luxury text-xs uppercase tracking-wider cursor-pointer"
                  >
                    Submit Fare Adjustment
                  </button>
                </form>
              )}

              {/* Section 2: Problems with a Ride / Rider Safety & Disrespect + Anti-Deactivation Complaints */}
              {supportSection === 'reports' && (
                <div className="space-y-4">
                  {/* Submit Post-Trip Passenger Safety / Disrespect Report */}
                  <form
                    onSubmit={handleSubmitSupportPassengerIssue}
                    className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 p-3.5 space-y-3"
                  >
                    <div className="text-xs font-bold text-[#DFC07D]">
                      Report Rider Safety or Disrespect ({activeSupportTrip?.riderName || 'Selected Ride'})
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {[
                        'Disrespectful Behavior',
                        'Safety Threat',
                        'Refused to Exit',
                        'Property Damage',
                      ].map((tag) => {
                        const active = supportPassengerTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setSupportPassengerTags((prev) =>
                                prev.includes(tag)
                                  ? prev.filter((t) => t !== tag)
                                  : [...prev, tag]
                              )
                            }
                            className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer ${
                              active
                                ? 'border-[#DFC07D] bg-[#C5A059]/25 text-[#DFC07D]'
                                : 'border-[#C5A059]/35 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D]'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>

                    <textarea
                      rows={3}
                      value={supportPassengerNotes}
                      onChange={(e) => setSupportPassengerNotes(e.target.value)}
                      placeholder="Describe the passenger safety or disrespect incident for our Oklahoma Co-op Safety Panel..."
                      className="w-full p-2.5 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                    />

                    <button
                      type="submit"
                      className="w-full h-10 rounded-lg btn-gold-luxury text-xs uppercase tracking-wider cursor-pointer"
                    >
                      Submit Rider Safety / Disrespect Report
                    </button>
                  </form>

                  {/* Rider Complaints Inbox & Contractor Dispute Resolution */}
                  <div className="space-y-2.5">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#C5A059]/60 bg-[#C5A059]/10 text-[10px] font-bold tracking-[0.12em] uppercase text-[#DFC07D]">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>ANTI-DEACTIVATION GUARANTEE • DUAL REVIEW</span>
                    </div>

                    {riderComplaintsOnDriver.length === 0 ? (
                      <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/30 p-4 text-center space-y-2.5">
                        <p className="text-xs text-[#B89650]">
                          Zero open rider complaints on your Oklahoma Co-op record.
                        </p>
                        <button
                          type="button"
                          onClick={handleSimulateRiderComplaint}
                          className="h-9 px-3.5 rounded-lg border border-[#C5A059]/60 bg-[#020612]/72 backdrop-blur-[10px] text-xs font-semibold text-[#DFC07D] cursor-pointer"
                        >
                          Simulate Rider Complaint for Demo
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {riderComplaintsOnDriver.map(({reservation, report}) => {
                          const isResponded =
                            report.status !== 'Queued for Co-op Human Safety Panel';
                          const isRespondingHere = respondingReportId === report.id;
                          return (
                            <div
                              key={report.id}
                              className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 p-3.5 space-y-2.5"
                            >
                              <div>
                                <span
                                  className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                                    isResponded
                                      ? 'border-[#DFC07D]/60 bg-[#C5A059]/15 text-[#DFC07D]'
                                      : 'border-amber-500/70 bg-amber-950/50 text-amber-300'
                                  }`}
                                >
                                  {isResponded
                                    ? report.status
                                    : 'Action Needed • Dual Review Active'}
                                </span>
                                <h3 className="text-sm font-bold text-[#DFC07D] mt-1.5">
                                  {report.category}
                                </h3>
                                <div className="text-[11px] text-[#B89650]">
                                  Trip {reservation.date} · {reservation.riderName} · Sent{' '}
                                  {report.submittedAt}
                                </div>
                              </div>

                              <p className="text-xs text-[#DFC07D]/90 leading-relaxed rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/20 p-2.5">
                                &ldquo;{report.details}&rdquo;
                              </p>

                              {report.driverResponse ? (
                                <div className="rounded-lg bg-[#C5A059]/10 border border-[#DFC07D]/45 p-3 space-y-1 text-xs">
                                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#DFC07D]">
                                    Your Contractor Statement ({report.respondedAt})
                                  </div>
                                  <p className="text-[#DFC07D]/90">{report.driverResponse}</p>
                                  {report.driverEvidenceNote && (
                                    <p className="text-[11px] text-[#B89650]">
                                      Dashcam / Notes: {report.driverEvidenceNote}
                                    </p>
                                  )}
                                  {report.driverAttachmentName && (
                                    <p className="text-[11px] text-[#DFC07D] flex items-center gap-1">
                                      <Paperclip className="w-3 h-3" />
                                      <span>{report.driverAttachmentName}</span>
                                    </p>
                                  )}
                                  {report.resolutionOffer && (
                                    <p className="text-[11px] font-semibold text-[#D4AF37]">
                                      Resolution: {report.resolutionOffer}
                                    </p>
                                  )}
                                </div>
                              ) : isRespondingHere ? (
                                <div className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/60 p-3 space-y-2.5">
                                  <div className="text-[11px] font-bold text-[#DFC07D]">
                                    Submit Contractor Statement &amp; Resolution
                                  </div>

                                  <textarea
                                    rows={3}
                                    value={disputeStoryDraft}
                                    onChange={(e) => setDisputeStoryDraft(e.target.value)}
                                    placeholder="Share your side of the trip (curb location, wait timer, passenger communication)..."
                                    className="w-full p-2.5 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                                  />

                                  <input
                                    type="text"
                                    value={disputeEvidenceNote}
                                    onChange={(e) => setDisputeEvidenceNote(e.target.value)}
                                    placeholder="Dashcam timestamp / trip GPS notes (optional)"
                                    className="w-full h-9 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                                  />

                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <label className="h-8 px-2.5 rounded border border-[#C5A059]/50 bg-[#020612]/72 backdrop-blur-[10px] text-[11px] font-semibold text-[#DFC07D] inline-flex items-center gap-1.5 cursor-pointer">
                                      <Paperclip className="w-3 h-3 text-[#D4AF37]" />
                                      <span>
                                        {disputeAttachmentName || 'Attach Dashcam / Log'}
                                      </span>
                                      <input
                                        type="file"
                                        accept="video/*,image/*,.pdf,.txt"
                                        onChange={(e) =>
                                          setDisputeAttachmentName(
                                            e.target.files?.[0]?.name || null
                                          )
                                        }
                                        className="hidden"
                                      />
                                    </label>

                                    <select
                                      value={disputeResolutionOffer}
                                      onChange={(e) => setDisputeResolutionOffer(e.target.value)}
                                      className="h-8 px-2 rounded border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] text-[11px] text-[#DFC07D] focus:outline-none"
                                    >
                                      <option value="Dashcam & GPS Verification Attached">
                                        Dashcam &amp; GPS Verification
                                      </option>
                                      <option value="Direct Written Clarification to Rider">
                                        Written Clarification
                                      </option>
                                      <option value="Offer Courtesy Wait-Time Waiver">
                                        Courtesy Wait Waiver
                                      </option>
                                    </select>
                                  </div>

                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setRespondingReportId(null)}
                                      className="h-9 rounded-lg border border-[#B89650]/50 bg-[#020612]/72 backdrop-blur-[10px] text-xs font-bold text-[#B89650] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSubmitDisputeResponse(reservation, report.id)
                                      }
                                      className="h-9 rounded-lg btn-gold-luxury text-xs uppercase tracking-wider cursor-pointer"
                                    >
                                      Submit Statement
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRespondingReportId(report.id);
                                    setDisputeStoryDraft('');
                                    setDisputeEvidenceNote('');
                                    setDisputeAttachmentName(null);
                                  }}
                                  className="w-full h-10 rounded-lg btn-gold-luxury text-xs tracking-[0.12em] uppercase cursor-pointer"
                                >
                                  Respond &amp; Resolve Issue
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Section 3: Lost & Found ($20 Return Fee) */}
              {supportSection === 'lost_found' && (
                <form onSubmit={handleClaimLostFoundFee} className="space-y-3 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/40 p-3.5">
                  <div className="rounded-lg bg-[#C5A059]/10 border border-[#DFC07D]/45 p-3 text-xs text-[#DFC07D]">
                    Confirm an item found from{' '}
                    <strong>{activeSupportTrip?.riderName || 'the selected ride'}</strong> to charge
                    the rider <strong>$20.00</strong> and credit <strong>+$20.00</strong> directly
                    into your earnings balance.
                  </div>

                  <div>
                    <label
                      htmlFor="lf-item-desc"
                      className="block text-xs font-semibold text-[#B89650] mb-1"
                    >
                      Found Item Description
                    </label>
                    <input
                      id="lf-item-desc"
                      type="text"
                      value={lostFoundItemDesc}
                      onChange={(e) => setLostFoundItemDesc(e.target.value)}
                      placeholder="e.g., Black iPhone 15 Pro, brown leather wallet, house keys..."
                      className="w-full h-10 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full h-11 rounded-xl btn-gold-luxury text-xs sm:text-sm tracking-[0.06em] uppercase cursor-pointer"
                  >
                    Confirm Item Returned — Claim $20 Fee
                  </button>
                </form>
              )}

              {/* Section 4: Written Support Ticket Thread */}
              {supportSection === 'write_support' && (
                <div className="space-y-3">
                  <div className="max-h-56 overflow-y-auto space-y-2 rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35 p-3">
                    {(user.supportMessages || []).length === 0 ? (
                      <p className="text-xs text-[#B89650] text-center py-4">
                        Start a written support ticket with RideApp Oklahoma Co-op Desk.
                      </p>
                    ) : (
                      (user.supportMessages || []).map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            msg.sender === 'driver' ? 'items-end' : 'items-start'
                          }`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
                              msg.sender === 'driver'
                                ? 'bg-[#C5A059]/20 border border-[#DFC07D]/45 text-[#DFC07D]'
                                : 'bg-[#141418] border border-[#C5A059]/25 text-[#B89650]'
                            }`}
                          >
                            {msg.text}
                          </div>
                          <span className="text-[9px] text-[#B89650]/75 mt-0.5">
                            {msg.sender === 'driver' ? 'You' : 'OKC Support'} · {msg.timestamp}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleSendSupportMessage} className="flex gap-2">
                    <input
                      type="text"
                      value={supportDraft}
                      onChange={(e) => setSupportDraft(e.target.value)}
                      placeholder="Write to Co-op Support..."
                      className="flex-1 h-10 px-3 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                    />
                    <button
                      type="submit"
                      aria-label="Send written support message"
                      className="h-10 px-4 rounded-lg btn-gold-luxury flex items-center justify-center cursor-pointer"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {supportCallBanner && (
                <div className="rounded-lg border border-[#DFC07D]/60 bg-[#C5A059]/15 px-3 py-2 text-xs text-[#DFC07D] flex items-center justify-between gap-2">
                  <span>{supportCallBanner}</span>
                  <button
                    type="button"
                    onClick={() => setSupportCallBanner(null)}
                    className="text-[#DFC07D] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Direct Contact Buttons at Bottom */}
              <div className="pt-3 border-t border-[#C5A059]/25 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSupportSection('write_support')}
                  className="h-11 rounded-xl btn-gold-luxury text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Message Support (In Writing)</span>
                </button>

                <a
                  href="tel:+14055550199"
                  onClick={() => {
                    setSupportCallBanner(
                      'Dialing RideApp Oklahoma 24/7 Driver Support: (405) 555-0199...'
                    );
                    window.setTimeout(() => setSupportCallBanner(null), 4500);
                  }}
                  className="h-11 rounded-xl btn-gold-luxury text-xs font-bold tracking-wide flex items-center justify-center gap-1.5 no-underline cursor-pointer"
                >
                  <Phone className="w-4 h-4" />
                  <span>Call Support</span>
                </a>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* ================================================================== */}
      {/* 5-SECOND INSTANT RIDE OFFER OVERLAY ON THE MAP */}
      {/* ================================================================== */}
      {currentOfferRide && !activeAcceptedRide && mapOfferOverlay && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label="5-Second Instant Ride Offer"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/35 p-3 pointer-events-auto"
        >
          <div className="w-full max-w-lg max-h-full overflow-y-auto rounded-2xl border-2 border-[#DFC07D] bg-[#080808]/95 shadow-[0_12px_42px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            {/* Live 5-Second Shrinking Gold Countdown Bar */}
            <div className="h-2.5 w-full bg-[#020612]/72 backdrop-blur-[10px] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#8A6D3B] via-[#DFC07D] to-[#FFF2CC] shadow-[0_0_12px_rgba(223,192,125,0.85)] transition-all duration-1000 ease-linear"
                style={{
                  width: `${Math.max(0, (offerSecondsLeft / OFFER_DURATION_SECONDS) * 100)}%`,
                }}
              />
            </div>

            <div className="p-4 sm:p-5 space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-[#DFC07D]/70 bg-[#C5A059]/15 text-[10px] font-bold tracking-[0.14em] uppercase text-[#DFC07D]">
                    <Sparkles className="w-3 h-3" />
                    <span>INSTANT OKLAHOMA RIDE · {offerSecondsLeft}s TO ACCEPT</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-sm font-bold text-[#DFC07D]">
                      {currentOfferRide.riderName}
                    </span>
                    <span className="text-xs font-bold text-[#D4AF37]">
                      {(currentOfferRide.riderScore || 4.95).toFixed(2)} ★
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-[#DFC07D]/75 bg-[#020612]/72 backdrop-blur-[10px] font-mono text-xs font-extrabold text-[#DFC07D]">
                    <Timer className="w-3 h-3 text-[#D4AF37]" />
                    <span>{offerSecondsLeft}s</span>
                  </div>
                  <div className="font-mono tabular-nums text-3xl font-extrabold text-champagne-glow leading-none mt-1">
                    ${currentOfferRide.fare.driverPayout70.toFixed(2)}
                  </div>
                  <div className="text-[10px] font-semibold text-[#B89650] mt-0.5">
                    70% Net Payout
                  </div>
                </div>
              </div>

              {/* Pickup & Drop-off Distance/ETA */}
              {(() => {
                const pickupMiles = calculateHaversineMiles(
                  liveGps,
                  currentOfferRide.pickupCoords
                );
                const pickupEta = estimateEtaMinutes(pickupMiles);
                const tripEta = estimateEtaMinutes(currentOfferRide.fare.miles);
                return (
                  <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/35 p-3 space-y-2 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <MapPin className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                            Pickup · Instant Dispatch
                          </div>
                          <div className="text-[#DFC07D] font-medium">
                            {currentOfferRide.pickupAddress}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-[#DFC07D] whitespace-nowrap shrink-0">
                        {pickupMiles.toFixed(1)} mi · {pickupEta} min
                      </span>
                    </div>

                    {currentOfferRide.stop1Address && currentOfferRide.stop1Coords && (
                      <div className="flex items-start justify-between gap-2 pt-2 border-t border-[#C5A059]/20">
                        <div className="flex items-start gap-2 min-w-0">
                          <Plus className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-wider text-[#D4AF37] font-bold">
                              Stop 1 (Round Trip / Errand)
                            </div>
                            <div className="text-[#DFC07D] font-medium">
                              {currentOfferRide.stop1Address}
                            </div>
                          </div>
                        </div>
                        <span className="font-mono text-[11px] font-bold text-[#DFC07D] whitespace-nowrap shrink-0">
                          {calculateHaversineMiles(
                            currentOfferRide.pickupCoords,
                            currentOfferRide.stop1Coords
                          ).toFixed(1)}{' '}
                          mi
                        </span>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2 pt-2 border-t border-[#C5A059]/20">
                      <div className="flex items-start gap-2 min-w-0">
                        <Navigation className="w-4 h-4 text-[#DFC07D] shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-[#B89650]">
                            Final Drop-off
                          </div>
                          <div className="text-[#DFC07D] font-medium">
                            {currentOfferRide.dropoffAddress}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono text-[11px] font-bold text-[#DFC07D] whitespace-nowrap shrink-0">
                        {currentOfferRide.fare.miles.toFixed(1)} mi · {tripEta} min
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Side-by-Side DECLINE and ACCEPT RIDE */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleDeclineRide(currentOfferRide)}
                  className="h-12 rounded-xl border border-[#B89650]/65 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#DFC07D] text-xs sm:text-sm font-bold tracking-[0.14em] uppercase text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                >
                  DECLINE
                </button>
                <button
                  type="button"
                  onClick={() => handleAcceptRide(currentOfferRide)}
                  className="h-12 rounded-xl btn-gold-luxury text-xs sm:text-sm tracking-[0.14em] uppercase cursor-pointer"
                >
                  ACCEPT RIDE
                </button>
              </div>
            </div>
          </div>
        </div>,
        mapOfferOverlay
      )}

      {/* ================================================================== */}
      {/* EXPIRED DOCUMENT BLOCKING ALERT POP-UP MODAL                       */}
      {/* ================================================================== */}
      {showExpiredAlertModal && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#02050E]/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md obsidian-login-card rounded-2xl border-2 border-amber-500/80 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/70 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-amber-300">
                  COMPLIANCE HOLD • CANNOT GO ONLINE
                </div>
                <h2 className="font-cinzel text-lg font-bold text-[#DFC07D] mt-0.5">
                  Expired Credential Detected
                </h2>
              </div>
            </div>

            <p className="text-xs text-[#DFC07D]/90 leading-relaxed">
              Oklahoma Co-op safety rules require all 4 credentials to be active before receiving ride reservations. Please re-upload your expired document(s):
            </p>

            <div className="space-y-2">
              {expiredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-amber-500/60 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-amber-200">{doc.title}</div>
                    <div className="text-[10px] text-amber-400 font-mono">
                      EXPIRED · {doc.expirationDate}
                    </div>
                  </div>
                  <label className="btn-gold-luxury h-8 px-2.5 rounded text-[10px] uppercase tracking-wider inline-flex items-center gap-1 shrink-0 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>Upload</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) =>
                        handleRenewDocument(doc.id, e.target.files?.[0] || null)
                      }
                      className="hidden"
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setShowExpiredAlertModal(false)}
                className="h-10 rounded-lg border border-[#B89650]/50 bg-[#020612]/72 backdrop-blur-[10px] text-xs font-bold text-[#B89650] cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowExpiredAlertModal(false);
                  setActiveTab('profile');
                }}
                className="h-10 rounded-lg btn-gold-luxury text-xs uppercase tracking-wider inline-flex items-center justify-center gap-1 cursor-pointer"
              >
                <span>Open Vault</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 1. RATE RIDER (1-5 ★) + PASSENGER SAFETY REPORT POP-UP MODAL       */}
      {/* ================================================================== */}
      {ratingModalRide && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#02050E]/75 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div className="w-full max-w-md obsidian-login-card rounded-2xl border-2 border-[#DFC07D] p-5 space-y-3.5 text-center max-h-[90vh] overflow-y-auto">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-[#C5A059]/60 bg-[#C5A059]/15 text-[10px] font-bold tracking-[0.14em] uppercase text-[#DFC07D]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>TRIP COMPLETED • PAYOUT ADDED</span>
            </div>

            <div>
              <div className="font-mono text-3xl font-extrabold text-champagne-glow">
                +${ratingModalRide.fare.driverPayout70.toFixed(2)}
              </div>
              <p className="text-xs text-[#B89650] mt-1">
                70% direct driver payout added to your RideApp balance.
              </p>
            </div>

            <div className="pt-2 border-t border-[#C5A059]/25 space-y-2.5">
              <h3 className="font-cinzel text-base font-bold text-[#DFC07D]">
                Rate Rider: {ratingModalRide.riderName}
              </h3>

              <div className="flex items-center justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => {
                      setSelectedRiderStars(star);
                      if (star <= 3) setShowPassengerReportBox(true);
                    }}
                    aria-label={`Rate ${star} stars`}
                    className="p-1.5 cursor-pointer transition-transform active:scale-95"
                  >
                    <Star
                      className={`w-8 h-8 ${
                        star <= selectedRiderStars
                          ? 'fill-[#DFC07D] text-[#DFC07D] drop-shadow-[0_0_8px_rgba(223,192,125,0.5)]'
                          : 'text-[#B89650]/40'
                      }`}
                    />
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap justify-center gap-1.5 pt-0.5">
                {['Ready on Time', 'Respectful', 'Great Conversation'].map((tag) => {
                  const active = riderCompliments.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setRiderCompliments((prev) =>
                          prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                        )
                      }
                      className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold cursor-pointer ${
                        active
                          ? 'border-[#DFC07D] bg-[#C5A059]/20 text-[#DFC07D]'
                          : 'border-[#C5A059]/35 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650]'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>

              {/* Report Passenger Issue Toggle */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowPassengerReportBox((prev) => !prev)}
                  className="text-xs font-bold text-[#DFC07D] underline underline-offset-2 inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>
                    {showPassengerReportBox
                      ? 'Hide Passenger Safety Report'
                      : 'Report Passenger Issue'}
                  </span>
                </button>
              </div>

              {/* Expandable Passenger Safety Report Box */}
              {(showPassengerReportBox || selectedRiderStars <= 3) && (
                <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#DFC07D]/60 p-3.5 text-left space-y-2.5">
                  <div className="text-[10px] font-bold tracking-[0.14em] uppercase text-[#DFC07D]">
                    Passenger Safety &amp; Incident Report
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Disrespectful Behavior',
                      'Safety Threat',
                      'Refused to Exit',
                      'Property Damage',
                    ].map((tag) => {
                      const active = passengerIncidentTags.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setPassengerIncidentTags((prev) =>
                              prev.includes(tag)
                                ? prev.filter((t) => t !== tag)
                                : [...prev, tag]
                            )
                          }
                          className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold cursor-pointer transition-colors ${
                            active
                              ? 'border-[#DFC07D] bg-[#C5A059]/25 text-[#DFC07D]'
                              : 'border-[#C5A059]/35 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:text-[#DFC07D]'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  <div>
                    <label htmlFor="passenger-incident-notes" className="sr-only">
                      Written incident report notes
                    </label>
                    <textarea
                      id="passenger-incident-notes"
                      rows={3}
                      value={passengerIncidentNotes}
                      onChange={(e) => setPassengerIncidentNotes(e.target.value)}
                      placeholder="Describe what happened for our Oklahoma Co-op Human Safety Panel..."
                      className="w-full p-2.5 rounded-lg bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/45 text-xs text-[#DFC07D] placeholder:text-[#B89650]/65 focus:outline-none focus:border-[#DFC07D]"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleSubmitRiderRating}
              className="w-full h-11 rounded-xl btn-gold-luxury text-xs sm:text-sm tracking-[0.14em] uppercase cursor-pointer"
            >
              {(showPassengerReportBox || selectedRiderStars <= 3) &&
              (passengerIncidentTags.length > 0 || passengerIncidentNotes.trim())
                ? `SUBMIT ${selectedRiderStars}★ RATING & SAFETY REPORT`
                : `SUBMIT ${selectedRiderStars}★ RATING`}
            </button>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 4-TAB UBER-STYLE MATTE-BLACK & GOLD BOTTOM NAVIGATION BAR          */}
      {/* ================================================================== */}
      <nav
        aria-label="Driver Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#020612]/72 backdrop-blur-[10px] border-t border-[#C5A059]/35 grid grid-cols-4 items-center px-1 sm:px-2"
      >
        {/* Tab 1: Home */}
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          className={`relative h-12 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            activeTab === 'home'
              ? 'text-champagne-glow'
              : 'text-[#B89650]/75 hover:text-[#DFC07D]'
          }`}
        >
          {activeTab === 'home' && (
            <span
              aria-hidden="true"
              className="absolute top-0 w-9 h-[2px] bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
            />
          )}
          <Home className="w-5 h-5 text-[#D4AF37]" />
          <span className="text-[10.5px] font-bold tracking-wide">Home</span>
        </button>

        {/* Tab 2: Earnings (Fancy Gold Money Bag Icon) */}
        <button
          type="button"
          onClick={() => setActiveTab('earnings')}
          className={`relative h-12 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            activeTab === 'earnings'
              ? 'text-champagne-glow'
              : 'text-[#B89650]/75 hover:text-[#DFC07D]'
          }`}
        >
          {activeTab === 'earnings' && (
            <span
              aria-hidden="true"
              className="absolute top-0 w-9 h-[2px] bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
            />
          )}
          <MoneyBagGoldIcon
            active={activeTab === 'earnings'}
            className="w-5 h-5 text-[#D4AF37]"
          />
          <span className="text-[10.5px] font-bold tracking-wide">Earnings</span>
        </button>

        {/* Tab 3: Profile (Gold Driver Avatar / ID Icon) */}
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`relative h-12 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            activeTab === 'profile'
              ? 'text-champagne-glow'
              : 'text-[#B89650]/75 hover:text-[#DFC07D]'
          }`}
        >
          {activeTab === 'profile' && (
            <span
              aria-hidden="true"
              className="absolute top-0 w-9 h-[2px] bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
            />
          )}
          <UserCheck className="w-5 h-5 text-[#D4AF37]" />
          <span className="text-[10.5px] font-bold tracking-wide">Profile</span>
          {expiredDocs.length > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-[24%] w-2 h-2 rounded-full bg-amber-400"
            />
          )}
        </button>

        {/* Tab 4: Support (Gold Headset / Shield Icon) */}
        <button
          type="button"
          onClick={() => handleOpenSupportTab('menu')}
          className={`relative h-12 flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-colors ${
            activeTab === 'support'
              ? 'text-champagne-glow'
              : 'text-[#B89650]/75 hover:text-[#DFC07D]'
          }`}
        >
          {activeTab === 'support' && (
            <span
              aria-hidden="true"
              className="absolute top-0 w-9 h-[2px] bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
            />
          )}
          <Headphones className="w-5 h-5 text-[#D4AF37]" />
          <span className="text-[10.5px] font-bold tracking-wide">Support</span>
          {openComplaintsCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-1.5 right-[24%] w-2 h-2 rounded-full bg-[#DFC07D] shadow-[0_0_6px_#DFC07D]"
            />
          )}
        </button>
      </nav>
    </div>
  );
};
