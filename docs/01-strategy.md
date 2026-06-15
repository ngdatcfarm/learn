# Tiếng Anh của mình — Tài liệu chiến lược & thiết kế

> Ngày tạo: 2026-06-15
> Trạng thái: Đang xây dựng — cập nhật theo từng buổi thảo luận

---

## 1. Tổng quan dự án

**Tên sản phẩm**: Tiếng Anh của mình (working name)
**Mục tiêu**: App hỗ trợ học sinh 12-15 tuổi học tiếng Anh hiệu quả thông qua mô hình **hybrid** (offline + online live + app tự học).
**Stack hiện tại**: React 19 + Vite + TypeScript + Express + Gemini AI + TailwindCSS 4
**Triết lý thiết kế**: Thân thiện, vui vẻ, hướng đến học sinh — tránh phong cách dashboard doanh nghiệp.

---

## 2. Mô hình kinh doanh Hybrid

### 2.1 Lịch học (đã chốt với chủ trung tâm)

| Hình thức | Ngày | Hoạt động chính | Công cụ |
|-----------|------|-----------------|---------|
| **Offline tại trung tâm** | CN | Học trực tiếp, kiến thức mới chuyên sâu, luyện kỹ năng trực tiếp | GV + bạn cùng lớp |
| **Online — làm bài có giám sát** | T3 | HS làm bài tập trên app, **GV giám sát qua hệ thống**: xem bạn nào sai nhiều, chỗ nào, hỗ trợ ngay khi cần | App + Dashboard giám sát |
| **Online — Google Meet** | T6 | Củng cố kiến thức cũ, **khuyến khích HS tìm hiểu kiến thức mới trên app** để sẵn sàng cho CN sau | Google Meet + App |
| **App tự học bổ trợ** | T2, T4, T5, T7 | SRS, luyện targeted, AI chat, làm quen trước bài tuần sau | App + AI |

**Vai trò giáo viên qua 3 kênh**:
1. **CN (in-person)**: GV toàn thời gian, dạy sâu
2. **T3 (app, có giám sát)**: GV "vừa làm vừa theo dõi" — không online liên tục nhưng có thể can thiệp bất cứ lúc nào qua app
3. **T6 (Google Meet)**: GV online, củng cố + định hướng

**Mô hình này gọi là Flipped Classroom**:
- Kiến thức mới được **preview trước** trên app (T6-T7) → HS đến CN đã có nền
- CN (offline) dành thời gian cho **deep dive, thảo luận, luyện kỹ năng trực tiếp** thay vì giới thiệu lại từ đầu
- T3 là **practice có giám sát** — không phải tự học mù
- T6 là **củng cố + chuẩn bị** cho tuần sau

**Nhịp 1 tuần mẫu**:
- **CN**: GV dạy chuyên sâu chủ điểm A (offline)
- **T2**: App ôn nhẹ chủ điểm A (SRS)
- **T3**: HS làm bài tập chủ điểm A trên app, **GV giám sát live qua dashboard** → can thiệp khi HS bí
- **T4, T5**: App luyện targeted theo lỗi của từng HS
- **T6**: Google Meet — củng cố A, GV giới thiệu chủ điểm B + giao HS preview B trên app
- **T7**: App preview chủ điểm B (vocab, video ngắn, đọc nhẹ)
- **CN tuần sau**: GV deep dive chủ điểm B (HS đã có nền từ T6-T7)

### 2.2 Lý do chọn hybrid (5 lý do đã chốt)

| # | Lý do | Hệ quả cho app |
|---|-------|----------------|
| 1 | Online-only phụ thuộc quá nhiều vào ý thức tự học, khó truyền đạt kiến thức cốt lõi | App phải **gamify mạnh** để tạo thói quen tự học (đặc biệt quan trọng cho ngày T3) |
| 2 | Online-only khiến HS thiếu tự tin khi tương tác trực tiếp | App phải có **không gian luyện tập riêng tư** + **khuyến khích tương tác** (T3 HS làm bài một mình, không sợ sai trước lớp) |
| 3 | Offline-only cực kỳ khó đo lường hiểu bài từng HS | App là **lớp đo lường** — đo real-time trên T3 + hàng ngày, GV xem dashboard cùng lúc HS đang làm |
| 4 | Offline không theo dõi được bài tập về nhà | App **giao bài sau CN → HS làm T3 (GV giám sát live) → T6 GV củng cố**. App là nền tảng bài tập duy nhất |
| 5 | App hỗ trợ tinh thần tự học + áp dụng ML để khắc phục điểm yếu | App phải có **AI tutor cá nhân hóa theo điểm yếu** + **dashboard cảnh báo cho GV biết HS nào đang bí ở đâu** |

### 2.3 Lý do tỉ lệ 1 offline + 2 online (chốt)

