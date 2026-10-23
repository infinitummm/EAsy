import React from 'react';

interface P3rPanelProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'active' | 'danger' | 'dark';
  beveled?: boolean;
  skewed?: boolean;
}

export const P3rPanel: React.FC<P3rPanelProps> = ({
  children,
  className = '',
  variant = 'default',
  beveled = true,
  skewed = false,
}) => {
  // Border color based on variant
  const borderColor = {
    default: 'bg-[#16335F]',
    active: 'bg-[#00D4FF]',
    danger: 'bg-[#FF1744]',
    dark: 'bg-[#0E203C]',
  }[variant];

  // Background color
  const bgColor = {
    default: 'bg-[#081329]',
    active: 'bg-[#0A1A38]',
    danger: 'bg-[#1F0A12]',
    dark: 'bg-[#040A17]',
  }[variant];

  const cutClass = beveled ? 'p3r-bevel' : '';
  const skewClass = skewed ? 'p3r-skew' : '';

  return (
    <div className={`relative p-[1.5px] ${borderColor} ${cutClass} ${skewClass} p3r-shadow-hard ${className}`}>
      <div className={`w-full h-full ${bgColor} ${cutClass} p3r-hatch`}>
        {skewed ? <div className="p3r-unskew">{children}</div> : children}
      </div>
    </div>
  );
};
