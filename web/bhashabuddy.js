const STORAGE_KEYS = {
  autoTranslate: "bb-auto-translate",
  sourceLang: "bb-source-lang",
  targetLang1: "bb-target-lang-1",
  targetLang2: "bb-target-lang-2",
  dockCollapsed: "bb-dock-collapsed",
};

const MAX_SELECTION_LENGTH = 1400;
const DEFAULT_MESSAGE = "Select text inside the PDF to translate it.";
const LANGUAGES = [
  { code: "auto", label: "Detect automatically", speech: "en-US" },
  { code: "ar", label: "Arabic", speech: "ar-SA" },
  { code: "bn", label: "Bengali", speech: "bn-BD" },
  { code: "de", label: "German", speech: "de-DE" },
  { code: "en", label: "English", speech: "en-US" },
  { code: "es", label: "Spanish", speech: "es-ES" },
  { code: "fr", label: "French", speech: "fr-FR" },
  { code: "gu", label: "Gujarati", speech: "gu-IN" },
  { code: "hi", label: "Hindi", speech: "hi-IN" },
  { code: "id", label: "Indonesian", speech: "id-ID" },
  { code: "it", label: "Italian", speech: "it-IT" },
  { code: "ja", label: "Japanese", speech: "ja-JP" },
  { code: "kn", label: "Kannada", speech: "kn-IN" },
  { code: "ko", label: "Korean", speech: "ko-KR" },
  { code: "ml", label: "Malayalam", speech: "ml-IN" },
  { code: "mr", label: "Marathi", speech: "mr-IN" },
  { code: "ne", label: "Nepali", speech: "ne-NP" },
  { code: "pa", label: "Punjabi", speech: "pa-IN" },
  { code: "pt", label: "Portuguese", speech: "pt-BR" },
  { code: "ru", label: "Russian", speech: "ru-RU" },
  { code: "ta", label: "Tamil", speech: "ta-IN" },
  { code: "te", label: "Telugu", speech: "te-IN" },
  { code: "tr", label: "Turkish", speech: "tr-TR" },
  { code: "ur", label: "Urdu", speech: "ur-PK" },
  { code: "zh-CN", label: "Chinese (Simplified)", speech: "zh-CN" },
];

class BhashaBuddy {
  constructor(app) {
    this.app = app;
    this.cache = new Map();
    this.selectionTimer = null;
    this.requestId = 0;
    this.state = {
      autoTranslate: localStorage.getItem(STORAGE_KEYS.autoTranslate) !== "false",
      sourceLang: localStorage.getItem(STORAGE_KEYS.sourceLang) || "auto",
      targetLang1: localStorage.getItem(STORAGE_KEYS.targetLang1) || "hi",
      targetLang2: localStorage.getItem(STORAGE_KEYS.targetLang2) || "en",
      detectedSource: null,
      selectedText: "",
      selectionPage: null,
      translations: { primary: "", secondary: "" },
      translationMeta: { primary: "", secondary: "" },
      collapsed: this.getInitialCollapsedState(),
      isLoading: false,
      statusText: DEFAULT_MESSAGE,
      statusTone: "",
      documentLabel: "Demo PDF ready",
    };
    this.renderShell();
    this.initElements();
    this.populateLanguageSelectors();
    this.bindEvents();
    this.renderAll();
    this.hydrateDocumentStatus();
  }

  getInitialCollapsedState() {
    const saved = localStorage.getItem(STORAGE_KEYS.dockCollapsed);
    if (saved !== null) {
      return saved === "true";
    }
    return window.innerWidth < 960;
  }

