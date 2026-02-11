// Circuit Simulator - Interactive Circuit Analysis Engine
// Handles circuit calculations, component states, and visual updates

class CircuitSimulator {
    constructor() {
        this.components = new Map(); // componentId -> component data
        this.wires = new Map(); // wireId -> wire data
        this.circuitPaths = [];

        // Default component values
        this.defaults = {
            resistor: { resistance: 100, unit: 'Ω', minCurrent: 0 },
            battery: { voltage: 9, unit: 'V' },
            led: { threshold: 0.02, unit: 'A', forwardVoltage: 2 },
            diode: { forwardVoltage: 0.7, resistance: 1 }, // Diode: only allows forward direction
            bulb: { threshold: 0.05, unit: 'A', resistance: 10 },
            switch: { closed: true },
            ammeter: { resistance: 0 },
            voltmeter: { resistance: Infinity }
        };
    }

    // Register a component with its properties
    registerComponent(id, type, element) {
        const defaults = this.defaults[type] || {};
        const componentData = {
            id,
            type,
            element,
            ...JSON.parse(JSON.stringify(defaults)), // Deep copy
            connections: { top: null, bottom: null, left: null, right: null },
            current: 0,
            powered: false
        };

        // Only set voltage to 0 if component doesn't have a default voltage (like battery)
        if (!componentData.voltage && componentData.voltage !== 0) {
            componentData.voltage = 0;
        }

        this.components.set(id, componentData);

        const comp = this.components.get(id);
        console.log(`Registered ${type} with values:`, comp);

        // Add default value display
        this.updateComponentDisplay(id);
    }

    // Register a wire connection
    registerWire(wireId, comp1Id, point1, comp2Id, point2, pathElement) {
        this.wires.set(wireId, {
            id: wireId,
            comp1: comp1Id,
            point1,
            comp2: comp2Id,
            point2,
            element: pathElement,
            current: 0
        });

        // Update component connections
        const comp1 = this.components.get(comp1Id);
        const comp2 = this.components.get(comp2Id);

        if (comp1) comp1.connections[point1] = { componentId: comp2Id, wireId };
        if (comp2) comp2.connections[point2] = { componentId: comp1Id, wireId };
    }

    // Remove component from simulation
    unregisterComponent(id) {
        this.components.delete(id);
    }

    // Remove wire from simulation
    unregisterWire(wireId) {
        const wire = this.wires.get(wireId);
        if (wire) {
            // Remove connections
            const comp1 = this.components.get(wire.comp1);
            const comp2 = this.components.get(wire.comp2);

            if (comp1 && comp1.connections[wire.point1]?.wireId === wireId) {
                comp1.connections[wire.point1] = null;
            }
            if (comp2 && comp2.connections[wire.point2]?.wireId === wireId) {
                comp2.connections[wire.point2] = null;
            }

            this.wires.delete(wireId);
        }
    }

    // Main circuit analysis function
    analyzeCircuit() {
        console.log('Analyzing circuit...');

        // Reset all states (but preserve battery voltage - it's the source!)
        this.components.forEach(comp => {
            comp.current = 0;
            // Don't reset voltage for batteries - they are voltage sources!
            if (comp.type !== 'battery') {
                comp.voltage = 0;
            }
            comp.powered = false;
        });

        this.wires.forEach(wire => {
            wire.current = 0;
        });

        // Find all voltage sources (batteries)
        const batteries = Array.from(this.components.values()).filter(c => c.type === 'battery');

        if (batteries.length === 0) {
            console.log('No batteries found in circuit');
            this.updateAllVisuals();
            return;
        }

        // Analyze each battery's circuit
        batteries.forEach(battery => {
            this.analyzeBatteryCircuit(battery);
        });

        // Update all visual states
        this.updateAllVisuals();
    }