**Offline tốn nhiều chi phí ẩn** (thuê phòng, đi lại, cơ sở vật chất, hạn chế quy mô lớp) → giảm xuống 1 buổi/tuần.
**Online scale tốt hơn** (1 GV dạy được nhiều lớp, không giới hạn địa lý, chi phí thấp) → tăng lên 2 buổi/tuần.
**Offline vẫn cần thiết** vì lý do #2 (HS thiếu tự tin nếu không gặp GV mặt đối mặt) + vì cần deep-dive kiến thức.

### 2.4 Phân vai trò trong mô hình (Flipped Classroom)

| Ngày | Hình thức | Vai trò chính | Ai/Công cụ |
|------|-----------|---------------|-----------|
| **CN** | Offline tại trung tâm | **Deep dive** kiến thức mới (HS đã preview qua app T6-T7). Thảo luận, luyện kỹ năng trực tiếp, giao bài T3 | GV + bạn cùng lớp |
| **T3** | Làm bài tập có giám sát | **Practice có monitor**: HS làm bài trên app, **GV xem real-time dashboard** xem HS nào sai nhiều, chỗ nào, gửi hỗ trợ khi cần | App + Dashboard giám sát + GV |
| **T6** | Google Meet | **Củng cố** kiến thức tuần này + **khuyến khích HS tìm hiểu** kiến thức mới trên app để chuẩn bị cho CN sau | Google Meet + App |
| **T2, T4, T5, T7** | Tự học qua app | **Ôn tập** (SRS) + **luyện targeted** theo điểm yếu + **preview** bài tuần sau (vocab, video, đọc nhẹ) | App + AI |

### 2.5 Đánh giá mô hình (góp ý khách quan)

**✅ Điểm mạnh:**
- 3 buổi/tuần là **sweet spot** cho 12-15 tuổi (đủ để tiến bộ, không quá tải)
- CN offline + T3/T6 online = nhịp 2-3 ngày lý tưởng cho spaced repetition
- 5 lý do đã liệt kê **rất đúng và đủ** — không thừa lý do nào
- Mô hình tài chính hợp lý: offline là "neo" giữ chân HS, online là "scale" cho doanh thu
- **Mô hình Flipped Classroom** (preview → deep dive → practice → consolidate) là phương pháp giáo dục đã được chứng minh hiệu quả
- T3 có giám sát = **giải quyết được vấn đề "không theo dõi được HS"** của mô hình online-only
- T6 củng cố + khuyến khích preview = **HS đến CN không phải bắt đầu từ số 0**

**⚠️ Rủi ro cần lường:**
1. **T3 phụ thuộc vào app + sự có mặt giám sát của GV**: Nếu app lỗi HOẶC GV không theo dõi → T3 mất tác dụng. Cần **reliability cao** + **onboarding tốt cho GV**.
2. **GV cần "đa năng"**: Phải vừa dạy offline, vừa monitor app real-time, vừa dạy Meet. Cần **UX dashboard đơn giản** để GV không bị quá tải.
3. **T6 phải giao "preview bài tuần sau" rõ ràng**: Nếu HS không preview → CN vẫn phải dạy từ đầu → mất lợi thế flipped.
4. **Adoption của HS**: 12-15 tuổi bận nhiều môn. App phải **gây nghiện lành mạnh** (giống Duolingo), không ép buộc.
5. **Phụ huynh**: 12-15 vẫn do PH quyết định. Cần **báo cáo tuần cho PH** để giữ chân.
6. **Chất lượng AI**: Feedback phát âm/sai sót phải chính xác — cần test kỹ với giọng HS Việt.
7. **Pháp lý**: Dữ liệu trẻ em cần tuân thủ Nghị định 13/2023/NĐ-CP (VN) — cần consent PH.

**💡 Gợi ý bổ sung (chưa chốt):**
- Workshop định kỳ 1-2 lần/học kỳ (offline intensive) — tạo kỷ niệm, tăng retention
- Báo cáo PH cuối tuần (auto-generated từ dữ liệu app)
- Sự kiện lớp (Halloween, Christmas) — học qua văn hóa
- Cuộc thi giữa các lớp — gamify cho cả tập thể
- **GV có thể "kèm cặp" 1-1 với HS yếu qua app** (nhắn tin, gửi gợi ý trong dashboard) — tăng giá trị cảm xúc

---

## 3. Learner Model — Khung đo lường năng lực

> Nguyên tắc: **Đo được → mới cải thiện được**. Mỗi bài tập phải gắn với ít nhất 1 chỉ số.

### 3.1 Hồ sơ tĩnh (Profile)

