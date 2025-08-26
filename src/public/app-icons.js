// App Icon & Shadow Mode System
// Extracted from dashboard.js for better modularity

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
        // Use createConfetti if available (will be loaded from confetti.js)
        if (typeof createConfetti === 'function') {
            createConfetti();
        }
        
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
        
        // Show shadow steps interface (stub - to be implemented)
        showShadowStepsInterface();
        
    } else {
        // Exit shadow mode
        body.classList.remove('shadow-mode-active');
        if (toggle) {
            toggle.innerHTML = '🌙 Shadow Mode';
            toggle.title = 'Enter the Shadow Realm';
        }
        
        // Hide shadow steps interface (stub - to be implemented)
        hideShadowStepsInterface();
    }
}

// Stub functions for shadow steps interface (to be implemented later)
function showShadowStepsInterface() {
    console.log('Shadow Steps Interface shown (stub function)');
}

function hideShadowStepsInterface() {
    console.log('Shadow Steps Interface hidden (stub function)');
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

// Initialize shadow mode toggle if already discovered
function initializeShadowMode() {
    if (isShadowModeDiscovered()) {
        revealShadowModeToggle();
    }
}

// Initialize app icon system
function initializeAppIcons() {
    applyAppIcon();
    
    // Add click handler to app icon
    const iconElement = document.getElementById('appIcon');
    if (iconElement) {
        iconElement.addEventListener('click', handleShadowModeClick);
    }
    
    // Initialize shadow mode if discovered
    initializeShadowMode();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAppIcons);
} else {
    initializeAppIcons();
}