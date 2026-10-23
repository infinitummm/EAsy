import React from 'react';

interface P3rButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'cyan' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export const P3rButton: React.FC<P3rButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}) => {
  const sizeStyles = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-4 py-2 text-xs font-bold',
    lg: 'px-6 py-2.5 text-sm font-bold',
  }[size];

  const variantStyles = {
    primary:
      'bg-[#0066FF] hover:bg-[#0052CC] active:bg-[#003D99] text-white p3r-shadow-blue border-l-2 border-white',
    cyan:
      'bg-[#00E5FF] hover:bg-[#66EFFF] active:bg-[#00B4D8] text-[#030814] font-black p3r-shadow-hard border-l-2 border-white',
    secondary:
      'bg-[#081329] hover:bg-[#12264C] active:bg-[#0A1A38] text-[#8FA5C4] hover:text-white border border-[#16335F] p3r-shadow-hard',
    danger:
      'bg-[#FF1744] hover:bg-[#D50000] active:bg-[#9B0000] text-white p3r-shadow-hard border-l-2 border-white',
  }[variant];

  return (
    <button
      disabled={disabled}
      className={`relative inline-flex items-center justify-center tracking-wider uppercase transition-all duration-150 transform -skew-x-8 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      <span className="transform skew-x-8 inline-flex items-center space-x-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <span>{children}</span>
      </span>
    </button>
  );
};
