"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Sparkles,
  ImagePlus,
  X,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  Send,
  FileImage,
  Wand2,
} from "lucide-react";
import { DEMO_SCENARIOS, type DemoScenario } from "@/lib/mock-scenarios";
import type {
  BudgetCategory,
  TransactionAnalysisRequest,
  TransactionAnalysisResponse,
} from "@/types/trustpay";

export interface TransactionInputPanelProps {
  budgets: BudgetCategory[];
  blacklist: string[];
  onAnalysisComplete: (
    result: TransactionAnalysisResponse,
    meta: { commandText: string; imageBase64?: string }
  ) => void;
  onAnalyzingChange?: (isAnalyzing: boolean) => void;
}

function getScenarioStyle(scenario: DemoScenario, isSelected: boolean) {
  if (scenario.expectedRiskLevel === "HIGH") {
    return {
      card: isSelected
        ? "border-rose-400 bg-rose-50 ring-2 ring-rose-200"
        : "border-rose-200/80 bg-rose-50/40 hover:border-rose-300 hover:bg-rose-50/80",
      badge: "bg-rose-100 text-rose-700",
      Icon: ShieldAlert,
      iconColor: "text-rose-600",
    };
  }

  if (scenario.expectedBudgetExceeded) {
    return {
      card: isSelected
        ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
        : "border-amber-200/80 bg-amber-50/40 hover:border-amber-300 hover:bg-amber-50/80",
      badge: "bg-amber-100 text-amber-800",
      Icon: AlertTriangle,
      iconColor: "text-amber-600",
    };
  }

  return {
    card: isSelected
      ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200"
      : "border-emerald-200/80 bg-emerald-50/40 hover:border-emerald-300 hover:bg-emerald-50/80",
    badge: "bg-emerald-100 text-emerald-700",
    Icon: ShieldCheck,
    iconColor: "text-emerald-600",
  };
}

