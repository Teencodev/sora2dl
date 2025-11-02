# DOCKERFILE - FFmpeg + Node.js
FROM node:18-alpine

# Cài FFmpeg
RUN apk add --no-cache ffmpeg

# Copy code
WORKDIR /app
COPY . .

# Cài dependencies
RUN npm install

# Khởi động
CMD ["node", "server.js"]
