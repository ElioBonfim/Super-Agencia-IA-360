FROM mcr.microsoft.com/playwright:v1.58.2-jammy

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application code
COPY . .

# Build the Next.js application
RUN npm run build

# Expose the port Railway uses (defaults to 3000 but Railway injects PORT)
EXPOSE 3000

# Start the application using npm start which boots both Next.js and the worker
CMD ["npm", "start"]
