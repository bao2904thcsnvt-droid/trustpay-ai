/**
 * Đường dẫn cũ (vd `QrInspector`) — máy quét đã chuyển sang `components/QrCameraScanner.tsx`
 * (BarcodeDetector gốc + jsQR nạp lười cho iPhone Safari / Firefox). Giữ nguyên hợp đồng props.
 */
export { default } from "@/components/QrCameraScanner";
export type { CameraQrScannerProps } from "@/components/QrCameraScanner";
