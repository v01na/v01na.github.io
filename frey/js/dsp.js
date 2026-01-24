// js/dsp.js

export class DSP {
    constructor(app) {
        this.app = app;
        this.worker = new Worker('js/workers/dsp-worker.js');
        
        this.worker.postMessage({ type: 'init' });
        
        this.worker.onmessage = (e) => this.handleMessage(e.data);
        
        // Callback для обновления RT графиков
        this.onRealTimeData = null; 
        // Callback для завершения анализа файла
        this.onFileAnalysisDone = null;
    }

    handleMessage(msg) {
        if (msg.type === 'chunk-result') {
            // Пришли данные RMS/Centroid из реального времени
            if (this.onRealTimeData) {
                this.onRealTimeData(msg.result);
            }
        }
        
        if (msg.type === 'file-result') {
            console.log('[DSP] File analysis complete');
            if (this.onFileAnalysisDone) {
                this.onFileAnalysisDone(msg.result, msg.id);
            }
        }
        
        if (msg.type === 'error') {
            console.error('[DSP Worker Error]', msg.error);
        }
    }

    // Отправить буфер потока на быстрый анализ
    processRealTime(floatData, sampleRate) {
        // floatData должен быть Float32Array
        // Важно: копируем данные, чтобы не было конфликтов памяти, 
        // или используем Transferable, если буфер больше не нужен в основном потоке.
        this.worker.postMessage({
            type: 'process-chunk',
            payload: {
                data: floatData,
                config: { sampleRate: sampleRate }
            }
        });
    }

    // Запустить глубокий анализ всего файла
    analyzeFullFile(audioBuffer, id) {
        const chanData = audioBuffer.getChannelData(0); // Берем моно
        
        this.worker.postMessage({
            type: 'analyze-file',
            payload: {
                buffer: chanData, // Данные скопируются
                sr: audioBuffer.sampleRate,
                id: id,
                config: {
                    envSr: parseInt(document.getElementById('env_sr')?.value || 120)
                }
            }
        });
    }
}
