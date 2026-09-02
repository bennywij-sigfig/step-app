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
        renderClub200K(data);
        renderSupportingStats(data);
        renderStandings(data);

        byId('totalSteps').textContent = number(data.totals.steps);
        byId('totalStepsSummary').textContent = `${data.totals.participants} people. ${data.totals.teams} teams. ${data.challenge.days} days. One magnificently overworked step counter.`;

        const routePercent = Math.max(0, Math.min(100, data.journey.second_leg_progress_percent));
        byId('routeGraphic').style.setProperty('--route-progress', '0%');
        byId('routeGraphic').setAttribute('aria-label', `About ${number(data.journey.estimated_km)} kilometers: Delhi to Singapore, then ${number(routePercent)} percent of the way toward San Francisco.`);
        byId('journeySummary').textContent = `About ${number(data.journey.estimated_km)} km together—Delhi to Singapore, then nearly a quarter of the way to San Francisco.`;
        byId('distanceMethod').textContent = `This playful estimate uses ${number(data.journey.steps_per_mile_assumption)} steps per mile and fixed great-circle distances between the three cities. It is an illustration, not a claim that everyone shares the same stride.`;

        byId('championsLoading').hidden = true;
        byId('championsError').hidden = true;
        byId('championsExperience').hidden = false;
        requestAnimationFrame(() => byId('routeGraphic').style.setProperty('--route-progress', `${routePercent}%`));
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
