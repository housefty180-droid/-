import React from 'react';

interface IconProps {
  className?: string;
  style?: React.CSSProperties;
}

export const PixelSnowflake: React.FC<IconProps> = ({ className = "w-4 h-4", style }) => (
  <svg viewBox="0 0 16 16" className={className} style={style} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 0h2v2H7V0zm0 14h2v2H7v-2zM0 7h2v2H0V7zm14 0h2v2h-2V7zM2 2h2v2H2V2zm10 10h2v2h-2v-2zM2 12h2v2H2v-2zm10-10h2v2h-2V2zM7 3h2v10H7V3zM3 7h10v2H3V7z" />
  </svg>
);

export const PixelIceCube: React.FC<IconProps> = ({ className = "w-4 h-4", style }) => (
  <svg viewBox="0 0 16 16" className={className} style={style} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M1 1h14v14H1V1zm2 2v10h10V3H3zm2 2h2v2H5V5zm4 0h2v2H9V5zm-4 4h2v2H5V9zm4 0h2v2H9V9z" />
  </svg>
);

export const PixelBox: React.FC<IconProps> = ({ className = "w-4 h-4", style }) => (
  <svg viewBox="0 0 16 16" className={className} style={style} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 2h16v4H0V2zm2 5h12v8H2V7zm2 2h8v2H4V9zm0 3h8v2H4v-2z" />
  </svg>
);
