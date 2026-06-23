/* 최종 정리: 동일 교재 통폐합 + 모호한 묶음항목 제거 (영어교재)
   1) ISBN 동일 → 중복 제거(KOBIC 정식 우선)
   2) 알려진 동치맵(MERGE_MAP): 모호/구명칭 → 더 구체적 제목으로 통폐합
   3) 슬래시/괄호 묶음 모호항목: 같은 시리즈의 깔끔한 KOBIC 개별권이 있으면 제거
   사용: node tools/cleanup_final.js [--dry]
*/
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html");
const IMG = path.join(ROOT, "data", "book_images.json");
const COVERS = path.join(ROOT, "covers");
const DRY = process.argv.includes("--dry");

const raw = fs.readFileSync(SRC, "utf8");
const mm = raw.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/);
const master = JSON.parse(mm[1]);
const imgData = JSON.parse(fs.readFileSync(IMG, "utf8"));
const img = imgData.images || {};

const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");
const seriesBase = (t) => String(t || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b\d+\s*(st|nd|rd|th)\s+edition\b/gi, " ").replace(/[0-9]+/g, " ").replace(/[^a-z0-9가-힣]+/g, "").trim();
const isAmbiguous = (t) => / \/ /.test(t) || /\([^)]*\/[^)]*\)/.test(t) || /[~∼]\s*\d/.test(t);

// 알려진 동치(왼쪽=구/모호 → 오른쪽=더 구체적). 필요시 계속 추가.
const MERGE_MAP = {
  "천일문 구문": "천일문 완성", "천일문(구문)": "천일문 완성",
};
const mapNorm = {}; Object.keys(MERGE_MAP).forEach((k) => { mapNorm[norm(k)] = norm(MERGE_MAP[k]); });

const eng = master.materials.filter((m) => m.domain === "영어");
const byUid = {}; master.materials.forEach((m) => (byUid[m.materialUid] = m));
const titleToCanonical = {}; // norm제목 → 대표 material(가장 구체적·KOBIC·ISBN)
eng.forEach((m) => { const k = norm(m.title); const cur = titleToCanonical[k];
  const score = (m.source === "KOBIC" ? 2 : 0) + (m.isbn ? 1 : 0) + (m.toc ? 0.5 : 0) + m.title.length * 0.001;
  if (!cur || score > cur._s) titleToCanonical[k] = Object.assign(m, { _s: score });
});

const remove = new Set();
let isbnDup = 0, mapped = 0, ambig = 0;

// 1) ISBN 동일 중복
const byIsbn = {};
eng.forEach((m) => { const i = m.isbn || (img[m.materialUid] && img[m.materialUid].isbn); if (!i) return; (byIsbn[i] = byIsbn[i] || []).push(m); });
Object.values(byIsbn).forEach((arr) => { if (arr.length < 2) return;
  arr.sort((a, b) => ((b.source === "KOBIC") - (a.source === "KOBIC")) || ((b.toc ? 1 : 0) - (a.toc ? 1 : 0)) || (b.title.length - a.title.length));
  arr.slice(1).forEach((m) => { remove.add(m.materialUid); isbnDup++; });
});

// 2) MERGE_MAP 동치 통폐합
eng.forEach((m) => { if (remove.has(m.materialUid)) return; const tgt = mapNorm[norm(m.title)]; if (!tgt) return;
  if (titleToCanonical[tgt]) { remove.add(m.materialUid); mapped++; }
});

// 3) 모호한 묶음 → 같은 시리즈 KOBIC 개별권 존재 시 제거
const baseHasClean = {};
eng.forEach((m) => { if (isAmbiguous(m.title)) return; if (m.source === "KOBIC" || m.isbn) baseHasClean[seriesBase(m.title)] = true; });
eng.forEach((m) => { if (remove.has(m.materialUid)) return; if (!isAmbiguous(m.title)) return;
  const b = seriesBase(m.title); if (b && b.length > 2 && baseHasClean[b]) { remove.add(m.materialUid); ambig++; }
});

console.log(`통폐합 대상: ISBN중복 ${isbnDup} + 동치맵 ${mapped} + 모호묶음 ${ambig} = ${remove.size}종`);
if (DRY) { eng.filter((m) => remove.has(m.materialUid)).slice(0, 30).forEach((m) => console.log("  -", m.title.slice(0, 40), "[" + (m.source || "원본") + "]")); return; }

master.materials = master.materials.filter((m) => !remove.has(m.materialUid));
remove.forEach((uid) => { try { fs.unlinkSync(path.join(COVERS, uid + ".jpg")); } catch (e) {} delete img[uid]; });
master.materials.forEach((m) => { delete m._s; });
fs.writeFileSync(SRC, raw.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8");
fs.writeFileSync(IMG, JSON.stringify(imgData, null, 2), "utf8");
console.log(`완료 — 제거 ${remove.size} / 영어교재 ${master.materials.filter((m) => m.domain === "영어").length}종`);
