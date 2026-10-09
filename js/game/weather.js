/* ==================================
   MÉTÉO DE PARTIE - FOR2D ROYAL
   Calendrier normal : changements à 150 s, 300 s et 450 s. En 1v1, changement toutes les 30 s.
   L'hôte décide, les autres clients se calent sur le type + la séquence.
   ================================== */

export const WEATHER_TYPES = Object.freeze({
    clear: { id: 'clear', name: 'Ciel dégagé', title: 'Le ciel se dégage', icon: '☀' },
    night: { id: 'night', name: 'Nuit', title: 'La nuit tombe', icon: '☾' },
    storm: { id: 'storm', name: 'Tempête', title: 'Une tempête approche', icon: '⚡' },
    fog: { id: 'fog', name: 'Brouillard', title: 'Le brouillard se lève', icon: '≋' }
});

// Une météo change toutes les 2 min 30 s pendant une partie de dix minutes.
export const WEATHER_CHANGE_TIMES = Object.freeze([150, 300, 450]);
// En 1v1, le rythme est accéléré à un changement toutes les 30 secondes.
export const WEATHER_CHANGE_TIMES_1V1 = Object.freeze(
    Array.from({ length: 19 }, (_, index) => (index + 1) * 30)
);
const WEATHER_POOL = ['night', 'storm', 'fog'];

function weatherFrom(value) {
    const id = String(value || '').toLowerCase();
    return WEATHER_TYPES[id] ? id : null;
}

function seededValue(seed, index) {
    let x = ((Number(seed) >>> 0) ^ (index * 0x45d9f3b)) >>> 0;
    x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
    x = Math.imul(x ^ (x >>> 13), 0x45d9f3b);
    return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export class Weather {
    constructor({ seed = 1, isHost = () => false, send = () => {}, onChange = () => {}, changeTimes = WEATHER_CHANGE_TIMES } = {}) {
        this.seed = Number(seed) || 1;
        this.changeTimes = Array.isArray(changeTimes) && changeTimes.length ? changeTimes : WEATHER_CHANGE_TIMES;
        this.isHost = isHost;
        this.send = send;
        this.onChange = onChange;
        this.type = 'clear';
        this.seq = 0;
        this.changedAt = 0;
        this.scheduleIndex = 0;
        this.lastTime = 0;
    }

    nextType(index) {
        const current = this.type;
        let pick = WEATHER_POOL[Math.floor(seededValue(this.seed, index + 1) * WEATHER_POOL.length)];
        if (pick === current) pick = WEATHER_POOL[(WEATHER_POOL.indexOf(pick) + 1) % WEATHER_POOL.length];
        return pick;
    }

    update(time) {
        if (!Number.isFinite(time)) return;
        this.lastTime = Math.max(this.lastTime, time);
        if (!this.isHost()) return;
        while (this.scheduleIndex < this.changeTimes.length && time >= this.changeTimes[this.scheduleIndex]) {
            const index = this.scheduleIndex++;
            this.setType(this.nextType(index), { at: this.changeTimes[index], scheduled: true, announce: true, send: true });
        }
    }

    setType(value, { at = this.lastTime, scheduled = false, announce = true, send = false, seq = null, force = false } = {}) {
        const type = weatherFrom(value);
        if (!type || (!force && type === this.type && !scheduled)) return false;
        this.type = type;
        this.changedAt = Number.isFinite(at) ? Math.max(0, at) : this.lastTime;
        this.seq = Number.isInteger(seq) ? Math.max(this.seq, seq) : this.seq + 1;
        if (announce) this.onChange(type, { scheduled, manual: !scheduled, at: this.changedAt, seq: this.seq });
        if (send && this.isHost()) {
            this.send({ type: 'weather_change', weather: type, seq: this.seq, at: this.changedAt, scheduled: true });
        }
        return true;
    }

    applyMessage(message) {
        const type = weatherFrom(message?.weather);
        if (!type) return false;
        const manual = message.manual === true;
        const seq = Number.isInteger(message.seq) ? message.seq : this.seq + 1;
        if (!manual && seq <= this.seq && type === this.type) return false;
        const changed = this.setType(type, {
            at: Number(message.at) || this.lastTime,
            scheduled: message.scheduled === true && !manual,
            announce: true,
            seq,
            force: manual
        });
        if (message.scheduled === true) {
            while (this.scheduleIndex < this.changeTimes.length && this.changeTimes[this.scheduleIndex] <= this.changedAt) this.scheduleIndex++;
        }
        return changed;
    }

    syncTo(type, seq, at) {
        const id = weatherFrom(type);
        if (!id) return false;
        const n = Number.isInteger(seq) ? seq : this.seq;
        if (n < this.seq || (n === this.seq && id === this.type)) return false;
        return this.setType(id, {
            at: Number(at) || this.lastTime,
            scheduled: true,
            announce: false,
            seq: n,
            force: true
        });
    }

    state() {
        return { type: this.type, seq: this.seq, changedAt: this.changedAt };
    }
}
