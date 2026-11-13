FROM node:26-alpine AS deps
WORKDIR /app

# only rebuild if deps change
COPY package.json package-lock.json* ./
RUN npm ci --include=optional

# dev env
FROM deps AS development
WORKDIR /app
# COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

FROM deps AS build
COPY . .
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginx:1.31-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
