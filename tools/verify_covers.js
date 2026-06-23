/* 책↔표지 상시 정합검수 + 자동교정 (영어교재)  — 지속(증분·로테이션) 운영용
   설계 원칙: '정상 표지를 틀렸다고 오탐'하면 좋은 데이터가 망가진다 → 픽셀해시 대신 'ISBN 앵커'로 판정(오탐≈0).
     KOBIC 표지 파일명은 ISBN을 내장한다: /bookImage/book/coverImg/YYYYMM/<ISBN>C001.jpg
   판정(고신뢰):
     1) ISBN-파일명 불일치: 저장된 imageUrl 의 ISBN ≠ 책의 ISBN → 확실히 다른 책 표지 → 교정
     2) 표지중복(서로 다른 ISBN 이 동일 md5): 충돌 → 각자 자기 ISBN 으로 재취득
     3) 무표지/플레이스홀더/파일없음/너무작음 → 결손 → 재취득
     4) ISBN 있는데 비-KOBIC 소스 → KOBIC 정품(ISBN 정합)으로 업그레이드
     5) (네트워크 슬라이스) ISBN 으로 KOBIC 현재표지 재취득 → 로컬과 md5 비교, 다르면 KOBIC(정본)으로 재앵커
   증분: book_images[uid].verifiedAt 기록 → 미검증·오래된 것 우선 로테이션(VERIFY_LIMIT 회당 상한)
   모드: 기본=report(변경없음, data/_cover_verify_report.json)  /  --fix=교정 수행
   재개·스로틀: KOBIC_SLEEP(기본 280), VERIFY_LIMIT(기본 400) — 회차마다 다른 슬라이스라 매일 전수 순환
   사용: node tools/verify_covers.js            (리포트만)
        node tools/verify_covers.js --fix       (교정)
        VERIFY_LIMIT=300 node tools/verify_covers.js --fix
*/
const fs = require("fs"), path = require("path"), cr = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html");
const IMG = path.join(ROOT, "data", "book_images.json");
const COVERS = path.join(ROOT, "covers");
const REPORT = path.join(ROOT, "data", "_cover_verify_report.json");
const FIX = process.argv.includes("--fix");
const SLEEP = Number(process.env.KOBIC_SLEEP || 280);
const LIMIT = Number(process.env.VERIFY_LIMIT || 400);   // 네트워크 검증 회당 상한
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "accept-language": "ko-KR,ko;q=0.9" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (b) => new TextDecoder("utf-8").decode(b);
const md5 = (b) => cr.createHash("md5").update(b).digest("hex");
const ent = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const norm = (v) => String(v || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
const nospace = (v) => norm(v).replace(/\s+/g, "");
const seriesBase = (t) => norm(String(t || "").replace(/\([^)]*\)/g, " ").replace(/\b\d+\s*(st|nd|rd|th)\s+edition\b/gi, " ").replace(/\b(level|lv|book|band|stage|grade|단계)\b/gi, " ").replace(/\b[\d-]+\b/g, " "));
const isbnOf = (s) => { const m = String(s || "").match(/(\d{13}|\d{10})/); return m ? m[1] : ""; };
const fileIsbn = (url) => { const m = String(url || "").match(/coverImg\/\d+\/(\d{10,13})/i); return m ? m[1] : ""; };

const htmlRaw = fs.readFileSync(SRC, "utf8");
const mm = htmlRaw.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/);
const master = JSON.parse(mm[1]);
const imgData = JSON.parse(fs.readFileSync(IMG, "utf8"));
const imgMap = imgData.images || (imgData.images = {});

