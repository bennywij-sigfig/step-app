/**
 * Delightful Step Entry UX Module
 * Mobile Safari/Android optimized micro-interactions and feedback
 */

class StepEntryUX {
    constructor() {
        this.isEnabled = false;
        this.userStats = null;
        this.isInitialized = false;
        
        // Mobile-optimized settings
        this.isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.supportsHaptics = 'vibrate' in navigator;
        this.supportsTouch = 'ontouchstart' in window;
        
        // Animation timings optimized for 60fps on mobile
        this.timings = {
            validation: 200,
            button: 300,
            particles: 800,
            success: 400
        };
    }

    async init() {
        if (this.isInitialized) return;
        
        // Check if fun features are enabled
        this.isEnabled = localStorage.getItem('allowFun') === 'true';
        if (!this.isEnabled) return;
        
        await this.loadUserStats();
        this.setupEventListeners();
        this.initializeSmartPlaceholders();
        this.isInitialized = true;
        
        console.log('Step Entry UX initialized', { mobile: this.isMobile, haptics: this.supportsHaptics });
    }

    async loadUserStats() {
        try {
            // Get user's recent step data for smart suggestions
            const response = await fetch('/api/steps');
            if (response.ok) {
                const data = await response.json();
                this.userStats = this.calculateUserStats(data.steps || []);
            }
        } catch (error) {
            console.log('Could not load user stats for UX features:', error.message);
        }
    }

    calculateUserStats(steps) {
        if (!steps || !steps.length) {
            console.log('No steps data available, using defaults');
            return { average: 8500, recent: 8500, best: 10000 };
        }
        
        console.log('Calculating stats from', steps.length, 'step records:', steps);
        
        const recentSteps = steps.slice(0, 7); // Last 7 days
        const allCounts = steps.map(s => parseInt(s.count) || 0).filter(count => count > 0);
        
        if (!allCounts.length) {
            console.log('No valid step counts found');
            return { average: 8500, recent: 8500, best: 10000 };
        }
        
        const recentCounts = recentSteps.map(s => parseInt(s.count) || 0).filter(count => count > 0);
        
        const stats = {
            average: Math.round(allCounts.reduce((a, b) => a + b, 0) / allCounts.length),
            recent: recentCounts.length ? Math.round(recentCounts.reduce((a, b) => a + b, 0) / recentCounts.length) : 8500,
            best: Math.max(...allCounts)
        };
        
        console.log('Calculated user stats:', stats);
        return stats;
    }

    setupEventListeners() {
        const stepsInput = document.getElementById('steps');
        const submitBtn = document.getElementById('submitStepsBtn');
        const dateInput = document.getElementById('date');

        if (!stepsInput || !submitBtn) return;

        // Input validation with mobile-optimized debouncing
        let validationTimeout;
        stepsInput.addEventListener('input', (e) => {
            clearTimeout(validationTimeout);
            validationTimeout = setTimeout(() => {
                this.handleStepsInput(e.target);
            }, this.isMobile ? 300 : 150); // Longer debounce on mobile
        });

        // Form state monitoring
        const form = document.getElementById('stepsForm');
        if (form) {
            form.addEventListener('input', () => this.updateButtonState());
        }

        // Enhanced form submission (don't prevent default, just add UX)
        form.addEventListener('submit', (e) => this.handleFormSubmit(e), { capture: true });
    }

