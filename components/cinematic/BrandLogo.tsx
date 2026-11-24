export interface BrandLogoProps {
  size?: number;
  className?: string;
}

/** Logo TrustPay AI: vòng tròn trắng chứa khiên đen (đồng bộ logo màn hình Hero). */
export default function BrandLogo({ size = 36, className = "" }: BrandLogoProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full ${className}`}
      style={{ width: size, height: size, backgroundColor: "#ffffff", boxShadow: "0 4px 14px rgba(0,0,0,0.16)" }}
    >
      <svg viewBox="0 0 32 32" width="72%" height="72%" focusable="false">
        <path d="M16 3 27 7v8.2c0 6.2-4.3 11.2-11 13.8C9.3 26.4 5 21.4 5 15.2V7L16 3Z" fill="#0b0b0c" />
        <path
          d="m10.8 15.8 3.8 3.8 7-7.6"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
