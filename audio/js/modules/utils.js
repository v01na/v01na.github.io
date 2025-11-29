class UtilsModule {
    constructor() {
        this.audioContext = null;
        this.workers = new Map();
    }

    // Аудио утилиты
    getAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this.audioContext;
    }

    async decodeAudioData(arrayBuffer) {
        const audioContext = this.getAudioContext();
        try {
            return await audioContext.decodeAudioData(arrayBuffer);
        } catch (error) {
            console.error('Ошибка декодирования аудио:', error);
            throw error;
        }
    }

    convertToMono(audioBuffer) {
        if (audioBuffer.numberOfChannels === 1) {
            return audioBuffer.getChannelData(0).slice();
        }

        const length = audioBuffer.length;
        const monoData = new Float32Array(length);
        
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const channelData = audioBuffer.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                monoData[i] += channelData[i] / audioBuffer.numberOfChannels;
            }
        }
        
        return monoData;
    }

    resampleAudio(data, originalSampleRate, targetSampleRate) {
        if (originalSampleRate === targetSampleRate) return data;

        const ratio = originalSampleRate / targetSampleRate;
        const newLength = Math.round(data.length / ratio);
        const result = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const index = i * ratio;
            const indexInt = Math.floor(index);
            const fraction = index - indexInt;

            if (indexInt + 1 < data.length) {
                result[i] = data[indexInt] * (1 - fraction) + data[indexInt + 1] * fraction;
            } else {
                result[i] = data[indexInt];
            }
        }

        return result;
    }

    // DSP утилиты
    nextPowerOfTwo(n) {
        return Math.pow(2, Math.ceil(Math.log2(n)));
    }

    hannWindow(length) {
        const window = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
        }
        return window;
    }

    // Работа с Web Workers
    createWorker(workerScript) {
        if (this.workers.has(workerScript)) {
            return this.workers.get(workerScript);
        }

        const worker = new Worker(workerScript);
        this.workers.set(workerScript, worker);
        return worker;
    }

    terminateWorker(workerScript) {
        if (this.workers.has(workerScript)) {
            this.workers.get(workerScript).terminate();
            this.workers.delete(workerScript);
        }
    }

    // Математические утилиты
    normalizeArray(data) {
        if (data.length === 0) return data;

        let min = Infinity;
        let max = -Infinity;

        for (let i = 0; i < data.length; i++) {
            if (data[i] < min) min = data[i];
            if (data[i] > max) max = data[i];
        }

        const range = max - min;
        if (range === 0) return new Float32Array(data.length).fill(0.5);

        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            normalized[i] = (data[i] - min) / range;
        }

        return normalized;
    }

    zNormalize(data) {
        if (data.length === 0) return data;

        let mean = 0;
        let std = 0;

        for (let i = 0; i < data.length; i++) {
            mean += data[i];
        }
        mean /= data.length;

        for (let i = 0; i < data.length; i++) {
            std += Math.pow(data[i] - mean, 2);
        }
        std = Math.sqrt(std / data.length);

        if (std === 0) return new Float32Array(data.length).fill(0);

        const normalized = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            normalized[i] = (data[i] - mean) / std;
        }

        return normalized;
    }

    // Утилиты времени
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    formatFileSize(bytes) {
        const units = ['B', 'KB', 'MB', 'GB'];
        let size = bytes;
        let unitIndex = 0;

        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }

        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    // Утилиты DOM
    createElement(tag, className, innerHTML = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    showElement(element, show = true) {
        element.style.display = show ? '' : 'none';
    }

    // Обработка ошибок
    handleError(error, userMessage = 'Произошла ошибка') {
        console.error(error);
        
        if (error instanceof Error) {
            return {
                success: false,
                message: userMessage,
                detail: error.message,
                stack: error.stack
            };
        }

        return {
            success: false,
            message: userMessage,
            detail: String(error)
        };
    }

    // LocalStorage утилиты
    saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Ошибка сохранения в localStorage:', error);
            return false;
        }
    }

    loadFromStorage(key, defaultValue = null) {
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : defaultValue;
        } catch (error) {
            console.error('Ошибка загрузки из localStorage:', error);
            return defaultValue;
        }
    }

    // Утилиты форматирования
    formatFrequency(hz) {
        if (hz >= 1000000) {
            return `${(hz / 1000000).toFixed(2)} MHz`;
        } else if (hz >= 1000) {
            return `${(hz / 1000).toFixed(2)} kHz`;
        } else {
            return `${hz.toFixed(0)} Hz`;
        }
    }

    formatDecibels(db) {
        return `${db.toFixed(1)} dB`;
    }

    // Статистические утилиты
    calculateStatistics(data) {
        if (data.length === 0) return null;

        let sum = 0;
        let min = Infinity;
        let max = -Infinity;
        let squares = 0;

        for (let i = 0; i < data.length; i++) {
            const value = data[i];
            sum += value;
            squares += value * value;
            if (value < min) min = value;
            if (value > max) max = value;
        }

        const mean = sum / data.length;
        const variance = squares / data.length - mean * mean;
        const std = Math.sqrt(Math.max(0, variance));

        return {
            mean,
            std,
            min,
            max,
            range: max - min
        };
    }

    // Promise утилиты
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async timeout(promise, ms, errorMessage = 'Timeout') {
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), ms)
        );
        return Promise.race([promise, timeoutPromise]);
    }
}