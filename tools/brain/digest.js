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

// KST(UTC+9) 시각 라벨
const now = new Date();
const kst = new Date(now.getTime() + 9 * 3600 * 1000);
const M = kst.getUTCMonth() + 1, D = kst.getUTCDate(), H = kst.getUTCHours();
const timeLabel = `${M}월 ${D}일 ${String(H).padStart(2, "0")}시`;

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

// ③ 이번 주 베스트셀러 상위(학년대별 1위)
const rk = readJSON("rankings.json") || {};
const wk = rk.weekly || {};
const bb = wk.byBucket || {};
function top1(bucket) { const a = bb[bucket]; return (a && a[0]) ? String(a[0].title).slice(0, 30) : null; }

// ④ 최근 통찰(있으면 헤드라인 1개)
let insight = "";
try {
  const md = fs.readFileSync(path.join(ROOT, "tools/brain/brain_insights.md"), "utf8");
  const heads = md.split("\n").filter((l) => /^#{1,3}\s+\S/.test(l) && !/목차|Table/i.test(l));
  if (heads.length) insight = heads[heads.length - 1].replace(/^#+\s*/, "").replace(/[*_`]/g, "").slice(0, 44);
} catch (e) {}

// ===== 메시지 조립(markdown) =====
const L = [];
L.push(`📚 **카탈로그 ${Number(total).toLocaleString ? Number(total).toLocaleString() : total}종**` +
  (h.coverPct != null ? ` · 표지 ${h.coverPct}% · 가격 ${h.pricePct}%` : ""));
if (h.salesPoint != null) L.push(`   💰 판매지수 ${Number(h.salesPoint).toLocaleString()}종 · 원서 ${h.foreign || 0}종`);

if (recent.length) {
  L.push(`\n🔧 **최근 1시간 작업**`);
  recent.forEach((s) => L.push(`• ${s.slice(0, 52)}`));
} else {
  L.push(`\n🔧 최근 1시간 새 커밋 없음 (다음 브레인 사이클 대기)`);
}

const wkLabel = wk.weekLabel ? ` (${wk.weekLabel})` : "";
const tops = [["고", top1("고")], ["중", top1("중")], ["초", top1("초")], ["성인", top1("성인")]].filter((x) => x[1]);
if (tops.length) {
  L.push(`\n🔥 **이번 주 베스트${wkLabel}**`);
  tops.forEach(([g, t]) => L.push(`• [${g}] ${t}`));
}

L.push(`\n🧠 브레인 사이클 #${cycle} ${failParts.length ? "⚠️ 실패:" + failParts.join("·") : "정상"}` +
  (okParts.length ? ` (${okParts.slice(0, 5).join("·")})` : ""));
if (insight) L.push(`💡 최근 통찰: ${insight}`);

const message = L.join("\n");
const title = `🧠 Ray English 리포트 · ${timeLabel}`;

const payload = {
  topic: TOPIC,
  title,
  message,
  tags: ["books", failParts.length ? "warning" : "white_check_mark"],
  priority: failParts.length ? 4 : 3,
  markdown: true,
  click: PC_URL,
  actions: [
    { action: "view", label: "PC 앱", url: PC_URL },
    { action: "view", label: "모바일 앱", url: MO_URL },
  ],
};

process.stdout.write(JSON.stringify(payload));
