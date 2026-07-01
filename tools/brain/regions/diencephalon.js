/* 간뇌(視床·視床下部) — 감지·조절·항상성
   신경계의 중앙 중계·항상성 조절 기관. 여기서는:
   · sense()  : 외부/내부 상태를 감지 → ctx에 실을 컨텍스트 생성
                (지속 상태 brain_state.json, 카탈로그 건강지표, API 키 유무, 일일 쿼터 예산)
   · persist(): 이번 사이클 결과·커서를 상태에 반영해 다음 사이클로 전달(항상성 유지) */
const fs = require("fs"), path = require("path");
const { ROOT, readBooks } = require("../lib");

const STATE_PATH = path.join(__dirname, "..", "brain_state.json");
const LOG_PATH = path.join(__dirname, "..", "brain_log.jsonl");

// 알라딘 일 5,000 한도. 하루 12사이클(2h) 가정 → 사이클당 안전 예산.
const ALADIN_DAILY = 5000, CYCLES_PER_DAY = 12;

module.exports = {
  id: "diencephalon", ko: "간뇌", role: "감지·조절·항상성(상태·건강·키·쿼터)",

  sense(ctx) {
    let state = { cycle: 0, enrichCursor: 0, lastHarvestCycle: -999, lastDeepCycle: -999, at: null };
    try { state = Object.assign(state, JSON.parse(fs.readFileSync(STATE_PATH, "utf8"))); } catch (e) {}
    state.cycle = (state.cycle || 0) + 1;

    const env = process.env;
    const keys = {
      aladin: !!String(env.ALADIN_TTBKEY || "").trim(),
      kakao: !!String(env.KAKAO_REST_KEY || "").trim(),
      google: !!String(env.GOOGLE_BOOKS_KEY || "").trim(),
      data4lib: !!String(env.DATA4LIB_KEY || "").trim(),
    };

    // 건강지표(항상성 대상): 카탈로그가 골고루 채워졌는가
    let health = { total: 0 };
    const B = readBooks();
    if (B) {
      const pct = (n) => B.length ? Math.round(100 * n / B.length) : 0;
      health = {
        total: B.length,
        coverPct: pct(B.filter((b) => b.cover).length),
        pricePct: pct(B.filter((b) => b.price).length),
        salesPoint: B.filter((b) => b.pop > 0).length,
        foreign: B.filter((b) => b.foreign).length,
        needCover: B.filter((b) => !b.cover).length,
      };
    }

    // 쿼터 예산(항상성): 하루 한도를 사이클 수로 나눠 초과를 막는다
    const quota = { aladinPerCycle: Math.floor(ALADIN_DAILY / CYCLES_PER_DAY) };

    return { state, keys, health, quota, STATE_PATH, LOG_PATH };
  },

  persist(ctx, report) {
    const s = ctx.state;
    s.at = ctx.now.toISOString();
    s.enrichCursor = ctx.plan.nextCursor != null ? ctx.plan.nextCursor : s.enrichCursor;
    if (ctx.plan.tiers.includes("deep")) s.lastDeepCycle = s.cycle;
    if (report.some((r) => r.id === "nerve_bundles" && !r.skipped)) s.lastHarvestCycle = s.cycle;
    s.lastReport = report.map((r) => ({ id: r.id, ko: r.ko, ok: !!r.ok, skipped: !!r.skipped, steps: (r.steps || []).length }));
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)); } catch (e) {}
    // 사고 기록(감사용 뇌파 로그) — 한 줄 추가 + 최근 800줄만 보존(무한증가 방지)
    try {
      const line = JSON.stringify({ at: s.at, cycle: s.cycle, tiers: ctx.plan.tiers, health: ctx.health, report: s.lastReport });
      let lines = [];
      try { lines = fs.readFileSync(LOG_PATH, "utf8").split("\n").filter(Boolean); } catch (e) {}
      lines.push(line);
      if (lines.length > 800) lines = lines.slice(-800);
      fs.writeFileSync(LOG_PATH, lines.join("\n") + "\n");
    } catch (e) {}
  },
};
