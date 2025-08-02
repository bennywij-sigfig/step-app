# Step Challenge App - Comprehensive Testing Suite

## Overview

This directory contains a comprehensive testing framework designed to ensure the reliability, security, and performance of the Step Challenge App across all components and environments.

## Testing Architecture

### Directory Structure
```
tests/
├── unit/                           # Unit tests (isolated component testing)
│   ├── database/                   # Database operations and models
│   ├── api/
│   │   ├── routes/                 # API endpoint logic
│   │   └── middleware/             # Authentication, validation, security
│   ├── utils/                      # Frontend JavaScript utilities
│   └── mcp/                        # MCP server functionality
├── integration/                    # Integration tests (component interaction)
│   ├── api/                        # End-to-end API workflows
│   ├── database/                   # Database relationship testing
│   └── security/                   # Security feature validation
├── e2e/                           # End-to-end browser tests
│   ├── user-journeys/             # Complete user workflows
│   ├── admin-workflows/           # Admin panel operations
│   └── cross-browser/             # Browser compatibility
├── environments/
│   ├── local/                     # Local development testing
│   ├── production/                # Production smoke tests
│   └── shared/                    # Common test utilities
├── fixtures/                      # Test data files
└── factories/                     # Dynamic test data generators
```

## Test Categories

### 1. Unit Tests (`npm run test:unit`)
- **Database Operations**: SQLite connection, table creation, CRUD operations
- **Input Validation**: Comprehensive security validation for all inputs
- **MCP Server**: Token generation, validation, scope management
- **Frontend Utilities**: Client-side JavaScript functions
- **Coverage Target**: 70% minimum across statements, branches, functions, lines

### 2. Integration Tests (`npm run test:integration`)
- **Authentication Flow**: Complete magic link workflow
- **API Endpoints**: Multi-step API operations
- **Database Relationships**: Foreign key constraints and data integrity
- **Security Features**: CSRF protection, rate limiting, input sanitization

### 3. End-to-End Tests (`npm run test:e2e`)
- **User Journeys**: New user onboarding, step logging, leaderboard viewing
- **Admin Workflows**: User management, challenge creation, MCP token management
- **Cross-browser Testing**: Chrome, Firefox, Safari compatibility
- **Accessibility**: WCAG compliance and keyboard navigation

### 4. Production Smoke Tests (`npm run test:smoke`)
- **Health Checks**: Application availability and database integrity
- **Critical Paths**: Authentication, API endpoints, MCP integration
- **Security Headers**: HTTPS enforcement and security configurations
- **READ-ONLY**: Never modifies production data

## Key Features

### Security Testing
- **Input Validation**: SQL injection, XSS, command injection prevention
- **Type Confusion**: Protection against JavaScript type manipulation attacks
- **Rate Limiting**: Authentication and API endpoint protection
- **CSRF Protection**: Cross-site request forgery prevention

### Database Testing
- **Connection Management**: SQLite configuration and reliability
- **Schema Validation**: Table structure and relationship integrity
- **Data Integrity**: Unique constraints and foreign key validation
- **Performance**: Query optimization and connection pooling

### MCP Integration Testing
- **Token Security**: Cryptographically secure token generation
- **Scope Management**: Permission-based access control
- **Audit Logging**: Complete action tracking with IP addresses
- **Protocol Compliance**: JSON-RPC 2.0 and stdio protocol standards

## Test Commands

### Development Workflow
```bash
# Run all tests
npm test

# Unit tests with coverage
npm run test:unit

# Integration tests
npm run test:integration

# End-to-end browser tests
npm run test:e2e

# Complete test suite (unit + integration + e2e)
npm run test:all

# Watch mode for development
npm run test:watch

# Debug mode
npm run test:debug
```

### Environment-Specific Testing
```bash
# Local development testing
npm run test:local

# Production smoke tests (requires NODE_ENV=production)
npm run test:prod

# Coverage reporting
npm run test:coverage
```

## Configuration

### Jest Configuration (`jest.config.js`)
- **Test Environment**: Node.js with SQLite support
- **Coverage Thresholds**: 70% minimum across all metrics
- **Test Patterns**: Automated discovery of test files
- **Timeout**: 10 seconds per test
- **Workers**: 4 parallel test runners

