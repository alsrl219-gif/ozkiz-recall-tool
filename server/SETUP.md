# OZKIZ 재고회수툴 - 시놀로지 NAS 서버 설치 가이드

## 전체 순서 요약

```
1단계: 시놀로지 DSM에서 Container Manager 설치
2단계: SSH 활성화
3단계: PC 터미널에서 server 폴더를 NAS에 복사
4단계: setup-synology.sh 실행 (한 번만)
5단계: 앱 설정 페이지에서 계정 입력 및 연결 테스트
```

---

## 1단계: Container Manager 설치

1. 시놀로지 웹 관리자(DSM) 접속 → **패키지 센터** 열기
2. 검색창에 `Container Manager` 입력 → **설치**
3. 설치 완료 후 Container Manager 앱 아이콘이 바탕화면에 생기면 OK

> Container Manager = Docker를 GUI로 관리하는 시놀로지 공식 앱입니다.

---

## 2단계: SSH 활성화

1. DSM → **제어판** → **터미널 및 SNMP**
2. "SSH 서비스 활성화" 체크 → **적용**
3. 포트는 기본 22번 유지

---

## 3단계: server 폴더를 NAS에 복사

PC에서 아래 방법 중 하나로 `server` 폴더 전체를 NAS에 복사합니다.

### 방법 A - File Station (드래그앤드롭)
1. DSM → **File Station** 열기
2. `home` 폴더 안에 `ozkiz-server` 폴더 생성
3. PC의 `server` 폴더 내용 전체를 `ozkiz-server` 안으로 드래그

### 방법 B - SCP (터미널)
PC 터미널(PowerShell 또는 cmd)에서:
```bash
scp -r "C:\경로\FC-RT\server" admin@시놀로지IP:~/ozkiz-server
```

복사 완료 후 NAS의 `~/ozkiz-server/` 안에 아래 파일들이 있어야 합니다:
```
ozkiz-server/
├── Dockerfile
├── docker-compose.yml
├── setup-synology.sh
├── package.json
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── api-config.ts
│   ├── data-store.ts
│   ├── processor.ts
│   └── scrapers/
└── ...
```

---

## 4단계: 자동 설치 스크립트 실행

### NAS에 SSH 접속
PC 터미널에서:
```bash
ssh admin@시놀로지IP
```
비밀번호 입력 후 접속 완료.

### 스크립트 실행
```bash
cd ~/ozkiz-server
bash setup-synology.sh
```

스크립트가 자동으로:
- 필요한 폴더 생성
- 계정 정보 입력 안내 (이지어드민, 이지체인, 쿠팡)
- Docker 이미지 빌드 (처음에 5~10분 소요)
- 서버 컨테이너 자동 시작

### 계정 정보 입력 예시
```
이지어드민 URL (예: https://회사명.ezadmin.co.kr): https://ozkiz.ezadmin.co.kr
이지어드민 아이디: myid
이지어드민 비밀번호: (화면에 표시 안 됨)
...
```

### 설치 완료 확인
```
====================================
✅ 설치 완료!

서버 주소: http://시놀로지IP:3001
====================================
```

브라우저에서 `http://시놀로지IP:3001/api/status` 접속 → JSON 응답이 나오면 서버 정상 작동.

---

## 5단계: 앱에서 계정 설정 및 테스트

1. React 앱 열기 → **설정** 탭 → **자동화 설정** 섹션
2. 서버 주소가 `localhost:3001`이 아닌 경우 NAS IP로 변경 필요

   > 앱의 `src/pages/Dashboard.tsx` 상단 `SERVER_URL` 상수를 `http://시놀로지IP:3001` 으로 변경 후 재빌드

3. 각 사이트 카드에서:
   - URL, 아이디, 비밀번호 입력
   - 메뉴/버튼 텍스트 입력 (예: 다운로드 버튼에 쓰인 글자)
   - **연결 테스트** 버튼 → 사이트 스크린샷 확인
   - **서버에 저장** 버튼

4. 대시보드 → **지금 수집** 버튼으로 첫 번째 수동 실행
5. 데이터 수집 완료 후 **데이터 가져오기** 버튼으로 앱에 로드

---

## 컨테이너 관리 (Container Manager GUI)

DSM → Container Manager에서:
- 컨테이너 목록에서 `ozkiz-rt-server` 확인
- **시작/정지/재시작** 버튼으로 관리
- **로그** 탭에서 오류 내용 확인 가능

### SSH에서 관리
```bash
# 로그 확인
docker logs ozkiz-rt-server -f

# 재시작
docker compose -f ~/ozkiz-server/docker-compose.yml restart

# 정지
docker compose -f ~/ozkiz-server/docker-compose.yml down

# 업데이트 후 재빌드
cd ~/ozkiz-server
docker compose down
docker compose build
docker compose up -d
```

---

## 자동 실행 스케줄

기본 설정: **매일 오전 6시** 자동 수집

변경하려면 `~/.ozkiz-server/.env` 파일의 `CRON_SCHEDULE` 수정:
```
CRON_SCHEDULE=0 6 * * *        # 매일 오전 6시 (기본)
CRON_SCHEDULE=0 6,18 * * *     # 매일 오전 6시 + 오후 6시
CRON_SCHEDULE=0 9 * * 1-5      # 평일만 오전 9시
```
수정 후 컨테이너 재시작 필요.

---

## 문제 해결

| 증상 | 확인 사항 |
|------|-----------|
| 서버 응답 없음 | Container Manager에서 컨테이너 실행 중인지 확인 |
| 로그인 실패 | 설정 페이지에서 계정 정보 재확인 후 연결 테스트 |
| 스크래핑 실패 | `docker logs ozkiz-rt-server` 에서 오류 메시지 확인 |
| 포트 3001 접속 불가 | DSM → 방화벽 → 3001 포트 허용 규칙 추가 |
| 빌드 오류 (arm64) | 시놀로지 CPU 확인 - Intel/AMD x86-64만 지원 (Playwright 제한) |

### ARM CPU 시놀로지 (일부 저가형 모델)
Playwright 공식 이미지가 x86-64만 지원합니다.
ARM 모델(예: DS223j)에서는 별도 설정이 필요하니 문의주세요.

---

## API 엔드포인트 참고

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/status` | 서버 상태 및 마지막 수집 시각 |
| GET | `/api/data` | 최신 처리 데이터 전체 |
| POST | `/api/scrape` | 즉시 수집 실행 |
| GET | `/api/config` | 현재 설정 반환 (비밀번호 마스킹) |
| POST | `/api/config` | 설정 저장 |
| GET | `/api/test/:site` | 사이트 접속 테스트 + 스크린샷 |
