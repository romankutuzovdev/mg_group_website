"use client";

import { type CSSProperties, type ReactNode } from "react";

type CarPartProps = {
  id: string;
  style?: CSSProperties;
  children: ReactNode;
};

export function CarPart({ id, style, children }: CarPartProps) {
  return (
    <g
      data-part={id}
      style={{
        transformBox: "fill-box",
        transformOrigin: "center",
        transition: "transform 0.05s linear",
        ...style,
      }}
    >
      {children}
    </g>
  );
}

export function LuxuryCarSvg() {
  return (
    <>
      <defs>
        <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4a4a52" />
          <stop offset="40%" stopColor="#222228" />
          <stop offset="100%" stopColor="#0e0e12" />
        </linearGradient>
        <linearGradient id="glassGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3a4a5c" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#141a22" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="accentLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#16a34a" stopOpacity="0" />
          <stop offset="50%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="wheelGrad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#3a3a40" />
          <stop offset="70%" stopColor="#141418" />
          <stop offset="100%" stopColor="#060608" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <ellipse cx="460" cy="372" rx="340" ry="20" fill="rgba(34,197,94,0.1)" />

      <CarPart id="rear-wheel">
        <circle cx="700" cy="322" r="54" fill="url(#wheelGrad)" stroke="#333" strokeWidth="2" />
        <circle cx="700" cy="322" r="40" fill="none" stroke="#252528" strokeWidth="7" />
        <circle cx="700" cy="322" r="14" fill="#22c55e" opacity="0.55" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="700"
            y1="322"
            x2={700 + 36 * Math.cos((deg * Math.PI) / 180)}
            y2={322 + 36 * Math.sin((deg * Math.PI) / 180)}
            stroke="#444"
            strokeWidth="2"
          />
        ))}
      </CarPart>

      <CarPart id="front-wheel">
        <circle cx="228" cy="322" r="54" fill="url(#wheelGrad)" stroke="#333" strokeWidth="2" />
        <circle cx="228" cy="322" r="40" fill="none" stroke="#252528" strokeWidth="7" />
        <circle cx="228" cy="322" r="14" fill="#22c55e" opacity="0.55" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <line
            key={deg}
            x1="228"
            y1="322"
            x2={228 + 36 * Math.cos((deg * Math.PI) / 180)}
            y2={322 + 36 * Math.sin((deg * Math.PI) / 180)}
            stroke="#444"
            strokeWidth="2"
          />
        ))}
      </CarPart>

      <CarPart id="exhaust">
        <rect x="808" y="302" width="52" height="14" rx="7" fill="#555" />
        <rect x="816" y="306" width="36" height="6" rx="3" fill="#222" />
      </CarPart>

      <CarPart id="suspension-rear">
        <path d="M640 312 L700 322 L688 348 L628 336 Z" fill="#3a3a3e" stroke="#555" />
        <rect x="662" y="302" width="10" height="44" rx="2" fill="#22c55e" opacity="0.45" />
      </CarPart>

      <CarPart id="suspension-front">
        <path d="M268 312 L228 322 L240 348 L278 336 Z" fill="#3a3a3e" stroke="#555" />
        <rect x="248" y="302" width="10" height="44" rx="2" fill="#22c55e" opacity="0.45" />
      </CarPart>

      <CarPart id="engine">
        <rect x="300" y="252" width="128" height="76" rx="8" fill="#2a2a30" stroke="#555" strokeWidth="1.5" />
        <rect x="314" y="264" width="100" height="22" rx="4" fill="#1a1a1f" />
        <rect x="314" y="294" width="44" height="26" rx="3" fill="#404045" />
        <rect x="366" y="294" width="44" height="26" rx="3" fill="#404045" />
        <text x="348" y="280" fill="#22c55e" fontSize="11" fontFamily="system-ui" opacity="0.8">
          V6 TURBO
        </text>
      </CarPart>

      <CarPart id="body">
        <path
          d="M100 318 L100 278 Q102 218 168 198 L268 172 L400 150 L540 140 L660 148 L780 172 L860 200 Q890 218 898 258 L898 318 L850 318 L820 288 L700 270 L480 262 L260 270 L180 288 L140 318 Z"
          fill="url(#bodyGrad)"
          stroke="#22c55e"
          strokeWidth="1.5"
          strokeOpacity="0.4"
        />
        <path
          d="M190 288 Q460 256 780 272"
          stroke="url(#accentLine)"
          strokeWidth="2"
          fill="none"
          opacity="0.7"
        />
        <path d="M170 308 L820 308 L808 326 L182 326 Z" fill="#0a0a0c" opacity="0.85" />
      </CarPart>

      <CarPart id="trunk">
        <path
          d="M690 172 L860 200 Q888 212 896 252 L894 272 L710 264 L690 242 Z"
          fill="#28282e"
          stroke="#555"
          strokeWidth="1"
        />
      </CarPart>

      <CarPart id="door">
        <path d="M410 162 L600 152 L612 262 L408 268 Z" fill="#222228" stroke="#555" strokeWidth="1" />
        <rect x="548" y="218" width="32" height="9" rx="4" fill="#22c55e" opacity="0.75" />
        <line x1="510" y1="168" x2="510" y2="258" stroke="#3a3a3e" strokeWidth="1.5" />
      </CarPart>

      <CarPart id="hood">
        <path d="M268 172 L400 150 L418 268 L268 276 L230 228 Z" fill="#25252a" stroke="#555" strokeWidth="1" />
        <path d="M278 188 L388 168 L402 248 L288 258 Z" fill="#1a1a1f" opacity="0.55" />
      </CarPart>

      <CarPart id="roof">
        <path
          d="M330 150 L540 140 L660 148 L690 172 L600 152 L410 162 L330 150 Z"
          fill="url(#glassGrad)"
          stroke="#22c55e"
          strokeWidth="0.8"
          strokeOpacity="0.35"
        />
        <path d="M350 152 L520 142 L640 150 L580 158 L390 166 Z" fill="white" opacity="0.07" />
      </CarPart>

      <CarPart id="front-bumper">
        <path
          d="M68 298 Q68 258 100 248 L100 318 L68 318 Q58 308 68 298 Z"
          fill="#18181c"
          stroke="#444"
          strokeWidth="1"
        />
      </CarPart>

      <CarPart id="headlight">
        <path
          d="M98 252 L138 242 L150 278 L112 290 Z"
          fill="#2a3848"
          stroke="#22c55e"
          strokeWidth="1.2"
          filter="url(#glow)"
        />
        <circle cx="122" cy="266" r="6" fill="#e8d5a3" opacity="0.85" />
      </CarPart>

      <CarPart id="taillight">
        <path d="M882 252 L898 256 L896 284 L876 278 Z" fill="#5a1818" stroke="#e04040" strokeWidth="1" />
        <path d="M884 258 L894 261 L892 276 L884 273 Z" fill="#ff4444" opacity="0.55" filter="url(#glow)" />
      </CarPart>

      <CarPart id="mirror">
        <ellipse cx="388" cy="184" rx="16" ry="9" fill="#252528" stroke="#555" strokeWidth="1" />
        <ellipse cx="388" cy="184" rx="11" ry="6" fill="#1a2838" opacity="0.85" />
      </CarPart>

      <CarPart id="radiator">
        <rect x="100" y="272" width="28" height="40" rx="4" fill="#111" stroke="#444" strokeWidth="1" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <line
            key={i}
            x1={104 + i * 4}
            y1="274"
            x2={104 + i * 4}
            y2="310"
            stroke="#333"
            strokeWidth="1"
          />
        ))}
      </CarPart>
    </>
  );
}
