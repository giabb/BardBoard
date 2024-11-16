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

FROM node:22-alpine

RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    libsodium-dev \
    ffmpeg

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci

COPY BardBoard.js ./

# Uncomment these 2 lines if ext volumes not needed
#COPY public/ ./public/
#COPY audio-files/ ./audio-files/

CMD ["node", "BardBoard.js"]