async function getText(u) { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error("HTTP " + r.status); return dec(Buffer.from(await r.arrayBuffer())); }
// 2026 KOBIC 리스트 마크업 파서(표지 URL 직접 포함)
function parseKobic(htmlStr) {
  const out = [], seen = new Set();
  const re = /<li class="list-item"\s+isbn="(\d{10,13})"\s+bookIdx="(\d+)">([\s\S]*?)<\/li>/gi; let m;
  while ((m = re.exec(htmlStr))) { const isbn = m[1], inner = m[3]; if (seen.has(isbn)) continue; seen.add(isbn);
    let title = strip((inner.match(/class="book-name">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    if (!title) title = strip((inner.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const cv = (inner.match(/<img[^>]+src="(\/bookImage\/book\/coverImg\/[^"]+)"/) || [])[1];
    out.push({ isbn, title: ent(title), cover: cv ? ("https://www.kobic.net" + cv) : "" }); }
  return out.filter((x) => x.title);
}
// ISBN 으로 KOBIC 정식 표지 URL 취득(리스트 우선, 없으면 상세)
async function coverByIsbn(isbn) {
  try {
    const items = parseKobic(await getText("https://www.kobic.net/book/searchBook/list.do?q=" + encodeURIComponent(isbn) + "&rowsCountPerPage=10"));
    const hit = items.find((c) => c.isbn === String(isbn)) || items[0];
    if (hit && hit.cover) return hit.cover;
  } catch (e) {}
  try {
    const t = await getText("https://www.kobic.net/book/bookInfo/view.do?isbn=" + isbn);
    const sm = t.match(/bookStorageUtil\.setItem\('[^']*',\s*'\d+',\s*'[^']*',\s*'([^']*)'\)/);
    const cp = (sm && sm[1]) || (t.match(/\/bookImage\/book\/coverImg\/[^"' ]+?\.(?:jpg|png)/i) || [])[0];
    if (cp) return cp.startsWith("http") ? cp : "https://www.kobic.net" + cp;
  } catch (e) {}
  return "";
}
async function download(url, uid) {
  const r = await fetch(url, { headers: { ...UA, referer: "https://www.kobic.net/" } }); if (!r.ok) return false;
  const ct = r.headers.get("content-type") || ""; if (!ct.includes("image")) return false;
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 1500) return false;   // 플레이스홀더/깨짐 방지
  fs.writeFileSync(path.join(COVERS, uid + ".jpg"), buf); return { bytes: buf.length, md5: md5(buf) };
}
function saveData() {
  fs.writeFileSync(IMG, JSON.stringify(imgData, null, 2), "utf8");
  fs.writeFileSync(SRC, htmlRaw.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8");
}

(async () => {
  const eng = master.materials.filter((m) => m.domain === "영어");
  const byUid = {}; eng.forEach((m) => (byUid[m.materialUid] = m));
  const bookIsbn = (m) => isbnOf(m.isbn) || isbnOf((imgMap[m.materialUid] || {}).isbn);

  // ---- 무네트워크 정적 점검 ----
  const localMd5 = {};
  for (const m of eng) { const f = path.join(COVERS, m.materialUid + ".jpg"); if (fs.existsSync(f)) { try { localMd5[m.materialUid] = md5(fs.readFileSync(f)); } catch (e) {} } }
  // 무표지 플레이스홀더 해시 취득(한 번)
  let noimgHash = ""; try { const r = await fetch("https://www.kobic.net/resources/store/images/book_noimage.jpg", { headers: UA }); if (r.ok) noimgHash = md5(Buffer.from(await r.arrayBuffer())); } catch (e) {}

  const isbnMismatch = [], placeholder = [], missing = [], nonKobicWithIsbn = [];
  for (const m of eng) {
    const uid = m.materialUid, info = imgMap[uid] || {};
    const myIsbn = bookIsbn(m);
    if (!localMd5[uid]) { if (!info.localPath || !fs.existsSync(path.join(COVERS, uid + ".jpg"))) missing.push(uid); continue; }
    if (noimgHash && localMd5[uid] === noimgHash) { placeholder.push(uid); continue; }
    const fIsbn = fileIsbn(info.imageUrl);
    if (myIsbn && fIsbn && fIsbn !== myIsbn) { isbnMismatch.push(uid); continue; }   // ★확실 불일치
    if (info.source !== "KOBIC" && myIsbn) nonKobicWithIsbn.push(uid);
  }
  // 표지중복(서로 다른 ISBN 이 동일 md5)
  const byHash = {}; Object.entries(localMd5).forEach(([uid, h]) => { (byHash[h] = byHash[h] || []).push(uid); });
  const dupAcrossIsbn = Object.values(byHash).filter((a) => {
    if (a.length < 2) return false;
    const isbns = new Set(a.map((u) => bookIsbn(byUid[u])).filter(Boolean));
    return isbns.size > 1 || a.some((u) => !bookIsbn(byUid[u]));   // ISBN 다르거나 미상이 섞임 → 충돌
  });
  const dupUids = new Set(); dupAcrossIsbn.forEach((a) => a.forEach((u) => dupUids.add(u)));

  const report = {
    generatedAt: new Date().toISOString(), mode: FIX ? "fix" : "report", total: eng.length, withLocal: Object.keys(localMd5).length,
    isbnMismatch: isbnMismatch.length, placeholder: placeholder.length, missing: missing.length,
    nonKobicWithIsbn: nonKobicWithIsbn.length, dupCoverGroups: dupAcrossIsbn.length, dupCoverBooks: dupUids.size,
    samples: { isbnMismatch: isbnMismatch.slice(0, 20), dupGroups: dupAcrossIsbn.slice(0, 8).map((a) => a.map((u) => (byUid[u].title || "").slice(0, 22))) },
  };
  console.log("======= 표지 정합검수 =======");
  console.log(`영어 ${eng.length}종 · 로컬표지 ${report.withLocal}`);
  console.log(`[확실불일치] ISBN-파일명 ${report.isbnMismatch} · 표지중복그룹 ${report.dupCoverGroups}(${report.dupCoverBooks}종)`);
  console.log(`[결손] 무표지 ${report.placeholder} · 파일없음 ${report.missing}`);
  console.log(`[업그레이드 후보] 비KOBIC+ISBN ${report.nonKobicWithIsbn}`);

  if (!FIX) { fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8"); console.log("→ 리포트만(교정하려면 --fix). " + REPORT); return; }

  // ---- 교정(--fix): 우선순위 = 확실불일치 > 표지중복 > 결손 > 업그레이드, 그다음 증분 슬라이스 ----
  const claimed = new Set(Object.entries(localMd5).filter(([u]) => !dupUids.has(u)).map(([, h]) => h));   // 고유표지 점유(재사용 금지)
  const prio = [];
  const pushUniq = (arr) => arr.forEach((u) => { if (!prio.includes(u) && bookIsbn(byUid[u])) prio.push(u); });
  pushUniq(isbnMismatch); pushUniq([...dupUids]); pushUniq(placeholder); pushUniq(missing); pushUniq(nonKobicWithIsbn);
  // 증분 로테이션: 남은 ISBN 보유책을 verifiedAt 오래된 순으로 채워 매일 전수 순환
  const rest = eng.filter((m) => bookIsbn(m) && !prio.includes(m.materialUid))
    .sort((a, b) => String((imgMap[a.materialUid] || {}).verifiedAt || "") .localeCompare(String((imgMap[b.materialUid] || {}).verifiedAt || "")));
  const targets = prio.concat(rest.map((m) => m.materialUid)).slice(0, LIMIT);

  let fixed = 0, ok = 0, skip = 0, n = 0;
  for (const uid of targets) {
    const m = byUid[uid]; const myIsbn = bookIsbn(m); if (!myIsbn) { skip++; continue; }
    let cov = "";
    try { cov = await coverByIsbn(myIsbn); } catch (e) { skip++; await sleep(SLEEP); continue; }
    if (!cov) { skip++; await sleep(SLEEP); continue; }
    // KOBIC 표지 파일명 ISBN 이 내 ISBN 과 같은지 최종 확인(앵커 보증)
    const cIsbn = fileIsbn(cov);
    if (cIsbn && cIsbn !== myIsbn) { skip++; await sleep(SLEEP); continue; }
    const dl = await download(cov, uid);
    if (!dl) { skip++; await sleep(SLEEP); continue; }
    const before = localMd5[uid];
    if (before === dl.md5) { ok++; }                                   // 이미 정본과 동일 → 변경없음
    else { fixed++; }
    if (claimed.has(dl.md5) && before !== dl.md5) { /* 다른 책이 쓰는 표지면 충돌이지만 ISBN정본이므로 채택, 상대는 다음 회차 교정 */ }
    claimed.add(dl.md5); localMd5[uid] = dl.md5;
    imgMap[uid] = Object.assign(imgMap[uid] || {}, { status: "found", localPath: `covers/${uid}.jpg`, imageUrl: cov, source: "KOBIC", isbn: myIsbn, bytes: dl.bytes, materialTitle: m.title, verifiedAt: new Date().toISOString() });
    m.isbn = m.isbn || myIsbn;
    if (++n % 25 === 0) { saveData(); console.log(`  …진행 교정 ${fixed} / 동일 ${ok} / 보류 ${skip} (${n}/${targets.length})`); }
    await sleep(SLEEP);
  }
  saveData();
  report.fixed = fixed; report.unchanged = ok; report.skipped = skip; report.processed = n;
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2), "utf8");
  console.log(`\n완료 — 교정 ${fixed} / 정본동일 ${ok} / 보류 ${skip} (검증 ${n}종, 회당상한 ${LIMIT})`);
})();
