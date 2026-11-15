import React, {useMemo, useState} from 'react';
import {
  Building2,
  Check,
  Eye,
  LogOut,
  Megaphone,
  Pause,
  Play,
  Plus,
  TicketPercent,
  Trash2,
} from 'lucide-react';
import {BusinessPerk, UserAccount} from '../types/rideapp';
import {PWAInstallButton} from './PWAWidgets';

interface BusinessDashboardProps {
  user: UserAccount;
  perks: BusinessPerk[];
  onUpdateUser: (updated: UserAccount) => void;
  onAddPerk: (perk: BusinessPerk) => void;
  onTogglePerk: (perkId: string) => void;
  onDeletePerk: (perkId: string) => void;
  onLogout: () => void;
}

type BizView = 'campaigns' | 'profile';

export const BusinessDashboard: React.FC<BusinessDashboardProps> = ({
  user,
  perks,
  onUpdateUser,
  onAddPerk,
  onTogglePerk,
  onDeletePerk,
  onLogout,
}) => {
  const [activeView, setActiveView] = useState<BizView>('campaigns');

  // New Ad Campaign state
  const [headline, setHeadline] = useState('10% off entire tab with RideApp receipt');
  const [description, setDescription] = useState(
    'Flash today’s Oklahoma Co-op RideApp reservation pass at checkout.'
  );
  const [promoCode, setPromoCode] = useState('OKCRIDE10');
  const [district, setDistrict] = useState(user.businessDistrict || 'Midtown OKC');
  const [campaignPublishedToast, setCampaignPublishedToast] = useState(false);

  // Business Profile state
  const [bizName, setBizName] = useState(user.businessName || 'Local OKC Business');
  const [bizDistrict, setBizDistrict] = useState(user.businessDistrict || 'Midtown OKC');
  const [bizCategory, setBizCategory] = useState(
    user.businessCategory || 'Restaurant & Cafe'
  );
  const [bizAddress, setBizAddress] = useState(
    user.businessAddress || '815 N Hudson Ave, Oklahoma City, OK 73102'
  );
  const [ownerName, setOwnerName] = useState(user.name);
  const [ownerPhone, setOwnerPhone] = useState(user.phone);
  const [profileSavedToast, setProfileSavedToast] = useState(false);

  const myPerks = useMemo(
    () => perks.filter((p) => p.businessId === user.id),
    [perks, user.id]
  );

  const totalClaims = useMemo(
    () => myPerks.reduce((sum, p) => sum + p.claimsCount, 0),
    [myPerks]
  );

  const handleCreatePerk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!headline.trim() || !promoCode.trim()) return;

    const newPerk: BusinessPerk = {
      id: `perk-${Date.now()}`,
      businessId: user.id,
      businessName: user.businessName || bizName || 'Oklahoma Merchant',
      district: district.trim() || 'OKC Metro',
      headline: headline.trim(),
      description: description.trim(),
      promoCode: promoCode.trim().toUpperCase(),
      active: true,
      claimsCount: 0,
      createdAt: new Date().toISOString(),
    };

    onAddPerk(newPerk);
    setHeadline('');
    setPromoCode('');
    setCampaignPublishedToast(true);
    window.setTimeout(() => setCampaignPublishedToast(false), 3000);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser({
      ...user,
      name: ownerName.trim() || user.name,
      phone: ownerPhone.trim() || user.phone,
      businessName: bizName.trim(),
      businessDistrict: bizDistrict.trim(),
      businessCategory: bizCategory.trim(),
      businessAddress: bizAddress.trim(),
    });
    setDistrict(bizDistrict.trim());
    setProfileSavedToast(true);
    window.setTimeout(() => setProfileSavedToast(false), 2600);
  };

  return (
    <div className="min-h-full bg-transparent text-[#C5A059] pb-20 md:pb-10">
      {/* Clean 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 bg-[#020612]/72 backdrop-blur-[10px] border-b border-[#C5A059]/20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-8 px-4 sm:px-6 h-14">
          <span className="font-cinzel text-lg sm:text-xl font-bold tracking-wider text-gold-metallic whitespace-nowrap shrink-0">
            RideApp
          </span>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setActiveView('campaigns')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeView === 'campaigns'
                  ? 'border-[#C5A059] text-[#DFC07D]'
                  : 'border-transparent text-[#C5A059]/75 hover:text-[#DFC07D]'
              }`}
            >
              Ad Campaign Manager
            </button>
            <button
              type="button"
              onClick={() => setActiveView('profile')}
              className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                activeView === 'profile'
                  ? 'border-[#C5A059] text-[#DFC07D]'
                  : 'border-transparent text-[#C5A059]/75 hover:text-[#DFC07D]'
              }`}
            >
              OKC Business Profile
            </button>
          </nav>

          <button
            type="button"
            onClick={onLogout}
            className="min-h-[40px] px-3.5 rounded-xl border border-[#C5A059]/30 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#C5A059] text-xs font-semibold text-[#DFC07D] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[#C5A059]" />
            <span>Log Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-3 flex flex-col gap-3">
        {/* Top Merchant Summary */}
        <section className="frosted-glass rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs text-[#C5A059]/75">
              Local OKC Business Partner · {user.businessDistrict || 'Downtown OKC'}
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-[#DFC07D] mt-0.5">
              {user.businessName || user.name}
            </h1>
            <p className="text-xs text-[#C5A059] mt-0.5">{user.businessAddress}</p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-white/10 px-3.5 py-2 text-right">
              <div className="text-[10px] text-[#C5A059]/75">Rider Receipt Claims</div>
              <div className="font-mono tabular-nums text-base font-bold text-[#C5A059]">
                {totalClaims}
              </div>
            </div>
            <PWAInstallButton compact />
          </div>
        </section>

        {activeView === 'campaigns' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Push Live Promotional Deal into Rider Dashboard */}
            <section className="lg:col-span-6 frosted-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-cinzel text-lg sm:text-xl font-bold text-[#DFC07D]">
                    Push Live Rider Receipt Perk
                  </h2>
                  <p className="text-xs text-[#C5A059] mt-0.5">
                    Publishes straight into the Rider Dashboard’s rotating Oklahoma perks banner.
                  </p>
                </div>
                {campaignPublishedToast && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 whitespace-nowrap">
                    <Check className="w-4 h-4" /> Live Now!
                  </span>
                )}
              </div>

              <form onSubmit={handleCreatePerk} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-medium text-[#C5A059] mb-1">
                    Promotional Deal Headline
                  </label>
                  <input
                    type="text"
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="e.g., 10% off with RideApp receipt"
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D] placeholder:text-[#C5A059]/60 focus:outline-none focus:border-[#C5A059]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#C5A059] mb-1">
                    Redemption Details
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Show your same-day Oklahoma Co-op RideApp trip receipt"
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D] placeholder:text-[#C5A059]/60 focus:outline-none focus:border-[#C5A059]"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#C5A059] mb-1">
                      Oklahoma District
                    </label>
                    <select
                      value={district}
                      onChange={(e) => setDistrict(e.target.value)}
                      className="w-full min-h-[46px] px-3 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                    >
                      <option value="Midtown OKC">Midtown OKC</option>
                      <option value="Bricktown OKC">Bricktown OKC</option>
                      <option value="Plaza District OKC">Plaza District OKC</option>
                      <option value="Paseo Arts District">Paseo Arts District</option>
                      <option value="Automobile Alley OKC">Automobile Alley OKC</option>
                      <option value="Downtown Edmond">Downtown Edmond</option>
                      <option value="Campus Corner Norman">Campus Corner Norman</option>
                      <option value="Cherry Street Tulsa">Cherry Street Tulsa</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#C5A059] mb-1">
                      Receipt Promo Code
                    </label>
                    <input
                      type="text"
                      value={promoCode}
                      onChange={(e) => setPromoCode(e.target.value)}
                      placeholder="OKCRIDE10"
                      className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm font-mono uppercase text-[#DFC07D] placeholder:text-[#C5A059]/60 focus:outline-none focus:border-[#C5A059]"
                      required
                    />
                  </div>
                </div>

                {/* Live Rider Banner Preview */}
                <div className="rounded-xl bg-[#020612]/72 border border-[#C5A059]/30 p-3.5 space-y-1.5">
                  <div className="text-[11px] text-[#C5A059] flex items-center gap-1.5 font-semibold">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Live Rider Banner Preview · {district}</span>
                  </div>
                  <div className="text-xs font-bold text-[#DFC07D]">
                    {user.businessName || bizName}: {headline || 'Your deal headline'}
                  </div>
                  <div className="text-[11px] text-[#C5A059]/75">
                    {description || 'Redemption details'} · Code:{' '}
                    <span className="font-mono text-[#DFC07D]">
                      {(promoCode || 'CODE').toUpperCase()}
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl btn-gold-luxury font-bold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Publish Deal to Rider Dashboard</span>
                </button>
              </form>
            </section>

            {/* Right: Active & Network Campaigns */}
            <section className="lg:col-span-6 frosted-glass rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-cinzel text-lg font-bold text-[#DFC07D]">
                  Your Published OKC Deals ({myPerks.length})
                </h2>
                <span className="text-xs text-[#C5A059]/75">
                  {perks.filter((p) => p.active).length} active across OKC
                </span>
              </div>

              {myPerks.length === 0 ? (
                <p className="text-xs text-[#C5A059]/75 py-6 text-center">
                  Publish your first Oklahoma RideApp receipt perk on the left to appear in the Rider Dashboard banner.
                </p>
              ) : (
                <div className="space-y-3">
                  {myPerks.map((perk) => (
                    <div
                      key={perk.id}
                      className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/20 p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs text-[#C5A059]">
                            {perk.district} · {perk.active ? 'LIVE IN RIDER BANNER' : 'PAUSED'}
                          </div>
                          <div className="text-sm font-bold text-[#DFC07D] mt-0.5">
                            {perk.headline}
                          </div>
                          <p className="text-xs text-[#C5A059]/75 mt-0.5">{perk.description}</p>
                        </div>
                        <TicketPercent className="w-5 h-5 text-[#C5A059] shrink-0" />
                      </div>

                      <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-mono tabular-nums text-[#C5A059]">
                          Code: <strong className="text-[#DFC07D]">{perk.promoCode}</strong> ·{' '}
                          {perk.claimsCount} claims
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onTogglePerk(perk.id)}
                            className="min-h-[38px] px-3 rounded-lg border border-white/15 bg-[#020612]/72 backdrop-blur-[10px] hover:border-[#C5A059]/50 text-xs font-medium text-[#C5A059] inline-flex items-center gap-1 cursor-pointer"
                          >
                            {perk.active ? (
                              <>
                                <Pause className="w-3.5 h-3.5 text-[#C5A059]" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 text-emerald-300" />
                                <span>Resume</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeletePerk(perk.id)}
                            aria-label="Delete campaign"
                            className="min-h-[38px] min-w-[38px] rounded-lg border border-rose-400/25 bg-rose-950/25 hover:bg-rose-950/50 flex items-center justify-center text-rose-300 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="max-w-2xl frosted-glass rounded-2xl p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-cinzel text-xl font-bold text-[#DFC07D]">
                  Local OKC Business Profile
                </h2>
                <p className="text-xs text-[#C5A059] mt-0.5">
                  Displayed alongside your promotional deals in the Rider Dashboard.
                </p>
              </div>
              {profileSavedToast && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                  <Check className="w-4 h-4" /> Saved
                </span>
              )}
            </div>

            <form onSubmit={handleSaveProfile} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#C5A059] mb-1">Business Name</label>
                  <input
                    type="text"
                    value={bizName}
                    onChange={(e) => setBizName(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5A059] mb-1">
                    Neighborhood / OKC District
                  </label>
                  <input
                    type="text"
                    value={bizDistrict}
                    onChange={(e) => setBizDistrict(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[#C5A059] mb-1">Business Category</label>
                  <input
                    type="text"
                    value={bizCategory}
                    onChange={(e) => setBizCategory(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#C5A059] mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#C5A059] mb-1">
                  Oklahoma Street Address
                </label>
                <input
                  type="text"
                  value={bizAddress}
                  onChange={(e) => setBizAddress(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                />
              </div>

              <div>
                <label className="block text-xs text-[#C5A059] mb-1">Owner / Manager Name</label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#020612]/72 border border-[#C5A059]/25 text-sm text-[#DFC07D]"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] rounded-xl btn-gold-luxury font-bold text-sm cursor-pointer"
              >
                Save OKC Business Profile
              </button>
            </form>
          </section>
        )}
      </main>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#020612]/72 backdrop-blur-[10px] border-t border-[#C5A059]/20 grid grid-cols-2 items-center px-4">
        <button
          type="button"
          onClick={() => setActiveView('campaigns')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeView === 'campaigns' ? 'text-[#C5A059]' : 'text-[#C5A059]/75'
          }`}
        >
          <Megaphone className="w-5 h-5" />
          <span className="text-[10px] font-medium">Ad Campaigns</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveView('profile')}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
            activeView === 'profile' ? 'text-[#C5A059]' : 'text-[#C5A059]/75'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span className="text-[10px] font-medium">OKC Business</span>
        </button>
      </nav>
    </div>
  );
};
