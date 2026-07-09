/* 📱 시간별 폰 리포트 다이제스트 — 브레인이 연구·업데이트한 내용을 요약해 ntfy JSON 페이로드로 출력.
   사용: node tools/brain/digest.js <ntfy토픽>  →  stdout에 {topic,title,message,...} JSON
   호출측(.github/workflows/hourly-report.yml)이 이 JSON을 https://ntfy.sh 로 POST.
   ⚠️ 어떤 파일이 없거나 깨져도 절대 throw 하지 않는다(워크플로 무중단) — 전부 안전 폴백. */
const fs = require("fs"), path = require("path"), cp = require("child_process");
const ROOT = path.resolve(__dirname, "..", "..");
const TOPIC = (process.argv[2] || "").trim();
const PC_URL = "https://inheok1103-alt.github.io/english-textbook-system/";
const MO_URL = "https://inheok1103-alt.github.io/english-textbook-system-mobile/";

function readJSON(p) { try { return JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8")); } catch (e) { return null; } }
function safe(fn, d) { try { return fn(); } catch (e) { return d; } }

// ===== 상세설정 로드(없거나 깨져도 안전 기본값) =====
const CFG_DEFAULT = {
  enabled: true, everyNHours: 1, quietHours: { startKST: 0, endKST: 7 }, onlyOnChange: false,
  priority: 3, sections: { catalog: true, recentWork: true, weeklyBest: true, brainHealth: true, insight: true },
  weeklyBuckets: ["고", "중", "초", "성인"], weeklyTopN: 1,
};
const _cfg = readJSON("tools/brain/report_config.json") || {};
const cfg = Object.assign({}, CFG_DEFAULT, _cfg);
cfg.sections = Object.assign({}, CFG_DEFAULT.sections, _cfg.sections || {});
cfg.quietHours = Object.assign({}, CFG_DEFAULT.quietHours, _cfg.quietHours || {});
const sec = cfg.sections;
// 발송 스킵 시 아무것도 출력하지 않고 종료(워크플로가 빈 페이로드를 감지해 발송 안 함)
function skip(reason) { process.stderr.write("[digest] 스킵: " + reason + "\n"); process.exit(0); }

// KST(UTC+9) 시각 라벨
const now = new Date();
const kst = new Date(now.getTime() + 9 * 3600 * 1000);
const M = kst.getUTCMonth() + 1, D = kst.getUTCDate(), H = kst.getUTCHours();
const timeLabel = `${M}월 ${D}일 ${String(H).padStart(2, "0")}시`;

// ①정지 ②간격(N시간마다) ③조용시간 게이팅
if (!cfg.enabled) skip("enabled=false");
const N = Math.max(1, +cfg.everyNHours || 1);
if (N > 1 && (H % N) !== 0) skip(`everyNHours=${N} (현재 ${H}시)`);
const qs = +cfg.quietHours.startKST || 0, qe = +cfg.quietHours.endKST || 0;
if (qs !== qe) {
  const inQuiet = qs < qe ? (H >= qs && H < qe) : (H >= qs || H < qe);  // 자정 넘김도 지원
  if (inQuiet) skip(`quietHours ${qs}~${qe} (현재 ${H}시)`);
}

// ① 브레인 건강/사이클
const out = readJSON("tools/brain/brain_output.json") || {};
const st = readJSON("tools/brain/brain_state.json") || {};
const h = out.health || {};
const total = h.total != null ? h.total : safe(() => (fs.readFileSync(path.join(ROOT, "books.js"), "utf8").match(/window\.__BOOKS__=\[/) ? "?" : "?"), "?");
const cycle = out.cycle != null ? out.cycle : (st.cycle != null ? st.cycle : "?");
const okParts = (st.lastReport || []).filter((r) => r.ok && !r.skipped).map((r) => r.ko);
const failParts = (st.lastReport || []).filter((r) => !r.ok && !r.skipped).map((r) => r.ko);

// ② 최근 1시간 커밋 활동(브레인이 실제로 무엇을 했나)
let recent = [];
try {
  const log = cp.execSync('git log --since="75 minutes ago" --pretty=%s', { cwd: ROOT, encoding: "utf8" });
  recent = log.split("\n").map((s) => s.trim()).filter(Boolean)
    .filter((s) => !/^Merge /.test(s)).slice(0, 5);
} catch (e) {}
// ④ 변경시만 발송(onlyOnChange): 최근 새 작업 없으면 스킵
if (cfg.onlyOnChange && !recent.length) skip("onlyOnChange=true & 최근 변경 없음");

// ③ 이번 주 베스트셀러 상위(학년대별)
const rk = readJSON("rankings.json") || {};
const wk = rk.weekly || {};
const bb = wk.byBucket || {};
const topN = Math.max(1, +cfg.weeklyTopN || 1);
function topOf(bucket) { const a = bb[bucket]; return (a || []).slice(0, topN).map((x) => String(x.title).slice(0, 30)); }

// ④ 최근 통찰(있으면 헤드라인 1개)
let insight = "";
try {
  const md = fs.readFileSync(path.join(ROOT, "tools/brain/brain_insights.md"), "utf8");
  const heads = md.split("\n").filter((l) => /^#{1,3}\s+\S/.test(l) && !/목차|Table/i.test(l));
  if (heads.length) insight = heads[heads.length - 1].replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 44);
} catch (e) {}

// ===== 메시지 조립(markdown) — 설정된 섹션만 =====
const L = [];
if (sec.catalog) {
  L.push(`📚 **카탈로그 ${Number(total).toLocaleString ? Number(total).toLocaleString() : total}종**` +
    (h.coverPct != null ? ` · 표지 ${h.coverPct}% · 가격 ${h.pricePct}%` : ""));
  if (h.salesPoint != null) L.push(`   💰 판매지수 ${Number(h.salesPoint).toLocaleString()}종 · 원서 ${h.foreign || 0}종`);
}
if (sec.recentWork) {
  if (recent.length) { L.push(`\n🔧 **최근 1시간 작업**`); recent.forEach((s) => L.push(`• ${s.slice(0, 52)}`)); }
  else L.push(`\n🔧 최근 1시간 새 커밋 없음 (다음 브레인 사이클 대기)`);
}
if (sec.weeklyBest) {
  const wkLabel = wk.weekLabel ? ` (${wk.weekLabel})` : "";
  const buckets = Array.isArray(cfg.weeklyBuckets) ? cfg.weeklyBuckets : CFG_DEFAULT.weeklyBuckets;
  const lines = [];
  buckets.forEach((g) => topOf(g).forEach((t, i) => lines.push(`• [${g}${topN > 1 ? " " + (i + 1) : ""}] ${t}`)));
  if (lines.length) { L.push(`\n🔥 **이번 주 베스트${wkLabel}**`); lines.forEach((x) => L.push(x)); }
}
if (sec.brainHealth) {
  L.push(`\n🧠 브레인 사이클 #${cycle} ${failParts.length ? "⚠️ 실패:" + failParts.join("·") : "정상"}` +
    (okParts.length ? ` (${okParts.slice(0, 5).join("·")})` : ""));
}
if (sec.insight && insight) L.push(`💡 최근 통찰: ${insight}`);

if (!L.length) skip("모든 섹션 off — 보낼 내용 없음");

const message = L.join("\n");
const title = `🧠 Ray English 리포트 · ${timeLabel}`;
const prio = failParts.length ? Math.max(4, +cfg.priority || 3) : (+cfg.priority || 3);

const payload = {
  topic: TOPIC,
  title,
  message,
  tags: ["books", failParts.length ? "warning" : "white_check_mark"],
  priority: prio,
  markdown: true,
  click: PC_URL,
  actions: [
    { action: "view", label: "PC 앱", url: PC_URL },
    { action: "view", label: "모바일 앱", url: MO_URL },
  ],
};

process.stdout.write(JSON.stringify(payload));