```
- Tên, lớp, ngày sinh
- Trình độ khởi điểm: A1 / A2 / B1 / B2 / C1 / C2 (theo CEFR)
- Mục tiêu: IELTS / Giao tiếp / Học thuật / Tổng quát
- Thời gian học mục tiêu / ngày (5 / 15 / 30 phút)
- Lỗi phát âm đặc thù (nếu GV nhập ban đầu): θ→t, ð→d, æ→e, vv...
```

### 3.2 5 kỹ năng cốt lõi

| Kỹ năng | Icon | Chỉ số chính | Cách đo |
|---------|------|--------------|---------|
| **READ** | 📖 | `readSpeed` (WPM), `readComprehension` (%), `readVocabInContext` (%) | Bài đọc + câu hỏi, có timer |
| **WRITE** | ✍️ | `writeGrammar` (lỗi/100 từ), `writeVocabRange` (TTR), `writeCoherence` (0-10), `writeTaskAchievement` (0-10) | Đoạn văn + AI chấm theo rubric |
| **LISTEN** | 👂 | `listenAccuracy` (%), `listenComprehension` (%), `listenSpeedTolerance` (1x / 1.25x / 1.5x) | Dictation + câu hỏi nghe |
| **SPEAK** | 🗣 | `speakPronunciation` (%), `speakFluency` (WPM + pauses), `speakIntonation` (0-10), `speakConfidence` (0-10) | Shadowing, free chat với AI (multimodal) |
| **LEARN** | 🧠 | `vocabKnown` (số từ), `vocabRetention` (% nhớ sau 1/7/30 ngày), `vocabActiveUse` (số từ dùng đúng trong nói/viết), `grammarMastery` (% chủ điểm đúng) | SRS flashcard + tracking từ Speak/Write |

### 3.3 Hành vi học tập (Engagement)

```
- streak: chuỗi ngày học liên tục
- avgSessionMinutes: thời gian TB/phiên
- retryRate: tỉ lệ làm lại bài sai (tín hiệu "khó")
- helpSeekingRate: tần suất dùng nút "gợi ý" / "dịch"
- dropoutPerTask: tỉ lệ bỏ ngang giữa chừng
- lastActive: ngày học cuối
```

### 3.4 Độ tin cậy của điểm

```
- attemptsPerMetric: cần ≥ 5 lần đo mới tin được
- lastMeasured: thời điểm đo gần nhất
- trend: improving / stable / declining (so với 7 ngày trước)
```

### 3.5 Mapping: Hoạt động → Chỉ số

| Hoạt động trong app | Cập nhật chỉ số |
|---------------------|-----------------|
| Đọc đoạn văn + trắc nghiệm | readSpeed, readComprehension, readVocabInContext |
| Audio dictation (điền từ nghe được) | listenAccuracy |
| Nghe + trả lời câu hỏi | listenComprehension, listenSpeedTolerance |
| Shadowing (đọc theo audio mẫu) | speakPronunciation, speakFluency, speakIntonation |
| Free chat với AI | speakFluency, writeGrammar, vocabActiveUse |
| Viết đoạn văn + AI chấm | writeGrammar, writeCoherence, writeVocabRange, writeTaskAchievement |
| Flashcard SRS | vocabKnown, vocabRetention |
| Bài tập ngữ pháp có chấm điểm | grammarMastery |

---

## 4. Yêu cầu đối với App (để mix với offline hoàn hảo)

### 4.1 Real-time Teacher Dashboard cho T3 (ưu tiên #1)

Đây là **tính năng quan trọng nhất** của app — vì T3 là ngày HS làm bài có giám sát, GV cần dashboard real-time để xem và can thiệp.

**Live status board** (GV mở lên là thấy ngay):
- Danh sách HS đang online: `[Nguyên - Reading Q3 - 2min]`, `[An - Listening Q1 - 1min]`, `[Bình - idle 5min ⚠️]`
- Tổng quan lớp: bao nhiêu HS đang làm, bao nhiêu đã xong, bao nhiêu đang bí
- **Class heatmap**: Câu nào nhiều HS sai nhất → highlight đỏ (VD: "Câu 5: 6/10 HS sai")

**Can thiệp trực tiếp**:
- Click vào 1 HS → xem chi tiết: câu nào sai, bao lâu rồi, đã dùng hint chưa
- Nút "Gửi gợi ý" → HS nhận popup trên app của họ
- Nút "Gọi hỗ trợ" → HS nhận thông báo "GV muốn hỗ trợ bạn"
- HS cũng có nút "Cần hỗ trợ" → flag lên dashboard GV

**Cảnh báo tự động**:
- HS idle > 3 phút → flag vàng
- HS sai 3 lần liên tiếp cùng 1 dạng → flag đỏ + gợi ý
- HS dùng > 5 hints → flag cam

