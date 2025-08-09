// Shadow Pig Game Engine
// Completely isolated from main app - no dependencies on dashboard.js

window.PigGameEngine = (function() {
    'use strict';
    
    let gameState = null;
    let animationId = null;
    let canvas = null;
    let ctx = null;
    
    // Game configuration
    const CONFIG = {
        GRAVITY: 0.6,              // Reduced for more floaty jumping
        JUMP_FORCE: -11,           // Slightly reduced for better control
        DOUBLE_JUMP_FORCE: -8,     // Weaker second jump
        BASE_SPEED: 2,
        SPEED_INCREMENT: 0.2,
        SPEED_INTERVAL: 800,
        OBSTACLE_MIN_GAP: 200,
        OBSTACLE_MAX_GAP: 450,
        OBSTACLE_FREE_CHANCE: 0.3,  // 30% chance of extended obstacle-free stretch
        BONUS_HEART_MIN_DISTANCE: 500,  // Minimum distance before bonus hearts can spawn
        BONUS_HEART_CHANCE: 0.05,       // 5% chance per obstacle spawn to create bonus heart
        PIG_SIZE: { width: 30, height: 25 },
        GROUND_HEIGHT: 35,
        HITBOX_FORGIVENESS: 0.75,  // Make hitbox 75% of visual size (more forgiving)
        VISUAL_SCALE: 1.2          // Render obstacles 20% larger than hitbox
    };
    
    // Obstacle types with varied heights and shapes
    const OBSTACLE_TYPES = [
        { type: 'short', height: 30, width: 18, color: '#ff4444' },
        { type: 'medium', height: 45, width: 20, color: '#ff6644' },
        { type: 'tall', height: 65, width: 22, color: '#ff8844' },
        { type: 'spike', height: 40, width: 15, color: '#ff2222' },
        { type: 'wide', height: 35, width: 30, color: '#ff4466' }
    ];
    
    // Pixel art pig sprite data - head-on view with bigger ears
    const PIG_SPRITE_HEAD_ON = [
        [2,2,1,1,1,1,2,2],  // Bigger ears across top
        [2,1,1,1,1,1,1,2],  // Ear area extended
        [1,1,3,1,1,3,1,1],  // Eyes
        [1,1,1,1,1,1,1,1],  // Body
        [1,1,4,4,4,4,1,1],  // Snout area wider
        [1,1,1,4,4,1,1,1],  // Snout
        [0,1,1,1,1,1,1,0],  // Body
        [0,0,5,0,0,5,0,0]   // Little legs
    ];

    // Side view pig sprite - facing right, more pig-like
    const PIG_SPRITE_SIDE = [
        [0,0,2,2,1,1,0,0],  // Ears pointing back
        [0,2,1,1,1,1,1,0],  // Ear and rounded head
        [2,1,1,3,1,1,1,4],  // Ear, eye, body, snout start
        [1,1,1,1,1,1,4,4],  // Body and prominent snout
        [1,1,1,1,1,1,4,0],  // Body and snout tip
        [1,1,1,1,1,1,1,0],  // Body
        [0,1,1,1,1,1,0,0],  // Body tapers
        [0,0,5,0,0,5,0,0]   // Four little legs
    ];

    // Default to head-on view
    let PIG_SPRITE = PIG_SPRITE_HEAD_ON;
    
    // Function to switch pig sprite style
    function setPigStyle(style) {
        if (style === 'side') {
            PIG_SPRITE = PIG_SPRITE_SIDE;
        } else {
            PIG_SPRITE = PIG_SPRITE_HEAD_ON;
        }
    }
    
    // Check for pig style setting on initialization
    async function initializePigStyle() {
        try {
            const response = await fetch('/api/pig-sprite-setting');
            const data = await response.json();
            
            if (data.pigStyle && data.pigStyle === 'side') {
                setPigStyle('side');
            } else {
                setPigStyle('head-on'); // default
            }
        } catch (e) {
            console.warn('Failed to load pig style setting, using default head-on view:', e);
            setPigStyle('head-on'); // fallback to default
        }
    }
    
    // Pig colors: body pink, darker ears, black eyes, snout pink, brown legs  
    const PIG_COLORS = ['transparent', '#FFC0CB', '#FF91A4', '#000', '#FF69B4', '#8B4513'];
    
    function createGameState(canvasElement) {
        canvas = canvasElement;
        ctx = canvas.getContext('2d');
        
        return {
            running: false,
            startTime: 0,
            distance: 0,
            speed: CONFIG.BASE_SPEED,
            obstacles: [],
            bonusHearts: [],
            particles: [],
            score: 0,
            pig: {
                x: 80,
                y: canvas.height - CONFIG.GROUND_HEIGHT - CONFIG.PIG_SIZE.height,
                width: CONFIG.PIG_SIZE.width,
                height: CONFIG.PIG_SIZE.height,
                velocityY: 0,
                jumping: false,
                grounded: true,
                groundY: canvas.height - CONFIG.GROUND_HEIGHT - CONFIG.PIG_SIZE.height,
                doubleJumpAvailable: false,
                jumpsUsed: 0
            },
            ground: {
                y: canvas.height - CONFIG.GROUND_HEIGHT,
                height: CONFIG.GROUND_HEIGHT
            },
            eventListeners: []
        };
    }
    
    function createObstacle(x) {
        // Progressive difficulty based on distance traveled
        const difficulty = Math.min(gameState.distance / 2000, 1); // Ramp up over 2000 pixels
        
        // Early game: favor short/medium obstacles, late game: all types
        let availableTypes;
        if (difficulty < 0.3) {
            // Early: only short and medium (easier)
            availableTypes = OBSTACLE_TYPES.filter(t => ['short', 'medium'].includes(t.type));
        } else if (difficulty < 0.7) {
            // Mid: short, medium, and wide (no tall or spikes yet)
            availableTypes = OBSTACLE_TYPES.filter(t => ['short', 'medium', 'wide'].includes(t.type));
        } else {
            // Late: all obstacle types (full difficulty)
            availableTypes = OBSTACLE_TYPES;
        }
        
        // Select random obstacle type from available set
        const obstacleTemplate = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        
        const obstacle = {
            x: x,
            y: gameState.ground.y - obstacleTemplate.height,
            width: obstacleTemplate.width,
            height: obstacleTemplate.height,
            type: obstacleTemplate.type,
            color: obstacleTemplate.color,
            // Actual hitbox is smaller (more forgiving)
            hitboxWidth: obstacleTemplate.width * CONFIG.HITBOX_FORGIVENESS,
            hitboxHeight: obstacleTemplate.height * CONFIG.HITBOX_FORGIVENESS,
            // Visual rendering is larger
            visualWidth: obstacleTemplate.width * CONFIG.VISUAL_SCALE,
            visualHeight: obstacleTemplate.height * CONFIG.VISUAL_SCALE
        };
        
        return obstacle;
    }
    
    function createBonusHeart(x) {
        return {
            x: x,
            y: gameState.ground.y - 80, // Float above ground
            width: 20,
            height: 20,
            collected: false,
            bob: 0 // For floating animation
        };
    }
    
    function initializeObstacles() {
        gameState.obstacles = [];
        for (let i = 0; i < 5; i++) {
            gameState.obstacles.push(createObstacle(canvas.width + i * 200));
        }
    }
    
    function setupInputHandlers() {
        // Separate handlers for jump and double jump
        const performJump = () => {
            if (!gameState.running) return false;
            
            if (gameState.pig.grounded) {
                // First jump
                gameState.pig.velocityY = CONFIG.JUMP_FORCE;
                gameState.pig.jumping = true;
                gameState.pig.grounded = false;
                gameState.pig.doubleJumpAvailable = true;
                gameState.pig.jumpsUsed = 1;
                return true;
            }
            return false;
        };

        const performDoubleJump = () => {
            if (!gameState.running) return false;
            
            if (gameState.pig.doubleJumpAvailable) {
                // Double jump
                gameState.pig.velocityY = CONFIG.DOUBLE_JUMP_FORCE;
                gameState.pig.doubleJumpAvailable = false;
                gameState.pig.jumpsUsed = 2;
                return true;
            }
            return false;
        };

        // Desktop/keyboard handler - smart jump logic
        const smartJumpHandler = (e) => {
            e.preventDefault();
            if (!gameState.running) return;
            
            // Try jump first, then double jump if jump isn't available
            if (!performJump()) {
                performDoubleJump();
            }
        };
        
        const keyHandler = (e) => {
            if (e.code === 'Space' || e.code === 'ArrowUp') {
                smartJumpHandler(e);
            }
        };

        // Get mobile control elements
        const jumpBtn = document.getElementById('jumpBtn');
        const mobileTapArea = document.getElementById('mobileTapArea');
        
        // Mobile button handlers
        const mobileJumpHandler = (e) => {
            e.preventDefault();
            // Single jump button: jump if grounded, OR add jump if in flight
            if (gameState.pig.grounded) {
                performJump();
            } else if (gameState.pig.doubleJumpAvailable) {
                performDoubleJump();
            }
        };

        
        // Get game container and start button for desktop interaction
        const gameContainer = canvas.parentElement;
        const startButton = document.getElementById('startGameBtn');
        
        // Store event listeners for cleanup
        gameState.eventListeners.push(
            { element: document, event: 'keydown', handler: keyHandler }
        );

        // Desktop mouse/click handlers (fallback for non-touch devices)
        if (gameContainer && gameContainer.classList.contains('game-canvas')) {
            gameState.eventListeners.push(
                { element: gameContainer, event: 'click', handler: smartJumpHandler }
            );
        }
        
        if (canvas) {
            gameState.eventListeners.push(
                { element: canvas, event: 'click', handler: smartJumpHandler }
            );
        }
        
        // Add click detection for start button during gameplay (desktop)
        if (startButton) {
            gameState.eventListeners.push(
                { element: startButton, event: 'click', handler: smartJumpHandler }
            );
        }

        // Mobile touch area (larger tap target)
        if (mobileTapArea) {
            gameState.eventListeners.push(
                { element: mobileTapArea, event: 'click', handler: mobileJumpHandler },
                { element: mobileTapArea, event: 'touchstart', handler: mobileJumpHandler }
            );
        }
        
        // Fallback to button if tap area not found
        if (jumpBtn && !mobileTapArea) {
            gameState.eventListeners.push(
                { element: jumpBtn, event: 'click', handler: mobileJumpHandler },
                { element: jumpBtn, event: 'touchstart', handler: mobileJumpHandler }
            );
        }
        
        // Attach event listeners
        gameState.eventListeners.forEach(({ element, event, handler }) => {
            element.addEventListener(event, handler);
        });

        // Update mobile button states initially
        updateMobileButtons();
    }

    function updateMobileButtons() {
        const jumpBtn = document.getElementById('jumpBtn');
        
        if (jumpBtn && gameState) {
            const isRunning = gameState.running;
            const canJump = gameState.pig && (gameState.pig.grounded || gameState.pig.doubleJumpAvailable);
            
            // Enable/disable button based on game state
            jumpBtn.disabled = !isRunning || !canJump;
            
            // Keep button text simple and consistent
            jumpBtn.textContent = '⬆️';
        }
    }
    
    function updateGame() {
        const deltaTime = 16 / 1000; // Assume 60fps
        
        // Update distance and speed
        gameState.distance += gameState.speed;
        gameState.speed = CONFIG.BASE_SPEED + Math.floor(gameState.distance / CONFIG.SPEED_INTERVAL) * CONFIG.SPEED_INCREMENT;
        
        // Update pig physics
        if (!gameState.pig.grounded) {
            gameState.pig.velocityY += CONFIG.GRAVITY;
            gameState.pig.y += gameState.pig.velocityY;
            
            // Ground collision
            if (gameState.pig.y >= gameState.pig.groundY) {
                gameState.pig.y = gameState.pig.groundY;
                gameState.pig.velocityY = 0;
                gameState.pig.grounded = true;
                gameState.pig.jumping = false;
                gameState.pig.doubleJumpAvailable = false;
                gameState.pig.jumpsUsed = 0;
            }
        }
        
        // Update obstacles
        for (let i = gameState.obstacles.length - 1; i >= 0; i--) {
            const obstacle = gameState.obstacles[i];
            obstacle.x -= gameState.speed;
            
            // Remove off-screen obstacles
            if (obstacle.x + obstacle.width < 0) {
                gameState.obstacles.splice(i, 1);
                gameState.score += 10;
            }
            
            // Check collision
            if (isColliding(gameState.pig, obstacle)) {
                gameOver();
                return;
            }
        }
        
        // Add new obstacles with progressive gap sizing
        const lastObstacle = gameState.obstacles[gameState.obstacles.length - 1];
        if (!lastObstacle || lastObstacle.x < canvas.width + 100) {
            const difficulty = Math.min(gameState.distance / 2000, 1);
            
            // Early game: much larger gaps and more frequent peaceful stretches
            let baseGap = CONFIG.OBSTACLE_MIN_GAP + Math.random() * (CONFIG.OBSTACLE_MAX_GAP - CONFIG.OBSTACLE_MIN_GAP);
            let peacefulChance = CONFIG.OBSTACLE_FREE_CHANCE;
            
            if (difficulty < 0.3) {
                // Early: 50% larger base gaps, 60% chance of peaceful stretches
                baseGap = baseGap * 1.5;
                peacefulChance = 0.6;
            } else if (difficulty < 0.7) {
                // Mid: 25% larger base gaps, 40% chance of peaceful stretches  
                baseGap = baseGap * 1.25;
                peacefulChance = 0.4;
            }
            // Late: normal gaps and peaceful chances
            
            let gap = baseGap;
            
            // Create extended obstacle-free stretches based on difficulty
            if (Math.random() < peacefulChance) {
                gap = gap * (difficulty < 0.5 ? 3.0 : 2.5); // Longer peaceful stretches early game
            }
            
            gameState.obstacles.push(createObstacle(canvas.width + gap));
            
            // Spawn bonus hearts occasionally after minimum distance
            if (gameState.distance > CONFIG.BONUS_HEART_MIN_DISTANCE && 
                Math.random() < CONFIG.BONUS_HEART_CHANCE) {
                const heartGap = gap * 0.5; // Place heart in middle of gap
                gameState.bonusHearts.push(createBonusHeart(canvas.width + heartGap));
            }
        }
        
        // Update bonus hearts
        for (let i = gameState.bonusHearts.length - 1; i >= 0; i--) {
            const heart = gameState.bonusHearts[i];
            heart.x -= gameState.speed;
            heart.bob += 0.1;
            heart.y = gameState.ground.y - 80 + Math.sin(heart.bob) * 5; // Floating animation
            
            // Remove off-screen hearts
            if (heart.x + heart.width < 0) {
                gameState.bonusHearts.splice(i, 1);
                continue;
            }
            
            // Check collection
            if (!heart.collected && isColliding(gameState.pig, heart)) {
                heart.collected = true;
                // Bonus heart collected! (UI will handle heart restoration)
                if (window.PigGameCallbacks && window.PigGameCallbacks.onBonusHeart) {
                    window.PigGameCallbacks.onBonusHeart();
                }
                gameState.bonusHearts.splice(i, 1);
                
                // Create sparkle particles
                for (let j = 0; j < 10; j++) {
                    gameState.particles.push({
                        x: heart.x + heart.width / 2,
                        y: heart.y + heart.height / 2,
                        vx: (Math.random() - 0.5) * 8,
                        vy: (Math.random() - 0.5) * 8 - 2,
                        life: 1.0,
                        maxLife: 1.0,
                        color: '#FFD700'
                    });
                }
            }
        }
        
        // Update particles
        for (let i = gameState.particles.length - 1; i >= 0; i--) {
            const particle = gameState.particles[i];
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.2; // gravity
            particle.life -= deltaTime;
            
            if (particle.life <= 0) {
                gameState.particles.splice(i, 1);
            }
        }
        
        // Add dust particles when pig lands
        if (gameState.pig.grounded && gameState.pig.velocityY === 0 && Math.random() > 0.8) {
            for (let i = 0; i < 3; i++) {
                gameState.particles.push({
                    x: gameState.pig.x + Math.random() * gameState.pig.width,
                    y: gameState.pig.y + gameState.pig.height,
                    vx: (Math.random() - 0.5) * 2,
                    vy: -Math.random() * 2,
                    life: 0.5,
                    maxLife: 0.5
                });
            }
        }
    }
    
    function drawGame() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw background gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#1a1a2e');
        gradient.addColorStop(1, '#16213e');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw ground
        ctx.fillStyle = '#2d2d2d';
        ctx.fillRect(0, gameState.ground.y, canvas.width, gameState.ground.height);
        
        // Draw ground pattern
        ctx.fillStyle = '#3d3d3d';
        for (let x = 0; x < canvas.width; x += 20) {
            ctx.fillRect(x, gameState.ground.y + 10, 10, 2);
        }
        
        // Draw obstacles with varied types and larger visual size
        gameState.obstacles.forEach(obstacle => {
            const visualOffsetX = (obstacle.visualWidth - obstacle.width) / 2;
            const visualOffsetY = (obstacle.visualHeight - obstacle.height) / 2;
            
            // Draw main obstacle with type-specific color
            ctx.fillStyle = obstacle.color;
            ctx.fillRect(
                obstacle.x - visualOffsetX, 
                obstacle.y - visualOffsetY, 
                obstacle.visualWidth, 
                obstacle.visualHeight
            );
            
            // Add different visual effects based on type
            switch (obstacle.type) {
                case 'spike':
                    // Add spiky top
                    ctx.fillStyle = '#ff0000';
                    ctx.fillRect(
                        obstacle.x - visualOffsetX + obstacle.visualWidth * 0.25, 
                        obstacle.y - visualOffsetY, 
                        obstacle.visualWidth * 0.5, 
                        5
                    );
                    break;
                case 'wide':
                    // Add pattern for wide obstacles
                    ctx.fillStyle = '#aa2222';
                    for (let i = 0; i < 3; i++) {
                        ctx.fillRect(
                            obstacle.x - visualOffsetX + i * (obstacle.visualWidth / 3), 
                            obstacle.y - visualOffsetY + obstacle.visualHeight * 0.3, 
                            obstacle.visualWidth / 6, 
                            obstacle.visualHeight * 0.4
                        );
                    }
                    break;
                default:
                    // Add highlight for normal obstacles
                    ctx.fillStyle = obstacle.color.replace('44', '66');
                    ctx.fillRect(
                        obstacle.x - visualOffsetX, 
                        obstacle.y - visualOffsetY, 
                        obstacle.visualWidth, 
                        5
                    );
            }
        });
        
        // Draw pig
        drawPixelatedPig();
        
        // Draw bonus hearts
        gameState.bonusHearts.forEach(heart => {
            if (!heart.collected) {
                // Draw floating heart emoji
                ctx.font = '24px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('💖', heart.x + heart.width / 2, heart.y + heart.height);
                
                // Add glow effect
                ctx.shadowColor = '#FFD700';
                ctx.shadowBlur = 10;
                ctx.fillText('💖', heart.x + heart.width / 2, heart.y + heart.height);
                ctx.shadowBlur = 0;
            }
        });
        
        // Draw particles
        gameState.particles.forEach(particle => {
            const alpha = particle.life / particle.maxLife;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = particle.color || '#888';
            ctx.fillRect(particle.x, particle.y, 2, 2);
        });
        ctx.globalAlpha = 1;
        
        // Draw UI
        ctx.fillStyle = '#fff';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`Distance: ${Math.floor(gameState.distance / 10)}m`, 10, 25);
        ctx.fillText(`Speed: ${gameState.speed.toFixed(1)}x`, 10, 45);
        
        // Draw jump instruction
        if (gameState.pig.grounded) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.font = '12px monospace';
            ctx.fillText('TAP/CLICK/SPACE TO JUMP • DOUBLE TAP FOR DOUBLE JUMP', canvas.width / 2, canvas.height - 10);
        } else if (gameState.pig.doubleJumpAvailable) {
            ctx.textAlign = 'center';
            ctx.fillStyle = 'rgba(255,255,255,0.9)';
            ctx.font = '12px monospace';
            ctx.fillText('DOUBLE JUMP AVAILABLE!', canvas.width / 2, canvas.height - 10);
        }
    }
    
    function drawPixelatedPig() {
        const pig = gameState.pig;
        const pixelSize = 3;
        
        // Add bounce animation when jumping
        let offsetY = 0;
        if (!pig.grounded) {
            offsetY = Math.sin(Date.now() * 0.01) * 2;
        }
        
        for (let y = 0; y < PIG_SPRITE.length; y++) {
            for (let x = 0; x < PIG_SPRITE[y].length; x++) {
                const colorIndex = PIG_SPRITE[y][x];
                if (colorIndex > 0) {
                    ctx.fillStyle = PIG_COLORS[colorIndex];
                    ctx.fillRect(
                        pig.x + x * pixelSize,
                        pig.y + y * pixelSize + offsetY,
                        pixelSize,
                        pixelSize
                    );
                }
            }
        }
    }
    
    function isColliding(pig, object) {
        // Check if object has hitbox properties (obstacles) or use direct dimensions (bonus hearts)
        if (object.hitboxWidth && object.hitboxHeight) {
            // Use the smaller hitbox for collision detection (more forgiving for obstacles)
            const hitboxOffsetX = (object.width - object.hitboxWidth) / 2;
            const hitboxOffsetY = (object.height - object.hitboxHeight) / 2;
            
            return pig.x < object.x + hitboxOffsetX + object.hitboxWidth &&
                   pig.x + pig.width > object.x + hitboxOffsetX &&
                   pig.y < object.y + hitboxOffsetY + object.hitboxHeight &&
                   pig.y + pig.height > object.y + hitboxOffsetY;
        } else {
            // Direct collision detection for bonus hearts (no hitbox offset)
            return pig.x < object.x + object.width &&
                   pig.x + pig.width > object.x &&
                   pig.y < object.y + object.height &&
                   pig.y + pig.height > object.y;
        }
    }
    
    function gameLoop() {
        if (!gameState.running) return;
        
        updateGame();
        drawGame();
        updateMobileButtons(); // Keep button states synchronized during gameplay
        
        animationId = requestAnimationFrame(gameLoop);
    }
    
    function gameOver() {
        // Prevent multiple gameOver calls
        if (!gameState.running) return;
        
        gameState.running = false;
        
        // Calculate steps based on distance traveled
        const stepsEarned = Math.floor(gameState.distance / 20); // 1 step per 20 pixels
        
        // Create explosion particles at collision point
        for (let i = 0; i < 20; i++) {
            gameState.particles.push({
                x: gameState.pig.x + gameState.pig.width / 2,
                y: gameState.pig.y + gameState.pig.height / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                maxLife: 1.0
            });
        }
        
        // Continue drawing particles for a moment with safety counter
        let particleAnimationCount = 0;
        const MAX_PARTICLE_FRAMES = 180; // Max 3 seconds at 60fps
        
        const finalAnimationLoop = () => {
            if (particleAnimationCount >= MAX_PARTICLE_FRAMES) {
                // Force end the particle animation
                gameState.particles = [];
                return;
            }
            
            particleAnimationCount++;
            drawGame();
            
            if (gameState.particles.length > 0 && particleAnimationCount < MAX_PARTICLE_FRAMES) {
                requestAnimationFrame(finalAnimationLoop);
            }
        };
        finalAnimationLoop();
        
        // End game after brief delay
        setTimeout(() => {
            // Trigger game over callback
            if (window.PigGameCallbacks && window.PigGameCallbacks.onGameOver) {
                window.PigGameCallbacks.onGameOver(stepsEarned, Math.floor(gameState.distance / 10));
            }
        }, 1000);
    }
    
    function cleanup() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        
        if (gameState && gameState.eventListeners) {
            gameState.eventListeners.forEach(({ element, event, handler }) => {
                try {
                    element.removeEventListener(event, handler);
                } catch (e) {
                    // Ignore errors if element no longer exists
                }
            });
            gameState.eventListeners = [];
        }
        
        if (gameState) {
            gameState.running = false;
            gameState.obstacles = [];
            gameState.bonusHearts = [];
            gameState.particles = [];
        }
        
        gameState = null;
    }
    
    // Public API
    return {
        startGame: async function(canvasElement) {
            // Force cleanup of any existing game state
            cleanup();
            
            // Wait a frame to ensure cleanup is complete
            setTimeout(async () => {
                // Initialize pig style based on settings
                await initializePigStyle();
                
                gameState = createGameState(canvasElement);
                gameState.running = true;
                gameState.startTime = Date.now();
                
                initializeObstacles();
                setupInputHandlers();
                gameLoop();
            }, 16); // Wait one frame (16ms at 60fps)
            
            return gameState;
        },
        
        stopGame: function() {
            if (gameState) {
                gameState.running = false;
            }
            cleanup();
        },
        
        isRunning: function() {
            return gameState && gameState.running;
        },
        
        getGameState: function() {
            return gameState;
        }
    };
})();