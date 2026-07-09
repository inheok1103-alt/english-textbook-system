/* 🚀 배포 하네스 — 그동안 수동으로 하던 배포 전 과정을 한 코드경로로 형식화.
   포함: ①origin 커밋·푸시(자격증명 gh헬퍼로 /dev/tty 행 회피 + rebase내성 4회 + rankings 충돌 자동해결)
         ②모바일 동기(lab 리베이스 → 공유로직 함수 이식 → 데이터 복사 → 빌드 → 커밋·푸시)
         ③배포후 라이브 검증(verify_live)
   사용:
     node tools/deploy.js --push -m "메시지"      # origin main 커밋·푸시(내성)
     node tools/deploy.js --sync-mobile [--dry]   # 모바일 코드·데이터 동기
     node tools/deploy.js --verify [pc|mobile|both]
     node tools/deploy.js --all -m "메시지"        # push → sync-mobile → verify
   --dry: 실제 커밋/푸시 없이 계획만.
   ⚠️ 클라우드(brain.yml)는 GITHUB_TOKEN 컨텍스트라 이 스크립트의 gh헬퍼 대신 자체 인증 사용 —
      현재는 로컬 PC 배포 형식화용. brain.yml 편입은 별도 단계(Pages 배포잡은 YAML 유지). */
const cp = require("child_process"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DRY = has("--dry");
const APP = "tools/app_base.html";
// gh CLI 인증 재사용 → Windows 'manager' 헬퍼의 /dev/tty 프롬프트 행 회피
const GH_CRED = `-c credential.helper=!gh auth git-credential`;

function git(cmd, opts = {}) { return cp.execSync("git " + cmd, { cwd: ROOT, encoding: "utf8", stdio: opts.quiet ? ["ignore", "pipe", "ignore"] : "pipe", ...opts }).trim(); }
function tryGit(cmd, opts = {}) { try { return { ok: true, out: git(cmd, opts) }; } catch (e) { return { ok: false, out: (e.stdout || "") + (e.stderr || "") + e.message }; } }
function log(m) { console.log(m); }
function branch() { return git("rev-parse --abbrev-ref HEAD"); }

// 중괄호 균형 함수 추출(모바일 이식용)
function extractFn(src, name) {
  const sig = "function " + name + "("; const i = src.indexOf(sig); if (i < 0) return null;
  let k = src.indexOf("{", i), d = 0;
  for (; k < src.length; k++) { const c = src[k]; if (c === "{") d++; else if (c === "}") { d--; if (d === 0) { k++; break; } } }
  return { text: src.slice(i, k), start: i, end: k };
}
// 모바일에 이식할 공유 순수로직(레이아웃 아님 — main↔mobile 동일해야) 화이트리스트
const SHARED_FNS = ["gradeGap", "gradeAllowed", "audienceOk", "ctxScore", "starterRec", "startByGoal",
  "recommendForCell", "chatRetrieve", "parseChat", "weeklyRows", "barRows", "rankBadge", "recCard"];
const SHARED_CONSTS = [/const _GORD=\{[^}]*\};/, /window\.__rankState = \{[^}]*\};/];

// ── ① origin 커밋·푸시(내성) ─────────────────────────────────────────────
function commitPush() {
  const msg = val("-m", val("--message", "chore: 배포 갱신"));
  log(`🚀 [push] origin main — "${msg.slice(0, 50)}"`);
  git("add -A");
  const staged = tryGit("diff --cached --quiet");
  if (staged.ok) { log("  변경 없음 — 커밋 스킵"); }
  else { if (DRY) { log("  (dry) 커밋할 변경 있음"); return true; } git(`commit -q -m ${JSON.stringify(msg)}`); log("  커밋됨"); }
  if (DRY) { log("  (dry) 푸시 생략"); return true; }
  // rebase 내성 4회 — rankings.json 충돌은 로컬본(--theirs=내커밋) 채택
  for (let i = 1; i <= 4; i++) {
    git("fetch origin", { quiet: true });
    const rb = tryGit("rebase origin/main");
    if (!rb.ok) {
      if (fs.existsSync(path.join(ROOT, ".git/rebase-merge"))) {
        tryGit("checkout --theirs rankings.json"); tryGit("add -A");
        const cont = tryGit("-c core.editor=true rebase --continue");
        if (!cont.ok) { tryGit("rebase --abort"); log(`  ⚠️ rebase 충돌(rankings 외) — 중단, 수동 필요`); return false; }
      }
    }
    const push = tryGit(`${GH_CRED} push origin HEAD:main`);
    git("fetch origin", { quiet: true });
    if (git("rev-parse HEAD") === git("rev-parse origin/main")) { log(`  ✅ 푸시 성공(시도 ${i})`); return true; }
    log(`  ↻ 경쟁 감지 — 재시도 ${i}/4`);
  }
  log("  ❌ 4회 재시도 실패"); return false;
}

