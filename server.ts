import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini safely
let ai: GoogleGenAI | null = null;
try {
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
    console.log("Gemini API initialized successfully on server-side.");
  } else {
    console.warn("GEMINI_API_KEY is not defined. AI Chat functions will run in backup offline-assistance mode.");
  }
} catch (err) {
  console.error("Failed to initialize GoogleGenAI client:", err);
}

// 1. Live Chat API Proxy
app.post("/api/tutor/chat", async (req, res) => {
  try {
    const { messages, userProfile } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Tham số 'messages' không hợp lệ." });
    }

    const sysInstruction = `You are Apex AI Tutor, an advanced, highly engaging, and modern English conversation partner designed for Vietnamese high schoolers aged 14-18 (Level: ${userProfile?.level || "Intermediate"}).
Rules to follow:
1. Conduct the discussion naturally in English about standard high schooler topics: study habits, technology, university majors, side projects, sports, music, and software development.
2. Maintain an encouraging, intellectual, and professional tone (comparable to ChatGPT/Notion AI). Avoid childish expressions or characters.
3. Keep answers concise—usually 2 to 3 sentences—to mimic a real chat room experience.
4. Keep the conversation flowing by periodically asking back a relevant, thought-provoking question.
5. Do not output Vietnamese translation unless explicitly asked, but use clear, structured English that fits their selected proficiency level (${userProfile?.level || "Intermediate"}).`;

    // Map message list to model format
    // Since GoogleGenAI expects clean format, let's assemble contents.
    // The messages array will contain { role: 'user' | 'assistant', content: string }
    // We should convert 'assistant' role to 'model' for Gemini SDK contents.
    const contents = messages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    }));

    if (!ai) {
      // Graceful offline fallback
      const lastMsg = messages[messages.length - 1]?.content || "";
      const backupReplies = [
        `That's highly engaging! As your offline AI mentor, let me suggest focusing on active recall for terms like "${lastMsg.substring(0, 10)}". (Setup your GEMINI_API_KEY for real live interactive chat!)`,
        `Fascinating point about that! In academic English, we'd structure this using sub-clauses. Let's practice drafting an argumentative paragraph!`,
        `That makes complete sense. If you are preparing for exams, try to incorporate more academic vocabularies. Shall we try?`,
        `Excellent response! Keep pushing your limits. Tell me more about what you intend to accomplish next.`
      ];
      const selected = backupReplies[Math.floor(Math.random() * backupReplies.length)];
      return res.json({ text: selected });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: contents,
      config: {
        systemInstruction: sysInstruction,
        temperature: 0.7,
      }
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Error during server-side Gemini Chat generate:", error);
    res.status(500).json({ error: error.message || "Đã xảy ra lỗi khi trao đổi với AI Tutor." });
  }
});

// 2. Action Helper API (Sửa lỗi, Gợi ý trả lời, Dịch nghĩa)
app.post("/api/tutor/analyze", async (req, res) => {
  try {
    const { action, text, contextMessage } = req.body;
    if (!action || !text) {
      return res.status(400).json({ error: "Thiếu thông tin phân tích cần thiết." });
    }

    if (!ai) {
      // Standard offline static explanations
      if (action === "fix") {
        return res.json({
          analysis: `✨ **Offline analysis**: Your sentence looks structurally solid. \n\n*Configure the **GEMINI_API_KEY** in Secrets to receive real-time granular spelling & style corrections from ChatGPT-style LLM!*`
        });
      } else if (action === "suggest") {
        return res.json({
          analysis: `💡 **Kiến nghị 3 cách phản hồi tối ưu (Offline):**\n\n1. *"I understand your perspective, let's explore more structural evidence..."*\n2. *"That sounds like a fascinating pursuit. What inspired this?"*\n3. *"From my point of view, advanced technical projects play a major role in..."*`
        });
      } else {
        return res.json({
          analysis: `🇻🇳 **Bản dịch Offline tương đối**: \n\n"${text}" \n\n*(Setup một API Key thực tế để dịch chuyên khoa và thành ngữ văn học!)*`
        });
      }
    }

    let sysInstruction = "";
    let prompt = "";

    if (action === "fix") {
      sysInstruction = "You are a professional ESL teacher and style editor for high schoolers (14-18) preparing for college standard English.";
      prompt = `Review the following English sentence: "${text}".
Provide a concise, aesthetic critique using Markdown highlighting:
1. **Grammar & Spelling check**: Did they make any mistakes? If so, point them out.
2. **Standard correction**: Give a natural, highly polished way to write it.
3. **Advanced alternative**: Provide a premium alternative using stronger vocabulary suitable for 14-18 year olds (IELTS style level 6.0-7.5).
Keep your formatting extremely clean and short using bullet points.`;
    } else if (action === "suggest") {
      sysInstruction = "You are an English conversation instigator for teenagers preparing for Standardised tests.";
      prompt = `For this tutor comment: "${text}", suggest 3 clean, highly natural, mature ways the student can respond in English. Each option should represent a different style (e.g., Option 1: Academically analytical, Option 2: Personal & detailed, Option 3: Curious/questioning).
Present only the 3 options with a 1-line English explanation for each. Keep it incredibly practical and clean!`;
    } else if (action === "translate") {
      sysInstruction = "You are a highly efficient bilingual translator translating educational English text into beautiful, natural Vietnamese.";
      prompt = `Translate this text precisely into natural, non-robotic modern Vietnamese: "${text}". Keep it clean and polite, fitting high school standard learners. Only output the direct translation, nothing else.`;
    } else {
      return res.status(400).json({ error: "Hành động phân tích không được hỗ trợ." });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction: sysInstruction,
        temperature: 0.3,
      }
    });

    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error("Error during server-side Gemini Analyze:", error);
    res.status(500).json({ error: error.message || "Đã xảy ra lỗi khi phân tích bằng AI." });
  }
});

// 3. Integration with Vite (with safe production handler)
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Mounted Vite development middleware.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving static production files from /dist.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server started on http://0.0.0.0:${PORT}`);
  });
}

startServer();
