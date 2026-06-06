import React from 'react';

const OptionsList = ({ options, videoDetails, t, onDownload }) => {
  if (!options) return null;

  const { music, video } = options;

  return (
    <div className="flex flex-col gap-12 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Video Details Card */}
      {videoDetails && (
        <div className="bg-neo-yellow border-[6px] border-black p-4 flex flex-col md:flex-row gap-6 shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] -rotate-1">
          <div className="w-full md:w-64 flex-shrink-0 border-[4px] border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] overflow-hidden relative">
            <img src={videoDetails.thumbnail} alt={videoDetails.title} className="w-full h-full object-cover" />
            <div className="absolute bottom-2 right-2 bg-black text-white px-2 py-1 font-black text-sm">
              {videoDetails.duration}
            </div>
          </div>
          <div className="flex flex-col justify-center gap-2">
            <h3 className="text-xl md:text-3xl font-black uppercase text-black leading-tight">
              {videoDetails.title}
            </h3>
            <div className="inline-block self-start bg-neo-pink text-white px-3 py-1 text-sm font-black uppercase rotate-2">
              {t.readyToRip}
            </div>
          </div>
        </div>
      )}

      {/* Music Section */}
      {music && music.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-4 bg-neo-blue border-4 border-black"></div>
            <h3 className="text-3xl md:text-5xl font-black text-black uppercase tracking-tighter italic">
              {t.musicHeader} <span className="text-neo-pink font-inter">(MP3)</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {music.map((item, itemIdx) => (
              <button
                key={`${item.formatId}-${itemIdx}`}
                onClick={() => onDownload(item.formatId, 'music')}
                className="neo-btn-green flex flex-col items-center justify-center py-4 border-[4px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                <span className="text-2xl font-black font-inter">{item.quality}</span>
                <span className="text-xs font-bold opacity-70 uppercase font-inter">{t.audioSub}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Section */}
      {video && video.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-4 bg-neo-pink border-4 border-black"></div>
            <h3 className="text-3xl md:text-5xl font-black text-black uppercase tracking-tighter italic">
              {t.videoHeader} <span className="text-neo-blue font-inter">(MP4)</span>
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {video.map((item, itemIdx) => (
              <button
                key={`${item.formatId}-${itemIdx}`}
                onClick={() => onDownload(item.formatId, 'video')}
                className="neo-btn-green flex flex-col items-center justify-center py-4 border-[4px] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]"
              >
                <span className="text-2xl font-black font-inter">{item.quality.toUpperCase()}</span>
                <span className="text-xs font-bold opacity-70 uppercase font-inter">{t.videoSub}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsList;
