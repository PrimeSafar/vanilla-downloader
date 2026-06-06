import React from 'react';

const Button = ({ children, onClick, className = "", variant = "primary" }) => {
  const variants = {
    primary: "bg-white text-black",
    vibrant: "bg-yellow-400 text-black",
    danger: "bg-pink-500 text-white"
  };

  return (
    <button
      onClick={onClick}
      className={`
        neo-btn
        border-2 border-black
        shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]
        active:shadow-none
        active:translate-x-[4px]
        active:translate-y-[4px]
        transition-all
        px-4 py-2
        flex items-center justify-center gap-2
        uppercase tracking-widest text-sm
        ${variants[variant]}
        ${className}
      `}
    >
      {children}
    </button>
  );
};

export default Button;
