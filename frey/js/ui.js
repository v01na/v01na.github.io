export class UI {
    constructor(app) {
        this.app = app;
        this.listeners = {};
        
        // Кэшируем основные элементы DOM
        this.els = {
            micBtn: document.getElementById('btnMicStart'),
            radioBtn: document.getElementById('btnStreamConnect'),
            radioStop: document.getElementById('btnStreamStop'),
            liveIndicator: document.getElementById('liveIndicator'),
            realTimeStatus: document.getElementById('realTimeStatus'),
            micSelect: document.getElementById('micSelect'),
            log: document.getElementById('log'),
            fileInput: document.getElementById('fileInput'),
            streamUrl: document.getElementById('streamUrl'),
            
            // Плеер файлов
            btnPlay: document.getElementById('btnPlay'),
            btnStop: document.getElementById('btnStop'),
            sampleSelect: document.getElementById('sampleSelect'),
            sampleInfo: document.getElementById('sampleInfo')
        };

        this.initMicList();
        this.attachListeners();
    }

    // Подписка на события
    on(event, callback) {
        this.listeners[event] = callback;
    }

    // Вызов события
    trigger(event, data) {
        if (this.listeners[event]) {
            this.listeners[event](data);
        }
    }

    // Заполнение списка микрофонов
    async initMicList() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
            console.warn('MediaDevices API not supported');
            return;
        }
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput');
            const select = this.els.micSelect;
            if(select) {
                select.innerHTML = '';
                if(mics.length === 0) {
                     const opt = document.createElement('option');
                     opt.text = "Microphone not found";
                     select.appendChild(opt);
                }
                mics.forEach(mic => {
                    const opt = document.createElement('option');
                    opt.value = mic.deviceId;
                    opt.text = mic.label || `Microphone ${select.length + 1}`;
                    select.appendChild(opt);
                });
            }
        } catch (e) {
            console.warn('Mic enumeration failed', e);
        }
    }

    attachListeners() {
        // 1. Микрофон
        if (this.els.micBtn) {
            this.els.micBtn.addEventListener('click', () => {
                const deviceId = this.els.micSelect.value;
                this.trigger('mic-start', deviceId);
            });
        }

        // 2. Радио
        if (this.els.radioBtn) {
            this.els.radioBtn.addEventListener('click', () => {
                const url = this.els.streamUrl.value;
                if(url) this.trigger('stream-start', url);
                else alert('Please enter Stream URL');
            });
        }

        // Кнопка Стоп для радио
        if (this.els.radioStop) {
            this.els.radioStop.addEventListener('click', () => this.trigger('stop-live'));
        }

        // 3. Загрузка файлов
        if (this.els.fileInput) {
            this.els.fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.trigger('file-load', e.target.files);
                }
            });
        }

        // 4. Плеер файлов
        if (this.els.btnPlay) {
            this.els.btnPlay.addEventListener('click', () => this.trigger('play'));
        }
        if (this.els.btnStop) {
            this.els.btnStop.addEventListener('click', () => this.trigger('stop'));
        }
    }

    // Переключение индикаторов LIVE
    setLiveState(isActive) {
        if (isActive) {
            this.els.liveIndicator?.classList.remove('hidden');
            this.els.realTimeStatus?.classList.remove('hidden');
            this.log('Live analysis started.');
        } else {
            this.els.liveIndicator?.classList.add('hidden');
            this.els.realTimeStatus?.classList.add('hidden');
            this.log('Live analysis stopped.');
        }
    }

    // Логирование в UI
    log(msg) {
        if (this.els.log) {
            this.els.log.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
        }
        console.log(`[UI] ${msg}`);
    }
}
