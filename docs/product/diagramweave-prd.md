# DiagramWeave 제품 요구사항 문서(PRD)

- **문서 버전:** 0.4
- **작성일:** 2026-08-05
- **제품명:** DiagramWeave
- **애플리케이션명:** DiagramWeave Studio
- **초기 지원 언어:** PlantUML (`.puml`, `.plantuml`)
- **상태:** 구현 기준안

## 1. 제품 정의

DiagramWeave는 사용자가 PlantUML 소스를 직접 작성하면서 LLM이 선택 범위 또는 문서 전체에 대해 검토 가능한 수정안을 제안하고, 로컬 검증·diff·렌더 결과를 거쳐 사용자가 최종 적용 여부를 결정하는 **소스 우선 AI 네이티브 다이어그램 에디터**다.

> 직접 쓰고, AI와 함께 다듬는 다이어그램 에디터.

## 2. 문제

텍스트 기반 다이어그램은 Git과 코드 리뷰에 적합하지만 문법 학습, 오류 복구, 반복 수정 비용이 크다. 범용 LLM 도구는 전체 파일을 과도하게 재작성하거나 유효하지 않은 구문을 생성하고, 무엇이 왜 바뀌었는지 숨길 수 있다. 반대로 시각 편집기는 소스 이식성, 재현성, CI 검증을 약화할 수 있다. 민감한 아키텍처를 외부 모델이나 원격 렌더러에 보내기 어려운 조직도 많다.

DiagramWeave가 해결할 질문은 다음과 같다.

> 사용자가 소스 통제권을 잃지 않으면서 AI로 PlantUML 작성 속도와 품질을 높일 수 있는가?

## 3. 제품 원칙

1. **Source First:** 파일의 소스가 유일한 진실이며 렌더 결과는 파생 산출물이다.
2. **Manual First-Class:** 계정, 인터넷, LLM 없이 수동 편집·저장·검증·렌더가 가능해야 한다.
3. **AI Proposes, Human Decides:** AI는 제안하며 자동 저장·커밋·푸시하지 않는다.
4. **Smallest Safe Change:** 선택 범위와 최소 patch를 우선한다.
5. **Validate Before Apply:** revision, 범위, schema, 정책, 렌더를 적용 전에 검증한다.
6. **Local and Private by Default:** 로컬 파일과 로컬 렌더가 기본이다.
7. **Provider-Neutral:** 특정 모델, 클라우드, IDE에 종속되지 않는다.
8. **Composable:** Studio, Core, Renderer, AI, Language Server, CLI를 독립 사용 가능하게 한다.
9. **Accessible by Design:** 마우스, hover, 색상만으로 핵심 기능을 제공하지 않는다.
10. **Evidence Over Claims:** 성능과 AI 품질은 재현 가능한 평가로 입증한다.

## 4. 목표

| ID | 목표 |
|---|---|
| G-01 | 전문 코드 에디터 수준으로 PlantUML을 직접 작성한다. |
| G-02 | 자연어에서 유효한 PlantUML 초안을 생성한다. |
| G-03 | 선택 범위 또는 명시적으로 승인한 문서 범위만 수정한다. |
| G-04 | 모든 AI 변경을 설명, diff, 검증 결과와 함께 검토한다. |
| G-05 | 로컬 렌더와 정책으로 민감한 소스를 보호한다. |
| G-06 | CLI·Language Server·Core를 naruon과 다른 CWL 제품에서 재사용한다. |
| G-07 | PlantUML 이후 Mermaid, D2, Graphviz, Structurizr DSL 어댑터를 추가한다. |
| G-08 | 상용 제품 수준의 접근성, 복구성, 감사 가능성, 패키징을 제공한다. |

## 5. 초기 비목표

- 완전한 드래그 앤 드롭 WYSIWYG와 무손실 양방향 역변환
- 승인 없는 AI 자동 저장·커밋·푸시
- 첫 출시에서 모든 다이어그램 언어 지원
- 첫 출시에서 실시간 다중 사용자 공동 편집
- 임의 코드·쉘 실행 또는 외부 URL 자동 접근
- 원본을 숨기는 폐쇄형 파일 포맷