  renderShell() {
    document.body.insertAdjacentHTML(
      "beforeend",
      `
        <button id="bbDockToggle" type="button" aria-controls="bbDock" aria-expanded="false">
          BhashaBuddy
        </button>
        <aside id="bbDock" data-collapsed="true" aria-label="BhashaBuddy translator">
          <div class="bb-header">
            <div class="bb-brand">
              <span class="bb-brand__eyebrow">Mozilla PDF.js + Translator</span>
              <h2 class="bb-brand__title">Translate selected PDF text in place.</h2>
              <p class="bb-brand__copy">
                Upload your own PDF, paste a direct PDF URL, or use the demo file. Then select any text to
                translate, speak, and copy it.
              </p>
            </div>
            <div class="bb-header__actions">
              <button id="bbCollapseButton" class="bb-icon-button" type="button" aria-label="Collapse panel">
                -
              </button>
            </div>
          </div>

          <div class="bb-chip-row">
            <div class="bb-chip"><strong>Document</strong> <span id="bbDocumentLabel">Demo PDF ready</span></div>
            <div class="bb-chip"><strong>Status</strong> <span id="bbStatusText">Select text inside the PDF to translate it.</span></div>
          </div>

          <section class="bb-section">
            <h3 class="bb-section__title">Open a document</h3>
            <div class="bb-button-row">
              <button id="bbOpenPdf" class="bb-action-button bb-action-button--primary" type="button">Open PDF</button>
              <button id="bbLoadDemo" class="bb-action-button" type="button">Load demo PDF</button>
            </div>
            <div class="bb-url-row" style="margin-top: 12px;">
              <input
                id="bbUrlInput"
                class="bb-input"
                type="url"
                placeholder="Paste a direct PDF URL with CORS enabled"
                inputmode="url"
              />
              <button id="bbLoadUrl" type="button">Load URL</button>
            </div>
          </section>

          <section class="bb-section">
            <h3 class="bb-section__title">Translation setup</h3>
            <div class="bb-language-grid">
              <div class="bb-field">
                <label for="bbSourceLang">Source</label>
                <select id="bbSourceLang" class="bb-select"></select>
              </div>
              <div class="bb-field">
                <label for="bbTargetLang1">Primary</label>
                <select id="bbTargetLang1" class="bb-select"></select>
              </div>
              <div class="bb-field">
                <label for="bbTargetLang2">Secondary</label>
                <select id="bbTargetLang2" class="bb-select"></select>
              </div>
            </div>
            <label class="bb-toggle" style="margin-top: 14px;">
              <input id="bbAutoTranslate" type="checkbox" />
              Translate automatically when the selection changes
            </label>
          </section>

          <section class="bb-section">
            <div class="bb-selection__status">
              <span id="bbSelectionMeta">Select text in the PDF to start.</span>
              <span id="bbDetectedLanguage"></span>
            </div>
            <div id="bbSelectionText" class="bb-selection__text">No selection yet.</div>
            <div class="bb-selection__actions">
              <button id="bbTranslateNow" class="bb-action-button bb-action-button--primary" type="button">Translate</button>
              <button id="bbSpeakSource" class="bb-action-button" type="button">Speak source</button>
              <button id="bbCopyAll" class="bb-action-button" type="button">Copy all</button>
              <button id="bbClearSelection" class="bb-action-button" type="button">Clear</button>
            </div>
          </section>

          <div class="bb-results">
            <article class="bb-card">
              <div class="bb-card__head">
                <div>
                  <p class="bb-card__eyebrow">Primary translation</p>
                  <h3 id="bbPrimaryTitle" class="bb-card__title">Hindi</h3>
                </div>
                <div class="bb-card__actions">
                  <button id="bbSpeakPrimary" class="bb-card__tool" type="button">Speak</button>
                  <button id="bbCopyPrimary" class="bb-card__tool" type="button">Copy</button>
                </div>
              </div>
              <p id="bbPrimaryTranslation" class="bb-card__text" data-state="placeholder">Awaiting selection.</p>
              <div id="bbPrimaryMeta" class="bb-card__meta"></div>
            </article>

            <article class="bb-card">
              <div class="bb-card__head">
                <div>
                  <p class="bb-card__eyebrow">Secondary translation</p>
                  <h3 id="bbSecondaryTitle" class="bb-card__title">English</h3>
                </div>
                <div class="bb-card__actions">
                  <button id="bbSpeakSecondary" class="bb-card__tool" type="button">Speak</button>
                  <button id="bbCopySecondary" class="bb-card__tool" type="button">Copy</button>
                </div>
              </div>
              <p id="bbSecondaryTranslation" class="bb-card__text" data-state="placeholder">Awaiting selection.</p>
              <div id="bbSecondaryMeta" class="bb-card__meta"></div>
            </article>
          </div>

          <p class="bb-note">
            Translation requests are sent directly from your browser to public translation services. Avoid sensitive
            documents unless you trust the network path and the translation provider.
          </p>
        </aside>
      `
    );
  }

