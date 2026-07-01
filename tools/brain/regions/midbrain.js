/* 중뇌(中腦) — 계획·라우팅·반사(relay/reflex)
   감각·운동 신호의 중계·반사 중추. 여기서는 "이번 사이클에 무엇을 돌릴지"를
   상태(간뇌 감지값)·시각·쿼터로 라우팅한다.
     · 매 사이클(routine): 보강(뉴런)·연결(시냅스)·정제(소뇌)·빌드/랭킹(대뇌)·출력검증(대뇌피질)
     · 하루 1회(deep)    : 수확(신경다발) — 신간·전공·원서 스윕
     · manual           : 자동 실행 안 함(디스패치/CLI 전용)
   플래그: --deep 강제, --routine-only, --region=, --step= */
module.exports = {
  id: "midbrain", ko: "중뇌", role: "계획·라우팅·반사(무엇을 언제)",

  plan(ctx) {
    const a = ctx.args;
    const c = ctx.state.cycle;
    const hourUTC = ctx.now.getUTCHours();

    // 단일 부위/스텝 지정 → 그것만
    const onlyRegion = a.region || (a.step ? a.step.split(".")[0] : null);
    const onlyStep = a.step ? (a.step.includes(".") ? a.step.split(".")[1] : a.step) : null;

    // deep 판정: --deep 강제 or 마지막 deep 후 하루(≈12사이클) 지남 or UTC 18시(주 스윕대)
    const dueDeep = (c - (ctx.state.lastDeepCycle || -999)) >= 12;
    const deep = !!a.deep || (!a["routine-only"] && (dueDeep || hourUTC === 18));

    const tiers = ["routine"];
    if (deep) tiers.push("deep");
    if (a.manual) tiers.push("manual"); // 명시적으로만

    // 신호 흐름 순서(신경계): 신경다발→뉴런→시냅스→소뇌→대뇌→대뇌피질
    let run = ["nerve_bundles", "neurons", "synapses", "cerebellum", "cerebrum", "cortex"];
    if (onlyRegion) run = run.filter((r) => r === onlyRegion);

    // 보강 로테이션 커서(간뇌가 다음 사이클로 넘김) — 전 카탈로그를 며칠에 걸쳐 순회.
    // 카탈로그 크기로 wrap하여 무한 증가 방지(커서는 진행 마커).
    const total = (ctx.health && ctx.health.total) || 0;
    const aladinLimit = ctx.quota.aladinPerCycle;
    const enrichCursor = total ? (ctx.state.enrichCursor || 0) % total : (ctx.state.enrichCursor || 0);
    const nextCursor = total ? (enrichCursor + aladinLimit) % total : enrichCursor + aladinLimit;

    return {
      tiers, run, deep, onlyRegion, onlyStep,
      harvestPages: hourUTC === 18 ? 30 : 8,   // 주 스윕대엔 깊게
      aladinLimit, enrichCursor, nextCursor,
      keys: ctx.keys,
    };
  },
};
