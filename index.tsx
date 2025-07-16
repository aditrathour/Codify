/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Global type for highlight.js, since it's loaded from a script tag
declare const hljs: any;

import { GoogleGenAI, Type } from '@google/genai';
import { marked } from 'marked';

// --- CONFIGURATION ---

const API_KEY = process.env.API_KEY;

type ResponseType = 'text' | 'json';

interface FeatureConfig {
  title: string;
  description: string;
  promptPrefix: string;
  buttonText: string;
  responseType: ResponseType;
  schema?: any; // Used only if responseType is 'json'
}

const bugSquasherSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: { type: Type.STRING, description: 'A brief analysis of the bug.' },
    correctedCode: { type: Type.STRING, description: 'The corrected code block.' },
    explanation: { type: Type.STRING, description: 'A detailed explanation of the fix.' },
  },
  required: ['analysis', 'correctedCode', 'explanation'],
};

const uiMockupSchema = {
  type: Type.OBJECT,
  properties: {
    html: { type: Type.STRING, description: 'The HTML code for the UI component.' },
    css: { type: Type.STRING, description: 'The CSS code for the UI component.' },
  },
  required: ['html', 'css'],
};


const FEATURES: Record<string, FeatureConfig> = {
  'code-generator': {
    title: 'Code Generator',
    description: 'Describe functions, classes, or components, and let AI write the boilerplate.',
    promptPrefix: 'You are an expert code generator. Generate a complete and functional code snippet based on the following request. Respond only with the code block in markdown format.\n\nRequest: ',
    buttonText: 'Generate Code',
    responseType: 'text',
  },
  'bug-squasher': {
    title: 'Bug Squasher',
    description: 'Paste your broken code and get instant analysis, fixes, and explanations.',
    promptPrefix: 'You are an expert bug squasher. Analyze the following code, identify any bugs, provide a corrected version, and explain the fix. Respond with a JSON object containing "analysis", "correctedCode", and "explanation".\n\nBroken Code:\n',
    buttonText: 'Analyze Code',
    responseType: 'json',
    schema: bugSquasherSchema,
  },
  'code-explainer': {
    title: 'Code Explainer',
    description: 'Understand complex code snippets with simple, natural language explanations.',
    promptPrefix: 'You are an expert code explainer. Explain the following code snippet in simple, natural language. Describe its purpose, how it works, and any key patterns or concepts used.\n\nCode to Explain:\n',
    buttonText: 'Explain Code',
    responseType: 'text',
  },
  'ui-mockup-generator': {
    title: 'UI Mockup Generator',
    description: 'Turn text descriptions into high-fidelity UI mockups and component code.',
    promptPrefix: 'You are an expert UI/UX designer and frontend developer. Based on the following description, generate the HTML and CSS to create the UI. Respond with a JSON object containing "html" and "css".\n\nUI Description: ',
    buttonText: 'Generate Mockup',
    responseType: 'json',
    schema: uiMockupSchema,
  },
  'doc-writer': {
    title: 'Documentation Writer',
    description: 'Provide a code snippet and get professionally written documentation for it.',
    promptPrefix: 'You are an expert technical writer. Generate clear and concise documentation for the following code snippet. Use markdown for formatting.\n\nCode for Documentation:\n',
    buttonText: 'Generate Docs',
    responseType: 'text',
  },
  'test-case-generator': {
    title: 'Test Case Generator',
    description: 'Generate unit tests for your code to ensure reliability and catch regressions.',
    promptPrefix: 'You are an expert software tester. Generate a comprehensive suite of unit tests for the following code. Use a popular testing framework relevant to the code\'s language. Respond only with the code block.\n\nCode to Test:\n',
    buttonText: 'Generate Tests',
    responseType: 'text',
  },
};

const TRANSITION_DELAY_MS = 150;

// --- DOM ELEMENTS ---
const navButtons = document.querySelectorAll('.nav-button');
const featureView = document.getElementById('feature-view')!;
const aboutView = document.getElementById('about-view')!;
const authorView = document.getElementById('author-view')!;
const featureTextWrapper = document.getElementById('feature-text-wrapper') as HTMLElement;
const featureTitle = document.getElementById('feature-title')!;
const featureDescription = document.getElementById('feature-description')!;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const responseContent = document.getElementById('response-content') as HTMLElement;
const loader = document.getElementById('loader')!;

// --- STATE ---
let activeFeature = 'code-generator';
let isLoading = false;
const ai = new GoogleGenAI({ apiKey: API_KEY });

// --- FUNCTIONS ---

/**
 * Updates the UI to reflect the currently active feature.
 */
function renderFeature(featureKey: string | null) {
  if (!featureKey || featureKey === activeFeature) return;
  activeFeature = featureKey;

  // Always fade out the feature header for a clean transition
  featureTextWrapper.style.opacity = '0';

  setTimeout(() => {
    navButtons.forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-feature') === featureKey));

    const isAbout = featureKey === 'about';
    const isAuthor = featureKey === 'author';

    // Set visibility for all three main views
    aboutView.classList.toggle('hidden', !isAbout);
    authorView.classList.toggle('hidden', !isAuthor);
    featureView.classList.toggle('hidden', isAbout || isAuthor);

    // If it's a feature, update its content and fade in the header
    if (!isAbout && !isAuthor) {
      const feature = FEATURES[featureKey];
      if (!feature) return; // Should not happen
      featureTitle.textContent = feature.title;
      featureDescription.textContent = feature.description;
      generateButton.textContent = feature.buttonText;
      promptInput.value = '';
      responseContent.innerHTML = '';
      featureTextWrapper.style.opacity = '1';
    }
  }, TRANSITION_DELAY_MS);
}


