export class UI {
    constructor(app) {
        this.app = app;
        this.listeners = {};
        
        // Кэшируем элементы
        this.els = {
            // Сайдбар
            sidebar: document.getElementById('sidebar'),
            btnToggle: document.getElementById('btnToggleSidebar'),

            // Источники
            micBtn: document.getElementById('btnMicStart'),
            radioBtn: document.getElementById('btnStreamConnect'),
            playBtn: document.getElementById('btnPlay'),
            stopBtns: [document.getElementById('btnStop'), document.getElementById('btnStreamStop')],
            
            // Микшер
            mixGain: document.getElementById('mix-gain'),
            eqLow: document.getElementById('eq-low'),
            eqMid: document.getElementById('eq-mid'),
            eqHigh: document.getElementById('eq-high'),
            btnResetEQ: document.getElementById('btnResetEQ'),
            
            // DSP / Демодуляция
            btnExtract: document.getElementById('btnExtract'),
            btnExtractAll: document.getElementById('btnExtractAll'),
            
            // Анализ / AI
            btnMatch: document.getElementById('btnMatch'),
            btnCluster: document.getElementById('btnCluster'),
            btnInterpret: document.getElementById('btnInterpretClusters'),
            
            // Текстовые поля
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
        this.attachMixerListeners();
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
        // --- 1. Логика Сайдбара (Плавное скрытие) ---
        if (this.els.btnToggle && this.els.sidebar) {
            this.els.btnToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Чтобы клик не ушел дальше
                this.els.sidebar.classList.toggle('collapsed');
                // Принудительно вызываем resize, чтобы графики подстроились под новую ширину
                setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
            });
        }

        // --- 2. Источники ---
        this.els.playBtn?.addEventListener('click', () => this.trigger('play'));
        this.els.micBtn?.addEventListener('click', () => this.trigger('mic-start', this.els.micSelect.value));
        this.els.radioBtn?.addEventListener('click', () => this.trigger('stream-start', document.getElementById('streamUrl').value));
        
        this.els.stopBtns.forEach(b => b?.addEventListener('click', () => this.trigger('stop'))); // Единая команда стоп
        
        const fInput = document.getElementById('fileInput');
        if(fInput) fInput.addEventListener('change', (e) => this.trigger('file-load', e.target.files));

        // --- 3. DSP Кнопки (Демодуляция) ---
        this.els.btnExtract?.addEventListener('click', () => this.trigger('extract-one'));
        this.els.btnExtractAll?.addEventListener('click', () => this.trigger('extract-all'));
        
        // --- 4. AI Кнопки ---
        this.els.btnCluster?.addEventListener('click', () => this.trigger('cluster'));
        this.els.btnInterpret?.addEventListener('click', () => this.trigger('interpret'));
    }

    attachMixerListeners() {
        const update = () => {
            const settings = {
                gain: parseFloat(this.els.mixGain.value),
                low: parseFloat(this.els.eqLow.value),
                mid: parseFloat(this.els.eqMid.value),
                high: parseFloat(this.els.eqHigh.value)
            };
            
            this.els.valGain.textContent = settings.gain.toFixed(1);
            this.els.valLow.textContent = settings.low;
            this.els.valMid.textContent = settings.mid;
            this.els.valHigh.textContent = settings.high;

            this.trigger('mixer-change', settings);
        };

        [this.els.mixGain, this.els.eqLow, this.els.eqMid, this.els.eqHigh].forEach(el => {
            el.addEventListener('input', update);
        });

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

    log(msg) { 
        if(this.els.log) this.els.log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; 
    }
}
