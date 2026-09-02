(() => {
    'use strict';

    const canvas = document.getElementById('trophyShoeCanvas');
    const stage = document.getElementById('wireframeStage');
    if (!canvas || !stage) return;

    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: true,
        depth: false,
        powerPreference: 'low-power',
        preserveDrawingBuffer: false
    });
    if (!gl) {
        stage.classList.add('no-webgl');
        return;
    }

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, `
        attribute vec2 position;
        void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `);
    gl.compileShader(vertexShader);

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, `
        precision mediump float;
        uniform vec4 color;
        void main() { gl_FragColor = color; }
    `);
    gl.compileShader(fragmentShader);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        stage.classList.add('no-webgl');
        return;
    }

    // A heroic bare foot, ankle, laurels, crown, and pedestal made entirely
    // from line segments. Five unmistakable toes make the joke legible even
    // before the sculpture rotates. No model or texture downloads required.
    const vertices = [];
    const lines = [];
    const point = (x, y, z) => { vertices.push([x, y, z]); return vertices.length - 1; };
    const line = (a, b) => lines.push([a, b]);
    const path = (points, close = false) => {
        const ids = points.map(([x, y, z]) => point(x, y, z));
        for (let i = 1; i < ids.length; i += 1) line(ids[i - 1], ids[i]);
        if (close && ids.length > 2) line(ids[ids.length - 1], ids[0]);
        return ids;
    };
    const ring = (cx, cy, cz, radiusX, radiusZ, segments = 12) => {
        const points = [];
        for (let i = 0; i < segments; i += 1) {
            const angle = (i / segments) * Math.PI * 2;
            points.push([cx + Math.cos(angle) * radiusX, cy, cz + Math.sin(angle) * radiusZ]);
        }
        return path(points, true);
    };

    // Upper and lower outlines of the foot, viewed slightly from above.
    const footprint = [
        [-1.66,.42],[-1.06,.39],[-.55,.32],[-.1,.5],[.48,.68],[1.02,.7],
        [1.42,.55],[1.67,.28],[1.7,-.05],[1.57,-.35],[1.27,-.58],
        [.73,-.7],[.12,-.58],[-.48,-.4],[-1.12,-.34],[-1.67,-.39]
    ];
    const upper = path(footprint.map(([x, z]) => [x, .06, z]), true);
    const lower = path(footprint.map(([x, z]) => [x, -.2, z]), true);
    upper.forEach((id, index) => {
        if (index % 2 === 0) line(id, lower[index]);
    });

    // Sole contours and tendons make the foot read as sculpted rather than flat.
    path([[-1.55,.08,.25],[-.65,.14,.2],[.2,.16,.39],[.95,.17,.5]]);
    path([[-1.55,.08,-.23],[-.65,.14,-.18],[.2,.16,-.37],[.95,.17,-.48]]);
    path([[-1.28,.38,.2],[-.72,.24,.15],[-.05,.17,.2],[.62,.16,.38]]);
    path([[-1.28,.38,-.2],[-.72,.24,-.15],[-.05,.17,-.2],[.62,.16,-.38]]);

    // Five toe crowns, descending from the mighty big toe to the tiny pinky.
    const toes = [
        [1.43,.42,.3,.25], [1.63,.13,.255,.21], [1.62,-.15,.225,.19],
        [1.5,-.39,.19,.16], [1.29,-.58,.15,.125]
    ];
    toes.forEach(([x, z, rx, rz]) => {
        ring(x, .16, z, rx, rz, 12);
        line(point(x - rx, .16, z), point(x + rx, .16, z));
        line(point(x, .16, z - rz), point(x, .3, z));
    });

    // Ankle/calf rising from the heel, with three contour rings.
    const ankleRings = [
        ring(-1.23,.16,0,.42,.35,10),
        ring(-1.25,.72,0,.34,.3,10),
        ring(-1.2,1.34,0,.39,.34,10)
    ];
    for (let ringIndex = 1; ringIndex < ankleRings.length; ringIndex += 1) {
        ankleRings[ringIndex].forEach((id, index) => line(ankleRings[ringIndex - 1][index], id));
    }

    // Crown floating above the ankle, because this foot has earned sovereignty.
    path([[-1.65,1.54,0],[-1.6,1.92,0],[-1.38,1.68,0],[-1.18,2.03,0],[-.98,1.67,0],[-.76,1.91,0],[-.73,1.53,0]], true);

    // Pedestal and rising laurel branches.
    const baseTop = path([[-1.55,-.52,.78],[1.55,-.52,.78],[1.55,-.52,-.78],[-1.55,-.52,-.78]], true);
    const baseBottom = path([[-1.85,-1.0,.92],[1.85,-1.0,.92],[1.85,-1.0,-.92],[-1.85,-1.0,-.92]], true);
    baseTop.forEach((id, index) => line(id, baseBottom[index]));
    for (const side of [-1, 1]) {
        let previous = point(side * 1.75, -.42, 0);
        for (let i = 0; i < 6; i += 1) {
            const stem = point(side * (1.91 + i * .04), -.05 + i * .32, 0);
            line(previous, stem);
            line(stem, point(side * (1.63 - i * .02), .1 + i * .32, .08));
            line(stem, point(side * (2.15 + i * .01), .04 + i * .32, -.08));
            previous = stem;
        }
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const position = gl.getAttribLocation(program, 'position');
    const color = gl.getUniformLocation(program, 'color');
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    let running = false;
    let frameId = 0;
    let lastFrame = 0;
    let pointerOffset = 0;
    let contextLost = false;

    function resize() {
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const width = Math.max(1, Math.round(rect.width * dpr));
        const height = Math.max(1, Math.round(rect.height * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
            gl.viewport(0, 0, width, height);
        }
    }

    function project(vertex, angle) {
        const [x, y, z] = vertex;
        const cosY = Math.cos(angle);
        const sinY = Math.sin(angle);
        const rotatedX = x * cosY - z * sinY;
        const rotatedZ = x * sinY + z * cosY;
        const tilt = -0.72;
        const cosX = Math.cos(tilt);
        const sinX = Math.sin(tilt);
        const rotatedY = y * cosX - rotatedZ * sinX;
        const depthZ = y * sinX + rotatedZ * cosX;
        const perspective = 3.4 / (depthZ + 7.2);
        const aspect = canvas.width / canvas.height;
        return [rotatedX * perspective / aspect, rotatedY * perspective * 1.06];
    }

    function draw(now = 0) {
        running = false;
        if (contextLost) return;
        const angle = reduceMotion.matches ? -0.42 : now * 0.00022 + pointerOffset;
        const projected = new Float32Array(lines.length * 4);
        let cursor = 0;
        for (const [start, end] of lines) {
            const a = project(vertices[start], angle);
            const b = project(vertices[end], angle);
            projected[cursor++] = a[0]; projected[cursor++] = a[1];
            projected[cursor++] = b[0]; projected[cursor++] = b[1];
        }
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bufferData(gl.ARRAY_BUFFER, projected, gl.DYNAMIC_DRAW);
        gl.uniform4f(color, 0.969, 0.784, 0.365, 0.92);
        gl.drawArrays(gl.LINES, 0, lines.length * 2);

        if (!reduceMotion.matches && visible && !document.hidden) schedule();
    }

    function schedule() {
        if (running || contextLost) return;
        running = true;
        frameId = requestAnimationFrame(now => {
            if (now - lastFrame < 32) {
                running = false;
                schedule();
                return;
            }
            lastFrame = now;
            draw(now);
        });
    }

    const observer = new IntersectionObserver(entries => {
        visible = entries[0]?.isIntersecting ?? true;
        if (visible) {
            schedule();
        } else {
            if (frameId) cancelAnimationFrame(frameId);
            frameId = 0;
            running = false;
        }
    }, { threshold: 0.05 });
    observer.observe(stage);

    stage.addEventListener('pointermove', event => {
        const rect = stage.getBoundingClientRect();
        pointerOffset = ((event.clientX - rect.left) / rect.width - 0.5) * 0.35;
    }, { passive: true });
    stage.addEventListener('pointerleave', () => { pointerOffset = 0; });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) schedule(); });
    window.addEventListener('resize', () => {
        resize();
        schedule();
    }, { passive: true });
    reduceMotion.addEventListener?.('change', () => schedule());
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        contextLost = true;
        if (frameId) cancelAnimationFrame(frameId);
        frameId = 0;
        running = false;
        stage.classList.add('no-webgl');
    });

    resize();
    draw(0);
})();
