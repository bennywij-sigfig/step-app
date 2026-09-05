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
        const thresholds = [.12, .3, .5, .7, .87].map(percentile =>
            values[Math.min(values.length - 1, Math.floor(values.length * percentile))] || 0
        );
        const heatLevel = value => {
            const band = thresholds.findIndex(threshold => value <= threshold);
            return band === -1 ? 6 : band + 1;
        };
        const header = `<div class="heatmap-head">SUBJECT</div>${data.race.dates.map(day => `<div class="heatmap-head">${Number(day.slice(-2))}</div>`).join('')}`;
        const rows = entities.map(entity => {
            const name = displayName(entity.name);
            const reportedDays = entity.days.filter(day => group === 'teams' ? day.reports > 0 : day.reported);
            const subjectAverage = reportedDays.length
                ? reportedDays.reduce((sum, day) => sum + day.steps, 0) / reportedDays.length
                : 0;
            const cells = entity.days.map((day, index) => {
                const reported = group === 'teams' ? day.reports > 0 : day.reported;
                const detail = group === 'teams'
                    ? `${number(day.steps)} steps · ${day.reports} reporter${day.reports === 1 ? '' : 's'}`
                    : reported ? `${number(day.steps)} steps` : 'No report';
                const difference = subjectAverage > 0 ? ((day.steps / subjectAverage) - 1) * 100 : 0;
                const note = !reported ? 'A hollow tile marks a missing report.'
                    : `${number(Math.abs(difference))}% ${difference >= 0 ? 'above' : 'below'} this row’s average day.`;
                return `<button type="button" class="heat-cell heat-${heatLevel(day.steps)} ${reported ? '' : 'missing'}" data-heat-name="${escapeHtml(name)}" data-heat-date="${date(data.race.dates[index])}" data-heat-detail="${detail}" data-heat-note="${note}" aria-label="${escapeHtml(name)}, ${date(data.race.dates[index])}: ${detail}. ${note}"></button>`;
            }).join('');
            return `<div class="heatmap-label" title="${escapeHtml(name)}">${escapeHtml(name)}</div>${cells}`;
        }).join('');
        byId('stepHeatmap').innerHTML = header + rows;
    }

    function prepareHeatmapTooltip() {
        const shell = byId('heatmapShell');
        const tooltip = byId('heatTooltip');
        let pinned = null;

        function position(clientX, clientY) {
            const margin = 12;
            const rect = tooltip.getBoundingClientRect();
            const left = Math.min(window.innerWidth - rect.width - margin, Math.max(margin, clientX + 14));
            const below = clientY + 14;
            const top = below + rect.height > window.innerHeight - margin
                ? Math.max(margin, clientY - rect.height - 14)
                : below;
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        }

        function show(cell, clientX, clientY) {
            tooltip.innerHTML = `<strong>${escapeHtml(cell.dataset.heatName)} · ${escapeHtml(cell.dataset.heatDate)}</strong><span>${escapeHtml(cell.dataset.heatDetail)}</span><small>${escapeHtml(cell.dataset.heatNote)}</small>`;
            tooltip.hidden = false;
            position(clientX, clientY);
        }

        function hide() {
            if (pinned) pinned.classList.remove('is-pinned');
            pinned = null;
            tooltip.hidden = true;
        }

        shell.addEventListener('pointerover', event => {
            const cell = event.target.closest('.heat-cell');
            if (!cell || pinned) return;
            show(cell, event.clientX, event.clientY);
        });
        shell.addEventListener('pointermove', event => {
            if (pinned || event.pointerType === 'touch' || tooltip.hidden) return;
            position(event.clientX, event.clientY);
        });
        shell.addEventListener('pointerout', event => {
            if (!pinned && event.target.closest('.heat-cell')) tooltip.hidden = true;
        });
        shell.addEventListener('focusin', event => {
            const cell = event.target.closest('.heat-cell');
            if (!cell) return;
            const rect = cell.getBoundingClientRect();
            show(cell, rect.left + rect.width / 2, rect.bottom);
        });
        shell.addEventListener('focusout', () => {
            if (!pinned) tooltip.hidden = true;
        });
        shell.addEventListener('click', event => {
            const cell = event.target.closest('.heat-cell');
            if (!cell) return;
            event.stopPropagation();
            if (pinned === cell) {
                hide();
                return;
            }
            if (pinned) pinned.classList.remove('is-pinned');
            pinned = cell;
            cell.classList.add('is-pinned');
            const rect = cell.getBoundingClientRect();
            show(cell, rect.left + rect.width / 2, rect.bottom);
        });
        document.addEventListener('click', hide);
        document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    }

    function rankAtDay(entities, dayIndex) {
        return [...entities].sort((left, right) =>
            right.days[dayIndex].cumulative_average - left.days[dayIndex].cumulative_average || String(left.name).localeCompare(String(right.name))
        );
    }

    function renderBumpChart(data, group = 'teams') {
        const all = [...data.race[group]];
        const byFinalAverage = (left, right) =>
            right.days.at(-1).cumulative_average - left.days.at(-1).cumulative_average || String(left.name).localeCompare(String(right.name));
        const selected = group === 'teams'
            ? [...all].sort(byFinalAverage)
            : [...all].sort(byFinalAverage).slice(0, 12);
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
            <title id="bumpSvgTitle">${group === 'teams' ? 'Team' : 'Individual'} cumulative daily-average rank changes</title>
            <desc id="bumpSvgDesc">Lines cross when competitors overtake one another in cumulative daily average steps.</desc>
            <g class="bump-grid">${dayGrid}${rankLabels}</g>${series}
            <text class="axis-label" x="470" y="613" text-anchor="middle">AUGUST 2025 · CHALLENGE DAY</text>`;
        byId('bumpLegend').innerHTML = selected.map((entry, index) => `<span style="--series-color:${palette[index % palette.length]}">${escapeHtml(displayName(entry.name))}</span>`).join('');
        requestAnimationFrame(() => byId('rankBumpChart').classList.add('is-revealed'));
    }

    function weightedStats(observations, reportingRate) {
        const weight = observations.reduce((sum, observation) => sum + observation.weight, 0);
        const mean = weight > 0
            ? observations.reduce((sum, observation) => sum + observation.value * observation.weight, 0) / weight
            : 0;
        const variance = weight > 0
            ? observations.reduce((sum, observation) => sum + observation.weight * (observation.value - mean) ** 2, 0) / weight
            : 0;
        const coefficient = mean > 0 ? Math.sqrt(variance) / mean : 0;
        return { mean, consistency: (100 / (1 + coefficient)) * reportingRate };
    }

    function statsForPerson(person) {
        const reports = person.days.filter(day => day.reported).map(day => ({ value: day.steps, weight: 1 }));
        return {
            kind: 'person',
            name: person.name,
            team: person.team,
            total: person.days.at(-1).cumulative,
            ...weightedStats(reports, reports.length / person.days.length)
        };
    }

    function statsForTeam(team) {
        const reports = team.days.filter(day => day.reports > 0).map(day => ({ value: day.average, weight: day.reports }));
        const final = team.days.at(-1);
        return {
            kind: 'team',
            name: team.name,
            team: team.name,
            total: final.cumulative,
            memberCount: team.member_count,
            ...weightedStats(reports, final.cumulative_reports / (team.member_count * team.days.length))
        };
    }

    function median(values) {
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }

    function renderConstellation(data, mode = 'people') {
        const people = data.race.people.map(statsForPerson);
        const teams = data.race.teams.map(statsForTeam);
        const points = mode === 'people' ? people : mode === 'teams' ? teams : [...teams, ...people];
        const maxMean = Math.max(...points.map(point => point.mean), 1) * 1.08;
        const maxPersonTotal = Math.max(...people.map(point => point.total), 1);
        const medianMean = median(points.map(point => point.mean));
        const medianConsistency = median(points.map(point => point.consistency));
        const plot = { left: 78, right: 1030, top: 45, bottom: 570 };
        const x = value => plot.left + (plot.right - plot.left) * value / maxMean;
        const y = value => plot.bottom - (plot.bottom - plot.top) * value / 100;
        const medianX = x(medianMean);
        const medianY = y(medianConsistency);
        const grid = Array.from({ length: 5 }, (_, index) => {
            const value = index * maxMean / 4;
            return `<line x1="${x(value)}" y1="${plot.top}" x2="${x(value)}" y2="${plot.bottom}"/><text x="${x(value)}" y="600" text-anchor="middle">${number(value / 1000)}k</text>`;
        }).join('') + [0, 25, 50, 75, 100].map(value => `<line x1="${plot.left}" y1="${y(value)}" x2="${plot.right}" y2="${y(value)}"/><text x="${plot.left - 13}" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join('');
        const quadrants = `
            <rect class="constellation-quadrant q-steady" x="${plot.left}" y="${plot.top}" width="${medianX - plot.left}" height="${medianY - plot.top}"/>
            <rect class="constellation-quadrant q-titans" x="${medianX}" y="${plot.top}" width="${plot.right - medianX}" height="${medianY - plot.top}"/>
            <rect class="constellation-quadrant q-chaos" x="${plot.left}" y="${medianY}" width="${medianX - plot.left}" height="${plot.bottom - medianY}"/>
            <rect class="constellation-quadrant q-comets" x="${medianX}" y="${medianY}" width="${plot.right - medianX}" height="${plot.bottom - medianY}"/>
            <text class="quadrant-label" x="${plot.left + 15}" y="${plot.top + 25}">STEADY PILGRIMS</text>
            <text class="quadrant-label" x="${medianX + 15}" y="${plot.top + 25}">RELENTLESS TITANS</text>
            <text class="quadrant-label" x="${plot.left + 15}" y="${medianY + 25}">CHAOS WALKERS</text>
            <text class="quadrant-label" x="${medianX + 15}" y="${medianY + 25}">WEEKEND COMETS</text>
            <line class="median-line" x1="${medianX}" y1="${plot.top}" x2="${medianX}" y2="${plot.bottom}"/>
            <line class="median-line" x1="${plot.left}" y1="${medianY}" x2="${plot.right}" y2="${medianY}"/>
            <text class="median-label" x="${medianX + 7}" y="${plot.bottom - 9}">P50 ${number(medianMean)} / DAY</text>
            <text class="median-label" x="${plot.right - 8}" y="${medianY - 8}" text-anchor="end">P50 CONSISTENCY ${number(medianConsistency)}</text>`;
        const marks = [...points].sort((left, right) => {
            if (left.kind !== right.kind) return left.kind === 'team' ? -1 : 1;
            return left.total - right.total;
        }).map((point, index) => {
            const name = displayName(point.name);
            const color = colorFor(point.team || point.name);
            const team = point.kind === 'team';
            const radius = team ? 22 + point.memberCount * 3 : 4 + Math.sqrt(point.total / maxPersonTotal) * 10;
            const detail = `${number(point.mean)} avg/day · ${number(point.consistency)} consistency · ${number(point.total)} total`;
            return `<g class="star-group ${team ? 'team-nebula' : 'person-star'}" tabindex="0" role="img" aria-label="${escapeHtml(name)}: ${number(point.mean)} average steps, ${number(point.consistency)} consistency score">
                <title>${escapeHtml(name)} · ${team ? `${point.memberCount} members` : escapeHtml(point.team || 'Independent')}\n${detail}</title>
                <circle class="star" style="--star-color:${color};--star-index:${index}" cx="${x(point.mean)}" cy="${y(point.consistency)}" r="${radius}"/>
                ${team ? `<text class="blob-label" x="${x(point.mean)}" y="${y(point.consistency) + 3}" text-anchor="middle">${escapeHtml(name)}</text>` : ''}
                <text class="star-label" x="${x(point.mean) + radius + 7}" y="${y(point.consistency) + 4}">${escapeHtml(name)}</text>
            </g>`;
        }).join('');
        const subject = mode === 'people' ? `${people.length} participants` : mode === 'teams' ? `${teams.length} teams` : `${people.length} participants and ${teams.length} teams`;
        byId('constellationChart').innerHTML = `
            <title id="constellationSvgTitle">Intensity and consistency for ${subject}</title>
            <desc id="constellationSvgDesc">Median lines create four labeled quadrants. Farther right is a higher weighted daily average, higher is more consistent, individual stars show people, and large translucent nebulae show teams.</desc>
            ${quadrants}<g class="constellation-grid">${grid}</g>${marks}
            <text class="axis-label" x="555" y="632" text-anchor="middle">AVERAGE STEPS PER REPORTED DAY →</text>
            <text class="axis-label" x="18" y="310" text-anchor="middle" transform="rotate(-90 18 310)">CONSISTENCY SCORE →</text>`;
    }

    function render(data) {
        const titles = ['The Foot Nebula', 'The Big Stepper', 'The Footy Way', 'The Pillars of Toes', 'The Calves of Creation', 'The Calf Constellation'];
        byId('constellationTitle').textContent = titles[Math.floor(Math.random() * titles.length)];
        renderHeatmap(data, 'teams');
        renderBumpChart(data, 'teams');
        renderConstellation(data, 'people');
        setToggle('[data-heatmap-group]', button => button.dataset.heatmapGroup, group => renderHeatmap(data, group));
        setToggle('[data-bump-group]', button => button.dataset.bumpGroup, group => renderBumpChart(data, group));
        setToggle('[data-constellation-group]', button => button.dataset.constellationGroup, group => renderConstellation(data, group));
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
    prepareHeatmapTooltip();
    load();
})();
