export class AudioEngine {
    constructor(visualizer, dsp) {
        // Создаем контекст (поддержка старых браузеров)
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        this.viz = visualizer; // Ссылка на визуализатор
        this.dsp = dsp;       // Ссылка на модуль DSP
        
        // Узлы аудио графа
        this.source = null;
        this.analyser = this.ctx.createAnalyser();
        
        // Настройки анализатора
        this.analyser.fftSize = 2048; // Размер окна (должен быть степенью 2)
        this.analyser.smoothingTimeConstant = 0.2; // Сглаживание
        
        // Буферы данных для анализатора
        this.byteData = new Uint8Array(this.analyser.frequencyBinCount);
        this.floatData = new Float32Array(this.analyser.fftSize);
        
        this.isLive = false;
        this.animationId = null;
        
        // Буфер текущего файла (для проигрывания)
        this.currentFileBuffer = null;
        this.fileSourceNode = null;
    }

    // --- 1. Работа с файлами ---
    
    // Декодирование загруженного файла
    async loadFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        // Важно: decodeAudioData отсоединяет буфер, копируем если нужно сохранить
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.currentFileBuffer = audioBuffer;
        return audioBuffer;
    }

    playSelectedFile() {
        if (!this.currentFileBuffer) return;
        this.stop(); // Сначала стоп

        this.fileSourceNode = this.ctx.createBufferSource();
        this.fileSourceNode.buffer = this.currentFileBuffer;
        
        // Подключаем граф: Source -> Analyser -> Destination (Колонки)
        this.fileSourceNode.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
        
        this.fileSourceNode.start(0);
        this.source = this.fileSourceNode;
        
        this.isLive = true; // Считаем проигрывание тоже "живым" процессом для визуализации
        this.loop();
        
        this.fileSourceNode.onended = () => {
            this.isLive = false;
        };
    }

    // --- 2. Микрофон (Real-Time) ---
    
    async startMicrophone(deviceId) {
        this.stop();
        await this.ctx.resume();

        try {
            const constraints = { 
                audio: { 
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false, 
                    autoGainControl: false 
                } 
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.source = this.ctx.createMediaStreamSource(stream);
            this.source.connect(this.analyser);
            // НЕ подключаем микрофон к destination, чтобы не было Feedback Loop
            
            this.isLive = true;
            this.loop();
        } catch (err) {
            console.error('Mic Error:', err);
            throw new Error('Mic access denied: ' + err.message);
        }
    }

    // --- 3. Радио-поток (Real-Time) ---
    
    async startStream(url) {
        this.stop();
        await this.ctx.resume();

        // Используем скрытый тег <audio> в HTML
        const audioEl = document.getElementById('streamPlayer');
        if (!audioEl) {
            throw new Error('Audio element #streamPlayer not found in HTML');
        }
        
        audioEl.src = url;
        audioEl.crossOrigin = "anonymous"; // Критично для CORS

        try {
            await audioEl.play();
            
            // Создаем MediaElementSource только один раз
            if (!this.streamSourceNode) {
                this.streamSourceNode = this.ctx.createMediaElementSource(audioEl);
            }
            
            this.source = this.streamSourceNode;
            this.source.connect(this.analyser);
            this.analyser.connect(this.ctx.destination); // Звук идет в колонки
            
            this.isLive = true;
            this.loop();
        } catch (e) {
            console.error(e);
            throw new Error('Stream failed. Check CORS or URL.');
        }
    }

    stop() {
        this.isLive = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        
        // Остановить микрофон
        if (this.source && this.source.mediaStream) {
            this.source.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // Остановить файл
        if (this.fileSourceNode) {
            try { this.fileSourceNode.stop(); } catch(e){}
            this.fileSourceNode = null;
        }
        
        // Остановить радио
        const audioEl = document.getElementById('streamPlayer');
        if (audioEl) {
            audioEl.pause();
            audioEl.src = "";
        }
    }

    // Главный цикл визуализации и анализа (60 FPS)
    loop() {
        if (!this.isLive) return;
        
        // 1. Получаем байты для отрисовки волны (быстро)
        this.analyser.getByteTimeDomainData(this.byteData);
        this.viz.drawWaveform(this.byteData);
        
        // 2. Получаем float для DSP (точно)
        this.analyser.getFloatTimeDomainData(this.floatData);
        
        // 3. Отправляем в DSP модуль (а он отправит в Worker)
        if (this.dsp) {
            this.dsp.processRealTime(this.floatData, this.ctx.sampleRate);
        }

        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
