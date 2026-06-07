import React, { useState, useEffect } from 'react';
import Header from './components/Header/Header';
import Input from './components/input/Input';
import Button from './components/button/Button';
import OptionsList from './components/OptionsList/OptionsList';
import Modal from './components/Modal/Modal';
import Footer from './components/Footer/Footer';

function App() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [language, setLanguage] = useState('en');
  const [options, setOptions] = useState(null);
  const [videoDetails, setVideoDetails] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const handleProcess = async () => {
    if (!url) {
      setStatus('ERROR: NO VIDEO URL PROVIDED!');
      return;
    }
    
    setIsLoading(true);
    setOptions(null);
    setVideoDetails(null);
    setStatus('CONNECTING TO SERVER.');
    
    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setStatus(`VIDEO READY: ${data.videoDetails.title}`);
        setOptions(data.buttonFormats);
        setVideoDetails(data.videoDetails);
      } else {
        setStatus(`ERROR: ${data.error || 'FAILED TO EXTRACT DATA'}`);
      }
    } catch (error) {
      setStatus('ERROR: COULD NOT CONNECT TO BACKEND');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = (formatId, downloadType) => {
    // Pull the title from saved video details state
    const videoTitle = videoDetails?.title || 'video';
    
    // Send the original YouTube URL + formatId to the backend.
    // yt-dlp resolves the stream URL fresh on every request (avoids expiry issues).
    const backendProxyUrl = `/api/download` +
      `?url=${encodeURIComponent(url)}` +
      `&formatId=${encodeURIComponent(formatId)}` +
      `&title=${encodeURIComponent(videoTitle)}` +
      `&type=${downloadType}`;
    
    window.open(backendProxyUrl, '_blank');
  };

  const t = {
    en: {
      heroLine1: "Download",
      heroLine2: "any video",
      desc: "Grab videos from anywhere on the web. Just paste the link, hit download, and it's yours. Fast, free, no nonsense.",
      inputPlace: "PASTE VIDEO URL HERE",
      btn: "PROCESS",
      statusBox: "DOWNLOAD_STATUS",
      modalMsg: "DOWNLOAD STARTED!",
      musicHeader: "MUSIC",
      videoHeader: "VIDEO",
      audioSub: "HIGH QUALITY AUDIO",
      videoSub: "HD VIDEO STREAM",
      readyToRip: "READY FOR DOWNLOAD",
      gotIt: "GOT IT!",
      installBtn: "INSTALL APP"
    },
    ar: {
      heroLine1: "حمّل",
      heroLine2: "أي فيديو",
      desc: "احصل على الفيديوهات من أي مكان على الويب. فقط الصق الرابط، اضغط تحميل، وسيكون لك. سريع، مجاني، بدون تعقيد.",
      inputPlace: "PASTE VIDEO URL HERE",
      btn: "PROCESS",
      statusBox: "DOWNLOAD_STATUS",
      modalMsg: "بدأ تحميل الفيديو",
      musicHeader: "موسيقى",
      videoHeader: "فيديو",
      audioSub: "HIGH QUALITY AUDIO",
      videoSub: "HD VIDEO STREAM",
      readyToRip: "جاهز للتحميل",
      gotIt: "فهمت!",
      installBtn: "تثبيت التطبيق"
    }
  };

  const current = t[language];

  return (
    <div className={`min-h-screen bg-white overflow-x-hidden transition-colors duration-300 ${language === 'ar' ? 'font-kidzhood dir-rtl' : 'font-inter'}`}>
      <Header
        language={language}
        setLanguage={setLanguage}
        installPrompt={installPrompt}
        onInstallClick={handleInstallClick}
        t={current}
      />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-20 relative">
        <div className="flex flex-col gap-8 md:gap-12">

          {/* Hero Section */}
          <section className="relative z-10">
            <h2 className="text-5xl sm:text-6xl md:text-8xl lg:text-9xl font-black uppercase leading-none tracking-tighter text-black">
              <span className="block drop-shadow-[3px_3px_0px_rgba(0,0,0,0.15)]">
                {current.heroLine1}
              </span>
              <span className="block drop-shadow-[3px_3px_0px_rgba(0,0,0,0.15)]">
                {current.heroLine2}
              </span>
            </h2>

            <div className="mt-6 md:mt-8 max-w-2xl bg-neo-green p-4 md:p-6 border-[4px] border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] md:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] md:-rotate-2">
              <p className="text-base md:text-xl lg:text-2xl font-bold text-black italic">
                {current.desc}
              </p>
            </div>
          </section>

          {/* Action Card */}
          <section className="bg-neo-white border-[4px] md:border-[6px] border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] md:shadow-[15px_15px_0px_0px_rgba(0,0,0,1)] p-5 sm:p-8 md:p-12 md:rotate-1 relative">
            <div className="absolute -top-8 -right-8 w-20 h-20 md:w-24 md:h-24 bg-neo-yellow border-[4px] border-black rounded-full items-center justify-center font-black animate-bounce rotate-12 hidden md:flex text-black text-sm">
              FREE!
            </div>

            <div className="flex flex-col gap-5 md:gap-8">
              <div className="flex flex-col gap-4">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={current.inputPlace}
                  className="w-full font-inter"
                />
                <Button
                  onClick={handleProcess}
                  variant="vibrant"
                  className="w-full py-4 text-lg md:text-2xl font-inter"
                  disabled={isLoading}
                >
                  {isLoading ? 'WORKING...' : current.btn}
                </Button>
              </div>

              {status && (
                <div className="bg-black text-neo-green p-4 md:p-6 border-[4px] border-neo-pink font-mono text-sm md:text-lg font-inter">
                  <div className="flex justify-between border-b border-neo-green/30 mb-2 pb-1 text-xs md:text-base font-inter">
                    <span className="font-inter">{current.statusBox}</span>
                    <span className="font-inter">EXE.001</span>
                  </div>
                  <span className="animate-pulse font-inter">{status}</span>
                </div>
              )}

              {/* Download Options */}
              <OptionsList 
                options={options} 
                videoDetails={videoDetails} 
                t={current} 
                onDownload={handleDownload} 
              />
            </div>
          </section>
        </div>
      </main>

      <Modal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        message={current.modalMsg}
        buttonText={current.gotIt}
        icon={
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        }
      />

      <div className="fixed bottom-10 left-10 w-20 h-20 md:w-32 md:h-32 border-[8px] border-neo-blue -z-10 rotate-45 opacity-20 hidden sm:block"></div>
      <div className="fixed top-40 right-5 md:right-20 w-28 h-28 md:w-48 md:h-48 border-[8px] border-neo-pink rotate-12 -z-10 opacity-20 hidden sm:block"></div>
      
      <Footer language={language} />
    </div>
  );
}

export default App;