(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const palette = ['#70e5ff', '#c8ff62', '#ff735c', '#b78aff', '#ffd166', '#65e3a5', '#ff8fcb', '#7ca8ff', '#f2a65a', '#a8dadc', '#e98d8d', '#d8b4fe'];
    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    const number = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: digits, maximumFractionDigits: digits
    });
    const displayName = value => {
        const name = String(value || 'Unknown');
        if (!/^[a-z]+(?:[._-][a-z]+)+$/.test(name)) return name;
        return name.split(/[._-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    };
    const date = value => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', timeZone: 'UTC'
    });
    const colorFor = value => {
        const hash = [...String(value)].reduce((sum, character) => sum + character.charCodeAt(0), 0);
        return palette[hash % palette.length];
    };

    function setToggle(selector, value, render) {
        document.querySelectorAll(selector).forEach(button => {
            button.addEventListener('click', () => {
                const selected = value(button);
                document.querySelectorAll(selector).forEach(peer => {
                    const active = value(peer) === selected;
                    peer.classList.toggle('active', active);
                    peer.setAttribute('aria-pressed', String(active));
                });
                render(selected);
            });
        });
    }

    function renderHeatmap(data, group = 'teams') {
        const entities = [...data.race[group]].sort((left, right) =>
            right.days.at(-1).cumulative - left.days.at(-1).cumulative || String(left.name).localeCompare(String(right.name))
        );
        const values = entities.flatMap(entity => entity.days.map(day => day.steps)).filter(Boolean).sort((a, b) => a - b);
        const cap = values[Math.floor(values.length * .96)] || 1;
        const header = `<div class="heatmap-head">SUBJECT</div>${data.race.dates.map(day => `<div class="heatmap-head">${Number(day.slice(-2))}</div>`).join('')}`;
        const rows = entities.map(entity => {
            const name = displayName(entity.name);
            const color = colorFor(group === 'teams' ? entity.name : entity.team || entity.name);
            const cells = entity.days.map((day, index) => {
                const reported = group === 'teams' ? day.reports > 0 : day.reported;
                const heat = `${Math.round(Math.sqrt(Math.min(1, day.steps / cap)) * 88)}%`;
                const detail = group === 'teams'
                    ? `${number(day.steps)} steps · ${day.reports} reporter${day.reports === 1 ? '' : 's'}`
                    : reported ? `${number(day.steps)} steps` : 'No report';
                return `<button type="button" class="heat-cell ${reported ? '' : 'missing'}" style="--heat:${heat};--cell-color:${color}" aria-label="${escapeHtml(name)}, ${date(data.race.dates[index])}: ${detail}" title="${escapeHtml(name)} · ${date(data.race.dates[index])}\n${detail}"></button>`;
            }).join('');
            return `<div class="heatmap-label" title="${escapeHtml(name)}">${escapeHtml(name)}</div>${cells}`;
        }).join('');
        byId('stepHeatmap').innerHTML = header + rows;
    }

    function rankAtDay(entities, dayIndex) {
        return [...entities].sort((left, right) =>
            right.days[dayIndex].cumulative - left.days[dayIndex].cumulative || String(left.name).localeCompare(String(right.name))
        );
    }

    function renderBumpChart(data, group = 'teams') {
        const all = [...data.race[group]];
        const selected = group === 'teams'
            ? [...all].sort((a, b) => b.days.at(-1).cumulative - a.days.at(-1).cumulative)
            : [...all].sort((a, b) => b.days.at(-1).cumulative - a.days.at(-1).cumulative).slice(0, 12);
        const ranks = data.race.dates.map((_, dayIndex) => new Map(
            rankAtDay(all, dayIndex).map((entry, index) => [entry, index + 1])
        ));
        const maximumRank = all.length;
        const plot = { left: 68, right: 870, top: 42, bottom: 555 };
        const x = day => plot.left + (plot.right - plot.left) * day / (data.race.dates.length - 1);
        const y = rank => plot.top + (plot.bottom - plot.top) * (rank - 1) / Math.max(1, maximumRank - 1);
        const dayGrid = data.race.dates.map((day, index) => `
            <line x1="${x(index)}" y1="${plot.top}" x2="${x(index)}" y2="${plot.bottom}"/>
            <text x="${x(index)}" y="588" text-anchor="middle">${Number(day.slice(-2))}</text>`).join('');
        const rankLabels = [...new Set([1, Math.ceil(maximumRank / 2), maximumRank])].map(rank => `
            <line x1="${plot.left}" y1="${y(rank)}" x2="${plot.right}" y2="${y(rank)}"/>
            <text x="${plot.left - 14}" y="${y(rank) + 4}" text-anchor="end">#${rank}</text>`).join('');
        const series = selected.map((entry, index) => {
            const color = palette[index % palette.length];
            const points = data.race.dates.map((_, day) => `${x(day)},${y(ranks[day].get(entry))}`).join(' ');
            const finalRank = ranks.at(-1).get(entry);
            const name = displayName(entry.name);
            return `<g class="bump-series" tabindex="0" role="img" aria-label="${escapeHtml(name)}, finished rank ${finalRank}" style="--series-color:${color};--series-index:${index}">
                <title>${escapeHtml(name)} · finished #${finalRank}</title>
                <polyline class="bump-line" pathLength="1" points="${points}"/>
                <polyline class="bump-hit" points="${points}"/>
                <circle cx="${x(14)}" cy="${y(finalRank)}" r="5" fill="${color}"/>
                <text class="bump-end-label" x="${plot.right + 13}" y="${y(finalRank) + 4}">${escapeHtml(name)}</text>
            </g>`;
        }).join('');
        byId('rankBumpChart').innerHTML = `
            <title id="bumpSvgTitle">${group === 'teams' ? 'Team' : 'Individual'} cumulative rank changes by day</title>
            <desc id="bumpSvgDesc">Lines cross when competitors overtake one another in cumulative steps.</desc>
            <g class="bump-grid">${dayGrid}${rankLabels}</g>${series}
            <text class="axis-label" x="470" y="613" text-anchor="middle">AUGUST 2025 · CHALLENGE DAY</text>`;
        byId('bumpLegend').innerHTML = selected.map((entry, index) => `<span style="--series-color:${palette[index % palette.length]}">${escapeHtml(displayName(entry.name))}</span>`).join('');
        requestAnimationFrame(() => byId('rankBumpChart').classList.add('is-revealed'));
    }

    function statsForPerson(person) {
        const reports = person.days.filter(day => day.reported).map(day => day.steps);
        const mean = reports.length ? reports.reduce((sum, value) => sum + value, 0) / reports.length : 0;
        const variance = reports.length ? reports.reduce((sum, value) => sum + (value - mean) ** 2, 0) / reports.length : 0;
        const coefficient = mean > 0 ? Math.sqrt(variance) / mean : 0;
        return {
            person,
            mean,
            total: person.days.at(-1).cumulative,
            consistency: (100 / (1 + coefficient)) * (reports.length / person.days.length)
        };
    }

    function renderConstellation(data) {
        const points = data.race.people.map(statsForPerson);
        const maxMean = Math.max(...points.map(point => point.mean), 1) * 1.08;
        const maxTotal = Math.max(...points.map(point => point.total), 1);
        const plot = { left: 78, right: 1030, top: 45, bottom: 570 };
        const x = value => plot.left + (plot.right - plot.left) * value / maxMean;
        const y = value => plot.bottom - (plot.bottom - plot.top) * value / 100;
        const grid = Array.from({ length: 5 }, (_, index) => {
            const value = index * maxMean / 4;
            return `<line x1="${x(value)}" y1="${plot.top}" x2="${x(value)}" y2="${plot.bottom}"/><text x="${x(value)}" y="600" text-anchor="middle">${number(value / 1000)}k</text>`;
        }).join('') + [0, 25, 50, 75, 100].map(value => `<line x1="${plot.left}" y1="${y(value)}" x2="${plot.right}" y2="${y(value)}"/><text x="${plot.left - 13}" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join('');
        const stars = points.sort((a, b) => a.total - b.total).map((point, index) => {
            const name = displayName(point.person.name);
            const color = colorFor(point.person.team || point.person.name);
            const radius = 5 + Math.sqrt(point.total / maxTotal) * 13;
            return `<g class="star-group" tabindex="0" role="img" aria-label="${escapeHtml(name)}: ${number(point.mean)} average steps, ${number(point.consistency)} consistency score">
                <title>${escapeHtml(name)} · ${escapeHtml(point.person.team || 'Independent')}\n${number(point.mean)} avg/day · ${number(point.consistency)} consistency · ${number(point.total)} total</title>
                <circle class="star" style="--star-color:${color};--star-index:${index}" cx="${x(point.mean)}" cy="${y(point.consistency)}" r="${radius}"/>
                <text class="star-label" x="${x(point.mean) + radius + 7}" y="${y(point.consistency) + 4}">${escapeHtml(name)}</text>
            </g>`;
        }).join('');
        byId('constellationChart').innerHTML = `
            <title id="constellationSvgTitle">Intensity and consistency for all ${points.length} participants</title>
            <desc id="constellationSvgDesc">Farther right is a higher daily average, higher is more consistent, and larger circles indicate more total steps.</desc>
            <rect class="constellation-quadrant" x="${plot.left}" y="${plot.top}" width="${(plot.right - plot.left) / 2}" height="${(plot.bottom - plot.top) / 2}"/>
            <rect class="constellation-quadrant" x="${(plot.left + plot.right) / 2}" y="${plot.top}" width="${(plot.right - plot.left) / 2}" height="${(plot.bottom - plot.top) / 2}"/>
            <rect class="constellation-quadrant" x="${plot.left}" y="${(plot.top + plot.bottom) / 2}" width="${(plot.right - plot.left) / 2}" height="${(plot.bottom - plot.top) / 2}"/>
            <rect class="constellation-quadrant" x="${(plot.left + plot.right) / 2}" y="${(plot.top + plot.bottom) / 2}" width="${(plot.right - plot.left) / 2}" height="${(plot.bottom - plot.top) / 2}"/>
            <g class="constellation-grid">${grid}</g>${stars}
            <text class="axis-label" x="555" y="632" text-anchor="middle">AVERAGE STEPS PER REPORTED DAY →</text>
            <text class="axis-label" x="18" y="310" text-anchor="middle" transform="rotate(-90 18 310)">CONSISTENCY SCORE →</text>`;
    }

    function render(data) {
        renderHeatmap(data, 'teams');
        renderBumpChart(data, 'teams');
        renderConstellation(data);
        setToggle('[data-heatmap-group]', button => button.dataset.heatmapGroup, group => renderHeatmap(data, group));
        setToggle('[data-bump-group]', button => button.dataset.bumpGroup, group => renderBumpChart(data, group));
        byId('analyticsLoading').hidden = true;
        byId('analyticsError').hidden = true;
        byId('analyticsExperience').hidden = false;
    }

    async function load() {
        byId('analyticsLoading').hidden = false;
        byId('analyticsError').hidden = true;
        try {
            const response = await fetch('/api/champions', { headers: { Accept: 'application/json' } });
            if (response.status === 401) {
                window.location.href = '/';
                return;
            }
            if (!response.ok) throw new Error(`Analytics request failed: ${response.status}`);
            render(await response.json());
        } catch (error) {
            console.error('The Department has experienced a spreadsheet incident:', error);
            byId('analyticsLoading').hidden = true;
            byId('analyticsExperience').hidden = true;
            byId('analyticsError').hidden = false;
        }
    }

    byId('retryAnalytics').addEventListener('click', load);
    load();
})();
