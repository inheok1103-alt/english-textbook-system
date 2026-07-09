/* 🔁 발견→수확 폐루프의 '소비' 단계 — audit_gaps가 찾은 누락 인기교재(data/gap_report.json)를
   알라딘 카탈로그(data/aladin_catalog.json)에 주입한다. merge_aladin_catalog가 이걸 master로 병합.
   순수 파일변환(API 0 · 멱등: ISBN 기준 미보유분만 append). gap 파일 없으면 조용히 스킵.
   순서: harvest-aladin(카탈로그 덮어쓰기) → gap_scan(gap_report 생성) → consume_gap(주입) → merge-aladin. */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const GAP = path.join(ROOT, "data", "gap_report.json");
const CAT = path.join(ROOT, "data", "aladin_catalog.json");

if (!fs.existsSync(GAP)) { console.log("consume_gap: gap_report.json 없음 — 스킵"); process.exit(0); }
let gaps; try { gaps = JSON.parse(fs.readFileSync(GAP, "utf8")); } catch (e) { console.log("consume_gap: gap 파싱 실패 — 스킵"); process.exit(0); }
if (!Array.isArray(gaps) || !gaps.length) { console.log("consume_gap: gap 0종 — 스킵"); process.exit(0); }

let cat; try { cat = JSON.parse(fs.readFileSync(CAT, "utf8")); } catch (e) { cat = { count: 0, books: [] }; }
cat.books = cat.books || [];
const clean = (s) => String(s || "").replace(/[^0-9Xx]/g, "");
const have = new Set(cat.books.map((b) => clean(b.isbn)));

let added = 0;
gaps.forEach((g) => {
  const isbn = clean(g.isbn);
  if (!isbn || have.has(isbn)) return;   // 멱등: 이미 보유(카탈로그 또는 이번 배치)면 스킵
  have.add(isbn); added++;
  cat.books.push({
    isbn, title: (g.title || "").replace(/<[^>]+>/g, ""), author: "", pub: g.pub || "",
    pubDate: g.pubDate || "", price: g.price || null, salesPoint: g.sp || 0,
    cover: g.cover || "", cat: g.cat || "영어",   // 'cat:영어' → merge의 타과목 가드 통과
    cid: 0, link: "", source: "gap",
  });
});
cat.count = cat.books.length;
fs.writeFileSync(CAT, JSON.stringify(cat));
console.log(`consume_gap: gap ${gaps.length}종 중 신규 ${added}종 카탈로그 주입 (총 ${cat.count})`);
