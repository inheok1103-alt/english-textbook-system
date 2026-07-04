/* 🧹 알라딘 수확분 → 카탈로그 병합(정리) — data/aladin_catalog.json 중 우리에게 없는 ISBN만
   영역·학년대·레벨을 자동 부여해 마스터에 주입. 가격·판매지수·표지는 enrich 캐시에 반영.
   기존 ISBN/동일제목은 건너뜀. 이후 build_app이 목표·시기·추천축을 자동 완성한다.
   사용: node tools/merge_aladin_catalog.js [--dry] */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const DRY = process.argv.includes("--dry");
const SRC = path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html");
const CAT = path.join(ROOT, "data", "aladin_catalog.json");
const ENR = path.join(ROOT, "data", "aladin_enrich.json");

if (!fs.existsSync(CAT)) { console.log("aladin_catalog.json 없음 — 수확 먼저 필요, 스킵"); process.exit(0); }
const raw = fs.readFileSync(SRC, "utf8");
const mm = raw.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/);
const master = JSON.parse(mm[1]);
const catalog = JSON.parse(fs.readFileSync(CAT, "utf8")).books || [];
if (!catalog.length) { console.log("수확 카탈로그 비어있음 — 스킵"); process.exit(0); }
let enrich = {}; try { const e = JSON.parse(fs.readFileSync(ENR, "utf8")); enrich = e.items || e; } catch (e) {}

const cleanIsbn = (x) => String(x || "").replace(/[^0-9Xx]/g, "");
const norm = (t) => String(t || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9가-힣]/g, "");
const haveIsbn = new Set(master.materials.map((b) => cleanIsbn(b.isbn)).filter((x) => x.length >= 10));
const haveTitle = new Set(master.materials.filter((b) => b.domain === "영어").map((b) => norm(b.title)));

// ── 영역·학년·레벨 파생(알라딘 카테고리+제목 기반) ──
function deriveSkill(cat, title) {
  const t = cat + " " + title;
  if (/파닉스|phonics/i.test(t)) return "파닉스";
  if (/문법|어법|grammar/i.test(t)) return "문법";
  if (/구문/i.test(t)) return "구문";
  if (/듣기|리스닝|listening/i.test(t)) return "듣기";
  if (/회화|말하기|스피킹|speaking/i.test(t)) return "말하기";
  if (/쓰기|영작|writing|서술형/i.test(t)) return "쓰기";
  if (/어휘|단어|voca|word/i.test(t)) return "어휘";
  if (/수능|모의고사|기출|학력평가/i.test(t)) return "모의/기출";
  if (/독해|리딩|reading|해석/i.test(t)) return "독해";
  return "독해"; // 기본
}
function deriveAge(cat, title) {
  const t = cat + " " + title;
  if (/유아|유치|예비\s*초|누리/i.test(t)) return 6;
  if (/초등|초\d|elementary/i.test(t)) return 8;
  if (/중학|중등|중\d/i.test(t)) return 14;
  if (/고등|고교|고\d|수능|모의고사|예비\s*고|학력평가/i.test(t)) return 17;
  if (/토익|toeic|토플|toefl|텝스|teps|오픽|공무원|편입|비즈니스|성인/i.test(t)) return 20;
  return null; // 전체
}
function deriveLevel(age, title) {
  let lv = age == null ? 3 : age <= 7 ? 1 : age <= 12 ? 2 : age <= 15 ? 3 : age <= 18 ? 4 : 3;
  if (/기초|입문|왕초보|처음|starter|기본편|beginner/i.test(title)) lv -= 1;
  if (/심화|실전|고난도|완성|advanced|master|종합/i.test(title)) lv += 1;
  return Math.max(1, Math.min(5, lv));
}

let added = 0, skipDup = 0;
const byPub = {}, bySkill = {}, byGrade = {};
const GRADE_OF = (a) => a == null ? "전체" : a <= 7 ? "유아/예비초" : a <= 12 ? "초등" : a <= 15 ? "중등" : a <= 18 ? "고등" : "성인";

for (const b of catalog) {
  const isbn = cleanIsbn(b.isbn);
  if (isbn.length < 10) continue;
  // 타 과목(국어·수학·사회·과학 등) 차단 — 카테고리에 영어/외국어 없고 타과목명이면 스킵
  const cat2 = (b.cat || "") + " " + (b.title || "");
  if (!/영어|영문|외국어|english/i.test(b.cat || "") && /국어|수학|사회탐구|과학탐구|한국사|국사|세계사|동아시아|한국지리|세계지리|도덕|윤리|한문|물리학|화학|생명과학|지구과학/.test(cat2)) { skipDup++; continue; }
  if (haveIsbn.has(isbn) || haveTitle.has(norm(b.title))) { skipDup++; continue; }
  haveIsbn.add(isbn); haveTitle.add(norm(b.title));
  const skill = deriveSkill(b.cat, b.title);
  const age = deriveAge(b.cat, b.title);
  const level = deriveLevel(age, b.title);
  const uid = "IH-ALADIN-" + isbn;
  master.materials.push({
    materialUid: uid, uid,
    title: b.title, publisher: b.pub || "", isbn,
    skill, tftNums: [level], tft: String(level),
    ageMin: age, ageMax: age == null ? null : age + 3,
    grade: age != null && age >= 20 ? "성인" : "",
    domain: "영어", status: "정상", source: "ALADIN",
    category: (b.cat || "").split(">").pop() || "", kobicCategory: b.cat || "",
    pubDate: b.pubDate || "", pickComment: "",
    situations: [], weaknesses: [], gradeTags: [],
  });
  // 가격·판매지수·표지 → enrich(기존 우선 보존)
  if (!enrich[isbn]) enrich[isbn] = { price: b.price || 0, priceStd: b.price || 0, salesPoint: b.salesPoint || 0, cover: b.cover || "", status: "정상", at: Date.now(), src: "aladin-harvest" };
  added++;
  byPub[b.pub] = (byPub[b.pub] || 0) + 1;
  bySkill[skill] = (bySkill[skill] || 0) + 1;
  byGrade[GRADE_OF(age)] = (byGrade[GRADE_OF(age)] || 0) + 1;
}

console.log("병합 대상 수확 " + catalog.length + "종 → 신규 " + added + " · 중복건너뜀 " + skipDup);
console.log("영역별:", JSON.stringify(bySkill));
console.log("학년별:", JSON.stringify(byGrade));
console.log("출판사 상위:", Object.entries(byPub).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([p, n]) => p + ":" + n).join(" · "));
if (DRY) { console.log("\n(dry — 미저장)"); return; }

fs.writeFileSync(ENR, JSON.stringify(enrich));   // raw {isbn:{...}} — build_app/enrich_aladin 원래 형식 유지
fs.writeFileSync(SRC, raw.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8");
console.log("\n✅ 병합 완료 — 마스터 영어교재 " + master.materials.filter((m) => m.domain === "영어").length + "종 / enrich " + Object.keys(enrich).length + "건");
