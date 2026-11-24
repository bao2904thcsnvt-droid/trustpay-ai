import { useId } from "react";

export interface BrandLogoProps {
  size?: number;
  className?: string;
}

/**
 * Logo TrustPay AI: 2 nét chéo song song cách điệu (vàng kim → xanh băng) trên ô kính
 * tối. Nền ô luôn tối nên logo rõ trên cả Dark Cinematic lẫn Light mode.
 */
export default function BrandLogo({ size = 36, className = "" }: BrandLogoProps) {
  // `useId` có thể chứa ký tự không hợp lệ trong `url(#…)` → chỉ giữ chữ, số, `_` và `-`.
  const gradientId = `tp-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const stroke = `url(#${gradientId})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="6" y1="6" x2="34" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffe4b6" />
          <stop offset="1" stopColor="#bae0f7" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="12" fill="#070c17" />
      <rect x="1" y="1" width="38" height="38" rx="12" stroke={stroke} strokeOpacity="0.7" strokeWidth="1.2" />
      <path d="M12.6 27.8 20.4 11.8" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M19.6 28.4 27.4 12.4" stroke={stroke} strokeWidth="3.4" strokeLinecap="round" strokeOpacity="0.72" />
    </svg>
  );
}
