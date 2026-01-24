export class DSP {
    constructor(app) {
        this.app = app;
        
        // Запускаем воркер (убедитесь, что путь верный)
        this.worker = new Worker('js/workers/dsp-worker.js');
        
        // Инициализация
        this.worker.postMessage({ type: 'init' });
        
        // Прием сообщений от воркера
        this.worker.onmessage = (e) => this.handleMessage(e.data);
        
        // Callbacks для внешнего мира
        this.onRealTimeData = null; 
        this.onFileAnalysisDone = null;
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'chunk-result':
                // Пришли быстрые метрики (RMS/Centroid) из потока
                if (this.onRealTimeData) {
                    this.onRealTimeData(msg.result);
                }
                break;
                
            case 'file-result':
                // Пришел полный анализ файла
                if (this.onFileAnalysisDone) {
                    this.onFileAnalysisDone(msg.result, msg.id);
                }
                break;
                
            case 'error':
                console.error('[DSP Worker Error]', msg.error);
                break;
                
            case 'ready':
                console.log('[DSP] Worker ready');
                break;
        }
    }

    // Метод для отправки "сырых" данных потока (Real-Time)
    processRealTime(floatData, sampleRate) {
        // floatData - это Float32Array. 
        // При postMessage данные копируются (Structured Clone), это безопасно.
        this.worker.postMessage({
            type: 'process-chunk',
            payload: {
                data: floatData,
                config: { sampleRate: sampleRate }
            }
        });
    }

    // Метод для полного анализа файла
    analyzeFullFile(audioBuffer, id) {
        // Берем данные первого канала (моно)
        const channelData = audioBuffer.getChannelData(0);
        
        // Определяем частоту дискретизации огибающей из UI (или дефолт)
        const envSrInput = document.getElementById('env_sr');
        const envSr = envSrInput ? parseInt(envSrInput.value) : 120;

        this.worker.postMessage({
            type: 'analyze-file',
            payload: {
                buffer: channelData, // Большой массив
                sr: audioBuffer.sampleRate,
                id: id,
                config: {
                    envSr: envSr
                }
            }
        });
    }
}
