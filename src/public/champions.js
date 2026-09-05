(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const number = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    });
    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const displayName = value => {
        const name = String(value || 'Unknown');
        if (!/^[a-z]+(?:[._-][a-z]+)+$/.test(name)) return name;
        return name.split(/[._-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    };
    const date = value => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', timeZone: 'UTC'
    });
    const ordinal = rank => ({ 1: 'Champion', 2: 'Runner-up', 3: 'Third place' }[rank] || `#${rank}`);
    const medal = rank => ({ 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ' }[rank] || rank);
    // September 15 remains a full challenge day. In 2026 Pacific daylight
    // time is UTC-07:00, so this instant is midnight beginning September 16.
    const CHALLENGE_2026_CLOSE = Date.parse('2026-09-16T00:00:00-07:00');

    function updateChallengeCountdown() {
        const remaining = Math.max(0, CHALLENGE_2026_CLOSE - Date.now());
        const totalSeconds = Math.floor(remaining / 1000);
        const values = {
            countdownDays: Math.floor(totalSeconds / 86400),
            countdownHours: Math.floor((totalSeconds % 86400) / 3600),
            countdownMinutes: Math.floor((totalSeconds % 3600) / 60),
            countdownSeconds: totalSeconds % 60
        };
        Object.entries(values).forEach(([id, value]) => {
            byId(id).textContent = String(value).padStart(2, '0');
        });
        byId('countdownTimer').setAttribute(
            'aria-label',
            `${values.countdownDays} days, ${values.countdownHours} hours, ${values.countdownMinutes} minutes, and ${values.countdownSeconds} seconds remaining in the 2026 step challenge`
        );

        if (remaining === 0) {
            byId('challengeCountdown').classList.add('is-complete');
            byId('countdownKicker').textContent = 'THE HOUR IS WRITTEN';
            byId('countdownTitle').textContent = 'Every step has been counted';
            byId('countdownDecree').textContent = 'The 2026 challenge has crossed into legend. Let the counting cease and the tablets awaken.';
            return false;
        }
        return true;
    }

    function startChallengeCountdown() {
        if (!updateChallengeCountdown()) return;
        const timer = window.setInterval(() => {
            if (!updateChallengeCountdown()) window.clearInterval(timer);
        }, 1000);
    }

    function prepareJourneyAnimation(routePercent) {
        const globe = byId('routeGraphic');
        const canvas = byId('journeyGlobeCanvas');
        const linearRoute = byId('routeLinear');
        const linearMarker = byId('routeLinearMarker');
        const onwardFraction = routePercent / 100;
        let firstLegShare = 0.5;
        let linearWaypoints = null;
        let linearOnwardEndpoint = null;
        let lastProgress = 0;
        let started = false;

        function measureLinearWaypoints() {
            const routeRect = linearRoute.getBoundingClientRect();
            linearWaypoints = [...linearRoute.querySelectorAll('.city-dot')].map(dot => {
                const rect = dot.getBoundingClientRect();
                return {
                    x: rect.left + rect.width / 2 - routeRect.left,
                    y: rect.top + rect.height / 2 - routeRect.top
                };
            });
            const onwardLeg = linearRoute.querySelector('.route-leg.onward').getBoundingClientRect();
            const isVertical = onwardLeg.height > onwardLeg.width;
            linearOnwardEndpoint = {
                x: (isVertical ? onwardLeg.left + onwardLeg.width / 2 : onwardLeg.left + onwardLeg.width * onwardFraction) - routeRect.left,
                y: (isVertical ? onwardLeg.top + onwardLeg.height * onwardFraction : onwardLeg.top + onwardLeg.height / 2) - routeRect.top
            };
        }

        function paintLinearRoute(progress, measuredFirstLegShare = firstLegShare) {
            firstLegShare = measuredFirstLegShare;
            lastProgress = progress;
            if (!linearWaypoints || linearWaypoints.length !== 3) measureLinearWaypoints();
            const [delhi, singapore] = linearWaypoints;
            const finalPoint = linearOnwardEndpoint;
            const onFirstLeg = progress <= firstLegShare;
            const start = onFirstLeg ? delhi : singapore;
            const end = onFirstLeg ? singapore : finalPoint;
            const segmentProgress = onFirstLeg
                ? progress / firstLegShare
                : (progress - firstLegShare) / (1 - firstLegShare);
            linearMarker.style.left = `${start.x + (end.x - start.x) * segmentProgress}px`;
            linearMarker.style.top = `${start.y + (end.y - start.y) * segmentProgress}px`;
            const onwardProgress = onFirstLeg ? 0 : segmentProgress * routePercent;
            linearRoute.style.setProperty('--route-progress', `${onwardProgress}%`);
        }

        const renderer = window.PantheonGlobe?.create({
            container: globe,
            canvas,
            landRings: window.PANTHEON_LAND_RINGS,
            onwardFraction,
            onProgress: paintLinearRoute
        });
        if (renderer) firstLegShare = renderer.firstLegShare;

        function paint(progress) {
            if (renderer) {
                renderer.setProgress(progress);
            } else {
                paintLinearRoute(progress);
            }
        }

        function play() {
            if (started) return;
            started = true;
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                paint(1);
                return;
            }
            const startedAt = performance.now() + 700;
            const duration = 4200;
            let lastPaintAt = 0;
            const frame = now => {
                if (now < startedAt) {
                    requestAnimationFrame(frame);
                    return;
                }
                const progress = Math.min(1, (now - startedAt) / duration);
                // Thirty frames per second is ample for this small globe and
                // avoids repeatedly projecting 5,000+ coastline points on mobile.
                if (progress === 1 || now - lastPaintAt >= 32) {
                    lastPaintAt = now;
                    paint(progress);
                }
                if (progress < 1) requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        }

        paint(0);
        window.addEventListener('resize', () => {
            linearWaypoints = null;
            paintLinearRoute(lastProgress);
        }, { passive: true });
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(entries => {
                if (!entries.some(entry => entry.isIntersecting)) return;
                observer.disconnect();
                play();
            }, { threshold: 0.28 });
            observer.observe(globe);
        } else {
            play();
        }
    }

    function memberTiles(members) {
        return members.map(member => `
            <div class="member-tile">
                <strong>${escapeHtml(displayName(member.name))}</strong>
                <span>${number(member.total_steps)} total</span>
                <span>${number(member.average_steps)} / day · ${member.days_reported} day${member.days_reported === 1 ? '' : 's'}</span>
            </div>
        `).join('');
    }

    function renderTeamPodium(teams) {
        byId('teamPodium').innerHTML = teams.map((team, index) => `
            <details class="team-podium-card" ${index === 0 ? 'open' : ''}>
                <summary>
                    <span class="place-medal">${medal(team.rank)}</span>
                    <span class="podium-name">${escapeHtml(team.name)}</span>
                    <span class="metric"><strong>${number(team.average_steps)}</strong>avg / member-day</span>
                    <span class="metric"><strong>${number(team.total_steps)}</strong>total steps</span>
                    <span class="metric"><strong>${number(team.reporting_rate, team.reporting_rate % 1 ? 1 : 0)}%</strong>reporting</span>
                </summary>
                <div class="members-grid">${memberTiles(team.members)}</div>
            </details>
        `).join('');
    }

    function renderIndividualPodium(individuals) {
        const highestTotal = Math.max(...individuals.map(person => person.total_steps), 1);
        byId('individualPodium').innerHTML = individuals.map(person => {
            const podiumHeight = Math.max(190, Math.round(330 * person.total_steps / highestTotal));
            return `
            <article class="individual-podium-card" style="--podium-height: ${podiumHeight}px">
                <span class="place-medal">${medal(person.rank)} · ${ordinal(person.rank)}</span>
                <h3>${escapeHtml(displayName(person.name))}</h3>
                <p>${escapeHtml(person.team || 'Independent walker')}</p>
                <p class="big-score">${number(person.average_steps)} steps / day</p>
                <p>${number(person.total_steps)} total · ${person.days_reported} of 15 days</p>
            </article>
        `;
        }).join('');
    }

    function renderClub200K(data) {
        const club = data.clubs?.two_hundred_k || {
            threshold_steps: 200000,
            required_reporting_rate: 100,
            members: data.participant_standings.filter(person =>
                person.days_reported === data.challenge.days && person.total_steps >= 200000
            )
        };
        const clubTotal = club.total_steps ?? club.members.reduce((sum, person) => sum + person.total_steps, 0);
        const share = club.share_of_challenge_steps ?? (
            data.totals.steps > 0 ? (clubTotal * 100 / data.totals.steps) : 0
        );
        byId('club200KDecree').textContent = `${club.members.length} founding members combined for ${number(clubTotal)} steps—${number(share)}% of the entire challenge.`;
        byId('club200KMembers').innerHTML = club.members.map((person, index) => `
            <article class="club-200k-member" data-member-number="${String(index + 1).padStart(2, '0')}">
                <span class="club-200k-seal">200K · 100% VERIFIED</span>
                <h3>${escapeHtml(displayName(person.name))}</h3>
                <p>${escapeHtml(person.team || 'Independent walker')}</p>
                <p class="club-total">${number(person.total_steps)} steps</p>
                <p>${number(person.average_steps)} / day · ${person.days_reported}/${data.challenge.days} reports</p>
            </article>
        `).join('');
    }

    function renderRaceOracle(data) {
        const race = data.race;
        if (!race?.dates?.length) {
            byId('raceOracle').hidden = true;
            return;
        }

        const chart = byId('raceChart');
        const calendar = byId('raceCalendar');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const colors = ['#ffd967', '#ff7b54', '#7ce7ff', '#bc8cff', '#76e6a2', '#ff9dcc', '#a9d56c', '#efbfff', '#70a7ff', '#e9a74a', '#85d5ca', '#f28e8e'];
        const plot = { left: 76, right: 970, top: 30, bottom: 430 };
        const state = { group: 'people', metric: 'cumulative', progress: 0, raf: null, playing: false, series: [], hidden: new Set(), maximum: 1, shownDay: -1, legendOrder: '', deferRanking: false, endpointNodes: [], legendValueNodes: [] };
        const xAt = progress => plot.left + (plot.right - plot.left) * progress / (race.dates.length - 1);
        const yAt = value => plot.bottom - (plot.bottom - plot.top) * value / state.maximum;
        const compact = value => value >= 1000000 ? `${number(value / 1000000, 1)}m` : value >= 1000 ? `${number(value / 1000)}k` : number(value);
        const initials = value => {
            const words = displayName(value).trim().split(/\s+/).filter(Boolean);
            return (words.length > 1 ? words.map(word => word[0]) : [words[0]?.slice(0, 2) || '?'])
                .join('').slice(0, 3).toUpperCase();
        };
        calendar.innerHTML = race.dates.map((value, index) => `
            <button type="button" data-race-day="${index}" aria-label="Show ${date(value)}">
                <span>${new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' }).slice(0, 1)}</span>
                <strong>${Number(value.slice(-2))}</strong>
            </button>
        `).join('');

        function valuesFor(entry) {
            return entry.days.map(day => state.metric === 'cumulative'
                ? day.cumulative
                : state.group === 'teams' ? day.average : day.steps);
        }

        function stop() {
            if (state.raf) cancelAnimationFrame(state.raf);
            state.raf = null;
            state.playing = false;
            byId('racePlay').classList.remove('is-playing');
            byId('racePlay').innerHTML = '<span aria-hidden="true">▶</span> Unleash time';
            byId('racePlay').setAttribute('aria-label', 'Play the calendar animation');
        }

        function renderChart() {
            const ranked = race[state.group].map(entry => {
                const values = valuesFor(entry);
                const score = state.metric === 'cumulative'
                    ? values.at(-1)
                    : values.reduce((sum, value) => sum + value, 0) / values.length;
                return { entry, values, score };
            }).sort((left, right) => right.score - left.score || String(left.entry.name).localeCompare(String(right.entry.name)));
            state.series = ranked.slice(0, state.group === 'teams' ? 12 : 10);
            const rawMaximum = Math.max(1, ...state.series.flatMap(series => series.values));
            const magnitude = 10 ** Math.floor(Math.log10(rawMaximum));
            state.maximum = Math.ceil(rawMaximum / magnitude * 1.08) * magnitude;

            const grid = Array.from({ length: 5 }, (_, index) => {
                const value = state.maximum * (4 - index) / 4;
                const y = plot.top + (plot.bottom - plot.top) * index / 4;
                return `<line x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}"/><text x="${plot.left - 13}" y="${y + 4}" text-anchor="end">${compact(value)}</text>`;
            }).join('');
            const paths = state.series.map((series, index) => {
                const points = series.values.map((value, day) => `${xAt(day)},${yAt(value)}`).join(' ');
                return `<polyline class="race-line ${index < 3 ? 'race-line-hero' : ''} ${state.hidden.has(index) ? 'is-hidden' : ''}" data-race-series="${index}" points="${points}" style="--line-color:${colors[index]}" vector-effect="non-scaling-stroke"/>`;
            }).join('');
            const xLabels = race.dates.map((value, index) => `<text x="${xAt(index)}" y="466" text-anchor="middle">${Number(value.slice(-2))}</text>`).join('');
            const endpoints = state.series.map((series, index) => {
                const name = displayName(series.entry.name);
                return `<g class="race-endpoint" data-race-endpoint="${index}" style="--line-color:${colors[index]}" tabindex="0" role="img" aria-label="${escapeHtml(name)}">
                    <title>${escapeHtml(name)}</title><line class="race-label-leader"/><circle class="race-dot" r="${index < 3 ? 6 : 4}"/>
                    <text class="race-endpoint-label race-endpoint-full">${escapeHtml(name)}</text>
                    <text class="race-endpoint-label race-endpoint-short">${escapeHtml(initials(name))}</text>
                </g>`;
            }).join('');
            chart.innerHTML = `
                <title id="raceChartTitle">${state.metric === 'cumulative' ? 'Cumulative' : 'Daily average'} steps by ${state.group === 'teams' ? 'team' : 'person'}</title>
                <desc id="raceChartDescription">Ten leading trajectories across the fifteen calendar days of the challenge.</desc>
                <defs><clipPath id="raceReveal"><rect id="raceRevealRect" x="${plot.left - 8}" y="0" width="8" height="455"/></clipPath></defs>
                <g class="race-grid">${grid}</g><g class="race-x-axis">${xLabels}<text x="523" y="493" text-anchor="middle">AUGUST · MMXXV</text></g>
                <g clip-path="url(#raceReveal)">${paths}</g>
                <line id="raceNeedle" class="race-needle" x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}"/>
                <g id="raceDots">${endpoints}</g>`;
            state.endpointNodes = state.series.map((series, index) => {
                const group = chart.querySelector(`[data-race-endpoint="${index}"]`);
                return {
                    group,
                    leader: group.querySelector('.race-label-leader'),
                    dot: group.querySelector('.race-dot'),
                    labels: group.querySelectorAll('.race-endpoint-label')
                };
            });
            byId('raceLegend').innerHTML = state.series.map((series, index) => `
                <button type="button" class="race-legend-item ${state.hidden.has(index) ? 'is-hidden' : ''}" data-series-toggle="${index}" aria-pressed="${!state.hidden.has(index)}" aria-label="Toggle ${escapeHtml(displayName(series.entry.name))} trajectory">
                    <em data-legend-rank>—</em><i style="--line-color:${colors[index]}"></i><span>${escapeHtml(displayName(series.entry.name))}</span><strong data-legend-value="${index}">0</strong>
                </button>
            `).join('');
            state.legendValueNodes = state.series.map((series, index) =>
                byId('raceLegend').querySelector(`[data-legend-value="${index}"]`)
            );
            byId('raceFootnote').textContent = `Tracing ${state.series.length} ${state.group === 'people' ? `leading mortals of ${ranked.length}` : `legions of ${ranked.length}`}. Lines are selected by ${state.metric === 'cumulative' ? 'final distance' : 'average daily pace'} so the cosmos remains legible.`;
            state.shownDay = -1;
            state.legendOrder = '';
            paintProgress(state.progress);
        }

        function updateLegendRanking(samples) {
            const ranked = [...samples].sort((left, right) =>
                right.value - left.value || String(left.series.entry.name).localeCompare(String(right.series.entry.name))
            );
            const signature = ranked.map(sample => sample.index).join(',');
            if (signature === state.legendOrder) return;
            state.legendOrder = signature;
            const legend = byId('raceLegend');
            const buttons = new Map([...legend.querySelectorAll('[data-series-toggle]')].map(button => [
                Number(button.dataset.seriesToggle), button
            ]));
            const previousPositions = new Map([...buttons].map(([index, button]) => [index, button.getBoundingClientRect()]));
            ranked.forEach((sample, rank) => {
                const button = buttons.get(sample.index);
                button.querySelector('[data-legend-rank]').textContent = String(rank + 1);
                legend.appendChild(button);
            });
            if (reduceMotion) return;
            ranked.forEach(sample => {
                const button = buttons.get(sample.index);
                const previous = previousPositions.get(sample.index);
                const current = button.getBoundingClientRect();
                const x = previous.left - current.left;
                const y = previous.top - current.top;
                if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
                button.animate?.([
                    { transform: `translate(${x}px, ${y}px)`, zIndex: 2 },
                    { transform: 'translate(0, 0)', zIndex: 2 }
                ], { duration: 480, easing: 'cubic-bezier(.2, .8, .2, 1)' });
            });
        }

        function paintProgress(progress) {
            state.progress = Math.max(0, Math.min(race.dates.length - 1, progress));
            const lower = Math.floor(state.progress);
            const upper = Math.min(race.dates.length - 1, lower + 1);
            const fraction = state.progress - lower;
            const x = xAt(state.progress);
            byId('raceRevealRect').setAttribute('width', String(x - plot.left + 16));
            const needle = byId('raceNeedle');
            needle.setAttribute('x1', x); needle.setAttribute('x2', x);
            const samples = state.series.map((series, index) => {
                const value = series.values[lower] + (series.values[upper] - series.values[lower]) * fraction;
                return { series, index, value, actualY: yAt(value), labelY: yAt(value) };
            });
            const visibleSamples = samples.filter(sample => !state.hidden.has(sample.index));
            const labelsByHeight = [...visibleSamples].sort((left, right) => left.actualY - right.actualY);
            labelsByHeight.forEach((sample, index) => {
                sample.labelY = Math.max(sample.actualY, index ? labelsByHeight[index - 1].labelY + 17 : plot.top + 7);
            });
            const bottomOverflow = Math.max(0, labelsByHeight.at(-1).labelY - (plot.bottom - 5));
            labelsByHeight.forEach(sample => { sample.labelY -= bottomOverflow; });
            const topOverflow = Math.max(0, plot.top + 7 - labelsByHeight[0].labelY);
            labelsByHeight.forEach(sample => { sample.labelY += topOverflow; });
            const direction = x > 790 ? -1 : 1;
            const labelX = x + direction * 13;
            const anchor = direction < 0 ? 'end' : 'start';
            samples.forEach(sample => {
                const nodes = state.endpointNodes[sample.index];
                const visible = !state.hidden.has(sample.index);
                nodes.group.classList.toggle('is-hidden', !visible);
                if (!visible) return;
                nodes.leader.setAttribute('x1', x); nodes.leader.setAttribute('y1', sample.actualY);
                nodes.leader.setAttribute('x2', labelX - direction * 3); nodes.leader.setAttribute('y2', sample.labelY);
                nodes.dot.setAttribute('cx', x); nodes.dot.setAttribute('cy', sample.actualY);
                nodes.labels.forEach(label => {
                    label.setAttribute('x', labelX);
                    label.setAttribute('y', sample.labelY + 3);
                    label.setAttribute('text-anchor', anchor);
                });
            });
            samples.forEach(sample => {
                state.legendValueNodes[sample.index].textContent = number(sample.value);
            });

            const day = Math.round(state.progress);
            if (day === state.shownDay) return;
            state.shownDay = day;
            if (!state.deferRanking) updateLegendRanking(samples.map(sample => ({
                ...sample,
                value: sample.series.values[day]
            })));
            calendar.querySelectorAll('button').forEach((button, index) => {
                const active = index === day;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            byId('raceDayNumber').textContent = String(day + 1).padStart(2, '0');
            byId('raceDate').textContent = new Date(`${race.dates[day]}T00:00:00Z`).toLocaleDateString(undefined, {
                month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
            });
            byId('raceMetricLabel').textContent = state.metric === 'cumulative'
                ? 'CUMULATIVE STEPS THROUGH THIS DAY'
                : state.group === 'teams' ? 'AVERAGE STEPS PER REPORTER THAT DAY' : 'STEPS RECORDED THAT DAY';
        }

        function animateTo(target, duration = 500, onComplete) {
            if (state.raf) cancelAnimationFrame(state.raf);
            if (reduceMotion) {
                paintProgress(target);
                onComplete?.();
                return;
            }
            const origin = state.progress;
            const startedAt = performance.now();
            const frame = now => {
                const elapsed = Math.min(1, (now - startedAt) / duration);
                const eased = elapsed < .5 ? 2 * elapsed * elapsed : 1 - Math.pow(-2 * elapsed + 2, 2) / 2;
                paintProgress(origin + (target - origin) * eased);
                if (elapsed < 1) state.raf = requestAnimationFrame(frame);
                else { state.raf = null; onComplete?.(); }
            };
            state.raf = requestAnimationFrame(frame);
        }

        function play() {
            if (state.playing) {
                stop();
                return;
            }
            if (state.progress >= race.dates.length - 1) paintProgress(0);
            state.playing = true;
            byId('racePlay').classList.add('is-playing');
            byId('racePlay').innerHTML = '<span aria-hidden="true">Ⅱ</span> Arrest time';
            byId('racePlay').setAttribute('aria-label', 'Pause the calendar animation');
            const remaining = race.dates.length - 1 - state.progress;
            animateTo(race.dates.length - 1, reduceMotion ? 0 : remaining * 720, stop);
        }

        calendar.addEventListener('click', event => {
            const button = event.target.closest('[data-race-day]');
            if (!button) return;
            stop();
            const target = Number(button.dataset.raceDay);
            state.deferRanking = true;
            animateTo(target, 500, () => {
                state.deferRanking = false;
                state.legendOrder = '';
                state.shownDay = -1;
                paintProgress(target);
            });
        });
        document.querySelectorAll('[data-race-group], [data-race-metric]').forEach(button => {
            button.addEventListener('click', () => {
                stop();
                const attribute = button.hasAttribute('data-race-group') ? 'raceGroup' : 'raceMetric';
                const key = attribute === 'raceGroup' ? 'group' : 'metric';
                state[key] = button.dataset[attribute];
                state.hidden.clear();
                document.querySelectorAll(attribute === 'raceGroup' ? '[data-race-group]' : '[data-race-metric]').forEach(peer => {
                    const active = peer === button;
                    peer.classList.toggle('active', active);
                    peer.setAttribute('aria-pressed', String(active));
                });
                renderChart();
            });
        });
        byId('raceLegend').addEventListener('click', event => {
            const button = event.target.closest('[data-series-toggle]');
            if (!button) return;
            const index = Number(button.dataset.seriesToggle);
            if (state.hidden.has(index)) state.hidden.delete(index);
            else if (state.hidden.size < state.series.length - 1) state.hidden.add(index);
            renderChart();
        });
        byId('racePlay').addEventListener('click', play);
        renderChart();
    }

    function renderChampionCards(data) {
        const team = data.podiums.teams[0];
        const person = data.podiums.individuals[0];
        byId('teamChampion').innerHTML = `
            <div class="award-icon" aria-hidden="true">🏆</div>
            <p class="award-label">2025 TEAM CHAMPION</p>
            <h3>${escapeHtml(team.name)}</h3>
            <p class="champion-score">${number(team.average_steps)} steps per member-day</p>
            <p class="champion-detail">${number(team.total_steps)} total steps · ${team.member_count} teammates · ${number(team.reporting_rate)}% reporting</p>
        `;
        byId('individualChampion').innerHTML = `
            <div class="award-icon" aria-hidden="true">🦶</div>
            <p class="award-label">2025 INDIVIDUAL CHAMPION</p>
            <h3>${escapeHtml(displayName(person.name))}</h3>
            <p class="champion-score">${number(person.average_steps)} steps per day</p>
            <p class="champion-detail">${number(person.total_steps)} total steps · all ${person.days_reported} days reported</p>
        `;
    }

    function renderSupportingStats(data) {
        const biggest = data.supporting.biggest_day;
        const plaques = [
            ['UNBROKEN STREAKS', number(data.totals.perfect_reporters), `people reported all ${data.challenge.days} days`],
            ['THE FINAL SURGE', number(biggest.total_steps), `${date(biggest.date)} · biggest collective day`],
            ['DISTANCE OF LEGEND', `~${number(data.journey.marathon_equivalents)}`, 'marathon equivalents, approximately'],
            ['FINISHING KICK', `+${number(data.supporting.biggest_day_lift_percent)}%`, 'final day versus an average challenge day']
        ];
        byId('supportingStats').innerHTML = plaques.map(([label, value, detail]) => `
            <article class="stat-plaque">
                <p class="eyebrow">${label}</p>
                <strong>${value}</strong>
                <span>${detail}</span>
            </article>
        `).join('');
    }

    function renderStandings(data) {
        byId('teamCount').textContent = `(${data.team_standings.length})`;
        byId('participantCount').textContent = `(${data.participant_standings.length})`;
        byId('teamStandings').innerHTML = data.team_standings.map(team => `
            <tr class="${team.rank && team.rank <= 3 ? 'podium-row' : ''}">
                <td class="${team.rank ? '' : 'unranked-place'}">${team.rank ? `#${team.rank}` : 'Unranked'}</td>
                <td><strong>${escapeHtml(team.name)}</strong></td>
                <td>${team.member_count}</td>
                <td>${number(team.total_steps)}</td>
                <td>${number(team.average_steps)}</td>
                <td>${number(team.reporting_rate, team.reporting_rate % 1 ? 1 : 0)}%</td>
            </tr>
        `).join('');
        byId('participantStandings').innerHTML = data.participant_standings.map(person => `
            <tr class="${person.rank && person.rank <= 3 ? 'podium-row' : ''}">
                <td class="${person.rank ? '' : 'unranked-place'}">${person.rank ? `#${person.rank}` : 'Unranked'}</td>
                <td><strong>${escapeHtml(displayName(person.name))}</strong></td>
                <td>${escapeHtml(person.team || '—')}</td>
                <td>${number(person.total_steps)}</td>
                <td>${number(person.average_steps)}</td>
                <td>${person.days_reported} / ${data.challenge.days}</td>
            </tr>
        `).join('');
    }

    function render(data) {
        if (!data.podiums.teams.length || !data.podiums.individuals.length) {
            throw new Error('The archive has no ranked champions');
        }
        renderChampionCards(data);
        renderTeamPodium(data.podiums.teams);
        renderIndividualPodium(data.podiums.individuals);
        renderRaceOracle(data);
        renderClub200K(data);
        renderSupportingStats(data);
        renderStandings(data);

        byId('totalSteps').textContent = number(data.totals.steps);
        byId('totalStepsSummary').textContent = `${data.totals.participants} people. ${data.totals.teams} teams. ${data.challenge.days} days. One magnificently overworked step counter.`;

        const routePercent = Math.max(0, Math.min(100, data.journey.second_leg_progress_percent));
        byId('routeGraphic').setAttribute('aria-label', `About ${number(data.journey.estimated_km)} kilometers: Delhi to Singapore, then ${number(routePercent)} percent of the way toward San Francisco. Drag the globe or use the left and right arrow keys to rotate it.`);
        byId('journeySummary').textContent = `About ${number(data.journey.estimated_km)} km together—Delhi to Singapore, then nearly a quarter of the way to San Francisco.`;
        byId('distanceMethod').textContent = `We assume ${data.journey.steps_per_mile_assumption} steps per mile and use fixed great-circle distances between the cities.`;

        byId('championsLoading').hidden = true;
        byId('championsError').hidden = true;
        byId('championsExperience').hidden = false;
        prepareJourneyAnimation(routePercent);
    }

    async function loadChampions() {
        byId('championsLoading').hidden = false;
        byId('championsError').hidden = true;
        try {
            const response = await fetch('/api/champions', { headers: { Accept: 'application/json' } });
            if (response.status === 401) {
                window.location.href = '/';
                return;
            }
            if (!response.ok) throw new Error(`Champions request failed: ${response.status}`);
            render(await response.json());
        } catch (error) {
            console.error('Unable to open the Pantheon:', error);
            byId('championsLoading').hidden = true;
            byId('championsExperience').hidden = true;
            byId('championsError').hidden = false;
        }
    }

    byId('retryChampions').addEventListener('click', loadChampions);
    startChallengeCountdown();
    loadChampions();
})();
