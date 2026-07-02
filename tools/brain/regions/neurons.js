/* 뉴런(神經細胞) — 원자적 신호원(실시간 외부 API)
   하나의 뉴런 = 하나의 API 신호원. 필요할 때마다 실시간으로 외부 데이터를 발화시켜
   카탈로그에 가격·인기(판매지수)·표지·절판여부를 주입한다.
     · 알라딘 : 인기(SalesPoint)·가격·고해상 표지·절판/품절  (일 5,000 한도 → 쿼터 로테이션)
     · 카카오 : 가격·표지 폴백
     · 원서   : OpenLibrary/GoogleBooks 표지·메타(키 불필요)
     · 표지수집: 결측 표지 재수집(수동/깊은 사이클) */
const { runSteps } = require("../lib");

module.exports = {
  id: "neurons", ko: "뉴런", role: "실시간 API 신호원(알라딘·카카오·원서·표지)",
  steps: [
    { id: "aladin", ko: "알라딘 보강(인기·가격·표지·절판)", tier: "routine",
      cmd: (ctx) => ctx.keys.aladin ? "node tools/enrich_aladin.js" : "node -e \"console.log('알라딘 키 없음 — 스킵')\"",
      env: (ctx) => ({ ENRICH_LIMIT: String(ctx.plan.aladinLimit), ENRICH_OFFSET: String(ctx.plan.enrichCursor) }) },
    { id: "kakao", ko: "카카오 보강(가격·표지 폴백)", tier: "routine",
      cmd: (ctx) => ctx.keys.kakao ? "node tools/enrich_kakao.js" : "node -e \"console.log('카카오 키 없음 — 스킵')\"",
      env: { ENRICH_LIMIT: "3000" } },
    { id: "foreign", ko: "원서 표지·메타 보강(키 불필요)", tier: "routine",
      cmd: "node tools/enrich_foreign.js", env: { ENRICH_LIMIT: "150" } },
    // 표지 결측 재수집 — 대량 다운로드로 매우 무거움(deep 예산 초과 위험) → 수동 전용
    { id: "collect-covers", ko: "결측 표지 수집", tier: "manual", cmd: "node tools/collect_covers.js" },
    { id: "recollect-kobic", ko: "KOBIC 표지 재수집", tier: "manual", cmd: "node tools/recollect_kobic_covers.js" },
    { id: "recollect-kyobo", ko: "교보 표지 재수집", tier: "manual", cmd: "node tools/recollect_kyobo.js" },
    { id: "recollect-series", ko: "시리즈 표지 재수집 v2", tier: "manual", cmd: "node tools/recollect_series_v2.js" },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
