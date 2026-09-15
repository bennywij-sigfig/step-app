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
    const keepHyphenatedWordsTogether = value => String(value ?? '').replace(/-/g, '‑');
    const displayName = value => {
        const name = String(value || 'Unknown');
        if (!/^[a-z]+(?:[._-][a-z]+)+$/.test(name)) return keepHyphenatedWordsTogether(name);
        return name.split(/[._-]/).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    };
    const date = value => new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', timeZone: 'UTC'
    });
    const ordinal = rank => ({ 1: 'Champion', 2: 'Runner-up', 3: 'Third place' }[rank] || `#${rank}`);
    const medal = rank => ({ 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ' }[rank] || rank);
    const romanYear = year => {
        const numerals = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
        let remaining = year;
        return numerals.map(([value, glyph]) => {
            const count = Math.floor(remaining / value);
            remaining %= value;
            return glyph.repeat(count);
        }).join('');
    };
    const requestedSeason = Number(new URLSearchParams(window.location.search).get('season'));
    let selectedSeason = requestedSeason === 2026 ? 2026 : 2025;
    let challengeCountdownTimer = null;

    function updateChallengeCountdown(nextChallenge) {
        const start = Date.parse(`${nextChallenge.start_date}T00:00:00+08:00`);
        const dayAfterEnd = new Date(`${nextChallenge.end_date}T00:00:00Z`);
        dayAfterEnd.setUTCDate(dayAfterEnd.getUTCDate() + 1);
        const end = Date.parse(`${dayAfterEnd.toISOString().slice(0, 10)}T00:00:00-07:00`);
        const now = Date.now();
        const phase = now < start ? 'upcoming' : now < end ? 'active' : 'ended';
        const target = phase === 'upcoming' ? start : end;
        const remaining = Math.max(0, target - now);
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
            `${values.countdownDays} days, ${values.countdownHours} hours, ${values.countdownMinutes} minutes, and ${values.countdownSeconds} seconds until the ${nextChallenge.season} challenge ${phase === 'upcoming' ? 'provisional start' : 'close'}`
        );

        const provisional = nextChallenge.provisional ? 'PROVISIONAL · ' : '';
        const range = `${date(nextChallenge.start_date)}–${new Date(`${nextChallenge.end_date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
        byId('countdownBoundary').innerHTML = `${provisional}${range.toUpperCase()}<br><span>${nextChallenge.provisional ? 'planning dates only · subject to administrator confirmation' : 'confirmed challenge dates'}</span>`;
        byId('challengeCountdown').classList.toggle('is-complete', phase === 'ended');
        if (phase === 'upcoming') {
            byId('countdownKicker').textContent = nextChallenge.provisional ? 'THE ORACLE PENCILS IN A DATE' : 'THE NEXT MARCH APPROACHES';
            byId('countdownTitle').textContent = `Until the ${nextChallenge.provisional ? 'provisional ' : ''}${nextChallenge.season} challenge start`;
            byId('countdownDecree').textContent = `${range} is a provisional planning window, not a confirmed challenge announcement. Administrators may change it.`;
        } else if (phase === 'active') {
            byId('countdownKicker').textContent = 'THE LAST MILE APPROACHES';
            byId('countdownTitle').textContent = 'Until the final footfall is tallied';
            byId('countdownDecree').textContent = `The ${nextChallenge.season} challenge is underway. Its displayed dates remain ${nextChallenge.provisional ? 'provisional until administrators confirm them' : 'confirmed'}.`;
        } else {
            byId('countdownKicker').textContent = 'THE CHALLENGE WINDOW HAS CLOSED';
            byId('countdownTitle').textContent = 'Final reporting is in the administrators’ hands';
            byId('countdownDecree').textContent = `Retroactive reporting may remain open past the challenge dates. The ${nextChallenge.season} tablets awaken only after administrators close that deadline and publish the final snapshot.`;
        }
        return phase !== 'ended';
    }

    function startChallengeCountdown(nextChallenge) {
        if (challengeCountdownTimer) window.clearInterval(challengeCountdownTimer);
        if (!updateChallengeCountdown(nextChallenge)) return;
        challengeCountdownTimer = window.setInterval(() => {
            if (!updateChallengeCountdown(nextChallenge)) window.clearInterval(challengeCountdownTimer);
        }, 1000);
    }

    function restoreSectionAnchor() {
        if (!window.location.hash) return;
        let target;
        try {
            target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        } catch (_) {
            return;
        }
        if (!target || !byId('championsExperience').contains(target)) return;
        // The archive is hidden until its API response arrives, so the browser's
        // initial hash jump occurs before these sections have a layout position.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            target.scrollIntoView({ block: 'start', behavior: 'auto' });
        }));
    }

    function prepareJourneyAnimation(routePercent, reverseDistanceKm, reverseRoute) {
        const globe = byId('routeGraphic');
        const canvas = byId('journeyGlobeCanvas');
        const linearRoute = byId('routeLinear');
        const linearMarker = byId('routeLinearMarker');
        const reverseLinearRoute = byId('routeReverseLinear');
        const reverseLinearMarker = byId('routeReverseLinearMarker');
        const onwardFraction = routePercent / 100;
        let firstLegShare = 0.5;
        let linearWaypoints = null;
        let linearOnwardEndpoint = null;
        let reverseLinearWaypoints = null;
        let reverseLinearLegs = null;
        let lastProgress = 0;
        let lastReverseProgress = 0;
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
            if (!linearWaypoints || linearWaypoints.length !== 4) measureLinearWaypoints();
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

        function measureReverseLinearWaypoints() {
            const routeRect = reverseLinearRoute.getBoundingClientRect();
            reverseLinearWaypoints = [...reverseLinearRoute.querySelectorAll('.city-dot')].map(dot => {
                const rect = dot.getBoundingClientRect();
                return {
                    x: rect.left + rect.width / 2 - routeRect.left,
                    y: rect.top + rect.height / 2 - routeRect.top
                };
            });
            reverseLinearLegs = [...reverseLinearRoute.querySelectorAll('.route-leg')].map(leg => {
                const rect = leg.getBoundingClientRect();
                const vertical = rect.height > rect.width;
                return {
                    start: {
                        x: (vertical ? rect.left + rect.width / 2 : rect.left) - routeRect.left,
                        y: (vertical ? rect.top : rect.top + rect.height / 2) - routeRect.top
                    },
                    end: {
                        x: (vertical ? rect.left + rect.width / 2 : rect.right) - routeRect.left,
                        y: (vertical ? rect.bottom : rect.top + rect.height / 2) - routeRect.top
                    }
                };
            });
        }

        function paintReverseLinearRoute(progress) {
            lastReverseProgress = progress;
            if (!reverseLinearWaypoints || reverseLinearWaypoints.length !== 4) measureReverseLinearWaypoints();
            const legDistances = [
                reverseRoute.calgary_to_san_francisco_km,
                reverseRoute.san_francisco_to_singapore_km,
                reverseRoute.singapore_to_delhi_km
            ];
            let remaining = Math.min(reverseDistanceKm, reverseRoute.total_route_km) * progress;
            let markerPoint = reverseLinearWaypoints[0];
            ['reverseCalgarySfProgress', 'reverseSfSingaporeProgress', 'reverseSingaporeDelhiProgress'].forEach((id, index) => {
                const fraction = Math.max(0, Math.min(1, remaining / legDistances[index]));
                byId(id).style.setProperty('--leg-progress', `${fraction * 100}%`);
                byId(['reverseSfDot', 'reverseSingaporeDot', 'reverseDelhiDot'][index]).classList.toggle('complete', fraction >= 1);
                if (remaining > 0 && remaining <= legDistances[index]) {
                    const leg = reverseLinearLegs[index];
                    markerPoint = {
                        x: leg.start.x + (leg.end.x - leg.start.x) * fraction,
                        y: leg.start.y + (leg.end.y - leg.start.y) * fraction
                    };
                } else if (remaining === 0) {
                    markerPoint = reverseLinearWaypoints[index];
                }
                remaining -= legDistances[index];
            });
            if (remaining > 0) {
                markerPoint = reverseLinearWaypoints[3];
            }
            reverseLinearMarker.style.left = `${markerPoint.x}px`;
            reverseLinearMarker.style.top = `${markerPoint.y}px`;
        }

        const renderer = window.PantheonGlobe?.create({
            container: globe,
            canvas,
            landRings: window.PANTHEON_LAND_RINGS,
            onwardFraction,
            reverseDistanceKm,
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

        function animateProgress(painter, delay = 0, duration = 4200) {
            return new Promise(resolve => {
                const startedAt = performance.now() + delay;
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
                        painter(progress);
                    }
                    if (progress < 1) requestAnimationFrame(frame);
                    else resolve();
                };
                requestAnimationFrame(frame);
            });
        }

        async function play() {
            if (started) return;
            started = true;
            const caption = byId('routeCaption');
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                paint(1);
                renderer?.setReverseProgress(1);
                paintReverseLinearRoute(1);
                return;
            }
            caption.textContent = 'GOLD ROUTE · DEPARTING DELHI';
            await animateProgress(paint, 700);
            if (renderer) {
                caption.textContent = 'TURNING THE GLOBE TOWARD CALGARY';
                await renderer.focusCalgary(1400);
            }
            caption.textContent = 'BLUE ROUTE · DEPARTING CALGARY';
            await animateProgress(progress => {
                renderer?.setReverseProgress(progress);
                paintReverseLinearRoute(progress);
            }, 350, 4200);
            caption.textContent = 'TWO ROUTES · ONE HEROIC DISTANCE';
        }

        paint(0);
        paintReverseLinearRoute(0);
        window.addEventListener('resize', () => {
            linearWaypoints = null;
            reverseLinearWaypoints = null;
            reverseLinearLegs = null;
            paintLinearRoute(lastProgress);
            paintReverseLinearRoute(lastReverseProgress);
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

    function configureLinearRouteScale(element, distances) {
        const total = distances.reduce((sum, distance) => sum + distance, 0);
        distances.forEach((distance, index) => {
            const ordinal = ['one', 'two', 'three'][index];
            element.style.setProperty(`--leg-${ordinal}`, `${distance}fr`);
            element.style.setProperty(`--leg-${ordinal}-mobile`, `${total > 0 ? distance * 300 / total : 0}px`);
        });
    }

    function renderReverseJourney(reverse, totalDistanceKm) {
        const firstPercent = Math.max(0, Math.min(100,
            reverse.calgary_to_san_francisco_progress_km * 100 / reverse.calgary_to_san_francisco_km
        ));
        const secondPercent = Math.max(0, Math.min(100,
            reverse.san_francisco_to_singapore_progress_km * 100 / reverse.san_francisco_to_singapore_km
        ));
        const thirdPercent = Math.max(0, Math.min(100,
            reverse.singapore_to_delhi_progress_km * 100 / reverse.singapore_to_delhi_km
        ));
        const progress = [firstPercent, secondPercent, thirdPercent];
        ['reverseCalgarySfProgress', 'reverseSfSingaporeProgress', 'reverseSingaporeDelhiProgress'].forEach((id, index) => {
            byId(id).style.setProperty('--leg-progress', `${progress[index]}%`);
        });
        byId('reverseSfDot').classList.toggle('complete', firstPercent >= 100);
        byId('reverseSingaporeDot').classList.toggle('complete', secondPercent >= 100);
        byId('reverseDelhiDot').classList.toggle('complete', thirdPercent >= 100);

        let narrative;
        if (firstPercent < 100) {
            narrative = `Or head south: ${number(firstPercent)}% of the way from Calgary to San Francisco.`;
        } else if (secondPercent < 100) {
            narrative = `Or head south and west: Calgary to San Francisco, then ${number(secondPercent, secondPercent < 10 ? 1 : 0)}% of the way to Singapore.`;
        } else if (thirdPercent < 100) {
            narrative = `Or take the long way east: Calgary to San Francisco to Singapore, then ${number(thirdPercent)}% of the way to Delhi.`;
        } else {
            narrative = `Or complete the full Calgary → San Francisco → Singapore → Delhi route${totalDistanceKm > reverse.total_route_km ? `, plus ${number(totalDistanceKm - reverse.total_route_km)} km beyond` : ''}.`;
        }
        byId('reverseJourneySummary').textContent = narrative;
        return narrative;
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
                    <span class="podium-name">${escapeHtml(keepHyphenatedWordsTogether(team.name))}</span>
                    <span class="metric"><strong>${number(team.average_steps)}</strong>avg / member-day</span>
                    <span class="metric"><strong>${number(team.total_steps)}</strong>total steps</span>
                    <span class="metric"><strong>${number(team.reporting_rate, team.reporting_rate % 1 ? 1 : 0)}%</strong>reporting</span>
                </summary>
                <div class="members-grid">${memberTiles(team.members)}</div>
            </details>
        `).join('');
    }

    function renderIndividualPodium(individuals, challengeDays) {
        const highestTotal = Math.max(...individuals.map(person => person.total_steps), 1);
        byId('individualPodium').innerHTML = individuals.map(person => {
            const podiumHeight = Math.max(190, Math.round(330 * person.total_steps / highestTotal));
            return `
            <article class="individual-podium-card" style="--podium-height: ${podiumHeight}px">
                <span class="place-medal">${medal(person.rank)} · ${ordinal(person.rank)}</span>
                <h3>${escapeHtml(displayName(person.name))}</h3>
                <p>${escapeHtml(keepHyphenatedWordsTogether(person.team || 'Independent walker'))}</p>
                <p class="big-score">${number(person.average_steps)} steps / day</p>
                <p>${number(person.total_steps)} total · ${person.days_reported} of ${challengeDays} days</p>
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
        byId('club200KDecree').textContent = club.members.length
            ? `${club.members.length} members combined for ${number(clubTotal)} steps—${number(share)}% of the entire challenge.`
            : `No one has qualified in this snapshot yet. Club 200K requires at least ${number(club.threshold_steps)} steps and every one of the ${data.challenge.days} challenge days reported.`;
        byId('club200KMembers').innerHTML = club.members.length ? club.members.map((person, index) => `
            <article class="club-200k-member" data-member-number="${String(index + 1).padStart(2, '0')}">
                <span class="club-200k-seal">200K · 100% VERIFIED</span>
                <h3>${escapeHtml(displayName(person.name))}</h3>
                <p>${escapeHtml(keepHyphenatedWordsTogether(person.team || 'Independent walker'))}</p>
                <p class="club-total">${number(person.total_steps)} steps</p>
                <p>${number(person.average_steps)} / day · ${person.days_reported}/${data.challenge.days} reports</p>
            </article>
        `).join('') : '<p class="club-200k-empty">Late reports can still produce qualifiers before administrators publish or refresh the final snapshot.</p>';
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
        const state = { group: 'teams', metric: 'cumulative', progress: 0, raf: null, playing: false, series: [], hidden: new Set(), maximum: 1, shownDay: -1, legendOrder: '', deferRanking: false, endpointNodes: [], legendValueNodes: [] };
        const xAt = progress => plot.left + (plot.right - plot.left) * progress / (race.dates.length - 1);
        const yAt = value => plot.bottom - (plot.bottom - plot.top) * value / state.maximum;
        const compact = value => value >= 1000000 ? `${number(value / 1000000, 1)}m` : value >= 1000 ? `${number(value / 1000)}k` : number(value);
        const yAxisScale = rawMaximum => {
            const paddedMaximum = Math.max(1, rawMaximum * 1.08);
            const targetStep = paddedMaximum / 4;
            const candidates = [];
            for (let exponent = -2; exponent <= 9; exponent += 1) {
                const magnitude = 10 ** exponent;
                [1, 2, 2.5, 5].forEach(factor => candidates.push(factor * magnitude));
            }
            const step = candidates.reduce((best, candidate) =>
                Math.abs(candidate - targetStep) < Math.abs(best - targetStep) ? candidate : best
            );
            const maximum = Math.ceil(paddedMaximum / step) * step;
            const ticks = [];
            for (let value = 0; value <= maximum + step / 100; value += step) ticks.push(value);
            return { maximum, ticks };
        };
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
            return entry.days.map(day => {
                if (state.metric === 'cumulative') return day.cumulative;
                if (state.metric === 'cumulativeAverage') return day.cumulative_average;
                return state.group === 'teams' ? day.average : day.steps;
            });
        }

        function syncControlState() {
            document.querySelectorAll('[data-race-group]').forEach(button => {
                const active = button.dataset.raceGroup === state.group;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
            document.querySelectorAll('[data-race-metric]').forEach(button => {
                const active = button.dataset.raceMetric === state.metric;
                button.classList.toggle('active', active);
                button.setAttribute('aria-pressed', String(active));
            });
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
                const score = state.metric === 'cumulative' || state.metric === 'cumulativeAverage'
                    ? values.at(-1)
                    : values.reduce((sum, value) => sum + value, 0) / values.length;
                return { entry, values, score };
            }).sort((left, right) => right.score - left.score || String(left.entry.name).localeCompare(String(right.entry.name)));
            state.series = ranked.slice(0, state.group === 'teams' ? 12 : 10);
            const rawMaximum = Math.max(1, ...state.series.flatMap(series => series.values));
            const scale = yAxisScale(rawMaximum);
            state.maximum = scale.maximum;

            const grid = scale.ticks.map(value => {
                const y = yAt(value);
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
                <title id="raceChartTitle">${state.metric === 'cumulative' ? 'Cumulative steps' : state.metric === 'cumulativeAverage' ? 'Cumulative daily average' : 'Daily average steps'} by ${state.group === 'teams' ? 'team' : 'person'}</title>
                <desc id="raceChartDescription">Ten leading trajectories across the fifteen calendar days of the challenge.</desc>
                <defs><clipPath id="raceReveal"><rect id="raceRevealRect" x="${plot.left - 8}" y="0" width="8" height="455"/></clipPath></defs>
                <g class="race-grid">${grid}</g><g class="race-x-axis">${xLabels}<text x="523" y="493" text-anchor="middle">${new Date(`${race.dates[0]}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}</text></g>
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
            const selectionBasis = state.metric === 'cumulative'
                ? 'final distance'
                : state.metric === 'cumulativeAverage' ? 'final cumulative daily average' : 'average daily pace';
            byId('raceFootnote').textContent = `Tracing ${state.series.length} ${state.group === 'people' ? `leading mortals of ${ranked.length}` : `legions of ${ranked.length}`}. Lines are selected by ${selectionBasis} so the cosmos remains legible.`;
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
                : state.metric === 'cumulativeAverage'
                    ? state.group === 'teams'
                        ? 'CUMULATIVE STEPS ÷ REPORTED MEMBER-DAYS TO DATE'
                        : 'CUMULATIVE STEPS ÷ REPORTED DAYS TO DATE'
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

        function prepareViewportAutoplay() {
            if (reduceMotion) return;
            const oracle = byId('raceOracle');
            if (!('IntersectionObserver' in window)) {
                play();
                return;
            }
            const observer = new IntersectionObserver(entries => {
                if (!entries.some(entry => entry.isIntersecting)) return;
                observer.disconnect();
                if (!state.playing && state.progress === 0) play();
            }, { threshold: .18, rootMargin: '0px 0px -12% 0px' });
            observer.observe(oracle);
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
                syncControlState();
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
        syncControlState();
        renderChart();
        prepareViewportAutoplay();
    }

    function renderChampionCards(data) {
        const team = data.podiums.teams[0];
        const person = data.podiums.individuals[0];
        byId('teamChampion').innerHTML = `
            <div class="award-icon" aria-hidden="true">🏆</div>
            <p class="award-label">${data.season} TEAM CHAMPION</p>
            <h3>${escapeHtml(keepHyphenatedWordsTogether(team.name))}</h3>
            <p class="champion-score">${number(team.average_steps)} steps per member-day</p>
            <p class="champion-detail">${number(team.total_steps)} total steps · ${team.member_count} teammates · ${number(team.reporting_rate)}% reporting</p>
        `;
        byId('individualChampion').innerHTML = `
            <div class="award-icon" aria-hidden="true">🦶</div>
            <p class="award-label">${data.season} INDIVIDUAL CHAMPION</p>
            <h3>${escapeHtml(displayName(person.name))}</h3>
            <p class="champion-score">${number(person.average_steps)} steps per day</p>
            <p class="champion-detail">${number(person.total_steps)} total steps · all ${person.days_reported} days reported</p>
        `;
    }

    function renderSeasonHonors(data) {
        const section = byId('season-honors');
        const comparison = data.honors?.comparison;
        if (!comparison) {
            section.hidden = true;
            return;
        }

        const improved = comparison.most_improved;
        const consistent = data.honors?.most_consistent;
        const dailyAverage = comparison.cumulative_daily_average;
        const signed = (value, suffix = '') => `${value >= 0 ? '+' : '−'}${number(Math.abs(value))}${suffix}`;
        byId('seasonHonorsKicker').textContent = `NEW FOR ${data.season}`;
        byId('seasonHonorsTitle').textContent = `${data.season} honors and the view from ${comparison.baseline_season}`;
        byId('seasonHonorsSummary').textContent = `Most Improved considers ${comparison.returning_ranked_participants} returning participants ranked in both seasons. The year-over-year pace divides all submitted steps by all reported person-days.`;
        byId('seasonHonorsGrid').innerHTML = `
            <article class="season-honor-card">
                <span class="honor-mark">⚡ MOST IMPROVED VS. ${comparison.baseline_season}</span>
                <h3>${improved ? escapeHtml(displayName(improved.name)) : 'No eligible comparison'}</h3>
                ${improved ? `<strong>${signed(improved.average_step_change)} steps / day</strong><p>From ${number(improved.baseline_average_steps)} to ${number(improved.average_steps)} average steps per reported day.</p>` : '<p>A participant must qualify for the ranked table in both seasons.</p>'}
            </article>
            <article class="season-honor-card">
                <span class="honor-mark">⚖ MOST CONSISTENT</span>
                <h3>${consistent ? escapeHtml(displayName(consistent.name)) : 'Awaiting a complete reporter'}</h3>
                ${consistent ? `<strong>${number(consistent.consistency_score, 1)} consistency score</strong><p>Lowest day-to-day variation among people who reported every challenge day.</p>` : '<p>This honor requires every challenge day to be reported.</p>'}
            </article>
            <article class="season-honor-card">
                <span class="honor-mark">↗ ${data.season} VS. ${comparison.baseline_season}</span>
                <h3>${signed(dailyAverage.change_percent, '%')}</h3>
                <strong>${signed(dailyAverage.change)} steps / reported day</strong>
                <p>${number(dailyAverage.current)} collective cumulative daily average in ${data.season}, versus ${number(dailyAverage.baseline)} in ${comparison.baseline_season}. Each reported person-day counts equally.</p>
            </article>
        `;
        section.hidden = false;
    }

    function renderNextChallenge(data) {
        const next = data.next_challenge;
        byId('nextYearTitle').textContent = `More honors await in ${next.season}`;
        byId('nextSeasonNav').textContent = `${next.season} preview`;
        byId('countdownNav').textContent = `${next.season} countdown`;
        byId('futureAwards').innerHTML = `
            <span>200K Club · Class of ${next.season}</span>
            <span>⚡ Most Improved vs. ${data.season}</span>
            <span>⚖ Most Consistent</span>
            <span>↗ ${next.season} vs. ${data.season}</span>
        `;
        byId('nextYearDecree').textContent = `Provisional planning dates: September 1–15, ${next.season}. These dates are not confirmed and may change when administrators create the ${next.season} challenge.`;
        startChallengeCountdown(next);
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
                <td><strong>${escapeHtml(keepHyphenatedWordsTogether(team.name))}</strong></td>
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
                <td>${escapeHtml(keepHyphenatedWordsTogether(person.team || '—'))}</td>
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
        selectedSeason = data.season;
        document.querySelectorAll('[data-season]').forEach(button => {
            const active = Number(button.dataset.season) === data.season;
            button.classList.toggle('active', active);
            button.classList.toggle('future', !active);
            button.setAttribute('aria-current', String(active));
        });
        byId('seasonPill').textContent = `EST. ${romanYear(data.season)}`;
        byId('crownedSeason').textContent = `CROWNED IN ${data.season}`;
        byId('clubSeason').textContent = `EST. ${data.season}`;
        byId('club200KMembers').setAttribute('aria-label', `${data.season} Club 200K members`);
        byId('raceOracleTitle').textContent = `${data.challenge.days} days. One glorious stampede.`;
        byId('raceDayTotal').textContent = `OF ${data.challenge.days}`;
        byId('analyticsLink').href = `/champions/analytics?season=${data.season}`;
        byId('championsFooterChallenge').textContent = `${data.challenge.name} · ${new Date(`${data.challenge.start_date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' })}–${new Date(`${data.challenge.end_date}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
        const seasonPath = `/champions?season=${data.season}`;
        history.replaceState(null, '', `${seasonPath}${window.location.hash}`);

        renderChampionCards(data);
        renderTeamPodium(data.podiums.teams);
        renderIndividualPodium(data.podiums.individuals, data.challenge.days);
        renderRaceOracle(data);
        renderClub200K(data);
        renderSeasonHonors(data);
        renderNextChallenge(data);
        renderSupportingStats(data);
        renderStandings(data);

        byId('totalSteps').textContent = number(data.totals.steps);
        byId('totalStepsSummary').textContent = `${data.totals.participants} people. ${data.totals.teams} teams. ${data.challenge.days} days. One magnificently overworked step counter.`;

        const routePercent = Math.max(0, Math.min(100, data.journey.second_leg_progress_percent));
        const firstLegPercent = Math.max(0, Math.min(100,
            data.journey.estimated_km * 100 / data.journey.delhi_to_singapore_km
        ));
        const thirdLegPercent = Math.max(0, Math.min(100, data.journey.third_leg_progress_percent));
        const beyondCalgaryKm = Math.max(0,
            data.journey.estimated_km - data.journey.delhi_to_singapore_km -
            data.journey.singapore_to_san_francisco_km - data.journey.san_francisco_to_calgary_km
        );
        configureLinearRouteScale(byId('routeLinear'), [
            data.journey.delhi_to_singapore_km,
            data.journey.singapore_to_san_francisco_km,
            data.journey.san_francisco_to_calgary_km
        ]);
        configureLinearRouteScale(byId('routeReverseLinear'), [
            data.journey.reverse_route.calgary_to_san_francisco_km,
            data.journey.reverse_route.san_francisco_to_singapore_km,
            data.journey.reverse_route.singapore_to_delhi_km
        ]);
        byId('goldSfCalgaryProgress').style.setProperty('--leg-progress', `${thirdLegPercent}%`);
        byId('goldCalgaryDot').classList.toggle('complete', thirdLegPercent >= 100);
        let journeyNarrative;
        if (firstLegPercent < 100) {
            journeyNarrative = `About ${number(data.journey.estimated_km)} km together—${number(firstLegPercent)}% of the way from Delhi to Singapore.`;
        } else if (routePercent < 100) {
            journeyNarrative = `About ${number(data.journey.estimated_km)} km together—Delhi to Singapore, then ${number(routePercent, routePercent < 10 ? 1 : 0)}% of the way toward San Francisco.`;
        } else if (thirdLegPercent < 100) {
            journeyNarrative = `About ${number(data.journey.estimated_km)} km together—Delhi to Singapore to San Francisco, then ${number(thirdLegPercent, thirdLegPercent < 10 ? 1 : 0)}% of the way to Calgary.`;
        } else {
            journeyNarrative = `About ${number(data.journey.estimated_km)} km together—the full Delhi → Singapore → San Francisco → Calgary route${beyondCalgaryKm > 0 ? `, plus ${number(beyondCalgaryKm)} km beyond` : ''}.`;
        }
        byId('journeySummary').textContent = journeyNarrative;
        const reverseNarrative = renderReverseJourney(data.journey.reverse_route, data.journey.estimated_km);
        byId('routeGraphic').setAttribute('aria-label', `${journeyNarrative} ${reverseNarrative} Drag the globe or use the left and right arrow keys to rotate it.`);
        byId('distanceMethod').textContent = `We assume ${data.journey.steps_per_mile_assumption} steps per mile and use fixed great-circle distances between the cities.`;

        byId('championsLoading').hidden = true;
        byId('championsError').hidden = true;
        byId('championsExperience').hidden = false;
        restoreSectionAnchor();
        prepareJourneyAnimation(routePercent, data.journey.estimated_km, data.journey.reverse_route);
    }

    async function loadChampions(season = selectedSeason) {
        selectedSeason = season;
        byId('championsLoading').textContent = `☙ Consulting the ${season} sacred archive… ❧`;
        byId('championsLoading').hidden = false;
        byId('championsExperience').hidden = true;
        byId('championsError').hidden = true;
        try {
            const response = await fetch(`/api/champions?season=${season}`, { headers: { Accept: 'application/json' } });
            if (response.status === 401) {
                window.location.href = '/';
                return;
            }
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const error = new Error(body.error || `Champions request failed: ${response.status}`);
                error.status = response.status;
                throw error;
            }
            render(await response.json());
        } catch (error) {
            console.error('Unable to open the Pantheon:', error);
            byId('championsLoading').hidden = true;
            byId('championsExperience').hidden = true;
            byId('championsError').hidden = false;
            const heading = byId('championsError').querySelector('h2');
            const detail = byId('championsError').querySelector('p');
            heading.textContent = error.status === 404 ? `${season} awaits the administrators’ decree.` : 'The archive doors are stuck.';
            detail.textContent = error.status === 404
                ? 'The challenge may be over, but results remain private until the retroactive submission deadline passes and an administrator publishes them.'
                : 'Return from the underworld shortly and try again.';
        }
    }

    byId('retryChampions').addEventListener('click', () => loadChampions(selectedSeason));
    loadChampions(selectedSeason);
})();
