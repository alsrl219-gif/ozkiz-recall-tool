#!/bin/bash
# OZKIZ RT 서버 - 시놀로지 NAS 자동 설치 스크립트
# 사용법: bash setup-synology.sh

set -e

echo ""
echo "======================================"
echo "  OZKIZ 재고회수툴 서버 설치"
echo "======================================"
echo ""

# ── Docker 설치 확인 ────────────────────────────────────────────
if ! command -v docker &> /dev/null; then
  echo "❌ Docker가 없습니다."
  echo "   시놀로지 패키지 센터 → 'Container Manager' 설치 후 다시 실행해주세요."
  exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null 2>&1; then
  echo "❌ docker-compose가 없습니다. Container Manager를 설치해주세요."
  exit 1
fi

echo "✅ Docker 확인 완료"
echo ""

# ── 프로젝트 폴더 생성 ──────────────────────────────────────────
INSTALL_DIR="$HOME/ozkiz-server"
mkdir -p "$INSTALL_DIR/data" "$INSTALL_DIR/downloads"
cd "$INSTALL_DIR"

echo "📁 설치 폴더: $INSTALL_DIR"
echo ""

# ── .env 파일 생성 (계정 입력) ──────────────────────────────────
if [ ! -f .env ]; then
  echo "🔐 계정 정보를 입력해주세요 (입력 내용은 화면에 표시되지 않습니다)"
  echo ""

  read -p "이지어드민 URL (예: https://회사명.ezadmin.co.kr): " EZADMIN_URL
  read -p "이지어드민 아이디: " EZADMIN_ID
  read -s -p "이지어드민 비밀번호: " EZADMIN_PW; echo ""
  echo ""

  read -p "이지체인 URL (예: https://회사명.ezchain.co.kr): " EZCHAIN_URL
  read -p "이지체인 아이디: " EZCHAIN_ID
  read -s -p "이지체인 비밀번호: " EZCHAIN_PW; echo ""
  echo ""

  read -p "쿠팡 Wing 아이디: " COUPANG_ID
  read -s -p "쿠팡 Wing 비밀번호: " COUPANG_PW; echo ""
  echo ""

  cat > .env << EOF
EZADMIN_URL=$EZADMIN_URL
EZADMIN_ID=$EZADMIN_ID
EZADMIN_PW=$EZADMIN_PW

EZCHAIN_URL=$EZCHAIN_URL
EZCHAIN_ID=$EZCHAIN_ID
EZCHAIN_PW=$EZCHAIN_PW

COUPANG_ID=$COUPANG_ID
COUPANG_PW=$COUPANG_PW

ANALYSIS_PERIOD_DAYS=30
CRON_SCHEDULE=0 6 * * *
PORT=3001
DOWNLOAD_DIR=./downloads
DATA_OUTPUT=./data/latest.json
HEADLESS=true
EOF

  echo "✅ .env 파일 생성 완료"
else
  echo "ℹ️  기존 .env 파일 사용"
fi
echo ""

# ── config.json 초기화 ──────────────────────────────────────────
if [ ! -f config.json ]; then
  echo '{}' > config.json
fi

# ── docker-compose.yml 다운로드 (서버 폴더에서 복사) ─────────────
# (이미 같은 폴더에 있는 경우 스킵)
if [ ! -f docker-compose.yml ]; then
  echo "❌ docker-compose.yml 파일이 없습니다."
  echo "   server 폴더 전체를 NAS에 복사한 후 다시 실행해주세요."
  exit 1
fi

# ── Docker 이미지 빌드 + 실행 ────────────────────────────────────
echo "🐳 Docker 이미지 빌드 중 (처음 실행 시 5~10분 소요)..."
docker compose build

echo ""
echo "🚀 서버 시작 중..."
docker compose up -d

echo ""
echo "======================================"
echo "✅ 설치 완료!"
echo ""
echo "서버 주소: http://시놀로지IP:3001"
echo ""
echo "다음 단계:"
echo "  1. 앱(http://시놀로지IP:5173)을 열고"
echo "  2. [설정] → [자동화 설정]에서 연결 테스트"
echo "  3. 대시보드에서 '지금 수집' 버튼으로 첫 실행"
echo "======================================"
echo ""