## 6. 대상 사용자

### 소프트웨어·솔루션 아키텍트

시스템 컨텍스트, 컴포넌트, 배포, 시퀀스 다이어그램을 Git에서 관리하며 반복 구조 변경과 표준화에 AI 도움을 원한다.

### 플랫폼·백엔드·인프라 엔지니어

서비스 의존성, 네트워크, 데이터 흐름, 장애 시나리오를 정확한 소스와 CI로 검증하고 민감한 내용을 외부로 보내지 않으려 한다.

### 기술 PM·BA·문서 작성자

문법보다 요구사항과 흐름에 익숙하며 자연어에서 초안을 만든 뒤 직접 수정하려 한다.

### 개발자 경험·문서 플랫폼 담당자

조직 템플릿, 스타일, CLI, 정책 팩, 감사와 언어 서버를 관리한다.

### 엔터프라이즈 보안 관리자

모델 전송, remote include, 렌더러 네트워크 접근, 자격 증명과 감사 정책을 통제한다.

## 7. Jobs to Be Done

| ID | 사용자가 하려는 일 | 성공 결과 |
|---|---|---|
| JTBD-01 | 자연어 요구사항으로 새 다이어그램을 만든다 | 유효한 소스와 즉시 검토 가능한 초안 |
| JTBD-02 | 직접 작성하며 자동완성·진단을 받는다 | 문법 오류를 빠르게 줄임 |
| JTBD-03 | 선택한 요소나 관계만 AI로 바꾼다 | 나머지 소스가 보존된 최소 diff |
| JTBD-04 | 렌더 실패 원인과 최소 수정안을 찾는다 | 검증 가능한 복구 제안 |
| JTBD-05 | 복잡한 소스와 그림을 설명받는다 | 인수·리뷰 시간 단축 |
| JTBD-06 | 변경 전후 소스와 렌더를 비교한다 | 승인 근거 확보 |
| JTBD-07 | 저장소의 모든 다이어그램을 CI에서 검증한다 | 깨진 문서 병합 차단 |
| JTBD-08 | 네트워크 없이 작업한다 | 소스 외부 전송 없는 완전한 수동 모드 |

## 8. 제품 형태

DiagramWeave Studio는 **데스크톱·로컬 우선**으로 출시한다. 웹 SaaS는 배포와 협업이 쉽지만 로컬 파일, Git, 오프라인과 보안 요구에 약하다. IDE 확장만으로 시작하면 PM과 문서 작성자 접근성이 낮아진다. 따라서 독립 데스크톱 제품을 제공하되 Core, Renderer, AI adapter, Language Server, CLI를 분리해 웹, IDE, naruon과 CWL 서비스가 재사용한다.

## 9. 핵심 사용자 흐름

### 새 다이어그램

1. 새 파일 또는 템플릿을 선택한다.
2. 직접 작성하거나 자연어 요청을 입력한다.
3. 외부 전송될 컨텍스트를 확인한다.
4. AI가 revision-bound 제안을 반환한다.
5. 제품이 schema, 범위, 정책, 렌더를 검사한다.
6. 사용자가 소스 diff와 렌더 전후를 비교한다.
7. 전체 또는 hunk 단위로 수용한다.
8. 적용은 하나의 undo 단위가 된다.
9. 사용자가 저장·export·commit을 결정한다.

### 선택 범위 수정

1. 소스 범위를 선택한다.
2. 수정 의도를 입력한다.
3. AI는 선택 범위를 기본 effective scope로 사용한다.
4. 확대가 필요하면 이유를 명시한다.
5. 요청 이후 원본이 바뀌면 stale patch를 자동 적용하지 않는다.
6. 사용자 승인 후에만 적용한다.

### 오류 복구

1. 분석기 또는 렌더러가 구조화된 진단을 제공한다.
2. 사용자는 직접 수정하거나 최소 수정 제안을 요청한다.
3. AI는 오류와 인접 문맥만 받는다.
4. 검증 실패 제안은 기본 적용할 수 없다.
5. 사용자가 명시적으로 검증되지 않은 초안을 선택한 경우에만 임시 반영한다.

