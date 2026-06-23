/* ============================================================================
 * pedagogy_rules.js — 교육학 5영역(학습과학·발달·수업설계·평가/피드백·동기/습관)
 *   메타분석 근거를 우리 시스템(skill 9종 · level 1~5 · gradeBand/ageBand)에
 *   맞춰 "바로 호출 가능한" 규칙으로 코드화.
 *
 * 스키마 enum (data/materials_app.json 실측):
 *   SKILLS    = 파닉스 어휘 문법 구문 독해 듣기 말하기 쓰기 모의/기출 (+통합)
 *   LEVEL     = 1..5
 *   GRADEBAND = 유아/예비초 · 초등 · 중등 · 고등 · 성인 · 전체
 *   AGEBAND   = 유아(5-7) · 초등저(8-10) · 초등고(11-13) · 중등(13-16) · 고등(16-19) · 전체
 *
 * 모든 수치 옆 주석의 근거: Cepeda2006/2008(간격), Adesope2017·Rowland2014(인출),
 *   Brunmair&Richter2019(인터리빙), Kulik1990·Bloom1984(숙달), Cepeda간격,
 *   Hattie&Timperley2007(피드백), Black&Wiliam1998(형성), ZPD 35/70 경험칙,
 *   Lally2010(66일)·Fogg(작은습관)·Gollwitzer(if-then)·Bandura&Schunk1981(근접목표).
 * ==========================================================================*/

'use strict';

/* ───────────────────────── 0. 공통 상수 ───────────────────────── */

const SKILLS = ['파닉스', '어휘', '문법', '구문', '독해', '듣기', '말하기', '쓰기', '모의/기출', '통합'];

// 자동화(과잉학습) 대상 = 기초·반복 스킬만. 고난도 독해/모의는 제외(간격+인출만).
const AUTOMATION_SKILLS = new Set(['파닉스', '어휘', '문법']);     // 구구단형 드릴 허용
// 인터리빙(섞어풀기) 효과 큰 스킬 = "헷갈리는 유형" 변별이 핵심인 영역.
const INTERLEAVE_SKILLS = new Set(['문법', '구문', '독해', '모의/기출']);

const GRADEBANDS = ['유아/예비초', '초등', '중등', '고등', '성인', '전체'];
const AGEBANDS   = ['유아(5-7)', '초등저(8-10)', '초등고(11-13)', '중등(13-16)', '고등(16-19)', '전체'];


/* ============================================================================
 * 1) 간격반복 · 인출연습 — 커리/내신 스케줄러 (복습 주기 · 테스트 배치)
 * ==========================================================================*/

// 1-A. 기본 확장간격(일) — Cepeda2006 분산>집중, 점점 벌리는 확장형이 장기보유 유리.
//      신규학습 D0 기준, D+1 → D+3 → D+7 → D+16.
const BASE_SPACING_DAYS = [1, 3, 7, 16];

// 1-B. 목표일(시험까지 잔여일) 비례 규칙 — Cepeda2008: 최적 첫 간격 ≈ 보유기간의 10~20%.
//      시험 임박일수록 간격을 압축, 멀수록 확장.
function spacingSchedule(daysUntilTest) {
  // daysUntilTest: 오늘~시험일 일수. null/0이면 일반 학습(BASE 사용).
  if (!daysUntilTest || daysUntilTest <= 0) return BASE_SPACING_DAYS.slice();

  // 첫 복습 간격 = 잔여일의 약 15%(10~20% 중앙), 최소 1일.
  const first = Math.max(1, Math.round(daysUntilTest * 0.15));
  // 확장비 ~2.2배(1→3→7→16 의 평균 비율). 시험일을 넘기지 않게 컷.
  const out = [];
  let g = first;
  while (g < daysUntilTest) { out.push(g); g = Math.round(g * 2.2); }
  // 시험 직전(D-1~D-0)에는 항상 누적 인출 1회를 둔다.
  if (out[out.length - 1] !== daysUntilTest - 1 && daysUntilTest - 1 > 0) {
    out.push(daysUntilTest - 1);
  }
  return out.length ? out : [Math.max(1, daysUntilTest - 1)];
}

