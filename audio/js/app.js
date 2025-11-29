class V2KDecompilerApp {
    constructor() {
        this.modules = {};
        this.currentAudioSource = null;
        this.isProcessing = false;

        this.init();
    }

    async init() {
        try {
            // Инициализация модулей
            this.modules.utils = new UtilsModule();
            this.modules.audioInput = new AudioInputModule(this);
            this.modules.sdrInput = new SDRInputModule(this);
            this.modules.preprocessing = new PreprocessingModule(this);
            this.modules.featureExtraction = new FeatureExtractionModule(this);
            this.modules.visualization = new VisualizationModule(this);
            this.modules.aiIntegration = new AIIntegrationModule(this);

            // UI и события
            this.initUI();
            this.initEventListeners();

            // Конфиг
            await this.loadConfig();

            this.showNotification("Приложение инициализировано", "success");
        } catch (error) {
            console.error("Ошибка инициализации:", error);
            this.showNotification("Ошибка инициализации: " + (error?.message || error), "error");
        }
    }

    // ---------------- UI ----------------

    initUI() {
        // Индикаторы
        this.audioStatusIndicator = document.getElementById("statusAudio");
        this.aiStatusIndicator = document.getElementById("statusAI");
        this.processingStatusIndicator = document.getElementById("statusProcessing");

        // Канвасы
        this.waveformCanvas = document.getElementById("waveformCanvas");
        this.waterfallCanvas = document.getElementById("waterfallCanvas");
        this.envelopeCanvas = document.getElementById("envelopeCanvas");
        this.spectrumCanvas = document.getElementById("spectrumCanvas");
        this.realtimeWaveformCanvas = document.getElementById("realtimeWaveformCanvas");

        // Боковая панель
        this.sidebar = document.getElementById("sidebar");
        this.toggleSidebarBtn = document.getElementById("toggleSidebar");

        // Контролы
        this.createPreprocessingControls();
        this.createFeatureControls();
        // AI-контролы создаёт сам AIIntegrationModule внутри aiIntegration.js
    }

    initEventListeners() {
        // Переключение боковой панели
        if (this.toggleSidebarBtn && this.sidebar) {
            this.toggleSidebarBtn.addEventListener("click", () => {
                this.sidebar.classList.toggle("collapsed");
                this.toggleSidebarBtn.textContent =
                    this.sidebar.classList.contains("collapsed") ? "►" : "◀";
            });
        }

        // Источники данных
        const btnFile = document.getElementById("btnFileInput");
        if (btnFile) {
            btnFile.addEventListener("click", () => {
                this.modules.audioInput.showFileModal();
            });
        }

        const btnMic = document.getElementById("btnMicrophone");
        if (btnMic) {
            btnMic.addEventListener("click", () => {
                this.modules.audioInput.startMicrophone();
            });
        }

        const btnSDR = document.getElementById("btnSDRInput");
        if (btnSDR) {
            btnSDR.addEventListener("click", () => {
                this.modules.sdrInput.showSDRDialog();
            });
        }

        const btnRemote = document.getElementById("btnRemoteRadio");
        if (btnRemote) {
            btnRemote.addEventListener("click", () => {
                this.modules.sdrInput.showRemoteStationsDialog();
            });
        }

        // Запуск обработки текущего источника
        const btnProcess = document.getElementById("btnProcess");
        if (btnProcess) {
            btnProcess.addEventListener("click", () => {
                this.processCurrentSource();
            });
        }

        // Остановка микрофона (если есть кнопка)
        const btnStopMic = document.getElementById("btnStopMicrophone");
        if (btnStopMic) {
            btnStopMic.addEventListener("click", () => {
                this.modules.audioInput.stopMicrophone();
            });
        }

        // Очистка визуализаций
        const btnClearViz = document.getElementById("btnClearVisualization");
        if (btnClearViz) {
            btnClearViz.addEventListener("click", () => {
                this.modules.visualization.clearAll();
            });
        }
    }

    // ------------ Контролы слева ------------

    createPreprocessingControls() {
        const container = document.getElementById("preprocessingControls");
        if (!container) return;

        const controls = [
            { type: "checkbox", id: "pp_dc", label: "Удаление DC", checked: true },
            { type: "checkbox", id: "pp_pre", label: "Преэмфазис (0.97)", checked: true },
            { type: "range", id: "pp_hp", label: "High-pass (Гц)", min: 0, max: 500, value: 80, step: 10 },
            { type: "range", id: "pp_lp", label: "Low-pass (Гц)", min: 1000, max: 8000, value: 4000, step: 100 },
            { type: "checkbox", id: "pp_gate", label: "Noise Gate", checked: true },
            { type: "range", id: "pp_gate_threshold", label: "Порог шума", min: 0.1, max: 2.0, value: 1.2, step: 0.1 }
        ];

        controls.forEach(cfg => this.createControl(cfg, container));
    }

    createFeatureControls() {
        const container = document.getElementById("featureControls");
        if (!container) return;

        const controls = [
            { type: "range", id: "env_sr", label: "Частота огибающей (точек/сек)", min: 20, max: 500, value: 120, step: 10 },
            { type: "checkbox", id: "feat_rms", label: "RMS огибающая", checked: true },
            { type: "checkbox", id: "feat_hilbert", label: "Hilbert огибающая", checked: true },
            { type: "checkbox", id: "feat_centroid", label: "Спектральный центроид", checked: true },
            { type: "range", id: "fft_size", label: "Размер FFT", min: 256, max: 4096, value: 1024, step: 256 }
        ];

        controls.forEach(cfg => this.createControl(cfg, container));
    }

    createControl(config, container) {
        const group = document.createElement("div");
        group.className = "control-group";

        const label = document.createElement("label");
        label.className = "control-label";
        label.textContent = config.label;
        label.htmlFor = config.id;

        let input;

        if (config.type === "checkbox") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.id = config.id;
            input.checked = !!config.checked;

            group.classList.add("control-checkbox");
            group.appendChild(input);
            group.appendChild(label);
        } else if (config.type === "range") {
            input = document.createElement("input");
            input.type = "range";
            input.id = config.id;
            input.min = config.min;
            input.max = config.max;
            input.step = config.step;
            input.value = config.value;

            const valueSpan = document.createElement("span");
            valueSpan.className = "range-value";
            valueSpan.textContent = config.value;

            input.addEventListener("input", (e) => {
                valueSpan.textContent = e.target.value;
            });

            group.appendChild(label);
            group.appendChild(input);
            group.appendChild(valueSpan);
        } else if (config.type === "text") {
            input = document.createElement("input");
            input.type = "text";
            input.id = config.id;
            input.placeholder = config.placeholder || "";
            input.className = "control-input";

            group.appendChild(label);
            group.appendChild(input);
        } else if (config.type === "select") {
            input = document.createElement("select");
            input.id = config.id;
            input.className = "control-input";

            (config.options || []).forEach(option => {
                const opt = document.createElement("option");
                opt.value = option.value;
                opt.textContent = option.text;
                input.appendChild(opt);
            });

            group.appendChild(label);
            group.appendChild(input);
        }

        container.appendChild(group);
    }

    // ------------- Обработка аудио -------------

    async processCurrentSource() {
        if (!this.currentAudioSource) {
            this.showNotification("Нет выбранного источника данных для обработки", "warning");
            return;
        }

        try {
            this.showNotification("Получение аудиоданных из текущего источника…", "info");
            const audioData = await this.currentAudioSource.getAudioBuffer();
            if (!audioData) {
                this.showNotification("Не удалось получить аудиоданные из источника", "error");
                return;
            }

            await this.processAudio(audioData);
        } catch (error) {
            console.error("Ошибка получения аудиоданных:", error);
            this.showNotification("Ошибка получения аудиоданных (см. консоль)", "error");
        }
    }

    async processAudio(audioData, metadata = {}) {
        if (this.isProcessing) {
            this.showNotification("Обработка уже выполняется", "warning");
            return;
        }

        this.isProcessing = true;
        this.updateStatus("processing", "processing");
        this.showNotification("Старт обработки сигнала: предобработка → признаки → AI", "info");

        try {
            // 1. Предобработка
            this.showNotification("Шаг 1/3: предобработка…", "info");
            const processed = await this.modules.preprocessing.process(
                audioData,
                this.getPreprocessingConfig()
            );

            // 2. Извлечение признаков
            this.showNotification("Шаг 2/3: извлечение признаков…", "info");
            const features = await this.modules.featureExtraction.extract(
                processed,
                this.getFeatureConfig()
            );

            // Обновление визуализаций
            this.modules.visualization.updateAll(processed, features);

            // 3. AI-декодирование (если активировано)
            if (this.modules.aiIntegration && this.modules.aiIntegration.isConnected()) {
                this.showNotification("Шаг 3/3: декодирование через AI…", "info");
                const decoded = await this.modules.aiIntegration.decode(features);
                this.displayDecodedText(decoded);
                this.showNotification("Декодирование завершено", "success");
            } else {
                this.showNotification("AI не активирован: выполнена только форензик-обработка", "warning");
            }

            this.showNotification("Полный цикл обработки завершён", "success");
        } catch (error) {
            console.error("Ошибка обработки:", error);
            this.showNotification("Ошибка обработки (см. консоль)", "error");
        } finally {
            this.isProcessing = false;
            this.updateStatus("processing", "inactive");
        }
    }

    getPreprocessingConfig() {
        return {
            dcRemoval: document.getElementById("pp_dc")?.checked ?? true,
            preEmphasis: document.getElementById("pp_pre")?.checked ?? true,
            highPass: parseFloat(document.getElementById("pp_hp")?.value || "80"),
            lowPass: parseFloat(document.getElementById("pp_lp")?.value || "4000"),
            noiseGate: document.getElementById("pp_gate")?.checked ?? true,
            noiseThreshold: parseFloat(document.getElementById("pp_gate_threshold")?.value || "1.2")
        };
    }

    getFeatureConfig() {
        return {
            envelopeSampleRate: parseInt(document.getElementById("env_sr")?.value || "120", 10),
            extractRMS: document.getElementById("feat_rms")?.checked ?? true,
            extractHilbert: document.getElementById("feat_hilbert")?.checked ?? true,
            extractCentroid: document.getElementById("feat_centroid")?.checked ?? true,
            fftSize: parseInt(document.getElementById("fft_size")?.value || "1024", 10)
        };
    }

    // ------------- Вывод текста AI -------------

    displayDecodedText(result) {
        const container = document.getElementById("decodedText");
        const confidenceBar = document.getElementById("confidenceBar");
        const confidenceValue = document.getElementById("confidenceValue");

        if (!container) return;

        if (!result) {
            container.textContent = "Нет результата декодирования";
            if (confidenceBar) confidenceBar.value = 0;
            if (confidenceValue) confidenceValue.textContent = "0%";
            return;
        }

        container.innerHTML = "";

        const main = document.createElement("div");
        main.className = "decoded-main-text";
        main.textContent = result.text || "Нет текста";

        const meta = document.createElement("div");
        meta.className = "decoded-meta";

        const providerSpan = document.createElement("span");
        providerSpan.textContent = "Провайдер: " + (result.provider || "—");

        const confSpan = document.createElement("span");
        const conf = typeof result.confidence === "number" ? result.confidence : 0;
        confSpan.textContent = "Уверенность: " + (conf * 100).toFixed(1) + "%";

        meta.appendChild(providerSpan);
        meta.appendChild(confSpan);

        container.appendChild(main);
        container.appendChild(meta);

        if (Array.isArray(result.alternatives) && result.alternatives.length > 0) {
            const altBlock = document.createElement("div");
            altBlock.className = "decoded-alternatives";

            const title = document.createElement("h4");
            title.textContent = "Альтернативные ответы:";
            altBlock.appendChild(title);

            result.alternatives.forEach((alt) => {
                const line = document.createElement("div");
                line.className = "decoded-alternative";
                line.textContent = `${alt.providerId || alt.provider || "model"}: ${alt.text}`;
                altBlock.appendChild(line);
            });

            container.appendChild(altBlock);
        }

        if (confidenceBar) confidenceBar.value = Math.round((result.confidence || 0) * 100);
        if (confidenceValue) confidenceValue.textContent = Math.round((result.confidence || 0) * 100) + "%";
    }

    // ------------- Статусы и уведомления -------------

    updateStatus(type, state) {
        let el = null;
        if (type === "audio") el = this.audioStatusIndicator || document.getElementById("statusAudio");
        else if (type === "ai") el = this.aiStatusIndicator || document.getElementById("statusAI");
        else if (type === "processing") el = this.processingStatusIndicator || document.getElementById("statusProcessing");

        if (!el) return;

        if (type === "audio") {
            if (state === "active" || state === "processing") {
                el.textContent = "🟢 Аудио: активно";
            } else {
                el.textContent = "🔴 Аудио: неактивно";
            }
        } else if (type === "ai") {
            if (state === "active") {
                el.textContent = "🟢 AI: активирован";
            } else {
                el.textContent = "🔴 AI: отключен";
            }
        } else if (type === "processing") {
            if (state === "processing" || state === "active") {
                el.textContent = "🟡 processing: выполняется";
            } else {
                el.textContent = "🔴 processing: неактивно";
            }
        }
    }

    showNotification(message, type = "info") {
        let container = document.getElementById("notificationContainer");
        if (!container) {
            container = document.createElement("div");
            container.id = "notificationContainer";
            container.className = "notification-container";
            document.body.appendChild(container);
        }

        const note = document.createElement("div");
        note.className = `notification notification-${type}`;
        note.textContent = message;

        container.appendChild(note);

        setTimeout(() => {
            note.classList.add("fade-out");
            setTimeout(() => note.remove(), 300);
        }, 3000);
    }

    // ------------- Конфиг -------------

    async loadConfig() {
        try {
            const raw = localStorage.getItem("v2k_config");
            if (!raw) return;

            const cfg = JSON.parse(raw);
            Object.entries(cfg).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (!el) return;

                if (el.type === "checkbox") {
                    el.checked = !!value;
                } else {
                    el.value = value;
                    if (el.type === "range") {
                        const span = el.parentElement.querySelector(".range-value");
                        if (span) span.textContent = value;
                    }
                }
            });
        } catch (e) {
            console.warn("Ошибка загрузки конфигурации:", e);
        }
    }

    saveConfig() {
        const config = {};
        const selector = "#preprocessingControls input, #featureControls input";
        document.querySelectorAll(selector).forEach((el) => {
            if (!el.id) return;
            if (el.type === "checkbox") config[el.id] = el.checked;
            else config[el.id] = el.value;
        });

        localStorage.setItem("v2k_config", JSON.stringify(config));
    }
}

// Старт приложения
document.addEventListener("DOMContentLoaded", () => {
    window.v2kApp = new V2KDecompilerApp();
});