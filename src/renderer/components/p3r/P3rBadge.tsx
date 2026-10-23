import React from 'react';

interface P3rBadgeProps {
  label: string;
  variant?: 'green' | 'red' | 'blue' | 'yellow' | 'cyan' | 'neutral';
  dot?: boolean;
  className?: string;
}

export const P3rBadge: React.FC<P3rBadgeProps> = ({
  label,
  variant = 'neutral',
  dot = true,
  className = '',
}) => {
  const styles = {
    green: {
      wrap: 'bg-[#00E676]/10 text-[#00E676] border-[#00E676]/40',
      dot: 'bg-[#00E676]',
    },
    red: {
      wrap: 'bg-[#FF1744]/10 text-[#FF1744] border-[#FF1744]/40',
      dot: 'bg-[#FF1744]',
    },
    blue: {
      wrap: 'bg-[#0066FF]/15 text-[#00D4FF] border-[#0066FF]/40',
      dot: 'bg-[#0066FF]',
    },
    yellow: {
      wrap: 'bg-[#FFE277]/10 text-[#FFE277] border-[#FFE277]/40',
      dot: 'bg-[#FFE277]',
    },
    cyan: {
      wrap: 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/40',
      dot: 'bg-[#00E5FF]',
    },
    neutral: {
      wrap: 'bg-[#0C1B38] text-[#8FA5C4] border-[#16335F]',
      dot: 'bg-[#8FA5C4]',
    },
  }[variant];

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase border transform -skew-x-8 ${styles.wrap} ${className}`}
    >
      <span className="transform skew-x-8 inline-flex items-center space-x-1.5">
        {dot && <span className={`w-1.5 h-1.5 ${styles.dot}`} />}
        <span>{label}</span>
      </span>
    </span>
  );
};
