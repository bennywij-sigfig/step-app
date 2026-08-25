// Theme Management System
// Extracted from dashboard.js for better modularity

// Theme system constants (prevent magic strings)
const THEME_STORAGE_KEYS = {
    USER: 'userTheme',
    ADMIN: 'adminTheme'
};
const SYSTEM_DEFAULT_VALUE = 'system-default';

// Centralized theme definitions (DRY principle)
const THEME_DEFINITIONS = {
    'default': { name: 'Dawn Patrol', value: 'default', browserColor: '#0f3d4c' },
    'golden-hour': { name: 'Golden Hour', value: 'golden-hour', browserColor: '#7c2d12' },
    'evergreen': { name: 'Evergreen', value: 'evergreen', browserColor: '#14532d' },
    'berry-pace': { name: 'Berry Pace', value: 'berry-pace', browserColor: '#581c87' },
    'tidepool': { name: 'Tidepool', value: 'tidepool', browserColor: '#075985' },
    'night-run': { name: 'Night Run', value: 'night-run', browserColor: '#111827' }
};

const LEGACY_THEME_MAP = {
    'sunset': 'golden-hour',
    'forest': 'evergreen',
    'lavender': 'berry-pace',
    'monochrome': 'night-run',
    'warm-focus': 'golden-hour',
    'cool-calm': 'tidepool',
    'sage-zen': 'evergreen',
    'soft-light': 'default'
};

function normalizeTheme(themeName) {
    if (THEME_DEFINITIONS[themeName]) return themeName;
    return LEGACY_THEME_MAP[themeName] || 'default';
}

// Theme functionality with user preference override
function initializeTheme() {
    const effectiveTheme = getEffectiveTheme();
    applyTheme(effectiveTheme);
}

function getEffectiveTheme() {
    // Priority: User preference > Admin default > Safe fallback
    const storedUserTheme = localStorage.getItem(THEME_STORAGE_KEYS.USER);
    if (storedUserTheme) {
        const userTheme = normalizeTheme(storedUserTheme);
        if (userTheme !== storedUserTheme) localStorage.setItem(THEME_STORAGE_KEYS.USER, userTheme);
        return userTheme;
    }
    
    const storedAdminTheme = localStorage.getItem(THEME_STORAGE_KEYS.ADMIN);
    if (storedAdminTheme) {
        const adminTheme = normalizeTheme(storedAdminTheme);
        if (adminTheme !== storedAdminTheme) localStorage.setItem(THEME_STORAGE_KEYS.ADMIN, adminTheme);
        return adminTheme;
    }
    
    return 'default';
}

function applyTheme(themeName) {
    const normalizedTheme = normalizeTheme(themeName);
    if (normalizedTheme === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', normalizedTheme);
    }

    // Safari's top and bottom browser areas cannot render the page gradient,
    // but theme-color keeps them visually connected with its darkest stop.
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) {
        themeColor.setAttribute('content', THEME_DEFINITIONS[normalizedTheme].browserColor);
    }
}

function setUserTheme(themeName) {
    if (themeName === SYSTEM_DEFAULT_VALUE) {
        // Clear user preference to use admin default
        localStorage.removeItem(THEME_STORAGE_KEYS.USER);
    } else {
        localStorage.setItem(THEME_STORAGE_KEYS.USER, normalizeTheme(themeName));
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
    const themeName = THEME_DEFINITIONS[normalizeTheme(adminTheme)]?.name || 'Dawn Patrol';
    return themeName + ' (Default)';
}

// Initialize theme system
async function loadSystemTheme() {
    try {
        const response = await fetch('/api/theme');
        if (!response.ok) return;
        const data = await response.json();
        const systemTheme = normalizeTheme(data.theme);
        localStorage.setItem(THEME_STORAGE_KEYS.ADMIN, systemTheme);
        if (!localStorage.getItem(THEME_STORAGE_KEYS.USER)) applyTheme(systemTheme);
    } catch (error) {
        console.warn('Unable to refresh system theme; using cached preference.', error);
    }
}

function initializeThemeSystem() {
    initializeTheme();
    loadSystemTheme();
    
    // Setup user theme selector if present
    const userThemeSelector = document.getElementById('userThemeSelector');
    if (userThemeSelector) {
        // Set current selection
        const currentUserTheme = localStorage.getItem(THEME_STORAGE_KEYS.USER);
        if (currentUserTheme) {
            userThemeSelector.value = currentUserTheme;
        } else {
            userThemeSelector.value = SYSTEM_DEFAULT_VALUE;
        }
        
        // Add event listener
        userThemeSelector.addEventListener('change', function() {
            setUserTheme(this.value);
        });
    }
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeThemeSystem);
} else {
    initializeThemeSystem();
}