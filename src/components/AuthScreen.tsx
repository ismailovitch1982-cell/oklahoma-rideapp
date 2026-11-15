import React, {useState} from 'react';
import {
  CarFront,
  CheckCircle2,
  Eye,
  EyeOff,
  Hourglass,
  Lock,
  Mail,
  Phone,
  Upload,
  User,
} from 'lucide-react';
import luxurySedanHero from '../assets/images/rideapp_luxury_sedan_hero_1794562744436.jpg';
import {DriverDocument, PaymentMethodType, UserAccount, UserRole} from '../types/rideapp';

interface AuthScreenProps {
  accounts: UserAccount[];
  onAuthenticated: (account: UserAccount) => void;
  onRegisterAccount: (newAccount: UserAccount) => void;
  onSavePendingDriver: (pendingDriver: UserAccount) => void;
  onApproveDriver: (driverId: string) => void;
}

type DriverDocKey = 'license' | 'insurance' | 'registration' | 'ssn';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  accounts,
  onAuthenticated,
  onRegisterAccount,
  onSavePendingDriver,
  onApproveDriver,
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [selectedRole, setSelectedRole] = useState<UserRole.Rider | UserRole.Driver>(
    UserRole.Rider
  );
  const [showPassword, setShowPassword] = useState(false);

  // Login fields
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Create Account fields (Rider & Driver)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Driver Document Upload states
  const [driverDocs, setDriverDocs] = useState<Record<DriverDocKey, string | null>>({
    license: null,
    insurance: null,
    registration: null,
    ssn: null,
  });
  const [pendingDriverAccount, setPendingDriverAccount] = useState<UserAccount | null>(null);

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleaned = identifier.trim().toLowerCase();
    const digitsOnly = identifier.replace(/\D/g, '');

    if (!cleaned && !loginPassword.trim()) {
      const demoAcc = accounts.find(
        (a) =>
          a.role === selectedRole &&
          !(a.role === UserRole.Driver && a.driverApprovalStatus === 'pending')
      );
      if (demoAcc) {
        onAuthenticated(demoAcc);
        return;
      }
    }

    const matched = accounts.find((acc) => {
      const emailMatch = acc.email.toLowerCase() === cleaned;
      const accDigits = acc.phone.replace(/\D/g, '');
      const phoneMatch = digitsOnly.length >= 7 && accDigits.endsWith(digitsOnly.slice(-7));
      return (emailMatch || phoneMatch) && acc.password === loginPassword;
    });

    if (!matched) {
      setAuthError('Invalid credentials. Leave blank to demo, or check email & password.');
      return;
    }

    if (matched.role === UserRole.Driver && matched.driverApprovalStatus === 'pending') {
      setPendingDriverAccount(matched);
      return;
    }

    onAuthenticated(matched);
  };

  const handleDocUpload = (docKey: DriverDocKey, file: File | null) => {
    if (!file) return;
    setDriverDocs((prev) => ({
      ...prev,
      [docKey]: file.name,
    }));
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const fName = firstName.trim();
    const lName = lastName.trim();
    const fullName = `${fName} ${lName}`.trim();

    if (!fName || !lName || !phone.trim() || !email.trim() || !regPassword.trim()) {
      setAuthError('Please complete First Name, Last Name, Phone, Email, and Password.');
      return;
    }

    const exists = accounts.some(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase()
    );
    if (exists) {
      setAuthError('Email already exists. Switch to Log In.');
      return;
    }

    if (selectedRole === UserRole.Rider) {
      const riderAccount: UserAccount = {
        id: `usr-${Date.now()}`,
        role: UserRole.Rider,
        name: fullName,
        phone: phone.trim(),
        email: email.trim(),
        password: regPassword,
        createdAt: new Date().toISOString(),
        homeAddress: '1745 NW 16th St, Oklahoma City, OK 73106',
        workAddress: '333 W Sheridan Ave, Oklahoma City, OK 73102',
        paymentMethod: PaymentMethodType.Venmo,
        paymentHandle: `@${fName.toLowerCase()}${lName.toLowerCase()}`,
      };
      onRegisterAccount(riderAccount);
      return;
    }

    // Driver Registration & Peer-Reviewed Approval flow
    const formattedDocs: DriverDocument[] = [
      {
        id: 'license',
        title: "Oklahoma Driver's License",
        fileName: driverDocs.license || 'OK_Drivers_License_Submitted.jpg',
        uploadedAt: 'Submitted Today',
        verified: true,
        expiryNote: 'Oklahoma Class D Verified',
      },
      {
        id: 'registration',
        title: 'Oklahoma Vehicle Registration',
        fileName: driverDocs.registration || 'OK_Vehicle_Registration.pdf',
        uploadedAt: 'Submitted Today',
        verified: true,
        expiryNote: 'Oklahoma Tag Active',
      },
      {
        id: 'insurance',
        title: 'Proof of Insurance',
        fileName: driverDocs.insurance || 'OK_Rideshare_Insurance.pdf',
        uploadedAt: 'Submitted Today',
        verified: true,
        expiryNote: 'Oklahoma TNC Coverage Active',
      },
      {
        id: 'ssn',
        title: 'Social Security Card',
        fileName: driverDocs.ssn || 'SSN_Verification_Submitted.pdf',
        uploadedAt: 'Submitted Today',
        verified: true,
        expiryNote: 'Identity & Payout Verified',
      },
    ];

    const driverAccount: UserAccount = {
      id: `usr-${Date.now()}`,
      role: UserRole.Driver,
      name: fullName,
      phone: phone.trim(),
      email: email.trim(),
      password: regPassword,
      createdAt: new Date().toISOString(),
      driverApprovalStatus: 'pending',
      isOnline: false,
      driverRating: 5.0,
      vehicle: {
        make: 'Honda',
        model: 'Accord Touring',
        year: '2024',
        color: 'Obsidian Black',
        plate: 'OK · RDE-777',
      },
      documents: formattedDocs,
    };

    onSavePendingDriver(driverAccount);
    setPendingDriverAccount(driverAccount);
  };

  return (
    <div className="min-h-full w-full flex flex-col bg-transparent text-[#DFC07D] select-none pb-6">
      {/* TOP HERO SECTION: Untouched layout over S7 Blue Wave */}
      <section className="relative h-[215px] shrink-0 w-full overflow-hidden bg-[#02050E]/45">
        <img
          src={luxurySedanHero}
          alt="Sleek black luxury sedan in front of dark architectural pillars with warm gold light rays"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-[50%_46%] opacity-85"
        />

        {/* Smooth Deep Black-Blue Bottom Fade */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(2,5,14,0.22) 0%, rgba(2,5,14,0.08) 42%, rgba(2,5,14,0.72) 84%, rgba(2,5,14,0.88) 100%)',
          }}
        />

        {/* Cinzel Brand Lockup (#DFC07D + soft glow) & Antique Champagne Subtitle (#B89650) */}
        <div className="relative z-10 h-full flex flex-col items-center justify-end pb-3 px-4 text-center">
          <h1 className="font-cinzel text-[32px] leading-none font-bold tracking-[0.09em] text-champagne-glow">
            RideApp
          </h1>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.18em] uppercase text-[#B89650]">
            OKLAHOMA PRE-SCHEDULED RIDES • ZERO SURGE
          </p>
        </div>
      </section>

      {/* BOTTOM CONTAINER: Compact 5% Charity Note + Natural-Height Translucent Glass Card */}
      <section className="w-full bg-transparent border-t border-[#B89650]/45 flex flex-col items-center justify-start px-4 py-3 gap-3">
        {/* 5% Oklahoma Charity Note */}
        <p className="w-full max-w-md px-4 py-3 rounded-[6px] border border-[#C5A059]/30 bg-[#C5A059]/[0.08] text-[10.5px] leading-[1.35] text-[#DFC07D] text-center shrink-0">
          5% of every fare feeds struggling Oklahoma families, supports the homeless &amp; buys school clothes for OKC kids.
        </p>

        {/* Compact Card (height: auto) */}
        <div className="relative w-full max-w-md h-auto obsidian-login-card rounded-lg">
          {/* Metallic Gold Corner Accents (#C5A059) */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-[#C5A059] rounded-tl-lg"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-[#C5A059] rounded-tr-lg"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-[#C5A059] rounded-bl-lg"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-[#C5A059] rounded-br-lg"
          />

          {pendingDriverAccount ? (
            /* APPLICATION PENDING STATUS CARD */
            <div className="text-center">
              {/* Top Gold-Bordered Status Badge */}
              <div className="inline-flex items-center justify-center gap-1.5 px-2.5 py-0.5 rounded border border-[#C5A059]/70 bg-[#C5A059]/10 text-[9.5px] font-bold tracking-[0.12em] uppercase text-[#DFC07D] mb-[6px]">
                <Hourglass className="w-3 h-3 text-[#DFC07D] shrink-0" />
                <span>STATUS: PENDING APPROVAL</span>
              </div>

              {/* Main Title */}
              <h2 className="font-cinzel text-[15px] sm:text-[17px] font-bold tracking-wider text-champagne-glow mb-[5px]">
                Application Under Review
              </h2>

              {/* Clear Gold Message Body */}
              <p className="text-[10.5px] sm:text-[11px] text-[#DFC07D]/90 leading-[1.32] mb-[7px]">
                Thank you for submitting your credentials. Our Oklahoma Co-op peer review board is verifying your Driver&apos;s License, Proof of Insurance, Vehicle Registration, and Social Security Card.
              </p>

              {/* Timeline Notice Box */}
              <div className="rounded-[6px] border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] px-2.5 py-1.5 text-[10px] leading-[1.3] text-[#B89650] mb-[8px]">
                Approval usually takes 3 business days or longer. You cannot log in to the Driver Dashboard until your account is officially approved.
              </div>

              {/* Document Checklist Summary (All 4 Credentials) */}
              <div className="grid grid-cols-2 gap-1.5 mb-[10px] text-left">
                {[
                  "Driver's License",
                  'Proof of Insurance',
                  'Vehicle Registration',
                  'Social Security Card',
                ].map((docLabel) => (
                  <div
                    key={docLabel}
                    className="rounded border border-[#C5A059]/35 bg-[#020612]/72 backdrop-blur-[10px] px-2 py-1 flex flex-col justify-center"
                  >
                    <span className="text-[9.5px] font-semibold text-[#DFC07D] leading-tight truncate">
                      {docLabel}
                    </span>
                    <span className="text-[8.5px] font-medium text-[#B89650] leading-tight mt-0.5">
                      Submitted • Under Review
                    </span>
                  </div>
                ))}
              </div>

              {/* Gold-Outlined BACK TO LOG IN Button */}
              <button
                type="button"
                onClick={() => {
                  setIdentifier(pendingDriverAccount.email);
                  setLoginPassword('');
                  setPendingDriverAccount(null);
                  setActiveTab('login');
                  setAuthError(null);
                }}
                className="w-full h-auto py-3 px-4 rounded-md border border-[#DFC07D] bg-[#020612]/72 backdrop-blur-[10px] hover:bg-[#C5A059]/15 text-xs font-bold tracking-[0.14em] uppercase text-[#DFC07D] transition-colors cursor-pointer mb-2"
              >
                BACK TO LOG IN
              </button>

              {/* Subtle Bottom Demo Admin Approval Override */}
              <button
                type="button"
                onClick={() => onApproveDriver(pendingDriverAccount.id)}
                className="block mx-auto text-[11px] opacity-70 hover:opacity-100 text-[#DFC07D] underline underline-offset-2 cursor-pointer transition-opacity"
              >
                [Demo Mode: Simulate Admin Approval]
              </button>
            </div>
          ) : (
            <>
              {/* Interactive Tabs: Log In / Create Account with Glowing Gold Indicator Dot */}
              <div className="grid grid-cols-2 border-b border-[#B89650]/30 mb-[8px] sm:mb-[14px]">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setAuthError(null);
                  }}
                  className={`h-7 sm:h-8 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold tracking-wider uppercase transition-colors cursor-pointer relative ${
                    activeTab === 'login'
                      ? 'text-champagne-glow'
                      : 'text-[#B89650]/75 hover:text-[#DFC07D]'
                  }`}
                >
                  {activeTab === 'login' && (
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
                    />
                  )}
                  <span>Log In</span>
                  {activeTab === 'login' && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#C5A059]" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('register');
                    setAuthError(null);
                  }}
                  className={`h-7 sm:h-8 flex items-center justify-center gap-2 text-xs sm:text-sm font-semibold tracking-wider uppercase transition-colors cursor-pointer relative ${
                    activeTab === 'register'
                      ? 'text-champagne-glow'
                      : 'text-[#B89650]/75 hover:text-[#DFC07D]'
                  }`}
                >
                  {activeTab === 'register' && (
                    <span
                      aria-hidden="true"
                      className="w-2 h-2 rounded-full bg-[#DFC07D] shadow-[0_0_8px_rgba(223,192,125,0.85)]"
                    />
                  )}
                  <span>Create Account</span>
                  {activeTab === 'register' && (
                    <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-[#C5A059]" />
                  )}
                </button>
              </div>

              {/* Inline Error Feedback */}
              {authError && (
                <div
                  role="alert"
                  className="mb-[8px] border border-[#B89650]/60 bg-[#020612]/72 backdrop-blur-[10px] px-2.5 py-1 text-[11px] text-[#DFC07D] text-center rounded"
                >
                  {authError}
                </div>
              )}

              {/* TAB 1: LOG IN */}
              {activeTab === 'login' ? (
                <form onSubmit={handleLoginSubmit}>
                  <div className="relative mb-[14px]">
                    <label htmlFor="rideapp-identifier" className="sr-only">
                      Email /Phone
                    </label>
                    <Mail className="w-4 h-4 text-[#B89650] absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="rideapp-identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="Email /Phone"
                      className="w-full h-9 pl-7 pr-2 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-sm text-[#DFC07D] placeholder:text-[#B89650]/70 transition-colors"
                    />
                  </div>

                  <div className="relative mb-[14px]">
                    <label htmlFor="rideapp-password" className="sr-only">
                      Password
                    </label>
                    <Lock className="w-4 h-4 text-[#B89650] absolute left-1 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="rideapp-password"
                      type={showPassword ? 'text' : 'password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full h-9 pl-7 pr-10 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-sm text-[#DFC07D] placeholder:text-[#B89650]/70 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-0 top-1/2 -translate-y-1/2 h-9 w-9 flex items-center justify-center text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="mb-3 w-full h-auto py-3 px-4 rounded-md btn-gold-luxury text-sm tracking-[0.18em] uppercase transition-transform active:scale-[0.99] cursor-pointer"
                  >
                    SIGN IN
                  </button>
                </form>
              ) : (
            /* TAB 2: ROLE-BASED CREATE ACCOUNT FORM */
            <form onSubmit={handleRegisterSubmit}>
              {selectedRole === UserRole.Driver && (
                <div className="text-[10.5px] font-cinzel font-bold tracking-[0.14em] text-champagne-glow text-center mb-[6px]">
                  DRIVER REGISTRATION &amp; APPROVAL
                </div>
              )}

              {/* Side-by-side First Name & Last Name */}
              <div className="grid grid-cols-2 gap-3 mb-[6px] sm:mb-[8px]">
                <div className="relative">
                  <label htmlFor="reg-firstname" className="sr-only">
                    First Name
                  </label>
                  <User className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-firstname"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First Name"
                    className="w-full h-7 pl-5 pr-1 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                    required
                  />
                </div>

                <div className="relative">
                  <label htmlFor="reg-lastname" className="sr-only">
                    Last Name
                  </label>
                  <User className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reg-lastname"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last Name"
                    className="w-full h-7 pl-5 pr-1 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                    required
                  />
                </div>
              </div>

              {/* Phone Number & Email Address */}
              {selectedRole === UserRole.Driver ? (
                <div className="grid grid-cols-2 gap-3 mb-[6px] sm:mb-[8px]">
                  <div className="relative">
                    <label htmlFor="reg-phone" className="sr-only">
                      Phone Number
                    </label>
                    <Phone className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reg-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone Number"
                      className="w-full h-7 pl-5 pr-1 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                      required
                    />
                  </div>

                  <div className="relative">
                    <label htmlFor="reg-email" className="sr-only">
                      Email Address
                    </label>
                    <Mail className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full h-7 pl-5 pr-1 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                      required
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative mb-[6px] sm:mb-[8px]">
                    <label htmlFor="reg-phone" className="sr-only">
                      Phone Number
                    </label>
                    <Phone className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reg-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone Number"
                      className="w-full h-7 pl-5 pr-2 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                      required
                    />
                  </div>

                  <div className="relative mb-[6px] sm:mb-[8px]">
                    <label htmlFor="reg-email" className="sr-only">
                      Email Address
                    </label>
                    <Mail className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="reg-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email Address"
                      className="w-full h-7 pl-5 pr-2 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                      required
                    />
                  </div>
                </>
              )}

              {/* Create Password */}
              <div className="relative mb-[8px] sm:mb-[10px]">
                <label htmlFor="reg-pass" className="sr-only">
                  Create Password
                </label>
                <Lock className="w-3.5 h-3.5 text-[#B89650] absolute left-0.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="reg-pass"
                  type={showPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Create Password"
                  minLength={4}
                  className="w-full h-7 pl-5 pr-9 bg-transparent border-0 border-b border-[#B89650]/55 focus:border-[#DFC07D] focus:outline-none text-xs text-[#DFC07D] placeholder:text-[#B89650]/70"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-7 w-8 flex items-center justify-center text-[#B89650] hover:text-[#DFC07D] cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-3.5 h-3.5" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>

              {/* Driver-Only Document Upload Boxes (4 Credentials) + 70% Payout Note */}
              {selectedRole === UserRole.Driver && (
                <>
                  <div className="grid grid-cols-2 gap-1.5 mb-[6px] sm:mb-[8px]">
                    {(
                      [
                        {key: 'license', label: "Driver's License"},
                        {key: 'insurance', label: 'Proof of Insurance'},
                        {key: 'registration', label: 'Vehicle Registration'},
                        {key: 'ssn', label: 'Social Security Card'},
                      ] as const
                    ).map(({key, label}) => {
                      const uploaded = Boolean(driverDocs[key]);
                      return (
                        <label
                          key={key}
                          className={`h-[28px] sm:h-[30px] rounded-md border px-2 flex items-center justify-between gap-1 cursor-pointer transition-colors ${
                            uploaded
                              ? 'border-[#DFC07D] bg-[#C5A059]/15 text-[#DFC07D]'
                              : 'border-[#B89650]/55 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:border-[#DFC07D]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            <Upload className="w-3 h-3 text-[#B89650] shrink-0" />
                            <span className="text-[9.5px] sm:text-[10px] leading-none font-semibold truncate">
                              {label}
                            </span>
                          </span>
                          <CheckCircle2
                            className={`w-3 h-3 shrink-0 ${
                              uploaded ? 'text-[#DFC07D]' : 'text-[#B89650]/45'
                            }`}
                          />
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={(e) =>
                              handleDocUpload(key, e.target.files?.[0] || null)
                            }
                            className="hidden"
                          />
                        </label>
                      );
                    })}
                  </div>

                  <p className="text-[10px] font-semibold tracking-wide text-[#DFC07D] text-center mb-[6px] sm:mb-[8px]">
                    70% Direct Fare Payout • Peer-Reviewed Approval
                  </p>
                </>
              )}

              <button
                type="submit"
                className="mb-3 w-full h-auto py-3 px-4 rounded-md btn-gold-luxury text-xs sm:text-sm tracking-[0.14em] uppercase transition-transform active:scale-[0.99] cursor-pointer"
              >
                {selectedRole === UserRole.Driver
                  ? 'SUBMIT FOR APPROVAL'
                  : 'CREATE RIDER ACCOUNT'}
              </button>
            </form>
          )}

              {/* Bottom Two-Button Role Selector: Rider & Driver */}
              <div className="pt-3 border-t border-[#B89650]/25">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole(UserRole.Rider);
                      setAuthError(null);
                    }}
                    className={`h-auto py-3 px-4 rounded-md flex items-center justify-center gap-2 text-xs sm:text-sm font-bold tracking-wider transition-all cursor-pointer ${
                      selectedRole === UserRole.Rider
                        ? 'btn-gold-luxury'
                        : 'border border-[#B89650]/50 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:border-[#DFC07D] hover:text-[#DFC07D]'
                    }`}
                  >
                    <User className="w-4 h-4 shrink-0" />
                    <span>Rider</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRole(UserRole.Driver);
                      setAuthError(null);
                    }}
                    className={`h-auto py-3 px-4 rounded-md flex items-center justify-center gap-2 text-xs sm:text-sm font-bold tracking-wider transition-all cursor-pointer ${
                      selectedRole === UserRole.Driver
                        ? 'btn-gold-luxury'
                        : 'border border-[#B89650]/50 bg-[#020612]/72 backdrop-blur-[10px] text-[#B89650] hover:border-[#DFC07D] hover:text-[#DFC07D]'
                    }`}
                  >
                    <CarFront className="w-4 h-4 shrink-0" />
                    <span>Driver</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
};
