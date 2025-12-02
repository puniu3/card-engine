/**
 * card-engine.js
 * Core library for card positioning and animation.
 * ES Module version: Only exposes CardVisualEngine.
 */

/* --- 内部クラス・ヘルパー (隠蔽) --- */

// 1. Token Class: DOM Wrapper & Animation Actor
class Token {
    constructor(element, renderCallback, stage, config) {
        this.el = element;
        this.type = null;
        this.isFlipped = false;
        this.renderCallback = renderCallback;
        this.stage = stage;
        this.config = config;
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
    }

    setType(cardType) {
        this.type = cardType;
        const front = this.el.querySelector('.face-front');
        if (this.renderCallback) {
            this.renderCallback(front, cardType);
        } else {
            front.textContent = cardType;
        }
    }

    setFlipped(flipped) {
        this.isFlipped = flipped;
        this.applyTransform();
    }

    moveToAnchor(targetEl, rotation = 0) {
        const center = StageHelper.getRelativePos(targetEl, this.stage);
        const x = center.x - (this.config.cardWidth / 2);
        const y = center.y - (this.config.cardHeight / 2);
        this.moveTo(x, y, rotation);
    }

    jumpToAnchor(targetEl) {
        const center = StageHelper.getRelativePos(targetEl, this.stage);
        const x = center.x - (this.config.cardWidth / 2);
        const y = center.y - (this.config.cardHeight / 2);
        this.jumpTo(x, y);
    }

    moveTo(x, y, rotation = 0) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.applyTransform();
    }
    
    jumpTo(x, y) {
        this.el.style.transition = 'none';
        this.moveTo(x, y, 0);
        this.el.offsetHeight; // Force Reflow
        this.el.style.transition = '';
    }

    applyTransform() {
        const flipRot = this.isFlipped ? 180 : 0;
        this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(${this.rotation}deg) rotateY(${flipRot}deg)`;
    }
}

// 2. Token Pool
class TokenPool {
    constructor(stageElement, renderCallback, config) {
        this.stage = stageElement;
        this.pool = [];
        this.renderCallback = renderCallback;
        this.config = config;
    }

    spawn(cardType, anchorEl, initialFlipped = false) {
        let token;
        if (this.pool.length > 0) {
            token = this.pool.pop();
            token.el.style.display = 'block';
        } else {
            token = this.createTokenElement();
        }
        
        token.setType(cardType);
        token.setFlipped(initialFlipped);
        
        if (anchorEl) {
            token.jumpToAnchor(anchorEl);
        }
        
        return token;
    }

    despawn(token) {
        token.el.style.display = 'none';
        this.pool.push(token);
    }

    createTokenElement() {
        const el = document.createElement('div');
        el.className = 'card-token';
        el.innerHTML = `
            <div class="card-face face-front"></div>
            <div class="card-face face-back"></div>
        `;
        this.stage.appendChild(el);
        return new Token(el, this.renderCallback, this.stage, this.config);
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
        this.config = config;
    }

    update(items, zoneEl, stageEl) {
        const center = StageHelper.getRelativePos(zoneEl, stageEl);
        const count = items.length;
        if (count === 0) return;

        const cw = this.config.cardWidth;
        const ch = this.config.cardHeight;
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
            token.el.style.zIndex = i;
        });
    }
}

class PileStrategy {
    constructor(config, maxAngle = 15) {
        this.config = config;
        this.maxAngle = maxAngle;
    }

    update(items, zoneEl, stageEl) {
        const center = StageHelper.getRelativePos(zoneEl, stageEl);
        const cw = this.config.cardWidth;
        const ch = this.config.cardHeight;

        items.forEach((token, i) => {
            const x = center.x - (cw / 2); 
            const y = center.y - (ch / 2);
            const angle = Math.sin(i * 12345) * this.maxAngle;
            token.moveTo(x, y, angle);
            token.el.style.zIndex = i;
        });
    }
}

// 4. Zone Wrapper
class Zone {
    constructor(element, strategy, pool, stageEl) {
        this.el = element;
        this.strategy = strategy;
        this.items = []; 
        this.pool = pool;
        this.stageEl = stageEl;
    }

    add(token) {
        this.items.push(token);
        this.render();
    }

    removeIndices(indices) {
        indices.sort((a, b) => b - a);
        const removed = [];
        indices.forEach(idx => {
            if (this.items[idx]) {
                removed.push(this.items.splice(idx, 1)[0]);
            }
        });
        this.render();
        return removed;
    }

    clear() {
        const all = [...this.items];
        this.items = [];
        this.render();
        return all;
    }

    render() {
        this.strategy.update(this.items, this.el, this.stageEl);
    }
}

/* --- 公開 API (Export) --- */

// 5. Card Visual Engine
export default class CardVisualEngine {
    constructor(stageElement, config) {
        this.stageEl = stageElement;
        this.config = config;
        
        // Internal instances are created here, hidden from the user
        this.pool = new TokenPool(this.stageEl, this.config.renderCard, this.config);
        this.zones = []; 
        
        const ro = new ResizeObserver(() => {
            this.stageEl.classList.add('no-transition');
            this.renderAll();
            void this.stageEl.offsetHeight;
            this.stageEl.classList.remove('no-transition');
        });
        
        ro.observe(this.stageEl);
    }

    createZone(zoneElement, strategyType, options = {}) {
        let strategy;
        if (strategyType === 'row') {
            strategy = new CenterRowStrategy(this.config);
        } else if (strategyType === 'pile') {
            strategy = new PileStrategy(this.config, options.angle || 15);
        }

        // Returns a Zone instance, but the Class itself is not exported
        const zone = new Zone(zoneElement, strategy, this.pool, this.stageEl);
        this.zones.push(zone);
        return zone;
    }

    renderAll() {
        this.zones.forEach(z => z.render());
    }
}
