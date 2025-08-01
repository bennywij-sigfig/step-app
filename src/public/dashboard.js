// Team disclosure functionality - must be global
let expandedTeams = new Set(); // Track expanded state

// Mobile detection utility
function isMobileViewport() {
    return window.innerWidth <= 768; // Standard mobile breakpoint
}

// Format reporting and member count with conditional emoji/text
function formatReportingRate(rate, color = '#28a745') {
    const percentage = rate >= 1 ? Math.round(rate) : rate;
    if (isMobileViewport()) {
        return `<span style="color: ${color}; font-size: 0.7em; margin-left: 6px;">📋 ${percentage}%</span>`;
    } else {
        return `<span style="color: ${color}; font-size: 0.7em; margin-left: 6px;">📋 ${percentage}% reporting</span>`;
    }
}

function formatMemberCount(count) {
    if (isMobileViewport()) {
        return `<span style="color: #888; font-size: 0.75em; margin-left: 6px;">👥 ${count}</span>`;
    } else {
        return `<span style="color: #888; font-size: 0.75em; margin-left: 6px;">👥 ${count} member${count !== 1 ? 's' : ''}</span>`;
    }
}

// Theme functionality
function initializeTheme() {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('adminTheme') || 'default';
    applyTheme(savedTheme);
}

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName === 'default' ? '' : themeName);
}

// Confetti animation system
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
    // Check for mega confetti first (20K+ steps)
    if (stepCount >= 20000) {
        const megaConfettiEnabled = localStorage.getItem('megaConfettiEnabled') === 'true';
        if (megaConfettiEnabled) {
            // Only do mega celebration for 20K+
            createMegaConfetti();
            
            // Add epic celebration message with warp speed glow
            setTimeout(() => {
                const messageDiv = document.getElementById('stepsMessage');
                const currentMessage = messageDiv.innerHTML;
                messageDiv.innerHTML = currentMessage + '<div class="message success" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; animation: warp-glow 1s ease-out 1; font-weight: bold; font-size: 18px; text-shadow: 0 0 10px rgba(255,255,255,0.8);">🚀 EPIC ACHIEVEMENT! 20,000+ STEPS! 🚀</div>';
            }, 500);
            return; // Skip regular confetti for 20K+
        }
    }
    
    // Regular confetti for 15K+ (only if not 20K+ with mega enabled)
    if (stepCount >= 15000) {
        createConfetti();
        
        // Add celebration message
        setTimeout(() => {
            const messageDiv = document.getElementById('stepsMessage');
            const currentMessage = messageDiv.innerHTML;
            messageDiv.innerHTML = currentMessage + '<div class="message success" style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #B8860B; animation: pulse 1s ease-in-out 3;">🎉 Amazing! 15,000+ steps celebration! 🎉</div>';
        }, 500);
    }
}

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

function createMegaConfetti() {
    // Properly clean up any existing system before creating new one
    if (megaConfettiSystem) {
        cleanupMegaConfetti();
    }
    
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    canvas.style.zIndex = '10000';
    
    megaConfettiSystem = {
        running: true,
        particles: [],
        gravity: 0.3,
        friction: 0.98,
        restitution: 0.7,
        colors: ['#FF1493', '#FFD700', '#00FF00', '#FF4500', '#FF69B4', '#00BFFF', '#FF6347', '#7FFF00', '#FF00FF', '#FFA500'],
        lastTime: 0,
        accelerometer: { x: 0, y: 0, z: 0 },
        accelerometerBaseline: { x: 0, y: 0, z: 0 },
        baselineCalibrated: false,
        mousePos: { x: 0, y: 0 },
        mousePressed: false,
        shakeThreshold: 15,
        startTime: Date.now(),
        phase: 'dropping', // 'dropping' or 'interactive'
        settlingTimeThreshold: 1500, // 1.5 seconds for fast delight
        settledParticles: 0, // Count of particles that have settled at bottom
        fadeStartTime: parseInt(localStorage.getItem('confettiLifetime') || '10000', 10), // Start fading after configured seconds
        fadeDuration: 3000,   // Fade out over 3 seconds
        orientation: {
            angle: 0,              // Current rotation angle (0, 90, 180, 270)
            gravityX: 0,           // Gravity X component based on orientation
            gravityY: 0.3,         // Gravity Y component based on orientation
        }
    };
    
    // Create MORE confetti particles for mega celebration
    const particleCount = parseInt(localStorage.getItem('confettiParticleCount') || '600', 10);
    for (let i = 0; i < particleCount; i++) {
        createMegaParticle(canvas.width / 2 + (Math.random() - 0.5) * 200, -10);
    }
    
    // Set up event listeners only once to avoid duplicates
    if (!megaConfettiSetupComplete) {
        setupOrientationDetection();
        setupDeviceMotion();
        setupMouseInteraction(canvas);
        megaConfettiSetupComplete = true;
    }
    
    // Start animation
    animateMegaConfetti();
}

