import React from 'react';

const GlobeIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
);

const MoonIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
);

const Header = ({ language, setLanguage, installPrompt, onInstallClick, t: appTranslations }) => {
  const t = {
    en: {
      title: "VanillaDownloader",
      subtitle: "Direct Downloads. Zero Hassle.",
    },
    ar: {
      title: "فانيلا-داونلودر",
      subtitle: "تحميل مباشر. بدون تعقيد.",
    }
  };

  const current = t[language];

  return (
    <header className="w-full bg-neo-yellow border-b-[6px] md:border-b-[8px] border-black relative overflow-hidden">
      {/* Dot pattern background */}
      <div className="absolute inset-0 bg-dot-pattern opacity-20 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 md:py-6 flex flex-row items-center justify-between gap-4 relative z-10">

        {/* Brand block */}
        <div className="flex flex-col items-start min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-black italic uppercase bg-white text-black border-[3px] md:border-[4px] border-black px-2 sm:px-4 py-1 md:py-2 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] md:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] -rotate-1 leading-tight truncate max-w-[200px] sm:max-w-none">
            {current.title}
          </h1>
          <p className="font-bold text-sm md:text-lg mt-2 bg-neo-pink text-black px-2 md:px-3 py-0.5 md:py-1 border-[2px] md:border-[3px] border-black rotate-1 whitespace-nowrap">
            {current.subtitle}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          {/* Install Button */}
          {installPrompt && (
            <button
              onClick={onInstallClick}
              className="neo-btn bg-neo-blue text-white hover:bg-neo-pink hover:-translate-y-1 !px-3 !py-2 md:!px-6 md:!py-2 font-inter"
              aria-label="Install App"
            >
              <span className="font-black text-sm md:text-base font-inter">{appTranslations?.installBtn || 'INSTALL APP'}</span>
            </button>
          )}

          {/* Language toggle */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
            className="neo-btn bg-neo-white text-black hover:bg-neo-green hover:-translate-y-1 !px-3 !py-2 md:!px-6 md:!py-2 font-inter"
            aria-label="Toggle language"
          >
            <GlobeIcon size={18} />
            <span className="font-black text-sm md:text-base font-inter">{language.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
