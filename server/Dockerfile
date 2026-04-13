# Playwright 공식 이미지 (Chromium + 모든 의존성 포함)
# x86-64 시놀로지 NAS 지원
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# 패키지 설치
COPY package*.json ./
RUN npm install

# 소스 복사
COPY . .

# 데이터/다운로드 폴더
RUN mkdir -p /app/data /app/downloads

EXPOSE 3001

CMD ["npx", "tsx", "src/index.ts"]