// 1-C. 신규 셀 → 복습 셀 자동 생성. 복습은 "읽기" 금지, 항상 인출(미니퀴즈).
//      Adesope2017 g=0.61(중·고생 최대) → 복습 셀 type은 'retrieval'.
function buildReviewCells(newCell, opts = {}) {
  // newCell: { id, skill, level, dayIndex(=D0의 절대 일차) }
  const offsets = spacingSchedule(opts.daysUntilTest);
  return offsets.map((off, i) => ({
    refId: newCell.id,
    skill: newCell.skill,
    level: newCell.level,
    type: 'retrieval',                 // 인출 미니퀴즈(=복습 디폴트)
    dayIndex: newCell.dayIndex + off,
    spacingStep: i + 1,
    quizItems: quizItemCount(newCell.level), // 1-D
    note: `${newCell.skill} D+${off} 인출복습`,
  }));
}

// 1-D. 미니퀴즈 문항 수(셀당). 단원 종료 게이트는 8~12문항(Kulik 숙달 체크 관행).
function quizItemCount(level) {
  // 하위 level은 적은 문항·즉시 피드백, 상위는 더 많은 변별 문항.
  return level <= 2 ? 8 : level === 3 ? 10 : 12;
}

// 1-E. 인터리빙 전환 — Brunmair&Richter2019 g=0.42(시각 0.67). 단 스키마 형성 전(초반)엔
//      블록연습, 익숙해진 뒤(같은 스킬 신규셀 3개 이상 누적) 인터리빙으로 전환.
function shouldInterleave(skill, priorNewCellsOfSkill) {
  return INTERLEAVE_SKILLS.has(skill) && priorNewCellsOfSkill >= 3;
}

// 1-F. 내신 스케줄러 진입점 — 시험일 입력 → 학습+복습 셀 타임라인 역산.
//      "벼락치기 1회"를 같은 분량 3~4회 분산으로 변환.
function planTestSchedule({ testDate, today, newCells }) {
  const daysUntilTest = dateDiffDays(today, testDate);
  const timeline = [];
  for (const c of newCells) {
    timeline.push({ ...c, type: 'new' });
    for (const r of buildReviewCells(c, { daysUntilTest })) timeline.push(r);
  }
  // 시험 직전 주: 누적 인출(미니 모의시험) 셀을 별도 보강.
  const examWeekStart = daysUntilTest - 7;
  timeline.push({
    type: 'cumulative_retrieval',
    dayIndex: Math.max(examWeekStart, 0),
    note: '시험 직전 주: 범위 전체 누적 인출(미니 모의시험)',
  });
  timeline.sort((a, b) => a.dayIndex - b.dayIndex);
  return { daysUntilTest, spacing: spacingSchedule(daysUntilTest), timeline };
}

function dateDiffDays(a, b) {
  const ms = new Date(b).setHours(0,0,0,0) - new Date(a).setHours(0,0,0,0);
  return Math.round(ms / 86400000);
}


/* ============================================================================
 * 2) 연령별 권장 학습량 / 세션길이 / 난이도 진행 (유아~성인)
 *    근거: 주의집중 '나이×2~5분' 경험칙, 작업기억 4~5청크, 추상문법은 만11세+(형식적조작),
 *          신규:복습 비율(초등 1:2 / 중등+ 1:1).
 * ==========================================================================*/

// ageBand → 세션설정. minutes=한 칸 권장시간 상한, newItems=한 세션 신규항목 상한.
const AGE_PROFILE = {
  '유아(5-7)':    { minutes: 12, newItems: 3, newReviewRatio: [1, 2], maxLevel: 1, abstractGrammarOK: false },
  '초등저(8-10)': { minutes: 20, newItems: 4, newReviewRatio: [1, 2], maxLevel: 2, abstractGrammarOK: false },
  '초등고(11-13)':{ minutes: 30, newItems: 5, newReviewRatio: [1, 2], maxLevel: 3, abstractGrammarOK: true  }, // 만11세+ 형식적조작
  '중등(13-16)':  { minutes: 40, newItems: 6, newReviewRatio: [1, 1], maxLevel: 4, abstractGrammarOK: true  },
  '고등(16-19)':  { minutes: 50, newItems: 7, newReviewRatio: [1, 1], maxLevel: 5, abstractGrammarOK: true  },
  '전체':         { minutes: 40, newItems: 6, newReviewRatio: [1, 1], maxLevel: 5, abstractGrammarOK: true  },
};

