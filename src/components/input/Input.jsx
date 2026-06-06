import React from 'react';

const Input = ({ value, onChange, placeholder, className = "" }) => {
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`neo-input w-full placeholder:text-black ${className}`}
    />
  );
};

export default Input;