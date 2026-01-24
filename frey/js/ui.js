export class UI {
    constructor(app) {
        this.app = app;
        this.listeners = {};
        
        this.els = {
            sidebar: document.getElementById('sidebar'),
            btnToggle: document.getElementById('btnToggleSidebar'),
            
            micBtn: document.getElementById('btnMicStart'),
            radioBtn: document.getElementById('btnStreamConnect'),
            playBtn: document.getElementById('btnPlay'),
            stopBtns: [document.getElementById('btnStop'), document.getElementById('btnStreamStop')],
            
            mixGain: document.getElementById('mix-gain'),
            eqLow: document.getElementById('eq-low'),
            eqMid: document.getElementById('eq-mid'),
            eqHigh: document.getElementById('eq-high'),
            btnResetEQ: document.getElementById('btnResetEQ'),
            
            btnExtract: document.getElementById('btnExtract'),
            btnExtractAll: document.getElementById('btnExtractAll'),
            btnMatch: document.getElementById('btnMatch'),
            btnCluster: document.getElementById('btnCluster'), // Кнопка кластеров
            btnInterpret: document.getElementById('btnInterpretClusters'),
            
            valGain: document.getElementById('val-gain'),
            micSelect: document.getElementById('micSelect'),
            liveInd: document.getElementById('liveIndicator'),
            log: document.getElementById('log'),
            results: document.getElementById('results')
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
                opt.text = m.label || `Микрофон ${sel.length+1}`;
                sel.appendChild(opt);
            });
        } catch(e){}
    }

    attachListeners() {
        // --- Сайдбар ---
        // Используем onclick напрямую для надежности
        if (this.els.btnToggle) {
            this.els.btnToggle.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.els.sidebar) {
                    this.els.sidebar.classList.toggle('collapsed');
                    // Принудительно обновляем ширину графиков
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 350);
                }
            };
        }

        // --- Источники ---
        this.els.playBtn?.addEventListener('click', () => this.trigger('play'));
        this.els.stopBtns.forEach(b => b?.addEventListener('click', () => this.trigger('stop')));
        
        this.els.micBtn?.addEventListener('click', () => this.trigger('mic-start', this.els.micSelect.value));
        this.els.radioBtn?.addEventListener('click', () => this.trigger('stream-start', document.getElementById('streamUrl').value));
        
        const fInput = document.getElementById('fileInput');
        if(fInput) fInput.addEventListener('change', (e) => this.trigger('file-load', e.target.files));

        // --- DSP Кнопки ---
        this.els.btnExtract?.addEventListener('click', () => this.trigger('extract-one'));
        this.els.btnExtractAll?.addEventListener('click', () => this.trigger('extract-all'));
        
        // --- AI Кнопки ---
        this.els.btnMatch?.addEventListener('click', () => this.trigger('match-dtw'));
        
        // Кнопка Кластеров (Исправлено)
        this.els.btnCluster?.addEventListener('click', () => {
            console.log('[UI] Cluster clicked');
            this.trigger('run-cluster');
        });
        
        this.els.btnInterpret?.addEventListener('click', () => this.trigger('interpret'));
    }

    attachMixerListeners() {
        const update = () => {
            const s = {
                gain: parseFloat(this.els.mixGain.value),
                low: parseFloat(this.els.eqLow.value),
                mid: parseFloat(this.els.eqMid.value),
                high: parseFloat(this.els.eqHigh.value)
            };
            document.getElementById('val-gain').textContent = s.gain.toFixed(1);
            document.getElementById('val-low').textContent = s.low;
            document.getElementById('val-mid').textContent = s.mid;
            document.getElementById('val-high').textContent = s.high;
            this.trigger('mixer-change', s);
        };
        
        [this.els.mixGain, this.els.eqLow, this.els.eqMid, this.els.eqHigh].forEach(el => {
            if(el) el.addEventListener('input', update);
        });

        if(this.els.btnResetEQ) {
            this.els.btnResetEQ.addEventListener('click', () => {
                this.els.mixGain.value = 1; 
                this.els.eqLow.value = 0; 
                this.els.eqMid.value = 0; 
                this.els.eqHigh.value = 0; 
                update();
            });
        }
    }

    setLiveState(isActive) {
        if(this.els.liveInd) {
            if(isActive) this.els.liveInd.classList.remove('hidden');
            else this.els.liveInd.classList.add('hidden');
        }
    }

    log(msg) { 
        if(this.els.log) this.els.log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; 
    }
    
    printResult(text) { 
        if(this.els.results) this.els.results.textContent = text; 
    }
}