function createMegaParticle(x, y) {
    const particle = {
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 12,
        vy: Math.random() * 5 + 3,
        size: Math.random() * 6 + 3,
        color: megaConfettiSystem.colors[Math.floor(Math.random() * megaConfettiSystem.colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        settled: false,
        restingY: 0,
        shape: Math.random() > 0.5 ? 'square' : 'circle',
        opacity: 1.0
    };
    
    megaConfettiSystem.particles.push(particle);
}

// Orientation detection and physics transformation
let orientationUpdateTimeout;

function setupOrientationDetection() {
    // Get initial orientation
    updateOrientationPhysics();
    
    // Store references to event listeners for proper cleanup
    confettiEventListeners.orientationChange = debouncedOrientationUpdate;
    confettiEventListeners.orientationChangeFallback = debouncedOrientationUpdate;
    
    // Listen for orientation changes
    if (screen.orientation) {
        screen.orientation.addEventListener('change', confettiEventListeners.orientationChange);
    }
    
    // Fallback for older browsers
    window.addEventListener('orientationchange', confettiEventListeners.orientationChangeFallback);
}

function debouncedOrientationUpdate() {
    clearTimeout(orientationUpdateTimeout);
    orientationUpdateTimeout = setTimeout(updateOrientationPhysics, 150);
}

function updateOrientationPhysics() {
    if (!megaConfettiSystem) return;
    
    // Get current orientation angle
    const angle = screen.orientation ? screen.orientation.angle : (window.orientation || 0);
    megaConfettiSystem.orientation.angle = angle;
    
    // Check reverse Y direction setting
    const reverseY = localStorage.getItem('reverseYDirection') === 'true';
    const gravityMultiplier = reverseY ? -1 : 1;
    
    // Calculate gravity direction based on orientation
    switch (angle) {
        case 0:   // Portrait
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = 0.3 * gravityMultiplier;
            break;
        case 90:  // Landscape left
            megaConfettiSystem.orientation.gravityX = 0.3 * gravityMultiplier;
            megaConfettiSystem.orientation.gravityY = 0;
            break;
        case 180: // Portrait upside down
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = -0.3 * gravityMultiplier;
            break;
        case 270: // Landscape right
            megaConfettiSystem.orientation.gravityX = -0.3 * gravityMultiplier;
            megaConfettiSystem.orientation.gravityY = 0;
            break;
        default:  // Fallback to portrait
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = 0.3 * gravityMultiplier;
    }
    
    // Recalibrate accelerometer baseline after orientation change
    if (megaConfettiSystem.baselineCalibrated) {
        megaConfettiSystem.baselineCalibrated = false;
    }
}

function transformAccelerometerData(acceleration) {
    const angle = megaConfettiSystem.orientation.angle;
    const x = acceleration.x || 0;
    const y = acceleration.y || 0;
    
    // Transform accelerometer data based on device orientation
    let transformedX, transformedY;
    
    switch (angle) {
        case 0:   // Portrait
            transformedX = x;
            transformedY = y;
            break;
        case 90:  // Landscape left (rotated 90° counterclockwise)
            transformedX = -y;
            transformedY = x;
            break;
        case 180: // Portrait upside down (rotated 180°)
            transformedX = -x;
            transformedY = -y;
            break;
        case 270: // Landscape right (rotated 90° clockwise)
            transformedX = y;
            transformedY = -x;
            break;
        default:
            transformedX = x;
            transformedY = y;
    }
    
    return { x: transformedX, y: transformedY };
}

function getOrientationAwareBoundaries(canvas) {
    const angle = megaConfettiSystem.orientation.angle;
    
    // Calculate where particles should settle based on gravity direction
    let gravityFloor, gravityCeiling;
    
    switch (angle) {
        case 0:   // Portrait - gravity pulls down
            gravityFloor = canvas.height;
            gravityCeiling = 0;
            break;
        case 90:  // Landscape left - gravity pulls right
            gravityFloor = canvas.width;
            gravityCeiling = 0;
            break;
        case 180: // Portrait upside down - gravity pulls up  
            gravityFloor = 0;
            gravityCeiling = canvas.height;
            break;
        case 270: // Landscape right - gravity pulls left
            gravityFloor = 0;
            gravityCeiling = canvas.width;
            break;
        default:  // Fallback to portrait
            gravityFloor = canvas.height;
            gravityCeiling = 0;
    }
    
    return {
        left: 0,
        right: canvas.width,
        top: 0,
        bottom: canvas.height,
        gravityFloor: gravityFloor,
        gravityCeiling: gravityCeiling,
        isVerticalGravity: angle === 0 || angle === 180,
        isHorizontalGravity: angle === 90 || angle === 270
    };
}

async function setupDeviceMotion() {
    if (!window.DeviceMotionEvent) return;
    
    // Request permission for iOS 13+ (with caching to prevent multiple requests)
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
        if (deviceMotionPermissionStatus === null) {
            try {
                const permission = await DeviceMotionEvent.requestPermission();
                deviceMotionPermissionStatus = (permission === 'granted');
            } catch (error) {
                console.log('Device motion permission request failed:', error);
                deviceMotionPermissionStatus = false;
            }
        }
        
        if (!deviceMotionPermissionStatus) {
            console.log('Device motion permission denied - falling back to touch/mouse interaction only');
            return;
        }
    }
    
    // Store device motion event listener for proper cleanup
    confettiEventListeners.deviceMotion = function(event) {
        if (!megaConfettiSystem) return;
        
        const acceleration = event.accelerationIncludingGravity;
        if (acceleration) {
            // Transform accelerometer data for current orientation
            const transformed = transformAccelerometerData(acceleration);
            
            megaConfettiSystem.accelerometer.x = transformed.x;
            megaConfettiSystem.accelerometer.y = transformed.y;
            megaConfettiSystem.accelerometer.z = acceleration.z || 0;
            
            // Calibrate baseline on first reading (device's current orientation)
            if (!megaConfettiSystem.baselineCalibrated) {
                megaConfettiSystem.accelerometerBaseline.x = transformed.x;
                megaConfettiSystem.accelerometerBaseline.y = transformed.y;
                megaConfettiSystem.accelerometerBaseline.z = acceleration.z || 0;
                megaConfettiSystem.baselineCalibrated = true;
                return; // Skip applying forces on calibration frame
            }
            
            // Calculate delta from baseline (changes in tilt from initial orientation)
            const deltaX = transformed.x - megaConfettiSystem.accelerometerBaseline.x;
            const deltaY = transformed.y - megaConfettiSystem.accelerometerBaseline.y;
            const deltaZ = (acceleration.z || 0) - megaConfettiSystem.accelerometerBaseline.z;
            
            // Calculate shake intensity using delta changes instead of absolute values
            const shakeIntensity = Math.sqrt(
                Math.pow(deltaX, 2) + 
                Math.pow(deltaY, 2) + 
                Math.pow(deltaZ, 2)
            );
            
            // Only apply tilt forces during interactive phase (after particles have settled)
            if (megaConfettiSystem.phase === 'interactive') {
                // Apply gentle tilt forces based on delta changes from baseline (now properly oriented)
                const tiltSensitivity = parseFloat(localStorage.getItem('confettiTiltSensitivity') || '0.3');
                const maxTiltForce = parseFloat(localStorage.getItem('confettiMaxTiltForce') || '2.0');
                
                megaConfettiSystem.particles.forEach(particle => {
                    // Apply continuous tilt forces to all particles, especially settled ones
                    if (particle.settled || Math.abs(particle.vy) < 2) {
                        // Screen-relative tilt forces (now properly transformed)
                        const tiltX = deltaX * tiltSensitivity;
                        const tiltY = deltaY * tiltSensitivity;
                        
                        // Clamp tilt forces to prevent excessive movement
                        const clampedTiltX = Math.max(-maxTiltForce, Math.min(maxTiltForce, tiltX));
                        const clampedTiltY = Math.max(-maxTiltForce, Math.min(maxTiltForce, tiltY));
                    
                    particle.vx += clampedTiltX;
                    particle.vy += clampedTiltY;
                    
                    // Unsettle particles if forces are significant
                    if (Math.abs(clampedTiltX) > 0.5 || Math.abs(clampedTiltY) > 0.5) {
                        particle.settled = false;
                    }
                    }
                    // Also apply reduced tilt to moving particles for more responsive feel
                    else {
                        particle.vx += deltaX * tiltSensitivity * 0.3;
                        particle.vy += deltaY * tiltSensitivity * 0.3;
                    }
                });
                
                // Gentle shake detection for pile disturbance (no aggressive dismiss behavior)
                if (shakeIntensity > megaConfettiSystem.shakeThreshold) {
                    megaConfettiSystem.particles.forEach(particle => {
                        if (particle.settled) {
                            particle.vx += (Math.random() - 0.5) * 3;
                            particle.vy -= Math.random() * 2;
                            particle.settled = false;
                        }
                    });
                }
            }
        }
    };
    
    // Add motion event listener with orientation-aware coordinate transformation
    window.addEventListener('devicemotion', confettiEventListeners.deviceMotion);
}

function setupMouseInteraction(canvas) {
    let lastMouseX = 0;
    let lastMouseY = 0;
    
    // Store mouse event listeners for proper cleanup
    confettiEventListeners.mouseDown = function(e) {
        if (!megaConfettiSystem) return;
        megaConfettiSystem.mousePressed = true;
        const rect = canvas.getBoundingClientRect();
        megaConfettiSystem.mousePos.x = e.clientX - rect.left;
        megaConfettiSystem.mousePos.y = e.clientY - rect.top;
        lastMouseX = megaConfettiSystem.mousePos.x;
        lastMouseY = megaConfettiSystem.mousePos.y;
    };
    
    canvas.addEventListener('mousedown', confettiEventListeners.mouseDown);
    
    confettiEventListeners.mouseMove = function(e) {
        if (!megaConfettiSystem) return;
        const rect = canvas.getBoundingClientRect();
        const newX = e.clientX - rect.left;
        const newY = e.clientY - rect.top;
        
        if (megaConfettiSystem.mousePressed) {
            const deltaX = newX - lastMouseX;
            const deltaY = newY - lastMouseY;
            const force = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            
            // Disturb particles near mouse
            megaConfettiSystem.particles.forEach(particle => {
                const dx = particle.x - newX;
                const dy = particle.y - newY;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 50 && distance > 0.1) {
                    const forceMultiplier = (50 - distance) / 50;
                    particle.vx += deltaX * forceMultiplier * 0.3;
                    particle.vy += deltaY * forceMultiplier * 0.3;
                    particle.settled = false;
                }
            });
        }
        
        megaConfettiSystem.mousePos.x = newX;
        megaConfettiSystem.mousePos.y = newY;
        lastMouseX = newX;
        lastMouseY = newY;
    };
    
    canvas.addEventListener('mousemove', confettiEventListeners.mouseMove);
    
    confettiEventListeners.mouseUp = function() {
        if (!megaConfettiSystem) return;
        megaConfettiSystem.mousePressed = false;
    };
    
    canvas.addEventListener('mouseup', confettiEventListeners.mouseUp);
    
    // Touch events for mobile
    confettiEventListeners.touchStart = function(e) {
        if (!megaConfettiSystem) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        megaConfettiSystem.mousePos.x = touch.clientX - rect.left;
        megaConfettiSystem.mousePos.y = touch.clientY - rect.top;
        megaConfettiSystem.mousePressed = true;
    };
    
    canvas.addEventListener('touchstart', confettiEventListeners.touchStart);
    
    confettiEventListeners.touchMove = function(e) {
        if (!megaConfettiSystem) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const newX = touch.clientX - rect.left;
        const newY = touch.clientY - rect.top;
        
        // Disturb particles near touch
        megaConfettiSystem.particles.forEach(particle => {
            const dx = particle.x - newX;
            const dy = particle.y - newY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 60 && distance > 0.1) {
                const deltaX = newX - megaConfettiSystem.mousePos.x;
                const deltaY = newY - megaConfettiSystem.mousePos.y;
                const forceMultiplier = (60 - distance) / 60;
                particle.vx += deltaX * forceMultiplier * 0.4;
                particle.vy += deltaY * forceMultiplier * 0.4;
                particle.settled = false;
            }
        });
        
        megaConfettiSystem.mousePos.x = newX;
        megaConfettiSystem.mousePos.y = newY;
    };
    
    canvas.addEventListener('touchmove', confettiEventListeners.touchMove);
    
    confettiEventListeners.touchEnd = function(e) {
        if (!megaConfettiSystem) return;
        e.preventDefault();
        megaConfettiSystem.mousePressed = false;
    };
    
    canvas.addEventListener('touchend', confettiEventListeners.touchEnd);
}

