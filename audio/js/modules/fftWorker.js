// FFT Web Worker для тяжелых вычислений
self.importScripts('js/modules/utils.js');

const utils = {
    nextPowerOfTwo: (n) => Math.pow(2, Math.ceil(Math.log2(n))),
    
    hannWindow: (length) => {
        const window = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
        }
        return window;
    }
};

// FFT реализация
function fft(real, imag) {
    const n = real.length;
    if (n <= 1) return;

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

    fft(evenReal, evenImag);
    fft(oddReal, oddImag);

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

function computeMagnitudeSpectrum(real, imag) {
    const n = real.length;
    const magnitude = new Float32Array(n/2 + 1);
    
    for (let i = 0; i <= n/2; i++) {
        magnitude[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    
    return magnitude;
}

self.onmessage = function(e) {
    const { type, data, sampleRate, ...params } = e.data;

    try {
        switch (type) {
            case 'computeSpectrogram':
                const spectrogram = computeSpectrogram(data, sampleRate, params.fftSize, params.hopSize);
                self.postMessage({ type: 'spectrogram', spectrogram: spectrogram });
                break;

            case 'computeHilbertEnvelope':
                const envelope = computeHilbertEnvelope(data);
                self.postMessage({ type: 'hilbertEnvelope', envelope: envelope });
                break;

            case 'computeSpectralCentroid':
                const centroid = computeSpectralCentroid(data, sampleRate);
                self.postMessage({ type: 'spectralCentroid', centroid: centroid });
                break;

            case 'bandpassFilter':
                const filtered = applyBandpassFilter(data, sampleRate, params.lowFreq, params.highFreq);
                self.postMessage({ type: 'filtered', data: filtered });
                break;

            case 'computeMFCC':
                const mfcc = computeMFCC(data, sampleRate, params.numCoefficients);
                self.postMessage({ type: 'mfcc', mfcc: mfcc });
                break;

            // Добавьте другие case по мере необходимости
        }
    } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
    }
};

function computeSpectrogram(data, sampleRate, fftSize = 1024, hopSize = 256) {
    const numFrames = Math.floor((data.length - fftSize) / hopSize) + 1;
    const spectrogram = [];
    const window = utils.hannWindow(fftSize);

    for (let i = 0; i < numFrames; i++) {
        const frame = data.slice(i * hopSize, i * hopSize + fftSize);
        
        // Apply window
        for (let j = 0; j < fftSize; j++) {
            frame[j] *= window[j];
        }

        const real = new Float32Array(frame);
        const imag = new Float32Array(fftSize).fill(0);
        
        fft(real, imag);
        const magnitude = computeMagnitudeSpectrum(real, imag);
        
        spectrogram.push(Array.from(magnitude));
    }

    return spectrogram;
}

function computeHilbertEnvelope(data) {
    const n = data.length;
    const real = new Float32Array(data);
    const imag = new Float32Array(n).fill(0);
    
    fft(real, imag);
    
    // Hilbert transform in frequency domain
    for (let i = 1; i < n/2; i++) {
        real[i] *= 2;
        imag[i] *= 2;
    }
    for (let i = n/2 + 1; i < n; i++) {
        real[i] = 0;
        imag[i] = 0;
    }
    
    // Inverse FFT
    for (let i = 0; i < n; i++) {
        imag[i] = -imag[i];
    }
    fft(real, imag);
    for (let i = 0; i < n; i++) {
        real[i] /= n;
        imag[i] = -imag[i] / n;
    }
    
    // Compute envelope
    const envelope = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        envelope[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
    }
    
    return envelope;
}

// Реализуйте остальные функции по аналогии...