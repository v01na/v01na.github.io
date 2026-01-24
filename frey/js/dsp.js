export class DSP {
    constructor(app) {
        this.app = app;
        
        // Создаем Worker
        this.worker = new Worker('js/workers/dsp-worker.js');
        this.worker.postMessage({ type: 'init' });
        
        this.worker.onmessage = (e) => {
            const msg = e.data;
            
            // 1. Real-Time метрики
            if(msg.type === 'chunk-result' && this.onRealTimeData) {
                this.onRealTimeData(msg.result);
            }
            
            // 2. Результат Извлечения
            if(msg.type === 'file-result' && this.onFileAnalysisDone) {
                this.onFileAnalysisDone(msg.result, msg.id);
            }
            
            // 3. Результат Матрицы
            if(msg.type === 'dtw-result' && this.onDTWMatrixReady) {
                this.onDTWMatrixReady(msg.matrix);
            }
            
            // 4. Результат Кластеризации
            if(msg.type === 'cluster-result' && this.onClustersReady) {
                this.onClustersReady(msg.data);
            }
            
            if(msg.type === 'error') {
                console.error(msg.error);
                if(this.app.ui) this.app.ui.log('DSP Error: ' + msg.error);
            }
        };

        this.onRealTimeData = null; 
        this.onFileAnalysisDone = null;
        this.onDTWMatrixReady = null;
        this.onClustersReady = null;
    }

    processRealTime(data, sr) {
        this.worker.postMessage({ type: 'process-chunk', payload: { data, config: {sampleRate: sr}} });
    }

    analyzeFullFile(buffer, id) {
        const envSr = parseInt(document.getElementById('env_sr')?.value || 120);
        
        // Копируем данные канала (моно)
        const channelData = buffer.getChannelData(0);
        
        this.worker.postMessage({
            type: 'analyze-file',
            payload: { buffer: channelData, sr: buffer.sampleRate, id, config: { envSr } }
        });
    }

    runDTW() {
        this.worker.postMessage({ type: 'run-dtw' });
    }

    runClustering(k) {
        this.worker.postMessage({ type: 'run-cluster', payload: { k: k || 5 } });
    }
}
