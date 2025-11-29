class FeatureExtractionModule {
    constructor(app) {
        this.app = app;
        this.utils = app.modules.utils;
    }

    async extract(processedAudio, config) {
        const features = {
            temporal: {},
            spectral: {},
            cepstral: {}
        };

        try {
            // Временные признаки
            if (config.extractRMS) {
                features.temporal.rms = this.extractRMSEnvelope(
                    processedAudio.data, 
                    processedAudio.sampleRate, 
                    config.envelopeSampleRate
                );
            }

            if (config.extractHilbert) {
                features.temporal.hilbert = await this.extractHilbertEnvelope(
                    processedAudio.data,
                    processedAudio.sampleRate,
                    config.envelopeSampleRate
                );
            }

            // Спектральные признаки
            if (config.extractCentroid) {
                features.spectral.centroid = await this.extractSpectralCentroid(
                    processedAudio.data,
                    processedAudio.sampleRate,
                    config.envelopeSampleRate
                );
            }

            features.spectral.spectrogram = await this.computeSpectrogram(
                processedAudio.data,
                processedAudio.sampleRate,
                config.fftSize
            );

            // Дополнительные признаки
            features.temporal.zeroCrossingRate = this.extractZeroCrossingRate(processedAudio.data);
            features.spectral.rolloff = await this.extractSpectralRolloff(processedAudio.data, processedAudio.sampleRate);
            features.spectral.flux = await this.extractSpectralFlux(processedAudio.data, processedAudio.sampleRate);

            // MFCC коэффициенты
            features.cepstral.mfcc = await this.extractMFCC(processedAudio.data, processedAudio.sampleRate);

            return {
                features: features,
                metadata: {
                    sampleRate: processedAudio.sampleRate,
                    envelopeSampleRate: config.envelopeSampleRate,
                    duration: processedAudio.data.length / processedAudio.sampleRate
                }
            };

        } catch (error) {
            throw this.utils.handleError(error, 'Ошибка извлечения признаков');
        }
    }

    extractRMSEnvelope(data, sampleRate, envelopeSampleRate) {
        const hopSize = Math.floor(sampleRate / envelopeSampleRate);
        const frameSize = hopSize * 2;
        const numFrames = Math.floor(data.length / hopSize);
        const envelope = new Float32Array(numFrames);

        for (let i = 0; i < numFrames; i++) {
            const start = i * hopSize;
            const end = Math.min(start + frameSize, data.length);
            let sum = 0;

            for (let j = start; j < end; j++) {
                sum += data[j] * data[j];
            }

            envelope[i] = Math.sqrt(sum / (end - start));
        }

        return this.utils.normalizeArray(envelope);
    }

    async extractHilbertEnvelope(data, sampleRate, envelopeSampleRate) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'hilbertEnvelope') {
                    const envelope = new Float32Array(e.data.envelope);
                    const resampled = this.utils.resampleAudio(
                        envelope, 
                        sampleRate, 
                        envelopeSampleRate
                    );
                    resolve(this.utils.normalizeArray(resampled));
                }
            };

            worker.postMessage({
                type: 'computeHilbertEnvelope',
                data: data,
                sampleRate: sampleRate
            });
        });
    }

    async extractSpectralCentroid(data, sampleRate, envelopeSampleRate) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'spectralCentroid') {
                    const centroid = new Float32Array(e.data.centroid);
                    const resampled = this.utils.resampleAudio(
                        centroid, 
                        sampleRate / 256, // предполагаемая частота кадров спектра
                        envelopeSampleRate
                    );
                    resolve(this.utils.normalizeArray(resampled));
                }
            };

            worker.postMessage({
                type: 'computeSpectralCentroid',
                data: data,
                sampleRate: sampleRate
            });
        });
    }

    async computeSpectrogram(data, sampleRate, fftSize = 1024) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'spectrogram') {
                    resolve({
                        data: e.data.spectrogram,
                        frequencies: e.data.frequencies,
                        times: e.data.times
                    });
                }
            };

            worker.postMessage({
                type: 'computeSpectrogram',
                data: data,
                sampleRate: sampleRate,
                fftSize: fftSize,
                hopSize: Math.floor(fftSize / 4)
            });
        });
    }

    extractZeroCrossingRate(data) {
        let crossings = 0;
        for (let i = 1; i < data.length; i++) {
            if ((data[i] >= 0 && data[i-1] < 0) || (data[i] < 0 && data[i-1] >= 0)) {
                crossings++;
            }
        }
        return crossings / data.length;
    }

    async extractSpectralRolloff(data, sampleRate, threshold = 0.85) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'spectralRolloff') {
                    resolve(e.data.rolloff);
                }
            };

            worker.postMessage({
                type: 'computeSpectralRolloff',
                data: data,
                sampleRate: sampleRate,
                threshold: threshold
            });
        });
    }

    async extractSpectralFlux(data, sampleRate) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'spectralFlux') {
                    resolve(e.data.flux);
                }
            };

            worker.postMessage({
                type: 'computeSpectralFlux',
                data: data,
                sampleRate: sampleRate
            });
        });
    }

    async extractMFCC(data, sampleRate, numCoefficients = 13) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/fftWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'mfcc') {
                    resolve(e.data.mfcc);
                }
            };

            worker.postMessage({
                type: 'computeMFCC',
                data: data,
                sampleRate: sampleRate,
                numCoefficients: numCoefficients
            });
        });
    }

    async computeDTWDistance(sequence1, sequence2) {
        return new Promise((resolve) => {
            const worker = this.utils.createWorker('js/workers/dtwWorker.js');
            
            worker.onmessage = (e) => {
                if (e.data.type === 'dtwDistance') {
                    resolve(e.data.distance);
                }
            };

            worker.postMessage({
                type: 'computeDTW',
                sequence1: sequence1,
                sequence2: sequence2
            });
        });
    }

    combineFeatures(featureSet) {
        const features = [];
        
        if (featureSet.temporal.rms) {
            features.push(...featureSet.temporal.rms);
        }
        
        if (featureSet.temporal.hilbert) {
            features.push(...featureSet.temporal.hilbert);
        }
        
        if (featureSet.spectral.centroid) {
            features.push(...featureSet.spectral.centroid);
        }

        return this.utils.zNormalize(new Float32Array(features));
    }

    extractFrameFeatures(frame, sampleRate) {
        return {
            rms: this.calculateFrameRMS(frame),
            spectralCentroid: this.calculateFrameSpectralCentroid(frame, sampleRate),
            zeroCrossingRate: this.calculateFrameZeroCrossingRate(frame)
        };
    }

    calculateFrameRMS(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
            sum += frame[i] * frame[i];
        }
        return Math.sqrt(sum / frame.length);
    }

    calculateFrameSpectralCentroid(frame, sampleRate) {
        // Упрощенный расчет для одного кадра
        const fftSize = frame.length;
        const real = new Float32Array(frame);
        const imag = new Float32Array(fftSize).fill(0);
        
        this.fft(real, imag);
        
        let weightedSum = 0;
        let sum = 0;
        
        for (let i = 0; i < fftSize / 2; i++) {
            const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
            const frequency = i * sampleRate / fftSize;
            weightedSum += magnitude * frequency;
            sum += magnitude;
        }
        
        return sum > 0 ? weightedSum / sum : 0;
    }

    calculateFrameZeroCrossingRate(frame) {
        let crossings = 0;
        for (let i = 1; i < frame.length; i++) {
            if ((frame[i] >= 0 && frame[i-1] < 0) || (frame[i] < 0 && frame[i-1] >= 0)) {
                crossings++;
            }
        }
        return crossings / frame.length;
    }

    // Базовая реализация FFT (для демонстрации)
    fft(real, imag) {
        const n = real.length;
        if (n <= 1) return;

        // Разделение на четные и нечетные
        const evenReal = new Float32Array(n/2);
        const evenImag = new Float32Array(n/2);
        const oddReal = new Float32Array(n/2);
        const oddImag = new Float32Array(n/2);

        for (let i = 0; i < n/2; i++) {
            evenReal[i] = real[2*i];
            evenImag[i] = imag[2*i];
            oddReal[i] = real[2*i+1];
            oddImag[i] = imag[2*i+1];
        }

        // Рекурсивный вызов
        this.fft(evenReal, evenImag);
        this.fft(oddReal, oddImag);

        // Объединение результатов
        for (let k = 0; k < n/2; k++) {
            const angle = -2 * Math.PI * k / n;
            const twiddleReal = Math.cos(angle);
            const twiddleImag = Math.sin(angle);

            const realPart = twiddleReal * oddReal[k] - twiddleImag * oddImag[k];
            const imagPart = twiddleReal * oddImag[k] + twiddleImag * oddReal[k];

            real[k] = evenReal[k] + realPart;
            imag[k] = evenImag[k] + imagPart;
            real[k + n/2] = evenReal[k] - realPart;
            imag[k + n/2] = evenImag[k] - imagPart;
        }
    }
}