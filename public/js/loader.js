/**
  BardBoard - A DiscordJS bot soundboard
  Copyright (C) 2024 Giovanbattista Abbate

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/
export function showLoader() {
    const loaderEl = document.getElementById('appLoader');
    if (!loaderEl) return;
    const msgEl = document.getElementById('loaderMessage');
    if (msgEl) {
        const messages = [
            'Rolling initiative...',
            'Sharpening your lute strings...',
            'Summoning the tavern playlist...',
            'Polishing the bardic armor...',
            'Feeding the mimic jukebox...',
            'Consulting the dungeon DJ...',
            'Refilling the potion of volume...',
            'Taming the dragon speakers...',
            'Warming up the dice of destiny...',
            'Checking the spellbook of tracks...'
        ];
        msgEl.textContent = messages[Math.floor(Math.random() * messages.length)];
    }
    document.body.classList.remove('ready');
    loaderEl.classList.remove('loaded');
}

export function hideLoader() {
    const loaderEl = document.getElementById('appLoader');
    if (!loaderEl) return;
    document.body.classList.add('ready');
    loaderEl.classList.add('loaded');
}
