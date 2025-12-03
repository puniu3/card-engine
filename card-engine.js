/**
 * card-engine.js
 * Core library for card positioning and animation.
 * ES Module version: Only exposes CardVisualEngine.
 */

/* --- Internal Classes & Helpers (Encapsulated) --- */

// 1. Token Class: DOM Wrapper & Animation Actor
class Token {
    constructor(element, renderCallback, stage, config) {
        this._el = element;
        this._renderCallback = renderCallback;
        this._stage = stage;
        this._config = config;

        // Cartesian coordinates and rotation state
        this._x = 0;
        this._y = 0;
        this._rotation = 0;
        
        // State flags
        this._type = null;
        this._isFlipped = false;
        this._isFlowMode = false;
    }

    get element() { return this._el; }
    get cardType() { return this._type; }
    get isFlipped() { return this._isFlipped; }

    setType(cardType) {
        this._type = cardType;
        const front = this._el.querySelector('.face-front');
        if (this._renderCallback) {
            this._renderCallback(front, cardType);
        } else {
            front.textContent = cardType;
        }
    }

    setFlipped(flipped) {
        this._isFlipped = flipped;
        this._applyTransform();
    }

    /**
     * Enable DOM flow mode (position: relative, no absolute positioning)
     */
    setFlowMode(enabled) {
        this._isFlowMode = enabled;
        if (enabled) {
            this._el.classList.add('flow-mode');
            this._x = 0;
            this._y = 0;
            this._rotation = 0;
        } else {
            this._el.classList.remove('flow-mode');
        }
        this._applyTransform();
    }

    moveToAnchor(targetEl, rotation = 0) {
        if (this._isFlowMode) return;
        const center = StageHelper.getRelativePos(targetEl, this._stage);
        const x = center.x - (this._config.cardWidth / 2);
        const y = center.y - (this._config.cardHeight / 2);
        this.moveTo(x, y, rotation);
    }

    jumpToAnchor(targetEl) {
        if (this._isFlowMode) return;
        const center = StageHelper.getRelativePos(targetEl, this._stage);
        const x = center.x - (this._config.cardWidth / 2);
        const y = center.y - (this._config.cardHeight / 2);
        this.jumpTo(x, y);
    }

    moveTo(x, y, rotation = 0) {
        if (this._isFlowMode) return;
        this._x = x;
        this._y = y;
        this._rotation = rotation;
        this._applyTransform();
    }
    
    jumpTo(x, y) {
        if (this._isFlowMode) return;
        this._el.style.transition = 'none';
        this.moveTo(x, y, 0);
        this._el.offsetHeight; // Force Reflow
        this._el.style.transition = '';
    }

    /**
     * Teleport out animation: float up and fade out (fire and forget)
     * @param {number} duration - Animation duration in ms
     * @param {Function} [onComplete] - Optional callback when done
     */
    teleportOut(duration, onComplete) {
        this._el.classList.add('teleport-out');
        if (onComplete) {
            setTimeout(onComplete, duration);
        }
    }

    /**
     * Teleport in animation: drop down and fade in (fire and forget)
     * @param {number} duration - Animation duration in ms
     * @param {Function} [onComplete] - Optional callback when done
     */
    teleportIn(duration, onComplete) {
        // Start in "pre-teleport" state
        this._el.classList.add('teleport-in-prepare');
        this._el.offsetHeight; // Force reflow
        
        // Trigger the animation
        this._el.classList.remove('teleport-in-prepare');
        this._el.classList.add('teleport-in');
        
        setTimeout(() => {
            this._el.classList.remove('teleport-in');
            if (onComplete) onComplete();
        }, duration);
    }

    /**
     * Reset teleport animation classes
     */
    resetTeleportState() {
        this._el.classList.remove('teleport-out', 'teleport-in', 'teleport-in-prepare');
    }

    _applyTransform() {
        const flipRot = this._isFlipped ? 180 : 0;
        if (this._isFlowMode) {
            this._el.style.transform = `rotateY(${flipRot}deg)`;
        } else {
            this._el.style.transform = `translate3d(${this._x}px, ${this._y}px, 0) rotate(${this._rotation}deg) rotateY(${flipRot}deg)`;
        }
    }
}

