/* KOBIC 표지 정합 재수집 — 책-이미지 불일치 교정
   대상: source!=="KOBIC" 인 영어교재(원본 879 등, YES24/Kyobo 표지) + 무표지
   방식: KOBIC 제목검색 → 시리즈베이스 게이트로 정확매칭 → ISBN → 상세페이지 정품표지 다운로드
   사용: node tools/recollect_kobic_covers.js [--limit N]
   resumable: 이미 KOBIC표지(source=KOBIC)면 건너뜀
*/
const fs = require("fs"), path = require("path"), cr = require("crypto");
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "data", "iinhyuk_english_book_guide_v0.9_expanded.html");
const IMG = path.join(ROOT, "data", "book_images.json");
const COVERS = path.join(ROOT, "covers");
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36", "accept-language": "ko-KR,ko;q=0.9" };
const SLEEP = Number(process.env.KOBIC_SLEEP || 280);
const LIMIT = (() => { const i = process.argv.indexOf("--limit"); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dec = (b) => new TextDecoder("utf-8").decode(b);
const md5 = (b) => cr.createHash("md5").update(b).digest("hex");
const ent = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");
const strip = (s) => (s || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
const norm = (v) => String(v || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
const nospace = (v) => norm(v).replace(/\s+/g, "");
const seriesBase = (t) => norm(String(t || "").replace(/\([^)]*\)/g, " ").replace(/\b\d+\s*(st|nd|rd|th)\s+edition\b/gi, " ").replace(/\b(level|lv|book|band|stage|grade|단계)\b/gi, " ").replace(/\b[\d-]+\b/g, " "));
const volOf = (t) => { const s = " " + String(t || "").toLowerCase() + " "; const n = s.replace(/\b\d+\s*(st|nd|rd|th)\s+edition\b/g, " ").match(/\b\d+\b/g); return n ? Number(n[n.length - 1]) : null; };

const html = fs.readFileSync(SRC, "utf8");
const mm = html.match(/<script id="master-data" type="application\/json">([\s\S]*?)<\/script>/);
const master = JSON.parse(mm[1]);
const imgData = JSON.parse(fs.readFileSync(IMG, "utf8"));
const imgMap = imgData.images || (imgData.images = {});

function cleanTitle(t) { return String(t || "").split("|")[0].replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim(); }
function passesGate(mTitle, candTitle) {
  const b = nospace(seriesBase(mTitle));
  if (b.length >= 3) return nospace(candTitle).includes(b);
  const toks = norm(mTitle).split(" ").filter((x) => x.length >= 2);
  if (!toks.length) return false; const g = norm(candTitle); let hit = 0; for (const x of toks) if (g.includes(x)) hit++;
  return hit >= Math.max(2, Math.ceil(toks.length * 0.6));
}
async function getText(u) { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error("HTTP " + r.status); return dec(Buffer.from(await r.arrayBuffer())); }
function parseKobic(htmlStr) {
  // 2026 KOBIC 마크업: <li class="list-item" isbn=".." bookIdx="..">…<div class="book-name"><a>제목</a>…<img src="/bookImage/..">
  const out = [], seen = new Set();
  const re = /<li class="list-item"\s+isbn="(\d{10,13})"\s+bookIdx="(\d+)">([\s\S]*?)<\/li>/gi; let m;
  while ((m = re.exec(htmlStr))) { const isbn = m[1], inner = m[3]; if (seen.has(isbn)) continue; seen.add(isbn);
    let title = strip((inner.match(/class="book-name">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    if (!title) title = strip((inner.match(/<a[^>]*>([\s\S]*?)<\/a>/) || [])[1]);
    const cv = (inner.match(/<img[^>]+src="(\/bookImage\/book\/coverImg\/[^"]+)"/) || [])[1];
    out.push({ isbn, title: ent(title), code: "", cover: cv ? ("https://www.kobic.net" + cv) : "" }); }
  return out.filter((x) => x.title);
}
function score(m, c, wantVol) {
  const got = norm(c.title); let s = 0; const base = seriesBase(m.title);
  if (base && base.length > 2 && got.includes(base)) s += 45;
  for (const tk of norm(m.title).split(" ")) if (tk.length >= 2 && got.includes(tk)) s += 5;
  const gv = volOf(c.title);
  if (wantVol != null && gv != null) s += gv === wantVol ? 34 : -26;
  if (c.code === "ENG") s += 6;
  if (/workbook|teacher|정답|해설|답지|세트|전\d권/i.test(c.title)) s -= 12;
  return s;
}
async function detailCover(isbn) {
  const t = await getText("https://www.kobic.net/book/bookInfo/view.do?isbn=" + isbn);
  const sm = t.match(/bookStorageUtil\.setItem\('[^']*',\s*'\d+',\s*'[^']*',\s*'([^']*)'\)/);
  const cp = (sm && sm[1]) || (t.match(/\/bookImage\/book\/coverImg\/[^"' ]+?\.(?:jpg|png)/i) || [])[0];
  return cp ? (cp.startsWith("http") ? cp : "https://www.kobic.net" + cp) : "";
}
async function download(url, uid) {
  const r = await fetch(url, { headers: { ...UA, referer: "https://www.kobic.net/" } }); if (!r.ok) return false;
  const ct = r.headers.get("content-type") || ""; if (!ct.includes("image")) return false;
  const buf = Buffer.from(await r.arrayBuffer()); if (buf.length < 1500) return false;
  fs.writeFileSync(path.join(COVERS, uid + ".jpg"), buf); return { bytes: buf.length, md5: md5(buf) };
}

(async () => {
  const eng = master.materials.filter((m) => m.domain === "영어");
  // 중복표지(같은 이미지 공유) 그룹 탐지 → 이런 책도 대상에 포함(서로 다른 책이 같은 표지면 오류)
  const claimedHash = new Set();   // 이번 런에서 이미 점유한 표지 md5(중복 재발 방지)
  const byHash = {};
  for (const m of eng) { const f = path.join(COVERS, m.materialUid + ".jpg"); if (fs.existsSync(f)) { try { const h = md5(fs.readFileSync(f)); (byHash[h] = byHash[h] || []).push(m.materialUid); } catch (e) {} } }
  const dupUids = new Set(); Object.entries(byHash).forEach(([h, a]) => { if (a.length > 1) a.forEach((u) => dupUids.add(u)); else claimedHash.add(h); }); // 고유표지는 점유(재사용 금지)
  const targets = eng.filter((m) => (imgMap[m.materialUid] || {}).source !== "KOBIC" || dupUids.has(m.materialUid));
  console.log(`대상(비KOBIC표지 ${eng.filter((m)=>(imgMap[m.materialUid]||{}).source!=="KOBIC").length} + 중복표지 ${dupUids.size}) = ${targets.length} / 영어 ${eng.length}`);
  let fixed = 0, skip = 0, n = 0;
  for (const m of targets) {
    if (LIMIT && fixed >= LIMIT) break;
    const uid = m.materialUid; const wantVol = volOf(m.title);
    let cands = [];
    try {
      for (const q of [cleanTitle(m.title), seriesBase(m.title)].filter((x, i, a) => x && a.indexOf(x) === i).slice(0, 2)) {
        cands = parseKobic(await getText("https://www.kobic.net/book/searchBook/list.do?q=" + encodeURIComponent(q) + "&rowsCountPerPage=20"));
        cands = cands.filter((c) => passesGate(m.title, c.title)).map((c) => ({ ...c, score: score(m, c, wantVol) }));
        await sleep(SLEEP);
        if (cands.some((c) => c.score >= 50)) break;
      }
    } catch (e) { skip++; await sleep(SLEEP); continue; }
    const sorted = cands.sort((a, b) => b.score - a.score).filter((c) => c.score >= 24).slice(0, 4);
    if (!sorted.length) { skip++; continue; }
    let done = false;
    for (const cand of sorted) {
      try {
        let cov = cand.cover;                                  // 리스트에 표지URL 직접 포함(상세페이지 불필요)
        if (!cov) { cov = await detailCover(cand.isbn); await sleep(SLEEP); }
        if (!cov) continue;
        const dl = await download(cov, uid); if (!dl) continue;
        if (claimedHash.has(dl.md5)) continue;   // 다른 책이 이미 쓴 표지 → 다음 후보(중복 방지)
        claimedHash.add(dl.md5);
        imgMap[uid] = { status: "found", localPath: `covers/${uid}.jpg`, imageUrl: cov, source: "KOBIC", isbn: cand.isbn, sourceTitle: cand.title, score: cand.score, bytes: dl.bytes, materialTitle: m.title, publisher: m.publisher };
        m.isbn = m.isbn || cand.isbn; fixed++; done = true; break;
      } catch (e) {}
      await sleep(SLEEP);
    }
    if (!done) skip++;
    if (++n % 25 === 0) { fs.writeFileSync(IMG, JSON.stringify(imgData, null, 2), "utf8"); fs.writeFileSync(SRC, html.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8"); console.log(`  …진행 교체 ${fixed} / 보류 ${skip} (${n})`); }
    await sleep(SLEEP);
  }
  fs.writeFileSync(IMG, JSON.stringify(imgData, null, 2), "utf8");
  fs.writeFileSync(SRC, html.replace(mm[0], `<script id="master-data" type="application/json">${JSON.stringify(master)}</script>`), "utf8");
  console.log(`\n완료 — KOBIC표지 교체 ${fixed} / 보류 ${skip}`);
})();
