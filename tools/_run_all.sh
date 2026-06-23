#!/usr/bin/env bash
# 단일 순차 파이프라인 — 재수집(재개가능) → 전공 harvest → merge → export → build → audit
# 각 단계 resumable. 푸시는 사람이 검증 후 수동.
cd "$(dirname "$0")/.."
ts(){ date +%H:%M:%S; }
echo "[all] START $(ts)"

echo "[all] (1) 표지 재수집(재개: source=KOBIC 건너뜀) $(ts)"
KOBIC_SLEEP=260 node tools/recollect_kobic_covers.js >> data/_recollect.log 2>&1
echo "[all] (1) 재수집 done $(ts)"

echo "[all] (2) 전공 harvest $(ts)"
export KOBIC_NOPUBFILTER=1 KOBIC_MAXPAGES=8 KOBIC_SLEEP=300
export KOBIC_TERMS="영어학개론|영어학|영문학개론|영문학사|영미문학|영미소설|영미시|언어학개론|일반언어학|응용언어학|영어음성학|영어음운론|영어통사론|영어의미론|영어화용론|사회언어학|심리언어학|영어교육론|영어교수법|제2언어습득|통번역|번역학|영어사|코퍼스언어학|담화분석|TESOL|English Linguistics|English Literature"
node tools/harvest_kobic.js > data/_harvest_major.log 2>&1
echo "[all] (2) harvest done $(ts)"

echo "[all] (3) 전공 merge $(ts)"
node tools/harvest_kobic_merge.js > data/_merge_major.log 2>&1
echo "[all] (3) merge done $(ts)"

echo "[all] (4) export_master_index $(ts)"
node tools/export_master_index.js > data/_export.log 2>&1
echo "[all] (5) build_app $(ts)"
node tools/build_app.js > data/_build.log 2>&1
echo "[all] (6) audit $(ts)"
node tools/audit.js > data/_audit.log 2>&1
echo "[all] DONE $(ts)"
echo "--- build ---"; tail -3 data/_build.log
echo "--- audit ---"; tail -6 data/_audit.log
echo "--- merge ---"; tail -3 data/_merge_major.log
