class SDRInputModule {
    constructor(app) {
        this.app = app;
        this.utils = app.modules.utils;
        
        this.sdrConnections = new Map();
        this.remoteRadios = new Map();
        this.isConnected = false;
        
        this.init();
    }

    init() {
        this.loadSDRConfigurations();
        this.loadRemoteRadios();
    }

    async showSDRConnectionDialog() {
        const modal = this.createModal('Подключение SDR приемника');
        
        const content = this.utils.createElement('div', 'sdr-connection-form');
        content.innerHTML = `
            <div class="control-group">
                <label class="control-label">Тип SDR приемника:</label>
                <select id="sdrType" class="control-input">
                    <option value="rtlsdr">RTL-SDR</option>
                    <option value="hackrf">HackRF</option>
                    <option value="usrp">USRP</option>
                    <option value="sdrplay">SDRplay</option>
                    <option value="custom">Пользовательский</option>
                </select>
            </div>
            
            <div class="control-group">
                <label class="control-label">Адрес подключения:</label>
                <input type="text" id="sdrAddress" class="control-input" 
                       placeholder="rtl_tcp://localhost:1234" value="rtl_tcp://localhost:1234">
            </div>
            
            <div class="control-group">
                <label class="control-label">Частота (Hz):</label>
                <input type="number" id="sdrFrequency" class="control-input" 
                       value="100000000" min="0" max="2000000000">
            </div>
            
            <div class="control-group">
                <label class="control-label">Ширина полосы (Hz):</label>
                <input type="number" id="sdrBandwidth" class="control-input" 
                       value="2400000" min="100000" max="10000000">
            </div>
            
            <div class="control-group">
                <label class="control-label">Усиление (dB):</label>
                <input type="number" id="sdrGain" class="control-input" 
                       value="20" min="0" max="50" step="0.1">
            </div>
            
            <div class="action-buttons">
                <button id="btnTestSDR" class="btn btn-secondary">Тест подключения</button>
                <button id="btnConnectSDR" class="btn btn-primary">Подключиться</button>
            </div>
        `;
        
        modal.querySelector('.modal-content').appendChild(content);
        
        // Обработчики событий
        modal.querySelector('#btnTestSDR').addEventListener('click', () => {
            this.testSDRConnection(this.getSDRConfigFromForm());
        });
        
        modal.querySelector('#btnConnectSDR').addEventListener('click', () => {
            this.connectSDR(this.getSDRConfigFromForm());
        });
    }

    getSDRConfigFromForm() {
        return {
            type: document.getElementById('sdrType').value,
            address: document.getElementById('sdrAddress').value,
            frequency: parseInt(document.getElementById('sdrFrequency').value),
            bandwidth: parseInt(document.getElementById('sdrBandwidth').value),
            gain: parseFloat(document.getElementById('sdrGain').value)
        };
    }

