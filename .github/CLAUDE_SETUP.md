# Claude GitHub Actions Setup

## Required Secrets

Add these secrets in your GitHub repository settings (`Settings` → `Secrets and variables` → `Actions`):

### Option 1: Direct Anthropic API (Recommended)
- `ANTHROPIC_API_KEY` - Your Claude API key from console.anthropic.com

### Option 2: AWS Bedrock (Alternative)
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key
- Uncomment the AWS lines in `.github/workflows/claude.yml`

### Option 3: Google Vertex AI (Alternative)
- `VERTEX_PROJECT_ID` - Google Cloud project ID
- `GOOGLE_APPLICATION_CREDENTIALS` - Service account JSON (as secret)
- Uncomment the Vertex AI lines in `.github/workflows/claude.yml`

## How to Use

1. **Install the Claude GitHub App**: Visit github.com/apps/claude-code and install it on your repository

2. **Mention Claude**: In any issue or PR comment, mention `@claude` to trigger the assistant

3. **Example Usage**:
   ```
   @claude please help implement user authentication for this step tracking app
   ```
   ```
   @claude can you fix the Safari date validation issue in dashboard.js?
   ```

## Features

- Automatically responds to `@claude` mentions in issues and PRs
- Creates pull requests with code implementations
- Respects project conventions defined in `CLAUDE.md`
- Runs linting and tests after making changes
- 10-minute timeout to prevent runaway processes

## Cost Considerations

- GitHub Actions minutes usage (free tier: 2000 minutes/month)
- Anthropic API token usage (varies by model and request size)
- Consider setting up usage alerts and limits

## Troubleshooting

- Check GitHub Actions logs if Claude doesn't respond
- Verify secrets are properly set
- Ensure the Claude GitHub App is installed
- Check repository permissions for the workflow