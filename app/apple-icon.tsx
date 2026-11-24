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
          background: "#000000",
        }}
      >
        <div
          style={{
            width: 124,
            height: 124,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 62,
            background: "#ffffff",
          }}
        >
          <svg width="80" height="80" viewBox="0 0 32 32">
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
        </div>
      </div>
    ),
    { ...size },
  );
}
