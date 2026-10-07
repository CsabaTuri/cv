FROM node:20-alpine

# Build időben átadott környezeti változó definiálása
ARG NEXT_PUBLIC_CRISP_WEBSITE_ID
ENV NEXT_PUBLIC_CRISP_WEBSITE_ID=$NEXT_PUBLIC_CRISP_WEBSITE_ID

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["npm", "start"]