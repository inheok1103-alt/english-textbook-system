/* 뇌간(腦幹) — 운동 출력(motor output): 배포·동기·검증·리포트. 신경계의 '손발'.
   처리(대뇌·피질)·성찰(전전두엽) 뒤 최종적으로 바깥세상에 내보내는 행동을 담당한다.
   ⚠️ 모든 step은 tier=manual — 자동 사이클(routine/deep)에서는 실행되지 않는다.
      (클라우드 브레인 크론의 커밋·푸시·모바일동기는 brain.yml이 검증된 자체 경로로 계속 담당.
       이 부위는 로컬 배포·검증을 브레인 하네스로 '정식 편입'해 --map·--step으로 조회/수동실행하게 함.)
   실행: node tools/brain/brain.js --step=brainstem.verify-live  (tier 무시하고 강제 실행)
   각 step은 tools/의 독립 하네스(deploy.js·verify_live.js·verify_logic.js)를 호출 — 로직 단일소스. */
const cp = require("child_process");
const { ROOT, runSteps } = require("../lib");

function shOut(cmd) { return cp.execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }

module.exports = {
  id: "brainstem", ko: "뇌간", role: "운동 출력(배포·동기·검증·리포트) — 신경계의 손발",
  steps: [
    {
      id: "verify-logic", ko: "사전 로직검증(추천·챗봇 불변식)", tier: "manual",
      run: async () => { shOut("node tools/verify_logic.js"); return { note: "학년제약·크래시·누수 불변식 통과" }; },
    },
    {
      id: "deploy", ko: "origin 커밋·푸시(rebase내성)", tier: "manual",
      run: async () => { shOut("node tools/deploy.js --push -m \"🚀 brainstem deploy\""); return { note: "origin main 배포" }; },
    },
    {
      id: "sync-mobile", ko: "모바일 동기(공유로직 이식+데이터)", tier: "manual",
      run: async () => { shOut("node tools/deploy.js --sync-mobile"); return { note: "모바일 코드·데이터 동기" }; },
    },
    {
      id: "verify-live", ko: "사후 라이브검증(PC·모바일 스모크)", tier: "manual",
      run: async () => { const o = shOut("node tools/verify_live.js both"); return { note: o.includes("전부 통과") ? "라이브 정상" : "라이브 이상 감지" }; },
    },
    {
      id: "report", ko: "폰 리포트(다이제스트→ntfy)", tier: "manual",
      run: async () => { return { note: "정기 발송은 hourly-report.yml이 매시 담당(2h 브레인과 별도 cadence). 여기선 수동 트리거용." }; },
    },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
