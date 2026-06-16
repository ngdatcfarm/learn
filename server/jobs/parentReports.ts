/**
 * server/jobs/parentReports.ts — Scheduled parent report sender
 *
 * Cron hourly. Mỗi tick:
 *   1. Đọc parent_report_settings.id=1
 *   2. Nếu frequency='off' → bail
 *   3. Tính "next send time" theo frequency + send_time + send_day_of_week
 *   4. Nếu NOW() trong ±15 phút cửa sổ next send → loop all parents:
 *      - Build report (gọi computeCurrentSkills + computeEngagement cho từng con)
 *      - Call sendZaloMessage (stub)
 *      - Log to audit_log
 *   5. Trả { rowsAffected: số parent đã gửi }
 *
 * Hourly tick (không per-frequency) để uniform handling khi admin đổi config.
 */

import { query, queryOne, RowDataPacket } from "../../db/client";
import { computeCurrentSkills, computeEngagement } from "../skills";
import { sendZaloMessage } from "../zalo";
import { logAudit } from "../audit";

interface SettingsRow extends RowDataPacket {
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "off";
  send_time: string; // "HH:MM:SS"
  send_day_of_week: number | null; // 1-7
  zalo_oa_id: string | null;
  zalo_access_token: string | null;
  zalo_template_id: string | null;
  zalo_template_data_json: string | null;
  include_skills: number;
  include_streak: number;
  include_minutes: number;
  include_needs_help: number;
  custom_message: string | null;
}

interface ParentChildRow extends RowDataPacket {
  parent_id: string;
  parent_name: string;
  student_id: string;
  student_name: string;
}

/**
 * Kiểm tra xem NOW() có nằm trong cửa sổ ±15 phút của "next send time" hay không.
 * Logic: so sánh với send_time HH:MM:SS. Nếu là weekly/biweekly, còn check thêm day-of-week.
 */
function isInSendWindow(settings: SettingsRow, now: Date): boolean {
  if (settings.frequency === "off") return false;

  // Day-of-week check (MySQL DAYOFWEEK: 1=Sun..7=Sat; ta dùng 1=Mon..7=Sun theo spec)
  // Quy ước: dow=null → áp dụng cho mọi ngày
  if (settings.send_day_of_week != null) {
    const jsDow = now.getDay(); // 0=Sun..6=Sat
    // Convert sang 1=Mon..7=Sun
    const ourDow = jsDow === 0 ? 7 : jsDow;
    if (ourDow !== settings.send_day_of_week) return false;
  }

  // Time window: send_time ± 15 min
  // Parse "HH:MM:SS" (server trả "HH:MM:SS" string do dateStrings:true)
  const [h, m] = settings.send_time.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return false;

  const sendMinutes = h * 60 + m;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const diff = Math.abs(nowMinutes - sendMinutes);
  // Xử lý wrap-around midnight
  const wrappedDiff = Math.min(diff, 24 * 60 - diff);
  return wrappedDiff <= 15;
}

function buildReportData(
  childName: string,
  skills: Awaited<ReturnType<typeof computeCurrentSkills>>,
  engagement: Awaited<ReturnType<typeof computeEngagement>>,
  flags: { skills: boolean; streak: boolean; minutes: boolean; needsHelp: boolean },
  customMessage: string | null
): Record<string, unknown> {
  const data: Record<string, unknown> = { child_name: childName };
  if (flags.streak) data.streak = engagement.streak;
  if (flags.minutes) data.avg_minutes = engagement.avgSessionMinutes;
  if (flags.skills) {
    const num = (v: number | string | null | undefined) =>
      Math.round(typeof v === "number" ? v : 0);
    data.read_score = num(skills.read?.readComprehension);
    data.write_score = num(skills.write?.writeCoherence) * 10; // 0-10 → 0-100
    data.listen_score = num(skills.listen?.listenAccuracy);
    data.speak_score = num(skills.speak?.speakPronunciation);
    data.learn_score = num(skills.learn?.vocabRetention);
  }
  if (customMessage) data.custom_message = customMessage;
  return data;
}

export async function runParentReports(): Promise<{ rowsAffected: number }> {
  // 1. Read singleton config
  const settings = await queryOne<SettingsRow>(
    `SELECT * FROM parent_report_settings WHERE id = 1`
  );
  if (!settings) return { rowsAffected: 0 };
  if (settings.frequency === "off") return { rowsAffected: 0 };
  if (!settings.zalo_oa_id || !settings.zalo_access_token || !settings.zalo_template_id) {
    return { rowsAffected: 0 };
  }

  // 2. Time window check
  const now = new Date();
  if (!isInSendWindow(settings, now)) {
    return { rowsAffected: 0 };
  }

  // 3. List all parents with their children
  const parentChildRows = (await query<ParentChildRow[]>(
    `SELECT pl.parent_id, up.name AS parent_name,
            u.id AS student_id, u.name AS student_name
     FROM parent_links pl
     JOIN users up ON up.id = pl.parent_id
     JOIN users u ON u.id = pl.student_id
     WHERE up.deleted_at IS NULL AND u.deleted_at IS NULL`
  )) as ParentChildRow[];

  if (parentChildRows.length === 0) return { rowsAffected: 0 };

  // 4. Send (parallel — mỗi parent xử lý độc lập)
  const cfg = {
    oaId: settings.zalo_oa_id,
    accessToken: settings.zalo_access_token,
    templateId: settings.zalo_template_id,
  };
  const flags = {
    skills: !!settings.include_skills,
    streak: !!settings.include_streak,
    minutes: !!settings.include_minutes,
    needsHelp: !!settings.include_needs_help,
  };
  const results = await Promise.allSettled(
    parentChildRows.map(async (row) => {
      const [skills, engagement] = await Promise.all([
        computeCurrentSkills(row.student_id),
        computeEngagement(row.student_id),
      ]);
      const data = buildReportData(
        row.student_name,
        skills,
        engagement,
        flags,
        settings.custom_message
      );
      await sendZaloMessage(cfg, row.parent_id, data);
      await logAudit({
        actorId: null, // system/cron
        action: "zalo.send_stub",
        targetType: "parent",
        targetId: row.parent_id,
        details: {
          student_id: row.student_id,
          student_name: row.student_name,
          template: settings.zalo_template_id,
        },
      });
    })
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(
        `[parentReports] fail for parent=${parentChildRows[i].parent_id}:`,
        r.reason?.message || r.reason
      );
    }
  });

  return { rowsAffected: sent };
}
