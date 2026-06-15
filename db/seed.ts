/**
 * db/seed.ts — Tạo dữ liệu mẫu để test
 *
 * Chạy: npm run db:seed
 *
 * Tạo:
 *   - 1 teacher: teacher1 / teacher123
 *   - 1 class: "Lớp 7A - T3/T6" (thuộc teacher1)
 *   - 3 students: nguyên / nguyen123, an / an123, bình / binh123
 *   - 1 parent: phuhuynh1 / ph123 (linked với nguyên)
 *
 * Idempotent: nếu data đã tồn tại → skip
 */

import crypto from "node:crypto";
import { getDb, closeDb } from "./client";

function hashPassword(password: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function createUser(
  username: string,
  password: string,
  name: string,
  role: "student" | "parent" | "teacher" | "admin",
  extras: Record<string, any> = {}
): string {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as
    | { id: string }
    | undefined;
  if (existing) {
    console.log(`  ⏭️  ${username} đã tồn tại (id: ${existing.id})`);
    return existing.id;
  }

  const { hash, salt } = hashPassword(password);
  const id = crypto.randomUUID();

  db.prepare(
    `INSERT INTO users (id, username, password_hash, password_salt, role, name, level, cefr_level, goal, daily_goal_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    username,
    hash,
    salt,
    role,
    name,
    extras.level || null,
    extras.cefr_level || null,
    extras.goal || null,
    extras.daily_goal_minutes || 15
  );

  console.log(`  ✓ Tạo ${role}: ${username} / ${password} (${name})`);
  return id;
}

function seed() {
  console.log("\n🌱 Seeding sample data...\n");

  // Teacher
  const teacherId = createUser("teacher1", "teacher123", "Cô Thảo", "teacher");

  // Students
  const nguyenId = createUser("nguyen", "nguyen123", "Nguyên", "student", {
    level: "Intermediate",
    cefr_level: "A2",
    goal: "Tổng quát",
    daily_goal_minutes: 15,
  });
  createUser("an", "an123", "An", "student", {
    level: "Beginner",
    cefr_level: "A1",
    goal: "Học thuật",
    daily_goal_minutes: 15,
  });
  const binhId = createUser("binh", "binh123", "Bình", "student", {
    level: "Advanced",
    cefr_level: "B1",
    goal: "IELTS",
    daily_goal_minutes: 30,
  });

  // Parent (linked với Nguyên)
  const phId = createUser("phuhuynh1", "ph123", "Mẹ Nguyên", "parent");

  const db = getDb();
  const alreadyLinked = db
    .prepare("SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?")
    .get(phId, nguyenId);
  if (!alreadyLinked) {
    db.prepare(
      "INSERT INTO parent_links (parent_id, student_id, relationship) VALUES (?, ?, 'mother')"
    ).run(phId, nguyenId);
    console.log("  ✓ Link parent ↔ Nguyên");
  }

  // Class (1 lớp của teacher1 với 3 HS)
  const existingClass = db
    .prepare("SELECT id FROM classes WHERE teacher_id = ?")
    .get(teacherId) as { id: string } | undefined;

  let classId: string;
  if (existingClass) {
    classId = existingClass.id;
    console.log(`  ⏭️  Class đã tồn tại (id: ${classId})`);
  } else {
    classId = crypto.randomUUID();
    db.prepare(
      "INSERT INTO classes (id, name, teacher_id, schedule, description) VALUES (?, ?, ?, ?, ?)"
    ).run(
      classId,
      "Lớp 7A - T3/T6",
      teacherId,
      "T3,T6",
      "Lớp tiếng Anh cơ bản cho học sinh THPT"
    );
    console.log("  ✓ Tạo class: Lớp 7A - T3/T6");
  }

  // Add students to class
  const students = [
    { id: nguyenId, name: "Nguyên" },
    { id: binhId, name: "Bình" },
  ];
  for (const s of students) {
    const exists = db
      .prepare("SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?")
      .get(classId, s.id);
    if (!exists) {
      db.prepare(
        "INSERT INTO class_members (class_id, student_id) VALUES (?, ?)"
      ).run(classId, s.id);
      console.log(`  ✓ Thêm ${s.name} vào lớp`);
    }
  }

  // Sample measurement cho Nguyên
  const hasMeasure = db
    .prepare("SELECT 1 FROM skill_measurements WHERE user_id = ? LIMIT 1")
    .get(nguyenId);
  if (!hasMeasure) {
    const sampleData = [
      { skill: "read", metric: "readComprehension", value: 65 },
      { skill: "read", metric: "readSpeed", value: 120 },
      { skill: "read", metric: "readVocabInContext", value: 50 },
      { skill: "listen", metric: "listenAccuracy", value: 70 },
      { skill: "learn", metric: "vocabKnown", value: 14 },
      { skill: "learn", metric: "vocabRetention", value: 78 },
    ];
    for (const m of sampleData) {
      db.prepare(
        `INSERT INTO skill_measurements (id, user_id, skill, metric, value)
         VALUES (?, ?, ?, ?, ?)`
      ).run(crypto.randomUUID(), nguyenId, m.skill, m.metric, m.value);
    }
    console.log(`  ✓ Seed 6 measurements cho Nguyên`);

    // Sample engagement events
    const events = [
      { event: "session_start", value: null },
      { event: "task_done", value: 85 },
      { event: "task_done", value: 92 },
      { event: "session_end", value: 18 },
    ];
    for (const e of events) {
      db.prepare(
        "INSERT INTO engagement_events (id, user_id, event, value) VALUES (?, ?, ?, ?)"
      ).run(crypto.randomUUID(), nguyenId, e.event, e.value);
    }
    console.log(`  ✓ Seed 4 engagement events cho Nguyên`);
  }

  console.log("\n✨ Seed hoàn tất!\n");
  console.log("📋 Tài khoản test:");
  console.log("   Teacher:  teacher1 / teacher123");
  console.log("   Student:  nguyen   / nguyen123  (có data mẫu)");
  console.log("   Student:  an       / an123");
  console.log("   Student:  binh     / binh123");
  console.log("   Parent:   phuhuynh1 / ph123  (linked với Nguyên)\n");
}

try {
  seed();
} finally {
  closeDb();
}
