export class DSP {
    constructor(app) {
        this.app = app;
        this.worker = new Worker('js/workers/dsp-worker.js');
        this.worker.postMessage({ type: 'init' });
        
        this.worker.onmessage = (e) => {
            const msg = e.data;
            if(msg.type === 'chunk-result' && this.onRealTimeData) this.onRealTimeData(msg.result);
            if(msg.type === 'file-result' && this.onFileAnalysisDone) this.onFileAnalysisDone(msg.result, msg.id);
            if(msg.type === 'dtw-result' && this.onDTWMatrixReady) this.onDTWMatrixReady(msg.matrix);
            if(msg.type === 'error') {
                console.error(msg.error);
                if(this.app.ui) this.app.ui.log('DSP Error: ' + msg.error);
            }
        };

        this.onRealTimeData = null; 
        this.onFileAnalysisDone = null;
        this.onDTWMatrixReady = null;
    }

    processRealTime(data, sr) {
        this.worker.postMessage({ type: 'process-chunk', payload: { data, config: {sampleRate: sr}} });
    }

    analyzeFullFile(buffer, id) {
        const sr = buffer.sampleRate;
        const data = buffer.getChannelData(0);
        // Отправляем
        this.worker.postMessage({
            type: 'analyze-file',
            payload: { buffer: data, sr: sr, id: id, config: { envSr: 120 } }
        });
    }

    runDTW() {
        this.worker.postMessage({ type: 'run-dtw' });
    }
}