### AI 없는 수동 작업

로그인하지 않고 로컬 파일을 열어 편집, 저장, 진단, 렌더, export한다. 네트워크나 모델 장애가 수동 작업을 중단하지 않는다.

## 10. 정보 구조

- **상단:** 문서 탭, 저장·렌더 상태, 명령 팔레트
- **왼쪽:** 파일 탐색기, 다이어그램 개요, 템플릿, 조직 라이브러리
- **중앙:** PlantUML 소스 에디터
- **오른쪽:** 실시간 미리보기
- **하단:** 진단, AI diff, 렌더 로그
- **보조 패널:** AI 요청, Context Inspector, 모델·정책 상태

모든 패널은 키보드로 이동·숨김·크기 조절할 수 있어야 한다.

## 11. 기능 요구사항

### 워크스페이스와 편집

| ID | 우선순위 | 요구사항 |
|---|---|---|
| FR-001 | Must | 로컬 폴더를 워크스페이스로 연다. |
| FR-002 | Must | `.puml`, `.plantuml` 파일을 손실 없이 열고 저장한다. |
| FR-003 | Must | 디스크 외부 변경을 감지하고 덮어쓰기 전에 비교한다. |
| FR-004 | Must | 비정상 종료 후 미저장 내용을 복구한다. |
| FR-010 | Must | 구문 강조, 검색·바꾸기, 괄호 매칭, 줄 번호, undo/redo를 제공한다. |
| FR-011 | Must | 자동완성, 진단, 문서 심볼과 개요를 제공한다. |
| FR-012 | Should | 정의 이동, 참조 찾기, 안전한 이름 변경을 제공한다. |
| FR-013 | Must | 대규모 소스를 위해 검증된 package·namespace 범위의 접기를 제공한다. |

FR-011의 capability-negotiated 문서 심볼·개요와 선언 키워드 자동완성 foundation 범위는 구현됐다. LSP 3.18 `textDocument/documentSymbol`은 `hierarchicalDocumentSymbolSupport: true`를 명시한 클라이언트에는 명시적 PlantUML 선언의 source-order immutable UTF-16 `DocumentSymbol[]` tree를 반환하고, 그 밖의 클라이언트에는 같은 authoritative tree를 반복 순회해 만든 immutable `SymbolInformation[]`을 반환한다. flat child는 입증된 immediate parent의 `containerName`과 validated local URI·enclosing range를 보존한다. 완전한 unquoted package 또는 namespace brace scope와 동일 indentation의 standalone close가 입증된 경우에만 hierarchy의 `children`과 enclosing parent range를 제공한다. capability-gated `textDocument/completion`은 안전한 줄 선두 접두사에 결정론적 UTF-16 `textEdit`를 제공한다. Studio·IDE·`dweave-lsp`·naruon에서 동일한 세션을 재사용하며 implicit participant, 관계 endpoint, member, macro, include, renderer-dependent syntax, malformed 선언, 불완전 hierarchy와 모호한 자동완성 문맥은 추측하지 않는다.

LSP 3.18 `textDocument/foldingRange` 구현도 완료됐다. 클라이언트가 plain `textDocument.foldingRange` capability를 제공한 경우에만 `foldingRangeProvider: true`를 광고하고, 같은 authoritative symbol tree에서 완전하고 비어 있지 않은 package·namespace scope만 source-order `FoldingRange[]`로 반환한다. 유효한 `rangeLimit`과 boolean `lineFoldingOnly`를 fail-closed로 협상하며, 결과는 최대 1,024개로 제한되고 renderer·LLM·파일·네트워크를 호출하지 않는다.

### 렌더와 진단

