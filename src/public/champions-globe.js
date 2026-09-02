(() => {
    'use strict';

    const RAD = Math.PI / 180;
    const LOCATIONS = Object.freeze({
        delhi: [77.209, 28.614],
        singapore: [103.8198, 1.3521],
        sanFrancisco: [-122.4194, 37.7749]
    });

    const toVector = ([longitude, latitude]) => {
        const lon = longitude * RAD;
        const lat = latitude * RAD;
        const cosLat = Math.cos(lat);
        return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
    };
    const angularDistance = (start, end) => Math.acos(Math.max(-1, Math.min(1,
        start[0] * end[0] + start[1] * end[1] + start[2] * end[2]
    )));
    const greatCirclePoint = (start, end, fraction) => {
        const distance = angularDistance(start, end);
        if (!distance) return start;
        const startWeight = Math.sin((1 - fraction) * distance) / Math.sin(distance);
        const endWeight = Math.sin(fraction * distance) / Math.sin(distance);
        const vector = start.map((value, index) => value * startWeight + end[index] * endWeight);
        const longitude = Math.atan2(vector[1], vector[0]) / RAD;
        const latitude = Math.atan2(vector[2], Math.hypot(vector[0], vector[1])) / RAD;
        return [longitude, latitude];
    };

    function create(options) {
        const { container, canvas, landRings, onwardFraction, onProgress } = options;
        const context = canvas?.getContext?.('2d');
        if (!context || !Array.isArray(landRings)) {
            container.classList.add('no-canvas');
            return null;
        }

        const delhiVector = toVector(LOCATIONS.delhi);
        const singaporeVector = toVector(LOCATIONS.singapore);
        const sanFranciscoVector = toVector(LOCATIONS.sanFrancisco);
        const firstDistance = angularDistance(delhiVector, singaporeVector);
        const secondDistance = angularDistance(singaporeVector, sanFranciscoVector);
        const traveledSecondDistance = secondDistance * onwardFraction;
        const totalDistance = firstDistance + traveledSecondDistance;
        const firstLegShare = totalDistance ? firstDistance / totalDistance : 1;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        let width = 1;
        let height = 1;
        let radius = 1;
        let centerX = 0;
        let centerY = 0;
        let routeProgress = 0;
        let manualLongitude = 0;
        let activePointerId = null;
        let dragStartX = 0;
        let dragStartLongitude = 0;

        function routeState(progress) {
            if (progress <= firstLegShare) {
                const fraction = firstLegShare ? progress / firstLegShare : 1;
                return {
                    point: greatCirclePoint(delhiVector, singaporeVector, fraction),
                    onwardProgress: 0,
                    reachedSingapore: fraction >= 1
                };
            }
            const onwardProgress = (progress - firstLegShare) / (1 - firstLegShare);
            return {
                point: greatCirclePoint(singaporeVector, sanFranciscoVector, onwardFraction * onwardProgress),
                onwardProgress,
                reachedSingapore: true
            };
        }

        function viewLongitude() {
            return 103 + routeState(routeProgress).onwardProgress * 34 + manualLongitude;
        }

        function project([longitude, latitude]) {
            const relativeLongitude = (longitude - viewLongitude()) * RAD;
            const lat = latitude * RAD;
            const centerLat = 15 * RAD;
            const cosLat = Math.cos(lat);
            const visibility = Math.sin(centerLat) * Math.sin(lat) +
                Math.cos(centerLat) * cosLat * Math.cos(relativeLongitude);
            return {
                x: centerX + radius * cosLat * Math.sin(relativeLongitude),
                y: centerY - radius * (Math.cos(centerLat) * Math.sin(lat) -
                    Math.sin(centerLat) * cosLat * Math.cos(relativeLongitude)),
                visible: visibility >= 0
            };
        }

        function traceCoordinates(coordinates, close = false) {
            let drawing = false;
            for (const coordinate of coordinates) {
                const point = project(coordinate);
                if (!point.visible) {
                    drawing = false;
                    continue;
                }
                if (!drawing) {
                    context.moveTo(point.x, point.y);
                    drawing = true;
                } else {
                    context.lineTo(point.x, point.y);
                }
            }
            if (close && drawing) context.closePath();
        }

        function sampledMeridian(longitude) {
            return Array.from({ length: 73 }, (_, index) => [longitude, -90 + index * 2.5]);
        }
        function sampledParallel(latitude) {
            return Array.from({ length: 145 }, (_, index) => [-180 + index * 2.5, latitude]);
        }

        function drawGrid() {
            context.beginPath();
            for (let longitude = -180; longitude < 180; longitude += 30) {
                traceCoordinates(sampledMeridian(longitude));
            }
            for (let latitude = -60; latitude <= 60; latitude += 30) {
                traceCoordinates(sampledParallel(latitude));
            }
            context.strokeStyle = 'rgba(220, 232, 242, 0.11)';
            context.lineWidth = 1;
            context.stroke();
        }

        function drawLand() {
            context.fillStyle = 'rgba(247, 200, 93, 0.09)';
            context.strokeStyle = 'rgba(247, 200, 93, 0.34)';
            context.lineWidth = 1.15;
            for (const ring of landRings) {
                const fullyVisible = ring.every(coordinate => project(coordinate).visible);
                context.beginPath();
                traceCoordinates(ring, fullyVisible);
                if (fullyVisible) context.fill();
                context.stroke();
            }
        }

        function routePoints(start, end, endFraction = 1, samples = 90) {
            return Array.from({ length: samples + 1 }, (_, index) =>
                greatCirclePoint(start, end, endFraction * index / samples)
            );
        }

        function drawProjectedLine(coordinates, style, widthValue, dashed = false) {
            context.save();
            context.beginPath();
            traceCoordinates(coordinates);
            context.strokeStyle = style;
            context.lineWidth = widthValue;
            context.lineCap = 'round';
            context.lineJoin = 'round';
            if (dashed) context.setLineDash([2, 8]);
            context.stroke();
            context.restore();
        }

        function drawRoute() {
            drawProjectedLine(routePoints(delhiVector, singaporeVector), 'rgba(255, 247, 220, 0.2)', 2, true);
            drawProjectedLine(routePoints(singaporeVector, sanFranciscoVector), 'rgba(255, 247, 220, 0.2)', 2, true);

            if (routeProgress <= firstLegShare) {
                const fraction = firstLegShare ? routeProgress / firstLegShare : 1;
                drawProjectedLine(routePoints(delhiVector, singaporeVector, fraction), '#f7c85d', 3.5);
            } else {
                drawProjectedLine(routePoints(delhiVector, singaporeVector), '#f7c85d', 3.5);
                const onwardProgress = (routeProgress - firstLegShare) / (1 - firstLegShare);
                drawProjectedLine(
                    routePoints(singaporeVector, sanFranciscoVector, onwardFraction * onwardProgress),
                    '#f7c85d',
                    3.5
                );
            }
        }

        function drawCity(name, coordinate, reached, align = 'left') {
            const point = project(coordinate);
            if (!point.visible) return;
            context.save();
            context.beginPath();
            context.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
            context.fillStyle = reached ? '#f7c85d' : '#090714';
            context.strokeStyle = reached ? '#f7c85d' : '#81798b';
            context.lineWidth = 2.5;
            context.shadowColor = reached ? 'rgba(247, 200, 93, .8)' : 'transparent';
            context.shadowBlur = reached ? 13 : 0;
            context.fill();
            context.stroke();
            context.shadowBlur = 0;
            context.fillStyle = reached ? '#fff7dc' : '#c9bfaa';
            context.strokeStyle = '#090714';
            context.lineWidth = 4;
            context.font = '800 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
            context.textAlign = align;
            context.textBaseline = 'middle';
            const x = point.x + (align === 'right' ? -12 : 12);
            context.strokeText(name, x, point.y - 13);
            context.fillText(name, x, point.y - 13);
            context.restore();
        }

        function drawShoe(coordinate) {
            const point = project(coordinate);
            if (!point.visible) return;
            context.save();
            context.beginPath();
            context.arc(point.x, point.y, 18, 0, Math.PI * 2);
            context.fillStyle = 'rgba(9, 7, 20, .92)';
            context.strokeStyle = '#f7c85d';
            context.lineWidth = 2;
            context.shadowColor = 'rgba(247, 200, 93, .75)';
            context.shadowBlur = 12;
            context.fill();
            context.stroke();
            context.shadowBlur = 0;
            context.font = '21px sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('👟', point.x, point.y + 1);
            context.restore();
        }

        function draw() {
            context.clearRect(0, 0, width, height);
            const ocean = context.createRadialGradient(
                centerX - radius * .25, centerY - radius * .3, radius * .05,
                centerX, centerY, radius
            );
            ocean.addColorStop(0, '#312651');
            ocean.addColorStop(.6, '#15132c');
            ocean.addColorStop(1, '#090815');
            context.save();
            context.beginPath();
            context.arc(centerX, centerY, radius, 0, Math.PI * 2);
            context.fillStyle = ocean;
            context.shadowColor = 'rgba(0, 0, 0, .48)';
            context.shadowBlur = 34;
            context.shadowOffsetY = 20;
            context.fill();
            context.shadowColor = 'transparent';
            context.shadowBlur = 0;
            context.shadowOffsetX = 0;
            context.shadowOffsetY = 0;
            context.clip();
            drawGrid();
            drawLand();
            drawRoute();
            context.restore();
            const state = routeState(routeProgress);
            drawCity('DELHI', LOCATIONS.delhi, true, 'left');
            drawCity('SINGAPORE', LOCATIONS.singapore, state.reachedSingapore, 'right');
            drawCity('SAN FRANCISCO', LOCATIONS.sanFrancisco, routeProgress >= 1 && onwardFraction >= .999, 'right');
            drawShoe(state.point);
            context.beginPath();
            context.arc(centerX, centerY, radius, 0, Math.PI * 2);
            context.strokeStyle = 'rgba(247, 200, 93, .35)';
            context.lineWidth = 1.5;
            context.stroke();
        }

        function resize() {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
            width = Math.max(1, rect.width);
            height = Math.max(1, rect.height);
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            centerX = width / 2;
            centerY = height * .49;
            radius = Math.min(width * .235, height * .43);
            draw();
        }

        function setProgress(progress) {
            routeProgress = Math.max(0, Math.min(1, progress));
            draw();
            onProgress?.(routeProgress, firstLegShare);
        }

        container.addEventListener('pointerdown', event => {
            if (activePointerId !== null || (event.pointerType === 'mouse' && event.button !== 0)) return;
            activePointerId = event.pointerId;
            dragStartX = event.clientX;
            dragStartLongitude = manualLongitude;
            container.setPointerCapture?.(event.pointerId);
            container.classList.add('is-dragging');
        });
        container.addEventListener('pointermove', event => {
            if (event.pointerId !== activePointerId) return;
            manualLongitude = dragStartLongitude - (event.clientX - dragStartX) * .22;
            draw();
        });
        const finishDrag = event => {
            if (activePointerId === null || (event.pointerId != null && event.pointerId !== activePointerId)) return;
            const pointerId = activePointerId;
            activePointerId = null;
            if (container.hasPointerCapture?.(pointerId)) container.releasePointerCapture(pointerId);
            container.classList.remove('is-dragging');
        };
        container.addEventListener('pointerup', finishDrag);
        container.addEventListener('pointercancel', finishDrag);
        container.addEventListener('lostpointercapture', finishDrag);
        container.addEventListener('keydown', event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
            event.preventDefault();
            manualLongitude = event.key === 'Home'
                ? 0
                : manualLongitude + (event.key === 'ArrowLeft' ? -8 : 8);
            draw();
        });

        if (typeof ResizeObserver === 'function') {
            new ResizeObserver(resize).observe(canvas);
        } else {
            window.addEventListener('resize', resize, { passive: true });
        }
        reduceMotion.addEventListener?.('change', draw);
        container.classList.add('has-canvas');
        resize();

        return { setProgress, firstLegShare };
    }

    window.PantheonGlobe = { create };
})();
