/**
 * Mailgun Email Helper for Production E2E Testing
 * 
 * Provides programmatic email access for production E2E tests by:
 * - Fetching emails from Mailgun API
 * - Extracting magic links from email content
 * - Supporting both sandbox and production domains
 * - Handling email delays and polling
 * 
 * This enables fully automated E2E tests in production environments
 * without requiring manual magic link intervention.
 */

const https = require('https');
const crypto = require('crypto');

class MailgunEmailHelper {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.MAILGUN_API_KEY;
    this.domain = options.domain || process.env.MAILGUN_DOMAIN || 'sandbox-123.mailgun.org';
    this.baseURL = options.baseURL || 'https://api.mailgun.net/v3';
    this.timeout = options.timeout || 30000; // 30 seconds
    this.pollInterval = options.pollInterval || 2000; // 2 seconds
    
    if (!this.apiKey) {
      throw new Error('Mailgun API key is required (MAILGUN_API_KEY)');
    }
  }

  /**
   * Make HTTP request to Mailgun API
   */
  async makeRequest(endpoint, options = {}) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}/${this.domain}${endpoint}`;
      const urlObj = new URL(url);
      
      const requestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`api:${this.apiKey}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
          ...options.headers
        }
      };

      const req = https.request(requestOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${parsed.message || data}`));
            }
          } catch (error) {
            reject(new Error(`Invalid JSON response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));
      req.setTimeout(this.timeout);

      if (options.body) {
        req.write(options.body);
      }
      
      req.end();
    });
  }

  /**
   * Get recent emails for a recipient
   */
  async getEmails(recipient, options = {}) {
    const limit = options.limit || 10;
    const endpoint = `/events?event=delivered&recipient=${encodeURIComponent(recipient)}&limit=${limit}`;
    
    try {
      const response = await this.makeRequest(endpoint);
      return response.items || [];
    } catch (error) {
      console.log(`Failed to fetch emails for ${recipient}:`, error.message);
      return [];
    }
  }

  /**
   * Get email content by message ID
   */
  async getEmailContent(messageId) {
    try {
      // Try to get stored message content
      const endpoint = `/messages/${messageId}`;
      const response = await this.makeRequest(endpoint);
      return response;
    } catch (error) {
      console.log(`Failed to fetch email content for ${messageId}:`, error.message);
      return null;
    }
  }

  /**
   * Extract magic link from email content
   */
  extractMagicLink(emailContent, baseURL = 'http://localhost:3000') {
    if (!emailContent) return null;
    
    const text = emailContent.body || emailContent['body-plain'] || emailContent.text || '';
    
    // Common magic link patterns
    const patterns = [
      // Standard magic link format
      new RegExp(`(${baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/auth/[^\\s]+)`, 'i'),
      // Login token format  
      new RegExp(`(${baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/auth/login\\?token=[^\\s]+)`, 'i'),
      // Generic token format
      new RegExp(`(${baseURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s]*token=[^\\s&]+)`, 'i'),
      // Any URL with token parameter
      /https?:\/\/[^\s]+token=[^\s&]+/i
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }

  /**
   * Wait for and retrieve magic link for specific email
   */
  async getMagicLinkForEmail(email, options = {}) {
    const maxAttempts = Math.ceil(this.timeout / this.pollInterval);
    const baseURL = options.baseURL || 'http://localhost:3000';
    
    console.log(`🔍 Waiting for magic link email for ${email}...`);
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`  Attempt ${attempt}/${maxAttempts}...`);
      
      try {
        // Get recent emails for this recipient
        const emails = await this.getEmails(email, { limit: 5 });
        
        // Look for recent emails (within last 5 minutes)
        const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);
        const recentEmails = emails.filter(emailEvent => {
          const timestamp = new Date(emailEvent.timestamp * 1000);
          return timestamp > recentCutoff;
        });
        
        console.log(`    Found ${recentEmails.length} recent emails`);
        
        for (const emailEvent of recentEmails) {
          // Try to get email content
          let content = null;
          
          if (emailEvent.storage && emailEvent.storage.url) {
            // Get content from storage URL
            try {
              const storageResponse = await this.makeRequest('', {
                url: emailEvent.storage.url
              });
              content = storageResponse;
            } catch (e) {
              console.log(`    Failed to fetch stored content: ${e.message}`);
            }
          }
          
          if (emailEvent['message-id']) {
            // Try to get content by message ID
            try {
              content = await this.getEmailContent(emailEvent['message-id']);
            } catch (e) {
              console.log(`    Failed to fetch message content: ${e.message}`);
            }
          }
          
          // If no content available, use subject/basic info
          if (!content && emailEvent.subject) {
            content = {
              subject: emailEvent.subject,
              text: emailEvent.subject // Fallback
            };
          }
          
          if (content) {
            const magicLink = this.extractMagicLink(content, baseURL);
            if (magicLink) {
              console.log(`✅ Found magic link: ${magicLink}`);
              return magicLink;
            }
          }
        }
        
        // Wait before next attempt
        if (attempt < maxAttempts) {
          console.log(`    No magic link found, waiting ${this.pollInterval}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
        
      } catch (error) {
        console.log(`    Error on attempt ${attempt}: ${error.message}`);
        
        // Wait before retry
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
      }
    }
    
    throw new Error(`Failed to retrieve magic link for ${email} after ${maxAttempts} attempts`);
  }

  /**
   * Send test email (for testing purposes)
   */
  async sendTestEmail(recipient, subject = 'Test Email', text = 'This is a test email') {
    const body = new URLSearchParams({
      from: `Test <mailgun@${this.domain}>`,
      to: recipient,
      subject,
      text
    }).toString();

    try {
      const response = await this.makeRequest('/messages', {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      console.log(`✅ Test email sent to ${recipient}`);
      return response;
    } catch (error) {
      console.log(`❌ Failed to send test email: ${error.message}`);
      throw error;
    }
  }

  /**
   * Verify Mailgun configuration
   */
  async verifyConfiguration() {
    try {
      console.log('🔧 Verifying Mailgun configuration...');
      console.log(`  Domain: ${this.domain}`);
      console.log(`  API Key: ${this.apiKey ? '✅ Set' : '❌ Missing'}`);
      
      // Test API access by getting domain info
      const response = await this.makeRequest('/');
      console.log(`  API Access: ✅ Working`);
      console.log(`  Domain Status: ${response.domain ? '✅ Valid' : '⚠️  Unknown'}`);
      
      return true;
    } catch (error) {
      console.log(`❌ Mailgun configuration error: ${error.message}`);
      return false;
    }
  }

  /**
   * Generate unique test email address
   */
  generateTestEmail(prefix = 'e2e-test') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}@${this.domain}`;
  }

  /**
   * Clean up test emails (delete old test emails)
   */
  async cleanupTestEmails(olderThanMinutes = 60) {
    try {
      const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
      console.log(`🧹 Cleaning up test emails older than ${olderThanMinutes} minutes...`);
      
      // Note: Mailgun doesn't provide direct email deletion API
      // This is a placeholder for future implementation or external cleanup
      console.log('ℹ️  Test email cleanup not implemented (Mailgun limitation)');
      
      return true;
    } catch (error) {
      console.log(`⚠️  Cleanup error: ${error.message}`);
      return false;
    }
  }
}

/**
 * Factory function for easy instantiation
 */
function createMailgunHelper(options = {}) {
  return new MailgunEmailHelper(options);
}

/**
 * Quick test function for development
 */
async function testMailgunConnection(options = {}) {
  try {
    const helper = createMailgunHelper(options);
    const isValid = await helper.verifyConfiguration();
    
    if (isValid) {
      console.log('✅ Mailgun connection test successful');
      
      // Generate test email and try to send
      const testEmail = helper.generateTestEmail();
      console.log(`📧 Test email address: ${testEmail}`);
      
      return { success: true, helper, testEmail };
    } else {
      console.log('❌ Mailgun connection test failed');
      return { success: false, error: 'Configuration invalid' };
    }
  } catch (error) {
    console.log(`❌ Mailgun test error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  MailgunEmailHelper,
  createMailgunHelper,
  testMailgunConnection
};