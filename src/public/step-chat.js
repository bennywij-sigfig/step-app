(() => {
    const STORAGE_KEY_PREFIX = 'stepChatTranscriptV3';
    const LEGACY_STORAGE_KEYS = ['stepChatTranscriptV1', 'stepChatTranscriptV2'];
    const STORAGE_SCOPE_KEY = 'stepChatTranscriptScopeV3';
    const REMEMBER_KEY_PREFIX = 'stepChatRememberV1';
    const TONE_STORAGE_KEY = 'stepChatToneV1';
    const MAX_STORED_MESSAGES = 300;
    const MAX_STORED_CHARACTERS = 500000;
    const TRANSCRIPT_TTL_MS = 21 * 24 * 60 * 60 * 1000;
    const CONTEXT_MESSAGE_LIMIT = 50;
    const CONTEXT_CHARACTER_LIMIT = 35000;
    const state = {
        csrfToken: null,
        messages: [],
        configured: null,
        storageKey: null,
        storageScope: null,
        rememberOnDevice: false,
        imageObjectUrl: null,
        imageUploadEnabled: false,
        imageBusy: false
    };

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

    function trimMessages(messages, maxMessages, maxCharacters) {
        const accepted = [];
        let characters = 0;
        for (let index = messages.length - 1; index >= 0 && accepted.length < maxMessages; index -= 1) {
            const item = messages[index];
            if (!item || !['user', 'assistant', 'error'].includes(item.role) || typeof item.text !== 'string') continue;
            const remaining = maxCharacters - characters;
            if (remaining <= 0) break;
            const text = item.text.slice(-remaining);
            accepted.unshift({ role: item.role, text });
            characters += text.length;
        }
        return accepted;
    }

    function transcriptStorage() {
        return state.rememberOnDevice ? localStorage : sessionStorage;
    }

    function loadStoredMessages() {
        state.messages = [];
        if (!state.storageKey) return;
        try {
            const storage = transcriptStorage();
            const raw = storage.getItem(state.storageKey);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            const envelope = Array.isArray(parsed) ? { updatedAt: Date.now(), messages: parsed } : parsed;
            if (!envelope || !Array.isArray(envelope.messages)) return;
            if (Date.now() - Number(envelope.updatedAt || 0) > TRANSCRIPT_TTL_MS) {
                storage.removeItem(state.storageKey);
                return;
            }
            state.messages = trimMessages(envelope.messages, MAX_STORED_MESSAGES, MAX_STORED_CHARACTERS);
        } catch (_) {
            state.messages = [];
        }
    }

    function saveMessages() {
        if (!state.storageKey) return;
        state.messages = trimMessages(state.messages, MAX_STORED_MESSAGES, MAX_STORED_CHARACTERS);
        try {
            transcriptStorage().setItem(state.storageKey, JSON.stringify({
                updatedAt: Date.now(),
                messages: state.messages
            }));
        } catch (_) {
            // If persistent storage is unavailable or full, preserve the current
            // tab transcript without failing the chat request.
            state.rememberOnDevice = false;
            if (state.storageScope) localStorage.setItem(`${REMEMBER_KEY_PREFIX}:${state.storageScope}`, 'false');
            const toggle = document.getElementById('chatRememberToggle');
            if (toggle) toggle.checked = false;
            sessionStorage.setItem(state.storageKey, JSON.stringify({
                updatedAt: Date.now(),
                messages: state.messages
            }));
        }
    }

    function remember(role, text) {
        state.messages.push({ role, text: String(text).slice(0, 4000) });
        saveMessages();
    }

    function getRecentHistory() {
        return trimMessages(
            state.messages
                .slice(0, -1) // The current user message is sent separately.
                .filter(item => ['user', 'assistant'].includes(item.role)),
            CONTEXT_MESSAGE_LIMIT,
            CONTEXT_CHARACTER_LIMIT
        );
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
            annoying: {
                preview: 'OINK OINK! Your glorious step payload is ready for a proper snout-first inspection!',
                leaderboard: 'OINK! The leaderboard trough has been filled with fresh numbers!',
                steps: 'Oinkity oink! Here is the hoof-stamped record of your magnificent movement!',
                overtake: 'OINK! Trotter has crunched the numbers with maximum porcine intensity!',
                outlook: 'Oink oink! The competitive piglet forecast is officially in!',
                challenge: 'OINK! Gather round the trough for an aggressively enthusiastic calendar update!'
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

    async function prepareImage(file) {
        if (!file || file.size > 20 * 1024 * 1024) {
            throw new Error('Choose an image smaller than 20 MB.');
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            throw new Error('Use a JPEG, PNG, or WebP image.');
        }
        let bitmap;
        let fallbackUrl = null;
        if (typeof createImageBitmap === 'function') {
            bitmap = await createImageBitmap(file);
        } else {
            fallbackUrl = URL.createObjectURL(file);
            bitmap = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('That image could not be opened.'));
                image.src = fallbackUrl;
            });
        }
        try {
            const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            if (!blob || blob.size > 5 * 1024 * 1024) {
                throw new Error('The processed image is still too large. Try a tighter crop.');
            }
            return blob;
        } finally {
            bitmap.close?.();
            if (fallbackUrl) URL.revokeObjectURL(fallbackUrl);
        }
    }

    async function extractImage(blob) {
        const csrfToken = await getCsrfToken();
        const dateContext = getClientDateContext();
        const response = await fetch('/api/chat/image/extract', {
            method: 'POST',
            headers: {
                'Content-Type': blob.type,
                'X-CSRF-Token': csrfToken,
                'X-Client-Date': dateContext.client_date,
                'X-Client-Timezone': dateContext.client_timezone
            },
            body: blob
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Trotter could not inspect that image.');
        return data.extraction;
    }

    function renderImageExtraction(extraction, blob) {
        if (state.imageObjectUrl) URL.revokeObjectURL(state.imageObjectUrl);
        state.imageObjectUrl = URL.createObjectURL(blob);
        if (!extraction.recognized || !extraction.entries.length) {
            URL.revokeObjectURL(state.imageObjectUrl);
            state.imageObjectUrl = null;
            createMessage('assistant', 'I could not find clear date-and-step pairs in that image. Try a tighter screenshot that shows both values.', false);
            return;
        }

        const message = createMessage('assistant', 'I found these possible entries. Please correct anything that looks wrong before previewing the save.', false);
        message.classList.add('chat-image-review');
        const image = document.createElement('img');
        image.className = 'chat-image-thumb';
        image.src = state.imageObjectUrl;
        image.alt = 'Uploaded step screenshot preview';
        message.appendChild(image);

        const rows = [];
        extraction.entries.forEach((entry, index) => {
            const row = document.createElement('div');
            row.className = 'chat-image-entry';
            const include = document.createElement('input');
            include.type = 'checkbox';
            include.checked = Boolean(entry.date && Number.isInteger(entry.count));
            include.setAttribute('aria-label', `Include extracted entry ${index + 1}`);
            const date = document.createElement('input');
            date.type = 'date';
            date.value = entry.date || '';
            date.setAttribute('aria-label', `Date for extracted entry ${index + 1}`);
            const count = document.createElement('input');
            count.type = 'number';
            count.min = '0';
            count.max = '70000';
            count.inputMode = 'numeric';
            count.value = Number.isInteger(entry.count) ? String(entry.count) : '';
            count.setAttribute('aria-label', `Steps for extracted entry ${index + 1}`);
            row.append(include, date, count);
            const detail = document.createElement('div');
            detail.className = 'chat-image-confidence';
            detail.style.gridColumn = '2 / -1';
            detail.textContent = `${entry.confidence} confidence${entry.raw_date ? ` · read as “${entry.raw_date}”` : ''}${entry.note ? ` · ${entry.note}` : ''}`;
            row.appendChild(detail);
            message.appendChild(row);
            rows.push({ include, date, count });
        });

        for (const warningText of extraction.warnings || []) {
            const warning = document.createElement('div');
            warning.className = 'chat-image-warning';
            warning.textContent = `⚠ ${warningText}`;
            message.appendChild(warning);
        }

        const actions = document.createElement('div');
        actions.className = 'chat-actions';
        const previewButton = actionButton('Preview selected entries', '', async () => {
            const selectedRows = rows.filter(row => row.include.checked);
            const entries = selectedRows.map(row => ({
                date: row.date.value,
                count: row.count.value.trim() === '' ? null : Number(row.count.value)
            }));
            if (!entries.length || entries.some(entry =>
                !entry.date || !Number.isInteger(entry.count) || entry.count < 0 || entry.count > 70000
            )) {
                createMessage('error', 'Select at least one row and provide a valid date and whole-number step count.', false);
                return;
            }

            const originalLabel = previewButton.textContent;
            previewButton.style.width = `${previewButton.getBoundingClientRect().width}px`;
            previewButton.textContent = 'Previewing…';
            previewButton.setAttribute('aria-busy', 'true');
            for (const button of actions.querySelectorAll('button')) button.disabled = true;
            try {
                const payload = await postJson('/api/chat/entries/preview', {
                    entries,
                    tone: document.getElementById('chatToneSelect').value
                });
                renderResult(payload);
                actions.remove();
            } catch (error) {
                const networkFailure = /load failed|failed to fetch|network/i.test(error.message);
                createMessage(
                    'error',
                    networkFailure
                        ? 'Trotter could not reach the server. Your reviewed entries are still here—please try Preview again.'
                        : error.message,
                    false
                );
                previewButton.textContent = originalLabel;
                previewButton.removeAttribute('aria-busy');
                for (const button of actions.querySelectorAll('button')) button.disabled = false;
            }
        });
        actions.appendChild(previewButton);
        message.appendChild(actions);
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

    function renderTeamRenamePreview(result) {
        const message = createMessage('assistant', `Rename “${result.current_name}” to “${result.proposed_name}”? Nothing changes until you confirm.`);
        if (!result.plan_id) return;
        const actions = document.createElement('div');
        actions.className = 'chat-actions';
        const confirm = actionButton('Rename team', '', async () => {
            for (const button of actions.querySelectorAll('button')) button.disabled = true;
            try {
                const data = await postJson('/api/chat/team-rename/confirm', { plan_id: result.plan_id });
                createMessage('assistant', `Your team is now “${data.result.name}”.`);
                actions.remove();
                window.dispatchEvent(new CustomEvent('team-renamed'));
            } catch (error) {
                createMessage('error', error.message);
                for (const button of actions.querySelectorAll('button')) button.disabled = false;
            }
        });
        actions.appendChild(confirm);
        actions.appendChild(actionButton('Cancel', 'secondary', () => {
            actions.remove();
            createMessage('assistant', 'Team name left unchanged.');
        }));
        message.appendChild(actions);
    }

    function appendVerifiedFacts(message, lines, options = {}) {
        const { collapsed = false, summary = 'Verified' } = options;
        if (collapsed) {
            const details = document.createElement('details');
            details.className = 'chat-verified-facts collapsed';
            const heading = document.createElement('summary');
            heading.textContent = summary;
            details.appendChild(heading);
            addList(details, lines);
            message.appendChild(details);
            return;
        }
        const box = document.createElement('div');
        box.className = 'chat-verified-facts';
        const title = document.createElement('strong');
        title.textContent = summary;
        box.appendChild(title);
        addList(box, lines);
        message.appendChild(box);
    }

    function shortDate(value) {
        return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric'
        });
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
        const { result, tone = 'neutral', reply = null } = payload;
        if (result.kind === 'step_preview') return renderStepPreview(result, tone);
        if (result.kind === 'team_rename_preview') return renderTeamRenamePreview(result);
        if (result.kind === 'leaderboard') return renderLeaderboard(result, tone, reply);
        if (result.kind === 'steps') return renderSteps(result, tone, reply);
        if (result.kind === 'my_team') {
            const text = result.has_team ? `Your team is “${result.name}”.` : 'You are not assigned to a team yet.';
            return createMessage('assistant', reply || text);
        }
        if (result.kind === 'clarification') {
            const message = createMessage('assistant', reply || result.message);
            if (result.candidates?.length) addList(message, result.candidates);
            return;
        }
        const verifiedKinds = new Set(['target_average', 'overtake', 'challenge_info', 'outlook']);
        if (reply && !verifiedKinds.has(result.kind)) return createMessage('assistant', reply);
        if (result.kind === 'target_average') {
            const scope = result.scope === 'active_challenge' && result.challenge
                ? ` in ${result.challenge.name}`
                : '';
            const feasibility = result.feasible_under_daily_limit
                ? ''
                : ' That exceeds the app’s 70,000-step daily limit, so this projection is not achievable in the selected time.';
            const text = `${toneLead(tone, 'overtake')} To reach a ${formatNumber(result.target_average)}-step logged-day average${scope}, average ${formatNumber(result.required_daily_average)} steps for ${result.days} day${result.days === 1 ? '' : 's'} (${formatNumber(result.required_total)} additional steps total).${feasibility} Assumption: ${result.assumption}`;
            const message = createMessage('assistant', reply || text);
            appendVerifiedFacts(message, [
                `Target average: ${formatNumber(result.target_average)} steps/day`,
                `Required pace: ${formatNumber(result.required_daily_average)} steps/day for ${result.days} day${result.days === 1 ? '' : 's'}`,
                `Additional steps: ${formatNumber(result.required_total)}`,
                `Within daily limit: ${result.feasible_under_daily_limit ? 'yes' : 'no'}`
            ]);
            return;
        }
        if (result.kind === 'overtake') {
            const feasibility = result.feasible_under_daily_limit
                ? ''
                : ' That exceeds the app’s 70,000-step daily limit, so this projection is not achievable in the selected time.';
            const text = `${toneLead(tone, 'overtake')} To finish above ${result.target.name}’s current ${formatNumber(Math.round(result.target.average))}-step average, average at least ${formatNumber(result.required_daily_average)} steps for ${result.days} day${result.days === 1 ? '' : 's'} (${formatNumber(result.required_total)} additional steps total).${feasibility} Assumption: ${result.assumption}`;
            const message = createMessage('assistant', reply || text);
            appendVerifiedFacts(message, [
                `Target: ${result.target.name} at ${formatNumber(Math.round(result.target.average))} steps/day`,
                `Required pace: ${formatNumber(result.required_daily_average)} steps/day for ${result.days} day${result.days === 1 ? '' : 's'}`,
                `Additional steps: ${formatNumber(result.required_total)}`,
                `Within daily limit: ${result.feasible_under_daily_limit ? 'yes' : 'no'}`
            ]);
            return;
        }
        if (result.kind === 'challenge_info') {
            if (!result.has_challenge) return createMessage('assistant', reply || `${toneLead(tone, 'challenge')} There is no active challenge right now.`);
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
            const message = createMessage('assistant', reply || `${toneLead(tone, 'challenge')} ${timing}`);
            const timingSummary = result.status === 'upcoming'
                ? `Verified: starts ${shortDate(challenge.start_date)} in ${result.days_until_start} day${result.days_until_start === 1 ? '' : 's'}`
                : result.status === 'active'
                    ? `Verified: ends ${shortDate(challenge.end_date)} in ${result.days_until_end} day${result.days_until_end === 1 ? '' : 's'}`
                    : `Verified: ended ${shortDate(challenge.end_date)}`;
            appendVerifiedFacts(message, [
                `Starts: ${formatDate(challenge.start_date)}`,
                `Ends: ${formatDate(challenge.end_date)}`,
                `Status: ${result.status}`,
                `Days until start: ${result.days_until_start}`,
                `Days until end: ${result.days_until_end}`,
                `Challenge days remaining: ${result.remaining_days}`
            ], { collapsed: Boolean(reply), summary: timingSummary });
            return;
        }
        if (result.kind === 'outlook') {
            if (!result.has_entry) {
                const reason = result.reason === 'no_team'
                    ? 'You are not assigned to a team yet, so the team crystal ball is on administrative leave.'
                    : 'You do not have a challenge entry yet. Log a day and the leaderboard will have something to gossip about.';
                return createMessage('assistant', reply || `${toneLead(tone, 'outlook')} ${reason}`);
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
            const message = createMessage('assistant', reply || `${toneLead(tone, 'outlook')} ${snapshot}${remaining}`);
            const rankSummary = result.rank
                ? `Verified: #${result.rank} of ${result.ranked_count}`
                : `Verified: ${result.ranked ? 'ranked' : 'not ranked'}`;
            appendVerifiedFacts(message, [
                `Ranked: ${result.ranked ? 'yes' : 'no'}`,
                ...(result.rank ? [`Rank: ${result.rank} of ${result.ranked_count}`] : []),
                `Current average: ${formatNumber(Math.round(result.average || 0))} steps/day`,
                `Challenge days remaining: ${result.remaining_days}`
            ], { collapsed: Boolean(reply), summary: rankSummary });
            return;
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
                    : 'You could wait for motivation to file the proper paperwork, or you could take ten minutes and make it catch up.',
                annoying: days
                    ? `OINK OINK OINK! ${days} hoof-tastic logged day${days === 1 ? '' : 's'} at ${formatNumber(average)} steps on average! Trotter is squealing at the trough with entirely too much enthusiasm!`
                    : 'OINK! The step trough is empty, the tiny pig hooves are tapping, and Trotter demands one gloriously over-celebrated walk!'
            };
            return createMessage('assistant', lines[tone] || lines.encouraging);
        }
        if (result.kind === 'chitchat') {
            const lines = {
                encouraging: 'Hi! I’m Trotter: part scorekeeper, part pace calculator, and fully in favor of a good walk. What are we working on?',
                neutral: 'I’m Trotter. I can help record steps, explain the challenge, inspect standings, and calculate useful targets.',
                droll: 'I’m Trotter, a highly specialized conversational layer over a database of people walking around on purpose.',
                sarcastic: 'I’m Trotter: because apparently feet needed analytics, conflict handling, and a personality setting.',
                annoying: 'OINK OINK! I’m Trotter, your relentlessly enthusiastic step pig! I track the hoofy numbers, patrol the leaderboard trough, and celebrate every trot with far more oinking than anyone requested!'
            };
            return createMessage('assistant', lines[tone] || lines.encouraging);
        }
        createMessage('assistant', result.message || 'I can help with step entries, challenge details, standings, targets, and the occasional morale boost.');
    }

    function setImageButtonDisabled(disabled) {
        const button = document.getElementById('chatImageBtn');
        const input = document.getElementById('chatImageInput');
        if (!button || !input) return;
        button.setAttribute('aria-disabled', String(disabled));
        button.tabIndex = disabled ? -1 : 0;
        input.disabled = disabled;
    }

    async function processImageFile(file) {
        if (!state.imageUploadEnabled) {
            createMessage('error', 'Image upload is not available right now.', false);
            return;
        }
        if (state.imageBusy) {
            createMessage('error', 'Trotter is already inspecting an image.', false);
            return;
        }

        state.imageBusy = true;
        setImageButtonDisabled(true);
        createMessage('user', 'Uploaded a step screenshot for review.');
        const loading = createMessage('assistant', 'Trotter is squinting at the screenshot…', false);
        try {
            const blob = await prepareImage(file);
            const extraction = await extractImage(blob);
            loading.remove();
            renderImageExtraction(extraction, blob);
        } catch (error) {
            loading.remove();
            createMessage('error', error.message, false);
        } finally {
            state.imageBusy = false;
            setImageButtonDisabled(!state.imageUploadEnabled);
        }
    }

    function setRememberOnDevice(enabled) {
        if (!state.storageKey || !state.storageScope) return;
        const preferenceKey = `${REMEMBER_KEY_PREFIX}:${state.storageScope}`;
        if (enabled) {
            sessionStorage.removeItem(state.storageKey);
            state.rememberOnDevice = true;
            localStorage.setItem(preferenceKey, 'true');
        } else {
            localStorage.removeItem(state.storageKey);
            localStorage.setItem(preferenceKey, 'false');
            state.rememberOnDevice = false;
        }
        saveMessages();
        const toggle = document.getElementById('chatRememberToggle');
        if (toggle) toggle.checked = state.rememberOnDevice;
    }

    async function initializeConfig() {
        const transcript = document.getElementById('chatTranscript');
        const sendButton = document.getElementById('chatSendBtn');
        sendButton.disabled = true;
        setImageButtonDisabled(true);
        try {
            const response = await fetch('/api/chat/config');
            if (!response.ok) throw new Error('Chat configuration unavailable');
            const config = await response.json();
            state.configured = config.enabled;
            state.imageUploadEnabled = config.enabled && config.image_upload;
            state.storageScope = config.transcript_scope;
            const previousScope = sessionStorage.getItem(STORAGE_SCOPE_KEY);
            if (previousScope && previousScope !== state.storageScope) {
                for (const key of Object.keys(sessionStorage)) {
                    if (key.startsWith(`${STORAGE_KEY_PREFIX}:`)) sessionStorage.removeItem(key);
                }
            }
            sessionStorage.setItem(STORAGE_SCOPE_KEY, state.storageScope);
            state.storageKey = `${STORAGE_KEY_PREFIX}:${state.storageScope}`;
            const rememberPreferenceKey = `${REMEMBER_KEY_PREFIX}:${state.storageScope}`;
            const storedRememberPreference = localStorage.getItem(rememberPreferenceKey);
            // Persistent transcript is the default; users can explicitly turn
            // it off to keep messages in this tab only.
            state.rememberOnDevice = storedRememberPreference !== 'false';
            if (storedRememberPreference === null) localStorage.setItem(rememberPreferenceKey, 'true');
            if (state.rememberOnDevice && !localStorage.getItem(state.storageKey)) {
                const temporaryTranscript = sessionStorage.getItem(state.storageKey);
                if (temporaryTranscript) {
                    try {
                        localStorage.setItem(state.storageKey, temporaryTranscript);
                        sessionStorage.removeItem(state.storageKey);
                    } catch (_) {
                        state.rememberOnDevice = false;
                        localStorage.setItem(rememberPreferenceKey, 'false');
                    }
                }
            }
            const rememberToggle = document.getElementById('chatRememberToggle');
            if (rememberToggle) rememberToggle.checked = state.rememberOnDevice;
            for (const legacyKey of LEGACY_STORAGE_KEYS) {
                sessionStorage.removeItem(legacyKey);
                sessionStorage.removeItem(`${legacyKey}:${state.storageScope}`);
            }
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
            setImageButtonDisabled(!state.imageUploadEnabled);
        } catch (error) {
            state.configured = false;
            transcript.replaceChildren();
            createMessage('error', error.message, false);
            sendButton.disabled = true;
            setImageButtonDisabled(true);
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
        document.body.classList.add('trotter-open');
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
        document.getElementById('chatInput').focus();
    }

    function closeChat() {
        document.getElementById('stepChatOverlay').hidden = true;
        document.body.classList.remove('trotter-open');
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
        const imageButton = document.getElementById('chatImageBtn');
        const imageInput = document.getElementById('chatImageInput');
        const aboutButton = document.getElementById('chatAboutBtn');
        const aboutPopover = document.getElementById('chatAboutPopover');
        const rememberToggle = document.getElementById('chatRememberToggle');
        if (!overlay || !form) return;

        const closeAbout = () => {
            aboutPopover.hidden = true;
            aboutButton.setAttribute('aria-expanded', 'false');
        };
        const resizeComposerInput = () => {
            input.style.height = '48px';
            input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
        };

        // Escape the dashboard container's stacking context so Tidbits and
        // other page cards can never paint above the modal.
        document.body.appendChild(overlay);
        syncVisualViewport();
        window.visualViewport?.addEventListener('resize', syncVisualViewport);
        window.visualViewport?.addEventListener('scroll', syncVisualViewport);
        window.addEventListener('orientationchange', syncVisualViewport);
        window.addEventListener('beforeunload', () => {
            if (state.imageObjectUrl) URL.revokeObjectURL(state.imageObjectUrl);
        });
        input.addEventListener('input', resizeComposerInput);
        input.addEventListener('paste', event => {
            const clipboard = event.clipboardData;
            if (!clipboard) return;

            const imageItem = Array.from(clipboard.items || []).find(item =>
                item.kind === 'file' && String(item.type).toLowerCase().startsWith('image/')
            );
            const file = imageItem?.getAsFile()
                || Array.from(clipboard.files || []).find(candidate => String(candidate.type).toLowerCase().startsWith('image/'));
            if (!file) return;

            event.preventDefault();
            processImageFile(file);
        });
        input.addEventListener('focus', () => {
            setTimeout(() => {
                syncVisualViewport();
                transcript.scrollTop = transcript.scrollHeight;
            }, 50);
        });

        const storedTone = sessionStorage.getItem(TONE_STORAGE_KEY);
        if (['encouraging', 'neutral', 'droll', 'sarcastic', 'annoying'].includes(storedTone)) toneSelect.value = storedTone;
        toneSelect.addEventListener('change', () => sessionStorage.setItem(TONE_STORAGE_KEY, toneSelect.value));

        createMessage('assistant', 'Trotter is trotting over…', false);
        initializeConfig();

        document.getElementById('chatOpenBtn').addEventListener('click', openChat);
        document.getElementById('chatCloseBtn').addEventListener('click', () => {
            closeAbout();
            closeChat();
        });
        aboutButton.addEventListener('click', () => {
            const willOpen = aboutPopover.hidden;
            aboutPopover.hidden = !willOpen;
            aboutButton.setAttribute('aria-expanded', String(willOpen));
        });
        rememberToggle.addEventListener('change', () => setRememberOnDevice(rememberToggle.checked));
        imageButton.addEventListener('click', event => {
            if (imageButton.getAttribute('aria-disabled') === 'true') event.preventDefault();
        });
        imageButton.addEventListener('keydown', event => {
            if (imageButton.getAttribute('aria-disabled') === 'true') return;
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                imageInput.click();
            }
        });
        imageInput.addEventListener('change', () => {
            const file = imageInput.files?.[0];
            imageInput.value = '';
            if (file) processImageFile(file);
        });
        document.getElementById('chatClearBtn').addEventListener('click', () => {
            state.messages = [];
            if (state.storageKey) {
                sessionStorage.removeItem(state.storageKey);
                localStorage.removeItem(state.storageKey);
            }
            if (state.imageObjectUrl) {
                URL.revokeObjectURL(state.imageObjectUrl);
                state.imageObjectUrl = null;
            }
            transcript.replaceChildren();
            createMessage('assistant', 'Transcript cleared. What would you like to do?', false);
        });
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                closeAbout();
                closeChat();
            }
        });
        document.addEventListener('click', event => {
            if (!event.target.closest('.chat-about')) closeAbout();
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                form.requestSubmit();
            }
        });
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || overlay.hidden) return;
            if (!aboutPopover.hidden) {
                closeAbout();
                aboutButton.focus();
                return;
            }
            closeChat();
        });

        form.addEventListener('submit', async event => {
            event.preventDefault();
            const message = input.value.trim();
            if (!message) return;
            createMessage('user', message);
            input.value = '';
            resizeComposerInput();
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
