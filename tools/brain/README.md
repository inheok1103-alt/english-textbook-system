# 🧠 BRAIN — 교재 시스템 자율 신경계

이 프로그램을 **24시간 클라우드에서 스스로 갱신**하도록 만드는 오케스트레이터입니다.
모든 세부 작업을 **뇌 부위별 개별 하네스**로 나눠, 신경 신호 순서로 통합 실행합니다.
(정적 사이트라 "연속 의식"이 아니라, GitHub Actions가 **2시간마다 한 사이클을 사고**하는 형태)

## 신호 흐름

```
간뇌(감지·조절) → 중뇌(계획·라우팅)
  → 신경다발(수확) → 뉴런(실시간 API) → 시냅스(연결·GitHub)
  → 소뇌(정제·검수) → 대뇌(빌드·랭킹) → 대뇌피질(출력 검증)
  → 간뇌(상태 저장·뇌파 로그)
```

## 부위(개별 하네스) — `regions/*.js`

| 부위 | 파일 | 역할 |
|---|---|---|
| 간뇌 diencephalon | `regions/diencephalon.js` | 감지·조절·항상성 — 상태(`brain_state.json`)·건강지표·API 키·일일 쿼터 |
| 중뇌 midbrain | `regions/midbrain.js` | 계획·라우팅·반사 — 이번 사이클에 어떤 부위/tier를 돌릴지 결정 |
| 신경다발 nerve_bundles | `regions/nerve_bundles.js` | 수확 — KOBIC 신간·전공·원서 발굴 (deep) |
| 뉴런 neurons | `regions/neurons.js` | 실시간 API 신호원 — 알라딘·카카오·원서·표지 보강 |
| 시냅스 synapses | `regions/synapses.js` | 연결·매칭 — 색인·ISBN매칭·**GitHub 실시간 동기** |
| 소뇌 cerebellum | `regions/cerebellum.js` | 정제·검수·균형 — 비영어·정크·중복·표지·감사 |
| 대뇌 cerebrum | `regions/cerebrum.js` | 고차사고 — 앱 빌드·판매인기 랭킹 |
| 대뇌피질 cortex | `regions/cortex.js` | 의식 산출·출력 검증 — 렌더 무결성(`</style>`·JS구문·데이터) |

각 부위는 여러 **세부 하네스(step)** 로 구성됩니다. `lib.js`의 `runSteps`가 모든 step을
동일 규격(로깅·타이밍·에러격리·tier게이팅)으로 실행합니다. 총 38개 세부 하네스.

### tier (실행 주기)
- `routine` — 매 사이클(2h). 보강·연결·정제·빌드·랭킹·검증.
- `deep` — 하루 1회. 수확(KOBIC 크롤)·심층 정제·ISBN 매칭.
- `manual` — 자동 실행 안 함. 시드 확장·표지 재수집 등 위험/일회성 작업(디스패치 전용).

## 사용

```bash
node tools/brain/brain.js              # 한 사이클(routine, 조건 맞으면 deep 자동)
node tools/brain/brain.js --deep       # 깊은 사이클 강제(수확 포함)
node tools/brain/brain.js --routine-only
node tools/brain/brain.js --region=cerebellum      # 한 부위만
node tools/brain/brain.js --step=neurons.aladin    # 한 세부 하네스만
node tools/brain/brain.js --dry        # 계획만(미실행)
node tools/brain/brain.js --map        # 전체 신경계 지도 출력
```

## 자동화 (24시간)

`.github/workflows/brain.yml` 이 **2시간마다**(하루 12사이클) 한 사이클을 실행 →
변경분 커밋 → `pages.yml` 이 자동 배포. PC가 꺼져 있어도 클라우드에서 돌아갑니다.
알라딘 일 5,000 한도를 12사이클로 나눠 쿼터를 지킵니다(사이클당 ~416).

수동 실행: GitHub → Actions → **brain** → Run workflow (mode: auto/deep/routine-only/map, target: 부위/스텝).

## 모바일 사이트 동기 (PC→모바일)

brain은 main(PC repo)에서 돌지만, 사이클 끝에 **공유 데이터만**(`books.js`·`toc.js`·`rankings.json`)
모바일 repo로 자동 푸시합니다. 모바일 고유 레이아웃(`index.html`/mobile CSS/챗봇)은 건드리지 않습니다.
covers(대용량)는 경량 유지를 위해 제외 — 신간 표지는 별도 동기.

**인증(설정됨):** 모바일 repo 전용 **write deploy key**(`brain-mobile-sync`)의 개인키가
main repo 시크릿 **`MOBILE_SYNC_KEY`** 로 등록되어 있음. 이 키는 모바일 repo 한 곳에만 유효.
(시크릿이 없으면 이 스텝은 조용히 스킵되고 PC만 갱신. 키 회전: 모바일 repo Settings→Deploy keys에서
기존 키 삭제 후 새 키쌍을 같은 이름으로 재등록)

## 상태 파일 (뇌의 기억 — 커밋되어 사이클 간 유지)
- `brain_state.json` — 사이클 번호·보강 커서·마지막 deep/harvest 시점
- `brain_output.json` — 최근 건강 스냅샷(사이트/리포트가 읽는 산출)
- `brain_log.jsonl` — 사이클별 뇌파 로그(최근 800줄만 보존)