  initElements() {
    this.elements = {
      dock: document.getElementById("bbDock"),
      dockToggle: document.getElementById("bbDockToggle"),
      collapseButton: document.getElementById("bbCollapseButton"),
      documentLabel: document.getElementById("bbDocumentLabel"),
      statusText: document.getElementById("bbStatusText"),
      selectionMeta: document.getElementById("bbSelectionMeta"),
      detectedLanguage: document.getElementById("bbDetectedLanguage"),
      selectionText: document.getElementById("bbSelectionText"),
      sourceLang: document.getElementById("bbSourceLang"),
      targetLang1: document.getElementById("bbTargetLang1"),
      targetLang2: document.getElementById("bbTargetLang2"),
      autoTranslate: document.getElementById("bbAutoTranslate"),
      translateNow: document.getElementById("bbTranslateNow"),
      openPdf: document.getElementById("bbOpenPdf"),
      loadDemo: document.getElementById("bbLoadDemo"),
      urlInput: document.getElementById("bbUrlInput"),
      loadUrl: document.getElementById("bbLoadUrl"),
      speakSource: document.getElementById("bbSpeakSource"),
      copyAll: document.getElementById("bbCopyAll"),
      clearSelection: document.getElementById("bbClearSelection"),
      primaryTitle: document.getElementById("bbPrimaryTitle"),
      secondaryTitle: document.getElementById("bbSecondaryTitle"),
      primaryTranslation: document.getElementById("bbPrimaryTranslation"),
      secondaryTranslation: document.getElementById("bbSecondaryTranslation"),
      primaryMeta: document.getElementById("bbPrimaryMeta"),
      secondaryMeta: document.getElementById("bbSecondaryMeta"),
      speakPrimary: document.getElementById("bbSpeakPrimary"),
      speakSecondary: document.getElementById("bbSpeakSecondary"),
      copyPrimary: document.getElementById("bbCopyPrimary"),
      copySecondary: document.getElementById("bbCopySecondary"),
    };
  }

  populateLanguageSelectors() {
    const selectors = [
      this.elements.sourceLang,
      this.elements.targetLang1,
      this.elements.targetLang2,
    ];
    for (const select of selectors) {
      const options =
        select === this.elements.sourceLang
          ? LANGUAGES
          : LANGUAGES.filter(({ code }) => code !== "auto");
      select.innerHTML = options
        .map(({ code, label }) => `<option value="${code}">${label}</option>`)
        .join("");
    }
    this.elements.sourceLang.value = this.resolveLanguageCode(
      this.state.sourceLang,
      "auto"
    );
    this.elements.targetLang1.value = this.resolveLanguageCode(
      this.state.targetLang1,
      "hi"
    );
    this.elements.targetLang2.value = this.resolveLanguageCode(
      this.state.targetLang2,
      "en"
    );
    this.elements.autoTranslate.checked = this.state.autoTranslate;
    this.ensureDistinctTargets();
  }