function animateMegaConfetti() {
    if (!megaConfettiSystem || !megaConfettiSystem.running) return;
    
    const canvas = document.getElementById('confettiCanvas');
    const ctx = canvas.getContext('2d');
    const currentTime = Date.now();
    const elapsedTime = currentTime - megaConfettiSystem.startTime;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Calculate fade opacity
    let globalOpacity = 1.0;
    if (elapsedTime > megaConfettiSystem.fadeStartTime) {
        const fadeProgress = (elapsedTime - megaConfettiSystem.fadeStartTime) / megaConfettiSystem.fadeDuration;
        globalOpacity = Math.max(0, 1.0 - fadeProgress);
        
        // If fully faded, end animation
        if (globalOpacity <= 0) {
            cleanupMegaConfetti();
            return;
        }
    }
    
    for (let i = megaConfettiSystem.particles.length - 1; i >= 0; i--) {
        const particle = megaConfettiSystem.particles[i];
        
        // Update physics if not settled
        if (!particle.settled) {
            // Apply orientation-aware gravity
            particle.vx += megaConfettiSystem.orientation.gravityX;
            particle.vy += megaConfettiSystem.orientation.gravityY;
            
            // Update position
            particle.x += particle.vx;
            particle.y += particle.vy;
            
            // Apply friction
            particle.vx *= megaConfettiSystem.friction;
            particle.vy *= megaConfettiSystem.friction;
            
            // Get orientation-aware boundaries
            const boundaries = getOrientationAwareBoundaries(canvas);
            
            // Handle boundary collisions based on gravity direction
            if (boundaries.isHorizontalGravity) {
                // Horizontal gravity - allow settling on left/right, bounce on top/bottom
                if (particle.x <= particle.size) {
                    particle.x = particle.size;
                    if (boundaries.gravityFloor === 0) {
                        // Settling on left edge - reduce velocity for settling
                        particle.vx *= 0.3;
                    } else {
                        // Bouncing off left wall
                        particle.vx *= -megaConfettiSystem.restitution;
                    }
                }
                if (particle.x >= boundaries.right - particle.size) {
                    particle.x = boundaries.right - particle.size;
                    if (boundaries.gravityFloor === canvas.width) {
                        // Settling on right edge - reduce velocity for settling
                        particle.vx *= 0.3;
                    } else {
                        // Bouncing off right wall
                        particle.vx *= -megaConfettiSystem.restitution;
                    }
                }
                
                // Always bounce off top/bottom in horizontal gravity
                if (particle.y <= particle.size) {
                    particle.y = particle.size;
                    particle.vy *= -megaConfettiSystem.restitution;
                }
                if (particle.y >= boundaries.bottom - particle.size) {
                    particle.y = boundaries.bottom - particle.size;
                    particle.vy *= -megaConfettiSystem.restitution;
                }
            } else {
                // Vertical gravity - allow settling on top/bottom, bounce on left/right
                if (particle.y <= particle.size) {
                    particle.y = particle.size;
                    if (boundaries.gravityFloor === 0) {
                        // Settling on top edge - reduce velocity for settling
                        particle.vy *= 0.3;
                    } else {
                        // Bouncing off top wall
                        particle.vy *= -megaConfettiSystem.restitution;
                    }
                }
                if (particle.y >= boundaries.bottom - particle.size) {
                    particle.y = boundaries.bottom - particle.size;
                    if (boundaries.gravityFloor === canvas.height) {
                        // Settling on bottom edge - reduce velocity for settling
                        particle.vy *= 0.3;
                    } else {
                        // Bouncing off bottom wall
                        particle.vy *= -megaConfettiSystem.restitution;
                    }
                }
                
                // Always bounce off left/right in vertical gravity
                if (particle.x <= particle.size) {
                    particle.x = particle.size;
                    particle.vx *= -megaConfettiSystem.restitution;
                }
                if (particle.x >= boundaries.right - particle.size) {
                    particle.x = boundaries.right - particle.size;
                    particle.vx *= -megaConfettiSystem.restitution;
                }
            }
            
            // Settle based on gravity direction
            let isAtFloor = false;
            
            if (boundaries.isVerticalGravity) {
                // Vertical gravity - settle on top or bottom
                if (boundaries.gravityFloor === canvas.height) {
                    // Normal gravity - settle at bottom
                    isAtFloor = particle.y >= canvas.height - particle.size;
                } else {
                    // Upside down - settle at top
                    isAtFloor = particle.y <= particle.size;
                }
            } else if (boundaries.isHorizontalGravity) {
                // Horizontal gravity - settle on left or right
                if (boundaries.gravityFloor === canvas.width) {
                    // Gravity pulls right - settle at right edge
                    isAtFloor = particle.x >= canvas.width - particle.size;
                } else {
                    // Gravity pulls left - settle at left edge
                    isAtFloor = particle.x <= particle.size;
                }
            }
            
            // Check if particle should settle
            if (isAtFloor) {
                // Stop if moving slowly enough
                const totalVelocity = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
                if (totalVelocity < 1.5) {
                    particle.settled = true;
                    particle.vx *= 0.5; // Reduce velocity significantly
                    particle.vy *= 0.5;
                    particle.restingY = particle.y;
                }
            }
            
            // Remove particles that fly too far off screen
            if (particle.y < -100 || particle.x < -100 || particle.x > canvas.width + 100) {
                megaConfettiSystem.particles.splice(i, 1);
                continue;
            }
        }
        
        // Update rotation
        particle.rotation += particle.rotationSpeed;
        
        // Update particle opacity with global fade
        particle.opacity = globalOpacity;
        
        // Draw particle with opacity
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation * Math.PI / 180);
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color;
        
        if (particle.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        }
        
        ctx.restore();
    }
    
    // Check for phase transition from dropping to interactive
    if (megaConfettiSystem.phase === 'dropping') {
        // Count settled particles
        const settledCount = megaConfettiSystem.particles.filter(p => p.settled).length;
        const totalParticles = megaConfettiSystem.particles.length;
        const settledRatio = settledCount / Math.max(totalParticles, 1);
        
        // Transition to interactive phase when most particles have settled OR enough time has passed
        const hasSettled = settledRatio > 0.6; // 60% of particles settled
        const timeElapsed = elapsedTime > megaConfettiSystem.settlingTimeThreshold;
        
        if (hasSettled || timeElapsed) {
            megaConfettiSystem.phase = 'interactive';
            console.log('🎊 Confetti phase: Interactive physics enabled!');
        }
    }
    
    // Continue animation
    requestAnimationFrame(animateMegaConfetti);
}

