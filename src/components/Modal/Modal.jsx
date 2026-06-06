import React from 'react';

const Modal = ({ isOpen, onClose, message, buttonText, icon }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 neo-modal-overlay">
      <div className="neo-modal-content p-8 md:p-12 max-w-md w-full flex flex-col items-center text-center gap-6">
        {icon && (
          <div className="w-20 h-20 bg-neo-yellow border-4 border-black rounded-full flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            {icon}
          </div>
        )}
        <h3 className="text-2xl md:text-4xl font-black uppercase text-black leading-tight">
          {message}
        </h3>
        <button
          onClick={onClose}
          className="neo-btn bg-neo-green hover:bg-neo-yellow w-full py-4 text-xl"
        >
          {buttonText || 'GOT IT!'}
        </button>
      </div>
    </div>
  );
};

export default Modal;
