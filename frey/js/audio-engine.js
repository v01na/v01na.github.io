// Вспомогательный класс для "канальной линейки"
class ChannelStrip {
    constructor(ctx, analyser, destination) {
        this.ctx = ctx;
        this.analyser = analyser;
        this.destination = destination;

        // Эквалайзер (3 полосы)
        this.lowShelf = ctx.createBiquadFilter(); this.lowShelf.type = 'lowshelf'; this.lowShelf.frequency.value = 150;
        this.midPeak = ctx.createBiquadFilter(); this.midPeak.type = 'peaking'; this.midPeak.frequency.value = 1000;
        this.highShelf = ctx.createBiquadFilter(); this.highShelf.type = 'highshelf'; this.highShelf.frequency.value = 8000;

        // Громкость
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1.0;

        // Цепь: Input -> Low -> Mid -> High -> Gain
        this.lowShelf.connect(this.midPeak);
        this.midPeak.connect(this.highShelf);
        this.highShelf.connect(this.gainNode);
        
        // Output маршрутизация: Gain подключается к Анализатору ВСЕГДА
        this.gainNode.connect(this.analyser);
        
        // Output маршрутизация: Gain подключается к Колонкам, ЕСЛИ destination передан
        if (this.destination) {
            this.gainNode.connect(this.destination);
        }

        this.inputPoint = this.lowShelf;
        this.currentSource = null;
    }

    connectInput(sourceNode) {
        // Если что-то уже играло на этом канале, отключаем
        if (this.currentSource) {
            try { this.currentSource.disconnect(); } catch(e){}
        }
        this.currentSource = sourceNode;
        sourceNode.connect(this.inputPoint);
    }
    
    disconnect() {
        if (this.currentSource) {
            try { this.currentSource.disconnect(); } catch(e){}
            this.currentSource = null;
        }
    }

    setEQ(low, mid, high) {
        this.lowShelf.gain.value = low;
        this.midPeak.gain.value = mid;
        this.highShelf.gain.value = high;
    }
    setVolume(val) {
        this.gainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
}

export class AudioEngine {
    constructor(visualizer, dsp) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.viz = visualizer;
        this.dsp = dsp;

        // Анализатор (общая шина для визуализации и DSP)
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.2;

        this.byteData = new Uint8Array(this.analyser.frequencyBinCount);
        this.floatData = new Float32Array(this.analyser.fftSize);

        // --- СОЗДАНИЕ КАНАЛОВ ---
        // Файл и Радио идут в колонки (this.ctx.destination)
        // Микрофон НЕ идет в колонки (null), чтобы избежать фидбека
        this.channels = {
            file: new ChannelStrip(this.ctx, this.analyser, this.ctx.destination),
            radio: new ChannelStrip(this.ctx, this.analyser, this.ctx.destination),
            mic: new ChannelStrip(this.ctx, this.analyser, null) 
        };

        this.currentBuffer = null;
        this.isLive = false;
        this.animationId = null;
    }

    // --- ОБНОВЛЕНИЕ МИКШЕРА ---
    updateMixer(settings) {
        // Применяем настройки ко всем каналам (можно сделать раздельно в будущем)
        Object.values(this.channels).forEach(ch => {
            ch.setVolume(settings.gain);
            ch.setEQ(settings.low, settings.mid, settings.high);
        });
    }

    // --- 1. ФАЙЛЫ ---
    async loadFile(file) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        const ab = await file.arrayBuffer();
        this.currentBuffer = await this.ctx.decodeAudioData(ab);
        return this.currentBuffer;
    }

    playCurrentBuffer() {
        if (!this.currentBuffer) return alert('Файл не загружен');
        
        // НЕ останавливаем всё (this.stop()), останавливаем только предыдущий файл
        this.channels.file.disconnect();

        const source = this.ctx.createBufferSource();
        source.buffer = this.currentBuffer;
        
        this.channels.file.connectInput(source);
        
        source.onended = () => { console.log('File ended'); };
        source.start(0);

        this.startEngineLoop();
        console.log('[Audio] Файл запущен');
    }
    
    stopFile() {
        this.channels.file.disconnect();
    }

    // --- 2. РАДИО ---
    async startStream(url) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        
        // Не стопаем всё, только предыдущее радио
        this.channels.radio.disconnect();

        const audioEl = document.getElementById('streamPlayer');
        audioEl.src = url;
        audioEl.crossOrigin = "anonymous";

        try {
            await audioEl.play();
            // Создаем MediaElementSource (осторожно, его можно создать только раз для одного тега)
            if (!this._streamNode) {
                 this._streamNode = this.ctx.createMediaElementSource(audioEl);
            }
            
            this.channels.radio.connectInput(this._streamNode);
            
            this.startEngineLoop();
            console.log('[Audio] Радио запущено');
        } catch (e) {
            alert('Ошибка потока: ' + e.message);
        }
    }
    
    stopRadio() {
        const audioEl = document.getElementById('streamPlayer');
        audioEl.pause();
        this.channels.radio.disconnect();
    }

    // --- 3. МИКРОФОН ---
    async startMicrophone(deviceId) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        
        this.channels.mic.disconnect();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false }
            });
            const source = this.ctx.createMediaStreamSource(stream);
            
            this.channels.mic.connectInput(source);
            
            this.startEngineLoop();
            console.log('[Audio] Микрофон запущен');
        } catch (e) { alert('Ошибка микр: ' + e.message); }
    }
    
    stopMic() {
        this.channels.mic.disconnect();
        // В идеале нужно стопить треки стрима, но source node у нас локальный в connectInput
        // Упрощение: просто отключаем от микшера
    }

    // --- ОБЩЕЕ ---
    
    stop() {
        // Полная остановка всего
        this.stopFile();
        this.stopRadio();
        this.stopMic();
        this.isLive = false;
        cancelAnimationFrame(this.animationId);
    }

    startEngineLoop() {
        if (!this.isLive) {
            this.isLive = true;
            this.loop();
        }
    }

    loop() {
        if (!this.isLive) return;

        // Визуализация
        if (this.viz) {
            this.analyser.getByteTimeDomainData(this.byteData);
            this.viz.drawWaveform(this.byteData);
        }

        // DSP
        if (this.dsp) {
            this.analyser.getFloatTimeDomainData(this.floatData);
            this.dsp.processRealTime(this.floatData, this.ctx.sampleRate);
        }

        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
