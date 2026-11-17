import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Headphones, Home, LogOut, MapPin, Phone, UserRound, Wallet} from 'lucide-react';
import {
  ActiveTripStage,
  ChatMessage,
  GeoPoint,
  RideReservation,
  RideStatus,
  UserAccount,
  UserRole,
} from '../types/rideapp';
import {OKLAHOMA_LANDMARKS, calculateCoopFare} from '../utils/oklahomaGeo';
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

const OKC_CENTER: GeoPoint = {lat: 35.4676, lng: -97.5164};
const OFFER_DELAY_MS = 4000;
const FREE_WAIT_SECONDS = 5 * 60;

function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function createDriverMessage(user: UserAccount, text: string): ChatMessage {
  return {
    id: `driver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderRole: UserRole.Driver,
    senderName: user.name,
    text,
    timestamp: new Date().toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}),
  };
}

function createDemoRide(): RideReservation {
  const pickup = OKLAHOMA_LANDMARKS[0];
  const dropoff = OKLAHOMA_LANDMARKS[3];
  const now = new Date();
  return {
    id: `res-driver-offer-${Date.now()}`,
    riderId: 'usr-rider-demo',
    riderName: 'Maya Thornton',
    riderPhone: '(405) 555-0142',
    riderScore: 4.96,
    pickupAddress: pickup.address,
    pickupCoords: {lat: pickup.lat, lng: pickup.lng},
    dropoffAddress: dropoff.address,
    dropoffCoords: {lat: dropoff.lat, lng: dropoff.lng},
    date: now.toISOString().slice(0, 10),
    timeSlot: 'Instant Pickup',
    scheduledTimestamp: now.getTime(),
    status: RideStatus.Pending,
    bookingMode: 'instant',
    driverQueueIndex: 0,
    fare: calculateCoopFare(
      {lat: pickup.lat, lng: pickup.lng},
      {lat: dropoff.lat, lng: dropoff.lng}
    ),
    declinedByDriverIds: [],
    chatMessages: [],
    safetyReports: [],
    createdAt: now.toISOString(),
  };
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
  const [isOnline, setIsOnline] = useState(user.isOnline ?? false);
  const [gpsPosition, setGpsPosition] = useState<GeoPoint>(OKC_CENTER);
  const [offerReady, setOfferReady] = useState(false);
  const [expiredDocsMessage, setExpiredDocsMessage] = useState('');
  const [clockTick, setClockTick] = useState(Date.now());
  const audioContextRef = useRef<AudioContext | null>(null);
  const ringtoneIntervalRef = useRef<number | null>(null);
  const actionSwipeStartRef = useRef<number | null>(null);
  const skipClickRef = useRef(false);
  const reservationsRef = useRef(reservations);
  const createSampleDispatchRef = useRef(onCreateSampleDispatch);
  reservationsRef.current = reservations;
  createSampleDispatchRef.current = onCreateSampleDispatch;

  const activeRide = useMemo(
    () =>
      reservations.find(
        (ride) => ride.driverId === user.id && ride.status === RideStatus.Accepted
      ) ?? null,
    [reservations, user.id]
  );
  const activeStage: ActiveTripStage = activeRide?.tripStage ?? 'en_route_pickup';
  const expiredDocuments = (user.documents ?? []).filter(
    (document) => document.status === 'expired'
  );
  const todayEarnings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return reservations
      .filter(
        (ride) =>
          ride.driverId === user.id &&
          ride.status === RideStatus.Completed &&
          (ride.completedTimestamp ?? ride.scheduledTimestamp) >= today.getTime()
      )
      .reduce(
        (total, ride) =>
          total +
          ride.fare.driverPayout70 +
          (ride.tipAmount ?? 0) +
          (ride.lostFoundFeeClaimed ?? 0),
        0
      );
  }, [reservations, user.id]);
  const completedRides = useMemo(
    () =>
      reservations
        .filter((ride) => ride.driverId === user.id && ride.status === RideStatus.Completed)
        .sort(
          (left, right) =>
            (right.completedTimestamp ?? right.scheduledTimestamp) -
            (left.completedTimestamp ?? left.scheduledTimestamp)
        ),
    [reservations, user.id]
  );
  const incomingOffer = useMemo(() => {
    if (!isOnline || !offerReady || activeRide) return null;
    return (
      reservations.find(
        (ride) =>
          ride.status === RideStatus.Pending &&
          ride.bookingMode === 'instant' &&
          !ride.driverId &&
          !ride.declinedByDriverIds.includes(user.id)
      ) ?? null
    );
  }, [isOnline, offerReady, activeRide, reservations, user.id]);
  const targetCoords =
    activeStage === 'en_route_pickup'
      ? activeRide?.pickupCoords
      : activeStage === 'en_route_stop1'
      ? activeRide?.stop1Coords
      : activeStage === 'in_progress'
      ? activeRide?.dropoffCoords
      : null;
  const targetLabel =
    activeStage === 'en_route_pickup'
      ? activeRide?.pickupAddress
      : activeStage === 'en_route_stop1'
      ? activeRide?.stop1Address
      : activeRide?.dropoffAddress;
  const gpsWatchActive = isOnline || Boolean(activeRide);
  const waitAnchor =
    activeStage === 'arrived_stop1'
      ? activeRide?.arrivedAtStop1Timestamp
      : activeStage === 'arrived_pickup'
      ? activeRide?.arrivedAtPickupTimestamp
      : undefined;
  const remainingWaitSeconds = waitAnchor
    ? Math.max(0, FREE_WAIT_SECONDS - Math.floor((clockTick - waitAnchor) / 1000))
    : FREE_WAIT_SECONDS;
  const activeTripPayout = activeRide?.fare.driverPayout70 ?? 0;

  useEffect(() => {
    setIsOnline(user.isOnline ?? false);
  }, [user.isOnline]);

  useEffect(() => {
    if (!isOnline || activeRide) {
      setOfferReady(false);
      return;
    }
    setOfferReady(false);
    const timeout = window.setTimeout(() => {
      const hasEligibleOffer = reservationsRef.current.some(
        (ride) =>
          ride.status === RideStatus.Pending &&
          ride.bookingMode === 'instant' &&
          !ride.driverId &&
          !ride.declinedByDriverIds.includes(user.id)
      );
      if (!hasEligibleOffer) createSampleDispatchRef.current(createDemoRide());
      setOfferReady(true);
    }, OFFER_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [isOnline, activeRide?.id, user.id]);

  useEffect(() => {
    if (!incomingOffer || !audioContextRef.current) return;
    const context = audioContextRef.current;
    const ring = () => {
      if (context.state !== 'running') return;
      const startAt = context.currentTime;
      [0, 0.25, 0.55, 0.8].forEach((offset, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = startAt + offset;
        oscillator.type = 'sine';
        oscillator.frequency.value = index % 2 === 0 ? 880 : 660;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.15, start + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + 0.21);
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
  }, [incomingOffer?.id]);

  useEffect(() => {
    if (activeStage !== 'arrived_pickup' && activeStage !== 'arrived_stop1') return;
    const interval = window.setInterval(() => setClockTick(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeStage]);

  useEffect(
    () => () => {
      if (ringtoneIntervalRef.current !== null) {
        window.clearInterval(ringtoneIntervalRef.current);
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close().catch((error: unknown) => {
          console.error('Unable to close incoming ride audio:', error);
        });
      }
    },
    []
  );

  useEffect(() => {
    if (!expiredDocuments.length || !isOnline) return;
    setIsOnline(false);
    onUpdateUser({...user, isOnline: false});
    setExpiredDocsMessage('Online driving is paused until your expired documents are renewed.');
  }, [expiredDocuments.length, isOnline]);

  const handleGpsPosition = (position: GeoPoint) => {
    if (!Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return;
    setGpsPosition(position);
    if (
      activeRide &&
      (Math.abs((activeRide.driverCoords?.lat ?? 0) - position.lat) > 0.00005 ||
        Math.abs((activeRide.driverCoords?.lng ?? 0) - position.lng) > 0.00005)
    ) {
      onUpdateReservation({...activeRide, driverCoords: position});
    }
  };

  const prepareRingtone = () => {
    if (!('AudioContext' in window)) return;
    try {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new window.AudioContext();
      }
      void audioContextRef.current.resume().catch((error: unknown) => {
        console.error('Unable to prepare incoming ride audio:', error);
      });
    } catch (error) {
      console.error('Unable to create incoming ride audio:', error);
    }
  };

  const handleToggleOnline = () => {
    if (!isOnline && expiredDocuments.length > 0) {
      setExpiredDocsMessage('Renew expired driver documents before going online.');
      setActiveTab('profile');
      return;
    }
    const nextOnlineStatus = !isOnline;
    if (nextOnlineStatus) prepareRingtone();
    setExpiredDocsMessage('');
    setIsOnline(nextOnlineStatus);
    onUpdateUser({...user, isOnline: nextOnlineStatus});
  };

  const handleDeclineRide = () => {
    if (!incomingOffer) return;
    onUpdateReservation({
      ...incomingOffer,
      declinedByDriverIds: incomingOffer.declinedByDriverIds.includes(user.id)
        ? incomingOffer.declinedByDriverIds
        : [...incomingOffer.declinedByDriverIds, user.id],
      driverQueueIndex: (incomingOffer.driverQueueIndex ?? 0) + 1,
    });
  };

  const handleAcceptRide = () => {
    if (!incomingOffer) return;
    const vehicle = user.vehicle
      ? `${user.vehicle.year} ${user.vehicle.make} ${user.vehicle.model} · ${user.vehicle.plate}`
      : 'Co-op vehicle';
    const updatedRide: RideReservation = {
      ...incomingOffer,
      status: RideStatus.Accepted,
      tripStage: 'en_route_pickup',
      driverId: user.id,
      driverName: user.name,
      driverPhone: user.phone,
      driverVehicle: vehicle,
      driverCoords: gpsPosition,
      chatMessages: [
        ...incomingOffer.chatMessages,
        createDriverMessage(user, `I accepted your ride and am heading to ${incomingOffer.pickupAddress}.`),
      ],
    };
    onUpdateReservation(updatedRide);
    setActiveTab('home');
  };

  const handleAdvanceTrip = () => {
    if (!activeRide) return;
    let updatedRide: RideReservation;
    if (activeStage === 'en_route_pickup') {
      updatedRide = {
        ...activeRide,
        tripStage: 'arrived_pickup',
        arrivedAtPickupTimestamp: Date.now(),
        driverCoords: activeRide.pickupCoords,
        chatMessages: [
          ...activeRide.chatMessages,
          createDriverMessage(user, `I have arrived at your pickup location (${activeRide.pickupAddress}).`),
        ],
      };
    } else if (activeStage === 'arrived_pickup' && activeRide.stop1Coords) {
      updatedRide = {
        ...activeRide,
        tripStage: 'en_route_stop1',
        tripStartedTimestamp: activeRide.tripStartedTimestamp ?? Date.now(),
        driverCoords: activeRide.pickupCoords,
        chatMessages: [
          ...activeRide.chatMessages,
          createDriverMessage(user, 'Rider picked up. Heading to the next stop.'),
        ],
      };
    } else if (activeStage === 'arrived_pickup') {
      updatedRide = {
        ...activeRide,
        tripStage: 'in_progress',
        tripStartedTimestamp: activeRide.tripStartedTimestamp ?? Date.now(),
        driverCoords: activeRide.pickupCoords,
        chatMessages: [
          ...activeRide.chatMessages,
          createDriverMessage(user, 'Rider picked up. Heading to the drop-off.'),
        ],
      };
    } else if (activeStage === 'en_route_stop1' && activeRide.stop1Coords) {
      updatedRide = {
        ...activeRide,
        tripStage: 'arrived_stop1',
        arrivedAtStop1Timestamp: Date.now(),
        driverCoords: activeRide.stop1Coords,
        chatMessages: [
          ...activeRide.chatMessages,
          createDriverMessage(user, `I have arrived at Stop 1 (${activeRide.stop1Address}).`),
        ],
      };
    } else if (activeStage === 'arrived_stop1') {
      updatedRide = {
        ...activeRide,
        tripStage: 'in_progress',
        tripStartedTimestamp: activeRide.tripStartedTimestamp ?? Date.now(),
        driverCoords: activeRide.stop1Coords ?? activeRide.pickupCoords,
        chatMessages: [
          ...activeRide.chatMessages,
          createDriverMessage(user, 'Continuing to the drop-off.'),
        ],
      };
    } else if (activeStage === 'in_progress') {
      updatedRide = {
        ...activeRide,
        status: RideStatus.Completed,
        tripStage: 'completed',
        completedTimestamp: Date.now(),
        durationMinutes: activeRide.tripStartedTimestamp
          ? Math.max(1, Math.round((Date.now() - activeRide.tripStartedTimestamp) / 60_000))
          : undefined,
        driverCoords: activeRide.dropoffCoords,
        chatMessages: [
          ...activeRide.chatMessages,
          createDriverMessage(user, 'Trip complete. Thank you for riding with RideApp.'),
        ],
      };
    } else {
      return;
    }
    onUpdateReservation(updatedRide);
  };

  const actionLabel =
    activeStage === 'en_route_pickup'
      ? 'Slide / Tap Arrived at Pickup'
      : activeStage === 'arrived_pickup'
      ? activeRide?.stop1Coords
        ? 'Rider Picked Up · Continue to Stop'
        : 'Rider Picked Up'
      : activeStage === 'en_route_stop1'
      ? 'Slide / Tap Arrived at Stop'
      : activeStage === 'arrived_stop1'
      ? 'Continue to Drop-Off'
      : 'Complete Drop-Off';

  const runTripAction = () => handleAdvanceTrip();
  const handleTripActionPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (actionSwipeStartRef.current === null) return;
    const swiped = event.clientX - actionSwipeStartRef.current > 70;
    actionSwipeStartRef.current = null;
    if (!swiped) return;
    skipClickRef.current = true;
    runTripAction();
    window.setTimeout(() => {
      skipClickRef.current = false;
    }, 0);
  };
  const handleTripActionClick = () => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    runTripAction();
  };

  const renderTabs = () => (
    <nav
      aria-label="Driver navigation"
      className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-4 border-t border-[#C5A059]/35 bg-[#020612]/95 px-1 backdrop-blur-xl"
    >
      {([
        {id: 'home', label: 'Home', Icon: Home},
        {id: 'earnings', label: 'Earnings', Icon: Wallet},
        {id: 'profile', label: 'Profile', Icon: UserRound},
        {id: 'support', label: 'Support', Icon: Headphones},
      ] as const).map(({id, label, Icon}) => (
        <button
          key={id}
          type="button"
          onClick={() => setActiveTab(id)}
          aria-current={activeTab === id ? 'page' : undefined}
          className={`relative flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold ${
            activeTab === id ? 'text-[#DFC07D]' : 'text-[#B89650]/75'
          }`}
        >
          {activeTab === id && (
            <span className="absolute top-0 h-0.5 w-9 bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]" />
          )}
          <Icon className="h-5 w-5 text-[#D4AF37]" />
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="relative h-full min-h-[480px] w-full overflow-hidden bg-transparent text-[#DFC07D]">
      {activeTab === 'home' ? (
        <>
          <DarkRadarMap
            driverCoords={gpsPosition}
            targetCoords={targetCoords}
            targetLabel={targetLabel}
            activeTripStage={activeRide ? activeStage : undefined}
            gpsWatchActive={gpsWatchActive}
            onPositionChange={handleGpsPosition}
          />

          {!activeRide && (
            <button
              type="button"
              onClick={() => setActiveTab('earnings')}
              aria-label={`Today's earnings $${todayEarnings.toFixed(2)}`}
              className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-[#DFC07D]/90 bg-[#080808]/95 px-5 py-2.5 font-mono text-sm font-extrabold tabular-nums text-[#DFC07D] shadow-[0_0_22px_rgba(212,175,55,0.28)] backdrop-blur-xl"
            >
              ${todayEarnings.toFixed(2)}
            </button>
          )}

          {!activeRide && (
            <div className="absolute bottom-[4.75rem] left-3 right-3 z-20">
              {expiredDocsMessage && (
                <p role="alert" className="mb-2 rounded-lg bg-[#0B0B0D]/95 px-3 py-2 text-center text-xs text-amber-200">
                  {expiredDocsMessage}
                </p>
              )}
              <button
                type="button"
                onClick={handleToggleOnline}
                aria-pressed={isOnline}
                className="btn-gold-luxury w-full rounded-xl text-sm font-extrabold tracking-[0.16em]"
              >
                {isOnline ? 'GO OFFLINE' : 'GO ONLINE'}
              </button>
            </div>
          )}

          {activeRide && (
            <div className="absolute bottom-[4.75rem] left-3 right-3 z-20 rounded-2xl border border-[#DFC07D]/80 bg-[#080808]/95 p-3 shadow-[0_12px_42px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              {(activeStage === 'arrived_pickup' || activeStage === 'arrived_stop1') && (
                <div className="mb-2 flex items-center justify-between rounded-lg border border-[#DFC07D]/45 bg-black/45 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#B89650]">
                    {activeStage === 'arrived_stop1' ? 'Stop Wait' : 'Pickup Wait'}
                  </span>
                  <span className="font-mono text-lg font-extrabold tabular-nums text-[#DFC07D]">
                    {formatDuration(remainingWaitSeconds)}
                  </span>
                </div>
              )}
              <button
                type="button"
                onPointerDown={(event) => {
                  actionSwipeStartRef.current = event.clientX;
                }}
                onPointerUp={handleTripActionPointerUp}
                onPointerCancel={() => {
                  actionSwipeStartRef.current = null;
                }}
                onClick={handleTripActionClick}
                className="btn-gold-luxury flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-3 text-center text-xs font-extrabold tracking-wide"
              >
                <span aria-hidden="true">➜</span>
                {actionLabel}
              </button>
              <div className="mt-2 text-center text-[10px] text-[#B89650]">
                {activeRide.riderName} · ${activeTripPayout.toFixed(2)} driver payout
              </div>
            </div>
          )}

          {incomingOffer && !activeRide && (
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Incoming ride offer"
              className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
            >
              <section className="w-full max-w-sm rounded-2xl border-2 border-[#DFC07D] bg-[#080808]/[0.97] p-5 text-[#DFC07D] shadow-[0_12px_42px_rgba(0,0,0,0.85)] backdrop-blur-xl">
                <div className="text-center text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#B89650]">
                  Incoming Ride Offer
                </div>
                <div className="mt-2 text-center font-mono text-3xl font-extrabold tabular-nums text-[#DFC07D]">
                  ${incomingOffer.fare.driverPayout70.toFixed(2)}
                </div>
                <div className="mt-4 space-y-3 rounded-xl border border-[#C5A059]/35 bg-black/45 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#D4AF37]" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#B89650]">Pickup</div>
                      <div>{incomingOffer.pickupAddress}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 border-t border-[#C5A059]/25 pt-3">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#DFC07D]" />
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-[#B89650]">Drop-off</div>
                      <div>{incomingOffer.dropoffAddress}</div>
                    </div>
                  </div>
                  <div className="border-t border-[#C5A059]/25 pt-3 text-[#B89650]">
                    {incomingOffer.riderName} · {incomingOffer.fare.miles.toFixed(1)} mi
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleDeclineRide}
                    className="h-12 rounded-xl border border-[#B89650]/70 text-xs font-bold tracking-wider text-[#B89650]"
                  >
                    DECLINE
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptRide}
                    className="btn-gold-luxury h-12 rounded-xl text-xs font-extrabold tracking-wider"
                  >
                    ACCEPT RIDE
                  </button>
                </div>
              </section>
            </div>
          )}
        </>
      ) : (
        <main className="absolute inset-0 z-10 overflow-y-auto bg-[#070707]/95 px-4 pb-20 pt-6">
          {activeTab === 'earnings' && (
            <section className="mx-auto max-w-md space-y-4">
              <h1 className="text-center text-xl font-bold">Earnings</h1>
              <div className="rounded-2xl border border-[#C5A059]/45 bg-[#0B0B0D] p-5 text-center">
                <div className="text-xs uppercase tracking-wider text-[#B89650]">Today</div>
                <div className="mt-1 font-mono text-4xl font-extrabold tabular-nums">
                  ${todayEarnings.toFixed(2)}
                </div>
              </div>
              <h2 className="text-sm font-bold text-[#B89650]">Completed trips</h2>
              {completedRides.length ? (
                completedRides.map((ride) => (
                  <article key={ride.id} className="rounded-xl border border-[#C5A059]/30 bg-[#0B0B0D] p-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate">{ride.riderName}</span>
                      <span className="font-mono font-bold">${ride.fare.driverPayout70.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-xs text-[#B89650]">
                      {ride.pickupAddress} → {ride.dropoffAddress}
                    </div>
                  </article>
                ))
              ) : (
                <p className="rounded-xl border border-[#C5A059]/30 bg-[#0B0B0D] p-4 text-center text-sm text-[#B89650]">
                  Your completed trips will appear here.
                </p>
              )}
            </section>
          )}

          {activeTab === 'profile' && (
            <section className="mx-auto max-w-md space-y-4">
              <h1 className="text-center text-xl font-bold">Driver Profile</h1>
              <div className="space-y-3 rounded-2xl border border-[#C5A059]/40 bg-[#0B0B0D] p-4">
                <div className="text-lg font-bold">{user.name}</div>
                <div className="text-sm text-[#B89650]">{user.phone}</div>
                <div className="text-sm text-[#B89650]">{user.email}</div>
                {user.vehicle && (
                  <div className="border-t border-[#C5A059]/25 pt-3 text-sm">
                    {user.vehicle.year} {user.vehicle.make} {user.vehicle.model}
                  </div>
                )}
                <div className="border-t border-[#C5A059]/25 pt-3 text-xs text-[#B89650]">
                  {expiredDocuments.length
                    ? `${expiredDocuments.length} expired document${expiredDocuments.length === 1 ? '' : 's'}`
                    : 'Driver documents are up to date'}
                </div>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#C5A059]/45 text-sm font-semibold text-[#DFC07D]"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </section>
          )}

          {activeTab === 'support' && (
            <section className="mx-auto max-w-md space-y-4">
              <h1 className="text-center text-xl font-bold">Driver Support</h1>
              <p className="rounded-2xl border border-[#C5A059]/40 bg-[#0B0B0D] p-4 text-sm leading-relaxed text-[#B89650]">
                Contact the RideApp Oklahoma support team for help with a trip, your account, or driver documents.
              </p>
              <a
                href="tel:+14055550199"
                className="btn-gold-luxury flex h-12 items-center justify-center gap-2 rounded-xl text-sm font-bold no-underline"
              >
                <Phone className="h-4 w-4" />
                Call Driver Support
              </a>
            </section>
          )}
        </main>
      )}
      {!activeRide && renderTabs()}
    </div>
  );
};