    // Analyze circuit for a specific battery
    analyzeBatteryCircuit(battery) {
        console.log(`Analyzing circuit for battery ${battery.id}, voltage: ${battery.voltage}V`);

        // Find paths from positive (top) to negative (bottom) terminal
        const paths = this.findCircuitPaths(battery.id, 'top', battery.id, 'bottom');

        if (paths.length === 0) {
            console.log('No complete circuit found');
            return;
        }

        console.log(`Found ${paths.length} path(s)`);

        // Analyze each path
        paths.forEach((path, index) => {
            console.log(`Path ${index + 1}:`, path.map(p => p.componentId));

            // Check if path has open switches
            const hasOpenSwitch = path.some(p => {
                const comp = this.components.get(p.componentId);
                return comp && comp.type === 'switch' && !comp.closed;
            });

            if (hasOpenSwitch) {
                console.log('Path has open switch - no current');
                return;
            }

            // Calculate total resistance in path
            let totalResistance = 0;
            let hasReverseBiasedDiode = false; // Track if current fights flow in reverse through diode

            path.forEach((p, idx) => {
                const comp = this.components.get(p.componentId);
                if (comp) {
                    if (comp.type === 'resistor') {
                        totalResistance += comp.resistance;
                    } else if (comp.type === 'bulb') {
                        totalResistance += comp.resistance;
                    } else if (comp.type === 'led') {
                        totalResistance += 50; // Assume 50Ω for LED
                    } else if (comp.type === 'diode') {
                        // Check if diode is forward or reverse biased
                        // Diode symbol points from positive to negative (left to right in circuit)
                        // Current flows in direction of arrow (positive to negative)

                        // Get entry connection point
                        const prevComp = idx > 0 ? path[idx - 1].componentId : battery.id;
                        const wireData = this.wires.get(p.wireId);

                        if (wireData) {
                            // Determine direction: is current entering from left/top (forward) or right/bottom (reverse)?
                            const entryPoint = wireData.comp1 === comp.id ? wireData.point1 : wireData.point2;

                            // Forward bias: current enters from left or top (anode side)
                            const isForwardBiased = (entryPoint === 'left' || entryPoint === 'top');

                            if (isForwardBiased) {
                                totalResistance += comp.resistance; // Small resistance when forward biased
                            } else {
                                // Reverse biased - diode blocks current
                                hasReverseBiasedDiode = true;
                            }
                        }
                    } else if (comp.type === 'ammeter') {
                        totalResistance += 0.01; // Tiny resistance for Ammeter
                    } else if (comp.type === 'voltmeter') {
                        totalResistance += 1000000; // 1MΩ for Voltmeter (High impedance)
                    }
                }
            });

            // If there's a reverse-biased diode, no current flows
            if (hasReverseBiasedDiode) {
                console.log('Path has reverse-biased diode - no current');
                return;
            }

            // Minimum resistance to prevent division by zero
            if (totalResistance < 0.1) totalResistance = 0.1;

            // Calculate current using Ohm's law: I = V / R
            const current = battery.voltage / totalResistance;
            console.log(`Total resistance: ${totalResistance}Ω, Current: ${current.toFixed(3)}A`);

            // Update component states
            path.forEach(p => {
                const comp = this.components.get(p.componentId);
                if (comp) {
                    comp.current = current;
                    comp.powered = true;

                    // Calculate voltage drop across component
                    if (comp.type === 'resistor') {
                        comp.voltage = current * comp.resistance;
                    } else if (comp.type === 'bulb') {
                        comp.voltage = current * comp.resistance;
                    } else if (comp.type === 'led') {
                        comp.voltage = comp.forwardVoltage;
                    } else if (comp.type === 'ammeter') {
                        comp.voltage = current * 0.01;
                    } else if (comp.type === 'voltmeter') {
                        comp.voltage = current * 1000000;
                    }
                }
            });
        });
    }

