# KIS 실시간 서버 배포 가이드 - 쉬운 순서

이 서버는 한국투자증권 KIS WebSocket 실시간 체결가를 받아서 Supabase `live_quotes` 테이블에 저장합니다.
기존 Vercel 앱은 `live_quotes` 값을 먼저 읽고, 없으면 KIS REST/Yahoo/공공데이터로 대체합니다.

## 1단계. Supabase 테이블 만들기

Vercel 앱 ZIP의 `sql/live_quotes.sql` 내용을 Supabase SQL Editor에 붙여넣고 실행하세요.

## 2단계. GitHub 새 저장소 만들기

1. GitHub → New repository
2. 이름 예시: `kis-realtime-server`
3. 이 ZIP 안의 파일을 모두 업로드

## 3단계. Railway에 배포

1. Railway 접속
2. New Project
3. Deploy from GitHub repo
4. `kis-realtime-server` 선택
5. Variables 메뉴에서 아래 환경변수 입력

```txt
KIS_ENV=real
KIS_APP_KEY=한국투자증권_APP_KEY
KIS_APP_SECRET=한국투자증권_APP_SECRET
KIS_CUSTTYPE=P
WATCH_SYMBOLS=005930
SUPABASE_URL=https://본인프로젝트.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
QUOTE_WRITE_INTERVAL_MS=1000
```

처음에는 `WATCH_SYMBOLS=005930` 하나만 테스트하세요.

## 4단계. 정상 작동 확인

Railway 배포 URL에 접속합니다.

```txt
https://railway-배포주소/health
```

`connected: true` 또는 `lastQuote`가 보이면 정상입니다.

## 5단계. Supabase 데이터 확인

Supabase → Table Editor → `live_quotes`에서 `005930` 행이 생기는지 확인하세요.

## 6단계. Vercel 앱에서 live_quotes 사용 켜기

Vercel 앱 프로젝트 환경변수에 아래를 추가하세요.

```txt
LIVE_QUOTES_ENABLED=true
LIVE_QUOTES_MAX_AGE_SECONDS=60
SUPABASE_URL=https://본인프로젝트.supabase.co
SUPABASE_SERVICE_ROLE_KEY=Supabase service_role key
```

저장 후 Redeploy 합니다.

## 7단계. 앱에서 확인

1. 앱 접속: `?v=step44`
2. 기업분석 또는 자산현황에서 현재값 갱신
3. 출처가 `kis-websocket`으로 나오면 실시간 서버 값이 적용된 것입니다.

## 주의

- KIS_APP_SECRET과 Supabase service_role key는 GitHub에 올리면 안 됩니다.
- `WATCH_SYMBOLS`는 처음부터 많이 넣지 마세요. 처음에는 005930 하나만 테스트하세요.
- WebSocket이 끊기면 이 서버가 5초 후 재접속합니다.
