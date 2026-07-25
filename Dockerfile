FROM oven/bun:latest

COPY package.json ./
COPY bun.lockb ./
COPY src ./

RUN bun install

CMD ["bun", "src/index.ts"]