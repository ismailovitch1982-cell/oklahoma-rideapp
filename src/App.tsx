import {useEffect, useMemo, useState} from 'react';
import {AuthScreen} from './components/AuthScreen';
import {BusinessDashboard} from './components/BusinessDashboard';
import {DriverDashboard} from './components/DriverDashboard';
import {OfflineIndicator} from './components/PWAWidgets';
import {RiderDashboard} from './components/RiderDashboard';
import {loadAppState, saveAppState} from './store/storage';
import {
  AppState,
  BusinessPerk,
  RideReservation,
  UserAccount,
  UserRole,
} from './types/rideapp';

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadAppState());

  // Persist every update to localStorage
  useEffect(() => {
    saveAppState(appState);
  }, [appState]);

  // Sync across multiple browser tabs if Rider & Driver are tested side-by-side
  useEffect(() => {
    const handleStorageSync = (e: StorageEvent) => {
      if (e.key === 'rideapp_oklahoma_coop_v1') {
        const fresh = loadAppState();
        setAppState((prev) => ({
          ...fresh,
          currentUserId: prev.currentUserId,
        }));
      }
    };
    window.addEventListener('storage', handleStorageSync);
    return () => window.removeEventListener('storage', handleStorageSync);
  }, []);

  const currentUser = useMemo(() => {
    const found = appState.accounts.find((a) => a.id === appState.currentUserId) || null;
    if (found?.role === UserRole.Driver && found.driverApprovalStatus === 'pending') {
      return null;
    }
    return found;
  }, [appState.accounts, appState.currentUserId]);

  const availableDrivers = useMemo(
    () =>
      appState.accounts.filter(
        (a) => a.role === UserRole.Driver && a.driverApprovalStatus !== 'pending'
      ),
    [appState.accounts]
  );

  const handleAuthenticated = (account: UserAccount) => {
    if (account.role === UserRole.Driver && account.driverApprovalStatus === 'pending') {
      return;
    }
    setAppState((prev) => ({
      ...prev,
      currentUserId: account.id,
    }));
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleRegisterAccount = (newAccount: UserAccount) => {
    setAppState((prev) => ({
      ...prev,
      accounts: [newAccount, ...prev.accounts],
      currentUserId: newAccount.id,
    }));
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleSavePendingDriver = (pendingDriver: UserAccount) => {
    setAppState((prev) => ({
      ...prev,
      accounts: [
        pendingDriver,
        ...prev.accounts.filter((a) => a.id !== pendingDriver.id),
      ],
      currentUserId: null,
    }));
  };

  const handleApproveDriver = (driverId: string) => {
    setAppState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acc) =>
        acc.id === driverId ? {...acc, driverApprovalStatus: 'approved'} : acc
      ),
      currentUserId: driverId,
    }));
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleLogout = () => {
    setAppState((prev) => ({
      ...prev,
      currentUserId: null,
    }));
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const handleUpdateUser = (updated: UserAccount) => {
    setAppState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((acc) => (acc.id === updated.id ? updated : acc)),
    }));
  };

  const handleCreateReservation = (reservation: RideReservation) => {
    setAppState((prev) => ({
      ...prev,
      reservations: [reservation, ...prev.reservations],
    }));
  };

  const handleUpdateReservation = (updated: RideReservation) => {
    setAppState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) => (r.id === updated.id ? updated : r)),
    }));
  };

  const handleClaimPerk = (perkId: string) => {
    setAppState((prev) => ({
      ...prev,
      perks: prev.perks.map((p) =>
        p.id === perkId ? {...p, claimsCount: p.claimsCount + 1} : p
      ),
    }));
  };

  const handleAddPerk = (perk: BusinessPerk) => {
    setAppState((prev) => ({
      ...prev,
      perks: [perk, ...prev.perks],
    }));
  };

  const handleTogglePerk = (perkId: string) => {
    setAppState((prev) => ({
      ...prev,
      perks: prev.perks.map((p) =>
        p.id === perkId ? {...p, active: !p.active} : p
      ),
    }));
  };

  const handleDeletePerk = (perkId: string) => {
    setAppState((prev) => ({
      ...prev,
      perks: prev.perks.filter((p) => p.id !== perkId),
    }));
  };

  return (
    <div className="min-h-screen w-full bg-[#050507] flex items-center justify-center">
      {/* Locked Mobile Phone Screen Container (max-width: 400px; max-height: 820px) */}
      <div className="phone-screen-shell sm:rounded-[28px] sm:border sm:border-[#C5A059]/30 sm:shadow-[0_24px_80px_rgba(0,0,0,0.95)] text-[#DFC07D]">
        {/* Crisp Samsung Galaxy S7 Curved Wave Background (#02050E Base + Two Sharp Cyan-Blue Diagonal S-Wave Ribbons) */}
        <div
          aria-hidden="true"
          className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-[#02050E]"
        >
          <svg
            viewBox="0 0 400 820"
            preserveAspectRatio="xMidYMid slice"
            className="w-full h-full"
          >
            <defs>
              {/* Ribbon 1: Deep Royal Blue fading swiftly into #02050E */}
              <linearGradient id="s7RibbonOneFill" x1="12%" y1="78%" x2="88%" y2="28%">
                <stop offset="0%" stopColor="#02050E" stopOpacity="0" />
                <stop offset="35%" stopColor="#0A2463" stopOpacity="0.88" />
                <stop offset="72%" stopColor="#124090" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#02050E" stopOpacity="0.95" />
              </linearGradient>

              {/* Ribbon 2: Lower Overlapping Fold */}
              <linearGradient id="s7RibbonTwoFill" x1="5%" y1="92%" x2="92%" y2="42%">
                <stop offset="0%" stopColor="#02050E" stopOpacity="0.95" />
                <stop offset="45%" stopColor="#0A2463" stopOpacity="0.85" />
                <stop offset="82%" stopColor="#1B559F" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#02050E" stopOpacity="0.98" />
              </linearGradient>

              {/* Sharp Electric-Cyan Wave Edge Gradient */}
              <linearGradient id="s7CyanEdge" x1="0%" y1="100%" x2="100%" y2="10%">
                <stop offset="0%" stopColor="#0A2463" stopOpacity="0" />
                <stop offset="28%" stopColor="#2E8BC0" stopOpacity="0.9" />
                <stop offset="62%" stopColor="#00A8E8" stopOpacity="1" />
                <stop offset="88%" stopColor="#2E8BC0" stopOpacity="0.7" />
                <stop offset="100%" stopColor="#02050E" stopOpacity="0" />
              </linearGradient>

              <linearGradient id="s7CyanEdgeSoft" x1="0%" y1="100%" x2="100%" y2="20%">
                <stop offset="0%" stopColor="#02050E" stopOpacity="0" />
                <stop offset="35%" stopColor="#2E8BC0" stopOpacity="0.65" />
                <stop offset="68%" stopColor="#00A8E8" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#02050E" stopOpacity="0" />
              </linearGradient>

              <filter id="s7SharpGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
            </defs>

            {/* 70%+ Deep Midnight Black-Blue Base (#02050E) */}
            <rect width="400" height="820" fill="#02050E" />

            {/* Subtle Diagonal Midnight Depth Underlay */}
            <ellipse
              cx="230"
              cy="460"
              rx="230"
              ry="160"
              transform="rotate(-38 230 460)"
              fill="#0A2463"
              opacity="0.28"
              filter="url(#s7SharpGlow)"
            />

            {/* S-Wave Ribbon 1: Bottom-Left to Upper-Right Sweeping S-Curve */}
            <path
              d="M -40 735 C 65 650, 125 560, 210 430 C 275 330, 325 225, 435 140 L 435 335 C 330 410, 265 485, 185 595 C 110 695, 45 775, -40 835 Z"
              fill="url(#s7RibbonOneFill)"
            />
            {/* Glowing Cyan Halo on Ribbon 1 Edge */}
            <path
              d="M -40 735 C 65 650, 125 560, 210 430 C 275 330, 325 225, 435 140"
              fill="none"
              stroke="url(#s7CyanEdge)"
              strokeWidth="12"
              filter="url(#s7SharpGlow)"
              opacity="0.82"
            />
            {/* Razor-Sharp Electric-Cyan Edge (#00A8E8 / #2E8BC0) */}
            <path
              d="M -40 735 C 65 650, 125 560, 210 430 C 275 330, 325 225, 435 140"
              fill="none"
              stroke="url(#s7CyanEdge)"
              strokeWidth="2.4"
            />

            {/* S-Wave Ribbon 2: Secondary Intersecting Diagonal S-Wave */}
            <path
              d="M -35 845 C 80 770, 170 675, 245 555 C 310 450, 355 375, 435 310 L 435 520 C 340 585, 275 660, 190 765 C 125 845, 45 870, -35 880 Z"
              fill="url(#s7RibbonTwoFill)"
            />
            {/* Glowing Cyan Halo on Ribbon 2 Edge */}
            <path
              d="M -35 845 C 80 770, 170 675, 245 555 C 310 450, 355 375, 435 310"
              fill="none"
              stroke="url(#s7CyanEdgeSoft)"
              strokeWidth="10"
              filter="url(#s7SharpGlow)"
              opacity="0.78"
            />
            {/* Razor-Sharp Electric-Cyan Edge 2 */}
            <path
              d="M -35 845 C 80 770, 170 675, 245 555 C 310 450, 355 375, 435 310"
              fill="none"
              stroke="url(#s7CyanEdgeSoft)"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Scrollable Phone Viewport Content */}
        <div className="relative z-10 h-full w-full phone-scroll-area">
          <OfflineIndicator />

          {!currentUser ? (
            <AuthScreen
              accounts={appState.accounts}
              onAuthenticated={handleAuthenticated}
              onRegisterAccount={handleRegisterAccount}
              onSavePendingDriver={handleSavePendingDriver}
              onApproveDriver={handleApproveDriver}
            />
          ) : currentUser.role === UserRole.Rider ? (
            <RiderDashboard
              user={currentUser}
              reservations={appState.reservations}
              perks={appState.perks}
              availableDrivers={availableDrivers}
              onUpdateUser={handleUpdateUser}
              onCreateReservation={handleCreateReservation}
              onUpdateReservation={handleUpdateReservation}
              onClaimPerk={handleClaimPerk}
              onLogout={handleLogout}
            />
          ) : currentUser.role === UserRole.Driver ? (
            <DriverDashboard
              user={currentUser}
              reservations={appState.reservations}
              onUpdateUser={handleUpdateUser}
              onUpdateReservation={handleUpdateReservation}
              onCreateSampleDispatch={handleCreateReservation}
              onLogout={handleLogout}
            />
          ) : (
            <BusinessDashboard
              user={currentUser}
              perks={appState.perks}
              onUpdateUser={handleUpdateUser}
              onAddPerk={handleAddPerk}
              onTogglePerk={handleTogglePerk}
              onDeletePerk={handleDeletePerk}
              onLogout={handleLogout}
            />
          )}
        </div>
      </div>
    </div>
  );
}
