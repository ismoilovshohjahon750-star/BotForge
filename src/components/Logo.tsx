import React from 'react';

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export const LogoIcon: React.FC<LogoProps> = ({ size = 40, className, ...props }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        {/* Glow Filters */}
        <filter id="orange-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="cyan-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradients */}
        <linearGradient id="orange-grad" x1="20" y1="20" x2="60" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff4500" />
          <stop offset="50%" stopColor="#ff7f50" />
          <stop offset="100%" stopColor="#ff8c00" />
        </linearGradient>
        <linearGradient id="cyan-grad" x1="60" y1="15" x2="100" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00f2fe" />
          <stop offset="50%" stopColor="#4facfe" />
          <stop offset="100%" stopColor="#0000ff" />
        </linearGradient>
        
        {/* Flame Gradient */}
        <linearGradient id="flame-grad" x1="15" y1="40" x2="50" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#ff4500" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {/* Background visual flame dynamic glow */}
      <path
        d="M20,65 C25,40 38,30 45,45 C48,52 35,62 38,78 C40,88 22,85 20,65 Z"
        fill="url(#flame-grad)"
        filter="url(#orange-glow)"
        opacity="0.6"
      />

      {/* Cybernetic Grid details / under-plate lines */}
      <path d="M45,20 L30,20 L30,10" stroke="#ff4500" strokeWidth="1" strokeDasharray="2,2" opacity="0.4" />
      <path d="M75,18 L95,18 L95,25" stroke="#00f2fe" strokeWidth="1" strokeDasharray="2,2" opacity="0.4" />
      <path d="M72,50 L90,50" stroke="#00f2fe" strokeWidth="1" strokeDasharray="3,3" opacity="0.3" />

      {/* Circuit Nodes (Small Circles) */}
      <circle cx="30" cy="10" r="1.5" fill="#ff4500" opacity="0.6" />
      <circle cx="95" cy="25" r="1.5" fill="#00f2fe" opacity="0.6" />
      <circle cx="58" cy="40" r="2" fill="#00f2fe" filter="url(#cyan-glow)" />

      {/* Fused 'BF' Outer Frame and Design paths */}
      
      {/* 1. Left side - 'B' in flaming neon orange energy */}
      <path
        d="M58,85 L40,85 C34,85 30,81 30,75 L30,25 C30,19 34,15 40,15 L58,15 L58,23 H40 C39,23 38,24 38,25 L38,45 C38,46 39,47 40,47 L58,47 L58,55 H40 C39,55 38,56 38,57 L38,75 C38,76 39,77 40,77 L58,77 Z"
        fill="url(#orange-grad)"
        filter="url(#orange-glow)"
      />
      {/* Curved flame loops and inner details of B */}
      <path
        d="M58,15 C72,15 76,26 71,35 C68,40 62,43 58,47 C65,51 76,55 71,68 C66,80 58,85 45,85"
        stroke="url(#orange-grad)"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#orange-glow)"
      />

      {/* 2. Right side - cybernetic 'F' in glowing blue/cyan */}
      <path
        d="M62,15 L95,15 C98,15 100,17 100,20 L100,22 C100,23 99,24 98,24 L62,24 L62,45 L88,45 C91,45 92,47 92,49 L92,51 C92,53 91,54 89,54 L62,54 L62,85 C62,87 60,89 58,89 L56,89 C54,89 52,87 52,85 L52,15 Z"
        fill="url(#cyan-grad)"
        filter="url(#cyan-glow)"
      />
      <path
        d="M60,15 L88,15 M60,45 L82,45"
        stroke="url(#cyan-grad)"
        strokeWidth="4"
        strokeLinecap="round"
        filter="url(#cyan-glow)"
      />

      {/* Fused Stem highlights */}
      <line x1="58" y1="18" x2="58" y2="82" stroke="#ffffff" strokeWidth="2.5" opacity="0.9" filter="url(#cyan-glow)" />
      
      {/* Subtle CPU/Microchip ornament in the center of stem fusion */}
      <rect x="54" y="36" width="8" height="8" rx="1.5" fill="#0d0d14" stroke="#ffffff" strokeWidth="1" />
      <line x1="52" y1="38" x2="54" y2="38" stroke="#00f2fe" strokeWidth="1" />
      <line x1="52" y1="42" x2="54" y2="42" stroke="#00f2fe" strokeWidth="1" />
      <line x1="62" y1="38" x2="64" y2="38" stroke="#00f2fe" strokeWidth="1" />
      <line x1="62" y1="42" x2="64" y2="42" stroke="#00f2fe" strokeWidth="1" />
    </svg>
  );
};

export const LogoFull: React.FC<LogoProps & { showSub?: boolean; vertical?: boolean }> = ({ 
  size = 50, 
  showSub = true,
  vertical = false,
  className,
  ...props 
}) => {
  if (vertical) {
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <LogoIcon size={size * 1.5} />
        <div className="mt-4">
          <h1 className="text-2xl font-black text-white tracking-[0.2em] uppercase leading-none font-sans">
            BOT<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#00f2fe]">FORGE</span>
          </h1>
          {showSub && (
            <p className="text-[9px] text-[#8e8eb2] tracking-[0.35em] uppercase mt-2.5 font-mono font-medium">
              THE DIGITAL BOT STUDIO
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3.5 ${className}`}>
      <LogoIcon size={size} />
      <div className="flex flex-col">
        <h1 className="text-xl font-black text-white tracking-[0.14em] uppercase leading-none font-sans">
          BOT<span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-[#00f2fe]">FORGE</span>
        </h1>
        {showSub && (
          <p className="text-[8.5px] text-[#8e8eb2] tracking-[0.28em] uppercase mt-1.5 font-mono font-medium">
            THE DIGITAL BOT STUDIO
          </p>
        )}
      </div>
    </div>
  );
};
