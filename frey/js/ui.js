export class UI {
    constructor(app) {
        this.app = app;
        this.listeners = {};
        
        // Кэшируем элементы
        this.els = {
            micBtn: document.getElementById('btnMicStart'),
            radioBtn: document.getElementById('btnStreamConnect'),
            radioStop: document.getElementById('btnStreamStop'),
            liveIndicator: document.getElementById('liveIndicator'),
            realTimeStatus: document.getElementById('realTimeStatus'),
            micSelect: document.getElementById('micSelect'),
            log: document.getElementById('log')
        };

        this.initMicList();
        this.attachListeners();
    }

    on(event, callback) {
        this.listeners[event] = callback;
    }

    trigger(event, data) {
        if (this.listeners[event]) this.listeners[event](data);
    }

    async initMicList() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            const select = this.els.micSelect;
            select.innerHTML = '';
            mics.forEach(mic => {
                const opt = document.createElement('option');
                opt.value = mic.deviceId;
                opt.text = mic.label || `Microphone ${select.length + 1}`;
                select.appendChild(opt);
            });
        } catch (e) {
            console.warn('Mic enumeration failed', e);
        }
    }

    attachListeners() {
        // Микрофон
        this.els.micBtn.addEventListener('click', () => {
            const deviceId = this.els.micSelect.value;
            this.trigger('mic-start', deviceId);
        });

        // Радио
        this.els.radioBtn.addEventListener('click', () => {
            const url = document.getElementById('streamUrl').value;
            if(url) this.trigger('stream-start', url);
        });

        // Остановка
        this.els.radioStop.addEventListener('click', () => this.trigger('stop-live'));
    }

    setLiveState(isActive) {
        if (isActive) {
            this.els.liveIndicator.classList.remove('hidden');
            this.els.realTimeStatus.classList.remove('hidden');
        } else {
            this.els.liveIndicator.classList.add('hidden');
            this.els.realTimeStatus.classList.add('hidden');
        }
    }

    log(msg) {
        this.els.log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    }
}