| ID | 우선순위 | 요구사항 |
|---|---|---|
| FR-020 | Must | debounce된 로컬 미리보기를 제공한다. |
| FR-021 | Must | 로컬 renderer와 PlantUML `SANDBOX`를 기본값으로 사용한다. |
| FR-022 | Must | SVG와 PNG를 export한다. |
| FR-023 | Must | 렌더 실패를 위치·유형·심각도가 있는 진단으로 제공한다. |
| FR-024 | Must | remote include를 기본 차단한다. |
| FR-025 | Should | AI 검토 화면에서 before/after 렌더를 비교한다. |

FR-023의 foundation 범위는 구현됐다. PlantUML `-stdrpt:1`의 one-based line을 zero-based LSP 3.18 range로 변환하고, severity `1`, code `plantuml.syntax`, 고정 메시지를 사용한다. raw stderr, raw label, source excerpt, 실행 경로와 자격 증명은 노출하지 않는다. 전체 PlantUML parser와 문자 단위 범위는 Language Server 단계의 별도 기능이다.

### AI 생성·수정

| ID | 우선순위 | 요구사항 |
|---|---|---|
| FR-040 | Must | 자연어에서 새 PlantUML 초안을 제안한다. |
| FR-041 | Must | 선택 범위 수정과 명시적 문서 전체 수정을 구분한다. |
| FR-042 | Must | 오류 복구용 최소 patch를 제안한다. |
| FR-043 | Must | 소스·다이어그램 설명은 읽기 전용이다. |
| FR-044 | Must | 전송할 컨텍스트를 요청 전에 표시한다. |
| FR-045 | Must | 줄·hunk 단위 diff 수용과 거부를 제공한다. |
| FR-046 | Must | 모델 제공자를 교체할 수 있다. |
| FR-047 | Must | AI 결과를 신뢰하지 않는 입력으로 처리한다. |

### CLI·언어 서버·임베드

| ID | 우선순위 | 요구사항 |
|---|---|---|
| FR-070 | Must | `dweave validate`가 CI용 종료 코드와 구조화 결과를 반환한다. |
| FR-071 | Must | `dweave render`가 파일 또는 폴더를 결정론적으로 렌더한다. |
| FR-072 | Should | 독립 Language Server가 진단·완성·hover·심볼을 제공한다. |
| FR-073 | Should | Core를 라이브러리와 로컬 서비스로 사용할 수 있다. |
| FR-074 | Should | naruon용 명시적 tool contract를 제공한다. |

FR-070과 FR-071의 foundation 범위는 구현됐다. CLI는 safe relative path, 상태, 오류 코드, revision hash와 구조화 진단만 보고하며 source, raw renderer diagnostic, raw label, Java/JAR 경로와 environment 값은 보고하지 않는다.

FR-072의 진단·capability-negotiated 문서 심볼·선언 키워드 자동완성·conservative folding range·stdio foundation 범위도 구현됐다. bounded JSON-RPC transport와 transport-neutral session이 같은 UTF-16 진단과 completion 계약을 제공하며, modern client에는 conservative `DocumentSymbol[]` tree를, legacy client에는 같은 tree에서 파생한 `SymbolInformation[]`을 제공한다. legacy `SymbolInformation[]` compatibility 구현은 완료됐고, `textDocument/foldingRange` 구현도 완료됐다. completion resolve, semantic member completion, hover, definition, references, rename, arbitrary region folding과 workspace indexing은 아직 구현되지 않았다.

### 접근성

| ID | 우선순위 | 요구사항 |
|---|---|---|
| FR-080 | Must | 파일 열기부터 diff 수용까지 키보드로 수행한다. |
| FR-081 | Must | focus 표시와 순서를 보존한다. |
| FR-082 | Must | 색상 외 텍스트·아이콘으로 상태를 표현한다. |
| FR-083 | Must | 스크린 리더용 이름, 역할, 상태를 제공한다. |
| FR-084 | Must | 한국어와 영어 UI를 제공한다. |

## 12. AI EditProposal 계약

```text
EditProposal
- schemaVersion
- proposalId
- documentId
- baseRevisionHash
- operationType
- requestedScope
- effectiveScope
- replacement
- summary
- assumptions[]
- scopeExpansionReason (확대 시 필수)
```

적용 규칙:

