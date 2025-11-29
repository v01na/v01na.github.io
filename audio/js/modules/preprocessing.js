class PreprocessingModule {
    constructor(app) {
        this.app = app;
        this.utils = app.modules.utils;
    }

    async process(audioData, config) {
        try {
            const audioBuffer = await this.utils.decodeAudioData(audioData);
            const monoData = this.utils.convertToMono(audioBuffer);
            
            let processedData = monoData.slice();

            // Применяем цепочку обработки
            if (config.dcRemoval) {
                processedData = this.removeDCOffset(processedData);
            }

            if (config.preEmphasis) {
                processedData = this.applyPreEmphasis(processedData, 0.97);
            }

            if (config.highPass > 0 || config.lowPass < 20000) {
                processedData = await this.applyBandpassFilter(processedData, audioBuffer.sampleRate, config.highPass, config.lowPass);
            }

            if (config.noiseGate) {
                processedData = this.applyNoiseGate(processedData, config.noiseThreshold);
            }

            return {
                data: processedData,
                sampleRate: audioBuffer.sampleRate,
                originalLength: audioBuffer.length,
                processedLength: processedData.length
            };

        } catch (error) {
            throw this.utils.handleError(error, 'Ошибка предобработки аудио');
        }
    }

    removeDCOffset(data) {
        const mean = data.reduce((sum, value) => sum + value, 0) / data.length;
        return data.map(value => value - mean);
    }

    applyPreEmphasis(data, coefficient) {
        const result = new Float32Array(data.length);
        result[0] = data[0];

        for (let i = 1; i < data.length; i++) {
            result[i] = data[i] - coefficient * data[i - 1];
        }

        return result;
    }

    async applyBandpassFilter(data, sampleRate, lowFreq, highFreq) {
        return new Promise((resolve) => {
            // Используем Web Worker для FFT-фильтрации
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'filtered') {
                    resolve(new Float32Array(e.data.data));
                }
            };

            worker.postMessage({
                type: 'bandpassFilter',
                data: data,
                sampleRate: sampleRate,
                lowFreq: lowFreq,
                highFreq: highFreq
            });
        });
    }

    applyNoiseGate(data, threshold) {
        const rms = this.calculateRMS(data);
        const gateThreshold = rms * threshold;
        const result = new Float32Array(data.length);

        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) >= gateThreshold) {
                result[i] = data[i];
            } else {
                result[i] = 0;
            }
        }

        return result;
    }

    calculateRMS(data) {
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
            sum += data[i] * data[i];
        }
        return Math.sqrt(sum / data.length);
    }

    async spectralSubtraction(data, sampleRate, noiseProfile) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'spectralSubtraction') {
                    resolve(new Float32Array(e.data.data));
                }
            };

            worker.postMessage({
                type: 'spectralSubtraction',
                data: data,
                sampleRate: sampleRate,
                noiseProfile: noiseProfile
            });
        });
    }

    async learnNoiseProfile(data, sampleRate) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'noiseProfile') {
                    resolve(e.data.profile);
                }
            };

            worker.postMessage({
                type: 'learnNoiseProfile',
                data: data,
                sampleRate: sampleRate
            });
        });
    }

    normalizeVolume(data, targetRMS = 0.1) {
        const currentRMS = this.calculateRMS(data);
        const gain = targetRMS / (currentRMS + 1e-9);
        
        const result = new Float32Array(data.length);
        for (let i = 0; i < data.length; i++) {
            result[i] = Math.max(-1, Math.min(1, data[i] * gain));
        }
        
        return result;
    }

    trimSilence(data, threshold = 0.01) {
        let start = 0;
        let end = data.length - 1;

        // Находим начало не тишины
        while (start < data.length && Math.abs(data[start]) < threshold) {
            start++;
        }

        // Находим конец не тишины
        while (end > 0 && Math.abs(data[end]) < threshold) {
            end--;
        }

        if (start >= end) return new Float32Array(0);

        return data.slice(start, end + 1);
    }

    frameSignal(data, frameSize, hopSize) {
        const frames = [];
        for (let i = 0; i <= data.length - frameSize; i += hopSize) {
            frames.push(data.slice(i, i + frameSize));
        }
        return frames;
    }

    async computeSpectrogram(data, sampleRate, frameSize = 1024, hopSize = 256) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'spectrogram') {
                    resolve(e.data.spectrogram);
                }
            };

            worker.postMessage({
                type: 'computeSpectrogram',
                data: data,
                sampleRate: sampleRate,
                frameSize: frameSize,
                hopSize: hopSize
            });
        });
    }
}