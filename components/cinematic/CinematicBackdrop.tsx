"use client";

import { useEffect, useRef } from "react";
import { CINEMATIC_VIDEO_SRC } from "@/lib/cinematic/cinematic";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { usePrefersReducedMotion } from "@/lib/hooks/use-media-query";

export interface CinematicBackdropProps {
  /** "hero" = nền rõ; "workspace" = video mờ phía sau các thẻ kính tối. */
  mode: "hero" | "workspace";
  /** false → tạm dừng video để tiết kiệm pin. */
  playing: boolean;
}

/**
 * `<div class="bg">` cố định toàn màn hình (nền #000) chứa `<video class="bg-video">`
 * phủ kín (`object-fit: cover`, không nhận chạm). Video chỉ gắn sau khi hydrate;
 * `prefers-reduced-motion: reduce` → không tự phát, dừng ở khung hình đầu tiên.
 */
export default function CinematicBackdrop({ mode, playing }: CinematicBackdropProps) {
  const mounted = useHasMounted();
  const reducedMotion = usePrefersReducedMotion();
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.defaultMuted = true;
    if (reducedMotion || !playing) {
      video.pause();
      if (reducedMotion) {
        try {
          video.currentTime = 0;
        } catch {
          // Chưa có metadata — nền #000 vẫn hiển thị.
        }
      }
      return;
    }
    const attempt = video.play();
    if (attempt !== undefined) {
      attempt.catch(() => {
        // Trình duyệt chặn tự phát (chế độ tiết kiệm pin…) → giữ nền #000.
      });
    }
  }, [mounted, reducedMotion, playing]);

  return (
    <div aria-hidden="true" className="bg" data-mode={mode}>
      {mounted && (
        <video
          ref={videoRef}
          className="bg-video"
          src={CINEMATIC_VIDEO_SRC}
          autoPlay={!reducedMotion}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          tabIndex={-1}
        />
      )}
      <div className="bg-shade" />
    </div>
  );
}
