/* 레거시 손메모 정리 — v0.9 가이드에서 손으로 적힌 '특목고·문법서' 스텁 중
   ① 짬뽕(서로 다른 책 여러 권을 한 줄에 묶음)  ② 비교재(독서리스트·수행평가·강좌설명)
   만 제거. 정식판이 이미 ISBN으로 들어와 있어 중복이거나, 애초에 구매 가능한 책이 아님.
   ※ 진짜 책(SAT/TOEFL/원서·Azar·Wordly Wise 등)은 보존 — 정확한 제목 일치만 삭제.
   사용: node tools/remove_legacy_stubs.js          (리포트만, dry)
         node tools/remove_legacy_stubs.js --apply  (실제 삭제)
*/
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html");
const IMG = path.join(ROOT, "data", "book_images.json");
const COVERS = path.join(ROOT, "covers");
const APPLY = process.argv.includes("--apply");

// 정확 제목 일치로만 삭제(부분일치 금지) — 실수 방지
const REMOVE = new Set([
  // 🅰 짬뽕·중복(정식판 ISBN 존재)
  "천일문 (구문) / 영어 구문 독해",
  "천일문 (구문/기본/GRAMMAR)",
  "천일문 고등 GRAMMAR / 어법끝",
  "어법끝 (Start / 5.0)",
  "워드마스터 (수능 2000 / 고등 어원)",
  "기출 모의고사 문제집 (마더텅 / 자이스토리)",
  "능률 고급영문독해 (고급영문독해71 등)",
  "Grammar for Great Writing / Great Writing 시리즈",
  "Grammar in Use (Basic / Intermediate)",
  "Cambridge IELTS / ETS TOEFL",
  "The Official SAT Study Guide / Digital SAT Premium Prep",
  "The Story of the World / My Big Fat Notebook (World·American History)",
  "EBS 수능특강 영어 / 영어독해연습 / 수능특강 영어듣기",
  // 🅱 비교재(독서리스트·수행평가·강좌설명·일반 '대비 교재')
  "대학 일반물리/일반화학/일반생명과학/미적분학 영어 원서 교재 (AP 및 2학년 정규 대학과정 교과)",
  "독서마일리지/추천도서 기반 영어 원서 다독 (학교 도서관 운영)",
  "민사고 영어원서 독서 리스트 (40종 고전 원서: 1984, The Great Gatsby, To Kill a Mockingbird, Beowulf, The Epic of Gilgamesh 등)",
  "영어 토론(디베이트) 교재 (Pro-Con-Rebuttal 형식)",
  "원어민 영어(전문교과 영어) 에세이/아카데믹 라이팅 수행평가 자료",
  "AP English Language and Composition 대비 교재",
  "AP English Literature & Composition 대비 교재 (Barron's / The Princeton Review / Kaplan)",
  "AP English Literature 필독 원서 (The Great Gatsby, Pride and Prejudice, Frankenstein 등)",
]);

const raw = fs.readFileSync(SRC, "utf8");
const mm = raw.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/);
const master = JSON.parse(mm[1]);
const imgData = JSON.parse(fs.readFileSync(IMG, "utf8"));
const img = imgData.images || {};

const hit = master.materials.filter((m) => m.domain === "영어" && REMOVE.has(String(m.title || "").trim()));
const foundTitles = new Set(hit.map((m) => String(m.title || "").trim()));
const missing = [...REMOVE].filter((t) => !foundTitles.has(t));

console.log(`삭제대상 매칭: ${hit.length}종 (리스트 ${REMOVE.size}개 중)`);
hit.forEach((m) => console.log("  ✗ " + m.title));
if (missing.length) { console.log("\n⚠ 제목 불일치(못 찾음):"); missing.forEach((t) => console.log("  ? " + t)); }

if (!APPLY) { console.log("\n(dry — 미실행. 실제 삭제는 --apply)"); return; }

const rm = new Set(hit.map((m) => m.materialUid));
master.materials = master.materials.filter((m) => !rm.has(m.materialUid));
rm.forEach((uid) => { try { fs.unlinkSync(path.join(COVERS, uid + ".jpg")); } catch (e) {} delete img[uid]; });
fs.writeFileSync(SRC, raw.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8");
fs.writeFileSync(IMG, JSON.stringify(imgData, null, 2), "utf8");
console.log(`\n완료 — 삭제 ${rm.size}종 / 남은 영어교재 ${master.materials.filter((m) => m.domain === "영어").length}종`);
