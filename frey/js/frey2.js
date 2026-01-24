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
        console.log('[App] Initializing v4.5 Final...');
        
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        
        // Аудио движок получает доступ к Визуализатору и DSP
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();

        this.ui.log('System Ready. Select input source.');
    },

    bindEvents() {
        // --- Управление Файлами ---
        this.ui.on('play', () => {
            this.ui.log('Starting playback...');
            this.audio.playCurrentBuffer();
        });
        
        this.ui.on('stop', () => {
            this.audio.stop();
            this.ui.setLiveState(false);
            this.ui.log('Stopped.');
        });
        
        this.ui.on('file-load', (files) => this.handleFiles(files));

        // --- Управление Real-Time ---
        this.ui.on('mic-start', async (deviceId) => {
            this.ui.log('Initializing microphone...');
            await this.audio.startMicrophone(deviceId);
            this.ui.setLiveState(true);
        });

        this.ui.on('stream-start', async (url) => {
            this.ui.log(`Connecting to stream: ${url}`);
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
        });

        this.ui.on('stop-live', () => {
            this.audio.stop();
            this.ui.setLiveState(false);
            this.ui.log('Live input stopped.');
        });
    },

    bindDSP() {
        // Обновление графиков метрик (RMS/Centroid) из Worker'а
        this.dsp.onRealTimeData = (metrics) => {
            if (this.viz && this.viz.drawRealTimeMetrics) {
                this.viz.drawRealTimeMetrics(metrics);
            }
        };

        // Завершение полного анализа файла
        this.dsp.onFileAnalysisDone = (result, id) => {
            this.ui.log(`Analysis complete for: ${id}. Frames: ${result.frames}`);
            // Здесь можно добавить код для детальной отрисовки результата
        };
    },

    async handleFiles(fileList) {
        if (!fileList || fileList.length === 0) return;

        const file = fileList[0];
        try {
            this.ui.log(`Loading ${file.name}...`);
            
            // 1. Загрузка и декодирование (теперь сохраняется внутри audio)
            const buffer = await this.audio.loadFile(file);
            
            this.ui.log(`Loaded ${file.name} (${buffer.duration.toFixed(2)}s). Ready to Play.`);
            
            // 2. Рисуем превью волны
            const rawData = buffer.getChannelData(0); 
            const previewLen = 2048;
            const step = Math.floor(rawData.length / previewLen);
            const view = new Uint8Array(previewLen);
            for(let i=0; i<previewLen; i++) {
                const val = rawData[i * step] || 0;
                view[i] = (val + 1) * 128;
            }
            this.viz.drawWaveform(view);

            // 3. Запускаем глубокий анализ в фоне
            this.dsp.analyzeFullFile(buffer, file.name);
            
        } catch (e) {
            console.error(e);
            this.ui.log('Error loading file: ' + e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
