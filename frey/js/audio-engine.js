// Вспомогательный класс для "канальной линейки"
class ChannelStrip {
    constructor(ctx, analyser, destination) {
        this.ctx = ctx;
        this.analyser = analyser;     // Общая шина анализа
        this.destination = destination; // Выход (колонки) - может быть null

        // --- EQ Section ---
        this.lowShelf = ctx.createBiquadFilter();
        this.lowShelf.type = 'lowshelf';
        this.lowShelf.frequency.value = 150; 

        this.midPeak = ctx.createBiquadFilter();
        this.midPeak.type = 'peaking';
        this.midPeak.frequency.value = 1000;
        this.midPeak.Q.value = 1;

        this.highShelf = ctx.createBiquadFilter();
        this.highShelf.type = 'highshelf';
        this.highShelf.frequency.value = 8000;

        // --- Gain Section ---
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1.0;

        // Цепочка: Input -> Low -> Mid -> High -> Gain
        this.lowShelf.connect(this.midPeak);
        this.midPeak.connect(this.highShelf);
        this.highShelf.connect(this.gainNode);
        
        // --- Output Routing ---
        // 1. Всегда отправляем в Анализатор
        this.gainNode.connect(this.analyser);
        
        // 2. Отправляем в Колонки, только если это не микрофон
        if (this.destination) {
            this.gainNode.connect(this.destination);
        }

        // Входная точка
        this.inputPoint = this.lowShelf;
        this.currentSource = null;
    }

    connectInput(sourceNode) {
        // Отключаем старый источник, если был
        this.disconnect();
        
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
        // Значения в dB
        this.lowShelf.gain.value = low;
        this.midPeak.gain.value = mid;
        this.highShelf.gain.value = high;
    }

    setVolume(val) {
        // Плавное изменение громкости (защита от щелчков)
        this.gainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
}

export class AudioEngine {
    constructor(visualizer, dsp) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.viz = visualizer;
        this.dsp = dsp;

        // Мастер-анализатор
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.2;

        this.byteData = new Uint8Array(this.analyser.frequencyBinCount);
        this.floatData = new Float32Array(this.analyser.fftSize);

        // --- Каналы Микшера ---
        this.channels = {
            // Файл и Радио слышно в колонках
            file: new ChannelStrip(this.ctx, this.analyser, this.ctx.destination),
            radio: new ChannelStrip(this.ctx, this.analyser, this.ctx.destination),
            // Микрофон НЕ слышно в колонках (мониторинг через графики)
            mic: new ChannelStrip(this.ctx, this.analyser, null) 
        };

        this.currentBuffer = null;
        this.isLive = false;
        this.animationId = null;
        
        // Ссылка на HTML Audio для радио
        this._radioElement = document.getElementById('streamPlayer');
    }

    // Обновление параметров всех каналов
    updateMixer(settings) {
        Object.values(this.channels).forEach(ch => {
            ch.setVolume(settings.gain);
            ch.setEQ(settings.low, settings.mid, settings.high);
        });
    }

    // --- 1. Файлы ---
    async loadFile(file) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        const ab = await file.arrayBuffer();
        this.currentBuffer = await this.ctx.decodeAudioData(ab);
        return this.currentBuffer;
    }

    playCurrentBuffer() {
        if (!this.currentBuffer) return alert('Файл не загружен');
        
        // Перезапуск канала файла
        this.channels.file.disconnect();

        const source = this.ctx.createBufferSource();
        source.buffer = this.currentBuffer;
        
        this.channels.file.connectInput(source);
        
        source.onended = () => { console.log('File ended'); };
        source.start(0);

        this.startEngineLoop();
    }

    // --- 2. Радио ---
    async startStream(url) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        
        this.channels.radio.disconnect();

        if (!this._radioElement) return console.error('No stream player found');
        
        this._radioElement.src = url;
        this._radioElement.crossOrigin = "anonymous";

        try {
            await this._radioElement.play();
            
            // MediaElementSource создается 1 раз для тега
            if (!this._streamNode) {
                 this._streamNode = this.ctx.createMediaElementSource(this._radioElement);
            }
            
            this.channels.radio.connectInput(this._streamNode);
            this.startEngineLoop();
        } catch (e) {
            alert('Ошибка потока: ' + e.message);
        }
    }

    // --- 3. Микрофон ---
    async startMicrophone(deviceId) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        
        this.channels.mic.disconnect();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { 
                    deviceId: deviceId ? { exact: deviceId } : undefined, 
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false
                }
            });
            const source = this.ctx.createMediaStreamSource(stream);
            this.channels.mic.connectInput(source);
            this.startEngineLoop();
        } catch (e) { alert('Ошибка микр: ' + e.message); }
    }

    // --- Управление ---
    stop() {
        // Останавливаем всё
        this.channels.file.disconnect();
        this.channels.radio.disconnect();
        this.channels.mic.disconnect();
        
        if(this._radioElement) {
            this._radioElement.pause();
            this._radioElement.src = "";
        }
        
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

        // 1. Данные для визуализации
        if (this.viz) {
            this.analyser.getByteTimeDomainData(this.byteData);
            this.viz.drawWaveform(this.byteData);
        }

        // 2. Данные для DSP
        if (this.dsp) {
            this.analyser.getFloatTimeDomainData(this.floatData);
            this.dsp.processRealTime(this.floatData, this.ctx.sampleRate);
        }

        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
