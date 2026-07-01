/* 판매 인기 랭킹 생성 — 알라딘 판매지수(salesPoint) 기준. rankings.json 출력.
   ※ salesPoint는 enrich_aladin 크론이 매일 갱신 → 이 랭킹도 PC 없이 클라우드에서 지속 갱신.
   버킷: 전체·초·중·고·성인(학년대 매핑). 각 상위 25종. 전부 카탈로그 책이라 매칭 100%.
   사용: node tools/harvest_rankings.js   (books.js 필요 — build 이후 실행) */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "books.js");
const OUT = path.join(ROOT, "rankings.json");

const B = JSON.parse(fs.readFileSync(SRC, "utf8").match(/window\.__BOOKS__=(\[[\s\S]*?\]);\s*\nwindow\.__TABS__/)[1]);
const pool = B.filter((b) => (b.salesPoint || 0) > 0 && b.status !== "절판");

// 카탈로그 gradeBand → 랭킹 필터 칩(초/중/고/성인) 매핑
const mapG = (g) => ({ "유아/예비초": "초", "초등": "초", "중등": "중", "고등": "고", "성인": "성인", "대학/전공": "성인" })[g] || "";
const BUCKETS = [
  ["전체", () => true],
  ["초", (b) => mapG(b.gradeBand) === "초"],
  ["중", (b) => mapG(b.gradeBand) === "중"],
  ["고", (b) => mapG(b.gradeBand) === "고"],
  ["성인", (b) => mapG(b.gradeBand) === "성인"],
];

// 같은 시리즈 도배 완화 — 정규화 제목 접두로 버킷당 시리즈 2종까지만
function seriesKey(t) {
  return String(t || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(level|lv|book|권|단계|\d+)\b/gi, " ").replace(/[^a-z0-9가-힣]/g, "").slice(0, 12);
}

const items = [];
BUCKETS.forEach(([key, f]) => {
  const seen = {};
  pool.filter(f).sort((a, b) => b.salesPoint - a.salesPoint).forEach((b) => {
    if (items.filter((x) => x.gradeBand === key).length >= 25) return;
    const sk = seriesKey(b.title); if (sk) { if ((seen[sk] = (seen[sk] || 0) + 1) > 2) return; }
    const rank = items.filter((x) => x.gradeBand === key).length + 1;
    items.push({ rank, gradeBand: key, englishArea: b.skill || "통합", title: b.title, isbn: b.isbn || "",
      matchedUid: b.id, publisher: b.pub || "", cover: b.cover || "", salesPoint: b.salesPoint, price: b.price || null, foreign: !!b.foreign, source: "aladin" });
  });
});

const out = { generatedAt: new Date().toISOString(), source: "aladin_salespoint",
  note: "알라딘 판매지수 기준 인기 순위(카탈로그) — 매일 자동 갱신", buckets: BUCKETS.map((x) => x[0]), count: items.length, items };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`rankings.json 생성 — ${items.length}항목 / 버킷 ${out.buckets.join("·")} / 갱신 ${out.generatedAt.slice(0, 10)}`);
