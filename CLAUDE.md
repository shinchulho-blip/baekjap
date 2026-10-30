# 백잡사전 N잡 진단 프로젝트 — Claude Code 작업 규칙 (v2.0)

## 프로젝트 개요
- 23문항 진단 설문에 답하면 잡 100개 중 맞는 N잡 2~6개를 추천하는 정적 웹앱 (GitHub Pages로 배포, `main` 브랜치 = 사이트).
- 대상 이용자: 50플러스 중장년 (큰 글씨, 쉬운 문장, 모바일 우선).
- 질문은 세 방향: **1부 하고 싶은 일(Q1~Q7) · 2부 잘하는 것(Q8~Q14) · 3부 지금 상황(Q15~Q23)**.
- 핵심 원칙: 하고 싶은 일이 순위를 가장 크게 정하고, 잘하는 것이 그 안의 순서를 정하며, 지금 상황은 "할 수 없는 일"을 거른다. 조금만 준비하면 되는 일은 버리지 않고 "준비하면 가능"으로 보여준다.
- 질문지 설계 문서: https://claude.ai/artifact/WmSvg98VhCeTgkwqR5Jkjh (v2.0 초안·변경 근거·시뮬레이션)

## 파일 구성
- `scoring.js` — 채점 엔진 (순수 JS, 의존성 없음). Node(`require`)와 브라우저(`<script src>`) 양쪽에서 같은 파일을 씀. `recommend(answers, jobs)`.
- `index.html` — 앱 (질문 흐름 + 결과 카드). 채점은 `scoring.js`를 불러 씀 — **index.html 안에 채점 코드를 복사하지 말 것.** 잡 데이터는 `const JOBS = [...]`로 인라인(파일로 열어도 동작하도록).
- `jobs.json` — 잡 100개 DB. 필드: no(3자리 문자열), name, type_no, cost, time, stamina, flex, place, license, income, income_min/max(만원), attract(매력도 지수). **수정하면 index.html의 JOBS도 같이 고칠 것** (verify.js가 일치 여부를 검사).
- `profiles.js` — 가상 응답자 생성기 (결정적 난수). verify·ranking·exposure 공용. `realistic` 모드 분포는 가정치.
- `verify.js` — 회귀 검증. `node verify.js` (실패 시 종료 코드 1).
- `ranking.js` — 전체 순위 노출률. `node ranking.js uniform` / `node ranking.js realistic` (`csv` 인자 추가 시 CSV).
- `exposure.js` — 잡별 노출률 + 3부 조건 병목.
- `final_ranking_v2.0.csv` — v2.0 기준 전체 순위 스냅샷(uniform). `final_ranking_v1.7.csv` — 이전 버전 스냅샷(비교용).

## answers 스키마 (v2.0)
- 단일 선택: 선택지 번호(①=1, ②=2…). 복수 선택(배열, 최대 2개): Q1·Q2(분야 1~14), Q8(1~10), Q9(1~11). "모르겠어요/없어요"는 빈 배열 `[]`.
- Q12 자격: `{has:true, name:'자격명', typeBonus:[유형번호]}` 또는 `{has:false}`.
- Q2(하기 싫은 분야)는 Q1에서 고른 분야를 고를 수 없다(UI에서 막음).

## 절대 지킬 것 (중요도 순)
1. **채점 로직·데이터·질문을 수정한 후 반드시 `node verify.js`를 실행하고 모두 통과할 것.** 주요 기준:
   - 최악 경로(Q15~Q20 모두 1, 하고 싶은 분야 없음)에서 출력 정확히 2개 (016, 006)
   - 결정성: 같은 answers → 같은 results
   - 출력 개수 항상 2~6개, 절대 조건 위반 0건, 조건부 추천은 부족 조건 2개 이하
   - 하고 싶은 분야 잡 최소 2개 보장(가능한 경우), 무작위 커버리지 100/100, 1% 넘게 추천되는 잡 60개 이상, 도달성 100/100
   - index.html 잡 데이터 = jobs.json, index.html이 scoring.js를 불러옴
