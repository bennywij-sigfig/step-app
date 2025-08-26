// Mega Confetti Physics System
// Extracted from dashboard.js for better modularity
// Advanced physics system with device motion, orientation, and interactive controls

// Physics system state
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

function createMegaConfetti() {
    // Properly clean up any existing system before creating new one  
    if (megaConfettiSystem && megaConfettiSystem.running) {
        window.cleanupMegaConfetti();
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
        restitution: parseFloat(localStorage.getItem('confettiBounciness') || '0.7'),
        particleMinSize: parseInt(localStorage.getItem('confettiMinSize') || '3', 10),
        particleMaxSize: parseInt(localStorage.getItem('confettiMaxSize') || '8', 10),
        shapeVariety: parseFloat(localStorage.getItem('confettiShapeVariety') || '1.0'),
        colors: ['#FF1493', '#FFD700', '#00FF00', '#FF4500', '#FF69B4', '#00BFFF', '#FF6347', '#7FFF00', '#FF00FF', '#FFA500'],
        lastTime: 0,
        accelerometer: { x: 0, y: 0, z: 0 },
        accelerometerBaseline: { x: 0, y: 0, z: 0 },
        baselineCalibrated: false,
        mousePos: { x: 0, y: 0 },
        mousePressed: false,
        startTime: Date.now(),
        shakeThreshold: 8,
        phase: 'dropping', // 'dropping' or 'interactive'
        settlingTimeThreshold: 1500, // 1.5 seconds for fast delight
        settledParticles: 0, // Count of particles that have settled at bottom
        fadeStartTime: parseInt(localStorage.getItem('confettiLifetime') || '10000', 10), // Start fading after configured seconds
        fadeDuration: 3000,   // Fade out over 3 seconds
        orientation: {
            angle: 0,              // Current rotation angle (0, 90, 180, 270)
            gravityX: 0,           // Gravity X component based on orientation
            gravityY: 0.3          // Gravity Y component based on orientation
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
    const initialVelocity = getOrientationAwareInitialVelocity();
    
    // Varied particle sizes based on admin settings
    const minSize = megaConfettiSystem.particleMinSize;
    const maxSize = megaConfettiSystem.particleMaxSize;
    const size = Math.random() * (maxSize - minSize) + minSize;
    
    // Shape variety based on admin settings
    const shapes = ['circle', 'square', 'strip', 'diamond'];
    const varietyFactor = megaConfettiSystem.shapeVariety;
    const availableShapes = Math.max(1, Math.floor(shapes.length * varietyFactor));
    const shape = shapes[Math.floor(Math.random() * availableShapes)];
    
    const particle = {
        x: x,
        y: y,
        vx: initialVelocity.vx + (Math.random() - 0.5) * 6, // Add some spread
        vy: initialVelocity.vy + (Math.random() - 0.5) * 4,
        size: size,
        color: megaConfettiSystem.colors[Math.floor(Math.random() * megaConfettiSystem.colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        settled: false,
        shape: shape,
        settleTime: null, // When particle first settles at bottom
        lastGroundTime: 0, // Track time particle touched ground
        minVelocityForSettle: 0.5, // Minimum velocity to consider settled
        bounceCount: 0 // Track bounces for decreasing bounciness
    };
    
    megaConfettiSystem.particles.push(particle);
}

// Get initial velocity based on current device orientation
function getOrientationAwareInitialVelocity() {
    // Use temp orientation if megaConfettiSystem isn't ready yet
    const angle = megaConfettiSystem ? megaConfettiSystem.orientation.angle : (window.tempConfettiOrientation ? window.tempConfettiOrientation.angle : 0);
    const speed = 8; // Base speed for initial burst
    
    // Initial burst should be OPPOSITE to gravity direction
    switch (angle) {
        case 0:   return { vx: 0, vy: -speed }; // Portrait: burst upward
        case 90:  return { vx: 0, vy: -speed }; // Landscape: burst upward 
        case 180: return { vx: 0, vy: speed };  // Upside down: burst downward
        case -90:
        case 270: return { vx: 0, vy: -speed }; // Landscape: burst upward
        default:  return { vx: 0, vy: -speed }; // Default: burst upward
    }
}

// Orientation detection and physics transformation
let orientationUpdateTimeout;

function setupOrientationDetection() {
    // Initialize orientation immediately
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
    
    // Get current orientation - use Screen Orientation API first, fallback to window.orientation
    let angle = 0;
    if (screen.orientation && screen.orientation.angle !== undefined) {
        angle = screen.orientation.angle;
    } else if (window.orientation !== undefined) {
        angle = window.orientation;
    } else {
        // Ultimate fallback - use window dimensions
        angle = window.innerWidth > window.innerHeight ? 90 : 0;
    }
    
    megaConfettiSystem.orientation.angle = angle;
    console.log(`🎊 Confetti orientation updated: ${angle}°`);
    
    // Calculate gravity direction based on PHYSICAL device orientation
    // This ensures particles always fall toward the ACTUAL bottom of the device
    const gravityStrength = 0.3;
    switch (angle) {
        case 0:   // Portrait - gravity pulls down (normal)
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = gravityStrength;
            break;
        case 90:  // Landscape left - gravity pulls toward bottom of screen (long edge)
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = gravityStrength;
            break;
        case 180: // Portrait upside down - gravity pulls up (toward top of screen)
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = -gravityStrength;
            break;
        case -90:
        case 270: // Landscape right - gravity pulls toward bottom of screen (long edge)
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = gravityStrength;
            break;
        default:  // Fallback to portrait
            megaConfettiSystem.orientation.gravityX = 0;
            megaConfettiSystem.orientation.gravityY = gravityStrength;
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
    
    // Transform accelerometer coordinates to match screen coordinates for ANY orientation
    // This ensures tilt direction always matches expected screen behavior
    switch (angle) {
        case 0:   // Portrait (normal)
            return { x: x, y: y };
        case 90:  // Landscape (rotated left)
            return { x: -y, y: x };
        case 180: // Portrait (upside down)
            return { x: -x, y: -y };
        case -90:
        case 270: // Landscape (rotated right)
            return { x: y, y: -x };
        default:  // Fallback to portrait
            return { x: x, y: y };
    }
}

function getOrientationAwareBoundaries(canvas) {
    const angle = megaConfettiSystem.orientation.angle;
    
    // Calculate where particles should settle based on gravity direction
    // Note: reverseYDirection only affects accelerometer response, not initial settling
    switch (angle) {
        case 0:   // Portrait: settle at bottom
            return { 
                settleY: canvas.height,
                leftX: 0, 
                rightX: canvas.width, 
                topY: 0, 
                bottomY: canvas.height 
            };
        case 90:  // Landscape left: settle at bottom (screen bottom = device right edge)
            return { 
                settleY: canvas.height, 
                leftX: 0, 
                rightX: canvas.width, 
                topY: 0, 
                bottomY: canvas.height 
            };
        case 180: // Portrait upside down: settle at top (screen top = device bottom)
            return { 
                settleY: 0, 
                leftX: 0, 
                rightX: canvas.width, 
                topY: 0, 
                bottomY: canvas.height 
            };
        case -90:
        case 270: // Landscape right: settle at bottom (screen bottom = device left edge)
            return { 
                settleY: canvas.height, 
                leftX: 0, 
                rightX: canvas.width, 
                topY: 0, 
                bottomY: canvas.height 
            };
        default:
            return { 
                settleY: canvas.height, 
                leftX: 0, 
                rightX: canvas.width, 
                topY: 0, 
                bottomY: canvas.height 
            };
    }
}

function setupDeviceMotion() {
    // iOS 13+ requires permission for device motion
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        if (deviceMotionPermissionStatus === null) { // Only request once per session
            DeviceMotionEvent.requestPermission()
                .then(response => {
                    deviceMotionPermissionStatus = response;
                    if (response === 'granted') {
                        addDeviceMotionListener();
                    } else {
                        console.log('🎊 Device motion permission denied - confetti will use basic physics');
                    }
                })
                .catch(console.error);
        } else if (deviceMotionPermissionStatus === 'granted') {
            addDeviceMotionListener();
        }
    } else if (typeof DeviceMotionEvent !== 'undefined') {
        // Non-iOS or older iOS - add listener directly
        addDeviceMotionListener();
    }
    
    function addDeviceMotionListener() {
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
                    deltaX * deltaX + 
                    deltaY * deltaY + 
                    deltaZ * deltaZ
                );
                
                // Only apply tilt forces during interactive phase (after particles have settled)
                if (megaConfettiSystem.phase === 'interactive') {
                    // Apply gentle tilt forces based on delta changes from baseline (now properly oriented)
                    const tiltSensitivity = parseFloat(localStorage.getItem('confettiTiltSensitivity') || '0.3');
                    const maxTiltForce = parseFloat(localStorage.getItem('confettiMaxTiltForce') || '2.0');
                    
                    // Check if Y-axis response should be reversed
                    const reverseY = localStorage.getItem('reverseYDirection') === 'true';
                    const yMultiplier = reverseY ? -1 : 1;
                    
                    megaConfettiSystem.particles.forEach(particle => {
                        // Apply continuous tilt forces to all particles, especially settled ones
                        if (particle.settled || Math.abs(particle.vy) < 2) {
                            // Screen-relative tilt forces (now properly transformed)
                            const tiltForceX = Math.max(-maxTiltForce, Math.min(maxTiltForce, deltaX * tiltSensitivity));
                            const tiltForceY = Math.max(-maxTiltForce, Math.min(maxTiltForce, deltaY * tiltSensitivity * yMultiplier));
                            
                            particle.vx += tiltForceX;
                            particle.vy += tiltForceY;
                            
                            // Wake up settled particles when tilted significantly
                            if (particle.settled && (Math.abs(tiltForceX) > 0.8 || Math.abs(tiltForceY) > 0.8)) {
                                particle.settled = false;
                            }
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
                
                if (distance < 60 && distance > 0.1) {
                    const forceMultiplier = (60 - distance) / 60;
                    particle.vx += deltaX * forceMultiplier * 0.4;
                    particle.vy += deltaY * forceMultiplier * 0.4;
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
        
        // Always apply gravity and update position (even for settled particles)
        // This allows particles to continue bouncing and lose energy naturally
        
        // Apply orientation-aware gravity
        particle.vx += megaConfettiSystem.orientation.gravityX;
        particle.vy += megaConfettiSystem.orientation.gravityY;
        
        // Update position
        particle.x += particle.vx;
        particle.y += particle.vy;
        
        // Apply friction (slightly less for settled particles)
        const frictionAmount = particle.settled ? megaConfettiSystem.friction * 0.95 : megaConfettiSystem.friction;
        particle.vx *= frictionAmount;
        particle.vy *= frictionAmount;
            
            // Get orientation-aware boundaries
            const boundaries = getOrientationAwareBoundaries(canvas);
            
            // Enhanced bouncy collision physics
            let bounced = false;
            const currentBounciness = megaConfettiSystem.restitution * Math.max(0.3, 1 - particle.bounceCount * 0.1); // Decrease bounciness with each bounce
            const friction = megaConfettiSystem.friction;
            
            // Enhanced boundary collisions - ALL edges bounce based on bounciness setting
            // Left wall collision
            if (particle.x - particle.size <= boundaries.leftX) {
                particle.x = boundaries.leftX + particle.size;
                if (particle.vx < 0) {
                    particle.vx = -particle.vx * currentBounciness;
                    particle.bounceCount++;
                    bounced = true;
                }
            }
            
            // Right wall collision  
            if (particle.x + particle.size >= boundaries.rightX) {
                particle.x = boundaries.rightX - particle.size;
                if (particle.vx > 0) {
                    particle.vx = -particle.vx * currentBounciness;
                    particle.bounceCount++;
                    bounced = true;
                }
            }
            
            // Top ceiling collision
            if (particle.y - particle.size <= boundaries.topY) {
                particle.y = boundaries.topY + particle.size;
                if (particle.vy < 0) {
                    particle.vy = -particle.vy * currentBounciness;
                    particle.bounceCount++;
                    bounced = true;
                }
            }
            
            // Bottom floor collision - special settling logic
            if (particle.y + particle.size >= boundaries.bottomY) {
                particle.y = boundaries.bottomY - particle.size;
                particle.lastGroundTime = currentTime;
                
                if (particle.vy > 0) {
                    particle.vy = -particle.vy * currentBounciness;
                    particle.bounceCount++;
                    bounced = true;
                    
                    // Check if particle should be considered "settled"
                    if (Math.abs(particle.vy) < particle.minVelocityForSettle && 
                        Math.abs(particle.vx) < particle.minVelocityForSettle * 2 && 
                        currentTime - particle.lastGroundTime > 200) {
                        particle.settled = true;
                        particle.settleTime = currentTime;
                    }
                }
            }
            
            // Apply surface friction when bouncing 
            if (bounced && Math.abs(particle.vx) > 0.1) {
                particle.vx *= 0.8; // Surface friction reduces horizontal velocity
            }
            
        // Remove particles that fly too far off screen
        if (particle.y < -100 || particle.x < -100 || particle.x > canvas.width + 100) {
            megaConfettiSystem.particles.splice(i, 1);
            continue;
        }
        
        // Update rotation
        particle.rotation += particle.rotationSpeed;
        
        // Reduce rotation speed over time for settled particles
        if (particle.settled) {
            particle.rotationSpeed *= 0.95;
        }
        
        // Draw particle with global fade opacity
        ctx.save();
        ctx.globalAlpha = globalOpacity;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation * Math.PI / 180);
        
        // Set color and draw based on shape
        ctx.fillStyle = particle.color;
        
        switch (particle.shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'square':
                ctx.fillRect(-particle.size/2, -particle.size/2, particle.size, particle.size);
                break;
            case 'strip':
                ctx.fillRect(-particle.size/4, -particle.size, particle.size/2, particle.size * 2);
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(0, -particle.size/2);
                ctx.lineTo(particle.size/2, 0);
                ctx.lineTo(0, particle.size/2);
                ctx.lineTo(-particle.size/2, 0);
                ctx.closePath();
                ctx.fill();
                break;
            default:
                ctx.fillRect(-particle.size/2, -particle.size/2, particle.size, particle.size);
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

// Enhanced cleanup function for mega confetti
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

// Make functions globally accessible
window.createMegaConfetti = createMegaConfetti;
window.cleanupMegaConfetti = cleanupMegaConfetti;
// Note: megaConfettiSystem is managed internally in this module

console.log('Mega confetti physics system loaded');