**Tính năng "GV xuất hiện" (Live Help)** — chốt bởi chủ trung tâm:
- Khi HS bấm "Cần hỗ trợ" HOẶC GV click vào HS trong dashboard
- **GV "pop in" vào bài của HS** theo 3 cấp độ (chốt triển khai cả 3 từ đầu):
  1. **Cấp 1 (Nhẹ)**: Gửi text gợi ý hiện trên màn hình HS — VD: "Bạn ơi, gợi ý nhé: thì quá khứ của 'go' là '...' 🙂"
  2. **Cấp 2 (Vừa)**: Voice call — HS và GV nói chuyện trực tiếp 1-1 (qua WebRTC), HS vẫn nhìn thấy bài tập
  3. **Cấp 3 (Sâu)**: GV điều khiển highlight câu đang sai trên màn hình HS, giải thích trực tiếp
- **Lý do chọn Cấp 3 từ đầu**: Chủ trung tâm đánh giá là hiệu quả nhất — HS hiểu nhanh nhất khi GV chỉ trực tiếp lên bài
- **Yêu cầu kỹ thuật**:
  - Voice: WebRTC peer-to-peer (server chỉ signaling, không truyền media) → tải server cực nhẹ
  - Highlight: WebSocket sync JSON events (elementId, color, note) từ GV → HS
  - Tải ước tính: < 100 KB/s cho 10 HS, scale tốt lên 100+ HS không cần nâng cấp server
- HS có thể thấy "GV đang hỗ trợ bạn" indicator (tin tưởng + không sợ)
- HS có nút "Tôi hiểu rồi" → GV rời, cập nhật DB "HS này đã được hỗ trợ chủ điểm X lúc Y"
- **Mục tiêu**: HS không bao giờ cảm thấy "bị bỏ rơi" dù T3 không có GV mặt

**Stack kỹ thuật cho Live Help**:
- `socket.io` — WebSocket với room management (chia theo lớp)
- `simple-peer` — WebRTC wrapper dễ dùng
- STUN server: dùng Google miễn phí (`stun:stun.l.google.com:19302`)
- TURN server: chưa cần, thêm sau nếu > 5% call fail
- Ghi âm: optional, opt-in từ HS (lưu local GV, không qua server)

### 4.1b Kiến trúc Template + Content (chốt bởi chủ trung tâm)

**Vấn đề**: Units được thiết kế sẵn (giáo trình), nhưng bài tập cụ thể cần linh hoạt theo tuần/lớp/HS.

**Giải pháp**: Tách **Template** (cấu trúc bài tập) khỏi **Content** (nội dung cụ thể).

**Hai lớp**:

| Lớp | Vai trò | Ai tạo/sửa? | Tần suất thay đổi |
|-----|---------|------------|-------------------|
| **Template** | Cấu trúc bài tập: "Reading + 5 câu hỏi trắc nghiệm", "Dictation 10 từ", "Flashcard 15 thẻ" | Dev team | Khi cần thêm dạng mới |
| **Content** | Nội dung cụ thể: đoạn văn, câu hỏi, từ vựng, audio | GV hoặc AI | Hàng tuần |

**Cách hoạt động**:
1. **Unit thiết kế sẵn** (curriculum): VD "Unit 3: Travel" — có 8 buổi, mỗi buổi 1 chủ điểm
2. **Mỗi buổi T3 có "kịch bản"** = danh sách template + slots trống:
   - "Bài đọc về du lịch bụi" → cần: passage + 5 câu hỏi
   - "Dictation 10 từ vựng tuần này" → cần: danh sách 10 từ
   - "Flashcard 15 từ vựng" → cần: 15 từ + nghĩa
3. **GV điền content** vào slots (qua form trong dashboard) HOẶC **AI tự động generate** dựa trên:
   - Từ vựng tuần này
   - Chủ điểm ngữ pháp
   - Topic của unit
   - Trình độ lớp
4. **App render bài tập** từ template + content

**Ví dụ cụ thể**:
- Template: `Reading Comprehension`
- Content GV điền: passage = "A teenager's first solo trip..." + 5 câu hỏi trắc nghiệm
- Hoặc: GV chỉ cần gõ "Tạo bài đọc về travel cho HS lớp 7" → AI generate passage + questions

**Lợi ích**:
- **Tốc độ**: Không cần dev sửa code mỗi tuần
- **Linh hoạt**: GV tùy chỉnh theo lớp (lớp yếu thì bài dễ hơn)
- **Nhất quán**: HS cùng lớp làm cùng template (so sánh được)
- **AI scale**: Khi GV bận, AI generate nội dung
- **Tái sử dụng**: 1 template dùng cho nhiều unit, nhiều năm

