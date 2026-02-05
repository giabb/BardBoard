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