export default function TransactionInputPanel({
  budgets,
  blacklist,
  onAnalysisComplete,
  onAnalyzingChange,
}: TransactionInputPanelProps) {
  const [commandText, setCommandText] = useState("");
  const [imageBase64, setImageBase64] = useState<string | undefined>(undefined);
  const [imageName, setImageName] = useState<string>("");
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectScenario = (scenario: DemoScenario) => {
    setCommandText(scenario.commandText);
    setActiveScenarioId(scenario.id);
    setErrorMsg(null);
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrorMsg("Vui lòng chọn tệp hình ảnh hợp lệ (PNG, JPG, WebP...).");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg("Kích thước ảnh tối đa 5MB để đảm bảo phân tích nhanh.");
      return;
    }

    setErrorMsg(null);
    setImageName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImageBase64(undefined);
    setImageName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e?: FormEvent) => {
    e?.preventDefault();

    const trimmed = commandText.trim();
    if (!trimmed && !imageBase64) {
      setErrorMsg(
        "Vui lòng nhập lệnh chuyển tiền hoặc tải lên ảnh hóa đơn / tin nhắn nghi vấn."
      );
      return;
    }

    setErrorMsg(null);
    setIsAnalyzing(true);
    onAnalyzingChange?.(true);

    try {
      const payload: TransactionAnalysisRequest = {
        commandText: trimmed,
        ...(imageBase64 ? { imageBase64 } : {}),
        currentBudgets: budgets,
        blacklist,
      };

      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Lỗi kết nối máy chủ phân tích (${response.status})`);
      }

      const data = (await response.json()) as TransactionAnalysisResponse;
      onAnalysisComplete(data, { commandText: trimmed, imageBase64 });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Không thể phân tích giao dịch lúc này. Vui lòng thử lại."
      );
    } finally {
      setIsAnalyzing(false);
      onAnalyzingChange?.(false);
    }
  };

  return (
    <div className="rounded-3xl border border-pink-100 bg-white p-6 shadow-sm shadow-[#a50064]/5">
      {/* Tiêu đề */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#a50064] to-[#d82d8b] text-white shadow-sm shadow-[#a50064]/25">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Chuyển tiền thông minh &amp; Quét Lá chắn AI
            </h2>
            <p className="text-xs text-slate-500">
              Nhập câu lệnh tự nhiên hoặc đính kèm ảnh hóa đơn / tin nhắn nghi
              vấn để AI kiểm tra trước khi chuyển
            </p>
          </div>
        </div>
      </div>

      {/* Hàng 4 nút kịch bản Demo 1-click */}
      <div className="mb-5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
            <Sparkles className="h-3.5 w-3.5 text-[#a50064]" />
            Kịch bản Demo nhanh (1-click cho Ban Giám Khảo)
          </span>
          <span className="text-[11px] text-slate-400">
            Chọn để tự động điền lệnh
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {DEMO_SCENARIOS.map((scenario) => {
            const isSelected = activeScenarioId === scenario.id;
            const style = getScenarioStyle(scenario, isSelected);
            const Icon = style.Icon;

            return (
              <button
                key={scenario.id}
                type="button"
                disabled={isAnalyzing}
                onClick={() => handleSelectScenario(scenario)}
                className={`group flex cursor-pointer flex-col items-start rounded-2xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-60 ${style.card}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${style.iconColor}`} />
                    <span className="line-clamp-1">{scenario.label}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`}
                  >
                    {scenario.badge}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-600">
                  {scenario.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form nhập liệu */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <label
            htmlFor="trustpay-command-input"
            className="mb-1.5 block text-xs font-semibold text-slate-700"
          >
            Lệnh chuyển tiền bằng ngôn ngữ tự nhiên
          </label>
          <textarea
            id="trustpay-command-input"
            rows={3}
            value={commandText}
            disabled={isAnalyzing}
            onChange={(e) => {
              setCommandText(e.target.value);
              setActiveScenarioId(null);
              if (errorMsg) setErrorMsg(null);
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder='Ví dụ: "Chuyển 45.000đ tiền bún bò cho Quán Cô Ba" hoặc dán nội dung tin nhắn yêu cầu chuyển khoản...'
            className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-[#d82d8b] focus:bg-white focus:ring-4 focus:ring-pink-100 focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* Khu vực tải ảnh & preview nhỏ */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageChange}
              className="hidden"
            />

            <button
              type="button"
              disabled={isAnalyzing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-pink-200 bg-pink-50 px-3.5 py-2 text-xs font-semibold text-[#a50064] transition-all hover:border-[#d82d8b] hover:bg-pink-100/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ImagePlus className="h-4 w-4" />
              <span>Tải ảnh / Chụp hóa đơn &amp; tin nhắn</span>
            </button>

            {!imageBase64 && (
              <span className="hidden text-xs text-slate-400 sm:inline">
                Hỗ trợ OCR qua Amazon Rekognition (PNG, JPG &le; 5MB)
              </span>
            )}
          </div>

          {/* Preview ảnh nhỏ */}
          {imageBase64 && (
            <div className="flex items-center gap-2.5 rounded-xl border border-pink-200 bg-white py-1.5 pr-2 pl-1.5 shadow-2xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageBase64}
                alt="Ảnh hóa đơn hoặc tin nhắn đính kèm"
                className="h-10 w-10 rounded-lg object-cover ring-1 ring-slate-200"
              />
              <div className="max-w-36">
                <p className="flex items-center gap-1 truncate text-xs font-semibold text-slate-800">
                  <FileImage className="h-3 w-3 shrink-0 text-[#a50064]" />
                  <span className="truncate">{imageName || "Ảnh đính kèm"}</span>
                </p>
                <p className="text-[10px] text-emerald-600 font-medium">
                  Đã sẵn sàng quét OCR
                </p>
              </div>
              <button
                type="button"
                onClick={handleRemoveImage}
                title="Xóa ảnh đính kèm"
                className="flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Thông báo lỗi nếu có */}
        {errorMsg && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Nút gửi phân tích */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] text-slate-400">
            Mẹo: Nhấn <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Ctrl</kbd> +{" "}
            <kbd className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">Enter</kbd> để gửi nhanh
          </p>

          <button
            type="submit"
            disabled={isAnalyzing || (!commandText.trim() && !imageBase64)}
            className="inline-flex cursor-pointer items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#a50064] to-[#d82d8b] px-6 py-3.5 text-sm font-semibold text-white shadow-md shadow-[#a50064]/25 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Lá chắn AI đang phân tích rủi ro...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Phân tích giao dịch với Lá chắn AI</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