**Templates cần có ban đầu** (đề xuất):
1. 📖 Reading Comprehension (passage + 5 MCQ)
2. 🎧 Listening Dictation (audio + blanks)
3. 🎤 Shadowing (audio + record)
4. 🃏 Flashcard (front/back, audio)
5. ✍️ Sentence Builder (sắp xếp từ thành câu)
6. 📝 Free Writing (prompt + text area + AI grading)
7. 🗣 Speaking Prompt (question + record)
8. 🎯 Multiple Choice (standalone, dùng cho quick check)
9. 🧩 Match Pairs (ghép từ với nghĩa / câu với đáp án)
10. 🎬 Video Comprehension (optional, sau này)

### 4.2 Teacher Dashboard tổng quan (ưu tiên #2)

- Xem tiến độ từng HS trên cả 5 kỹ năng (Read/Write/Listen/Speak/Learn)
- Cảnh báo HS đang tụt (streak giảm, điểm giảm)
- Tổng hợp lỗi phổ biến của cả lớp (VD: "8/10 HS sai thì quá khứ đơn")
- Giao bài tập từ dashboard → HS nhận trên app
- Xem bài làm của HS (transcript + chấm điểm)
- **Báo cáo pre-T6**: Trước buổi Google Meet, GV xem HS nào cần sửa gì

### 4.3 Homework / Assignment System (rank #1 cho ngày T3)

- GV tạo bài tập trong dashboard → đẩy xuống app
- HS nhận + làm trong app (T3 hoặc bất kỳ lúc nào trước deadline)
- Auto-grade khi có thể (trắc nghiệm, dictation, flashcard)
- Manual review cho bài viết (AI gợi ý điểm, GV duyệt)
- Deadline + push reminder
- Thống kê: ai làm, ai chưa, ai sai nhiều
- **Đặc biệt quan trọng cho T3**: nếu app không có hệ thống giao bài mạnh, cả ngày T3 sụp đổ

### 4.4 Spaced Repetition + Flipped Classroom Flow

```
CN (offline): GV dạy chuyên sâu chủ điểm A
T2 (app):     Ôn nhẹ A (SRS), preview vocab tuần
T3 (app+giám sát): Làm bài tập A, GV monitor real-time
T4, T5 (app): Luyện targeted theo lỗi cá nhân
T6 (Meet):    Củng cố A + giới thiệu chủ điểm B + giao HS preview B
T7 (app):     Preview B (vocab, video ngắn, đọc nhẹ) — HS đến CN đã có nền
CN+1 (offline): Deep dive B (HS không bị "số 0")
```

### 4.5 Tính năng Preview (cho T6-T7) — Triết lý "Mục đích tìm hiểu thực sự"

**Mục tiêu cốt lõi** (chốt bởi chủ trung tâm): Tạo cho HS **mục đích tìm hiểu thật sự** — không phải "vì bài kiểm tra" mà là "vì tò mò / vì thấy ứng dụng hay / vì muốn hiểu thêm". HS đến CN với tâm thế "ham học" thay vì "phải học".

**3 hướng tiếp cận** (chưa chốt, cần bàn):

#### Hướng A: Story-based (giải trí)
- Viết 1 mini-truyện ngắn sử dụng từ vựng tuần sau
- VD chủ điểm Travel: truyện "Cô bé 14 tuổi đi du lịch bụi một mình lần đầu"
- Có nhân vật, có tình huống, có twist
- HS đọc vì thích → vô tình học từ
- **Pro**: HS thích, dễ viral, tạo kết nối cảm xúc
- **Con**: Tốn công viết (hoặc AI phải viết tốt), không trực tiếp dạy kiến thức

#### Hướng B: Knowledge dive (kiến thức thô)
- Cho HS "tò mò sâu" tìm hiểu trước
- VD: "Past Simple — khi nào dùng, công thức, 5 ví dụ thực tế"
- Format: infographic / video ngắn / cheat sheet
- **Pro**: Trực tiếp, HS chủ động nâng cao
- **Con**: Khô, HS lười xem, dễ bỏ qua

#### Hướng C: Practical application (ứng dụng thực tiễn)
- "Bạn sẽ dùng từ này khi đi du lịch thật như thế nào?"
- VD: Đặt phòng khách sạn, hỏi đường, gọi đồ ăn
- Có tình huống thực → HS thấy "à, hóa ra từ này có ích thế"
- **Pro**: Tạo "mục đích" rõ ràng, HS thấy lý do phải học
- **Con**: Cần tình huống sát thực tế VN (không phải "I went to Paris" mà là "đi Đà Lạt cuối tuần")

#### Đề xuất: Hybrid 3 lớp (kết hợp cả 3)

