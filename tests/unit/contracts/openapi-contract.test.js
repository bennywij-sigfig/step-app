const fs = require('fs');
const path = require('path');
const { openApiDocument } = require('../../../src/config/openapi');

const root = path.join(__dirname, '../../..');
const source = file => fs.readFileSync(path.join(root, file), 'utf8');

describe('authenticated OpenAPI documentation', () => {
  test('describes every current bearer-token REST operation and no delete operation', () => {
    expect(openApiDocument.openapi).toBe('3.0.3');
    expect(openApiDocument.servers).toEqual([{ url: '/api/v1', description: expect.any(String) }]);
    expect(Object.keys(openApiDocument.paths)).toEqual(['/me', '/steps', '/steps/{date}']);
    expect(Object.keys(openApiDocument.paths['/me'])).toEqual(['get']);
    expect(Object.keys(openApiDocument.paths['/steps'])).toEqual(['get', 'post']);
    expect(Object.keys(openApiDocument.paths['/steps/{date}'])).toEqual(['put']);
    expect(JSON.stringify(openApiDocument.paths)).not.toContain('"delete"');
  });

  test('documents bearer authentication, required scopes, and strict write bodies', () => {
    expect(openApiDocument.security).toEqual([{ bearerAuth: [] }]);
    expect(openApiDocument.components.securitySchemes.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer'
    });
    expect(openApiDocument.paths['/me'].get['x-required-scope']).toBe('profile:read');
    expect(openApiDocument.paths['/steps'].get['x-required-scope']).toBe('steps:read');
    expect(openApiDocument.paths['/steps'].post['x-required-scope']).toBe('steps:write');
    expect(openApiDocument.paths['/steps/{date}'].put['x-required-scope']).toBe('steps:write');
    expect(openApiDocument.components.schemas.CreateStepInput).toMatchObject({
      additionalProperties: false,
      required: ['date', 'count']
    });
    expect(openApiDocument.components.schemas.ReplaceStepInput).toMatchObject({
      additionalProperties: false,
      required: ['count']
    });
  });

  test('keeps the machine-readable spec and human docs behind web-session auth', () => {
    const server = source('src/server.js');
    expect(server).toContain("app.get('/api-docs', requireAuth");
    expect(server).toContain("app.get('/openapi.json', apiLimiter, requireApiAuth");
    expect(server).toContain("res.sendFile(path.join(__dirname, 'views', 'api-docs.html'))");
    expect(server).toContain('res.json(openApiDocument)');
  });

  test('renders docs from the OpenAPI document without accepting bearer tokens', () => {
    const html = source('src/views/api-docs.html');
    const client = source('src/public/api-docs.js');
    const admin = source('src/views/admin.html');
    expect(html).toContain('id="endpointList"');
    expect(html).not.toMatch(/type="password"|Try it out/i);
    expect(client).toContain("fetch('/openapi.json'");
    expect(client).not.toMatch(/localStorage|sessionStorage/);
    expect(admin).toContain('href="/api-docs"');
    expect(admin).toContain('View API Documentation');
    expect(admin).toContain('href="/openapi.json"');
  });
});
