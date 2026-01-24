// js/audio-engine.js

// Вспомогательный класс для "канальной линейки"
class ChannelStrip {
    constructor(ctx, destination) {
        this.ctx = ctx;
        
        // 1. Создаем фильтры (Эквалайзер)
        this.lowShelf = ctx.createBiquadFilter();
        this.lowShelf.type = 'lowshelf';
        this.lowShelf.frequency.value = 150; // Bass cutoff

        this.midPeak = ctx.createBiquadFilter();
        this.midPeak.type = 'peaking';
        this.midPeak.frequency.value = 1000; // Mid center
        this.midPeak.Q.value = 1;

        this.highShelf = ctx.createBiquadFilter();
        this.highShelf.type = 'highshelf';
        this.highShelf.frequency.value = 8000; // Treble cutoff

        // 2. Volume
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = 1.0;

        // 3. Собираем цепочку: Input -> Low -> Mid -> High -> Gain -> Destination
        // Input мы подключим позже методом connectInput
        this.lowShelf.connect(this.midPeak);
        this.midPeak.connect(this.highShelf);
        this.highShelf.connect(this.gainNode);
        this.gainNode.connect(destination);

        // Храним входную точку цепочки
        this.inputPoint = this.lowShelf;
    }

    // Подключение источника звука к этой линейке
    connectInput(sourceNode) {
        try { sourceNode.disconnect(); } catch(e){}
        sourceNode.connect(this.inputPoint);
    }

    // Обновление параметров
    setEQ(low, mid, high) {
        // low/mid/high в дБ (от -15 до +15)
        this.lowShelf.gain.value = low;
        this.midPeak.gain.value = mid;
        this.highShelf.gain.value = high;
    }

    setVolume(val) {
        // Плавное изменение громкости
        this.gainNode.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }
}

export class AudioEngine {
    constructor(visualizer, dsp) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.viz = visualizer;
        this.dsp = dsp;

        // Анализатор (мастер-шина для анализа)
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        this.analyser.smoothingTimeConstant = 0.2;
        // Анализатор подключаем к выходу (колонки)
        this.analyser.connect(this.ctx.destination);

        // Создаем буферы данных
        this.byteData = new Uint8Array(this.analyser.frequencyBinCount);
        this.floatData = new Float32Array(this.analyser.fftSize);

        // --- СОЗДАЕМ 3 НЕЗАВИСИМЫХ КАНАЛА ---
        // Все каналы идут в Анализатор (а оттуда в колонки)
        this.channels = {
            file: new ChannelStrip(this.ctx, this.analyser),
            mic: new ChannelStrip(this.ctx, this.analyser), // Мик тоже можно пустить в анализатор
            radio: new ChannelStrip(this.ctx, this.analyser)
        };

        // ВАЖНО: Микрофон лучше не пускать в ctx.destination, иначе будет фидбек (свист).
        // Поэтому для мика переопределяем выход: только в Анализатор, но отключаем связь Анализатора с Колонками?
        // Нет, анализатор общий. 
        // Решение: Сделаем для мика отдельный ChannelStrip, который идет ТОЛЬКО в анализатор, но НЕ в destination.
        // Для простоты в этом примере: при включении мика отключаем связь analyzer -> destination
        
        this.activeSource = null; // 'file', 'mic', 'radio'
        
        this.currentBuffer = null;
        this.sourceNode = null;
        this.streamSourceNode = null;
        this.isLive = false;
        this.animationId = null;
    }

    // Метод для обновления настроек микшера (вызывается из UI)
    updateMixer(settings) {
        // settings: { gain, low, mid, high }
        // Применяем настройки ко ВСЕМ каналам (или к активному)
        // Логичнее применять к активному или ко всем, чтобы сохранять пресет
        
        // Для простоты применяем ко всем
        ['file', 'mic', 'radio'].forEach(key => {
            const ch = this.channels[key];
            ch.setVolume(settings.gain);
            ch.setEQ(settings.low, settings.mid, settings.high);
        });
    }

    // --- ФАЙЛЫ ---
    async loadFile(file) {
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        const ab = await file.arrayBuffer();
        this.currentBuffer = await this.ctx.decodeAudioData(ab);
        return this.currentBuffer;
    }

    playCurrentBuffer() {
        if (!this.currentBuffer) return alert('No file loaded');
        this.stop();
        this.ensureDestinationConnection(true); // Включаем звук в колонки

        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = this.currentBuffer;

        // Подключаем к каналу FILE
        this.channels.file.connectInput(this.sourceNode);

        this.sourceNode.onended = () => { this.isLive = false; };
        this.sourceNode.start(0);
        
        this.activeSource = 'file';
        this.isLive = true;
        this.loop();
    }

    // --- МИКРОФОН ---
    async startMicrophone(deviceId) {
        this.stop();
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.ensureDestinationConnection(false); // ОТКЛЮЧАЕМ звук в колонки (Feedback protection)

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: deviceId ? { exact: deviceId } : undefined, echoCancellation: false }
            });
            this.sourceNode = this.ctx.createMediaStreamSource(stream);
            
            // Подключаем к каналу MIC
            // (Так как мы отключили destination, звук пойдет Mic -> Channel -> Analyser -X-> Speaker)
            this.channels.mic.connectInput(this.sourceNode);
            
            this.activeSource = 'mic';
            this.isLive = true;
            this.loop();
        } catch (e) { alert(e.message); }
    }

    // --- РАДИО ---
    async startStream(url) {
        this.stop();
        if (this.ctx.state === 'suspended') await this.ctx.resume();
        this.ensureDestinationConnection(true); // Включаем звук в колонки

        const audioEl = document.getElementById('streamPlayer');
        audioEl.src = url;
        try {
            await audioEl.play();
            if (!this.streamSourceNode) this.streamSourceNode = this.ctx.createMediaElementSource(audioEl);
            
            // Подключаем к каналу RADIO
            this.channels.radio.connectInput(this.streamSourceNode);
            
            this.sourceNode = this.streamSourceNode; // Для stop()
            this.activeSource = 'radio';
            this.isLive = true;
            this.loop();
        } catch (e) { alert('Stream error: ' + e.message); }
    }

    // --- УТИЛИТЫ ---
    
    // Управление подключением Анализатора к Колонкам (чтобы не было свиста в мике)
    ensureDestinationConnection(shouldConnect) {
        try { this.analyser.disconnect(this.ctx.destination); } catch(e){}
        if (shouldConnect) {
            this.analyser.connect(this.ctx.destination);
        }
    }

    stop() {
        this.isLive = false;
        if (this.sourceNode && this.sourceNode.stop && !this.sourceNode.mediaElement) {
            try { this.sourceNode.stop(); } catch(e){}
        }
        if (this.sourceNode && this.sourceNode.mediaStream) {
            this.sourceNode.mediaStream.getTracks().forEach(t => t.stop());
        }
        const el = document.getElementById('streamPlayer');
        if(el) { el.pause(); el.src = ""; }
    }

    loop() {
        if (!this.isLive) return;
        if (this.viz) {
            this.analyser.getByteTimeDomainData(this.byteData);
            this.viz.drawWaveform(this.byteData);
        }
        if (this.dsp) {
            this.analyser.getFloatTimeDomainData(this.floatData);
            this.dsp.processRealTime(this.floatData, this.ctx.sampleRate);
        }
        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
