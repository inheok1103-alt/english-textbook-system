/* 🔬 라이브 검증 하네스(사후) — 배포된 사이트를 실제 렌더해 무결성 실측.
   과거 </style> 누락으로 전체 화이트스크린 사고 → cortex는 로컬 파일만 검증하므로 '배포 결과'
   실검증 공백을 메운다. HTTP200·JS pageerror 0·핵심 DOM·데이터(BOOKS)·랭킹 표지 로드를 확인.
   사용: node tools/verify_live.js [pc|mobile|both]   (기본 both)
   종료코드: 전부 통과 0 / 하나라도 실패 1  (CI·deploy 후 게이트로 사용) */
const path = require("path");
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const SITES = {
  pc: { ko: "PC", url: "https://inheok1103-alt.github.io/english-textbook-system/", mobile: false },
  mobile: { ko: "모바일", url: "https://inheok1103-alt.github.io/english-textbook-system-mobile/", mobile: true },
};
const which = (process.argv[2] || "both").toLowerCase();
const targets = which === "both" ? ["pc", "mobile"] : [which];

async function checkSite(key) {
  const s = SITES[key];
  const pptr = require(path.resolve(__dirname, "..", "node_modules", "puppeteer-core"));
  const b = await pptr.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const errs = [], fails = [];
  try {
    const pg = await b.newPage();
    if (s.mobile) await pg.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 });
    pg.on("pageerror", (e) => errs.push("JS:" + e.message.slice(0, 80)));
    pg.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errs.push("CON:" + m.text().slice(0, 80)); });
    const resp = await pg.goto(s.url + "?v=" + (process.env.CACHE_BUST || "live"), { waitUntil: "networkidle2", timeout: 45000 });
    // 1) HTTP 200
    if (!resp || resp.status() !== 200) fails.push("HTTP " + (resp ? resp.status() : "no-response"));
    // 2) 핵심 DOM + 데이터 로드
    const probe = await pg.evaluate(() => {
      const g = (id) => !!document.getElementById(id);
      return {
        booksLoaded: (typeof window.__BOOKS__ !== "undefined" && window.__BOOKS__.length) || 0,
        hasGrid: g("view-2d") || g("app") || g("view-rec"),
        hasChat: typeof toggleChat === "function",
        hasRankView: g("view-rank"),
        bodyLen: document.body ? document.body.innerText.length : 0,
      };
    }).catch((e) => ({ err: e.message }));
    if (probe.err) fails.push("probe 실패: " + probe.err);
    else {
      if (!probe.booksLoaded) fails.push("BOOKS 미로드");
      if (!probe.hasGrid) fails.push("핵심 뷰 DOM 없음");
      if (probe.bodyLen < 200) fails.push("본문 비정상(화이트스크린?) len=" + probe.bodyLen);
    }
    // 3) 랭킹뷰 주간 표지 로드(가능하면)
    let covers = { total: 0, loaded: 0 };
    try {
      await pg.evaluate(() => { if (typeof toggleView === "function") toggleView("rank"); });
      await new Promise((r) => setTimeout(r, 1500));
      await pg.evaluate(() => { if (typeof setRank === "function") { setRank("mkt", "weekly"); setRank("grade", "고"); } });
      await new Promise((r) => setTimeout(r, 2500));
      covers = await pg.evaluate(() => {
        const ext = document.getElementById("rankExternal");
        const imgs = ext ? [...ext.querySelectorAll("img")] : [];
        // 깨짐(404) = complete인데 naturalWidth 0. 로딩중(!complete)은 외부 CDN 지연이라 실패 아님.
        return { total: imgs.length, loaded: imgs.filter((i) => i.naturalWidth > 0).length, broken: imgs.filter((i) => i.complete && i.naturalWidth === 0).length };
      });
      // 깨진 표지(404)가 절반 이상이면 배포갭(과거 IH-ALADIN 404류) → 실패. 소수 지연로딩은 무시.
      if (covers.total && covers.broken > covers.total / 2) fails.push(`주간표지 깨짐 ${covers.broken}/${covers.total}(배포갭 의심)`);
    } catch (e) { /* 랭킹뷰 없으면 스킵 */ }
    if (errs.length) fails.push(errs.length + "개 JS/콘솔에러: " + errs.slice(0, 2).join(" | "));
    const ok = !fails.length;
    console.log(`${ok ? "✅" : "❌"} [${s.ko}] BOOKS ${probe.booksLoaded || "?"} · 표지 로드 ${covers.loaded}/${covers.total}(깨짐 ${covers.broken || 0}) · ${ok ? "정상" : fails.join(" / ")}`);
    return ok;
  } catch (e) {
    console.log(`❌ [${s.ko}] 검증 자체 실패: ${e.message.slice(0, 100)}`);
    return false;
  } finally { await b.close(); }
}

(async () => {
  console.log("🔬 라이브 검증:", targets.map((t) => SITES[t].ko).join("·"));
  let allOk = true;
  for (const t of targets) { const ok = await checkSite(t); allOk = allOk && ok; }
  console.log(allOk ? "\n🎉 전부 통과" : "\n⚠️ 실패 있음");
  process.exit(allOk ? 0 : 1);
})();