// 2. Token Pool (Internal Memory Management)
class TokenPool {
    constructor(stageElement, renderCallback, config) {
        this._stage = stageElement;
        this._pool = [];
        this._renderCallback = renderCallback;
        this._config = config;
    }

    spawn(cardType, anchorEl, initialFlipped = false) {
        let token;
        if (this._pool.length > 0) {
            token = this._pool.pop();
            token.element.style.display = 'block';
            token.setFlowMode(false);
            token.resetTeleportState();
        } else {
            token = this._createTokenElement();
        }
        
        token.setType(cardType);
        token.setFlipped(initialFlipped);
        
        if (anchorEl) {
            token.jumpToAnchor(anchorEl);
        }
        
        return token;
    }

    /**
     * Spawn a token directly into a DOM container (for flow zones)
     */
    spawnIntoContainer(cardType, containerEl, initialFlipped = false) {
        let token;
        if (this._pool.length > 0) {
            token = this._pool.pop();
            token.element.style.display = 'block';
            token.resetTeleportState();
        } else {
            token = this._createTokenElement(false);
        }
        
        containerEl.appendChild(token.element);
        token.setFlowMode(true);
        token.setType(cardType);
        token.setFlipped(initialFlipped);
        
        return token;
    }

    despawn(token) {
        token.element.style.display = 'none';
        token.setFlowMode(false);
        token.resetTeleportState();
        if (token.element.parentElement !== this._stage) {
            this._stage.appendChild(token.element);
        }
        this._pool.push(token);
    }

    _createTokenElement(appendToStage = true) {
        const el = document.createElement('div');
        el.className = 'card-token';
        el.innerHTML = `
            <div class="card-face face-front"></div>
            <div class="card-face face-back"></div>
        `;
        if (appendToStage) {
            this._stage.appendChild(el);
        }
        return new Token(el, this._renderCallback, this._stage, this._config);
    }
}

// 3. Layout Strategies
const StageHelper = {
    getRelativePos(targetEl, stageEl) {
        const stageRect = stageEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const scale = stageRect.width / stageEl.offsetWidth; 

        return {
            x: (targetRect.left - stageRect.left + targetRect.width/2) / scale,
            y: (targetRect.top - stageRect.top + targetRect.height/2) / scale
        };
    }
};

class CenterRowStrategy {
    constructor(config) {
        this._config = config;
        this.isFlowStrategy = false;
    }

    update(items, zoneEl, stageEl) {
        const center = StageHelper.getRelativePos(zoneEl, stageEl);
        const count = items.length;
        if (count === 0) return;

        const cw = this._config.cardWidth;
        const ch = this._config.cardHeight;
        const gap = 10;
        const zoneWidth = zoneEl.offsetWidth;

        let step = cw + gap;
        if (count > 1) {
            const availableSpace = zoneWidth - cw;
            const maxStep = availableSpace / (count - 1);
            step = Math.min(step, maxStep);
        }

        const totalGroupWidth = (count - 1) * step + cw;
        const startX = center.x - (totalGroupWidth / 2);
        const startY = center.y - (ch / 2);

        items.forEach((token, i) => {
            const x = startX + (i * step);
            token.moveTo(x, startY, 0);
            token.element.style.zIndex = i;
        });
    }
}

class PileStrategy {
    constructor(config, maxAngle = 15) {
        this._config = config;
        this._maxAngle = maxAngle;
        this.isFlowStrategy = false;
    }

    update(items, zoneEl, stageEl) {
        const center = StageHelper.getRelativePos(zoneEl, stageEl);
        const cw = this._config.cardWidth;
        const ch = this._config.cardHeight;

        items.forEach((token, i) => {
            const x = center.x - (cw / 2); 
            const y = center.y - (ch / 2);
            const angle = Math.sin(i * 12345) * this._maxAngle;
            token.moveTo(x, y, angle);
            token.element.style.zIndex = i;
        });
    }
}