1. 현재 source hash가 `baseRevisionHash`와 다르면 중지한다.
2. effective scope가 requested scope를 넘으면 이유와 사용자 승인이 필요하다.
3. schema·정책·렌더 검증 실패 시 기본 적용을 비활성화한다.
4. 적용은 원자적이며 한 번의 undo로 되돌릴 수 있다.
5. AI 설명, source, diff를 시각·접근성 트리에서 구분한다.
6. 주석·레이블·include 콘텐츠는 도구 명령이 아니라 untrusted data다.

현재 Foundation의 Core는 revision, schema, range와 scope-expansion 계약을 구현한다. Contextual Orchestrator adapter는 HTTPS/loopback policy, context size, strict JSON, timeout과 Core validation을 구현한다. PlantUML renderer는 host-supplied Java/JAR, stdin-only pipe, fixed `SANDBOX`, metadata suppression, byte limits, deadline, SVG/PNG 구조 검증, LSP-compatible line diagnostic과 source-free error contract를 구현한다. CLI는 deterministic discovery, validate/render, atomic publication, structured report와 진단 출력 계약을 구현한다.

## 13. 논리적 아키텍처

- **DiagramWeave Studio:** 데스크톱 UI와 파일·diff·미리보기·승인
- **DiagramWeave Core:** revision, proposal validation, preview, apply
- **DiagramWeave Renderer:** 구현된 격리 로컬 renderer, bounded standard-report parser와 향후 명시적 opt-in 원격 renderer
- **DiagramWeave Diagnostics:** 구현된 LSP-compatible source-free record와 sanitizer
- **DiagramWeave AI:** provider-neutral orchestration과 proposal contract
- **Contextual Orchestrator adapter:** 기본 LLM 경로
- **DiagramWeave Language Server:** 편집 진단과 탐색
- **DiagramWeave CLI:** 구현된 CI 검증·결정론적 렌더·원자적 export·진단 보고
- **DiagramWeave Policy:** include, 네트워크, AI 전송, 조직 스타일 정책
- **DiagramWeave Collaboration:** 선택적 팀 서비스

각 모듈은 독립 패키지로 테스트·버전 관리하며 로컬 라이브러리 또는 네트워크 서비스로 배치할 수 있다. 중앙 `.github` 정책을 재사용하되 저장소는 독립 빌드가 가능해야 한다.

## 14. 데이터 모델

소스 파일과 Git이 원본을 소유한다. 로컬 데이터베이스는 복구, 설정, 제안, 파생 artifact 메타데이터만 저장한다. 모든 객체는 두 단어 이상 `snake_case`를 사용한다.

- `workspace_record`
- `diagram_document`
- `source_revision`
- `render_artifact`
- `edit_proposal`
- `model_invocation`
- `audit_event`
- `provider_profile`
- `user_preference`
- `policy_profile`

Foundation에는 데이터베이스가 없다.

## 15. 보안·개인정보 요구사항

- 로컬 PlantUML renderer는 `SANDBOX` 기본값과 별도 프로세스 경계를 사용한다.
- remote include는 기본 비활성화한다.
- Foundation local renderer에서는 local include도 허용하지 않는다. 향후 include 기능은 별도 policy mode에서 canonical workspace allowlist, symlink escape 검사와 사용자 승인을 요구한다.
- renderer에 deadline과 입력·stdout·stderr 크기 제한을 둔다. Professional 1.0 이전에 운영체제 수준 CPU·메모리 격리를 추가한다.
- structured diagnostic은 bounded integer, fixed code, fixed message와 LSP range만 허용한다.
- raw renderer stderr, raw PlantUML label, source excerpt, Java/JAR 경로와 credential은 공개 error·diagnostic·CLI report에 포함하지 않는다.
- source 주석과 모델 출력은 prompt와 tool instruction으로 신뢰하지 않는다.
- AI package는 파일, 환경 변수, shell, provider key에 직접 접근하지 않는다.
- 전송 범위는 사전 확인·축소·취소 가능하다.
- token은 host keychain 또는 관리형 secret store에서 제공한다.
- source, prompt, render image, token은 기본 telemetry에 포함하지 않는다.
- signed package, SBOM, provenance, dependency lock을 release gate로 둔다.

