/* 🛒 알라딘 영어교재 전수 수확 — 상업 카탈로그(ISBN·가격·표지·판매지수)를 통째로 긁어
   우리 카탈로그의 누락(참고서 트리 등)을 메운다. 결과: data/aladin_catalog.json
   방식: ① 영어 시드 키워드 검색으로 관련 CategoryId 자동 발견
        ② 각 카테고리를 Bestseller+신간으로 페이지네이션 수확 → ISBN 중복제거
   사용: ALADIN_TTBKEY=키 node tools/harvest_aladin.js [--pages=5] [--quick]
   쿼터: 알라딘 일 5,000회. 기본 설정은 ~300~500회 수준. */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const KEY = (process.env.ALADIN_TTBKEY || "").trim();
if (!KEY) { console.error("ALADIN_TTBKEY 필요"); process.exit(1); }
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : d; };
const PAGES = +arg("pages", process.env.ALADIN_PAGES || (process.argv.includes("--quick") ? 2 : 4));   // 카테고리·쿼리타입당 페이지(env ALADIN_PAGES 우선)
const OUT = path.join(ROOT, "data", "aladin_catalog.json");

const API = "https://www.aladin.co.kr/ttb/api";
const engRe = /영어|english|어학|외국어|토익|토플|텝스|문법|독해|어휘|리딩|리스닝|파닉스|회화|grammar|reading|phonics|voca/i;
// 카테고리명이 "영어" 학습 맥락인지 — 영어 특정 토큰 필수(초등/중학/고등만으론 국어·수학 등 타과목이 샘)
const catOk = (nm) => /영어|영문|외국어|어학|english|토익|toeic|토플|toefl|텝스|teps|파닉스|phonics/i.test(nm || "")
  && !/국어|수학|사회탐구|사회·?문화|과학탐구|통합과학|한국사|국사|세계사|동아시아|한국지리|세계지리|도덕|윤리|한문|중국어|일본어|물리학|화학|생명과학|지구과학|컴퓨터|프로그래밍|자격증\/수험서>공무원|경제경영/.test(nm || "");

// 영어 학습 카테고리 공간을 실데이터로 발견할 시드 키워드
const SEEDS = ["영문법", "영어독해", "영어듣기", "영어어휘", "영어회화", "영작문", "구문독해",
  "초등영어", "중학영어", "고등영어", "예비고", "수능영어", "모의고사 영어", "내신 영어",
  "토익", "토플", "텝스", "파닉스", "영어원서", "리딩", "영단어", "영어 워크북", "영어 문제집"];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(p) { try { const r = await fetch(API + p + "&ttbkey=" + KEY + "&output=js&Version=20131101"); const t = await r.text(); return JSON.parse(t); } catch (e) { return { errorMessage: String(e.message), item: [] }; } }

function rec(it) {
  return {
    isbn: String(it.isbn13 || it.isbn || "").replace(/[^0-9Xx]/g, ""),
    title: (it.title || "").replace(/<[^>]+>/g, "").trim(),
    author: (it.author || "").replace(/<[^>]+>/g, ""),
    pub: it.publisher || "", pubDate: it.pubDate || "",
    price: it.priceSales || it.priceStandard || 0,
    salesPoint: it.salesPoint || 0,
    cover: (it.cover || "").replace("coversum", "cover500").replace("cover200", "cover500"),
    cat: it.categoryName || "", cid: it.categoryId || 0,
    link: it.link || "",
  };
}

(async () => {
  const t0 = Date.now(); let calls = 0;
  // ── ① 카테고리 발견 ──
  const cats = {};  // cid → {name, n}
  console.log("① 카테고리 발견 (시드 " + SEEDS.length + ")");
  for (const q of SEEDS) {
    const j = await api("/ItemSearch.aspx?QueryType=Keyword&SearchTarget=Book&MaxResults=50&start=1&Sort=SalesPoint&Query=" + encodeURIComponent(q)); calls++;
    (j.item || []).forEach((it) => { const cid = it.categoryId, nm = it.categoryName || ""; if (cid && catOk(nm)) { cats[cid] = cats[cid] || { name: nm, n: 0 }; cats[cid].n++; } });
    await delay(300);
  }
  const cidList = Object.entries(cats).sort((a, b) => b[1].n - a[1].n).map(([cid, v]) => ({ cid: +cid, name: v.name }));
  console.log("  발견 카테고리 " + cidList.length + "개");

  // ── ② 카테고리별 수확(Bestseller + 신간, 페이지네이션) ──
  console.log("② 수확 (카테고리 " + cidList.length + " × 2타입 × " + PAGES + "p)");
  const books = new Map();  // isbn → rec
  let engHit = 0;
  for (const { cid, name } of cidList) {
    for (const qt of ["Bestseller", "ItemNewAll"]) {
      for (let start = 1; start <= PAGES; start++) {
        const j = await api("/ItemList.aspx?QueryType=" + qt + "&SearchTarget=Book&MaxResults=50&start=" + start + "&CategoryId=" + cid); calls++;
        const items = j.item || [];
        if (!items.length) break;
        items.forEach((it) => {
          const b = rec(it);
          if (b.isbn.length < 10) return;
          if (!catOk(b.cat)) return;   // 책 자신의 카테고리도 영어여야(타과목 교차노출 차단)
          engHit++;
          const prev = books.get(b.isbn);
          if (!prev || b.salesPoint > prev.salesPoint) books.set(b.isbn, b);
        });
        await delay(280);
      }
    }
    process.stdout.write("\r  진행 " + books.size + "종 (호출 " + calls + ")   ");
  }
  const all = [...books.values()].sort((a, b) => b.salesPoint - a.salesPoint);
  fs.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), count: all.length, calls, books: all }, null, 0));
  console.log("\n✅ 수확 완료 — " + all.length + "종 (영어후보 " + engHit + " · 호출 " + calls + " · " + ((Date.now() - t0) / 1000).toFixed(0) + "s)");
  console.log("→ " + path.relative(ROOT, OUT));
})();
