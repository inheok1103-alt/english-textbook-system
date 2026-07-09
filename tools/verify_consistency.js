/* 🔬 시스템 일관성 guard — pipeline.js 단계와 brain 부위 step이 "같은 스크립트를 실행하는지" 강제.
   pipeline과 brain은 label(상세 vs 간결)·env(소스 다름)가 의도적으로 다르지만, 어느 .js를 돌리는지는
   반드시 일치해야 한다(둘이 데이터 파이프라인의 두 표면이므로). 한쪽에서 스크립트를 개명/교체하면 여기서 잡는다.
   → "단일 진실원천"을 리스크 없는 방식으로 강제(폴백 pipeline 러너·출력 무변경).
   사용: node tools/verify_consistency.js   종료코드: 일치 0 / 드리프트 1 */
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const REG = require("./brain/regions");   // 신호부위 SSOT

// pipeline 단계 key → brain region.stepId 대응(라벨·env는 달라도 되나 스크립트는 같아야)
const MAP = {
  "harvest-main": "nerve_bundles.harvest-main", "merge-main": "nerve_bundles.merge-main",
  "harvest-major": "nerve_bundles.harvest-major", "merge-major": "nerve_bundles.merge-major",
  "harvest-foreign": "nerve_bundles.harvest-foreign", "merge-foreign": "nerve_bundles.merge-foreign",
  "harvest-aladin": "nerve_bundles.harvest-aladin", "merge-aladin": "nerve_bundles.merge-aladin",
  "clean-noneng": "cerebellum.noneng", "clean-junk": "cerebellum.junk", "clean-dedup": "cerebellum.dedup",
  "classify": "cerebellum.classify", "enrich-foreign": "neurons.foreign",
  "enrich-aladin": "neurons.aladin", "enrich-kakao": "neurons.kakao",
  "verify-covers": "cerebellum.verify-covers", "index": "synapses.index",
  "build": "cerebrum.build", "rankings": "cerebrum.rankings",
};
const script = (cmd) => { const m = String(cmd || "").match(/tools\/([\w-]+\.js)/); return m ? m[1] : null; };

// brain step의 스크립트(문자열 cmd만 — 함수형 cmd는 런타임 키게이트라 스크립트 추출 후 비교)
function brainScript(ref) {
  const [rid, sid] = ref.split(".");
  const r = REG.REGIONS[rid]; if (!r) return null;
  const s = (r.steps || []).find((x) => x.id === sid); if (!s) return null;
  // 함수형 cmd(ctx=>키있으면 실스크립트, 없으면 echo폴백) → 키 있는 ctx로 호출해 의도 스크립트 추출
  let cmd = s.cmd;
  if (typeof cmd === "function") { try { cmd = cmd({ keys: { aladin: 1, kakao: 1, google: 1 }, quota: {}, plan: { aladinLimit: 0, enrichCursor: 0 } }); } catch (e) { cmd = ""; } }
  return script(cmd);
}

// pipeline.js STAGES에서 key·cmd 추출(각 STAGE는 1줄)
const pl = fs.readFileSync(path.join(ROOT, "tools", "pipeline.js"), "utf8");
const stages = [];
pl.split("\n").forEach((line) => {
  const k = line.match(/key:\s*"([^"]+)"/), c = line.match(/cmd:\s*"([^"]+)"/);
  if (k && c) stages.push({ key: k[1], scr: script(c[1]) });
});

let ok = 0, drift = 0; const issues = [];
stages.forEach((st) => {
  const ref = MAP[st.key];
  if (!ref) { issues.push(`pipeline '${st.key}' → brain 대응 미정의(MAP 누락)`); drift++; return; }
  const bs = brainScript(ref);
  if (!bs) { issues.push(`brain '${ref}' step/스크립트 없음(개명·삭제?)`); drift++; return; }
  if (bs !== st.scr) { issues.push(`드리프트 '${st.key}': pipeline=${st.scr} ≠ brain(${ref})=${bs}`); drift++; return; }
  ok++;
});
// 역방향: MAP이 가리키는 brain step이 실제 존재하는지(누락 감지는 위에서 처리)

console.log(`🔬 일관성 guard — pipeline 단계 ${stages.length} · 대응확인 ${ok} · 드리프트 ${drift}`);
if (issues.length) issues.forEach((i) => console.log("  ❌ " + i));
else console.log("  ✅ pipeline↔brain 스크립트 전부 일치(단일 진실원천 유지)");
process.exit(drift ? 1 : 0);
