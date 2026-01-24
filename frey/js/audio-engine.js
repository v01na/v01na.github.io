export class AudioEngine {
    constructor(visualizer, dsp) {
        // Инициализация контекста
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.viz = visualizer;
        this.dsp = dsp;

        // Анализатор
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048; 
        this.analyser.smoothingTimeConstant = 0.2;

        // Буферы данных
        this.byteData = new Uint8Array(this.analyser.frequencyBinCount);
        this.floatData = new Float32Array(this.analyser.fftSize);

        // Состояние
        this.currentBuffer = null; // Здесь хранится загруженный файл
        this.sourceNode = null;    // Текущий источник звука (файл/мик/радио)
        this.isLive = false;
        this.animationId = null;
    }

    // --- 1. Работа с Файлами ---

    async loadFile(file) {
        // Принудительно запускаем контекст (нужно для Chrome)
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        
        // Сохраняем буфер для последующего воспроизведения
        this.currentBuffer = audioBuffer;
        return audioBuffer;
    }

    playCurrentBuffer() {
        if (!this.currentBuffer) {
            console.warn('[Audio] No buffer loaded');
            return;
        }

        this.stop(); // Остановка текущего
        
        // Создаем источник
        this.sourceNode = this.ctx.createBufferSource();
        this.sourceNode.buffer = this.currentBuffer;

        // Подключаем: Источник -> Анализатор -> Колонки
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        // Событие окончания
        this.sourceNode.onended = () => {
            this.isLive = false;
            // Можно уведомить UI через callback, если нужно
        };

        this.sourceNode.start(0);
        
        // Запускаем визуализацию
        this.isLive = true;
        this.loop();
        
        console.log('[Audio] File playback started');
    }

    // --- 2. Микрофон ---

    async startMicrophone(deviceId) {
        this.stop();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        try {
            const constraints = {
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false
                }
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.sourceNode = this.ctx.createMediaStreamSource(stream);
            this.sourceNode.connect(this.analyser);
            // ВАЖНО: Микрофон НЕ подключаем к ctx.destination, чтобы не было свиста!

            this.isLive = true;
            this.loop();
            console.log('[Audio] Microphone started');
        } catch (e) {
            console.error(e);
            alert('Mic Error: ' + e.message);
        }
    }

    // --- 3. Радио-поток ---

    async startStream(url) {
        this.stop();
        if (this.ctx.state === 'suspended') await this.ctx.resume();

        // Используем скрытый HTML Audio элемент для потоков (лучше работает с буферизацией)
        const audioEl = document.getElementById('streamPlayer');
        if (!audioEl) return;

        audioEl.src = url;
        audioEl.crossOrigin = "anonymous";
        
        try {
            await audioEl.play();
            
            // Создаем MediaElementSource только один раз
            if (!this.streamSourceNode) {
                this.streamSourceNode = this.ctx.createMediaElementSource(audioEl);
            }
            
            // Переподключаем
            this.streamSourceNode.disconnect();
            this.streamSourceNode.connect(this.analyser);
            this.analyser.connect(this.ctx.destination); // Звук в колонки

            this.isLive = true;
            this.loop();
            console.log('[Audio] Stream started');
        } catch (e) {
            console.error(e);
            alert('Stream Error: ' + e.message);
        }
    }

    // --- Общие методы ---

    stop() {
        this.isLive = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);

        // Остановить BufferSource
        if (this.sourceNode && this.sourceNode.stop) {
            try { this.sourceNode.stop(); } catch(e){}
        }
        
        // Остановить Микрофон (MediaStream)
        if (this.sourceNode && this.sourceNode.mediaStream) {
            this.sourceNode.mediaStream.getTracks().forEach(t => t.stop());
        }

        // Остановить Радио
        const audioEl = document.getElementById('streamPlayer');
        if (audioEl) {
            audioEl.pause();
            audioEl.src = "";
        }

        this.sourceNode = null;
    }

    loop() {
        if (!this.isLive) return;

        // 1. Рисуем волну (быстрые данные)
        if (this.viz) {
            this.analyser.getByteTimeDomainData(this.byteData);
            this.viz.drawWaveform(this.byteData);
        }

        // 2. Считаем метрики в DSP (медленные точные данные)
        if (this.dsp) {
            this.analyser.getFloatTimeDomainData(this.floatData);
            this.dsp.processRealTime(this.floatData, this.ctx.sampleRate);
        }

        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
