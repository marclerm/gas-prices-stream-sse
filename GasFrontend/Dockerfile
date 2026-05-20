FROM node:20-alpine AS build
WORKDIR /src

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build -- --configuration=production

FROM nginx:1.27-alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /src/dist/GasFrontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