    // Find all paths between two points using DFS
    findCircuitPaths(startCompId, startPoint, endCompId, endPoint, visited = new Set(), currentPath = []) {
        const paths = [];

        // Get starting component
        const startComp = this.components.get(startCompId);
        if (!startComp) return paths;

        // Check connection from start point
        const connection = startComp.connections[startPoint];
        if (!connection) return paths;

        const nextCompId = connection.componentId;

        // Avoid revisiting components
        if (visited.has(nextCompId)) return paths;

        // Add to current path
        const newPath = [...currentPath, { componentId: nextCompId, wireId: connection.wireId }];

        // Check if we reached the end
        if (nextCompId === endCompId) {
            paths.push(newPath);
            return paths;
        }

        // Mark as visited
        const newVisited = new Set(visited);
        newVisited.add(nextCompId);

        // Get next component
        const nextComp = this.components.get(nextCompId);
        if (!nextComp) return paths;

        // Try all other connection points
        Object.keys(nextComp.connections).forEach(point => {
            const conn = nextComp.connections[point];
            if (conn && conn.componentId !== startCompId) {
                const subPaths = this.findCircuitPaths(nextCompId, point, endCompId, endPoint, newVisited, newPath);
                paths.push(...subPaths);
            }
        });

        return paths;
    }

    // Update visual state of all components
    updateAllVisuals() {
        this.components.forEach((comp, id) => {
            this.updateComponentVisual(id);
            this.updateComponentDisplay(id);
        });

        this.wires.forEach((wire, id) => {
            this.updateWireVisual(id);
        });
    }

    // Update visual state of a component
    updateComponentVisual(id) {
        const comp = this.components.get(id);
        if (!comp || !comp.element) return;

        const element = comp.element;

        // Update based on component type
        switch (comp.type) {
            case 'bulb':
                this.updateBulbVisual(comp, element);
                break;
            case 'led':
                this.updateLedVisual(comp, element);
                break;
            case 'switch':
                this.updateSwitchVisual(comp, element);
                break;
            case 'ammeter':
            case 'voltmeter':
                this.updateMeterVisual(comp, element);
                break;
        }

        // Add/remove powered class
        if (comp.powered && comp.current > (comp.threshold || 0)) {
            element.classList.add('powered');
        } else {
            element.classList.remove('powered');
        }
    }

    // Update bulb visual (glow effect)
    updateBulbVisual(comp, element) {
        const svg = element.querySelector('.circuit-element-icon');
        if (!svg) return;

        const circle = svg.querySelector('circle');
        if (!circle) return;

        if (comp.powered && comp.current >= comp.threshold) {
            // Calculate brightness based on current (clamped)
            // Arbitrary max current for full brightness = 2 * threshold or 0.5A
            const maxCurrent = comp.threshold * 5;
            const brightness = Math.min(Math.max((comp.current - comp.threshold) / (maxCurrent - comp.threshold), 0.2), 1);

            // Bulb is on - make it glow
            circle.setAttribute('fill', '#ffeb3b');
            circle.setAttribute('fill-opacity', brightness.toFixed(2));
            circle.setAttribute('filter', 'url(#bulb-glow)');

            // Add glow filter if it doesn't exist
            if (!svg.querySelector('#bulb-glow')) {
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                defs.innerHTML = `
                    <filter id="bulb-glow">
                        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                `;
                svg.insertBefore(defs, svg.firstChild);
            }
        } else {
            // Bulb is off
            circle.setAttribute('fill', 'none');
            circle.removeAttribute('fill-opacity');
            circle.removeAttribute('filter');
        }
    }

    // Update LED visual
    updateLedVisual(comp, element) {
        const svg = element.querySelector('.circuit-element-icon');
        if (!svg) return;

        const polygon = svg.querySelector('polygon');
        if (!polygon) return;

        if (comp.powered && comp.current >= comp.threshold) {
            polygon.setAttribute('fill', '#ff5252');
            polygon.setAttribute('filter', 'url(#led-glow)');

            if (!svg.querySelector('#led-glow')) {
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                defs.innerHTML = `
                    <filter id="led-glow">
                        <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                        <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                `;
                svg.insertBefore(defs, svg.firstChild);
            }
        } else {
            polygon.setAttribute('fill', '#e74c3c');
            polygon.removeAttribute('filter');
        }
    }