```
Preview một chủ điểm = 3-5 phút tổng:

🎬 HOOK (30 giây)         → Story-based
   "Bạn Mai 14 tuổi đi Đà Lạt một mình.
    Cô ấy quên mang tiền. Chuyện gì xảy ra?"
   (Mini-animation hoặc illustrated story)

🌍 WHY IT MATTERS (1 phút) → Practical application
   "Trong tình huống đó, Mai cần nói được:
    - 'Where is the nearest ATM?'
    - 'Could you help me, please?'
    Đây là 2 trong số 5 câu bạn sẽ học tuần này."

🔍 CURIOUS? (optional, 2 phút) → Knowledge dive
   "Bạn muốn hiểu sâu hơn? Đây là cấu trúc:
    - Could + you + verb: lịch sự
    - Where is + noun: hỏi vị trí
    Xem thêm..."

✅ QUICK CHECK (30 giây)
   "Bạn Mai nên nói gì để hỏi cây ATM gần nhất?"
   (1 câu trắc nghiệm — kiểm tra HS có đọc không)
```

**Cấu trúc 3 lớp giải quyết được cả 3 nhóm HS**:
- HS thích giải trí → dừng ở Hook, vẫn có giá trị
- HS thực dụng → dừng ở Why It Matters, thấy lý do học
- HS tò mò → đi hết Curios section, học sâu hơn
- **GV CN biết HS nào đã xem phần nào** → cá nhân hóa buổi dạy

**Tracking & Gamification**:
- HS xem Hook + Why + Check: +15⭐ (mức cơ bản)
- HS xem cả 4 phần: +30⭐ + huy hiệu "Curious Mind"
- GV T6 xem được ai xem phần nào → khen trong buổi Meet
- HS không xem gì → CN GV biết, có thể "preview cùng HS" 5 phút đầu buổi

**Tích hợp với Template + Content**:
- Preview cũng dùng template: "Story Hook Template" + "Why It Matters Template" + "Curious Deep-Dive Template"
- GV/AI chỉ cần điền: chủ điểm + vocab list → App render preview hoàn chỉnh

### 4.6 Confidence-Building Features (giải quyết rủi ro #2)

- **Chế độ luyện riêng tư**: Bài tập chỉ HS + AI thấy, không so sánh bảng xếp hạng
- **AI chat ẩn danh**: HS có thể hỏi mà không sợ bạn cùng lớp thấy
- **Anonymized comparison**: "Bạn đang ở top 30% lớp" thay vì để thấy tên
- **"Bạn cùng luyện"**: Ghép cặp HS để luyện nói với nhau qua app (optional)

### 4.7 Cá nhân hóa theo điểm yếu

- App đọc profile 5 kỹ năng → tự gợi ý bài tập bổ trợ
- VD: HS yếu Listen → mỗi ngày gợi ý 1 bài dictation + 1 bài nghe hiểu
- GV thấy gợi ý này trong dashboard → biết cần nhấn mạnh gì buổi sau

### 4.8 Tích hợp Google Meet (cho T6)

- App hiển thị link Meet vào giờ học T6
- Nhắc nhở trước 15 phút
- Sau buổi học: ghi chú GV (nếu có) hiển thị trong app
- Tích hợp Meet attendance (check HS có vào lớp không)

### 4.9 Báo cáo Phụ huynh (giải quyết rủi ro adoption)

- Auto-generate cuối tuần
- Gửi qua Zalo/email
- Format: "Tuần này con học X phút, giỏi nhất là [kỹ năng], cần luyện thêm [kỹ năng]"
- Ảnh/sticker động viên

---

## 5. Nguyên tắc thiết kế bài học để mix với offline

### 5.1 Offline (CN) — Nặng cảm xúc + khái niệm

- Dạy khái niệm mới (ngữ pháp, chủ điểm từ vựng)
- Role-play, thảo luận nhóm, debate
- Văn hóa, ngữ cảnh thực tế
- Gắn kết tình bạn
- **GV giao bài trên app ngay cuối buổi** để HS biết phải làm gì vào T3
- **Không nên**: chữa bài chi tiết, làm bài tập cơ bản (để app làm)

### 5.2 App — Ngày làm bài (T3) — App "đứng lớp"

**Đây là ngày quan trọng nhất đối với app** — vì nếu HS không học được vào T3, cả tuần fail.

Yêu cầu:
- Bài tập phải **tự giải được** (có hướng dẫn, gợi ý, AI hỗ trợ)
- Không cần GV giải đáp trực tiếp
- Thời lượng bài T3: **45-60 phút** (đủ cho 1 buổi học thật sự)
- Cấu trúc đề xuất:
  1. 5 phút: Review ngắn bài CN (flashcard/video recap)
  2. 15-20 phút: Bài tập chính (reading/listening/writing tùy tuần)
  3. 10 phút: Áp dụng vào ngữ cảnh (chat với AI)
  4. 5-10 phút: Self-check + ghi nhận khó khăn
  5. Tự đánh giá: "Bạn tự tin bao nhiêu? (1-5)"

