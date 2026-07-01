/* 시냅스(synapse) — 신호 연결·매칭
   뉴런과 뉴런 사이를 잇는 연접부. 여기서는 흩어진 데이터를 "연결"한다:
     · 색인    : 책 ↔ 랭킹 키(master_index.csv) 매칭 색인 갱신
     · ISBN매칭: 레거시 스텁 → 실도서 ISBN 매칭(표지·가격 승격)
     · GitHub  : 원격 저장소(raw)와 실시간 연결 확인 — 원격 자료를 이어붙일 통로 점검
     · 코멘트  : 큐레이션 코멘트 반영(수동) */
const https = require("https");
const { runSteps } = require("../lib");

const GH_RAW = "https://raw.githubusercontent.com/inheok1103-alt/english-textbook-system/main/data/master_index.csv";

function ghHead(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (r) => { r.resume(); resolve(r.statusCode); });
    req.on("error", () => resolve(0));
    req.setTimeout(8000, () => { req.destroy(); resolve(0); });
  });
}

module.exports = {
  id: "synapses", ko: "시냅스", role: "연결·매칭(색인·ISBN매칭·GitHub 실시간 동기)",
  steps: [
    { id: "index", ko: "랭킹 매칭 색인 갱신", tier: "routine", cmd: "node tools/export_master_index.js" },
    { id: "github-sync", ko: "GitHub 원격 실시간 연결 확인", tier: "routine",
      run: async () => { const code = await ghHead(GH_RAW); return { note: "원격 master_index HTTP " + (code || "연결실패"), remote: code }; } },
    { id: "match-isbn", ko: "레거시 ISBN 자동 매칭", tier: "deep", cmd: "node tools/match_legacy_isbn.js" },
    { id: "match-manual", ko: "레거시 수동 매칭", tier: "manual", cmd: "node tools/match_legacy_manual.js" },
    { id: "apply-comments", ko: "큐레이션 코멘트 반영", tier: "manual", cmd: "node tools/apply_comments.js" },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