// gradeBand만 있을 때 ageBand로 매핑(데이터 호환).
const GRADE_TO_AGE = {
  '유아/예비초': '유아(5-7)',
  '초등': '초등고(11-13)',   // 초등 통칭 시 보수적으로 초등고 프로필
  '중등': '중등(13-16)',
  '고등': '고등(16-19)',
  '성인': '전체',
  '전체': '전체',
};

function ageProfile({ ageBand, gradeBand }) {
  const key = (ageBand && AGE_PROFILE[ageBand]) ? ageBand
            : (GRADE_TO_AGE[gradeBand] || '전체');
  return { ageBand: key, ...AGE_PROFILE[key] };
}

// 2-A. 한 칸(셀) 권장 분량 산정 + 작업기억/주의집중 상한 적용 → 초과 시 자동 분할 지시.
function sessionPlan({ ageBand, gradeBand, requestedNewItems, requestedMinutes }) {
  const p = ageProfile({ ageBand, gradeBand });
  const splitByItems   = Math.ceil((requestedNewItems  || p.newItems) / p.newItems);
  const splitByMinutes = Math.ceil((requestedMinutes   || p.minutes)  / p.minutes);
  const splits = Math.max(1, splitByItems, splitByMinutes);
  return {
    sessionMinutes: p.minutes,
    newItemsPerSession: p.newItems,
    newReviewRatio: p.newReviewRatio,        // [신규, 복습]
    splits,                                  // 긴 교재는 이 횟수로 쪼개 배치
    autoSplit: splits > 1,
    warnIfAbstractGrammar: !p.abstractGrammarOK, // 추상문법 조기투입 경고 트리거
  };
}

// 2-B. 추상 문법(가정법/도치/관계사 등) 조기 투입 가드.
function abstractGrammarAllowed({ ageBand, gradeBand }) {
  return ageProfile({ ageBand, gradeBand }).abstractGrammarOK;
}

// 2-C. 연령 적정 난이도 상한(권장 최고 level). 추천엔진 1차 필터.
function recommendedLevelCap({ ageBand, gradeBand }) {
  return ageProfile({ ageBand, gradeBand }).maxLevel;
}


/* ============================================================================
 * 3) 숙달학습 기준 — 정답률 게이트 + 추천엔진 targetDelta 연결
 *    근거: Kulik1990 d≈0.5(하위권 0.61), 숙달기준 80~90%; ZPD 35/70 경험칙;
 *          desirable difficulty 정답률 70~85% 황금밴드.
 * ==========================================================================*/

// 3-A. 숙달 게이트: 단원/셀 미니체크 정답률로 진급 여부 판정.
const MASTERY = {
  passThreshold: 0.80,      // 80% 이상 → 진급(Kulik 관행)
  remedialBelow: 0.80,      // 미만 → 교정 셀 자동 삽입(쉬운/다른 설명 + 재시험)
  // ZPD 배치 밴드(진단 정답률):
  zpdAbove: 0.35,           // <35% = 너무 어려움 → level 한 단계 ↓
  zpdSweetLow: 0.36,        // 36~69% = 최적 도전(유지)
  zpdSweetHigh: 0.69,
  // >0.70 = 너무 쉬움 → level 한 단계 ↑
  // 적정 도전 밴드(동적 난이도 유지 목표):
  difficultyBandLow: 0.70,
  difficultyBandHigh: 0.85,
};

// 3-B. 셀 진급 판정 → 다음 액션.
function masteryDecision(correctRate) {
  if (correctRate >= MASTERY.passThreshold) return { pass: true, action: 'advance' };
  return { pass: false, action: 'insert_remedial' };  // 교정 셀(쉬운 교재 + 재시험)
}

