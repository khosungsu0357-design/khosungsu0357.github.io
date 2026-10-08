# 네이버 블로그 자동화

마크다운 원고를 네이버 블로그 SmartEditor ONE 에 자동으로 작성·발행합니다.
Playwright 로 실제 에디터를 조작하는 방식입니다.

## 왜 브라우저 자동화인가

네이버는 **블로그 글쓰기 공개 API 를 제공하지 않습니다.** 개발자센터의 블로그 API 는
검색(블로그 검색)만 남아 있고, 글 등록 API 는 종료됐습니다. 그래서 선택지는 두 개뿐입니다.

1. 에디터를 브라우저로 직접 조작 ← 이 프로젝트
2. 수동 작성

## 설치

```bash
npm install
```

Playwright 버전은 `1.56.1` 로 고정되어 있습니다. 브라우저 바이너리와 버전이 맞아야 하므로
임의로 올리지 마세요. 브라우저가 없으면:

```bash
npx playwright install chromium
```

그 다음 환경파일을 만듭니다.

```bash
cp .env.example .env
# NAVER_BLOG_ID 를 본인 블로그 아이디로 수정
```

## 1단계 — 로그인 세션 저장 (최초 1회, 화면 있는 PC 에서)

```bash
npm run login
```

브라우저 창이 뜨면 **직접 로그인**합니다. 끝나면 쿠키가 `.auth/naver.json` 에 저장되고,
이후 명령은 이 세션을 재사용합니다.

- 아이디·비밀번호를 코드나 환경변수에 넣지 않습니다. 네이버가 자동 입력을 캡차·기기등록으로
  차단하기 때문에 넣어도 동작하지 않습니다.
- 입력창에는 **붙여넣기(Ctrl+V)** 로 넣으면 캡차가 덜 뜹니다.
- 2단계 인증·새 기기 등록이 나오면 "등록"까지 마치세요. 세션이 훨씬 오래 유지됩니다.
- `.auth/` 는 `.gitignore` 에 있습니다. **절대 커밋하지 마세요.**

세션이 만료되면 명령이 "세션이 만료되어 로그인 화면으로 넘어갔습니다" 로 즉시 중단됩니다.
`npm run login` 을 다시 실행하면 됩니다.

## 2단계 — 선택자 점검

```bash
npm run doctor
```

글쓰기 화면을 열어 제목·본문·사진·발행·태그 등 각 타깃이 실제로 잡히는지 표로 보여주고
`out/` 에 스크린샷을 남깁니다.

네이버 에디터는 클래스명에 해시가 붙습니다(`publish_btn__m9KHH`). 언젠가는 반드시 바뀝니다.
깨지면 `doctor` 가 어느 타깃이 ✗ 인지 알려주고, **`config/selectors.json` 한 파일만** 고치면 됩니다.
각 타깃은 후보 선택자 배열이고 위에서부터 먼저 잡히는 것을 씁니다.

## 3단계 — 원고 작성

```bash
node src/cli.mjs new 하마비-텀블벅-오픈
```

`posts/2026-10-08-하마비-텀블벅-오픈.md` 가 생깁니다.

```markdown
---
title: 경기전 하마비, 다시 세우는 이야기
category: 작업기록
tags: [한채, 하마비, 경기전, 전주, 텀블벅]
visibility: public        # public | private
publishAt: 2026-10-09 09:00   # 비우면 즉시 발행
---

첫 단락입니다. 빈 줄로 나누면 에디터에서 새 단락이 됩니다.

![작업 과정](./images/process.jpg)

이어지는 단락.
```

| frontmatter | 설명 |
|---|---|
| `title` | 필수 |
| `category` | 블로그 카테고리 이름. 비우면 `.env` 의 `NBG_DEFAULT_CATEGORY` |
| `tags` | 최대 30개 (네이버 상한) |
| `visibility` | `public` / `private` |
| `publishAt` | `YYYY-MM-DD HH:mm` → 예약 발행. 비우면 즉시 |

본문 규칙:

- 빈 줄 = 단락 구분. 단락 안 줄바꿈은 그대로 유지됩니다.
- `![설명](./images/파일.jpg)` 만 있는 단락 → 이미지 업로드로 처리
- `## 제목` 의 `#` 과 `**굵게**` 의 `*` 는 제거됩니다. 네이버 에디터 서식은 발행 후
  손으로 지정하거나, 필요하면 `src/post.mjs` 에서 확장하세요.
- `- 항목` 은 `· 항목` 으로 바뀝니다.

브라우저를 띄우지 않고 원고만 검증:

```bash
node src/cli.mjs check posts
```

## 4단계 — 발행

```bash
# 기본은 dry-run: 발행 레이어까지 다 채우고 확정 버튼은 누르지 않음
node src/cli.mjs publish posts/2026-10-08-하마비-텀블벅-오픈.md --headed

# 확인했으면 실제 발행
node src/cli.mjs publish posts/2026-10-08-하마비-텀블벅-오픈.md --live

# 디렉터리 전체 순차 처리
node src/cli.mjs publish --all posts --live
```

| 옵션 | 뜻 |
|---|---|
| `--live` | 실제 발행 (없으면 dry-run) |
| `--headed` | 브라우저 창을 띄워 눈으로 확인 |
| `--all <디렉터리>` | 디렉터리 내 `.md` 전부 |

발행 직전과 직후 스크린샷이 `out/` 에 남습니다. dry-run 에서도 `before-confirm` 이 남으므로
실제로 무엇이 들어갔는지 발행 전에 확인할 수 있습니다.

## CI(GitHub Actions)로 돌리지 않는 이유

네이버 세션은 IP·기기에 묶여 있어 GitHub Actions 러너에서 재사용하면 대부분 로그아웃됩니다.
쿠키를 Secrets 에 올리는 위험까지 감안하면 이득이 없습니다.
예약 발행이 필요하면 `publishAt` 으로 **네이버 자체 예약 기능**을 쓰는 쪽이 안전합니다.

## 주의

- 네이버는 자동 생성 글 대량 발행을 어뷰징으로 봅니다. 사람이 쓴 원고를 옮기는 용도로
  쓰고, 한 번에 여러 건을 밀어 넣을 때는 간격을 두세요 (`NBG_SLOWMO`).
- `.auth/naver.json` 은 로그인된 계정 그 자체입니다. 유출되면 계정이 넘어갑니다.

## 구조

```
config/selectors.json   네이버 DOM 선택자 (깨지면 여기만 수정)
src/cli.mjs             명령 진입점
src/login.mjs           1회 수동 로그인 → 세션 저장
src/browser.mjs         브라우저·세션·글쓰기 화면 열기
src/post.mjs            마크다운 + frontmatter → 블록 배열
src/publish.mjs         에디터 입력 → 발행/예약
src/doctor.mjs          선택자 점검
src/sel.mjs             후보 선택자 해석기
posts/                  원고 (.md) 와 images/
```
