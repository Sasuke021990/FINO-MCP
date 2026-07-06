FROM mcr.microsoft.com/playwright:v1.61.1-jammy

# Install build dependencies for native modules (e.g. better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install
RUN npm rebuild better-sqlite3 --build-from-source

# Copy source code
COPY . .

# Build the TypeScript project
RUN npm run build

# Create screenshots directory
RUN mkdir -p /app/screenshots && chmod 777 /app/screenshots

# Expose the HTTP static server port
EXPOSE 8888

# Standard MCP port is stdio, so we just run the built file
CMD ["node", "build/index.js"]
