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
        
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        
        // Аудио движок должен знать о DSP для отправки данных
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();

        this.ui.log('System Ready. Select input source.');
    },

    bindEvents() {
        // Плеер
        this.ui.on('play', () => this.audio.playSelectedFile());
        this.ui.on('stop', () => this.audio.stop());
        
        // Real-Time Inputs
        this.ui.on('mic-start', async (devId) => {
            await this.audio.startMicrophone(devId);
            this.ui.setLiveState(true);
        });
        this.ui.on('stream-start', async (url) => {
            await this.audio.startStream(url);
            this.ui.setLiveState(true);
        });
        this.ui.on('stop-live', () => {
            this.audio.stop();
            this.ui.setLiveState(false);
        });

        // Файлы
        this.ui.on('file-load', (files) => this.handleFiles(files));
    },

    bindDSP() {
        // Когда DSP присылает данные реального времени
        this.dsp.onRealTimeData = (metrics) => {
            // metrics = { rms, centroid, hilbertPeak }
            // Обновляем UI или графики огибающих
            this.viz.drawRealTimeMetrics(metrics);
        };
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
