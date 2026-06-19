/**
 * src/components/livehelp/HelpRequestModal.tsx
 *
 * HS bấm "🆘 Cần hỗ trợ" → mở modal này → nhập message ngắn → submit.
 * Tạo session mới (status='pending'). Đóng modal sau khi tạo thành công.
 *
 * Sau khi submit → parent tự mở LiveHelpModal để HS chờ GV phản hồi.
 */

import { useState } from "react";
import { ModalShell } from "../ui/ModalShell";
import { Field, inputStyle, inputClass } from "../ui/Field";
import { liveHelpRequest } from "../../api/client";

export interface HelpRequestModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export function HelpRequestModal({ onClose, onCreated }: HelpRequestModalProps) {
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await liveHelpRequest({
        message: message.trim() || undefined,
      });
      onCreated();
    } catch (e: any) {
      // 409 = đã có session đang chờ
      if (e?.status === 409) {
        setError("Em đã có yêu cầu đang chờ. Mở phiên đang chờ nhé!");
        setTimeout(() => onCreated(), 800);
      } else {
        setError(e?.error || "Không gửi được yêu cầu. Thử lại sau.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="🆘 Cần hỗ trợ" onClose={onClose} maxWidth="max-w-sm">
      <p className="text-sm" style={{ color: "var(--muted-strong)" }}>
        GV sẽ thấy yêu cầu của em và phản hồi sớm nhất có thể. Em có thể mô tả ngắn
        về chỗ đang bí để GV hỗ trợ nhanh hơn nhé.
      </p>

      <Field label="Mô tả ngắn (không bắt buộc)">
        <textarea
          className={inputClass()}
          style={inputStyle}
          rows={3}
          maxLength={500}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="VD: Em bí câu số 5 phần Reading..."
        />
      </Field>

      {error && (
        <div
          className="text-xs px-3 py-2 rounded-xl font-bold"
          style={{ backgroundColor: "var(--primary-soft)", color: "var(--primary)" }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button
          onClick={onClose}
          className="px-3 py-2 rounded-xl text-xs font-bold"
          style={{ color: "var(--muted-strong)" }}
          disabled={submitting}
        >
          Huỷ
        </button>
        <button
          onClick={submit}
          disabled={submitting}
          className="px-4 py-2 rounded-xl text-xs font-extrabold disabled:opacity-50"
          style={{ backgroundColor: "var(--primary)", color: "#fff" }}
        >
          {submitting ? "Đang gửi..." : "Gửi yêu cầu"}
        </button>
      </div>
    </ModalShell>
  );
}