// 3-C. 진단 정답률 → 배치 레벨 보정량(targetDelta). 추천엔진이 진단레벨에 더해 사용.
//      반환: { delta, reason } — delta는 level 가감(−1/0/+1).
function placementDelta(diagnosticRate) {
  if (diagnosticRate < MASTERY.zpdAbove) return { delta: -1, reason: 'ZPD 위(너무 어려움) → 한 단계 낮춤' };
  if (diagnosticRate > MASTERY.zpdSweetHigh) return { delta: +1, reason: '이미 숙달(>70%) → 한 단계 올림' };
  return { delta: 0, reason: '최적 도전 구간(36~69%) → 유지' };
}

// 3-D. 추천엔진용 targetLevel = clamp(진단level + placementDelta + 연령cap).
//      하위권엔 워크드예제·해설 충실 교재(scaffoldHigh) 우선, 상위권엔 인터리빙·난도↑.
function targetLevel({ diagnosticLevel, diagnosticRate, ageBand, gradeBand }) {
  const { delta, reason } = placementDelta(diagnosticRate);
  const cap = recommendedLevelCap({ ageBand, gradeBand });
  const raw = (diagnosticLevel || 3) + delta;
  const level = Math.min(cap, Math.max(1, raw));
  return {
    targetLevel: level,
    targetDelta: delta,
    cappedByAge: raw > cap,
    scaffold: diagnosticRate < 0.5 ? 'high' : diagnosticRate > 0.8 ? 'low' : 'mid', // 워크드예제 페이딩
    preferInterleave: diagnosticRate > 0.8,  // 상위권 = 인터리빙 강한 교재 우선
    reason,
  };
}

// 3-E. 동적 난이도 유지: 연속 성적으로 level 조정(무기력/지루함 가드).
//      연속 저득점(<50% 2회) → 강등+복습, 연속 고득점(>85% 2회) → 승급 제안.
function adaptiveLevelStep(recentRates /* number[] 최신 우선 */, curLevel, cap = 5) {
  const last2 = recentRates.slice(0, 2);
  if (last2.length === 2 && last2.every(r => r < 0.50))
    return { level: Math.max(1, curLevel - 1), action: 'demote_and_review' };
  if (last2.length === 2 && last2.every(r => r > MASTERY.difficultyBandHigh))
    return { level: Math.min(cap, curLevel + 1), action: 'promote_suggest' };
  return { level: curLevel, action: 'hold' };
}

// 3-F. 자동화(과잉학습) 적용 여부 — 기초 스킬 + 1회 만점 도달 시 +50~100% 추가드릴.
//      반드시 간격복습과 결합(단독 과잉학습은 감쇠).
function overlearningPlan(skill, firstPassPerfect) {
  if (!AUTOMATION_SKILLS.has(skill) || !firstPassPerfect) return { apply: false };
  return { apply: true, extraDrillRatio: 0.75, mustCombineSpacing: true }; // +75% 드릴 후 간격복습
}


/* ============================================================================
 * 4) 학부모 동기 / 습관 설계 (꾸준함 유도 문구 · 체크리스트 · 작은 목표)
 *    근거: Bandura&Schunk1981(근접목표), Fogg(작은습관), Gollwitzer(if-then),
 *          Lally2010(66일/연속압박 금지·주간완료율), SDT(자율성=큐레이션 선택지).
 * ==========================================================================*/

// 4-A. 작은습관 시작 분량(스킬별 "터무니없이 작게"). 2주 뒤 자동 증량 제안.
const TINY_START = {
  '파닉스': '소리 5개 따라 읽기',
  '어휘':   '새 단어 10개',
  '문법':   '예문 2개 소리내 읽기',
  '구문':   '문장 1개 끊어 읽기',
  '독해':   '본문 2분 낭독',
  '듣기':   '한 트랙 1회 듣기',
  '말하기': '문장 3개 따라 말하기',
  '쓰기':   '한 문장 영작',
  '모의/기출': '1지문만 풀기',
  '통합':   '오늘 1칸만',
};

// 4-B. if-then 트리거 템플릿(시각 대신 기존일과에 '얹기'=habit stacking).
function ifThenTrigger(skill, anchor = '저녁 먹고 책상에 앉으면') {
  return `${anchor} → 영어 ${skill} 1칸(${TINY_START[skill] || '오늘 1칸'})`;
}