    // Update switch visual
    updateSwitchVisual(comp, element) {
        const svg = element.querySelector('.circuit-element-icon');
        if (!svg) return;

        const contactLine = svg.querySelector('line:nth-of-type(2)'); // The movable contact
        if (!contactLine) return;

        if (comp.closed) {
            // Closed position - horizontal
            contactLine.setAttribute('x2', '30');
            contactLine.setAttribute('y2', '20');
        } else {
            // Open position - angled up
            contactLine.setAttribute('x2', '30');
            contactLine.setAttribute('y2', '10');
        }
    }

    // Update meter display
    updateMeterVisual(comp, element) {
        const svg = element.querySelector('.circuit-element-icon');
        if (!svg) return;

        let text = svg.querySelector('text.meter-reading');
        if (!text) {
            // Create text element for reading
            text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('class', 'meter-reading');
            text.setAttribute('x', '20');
            text.setAttribute('y', '32');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '6');
            text.setAttribute('fill', '#2c3e50');
            text.setAttribute('font-weight', 'bold');
            svg.appendChild(text);
        }

        // Update reading
        if (comp.type === 'ammeter') {
            text.textContent = `${comp.current.toFixed(2)}A`;
        } else if (comp.type === 'voltmeter') {
            text.textContent = `${comp.voltage.toFixed(1)}V`;
        }
    }

    // Update component value display
    updateComponentDisplay(id) {
        const comp = this.components.get(id);
        if (!comp || !comp.element) return;

        let valueLabel = comp.element.querySelector('.component-value');

        // Create label if it doesn't exist
        if (!valueLabel && (comp.type === 'resistor' || comp.type === 'battery')) {
            valueLabel = document.createElement('div');
            valueLabel.className = 'component-value';
            valueLabel.style.cssText = 'position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%); font-size: 0.7rem; font-weight: bold; color: #2c3e50; white-space: nowrap;';
            comp.element.appendChild(valueLabel);
        }

        // Update label text
        if (valueLabel) {
            if (comp.type === 'resistor') {
                valueLabel.textContent = `${comp.resistance}${comp.unit}`;
            } else if (comp.type === 'battery') {
                valueLabel.textContent = `${comp.voltage}${comp.unit}`;
            }
        }
    }

    // Update wire visual (highlight when current flows)
    updateWireVisual(wireId) {
        const wire = this.wires.get(wireId);
        if (!wire || !wire.element) return;

        if (wire.current > 0) {
            wire.element.classList.add('active');
            wire.element.setAttribute('stroke', '#4caf50');
            wire.element.setAttribute('stroke-width', '4');
        } else {
            wire.element.classList.remove('active');
            wire.element.setAttribute('stroke', '#2c3e50');
            wire.element.setAttribute('stroke-width', '3');
        }
    }

    // Handle component value change
    changeComponentValue(id, property, value) {
        const comp = this.components.get(id);
        if (!comp) {
            console.error(`Component ${id} not found`);
            return;
        }

        const oldValue = comp[property];
        comp[property] = parseFloat(value) || 0;
        console.log(`Changed ${comp.type} ${property}: ${oldValue} → ${comp[property]}`);

        this.updateComponentDisplay(id);
        this.analyzeCircuit();
    }

    // Toggle switch state
    toggleSwitch(id) {
        const comp = this.components.get(id);
        if (!comp || comp.type !== 'switch') return;

        comp.closed = !comp.closed;
        console.log(`Switch ${id} is now ${comp.closed ? 'closed' : 'open'}`);
        this.analyzeCircuit();
    }
}

// Create global simulator instance
window.circuitSimulator = new CircuitSimulator();

console.log('Circuit simulator loaded');
