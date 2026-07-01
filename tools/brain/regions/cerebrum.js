/* 대뇌(大腦) — 고차 처리(사고 산출)
   감각·정제된 입력을 종합해 "판단과 산출물"을 만든다:
     · 빌드 : 목표/시기 자동부여·추천 근거·오디언스 트랙을 구워 books.js·index.html 생성
     · 랭킹 : 판매지수(알라딘)로 학년대별 인기 랭킹(rankings.json) 산출
     · 카드 : 플레이스홀더 카드 생성(수동)
   build는 산출의 핵심이므로 critical(실패 시 상위로 전파). */
const { runSteps } = require("../lib");

module.exports = {
  id: "cerebrum", ko: "대뇌", role: "고차사고(빌드·랭킹)",
  steps: [
    { id: "build", ko: "앱 빌드(books.js·index.html)", tier: "routine", critical: true, cmd: "node tools/build_app.js" },
    { id: "rankings", ko: "판매 인기 랭킹 생성(rankings.json)", tier: "routine", cmd: "node tools/harvest_rankings.js" },
    { id: "cards", ko: "플레이스홀더 카드 생성", tier: "manual", cmd: "node tools/cards_for_placeholders.js" },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