  bindEvents() {
    document.addEventListener("selectionchange", () =>
      this.handleSelectionChange()
    );
    document.addEventListener("keydown", event =>
      this.handleKeyboardShortcuts(event)
    );
    window.addEventListener("resize", () => this.renderDockState());
    this.elements.dockToggle.addEventListener("click", () =>
      this.setDockCollapsed(!this.state.collapsed)
    );
    this.elements.collapseButton.addEventListener("click", () =>
      this.setDockCollapsed(true)
    );
    this.elements.openPdf.addEventListener("click", () => this.openPdf());
    this.elements.loadDemo.addEventListener("click", () => this.loadDemoPdf());
    this.elements.loadUrl.addEventListener("click", () => this.loadUrl());
    this.elements.urlInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.loadUrl();
      }
    });
    this.elements.translateNow.addEventListener("click", () =>
      this.translateSelection()
    );
    this.elements.speakSource.addEventListener("click", () =>
      this.speak(this.state.selectedText, this.getSourceSpeechLocale())
    );
    this.elements.copyAll.addEventListener("click", () => this.copyAll());
    this.elements.clearSelection.addEventListener("click", () =>
      this.clearSelection()
    );
    this.elements.speakPrimary.addEventListener("click", () =>
      this.speak(
        this.state.translations.primary,
        this.getSpeechLocale(this.elements.targetLang1.value)
      )
    );
    this.elements.speakSecondary.addEventListener("click", () =>
      this.speak(
        this.state.translations.secondary,
        this.getSpeechLocale(this.elements.targetLang2.value)
      )
    );
    this.elements.copyPrimary.addEventListener("click", () =>
      this.copyText(
        this.state.translations.primary,
        "Primary translation copied."
      )
    );
    this.elements.copySecondary.addEventListener("click", () =>
      this.copyText(
        this.state.translations.secondary,
        "Secondary translation copied."
      )
    );

    this.elements.autoTranslate.addEventListener("change", () => {
      this.state.autoTranslate = this.elements.autoTranslate.checked;
      localStorage.setItem(
        STORAGE_KEYS.autoTranslate,
        String(this.state.autoTranslate)
      );
      this.setStatus(
        this.state.autoTranslate
          ? "Selection changes will translate automatically."
          : "Auto translate paused. Use Translate when ready.",
        "success"
      );
      if (this.state.autoTranslate && this.state.selectedText) {
        this.translateSelection();
      }
    });

    this.elements.sourceLang.addEventListener("change", () => {
      this.state.sourceLang = this.elements.sourceLang.value;
      localStorage.setItem(STORAGE_KEYS.sourceLang, this.state.sourceLang);
      if (this.state.selectedText) {
        this.translateSelection();
      }
      this.renderSelectionStatus();
    });

    this.elements.targetLang1.addEventListener("change", () => {
      this.state.targetLang1 = this.elements.targetLang1.value;
      this.ensureDistinctTargets("primary");
      localStorage.setItem(
        STORAGE_KEYS.targetLang1,
        this.elements.targetLang1.value
      );
      localStorage.setItem(
        STORAGE_KEYS.targetLang2,
        this.elements.targetLang2.value
      );
      this.renderCardTitles();
      if (this.state.selectedText) {
        this.translateSelection();
      }
    });

    this.elements.targetLang2.addEventListener("change", () => {
      this.state.targetLang2 = this.elements.targetLang2.value;
      this.ensureDistinctTargets("secondary");
      localStorage.setItem(
        STORAGE_KEYS.targetLang1,
        this.elements.targetLang1.value
      );
      localStorage.setItem(
        STORAGE_KEYS.targetLang2,
        this.elements.targetLang2.value
      );
      this.renderCardTitles();
      if (this.state.selectedText) {
        this.translateSelection();
      }
    });

    this.app.eventBus?._on("documentloaded", () => {
      this.hydrateDocumentStatus();
      this.setStatus(
        "Document loaded. Select text anywhere in the PDF to translate it.",
        "success"
      );
    });

    this.app.eventBus?._on("documenterror", () => {
      this.setStatus(
        "This PDF could not be opened. Try another file or a direct PDF URL.",
        "error"
      );
      this.hydrateDocumentStatus();
    });
  }

  handleKeyboardShortcuts(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      this.translateSelection();
    }
    if (event.key === "Escape" && !this.state.collapsed) {
      this.setDockCollapsed(true);
    }
  }

  handleSelectionChange() {
    window.clearTimeout(this.selectionTimer);
    this.selectionTimer = window.setTimeout(() => {
      const nextSelection = this.getViewerSelection();
      if (!nextSelection) {
        return;
      }

      if (nextSelection.text.length > MAX_SELECTION_LENGTH) {
        this.state.selectedText = nextSelection.text.slice(
          0,
          MAX_SELECTION_LENGTH
        );
        this.state.selectionPage = nextSelection.pageNumber;
        this.state.translations = { primary: "", secondary: "" };
        this.state.translationMeta = { primary: "", secondary: "" };
        this.state.detectedSource = null;
        this.renderAll();
        this.setStatus(
          "That selection is too long. Choose a shorter passage to translate.",
          "error"
        );
        return;
      }

      const changed =
        nextSelection.text !== this.state.selectedText ||
        nextSelection.pageNumber !== this.state.selectionPage;

      this.state.selectedText = nextSelection.text;
      this.state.selectionPage = nextSelection.pageNumber;
      if (changed) {
        this.state.translations = { primary: "", secondary: "" };
        this.state.translationMeta = { primary: "", secondary: "" };
        this.state.detectedSource = null;
      }
      this.setDockCollapsed(false);
      this.renderAll();

      if (changed) {
        this.setStatus("Selection captured. Translating...", "");
      }

      if (this.state.autoTranslate && changed) {
        this.translateSelection();
      }
    }, 180);
  }

  getViewerSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      return null;
    }
    const range = selection.getRangeAt(0);
    const node =
      range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
        ? range.commonAncestorContainer
        : range.commonAncestorContainer.parentElement;
    if (!(node instanceof Element)) {
      return null;
    }
    if (this.elements.dock.contains(node)) {
      return null;
    }
    if (!node.closest(".textLayer")) {
      return null;
    }
    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) {
      return null;
    }
    const page = node.closest(".page");
    return {
      text,
      pageNumber: page?.dataset.pageNumber || null,
    };
  }

  async translateSelection() {
    if (!this.state.selectedText) {
      this.setStatus("Select text inside the PDF before translating.", "error");
      return;
    }
    const selectionText = this.state.selectedText;
    const sourceLang = this.elements.sourceLang.value;
    const primaryLang = this.elements.targetLang1.value;
    const secondaryLang = this.elements.targetLang2.value;

    this.state.isLoading = true;
    this.renderCards();
    const requestId = ++this.requestId;

    try {
      const [primary, secondary] = await Promise.allSettled([
        this.translateText(selectionText, primaryLang, sourceLang),
        this.translateText(selectionText, secondaryLang, sourceLang),
      ]);

      if (requestId !== this.requestId) {
        return;
      }

      this.state.translations.primary =
        primary.status === "fulfilled"
          ? primary.value.translatedText
          : "Translation unavailable right now. Try again or switch the source language manually.";
      this.state.translations.secondary =
        secondary.status === "fulfilled"
          ? secondary.value.translatedText
          : "Translation unavailable right now. Try again or switch the source language manually.";

      this.state.translationMeta.primary =
        primary.status === "fulfilled"
          ? this.buildMeta(primary.value.providerName)
          : "Translation request failed.";
      this.state.translationMeta.secondary =
        secondary.status === "fulfilled"
          ? this.buildMeta(secondary.value.providerName)
          : "Translation request failed.";

      if (sourceLang === "auto") {
        this.state.detectedSource =
          (primary.status === "fulfilled" && primary.value.detectedSource) ||
          (secondary.status === "fulfilled" && secondary.value.detectedSource) ||
          null;
      } else {
        this.state.detectedSource = sourceLang;
      }

      const success =
        primary.status === "fulfilled" || secondary.status === "fulfilled";
      this.setStatus(
        success
          ? "Translations updated."
          : "Translation services were unavailable for this selection.",
        success ? "success" : "error"
      );
    } finally {
      if (requestId === this.requestId) {
        this.state.isLoading = false;
        this.renderAll();
      }
    }
  }

  async translateText(text, targetLang, sourceLang) {
    const cacheKey = `${sourceLang}:${targetLang}:${text}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const attempts = [() => this.translateViaGoogle(text, targetLang, sourceLang)];
    if (sourceLang !== "auto") {
      attempts.push(() => this.translateViaMyMemory(text, targetLang, sourceLang));
    }

    let lastError = null;
    for (const attempt of attempts) {
      try {
        const result = await attempt();
        this.cache.set(cacheKey, result);
        return result;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Translation request failed.");
  }

  async translateViaGoogle(text, targetLang, sourceLang) {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({
      client: "gtx",
      sl: sourceLang,
      tl: targetLang,
      dt: "t",
      dj: "1",
      source: "input",
      q: text,
    }).toString();

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google translation failed with ${response.status}.`);
    }
    const raw = await response.text();
    const sanitized = raw.replace(/^\)\]\}'\s*/, "");
    const data = JSON.parse(sanitized);
    const translatedText =
      data.sentences?.map(sentence => sentence.trans || "").join("").trim() ||
      "";
    if (!translatedText) {
      throw new Error("Google translation returned an empty response.");
    }
    return {
      translatedText,
      detectedSource: this.normalizeLanguageCode(data.src),
      providerName: "Google public endpoint",
    };
  }

  async translateViaMyMemory(text, targetLang, sourceLang) {
    const url = new URL("https://api.mymemory.translated.net/get");
    url.search = new URLSearchParams({
      q: text,
      langpair: `${sourceLang}|${targetLang}`,
    }).toString();

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`MyMemory translation failed with ${response.status}.`);
    }
    const data = await response.json();
    const translatedText = data.responseData?.translatedText?.trim();
    if (!translatedText) {
      throw new Error("MyMemory translation returned an empty response.");
    }
    return {
      translatedText,
      detectedSource: this.normalizeLanguageCode(sourceLang),
      providerName: "MyMemory fallback",
    };
  }

  buildMeta(providerName) {
    return `Provider: ${providerName}`;
  }

  async loadUrl() {
    const url = this.elements.urlInput.value.trim();
    if (!url) {
      this.setStatus("Paste a direct PDF URL first.", "error");
      return;
    }
    try {
      this.setStatus("Loading remote PDF...", "");
      await this.app.open({ url });
      this.elements.urlInput.value = "";
      this.setDockCollapsed(false);
    } catch (error) {
      this.setStatus(
        "That URL could not be opened. Make sure it points directly to a PDF and allows cross-origin requests.",
        "error"
      );
    }
  }

  async loadDemoPdf() {
    try {
      this.setStatus("Loading demo PDF...", "");
      await this.app.open({ url: "compressed.tracemonkey-pldi-09.pdf" });
      this.setDockCollapsed(false);
    } catch (error) {
      this.setStatus("The demo PDF could not be loaded.", "error");
    }
  }

  openPdf() {
    this.app.eventBus?.dispatch("openfile", { source: this });
    this.setStatus("Choose a PDF file from your device.", "");
  }

  clearSelection() {
    this.state.selectedText = "";
    this.state.selectionPage = null;
    this.state.detectedSource = null;
    this.state.translations = { primary: "", secondary: "" };
    this.state.translationMeta = { primary: "", secondary: "" };
    this.renderAll();
    window.getSelection()?.removeAllRanges();
    this.setStatus(DEFAULT_MESSAGE, "");
  }

  async copyAll() {
    if (!this.state.selectedText) {
      this.setStatus("There is no selection to copy yet.", "error");
      return;
    }
    const bundle = [
      `Source (${this.getSourceLanguageLabel()}): ${this.state.selectedText}`,
      `Primary (${this.getLanguageLabel(
        this.elements.targetLang1.value
      )}): ${this.state.translations.primary || "Not translated yet."}`,
      `Secondary (${this.getLanguageLabel(
        this.elements.targetLang2.value
      )}): ${this.state.translations.secondary || "Not translated yet."}`,
    ].join("\n\n");
    await this.copyText(bundle, "Source and translations copied.");
  }

  async copyText(text, successMessage) {
    if (!text) {
      this.setStatus("Nothing to copy yet.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      this.setStatus(successMessage, "success");
    } catch (error) {
      this.setStatus("Clipboard access was blocked by the browser.", "error");
    }
  }

  speak(text, language) {
    if (!text) {
      this.setStatus("Nothing to speak yet.", "error");
      return;
    }
    if (!("speechSynthesis" in window)) {
      this.setStatus("Speech synthesis is not available in this browser.", "error");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language || "en-US";
    utterance.rate = 0.95;
    const voice = this.pickVoice(language);
    if (voice) {
      utterance.voice = voice;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  pickVoice(language) {
    if (!language) {
      return null;
    }
    const voices = window.speechSynthesis.getVoices();
    return (
      voices.find(
        voice => voice.lang.toLowerCase() === language.toLowerCase()
      ) ||
      voices.find(voice =>
        voice.lang.toLowerCase().startsWith(
          language.split("-")[0].toLowerCase()
        )
      ) ||
      null
    );
  }

  hydrateDocumentStatus() {
    const filename =
      this.app?._contentDispositionFilename ||
      this.extractNameFromUrl(this.app?.url) ||
      "Local PDF";
    this.state.documentLabel = filename;
    this.renderDocumentLabel();
  }

  extractNameFromUrl(url) {
    if (!url) {
      return "";
    }
    try {
      const parsed = new URL(url, window.location.href);
      const pathname = parsed.pathname.split("/").filter(Boolean).pop();
      return pathname ? decodeURIComponent(pathname) : "";
    } catch (error) {
      return "";
    }
  }

  renderAll() {
    this.renderDockState();
    this.renderDocumentLabel();
    this.renderStatus();
    this.renderSelectionStatus();
    this.renderCardTitles();
    this.renderCards();
  }

  renderDockState() {
    this.elements.dock.dataset.collapsed = String(this.state.collapsed);
    this.elements.dockToggle.setAttribute(
      "aria-expanded",
      String(!this.state.collapsed)
    );
    document.body.classList.toggle(
      "bb-dock-open",
      !this.state.collapsed && window.innerWidth > 1180
    );
  }

  renderDocumentLabel() {
    this.elements.documentLabel.textContent = this.state.documentLabel;
  }

  renderStatus() {
    this.elements.statusText.textContent = this.state.statusText;
    this.elements.statusText.className = this.state.statusTone
      ? `bb-status--${this.state.statusTone}`
      : "";
  }

  renderSelectionStatus() {
    if (this.state.selectedText) {
      const pageLabel = this.state.selectionPage
        ? `Page ${this.state.selectionPage}`
        : "Selection ready";
      this.elements.selectionMeta.textContent = `${pageLabel} • ${this.state.selectedText.length} characters`;
      this.elements.selectionText.textContent = this.state.selectedText;
    } else {
      this.elements.selectionMeta.textContent = "Select text in the PDF to start.";
      this.elements.selectionText.textContent = "No selection yet.";
    }

    if (this.state.detectedSource && this.elements.sourceLang.value === "auto") {
      this.elements.detectedLanguage.textContent = `Detected: ${this.getLanguageLabel(
        this.state.detectedSource
      )}`;
    } else if (this.elements.sourceLang.value !== "auto") {
      this.elements.detectedLanguage.textContent = `Source: ${this.getLanguageLabel(
        this.elements.sourceLang.value
      )}`;
    } else {
      this.elements.detectedLanguage.textContent = "";
    }
  }

  renderCardTitles() {
    this.elements.primaryTitle.textContent = this.getLanguageLabel(
      this.elements.targetLang1.value
    );
    this.elements.secondaryTitle.textContent = this.getLanguageLabel(
      this.elements.targetLang2.value
    );
  }

  renderCards() {
    const primaryText = this.state.isLoading
      ? "Translating..."
      : this.state.translations.primary || "Awaiting selection.";
    const secondaryText = this.state.isLoading
      ? "Translating..."
      : this.state.translations.secondary || "Awaiting selection.";

    this.elements.primaryTranslation.textContent = primaryText;
    this.elements.secondaryTranslation.textContent = secondaryText;
    this.elements.primaryTranslation.dataset.state =
      !this.state.translations.primary && !this.state.isLoading
        ? "placeholder"
        : "ready";
    this.elements.secondaryTranslation.dataset.state =
      !this.state.translations.secondary && !this.state.isLoading
        ? "placeholder"
        : "ready";
    this.elements.primaryMeta.textContent = this.state.isLoading
      ? "Working on your selection..."
      : this.state.translationMeta.primary;
    this.elements.secondaryMeta.textContent = this.state.isLoading
      ? "Working on your selection..."
      : this.state.translationMeta.secondary;
  }

  setStatus(text, tone = "") {
    this.state.statusText = text;
    this.state.statusTone = tone;
    this.renderStatus();
  }

  setDockCollapsed(collapsed) {
    this.state.collapsed = collapsed;
    localStorage.setItem(STORAGE_KEYS.dockCollapsed, String(collapsed));
    this.renderDockState();
  }

  ensureDistinctTargets(changed = "secondary") {
    if (this.elements.targetLang1.value !== this.elements.targetLang2.value) {
      return;
    }
    const fallback = LANGUAGES.find(
      ({ code }) =>
        code !== "auto" && code !== this.elements.targetLang1.value
    )?.code;
    if (!fallback) {
      return;
    }
    if (changed === "primary") {
      this.elements.targetLang2.value = fallback;
    } else {
      this.elements.targetLang1.value = fallback;
    }
    this.state.targetLang1 = this.elements.targetLang1.value;
    this.state.targetLang2 = this.elements.targetLang2.value;
  }

  resolveLanguageCode(code, fallback) {
    return LANGUAGES.some(language => language.code === code) ? code : fallback;
  }

  normalizeLanguageCode(code) {
    if (!code) {
      return null;
    }
    const normalized = code.toLowerCase();
    const exact = LANGUAGES.find(
      language => language.code.toLowerCase() === normalized
    );
    if (exact) {
      return exact.code;
    }
    const prefix = LANGUAGES.find(language =>
      normalized.startsWith(language.code.toLowerCase())
    );
    return prefix?.code || null;
  }

  getLanguage(code) {
    return (
      LANGUAGES.find(
        language => language.code === this.normalizeLanguageCode(code)
      ) || null
    );
  }

  getLanguageLabel(code) {
    return this.getLanguage(code)?.label || code || "Unknown";
  }

  getSourceLanguageLabel() {
    if (this.elements.sourceLang.value === "auto" && this.state.detectedSource) {
      return this.getLanguageLabel(this.state.detectedSource);
    }
    return this.getLanguageLabel(this.elements.sourceLang.value);
  }

  getSpeechLocale(code) {
    return this.getLanguage(code)?.speech || "en-US";
  }

  getSourceSpeechLocale() {
    return this.elements.sourceLang.value === "auto"
      ? this.getSpeechLocale(this.state.detectedSource || "en")
      : this.getSpeechLocale(this.elements.sourceLang.value);
  }
}

async function waitForViewerApplication() {
  while (!window.PDFViewerApplication?.initializedPromise) {
    await new Promise(resolve => window.setTimeout(resolve, 50));
  }
  await window.PDFViewerApplication.initializedPromise;
  return window.PDFViewerApplication;
}

async function boot() {
  try {
    const app = await waitForViewerApplication();
    window.bhashaBuddy = new BhashaBuddy(app);
  } catch (error) {
    console.error("BhashaBuddy failed to initialize.", error);
  }
}

void boot();
