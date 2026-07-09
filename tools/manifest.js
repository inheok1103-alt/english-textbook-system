/* 🗺️ 전 시스템 매니페스트 — 데이터파이프라인·브레인·배포·검증·리포트 5계층을 단일 스키마로
   등록·조회한다. brain --map(브레인 부위만)을 전 계층으로 확장한 "시스템 지도".
   backbone = tools/brain/regions/index.js(부위 순서 SSOT). 브레인 부위 step이 데이터파이프라인의
   진실원천이고, 아래 HARNESS 배열이 그 밖(배포·검증·리포트)의 노드를 등록한다.
   사용: node tools/manifest.js [--map] | --json | --layer=<배포|검증|리포트|브레인|데이터>
   카운트·주기는 전부 동적 집계(손기록 상수 없음 → 드리프트 제거). */
const path = require("path");
const REG = require("./brain/regions");                       // { CONTROL, SIGNAL, REGIONS }
const CONTROL_MODS = REG.CONTROL.map((id) => require("./brain/regions/" + id));

// ── 워크플로 계층(어느 크론/디스패치가 무엇을 돌리나) ──────────────────────
const WORKFLOWS = [
  { file: "brain.yml", cron: "0 */2 * * * (2시간마다)", drives: "브레인 routine 매사이클 + deep 하루1회 + 커밋·배포·모바일동기", surface: "cloud" },
  { file: "hourly-report.yml", cron: "0 * * * * (매시)", drives: "폰 리포트(digest→ntfy), report_config.json 게이팅", surface: "cloud" },
  { file: "refresh-catalog.yml", cron: "수동(workflow_dispatch)", drives: "전체 파이프라인 1-shot 폴백(brain 대체용)", surface: "cloud" },
];

// ── 하네스 계층: 브레인 부위 밖의 로직·운영 노드(배포·검증·리포트) ────────────
//    brain 부위 step은 아래 introspect로 자동 수집되므로 여기엔 '부위 밖' 노드만 선언.
const HARNESS = [
  { id: "report", ko: "폰 리포트 다이제스트", layer: "리포트", cmd: "node tools/brain/digest.js <topic>", file: "tools/brain/digest.js", workflow: "hourly-report.yml", surface: "cloud", note: "brain 상태·랭킹·최근작업을 ntfy JSON으로. 설정 report_config.json" },
  { id: "deploy", ko: "배포 하네스", layer: "배포", cmd: "node tools/deploy.js [--push|--sync-mobile|--all|--dry]", file: "tools/deploy.js", workflow: "(로컬 수동 / 향후 brain.yml 편입)", surface: "both", note: "빌드→커밋→push(rebase내성)→모바일동기→라이브검증을 한 코드경로로" },
  { id: "verify_live", ko: "라이브 검증", layer: "검증", cmd: "node tools/verify_live.js [pc|mobile|both]", file: "tools/verify_live.js", workflow: "(deploy 후)", surface: "both", note: "배포된 사이트 HTTP200·렌더무결성·데이터로드 실측(사후검증)" },
  { id: "verify_logic", ko: "로직 검증", layer: "검증", cmd: "node tools/verify_logic.js", file: "tools/verify_logic.js", workflow: "(pre-deploy/CI)", surface: "local", note: "추천·챗봇 순수로직 전수 시뮬(학년제약·크래시·누수)+일관성 guard — 사전검증" },
  { id: "verify_consistency", ko: "일관성 guard", layer: "검증", cmd: "node tools/verify_consistency.js", file: "tools/verify_consistency.js", workflow: "(verify_logic 내장)", surface: "local", note: "pipeline↔brain 스크립트 드리프트 감지(단일 진실원천 강제)" },
];

// ── 브레인 부위 introspect(제어부 + 신호부위 + 각 step) ──────────────────────
function brainNodes() {
  const nodes = [];
  CONTROL_MODS.forEach((r) => nodes.push({ kind: "control", id: r.id, ko: r.ko, role: r.role, steps: [] }));
  REG.SIGNAL.forEach((id) => {
    const r = REG.REGIONS[id];
    nodes.push({ kind: "signal", id: r.id, ko: r.ko, role: r.role, steps: (r.steps || []).map((s) => ({ id: s.id, ko: s.ko, tier: s.tier || "routine", how: s.cmd ? "cmd" : (s.run ? "run" : "?") })) });
  });
  return nodes;
}

