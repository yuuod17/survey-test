# IP 연속 응답 판정 버튼 설문 웹사이트

이 버전은 설문을 여러 번 할 수 있게 하되, 같은 IP가 제출 순서에서 2회 이상 연속으로 나타나는지 CSV에서 확인할 수 있게 만든 구조입니다.

중요: CSV에는 IP가 표시되지 않습니다. Cloudflare Worker가 요청 IP를 서버 내부에서 해시 처리해서 비교하고, CSV에는 `repeatStatus` 열에 `연속` 또는 `정상`만 표시합니다.

## 파일 구조

```text
index.html              설문 참여자용 화면
script.js               설문 진행 코드
admin.html              관리자 CSV 다운로드 화면
admin.js                관리자 CSV 다운로드 코드
style.css               공통 디자인
cloudflare-worker.js    IP 해시 처리 + 저장 + CSV 생성 서버리스 코드
README.md               사용 설명서
```

## 최종 구조

```text
GitHub Pages
├─ index.html  설문 참여자용
└─ admin.html  관리자 CSV 다운로드용

Cloudflare Worker
├─ /api/submit        설문 응답 저장
└─ /api/admin/export  CSV 다운로드

Cloudflare KV
└─ 설문 응답 저장소
```

## CSV 헤더

```csv
sessionOrder,repeatStatus,sessionId,completed,submittedAt,platform,language,timezone,totalQuestions,questionNumber,pairName,deepSide,chosenSide,chosenTone,responseMs,deepCount,softCount,leftCount,rightCount,averageResponseMs,dominantTone,dominantSide
```

핵심 열은 다음과 같습니다.

- `repeatStatus`: 같은 IP가 제출 순서에서 바로 연속으로 나타나면 `연속`, 아니면 `정상`
- `chosenTone`: `deep`이면 진한 버튼 선택, `soft`이면 연한 버튼 선택
- `deepSide`: 진한 버튼이 있던 위치
- `chosenSide`: 사용자가 선택한 위치
- `responseMs`: 문항이 뜬 뒤 선택하기까지 걸린 시간(ms)

CSV는 한 사람당 10줄이 생깁니다. 즉 한 설문 세션이 10문항이면 같은 `sessionId`가 10줄 반복됩니다.

## 1. Cloudflare Worker 만들기

1. Cloudflare에 로그인합니다.
2. 왼쪽 메뉴에서 `Workers & Pages`로 이동합니다.
3. `Create application` 또는 `Create Worker`를 누릅니다.
4. Worker 이름을 정합니다. 예: `button-survey-api`
5. Worker 코드 편집 화면에서 기본 코드를 모두 지우고 `cloudflare-worker.js` 내용을 붙여넣습니다.
6. 저장 및 배포합니다.

배포 후 Worker 주소가 생깁니다.

```text
https://button-survey-api.본인계정.workers.dev
```

## 2. Cloudflare KV 저장소 만들기

1. Cloudflare의 `Workers & Pages`에서 `KV` 또는 `Storage & Databases` → `KV`로 이동합니다.
2. `Create namespace`를 누릅니다.
3. 이름을 예를 들어 `BUTTON_SURVEY_KV`로 만듭니다.
4. 다시 Worker 설정으로 이동합니다.
5. `Settings` → `Bindings`로 이동합니다.
6. KV namespace binding을 추가합니다.
7. Variable name은 반드시 아래처럼 설정합니다.

```text
SURVEY_KV
```

8. KV namespace는 방금 만든 `BUTTON_SURVEY_KV`를 선택합니다.
9. 저장 후 Worker를 다시 배포합니다.

## 3. Worker 환경 변수 설정

Worker 설정에서 환경 변수를 추가합니다.

### ADMIN_PASSWORD

관리자 페이지에서 CSV를 받을 때 입력할 비밀번호입니다.

```text
ADMIN_PASSWORD = 원하는관리자비밀번호
```

### HASH_SALT

IP를 해시 처리할 때 섞는 비밀 문자열입니다. 아무에게도 공개하지 마세요.

```text
HASH_SALT = 길고복잡한문자열
```

예:

```text
HASH_SALT = my-school-survey-2026-random-salt-9x3k
```

### ALLOWED_ORIGIN

처음 테스트할 때는 생략해도 됩니다. 보안을 조금 더 올리고 싶다면 GitHub Pages 주소를 넣습니다.

```text
ALLOWED_ORIGIN = https://본인아이디.github.io
```

## 4. script.js와 admin.js에 Worker 주소 넣기

`script.js`와 `admin.js` 맨 위에 있는 값을 바꿉니다.

```javascript
const API_BASE_URL = "YOUR_CLOUDFLARE_WORKER_URL";
```

예:

```javascript
const API_BASE_URL = "https://button-survey-api.본인계정.workers.dev";
```

두 파일 모두 같은 주소로 바꿔야 합니다.

## 5. GitHub에 웹사이트 올리기

1. GitHub에 로그인합니다.
2. 오른쪽 위 `+` → `New repository`를 누릅니다.
3. 저장소 이름을 정합니다. 예: `button-survey`
4. `Public`으로 만듭니다.
5. `Create repository`를 누릅니다.
6. 이 폴더 안의 파일 중 아래 파일을 업로드합니다.

```text
index.html
script.js
admin.html
admin.js
style.css
README.md
```

`cloudflare-worker.js`는 GitHub에 올리지 않아도 됩니다. Cloudflare Worker에 붙여넣는 서버 코드입니다.

## 6. GitHub Pages 켜기

1. GitHub 저장소에서 `Settings` 클릭
2. 왼쪽 메뉴에서 `Pages` 클릭
3. Source에서 `Deploy from a branch` 선택
4. Branch는 `main`
5. Folder는 `/root`
6. Save 클릭

잠시 후 설문 주소가 생깁니다.

```text
https://본인아이디.github.io/button-survey/
```

관리자 주소는 다음과 같습니다.

```text
https://본인아이디.github.io/button-survey/admin.html
```

## 7. 사용 방법

참여자는 설문 주소로 들어가서 10문항을 진행합니다.

관리자는 `admin.html`에 들어가서 Cloudflare Worker 환경 변수에 설정한 `ADMIN_PASSWORD`를 입력하고 CSV를 다운로드합니다.

## 8. 연속 판정 방식

CSV를 만들 때 제출 순서를 기준으로 앞뒤 응답의 IP 해시를 비교합니다.

```text
A IP → A IP → B IP
```

위 경우 첫 번째 A와 두 번째 A는 모두 `연속`입니다.

```text
A IP → B IP → A IP
```

위 경우 A가 두 번 등장했더라도 바로 이어진 것이 아니므로 둘 다 `정상`입니다.

## 9. 주의사항

- IP 원문은 CSV에 표시되지 않습니다.
- Worker 내부에서도 IP 원문을 저장하지 않고 해시값만 저장합니다.
- 단, Cloudflare 플랫폼 자체의 접속 로그에는 네트워크 처리를 위해 IP 관련 정보가 남을 수 있습니다.
- 같은 와이파이를 쓰는 여러 사람은 같은 공인 IP로 보일 수 있습니다. 그래서 `연속`은 “같은 사람”이 아니라 “같은 IP 대역에서 연속 제출”로 해석해야 합니다.
- VPN, 학교 와이파이, 통신사 NAT 환경에서는 IP 기준 판정이 완벽하지 않을 수 있습니다.
