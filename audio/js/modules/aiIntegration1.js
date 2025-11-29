class AIIntegrationModule {
    constructor(app) {
        this.app = app;
        this.utils = app.modules.utils;
        
        // Конфигурация провайдеров
        this.providers = {
            gigachat: {
                name: 'GigaChat 3 Ultra Preview',
                baseURL: 'https://gigachat.devices.sberbank.ru/api/v1',
                models: ['GigaChat-3.0-Ultra-Preview', 'GigaChat-3.0', 'GigaChat-2.0'],
                required: ['apiKey'],
                enabled: false
            },
            yandexgpt: {
                name: 'YandexGPT 5.1',
                baseURL: 'https://llm.api.cloud.yandex.net/foundationModels/v1',
                models: ['yandexgpt', 'summarization', 'classification'],
                required: ['apiKey', 'folderId', 'model'],
                enabled: false
            },
            gemini: {
                name: 'Google Gemini',
                baseURL: 'https://generativelanguage.googleapis.com/v1beta',
                models: ['gemini-1.5-flash', 'gemini-1.5-pro'],
                required: ['apiKey', 'model'],
                enabled: false
            },
            openai: {
                name: 'OpenAI GPT',
                baseURL: 'https://api.openai.com/v1',
                models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o-mini'],
                required: ['apiKey', 'model'],
                enabled: false
            },
            anthropic: {
                name: 'Anthropic Claude',
                baseURL: 'https://api.anthropic.com/v1',
                models: ['claude-3-5-sonnet-latest'],
                required: ['apiKey', 'model'],
                enabled: false
            }
        };
        
        // Текущие настройки
        this.apiKeys = {};
        this.activeConnections = new Map();
        this.experimentMode = false;
        this.streamingEnabled = false;
        this.requestTimeout = 45000;
        
        this.init();
    }

    init() {
        this.loadApiKeys();
        this.setupUI();
    }

    setupUI() {
        const container = document.getElementById('aiControls');
        if (!container) return;

        container.innerHTML = `
            <div class="panel">
                <div class="panel-header">
                    <h3>AI Провайдеры</h3>
                    <div class="panel-actions">
                        <button id="btnTestAllAI" class="btn btn-secondary">Тестировать все</button>
                        <button id="btnConnectAI" class="btn btn-primary">Активировать AI</button>
                        <button id="btnClearAICache" class="btn btn-secondary">Очистить ключи</button>
                    </div>
                </div>
                <div class="panel-body ai-providers-grid">
                    ${this.createProvidersSection()}
                </div>
                <div class="panel-footer ai-settings">
                    <div class="control-group">
                        <label for="aiWorkMode">Режим работы</label>
                        <select id="aiWorkMode" class="control-input">
                            <option value="single">Один провайдер</option>
                            <option value="experiment">Эксперимент (все включённые)</option>
                        </select>
                    </div>
                    <div class="control-group">
                        <label for="aiTemperature">Температура</label>
                        <input type="range" id="aiTemperature" min="0" max="2" step="0.1" value="0.7">
                        <span class="range-value">0.7</span>
                    </div>
                    <div class="control-group">
                        <label for="aiMaxTokens">Макс. токенов</label>
                        <input type="range" id="aiMaxTokens" min="256" max="4096" step="256" value="1024">
                        <span class="range-value">1024</span>
                    </div>
                    <div class="control-group">
                        <label>
                            <input type="checkbox" id="aiStreaming">
                            Стриминговый ответ (если поддерживается)
                        </label>
                    </div>
                </div>
            </div>
        `;

        // Обработчики
        Object.keys(this.providers).forEach(providerId => {
            document.getElementById(`toggle_${providerId}`)?.addEventListener('change', (e) => {
                this.toggleProvider(providerId, e.target.checked);
            });

            document.getElementById(`test_${providerId}`)?.addEventListener('click', () => {
                this.testProviderConnection(providerId);
            });

            const inputs = [
                document.getElementById(`key_${providerId}`),
                document.getElementById(`model_${providerId}`),
                ...(providerId === 'yandexgpt' ? [document.getElementById(`folder_${providerId}`)] : [])
            ].filter(Boolean);

            inputs.forEach(input => {
                input?.addEventListener('change', () => {
                    this.saveApiKeys();
                });
            });
        });

        document.getElementById('btnTestAllAI')?.addEventListener('click', () => {
            this.testAllConnections();
        });

        document.getElementById('btnConnectAI')?.addEventListener('click', () => {
            this.connectAI();
        });

        document.getElementById('btnClearAICache')?.addEventListener('click', () => {
            this.clearAICache();
        });

        // Обработчики диапазонов
        document.getElementById('aiTemperature')?.addEventListener('input', (e) => {
            e.target.nextElementSibling.textContent = e.target.value;
        });

        document.getElementById('aiMaxTokens')?.addEventListener('input', (e) => {
            e.target.nextElementSibling.textContent = e.target.value;
        });

        document.getElementById('aiStreaming')?.addEventListener('change', (e) => {
            this.streamingEnabled = e.target.checked;
        });

        // Восстанавливаем состояния
        Object.keys(this.providers).forEach(providerId => {
            const toggle = document.getElementById(`toggle_${providerId}`);
            if (toggle) {
                toggle.checked = this.providers[providerId].enabled;
                this.updateProviderCardState(providerId);
            }

            const config = this.apiKeys[providerId];
            if (config) {
                const keyInput = document.getElementById(`key_${providerId}`);
                const modelSelect = document.getElementById(`model_${providerId}`);
                const folderInput = document.getElementById(`folder_${providerId}`);

                if (keyInput && config.apiKey) keyInput.value = config.apiKey;
                if (modelSelect && config.model) modelSelect.value = config.model;
                if (folderInput && config.folderId) folderInput.value = config.folderId;
            }
        });
    }

    createProvidersSection() {
        return Object.entries(this.providers).map(([id, provider]) => `
            <div class="ai-provider-card" id="card_${id}">
                <div class="ai-provider-header">
                    <label class="toggle">
                        <input type="checkbox" id="toggle_${id}">
                        <span class="toggle-slider"></span>
                        <span class="toggle-label">${provider.name}</span>
                    </label>
                    <span id="status_${id}" class="ai-status">Неактивно</span>
                </div>
                <div class="ai-provider-body">
                    <div class="control-group">
                        <label for="key_${id}">API ключ</label>
                        <input type="password" id="key_${id}" class="control-input" placeholder="Введите API ключ">
                    </div>
                    ${this.createProviderSpecificFields(id, provider)}
                    <div class="ai-provider-footer">
                        <button id="test_${id}" class="btn btn-secondary btn-sm">Тестировать</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    createProviderSpecificFields(providerId, provider) {
        const commonModelSelect = `
            <div class="control-group">
                <label for="model_${providerId}">Модель</label>
                <select id="model_${providerId}" class="control-input">
                    ${provider.models.map(model => `
                        <option value="${model}">${model}</option>
                    `).join('')}
                </select>
            </div>
        `;

        switch (providerId) {
            case 'yandexgpt':
                return `
                    <div class="control-group">
                        <label for="folder_${providerId}">ID каталога</label>
                        <input type="text" id="folder_${providerId}" class="control-input" placeholder="b1g...">
                    </div>
                    ${commonModelSelect}
                `;
            case 'gemini':
            case 'openai':
            case 'anthropic':
                return commonModelSelect;
            default:
                return '';
        }
    }

    toggleProvider(providerId, enabled) {
        this.providers[providerId].enabled = enabled;
        this.updateProviderCardState(providerId);
        this.saveApiKeys();
    }

    updateProviderCardState(providerId) {
        const card = document.getElementById(`card_${providerId}`);
        if (!card) return;

        if (this.providers[providerId].enabled) {
            card.classList.add('enabled');
        } else {
            card.classList.remove('enabled');
        }
    }

    updateProviderStatus(providerId, status, message = '') {
        const statusElement = document.getElementById(`status_${providerId}`);
        if (!statusElement) return;

        switch (status) {
            case 'success':
                statusElement.textContent = 'Готов к работе';
                statusElement.className = 'ai-status success';
                break;
            case 'error':
                statusElement.textContent = `Ошибка: ${message}`;
                statusElement.className = 'ai-status error';
                break;
            case 'testing':
                statusElement.textContent = 'Проверка...';
                statusElement.className = 'ai-status testing';
                break;
            default:
                statusElement.textContent = 'Неактивно';
                statusElement.className = 'ai-status';
        }
    }

    saveApiKeys() {
        const data = {};
        
        Object.keys(this.providers).forEach(providerId => {
            const apiKey = document.getElementById(`key_${providerId}`)?.value || '';
            const model = document.getElementById(`model_${providerId}`)?.value || '';
            const folderId = document.getElementById(`folder_${providerId}`)?.value || '';
            
            if (apiKey || model || folderId) {
                data[providerId] = {
                    apiKey,
                    model,
                    folderId
                };
            }
        });

        this.apiKeys = data;
        localStorage.setItem('v2k_ai_keys', JSON.stringify(data));
    }

    loadApiKeys() {
        try {
            const stored = localStorage.getItem('v2k_ai_keys');
            if (stored) {
                this.apiKeys = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Ошибка загрузки ключей AI:', error);
            this.apiKeys = {};
        }
    }

    clearAICache() {
        localStorage.removeItem('v2k_ai_keys');
        this.apiKeys = {};
        this.activeConnections.clear();

        // Сброс UI
        Object.keys(this.providers).forEach(providerId => {
            const keyInput = document.getElementById(`key_${providerId}`);
            const modelSelect = document.getElementById(`model_${providerId}`);
            const folderInput = document.getElementById(`folder_${providerId}`);
            const toggle = document.getElementById(`toggle_${providerId}`);

            if (keyInput) keyInput.value = '';
            if (modelSelect) modelSelect.value = this.providers[providerId].models[0];
            if (folderInput) folderInput.value = '';
            if (toggle) toggle.checked = false;

            this.providers[providerId].enabled = false;
            this.updateProviderStatus(providerId, 'inactive');
            this.updateProviderCardState(providerId);
        });

        this.app.updateStatus('ai', 'inactive');

        const aiIndicator = document.getElementById('statusAI');
        if (aiIndicator) {
            aiIndicator.textContent = '🔴 AI: отключен';
        }

        this.app.showNotification('Ключи и настройки AI очищены', 'success');
    }

    async testProviderConnection(providerId) {
        const provider = this.providers[providerId];
        const statusElement = document.getElementById(`status_${providerId}`);
        
        try {
            this.updateProviderStatus(providerId, 'testing');
            
            const config = this.apiKeys[providerId];
            if (!config || !config.apiKey) {
                throw new Error('API ключ не настроен');
            }

            const result = await this.validateProviderConnection(providerId, config);
            
            if (result.success) {
                this.updateProviderStatus(providerId, 'success');
                this.app.showNotification(`✅ ${provider.name} подключен успешно`, 'success');
            } else {
                throw new Error(result.error || 'Неизвестная ошибка подключения');
            }

        } catch (error) {
            this.updateProviderStatus(providerId, 'error', error.message);
            this.app.showNotification(`❌ ${provider.name}: ${error.message}`, 'error');
        }
    }

    async testAllConnections() {
        this.app.updateStatus('processing', 'processing');
        
        const enabledProviders = Object.keys(this.providers).filter(
            id => this.providers[id].enabled
        );

        if (enabledProviders.length === 0) {
            this.app.showNotification('Нет включенных провайдеров для тестирования', 'warning');
            this.app.updateStatus('processing', 'inactive');
            return;
        }

        try {
            for (const providerId of enabledProviders) {
                await this.testProviderConnection(providerId);
            }
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    async validateProviderConnection(providerId, config) {
        switch (providerId) {
            case 'gigachat':
                return await this.testGigaChatConnection(config);
            case 'yandexgpt':
                return await this.testYandexGPTConnection(config);
            case 'gemini':
                return await this.testGeminiConnection(config);
            case 'openai':
                return await this.testOpenAIConnection(config);
            case 'anthropic':
                return await this.testAnthropicConnection(config);
            default:
                return { success: false, error: 'Неизвестный провайдер' };
        }
    }

    async testGigaChatConnection(config) {
        try {
            const token = await this.getGigaChatToken(config.apiKey);
            
            const response = await fetch(`${this.providers.gigachat.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: this.providers.gigachat.models[0],
                    messages: [
                        { role: 'system', content: 'Проверка подключения' },
                        { role: 'user', content: 'Скажи "OK" одним словом' }
                    ],
                    max_tokens: 16
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || '';
            
            return {
                success: reply.toLowerCase().includes('ok'),
                error: reply
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testYandexGPTConnection(config) {
        try {
            const response = await fetch(`${this.providers.yandexgpt.baseURL}/completion`, {
                method: 'POST',
                headers: {
                    'Authorization': `Api-Key ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    modelUri: `gpt://${config.folderId}/${config.model}`,
                    completionOptions: {
                        stream: false,
                        temperature: 0.1,
                        maxTokens: 16
                    },
                    messages: [
                        { role: 'system', text: 'Проверка соединения' },
                        { role: 'user', text: 'Скажи "OK" одним словом' }
                    ]
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            const reply = data.result?.alternatives?.[0]?.message?.text || '';
            
            return {
                success: reply.toLowerCase().includes('ok'),
                error: reply
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testGeminiConnection(config) {
        try {
            const url = `${this.providers.gemini.baseURL}/models/${config.model}:generateContent?key=${config.apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: 'Скажи "OK" одним словом' }]
                    }]
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            return {
                success: reply.toLowerCase().includes('ok'),
                error: reply
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testOpenAIConnection(config) {
        try {
            const response = await fetch(`${this.providers.openai.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.model || this.providers.openai.models[0],
                    messages: [
                        { role: 'system', content: 'Проверка подключения' },
                        { role: 'user', content: 'Скажи "OK" одним словом' }
                    ],
                    max_tokens: 16,
                    temperature: 0.1
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content || '';
            
            return {
                success: reply.toLowerCase().includes('ok'),
                error: reply
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async testAnthropicConnection(config) {
        try {
            const response = await fetch(`${this.providers.anthropic.baseURL}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.model || this.providers.anthropic.models[0],
                    max_tokens: 16,
                    temperature: 0.1,
                    system: 'Проверка подключения',
                    messages: [
                        { role: 'user', content: 'Скажи "OK" одним словом' }
                    ]
                })
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            const reply = data.content?.[0]?.text || '';
            
            return {
                success: reply.toLowerCase().includes('ok'),
                error: reply
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async connectAI() {
        try {
            this.app.updateStatus('processing', 'processing');
            
            // Сохраняем все ключи
            this.saveApiKeys();

            // Получаем включенных провайдеров с валидными конфигурациями
            const enabledProviders = [];
            
            for (const providerId of Object.keys(this.providers)) {
                if (!this.providers[providerId].enabled) continue;
                
                const config = this.apiKeys[providerId];
                if (!config || !config.apiKey) {
                    console.warn(`Пропуск ${providerId}: нет API ключа`);
                    continue;
                }

                // Проверяем обязательные поля
                const provider = this.providers[providerId];
                let valid = true;
                
                for (const field of provider.required) {
                    if (!config[field] || config[field].trim() === '') {
                        console.warn(`Пропуск ${providerId}: не заполнено поле ${field}`);
                        valid = false;
                        break;
                    }
                }

                if (valid) {
                    enabledProviders.push(providerId);
                }
            }

            if (enabledProviders.length === 0) {
                throw new Error('Нет провайдеров с валидной конфигурацией');
            }

            // Очищаем предыдущие подключения
            this.activeConnections.clear();

            // Устанавливаем режим работы
            const workMode = document.getElementById('aiWorkMode')?.value || 'single';
            this.experimentMode = workMode === 'experiment';

            // Добавляем провайдеров в активные подключения
            enabledProviders.forEach(providerId => {
                this.activeConnections.set(providerId, this.apiKeys[providerId]);
                this.updateProviderStatus(providerId, 'success');
            });

            this.app.updateStatus('ai', 'active');

            // Дополнительно напрямую обновляем индикатор статуса AI,
            // чтобы его состояние всегда совпадало с реальным подключением.
            const aiIndicator = document.getElementById('statusAI');
            if (aiIndicator) {
                aiIndicator.textContent = '🟢 AI: активирован';
            }

            this.app.showNotification(`✅ AI активирован (${this.activeConnections.size} провайдеров)`, 'success');

        } catch (error) {
            this.app.updateStatus('ai', 'inactive');

            // Сбрасываем индикатор статуса AI в «отключен»,
            // чтобы пользователь сразу видел, что подключение неактивно.
            const aiIndicator = document.getElementById('statusAI');
            if (aiIndicator) {
                aiIndicator.textContent = '🔴 AI: отключен';
            }

            this.app.showNotification(`❌ Ошибка активации AI: ${error.message}`, 'error');
        } finally {
            this.app.updateStatus('processing', 'inactive');
        }
    }

    isConnected() {
        return this.activeConnections.size > 0;
    }

    async decode(features) {
        if (!this.isConnected()) {
            throw new Error('AI не активирован');
        }

        const prompt = this.createDecodingPrompt(features);
        const config = this.getRequestConfig();

        try {
            if (this.experimentMode) {
                return await this.decodeWithAllProviders(prompt, config);
            } else {
                return await this.decodeWithPrimaryProvider(prompt, config);
            }
        } catch (error) {
            throw this.utils.handleError(error, 'Ошибка декодирования через AI');
        }
    }

    getRequestConfig() {
        const temperature = parseFloat(document.getElementById('aiTemperature')?.value || '0.7');
        const maxTokens = parseInt(document.getElementById('aiMaxTokens')?.value || '1024', 10);
        const streaming = document.getElementById('aiStreaming')?.checked || false;

        return { temperature, maxTokens, streaming };
    }

    createDecodingPrompt(features) {
        const temporal = features?.features?.temporal || {};
        const spectral = features?.features?.spectral || {};
        const cepstral = features?.features?.cepstral || {};
        const metadata = features?.metadata || {};

        const rms = temporal.rms?.slice(0, 64) || [];
        const hilbert = temporal.hilbert?.slice(0, 64) || [];
        const centroid = spectral.centroid?.slice(0, 64) || [];
        const mfcc = cepstral.mfcc?.slice(0, 8) || [];

        const zcr = temporal.zeroCrossingRate || 0;
        const rolloff = spectral.rolloff || 0;
        const flux = spectral.flux || 0;

        const duration = metadata.duration || 0;
        const sampleRate = metadata.sampleRate || 44100;

        return `
Ты — эксперт по анализу радиотехнических и аудио сигналов, 
специализирующийся на исследовании микроволнового слухового восприятия
(«эффект Фрея», V2K и любые другие методы передачи информации напрямую в слуховую систему).

Тебе переданы ПРИЗНАКИ одного конкретного фрагмента сигнала. 
Никакого «содержимого» в явном виде у тебя НЕТ — только статистика и спектральные показатели.

--- ВХОДНЫЕ ДАННЫЕ ---

1. Временные огибающие:
   • RMS (нормализованная): ${JSON.stringify(rms)}
   • Hilbert-огибающая (нормализованная): ${JSON.stringify(hilbert)}

2. Спектральные признаки:
   • Спектральный центроид (первые значения): ${JSON.stringify(centroid)}
   • Zero-Crossing Rate (ZCR): ${zcr}
   • Spectral Rolloff: ${rolloff}
   • Spectral Flux: ${flux}

3. Кепстральные признаки:
   • MFCC (усреднённые / первые компоненты): ${JSON.stringify(mfcc)}

4. Метаданные:
   • Длительность: ${duration.toFixed(2)} секунд
   • Частота дискретизации: ${sampleRate} Гц

--- КОНТЕКСТ ---

Этот фрагмент получен в ходе эксперимента по расследованию 
возможной искусственной передачи речеподобных или командных сигналов
(в том числе скрыто модулированных) через радиотехнический тракт
с последующим преобразованием в акустические / слуховые ощущения.

Возможные гипотезы:

1) Чистый шум / помеха / естественная речь из окружающей среды.
2) Радиотехнический служебный сигнал (модуляция, телеком, радар и т.п.).
3) Потенциально осмысленная передача (команды, фразы, шаблоны),
   которая может проявляться в устойчивых паттернах огибающих и спектра
   в НИЗКИХ ЧАСТОТАХ (медленные огибающие до ~0–100 Гц и т.п.).

--- ТВОЯ ЗАДАЧА ---

На основе этих ПРИЗНАКОВ:

1. Оцени, насколько вероятно, что в этом фрагменте ДЕЙСТВИТЕЛЬНО 
   присутсвует искусственно сформированный РЕЧЕПОДОБНЫЙ или КОМАНДНЫЙ контент,
   а не просто шум или обычная речь/музыка.

2. Если есть признаки структуры (повторяемость, ритмика, модуляция),
   опиши, КАКОГО ТИПА это структура:
   • похожа ли она на речь (слоги, фразы);
   • похожа ли на короткие команды (односложные паттерны);
   • или больше на телеметрию / служебные сигналы.

3. Сформулируй гипотезу: 
   «Если бы это БЫЛО сообщением, в каком эмоциональном / волевом 
    диапазоне оно могло бы находиться?» 
   (например: командный, угрожающий, нейтральный, успокаивающий и т.п.)
   — именно как ГИПОТЕЗУ, а не как факт.

4. Дай численную оценку УВЕРЕННОСТИ (0–1) в том, что:
   • гипотеза о РЕЧЕПОДОБНОМ / КОМАНДНОМ сигнале правдоподобна;
   • и что в этом фрагменте есть ИСКУССТВЕННАЯ структура, 
     отличимая от бытового фона или простого шума.

Формат ответа:

1) КРАТКИЙ ВЫВОД (1–2 предложения по-русски).
2) Развёрнутое объяснение (технический разбор, но понятным языком).
3) Гипотеза о типе и эмоциональном диапазоне возможного сообщения (если уместно).
4) Численные оценки (JSON-объект вида):
   {
     "speech_like_probability": число 0–1,
     "command_like_probability": число 0–1,
     "artificial_structure_probability": число 0–1,
     "overall_confidence": число 0–1
   }

НЕ придумывай конкретные слова или фразы сообщения — 
мы работаем только с уровнями структуры и вероятностей, а не с буквальным содержанием.
        `;
    }

    async decodeWithPrimaryProvider(prompt, config) {
        const [providerId] = this.activeConnections.keys();
        const providerConfig = this.activeConnections.get(providerId);

        const start = performance.now();
        const result = await this.sendToProvider(providerId, prompt, providerConfig, config);
        const duration = performance.now() - start;

        return {
            text: result,
            provider: providerId,
            duration,
            confidence: 0.7, // базовое значение, можно развить через мета-анализ
            alternatives: []
        };
    }

    async decodeWithAllProviders(prompt, config) {
        const results = [];
        const timings = {};

        for (const [providerId, providerConfig] of this.activeConnections.entries()) {
            try {
                const start = performance.now();
                const text = await this.sendToProvider(providerId, prompt, providerConfig, config);
                const duration = performance.now() - start;

                results.push({ providerId, text, duration });
                timings[providerId] = duration;
            } catch (error) {
                console.warn(`Ошибка провайдера ${providerId}:`, error);
            }
        }

        if (results.length === 0) {
            throw new Error('Ни один из AI-провайдеров не вернул результат');
        }

        // Простая мета-агрегация: считаем, какой текст повторяется чаще всего
        const textCounts = new Map();
        results.forEach(r => {
            const normalized = r.text.trim();
            textCounts.set(normalized, (textCounts.get(normalized) || 0) + 1);
        });

        let bestText = '';
        let bestCount = 0;
        textCounts.forEach((count, text) => {
            if (count > bestCount) {
                bestCount = count;
                bestText = text;
            }
        });

        const confidence = bestCount / results.length;

        return {
            text: bestText,
            provider: 'meta',
            duration: Math.max(...results.map(r => r.duration)),
            confidence,
            alternatives: results
        };
    }

    async sendToProvider(providerId, prompt, providerConfig, requestConfig) {
        switch (providerId) {
            case 'gigachat':
                return await this.sendToGigaChat(prompt, providerConfig, requestConfig);
            case 'yandexgpt':
                return await this.sendToYandexGPT(prompt, providerConfig, requestConfig);
            case 'gemini':
                return await this.sendToGemini(prompt, providerConfig, requestConfig);
            case 'openai':
                return await this.sendToOpenAI(prompt, providerConfig, requestConfig);
            case 'anthropic':
                return await this.sendToAnthropic(prompt, providerConfig, requestConfig);
            default:
                throw new Error(`Неизвестный провайдер: ${providerId}`);
        }
    }

    async getGigaChatToken(apiKey) {
        const authUrl = 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
        
        const response = await fetch(authUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: 'scope=GIGACHAT_API_PERS'
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка авторизации GigaChat: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.access_token;
    }

    async sendToGigaChat(prompt, config, requestConfig) {
        const token = await this.getGigaChatToken(config.apiKey);

        const response = await this.utils.timeout(
            fetch(`${this.providers.gigachat.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: config.model || this.providers.gigachat.models[0],
                    messages: [
                        { role: 'system', content: 'Ты — форензик-аналитик аудиосигналов.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: requestConfig.maxTokens,
                    temperature: requestConfig.temperature
                })
            }),
            this.requestTimeout,
            'Таймаут запроса к GigaChat'
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка GigaChat: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async sendToYandexGPT(prompt, config, requestConfig) {
        const response = await this.utils.timeout(
            fetch(`${this.providers.yandexgpt.baseURL}/completion`, {
                method: 'POST',
                headers: {
                    'Authorization': `Api-Key ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    modelUri: `gpt://${config.folderId}/${config.model}`,
                    completionOptions: {
                        stream: false,
                        temperature: requestConfig.temperature,
                        maxTokens: requestConfig.maxTokens
                    },
                    messages: [
                        { role: 'system', text: 'Ты — форензик-аналитик аудиосигналов.' },
                        { role: 'user', text: prompt }
                    ]
                })
            }),
            this.requestTimeout,
            'Таймаут запроса к YandexGPT'
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка YandexGPT: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.result.alternatives[0].message.text;
    }

    async sendToGemini(prompt, config, requestConfig) {
        const url = `${this.providers.gemini.baseURL}/models/${config.model}:generateContent?key=${config.apiKey}`;
        
        const response = await this.utils.timeout(
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [{ text: `Ты — форензик-аналитик аудиосигналов.\n\n${prompt}` }]
                    }],
                    generationConfig: {
                        temperature: requestConfig.temperature,
                        maxOutputTokens: requestConfig.maxTokens
                    }
                })
            }),
            this.requestTimeout,
            'Таймаут запроса к Gemini'
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка Gemini: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    async sendToOpenAI(prompt, config, requestConfig) {
        const response = await this.utils.timeout(
            fetch(`${this.providers.openai.baseURL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.model || this.providers.openai.models[0],
                    messages: [
                        { role: 'system', content: 'Ты — форензик-аналитик аудиосигналов.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: requestConfig.maxTokens,
                    temperature: requestConfig.temperature,
                    stream: false
                })
            }),
            this.requestTimeout,
            'Таймаут запроса к OpenAI'
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка OpenAI: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async sendToAnthropic(prompt, config, requestConfig) {
        const response = await this.utils.timeout(
            fetch(`${this.providers.anthropic.baseURL}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    model: config.model || this.providers.anthropic.models[0],
                    max_tokens: requestConfig.maxTokens,
                    temperature: requestConfig.temperature,
                    system: 'Ты — форензик-аналитик аудиосигналов.',
                    messages: [
                        { role: 'user', content: prompt }
                    ]
                })
            }),
            this.requestTimeout,
            'Таймаут запроса к Anthropic'
        );

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Ошибка Anthropic: ${response.status} ${text}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }
}