    handleStepsInput(input) {
        const value = parseInt(input.value);
        const feedback = document.getElementById('stepsValidation');
        
        if (!feedback) return;

        // Clear previous states
        feedback.className = 'validation-feedback';
        input.classList.remove('milestone-hint', 'contextual-placeholder');

        if (isNaN(value) || value < 0) {
            this.hideValidationFeedback();
            return;
        }

        // Format number with commas (mobile-friendly)
        if (value >= 1000) {
            const formatted = value.toLocaleString();
            // Update input appearance without interfering with mobile keyboards
            if (!input.matches(':focus')) {
                input.setAttribute('data-formatted', formatted);
                input.classList.add('steps-input-formatted');
            }
        }

        // Validation states
        if (value > 0 && value <= 70000) {
            this.showValidationFeedback('✓', 'valid');
            
            // Milestone detection with proper debugging
            if (this.userStats) {
                console.log(`Checking milestone: entered=${value}, userBest=${this.userStats.best}`);
                
                if (value > this.userStats.best) {
                    console.log('Personal best detected');
                    this.showValidationFeedback('*', 'milestone');
                    this.createMiniCelebration(input);
                } else if (value >= 15000) {
                    console.log('High achiever threshold met');
                    this.showValidationFeedback('•', 'milestone');
                }
            } else {
                console.log('No user stats available for milestone detection');
                // Fallback to generic high achiever threshold
                if (value >= 15000) {
                    this.showValidationFeedback('•', 'milestone');
                }
            }
        } else if (value > 70000) {
            this.showValidationFeedback('!', 'warning');
        }

        this.updateButtonState();
    }

    showValidationFeedback(icon, type) {
        const feedback = document.getElementById('stepsValidation');
        if (!feedback) return;

        feedback.textContent = icon;
        feedback.className = `validation-feedback show ${type}`;
        
        // Mobile haptic feedback (gentle)
        if (this.supportsHaptics && type === 'valid') {
            navigator.vibrate(20); // Very short, gentle vibration
        }
    }

    hideValidationFeedback() {
        const feedback = document.getElementById('stepsValidation');
        if (feedback) {
            feedback.className = 'validation-feedback';
        }
    }

    updateButtonState() {
        const form = document.getElementById('stepsForm');
        const submitBtn = document.getElementById('submitStepsBtn');
        
        if (!form || !submitBtn) return;

        const formData = new FormData(form);
        const hasDate = formData.get('date');
        const hasSteps = formData.get('steps') && parseInt(formData.get('steps')) > 0;

        // Remove previous states
        submitBtn.classList.remove('ready-to-save', 'saving', 'saved');

        if (hasDate && hasSteps) {
            submitBtn.classList.add('ready-to-save');
        }
    }

    createMiniCelebration(element) {
        // Subtle particles around the input (mobile-optimized)
        const particles = ['·', '•', '∙'];
        const rect = element.getBoundingClientRect();
        
        for (let i = 0; i < 2; i++) {
            const particle = document.createElement('div');
            particle.className = 'mini-celebration sparkle';
            particle.textContent = particles[Math.floor(Math.random() * particles.length)];
            particle.style.position = 'fixed';
            particle.style.left = `${rect.right - 30 + Math.random() * 20}px`;
            particle.style.top = `${rect.top + Math.random() * rect.height}px`;
            particle.style.zIndex = '1000';
            particle.style.pointerEvents = 'none';
            particle.style.color = '#667eea';
            particle.style.opacity = '0.6';
            
            document.body.appendChild(particle);
            
            // Clean up after animation
            setTimeout(() => {
                if (particle.parentNode) {
                    particle.parentNode.removeChild(particle);
                }
            }, 1000);
        }
    }

    handleFormSubmit(e) {
        const submitBtn = document.getElementById('submitStepsBtn');
        if (!submitBtn) return;

        // Button state: saving (don't interfere with form submission)
        submitBtn.classList.remove('ready-to-save');
        submitBtn.classList.add('saving');
        submitBtn.textContent = 'Saving...';
        submitBtn.disabled = true;
    }

