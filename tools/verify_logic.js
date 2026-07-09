/* 🔬 로직 검증 하네스(사전) — 추천/챗봇의 순수 로직을 books.js에 대해 전수 시뮬.
   "고등에 초등교재" 회귀를 구조적으로 차단. app_base.html의 self-contained 학년함수
   (_GORD·gradeGap·gradeAllowed·audienceOk)를 추출·주입해 학년제약 불변식을 검증한다.
   브라우저·키 불필요 → CI/사전배포 게이트로 쓸 수 있음.
   사용: node tools/verify_logic.js   종료코드: 통과 0 / 실패 1 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "tools", "app_base.html"), "utf8");
const booksSrc = fs.readFileSync(path.join(ROOT, "books.js"), "utf8");

// books.js(window.__BOOKS__) 로드
const BOOKS = JSON.parse(booksSrc.match(/window\.__BOOKS__=(\[[\s\S]*?\]);\s*\nwindow\.__TABS__/)[1]);

// app_base.html에서 self-contained 학년함수 추출(중괄호 균형 + _GORD 상수)
function extractFn(name) {
  const sig = "function " + name + "(";
  const i = html.indexOf(sig); if (i < 0) throw new Error("함수 없음: " + name);
  let k = html.indexOf("{", i), d = 0;
  for (; k < html.length; k++) { const c = html[k]; if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { k++; break; } } }
  return html.slice(i, k);
}
const gordSrc = html.match(/const _GORD=\{[^}]*\};/)[0];
const src = [gordSrc, extractFn("gradeGap"), extractFn("gradeAllowed")].join("\n");

// 샌드박스에서 주입·평가(DOM 불필요 — 순수함수만)
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(src + "\nthis._gg=gradeGap; this._ga=gradeAllowed; this._GORD=_GORD;", sandbox);
const gradeGap = sandbox._gg, gradeAllowed = sandbox._ga, _GORD = sandbox._GORD;

// audienceOk(학생 트랙)은 app_base 시그니처가 문맥의존이라, 여기선 데이터필드로 동등 재현
const studentOk = (b) => !b.examPrep && !b.parentBook && !b.teacherRef && !b.adultGeneral;

// ── 검증 스위트 ─────────────────────────────────────────────────────────
let pass = 0, fail = 0; const fails = [];
function check(name, cond, detail) { if (cond) { pass++; } else { fail++; fails.push(name + (detail ? " — " + detail : "")); } }

const GRADES = ["유아/예비초", "초등", "중등", "고등", "성인"];

// 1) _GORD 매핑·별칭
check("_GORD 유아별칭", _GORD["유아"] === 0 && _GORD["유아/예비초"] === 0);
check("_GORD 서수", _GORD["초등"] === 1 && _GORD["중등"] === 2 && _GORD["고등"] === 3 && _GORD["성인"] === 4);

// 2) gradeGap 정확성(알려진 케이스)
check("gradeGap 고등책→고등=0", gradeGap({ gradeMin: 3, gradeMax: 3 }, "고등") === 0);
check("gradeGap 초등전용→고등≥2", gradeGap({ gradeMin: 1, gradeMax: 1 }, "고등") >= 2);
check("gradeGap 범위중첩=0", gradeGap({ gradeMin: 2, gradeMax: 4 }, "고등") === 0);
check("gradeGap 유아별칭 동작", gradeGap({ gradeMin: 3, gradeMax: 3 }, "유아") === gradeGap({ gradeMin: 3, gradeMax: 3 }, "유아/예비초"));

// 3) 데이터 무결성: gradeMin/Max 100%
const noRange = BOOKS.filter((b) => b.gradeMin == null || b.gradeMax == null).length;
check("gradeMin/Max 100%", noRange === 0, noRange + "종 결측");
check("gradeMin<=Max", BOOKS.filter((b) => b.gradeMin != null && b.gradeMin > b.gradeMax).length === 0);

// 4) 학년누수 불변식(핵심 회귀): 각 학년 학생추천풀에 gap≥2 배제 확인
GRADES.forEach((g) => {
  const pool = BOOKS.filter((b) => studentOk(b) && gradeAllowed(b, g));
  const leak = pool.filter((b) => gradeGap(b, g) >= 2).length;
  check(`[${g}] 추천풀 gap≥2 누수 0`, leak === 0, leak + "종 누수");
});
// 고등에 초등전용 / 초등에 고등전용 명시 확인
const hsPool = BOOKS.filter((b) => studentOk(b) && gradeAllowed(b, "고등"));
check("고등풀 초등이하전용 누수 0", hsPool.filter((b) => b.gradeMax <= 1).length === 0);
const elPool = BOOKS.filter((b) => studentOk(b) && gradeAllowed(b, "초등"));
check("초등풀 고등이상전용 누수 0", elPool.filter((b) => b.gradeMin >= 3).length === 0);

// 5) 각 학년 추천풀 비어있지 않음(추천 가능)
GRADES.forEach((g) => {
  const n = BOOKS.filter((b) => studentOk(b) && gradeAllowed(b, g)).length;
  check(`[${g}] 추천풀 비지 않음`, n >= 10, n + "종");
});

// 6) 시스템 일관성(pipeline↔brain 스크립트 드리프트) — 사전 게이트에 포함
let consistencyOk = true;
try { require("child_process").execSync("node tools/verify_consistency.js", { cwd: ROOT, stdio: "ignore" }); }
catch (e) { consistencyOk = false; }
check("pipeline↔brain 스크립트 일관성", consistencyOk, "드리프트 감지(verify_consistency 실패)");

// ── 결과 ────────────────────────────────────────────────────────────────
console.log(`🔬 로직 검증 — BOOKS ${BOOKS.length}종`);
if (fails.length) fails.forEach((f) => console.log("  ❌ " + f));
console.log(`결과: ${pass}/${pass + fail} 통과${fail ? " · 실패 " + fail : ""}`);
process.exit(fail ? 1 : 0);
