/* 🧭 부위 순서 레지스트리 — 단일 진실원천(SSOT).
   부위 추가/삭제/순서변경은 **여기 배열 한 곳만** 고치면 됨:
     · brain.js  → REGIONS 맵·SIGNAL_ORDER·printMap 이 여기서 파생
     · midbrain.js → plan().run(실제 실행순서) 이 여기서 파생
   따라서 "지도순서(--map) = 실행순서(cycle)"가 구조적으로 보장된다(이전엔 3곳 하드코딩이라
   우연히 일치할 뿐이었음). manifest.js(전 시스템 --map)도 이 배열을 backbone으로 씀.
   ⚠️ 순환참조 회피: 여기서는 '신호부위'만 require한다(제어부 diencephalon·midbrain은
      brain.js가 직접 require). 신호부위는 index를 require하지 않으므로 사이클 없음.
      midbrain은 plan() 안에서 lazy require("./index")로 SIGNAL을 읽는다(로드시점 사이클 회피). */

// 제어부(신호흐름 밖, 항상 먼저) — id만 보관(모듈 require는 brain.js가)
const CONTROL = ["diencephalon", "midbrain"];

// 신호 흐름 순서: 수확→보강→연결→정제→빌드/랭킹→출력검증→성찰→운동출력(배포·검증)
// ⚠️ brainstem(뇌간)의 step은 전부 manual tier라 자동 사이클에선 실행 안 됨(크론 무영향).
const SIGNAL = ["nerve_bundles", "neurons", "synapses", "cerebellum", "cerebrum", "cortex", "prefrontal", "brainstem"];

// 신호부위 모듈 맵(순서대로 require)
const REGIONS = {};
SIGNAL.forEach((id) => { REGIONS[id] = require("./" + id); });

module.exports = { CONTROL, SIGNAL, REGIONS };
