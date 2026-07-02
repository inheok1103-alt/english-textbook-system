/* 전전두엽(前前頭葉) — 자기분석·개선(메타인지)
   뇌에서 자기 행동을 돌아보고 계획을 세우는 부위. 여기서는 주 1회:
     1. 백엔드(GAS)에 축적된 상담 질문 로그(chat_q)·활동 통계를 읽고
     2. Groq(무료 LLM)에게 "시스템이 못 받아낸 질문 유형·추가할 패턴·데이터 이상"을 분석시켜
     3. 통찰 리포트(brain_insights.md)를 커밋한다 — 사람이 다음 개선 때 바로 쓰는 재료.
   비용 0(주 1회 소량) · 코드 자동수정 없음(리포트만) → 무감독 배포 사고 원천 차단. */
const fs = require("fs"), path = require("path");
const { ROOT, readBooks, runSteps } = require("../lib");

const INSIGHT_MD = path.join(__dirname, "..", "brain_insights.md");
const WEEK_CYCLES = 84;   // 12사이클/일 × 7일 = 주 1회

// 앱에 박힌 GUIDE_ENDPOINT를 그대로 읽음 — URL이 바뀌어도 자동 추종
function endpointFromApp() {
  const s = fs.readFileSync(path.join(ROOT, "tools", "app_base.html"), "utf8");
  const m = s.match(/GUIDE_ENDPOINT\s*=\s*"([^"]+)"/);
  if (!m) throw new Error("app_base에서 GUIDE_ENDPOINT 못찾음");
  return m[1];
}

async function fetchLogs() {
  const ep = endpointFromApp();
  const r = await fetch(ep + "?events=1&n=200", { redirect: "follow" });
  const j = await r.json();
  const chats = (j.events || []).filter((e) => e.event === "chat_q").map((e) => {
    let q = ""; try { q = JSON.parse(e.extra || "{}").extraQ || ""; } catch (err) {}
    return { q, first: e.targetId || "", at: String(e.at || "").slice(0, 10) };
  }).filter((c) => c.q);
  return { counts: j.counts || {}, total: j.total || 0, devices: j.uniqueDevices || 0, chats };
}

// GAS 챗봇과 동일한 폴백 체인·한자 검출(전전두엽도 같은 신경전달물질을 쓴다)
async function groqThink(key, sys, usr) {
  const MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "meta-llama/llama-4-scout-17b-16e-instruct"];
  for (const m of MODELS) {
    try {
      const body = { model: m, temperature: 0.3, max_tokens: m.includes("gpt-oss") ? 1500 : 1000,
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }] };
      if (m.includes("gpt-oss")) body.reasoning_effort = "low";
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body) });
      const d = await r.json();
      let ans = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (ans) ans = String(ans).replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      if (ans && !/[一-鿿]/.test(ans)) return { ans, model: m };
    } catch (e) {}
  }
  return null;
}

module.exports = {
  id: "prefrontal", ko: "전전두엽", role: "자기분석·개선(상담로그→통찰 리포트, 주 1회)",
  steps: [
    {
      id: "reflect", ko: "상담로그 자기분석(주 1회)", tier: "deep",
      run: async (ctx) => {
        // 주기 게이팅: 마지막 분석 후 1주(84사이클) 미만이면 대기 (--step 지정 시 강제 실행)
        if (!ctx.plan.onlyStep && ctx.state.cycle - (ctx.state.lastInsightCycle || -9999) < WEEK_CYCLES)
          return { note: "주기 미도래(주 1회)" };
        const key = String(process.env.GROQ_KEY || "").trim();
        if (!key) return { note: "GROQ_KEY 미설정 — 스킵(시크릿 등록 시 활성화)" };

        const logs = await fetchLogs();
        const B = readBooks() || [];
        const qList = logs.chats.slice(-100).map((c, i) => (i + 1) + ". [" + c.at + "] " + c.q + (c.first ? "  → 1순위후보: " + c.first : "")).join("\n") || "(질문 로그 없음)";
        const evSum = Object.entries(logs.counts).map(([k, v]) => k + ":" + v).join(", ");

        const sys = "너는 한국 영어교재 추천 시스템의 품질 분석가다. 반드시 순수 한국어(한글)로만 써라(한자·중국어 금지). 마크다운으로 간결하게, 근거 없는 추측은 '추정'이라고 표시하라.";
        const usr = "다음은 교재 상담 챗봇에 실제 들어온 질문 로그와 시스템 현황이다.\n\n"
          + "[상담 질문 최근 " + logs.chats.length + "건]\n" + qList + "\n\n"
          + "[활동 통계] 총 이벤트 " + logs.total + " · 순사용자 " + logs.devices + " · 유형별 " + evSum + "\n"
          + "[카탈로그] " + B.length + "종 (표지 " + Math.round(100 * B.filter(b => b.cover).length / (B.length || 1)) + "%, 판매지수 보유 " + B.filter(b => b.pop > 0).length + "종)\n\n"
          + "분석해서 다음 5개 섹션으로 보고하라:\n"
          + "### 1. 자주 묻는 질문 유형 TOP (빈도 추정 포함)\n"
          + "### 2. 시스템이 잘 못 받아냈을 질문 (모호·범위 밖·패턴 미비 — 로그 근거 인용)\n"
          + "### 3. 파서에 추가할 패턴 제안 (약점 키워드→보완 영역, 수준 표현→레벨. 정규식 형태로)\n"
          + "### 4. 챗봇 예시 칩 제안 (사용자들이 실제 묻는 표현 5개)\n"
          + "### 5. 데이터·품질 이상 징후 (있으면)";

        const out = await groqThink(key, sys, usr);
        if (!out) return { note: "Groq 응답 실패 — 다음 주기 재시도" };

        // 리포트 파일: 최신 섹션을 맨 위에, 최근 10회분만 보존
        let old = ""; try { old = fs.readFileSync(INSIGHT_MD, "utf8"); } catch (e) {}
        const prevSections = old.split(/\n(?=## \d{4}-)/).filter((p) => /^## \d{4}-/.test(p.trim())).slice(0, 9);
        const section = "## " + ctx.now.toISOString().slice(0, 10) + " — cycle #" + ctx.state.cycle + " · " + out.model + " · 질문 " + logs.chats.length + "건 분석\n\n" + out.ans + "\n";
        fs.writeFileSync(INSIGHT_MD, "# 🧠 전전두엽 통찰 리포트 — 시스템 자기분석(주 1회 자동)\n\n" + section + "\n" + prevSections.join("\n"));

        ctx.state.lastInsightCycle = ctx.state.cycle;   // 간뇌가 상태로 저장 → 주기 유지
        return { note: "질문 " + logs.chats.length + "건 분석 → brain_insights.md 갱신" };
      },
    },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