### 5.3 Online — Với GV (T6) — Google Meet

- 5-10 phút đầu: review bài T3 (GV đã xem trước qua dashboard)
- 30-40 phút: luyện tập mới (speaking, listening, writing)
- Mini 1-on-1 với HS tụt (GV dùng dashboard gợi ý)
- Cuối buổi: giao bài mới cho app (xuất hiện trong app của HS)
- **Không nên**: dạy khái niệm hoàn toàn mới (HS sẽ overload vì CN đã học rồi)

### 5.4 App — Các ngày còn lại (T2, T4, T5, T7) — Cá nhân hóa

| Thời lượng mục tiêu | Nội dung |
|---------------------|----------|
| 5-10 phút | SRS vocab review (từ đã học 1/3/7/30 ngày trước) |
| 5-10 phút | 1-2 bài tập targeting kỹ năng yếu |
| 5-15 phút | AI chat tự do (HS chọn chủ đề) |
| 5 phút | Pronunciation drill (shadowing ngắn) |
| 5 phút | Đọc 1 đoạn ngắn + câu hỏi |

Tổng: **25-45 phút/ngày** — chia thành 2-3 phiên nhỏ để dễ duy trì streak.

---

## 6. Lộ trình xây dựng (cập nhật theo Flipped Classroom)

### Giai đoạn 0: Foundation (1 tuần)
- [ ] Refactor `types.ts` theo Learner Model (5 kỹ năng)
- [ ] HS Dashboard hiển thị 5 kỹ năng thay vì 1 thanh tiến độ
- [ ] `App.tsx` cập nhật `DEFAULT_PROFILE` theo cấu trúc mới
- [ ] Backend: schema DB cho `assignments`, `submissions`, `t3_sessions`, `previews`

### Giai đoạn 1: Bài học T3 + Real-time Dashboard (2-3 tuần) — **ƯU TIÊN CAO NHẤT**
- [ ] Thiết kế 1 "Bài học T3 mẫu" hoàn chỉnh 45-60 phút
- [ ] T3 lesson UI: hướng dẫn + bài tập + AI hỗ trợ + self-check
- [ ] **Real-time Teacher Dashboard**: live status board, heatmap, can thiệp
- [ ] Hệ thống flag "Cần hỗ trợ" từ HS → alert cho GV
- [ ] WebSocket / realtime cho live monitoring
- [ ] Test với 1 lớp thật (3-5 HS) vào T3

### Giai đoạn 2: Hệ thống giao bài + Preview (1-2 tuần)
- [ ] GV tạo bài tập trong dashboard
- [ ] HS nhận + làm bài (T3 hoặc trước deadline)
- [ ] Auto-grade cho trắc nghiệm, dictation, flashcard
- [ ] **Tính năng Preview** (T6-T7): vocab + video + đọc nhẹ
- [ ] Tracking xem HS đã preview chưa

### Giai đoạn 3: Mở rộng hoạt động học (2 tuần)
- [ ] Reading (đã có — chỉnh sửa theo Learner Model)
- [ ] Listening dictation
- [ ] Shadowing (multimodal Gemini)
- [ ] Flashcard SRS (thuật toán SuperMemo/SM-2)
- [ ] Free chat AI (đã có — nâng cấp prompt)
- [ ] Viết đoạn văn + AI chấm theo rubric

### Giai đoạn 4: Teacher Dashboard tổng quan + Báo cáo (1-2 tuần)
- [ ] 5-kỹ năng view cho từng HS
- [ ] Tổng hợp lỗi phổ biến của lớp
- [ ] Báo cáo pre-T6 (HS nào cần sửa gì)
- [ ] Báo cáo PH cuối tuần (auto-generated)

### Giai đoạn 5: Polish (1-2 tuần)
- [ ] Tích hợp Google Meet (link + reminder + attendance)
- [ ] Gamification nâng cao (streak, leaderboard ẩn danh)
- [ ] Onboarding flow cho HS + GV + PH
- [ ] Confidence-building features (chế độ riêng tư, AI chat ẩn danh)

---

## 7. Câu hỏi mở / Chưa chốt

- [ ] Báo cáo PH: qua kênh nào (Zalo/email/SMS)? Tần suất?
- [ ] Có cần multi-class (1 HS học nhiều lớp)?
- [ ] Lưu trữ audio HS bao lâu? (Privacy + cost)
- [ ] Giá gói học phí? App có free tier cho HS thử?
- [ ] Có cần app native (iOS/Android) hay web responsive là đủ?
- [ ] Khi nào cần multi-tenant (nhiều trung tâm)?
- [ ] Lưu trữ video/audio buổi học T6 (Google Meet recording)?
- [ ] Có cần app cho phụ huynh xem (parent app riêng)?

---

## 8. Decisions log