// ── ② 모바일 동기 ────────────────────────────────────────────────────────
function syncMobile() {
  log(`📱 [sync-mobile]${DRY ? " (dry)" : ""}`);
  const cur = branch();
  if (cur !== "main") { log(`  현재 ${cur} — main에서 실행 필요`); return false; }
  // 이식할 내용 미리보기(main 기준)
  const main = fs.readFileSync(path.join(ROOT, APP), "utf8");
  git("fetch lab", { quiet: true });
  if (DRY) {
    tryGit("stash -u", { quiet: true });
    const rb = tryGit("checkout mobile"); if (!rb.ok) { log("  mobile 체크아웃 실패"); return false; }
    const mob = fs.readFileSync(path.join(ROOT, APP), "utf8");
    let diffFns = SHARED_FNS.filter((n) => { const a = extractFn(main, n), b = extractFn(mob, n); return a && b && a.text !== b.text; });
    let missFns = SHARED_FNS.filter((n) => extractFn(main, n) && !extractFn(mob, n));
    git("checkout main", { quiet: true }); tryGit("stash pop", { quiet: true });
    log(`  (dry) 이식 대상 함수(변경): ${diffFns.join(", ") || "없음"}`);
    log(`  (dry) 모바일 신규삽입 필요: ${missFns.join(", ") || "없음"}`);
    log(`  (dry) 데이터 복사: books.js·toc.js·rankings.json / 빌드 / lab push`);
    return true;
  }
  // 실동기
  tryGit("stash -u", { quiet: true });
  if (!tryGit("checkout mobile").ok) { log("  mobile 체크아웃 실패"); return false; }
  const rb = tryGit("rebase lab/main");
  if (!rb.ok && fs.existsSync(path.join(ROOT, ".git/rebase-merge"))) { tryGit("checkout --theirs rankings.json"); tryGit("add -A"); tryGit("-c core.editor=true rebase --continue"); }
  // 함수 이식
  let mob = fs.readFileSync(path.join(ROOT, APP), "utf8"); const rep = [];
  SHARED_FNS.forEach((n) => {
    const em = extractFn(main, n), eo = extractFn(mob, n);
    if (em && eo && em.text !== eo.text) { mob = mob.slice(0, eo.start) + em.text + mob.slice(eo.end); rep.push(n + "✎"); }
    else if (em && !eo) { const ri = mob.indexOf("function renderSummary("); if (ri > 0) { mob = mob.slice(0, ri) + em.text + "\n        " + mob.slice(ri); rep.push(n + "+"); } }
  });
  SHARED_CONSTS.forEach((re) => { const m = main.match(re); if (m) mob = mob.replace(re, m[0]); });
  fs.writeFileSync(path.join(ROOT, APP), mob);
  // 데이터 복사 + 빌드
  ["rankings.json", "books.js", "toc.js"].forEach((f) => { try { git(`checkout main -- ${f}`); } catch (e) {} });
  tryGit("checkout main -- tools/harvest_rankings.js tools/classify_books.js tools/build_app.js");
  cp.execSync("node tools/build_app.js", { cwd: ROOT, stdio: "ignore" });
  git("add -A");
  if (tryGit("diff --cached --quiet").ok) { log("  변경 없음"); git("checkout main", { quiet: true }); return true; }
  git(`commit -q -m ${JSON.stringify("📱 모바일 동기: " + (rep.join(" ") || "데이터"))}`);
  let pushed = false;
  for (let i = 1; i <= 3; i++) { const p = tryGit(`${GH_CRED} push lab mobile:main`); git("fetch lab", { quiet: true }); if (git("rev-parse HEAD") === git("rev-parse lab/main")) { pushed = true; break; } tryGit("rebase lab/main"); if (fs.existsSync(path.join(ROOT, ".git/rebase-merge"))) { tryGit("checkout --theirs rankings.json"); tryGit("add -A"); tryGit("-c core.editor=true rebase --continue"); } }
  log(`  이식: ${rep.join(" ") || "데이터만"} · 푸시 ${pushed ? "✅" : "❌"}`);
  git("checkout main", { quiet: true });
  return pushed;
}

// ── ③ 라이브 검증 ────────────────────────────────────────────────────────
function verify() {
  const t = args.find((a) => ["pc", "mobile", "both"].includes(a)) || "both";
  log(`🔬 [verify] ${t}`);
  if (DRY) { log("  (dry) verify_live 생략"); return true; }
  const r = tryGit(""); // noop
  try { cp.execSync(`node tools/verify_live.js ${t}`, { cwd: ROOT, stdio: "inherit" }); return true; }
  catch (e) { return false; }
}

// ── 라우팅 ───────────────────────────────────────────────────────────────
(function main() {
  if (!args.length) { log("사용: --push | --sync-mobile | --verify | --all  [-m msg] [--dry]"); process.exit(0); }
  let ok = true;
  if (has("--all")) { ok = commitPush() && ok; ok = syncMobile() && ok; verify(); }
  else { if (has("--push")) ok = commitPush() && ok; if (has("--sync-mobile")) ok = syncMobile() && ok; if (has("--verify")) verify(); }
  process.exit(ok ? 0 : 1);
})();