## 16. 비기능 요구사항

### 성능

- 입력 후 구문 피드백 p95 100ms 이하
- 500줄 이하 warm local preview p95 1.5초 이하
- UI thread에서 renderer·AI·indexing 장시간 실행 금지
- adapter 내부 overhead p95 250ms 이하(모델 응답 제외)

### 신뢰성

- 원자적 파일 저장과 실패 시 기존 파일 보존
- 비정상 종료 복구
- stale patch fail-closed
- renderer 실패와 Studio process 분리
- malformed·hostile diagnostic input fail-closed

### 품질

- production statement coverage 100%
- production branch coverage 100%
- production function coverage 100%
- production export와 보안 경계 JSDoc 100%
- static analysis, type, syntax, package, security 검증
- skipped·ignored test를 release gate에서 허용하지 않음

### 접근성과 호환성

- WCAG 2.2 AA
- LSP 3.18 호환 목표
- Windows, macOS, Linux 지원 정책
- UTF-8, LF·CRLF 왕복 보존
- Semantic Versioning과 migration 정책

## 17. 성공 지표

North Star는 **Weekly Valid Diagram Outcomes**다. 수동 또는 AI 편집 후 validate/render가 성공하고 source가 저장·export·commit 준비 상태가 된 고유 다이어그램 수를 측정한다.

| 지표 | 초기 목표 |
|---|---|
| 첫 유효 렌더 도달률 | 70% 이상 |
| 첫 유효 다이어그램 중앙 시간 | 10분 이하 |
| AI proposal 사전 검증 통과율 | 98% 이상 |
| AI proposal 전체·부분 수용률 | 55% 이상 |
| 2분 이내 전체 revert | 10% 이하 |
| 오류에서 유효 렌더 복구 | 80% 이상 |
| crash-free sessions | 99.9% 이상 |

가드레일은 승인 없는 source 외부 전송, stale patch 자동 적용, 금지 remote include, source telemetry, AI 자동 push를 모두 0건으로 유지한다.

## 18. AI 평가

최소 300개의 versioned task로 sequence, class, component, deployment, activity, state, C4 macro, preprocessor, 손상 문법, 한글·영문 label, 금지 include를 평가한다.

평가 차원:

- 문법 유효성과 렌더 성공
- 사용자 의도 충족
- 범위 준수와 최소 변경성
- 기존 식별자·주석 보존
- 보안 정책 준수
- 설명 정확성
- 가정과 불확실성 명시
- provider 간 일관성

출시 목표는 한 번의 제안 또는 한 번의 repair 이내 유효 렌더 98%, 범위 제한 작업의 선택 밖 무관한 줄 보존 95%, 금지된 실행·외부 접근 적용 가능 판정 0건, human rubric 의도 충족 90%다.

## 19. 단계별 출시

### Foundation

Core revision/proposal contract, Contextual Orchestrator adapter, stdin-only PlantUML `SANDBOX` renderer, deterministic CLI validate/render, LSP-compatible source-free line diagnostics, 품질 게이트, 보안·아키텍처 문서, 시간별 PR·개발 governance를 제공한다.

### Manual Editor Alpha

로컬 파일, source editor, preview, diagnostics panel, SVG·PNG export와 keyboard flow를 제공한다. CLI와 renderer diagnostic foundation은 재사용한다.

### AI-Assisted Beta

generate, modify selection, repair, explain, Context Inspector, diff/hunk 승인, provider adapter, 평가 harness를 제공한다.

### Professional 1.0

Language Server, Git-aware diff, policy pack, local model adapter, signed packages, SBOM/provenance, 3개 OS, WCAG 2.2 AA를 충족한다.

### Team and Enterprise

공유 template, review, collaboration, SSO·SCIM·RBAC, 중앙 정책·감사, 자체 호스팅, DLP와 tenant isolation을 제공한다.

