import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";

const $prompt = document.querySelector("#prompt");
const $submit = document.querySelector("#submit");
const $model = document.querySelector("#model");
const $demos = document.querySelector("#demos");
const $response = document.querySelector("#response");
const $configureLlm = document.querySelector("#configure-llm");

let llmConfig = null;
const marked = new Marked();
const messages = [{ 
    role: "system", 
    content: "Generate a single page HTML app in a single Markdown code block and use emojis in the explanation to make each point more engaging and visually distinct" 
}];

const loadingHTML = html`
    <div class="d-flex justify-content-center">
        <div class="spinner-border" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
    </div>
`;

async function init() {
    loadDemos();
    await initializeLLM();
    setupEventListeners();
}

function loadDemos() {
    render(loadingHTML, $demos);
    fetch("config.json")
        .then((res) => res.json())
        .then(({ demos }) => {
            render(
                demos.map(
                    (demo) => html`<div class="col mb-4">
                        <div class="card h-100 demo-card" role="button" data-file="${demo.file}" style="cursor: pointer;">
                            <div class="card-body text-center">
                                <i class="bi ${demo.icon} fs-1 mb-3"></i>
                                <h5 class="card-title">${demo.title}</h5>
                            </div>
                        </div>
                    </div>`
                ),
                $demos
            );
        })
        .catch(() => {
            render(
                defaultDemos.map(
                    (demo) => html`<div class="col mb-4">
                        <div class="card h-100 demo-card" role="button" data-file="${demo.file}" style="cursor: pointer;">
                            <div class="card-body text-center">
                                <i class="bi ${demo.icon} fs-1 mb-3"></i>
                                <h5 class="card-title">${demo.title}</h5>
                            </div>
                        </div>
                    </div>`
                ),
                $demos
            );
        });
}

async function initializeLLM() {
    try {
        llmConfig = await openaiConfig({
            defaultBaseUrls: [
                "https://api.openai.com/v1",
                "https://openrouter.ai/api/v1"
            ],
            title: "Configure LLM Provider",
            help: '<div class="alert alert-info">Configure your LLM provider to start generating apps. Popular options include OpenAI, Anthropic Claude, Google Gemini, or OpenRouter.</div>'
        });
        populateModels(llmConfig.models);      
    } catch (error) {
        console.error("Failed to initialize LLM:", error);
        showError("Failed to configure LLM provider. Please check your configuration.");
    }
}

function populateModels(models) {
    $model.innerHTML = '<option value="">Select a model...</option>';
    if (models && models.length > 0) {
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id || model;
            option.textContent = model.id || model;
            $model.appendChild(option);
        });
        if (models.length > 0) {  $model.value = models[0].id || models[0];  }
    }
}

