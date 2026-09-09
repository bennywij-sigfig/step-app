(() => {
    'use strict';

    const PREFIX = 'stepLeaderboardRanks:v1';
    const transitions = new WeakMap();
    let tooltip = null;

    function supportsPreciseHover() {
        return window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true;
    }

    function ensureTooltip() {
        if (tooltip) return tooltip;
        tooltip = document.createElement('div');
        tooltip.className = 'rank-history-tooltip';
        tooltip.hidden = true;
        document.body.appendChild(tooltip);
        return tooltip;
    }

    function attachRankContext(row, rank) {
        if (!supportsPreciseHover() || typeof row.addEventListener !== 'function' || row.dataset.rankContextAttached === 'true') return;
        row.dataset.rankContextAttached = 'true';
        const tip = ensureTooltip();
        const show = () => {
            tip.textContent = rank.dataset.rankContext;
            tip.hidden = false;
            const rect = rank.getBoundingClientRect();
            const tipRect = tip.getBoundingClientRect();
            tip.style.left = `${Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, rect.left - 8))}px`;
            tip.style.top = `${Math.max(8, rect.top - tipRect.height - 8)}px`;
        };
        const hide = () => { tip.hidden = true; };
        row.addEventListener('pointerenter', show);
        row.addEventListener('pointerleave', hide);
        rank.addEventListener('focus', show);
        rank.addEventListener('blur', hide);
    }

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
            // This optional device-local enhancement must never block rankings.
        }
    }

    function setPreviousState(transition) {
        const ordered = [...transition.records].sort((left, right) =>
            left.previousRank - right.previousRank || left.rank - right.rank
        );
        ordered.forEach(record => {
            transition.section.appendChild(record.row);
            record.rankNode.textContent = `#${record.previousRank}`;
            record.rankNode.classList.remove('rank-improved', 'rank-declined');
        });
        transition.container.classList?.add('rank-history-previous');
    }

    function setCurrentState(transition, animate) {
        const previousPositions = new Map(transition.records.map(record => [
            record.key,
            record.row.getBoundingClientRect()
        ]));
        const ordered = [...transition.records].sort((left, right) => left.rank - right.rank);
        ordered.forEach(record => {
            transition.section.appendChild(record.row);
            record.rankNode.textContent = `#${record.rank}`;
            if (record.changed) {
                record.rankNode.classList.add(record.improved ? 'rank-improved' : 'rank-declined');
            }
        });
        transition.container.classList?.remove('rank-history-previous');
        if (!animate) return;

        ordered.filter(record => record.changed).forEach((record, index) => {
            const previous = previousPositions.get(record.key);
            const current = record.row.getBoundingClientRect();
            const deltaY = previous.top - current.top;
            const delay = Math.min(index * 100, 500);
            if (typeof record.row.animate === 'function') {
                record.row.animate([
                    { opacity: .55, filter: 'brightness(1.45)', transform: `translateY(${deltaY}px) perspective(700px) rotateX(-62deg) scale(.98)` },
                    { opacity: 1, filter: 'brightness(1.12)', transform: 'translateY(0) perspective(700px) rotateX(7deg) scale(1.01)', offset: .7 },
                    { opacity: 1, filter: 'none', transform: 'translateY(0) perspective(700px) rotateX(0) scale(1)' }
                ], { duration: 900, delay, easing: 'linear' });
            } else {
                record.row.style.setProperty('--rank-change-delay', `${delay}ms`);
                record.row.style.setProperty('--rank-previous-y', `${deltaY}px`);
                record.row.classList.remove('rank-change-animate');
                void record.row.offsetWidth;
                record.row.classList.add('rank-change-animate');
            }
        });
    }

    function playTransition(transition, { hold = 550 } = {}) {
        if (transition.timer) window.clearTimeout(transition.timer);
        const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        setPreviousState(transition);
        if (reduceMotion) {
            setCurrentState(transition, false);
            return;
        }
        transition.timer = window.setTimeout(() => {
            transition.timer = null;
            setCurrentState(transition, true);
        }, hold);
    }

    function playWhenVisible(transition) {
        const play = () => playTransition(transition);
        if (!('IntersectionObserver' in window)) {
            play();
            return;
        }
        const observer = new IntersectionObserver(entries => {
            if (!entries.some(entry => entry.isIntersecting)) return;
            observer.disconnect();
            play();
        }, { threshold: .12 });
        observer.observe(transition.container);
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
        const records = normalized.map(entry => {
            const row = rows.get(entry.key);
            const rankNode = row?.querySelector('.rank');
            const storedRank = Number(previous.ranks[entry.key]);
            if (!row || !rankNode) return null;
            const previousRank = Number.isInteger(storedRank) ? storedRank : entry.rank;
            const changed = previousRank !== entry.rank;
            const improved = entry.rank < previousRank;
            if (changed) {
                const direction = improved ? 'improved' : 'declined';
                rankNode.setAttribute('aria-label', `Rank ${entry.rank}, ${direction} from rank ${previousRank}`);
                row.classList.add('rank-changed');
                if (supportsPreciseHover()) {
                    rankNode.setAttribute('data-rank-context', `Previously #${previousRank} · ${direction}`);
                    rankNode.setAttribute('tabindex', '0');
                    rankNode.title = `Previously #${previousRank}`;
                    attachRankContext(row, rankNode);
                }
            }
            return { ...entry, row, rankNode, previousRank, changed, improved };
        }).filter(Boolean);
        const changed = records.filter(record => record.changed);
        if (!changed.length) return [];

        const transition = {
            container,
            section: records[0].row.parentElement,
            records,
            timer: null
        };
        transitions.set(container, transition);
        setPreviousState(transition);
        playWhenVisible(transition);
        return changed.map(record => ({
            key: record.key,
            previousRank: record.previousRank,
            rank: record.rank,
            direction: record.improved ? 'up' : 'down'
        }));
    }

    function replay(container) {
        const transition = transitions.get(container);
        if (!transition) return false;
        playTransition(transition, { hold: 700 });
        return true;
    }

    window.LeaderboardRankHistory = { apply, replay, storageKey, readSnapshot };
})();
