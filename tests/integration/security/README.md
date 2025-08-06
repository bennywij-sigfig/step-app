# Security Regression Tests

This directory contains comprehensive security regression tests for the Step Challenge App.

## Overview

The `security-regression.test.js` file provides thorough testing of security vulnerabilities and attack vector prevention, covering:

### 1. Input Validation Security
- **SQL Injection Prevention**: Tests various SQL injection techniques including classic, union-based, boolean-based, time-based, and SQLite-specific injections
- **XSS Prevention**: Tests script tag injection, event handler injection, JavaScript URIs, data URIs, and SVG-based XSS
- **NoSQL Injection**: Tests MongoDB-style injection patterns, JSON injection, and array-based attacks
- **Type Confusion Attacks**: Tests object/array/boolean injections, function serialization, null/undefined handling
- **Prototype Pollution**: Tests constructor pollution, __proto__ pollution, and nested prototype attacks
- **Command Injection**: Tests shell commands, pipe commands, background execution, variable expansion, and backtick execution
- **Path Traversal**: Tests directory traversal, Windows traversal, encoded traversal, and Unicode-based traversal

### 2. Authentication & Authorization Security
- **Unauthenticated Access**: Tests protection of all secured endpoints
- **Session Security**: Tests session fixation prevention and secure session management
- **Token Security**: Tests magic link token tampering detection and validation
- **Privilege Escalation**: Tests attempts to access admin functions without proper authorization

### 3. Rate Limiting Security
- **Brute Force Protection**: Tests rate limiting on authentication endpoints
- **API Abuse Prevention**: Tests rate limiting on API endpoints
- **IP vs Session-based Limiting**: Tests different rate limiting strategies
- **Bypass Prevention**: Tests various rate limit bypass techniques

### 4. CSRF Protection
- **Token Validation**: Tests CSRF token requirements on all state-changing operations
- **Token Reuse Prevention**: Tests CSRF token lifecycle management
- **Cross-Origin Blocking**: Tests blocking of requests from unauthorized origins

### 5. Data Security
- **User Data Isolation**: Tests that users can only access their own data
- **Admin Boundaries**: Tests separation between admin and regular user access levels
- **Information Leakage**: Tests prevention of sensitive information disclosure in errors

### 6. HTTP Security Headers
- **Content Security Policy**: Tests CSP header presence and configuration
- **Frame Options**: Tests clickjacking protection
- **Content Type Options**: Tests MIME sniffing prevention
- **HSTS**: Tests HTTPS enforcement
- **CORS Configuration**: Tests cross-origin resource sharing settings
- **Information Disclosure**: Tests for sensitive headers that shouldn't be exposed

### 7. Session Security
- **Cookie Security**: Tests HttpOnly, Secure, and SameSite cookie attributes
- **Session Management**: Tests concurrent session handling and session fixation resistance

## Usage

### Local Testing
```bash
# Test against local development server
NODE_ENV=development node tests/integration/security/security-regression.test.js

# Or run as executable
./tests/integration/security/security-regression.test.js
```

### Production Testing
```bash
# Test against production server
NODE_ENV=production node tests/integration/security/security-regression.test.js
```

### Integration with Test Suite
```bash
# Run via Jest (if integrated)
npm test -- tests/integration/security/security-regression.test.js

# Run as part of CI/CD pipeline
npm run test:security
```

## Test Results

The test provides detailed output including:

- **Pass/Fail/Warning counts** for each security category
- **Detailed breakdown** by test category
- **Security assessment** (Strong/Moderate/Weak)
- **Exit codes** for CI/CD integration (0 = success, 1 = failures detected)

### Example Output
```
🛡️  Running Security Regression Tests against: http://localhost:3000
================================================================================

🔍 1. INPUT VALIDATION SECURITY
──────────────────────────────────────────────────
✅ PASS: SQL Injection: Classic SQL injection | Blocked by input validation
✅ PASS: XSS Prevention: Script tag injection | Blocked by input validation
...

📊 SECURITY REGRESSION TEST RESULTS
================================================================================
✅ PASSED: 45
❌ FAILED: 0
⚠️  WARNINGS: 8
📊 TOTAL TESTS: 53
📈 SUCCESS RATE: 85%
🎉 SECURITY STATUS: STRONG - No critical failures detected
```

## Security Categories Tested

| Category | Tests | Purpose |
|----------|-------|---------|
| Input Validation | 25+ tests | Prevent injection attacks and malicious input |
| Authentication | 10+ tests | Ensure proper access control and session management |
| Rate Limiting | 5+ tests | Prevent brute force and API abuse |
| CSRF Protection | 8+ tests | Prevent cross-site request forgery |
| Data Security | 6+ tests | Ensure data isolation and prevent information leakage |
| HTTP Headers | 8+ tests | Validate security header configuration |
| Session Security | 4+ tests | Test session and cookie security |

## Customization

The test suite can be customized by:

1. **Adding new attack vectors** to the respective payload arrays
2. **Modifying rate limiting tests** to match your application's limits
3. **Adding new endpoints** to test in the protected endpoints arrays
4. **Adjusting success criteria** for specific security requirements

## Integration Notes

- Tests are designed to be **non-destructive** and safe to run against production
- All tests use **realistic attack vectors** but don't cause actual damage
- Rate limiting tests use **small request batches** to avoid triggering actual limits during testing
- Tests include **proper error handling** and network timeout management

## Security Considerations

This test suite helps validate security but should be used alongside:

- **Regular security audits** by security professionals
- **Penetration testing** with more sophisticated tools
- **Code reviews** focusing on security best practices
- **Dependency vulnerability scanning**
- **Security-focused static analysis tools**

## Contributing

When adding new security tests:

1. Follow the existing test structure and naming conventions
2. Include detailed comments explaining the attack vector being tested
3. Ensure tests are safe and non-destructive
4. Add appropriate success/failure criteria
5. Update this README with new test categories or significant changes

## Compliance

These tests help validate compliance with common security frameworks:

- **OWASP Top 10** - Tests major web application security risks
- **SANS Top 25** - Tests common software security weaknesses
- **CIS Controls** - Validates security configuration and monitoring
- **PCI DSS** - Tests relevant payment industry security requirements (if applicable)