### Playwright Configuration (`playwright.config.js`)
- **Browser Support**: Chromium (Chrome) primary, Firefox/Safari optional
- **Base URL**: http://localhost:3000 for local testing
- **Screenshots**: Automatic capture on test failures
- **Video Recording**: Available for debugging

## CI/CD Integration

### GitHub Actions Workflow (`.github/workflows/test.yml`)
- **Unit Tests**: Automated coverage reporting
- **Integration Tests**: Complete API workflow validation
- **E2E Tests**: Cross-browser compatibility verification
- **Security Audit**: npm audit with vulnerability checks
- **Production Smoke Tests**: Post-deployment validation

### Quality Gates
- **Coverage Thresholds**: Must maintain 70% code coverage
- **Security Audit**: No high-severity vulnerabilities allowed
- **Test Success Rate**: 100% test pass rate required
- **Performance**: Response time monitoring in production

## Best Practices

### Test Data Management
- **Isolated Databases**: Each test runs with clean SQLite database
- **Test Fixtures**: Predefined data sets for consistent testing
- **Data Factories**: Dynamic test data generation
- **Cleanup**: Automatic database cleanup after each test

### Security Considerations
- **Production Safety**: Smoke tests are strictly read-only
- **Token Management**: Test tokens with limited scopes and expiration
- **Input Sanitization**: Comprehensive malicious input testing
- **Rate Limit Testing**: Verification without impacting production

### Performance Optimization
- **Parallel Execution**: Tests run concurrently where possible
- **Fast Feedback**: Unit tests complete in under 10 seconds
- **Resource Management**: Proper cleanup prevents memory leaks
- **Selective Testing**: Ability to run specific test suites

## Troubleshooting

### Common Issues

1. **SQLite Connection Errors**
   - Ensure test database directory is writable
   - Check for proper database cleanup in afterEach hooks
   - Verify test isolation with separate database files

2. **Timeout Issues**
   - Increase Jest timeout for integration tests
   - Ensure proper async/await usage in test code
   - Check for hanging database connections

3. **Coverage Threshold Failures**
   - Review untested code paths in coverage reports
   - Add unit tests for critical business logic
   - Consider adjusting thresholds for new features

4. **E2E Test Flakiness**
   - Add explicit waits for dynamic content
   - Use proper Playwright selectors
   - Verify test data consistency

### Debugging

```bash
# Run specific test file
npm run test:unit -- tests/unit/database/database.test.js

# Debug with Node.js inspector
npm run test:debug

# Verbose output
npm run test:unit -- --verbose

# Watch specific pattern
npm run test:watch -- --testPathPatterns="validation"
```

## Metrics and Reporting

### Coverage Reports
- **HTML Report**: `coverage/index.html` for detailed visualization
- **LCOV Format**: `coverage/lcov.info` for CI/CD integration
- **Console Summary**: Real-time coverage feedback

### Test Results
- **JUnit XML**: Compatible with CI/CD dashboards
- **Playwright Reports**: Visual test results with screenshots
- **Performance Metrics**: Response time tracking

## Future Enhancements

### Planned Improvements
- **Visual Regression Testing**: Screenshot comparison for UI changes
- **Load Testing Integration**: Automated performance testing
- **Accessibility Testing**: Enhanced WCAG compliance validation
- **API Contract Testing**: OpenAPI specification validation
- **Mobile Testing**: iOS/Android browser compatibility

### Monitoring Integration
- **Error Tracking**: Integration with error monitoring services
- **Performance Monitoring**: Real-time application performance
- **Test Analytics**: Test execution trends and failure analysis

## Contributing

When adding new features or modifying existing functionality:

1. **Unit Tests Required**: All new functions must have unit tests
2. **Integration Coverage**: Multi-component interactions need integration tests
3. **Security Validation**: Input validation and security tests are mandatory
4. **Documentation**: Update test documentation for new test patterns
5. **CI/CD Compatibility**: Ensure tests work in automated environments

## Support

For testing-related questions or issues:
- Review existing test patterns in similar components
- Check GitHub Actions logs for CI/CD failures
- Consult Jest and Playwright documentation for advanced features
- Follow security testing best practices for input validation