// 4-C. 근접목표 카드 — 큰 목표는 상단 고정, 매일 보이는 건 '오늘의 1칸'.
function proximalGoalCard({ skill, level, weekCellsDone, weekCellsTotal }) {
  return {
    today: `오늘은 ${skill}(Lv.${level}) 1칸만`,
    weekProgress: `이번 주 ${weekCellsDone}/${weekCellsTotal}칸`, // 연속streak 대신 주간완료율
    kpi: 'weekly_completion',
    encourage: `하루 빠져도 괜찮아요. 습관은 평균 두 달(66일) 만에 자리잡아요.`,
  };
}

// 4-D. 꾸준함 유도 문구 라이브러리 — 결과·인성("머리 좋다") 금지, 과정·전략·꾸준함 칭찬.
const HABIT_COPY = {
  streakSafe:   '연속 며칠이 아니라, 이번 주 몇 칸 했는지가 중요해요.',
  tinyStart:    '작게 시작하세요. 2분·단어 10개면 충분합니다.',
  ifThen:       '시간보다 "~한 다음에"가 강력해요. 기존 습관에 얹으세요.',
  processPraise:'"꾸준히 했네"가 "머리 좋네"보다 아이를 더 단단하게 만들어요.',
  autonomy:     '교재를 몰라도 됩니다. 추천 2~3개 중 하나만 골라 주세요.',
  noControl:    '다그치면 동기가 깎입니다. 감시·채점보다 "오늘 1칸 같이 칭찬"이 좋아요.',
};

// 4-E. 주간 학부모 체크리스트(원클릭 자동완성 보조).
const PARENT_CHECKLIST = [
  '시험 날짜 입력했나요? (복습 자동 분산)',
  '진단 한 번 보셨나요? (영역별 자동 배치)',
  '빨강(너무 어려움) 칸은 한 단계 쉬운 교재로 바꿨나요?',
  '이번 주 4/5칸 이상 했나요? (연속일수 말고 주간 완료율)',
  '오늘 1칸 같이 확인하고 "꾸준히 했네" 칭찬했나요?',
];

// 4-F. 번아웃 가드 — 주간 세션 상한 + 가벼운 셀(듣기/낭독) 정기 배치 + 정서 1문항.
function burnoutGuard({ weeklySessions, moodSignal /* '😀'|'😐'|'😫' */ }) {
  const overload = weeklySessions > 12 || moodSignal === '😫'; // 상한 경험값
  return {
    overload,
    action: overload ? 'insert_light_cell_and_lower_load' : 'ok',
    lightSkills: ['듣기', '말하기'],   // 부담 낮은 영역
    moodCheck: '이번 주 어땠어? 😀/😐/😫',
  };
}


/* ============================================================================
 * 5) 진단 · 피드백 규칙 (잘못된 커리 경고 · 친절한 톤 문구)
 *    근거: Hattie&Timperley2007(Feed-Up/Back/Forward 3문장, 인성칭찬 금지),
 *          Black&Wiliam1998(형성=점수미반영, 하위권 격차축소), 오답=인출 재출제.
 * ==========================================================================*/

// 5-A. 피드백 3문장 강제 템플릿 — 항상 목표→현재→다음. 인성칭찬 차단.
function buildFeedback({ goal, currentSummary, nextAction, scaffold = 'mid' }) {
  // scaffold: 'high'(초급)=Task정오+정답, 'mid'/'low'(중상급)=Process/자기점검 질문.
  const banned = /(똑똑|머리\s*좋|천재|영재)/; // 인성칭찬 필터
  const safe = (s) => banned.test(s) ? s.replace(banned, '꾸준히 했') : s;
  return {
    feedUp:      `[목표] ${safe(goal)}`,
    feedBack:    `[현재] ${safe(currentSummary)}`,
    feedForward: `[다음] ${safe(nextAction)}`,
    level: scaffold === 'high' ? 'task' : 'process', // 초급=Task, 중상급=Process
  };
}

// 5-B. 오답 처리 — "다시 읽기" 금지, 1·3·7일 재출제(인출). 정답만 주지 말고 '왜 틀렸나'+교정1문항.
function wrongAnswerQueue(item, dayIndex) {
  return [1, 3, 7].map((off) => ({
    refId: item.id, skill: item.skill, level: item.level,
    type: 'retrieval_redo', dayIndex: dayIndex + off,
    feedback: '왜 틀렸는지 1줄 + 교정 1문항', lowStakes: true, // 점수 미반영(실패=학습 프레이밍)
  }));
}

