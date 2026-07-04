/* 카탈로그 누락 감사 — 알라딘에서 주요 출판사·대표 시리즈를 조회해
   우리 카탈로그(마스터 ISBN)에 없는 인기 교재를 출판사별로 찾아낸다.
   사용: ALADIN_TTBKEY=키 node tools/audit_gaps.js [검색어...]
   검색어 없으면 내장 PUBLISHERS(대표 출판사/시리즈) 전수 스윕. */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const KEY = (process.env.ALADIN_TTBKEY || "").trim();
if (!KEY) { console.error("ALADIN_TTBKEY 필요"); process.exit(1); }

// 마스터 카탈로그 ISBN + 정규화 제목 로드
const raw = fs.readFileSync(path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html"), "utf8");
const master = JSON.parse(raw.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const mats = master.materials || [];
const haveIsbn = new Set(mats.map((b) => String(b.isbn || "").replace(/[^0-9Xx]/g, "")).filter((x) => x.length >= 10));
const norm = (t) => String(t || "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9가-힣]/g, "");
const haveTitle = new Set(mats.map((b) => norm(b.title)).filter(Boolean));

// 대표 출판사/시리즈(학부모·교사가 아는 것 위주) — Aladin 키워드
const QUERIES = process.argv.slice(2).length ? process.argv.slice(2) : [
  "NE능률 그래머존", "능률 리딩튜터", "능률 주니어 리딩튜터", "능률 워드마스터", "능률 그래머인사이드", "능률 1316",
  "쎄듀 첫단추", "쎄듀 천일문", "쎄듀 어법끝", "쎄듀 리딩플랫폼", "쎄듀 빈칸백서", "쎄듀 왕초보",
  "다락원 상황별", "다락원 중학영문법", "YBM 리스닝", "YBM 리딩", "천재교육 영어",
  "마더텅 수능", "메가스터디 중학영어", "키출판사 문법", "다위 영어",
  "구문독해 100", "체크체크 영어", "올백 영어", "메가스터디 초등", "기적의 영어",
  "빠른독해 바른독해", "천일문 입문", "리더스뱅크", "주니어 리딩튜터", "능률 중학영어",
];

// 영어 학습교재 여부(카테고리 or 제목 신호)
const engRe = /영어|english|어학|외국어|토익|토플|문법|독해|어휘|리딩|리스닝|grammar|reading/i;
const isEng = (it) => engRe.test(it.categoryName || "") || engRe.test(it.title || "");

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function search(q) {
  const url = "https://www.aladin.co.kr/ttb/api/ItemSearch.aspx?ttbkey=" + KEY +
    "&Query=" + encodeURIComponent(q) + "&QueryType=Keyword&MaxResults=50&start=1&SearchTarget=Book&Sort=SalesPoint&output=js&Version=20131101";
  try { const r = await fetch(url); const j = await r.json(); if (j.errorMessage && !(j.item || []).length) return { err: j.errorMessage, items: [] }; return { items: j.item || [] }; }
  catch (e) { return { err: String(e.message), items: [] }; }
}

(async () => {
  const gapsByPub = {}; let scanned = 0, engTotal = 0, gapTotal = 0;
  const seenGap = new Set();
  for (const q of QUERIES) {
    const { items, err } = await search(q);
    if (err) { console.log("  ⚠ [" + q + "] " + err); await delay(400); continue; }
    for (const it of items) {
      if (!isEng(it)) continue; engTotal++;
      const isbn = String(it.isbn13 || it.isbn || "").replace(/[^0-9Xx]/g, "");
      const inCat = (isbn.length >= 10 && haveIsbn.has(isbn)) || haveTitle.has(norm(it.title));
      if (inCat) continue;
      const key = isbn || norm(it.title); if (seenGap.has(key)) continue; seenGap.add(key);
      const pub = it.publisher || "(미상)";
      (gapsByPub[pub] = gapsByPub[pub] || []).push({ title: (it.title || "").replace(/<[^>]+>/g, ""), isbn, price: it.priceSales, sp: it.salesPoint || 0, pub, cover: it.cover, pubDate: it.pubDate });
      gapTotal++;
    }
    scanned++;
    await delay(350); // 쿼터 보호
  }
  // 출판사별 정렬(누락 많은 순), 각 상위는 판매지수 순
  const rows = Object.entries(gapsByPub).map(([pub, arr]) => ({ pub, arr: arr.sort((a, b) => b.sp - a.sp) })).sort((a, b) => b.arr.length - a.arr.length);
  console.log("\n===== 카탈로그 누락 감사 =====");
  console.log("스캔 쿼리 " + scanned + " · 영어교재 후보 " + engTotal + " · 미보유(누락) " + gapTotal + "종\n");
  for (const { pub, arr } of rows) {
    console.log("▶ " + pub + " — 누락 " + arr.length + "종");
    arr.slice(0, 8).forEach((b) => console.log("   ❌ " + b.title.slice(0, 46) + "  [" + b.isbn + "] " + (b.price || "?") + "원 · 판매지수" + b.sp));
  }
  // 머신용 산출(보강 시드로 사용)
  fs.writeFileSync(path.join(ROOT, "data", "gap_report.json"), JSON.stringify(rows.flatMap((r) => r.arr), null, 2));
  console.log("\n→ data/gap_report.json 저장 (" + gapTotal + "종, 보강 시드용)");
})();
