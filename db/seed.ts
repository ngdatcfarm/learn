/**
 * db/seed.ts — Tạo dữ liệu mẫu để test (MySQL)
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
 *
 * Khác biệt với SQLite:
 * - Mọi DB call là async (await)
 * - `?` placeholders giống nhau (mysql2 compatible)
 * - Không có `RETURNING` — code này tự generate UUID nên không cần
 */

import crypto from "node:crypto";
import { getPool, queryOne, query, closePool, RowDataPacket } from "./client";
import { hashPassword } from "../server/passwords";

interface UserExtras {
  level?: string;
  cefr_level?: string;
  goal?: string;
  daily_goal_minutes?: number;
}

async function createUser(
  username: string,
  password: string,
  name: string,
  role: "student" | "parent" | "teacher" | "admin",
  extras: UserExtras = {}
): Promise<string> {
  const existing = await queryOne<RowDataPacket & { id: string }>(
    "SELECT id FROM users WHERE username = ?",
    [username]
  );
  if (existing) {
    console.log(`  ⏭️  ${username} đã tồn tại (id: ${existing.id})`);
    return existing.id;
  }

  const { hash, salt } = hashPassword(password);
  const id = crypto.randomUUID();

  await query(
    `INSERT INTO users (id, username, password_hash, password_salt, role, name, level, cefr_level, goal, daily_goal_minutes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      username,
      hash,
      salt,
      role,
      name,
      extras.level || null,
      extras.cefr_level || null,
      extras.goal || null,
      extras.daily_goal_minutes || 15,
    ]
  );

  console.log(`  ✓ Tạo ${role}: ${username} / ${password} (${name})`);
  return id;
}

async function seed(): Promise<void> {
  console.log("\n🌱 Seeding sample data...\n");

  // Teacher
  const teacherId = await createUser("teacher1", "teacher123", "Cô Thảo", "teacher");

  // Students
  const nguyenId = await createUser("nguyen", "nguyen123", "Nguyên", "student", {
    level: "Intermediate",
    cefr_level: "A2",
    goal: "Tổng quát",
    daily_goal_minutes: 15,
  });
  await createUser("an", "an123", "An", "student", {
    level: "Beginner",
    cefr_level: "A1",
    goal: "Học thuật",
    daily_goal_minutes: 15,
  });
  const binhId = await createUser("binh", "binh123", "Bình", "student", {
    level: "Advanced",
    cefr_level: "B1",
    goal: "IELTS",
    daily_goal_minutes: 30,
  });

  // Parent (linked với Nguyên)
  const phId = await createUser("phuhuynh1", "ph123", "Mẹ Nguyên", "parent");

  const alreadyLinked = await queryOne(
    "SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?",
    [phId, nguyenId]
  );
  if (!alreadyLinked) {
    await query(
      "INSERT INTO parent_links (parent_id, student_id, relationship) VALUES (?, ?, 'mother')",
      [phId, nguyenId]
    );
    console.log("  ✓ Link parent ↔ Nguyên");
  }

  // Class (1 lớp của teacher1)
  const existingClass = await queryOne<RowDataPacket & { id: string }>(
    "SELECT id FROM classes WHERE teacher_id = ?",
    [teacherId]
  );

  let classId: string;
  if (existingClass) {
    classId = existingClass.id;
    console.log(`  ⏭️  Class đã tồn tại (id: ${classId})`);
  } else {
    classId = crypto.randomUUID();
    await query(
      "INSERT INTO classes (id, name, teacher_id, schedule, description) VALUES (?, ?, ?, ?, ?)",
      [
        classId,
        "Lớp 7A - T3/T6",
        teacherId,
        "T3,T6",
        "Lớp tiếng Anh cơ bản cho học sinh THPT",
      ]
    );
    console.log("  ✓ Tạo class: Lớp 7A - T3/T6");
  }

  // Add students to class
  const students = [
    { id: nguyenId, name: "Nguyên" },
    { id: binhId, name: "Bình" },
  ];
  for (const s of students) {
    const exists = await queryOne(
      "SELECT 1 FROM class_members WHERE class_id = ? AND student_id = ?",
      [classId, s.id]
    );
    if (!exists) {
      await query("INSERT INTO class_members (class_id, student_id) VALUES (?, ?)", [
        classId,
        s.id,
      ]);
      console.log(`  ✓ Thêm ${s.name} vào lớp`);
    }
  }

  // Sample measurement cho Nguyên
  const hasMeasure = await queryOne(
    "SELECT 1 FROM skill_measurements WHERE user_id = ? LIMIT 1",
    [nguyenId]
  );
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
      await query(
        `INSERT INTO skill_measurements (id, user_id, skill, metric, value)
         VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), nguyenId, m.skill, m.metric, m.value]
      );
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
      await query(
        "INSERT INTO engagement_events (id, user_id, event, value) VALUES (?, ?, ?, ?)",
        [crypto.randomUUID(), nguyenId, e.event, e.value]
      );
    }
    console.log(`  ✓ Seed 4 engagement events cho Nguyên`);
  }

  // Sample flashcard vocab (Step 9f) — teacher-owned, shared to all HS
  const existingFlashcards = await queryOne<RowDataPacket & { c: number }>(
    "SELECT COUNT(*) AS c FROM question_bank WHERE template_type = 'flashcard'"
  );
  if (!existingFlashcards || existingFlashcards.c === 0) {
    const flashcards = [
      { topic: "Daily life", level: "A1", term: "wake up",         phonetic: "/weɪk ʌp/",          explanation: "Thức dậy",                                          example: "I wake up at 6 AM every day." },
      { topic: "Daily life", level: "A1", term: "have breakfast",  phonetic: "/hæv ˈbrekfəst/",    explanation: "Ăn sáng",                                            example: "Do you have breakfast before school?" },
      { topic: "School",    level: "A2", term: "homework",        phonetic: "/ˈhəʊmwɜːk/",       explanation: "Bài tập về nhà",                                     example: "I usually do my homework after dinner." },
      { topic: "School",    level: "A2", term: "classmate",       phonetic: "/ˈklɑːsmeɪt/",      explanation: "Bạn cùng lớp",                                       example: "My classmate helps me with math." },
      { topic: "Travel",    level: "A2", term: "passport",        phonetic: "/ˈpɑːspɔːt/",       explanation: "Hộ chiếu",                                           example: "Don't forget your passport at the airport." },
      { topic: "Travel",    level: "A2", term: "suitcase",        phonetic: "/ˈsuːtkeɪs/",       explanation: "Vali",                                               example: "She packed her suitcase the night before." },
      { topic: "Food",      level: "A1", term: "hungry",          phonetic: "/ˈhʌŋɡri/",         explanation: "Đói",                                                example: "I'm hungry. Can we eat now?" },
      { topic: "Food",      level: "A2", term: "delicious",       phonetic: "/dɪˈlɪʃəs/",        explanation: "Ngon, tuyệt vời",                                     example: "This noodle soup is delicious!" },
      { topic: "Weather",   level: "A1", term: "rainy",           phonetic: "/ˈreɪni/",          explanation: "Có mưa",                                             example: "It's rainy today, bring an umbrella." },
      { topic: "Weather",   level: "A2", term: "stormy",          phonetic: "/ˈstɔːmi/",         explanation: "Có bão",                                             example: "The weather is stormy this weekend." },
      { topic: "Feelings",  level: "A2", term: "excited",         phonetic: "/ɪkˈsaɪtɪd/",      explanation: "Hào hứng, phấn khích",                                example: "I'm excited about the school trip." },
      { topic: "Feelings",  level: "A2", term: "nervous",         phonetic: "/ˈnɜːvəs/",        explanation: "Lo lắng, hồi hộp",                                   example: "She feels nervous before the speaking test." },
    ];
    for (const f of flashcards) {
      await query(
        `INSERT INTO question_bank
            (id, owner_id, is_shared, template_type, topic, level, content_json, quality_score)
         VALUES (?, ?, 1, 'flashcard', ?, ?, ?, ?)`,
        [
          crypto.randomUUID(),
          teacherId,
          f.topic,
          f.level,
          JSON.stringify({
            term: f.term,
            phonetic: f.phonetic,
            explanation: f.explanation,
            example: f.example,
          }),
          4.5,
        ]
      );
    }
    console.log(`  ✓ Seed ${flashcards.length} flashcard vocab (shared)`);
  }

  console.log("\n✨ Seed hoàn tất!\n");
  console.log("📋 Tài khoản test:");
  console.log("   Teacher:  teacher1 / teacher123");
  console.log("   Student:  nguyen   / nguyen123  (có data mẫu)");
  console.log("   Student:  an       / an123");
  console.log("   Student:  binh     / binh123");
  console.log("   Parent:   phuhuynh1 / ph123  (linked với Nguyên)\n");
}

// ============================================================
// Run khi file này được execute trực tiếp
// ============================================================
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]}` ||
  process.argv[1]?.endsWith("seed.ts") ||
  process.argv[1]?.endsWith("seed.js");

if (isDirectRun) {
  (async () => {
    try {
      await seed();
    } catch (err: any) {
      console.error("❌ Seed failed:", err.message);
      process.exit(1);
    } finally {
      await closePool();
    }
  })();
}
