/* 대뇌피질(大腦皮質) — 의식 산출·출력 검증
   최종적으로 "밖으로 내보내는 산출물(index.html)"이 실제로 온전히 렌더되는지 검증한다.
   (이 부위가 과거 </style> 누락으로 페이지 전체가 죽었던 사고를 원천 차단한다.)
     · render-integrity : <style>가 <head> 안에서 닫히고, 인라인 스크립트가 전부 구문 유효
     · data-integrity   : books.js 파싱·비어있지 않음, rankings.json 파싱
     · output-report    : 건강 스냅샷을 brain_output.json으로 기록(사이트/README가 읽는 산출) */
const fs = require("fs"), path = require("path"), vm = require("vm");
const { ROOT, readBooks, runSteps } = require("../lib");

module.exports = {
  id: "cortex", ko: "대뇌피질", role: "의식 산출·출력 검증(렌더 무결성)",
  steps: [
    {
      id: "render-integrity", ko: "렌더 무결성(</style>·JS 구문)", tier: "routine", critical: true,
      run: async () => {
        const h = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
        const sc = h.indexOf("</style>"), hd = h.indexOf("</head>"), bd = h.search(/<body[\s>]/i);
        if (!(sc >= 0 && sc < hd && sc < bd)) throw new Error("구조 붕괴: </style>가 <head> 안에서 닫히지 않음");
        let bad = 0; const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g; let m;
        while ((m = re.exec(h))) { try { new vm.Script(m[1]); } catch (e) { bad++; } }
        if (bad) throw new Error("인라인 스크립트 구문 오류 " + bad + "건");
        return { note: "OK(<style> 닫힘·스크립트 구문 정상)" };
      },
    },
    {
      id: "data-integrity", ko: "데이터 무결성(books·rankings)", tier: "routine",
      run: async () => {
        const B = readBooks();
        if (!B || !B.length) throw new Error("books.js 비어있음/파싱 실패");
        let rk = "없음"; try { const r = JSON.parse(fs.readFileSync(path.join(ROOT, "rankings.json"), "utf8")); rk = (Array.isArray(r) ? r.length : Object.keys(r).length) + "섹션"; } catch (e) {}
        return { note: B.length + "종 · 랭킹 " + rk };
      },
    },
    {
      id: "output-report", ko: "건강 스냅샷 산출(brain_output.json)", tier: "routine",
      run: async (ctx) => {
        const out = { at: ctx.now.toISOString(), cycle: ctx.state.cycle, tiers: ctx.plan.tiers, health: ctx.health };
        try { fs.writeFileSync(path.join(__dirname, "..", "brain_output.json"), JSON.stringify(out, null, 2)); } catch (e) {}
        return { note: "스냅샷 기록" };
      },
    },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
