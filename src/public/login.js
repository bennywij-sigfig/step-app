document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const submitBtn = document.getElementById('submitBtn');
        const messageDiv = document.getElementById('message');
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
        
        try {
            const response = await fetch('/auth/send-link', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                messageDiv.innerHTML = '<div class="message success">✅ ' + data.message + '</div>';
                document.getElementById('email').value = '';
            } else if (response.status === 429) {
                const retryAfter = Math.floor(data.retryAfter / 60) || 60; // Convert to minutes
                messageDiv.innerHTML = '<div class="message error">⏰ Too many requests. Please wait ' + retryAfter + ' minutes before trying again.</div>';
            } else {
                messageDiv.innerHTML = '<div class="message error">❌ ' + data.error + '</div>';
            }
        } catch (error) {
            messageDiv.innerHTML = '<div class="message error">❌ Network error. Please try again.</div>';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Send Login Link';
        }
    });
});