function build() {
  const brain = brainNodes();
  const allSteps = brain.flatMap((n) => n.steps);
  const tierCount = allSteps.reduce((a, s) => (a[s.tier] = (a[s.tier] || 0) + 1, a), {});
  return {
    layers: {
      브레인: { regions: brain.length, control: REG.CONTROL.length, signal: REG.SIGNAL.length, steps: allSteps.length, tiers: tierCount },
      데이터: { note: "브레인 신호부위 step이 진실원천(수확·정제·보강·검수·색인·빌드·랭킹). pipeline.js는 tier 슬라이스 폴백." },
      배포: { nodes: HARNESS.filter((h) => h.layer === "배포").length },
      검증: { nodes: HARNESS.filter((h) => h.layer === "검증").length },
      리포트: { nodes: HARNESS.filter((h) => h.layer === "리포트").length },
    },
    brain, harness: HARNESS, workflows: WORKFLOWS,
  };
}

function bar(t) { return "\n" + "━".repeat(70) + "\n" + t + "\n" + "━".repeat(70); }
const TI = { routine: "🔁", deep: "🌙", manual: "✋" };

function printMap() {
  const m = build();
  console.log(bar("🗺️  전 시스템 매니페스트 — 로직·하네스·파이프라인 통합 지도"));

  console.log("\n【 계층 요약 】");
  console.log(`  🧠 브레인   부위 ${m.layers.브레인.regions}(제어 ${m.layers.브레인.control}+신호 ${m.layers.브레인.signal}) · step ${m.layers.브레인.steps} ` +
    `(${Object.entries(m.layers.브레인.tiers).map(([k, v]) => TI[k] + k + " " + v).join(" · ")})`);
  console.log(`  📦 데이터   ${m.layers.데이터.note}`);
  console.log(`  🚀 배포     하네스 ${m.layers.배포.nodes}`);
  console.log(`  🔬 검증     하네스 ${m.layers.검증.nodes} (사전=로직 · 사후=라이브)`);
  console.log(`  📱 리포트   하네스 ${m.layers.리포트.nodes}`);

  console.log(bar("🧠 브레인 — 부위별 하네스(신호흐름 순, regions/index.js 파생)"));
  m.brain.forEach((n) => {
    console.log(`\n● ${n.ko} (${n.id})${n.kind === "control" ? " [제어부]" : ""} — ${n.role}`);
    n.steps.forEach((s) => console.log(`   ${TI[s.tier] || "·"} [${s.tier.padEnd(7)}] ${s.ko}  (${n.id}.${s.id})`));
  });

  console.log(bar("🚀 배포 · 🔬 검증 · 📱 리포트 하네스(부위 밖 노드)"));
  ["배포", "검증", "리포트"].forEach((layer) => {
    m.harness.filter((h) => h.layer === layer).forEach((h) => {
      console.log(`\n● [${layer}] ${h.ko} (${h.id}) — surface: ${h.surface} · 워크플로: ${h.workflow}`);
      console.log(`   $ ${h.cmd}`);
      console.log(`   ${h.note}`);
    });
  });

  console.log(bar("⏱️  워크플로(무엇이 언제 도나)"));
  m.workflows.forEach((w) => console.log(`\n● ${w.file}  [${w.cron}]  (${w.surface})\n   → ${w.drives}`));

  console.log("\n" + "─".repeat(70));
  console.log("불변식: 지도순서 = 실행순서(둘 다 regions/index.js 파생) · 로깅·에러격리·tier = lib.runSteps 1벌");
  console.log("─".repeat(70) + "\n");
}

const arg = process.argv.slice(2);
if (arg.includes("--json")) { console.log(JSON.stringify(build(), null, 2)); }
else { printMap(); }