// Clean up mega confetti on page unload
window.addEventListener('beforeunload', function() {
    cleanupMegaConfetti();
});

// Handle window resize for confetti canvas (debounced for performance)
let resizeTimeout;
function handleCanvasResize() {
    const canvas = document.getElementById('confettiCanvas');
    if (canvas && canvas.style.display !== 'none') {
        // Add canvas size validation
        canvas.width = Math.max(window.innerWidth || 800, 100);
        canvas.height = Math.max(window.innerHeight || 600, 100);
        
        // Update mega confetti system if running
        if (megaConfettiSystem && megaConfettiSystem.running) {
            // Adjust particles that are now off-screen
            megaConfettiSystem.particles.forEach(particle => {
                if (particle.x > canvas.width - particle.size) particle.x = canvas.width - particle.size;
                if (particle.y > canvas.height - particle.size) particle.y = canvas.height - particle.size;
            });
        }
    }
}

window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleCanvasResize, 150);
});

document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();
    
    // Get user info from session
    let currentUser = null;
    let csrfToken = null;
    
    // CSRF token management
    async function getCSRFToken() {
        if (!csrfToken) {
            try {
                const response = await fetch('/api/csrf-token');
                const data = await response.json();
                csrfToken = data.csrfToken;
            } catch (error) {
                console.error('Error fetching CSRF token:', error);
            }
        }
        return csrfToken;
    }
        
        // Load current user from session
        async function loadCurrentUser() {
            try {
                const response = await fetch('/api/user');
                if (!response.ok) {
                    window.location.href = '/';
                    return;
                }
                currentUser = await response.json();
                document.getElementById('userName').textContent = currentUser.email;
                
                // Update challenge info display
                updateChallengeInfo(currentUser.current_challenge);
            } catch (error) {
                console.error('Error loading user:', error);
                window.location.href = '/';
            }
        }
        
        // Update challenge information display
        function updateChallengeInfo(challenge) {
            const challengeInfo = document.getElementById('challengeInfo');
            const form = document.getElementById('stepsForm');
            const submitBtn = document.getElementById('submitStepsBtn');
            const dateInput = document.getElementById('date');
            
            if (challenge) {
                const today = new Date();
                const startDate = new Date(challenge.start_date + 'T00:00:00');
                const endDate = new Date(challenge.end_date + 'T23:59:59');
                const isWithinPeriod = today >= startDate && today <= endDate;
                
                challengeInfo.innerHTML = `
                    <h3>${challenge.name}</h3>
                    <p><strong>Challenge Period:</strong> ${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}</p>
                    <p style="color: #666; font-size: 14px; margin-top: 8px;">You can log steps from the start date onwards, including catch-up entries.</p>
                    ${!isWithinPeriod ? '<p style="color: #666; font-size: 14px; margin-top: 4px;">You can still log steps for dates during this challenge period.</p>' : ''}
                `;
                
                challengeInfo.className = isWithinPeriod ? 'challenge-info active' : 'challenge-info inactive';
                challengeInfo.classList.remove('hidden');
                
                // Disable form if outside challenge period
                if (!isWithinPeriod) {
                    form.classList.add('form-disabled');
                    submitBtn.textContent = 'Challenge Period Inactive';
                    submitBtn.disabled = true;
                } else {
                    form.classList.remove('form-disabled');
                    submitBtn.textContent = 'Save Steps';
                    submitBtn.disabled = false;
                }
                
                // Set date input constraints (works in most browsers)
                dateInput.min = challenge.start_date;
                
                // Set max date to prevent future entries (allow +1 day for timezone flexibility)
                const now = new Date();
                const maxAllowedDate = new Date(now);
                maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
                const maxDateString = maxAllowedDate.toISOString().split('T')[0];
                
                // Use the earlier of challenge end date or max allowed date
                const challengeEndDate = new Date(challenge.end_date + 'T12:00:00');
                dateInput.max = (maxAllowedDate.getTime() < challengeEndDate.getTime()) ? maxDateString : challenge.end_date;
                
                // Add real-time validation for Safari and other browsers
                dateInput.addEventListener('change', function() {
                    validateDateInput(this, challenge);
                });
                dateInput.addEventListener('input', function() {
                    validateDateInput(this, challenge);
                });
            } else {
                challengeInfo.classList.add('hidden');
                form.classList.remove('form-disabled');
                submitBtn.textContent = 'Save Steps';
                submitBtn.disabled = false;
                
                // Remove date constraints
                dateInput.removeAttribute('min');
                dateInput.removeAttribute('max');
            }
        }
        
        // Real-time date validation for all browsers (including Safari)
        function validateDateInput(dateInput, challenge) {
            const messageDiv = document.getElementById('stepsMessage');
            const date = dateInput.value;
            
            if (!date || !challenge) {
                // Reset styling if no date or challenge
                dateInput.style.borderColor = '';
                dateInput.style.backgroundColor = '';
                messageDiv.innerHTML = '';
                return;
            }
            
            // Use specific times for inclusive date range (cross-browser compatibility)
            const stepDate = new Date(date + 'T12:00:00');
            const startDate = new Date(challenge.start_date + 'T00:00:00');
            const endDate = new Date(challenge.end_date + 'T23:59:59');
            
            // Check if date parsing was successful
            if (isNaN(stepDate.getTime())) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = '<div class="message error">Please enter a valid date</div>';
                return;
            }
            
            // Check for future dates (allow +1 day for timezone flexibility)
            const now = new Date();
            const maxAllowedDate = new Date(now);
            maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
            
            if (stepDate.getTime() > maxAllowedDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = '<div class="message error">Cannot enter steps for future dates</div>';
                return;
            }
            
            // Use getTime() for reliable cross-browser date comparison
            // Only block dates before challenge start - allow historical catch-up entries within challenge period
            if (stepDate.getTime() < startDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = `<div class="message error">Date must be on or after the challenge start date (${formatDate(challenge.start_date)})</div>`;
            } else {
                dateInput.style.borderColor = '#667eea';
                dateInput.style.backgroundColor = '#f8fff8';
                messageDiv.innerHTML = '<div class="message success">Date is valid</div>';
            }
        }
        
        // Format date for display
        function formatDate(dateString) {
            const date = new Date(dateString + 'T00:00:00');
            return date.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        }
        
        // Set default date to today
        document.getElementById('date').value = new Date().toISOString().split('T')[0];
        
        // Navigation
        document.getElementById('myStepsBtn').addEventListener('click', () => {
            document.getElementById('myStepsView').classList.remove('hidden');
            document.getElementById('leaderboardView').classList.add('hidden');
            document.getElementById('teamLeaderboardView').classList.add('hidden');
            document.getElementById('myStepsBtn').classList.add('active');
            document.getElementById('leaderboardBtn').classList.remove('active');
            document.getElementById('teamLeaderboardBtn').classList.remove('active');
        });
        
        document.getElementById('leaderboardBtn').addEventListener('click', () => {
            document.getElementById('myStepsView').classList.add('hidden');
            document.getElementById('leaderboardView').classList.remove('hidden');
            document.getElementById('teamLeaderboardView').classList.add('hidden');
            document.getElementById('myStepsBtn').classList.remove('active');
            document.getElementById('leaderboardBtn').classList.add('active');
            document.getElementById('teamLeaderboardBtn').classList.remove('active');
            loadLeaderboard();
        });
        
        document.getElementById('teamLeaderboardBtn').addEventListener('click', () => {
            document.getElementById('myStepsView').classList.add('hidden');
            document.getElementById('leaderboardView').classList.add('hidden');
            document.getElementById('teamLeaderboardView').classList.remove('hidden');
            document.getElementById('myStepsBtn').classList.remove('active');
            document.getElementById('leaderboardBtn').classList.remove('active');
            document.getElementById('teamLeaderboardBtn').classList.add('active');
            loadTeamLeaderboard();
        });
        
        // Load user's steps
        async function loadSteps() {
            try {
                const response = await fetch('/api/steps');
                
                if (response.status === 429) {
                    const data = await response.json();
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60;
                    document.getElementById('stepsList').innerHTML = '<p>Too many requests. Please wait ' + retryAfter + ' minutes and refresh the page.</p>';
                    document.getElementById('stepsChart').innerHTML = '<p>Rate limit exceeded</p>';
                    return;
                }
                
                const steps = await response.json();
                
                const stepsList = document.getElementById('stepsList');
                if (steps.length === 0) {
                    stepsList.innerHTML = '<p>No steps logged yet. Start by adding your first day!</p>';
                } else {
                    stepsList.innerHTML = steps.map(step => 
                        `<div class="step-item">
                            <span>${step.date}</span>
                            <span><strong>${step.count.toLocaleString()} steps</strong></span>
                        </div>`
                    ).join('');
                }
                
                // Update chart
                renderStepsChart(steps);
                
            } catch (error) {
                document.getElementById('stepsList').innerHTML = '<p>Error loading steps</p>';
                document.getElementById('stepsChart').innerHTML = '<p>Error loading chart</p>';
            }
        }
        
        // Render steps chart
        function renderStepsChart(steps) {
            const chartContainer = document.getElementById('stepsChart');
            
            if (steps.length === 0) {
                chartContainer.innerHTML = '<p style="text-align: center; color: #666; margin: 40px 0;">No step data to display</p>';
                return;
            }
            
            // Create a map of steps by date
            const stepsByDate = {};
            steps.forEach(step => {
                stepsByDate[step.date] = step.count;
            });
            
            // Generate last 10 days (or all available data if less)
            const today = new Date();
            const days = [];
            const maxDays = Math.min(10, steps.length + 5); // Show some empty days too
            
            for (let i = maxDays - 1; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                
                days.push({
                    date: dateStr,
                    displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    steps: stepsByDate[dateStr] || 0
                });
            }
            
            // Find max steps for scaling
            const maxSteps = Math.max(...days.map(d => d.steps), 1);
            
            // Create bars
            const bars = days.map(day => {
                const heightPercent = day.steps > 0 ? (day.steps / maxSteps) * 90 + 10 : 5; // Min 5% height for empty days
                const isToday = day.date === today.toISOString().split('T')[0];
                const hasData = day.steps > 0;
                
                return `<div class="step-bar ${!hasData ? 'no-data' : ''}" 
                             style="height: ${heightPercent}%${isToday ? '; border: 2px solid #667eea;' : ''}"
                             data-date="${day.displayDate}" 
                             data-steps="${hasData ? day.steps.toLocaleString() + ' steps' : 'No data'}"
                             title="${day.displayDate}: ${hasData ? day.steps.toLocaleString() + ' steps' : 'No data'}">
                        </div>`;
            }).join('');
            
            chartContainer.innerHTML = bars;
        }
        
        // Load leaderboard
        async function loadLeaderboard() {
            try {
                const response = await fetch('/api/leaderboard');
                const data = await response.json();
                
                console.log('Leaderboard API response:', data);
                
                const leaderboardDiv = document.getElementById('leaderboard');
                
                
                // Handle legacy all-time format or new challenge format
                let leaderboard = [];
                let challengeInfo = '';
                
                if (data.type === 'all_time') {
                    leaderboard = data.data;
                    challengeInfo = '<h3>All-Time Rankings</h3>';
                } else if (data.type === 'challenge') {
                    challengeInfo = `<h3>${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked section
                if (data.data.ranked && data.data.ranked.length > 0) {
                    html += '<div class="ranked-section"><h4 style="color: #28a745; margin: 15px 0 10px 0;">Ranked Participants</h4>';
                    html += data.data.ranked.map((user, index) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
                                <span class="rank">#${index + 1}</span>
                                <strong>${user.name}</strong>
                                ${user.team ? `<span style="color: #888; font-size: 0.75em; margin-left: 4px;">${user.team}</span>` : ''}
                                ${formatReportingRate(user.personal_reporting_rate, '#28a745')}
                            </div>
                            <div>
                                <div><strong>${Math.round(user.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${user.total_steps.toLocaleString()} total • ${user.days_logged} days
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Show unranked section
                if (data.data.unranked && data.data.unranked.length > 0) {
                    html += '<div class="unranked-section"><h4 style="color: #ffc107; margin: 15px 0 10px 0;">Unranked Participants</h4>';
                    html += '<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">Need more consistent reporting to be ranked</p>';
                    html += data.data.unranked.map((user) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}" style="opacity: 0.8;">
                            <div>
                                <span class="rank">-</span>
                                <strong>${user.name}</strong>
                                ${user.team ? `<span style="color: #888; font-size: 0.75em; margin-left: 4px;">${user.team}</span>` : ''}
                                ${formatReportingRate(user.personal_reporting_rate, '#ffc107')}
                            </div>
                            <div>
                                <div><strong>${Math.round(user.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${user.total_steps.toLocaleString()} total • ${user.days_logged} days
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Handle legacy array format (all-time rankings)
                if (Array.isArray(data)) {
                    html = data.map((user, index) => {
                        const isCurrentUser = currentUser && user.name === currentUser.name;
                        const highlightClass = isCurrentUser ? ' current-user' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
                                <span class="rank">#${index + 1}</span>
                                <strong>${user.name}</strong>
                                ${user.team ? `<span style="color: #888; font-size: 0.75em; margin-left: 4px;">${user.team}</span>` : ''}
                            </div>
                            <div>
                                <div><strong>${Math.round(user.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${user.total_steps.toLocaleString()} total • ${user.days_logged} days
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                }
                
                // Add explanatory footer if there's actual leaderboard content (Individual only shows reporting rate)
                const hasContent = (data.data.ranked && data.data.ranked.length > 0) || (data.data.unranked && data.data.unranked.length > 0) || Array.isArray(data);
                if (hasContent) {
                    html += `<div class="leaderboard-footer" style="margin-top: 20px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; font-size: 0.8em; color: #666; text-align: center;">
                        📋&nbsp;Reporting rate
                    </div>`;
                }
                
                leaderboardDiv.innerHTML = html;
            } catch (error) {
                console.error('Leaderboard error:', error);
                document.getElementById('leaderboard').innerHTML = '<p>Error loading leaderboard</p>';
            }
        }
        
        // Handle form submission
        document.getElementById('stepsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const date = document.getElementById('date').value;
            const steps = parseInt(document.getElementById('steps').value);
            const messageDiv = document.getElementById('stepsMessage');
            
            // Comprehensive client-side date validation for all browsers (including Safari)
            if (currentUser && currentUser.current_challenge) {
                const challenge = currentUser.current_challenge;
                
                // Validate date format first
                if (!date || date.trim() === '') {
                    messageDiv.innerHTML = '<div class="message error">Please select a date.</div>';
                    return;
                }
                
                // Parse dates carefully for inclusive date range
                const stepDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone edge cases
                const startDate = new Date(challenge.start_date + 'T00:00:00');
                const endDate = new Date(challenge.end_date + 'T23:59:59');
                
                // Check if date parsing was successful
                if (isNaN(stepDate.getTime())) {
                    messageDiv.innerHTML = '<div class="message error">Please enter a valid date.</div>';
                    return;
                }
                
                // Prevent future date entries (allow +1 day for timezone flexibility)
                const now = new Date();
                const maxAllowedDate = new Date(now);
                maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
                
                if (stepDate.getTime() > maxAllowedDate.getTime()) {
                    messageDiv.innerHTML = '<div class="message error">Cannot enter steps for future dates.</div>';
                    return;
                }
                
                // Compare dates using getTime() for cross-browser compatibility
                // Only block dates before challenge start - allow historical catch-up entries within challenge period
                if (stepDate.getTime() < startDate.getTime()) {
                    messageDiv.innerHTML = `<div class="message error">Step logging is only allowed from the challenge start date onwards (${formatDate(challenge.start_date)}).</div>`;
                    return;
                }
            }
            
            // Additional validation for steps input
            if (!steps || steps <= 0) {
                messageDiv.innerHTML = '<div class="message error">Please enter a valid number of steps.</div>';
                return;
            }
            
            if (steps > 100000) {
                messageDiv.innerHTML = '<div class="message error">Maximum 100,000 steps per day allowed.</div>';
                return;
            }
            
            try {
                const token = await getCSRFToken();
                const response = await fetch('/api/steps', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        date: date,
                        count: steps,
                        csrfToken: token
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    messageDiv.innerHTML = '<div class="message success">Steps saved successfully!</div>';
                    document.getElementById('steps').value = '';
                    
                    // Trigger confetti for high step counts
                    celebrateSteps(steps);
                    
                    loadSteps(); // Reload the steps list
                } else if (response.status === 429) {
                    const retryAfter = Math.floor(data.retryAfter / 60) || 60; // Convert to minutes
                    messageDiv.innerHTML = '<div class="message error">Too many requests. Please wait ' + retryAfter + ' minutes before trying again.</div>';
                } else {
                    messageDiv.innerHTML = '<div class="message error">' + data.error + '</div>';
                }
            } catch (error) {
                messageDiv.innerHTML = '<div class="message error">Network error. Please try again.</div>';
            }
        });
        
        // Load team leaderboard
        async function loadTeamLeaderboard() {
            // Clear expanded state when reloading
            expandedTeams.clear();
            
            try {
                const response = await fetch('/api/team-leaderboard');
                const data = await response.json();
                
                const teamLeaderboard = document.getElementById('teamLeaderboard');
                
                // Handle different response types
                if (data.type === 'insufficient_data') {
                    teamLeaderboard.innerHTML = `<div class="info-message">
                        <h3>${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>
                        <p>${data.message}</p>
                        <p style="font-size: 0.9em; color: #666;">
                            ${data.meta.actual_entries}/${data.meta.expected_entries} expected team entries 
                            (${data.meta.reporting_percentage >= 1 ? Math.round(data.meta.reporting_percentage) : data.meta.reporting_percentage}% team participation)
                        </p>
                    </div>`;
                    return;
                }
                
                // Handle legacy all-time format or new challenge format
                let challengeInfo = '';
                
                if (data.type === 'all_time') {
                    challengeInfo = '<h3>All-Time Team Rankings</h3>';
                } else if (data.type === 'challenge') {
                    challengeInfo = `<h3>${data.meta.challenge_name} - Day ${data.meta.challenge_day}</h3>`;
                }
                
                let html = challengeInfo;
                
                // Show ranked teams section
                if (data.data.ranked && data.data.ranked.length > 0) {
                    html += '<div class="ranked-section"><h4 style="color: #28a745; margin: 15px 0 10px 0;">Ranked Teams</h4>';
                    html += data.data.ranked.map((team, index) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}">
                            <div>
                                <span class="team-disclosure" data-team="${team.team}">▶</span>
                                <span class="rank">#${index + 1}</span>
                                <strong>${team.team}</strong>
                                ${formatMemberCount(team.member_count)}
                                ${formatReportingRate(team.team_reporting_rate, '#28a745')}
                            </div>
                            <div>
                                <div><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${team.total_steps.toLocaleString()} total steps
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Show unranked teams section
                if (data.data.unranked && data.data.unranked.length > 0) {
                    html += '<div class="unranked-section"><h4 style="color: #ffc107; margin: 15px 0 10px 0;">Unranked Teams</h4>';
                    html += '<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">Need more consistent team reporting to be ranked</p>';
                    html += data.data.unranked.map((team) => {
                        const isCurrentTeam = currentUser && currentUser.team === team.team;
                        const highlightClass = isCurrentTeam ? ' current-team' : '';
                        
                        return `<div class="leaderboard-item${highlightClass}" style="opacity: 0.8;">
                            <div>
                                <span class="team-disclosure" data-team="${team.team}">▶</span>
                                <span class="rank">-</span>
                                <strong>${team.team}</strong>
                                ${formatMemberCount(team.member_count)}
                                ${formatReportingRate(team.team_reporting_rate, '#ffc107')}
                            </div>
                            <div>
                                <div><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                <div style="font-size: 0.9em; color: #666;">
                                    ${team.total_steps.toLocaleString()} total steps
                                </div>
                            </div>
                        </div>`;
                    }).join('');
                    html += '</div>';
                }
                
                // Handle legacy array format (all-time rankings) or empty data
                if (Array.isArray(data)) {
                    if (data.length === 0) {
                        html = '<p>No teams with members yet.</p>';
                    } else {
                        html = data.map((team, index) => {
                            const isCurrentTeam = currentUser && currentUser.team === team.team;
                            const highlightClass = isCurrentTeam ? ' current-team' : '';
                            
                            return `<div class="leaderboard-item${highlightClass}">
                                <div>
                                    <span class="team-disclosure" data-team="${team.team}">▶</span>
                                    <span class="rank">#${index + 1}</span>
                                    <strong>${team.team}</strong>
                                    ${formatMemberCount(team.member_count)}
                                </div>
                                <div>
                                    <div><strong>${Math.round(team.team_steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                                    <div style="font-size: 0.9em; color: #666;">
                                        ${team.total_steps.toLocaleString()} total steps
                                    </div>
                                </div>
                            </div>`;
                        }).join('');
                    }
                }
                
                // Add explanatory footer if there's actual leaderboard content (Teams show both member count and reporting rate)
                const hasTeamContent = (data.data && ((data.data.ranked && data.data.ranked.length > 0) || (data.data.unranked && data.data.unranked.length > 0))) || (Array.isArray(data) && data.length > 0);
                if (hasTeamContent) {
                    html += `<div class="leaderboard-footer" style="margin-top: 20px; padding: 12px; background: rgba(255,255,255,0.1); border-radius: 8px; font-size: 0.8em; color: #666; text-align: center;">
                        👥&nbsp;Member count • 📋&nbsp;Reporting rate
                    </div>`;
                }
                
                teamLeaderboard.innerHTML = html;
                attachDisclosureListeners();
            } catch (error) {
                console.error('Team leaderboard error:', error);
                document.getElementById('teamLeaderboard').innerHTML = '<p>Error loading team leaderboard</p>';
            }
        }

        // Attach event listeners to disclosure triangles
        function attachDisclosureListeners() {
            const disclosureTriangles = document.querySelectorAll('.team-disclosure');
            disclosureTriangles.forEach(triangle => {
                triangle.addEventListener('click', function() {
                    const teamName = this.getAttribute('data-team');
                    toggleTeamDisclosure(teamName, this);
                });
            });
        }

        // Team member disclosure functionality
        async function toggleTeamDisclosure(teamName, disclosureElement) {
            console.log('toggleTeamDisclosure called with:', teamName, disclosureElement);
            const isExpanded = expandedTeams.has(teamName);
            
            if (isExpanded) {
                // Collapse
                const membersList = document.getElementById(`members-${teamName.replace(/[^a-zA-Z0-9]/g, '_')}`);
                if (membersList) {
                    membersList.style.maxHeight = membersList.scrollHeight + 'px';
                    membersList.style.overflow = 'hidden';
                    requestAnimationFrame(() => {
                        membersList.style.maxHeight = '0px';
                        setTimeout(() => {
                            membersList.remove();
                        }, 300);
                    });
                }
                
                disclosureElement.innerHTML = '▶';
                expandedTeams.delete(teamName);
            } else {
                // Expand
                try {
                    const response = await fetch(`/api/teams/${encodeURIComponent(teamName)}/members`);
                    const members = await response.json();
                    
                    if (response.ok) {
                        const membersList = createMembersList(teamName, members);
                        const teamItem = disclosureElement.closest('.leaderboard-item');
                        teamItem.insertAdjacentElement('afterend', membersList);
                        
                        // Animate expansion
                        membersList.style.maxHeight = '0px';
                        membersList.style.overflow = 'hidden';
                        requestAnimationFrame(() => {
                            membersList.style.maxHeight = membersList.scrollHeight + 'px';
                            setTimeout(() => {
                                membersList.style.maxHeight = 'none';
                                membersList.style.overflow = 'visible';
                            }, 300);
                        });
                        
                        disclosureElement.innerHTML = '▼';
                        expandedTeams.add(teamName);
                    } else {
                        console.error('Error loading team members:', members.error);
                    }
                } catch (error) {
                    console.error('Error fetching team members:', error);
                }
            }
        }

        function createMembersList(teamName, members) {
            const membersList = document.createElement('div');
            membersList.id = `members-${teamName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            membersList.className = 'team-members-list';
            membersList.style.transition = 'max-height 0.3s ease-out';
            
            const membersHtml = members.map(member => `
                <div class="member-item">
                    <div class="member-info">
                        <span class="member-name">${member.name}</span>
                        ${member.personal_reporting_rate !== undefined ? 
                            `<span class="member-reporting">${member.personal_reporting_rate >= 1 ? Math.round(member.personal_reporting_rate) : member.personal_reporting_rate}% reporting</span>` 
                            : ''}
                    </div>
                    <div class="member-stats">
                        <div><strong>${Math.round(member.steps_per_day_reported).toLocaleString()}</strong> steps/day</div>
                        <div style="font-size: 0.8em; color: #666;">
                            ${member.total_steps.toLocaleString()} total • ${member.days_logged} days
                        </div>
                    </div>
                </div>
            `).join('');
            
            membersList.innerHTML = membersHtml;
            return membersList;
        }

        // Handle responsive leaderboard updates on window resize
        window.addEventListener('resize', function() {
            // Refresh leaderboards if they're currently displayed to update mobile/desktop formatting
            const individualTab = document.getElementById('leaderboardBtn');
            const teamTab = document.getElementById('teamLeaderboardBtn');
            
            if (individualTab && individualTab.classList.contains('active')) {
                loadLeaderboard();
            } else if (teamTab && teamTab.classList.contains('active')) {
                loadTeamLeaderboard();
            }
        });

        // Load initial data
        loadCurrentUser().then(() => {
            loadSteps();
        });
        
        // Expose functions globally for admin panel testing
        window.createMegaConfetti = createMegaConfetti;
        window.createConfetti = createConfetti;
        window.celebrateSteps = celebrateSteps;
});
