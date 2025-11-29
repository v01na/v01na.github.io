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
                models: ['yandexgpt-3.5', 'yandexgpt-2', 'yandexgpt-lite'],
                required: ['apiKey', 'folderId'],
                enabled: false
            },
            gemini: {
                name: 'Gemini 3 Pro',
                baseURL: 'https://generativelanguage.googleapis.com/v1',
                models: ['gemini-3.0-pro', 'gemini-2.0-flash', 'gemini-1.5-pro'],
                required: ['apiKey'],
                enabled: false
            },
            openai: {
                name: 'OpenAI GPT',
                baseURL: 'https://api.openai.com/v1',
                models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'],
                required: ['apiKey'],
                enabled: false
            },
            anthropic: {
                name: 'Claude 3.5',
                baseURL: 'https://api.anthropic.com/v1',
                models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
                required: ['apiKey'],
                enabled: false
            }
        };

        this.activeConnections = new Map();
        this.currentProvider = null;
        this.apiKeys = {};
        this.experimentMode = false;
        
        this.init();
    }

    init() {
        this.loadApiKeys();
    }

    createAIControls(container) {
        container.innerHTML = '';

        // Селектор режима работы
        const modeGroup = this.createControlGroup('Режим работы:', `
            <select id="aiWorkMode" class="control-input">
                <option value="single">Один провайдер</option>
                <option value="experiment">Экспериментальный (все провайдеры)</option>
                <option value="cascade">Каскадный (перебор при ошибках)</option>
            </select>
        `);
        container.appendChild(modeGroup);

        // Конфигурация провайдеров
        const providersGroup = this.createControlGroup('Настройки провайдеров:', '');
        container.appendChild(providersGroup);

        Object.keys(this.providers).forEach(providerId => {
            const providerCard = this.createProviderCard(providerId, this.providers[providerId]);
            providersGroup.appendChild(providerCard);
        });

        // Настройки запросов
        const requestGroup = this.createControlGroup('Параметры запросов:', `
            <div class="control-range">
                <label>Температура:</label>
                <input type="range" id="aiTemperature" min="0" max="2" step="0.1" value="0.7">
                <span class="range-value">0.7</span>
            </div>
            <div class="control-range">
                <label>Макс. токенов:</label>
                <input type="range" id="aiMaxTokens" min="100" max="4000" step="100" value="1000">
                <span class="range-value">1000</span>
            </div>
            <div class="control-checkbox">
                <input type="checkbox" id="aiStream" checked>
                <label>Стриминг ответов</label>
            </div>
        `);
        container.appendChild(requestGroup);

        // Кнопки управления
        const actionGroup = this.createElement('div', 'action-buttons');
        actionGroup.innerHTML = `
            <button id="btnTestAllAI" class="btn btn-secondary">Тест всех подключений</button>
            <button id="btnConnectAI" class="btn btn-primary">Активировать AI</button>
            <button id="btnClearAICache" class="btn btn-danger">Очистить кэш</button>
        `;
        container.appendChild(actionGroup);

        this.setupAIControlsEvents();
        this.loadSavedKeysToUI();
    }

    createProviderCard(providerId, provider) {
        const card = this.createElement('div', 'provider-card');
        
        const header = this.createElement('div', 'provider-header');
        header.innerHTML = `
            <div class="control-checkbox">
                <input type="checkbox" id="enable_${providerId}" ${provider.enabled ? 'checked' : ''}>
                <label><strong>${provider.name}</strong></label>
            </div>
            <span class="provider-status" id="status_${providerId}">🔴</span>
        `;

        const config = this.createElement('div', 'provider-config');
        
        // API Key поле
        const apiKeyGroup = this.createControlGroup('API Key:', `
            <input type="password" id="key_${providerId}" class="control-input" 
                   placeholder="Введите API ключ" value="${this.apiKeys[providerId]?.apiKey || ''}">
        `);
        config.appendChild(apiKeyGroup);

        // Дополнительные поля для специфичных провайдеров
        if (providerId === 'yandexgpt') {
            const folderGroup = this.createControlGroup('Folder ID:', `
                <input type="text" id="folder_${providerId}" class="control-input" 
                       placeholder="Введите Folder ID" value="${this.apiKeys[providerId]?.folderId || ''}">
            `);
            config.appendChild(folderGroup);
        }

        // Выбор модели
        const modelOptions = provider.models.map(model => 
            `<option value="${model}">${model}</option>`
        ).join('');
        
        const modelGroup = this.createControlGroup('Модель:', `
            <select id="model_${providerId}" class="control-input">
                ${modelOptions}
            </select>
        `);
        config.appendChild(modelGroup);

        // Устанавливаем сохраненную модель если есть
        if (this.apiKeys[providerId]?.model) {
            const modelSelect = config.querySelector(`#model_${providerId}`);
            if (modelSelect) {
                modelSelect.value = this.apiKeys[providerId].model;
            }
        }

        // Кнопка тестирования
        const testBtn = this.createElement('button', 'btn btn-secondary test-provider-btn', 'Тест подключения');
        testBtn.setAttribute('data-provider', providerId);
        config.appendChild(testBtn);

        card.appendChild(header);
        card.appendChild(config);

        return card;
    }

    setupAIControlsEvents() {
        // Обработчики для тестирования провайдеров
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('test-provider-btn')) {
                const providerId = e.target.getAttribute('data-provider');
                this.testProviderConnection(providerId);
            }
        });

        // Обработчики чекбоксов включения
        Object.keys(this.providers).forEach(providerId => {
            const checkbox = document.getElementById(`enable_${providerId}`);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    this.providers[providerId].enabled = e.target.checked;
                    this.saveApiKeys();
                });
            }
        });

        // Основные кнопки
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

        // Автосохранение при изменении полей
        Object.keys(this.providers).forEach(providerId => {
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
    }

    async testProviderConnection(providerId) {
        const provider = this.providers[providerId];
        const statusElement = document.getElementById(`status_${providerId}`);
        
        try {
            this.updateProviderStatus(providerId, 'testing');
            
            const config = this.getProviderConfig(providerId);
            if (!config) {
                throw new Error('Конфигурация не найдена');
            }

            // Проверяем обязательные поля
            for (const field of provider.required) {
                if (!config[field] || config[field].trim() === '') {
                    throw new Error(`Не заполнено поле: ${field}`);
                }
            }

            const isValid = await this.validateProviderConnection(providerId, config);
            
            if (isValid) {
                this.updateProviderStatus(providerId, 'success');
                this.app.showNotification(`✅ ${provider.name} подключен успешно`, 'success');
                
                // Сохраняем успешную конфигурацию
                this.apiKeys[providerId] = config;
                this.saveApiKeys();
            } else {
                throw new Error('Неверный ответ от API');
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
            this.app.showNotification('Не выбрано ни одного провайдера', 'warning');
            this.app.updateStatus('processing', 'inactive');
            return;
        }

        let successCount = 0;
        const results = [];

        for (const providerId of enabledProviders) {
            try {
                const config = this.getProviderConfig(providerId);
                if (!config) {
                    results.push({ providerId, success: false, error: 'Нет конфигурации' });
                    continue;
                }

                // Проверяем обязательные поля
                const provider = this.providers[providerId];
                for (const field of provider.required) {
                    if (!config[field] || config[field].trim() === '') {
                        throw new Error(`Не заполнено поле: ${field}`);
                    }
                }

                const isValid = await this.validateProviderConnection(providerId, config);
                
                if (isValid) {
                    successCount++;
                    results.push({ providerId, success: true });
                    this.updateProviderStatus(providerId, 'success');
                } else {
                    throw new Error('Неверный ответ от API');
                }
            } catch (error) {
                results.push({ providerId, success: false, error: error.message });
                this.updateProviderStatus(providerId, 'error', error.message);
            }
        }

        this.app.updateStatus('processing', 'inactive');
        
        if (successCount > 0) {
            this.app.showNotification(`✅ Успешно подключено: ${successCount}/${enabledProviders.length}`, 'success');
        } else {
            this.app.showNotification('❌ Не удалось подключиться ни к одному провайдеру', 'error');
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
                return false;
        }
    }

    async testGigaChatConnection(config) {
        try {
            const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${btoa(`${config.apiKey}:`)}`,
                    'Accept': 'application/json'
                },
                body: 'scope=GIGACHAT_API_PERS'
            });

            if (!authResponse.ok) return false;

            const authData = await authResponse.json();
            const accessToken = authData.access_token;

            const response = await fetch(`${this.providers.gigachat.baseURL}/models`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json'
                }
            });

            return response.ok;
        } catch (error) {
            console.error('GigaChat test error:', error);
            return false;
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
                    modelUri: `gpt://${config.folderId}/yandexgpt/latest`,
                    completionOptions: {
                        stream: false,
                        temperature: 0.1,
                        maxTokens: '10'
                    },
                    messages: [
                        {
                            role: 'user',
                            text: 'test'
                        }
                    ]
                })
            });

            return response.ok;
        } catch (error) {
            console.error('YandexGPT test error:', error);
            return false;
        }
    }

    async testGeminiConnection(config) {
        try {
            const response = await fetch(
                `${this.providers.gemini.baseURL}/models?key=${config.apiKey}`,
                { method: 'GET' }
            );
            return response.ok;
        } catch (error) {
            console.error('Gemini test error:', error);
            return false;
        }
    }

    async testOpenAIConnection(config) {
        try {
            const response = await fetch(`${this.providers.openai.baseURL}/models`, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error('OpenAI test error:', error);
            return false;
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
                    model: 'claude-3-sonnet-20240229',
                    max_tokens: 10,
                    messages: [{ role: 'user', content: 'test' }]
                })
            });
            return response.ok;
        } catch (error) {
            console.error('Anthropic test error:', error);
            return false;
        }
    }

    getProviderConfig(providerId) {
        try {
            const keyInput = document.getElementById(`key_${providerId}`);
            const modelSelect = document.getElementById(`model_${providerId}`);
            
            const config = {
                apiKey: keyInput?.value?.trim() || '',
                model: modelSelect?.value || this.providers[providerId].models[0]
            };

            if (providerId === 'yandexgpt') {
                const folderInput = document.getElementById(`folder_${providerId}`);
                config.folderId = folderInput?.value?.trim() || '';
            }

            return config;
        } catch (error) {
            console.error(`Ошибка получения конфигурации для ${providerId}:`, error);
            return null;
        }
    }

    updateProviderStatus(providerId, status, errorMessage = '') {
        const statusElement = document.getElementById(`status_${providerId}`);
        if (!statusElement) return;

        switch (status) {
            case 'success':
                statusElement.textContent = '🟢';
                statusElement.title = 'Подключение активно';
                break;
            case 'error':
                statusElement.textContent = '🔴';
                statusElement.title = errorMessage || 'Ошибка подключения';
                break;
            case 'testing':
                statusElement.textContent = '🟡';
                statusElement.title = 'Проверка подключения...';
                break;
            default:
                statusElement.textContent = '⚪';
                statusElement.title = 'Неактивно';
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
            this.app.showNotification(`✅ AI активирован (${this.activeConnections.size} провайдеров)`, 'success');

        } catch (error) {
            this.app.updateStatus('ai', 'inactive');
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

    async decodeWithAllProviders(prompt, config) {
        const results = [];
        const providers = Array.from(this.activeConnections.keys());

        const promises = providers.map(providerId => 
            this.sendToProvider(providerId, prompt, config)
                .then(result => ({ provider: providerId, result, success: true }))
                .catch(error => ({ provider: providerId, error, success: false }))
        );

        const allResults = await Promise.allSettled(promises);

        for (const result of allResults) {
            if (result.status === 'fulfilled' && result.value.success) {
                results.push(result.value);
            }
        }

        if (results.length === 0) {
            throw new Error('Все провайдеры вернули ошибку');
        }

        return this.analyzeMultipleResults(results, prompt);
    }

    async decodeWithPrimaryProvider(prompt, config) {
        const providers = Array.from(this.activeConnections.keys());
        
        for (const providerId of providers) {
            try {
                const result = await this.sendToProvider(providerId, prompt, config);
                return {
                    text: result,
                    provider: providerId,
                    confidence: 0.9,
                    alternatives: []
                };
            } catch (error) {
                console.warn(`Провайдер ${providerId} не сработал:`, error);
                continue;
            }
        }

        throw new Error('Все провайдеры вернули ошибку');
    }

    async sendToProvider(providerId, prompt, config) {
        const providerConfig = this.activeConnections.get(providerId);
        
        switch (providerId) {
            case 'gigachat':
                return await this.sendToGigaChat(prompt, providerConfig, config);
            case 'yandexgpt':
                return await this.sendToYandexGPT(prompt, providerConfig, config);
            case 'gemini':
                return await this.sendToGemini(prompt, providerConfig, config);
            case 'openai':
                return await this.sendToOpenAI(prompt, providerConfig, config);
            case 'anthropic':
                return await this.sendToAnthropic(prompt, providerConfig, config);
            default:
                throw new Error(`Неизвестный провайдер: ${providerId}`);
        }
    }

    async sendToGigaChat(prompt, config, requestConfig) {
        const authResponse = await fetch('https://ngw.devices.sberbank.ru:9443/api/v2/oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${btoa(`${config.apiKey}:`)}`,
                'Accept': 'application/json'
            },
            body: 'scope=GIGACHAT_API_PERS'
        });

        if (!authResponse.ok) {
            throw new Error('GigaChat authentication failed');
        }

        const authData = await authResponse.json();
        const accessToken = authData.access_token;

        const response = await fetch(`${this.providers.gigachat.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: requestConfig.temperature,
                max_tokens: requestConfig.maxTokens,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`GigaChat API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async sendToYandexGPT(prompt, config, requestConfig) {
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
                    temperature: requestConfig.temperature,
                    maxTokens: requestConfig.maxTokens.toString()
                },
                messages: [
                    {
                        role: 'user',
                        text: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`YandexGPT API error: ${response.status}`);
        }

        const data = await response.json();
        return data.result.alternatives[0].message.text;
    }

    async sendToGemini(prompt, config, requestConfig) {
        const response = await fetch(
            `${this.providers.gemini.baseURL}/models/${config.model}:generateContent?key=${config.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt
                                }
                            ]
                        }
                    ],
                    generationConfig: {
                        temperature: requestConfig.temperature,
                        maxOutputTokens: requestConfig.maxTokens
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    async sendToOpenAI(prompt, config, requestConfig) {
        const response = await fetch(`${this.providers.openai.baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: requestConfig.temperature,
                max_tokens: requestConfig.maxTokens,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    async sendToAnthropic(prompt, config, requestConfig) {
        const response = await fetch(`${this.providers.anthropic.baseURL}/messages`, {
            method: 'POST',
            headers: {
                'x-api-key': config.apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model,
                max_tokens: requestConfig.maxTokens,
                temperature: requestConfig.temperature,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Anthropic API error: ${response.status}`);
        }

        const data = await response.json();
        return data.content[0].text;
    }

    createDecodingPrompt(features) {
        return `
Ты - специализированная система декодирования аудио сигналов, основанных на эффекте Фрея (микроволновое слуховое восприятие).

АНАЛИЗИРУЙ СЛЕДУЮЩИЕ АУДИО-ПРИЗНАКИ:

ОГИБАЮЩИЕ СИГНАЛА:
- RMS (энергетическая огибающая): ${this.formatFeatureArray(features.temporal?.rms)}
- Hilbert (аналитическая огибающая): ${this.formatFeatureArray(features.temporal?.hilbert)}
- Спектральный центроид: ${this.formatFeatureArray(features.spectral?.centroid)}

ДОПОЛНИТЕЛЬНЫЕ ПРИЗНАКИ:
- Частота пересечения нуля: ${features.temporal?.zeroCrossingRate}
- Спектральный роллоф: ${features.spectral?.rolloff}
- Спектральный флюкс: ${features.spectral?.flux}

ЗАДАЧА:
Преобразуй эти аудио-признаки в связный русский текст. Учти, что сигнал имеет низкочастотную природу (0-100 Гц) и может содержать артефакты.

ВЫВЕДИ РЕЗУЛЬТАТ В ФОРМАТЕ:
1. Основной распознанный текст
2. Уровень уверенности (0-1)
3. Альтернативные гипотезы

ВАЖНО: Сигнал может содержать искажения, поэтому рассматривай несколько вариантов интерпретации.
        `.trim();
    }

    formatFeatureArray(array, maxLength = 10) {
        if (!array || !array.length) return 'нет данных';
        
        const slice = array.slice(0, maxLength);
        return `[${slice.map(val => val.toFixed(3)).join(', ')}${array.length > maxLength ? '...' : ''}]`;
    }

    getRequestConfig() {
        return {
            temperature: parseFloat(document.getElementById('aiTemperature')?.value || 0.7),
            maxTokens: parseInt(document.getElementById('aiMaxTokens')?.value || 1000),
            stream: document.getElementById('aiStream')?.checked || false
        };
    }

    analyzeMultipleResults(results, originalPrompt) {
        const texts = results.map(r => r.result);
        
        const frequency = {};
        texts.forEach(text => {
            frequency[text] = (frequency[text] || 0) + 1;
        });

        const mostFrequent = Object.entries(frequency)
            .sort((a, b) => b[1] - a[1])[0];

        return {
            text: mostFrequent[0],
            provider: 'multiple',
            confidence: mostFrequent[1] / results.length,
            alternatives: texts.filter(text => text !== mostFrequent[0]),
            allResults: results
        };
    }

    saveApiKeys() {
        // Очищаем предыдущие ключи
        this.apiKeys = {};

        Object.keys(this.providers).forEach(providerId => {
            if (!this.providers[providerId].enabled) {
                return; // Пропускаем выключенные провайдеры
            }

            try {
                const config = this.getProviderConfig(providerId);
                if (config && config.apiKey) {
                    this.apiKeys[providerId] = config;
                }
            } catch (error) {
                console.warn(`Ошибка сохранения для ${providerId}:`, error);
            }
        });

        this.utils.saveToStorage('ai_api_keys', this.apiKeys);
    }

    loadApiKeys() {
        this.apiKeys = this.utils.loadFromStorage('ai_api_keys', {});
        
        // Восстанавливаем состояния провайдеров
        Object.keys(this.apiKeys).forEach(providerId => {
            if (this.providers[providerId]) {
                this.providers[providerId].enabled = true;
            }
        });
    }

    loadSavedKeysToUI() {
        // Задержка для гарантии что DOM готов
        setTimeout(() => {
            Object.keys(this.apiKeys).forEach(providerId => {
                const config = this.apiKeys[providerId];
                if (!config) return;

                // Заполняем поле API ключа
                const keyInput = document.getElementById(`key_${providerId}`);
                if (keyInput && config.apiKey) {
                    keyInput.value = config.apiKey;
                }

                // Заполняем поле Folder ID для YandexGPT
                if (providerId === 'yandexgpt') {
                    const folderInput = document.getElementById(`folder_${providerId}`);
                    if (folderInput && config.folderId) {
                        folderInput.value = config.folderId;
                    }
                }

                // Устанавливаем выбранную модель
                const modelSelect = document.getElementById(`model_${providerId}`);
                if (modelSelect && config.model) {
                    modelSelect.value = config.model;
                }

                // Включаем провайдера
                const enableCheckbox = document.getElementById(`enable_${providerId}`);
                if (enableCheckbox) {
                    enableCheckbox.checked = true;
                    this.providers[providerId].enabled = true;
                }
            });
        }, 100);
    }

    clearAICache() {
        this.activeConnections.clear();
        this.apiKeys = {};
        this.utils.saveToStorage('ai_api_keys', {});
        
        // Сбрасываем UI
        Object.keys(this.providers).forEach(providerId => {
            this.providers[providerId].enabled = false;
            this.updateProviderStatus(providerId, 'error');
            
            const checkbox = document.getElementById(`enable_${providerId}`);
            if (checkbox) checkbox.checked = false;
            
            const keyInput = document.getElementById(`key_${providerId}`);
            if (keyInput) keyInput.value = '';
            
            if (providerId === 'yandexgpt') {
                const folderInput = document.getElementById(`folder_${providerId}`);
                if (folderInput) folderInput.value = '';
            }
        });

        this.app.updateStatus('ai', 'inactive');
        this.app.showNotification('🗑️ Кэш AI очищен', 'success');
    }

    getProviderInfo() {
        return {
            active: Array.from(this.activeConnections.keys()),
            enabled: Object.keys(this.providers).filter(id => this.providers[id].enabled),
            total: Object.keys(this.providers).length
        };
    }

    // Вспомогательные методы для создания элементов
    createElement(tag, className, innerHTML = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (innerHTML) element.innerHTML = innerHTML;
        return element;
    }

    createControlGroup(label, content) {
        const group = this.createElement('div', 'control-group');
        group.innerHTML = `
            <label class="control-label">${label}</label>
            ${content}
        `;
        return group;
    }

    // Очистка ресурсов
    cleanup() {
        this.activeConnections.clear();
        this.apiKeys = {};
    }
}