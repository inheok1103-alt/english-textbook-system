/* ============================================================================
   🧠 BRAIN — 하네스 프리미티브(lib)
   모든 세세한 작업을 "동일 규격의 하네스 노드(step)"로 실행한다.
   step = { id, ko, cmd?|run?, env?, tier, critical? }
     - cmd : 셸 명령(문자열 또는 ctx→문자열). 기존 tools/*.js 스크립트를 감싼다.
     - run : async(ctx)=>({note?, ...stats})  순수 JS 하네스(외부 프로세스 없이 동작)
     - tier: 'routine'(매 사이클) | 'deep'(깊은 사이클) | 'manual'(수동/디스패치 전용)
     - critical: true면 실패 시 상위(신경다발)로 예외 전파(그 외엔 격리되어 계속)
   ============================================================================ */
const { execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const fmt = (ms) => (ms / 1000).toFixed(1) + "s";
const tierIcon = (t) => (t === "deep" ? "◆" : t === "manual" ? "▫" : "▹");

// 셸 하네스: 기존 파이프라인 스크립트를 격리 실행(작업트리 루트 기준)
function sh(cmd, env) {
  return execSync(cmd, { cwd: ROOT, stdio: "inherit", env: Object.assign({}, process.env, env || {}) });
}
// 조용한 셸(출력 캡처, 실패 시 빈 문자열)
function shq(cmd) { try { return execSync(cmd, { cwd: ROOT }).toString(); } catch (e) { return ""; } }

// books.js 통계(건강지표 계산에 재사용)
function readBooks() {
  try {
    const src = fs.readFileSync(path.join(ROOT, "books.js"), "utf8");
    return JSON.parse(src.match(/window\.__BOOKS__=(\[[\s\S]*?\]);\s*\nwindow\.__TABS__/)[1]);
  } catch (e) { return null; }
}

/* 하네스 러너 — 한 부위(region)의 step 배열을 계획(plan)에 맞춰 순차 실행.
   각 노드는 로깅·타이밍·에러격리·tier게이팅·단일스텝필터를 균일하게 받는다. */
async function runSteps(ctx, region, steps) {
  const out = [];
  for (const s of steps) {
    const tier = s.tier || "routine";
    const ref = region.id + "." + s.id;
    // 단일 스텝 지정 시: 그 스텝만
    if (ctx.plan.onlyStep && ctx.plan.onlyStep !== s.id && ctx.plan.onlyStep !== ref) {
      out.push({ id: s.id, ko: s.ko, tier, skipped: "filter" }); continue;
    }
    // tier 게이팅(단일 스텝 지정 시엔 tier 무시하고 강제 실행)
    if (!ctx.plan.onlyStep && !ctx.plan.tiers.includes(tier)) {
      out.push({ id: s.id, ko: s.ko, tier, skipped: "tier" }); continue;
    }
    const t = Date.now();
    if (ctx.DRY) { ctx.log("     " + tierIcon(tier) + " " + s.ko + " (" + ref + ") [" + tier + ", dry]"); out.push({ id: s.id, ko: s.ko, tier, dry: true }); continue; }
    try {
      let r = {};
      if (s.cmd) { sh(typeof s.cmd === "function" ? s.cmd(ctx) : s.cmd, typeof s.env === "function" ? s.env(ctx) : s.env); }
      if (s.run) { r = (await s.run(ctx)) || {}; }
      out.push({ id: s.id, ko: s.ko, tier, ok: true, ms: Date.now() - t, ...r });
      ctx.log("     ✓ " + s.ko + " " + fmt(Date.now() - t) + (r.note ? " — " + r.note : ""));
    } catch (e) {
      const msg = String((e && e.message) || e).split("\n")[0];
      out.push({ id: s.id, ko: s.ko, tier, ok: false, err: msg });
      ctx.log("     ✗ " + s.ko + " 실패: " + msg);
      if (s.critical) throw e;
    }
  }
  return out;
}

module.exports = { ROOT, sh, shq, readBooks, runSteps, fmt, tierIcon };
