class AudioInputModule {
    constructor(app) {
        this.app = app;
        this.utils = app.modules.utils;
        
        this.audioContext = null;
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.isRecording = false;
        this.recordedChunks = [];
        
        this.init();
    }

    init() {
        this.setupFileInput();
        this.setupMicrophone();
        this.setupDragAndDrop();
    }

    setupFileInput() {
        const fileInput = document.getElementById('fileInput');
        const fileDropZone = document.getElementById('fileDropZone');
        
        fileInput.addEventListener('change', (e) => {
            this.handleFiles(e.target.files);
        });

        fileDropZone.addEventListener('click', () => {
            fileInput.click();
        });
    }

    setupMicrophone() {
        // Инициализация будет выполнена при первом запросе доступа
    }

    setupDragAndDrop() {
        const dropZone = document.getElementById('fileDropZone');
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#0fccda';
            dropZone.style.background = 'rgba(15, 204, 218, 0.1)';
        });

        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#2a2a4a';
            dropZone.style.background = '';
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#2a2a4a';
            dropZone.style.background = '';
            
            const files = e.dataTransfer.files;
            this.handleFiles(files);
        });
    }

    async handleFiles(files) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';

        for (let file of files) {
            if (!this.isSupportedAudioFile(file)) {
                this.app.showNotification(`Файл ${file.name} не поддерживается`, 'warning');
                continue;
            }

            await this.processFile(file, fileList);
        }
    }

    isSupportedAudioFile(file) {
        const supportedTypes = [
            'audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg',
            'audio/x-wav', 'audio/mp3', 'application/json', 'text/plain'
        ];
        
        return supportedTypes.includes(file.type) || 
               file.name.match(/\.(wav|mp3|flac|ogg|json|txt)$/i);
    }

    async processFile(file, fileList) {
        const fileItem = this.utils.createElement('div', 'file-item');
        
        const fileInfo = this.utils.createElement('div', 'file-info');
        fileInfo.innerHTML = `
            <span class="file-name">${file.name}</span>
            <span class="file-size">${this.utils.formatFileSize(file.size)}</span>
        `;

        const fileActions = this.utils.createElement('div', 'file-actions');
        
        const playBtn = this.utils.createElement('button', 'file-action-btn', '▶');
        playBtn.title = 'Прослушать';
        playBtn.addEventListener('click', () => this.playFile(file));
        
        const processBtn = this.utils.createElement('button', 'file-action-btn', '⚡');
        processBtn.title = 'Обработать';
        processBtn.addEventListener('click', () => this.processFileForDecoding(file));
        
        const removeBtn = this.utils.createElement('button', 'file-action-btn', '🗑️');
        removeBtn.title = 'Удалить';
        removeBtn.addEventListener('click', () => fileItem.remove());

        fileActions.appendChild(playBtn);
        fileActions.appendChild(processBtn);
        fileActions.appendChild(removeBtn);
        
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(fileActions);
        fileList.appendChild(fileItem);

        // Автоматическая обработка аудиофайлов
        if (file.type.startsWith('audio/')) {
            await this.processFileForDecoding(file);
        }
    }

    async playFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const audioBuffer = await this.utils.decodeAudioData(arrayBuffer);
            
            const audioContext = this.utils.getAudioContext();
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
            
            source.onended = () => {
                this.app.showNotification('Воспроизведение завершено', 'success');
            };
            
        } catch (error) {
            this.app.showNotification('Ошибка воспроизведения файла', 'error');
            console.error('Playback error:', error);
        }
    }

    async processFileForDecoding(file) {
        try {
            this.app.updateStatus('processing', 'processing');
            
            const arrayBuffer = await file.arrayBuffer();
            
            if (file.type === 'application/json' || file.name.endsWith('.json')) {
                await this.handleJSONFile(arrayBuffer, file.name);
            } else if (file.type.startsWith('audio/')) {
                await this.handleAudioFile(arrayBuffer, file.name);
            }
            
            this.app.showNotification(`Файл ${file.name} обработан`, 'success');
            
        } catch (error) {
            this.app.showNotification(`Ошибка обработки ${file.name}`, 'error');
            console.error('File processing error:', error);
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    async handleAudioFile(arrayBuffer, filename) {
        // Отправляем сырые аудиоданные в основной пайплайн
        await this.app.processAudio(arrayBuffer, {
            type: 'audio',
            filename: filename,
            timestamp: new Date().toISOString()
        });
    }

    async handleJSONFile(arrayBuffer, filename) {
        try {
            const text = new TextDecoder().decode(arrayBuffer);
            const data = JSON.parse(text);
            
            // Обработка различных форматов JSON данных
            if (data.spectralData) {
                await this.handleSpectralData(data);
            } else if (data.audioFeatures) {
                await this.handleFeatureData(data);
            } else if (data.config) {
                await this.handleConfigData(data);
            } else {
                this.app.showNotification('Неизвестный формат JSON данных', 'warning');
            }
            
        } catch (error) {
            throw this.utils.handleError(error, 'Ошибка обработки JSON файла');
        }
    }

    async handleSpectralData(data) {
        // Обработка спектральных данных
        this.app.showNotification('Спектральные данные загружены', 'success');
        
        // Здесь можно добавить преобразование спектральных данных в формат для визуализации
        if (this.app.modules.visualization) {
            this.app.modules.visualization.updateSpectralData(data);
        }
    }

    async handleFeatureData(data) {
        // Обработка данных признаков
        this.app.showNotification('Данные признаков загружены', 'success');
        
        if (this.app.modules.aiIntegration && this.app.modules.aiIntegration.isConnected()) {
            const decodedText = await this.app.modules.aiIntegration.decodeFromFeatures(data);
            this.app.displayDecodedText(decodedText);
        }
    }

    async handleConfigData(data) {
        // Загрузка конфигурации
        this.app.showNotification('Конфигурация загружена', 'success');
        
        // Применение конфигурации к UI
        Object.keys(data.config).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = data.config[key];
                } else {
                    element.value = data.config[key];
                }
            }
        });
    }

    async startMicrophone() {
        try {
            this.app.updateStatus('audio', 'processing');
            
            if (!this.audioContext) {
                this.audioContext = this.utils.getAudioContext();
            }

            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: 44100,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Создаем процессор для захвата данных в реальном времени
            const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            
            let recordingBuffer = [];
            const maxRecordingTime = 30 * 44100; // 30 секунд
            
            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const copy = new Float32Array(inputData.length);
                copy.set(inputData);
                
                recordingBuffer.push(copy);
                
                // Ограничение размера буфера
                let totalLength = recordingBuffer.reduce((sum, arr) => sum + arr.length, 0);
                while (totalLength > maxRecordingTime && recordingBuffer.length > 1) {
                    recordingBuffer.shift();
                    totalLength = recordingBuffer.reduce((sum, arr) => sum + arr.length, 0);
                }
                
                // Отправка данных для визуализации в реальном времени
                if (this.app.modules.visualization) {
                    this.app.modules.visualization.updateRealtimeWaveform(inputData);
                }
            };

            source.connect(processor);
            processor.connect(this.audioContext.destination);
            
            this.mediaRecorder = {
                source: source,
                processor: processor,
                buffer: recordingBuffer,
                start: () => {
                    recordingBuffer = [];
                    this.isRecording = true;
                    this.app.showNotification('Запись с микрофона начата', 'success');
                },
                stop: async () => {
                    this.isRecording = false;
                    
                    // Объединяем все чанки в один массив
                    const totalLength = recordingBuffer.reduce((sum, arr) => sum + arr.length, 0);
                    const combined = new Float32Array(totalLength);
                    
                    let offset = 0;
                    for (const chunk of recordingBuffer) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }
                    
                    // Создаем AudioBuffer
                    const audioBuffer = this.audioContext.createBuffer(1, combined.length, 44100);
                    audioBuffer.getChannelData(0).set(combined);
                    
                    // Конвертируем в ArrayBuffer для обработки
                    const wavBuffer = this.audioBufferToWav(audioBuffer);
                    
                    await this.app.processAudio(wavBuffer, {
                        type: 'microphone',
                        duration: combined.length / 44100,
                        timestamp: new Date().toISOString()
                    });
                    
                    this.app.showNotification('Запись завершена и обработана', 'success');
                }
            };

            this.mediaRecorder.start();
            this.app.updateStatus('audio', 'active');
            
        } catch (error) {
            this.app.updateStatus('audio', 'inactive');
            
            if (error.name === 'NotAllowedError') {
                this.app.showNotification('Доступ к микрофону запрещен', 'error');
            } else if (error.name === 'NotFoundError') {
                this.app.showNotification('Микрофон не найден', 'error');
            } else {
                this.app.showNotification('Ошибка доступа к микрофону', 'error');
            }
            
            console.error('Microphone access error:', error);
        }
    }

    stopMicrophone() {
        if (this.mediaRecorder) {
            this.mediaRecorder.stop();
            
            if (this.mediaRecorder.source) {
                this.mediaRecorder.source.disconnect();
            }
            if (this.mediaRecorder.processor) {
                this.mediaRecorder.processor.disconnect();
            }
            
            this.mediaRecorder = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        this.isRecording = false;
        this.app.updateStatus('audio', 'inactive');
    }

    audioBufferToWav(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        
        const buffer = new ArrayBuffer(44 + length * numChannels * 2);
        const view = new DataView(buffer);
        
        // WAV header
        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };
        
        writeString(0, 'RIFF');
        view.setUint32(4, 36 + length * numChannels * 2, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * 2, true);
        view.setUint16(32, numChannels * 2, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, length * numChannels * 2, true);
        
        // Audio data
        const offset = 44;
        for (let i = 0; i < length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
                view.setInt16(offset + (i * numChannels + channel) * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            }
        }
        
        return buffer;
    }

    showFileModal() {
        const modal = document.getElementById('fileModal');
        modal.style.display = 'block';
        
        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
        
        window.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }

    // Методы для работы с удаленными аудио источниками
    async loadRemoteAudio(url) {
        try {
            this.app.updateStatus('processing', 'processing');
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            
            await this.app.processAudio(arrayBuffer, {
                type: 'remote',
                url: url,
                timestamp: new Date().toISOString()
            });
            
            this.app.showNotification(`Аудио с ${url} загружено`, 'success');
            
        } catch (error) {
            this.app.showNotification(`Ошибка загрузки ${url}`, 'error');
            console.error('Remote audio loading error:', error);
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    // Утилиты для проверки поддержки форматов
    getSupportedFormats() {
        const audio = document.createElement('audio');
        const formats = {
            wav: !!audio.canPlayType('audio/wav'),
            mp3: !!audio.canPlayType('audio/mpeg'),
            ogg: !!audio.canPlayType('audio/ogg'),
            flac: !!audio.canPlayType('audio/flac')
        };
        
        return formats;
    }

    // Очистка ресурсов
    cleanup() {
        this.stopMicrophone();
        
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }
}