    handleSubmitSuccess(steps, messageDiv) {
        const submitBtn = document.getElementById('submitStepsBtn');
        if (!submitBtn) return;

        // Button success animation
        submitBtn.classList.remove('saving');
        submitBtn.classList.add('saved');
        submitBtn.textContent = '✓ Saved!';
        
        // Haptic feedback for successful save
        if (this.supportsHaptics) {
            navigator.vibrate([50, 50, 50]); // Success pattern
        }

        // Smart success message
        this.showSmartSuccessMessage(steps, messageDiv);

        // Reset button after delay
        setTimeout(() => {
            submitBtn.classList.remove('saved');
            submitBtn.textContent = 'Save Steps';
            submitBtn.disabled = false;
        }, 2000);

        // Update placeholders based on new data
        setTimeout(() => {
            this.loadUserStats().then(() => {
                this.updateSmartPlaceholders();
            });
        }, 500);
    }

    showSmartSuccessMessage(steps, messageDiv) {
        if (!messageDiv) {
            console.log('No message div available for smart success message');
            return; // Fallback to default message
        }

        let message = 'Steps saved successfully!';
        let icon = '✅';

        console.log(`Smart success message: steps=${steps}, userStats=`, this.userStats);

        // Contextual messages based on user stats
        if (this.userStats) {
            if (steps > this.userStats.best) {
                message = `Personal best: ${steps.toLocaleString()} steps`;
                icon = '';
                console.log('Showing personal best message');
            } else if (steps >= 15000) {
                message = `Strong performance: ${(steps/1000).toFixed(1)}K steps logged`;
                icon = '';
                console.log('Showing high achiever message');
            } else if (this.userStats.average > 0 && steps > this.userStats.average * 1.2) {
                const percentAbove = Math.round(((steps - this.userStats.average) / this.userStats.average) * 100);
                message = `Above average: ${percentAbove}% higher than usual`;
                icon = '';
                console.log('Showing above-average message');
            } else if (this.userStats.average > 0 && steps >= this.userStats.average * 0.8) {
                message = 'Consistent with your typical activity';
                icon = '';
                console.log('Showing solid day message');
            } else {
                console.log('Using default success message');
            }
        } else {
            console.log('No user stats available, using generic message');
            // Fallback for when no user stats are available
            if (steps >= 15000) {
                message = `${(steps/1000).toFixed(1)}K steps logged`;
                icon = '';
            } else if (steps >= 10000) {
                message = `${steps.toLocaleString()} steps logged`;
                icon = '';
            }
        }

        messageDiv.innerHTML = `
            <div class="message success smart-success-message">
                <span class="icon">${icon}</span>
                <span>${message}</span>
            </div>
        `;
    }

    initializeSmartPlaceholders() {
        this.updateSmartPlaceholders();
    }

    updateSmartPlaceholders() {
        const stepsInput = document.getElementById('steps');
        if (!stepsInput || !this.userStats) return;

        // Smart placeholder based on user history
        let placeholder = 'e.g. 8,500';
        
        if (this.userStats.recent > 0) {
            const suggestion = Math.round(this.userStats.recent / 500) * 500; // Round to nearest 500
            placeholder = `e.g. ${suggestion.toLocaleString()}`;
        }

        stepsInput.setAttribute('placeholder', placeholder);
    }

    // Animate chart bars when new data is added
    animateChartUpdate() {
        // Find the latest bar in the chart
        const chartBars = document.querySelectorAll('.step-bar');
        if (chartBars.length > 0) {
            const latestBar = chartBars[chartBars.length - 1];
            latestBar.classList.add('animate-grow');
            
            // Clean up animation class
            setTimeout(() => {
                latestBar.classList.remove('animate-grow');
            }, 600);
        }
    }

    // Clean up method
    destroy() {
        this.isInitialized = false;
        // Remove event listeners if needed
        const particles = document.querySelectorAll('.mini-celebration');
        particles.forEach(p => p.remove());
    }
}

// Global instance
window.stepEntryUX = new StepEntryUX();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.stepEntryUX.init();
    });
} else {
    window.stepEntryUX.init();
}

// Export for use in main dashboard
window.StepEntryUX = StepEntryUX;