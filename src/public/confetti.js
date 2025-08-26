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

// Make functions globally accessible
window.confettiThresholds = confettiThresholds;
window.updateConfettiThresholds = updateConfettiThresholds;
window.cleanupMegaConfetti = cleanupMegaConfetti;

// Physics-based mega confetti system
let megaConfettiSystem = null;
let deviceMotionPermissionStatus = null; // Cache iOS permission status
let megaConfettiSetupComplete = false; // Track if event listeners are already set up

// Store event listener references for proper cleanup
let confettiEventListeners = {
    orientationChange: null,
    orientationChangeFallback: null,
    deviceMotion: null,
    mouseDown: null,
    mouseMove: null,
    mouseUp: null,
    touchStart: null,
    touchMove: null,
    touchEnd: null
};

function cleanupMegaConfetti() {
    if (megaConfettiSystem) {
        // Stop the animation loop
        megaConfettiSystem.running = false;
        
        // Clear particles array to free memory
        if (megaConfettiSystem.particles) {
            megaConfettiSystem.particles.length = 0;
        }
        
        // Hide canvas
        const canvas = document.getElementById('confettiCanvas');
        if (canvas) {
            canvas.style.display = 'none';
        }
        
        // Clear the system object
        megaConfettiSystem = null;
    }
    
    // Remove all event listeners to prevent memory leaks
    if (megaConfettiSetupComplete) {
        // Remove orientation listeners
        if (confettiEventListeners.orientationChange && screen.orientation) {
            screen.orientation.removeEventListener('change', confettiEventListeners.orientationChange);
        }
        if (confettiEventListeners.orientationChangeFallback) {
            window.removeEventListener('orientationchange', confettiEventListeners.orientationChangeFallback);
        }
        
        // Remove device motion listener
        if (confettiEventListeners.deviceMotion) {
            window.removeEventListener('devicemotion', confettiEventListeners.deviceMotion);
        }
        
        // Remove canvas interaction listeners
        const canvas = document.getElementById('confettiCanvas');
        if (canvas) {
            if (confettiEventListeners.mouseDown) {
                canvas.removeEventListener('mousedown', confettiEventListeners.mouseDown);
            }
            if (confettiEventListeners.mouseMove) {
                canvas.removeEventListener('mousemove', confettiEventListeners.mouseMove);
            }
            if (confettiEventListeners.mouseUp) {
                canvas.removeEventListener('mouseup', confettiEventListeners.mouseUp);
            }
            if (confettiEventListeners.touchStart) {
                canvas.removeEventListener('touchstart', confettiEventListeners.touchStart);
            }
            if (confettiEventListeners.touchMove) {
                canvas.removeEventListener('touchmove', confettiEventListeners.touchMove);
            }
            if (confettiEventListeners.touchEnd) {
                canvas.removeEventListener('touchend', confettiEventListeners.touchEnd);
            }
        }
        
        // Clear all listener references
        for (let key in confettiEventListeners) {
            confettiEventListeners[key] = null;
        }
        
        // Reset setup flag so listeners can be added again if needed
        megaConfettiSetupComplete = false;
    }
}

// Placeholder for createMegaConfetti - will be completed in next extraction
function createMegaConfetti() {
    console.log('Mega confetti triggered (placeholder - full system coming next)');
    // Fallback to regular confetti for now
    createConfetti();
}

console.log('Basic confetti functions + mega confetti cleanup loaded');