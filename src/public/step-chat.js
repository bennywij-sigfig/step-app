(() => {
    const STORAGE_KEY_PREFIX = 'stepChatTranscriptV2';
    const LEGACY_STORAGE_KEY = 'stepChatTranscriptV1';
    const STORAGE_SCOPE_KEY = 'stepChatTranscriptScopeV2';
    const TONE_STORAGE_KEY = 'stepChatToneV1';
    const MAX_STORED_MESSAGES = 40;
    const state = { csrfToken: null, messages: [], configured: null, storageKey: null };

    const formatNumber = value => Number(value || 0).toLocaleString();
    const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
        month: 'long', day: 'numeric', year: 'numeric'
    });
    const getClientDateContext = () => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return { client_timezone: timezone, client_date: `${values.year}-${values.month}-${values.day}` };
    };

    function loadStoredMessages() {
        state.messages = [];
        if (!state.storageKey) return;
        try {
            const parsed = JSON.parse(sessionStorage.getItem(state.storageKey) || '[]');
            if (Array.isArray(parsed)) {
                state.messages = parsed
                    .filter(item => item && ['user', 'assistant', 'error'].includes(item.role) && typeof item.text === 'string')
                    .slice(-MAX_STORED_MESSAGES);
            }
        } catch (_) {
            state.messages = [];
        }
    }

    function saveMessages() {
        if (state.storageKey) {
            sessionStorage.setItem(state.storageKey, JSON.stringify(state.messages.slice(-MAX_STORED_MESSAGES)));
        }
    }

    function remember(role, text) {
        state.messages.push({ role, text: String(text).slice(0, 4000) });
        state.messages = state.messages.slice(-MAX_STORED_MESSAGES);
        saveMessages();
    }

    function getRecentHistory() {
        const candidates = state.messages
            .slice(0, -1) // The current user message is sent separately.
            .filter(item => ['user', 'assistant'].includes(item.role))
            .slice(-30);
        const accepted = [];
        let characters = 0;
        for (let index = candidates.length - 1; index >= 0; index -= 1) {
            const item = candidates[index];
            const remaining = 20000 - characters;
            if (remaining <= 0) break;
            const text = item.text.slice(-remaining);
            accepted.unshift({ role: item.role, text });
            characters += text.length;
        }
        return accepted;
    }

    function createMessage(role, text, rememberMessage = true) {
        const transcript = document.getElementById('chatTranscript');
        const message = document.createElement('div');
        message.className = `chat-message ${role}`;
        const body = document.createElement('div');
        body.textContent = text;
        message.appendChild(body);
        transcript.appendChild(message);
        transcript.scrollTop = transcript.scrollHeight;
        if (rememberMessage) remember(role, text);
        return message;
    }

    function addList(container, items) {
        const list = document.createElement('ul');
        list.className = 'chat-result-list';
        for (const itemText of items) {
            const item = document.createElement('li');
            item.textContent = itemText;
            list.appendChild(item);
        }
        container.appendChild(list);
    }

    function toneLead(tone, kind) {
        const lines = {
            encouraging: {
                preview: 'Here’s the plan. You’ve got this.',
                leaderboard: 'Here’s the current snapshot.',
                steps: 'Here’s what you’ve logged.',
                overtake: 'Here’s a workable target.',
                outlook: 'You’re still in this.',
                challenge: 'Here’s the challenge timing.'
            },
            droll: {
                preview: 'The bureaucracy of walking has prepared your paperwork.',
                leaderboard: 'The numbers have assembled themselves into an order.',
                steps: 'Your feet have left a numerical paper trail.',
                overtake: 'The arithmetic has issued its demands.',
                outlook: 'The crystal ball has been replaced by a spreadsheet.',
                challenge: 'Time continues its undefeated march.'
            },
            sarcastic: {
                preview: 'Apparently even walking requires a confirmation screen.',
                leaderboard: 'Behold: organized peer pressure, now with numbers.',
                steps: 'Evidence that your legs have, in fact, been operational.',
                overtake: 'Good news: the spreadsheet believes in you.',
                outlook: 'Naturally, the leaderboard refuses to make promises.',
                challenge: 'Apparently calendars are part of fitness now.'
            },
            neutral: {
                preview: 'Review these entries before saving.',
                leaderboard: 'Current leaderboard snapshot.',
                steps: 'Your recorded steps.',
                overtake: 'Snapshot calculation.',
                outlook: 'Current challenge outlook.',
                challenge: 'Current challenge timing.'
            }
        };
        return lines[tone]?.[kind] || lines.neutral[kind] || '';
    }

    async function getCsrfToken() {
        if (state.csrfToken) return state.csrfToken;
        const response = await fetch('/api/csrf-token');
        if (!response.ok) throw new Error('Could not initialize secure chat');
        const data = await response.json();
        state.csrfToken = data.csrfToken;
        return state.csrfToken;
    }

    async function postJson(url, body) {
        const csrfToken = await getCsrfToken();
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Chat request failed');
        return data;
    }

    function actionButton(label, className, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        if (className) button.className = className;
        button.addEventListener('click', handler);
        return button;
    }

    function renderStepPreview(result, tone) {
        const summaryText = `${toneLead(tone, 'preview')} ${result.summary.new} new, ${result.summary.conflicts} conflict${result.summary.conflicts === 1 ? '' : 's'}, ${result.summary.unchanged} unchanged.`;
        const message = createMessage('assistant', summaryText);
        addList(message, result.entries.map(entry => {
            if (entry.status === 'new') return `${entry.date}: ${formatNumber(entry.count)} — new`;
            if (entry.status === 'unchanged') return `${entry.date}: ${formatNumber(entry.count)} — already matches`;
            return `${entry.date}: ${formatNumber(entry.existing_count)} → ${formatNumber(entry.count)} — conflict`;
        }));

        if (!result.plan_id) return;
        const actions = document.createElement('div');
        actions.className = 'chat-actions';

        const confirm = async mode => {
            for (const button of actions.querySelectorAll('button')) button.disabled = true;
            try {
                const data = await postJson('/api/chat/confirm', { plan_id: result.plan_id, mode });
                createMessage('assistant', `Saved ${data.result.saved} entr${data.result.saved === 1 ? 'y' : 'ies'}${data.result.skipped ? `; skipped ${data.result.skipped}` : ''}.`);
                actions.remove();
                window.dispatchEvent(new CustomEvent('step-chat-saved'));
            } catch (error) {
                createMessage('error', error.message);
                for (const button of actions.querySelectorAll('button')) button.disabled = false;
            }
        };

        if (result.summary.new > 0) {
            actions.appendChild(actionButton(
                result.summary.conflicts ? 'Save new only' : `Save ${result.summary.new} entr${result.summary.new === 1 ? 'y' : 'ies'}`,
                'secondary',
                () => confirm('new_only')
            ));
        }
        if (result.summary.conflicts > 0) {
            actions.appendChild(actionButton(
                `Overwrite ${result.summary.conflicts} conflict${result.summary.conflicts === 1 ? '' : 's'}`,
                '',
                () => confirm('overwrite_conflicts')
            ));
        }
        message.appendChild(actions);
    }

    function renderLeaderboard(result, tone, reply = null) {
        const label = result.leaderboard === 'team' ? 'team' : 'individual';
        const message = createMessage('assistant', reply || `${toneLead(tone, 'leaderboard')} Top ranked ${label}s:`);
        const rows = result.ranked.slice(0, 10);
        addList(message, rows.map((row, index) => {
            const name = result.leaderboard === 'team' ? row.team : row.name;
            const average = result.leaderboard === 'team' ? row.team_steps_per_day_reported : row.steps_per_day_reported;
            return `${index + 1}. ${name}: ${formatNumber(Math.round(average))} steps/day`;
        }));
        if (!rows.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No ranked entries yet.';
            message.appendChild(empty);
        }
    }

    function renderSteps(result, tone, reply = null) {
        const scope = result.scope === 'active_challenge' && result.challenge
            ? ` for ${result.challenge.name}`
            : result.scope === 'requested_range' ? ' for that date range' : ' across all recorded history';
        const summary = result.summary || { total_steps: 0, days_logged: 0, daily_average: 0 };
        const summaryText = `${toneLead(tone, 'steps')} Your logged-day average${scope} is ${formatNumber(Math.round(summary.daily_average))} steps across ${summary.days_logged} day${summary.days_logged === 1 ? '' : 's'} (${formatNumber(summary.total_steps)} total steps).`;
        const message = createMessage('assistant', reply || summaryText);
        addList(message, result.entries.slice(0, 20).map(entry => `${entry.date}: ${formatNumber(entry.count)}`));
        if (!result.entries.length) {
            const empty = document.createElement('p');
            empty.textContent = 'No matching entries.';
            message.appendChild(empty);
        }
    }

    function renderResult(payload) {
        const { result, tone = 'encouraging', reply = null } = payload;
        if (result.kind === 'step_preview') return renderStepPreview(result, tone);
        if (result.kind === 'leaderboard') return renderLeaderboard(result, tone, reply);
        if (result.kind === 'steps') return renderSteps(result, tone, reply);
        if (result.kind === 'clarification') {
            const message = createMessage('assistant', reply || result.message);
            if (result.candidates?.length) addList(message, result.candidates);
            return;
        }
        if (reply) return createMessage('assistant', reply);
        if (result.kind === 'target_average') {
            const scope = result.scope === 'active_challenge' && result.challenge
                ? ` in ${result.challenge.name}`
                : '';
            const feasibility = result.feasible_under_daily_limit
                ? ''
                : ' That exceeds the app’s 70,000-step daily limit, so this projection is not achievable in the selected time.';
            const text = `${toneLead(tone, 'overtake')} To reach a ${formatNumber(result.target_average)}-step logged-day average${scope}, average ${formatNumber(result.required_daily_average)} steps for ${result.days} day${result.days === 1 ? '' : 's'} (${formatNumber(result.required_total)} additional steps total).${feasibility} Assumption: ${result.assumption}`;
            return createMessage('assistant', text);
        }
        if (result.kind === 'overtake') {
            const feasibility = result.feasible_under_daily_limit
                ? ''
                : ' That exceeds the app’s 70,000-step daily limit, so this projection is not achievable in the selected time.';
            const text = `${toneLead(tone, 'overtake')} To finish above ${result.target.name}’s current ${formatNumber(Math.round(result.target.average))}-step average, average at least ${formatNumber(result.required_daily_average)} steps for ${result.days} day${result.days === 1 ? '' : 's'} (${formatNumber(result.required_total)} additional steps total).${feasibility} Assumption: ${result.assumption}`;
            return createMessage('assistant', text);
        }
        if (result.kind === 'challenge_info') {
            if (!result.has_challenge) return createMessage('assistant', `${toneLead(tone, 'challenge')} There is no active challenge right now.`);
            const challenge = result.challenge;
            let timing;
            if (result.status === 'upcoming') {
                const countdown = result.days_until_start === 1
                    ? ' It starts tomorrow.'
                    : ` It starts in ${result.days_until_start} days.`;
                timing = `${challenge.name} starts ${formatDate(challenge.start_date)} and ends ${formatDate(challenge.end_date)}.${countdown} It lasts ${result.total_days} days.`;
            } else if (result.status === 'ended') {
                timing = `${challenge.name} ran from ${formatDate(challenge.start_date)} through ${formatDate(challenge.end_date)} and has ended.`;
            } else {
                const perspective = result.as_of_date ? `As of ${formatDate(result.as_of_date)}, that will be` : 'This is';
                const inclusion = result.as_of_date ? 'including that date' : 'including today';
                timing = `${challenge.name} runs through ${formatDate(challenge.end_date)}. ${perspective} day ${result.current_day} of ${result.total_days}, with ${result.remaining_days} day${result.remaining_days === 1 ? '' : 's'} left ${inclusion}.`;
            }
            return createMessage('assistant', `${toneLead(tone, 'challenge')} ${timing}`);
        }
        if (result.kind === 'outlook') {
            if (!result.has_entry) {
                const reason = result.reason === 'no_team'
                    ? 'You are not assigned to a team yet, so the team crystal ball is on administrative leave.'
                    : 'You do not have a challenge entry yet. Log a day and the leaderboard will have something to gossip about.';
                return createMessage('assistant', `${toneLead(tone, 'outlook')} ${reason}`);
            }
            const subject = result.leaderboard === 'team' ? result.name : 'You';
            let snapshot;
            if (result.ranked && result.rank === 1) {
                snapshot = `${subject} ${result.leaderboard === 'team' ? 'is' : 'are'} currently in first at ${formatNumber(Math.round(result.average))} steps/day. That is the best available answer to “will I win,” although the future remains annoyingly editable.`;
            } else if (result.ranked) {
                snapshot = `${subject} ${result.leaderboard === 'team' ? 'is' : 'are'} currently #${result.rank} of ${result.ranked_count} ranked ${result.leaderboard === 'team' ? 'teams' : 'participants'}, ${formatNumber(Math.round(result.gap_to_leader))} steps/day behind ${result.leader?.name || 'the leader'}. No verdict yet.`;
            } else {
                snapshot = `${subject} ${result.leaderboard === 'team' ? 'is' : 'are'} not ranked yet. ${result.leaderboard === 'individual' ? `Your reporting rate is ${formatNumber(result.reporting_rate)}%. ` : ''}The competition cannot properly fear incomplete paperwork.`;
            }
            const remaining = result.remaining_days ? ` ${result.remaining_days} challenge day${result.remaining_days === 1 ? '' : 's'} remain.` : '';
            return createMessage('assistant', `${toneLead(tone, 'outlook')} ${snapshot}${remaining}`);
        }
        if (result.kind === 'encouragement') {
            const days = result.summary?.days_logged || 0;
            const average = Math.round(result.summary?.daily_average || 0);
            const lines = {
                encouraging: days
                    ? `You have already shown up ${days} day${days === 1 ? '' : 's'} and averaged ${formatNumber(average)} steps. Keep stacking ordinary days; that is how impressive totals happen.`
                    : 'The first entry does not need to be heroic. Take the walk, log the number, and give tomorrow something to build on.',
                neutral: days
                    ? `You have logged ${days} day${days === 1 ? '' : 's'} at an average of ${formatNumber(average)} steps. Keep going.`
                    : 'Start with one walk and one honest entry.',
                droll: days
                    ? `${days} logged day${days === 1 ? '' : 's'} at ${formatNumber(average)} steps on average. Your legs have submitted credible evidence of effort.`
                    : 'Every grand campaign begins with someone reluctantly putting on shoes.',
                sarcastic: days
                    ? `Look at that: ${days} logged day${days === 1 ? '' : 's'} and a ${formatNumber(average)}-step average. Apparently consistency works. Rude, but useful.`
                    : 'You could wait for motivation to file the proper paperwork, or you could take ten minutes and make it catch up.'
            };
            return createMessage('assistant', lines[tone] || lines.encouraging);
        }
        if (result.kind === 'chitchat') {
            const lines = {
                encouraging: 'Hi! I’m Trotter: part scorekeeper, part pace calculator, and fully in favor of a good walk. What are we working on?',
                neutral: 'I’m Trotter. I can help record steps, explain the challenge, inspect standings, and calculate useful targets.',
                droll: 'I’m Trotter, a highly specialized conversational layer over a database of people walking around on purpose.',
                sarcastic: 'I’m Trotter: because apparently feet needed analytics, conflict handling, and a personality setting.'
            };
            return createMessage('assistant', lines[tone] || lines.encouraging);
        }
        createMessage('assistant', result.message || 'I can help with step entries, challenge details, standings, targets, and the occasional morale boost.');
    }

    async function initializeConfig() {
        const transcript = document.getElementById('chatTranscript');
        const sendButton = document.getElementById('chatSendBtn');
        sendButton.disabled = true;
        try {
            const response = await fetch('/api/chat/config');
            if (!response.ok) throw new Error('Chat configuration unavailable');
            const config = await response.json();
            state.configured = config.enabled;
            const previousScope = sessionStorage.getItem(STORAGE_SCOPE_KEY);
            if (previousScope && previousScope !== config.transcript_scope) {
                for (const key of Object.keys(sessionStorage)) {
                    if (key.startsWith(`${STORAGE_KEY_PREFIX}:`)) sessionStorage.removeItem(key);
                }
            }
            sessionStorage.setItem(STORAGE_SCOPE_KEY, config.transcript_scope);
            state.storageKey = `${STORAGE_KEY_PREFIX}:${config.transcript_scope}`;
            sessionStorage.removeItem(LEGACY_STORAGE_KEY);
            loadStoredMessages();
            transcript.replaceChildren();
            if (state.messages.length) {
                for (const item of state.messages) createMessage(item.role, item.text, false);
            } else {
                createMessage('assistant', 'Hi! I can log steps, explain the challenge, show standings, calculate targets, or provide a suspiciously well-formatted pep talk.', false);
            }
            if (!config.enabled) {
                createMessage('assistant', 'Trotter is ready, but a server-side model and API key still need to be selected.', false);
            }
            sendButton.disabled = !config.enabled;
        } catch (error) {
            state.configured = false;
            transcript.replaceChildren();
            createMessage('error', error.message, false);
            sendButton.disabled = true;
        }
    }

    function syncVisualViewport() {
        const overlay = document.getElementById('stepChatOverlay');
        if (!overlay) return;
        const viewport = window.visualViewport;
        overlay.style.setProperty('--chat-visual-height', `${Math.round(viewport?.height || window.innerHeight)}px`);
        overlay.style.setProperty('--chat-visual-top', `${Math.round(viewport?.offsetTop || 0)}px`);
    }

    function openChat() {
        const overlay = document.getElementById('stepChatOverlay');
        syncVisualViewport();
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        document.getElementById('chatInput').focus();
    }

    function closeChat() {
        document.getElementById('stepChatOverlay').hidden = true;
        document.body.style.overflow = '';
        document.getElementById('chatOpenBtn').focus();
    }

    document.addEventListener('DOMContentLoaded', () => {
        const overlay = document.getElementById('stepChatOverlay');
        const transcript = document.getElementById('chatTranscript');
        const form = document.getElementById('chatForm');
        const input = document.getElementById('chatInput');
        const sendButton = document.getElementById('chatSendBtn');
        const toneSelect = document.getElementById('chatToneSelect');
        if (!overlay || !form) return;

        // Escape the dashboard container's stacking context so Tidbits and
        // other page cards can never paint above the modal.
        document.body.appendChild(overlay);
        syncVisualViewport();
        window.visualViewport?.addEventListener('resize', syncVisualViewport);
        window.visualViewport?.addEventListener('scroll', syncVisualViewport);
        window.addEventListener('orientationchange', syncVisualViewport);
        input.addEventListener('focus', () => {
            setTimeout(() => {
                syncVisualViewport();
                transcript.scrollTop = transcript.scrollHeight;
            }, 50);
        });

        const storedTone = sessionStorage.getItem(TONE_STORAGE_KEY);
        if (['encouraging', 'neutral', 'droll', 'sarcastic'].includes(storedTone)) toneSelect.value = storedTone;
        toneSelect.addEventListener('change', () => sessionStorage.setItem(TONE_STORAGE_KEY, toneSelect.value));

        createMessage('assistant', 'Trotter is trotting over…', false);
        initializeConfig();

        document.getElementById('chatOpenBtn').addEventListener('click', openChat);
        document.getElementById('chatCloseBtn').addEventListener('click', closeChat);
        document.getElementById('chatClearBtn').addEventListener('click', () => {
            state.messages = [];
            if (state.storageKey) sessionStorage.removeItem(state.storageKey);
            transcript.replaceChildren();
            createMessage('assistant', 'Transcript cleared. What would you like to do?', false);
        });
        overlay.addEventListener('click', event => { if (event.target === overlay) closeChat(); });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                form.requestSubmit();
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !overlay.hidden) closeChat();
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const message = input.value.trim();
            if (!message) return;
            createMessage('user', message);
            input.value = '';
            sendButton.disabled = true;
            sendButton.textContent = 'Thinking…';
            try {
                const payload = await postJson('/api/chat', {
                    message,
                    history: getRecentHistory(),
                    tone: toneSelect.value,
                    ...getClientDateContext()
                });
                renderResult(payload);
            } catch (error) {
                createMessage('error', error.message);
            } finally {
                sendButton.disabled = false;
                sendButton.textContent = 'Send';
                input.focus();
            }
        });
    });
})();
