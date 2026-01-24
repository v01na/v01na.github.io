import { UI } from './ui.js';
import { AudioEngine } from './audio-engine.js';
import { Visualizer } from './visualization.js';
import { DSP } from './dsp.js';

const App = {
    async init() {
        console.log('Init V2k Demodulator Full...');
        this.viz = new Visualizer();
        this.ui = new UI(this);
        this.dsp = new DSP(this);
        this.audio = new AudioEngine(this.viz, this.dsp); 

        this.bindEvents();
        this.bindDSP();
        this.ui.log('Система готова. Загрузите файл или включите поток.');
    },

    bindEvents() {
        this.ui.on('play', () => this.audio.playCurrentBuffer());
        this.ui.on('stop', () => this.stopAll());
        this.ui.on('mixer-change', s => this.audio.updateMixer(s));
        this.ui.on('mic-start', async id => { await this.audio.startMicrophone(id); this.ui.setLiveState(true); });
        this.ui.on('stream-start', async url => { await this.audio.startStream(url); this.ui.setLiveState(true); });
        this.ui.on('file-load', f => this.handleFiles(f));

        this.ui.on('extract-one', () => {
            if(!this.audio.currentBuffer) return alert('Файл не загружен');
            this.ui.log('Анализ DSP...');
            this.dsp.analyzeFullFile(this.audio.currentBuffer, 'Manual');
        });

        this.ui.on('match-dtw', () => {
            this.ui.log('Расчет матрицы...');
            this.dsp.runDTW();
        });
    },

    bindDSP() {
        this.dsp.onRealTimeData = m => this.viz.drawRealTimeMetrics(m);

        this.dsp.onFileAnalysisDone = (res, id) => {
            const text = `=== РЕЗУЛЬТАТ АНАЛИЗА ===\nID: ${id}\nФреймов: ${res.frames}\nRMS: ${res.rms.length}\nГотов к матрице.`;
            this.ui.printResult(text);
            this.ui.log('Демодуляция завершена.');
            this.viz.drawFullEnvelopes(res);
        };

        this.dsp.onDTWMatrixReady = (matrix) => {
            this.ui.log('Матрица построена.');
            this.viz.drawDTWMatrix(matrix);
            const current = document.getElementById('results').textContent;
            this.ui.printResult(current + `\n\n=== DTW МАТРИЦА ===\n${matrix.rows}x${matrix.cols}\nОК.`);
        };
    },

    stopAll() {
        this.audio.stop();
        this.ui.setLiveState(false);
    },

    async handleFiles(list) {
        if(!list.length) return;
        const f = list[0];
        try {
            this.ui.log(`Загрузка ${f.name}...`);
            const b = await this.audio.loadFile(f);
            
            // Preview
            const raw = b.getChannelData(0);
            const v = new Uint8Array(2048);
            const step = Math.floor(raw.length/2048);
            for(let i=0;i<2048;i++) v[i]=(raw[i*step]+1)*128;
            this.viz.drawWaveform(v);

            this.ui.log('Файл загружен.');
            this.dsp.analyzeFullFile(b, f.name);
        } catch(e) {
            this.ui.log('Ошибка: '+e.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