// 5-C. 형성 vs 총괄 배치 — 형성(저부담 퀴즈)은 학습 직후 자동·점수미반영,
//      총괄(채점)은 단원 종료/내신 4~2주 전 구간에만.
function assessmentType({ phase /* 'after_learning' | 'unit_end' | 'pre_exam' */ }) {
  if (phase === 'after_learning') return { kind: 'formative', scored: false };
  return { kind: 'summative', scored: true };
}

// 5-D. 잘못된 커리 경고 규칙 — 진단/연령/숙달과 어긋나는 셀 자동 점검. 친절한 톤 메시지 반환.
function validateCurriculum(cell, ctx) {
  // cell: {skill, level}, ctx: {ageBand, gradeBand, diagnosticLevel, diagnosticRate}
  const warns = [];
  const cap = recommendedLevelCap(ctx);
  if (cell.level > cap)
    warns.push(`이 교재(Lv.${cell.level})는 ${ctx.ageBand || ctx.gradeBand} 또래엔 조금 일러요. 한 단계 쉬운 책으로 시작하면 더 잘 붙어요.`);

  if (cell.skill === '문법' && cell.level >= 4 && !abstractGrammarAllowed(ctx))
    warns.push(`가정법·도치 같은 추상 문법은 보통 만 11세 이후가 효과적이에요. 지금은 쉬운 문형부터 권해요.`);

  if (ctx.diagnosticRate != null) {
    const d = placementDelta(ctx.diagnosticRate);
    if (d.delta === -1 && cell.level >= (ctx.diagnosticLevel || 3))
      warns.push(`최근 정답률이 낮아요(${Math.round(ctx.diagnosticRate*100)}%). 이 칸은 한 단계 쉬운 교재로 바꾸면 "너무 어려움" 좌절을 막을 수 있어요.`);
    if (d.delta === +1 && cell.level <= (ctx.diagnosticLevel || 3))
      warns.push(`이미 잘하고 있어요(${Math.round(ctx.diagnosticRate*100)}%). 한 단계 위 교재로 올리면 지루함 없이 더 자라요.`);
  }

  // 벼락치기 감지(같은 신규 분량이 시험 직전 1~2일에 몰림)
  if (ctx.daysUntilTest != null && ctx.daysUntilTest <= 2 && cell.type === 'new')
    warns.push(`시험이 코앞이라 새로 배우기보단, 배운 걸 "문제로 다시 풀어보는" 복습이 더 효과적이에요.`);

  return { ok: warns.length === 0, warnings: warns, tone: 'friendly' };
}

// 5-E. 완료 판정 — '학습 직후 정답' 아님. '지연 재퀴즈 통과'를 마스터리로 기록(Bjork).
function isMastered({ delayedRetrievalRate }) {
  return delayedRetrievalRate != null && delayedRetrievalRate >= MASTERY.passThreshold;
}


/* ───────────────────────── exports ───────────────────────── */
module.exports = {
  // 상수
  SKILLS, AUTOMATION_SKILLS, INTERLEAVE_SKILLS, GRADEBANDS, AGEBANDS,
  BASE_SPACING_DAYS, MASTERY, AGE_PROFILE, GRADE_TO_AGE, TINY_START, HABIT_COPY, PARENT_CHECKLIST,
  // 1) 간격·인출
  spacingSchedule, buildReviewCells, quizItemCount, shouldInterleave, planTestSchedule,
  // 2) 연령
  ageProfile, sessionPlan, abstractGrammarAllowed, recommendedLevelCap,
  // 3) 숙달·추천 targetDelta
  masteryDecision, placementDelta, targetLevel, adaptiveLevelStep, overlearningPlan,
  // 4) 동기·습관
  ifThenTrigger, proximalGoalCard, burnoutGuard,
  // 5) 진단·피드백
  buildFeedback, wrongAnswerQueue, assessmentType, validateCurriculum, isMastered,
};
