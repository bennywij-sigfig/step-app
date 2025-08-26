// Confetti Animation System
// Extracted from dashboard.js for better modularity

// Confetti thresholds - loaded from server
let confettiThresholds = {
    regular: 15000,
    epic: 20000
};

// Basic confetti animation system
function createConfetti() {
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    
    const confettiPieces = [];
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57', '#FF9FF3', '#54A0FF'];
    
    // Create confetti pieces
    for (let i = 0; i < 150; i++) {
        confettiPieces.push({
            x: Math.random() * canvas.width,
            y: -10,
            vx: (Math.random() - 0.5) * 6,
            vy: Math.random() * 3 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            size: Math.random() * 4 + 2,
            rotation: Math.random() * 360,
            rotationSpeed: (Math.random() - 0.5) * 10
        });
    }
    
    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        for (let i = confettiPieces.length - 1; i >= 0; i--) {
            const piece = confettiPieces[i];
            
            // Update position
            piece.x += piece.vx;
            piece.y += piece.vy;
            piece.rotation += piece.rotationSpeed;
            
            // Apply gravity
            piece.vy += 0.1;
            
            // Remove pieces that are off screen
            if (piece.y > canvas.height + 10) {
                confettiPieces.splice(i, 1);
                continue;
            }
            
            // Draw confetti piece
            ctx.save();
            ctx.translate(piece.x, piece.y);
            ctx.rotate(piece.rotation * Math.PI / 180);
            ctx.fillStyle = piece.color;
            ctx.fillRect(-piece.size/2, -piece.size/2, piece.size, piece.size);
            ctx.restore();
        }
        
        if (confettiPieces.length > 0) {
            requestAnimationFrame(animate);
        } else {
            // Hide canvas when animation is done
            canvas.style.display = 'none';
        }
    }
    
    animate();
}

// Trigger confetti celebration
function celebrateSteps(stepCount) {
    // Check for mega confetti first (epic threshold)
    if (stepCount >= confettiThresholds.epic) {
        const megaConfettiEnabled = localStorage.getItem('megaConfettiEnabled') === 'true';
        if (megaConfettiEnabled) {
            // Only do mega celebration for epic threshold+ (function will be available after next extraction)
            if (typeof createMegaConfetti === 'function') {
                createMegaConfetti();
            } else {
                // Fallback to regular confetti if mega confetti not yet loaded
                createConfetti();
            }
            
            // Add epic celebration message (only if delightful UX is not handling messaging)
            setTimeout(() => {
                if (!window.stepEntryUX || !window.stepEntryUX.isEnabled) {
                    const messageDiv = document.getElementById('stepsMessage');
                    const currentMessage = messageDiv.innerHTML;
                    const formattedThreshold = (confettiThresholds.epic / 1000).toFixed(0) + 'K';
                    messageDiv.innerHTML = currentMessage + `<div class="message success" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; animation: warp-glow 1s ease-out 1; font-weight: bold; font-size: 18px; text-shadow: 0 0 10px rgba(255,255,255,0.8);">EPIC ACHIEVEMENT! ${formattedThreshold}+ STEPS!</div>`;
                }
            }, 500);
            return; // Skip regular confetti for epic threshold+
        }
    }
    
    // Regular confetti for regular threshold+ (only if not epic threshold+ with mega enabled)
    if (stepCount >= confettiThresholds.regular) {
        createConfetti();
        
        // Add celebration message (only if delightful UX is not handling messaging)
        setTimeout(() => {
            if (!window.stepEntryUX || !window.stepEntryUX.isEnabled) {
                const messageDiv = document.getElementById('stepsMessage');
                const currentMessage = messageDiv.innerHTML;
                const formattedThreshold = (confettiThresholds.regular / 1000).toFixed(0) + 'K';
                messageDiv.innerHTML = currentMessage + `<div class="message success" style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #B8860B; animation: pulse 1s ease-in-out 3;">Amazing! ${formattedThreshold}+ steps celebration!</div>`;
            }
        }, 500);
    }
}

// Function to update confetti thresholds (called from dashboard.js)
function updateConfettiThresholds(thresholds) {
    confettiThresholds.regular = thresholds.regular || 15000;
    confettiThresholds.epic = thresholds.epic || 20000;
}

// Make thresholds globally accessible
window.confettiThresholds = confettiThresholds;
window.updateConfettiThresholds = updateConfettiThresholds;

console.log('Basic confetti functions loaded');