function setupEventListeners() {
    $demos.addEventListener("click", (e) => {
        const demo = e.target.closest("[data-file]");
        if (demo) load(demo.dataset.file);
    });
    document.querySelector("#app-prompt").addEventListener("submit", handleFormSubmit);
    $configureLlm.addEventListener("click", async () => {
        try {
            llmConfig = await openaiConfig({ show: true });
            populateModels(llmConfig.models);
            showSuccess("LLM provider configured successfully!");
        } catch (error) {
            console.error("Failed to configure LLM:", error);
            showError("Failed to configure LLM provider.");
        }
    });
    document.querySelector("#file-input").addEventListener("change", async (e) => {
        const file = e.target.files[0];
        if (file) load(URL.createObjectURL(file));
    });

    document.querySelector("#save-conversation").addEventListener("click", () => {
        const data = `data:application/json,${encodeURIComponent(JSON.stringify(messages, null, 2))}`;
        Object.assign(document.createElement("a"), { 
            href: data, 
            download: "autoimprove.json" 
        }).click();
    });

    document.querySelectorAll('[data-bs-theme-value]').forEach(button => {
        button.addEventListener('click', () => {
            const theme = button.getAttribute('data-bs-theme-value');
            document.documentElement.setAttribute('data-bs-theme', theme);
            localStorage.setItem('theme', theme);
        });
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (!llmConfig) {  showError("Please configure your LLM provider first.");  return;  } 
    if (!$model.value) { showError("Please select a model.");  return; }
    const originalPrompt = $prompt.value.trim();
    if (!originalPrompt) {  showError("Please enter a prompt.");  return;  }
    messages.push({ role: "user", content: originalPrompt });
    const apiPrompt = $submit.textContent === "Improve"
        ? `${originalPrompt}\n\nAlong with the code. Provide a detailed explanation of improvements made since the last version, organized with categorized bullet points. Use emojis in the explanation to make each point more engaging and visually distinct. At the end, include a one-line summary of what changed since the previous version, enclosed in <summary> tags. Do not include any other content outside the tags.`
        : originalPrompt;
    const body = JSON.stringify({
        model: $model.value,
        messages: [...messages.slice(0, -1), { role: "user", content: apiPrompt }],
        stream: true
    });
    const headers = {"Content-Type":"application/json","Authorization":`Bearer ${llmConfig.apiKey}`};
    messages.push({ role: "assistant", content: "", loading: true });
    drawMessages(messages);
    try {
        const lastMessage = messages.at(-1);
        for await (const data of asyncLLM(`${llmConfig.baseUrl}/chat/completions`, { 
            method: "POST", 
            headers, 
            body 
        })) {
            lastMessage.content = data.content;
            if (!lastMessage.content) continue;
            drawMessages(messages);
        } 
        delete lastMessage.loading;
        drawMessages(messages);
        setTimeout(() => {
            const iframes = $response.querySelectorAll("iframe");
            if (iframes.length) {
                const frame = iframes[iframes.length - 1];
                if (frame.contentWindow && frame.contentWindow.document.body) {
                    frame.style.height = `${frame.contentWindow.document.body.scrollHeight + 200}px`;
                }
            }
        }, 1000);
        $submit.textContent = "Improve";
        $prompt.value = "Improve this app!";
    } catch (error) {
        console.error("Error generating response:", error);
        messages.pop();
        showError("Failed to generate response. Please try again.");
        drawMessages(messages);
    }
}

function parseAssistantContent(content) {
    const summaryMatch = content.match(/<summary>(.*?)<\/summary>/s);
    const contentWithoutSummary = content.replace(/<summary>.*?<\/summary>/s, '').trim();
    const parsed = marked.parse(contentWithoutSummary || '');
    const codeMatch = parsed ? parsed.match(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/i) : null;
    return {
        code: codeMatch ? codeMatch[0] : null,
        explanation: parsed ? parsed.replace(codeMatch?.[0] || '', '').trim() : '',
        summary: summaryMatch ? summaryMatch[1].trim() : ''
    };
}

function drawMessages(messages) {
    render(
        messages.map(({ role, content, loading }, i) => html`
            <div class="mb-3 border rounded">
                <div class="p-2 bg-body-tertiary" data-bs-toggle="collapse" data-bs-target="#msg${i}" style="cursor:pointer">
                    <i class="bi bi-chevron-down"></i> ${role}
                </div>
                <div id="msg${i}" class="collapse show">
                    ${role === "assistant" ? (() => {
                        const { code, explanation, summary } = parseAssistantContent(content);
                        return html`
                            ${code ? html`
                                <div class="p-2 border-bottom" data-bs-toggle="collapse" data-bs-target="#code${i}" style="cursor:pointer">
                                    <i class="bi bi-code-slash"></i> Code
                                </div>
                                <div id="code${i}" class="collapse p-2">${unsafeHTML(code)}</div>
                            ` : ''}
                            <div class="p-2 border-bottom" data-bs-toggle="collapse" data-bs-target="#exp${i}" style="cursor:pointer">
                                <i class="bi bi-text-paragraph"></i> Explanation 
                                ${summary ? html`<span class="ms-2 text-muted small">${summary}</span>` : ''}
                            </div>
                            <div id="exp${i}" class="collapse p-2">${unsafeHTML(explanation)}</div>
                            ${loading ? loadingHTML : unsafeHTML(drawOutput(content))}
                        `;
                    })() : html`<div class="p-2">${unsafeHTML(marked.parse(content))}</div>`}
                </div>
            </div>
        `),
        $response
    );
}

const contentCache = {};
function drawOutput(content) {
    if (contentCache[content]) return contentCache[content];
    const match = content.match(/```[\w-]*\n([\s\S]*?)\n```/);
    if (!match) return "";
    const iframe = document.createElement("iframe");
    iframe.className = "w-100 border rounded";
    iframe.style.minHeight = "300px";
    iframe.srcdoc = match[1];
    contentCache[content] = iframe.outerHTML;
    return contentCache[content];
}

async function load(url) {
    try {
        const data = await fetch(url).then((res) => res.json());
        messages.splice(0, messages.length, ...data);
        drawMessages(messages);
    } catch (error) {
        console.error("Failed to load conversation:", error);
        showError("Failed to load conversation file.");
    }
}

function showError(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-danger alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertBefore(alert, document.body.firstChild);
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

function showSuccess(message) {
    const alert = document.createElement('div');
    alert.className = 'alert alert-success alert-dismissible fade show';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.insertBefore(alert, document.body.firstChild);
    setTimeout(() => {  alert.remove();  }, 3000);
}

document.addEventListener('DOMContentLoaded', init);
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
}