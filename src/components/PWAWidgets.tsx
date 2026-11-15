import React, {useEffect, useState} from 'react';
import {Download, Share, Smartphone, WifiOff, X} from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'; platform: string}>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as {standalone?: boolean}).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const {outcome} = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: Boolean(deferredPrompt),
    isInstalled,
    isIOS,
    install,
  };
}

export const PWAInstallButton: React.FC<{compact?: boolean}> = ({compact = false}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#C5A059]/40 bg-[#020612]/72 backdrop-blur-[10px] text-[#C5A059] hover:border-[#DFC07D] hover:bg-[#0A2463]/45 transition-colors whitespace-nowrap shrink-0 cursor-pointer min-h-[44px] ${
          compact ? 'px-3 text-xs font-medium' : 'px-3.5 py-2 text-xs font-semibold'
        }`}
      >
        <Download className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
        <span>{isIOS ? 'Install on iPhone' : 'Install App'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#02050E]/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl frosted-glass p-6 text-[#C5A059]">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-5 h-5 text-[#C5A059] shrink-0" />
                <h3 id="pwa-guide-title" className="text-base font-semibold text-[#DFC07D]">
                  Install RideApp on Your Phone
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install guide"
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center text-[#C5A059] hover:text-[#DFC07D] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-[#C5A059] leading-relaxed">
              <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/20 p-3.5">
                <p className="font-semibold text-[#C5A059] flex items-center gap-1.5">
                  <Share className="w-4 h-4" /> iPhone & iPad (Safari)
                </p>
                <p className="mt-1 text-xs text-[#C5A059]">
                  1. Tap the <strong>Share</strong> icon in your Safari toolbar.
                  <br />
                  2. Scroll down and select <strong>Add to Home Screen</strong> to launch RideApp full-screen.
                </p>
              </div>
              <div className="rounded-xl bg-[#020612]/72 backdrop-blur-[10px] border border-[#C5A059]/20 p-3.5">
                <p className="font-semibold text-[#C5A059]">Android (Chrome) & Desktop</p>
                <p className="mt-1 text-xs text-[#C5A059]">
                  Open RideApp in your main browser tab and tap the <strong>Install App</strong> menu option in the address bar.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[44px] rounded-xl btn-gold-luxury text-sm transition-transform active:scale-[0.99] cursor-pointer"
            >
              Got It
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl border border-[#C5A059]/45 bg-[#020612]/72 backdrop-blur-[10px] px-4 py-2 text-xs font-medium text-[#C5A059] shadow-xl">
      <WifiOff className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
      <span>Offline Mode · Saved Oklahoma reservations & cached radar active</span>
    </div>
  );
};
