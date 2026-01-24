export class AudioEngine {
    constructor(visualizer) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.viz = visualizer;
        this.source = null;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 2048;
        
        // Буфер для отрисовки
        this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        
        this.isLive = false;
        this.animationId = null;
    }

    // --- 1. Работа с файлами ---
    async loadFile(file) {
        // Логика декодирования (как в старом скрипте)
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    playSelectedFile() {
        // ... (код плеера)
    }

    // --- 2. Микрофон (Real-Time) ---
    async startMicrophone(deviceId) {
        this.stop(); // Остановить всё текущее
        await this.ctx.resume();

        try {
            const constraints = { 
                audio: { 
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false, // Нам нужен "сырой" сигнал для анализа!
                    autoGainControl: false 
                } 
            };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.source = this.ctx.createMediaStreamSource(stream);
            this.source.connect(this.analyser);
            // Микрофон НЕ подключаем к destination (колонки), иначе будет свист (Feedback loop)
            
            this.isLive = true;
            this.loop();
            console.log('[Audio] Mic started');
        } catch (err) {
            console.error('Mic Error:', err);
            alert('Ошибка доступа к микрофону: ' + err.message);
        }
    }

    // --- 3. Радио-поток (Real-Time) ---
    async startStream(url) {
        this.stop();
        await this.ctx.resume();

        const audioEl = document.getElementById('streamPlayer');
        audioEl.src = url;
        audioEl.crossOrigin = "anonymous"; // Важно для CORS

        try {
            await audioEl.play();
            // Создаем источник из HTML Audio Element
            if (!this.streamSourceNode) {
                this.streamSourceNode = this.ctx.createMediaElementSource(audioEl);
            }
            this.source = this.streamSourceNode;
            this.source.connect(this.analyser);
            this.analyser.connect(this.ctx.destination); // Радио должно играть в колонки
            
            this.isLive = true;
            this.loop();
            console.log('[Audio] Radio stream started');
        } catch (e) {
            alert('Ошибка потока. Возможно CORS или неверный URL.');
        }
    }

    stop() {
        this.isLive = false;
        if (this.animationId) cancelAnimationFrame(this.animationId);
        
        // Остановить микрофон
        if (this.source && this.source.mediaStream) {
            this.source.mediaStream.getTracks().forEach(track => track.stop());
        }
        
        // Остановить радио
        const audioEl = document.getElementById('streamPlayer');
        audioEl.pause();
        audioEl.src = "";
    }

    // Цикл анализа (60 FPS)
    loop() {
        if (!this.isLive) return;
        
        // Получаем данные
        this.analyser.getByteTimeDomainData(this.dataArray);
        
        // Отправляем на визуализацию
        this.viz.drawWaveform(this.dataArray);
        
        // TODO: Здесь же будем отправлять данные в Worker для анализа Фрея
        // worker.postMessage({ type: 'process', data: this.dataArray });

        this.animationId = requestAnimationFrame(() => this.loop());
    }
}
