// HTML escaping function to prevent XSS vulnerabilities
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Team disclosure functionality - must be global
let expandedTeams = new Set(); // Track expanded state

// Individual user disclosure functionality
let expandedUsers = new Set(); // Track expanded user data state

// Confetti thresholds - loaded from server
let confettiThresholds = {
    regular: 15000,
    epic: 20000
};

// App icon configuration
const APP_ICONS = {
    paws: '🐾',
    feet: '🦶',
    shoe: '👟',
    runner: '🏃'
};

const APP_ICON_STORAGE_KEY = 'appIconConfig';

// Shadow mode discovery system
const SHADOW_MODE_KEY = 'shadowModeDiscovered';
let shadowModeClickCount = 0;
let shadowModeClickTimer = null;
const SHADOW_DISCOVERY_CLICKS = 7; // Number of clicks needed to discover shadow mode
const SHADOW_CLICK_TIMEOUT = 3000; // Reset click count after 3 seconds of inactivity

function getRandomIcon() {
    const icons = Object.values(APP_ICONS);
    return icons[Math.floor(Math.random() * icons.length)];
}

function getAppIconConfig() {
    try {
        const stored = localStorage.getItem(APP_ICON_STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Error parsing app icon config:', e);
    }
    return {
        style: 'paws'
    };
}

function setAppIconConfig(config) {
    localStorage.setItem(APP_ICON_STORAGE_KEY, JSON.stringify(config));
    applyAppIcon();
}

function applyAppIcon() {
    const config = getAppIconConfig();
    const iconElement = document.getElementById('appIcon');
    
    if (!iconElement) return;
    
    // Determine icon to display
    let icon;
    if (config.style === 'random') {
        icon = getRandomIcon();
    } else {
        icon = APP_ICONS[config.style] || APP_ICONS.paws;
    }
    
    // Update icon (always show as it's now the main branding element)
    iconElement.textContent = icon;
}

// Shadow mode discovery functions
function isShadowModeDiscovered() {
    return localStorage.getItem(SHADOW_MODE_KEY) === 'true';
}

function handleShadowModeClick() {
    // Only count clicks if shadow mode hasn't been discovered yet
    if (isShadowModeDiscovered()) return;
    
    shadowModeClickCount++;
    
    // Clear previous timer
    if (shadowModeClickTimer) {
        clearTimeout(shadowModeClickTimer);
    }
    
    // Visual feedback for easter egg progress
    const iconElement = document.getElementById('appIcon');
    if (iconElement) {
        // Subtle animation to hint at easter egg
        iconElement.style.transform = `scale(${1 + shadowModeClickCount * 0.02})`;
        iconElement.style.filter = `hue-rotate(${shadowModeClickCount * 20}deg)`;
        
        // Reset visual effects after a brief moment
        setTimeout(() => {
            if (!isShadowModeDiscovered()) {
                iconElement.style.transform = '';
                iconElement.style.filter = '';
            }
        }, 200);
    }
    
    // Check if discovery threshold reached
    if (shadowModeClickCount >= SHADOW_DISCOVERY_CLICKS) {
        discoverShadowMode();
    } else {
        // Reset counter after timeout
        shadowModeClickTimer = setTimeout(() => {
            shadowModeClickCount = 0;
            if (iconElement) {
                iconElement.style.transform = '';
                iconElement.style.filter = '';
            }
        }, SHADOW_CLICK_TIMEOUT);
    }
}

function discoverShadowMode() {
    localStorage.setItem(SHADOW_MODE_KEY, 'true');
    shadowModeClickCount = 0;
    
    // Clear any pending timers
    if (shadowModeClickTimer) {
        clearTimeout(shadowModeClickTimer);
    }
    
    // Dramatic discovery animation
    const iconElement = document.getElementById('appIcon');
    if (iconElement) {
        iconElement.style.transform = 'scale(1.3)';
        iconElement.style.filter = 'hue-rotate(180deg) brightness(1.5)';
        iconElement.style.textShadow = '0 0 20px rgba(255,255,255,0.8)';
    }
    
    // Show discovery message with confetti
    setTimeout(() => {
        createConfetti();
        
        // Show mystery message
        const messageDiv = document.getElementById('stepsMessage') || document.body;
        const shadowMsg = document.createElement('div');
        shadowMsg.innerHTML = `
            <div class="message" style="background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%); color: #fff; border: 2px solid #666; animation: pulse 2s ease-in-out 3; box-shadow: 0 0 20px rgba(0,0,0,0.5);">
                🐷 You've discovered the Shadow Realm! A mysterious alternate dimension has been unlocked...
                <br><small style="opacity: 0.8;">Look for the shadow toggle to enter</small>
            </div>
        `;
        messageDiv.appendChild(shadowMsg);
        
        // Remove message after 5 seconds
        setTimeout(() => {
            if (shadowMsg.parentElement) {
                shadowMsg.remove();
            }
        }, 5000);
        
        // Reveal shadow mode toggle
        revealShadowModeToggle();
    }, 500);
}

function revealShadowModeToggle() {
    // Create shadow mode toggle button
    const shadowToggle = document.createElement('button');
    shadowToggle.id = 'shadowModeToggle';
    shadowToggle.className = 'shadow-toggle-btn';
    shadowToggle.innerHTML = '🌙 Shadow Mode';
    shadowToggle.title = 'Enter the Shadow Realm';
    
    // Add styles for shadow toggle
    shadowToggle.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #2d2d2d 0%, #1a1a1a 100%);
        color: #fff;
        border: 2px solid #666;
        border-radius: 25px;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        z-index: 1000;
        transition: all 0.3s ease;
        box-shadow: 0 4px 15px rgba(0,0,0,0.3);
        animation: shadowPulse 2s ease-in-out infinite;
    `;
    
    shadowToggle.addEventListener('click', toggleShadowMode);
    document.body.appendChild(shadowToggle);
    
    // Add CSS animation for pulsing effect
    if (!document.getElementById('shadowModeStyles')) {
        const style = document.createElement('style');
        style.id = 'shadowModeStyles';
        style.textContent = `
            @keyframes shadowPulse {
                0%, 100% { box-shadow: 0 4px 15px rgba(0,0,0,0.3), 0 0 0 0 rgba(45,45,45,0.4); }
                50% { box-shadow: 0 4px 15px rgba(0,0,0,0.3), 0 0 0 8px rgba(45,45,45,0.0); }
            }
            
            .shadow-toggle-btn:hover {
                background: linear-gradient(135deg, #3d3d3d 0%, #2a2a2a 100%);
                transform: scale(1.05);
                box-shadow: 0 6px 20px rgba(0,0,0,0.4);
            }
            
            .shadow-mode-active {
                filter: invert(1) hue-rotate(180deg);
                background: #000 !important;
                color: #fff !important;
            }
        `;
        document.head.appendChild(style);
    }
}

let shadowModeActive = false;

function toggleShadowMode() {
    shadowModeActive = !shadowModeActive;
    const body = document.body;
    const toggle = document.getElementById('shadowModeToggle');
    
    if (shadowModeActive) {
        // Enter shadow mode - invert everything
        body.classList.add('shadow-mode-active');
        if (toggle) {
            toggle.innerHTML = '☀️ Light Mode';
            toggle.title = 'Return to Light Realm';
        }
        
        // Show shadow steps interface
        showShadowStepsInterface();
        
    } else {
        // Exit shadow mode
        body.classList.remove('shadow-mode-active');
        if (toggle) {
            toggle.innerHTML = '🌙 Shadow Mode';
            toggle.title = 'Enter the Shadow Realm';
        }
        
        // Hide shadow steps interface
        hideShadowStepsInterface();
    }
}

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

// Theme system constants (prevent magic strings)
const THEME_STORAGE_KEYS = {
    USER: 'userTheme',
    ADMIN: 'adminTheme'
};
const SYSTEM_DEFAULT_VALUE = 'system-default';

// Centralized theme definitions (DRY principle)
const THEME_DEFINITIONS = {
    'default': { name: 'Ocean Blue', value: 'default' },
    'sunset': { name: 'Sunset Orange', value: 'sunset' },
    'forest': { name: 'Forest Green', value: 'forest' },
    'lavender': { name: 'Lavender Purple', value: 'lavender' },
    'monochrome': { name: 'Monochrome', value: 'monochrome' }
};

// Theme functionality with user preference override
function initializeTheme() {
    const effectiveTheme = getEffectiveTheme();
    applyTheme(effectiveTheme);
}

function getEffectiveTheme() {
    // Priority: User preference > Admin default > Safe fallback
    const userTheme = localStorage.getItem(THEME_STORAGE_KEYS.USER);
    if (userTheme && THEME_DEFINITIONS[userTheme]) {
        return userTheme;
    }
    
    // Validate admin theme before using it
    const adminTheme = localStorage.getItem(THEME_STORAGE_KEYS.ADMIN);
    if (adminTheme && THEME_DEFINITIONS[adminTheme]) {
        return adminTheme;
    }
    
    // Safe fallback to known theme
    return 'default';
}

function applyTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName === 'default' ? '' : themeName);
}

function setUserTheme(themeName) {
    if (themeName === SYSTEM_DEFAULT_VALUE) {
        // Clear user preference to use admin default
        localStorage.removeItem(THEME_STORAGE_KEYS.USER);
    } else if (THEME_DEFINITIONS[themeName]) {
        localStorage.setItem(THEME_STORAGE_KEYS.USER, themeName);
    }
    
    const effectiveTheme = getEffectiveTheme();
    applyTheme(effectiveTheme);
    
    // Update theme selector if it exists
    const userThemeSelector = document.getElementById('userThemeSelector');
    if (userThemeSelector) {
        userThemeSelector.value = themeName;
    }
}

function getUserThemeDisplayName() {
    const userTheme = localStorage.getItem(THEME_STORAGE_KEYS.USER);
    if (userTheme && THEME_DEFINITIONS[userTheme]) {
        return THEME_DEFINITIONS[userTheme].name + ' (Personal)';
    }
    
    const adminTheme = localStorage.getItem(THEME_STORAGE_KEYS.ADMIN);
    const themeName = THEME_DEFINITIONS[adminTheme]?.name || THEME_DEFINITIONS['default']?.name || 'Ocean Blue';
    return themeName + ' (Default)';
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
    // Check for mega confetti first (epic threshold)
    if (stepCount >= confettiThresholds.epic) {
        const megaConfettiEnabled = localStorage.getItem('megaConfettiEnabled') === 'true';
        if (megaConfettiEnabled) {
            // Only do mega celebration for epic threshold+
            createMegaConfetti();
            
            // Add epic celebration message with warp speed glow
            setTimeout(() => {
                const messageDiv = document.getElementById('stepsMessage');
                const currentMessage = messageDiv.innerHTML;
                const formattedThreshold = (confettiThresholds.epic / 1000).toFixed(0) + 'K';
                messageDiv.innerHTML = currentMessage + `<div class="message success" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; animation: warp-glow 1s ease-out 1; font-weight: bold; font-size: 18px; text-shadow: 0 0 10px rgba(255,255,255,0.8);">EPIC ACHIEVEMENT! ${formattedThreshold}+ STEPS!</div>`;
            }, 500);
            return; // Skip regular confetti for epic threshold+
        }
    }
    
    // Regular confetti for regular threshold+ (only if not epic threshold+ with mega enabled)
    if (stepCount >= confettiThresholds.regular) {
        createConfetti();
        
        // Add celebration message
        setTimeout(() => {
            const messageDiv = document.getElementById('stepsMessage');
            const currentMessage = messageDiv.innerHTML;
            const formattedThreshold = (confettiThresholds.regular / 1000).toFixed(0) + 'K';
            messageDiv.innerHTML = currentMessage + `<div class="message success" style="background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #B8860B; animation: pulse 1s ease-in-out 3;">Amazing! ${formattedThreshold}+ steps celebration!</div>`;
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
    // Get orientation-aware initial velocity
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
        restingY: 0,
        shape: shape,
        opacity: 1.0,
        mass: size / 10, // Larger particles are heavier
        flutter: Math.random() * 0.3, // For strip flutter effect
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
        case 0:   // Portrait - burst upward
            return { vx: 0, vy: -speed };
        case 90:  // Landscape left - burst toward left
            return { vx: -speed, vy: 0 };
        case 180: // Portrait upside down - burst downward
            return { vx: 0, vy: speed };
        case -90:
        case 270: // Landscape right - burst toward right
            return { vx: speed, vy: 0 };
        default:  // Fallback to portrait
            return { vx: 0, vy: -speed };
    }
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
    
    // Get current orientation - use Screen Orientation API first, fallback to window.orientation
    let angle = 0;
    if (screen.orientation && screen.orientation.angle !== undefined) {
        angle = screen.orientation.angle;
    } else if (window.orientation !== undefined) {
        angle = window.orientation;
    } else {
        // Fallback: detect orientation from window dimensions
        angle = window.innerWidth > window.innerHeight ? 90 : 0;
    }
    
    megaConfettiSystem.orientation.angle = angle;
    console.log(`🎊 Confetti orientation updated: ${angle}°`);
    
    // Calculate gravity direction based on PHYSICAL device orientation
    // Key fix: gravity should pull toward the physical "bottom" of the device
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
    // Note: reverseYDirection only affects accelerometer response, not initial settling
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
                
                // Check if Y-axis response should be reversed
                const reverseY = localStorage.getItem('reverseYDirection') === 'true';
                const yMultiplier = reverseY ? -1 : 1;
                
                megaConfettiSystem.particles.forEach(particle => {
                    // Apply continuous tilt forces to all particles, especially settled ones
                    if (particle.settled || Math.abs(particle.vy) < 2) {
                        // Screen-relative tilt forces (now properly transformed)
                        const tiltX = deltaX * tiltSensitivity;
                        const tiltY = deltaY * tiltSensitivity * yMultiplier; // Apply Y-axis flip here
                        
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
                        particle.vy += deltaY * tiltSensitivity * 0.3 * yMultiplier; // Apply Y-axis flip here too
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
            if (particle.x <= particle.size) {
                particle.x = particle.size;
                particle.vx *= -currentBounciness;
                particle.vy *= friction; // Apply friction to perpendicular motion
                particle.bounceCount++;
                bounced = true;
                particle.settled = false; // Unsettle after bounce
            }
            
            // Right wall collision
            if (particle.x >= boundaries.right - particle.size) {
                particle.x = boundaries.right - particle.size;
                particle.vx *= -currentBounciness;
                particle.vy *= friction;
                particle.bounceCount++;
                bounced = true;
                particle.settled = false; // Unsettle after bounce
            }
            
            // Top wall collision
            if (particle.y <= particle.size) {
                particle.y = particle.size;
                particle.vy *= -currentBounciness;
                particle.vx *= friction;
                particle.bounceCount++;
                bounced = true;
                particle.settled = false; // Unsettle after bounce
            }
            
            // Bottom wall collision (the "floor" in portrait mode)
            if (particle.y >= boundaries.bottom - particle.size) {
                particle.y = boundaries.bottom - particle.size;
                particle.vy *= -currentBounciness;
                particle.vx *= friction;
                particle.bounceCount++;
                bounced = true;
                particle.settled = false; // Unsettle after bounce
            }
            
        // Particles settle when they move slowly enough, but can still be disturbed
        const totalVelocity = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
        
        // Check if particle is near a boundary (likely settled against a wall/floor)
        const nearBoundary = (particle.x <= particle.size + 2) || 
                            (particle.x >= canvas.width - particle.size - 2) ||
                            (particle.y <= particle.size + 2) ||
                            (particle.y >= canvas.height - particle.size - 2);
        
        if (totalVelocity < 0.5 && nearBoundary) {
            // Settle particles that are slow AND near boundaries
            particle.settled = true;
            particle.restingY = particle.y;
        } else if (totalVelocity < 0.2) {
            // Settle very slow particles anywhere (floating in air after many bounces)
            particle.settled = true;
            particle.restingY = particle.y;
        } else if (totalVelocity > 1.5) {
            // Unsettle if moving fast enough (from bounces or disturbances)
            particle.settled = false;
        }
            
        // Remove particles that fly too far off screen
        if (particle.y < -100 || particle.x < -100 || particle.x > canvas.width + 100) {
            megaConfettiSystem.particles.splice(i, 1);
            continue;
        }
        
        // Update rotation with shape-specific effects
        particle.rotation += particle.rotationSpeed;
        
        // Add flutter effect for strips
        if (particle.shape === 'strip' && !particle.settled) {
            particle.vx += Math.sin(particle.rotation * 0.1) * particle.flutter;
        }
        
        // Update particle opacity with global fade
        particle.opacity = globalOpacity;
        
        // Draw particle with enhanced shapes
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation * Math.PI / 180);
        ctx.globalAlpha = particle.opacity;
        ctx.fillStyle = particle.color;
        
        switch (particle.shape) {
            case 'circle':
                ctx.beginPath();
                ctx.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
                ctx.fill();
                break;
            case 'square':
                ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
                break;
            case 'strip':
                // Rectangular strip for flutter effect
                ctx.fillRect(-particle.size, -particle.size / 4, particle.size * 2, particle.size / 2);
                break;
            case 'diamond':
                ctx.beginPath();
                ctx.moveTo(0, -particle.size / 2);
                ctx.lineTo(particle.size / 2, 0);
                ctx.lineTo(0, particle.size / 2);
                ctx.lineTo(-particle.size / 2, 0);
                ctx.closePath();
                ctx.fill();
                break;
            default:
                // Fallback to square
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

// Fun features initialization
async function initializeFunFeatures() {
    try {
        // Check if fun is enabled from localStorage (set by admin)
        const funEnabled = localStorage.getItem('allowFun') === 'true';
        
        const funGameSection = document.getElementById('funGameSection');
        const pigGameBtn = document.getElementById('pigGameBtn');
        
        if (funEnabled && funGameSection && pigGameBtn) {
            // Show the fun game section
            funGameSection.style.display = 'block';
            
            // Random button text options
            const randomTexts = [
                "Hmmm?",
                "Look what you made me do", 
                "Hot to trot",
                "What is this?",
                "I can win this one"
            ];
            
            // Set random text on the button
            const randomText = randomTexts[Math.floor(Math.random() * randomTexts.length)];
            pigGameBtn.textContent = randomText;
            
            // Add click handler to navigate to pig game
            pigGameBtn.addEventListener('click', function() {
                window.location.href = '/pig';
            });
        }
    } catch (error) {
        console.error('Error initializing fun features:', error);
    }
}

// Load confetti thresholds from server
async function loadConfettiThresholds() {
    try {
        const response = await fetch('/api/confetti-thresholds');
        if (response.ok) {
            const thresholds = await response.json();
            confettiThresholds.regular = thresholds.regular || 15000;
            confettiThresholds.epic = thresholds.epic || 20000;
            console.log('✅ Loaded confetti thresholds:', confettiThresholds);
        } else {
            console.warn('Failed to load confetti thresholds, using defaults');
        }
    } catch (error) {
        console.warn('Error loading confetti thresholds, using defaults:', error);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();
    
    // Load confetti thresholds
    loadConfettiThresholds();
    
    // Initialize fun features
    initializeFunFeatures();
    
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
                const welcomeMsg = document.getElementById('welcomeMessage');
                if (welcomeMsg) {
                    const username = currentUser.email.split('@')[0];
                    welcomeMsg.textContent = `Welcome, ${username}!`;
                }
                
                // Update challenge info display
                updateChallengeInfo(currentUser.current_challenge);
                
                // Setup admin navigation if user is admin
                if (currentUser.is_admin) {
                    setupAdminNavigation();
                }
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
                
                // Calculate days remaining
                let daysInfo = '';
                if (isWithinPeriod) {
                    const daysRemaining = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
                    daysInfo = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`;
                } else if (today < startDate) {
                    const daysUntilStart = Math.ceil((startDate - today) / (1000 * 60 * 60 * 24));
                    daysInfo = `starts in ${daysUntilStart} day${daysUntilStart !== 1 ? 's' : ''}`;
                } else {
                    daysInfo = 'challenge ended';
                }
                
                challengeInfo.innerHTML = `
                    <div class="challenge-header" id="challengeHeader">
                        <div class="challenge-title">
                            <div class="challenge-name">
                                <div class="challenge-expand" id="challengeExpand">▶</div>
                                <h3>${challenge.name}</h3>
                            </div>
                            <div class="challenge-status">${daysInfo}</div>
                        </div>
                    </div>
                    <div class="challenge-details" id="challengeDetails">
                        <p><strong>Period:</strong> ${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}</p>
                        ${today >= startDate ? '<p>You can log steps for any date within the challenge period, including retroactive entries.</p>' : ''}
                        ${!isWithinPeriod ? '<p style="color: #28a745; font-size: 14px; margin-top: 4px;">✓ Challenge ended - retroactive step entry available for dates within challenge period.</p>' : ''}
                    </div>
                `;
                
                // Add event listeners after creating the HTML
                const challengeHeader = document.getElementById('challengeHeader');
                
                if (challengeHeader) {
                    challengeHeader.addEventListener('click', toggleChallengeDetails);
                }
                
                challengeInfo.className = isWithinPeriod ? 'challenge-info active' : 'challenge-info inactive';
                challengeInfo.classList.remove('hidden');
                
                // Always enable form for retroactive entry within challenge period
                // Users can enter steps for any date within the challenge period
                form.classList.remove('form-disabled');
                submitBtn.textContent = 'Save Steps';
                submitBtn.disabled = false;
                
                // Set date input constraints (works in most browsers)
                dateInput.min = challenge.start_date;
                
                // Set max date to prevent future entries (allow +1 day for timezone flexibility)
                const now = new Date();
                const maxAllowedDate = new Date(now);
                maxAllowedDate.setDate(maxAllowedDate.getDate() + 1);
                const maxDateString = maxAllowedDate.toISOString().split('T')[0];
                
                // Allow retroactive entry up to challenge end date, even after challenge period
                // Only limit by current date + 1 day (for timezone flexibility), not by challenge end date
                dateInput.max = maxDateString;
                
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
            // Block dates before challenge start
            if (stepDate.getTime() < startDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = `<div class="message error">Date must be on or after the challenge start date (${formatDate(challenge.start_date)})</div>`;
                return;
            }
            
            // Block dates after challenge end date (no retroactive entry beyond challenge period)
            if (stepDate.getTime() > endDate.getTime()) {
                dateInput.style.borderColor = '#dc3545';
                dateInput.style.backgroundColor = '#fff5f5';
                messageDiv.innerHTML = `<div class="message error">Date must be within the challenge period (${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)})</div>`;
                return;
            }
            
            // Date is valid - within challenge period
            dateInput.style.borderColor = '#667eea';
            dateInput.style.backgroundColor = '#f8fff8';
            messageDiv.innerHTML = '<div class="message success">Date is valid</div>';
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
        
        // Set date selector to user's device "today" date, with challenge end date as ceiling
        function setTodayDate(challenge = null) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0'); // getMonth() is 0-based
            const day = String(now.getDate()).padStart(2, '0');
            let targetDate = `${year}-${month}-${day}`;
            
            // Always use today's date as default, regardless of challenge status
            // Users can manually select dates within the challenge period for retroactive entry
            console.log(`📅 Date selector: Set to today ${targetDate} (allows retroactive entry within challenge period)`);
            
            const dateInput = document.getElementById('date');
            dateInput.value = targetDate;
        }
        
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
        
        // CSV Download functionality
        document.getElementById('csvDownloadBtn').addEventListener('click', async () => {
            const button = document.getElementById('csvDownloadBtn');
            const originalText = button.textContent;
            
            try {
                // Show loading state
                button.disabled = true;
                button.textContent = '📊 Preparing...';
                button.style.opacity = '0.6';
                
                // Download the CSV file
                const response = await fetch('/api/steps/csv');
                
                if (!response.ok) {
                    throw new Error('Failed to download CSV');
                }
                
                // Create download link
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                
                // Extract filename from Content-Disposition header if available
                const contentDisposition = response.headers.get('Content-Disposition');
                let filename = 'my_step_data.csv';
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename="(.+)"/);
                    if (filenameMatch) {
                        filename = filenameMatch[1];
                    }
                }
                a.download = filename;
                
                document.body.appendChild(a);
                a.click();
                
                // Cleanup
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                // Show success feedback
                button.textContent = '✅ Downloaded!';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                    button.style.opacity = '1';
                }, 2000);
                
            } catch (error) {
                console.error('CSV download error:', error);
                
                // Show error feedback
                button.textContent = '❌ Error';
                setTimeout(() => {
                    button.textContent = originalText;
                    button.disabled = false;
                    button.style.opacity = '1';
                }, 3000);
            }
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
                
                // Set date selector to today (with challenge end date as ceiling if applicable)
                setTodayDate(currentUser?.current_challenge);
                
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
            
            // Determine date range based on active challenge
            const today = new Date();
            let startDate, endDate, maxDays;
            
            if (currentUser && currentUser.current_challenge) {
                // Use active challenge date range
                const challenge = currentUser.current_challenge;
                startDate = new Date(challenge.start_date + 'T00:00:00');
                endDate = new Date(challenge.end_date + 'T00:00:00');
                maxDays = Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
            } else {
                // Show last 14 days when no active challenge
                maxDays = 14;
                endDate = new Date(today);
                endDate.setHours(0, 0, 0, 0);
                startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - (maxDays - 1));
            }
            
            // Generate days for the determined range
            const days = [];
            for (let i = 0; i < maxDays; i++) {
                const date = new Date(startDate);
                date.setDate(startDate.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                
                days.push({
                    date: dateStr,
                    displayDate: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    steps: stepsByDate[dateStr] || 0,
                    isFirst: i === 0,
                    isLast: i === maxDays - 1
                });
            }
            
            // Find max steps for scaling
            const maxSteps = Math.max(...days.map(d => d.steps), 1);
            
            // Create bars
            const bars = days.map(day => {
                const heightPercent = day.steps > 0 ? (day.steps / maxSteps) * 90 + 10 : 5; // Min 5% height for empty days
                const isToday = day.date === today.toISOString().split('T')[0];
                const hasData = day.steps > 0;
                const showLabel = day.isFirst || day.isLast;
                
                return `<div class="step-bar ${!hasData ? 'no-data' : ''} ${showLabel ? 'show-label' : ''}" 
                             style="height: ${heightPercent}%${isToday ? '; border: 2px solid #667eea;' : ''}"
                             data-date="${showLabel ? day.displayDate : ''}" 
                             data-steps="${hasData ? day.steps.toLocaleString() + ' steps' : 'No data'}"
                             title="${day.displayDate}: ${hasData ? day.steps.toLocaleString() + ' steps' : 'No data'}">
                        </div>`;
            }).join('');
            
            chartContainer.innerHTML = bars;
        }
        
        // Load leaderboard
        async function loadLeaderboard() {
            // Clear expanded user state when reloading individual leaderboard
            expandedUsers.clear();
            
            // Update header text based on challenge status
            const leaderboardHeader = document.querySelector('#leaderboardView h2');
            if (!currentUser || !currentUser.current_challenge) {
                leaderboardHeader.textContent = 'No active challenge';
            } else {
                leaderboardHeader.textContent = 'Individual Leaderboard';
            }
            
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
                                <span class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}">▶</span>
                                <span class="rank">#${index + 1}</span>
                                <strong>${escapeHtml(user.name)}</strong>
                                ${user.team ? `<span style="color: #888; font-size: 0.75em; margin-left: 4px;">${escapeHtml(user.team)}</span>` : ''}
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
                                <span class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}">▶</span>
                                <span class="rank">-</span>
                                <strong>${escapeHtml(user.name)}</strong>
                                ${user.team ? `<span style="color: #888; font-size: 0.75em; margin-left: 4px;">${escapeHtml(user.team)}</span>` : ''}
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
                                <span class="team-disclosure" data-user-id="${user.id}" data-user-name="${escapeHtml(user.name)}">▶</span>
                                <span class="rank">#${index + 1}</span>
                                <strong>${escapeHtml(user.name)}</strong>
                                ${user.team ? `<span style="color: #888; font-size: 0.75em; margin-left: 4px;">${escapeHtml(user.team)}</span>` : ''}
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
                
                // Attach disclosure listeners for individual leaderboard
                attachDisclosureListeners();
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
                // Block dates before challenge start
                if (stepDate.getTime() < startDate.getTime()) {
                    messageDiv.innerHTML = `<div class="message error">Step logging is only allowed from the challenge start date onwards (${formatDate(challenge.start_date)}).</div>`;
                    return;
                }
                
                // Block dates after challenge end date (no retroactive entry beyond challenge period)
                if (stepDate.getTime() > endDate.getTime()) {
                    messageDiv.innerHTML = `<div class="message error">Step logging is only allowed within the challenge period (${formatDate(challenge.start_date)} to ${formatDate(challenge.end_date)}).</div>`;
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
            
            // Update header text based on challenge status
            const teamLeaderboardHeader = document.querySelector('#teamLeaderboardView h2');
            if (!currentUser || !currentUser.current_challenge) {
                teamLeaderboardHeader.textContent = 'No active challenge';
            } else {
                teamLeaderboardHeader.textContent = 'Team Leaderboard';
            }
            
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
                                <strong>${escapeHtml(team.team)}</strong>
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
                                <strong>${escapeHtml(team.team)}</strong>
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
                                    <strong>${escapeHtml(team.team)}</strong>
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

        // Attach event listeners to disclosure triangles (both team and user)
        function attachDisclosureListeners() {
            const disclosureTriangles = document.querySelectorAll('.team-disclosure');
            disclosureTriangles.forEach(triangle => {
                triangle.addEventListener('click', function() {
                    const teamName = this.getAttribute('data-team');
                    const userId = this.getAttribute('data-user-id');
                    const userName = this.getAttribute('data-user-name');
                    
                    if (teamName) {
                        // This is a team disclosure
                        toggleTeamDisclosure(teamName, this);
                    } else if (userId && userName) {
                        // This is a user disclosure
                        toggleUserDisclosure(userId, userName, this);
                    }
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
                
                disclosureElement.classList.remove('expanded');
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
                        
                        disclosureElement.classList.add('expanded');
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
                        <span class="member-name">${escapeHtml(member.name)}</span>
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


        // Toggle user daily data disclosure
        async function toggleUserDisclosure(userId, userName, disclosureElement) {
            console.log('toggleUserDisclosure called with:', userId, userName, disclosureElement);
            const isExpanded = expandedUsers.has(userId);
            
            if (isExpanded) {
                // Collapse
                const userDataList = document.getElementById(`user-data-${userId}`);
                if (userDataList) {
                    userDataList.style.maxHeight = userDataList.scrollHeight + 'px';
                    userDataList.style.overflow = 'hidden';
                    requestAnimationFrame(() => {
                        userDataList.style.maxHeight = '0px';
                        setTimeout(() => {
                            userDataList.remove();
                        }, 300);
                    });
                }
                
                disclosureElement.classList.remove('expanded');
                expandedUsers.delete(userId);
            } else {
                // Expand - show loading state
                const userItem = disclosureElement.closest('.leaderboard-item');
                const loadingIndicator = createUserDataLoading(userId, userName);
                userItem.insertAdjacentElement('afterend', loadingIndicator);
                
                try {
                    const response = await fetch(`/api/user/${userId}/daily-steps`);
                    const userData = await response.json();
                    
                    // Remove loading indicator
                    loadingIndicator.remove();
                    
                    if (response.ok) {
                        const userDataList = createUserDataList(userId, userName, userData);
                        userItem.insertAdjacentElement('afterend', userDataList);
                        
                        // Animate expansion
                        userDataList.style.maxHeight = '0px';
                        userDataList.style.overflow = 'hidden';
                        requestAnimationFrame(() => {
                            userDataList.style.maxHeight = userDataList.scrollHeight + 'px';
                            setTimeout(() => {
                                userDataList.style.maxHeight = 'none';
                                userDataList.style.overflow = 'visible';
                            }, 300);
                        });
                        
                        disclosureElement.classList.add('expanded');
                        expandedUsers.add(userId);
                    } else {
                        console.error('Error loading user daily data:', userData.error);
                        // Show error state
                        const errorDiv = createUserDataError(userId, userName, userData.error || 'Failed to load data');
                        userItem.insertAdjacentElement('afterend', errorDiv);
                        setTimeout(() => errorDiv.remove(), 3000); // Auto-remove after 3 seconds
                    }
                } catch (error) {
                    // Remove loading indicator
                    loadingIndicator.remove();
                    console.error('Error fetching user daily data:', error);
                    // Show error state
                    const errorDiv = createUserDataError(userId, userName, 'Network error');
                    userItem.insertAdjacentElement('afterend', errorDiv);
                    setTimeout(() => errorDiv.remove(), 3000); // Auto-remove after 3 seconds
                }
            }
        }

        function createUserDataLoading(userId, userName) {
            const loadingDiv = document.createElement('div');
            loadingDiv.id = `user-data-${userId}`;
            loadingDiv.className = 'user-data-list';
            loadingDiv.style.transition = 'max-height 0.3s ease-out';
            
            loadingDiv.innerHTML = `
                <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #666; font-style: italic;">
                    <span class="loading"></span> Loading ${userName}'s daily data...
                </div>
            `;
            
            return loadingDiv;
        }

        function createUserDataError(userId, userName, errorMessage) {
            const errorDiv = document.createElement('div');
            errorDiv.id = `user-data-error-${userId}`;
            errorDiv.className = 'user-data-list';
            errorDiv.style.background = 'rgba(220, 53, 69, 0.1)';
            errorDiv.style.borderLeft = '3px solid #dc3545';
            
            errorDiv.innerHTML = `
                <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #dc3545; font-size: 0.9em;">
                    ⚠️ ${errorMessage}
                </div>
            `;
            
            return errorDiv;
        }

        function createUserDataList(userId, userName, userData) {
            const userDataList = document.createElement('div');
            userDataList.id = `user-data-${userId}`;
            userDataList.className = 'user-data-list';
            userDataList.style.transition = 'max-height 0.3s ease-out';
            
            if (userData.daily_steps.length === 0) {
                userDataList.innerHTML = `
                    <div class="user-data-item" style="padding: 12px 16px; text-align: center; color: #666; font-style: italic;">
                        No step data available for ${userName}
                    </div>
                `;
            } else {
                // Filter data based on active challenge date range
                let filteredSteps;
                let periodDescription;
                
                if (currentUser && currentUser.current_challenge) {
                    const challenge = currentUser.current_challenge;
                    // Normalize challenge dates to midnight
                    const challengeStartDate = new Date(challenge.start_date + 'T00:00:00');
                    const challengeEndDate = new Date(challenge.end_date + 'T00:00:00');
                    
                    // Filter steps to only include those within the challenge date range
                    filteredSteps = userData.daily_steps.filter(day => {
                        const stepDate = new Date(day.date + 'T00:00:00');
                        return stepDate >= challengeStartDate && stepDate <= challengeEndDate;
                    });
                    
                    periodDescription = 'full active challenge period';
                } else {
                    // No active challenge - show last 14 days
                    filteredSteps = userData.daily_steps.slice(0, 14);
                    periodDescription = '14 days';
                }
                
                const dailyDataHtml = filteredSteps.map((day, index) => `
                    <div class="user-data-item" style="display: flex; justify-content: space-between; align-items: center; padding: 6px 16px; background: rgba(255, 255, 255, 0.4); border-bottom: 1px solid rgba(255, 255, 255, 0.2); font-size: 0.9em;">
                        <div>
                            <span style="font-weight: 500;">${day.formatted_date}</span>
                        </div>
                        <div style="font-weight: 600; color: #333;">
                            ${day.steps.toLocaleString()} steps
                        </div>
                    </div>
                `).join('');
                
                let showingText;
                if (currentUser && currentUser.current_challenge) {
                    showingText = ` (${periodDescription})`;
                } else {
                    showingText = ` (${filteredSteps.length} days total)`;
                }
                
                userDataList.innerHTML = `
                    <div style="background: rgba(102, 126, 234, 0.05); border-left: 3px solid rgba(102, 126, 234, 0.3); border-radius: 0 8px 8px 0; overflow: hidden;">
                        <div style="padding: 8px 16px; background: rgba(102, 126, 234, 0.1); font-size: 0.85em; color: #666; font-weight: 500;">
                            ${userName}'s Daily Steps${showingText}
                        </div>
                        ${dailyDataHtml}
                    </div>
                `;
            }
            
            return userDataList;
        }

        // Handle responsive leaderboard updates on window resize with enhanced scroll detection
        let resizeDebounceTimer;
        let orientationChangeTimer;
        let lastWindowWidth = window.innerWidth;
        let lastWindowHeight = window.innerHeight;
        let isScrolling = false;
        let scrollTimeout;
        
        // Track scrolling to prevent false resize events
        window.addEventListener('scroll', function() {
            isScrolling = true;
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                isScrolling = false;
            }, 150);
        }, { passive: true });
        
        // Track orientation changes separately for more reliable detection
        window.addEventListener('orientationchange', function() {
            clearTimeout(orientationChangeTimer);
            orientationChangeTimer = setTimeout(() => {
                const currentWidth = window.innerWidth;
                const currentHeight = window.innerHeight;
                
                // Force reload on orientation change
                const individualTab = document.getElementById('leaderboardBtn');
                const teamTab = document.getElementById('teamLeaderboardBtn');
                
                if (individualTab && individualTab.classList.contains('active')) {
                    loadLeaderboard();
                } else if (teamTab && teamTab.classList.contains('active')) {
                    const currentExpandedTeams = new Set(expandedTeams);
                    loadTeamLeaderboard().then(() => {
                        currentExpandedTeams.forEach(teamName => {
                            const disclosureElement = document.querySelector(`[data-team="${teamName}"]`);
                            if (disclosureElement && !expandedTeams.has(teamName)) {
                                toggleTeamDisclosure(teamName, disclosureElement);
                            }
                        });
                    });
                }
                
                lastWindowWidth = currentWidth;
                lastWindowHeight = currentHeight;
            }, 100);
        });
        
        window.addEventListener('resize', function() {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;
            
            // Clear existing timer
            clearTimeout(resizeDebounceTimer);
            
            // Ignore resize events that happen during scrolling
            if (isScrolling) {
                return;
            }
            
            // Only trigger if there's an actual significant window size change
            const widthDiff = Math.abs(currentWidth - lastWindowWidth);
            const heightDiff = Math.abs(currentHeight - lastWindowHeight);
            const hasSignificantResize = (widthDiff > 100 || heightDiff > 100);
            
            if (hasSignificantResize) {
                // Extended debounce for genuine resize events
                resizeDebounceTimer = setTimeout(() => {
                    // Double-check we're not scrolling
                    if (isScrolling) return;
                    
                    const individualTab = document.getElementById('leaderboardBtn');
                    const teamTab = document.getElementById('teamLeaderboardBtn');
                    
                    if (individualTab && individualTab.classList.contains('active')) {
                        loadLeaderboard();
                    } else if (teamTab && teamTab.classList.contains('active')) {
                        // Preserve expanded state when reloading for legitimate resize
                        const currentExpandedTeams = new Set(expandedTeams);
                        loadTeamLeaderboard().then(() => {
                            // Restore expanded teams after reload
                            currentExpandedTeams.forEach(teamName => {
                                const disclosureElement = document.querySelector(`[data-team="${teamName}"]`);
                                if (disclosureElement && !expandedTeams.has(teamName)) {
                                    toggleTeamDisclosure(teamName, disclosureElement);
                                }
                            });
                        });
                    }
                    
                    // Update last known dimensions
                    lastWindowWidth = currentWidth;
                    lastWindowHeight = currentHeight;
                }, 750);
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

        // Handle user theme selector
        const userThemeSelector = document.getElementById('userThemeSelector');
        if (userThemeSelector) {
            // Set initial value based on current user preference
            const userTheme = localStorage.getItem(THEME_STORAGE_KEYS.USER);
            userThemeSelector.value = userTheme || SYSTEM_DEFAULT_VALUE;
            
            // Handle theme changes
            userThemeSelector.addEventListener('change', function() {
                const selectedTheme = this.value;
                setUserTheme(selectedTheme);
                
                // Show visual feedback
                const parent = this.parentElement;
                const feedback = parent.querySelector('.theme-feedback') || document.createElement('div');
                feedback.className = 'theme-feedback';
                feedback.style.cssText = 'font-size: 11px; color: #4CAF50; margin-top: 4px; opacity: 1; transition: opacity 0.3s ease;';
                
                if (selectedTheme === SYSTEM_DEFAULT_VALUE) {
                    feedback.textContent = '✓ Using system default theme';
                } else {
                    const themeName = THEME_DEFINITIONS[selectedTheme]?.name || selectedTheme;
                    feedback.textContent = `✓ Personal theme: ${themeName}`;
                }
                
                if (!parent.querySelector('.theme-feedback')) {
                    parent.appendChild(feedback);
                }
                
                // Fade out feedback after 2 seconds
                setTimeout(() => {
                    feedback.style.opacity = '0';
                    setTimeout(() => {
                        if (feedback.parentElement) {
                            feedback.parentElement.removeChild(feedback);
                        }
                    }, 300);
                }, 2000);
            });
        }

        // Handle accelerometer permission reset button
        const resetAccelerometerBtn = document.getElementById('resetAccelerometerBtn');
        if (resetAccelerometerBtn) {
            // Add hover effects via JavaScript to avoid CSP violations
            resetAccelerometerBtn.addEventListener('mouseenter', function() {
                this.style.background = 'rgba(102, 126, 234, 0.2)';
            });
            
            resetAccelerometerBtn.addEventListener('mouseleave', function() {
                this.style.background = 'rgba(102, 126, 234, 0.1)';
            });
            
            resetAccelerometerBtn.addEventListener('click', async function() {
                // Reset the cached permission status to force a new request
                deviceMotionPermissionStatus = null;
                
                try {
                    if (!window.DeviceMotionEvent) {
                        alert('❌ Device motion not supported on this device/browser.');
                        return;
                    }
                    
                    if (typeof DeviceMotionEvent.requestPermission === 'function') {
                        // iOS 13+ - request permission
                        const permission = await DeviceMotionEvent.requestPermission();
                        if (permission === 'granted') {
                            alert('✅ Accelerometer access granted! Epic confetti will now respond to device tilting.');
                            deviceMotionPermissionStatus = true;
                        } else {
                            alert('❌ Accelerometer access denied. Epic confetti will work but won\'t respond to device tilting.');
                            deviceMotionPermissionStatus = false;
                        }
                    } else {
                        // Non-iOS or older iOS - permission not required
                        alert('✅ Device motion is available! Epic confetti will respond to device tilting.');
                        deviceMotionPermissionStatus = true;
                    }
                } catch (error) {
                    console.error('Permission request failed:', error);
                    alert('❌ Could not request accelerometer permission. Make sure you\'re using HTTPS and try again.');
                    deviceMotionPermissionStatus = false;
                }
            });
        }
        
        // Challenge UI functions
        function toggleChallengeDetails() {
            const details = document.getElementById('challengeDetails');
            const expand = document.getElementById('challengeExpand');
            
            if (!details || !expand) return;
            
            const isExpanded = details.classList.contains('expanded');
            
            if (isExpanded) {
                details.classList.remove('expanded');
                expand.classList.remove('expanded');
                // Remember collapsed state
                localStorage.setItem('challengeDetailsExpanded', 'false');
            } else {
                details.classList.add('expanded');
                expand.classList.add('expanded');
                // Remember expanded state
                localStorage.setItem('challengeDetailsExpanded', 'true');
            }
        }
        
        function showChallengeInfo(event) {
            event.stopPropagation();
            alert('💡 Challenge Tips:\n\n• You can log steps for any date during the challenge period\n• Entries can be made retroactively (catch-up entries)\n• The challenge runs from start date to end date (inclusive)\n• Your steps count toward individual and team rankings\n\n📅 Use the date picker to select which day you want to log steps for!');
        }
        
        // Setup subtle admin navigation
        function setupAdminNavigation() {
            const appIcon = document.getElementById('appIcon');
            if (appIcon) {
                // Make app icon clickable with subtle hover effect
                appIcon.style.cursor = 'pointer';
                appIcon.style.transition = 'all 0.2s ease';
                appIcon.title = 'Admin Panel';
                
                // Subtle hover effect
                appIcon.addEventListener('mouseenter', function() {
                    appIcon.style.transform = 'scale(1.1)';
                    appIcon.style.opacity = '0.8';
                });
                
                appIcon.addEventListener('mouseleave', function() {
                    appIcon.style.transform = 'scale(1)';
                    appIcon.style.opacity = '1';
                });
                
                // Click handler to navigate to admin
                appIcon.addEventListener('click', function() {
                    window.location.href = '/admin';
                });
            }
        }
        
        // Tidbits section scroll handling
        function handleTidbitsToggle() {
            const tidbitsSection = document.getElementById('tidbitsSection');
            if (!tidbitsSection) return;
            
            // Check if details element was just opened (not closed)
            if (tidbitsSection.open) {
                // Small delay to allow DOM to update with expanded content
                setTimeout(() => {
                    const rect = tidbitsSection.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    const sectionBottom = rect.bottom;
                    
                    // If Tidbits content extends below viewport, smoothly scroll minimal amount needed
                    if (sectionBottom > viewportHeight) {
                        tidbitsSection.scrollIntoView({ 
                            behavior: 'smooth', 
                            block: 'nearest' 
                        });
                    }
                }, 100);
            }
        }
        
        // Initialize app icon on page load
        document.addEventListener('DOMContentLoaded', function() {
            applyAppIcon();
            
            // Add Tidbits scroll handling
            const tidbitsSection = document.getElementById('tidbitsSection');
            if (tidbitsSection) {
                tidbitsSection.addEventListener('toggle', handleTidbitsToggle);
            }
            
            // Restore challenge details expansion state
            const wasExpanded = localStorage.getItem('challengeDetailsExpanded') === 'true';
            if (wasExpanded) {
                setTimeout(() => {
                    const details = document.getElementById('challengeDetails');
                    const expand = document.getElementById('challengeExpand');
                    if (details && expand) {
                        details.classList.add('expanded');
                        expand.classList.add('expanded');
                    }
                }, 100);
            }
        });
});
