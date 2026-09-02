(() => {
    'use strict';

    const byId = id => document.getElementById(id);
    const escapeHtml = value => String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete']);

    function responseDescription(spec, response) {
        if (response.description) return response.description;
        const reference = response.$ref;
        if (!reference) return 'Response';
        const name = reference.split('/').pop();
        return spec.components?.responses?.[name]?.description || 'Response';
    }

    function endpointCard(spec, path, method, operation, index) {
        const parameters = operation.parameters || [];
        const requestExample = operation.requestBody?.content?.['application/json']?.example;
        const sample = operation['x-codeSamples']?.[0]?.source;
        const scope = operation['x-required-scope'];
        const parameterSection = parameters.length ? `
            <h3>Parameters</h3>
            <ul class="parameter-list">
                ${parameters.map(parameter => `
                    <li>
                        <code>${escapeHtml(parameter.name)}${parameter.required ? ' *' : ''}</code>
                        <span>${escapeHtml(parameter.description || '')} <small>(${escapeHtml(parameter.in)})</small></span>
                    </li>
                `).join('')}
            </ul>
        ` : '';
        const bodySection = requestExample ? `
            <h3>JSON body</h3>
            <pre><code>${escapeHtml(JSON.stringify(requestExample, null, 2))}</code></pre>
        ` : '';
        const sampleSection = sample ? `
            <h3>Example</h3>
            <div class="code-sample">
                <button type="button" class="copy-button" data-copy-sample="${index}">Copy</button>
                <pre><code id="codeSample-${index}">${escapeHtml(sample)}</code></pre>
            </div>
        ` : '';
        const responses = Object.entries(operation.responses || {}).map(([status, response]) => `
            <li><span class="response-code">${escapeHtml(status)}</span><span>${escapeHtml(responseDescription(spec, response))}</span></li>
        `).join('');

        return `
            <details class="endpoint" data-method="${escapeHtml(method)}" ${index === 0 ? 'open' : ''}>
                <summary>
                    <span class="method">${escapeHtml(method.toUpperCase())}</span>
                    <span class="endpoint-path">${escapeHtml(path)}</span>
                    <span class="endpoint-summary">${escapeHtml(operation.summary || '')}</span>
                    ${scope ? `<span class="scope">${escapeHtml(scope)}</span>` : ''}
                </summary>
                <div class="endpoint-content">
                    <p>${escapeHtml(operation.description || '')}</p>
                    ${parameterSection}
                    ${bodySection}
                    ${sampleSection}
                    <h3>Responses</h3>
                    <ul class="response-list">${responses}</ul>
                </div>
            </details>
        `;
    }

    async function copySample(button) {
        const sample = byId(`codeSample-${button.dataset.copySample}`)?.textContent || '';
        try {
            await navigator.clipboard.writeText(sample);
            const original = button.textContent;
            button.textContent = 'Copied';
            setTimeout(() => { button.textContent = original; }, 1400);
        } catch (error) {
            console.warn('Clipboard unavailable:', error.message);
            button.textContent = 'Select text';
        }
    }

    function render(spec) {
        byId('apiTitle').textContent = spec.info?.title || 'REST API';
        byId('apiDescription').textContent = spec.info?.description || '';
        byId('apiVersion').textContent = `OpenAPI ${spec.openapi} · v${spec.info?.version || '1'}`;
        const server = spec.servers?.[0]?.url || '/api/v1';
        byId('serverUrl').textContent = `${window.location.origin}${server}`;

        const operations = [];
        for (const [path, pathItem] of Object.entries(spec.paths || {})) {
            for (const [method, operation] of Object.entries(pathItem)) {
                if (methods.has(method.toLowerCase())) operations.push({ path, method: method.toLowerCase(), operation });
            }
        }
        byId('endpointList').innerHTML = operations
            .map(({ path, method, operation }, index) => endpointCard(spec, path, method, operation, index))
            .join('');
        byId('endpointList').addEventListener('click', event => {
            const button = event.target.closest('[data-copy-sample]');
            if (button) copySample(button);
        });
        byId('docsLoading').hidden = true;
        byId('docsError').hidden = true;
    }

    async function loadSpec() {
        byId('docsLoading').hidden = false;
        byId('docsError').hidden = true;
        try {
            const response = await fetch('/openapi.json', { headers: { Accept: 'application/json' } });
            if (response.status === 401) {
                window.location.href = '/';
                return;
            }
            if (!response.ok) throw new Error(`OpenAPI request failed: ${response.status}`);
            render(await response.json());
        } catch (error) {
            console.error('Unable to load OpenAPI documentation:', error);
            byId('docsLoading').hidden = true;
            byId('docsError').hidden = false;
        }
    }

    byId('retryDocs').addEventListener('click', loadSpec);
    loadSpec();
})();
