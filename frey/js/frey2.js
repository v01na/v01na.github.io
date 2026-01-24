import { UI } from './ui.js';
import { AudioEngine } from './audio-engine.js';
import { Visualizer } from './visualization.js';
import { DSP } from './dsp.js';

const App = {
    ui: null,
    audio: null,
    viz: null,
    dsp: null,
    
    async init() {
        console.log('[App] Initializing v4.5 Modular...');
        
        // 1. Инициализация всех модулей
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        
        // Передаем viz и dsp в аудио-движок, чтобы он мог рисовать и считать
        this.audio = new AudioEngine(this.viz, this.dsp); 

        // 2. Настройка связей
        this.bindEvents();
        this.bindDSP();

        this.ui.log('System Ready. Select input source.');
    },

    // Связываем события интерфейса с логикой
    bindEvents() {
        // --- Плеер (для файлов) ---
        this.ui.on('play', () => {
            // Здесь можно добавить логику воспроизведения загруженного буфера
            this.ui.log('Play functionality for files requires AudioBufferSource implementation in AudioEngine');
        });
        
        this.ui.on('stop', () => {
            this.audio.stop();
            this.ui.setLiveState(false);
        });
        
        // --- Микрофон (Real-Time) ---
        this.ui.on('mic-start', async (deviceId) => {
            await this.audio.startMicrophone(deviceId);
            this.ui.setLiveState(true);
            this.ui.log('Microphone capture started');
        });

        // --- Радио (Real-Time) ---
        this.ui.on('stream-start', async (url) => {
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
            this.ui.log('Radio stream connecting...');
        });

        this.ui.on('stop-live', () => {
            this.audio.stop();
            this.ui.setLiveState(false);
            this.ui.log('Stopped');
        });

        // --- Загрузка файлов ---
        this.ui.on('file-load', (files) => this.handleFiles(files));
    },

    // Связываем обратные вызовы от DSP (результаты анализа)
    bindDSP() {
        // Данные реального времени (RMS, Centroid, Peak)
        this.dsp.onRealTimeData = (metrics) => {
            // metrics = { rms, centroid, hilbertPeak }
            // Рисуем цветные графики внизу
            if (this.viz.drawRealTimeMetrics) {
                this.viz.drawRealTimeMetrics(metrics);
            }
        };

        // Результат полного анализа файла
        this.dsp.onFileAnalysisDone = (result, id) => {
            this.ui.log(`Analysis done for: ${id}. Frames: ${result.frames}`);
            // Здесь в будущем можно рисовать детальные огибающие
            // this.viz.drawFullEnvelopes(result);
        };
    },

    // Обработчик загрузки файлов
    async handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        this.ui.log(`Processing ${fileList.length} files...`);
        
        const file = fileList[0]; // Пока берем первый
        try {
            // 1. Декодируем
            this.ui.log(`Decoding ${file.name}...`);
            const buffer = await this.audio.loadFile(file);
            
            // 2. Рисуем волну (превью)
            // Берем немного данных из середины для визуализации
            const rawData = buffer.getChannelData(0); 
            const previewLen = 2048;
            const step = Math.floor(rawData.length / previewLen);
            const view = new Uint8Array(previewLen);
            
            for(let i=0; i<previewLen; i++) {
                // Конвертация float (-1..1) в byte (0..255)
                const val = rawData[i * step] || 0;
                view[i] = (val + 1) * 128;
            }
            this.viz.drawWaveform(view);

            // 3. Отправляем на полный анализ в Worker
            this.ui.log(`Analyzing ${file.name}...`);
            this.dsp.analyzeFullFile(buffer, file.name);
            
        } catch (e) {
            console.error(e);
            this.ui.log('Error loading file: ' + e.message);
        }
    }
};
