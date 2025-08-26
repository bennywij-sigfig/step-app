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
    'default': { name: 'Ocean Blue', value: 'default' },
    'sunset': { name: 'Sunset Orange', value: 'sunset' },
    'forest': { name: 'Forest Green', value: 'forest' },
    'lavender': { name: 'Lavender Purple', value: 'lavender' },
    'monochrome': { name: 'Monochrome', value: 'monochrome' },
    'warm-focus': { name: 'Warm Focus', value: 'warm-focus' },
    'cool-calm': { name: 'Cool Calm', value: 'cool-calm' },
    'sage-zen': { name: 'Sage Zen', value: 'sage-zen' },
    'soft-light': { name: 'Soft Light', value: 'soft-light' }
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

// Initialize theme system
function initializeThemeSystem() {
    // Apply theme immediately
    initializeTheme();
    
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