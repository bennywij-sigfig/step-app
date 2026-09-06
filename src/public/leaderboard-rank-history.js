(() => {
    'use strict';

    const PREFIX = 'stepLeaderboardRanks:v1';

    function storageKey(kind, viewerId) {
        return `${PREFIX}:${String(viewerId || 'anonymous')}:${kind}`;
    }

    function readSnapshot(storage, key) {
        try {
            const parsed = JSON.parse(storage.getItem(key));
            return parsed && parsed.version === 1 && parsed.ranks && typeof parsed.ranks === 'object'
                ? parsed
                : null;
        } catch (_error) {
            return null;
        }
    }

    function writeSnapshot(storage, key, scope, entries) {
        try {
            storage.setItem(key, JSON.stringify({
                version: 1,
                scope: String(scope),
                saved_at: Date.now(),
                ranks: Object.fromEntries(entries.map(entry => [String(entry.key), Number(entry.rank)]))
            }));
        } catch (_error) {
            // Ranking history is an optional device-local enhancement. Storage
            // limits or privacy mode must never prevent the leaderboard loading.
        }
    }

    function animateWhenVisible(container, changedRows, reduceMotion) {
        if (!changedRows.length || reduceMotion) return;
        const play = () => changedRows.forEach((row, index) => {
            row.style.setProperty('--rank-change-delay', `${Math.min(index * 45, 360)}ms`);
            row.classList.add('rank-change-animate');
        });
        if (!('IntersectionObserver' in window)) {
            play();
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            play();
        }, { threshold: .12 });
        observer.observe(container);
    }

    function apply({ container, kind, scope, viewerId, entries, storage = window.localStorage }) {
        if (!container || !scope || !Array.isArray(entries)) return [];
        const normalized = entries
            .map((entry, index) => ({ key: String(entry.key), rank: Number(entry.rank || index + 1) }))
            .filter(entry => entry.key && Number.isInteger(entry.rank) && entry.rank > 0);
        const key = storageKey(kind, viewerId);
        const previous = readSnapshot(storage, key);
        writeSnapshot(storage, key, scope, normalized);
        if (!previous || previous.scope !== String(scope)) return [];

        const rows = new Map([...container.querySelectorAll('[data-rank-key]')].map(row => [row.dataset.rankKey, row]));
        const changes = [];
        normalized.forEach(entry => {
            const previousRank = Number(previous.ranks[entry.key]);
            if (!Number.isInteger(previousRank) || previousRank === entry.rank) return;
            const row = rows.get(entry.key);
            const rank = row?.querySelector('.rank');
            if (!row || !rank) return;
            const improved = entry.rank < previousRank;
            rank.classList.add(improved ? 'rank-improved' : 'rank-declined');
            rank.setAttribute('aria-label', `Rank ${entry.rank}, ${improved ? 'improved' : 'declined'} from rank ${previousRank}`);
            rank.title = `Previously #${previousRank}`;
            row.classList.add('rank-changed');
            changes.push({ key: entry.key, previousRank, rank: entry.rank, direction: improved ? 'up' : 'down', row });
        });
        animateWhenVisible(
            container,
            changes.map(change => change.row),
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        );
        return changes.map(({ row, ...change }) => change);
    }

    window.LeaderboardRankHistory = { apply, storageKey, readSnapshot };
})();
