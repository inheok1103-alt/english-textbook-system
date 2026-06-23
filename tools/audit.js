/* 데이터 품질 감사 하네스 (영어교재)
   점검: 1)교재 중복(제목/ISBN)  2)부정확/의심 제목  3)표지 정확도(소스·무표지)  4)표지 중복(md5)
   사용: node tools/audit.js [--list]   (--list: 의심 항목 상세 출력)
   출력: data/_audit_report.json + 콘솔 요약
*/
const fs = require("fs"), path = require("path"), cr = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const COVERS = path.join(ROOT, "covers");
const LIST = process.argv.includes("--list");
const master = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html"), "utf8").match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const img = (JSON.parse(fs.readFileSync(path.join(ROOT, "data", "book_images.json"), "utf8")).images) || {};
const md5 = (b) => cr.createHash("md5").update(b).digest("hex");
const norm = (t) => String(t || "").toLowerCase().replace(/\s+/g, "");
const eng = master.materials.filter((m) => m.domain === "영어");
const byUid = {}; master.materials.forEach((m) => (byUid[m.materialUid] = m));

// 1) 제목 중복
const titleGroups = {}; eng.forEach((m) => { (titleGroups[norm(m.title)] = titleGroups[norm(m.title)] || []).push(m.materialUid); });
const dupTitles = Object.entries(titleGroups).filter(([, a]) => a.length > 1);
// ISBN 중복
const isbnGroups = {}; eng.forEach((m) => { const i = m.isbn || (img[m.materialUid] || {}).isbn; if (i) (isbnGroups[i] = isbnGroups[i] || []).push(m.materialUid); });
const dupIsbn = Object.entries(isbnGroups).filter(([, a]) => a.length > 1);

// 2) 부정확/의심 제목
const suspTitles = eng.filter((m) => { const t = m.title || "";
  return / \/ /.test(t) || /\([^)]*\/[^)]*\)/.test(t)          // 슬래시 묶음
    || /(.{6,})\1/.test(t.replace(/\s/g, ""))                  // 반복(이중) 제목
    || t.length < 3 || t.length > 80                            // 과단/과장
    || /[�]/.test(t)                                       // 깨진 문자
    || /[~∼]\s*\d.*[~∼]/.test(t)                                // 범위 묶음
    || !/[a-zA-Z가-힣]/.test(t);                                // 문자 없음
});

// 3) 표지 정확도(소스)
const noCover = eng.filter((m) => !(img[m.materialUid] && img[m.materialUid].localPath));
const bySource = {}; eng.forEach((m) => { const s = (img[m.materialUid] || {}).source || (img[m.materialUid] && img[m.materialUid].localPath ? "기타" : "무표지"); bySource[s] = (bySource[s] || 0) + 1; });

// 4) 표지 중복(md5)
const byHash = {}; let have = 0;
for (const m of eng) { const f = path.join(COVERS, m.materialUid + ".jpg"); if (fs.existsSync(f)) { have++; try { const h = md5(fs.readFileSync(f)); (byHash[h] = byHash[h] || []).push(m.materialUid); } catch (e) {} } }
const dupCovers = Object.values(byHash).filter((a) => a.length > 1).sort((a, b) => b.length - a.length);
const dupCoverBooks = dupCovers.reduce((n, a) => n + a.length, 0);

const report = {
  generatedAt: new Date().toISOString(), total: eng.length,
  dupTitleGroups: dupTitles.length, dupTitleBooks: dupTitles.reduce((n, [, a]) => n + a.length, 0),
  dupIsbnGroups: dupIsbn.length,
  suspiciousTitles: suspTitles.length,
  coverHave: have, noCover: noCover.length, coverBySource: bySource,
  dupCoverGroups: dupCovers.length, dupCoverBooks,
};
fs.writeFileSync(path.join(ROOT, "data", "_audit_report.json"), JSON.stringify(report, null, 2), "utf8");

console.log("================ 데이터 품질 감사 ================");
console.log(`영어교재: ${eng.length}종 · 실표지 ${have}종`);
console.log(`[중복] 제목중복그룹 ${report.dupTitleGroups}(${report.dupTitleBooks}종) · ISBN중복그룹 ${report.dupIsbnGroups}`);
console.log(`[제목] 의심/부정확 ${report.suspiciousTitles}종`);
console.log(`[표지] 무표지(카드) ${report.noCover} · 소스 ${JSON.stringify(bySource)}`);
console.log(`[표지중복] 그룹 ${report.dupCoverGroups} · 종수 ${dupCoverBooks} · 최대그룹 ${dupCovers[0] ? dupCovers[0].length : 0}`);
console.log(`→ data/_audit_report.json`);
if (LIST) {
  console.log("\n--- 의심 제목 30 ---"); suspTitles.slice(0, 30).forEach((m) => console.log("  ·", m.title.slice(0, 50)));
  console.log("\n--- 표지중복 상위 8그룹 ---"); dupCovers.slice(0, 8).forEach((g) => console.log("  [" + g.length + "]", g.slice(0, 4).map((u) => (byUid[u].title || "").slice(0, 24)).join(" | ")));
}