    async testSDRConnection(config) {
        try {
            this.app.updateStatus('processing', 'processing');
            
            // Тестирование подключения к SDR
            const isReachable = await this.checkSDRReachability(config.address);
            
            if (isReachable) {
                this.app.showNotification('SDR приемник доступен', 'success');
            } else {
                this.app.showNotification('SDR приемник недоступен', 'error');
            }
            
        } catch (error) {
            this.app.showNotification('Ошибка тестирования SDR', 'error');
            console.error('SDR test error:', error);
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    async checkSDRReachability(address) {
        // Проверка доступности SDR приемника
        if (address.startsWith('rtl_tcp://')) {
            const [host, port] = address.replace('rtl_tcp://', '').split(':');
            return await this.testTCPConnection(host, parseInt(port));
        }
        
        return false;
    }

    async testTCPConnection(host, port) {
        return new Promise((resolve) => {
            const socket = new WebSocket(`ws://${host}:${port}`);
            const timeout = setTimeout(() => {
                socket.close();
                resolve(false);
            }, 3000);
            
            socket.onopen = () => {
                clearTimeout(timeout);
                socket.close();
                resolve(true);
            };
            
            socket.onerror = () => {
                clearTimeout(timeout);
                resolve(false);
            };
        });
    }

    async connectSDR(config) {
        try {
            this.app.updateStatus('processing', 'processing');
            
            // Создание WebSocket подключения к SDR
            const connection = await this.createSDRConnection(config);
            
            this.sdrConnections.set(config.address, {
                config: config,
                connection: connection,
                isConnected: true,
                startTime: new Date()
            });
            
            this.isConnected = true;
            this.app.updateStatus('audio', 'active');
            
            // Начало приема данных
            this.startSDRDataStream(connection, config);
            
            this.app.showNotification(`SDR подключен: ${config.address}`, 'success');
            
        } catch (error) {
            this.app.showNotification('Ошибка подключения к SDR', 'error');
            console.error('SDR connection error:', error);
            this.app.updateStatus('processing', 'inactive');
        }
    }

    async createSDRConnection(config) {
        if (config.type === 'rtlsdr' && config.address.startsWith('rtl_tcp://')) {
            return await this.createRTLTCPConnection(config);
        }
        
        throw new Error(`Тип SDR ${config.type} не поддерживается`);
    }

    async createRTLTCPConnection(config) {
        const [host, port] = config.address.replace('rtl_tcp://', '').split(':');
        
        // Здесь должна быть реализация подключения к rtl_tcp
        // Это упрощенная демонстрационная версия
        
        return {
            host: host,
            port: parseInt(port),
            config: config,
            socket: null,
            isConnected: false
        };
    }

    async startSDRDataStream(connection, config) {
        // Демонстрационная реализация потока данных SDR
        // В реальном приложении здесь будет работа с WebSocket или WebRTC
        
        this.app.showNotification(`Начало приема на ${this.utils.formatFrequency(config.frequency)}`, 'success');
        
        // Имитация потока данных для демонстрации
        this.simulateSDRDataStream(config);
    }

    simulateSDRDataStream(config) {
        // Демонстрационная функция - имитация данных SDR
        const sampleRate = config.bandwidth;
        const centerFreq = config.frequency;
        
        let animationId;
        
        const generateSamples = () => {
            const samples = new Float32Array(1024);
            const time = Date.now() / 1000;
            
            // Имитация различных сигналов
            for (let i = 0; i < samples.length; i++) {
                const t = time + i / sampleRate;
                
                // Имитация AM сигнала
                const amSignal = Math.sin(2 * Math.PI * 1000 * t) * 
                                (0.5 + 0.3 * Math.sin(2 * Math.PI * 10 * t));
                
                // Имитация шума
                const noise = (Math.random() - 0.5) * 0.1;
                
                samples[i] = amSignal + noise;
            }
            
            // Отправка данных для визуализации
            if (this.app.modules.visualization) {
                this.app.modules.visualization.updateSDRWaterfall(samples, centerFreq, sampleRate);
            }
            
            // Обработка данных для декодирования
            this.processSDRData(samples, config);
            
            animationId = requestAnimationFrame(generateSamples);
        };
        
        generateSamples();
        
        // Сохраняем ID для возможности остановки
        connection.animationId = animationId;
    }

    async processSDRData(samples, config) {
        try {
            // Демодуляция и обработка SDR данных
            const demodulated = this.demodulateSDRData(samples, config);
            
            // Преобразование в аудио формат
            const audioData = this.convertToAudioData(demodulated, config);
            
            // Отправка на обработку
            await this.app.processAudio(audioData, {
                type: 'sdr',
                frequency: config.frequency,
                bandwidth: config.bandwidth,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('SDR data processing error:', error);
        }
    }

    demodulateSDRData(samples, config) {
        // Демонстрационная демодуляция
        // В реальном приложении здесь будет настоящая демодуляция (AM/FM/SSB и т.д.)
        
        const demodulated = new Float32Array(samples.length);
        
        // Простая AM демодуляция (огибающая)
        for (let i = 0; i < samples.length; i++) {
            demodulated[i] = Math.abs(samples[i]);
        }
        
        return demodulated;
    }

    convertToAudioData(demodulated, config) {
        // Преобразование в WAV формат
        const sampleRate = 44100; // Аудио sample rate
        const audioBuffer = new ArrayBuffer(44 + demodulated.length * 2);
        const view = new DataView(audioBuffer);
        
        // WAV header (упрощенный)
        // ... (аналогично реализации в audioInput.js)
        
        return audioBuffer;
    }

    async showRemoteRadioDialog() {
        const modal = this.createModal('Удаленные радиостанции');
        
        const content = this.utils.createElement('div', 'remote-radio-list');
        content.innerHTML = `
            <div class="control-group">
                <label class="control-label">Доступные станции:</label>
                <select id="remoteRadioSelect" class="control-input">
                    ${this.generateRemoteRadioOptions()}
                </select>
            </div>
            
            <div class="control-group">
                <label class="control-label">Или введите URL:</label>
                <input type="text" id="customRadioUrl" class="control-input" 
                       placeholder="http://radio.example.com:8000/stream">
            </div>
            
            <div class="action-buttons">
                <button id="btnConnectRadio" class="btn btn-primary">Подключиться</button>
                <button id="btnScanRadios" class="btn btn-secondary">Сканировать</button>
            </div>
        `;
        
        modal.querySelector('.modal-content').appendChild(content);
        
        modal.querySelector('#btnConnectRadio').addEventListener('click', () => {
            this.connectToRemoteRadio();
        });
        
        modal.querySelector('#btnScanRadios').addEventListener('click', () => {
            this.scanForRemoteRadios();
        });
    }

    generateRemoteRadioOptions() {
        const radios = Array.from(this.remoteRadios.values());
        return radios.map(radio => 
            `<option value="${radio.url}">${radio.name} (${this.utils.formatFrequency(radio.frequency)})</option>`
        ).join('');
    }

    async connectToRemoteRadio() {
        const select = document.getElementById('remoteRadioSelect');
        const customUrl = document.getElementById('customRadioUrl').value;
        
        const url = customUrl || select.value;
        
        if (!url) {
            this.app.showNotification('Выберите или введите URL радиостанции', 'warning');
            return;
        }
        
        try {
            this.app.updateStatus('processing', 'processing');
            
            // Подключение к аудио потоку радиостанции
            await this.app.modules.audioInput.loadRemoteAudio(url);
            
            this.app.showNotification(`Подключено к радиостанции: ${url}`, 'success');
            
        } catch (error) {
            this.app.showNotification('Ошибка подключения к радиостанции', 'error');
            console.error('Radio connection error:', error);
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    async scanForRemoteRadios() {
        try {
            this.app.updateStatus('processing', 'processing');
            
            // Сканирование для обнаружения радиостанций
            // В реальном приложении здесь будет поиск в сети
            const discoveredRadios = await this.discoverRadiosInNetwork();
            
            discoveredRadios.forEach(radio => {
                this.remoteRadios.set(radio.url, radio);
            });
            
            this.app.showNotification(`Найдено станций: ${discoveredRadios.length}`, 'success');
            
            // Обновление списка
            this.updateRemoteRadioList();
            
        } catch (error) {
            this.app.showNotification('Ошибка сканирования радиостанций', 'error');
            console.error('Radio scan error:', error);
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    async discoverRadiosInNetwork() {
        // Демонстрационная функция - в реальном приложении здесь будет сетевой поиск
        return [
            {
                name: 'Локальный RTL-SDR',
                url: 'http://localhost:8080/audio',
                frequency: 143050000,
                type: 'nfm'
            },
            {
                name: 'Удаленный приемник #1',
                url: 'http://192.168.1.100:8000/stream',
                frequency: 100000000,
                type: 'am'
            }
        ];
    }

    updateRemoteRadioList() {
        const select = document.getElementById('remoteRadioSelect');
        if (select) {
            select.innerHTML = this.generateRemoteRadioOptions();
        }
    }

    loadSDRConfigurations() {
        const savedConfigs = this.utils.loadFromStorage('sdr_configurations', []);
        savedConfigs.forEach(config => {
            this.sdrConnections.set(config.address, config);
        });
    }

    loadRemoteRadios() {
        const savedRadios = this.utils.loadFromStorage('remote_radios', []);
        savedRadios.forEach(radio => {
            this.remoteRadios.set(radio.url, radio);
        });
    }

    createModal(title) {
        // Создание модального окна (аналогично реализации в audioInput.js)
        const modal = this.utils.createElement('div', 'modal');
        modal.style.display = 'block';
        
        const modalContent = this.utils.createElement('div', 'modal-content');
        modalContent.innerHTML = `
            <span class="close">&times;</span>
            <h3>${title}</h3>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Обработчик закрытия
        modal.querySelector('.close').addEventListener('click', () => {
            modal.remove();
        });
        
        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
        
        return modal;
    }

    disconnectSDR(address) {
        const connection = this.sdrConnections.get(address);
        if (connection) {
            if (connection.animationId) {
                cancelAnimationFrame(connection.animationId);
            }
            
            if (connection.socket) {
                connection.socket.close();
            }
            
            this.sdrConnections.delete(address);
            this.app.showNotification(`SDR отключен: ${address}`, 'success');
        }
        
        if (this.sdrConnections.size === 0) {
            this.isConnected = false;
            this.app.updateStatus('audio', 'inactive');
        }
    }

    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            activeConnections: this.sdrConnections.size,
            remoteRadios: this.remoteRadios.size
        };
    }

    // Очистка ресурсов
    cleanup() {
        this.sdrConnections.forEach((connection, address) => {
            this.disconnectSDR(address);
        });
        
        this.sdrConnections.clear();
        this.remoteRadios.clear();
    }
}