/**
 * DomFlowStrategy: Cards are positioned by DOM flow (position: relative)
 */
class DomFlowStrategy {
    constructor(config, options = {}) {
        this._config = config;
        this._gap = options.gap ?? 8;
        this.isFlowStrategy = true;
    }

    update(items, zoneEl, stageEl) {
        items.forEach((token, i) => {
            token.setFlowMode(true);
            token.element.style.zIndex = i;
            
            if (token.element.parentElement !== zoneEl) {
                zoneEl.appendChild(token.element);
            }
        });
    }
}

// 4. Zone Wrapper
class Zone {
    constructor(element, strategy, pool, stageEl, engine) {
        this._el = element;
        this._strategy = strategy;
        this._items = []; 
        this._pool = pool;
        this._stageEl = stageEl;
        this._engine = engine;
    }

    get items() {
        return this._items;
    }

    get element() {
        return this._el;
    }

    get isFlowZone() {
        return this._strategy.isFlowStrategy === true;
    }

    add(token) {
        this._items.push(token);
        this.render();
    }

    /**
     * Add a token with teleport-in animation (fire and forget)
     * @param {Token} token
     * @param {number} teleportDuration
     * @param {Function} [onComplete]
     */
    addWithTeleport(token, teleportDuration, onComplete) {
        this._items.push(token);
        this.render();
        if (this.isFlowZone) {
            token.teleportIn(teleportDuration, onComplete);
        } else if (onComplete) {
            onComplete();
        }
    }

    removeIndices(indices) {
        indices.sort((a, b) => b - a);
        const removed = [];
        indices.forEach(idx => {
            if (this._items[idx]) {
                removed.push(this._items.splice(idx, 1)[0]);
            }
        });
        this.render();
        return removed;
    }

    removeToken(token) {
        const idx = this._items.indexOf(token);
        if (idx !== -1) {
            this._items.splice(idx, 1);
            this.render();
            return true;
        }
        return false;
    }

    clear() {
        const all = [...this._items];
        this._items = [];
        this.render();
        return all;
    }

    render() {
        this._strategy.update(this._items, this._el, this._stageEl);
    }
}

/* --- Public API (Export) --- */

// 5. Card Visual Engine
export default class CardVisualEngine {
    constructor(stageElement, config) {
        this._stageEl = stageElement;
        this._config = config;
        this._zones = []; 
        
        // Default teleport duration
        this._teleportDuration = config.teleportDuration || 300;
        
        this._pool = new TokenPool(this._stageEl, this._config.renderCard, this._config);
        
        const ro = new ResizeObserver(() => {
            this._stageEl.classList.add('no-transition');
            this.renderAll();
            void this._stageEl.offsetHeight;
            this._stageEl.classList.remove('no-transition');
        });
        
        ro.observe(this._stageEl);
    }

    /**
     * Spawn a card at an anchor position (absolute positioning)
     */
    spawn(cardType, anchorEl, initialFlipped = false) {
        return this._pool.spawn(cardType, anchorEl, initialFlipped);
    }

    /**
     * Spawn a card directly into a flow zone container
     */
    spawnIntoFlow(cardType, containerEl, initialFlipped = false) {
        return this._pool.spawnIntoContainer(cardType, containerEl, initialFlipped);
    }

    /**
     * Remove/recycle a card
     */
    despawn(token) {
        this._pool.despawn(token);
    }

    createZone(zoneElement, strategyType, options = {}) {
        let strategy;
        if (strategyType === 'row') {
            strategy = new CenterRowStrategy(this._config);
        } else if (strategyType === 'pile') {
            strategy = new PileStrategy(this._config, options.angle || 15);
        } else if (strategyType === 'flow') {
            strategy = new DomFlowStrategy(this._config, options);
        }

        const zone = new Zone(zoneElement, strategy, this._pool, this._stageEl, this);
        this._zones.push(zone);
        return zone;
    }

