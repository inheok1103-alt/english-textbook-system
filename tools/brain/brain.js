#!/usr/bin/env node
/* ============================================================================
   🧠 BRAIN — 교재 시스템 자율 신경계 오케스트레이터
   모든 세부 작업을 뇌 부위별 하네스로 나눠, 신경 신호 순서로 통합 실행한다.
   24시간(클라우드 크론)마다 한 "사이클(cycle)"을 사고한다.

   신호 흐름:
     간뇌(감지·조절) → 중뇌(계획·라우팅)
       → 신경다발(수확) → 뉴런(실시간 API) → 시냅스(연결/GitHub)
       → 소뇌(정제·검수) → 대뇌(빌드·랭킹) → 대뇌피질(출력 검증)
       → 간뇌(상태 저장·뇌파 로그)

   사용:
     node tools/brain/brain.js                # 한 사이클(routine, 조건 맞으면 deep 자동)
     node tools/brain/brain.js --deep         # 깊은 사이클 강제(수확 포함)
     node tools/brain/brain.js --routine-only # 수확 없이 가볍게
     node tools/brain/brain.js --region=cerebellum
     node tools/brain/brain.js --step=neurons.aladin
     node tools/brain/brain.js --dry          # 계획만(미실행)
     node tools/brain/brain.js --map          # 전체 신경계 지도 출력(미실행)
   ============================================================================ */
const { sh, shq, fmt } = require("./lib");

// ── 인자 파싱 ────────────────────────────────────────────────────────────
const raw = process.argv.slice(2);
const args = {};
for (const a of raw) {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const DRY = !!args.dry;

// ── 부위 하네스 로드(개별 하네스 = regions/*.js) ─────────────────────────
const diencephalon = require("./regions/diencephalon");
const midbrain = require("./regions/midbrain");
const REGIONS = {
  nerve_bundles: require("./regions/nerve_bundles"),
  neurons: require("./regions/neurons"),
  synapses: require("./regions/synapses"),
  cerebellum: require("./regions/cerebellum"),
  cerebrum: require("./regions/cerebrum"),
  cortex: require("./regions/cortex"),
};
const SIGNAL_ORDER = ["nerve_bundles", "neurons", "synapses", "cerebellum", "cerebrum", "cortex"];

const log = (m) => console.log(m);
const now = () => new Date();

function bar(t) { return "\n" + "═".repeat(66) + "\n" + t + "\n" + "═".repeat(66); }

// ── --map : 전체 신경계 지도(정적 구조) ──────────────────────────────────
function printMap() {
  log(bar("🧠 BRAIN 신경계 지도 — 부위별 하네스"));
  const ctrl = [diencephalon, midbrain];
  ctrl.forEach((r) => log("\n● " + r.ko + " (" + r.id + ") — " + r.role + "  [제어부]"));
  SIGNAL_ORDER.forEach((id) => {
    const r = REGIONS[id];
    log("\n● " + r.ko + " (" + r.id + ") — " + r.role);
    (r.steps || []).forEach((s) => log("   · [" + (s.tier || "routine").padEnd(7) + "] " + s.ko + "  (" + r.id + "." + s.id + ")"));
  });
  const all = SIGNAL_ORDER.reduce((n, id) => n + (REGIONS[id].steps || []).length, 0);
  log("\n" + "─".repeat(66));
  log("총 부위 8 · 신호경로 6 · 세부 하네스 " + all + "개");
  log("tier: routine=매 사이클 · deep=하루 1회(수확·심층정제) · manual=수동/디스패치 전용");
}

// ── 한 사이클 실행 ───────────────────────────────────────────────────────
async function cycle() {
  const t0 = Date.now();
  const ctx = { args, DRY, log, sh, shq, now: now() };

  // 간뇌: 감지·조절
  Object.assign(ctx, diencephalon.sense(ctx));
  // 중뇌: 계획·라우팅
  ctx.plan = midbrain.plan(ctx);

  log(bar("🧠 BRAIN cycle #" + ctx.state.cycle + " — " + ctx.now.toISOString() + (DRY ? "  (DRY)" : "")));
  log("건강: " + ctx.health.total + "종 · 표지 " + ctx.health.coverPct + "% · 가격 " + ctx.health.pricePct + "% · 판매지수 " + ctx.health.salesPoint + "종 · 원서 " + ctx.health.foreign);
  log("키: 알라딘 " + (ctx.keys.aladin ? "○" : "×") + " 카카오 " + (ctx.keys.kakao ? "○" : "×") + " 구글 " + (ctx.keys.google ? "○" : "×"));
  log("계획: tier[" + ctx.plan.tiers.join("+") + "] · 경로[" + ctx.plan.run.join("→") + "]" +
    (ctx.plan.onlyStep ? " · step=" + ctx.plan.onlyStep : "") + " · 알라딘 " + ctx.plan.aladinLimit + "/사이클");

  const report = [];
  for (const id of ctx.plan.run) {
    const r = REGIONS[id];
    log("\n▶ " + r.ko + " (" + id + ")");
    try {
      const res = await r.run(ctx);
      report.push({ id, ko: r.ko, ok: true, ...res });
    } catch (e) {
      const msg = String((e && e.message) || e).split("\n")[0];
      report.push({ id, ko: r.ko, ok: false, err: msg });
      log("⚠ " + r.ko + " 치명 오류: " + msg);
    }
  }

  // 간뇌: 상태 저장 + 뇌파 로그
  if (!DRY) diencephalon.persist(ctx, report);

  // 요약
  log(bar("📊 cycle #" + ctx.state.cycle + " 요약 — " + fmt(Date.now() - t0)));
  for (const r of report) {
    const steps = r.steps || [];
    const ok = steps.filter((s) => s.ok).length, fail = steps.filter((s) => s.ok === false).length, skip = steps.filter((s) => s.skipped).length;
    log("  " + (r.ok ? "✅" : "⚠") + " " + (r.ko || r.id).padEnd(6) + "  하네스 " + steps.length + "개 (성공 " + ok + " · 실패 " + fail + " · 스킵 " + skip + ")");
  }
  log("\n🧠 사이클 완료. (커밋·배포는 크론 워크플로가 수행)");
  return report;
}

(async () => {
  if (args.map) { printMap(); return; }
  await cycle();
})().catch((e) => { console.error("BRAIN 오류:", e); process.exit(1); });
