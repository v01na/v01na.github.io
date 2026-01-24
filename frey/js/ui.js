export class UI {
    constructor(app) {
        this.app = app;
        this.listeners = {};
        
        // Элементы
        this.els = {
            micBtn: document.getElementById('btnMicStart'),
            radioBtn: document.getElementById('btnStreamConnect'),
            playBtn: document.getElementById('btnPlay'),
            stopBtns: [document.getElementById('btnStop'), document.getElementById('btnStreamStop')],
            
            // Mixer
            mixGain: document.getElementById('mix-gain'),
            eqLow: document.getElementById('eq-low'),
            eqMid: document.getElementById('eq-mid'),
            eqHigh: document.getElementById('eq-high'),
            btnResetEQ: document.getElementById('btnResetEQ'),
            
            valGain: document.getElementById('val-gain'),
            valLow: document.getElementById('val-low'),
            valMid: document.getElementById('val-mid'),
            valHigh: document.getElementById('val-high'),
            
            log: document.getElementById('log'),
            micSelect: document.getElementById('micSelect'),
            liveInd: document.getElementById('liveIndicator')
        };

        this.initMicList();
        this.attachListeners();
        this.attachMixerListeners(); // <--- New
    }

    on(event, callback) { this.listeners[event] = callback; }
    trigger(event, data) { if (this.listeners[event]) this.listeners[event](data); }

    async initMicList() {
        try {
            const devs = await navigator.mediaDevices.enumerateDevices();
            const mics = devs.filter(d => d.kind === 'audioinput');
            const sel = this.els.micSelect;
            sel.innerHTML = '';
            mics.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.deviceId;
                opt.text = m.label || `Mic ${sel.length+1}`;
                sel.appendChild(opt);
            });
        } catch(e){}
    }

    attachListeners() {
        // ... старые слушатели (Play, Stop, Mic, Radio, File) ...
        // Я их сократил для краткости, они должны быть такими же, как раньше
        this.els.playBtn?.addEventListener('click', () => this.trigger('play'));
        this.els.micBtn?.addEventListener('click', () => this.trigger('mic-start', this.els.micSelect.value));
        this.els.radioBtn?.addEventListener('click', () => this.trigger('stream-start', document.getElementById('streamUrl').value));
        
        this.els.stopBtns.forEach(b => b?.addEventListener('click', () => this.trigger('stop-live')));
        
        const fInput = document.getElementById('fileInput');
        if(fInput) fInput.addEventListener('change', (e) => this.trigger('file-load', e.target.files));
    }

    // НОВЫЙ МЕТОД ДЛЯ МИКШЕРА
    attachMixerListeners() {
        const update = () => {
            const settings = {
                gain: parseFloat(this.els.mixGain.value),
                low: parseFloat(this.els.eqLow.value),
                mid: parseFloat(this.els.eqMid.value),
                high: parseFloat(this.els.eqHigh.value)
            };
            
            // Обновляем текст
            this.els.valGain.textContent = settings.gain.toFixed(1);
            this.els.valLow.textContent = (settings.low > 0 ? '+' : '') + settings.low + 'dB';
            this.els.valMid.textContent = (settings.mid > 0 ? '+' : '') + settings.mid + 'dB';
            this.els.valHigh.textContent = (settings.high > 0 ? '+' : '') + settings.high + 'dB';

            // Отправляем в Main
            this.trigger('mixer-change', settings);
        };

        // Слушаем Input (реальное время)
        [this.els.mixGain, this.els.eqLow, this.els.eqMid, this.els.eqHigh].forEach(el => {
            el.addEventListener('input', update);
        });

        // Кнопка Reset
        this.els.btnResetEQ.addEventListener('click', () => {
            this.els.mixGain.value = 1;
            this.els.eqLow.value = 0;
            this.els.eqMid.value = 0;
            this.els.eqHigh.value = 0;
            update();
        });
    }

    setLiveState(isActive) {
        if(isActive) this.els.liveInd.classList.remove('hidden');
        else this.els.liveInd.classList.add('hidden');
    }

    log(msg) { this.els.log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; }
}
