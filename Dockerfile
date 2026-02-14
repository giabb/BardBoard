# BardBoard - A DiscordJS bot soundboard
# Copyright (C) 2024  Giovanbattista Abbate
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

FROM node:24-alpine AS deps

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libsodium-dev

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci

FROM node:24-alpine AS build

WORKDIR /usr/src/app
ENV NEXT_TELEMETRY_DISABLED=1
ARG BACKEND_URL=http://localhost:3001
ENV BACKEND_URL=$BACKEND_URL

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY package*.json ./
COPY app/ ./app/
COPY next.config.js ./
COPY public/ ./public/

RUN npm run build

FROM node:24-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /usr/src/app/.next ./.next
COPY --from=build /usr/src/app/next.config.js ./next.config.js
COPY --from=build /usr/src/app/public ./public
COPY server/ ./server/

CMD ["node", "server/app.js"]

