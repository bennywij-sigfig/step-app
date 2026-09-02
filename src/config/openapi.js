const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Step Challenge REST API',
    version: '1.0.0',
    license: { name: 'ISC', url: 'https://opensource.org/license/isc-license-txt' },
    description: 'A scoped, user-isolated API for reading profiles and creating, reading, or explicitly replacing daily step entries.'
  },
  servers: [
    {
      url: '/api/v1',
      description: 'Current Step Challenge deployment'
    }
  ],
  tags: [
    { name: 'Profile', description: 'The API token owner and active challenge.' },
    { name: 'Steps', description: 'Daily step entries belonging to the API token owner.' }
  ],
  security: [{ bearerAuth: [] }],
  paths: {
    '/me': {
      get: {
        tags: ['Profile'],
        summary: 'Get my profile',
        description: 'Returns the token owner and the currently active challenge, if one exists.',
        operationId: 'getMyProfile',
        'x-required-scope': 'profile:read',
        'x-codeSamples': [{
          lang: 'Shell',
          source: 'curl -H "Authorization: Bearer $STEP_API_TOKEN" \\\n  https://step-app-4x-yhw.fly.dev/api/v1/me'
        }],
        responses: {
          200: {
            description: 'Profile and active challenge.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileResponse' } } }
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          500: { $ref: '#/components/responses/ServerError' }
        }
      }
    },
    '/steps': {
      get: {
        tags: ['Steps'],
        summary: 'List my step entries',
        description: 'Returns at most 1,000 entries belonging to the token owner, newest first. Date filters are inclusive.',
        operationId: 'listMySteps',
        'x-required-scope': 'steps:read',
        parameters: [
          {
            name: 'start_date',
            in: 'query',
            required: false,
            description: 'Inclusive first date.',
            schema: { type: 'string', format: 'date', example: '2026-09-01' }
          },
          {
            name: 'end_date',
            in: 'query',
            required: false,
            description: 'Inclusive last date.',
            schema: { type: 'string', format: 'date', example: '2026-09-15' }
          }
        ],
        'x-codeSamples': [{
          lang: 'Shell',
          source: 'curl -H "Authorization: Bearer $STEP_API_TOKEN" \\\n  "https://step-app-4x-yhw.fly.dev/api/v1/steps?start_date=2026-09-01&end_date=2026-09-15"'
        }],
        responses: {
          200: {
            description: 'Step entries matching the requested range.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/StepsResponse' } } }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          500: { $ref: '#/components/responses/ServerError' }
        }
      },
      post: {
        tags: ['Steps'],
        summary: 'Create a step entry',
        description: 'Creates a new entry. This operation never overwrites an existing date; use PUT for an explicit replacement.',
        operationId: 'createStepEntry',
        'x-required-scope': 'steps:write',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateStepInput' },
              example: { date: '2026-09-02', count: 8500 }
            }
          }
        },
        'x-codeSamples': [{
          lang: 'Shell',
          source: 'curl -X POST \\\n  -H "Authorization: Bearer $STEP_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"date":"2026-09-02","count":8500}\' \\\n  https://step-app-4x-yhw.fly.dev/api/v1/steps'
        }],
        responses: {
          201: {
            description: 'Entry created.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateStepResponse' } } }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          409: {
            description: 'An entry already exists for this date.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
          },
          500: { $ref: '#/components/responses/ServerError' }
        }
      }
    },
    '/steps/{date}': {
      put: {
        tags: ['Steps'],
        summary: 'Replace a step entry',
        description: 'Explicitly replaces the count for an existing date. Use POST when no entry exists.',
        operationId: 'replaceStepEntry',
        'x-required-scope': 'steps:write',
        parameters: [{
          name: 'date',
          in: 'path',
          required: true,
          description: 'The existing entry date.',
          schema: { type: 'string', format: 'date', example: '2026-09-02' }
        }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ReplaceStepInput' },
              example: { count: 9000 }
            }
          }
        },
        'x-codeSamples': [{
          lang: 'Shell',
          source: 'curl -X PUT \\\n  -H "Authorization: Bearer $STEP_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"count":9000}\' \\\n  https://step-app-4x-yhw.fly.dev/api/v1/steps/2026-09-02'
        }],
        responses: {
          200: {
            description: 'Entry replaced.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ReplaceStepResponse' } } }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          403: { $ref: '#/components/responses/Forbidden' },
          404: {
            description: 'No entry exists for this date.',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
          },
          500: { $ref: '#/components/responses/ServerError' }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'step_…',
        description: 'A scoped API token created by an administrator. Send it only in the Authorization header.'
      }
    },
    responses: {
      BadRequest: {
        description: 'Invalid input.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      },
      Unauthorized: {
        description: 'Bearer token is missing, invalid, expired, revoked, or belongs to an inactive user.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      },
      Forbidden: {
        description: 'The token does not include the required scope.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      },
      ServerError: {
        description: 'The API could not complete the operation.',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      }
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: { type: 'string', example: 'Date must use YYYY-MM-DD format' },
          challenge_start: { type: 'string', format: 'date' },
          challenge_end: { type: 'string', format: 'date' },
          existing_count: { type: 'integer', minimum: 0, maximum: 70000 }
        }
      },
      User: {
        type: 'object',
        required: ['id', 'name', 'email'],
        properties: {
          id: { type: 'integer', example: 42 },
          name: { type: 'string', example: 'Ada Walker' },
          email: { type: 'string', format: 'email', example: 'ada@example.com' },
          team: { type: 'string', nullable: true, example: 'Scrambled Legs' }
        }
      },
      Challenge: {
        type: 'object',
        required: ['id', 'name', 'start_date', 'end_date', 'reporting_threshold'],
        properties: {
          id: { type: 'integer', example: 7 },
          name: { type: 'string', example: 'SigFig Step Challenge 2026' },
          start_date: { type: 'string', format: 'date', example: '2026-08-20' },
          end_date: { type: 'string', format: 'date', example: '2026-09-05' },
          reporting_threshold: { type: 'integer', minimum: 0, maximum: 100, example: 70 }
        }
      },
      StepEntry: {
        type: 'object',
        required: ['date', 'count'],
        properties: {
          date: { type: 'string', format: 'date', example: '2026-09-02' },
          count: { type: 'integer', minimum: 0, maximum: 70000, example: 8500 },
          challenge_id: { type: 'integer', nullable: true, example: 7 },
          updated_at: { type: 'string', description: 'UTC database timestamp.', example: '2026-09-02 12:34:56' }
        }
      },
      ProfileResponse: {
        type: 'object',
        required: ['user', 'active_challenge'],
        properties: {
          user: { $ref: '#/components/schemas/User' },
          active_challenge: { type: 'object', allOf: [{ $ref: '#/components/schemas/Challenge' }], nullable: true }
        }
      },
      StepsResponse: {
        type: 'object',
        required: ['entries'],
        properties: {
          entries: { type: 'array', maxItems: 1000, items: { $ref: '#/components/schemas/StepEntry' } }
        }
      },
      CreateStepInput: {
        type: 'object',
        additionalProperties: false,
        required: ['date', 'count'],
        properties: {
          date: { type: 'string', format: 'date', example: '2026-09-02' },
          count: { type: 'integer', minimum: 0, maximum: 70000, example: 8500 }
        }
      },
      ReplaceStepInput: {
        type: 'object',
        additionalProperties: false,
        required: ['count'],
        properties: {
          count: { type: 'integer', minimum: 0, maximum: 70000, example: 9000 }
        }
      },
      CreateStepResponse: {
        type: 'object',
        required: ['entry'],
        properties: { entry: { $ref: '#/components/schemas/StepEntry' } }
      },
      ReplacedStepEntry: {
        allOf: [
          { $ref: '#/components/schemas/StepEntry' },
          {
            type: 'object',
            required: ['previous_count'],
            properties: { previous_count: { type: 'integer', minimum: 0, maximum: 70000, example: 8500 } }
          }
        ]
      },
      ReplaceStepResponse: {
        type: 'object',
        required: ['entry'],
        properties: { entry: { $ref: '#/components/schemas/ReplacedStepEntry' } }
      }
    }
  }
};

module.exports = { openApiDocument };