2. **결정성 유지**: 채점·정렬에 `Math.random` 사용 금지. 동점은 응답 해시 기반 지터·로테이션으로.
3. **의존성 추가 금지**: scoring.js는 순수 JS 유지. 브라우저·Node 겸용 구조(파일 끝 `module.exports` 분기)를 깨지 말 것.
4. **조정 포인트는 scoring.js 상단 상수로만**: 가중치 `W`, 출력 규칙(MAX_RESULTS, WANT_MIN, MAX_SOFT_FAILS, MAX_CONDITIONAL 등), 분야→잡 `FIELD_JOBS`, 강점→잡 `STRENGTH_MAP`, 경력→유형 `EXP_MAP`, 잡 집합(PRO_JOBS, SIMPLE_JOBS, CAPITAL_JOBS, POPULAR_JOBS, CAR_REQUIRED …). 새 잡을 추가하면 반드시 `FIELD_JOBS` 어딘가에 연결.
5. **배포는 사용자 승인 후**: `main`에 올리면 1~2분 뒤 사이트에 반영된다. 수업 중에는 올리지 말 것. 작업은 별도 브랜치에서 하고 확인받은 뒤 `main`에 합칠 것.

## 로직 구조 요약 (수정 시 참조)
- 3부 조건 판정 `conditionCheck`:
  - 절대 조건(걸리면 제외): Q15 '집에서만'→재택·온라인 외 제외 / Q18 '앉아서만'→체력 상 제외 / Q23 '차 없음'→CAR_REQUIRED 제외 / Q2 하기 싫은 분야(단, Q1 분야와 겹치면 유지).
  - 조정 가능 조건(부족 목록 반환): 먼 현장(Q15=2), 주간 시간(Q16), 고정 근무(Q17=1), 자격 단계(Q20), 시작 비용(Q19), 체력 한 단계(Q18).
- 점수 `scoreJob`: Q1 분야 +6 · Q9 강점 +2.5 · Q8 경력 +2 · Q12 자격 +3(유형/잡명 각각) · Q3 대상 +2 · 그 외 선호·상황 ±0.5~2 · 매력도 ×0.25 · 인기 잡 +0.3 · 조건 1개 부족당 −1.5.
- 결과 구성 `recommend`: ① 고른 분야마다 1개(바로 가능 → 없으면 준비하면 가능) ② 분야 잡 바로 가능 최대 3개 ③ 분야 잡 최소 2개 보장 ④ 남은 칸은 바로 가능한 잡 + 분야의 준비하면 가능 잡을 점수순(준비 필요 최대 3개) ⑤ 같은 유형 최대 3개, 단순 과업 최대 1개 ⑥ 2개 미만이면 조건 부족이 적은 순으로 채움(안전망).
- 결과 카드: 세 가지 체크(하고 싶은 분야 / 잘하는 것과 연결 / 지금 바로 가능·준비하면 가능) + 응답 기반 근거 문장 + "준비가 필요해요" 조건.

## 검증·측정 워크플로우
1. 로직 수정 → `node verify.js` → 모두 통과 확인
2. 순위 확인 → `node ranking.js uniform && node ranking.js realistic`, 병목 확인 → `node exposure.js`
3. 특정 잡 상향/하향 후: 위 스크립트로 이동 확인 + 다른 잡이 밀리는 부작용 점검
4. UI 수정 시: 브라우저(Playwright 등)로 index.html을 열어 23문항 전체 흐름 + 결과 카드 확인 (모바일 390px 폭 기준, 가로 스크롤 없음). `index.html#demo`는 샘플 답변으로 결과 화면 바로 보기.

## 알려진 과제
- 평판조회 전문가(016) 등 재택 잡 쏠림: '집에서만'을 고르면 가능한 잡이 약 20개뿐이라 생김 → 재택 잡 보강 또는 잡 분류(장소·자격·체력) 점검으로 해결.
- `profiles.js`의 realistic 분포는 가정치. 실제 응답 로그가 생기면 교체.

## 향후 작업 후보 (요청 시)
1. 결과 화면 "잘 맞아요 / 안 맞아요" 피드백 + Supabase 익명 저장 (anon key만 사용, service_role 키 금지, RLS는 insert만 허용).
2. 결과 재방문: answers를 URL 해시로 저장해 "내 결과 링크" 제공.
3. 잡 100개 분류 점검표 (장소·자격·체력 라벨 재검토).
4. 결과 공유 이미지, 접근성(키보드·스크린리더) 고도화.
