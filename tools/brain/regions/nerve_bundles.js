/* 신경다발(神經多發·축삭다발) — 감각 입력 수확
   말초의 여러 감각 뉴런을 다발로 묶어 중추로 올려보내듯,
   KOBIC(국립중앙도서관 서지)에서 신간·전공·원서를 발굴해 카탈로그로 끌어올린다.
   deep tier(하루 1회)에서만 동작 — 매 사이클마다 크롤링하지 않는다. */
const { runSteps } = require("../lib");

// pipeline.js와 동일한 발굴 용어(전공/원서)
const MAJOR = "영어학개론|영어학|영문학개론|영문학사|영미문학|영미소설|영미시|언어학개론|일반언어학|응용언어학|영어음성학|영어음운론|영어통사론|영어의미론|영어화용론|사회언어학|심리언어학|영어교육론|영어교수법|제2언어습득|통번역|번역학|영어사|코퍼스언어학|담화분석|TESOL|English Linguistics|English Literature";
const FOREIGN = "Bricks Reading|Bricks Listening|Bricks Phonics|Subject Link|Smart Phonics|Sounds Great|Build and Grow|Reading Town|Reading Star|Insight Link|Reading Sketch|My First Reading|My Next Reading|Phonics Monster|Reading Champion|Reading Future|Oxford Reading Tree|Reading Explorer|Time Zones|Our World|Wonderful World|Spotlight on English";

module.exports = {
  id: "nerve_bundles", ko: "신경다발", role: "수확(KOBIC 신간·전공·원서)",
  steps: [
    { id: "harvest-main", ko: "학습교재 신간 발굴", tier: "deep", cmd: "node tools/harvest_kobic.js", env: (ctx) => ({ KOBIC_MAXPAGES: String(ctx.plan.harvestPages) }) },
    { id: "merge-main", ko: "학습교재 병합", tier: "deep", cmd: "node tools/harvest_kobic_merge.js" },
    { id: "harvest-major", ko: "전공교재 발굴", tier: "deep", cmd: "node tools/harvest_kobic.js", env: { KOBIC_NOPUBFILTER: "1", KOBIC_MAXPAGES: "5", KOBIC_TERMS: MAJOR } },
    { id: "merge-major", ko: "전공 병합", tier: "deep", cmd: "node tools/harvest_kobic_merge.js" },
    { id: "harvest-foreign", ko: "원서 발굴(ELT)", tier: "deep", cmd: "node tools/harvest_kobic.js", env: { KOBIC_NOPUBFILTER: "1", KOBIC_MAXPAGES: "6", KOBIC_TERMS: FOREIGN } },
    { id: "merge-foreign", ko: "원서 병합", tier: "deep", cmd: "node tools/harvest_kobic_merge.js" },
    // 확장/특수 카탈로그(수동): 원서 고전·ELT·특수 시드 확장
    { id: "import-classics", ko: "원서 고전 시드", tier: "manual", cmd: "node tools/import_classics.js" },
    { id: "add-elt", ko: "ELT 시리즈 시드", tier: "manual", cmd: "node tools/add_elt.js" },
    { id: "add-special", ko: "특수 카탈로그 시드", tier: "manual", cmd: "node tools/add_special.js" },
    { id: "expand-master", ko: "마스터 확장", tier: "manual", cmd: "node tools/expand_master.js" },
    { id: "explode-enrich", ko: "보강 폭파(분해)", tier: "manual", cmd: "node tools/explode_enrich.js" },
  ],
  async run(ctx) { return { steps: await runSteps(ctx, this, this.steps) }; },
};