### Multi-Language Platform

Mermaid, D2, Graphviz, Structurizr DSL, plugin SDK와 naruon/CWL 공통 diagram service로 확장한다.

## 20. 패키징 가설

- **Community:** 수동 편집, 로컬 렌더, 기본 진단·CLI, BYOK AI adapter
- **Pro:** 관리형 AI, 고급 refactor·review·Git·template
- **Team:** 공유 library, review·approval, 정책 배포, collaboration
- **Enterprise:** self-host, SSO·SCIM·RBAC, model gateway, DLP·감사·지원

오픈소스와 상용 경계는 Core·Language Server·CLI의 생태계 확장성과 Studio·Team·Enterprise의 수익성을 함께 확보하는 별도 사업·법무 결정으로 확정한다.

## 21. 주요 위험

| 위험 | 완화 |
|---|---|
| PlantUML 전체 문법 분석 난이도 | bounded standard-report foundation, tolerant tokenizer, landmark, renderer validation, adapter 확장 |
| AI의 과도한 전체 재작성 | selection default, patch 크기, 최소 변경 평가, hunk 승인 |
| renderer 파일·네트워크 접근 | Foundation fixed SANDBOX와 no-include; 향후 별도 allowlist mode |
| 외부 모델 민감정보 전송 | Context Inspector, redaction, local model, provider policy |
| 특정 provider 종속 | provider-neutral interface와 benchmark |
| 크로스플랫폼 패키징 복잡성 | 공통 Core, 플랫폼 smoke test, 서명 자동화 |
| WYSIWYG 기대 불일치 | source-first positioning과 명확한 scope |
| AI 오류가 사실처럼 보임 | 가정 표시, human approval, provenance |

## 22. Foundation 수용 기준

- Core, Contextual Orchestrator adapter, PlantUML renderer, CLI가 독립 package로 동작한다.
- AI output이 revision, range, schema와 scope policy를 통과하기 전에는 적용되지 않는다.
- remote endpoint는 HTTPS, local development는 loopback HTTP만 허용한다.
- provider error body, source, token, renderer stderr와 raw PlantUML label을 log 또는 public error에 노출하지 않는다.
- renderer가 shell 없이 absolute Java/JAR를 실행하고 source를 stdin으로만 전달한다.
- renderer가 fixed `SANDBOX`, `-nometadata`, byte cap, deadline과 SVG/PNG validation을 강제한다.
- `parsePlantUmlStandardReport`가 official line-2 fixture를 LSP-compatible line index 1로 변환한다.
- renderer error와 CLI report의 diagnostic array가 bounded, validated, deeply frozen 상태다.
- `dweave validate`와 `dweave render`가 deterministic file/batch contract와 exit code 0/1/2를 제공한다.
- Node 22·24 CI를 제공한다.
- production line·branch·function coverage와 JSDoc 100%를 충족한다.
- PRD, architecture, security, operations, research note, CHANGELOG를 제공한다.
- central `.github` PR maintenance와 fail-closed hourly product development를 설치한다.
- release는 아직 수행하지 않고 `0.0.0`과 `Unreleased`를 유지한다.

## 23. 준거 기준

- PlantUML 공식 command-line `-stdrpt:1`, 보안 프로필과 allowlist 문서
- Language Server Protocol 3.18
- SARIF 2.1.0의 diagnostic location 개념
- WCAG 2.2 및 ISO/IEC 40500:2025
- ISO/IEC 25010:2023 product quality model
- NIST AI RMF 1.0과 NIST AI 600-1 Generative AI Profile
- OpenTelemetry Specification
- SLSA 1.1
- Semantic Versioning

## 24. 후속 산출물

1. Studio UX flow와 화면 상태 명세
2. Figma interaction frames와 접근성 상태
3. Studio preview와 renderer 진단·취소 interaction contract
4. EditProposal JSON Schema
5. Core·Renderer·AI·LSP API 계약
6. 기술 스택 ADR
7. 평가 데이터셋과 rubric
8. 단계별 issue/PR 분해
9. release·license·supply-chain checklist
