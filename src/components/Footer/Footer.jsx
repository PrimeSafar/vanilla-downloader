import React from 'react';

const GithubIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
  </svg>
);

const InstagramIcon = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const Footer = ({ language }) => {
  const t = {
    en: {
      madeBy: "MADE BY SAFAR ",
      connect: "LET'S CONNECT"
    },
    ar: {
      madeBy: "صنع بواسطة سفر ",
      connect: "لنتواصل"
    }
  };

  const current = t[language] || t.en;

  return (
    <footer className="w-full bg-neo-white border-t-[6px] md:border-t-[8px] border-black mt-20 relative overflow-hidden">
      {/* Dot pattern background */}
      <div className="absolute inset-0 bg-dot-pattern opacity-10 pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        
        {/* Made By block */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left gap-2">
          <p className="text-xl md:text-2xl font-black italic uppercase bg-neo-green text-black border-[3px] md:border-[4px] border-black px-3 py-1 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] -rotate-2">
            {current.madeBy}
          </p>
          <p className="font-bold text-sm md:text-base text-black mt-1">
            © {new Date().getFullYear()} Safar. All rights reserved.
          </p>
        </div>

        {/* Social Links block */}
        <div className="flex flex-col items-center md:items-end gap-3">
          <p className="font-black text-lg bg-neo-pink text-black px-2 border-[2px] border-black rotate-1">
            {current.connect}
          </p>
          <div className="flex gap-4">
            <a 
              href="https://github.com/PrimeSafar" 
              target="_blank" 
              rel="noopener noreferrer"
              className="neo-btn bg-white text-black hover:bg-neo-blue hover:text-white !p-3"
              aria-label="GitHub"
            >
              <GithubIcon size={24} />
            </a>
            <a 
              href="https://www.instagram.com/s0u.x?igsh=ZHhscm1jenk4bmFm" 
              target="_blank" 
              rel="noopener noreferrer"
              className="neo-btn bg-white text-black hover:bg-neo-yellow hover:text-black !p-3"
              aria-label="Instagram"
            >
              <InstagramIcon size={24} />
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
};

export default Footer;
