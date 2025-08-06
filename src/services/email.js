const axios = require('axios');
const { isDevelopment, devLog } = require('../utils/dev');

// Mailgun configuration
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'sigfig.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'data@sigfig.com';
const MAILGUN_API_URL = `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`;

async function sendEmail(to, subject, htmlBody, textBody) {
  // Always log magic links in development mode for easy testing (localhost only)
  if (isDevelopment) {
    const linkMatch = textBody.match(/https?:\/\/[^\s]+/);
    if (linkMatch) {
      console.log('🔗 Magic link (development mode):', linkMatch[0]);
    }
  }
  
  if (!MAILGUN_API_KEY) {
    devLog('MAILGUN_API_KEY not configured. Login URL would be sent to:', to);
    devLog('Subject:', subject);
    return { success: false, message: 'Email not configured' };
  }

  try {
    const response = await axios.post(
      MAILGUN_API_URL,
      new URLSearchParams({
        from: FROM_EMAIL,
        to: to,
        subject: subject,
        html: htmlBody,
        text: textBody,
        'o:tracking': 'no'
      }),
      {
        auth: {
          username: 'api',
          password: MAILGUN_API_KEY
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    return { success: true, data: response.data };
  } catch (error) {
    console.error('Mailgun error:', error.response?.data || error.message);
    return { success: false, error: error.response?.data || error.message };
  }
}

module.exports = {
  sendEmail,
};