    /**
     * Transfer a card between zones with appropriate animation (fire and forget).
     * If either zone is a flow zone, uses teleport animation.
     * 
     * @param {Token} token - The token to transfer
     * @param {Zone} fromZone - Source zone
     * @param {Zone} toZone - Destination zone
     * @param {Object} [options] - Animation options
     * @param {Function} [options.onComplete] - Callback with new token when transfer completes
     * @returns {Token|null} For non-teleport: the same token. For teleport: null (new token via callback)
     */
    transferCard(token, fromZone, toZone, options = {}) {
        const {
            teleportDuration = this._teleportDuration,
            flipOnTransfer = false,
            onComplete
        } = options;

        const needsTeleport = fromZone.isFlowZone || toZone.isFlowZone;

        if (needsTeleport) {
            const cardType = token.cardType;
            const wasFlipped = token.isFlipped;
            const newFlipped = flipOnTransfer ? !wasFlipped : wasFlipped;

            // Remove from source
            fromZone.removeToken(token);

            // Animate out, then despawn and spawn new
            token.teleportOut(teleportDuration, () => {
                this.despawn(token);

                // Create new token in destination
                let newToken;
                if (toZone.isFlowZone) {
                    newToken = this.spawnIntoFlow(cardType, toZone.element, newFlipped);
                } else {
                    newToken = this.spawn(cardType, toZone.element, newFlipped);
                }

                // Add to destination with teleport in
                toZone.addWithTeleport(newToken, teleportDuration, () => {
                    if (onComplete) onComplete(newToken);
                });
            });

            return null;
        } else {
            // Normal transfer
            fromZone.removeToken(token);
            if (flipOnTransfer) {
                token.setFlipped(!token.isFlipped);
            }
            toZone.add(token);
            if (onComplete) onComplete(token);
            return token;
        }
    }

    /**
     * Draw a card from a source to a zone (fire and forget)
     * @param {string} cardType
     * @param {HTMLElement} sourceAnchorEl
     * @param {Zone} toZone
     * @param {Object} [options]
     * @param {Function} [options.onComplete] - Callback with the new token
     * @returns {Token} The spawned token
     */
    drawCard(cardType, sourceAnchorEl, toZone, options = {}) {
        const {
            initialFlipped = false,
            teleportDuration = this._teleportDuration,
            onComplete
        } = options;

        let token;
        if (toZone.isFlowZone) {
            token = this.spawnIntoFlow(cardType, toZone.element, initialFlipped);
            toZone.addWithTeleport(token, teleportDuration, () => {
                if (onComplete) onComplete(token);
            });
        } else {
            token = this.spawn(cardType, sourceAnchorEl, initialFlipped);
            toZone.add(token);
            if (onComplete) onComplete(token);
        }
        return token;
    }

    /**
     * Discard a card from a zone (fire and forget)
     * @param {Token} token
     * @param {Zone} fromZone
     * @param {HTMLElement} [destAnchorEl] - Destination for non-flow zones
     * @param {Object} [options]
     * @param {Function} [options.onComplete] - Callback when done
     */
    discardCard(token, fromZone, destAnchorEl, options = {}) {
        const {
            teleportDuration = this._teleportDuration,
            moveDuration = 500,
            despawnAfter = true,
            flipOnDiscard = false,
            onComplete
        } = options;

        fromZone.removeToken(token);

        if (fromZone.isFlowZone) {
            // Teleport out
            token.teleportOut(teleportDuration, () => {
                if (despawnAfter) {
                    this.despawn(token);
                }
                if (onComplete) onComplete(token);
            });
        } else {
            // Normal move
            if (flipOnDiscard) {
                token.setFlipped(!token.isFlipped);
            }
            if (destAnchorEl) {
                token.moveToAnchor(destAnchorEl);
            }
            if (despawnAfter) {
                setTimeout(() => {
                    this.despawn(token);
                    if (onComplete) onComplete(token);
                }, moveDuration);
            } else if (onComplete) {
                setTimeout(() => onComplete(token), moveDuration);
            }
        }
    }

    renderAll() {
        this._zones.forEach(z => z.render());
    }
}