/* 중복·구버전 정리 — 같은 책의 여러 판/연도 중 '최신판'만 남기고 나머지 삭제(보수적)
   중복 판정: ① 같은 ISBN(13)  ② 같은 정규화제목 + 같은 정규화출판사
   정규화는 '연도(2024)·개정판/N판 표기'만 제거 — 레벨/권수/부제/월(月)은 보존(서로 다른 책 보호).
   최신판 선택: 발행일 최신 → 가격(유통)有 → 표지有 → 정상(비절판) → 제목 김. 나머지 삭제.
   사용: node tools/dedup_latest.js          (리포트만, 기본 dry)
         node tools/dedup_latest.js --apply  (실제 삭제)
*/
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html");
const IMG = path.join(ROOT, "data", "book_images.json");
const COVERS = path.join(ROOT, "covers");
const APPLY = process.argv.includes("--apply");

const raw = fs.readFileSync(SRC, "utf8");
const mm = raw.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/);
const master = JSON.parse(mm[1]);
const imgData = JSON.parse(fs.readFileSync(IMG, "utf8"));
const img = imgData.images || {};

const isbn13 = (s) => String(s || "").replace(/[^0-9Xx]/g, "");
const hasIsbn = (b) => isbn13(b.isbn).length >= 10;
function normPub(p) { return String(p || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/주식회사|㈜|\(주\)|출판사|미디어|에듀|books|edu/g, "").replace(/[^a-z0-9가-힣]/g, ""); }
// 어순·괄호·문장수·연도만 정규화하고 학년/학기/교과서/레벨 토큰은 보존(서로 다른 책 보호)
function softKey(t) {
  const s = String(t || "").toLowerCase()
    .replace(/ver\.?\s*[\d.]+/g, " ").replace(/\b\d+\s*(st|nd|rd|th)\s*edition\b/g, " ")
    .replace(/\b\d{3,4}\s*sentences?\b/g, " ").replace(/\b(?:19|20)\d\d\b/g, " ")
    .replace(/[()\[\]{}<>·,:;.“”‘’]/g, " ").replace(/[^a-z0-9가-힣\-\s]/g, " ");
  return s.split(/\s+/).filter(Boolean).sort().join(" ");
}
function normTitle(t) {
  return String(t || "").toLowerCase()
    .replace(/\((?:19|20)\d\d[^)]*\)/g, " ")                 // (2024 …) 괄호 연도
    .replace(/\b(?:19|20)\d\d\s*년?\b/g, " ")                 // 2024년
    .replace(/\((?:개정|전면\s*개정|최신\s*개정|개정증보|개정판|신판|\d+\s*판|new\s*edition|revised|\d*\s*nd\s*edition|개정\d*)\)/g, " ")
    .replace(/\b(?:개정판|전면개정|최신개정|개정증보판?)\b/g, " ")
    .replace(/[\s·]+/g, "").trim();
}
function yearNum(b) { const m = String(b.pubDate || "").match(/(19|20)\d\d/); let n = m ? +m[0] * 10000 : 0; const md = String(b.pubDate || "").match(/(?:19|20)\d\d\D+(\d{1,2})\D+(\d{1,2})/); if (md) n += (+md[1]) * 100 + (+md[2]); return n; }
// 최신판 점수(높을수록 보존)
function keepScore(b) { return yearNum(b) * 100 + (b.isbn ? 0 : 0) + (img[b.materialUid] && img[b.materialUid].localPath ? 8 : 0) + ((b.status || "정상") === "정상" ? 4 : 0) + Math.min(20, (b.title || "").length / 5); }

const eng = master.materials.filter((m) => m.domain === "영어");
// 그룹핑: isbn 우선, 없으면 제목+출판사
const groups = {};
eng.forEach((b) => {
  const ik = isbn13(b.isbn);
  let key;
  if (ik.length >= 10) key = "i:" + ik;
  else { const nt = normTitle(b.title); if (nt.length < 4) return; key = "t:" + nt + "|" + normPub(b.publisher); }
  (groups[key] = groups[key] || []).push(b);
});

const remove = [];
const samples = [];
const removed = new Set();
// 패스 A — 같은 ISBN/제목+출판사 그룹 중복
Object.values(groups).forEach((arr) => {
  if (arr.length < 2) return;
  arr.sort((a, b) => keepScore(b) - keepScore(a));
  const keep = arr[0];
  arr.slice(1).forEach((b) => { remove.push(b); removed.add(b.materialUid); });
  if (samples.length < 16) samples.push({ keep: (keep.title || "").slice(0, 40) + " [" + (keep.pubDate || "?").slice(0, 7) + "]", drop: arr.slice(1).map((b) => (b.title || "").slice(0, 36) + " [" + (b.pubDate || "?").slice(0, 7) + "]") });
});
// 패스 B — ISBN 없는 스텁이 ISBN 정식항목과 일치(어순/괄호/문장수만 차이) → 스텁 삭제(정식 보존)
const idxIsbn = {};
eng.filter(hasIsbn).forEach((b) => { const k = softKey(b.title) + "|" + normPub(b.publisher); if (k.length > 5) (idxIsbn[k] = idxIsbn[k] || []).push(b); });
eng.filter((b) => !hasIsbn(b) && !removed.has(b.materialUid)).forEach((b) => {
  const k = softKey(b.title) + "|" + normPub(b.publisher);
  if (k.length > 5 && idxIsbn[k]) { remove.push(b); removed.add(b.materialUid);
    if (samples.length < 24) samples.push({ keep: "(정식) " + (idxIsbn[k][0].title || "").slice(0, 34), drop: ["(스텁) " + (b.title || "").slice(0, 34)] }); }
});

console.log(`중복 그룹: ${Object.values(groups).filter((a) => a.length > 1).length}개 / 삭제대상(구버전·중복): ${remove.length}종 / 영어교재 ${eng.length}→${eng.length - remove.length}`);
console.log("\n예시(✓최신 보존 / ✗삭제):");
samples.forEach((s) => { console.log("  ✓", s.keep); s.drop.forEach((d) => console.log("      ✗", d)); });

if (!APPLY) { console.log("\n(dry — 미실행. 실제 삭제는 --apply)"); return; }
const rm = new Set(remove.map((b) => b.materialUid));
master.materials = master.materials.filter((m) => !rm.has(m.materialUid));
rm.forEach((uid) => { try { fs.unlinkSync(path.join(COVERS, uid + ".jpg")); } catch (e) {} delete img[uid]; });
fs.writeFileSync(SRC, raw.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8");
fs.writeFileSync(IMG, JSON.stringify(imgData, null, 2), "utf8");
console.log(`\n완료 — 삭제 ${rm.size}종 / 남은 영어교재 ${master.materials.filter((m) => m.domain === "영어").length}종`);