| Ngày | Quyết định |
|------|------------|
| 2026-06-15 | UI tone đổi từ neo-brutalist corporate sang teen-friendly (commit `e39ec36`) |
| 2026-06-15 | Thêm light/dark mode với CSS variables (commit `e39ec36`) |
| 2026-06-15 | Mô hình hybrid CN offline + T3/T6 online + app hàng ngày được chốt |
| 2026-06-15 | Learner Model 5 kỹ năng (Read/Write/Listen/Speak/Learn) được chốt làm nền tảng |
| 2026-06-15 | Phân biệt rõ: T3 = ngày làm bài (app đứng lớp), T6 = ngày học với GV (Google Meet) |
| 2026-06-15 | Lý do tỉ lệ 1 offline + 2 online: offline tốn chi phí ẩn, online scale tốt hơn |
| 2026-06-15 | **T3 chốt lại**: HS làm bài trên app, **GV giám sát real-time qua hệ thống** (xem bạn nào sai nhiều, hỗ trợ khi cần) |
| 2026-06-15 | **T6 chốt lại**: Củng cố kiến thức + **khuyến khích HS tìm hiểu kiến thức mới trên app** để sẵn sàng cho CN sau |
| 2026-06-15 | **Mô hình chốt = Flipped Classroom**: Preview (T6-T7) → Deep dive (CN) → Practice có giám sát (T3) → Consolidate (T6) |
| 2026-06-15 | **Tính năng #1 ưu tiên**: Real-time Teacher Dashboard cho T3 (live status + heatmap + can thiệp) |
| 2026-06-15 | **GV "pop in" vào bài HS** khi HS cần hỗ trợ (text / voice / highlight) — 3 cấp độ |
| 2026-06-15 | **Kiến trúc Template + Content**: Units thiết kế sẵn, GV/AI điền content vào template có sẵn |
| 2026-06-15 | **Preview triết lý "mục đích tìm hiểu thật"**: Hybrid 3 lớp Hook + Why + Curious (story + application + knowledge) |
| 2026-06-15 | **GV trực cả buổi T3** — không phải "lúc rảnh xem" mà là real-time supervision |
| 2026-06-15 | **GV "pop in" cấp 3 (highlight + voice) từ đầu** — chủ trung tâm đánh giá hiệu quả nhất, không cần làm tuần tự 1→2→3 |
| 2026-06-15 | **Stack Live Help chốt**: socket.io + simple-peer + Google STUN miễn phí. TURN để sau nếu cần |
| 2026-06-15 | **Template + Content — Auto-archive (Q1 = B)**: GV soạn xong → tự động thêm vào kho, kèm **tag chất lượng** (⭐ 1-5) + stats: lượt dùng, % đúng TB, thời gian TB, lần dùng gần nhất. Tag giúp GV lọc nhanh câu "chuẩn" để dùng lại |
| 2026-06-15 | **Template + Content — Kho dùng chung hay riêng (Q2 = C)**: Mặc định **kho riêng của từng GV** (privacy + tự chịu trách nhiệm). Có **nút "Chia sẻ kho trung tâm"** cho GV muốn publish lên kho chung. Kho chung do admin/lead teacher duyệt trước khi hiển thị cho GV khác |
| 2026-06-15 | **Template + Content — AI generate form (Q3 = C)**: Form **vừa required vừa optional**. Required tối thiểu: chủ điểm + từ vựng + trình độ lớp. Optional: tone (story/academic/casual), độ dài passage, số câu hỏi, từ cần tránh (HS đã biết), ngữ cảnh (VN/global)... GV cần nhanh → chỉ điền required; cần kiểm soát → điền thêm optional |
| 2026-06-15 | **Data layer — DB engine (Q1 = SQLite + better-sqlite3)**: 1 file .db, không cần service, không cần auth, backup chỉ cần copy file. Phù hợp 10 HS, server $15/tháng, reproducible 100% với 1 file setup |
| 2026-06-15 | **Data layer — User identity (Q2 = Pre-issued accounts)**: Trung tâm cấp account cho HS + PH + GV (closed system). HS login → xem data của mình. PH login → xem data của con. GV login → xem lớp. Tuân thủ Nghị định 13/2023 (PH đồng ý khi nhận account). Cross-device OK, không cần SMS provider |
| 2026-06-15 | **Data layer — Setup scope (Q3 = Data layer only)**: `scripts/setup.ts` xử lý Node deps + DB + schema + seed admin. PM2/systemd/nginx để admin tự lo trên server (mỗi server khác nhau) |
| 2026-06-15 | **Schema nguyên tắc**: Bảng `skill_measurements` + `engagement_events` là **append-only event log** (không bao giờ update). Mọi state khác (current_skills, streak, %) **derive từ event log** = audit được 100%, không thể HS sửa điểm client-side |