/** Toggles the loading state of the UI. */
function setLoading(loading: boolean) {
  isLoading = loading;
  loader.classList.toggle('hidden', !loading);
  generateButton.disabled = loading;
  promptInput.disabled = loading;
}

/** Adds 'Copy' buttons to all code blocks in the response. */
function addCopyButtonsToCodeBlocks() {
  responseContent.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;

    const button = document.createElement('button');
    button.className = 'copy-button';
    button.textContent = 'Copy';
    button.onclick = () => {
      navigator.clipboard.writeText(code.innerText);
      button.textContent = 'Copied!';
      button.classList.add('copied');
      setTimeout(() => {
        button.textContent = 'Copy';
        button.classList.remove('copied');
      }, 2000);
    };
    pre.appendChild(button);
  });
}

/** Renders the output for the Bug Squasher feature. */
function renderBugSquasherOutput(data: any) {
    const { analysis, correctedCode, explanation } = data;
    responseContent.innerHTML = `
        <div class="output-tabs">
            <button class="tab-button active" data-tab="analysis">Analysis</button>
            <button class="tab-button" data-tab="code">Corrected Code</button>
            <button class="tab-button" data-tab="explanation">Explanation</button>
        </div>
        <div class="tab-content">
            <div class="tab-pane" id="tab-analysis">${marked.parse(analysis)}</div>
            <div class="tab-pane hidden" id="tab-code"><pre><code>${correctedCode}</code></pre></div>
            <div class="tab-pane hidden" id="tab-explanation">${marked.parse(explanation)}</div>
        </div>
    `;
}

/** Renders the output for the UI Mockup Generator feature. */
function renderUiMockupOutput(data: any) {
    const { html, css } = data;
    const srcDoc = `
        <!DOCTYPE html><html><head><style>${css}</style></head>
        <body>${html}</body></html>
    `;
    responseContent.innerHTML = `
        <div class="output-tabs">
            <button class="tab-button active" data-tab="preview">Preview</button>
            <button class="tab-button" data-tab="html">HTML</button>
            <button class="tab-button" data-tab="css">CSS</button>
        </div>
        <div class="tab-content">
            <div class="tab-pane" id="tab-preview">
                <iframe class="preview-pane" srcdoc="${srcDoc.replace(/"/g, '&quot;')}"></iframe>
            </div>
            <div class="tab-pane hidden" id="tab-html"><pre><code class="language-html"></code></pre></div>
            <div class="tab-pane hidden" id="tab-css"><pre><code class="language-css"></code></pre></div>
        </div>
    `;
    // We need to set textContent to avoid issues with code being interpreted as HTML
    responseContent.querySelector('#tab-html code')!.textContent = html;
    responseContent.querySelector('#tab-css code')!.textContent = css;
}

/** Handles tab switching logic for dynamic outputs. */
function setupTabbedInterface() {
    const tabs = responseContent.querySelectorAll('.tab-button');
    const panes = responseContent.querySelectorAll('.tab-pane');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.getAttribute('data-tab');
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            panes.forEach(p => p.classList.toggle('hidden', p.id !== `tab-${target}`));
        });
    });
}

/**
 * Handles the main generation logic by calling the Gemini API.
 */
async function handleGenerate() {
  const userInput = promptInput.value.trim();
  if (!userInput || isLoading) return;

  setLoading(true);
  responseContent.innerHTML = '';
  
  const feature = FEATURES[activeFeature];
  const fullPrompt = `${feature.promptPrefix}${userInput}`;

  try {
    if (feature.responseType === 'json') {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: feature.schema,
        },
      });
      
      const jsonText = response.text.trim();
      const data = JSON.parse(jsonText);

      if (activeFeature === 'bug-squasher') {
        renderBugSquasherOutput(data);
      } else if (activeFeature === 'ui-mockup-generator') {
        renderUiMockupOutput(data);
      }
      setupTabbedInterface();

    } else { // 'text' response type
      const responseStream = await ai.models.generateContentStream({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
      });
      
      let fullResponseText = '';
      for await (const chunk of responseStream) {
        fullResponseText += chunk.text;
        responseContent.textContent = fullResponseText; 
      }
      
      const htmlContent = await marked.parse(fullResponseText);
      responseContent.innerHTML = htmlContent;
    }

    // Apply syntax highlighting and add copy buttons after content is set
    responseContent.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
    addCopyButtonsToCodeBlocks();

  } catch (error) {
    console.error(error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    responseContent.innerHTML = `
      <div class="error">
        <strong>Oops! Something went wrong.</strong>
        <span>${errorMessage} Please try again or check your prompt/code. For JSON features, the model might have failed to produce valid output.</span>
      </div>`;
  } finally {
    setLoading(false);
  }
}

/**
 * Initializes the application.
 */
function init() {
  if (!API_KEY) {
    featureView.innerHTML = `<div id="feature-header"><div id="feature-text-wrapper"><h1>Configuration Error</h1><p>API_KEY is not configured. Please set it up in your environment.</p></div></div>`;
    return;
  }

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      renderFeature(button.getAttribute('data-feature'));
    });
  });

  generateButton.addEventListener('click', handleGenerate);
  renderFeature(activeFeature);
}

init();
