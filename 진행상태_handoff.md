# 영어교재 시스템 — 진행 핸드오프 (2026-06-23)

> ★북극성: **교재 잘 모르는 학부모도 편하게 커리 짜기.** 모든 UI/UX·추천·설명은 이 기준. 쉬워야 함 + PC/모바일.

> 로컬: `C:\Users\이인혁\Downloads\교재\` · 빌드 `cd tools && node build_app.js`
> repo: https://github.com/inheok1103-alt/english-textbook-system (공개)
> 라이브: https://inheok1103-alt.github.io/english-textbook-system/ (push 시 자동배포 / 매일 cron 자동갱신)
> 계정: gh CLI 인증됨(inheok1103-alt). gh 경로: `C:\Program Files\GitHub CLI\gh.exe`

## 완료
- 교재 **4,262종**(KOBIC 병합·절판·목차·표지) + master_index(랭킹매칭)
- 설계 **그리드**(X=시간 Y=영역, 셀추천·목표시작·균형채우기·예쁜출력·메타 학교/반/학생)
- **시간단위** year=12(가장 상세)·quarter=12·month=6 (TIME_UNITS) — 큰 단위가 더 상세하게 수정함
- **나이대 탭/필터**(유아~성인) · 케미 v2 · A/B/C 평가 · 랭킹 대시보드 · 3D(라벨/영역축)
- **내신 스케줄러**(헤더 "내신대비"): 중등7/고등10단계, 역산일정, 달력 출력/PDF, 학교/학생명
- GAS 백엔드(backend_unified.gs, 미배포) · GitHub Actions(deploy-pages + refresh-catalog cron)

## 세션2 추가완료(코드, 재빌드시 반영)
- 목표 재설계(내신제외·학년독립 10종)+학년선택기 / 상황·약점 탭 분리 / 성인 재분류(토익토플 등, build_app isAdultTitle) / 나이대 탭 / 시간단위(년차=12 최다)
- 내신 스케줄러: 단계 직접편집(nsSteps) + 간격복습·인출연습 자동배치(교육학 근거)
- 학부모 온보딩/도움말(showHelp, ? 버튼) / 크레딧 "이인혁 (Ray T)" 헤더+출력물
- **PDF출력·저장·내신출력 시 자동 누적**(accumulateUsage/accumulateNaesin)
- ★**불특정다수 대비 deviceId 중복제거**: 클라 deviceId()(localStorage) → 제출 포함. GAS popular_/popularPairs_/popularCurricula_/buildRatings_ 가 (deviceId,uid) 기준 1회만 카운트(교재당 기기당 1번). HEADERS/RATING_HEADERS에 deviceId 추가.
- 교육학 리서치 완료(SLA i+1·ZPD·DeKeyser / CEFR-Lexile concordance / 간격반복·인출연습·인지부하 — 종합 agent는 세션한도로 일부 실패, 핵심 raw는 task 출력파일에).

## ⏳ 남은 백로그 (병합 후) — PC 종료 안 함(취소됨)
0. **광역 병합 진행중**(background, 12,929후보 → 현재 5,062종, ~6천 신규 예상, 1~2시간). 완료까지 KOBIC 재수집/재빌드 보류(충돌·레이스).
0b. **성능**: 카탈로그 1만종 되면 index.html 과대 → build_app가 MASTER_DATA를 외부 `books.js`(window.__BOOKS__)로 분리(`<script src>`는 file://도 작동) 권장. app_base의 `const MASTER_DATA=__MASTER_DATA__`/`__TABS__`를 window 글로벌로 바꾸고 build_app가 books.js 출력.

## ⏳ 기존 백로그 (사용자 최근 요청 — 우선순위)
1. **표지 정확도(최우선, 3회 강조)**: 책↔이미지 불일치 多 → KOBIC ISBN 정품표지로 교체.
   - 스크립트 준비됨: `node tools/recollect_kobic_covers.js` (비KOBIC표지 책을 KOBIC 제목매칭→ISBN→상세표지로 교체, 게이트로 오매칭 방지). **실행 필요.**
2. **광역 KOBIC harvest 진행중**(background b7emfl1u4, 전 출판사 NOPUBFILTER, ~9,300+ 후보) → 완료시 `node tools/harvest_kobic_merge.js` 병합.
3. **"영어 관련 다 넣기"** + **전공 섹션**(영문학·영어학·언어학·영어교육·통번역·영어회화 전공) → KOBIC 전공 키워드 harvest + category="전공" 부여, 앱 track 표시.
4. **목표 재설계**: 내신은 빼고(내신스케줄러로 분리됨), 더 상세하게(수능은 고3아닌 초등도 가능 → 학년독립). GOALS 재구성 + **초/중/고/성인 학년 선택기**(목표×학년 → 추천). 현 GOALS=app_base의 const GOALS.
5. **상황 / 약점 분리**: 현재 "상황/약점" 단일탭(target=situations) → situation/weakness 2탭. build_app TABS + renderDB 필터, 책 situations/weaknesses 둘다 보유(555/724).
6. **성인 보강**: 토익/토플/텝스/공무원/오픽/비즈니스 → gradeBand 성인 재분류(현재 일부 고등 오분류). 성인 204종.
7. **내신 단계 편집 가능**: 단계 템플릿을 선택/직접입력 수정.
8. **UI/UX 정교화 + 친절한 설명/온보딩** + **PC/모바일 반응형** 재점검 + **콘텐츠 검수**(목표 일치).
9. 슬래시 묶음항목 79개 분리/정리.
10. 모든 데이터작업 후 **재빌드 + git push**(라이브 갱신).

## 파이프라인(tools/)
- build_app.js(★빌드, ageBandOf·TABS) / harvest_kobic.js(KOBIC_NOPUBFILTER=1·KOBIC_TERMS="a|b"·KOBIC_MAXPAGES) + harvest_kobic_merge.js(상세·절판·목차·정식제목 setItem)
- recollect_kobic_covers.js(표지 정합 재수집) / recollect_kyobo.js / cards_for_placeholders.js / export_master_index.js
- backend_unified.gs(GAS) / .github/workflows/{pages.yml, refresh-catalog.yml}

## 미배포 잔여(사용자 작업)
- GAS: 구글시트+Apps Script에 backend_unified.gs → setupAll() → 웹앱배포 → /exec URL을 app_base의 window.GUIDE_ENDPOINT에 넣고 재빌드·푸시. master_index.csv를 master_index 시트에 붙여넣기. (선택) 정보나루 DATA4LIB_KEY.
