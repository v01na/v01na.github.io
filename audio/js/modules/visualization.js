class VisualizationModule {
    constructor(app) {
        this.app = app;
        this.utils = app.modules.utils;
        
        this.canvases = {};
        this.contexts = {};
        this.isAnimating = false;
        this.animationFrameId = null;
        
        this.waterfallData = [];
        this.maxWaterfallLength = 200;
        
        this.colorSchemes = {
            spectral: [
                '#00008B', '#0000FF', '#0080FF', '#00FFFF', 
                '#00FF80', '#FFFF00', '#FF8000', '#FF0000', '#800000'
            ],
            grayscale: [
                '#000000', '#1A1A1A', '#333333', '#4D4D4D',
                '#666666', '#808080', '#999999', '#B3B3B3', '#CCCCCC', '#E6E6E6', '#FFFFFF'
            ],
            thermal: [
                '#000000', '#400000', '#800000', '#C00000',
                '#FF0000', '#FF4000', '#FF8000', '#FFC000', '#FFFF00'
            ]
        };
        
        this.currentColorScheme = 'spectral';
        
        this.init();
    }

    init() {
        this.initializeCanvases();
        this.setupEventListeners();
        this.startAnimationLoop();
    }

    initializeCanvases() {
        // Основные канвасы
        this.canvases.waveform = document.getElementById('waveformCanvas');
        this.canvases.waterfall = document.getElementById('waterfallCanvas');
        this.canvases.envelope = document.getElementById('envelopeCanvas');
        this.canvases.spectrum = document.getElementById('spectrumCanvas');
        
        // Контексты
        Object.keys(this.canvases).forEach(key => {
            if (this.canvases[key]) {
                this.contexts[key] = this.canvases[key].getContext('2d');
                
                // Устанавливаем размеры канвасов
                this.setCanvasSize(this.canvases[key]);
            }
        });

        // Обработчик изменения размера окна
        window.addEventListener('resize', () => {
            Object.keys(this.canvases).forEach(key => {
                if (this.canvases[key]) {
                    this.setCanvasSize(this.canvases[key]);
                }
            });
        });
    }

    setCanvasSize(canvas) {
        const container = canvas.parentElement;
        if (container) {
            const rect = container.getBoundingClientRect();
            canvas.width = Math.floor(rect.width * 0.95);
            canvas.height = canvas.getAttribute('data-height') || 
                           parseInt(canvas.getAttribute('height')) || 
                           200;
        }
    }

    setupEventListeners() {
        // Обработчики для переключения цветовых схем
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'c') {
                this.cycleColorScheme();
            }
        });
    }

    cycleColorScheme() {
        const schemes = Object.keys(this.colorSchemes);
        const currentIndex = schemes.indexOf(this.currentColorScheme);
        const nextIndex = (currentIndex + 1) % schemes.length;
        this.currentColorScheme = schemes[nextIndex];
        this.app.showNotification(`Цветовая схема: ${this.currentColorScheme}`, 'success');
    }

    startAnimationLoop() {
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        
        const animate = () => {
            this.clearAllCanvases();
            
            // Обновляем все активные визуализации
            if (this.waterfallData.length > 0) {
                this.drawWaterfall();
            }
            
            // Здесь можно добавить другие анимированные элементы
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        animate();
    }

    stopAnimationLoop() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.isAnimating = false;
    }

    clearAllCanvases() {
        Object.keys(this.contexts).forEach(key => {
            this.clearCanvas(this.contexts[key], this.canvases[key]);
        });
    }

    clearCanvas(ctx, canvas) {
        if (!ctx || !canvas) return;
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    updateAll(processedAudio, features) {
        this.drawWaveform(processedAudio.data, processedAudio.sampleRate);
        this.drawEnvelopes(features.features);
        this.drawSpectrum(features.features.spectral?.spectrogram);
        
        // Обновляем waterfall если есть данные спектрограммы
        if (features.features.spectral?.spectrogram) {
            this.updateWaterfall(features.features.spectral.spectrogram);
        }
    }

    drawWaveform(audioData, sampleRate) {
        const canvas = this.canvases.waveform;
        const ctx = this.contexts.waveform;
        
        if (!canvas || !ctx || !audioData || audioData.length === 0) return;

        this.clearCanvas(ctx, canvas);
        
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;
        
        ctx.strokeStyle = '#0fccda';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const samplesToDraw = Math.min(audioData.length, width);
        const step = Math.ceil(audioData.length / width);
        
        for (let x = 0; x < width; x++) {
            const index = Math.floor(x * step);
            if (index >= audioData.length) break;
            
            const value = audioData[index];
            const y = centerY + (value * centerY * 0.8);
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Добавляем информационный текст
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.fillText(`Длительность: ${(audioData.length / sampleRate).toFixed(2)}с | Samples: ${audioData.length}`, 10, 20);
    }

    drawEnvelopes(features) {
        const canvas = this.canvases.envelope;
        const ctx = this.contexts.envelope;
        
        if (!canvas || !ctx) return;

        this.clearCanvas(ctx, canvas);
        
        const width = canvas.width;
        const height = canvas.height;
        
        const envelopes = [];
        
        if (features.temporal?.rms) {
            envelopes.push({
                data: features.temporal.rms,
                color: '#00ff88',
                label: 'RMS'
            });
        }
        
        if (features.temporal?.hilbert) {
            envelopes.push({
                data: features.temporal.hilbert,
                color: '#ff4444',
                label: 'Hilbert'
            });
        }
        
        if (features.spectral?.centroid) {
            envelopes.push({
                data: features.spectral.centroid,
                color: '#8888ff',
                label: 'Centroid'
            });
        }
        
        envelopes.forEach((envelope, index) => {
            this.drawEnvelope(ctx, envelope, width, height, index, envelopes.length);
        });
        
        // Легенда
        this.drawLegend(ctx, envelopes);
    }

    drawEnvelope(ctx, envelope, width, height, index, totalEnvelopes) {
        const { data, color } = envelope;
        if (!data || data.length === 0) return;
        
        const sectionHeight = height / totalEnvelopes;
        const yOffset = index * sectionHeight;
        const padding = 10;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        
        for (let x = 0; x < width; x++) {
            const dataIndex = Math.floor((x / width) * data.length);
            if (dataIndex >= data.length) break;
            
            const value = data[dataIndex];
            const y = yOffset + padding + (1 - value) * (sectionHeight - padding * 2);
            
            if (x === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        
        ctx.stroke();
        
        // Подпись огибающей
        ctx.fillStyle = color;
        ctx.font = '12px Arial';
        ctx.fillText(envelope.label, 10, yOffset + 20);
    }

    drawLegend(ctx, envelopes) {
        const legendX = 10;
        const legendY = this.canvases.envelope.height - 30;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(legendX, legendY, 150, 25);
        
        envelopes.forEach((envelope, index) => {
            ctx.fillStyle = envelope.color;
            ctx.fillRect(legendX + 5 + index * 40, legendY + 5, 10, 10);
            
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            ctx.fillText(envelope.label, legendX + 20 + index * 40, legendY + 13);
        });
    }

    drawSpectrum(spectrogram) {
        const canvas = this.canvases.spectrum;
        const ctx = this.contexts.spectrum;
        
        if (!canvas || !ctx || !spectrogram || !spectrogram.data) return;

        this.clearCanvas(ctx, canvas);
        
        const width = canvas.width;
        const height = canvas.height;
        const data = spectrogram.data;
        
        if (data.length === 0) return;
        
        const timeBins = data.length;
        const freqBins = data[0].length;
        
        const binWidth = width / timeBins;
        const binHeight = height / freqBins;
        
        // Находим максимальное значение для нормализации
        let maxVal = 0;
        for (let t = 0; t < timeBins; t++) {
            for (let f = 0; f < freqBins; f++) {
                maxVal = Math.max(maxVal, data[t][f]);
            }
        }
        
        if (maxVal === 0) return;
        
        // Рисуем спектрограмму
        for (let t = 0; t < timeBins; t++) {
            for (let f = 0; f < freqBins; f++) {
                const intensity = data[t][f] / maxVal;
                const color = this.getColorForIntensity(intensity);
                
                ctx.fillStyle = color;
                ctx.fillRect(
                    t * binWidth,
                    height - (f + 1) * binHeight,
                    binWidth,
                    binHeight
                );
            }
        }
        
        // Добавляем оси и подписи
        this.drawSpectrumAxes(ctx, width, height, spectrogram);
    }

    drawSpectrumAxes(ctx, width, height, spectrogram) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, width, height);
        
        // Подписи частот
        if (spectrogram.frequencies && spectrogram.frequencies.length > 0) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px Arial';
            
            const maxFreq = Math.max(...spectrogram.frequencies);
            for (let i = 0; i <= 4; i++) {
                const freq = (i * maxFreq) / 4;
                const y = height - (i * height) / 4;
                
                ctx.fillText(this.utils.formatFrequency(freq), width - 50, y - 5);
                ctx.beginPath();
                ctx.moveTo(width - 5, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
        }
        
        // Подпись времени
        if (spectrogram.times && spectrogram.times.length > 0) {
            const totalTime = Math.max(...spectrogram.times);
            ctx.fillText(`Время: ${totalTime.toFixed(2)}с`, 10, 15);
        }
    }

    updateWaterfall(spectrogram) {
        if (!spectrogram || !spectrogram.data) return;
        
        // Берем последний временной срез спектрограммы
        const latestSlice = spectrogram.data[spectrogram.data.length - 1];
        if (!latestSlice) return;
        
        // Добавляем новый срез в начало waterfall
        this.waterfallData.unshift(latestSlice);
        
        // Ограничиваем длину waterfall
        if (this.waterfallData.length > this.maxWaterfallLength) {
            this.waterfallData = this.waterfallData.slice(0, this.maxWaterfallLength);
        }
    }

    drawWaterfall() {
        const canvas = this.canvases.waterfall;
        const ctx = this.contexts.waterfall;
        
        if (!canvas || !ctx || this.waterfallData.length === 0) return;

        this.clearCanvas(ctx, canvas);
        
        const width = canvas.width;
        const height = canvas.height;
        
        const timeBins = this.waterfallData.length;
        const freqBins = this.waterfallData[0].length;
        
        const binWidth = width;
        const binHeight = height / timeBins;
        
        // Находим максимальное значение для нормализации
        let maxVal = 0;
        for (let t = 0; t < timeBins; t++) {
            for (let f = 0; f < freqBins; f++) {
                maxVal = Math.max(maxVal, this.waterfallData[t][f]);
            }
        }
        
        if (maxVal === 0) return;
        
        // Рисуем waterfall (время идет сверху вниз)
        for (let t = 0; t < timeBins; t++) {
            const slice = this.waterfallData[t];
            if (!slice) continue;
            
            for (let f = 0; f < freqBins; f++) {
                const intensity = slice[f] / maxVal;
                const color = this.getColorForIntensity(intensity);
                
                ctx.fillStyle = color;
                ctx.fillRect(
                    0,
                    t * binHeight,
                    width,
                    binHeight
                );
                
                // Прерываем после отрисовки одного среза для waterfall
                break;
            }
        }
        
        // Добавляем подписи для waterfall
        this.drawWaterfallLabels(ctx, width, height);
    }

    drawWaterfallLabels(ctx, width, height) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        
        // Время (по вертикали)
        const totalTime = this.waterfallData.length; // В условных единицах времени
        for (let i = 0; i <= 4; i++) {
            const time = (i * totalTime) / 4;
            const y = (i * height) / 4;
            
            ctx.fillText(`${time.toFixed(1)}с`, 5, y + 15);
        }
        
        // Заголовок
        ctx.fillText('Waterfall Display', width - 120, 20);
        ctx.fillText(`Глубина: ${this.waterfallData.length} срезов`, width - 150, 40);
    }

    getColorForIntensity(intensity) {
        const scheme = this.colorSchemes[this.currentColorScheme];
        const index = Math.floor(intensity * (scheme.length - 1));
        return scheme[Math.max(0, Math.min(scheme.length - 1, index))];
    }

    updateRealtimeWaveform(data) {
        // Для реального времени обновляем только waveform
        this.drawWaveform(data, 44100); // Предполагаем sampleRate 44100 для микрофона
    }

    updateSDRWaterfall(samples, centerFreq, sampleRate) {
        // Создаем простую спектрограмму из SDR данных
        const spectrogramSlice = this.computeRealtimeSpectrum(samples);
        
        // Добавляем в waterfall
        this.waterfallData.unshift(spectrogramSlice);
        
        if (this.waterfallData.length > this.maxWaterfallLength) {
            this.waterfallData = this.waterfallData.slice(0, this.maxWaterfallLength);
        }
        
        // Обновляем подписи частот
        if (this.canvases.waterfall) {
            const ctx = this.contexts.waterfall;
            if (ctx) {
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Arial';
                ctx.fillText(`Центр: ${this.utils.formatFrequency(centerFreq)}`, 10, 20);
                ctx.fillText(`Ширина: ${this.utils.formatFrequency(sampleRate)}`, 10, 40);
            }
        }
    }

    computeRealtimeSpectrum(samples) {
        // Упрощенный расчет спектра для реального времени
        const fftSize = 256;
        const spectrum = new Array(fftSize / 2).fill(0);
        
        // Простая имитация спектра (в реальном приложении здесь будет FFT)
        for (let i = 0; i < spectrum.length; i++) {
            spectrum[i] = Math.random() * 0.1 + Math.abs(samples[i % samples.length]) * 0.9;
        }
        
        return spectrum;
    }

    updateSpectralData(spectralData) {
        // Обновление визуализаций из загруженных спектральных данных
        if (spectralData.waterfall) {
            this.waterfallData = spectralData.waterfall.slice(-this.maxWaterfallLength);
        }
        
        if (spectralData.spectrogram) {
            this.drawSpectrum(spectralData.spectrogram);
        }
        
        if (spectralData.waveform) {
            this.drawWaveform(spectralData.waveform.data, spectralData.waveform.sampleRate);
        }
    }

    // Методы для управления визуализацией
    setWaterfallLength(length) {
        this.maxWaterfallLength = Math.max(10, Math.min(1000, length));
        this.waterfallData = this.waterfallData.slice(0, this.maxWaterfallLength);
    }

    setColorScheme(schemeName) {
        if (this.colorSchemes[schemeName]) {
            this.currentColorScheme = schemeName;
        }
    }

    getVisualizationStats() {
        return {
            waterfallFrames: this.waterfallData.length,
            maxWaterfallFrames: this.maxWaterfallLength,
            colorScheme: this.currentColorScheme,
            isAnimating: this.isAnimating,
            activeCanvases: Object.keys(this.canvases).filter(key => this.canvases[key]).length
        };
    }

    // Экспорт данных визуализации
    exportVisualizationData() {
        return {
            waterfall: this.waterfallData,
            timestamp: new Date().toISOString(),
            stats: this.getVisualizationStats()
        };
    }

    // Очистка ресурсов
    cleanup() {
        this.stopAnimationLoop();
        this.waterfallData = [];
        
        Object.keys(this.contexts).forEach(key => {
            this.contexts[key] = null;
        });
        
        this.canvases = {};
        this.contexts = {};
    }
}