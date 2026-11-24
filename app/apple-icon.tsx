import { ImageResponse } from "next/og";

/** Biểu tượng PNG 180×180 cho iOS "Thêm vào MH chính" (iOS không dùng icon SVG). */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: "linear-gradient(135deg, #a50064 0%, #d82d8b 100%)",
          borderRadius: 40,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 512 512">
          <path
            d="M256 92 L388 142 V246 C388 330 330 394 256 424 C182 394 124 330 124 246 V142 Z"
            fill="rgba(255,255,255,0.16)"
            stroke="#ffffff"
            strokeWidth="22"
            strokeLinejoin="round"
          />
          <path
            d="M196 258 L240 302 L322 214"
            fill="none"
            stroke="#ffffff"
            strokeWidth="30"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}
