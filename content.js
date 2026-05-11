// Initialize Mermaid with a default theme
let currentTheme = 'default';
let lastSettings = ""; // To prevent redundant initializations

// Inject KaTeX CSS for LaTeX formula rendering
if (!document.getElementById('katex-css')) {
    const link = document.createElement('link');
    link.id = 'katex-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css';
    document.head.appendChild(link);
}

mermaid.initialize({ 
    startOnLoad: false, 
    theme: currentTheme, 
    securityLevel: 'loose',
    legacyMathML: true,
    flowchart: { htmlLabels: true, useMaxWidth: false },
    state: { htmlLabels: true, useMaxWidth: false }
});

console.log("[Mermaid-Extension] Ultra-Smooth mode enabled.");

function isMermaidCode(text) {
    const keywords = ['graph ', 'flowchart ', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'journey', 'gantt', 'pie', 'gitGraph', 'mindmap', 'timeline'];
    const trimmed = text.trim();
    return keywords.some(k => trimmed.startsWith(k));
}

function isAnkiCode(text) {
    if (!text) return false;
    const cleanText = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
    const lines = cleanText.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return false;
    
    const hasTabs = lines.some(l => l.includes('\t') || l.includes('\u0009'));
    const hasSpacesAsTabs = lines.some(l => l.split(/\s{3,}/).length >= 2);
    
    if (hasTabs) {
        const tabbedLines = lines.filter(l => l.includes('\t') || l.includes('\u0009'));
        if (tabbedLines.length >= lines.length * 0.3) return true;
    }
    if (hasSpacesAsTabs) {
        const spaceTabbedLines = lines.filter(l => l.split(/\s{3,}/).length >= 2);
        if (spaceTabbedLines.length >= lines.length * 0.5) return true;
    }
    return false;
}

// Function to convert SVG to PNG and download or copy
async function exportImage(svgElement, action = 'download') {
    if (!svgElement) return;
    let svgData = new XMLSerializer().serializeToString(svgElement);
    if (!svgData.includes('xmlns="http://www.w3.org/2000/svg"')) {
        // Usa regex per intercettare <svg seguito da qualsiasi cosa (spazio o >)
        svgData = svgData.replace(/<svg([^>]*>)/, '<svg xmlns="http://www.w3.org/2000/svg"$1');
    }

    const svgSize = svgElement.getBoundingClientRect();
    const width = parseFloat(svgElement.getAttribute('width')) || svgSize.width || 800;
    const height = parseFloat(svgElement.getAttribute('height')) || svgSize.height || 600;
    
    if (!svgData.includes('width=')) {
        svgData = svgData.replace('<svg ', `<svg width="${width}" height="${height}" `);
    }
    
    const katexLink = document.getElementById('katex-css');
    if (katexLink) {
        const extraStyle = `<style>@import url("${katexLink.href}");</style>`;
        svgData = svgData.replace(/(<svg[^>]*>)/, `$1${extraStyle}`);
    }
    
    const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
    
    if (action === 'download') {
        const downloadLink = document.createElement('a');
        downloadLink.href = svgUrl;
        downloadLink.download = `mermaid-diagram-${Date.now()}.svg`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        return;
    }

    if (action === 'copy') {
        try {
            const blobPromise = new Promise((resolve, reject) => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                const pixelRatio = window.devicePixelRatio || 2;
                canvas.width = width * pixelRatio;
                canvas.height = height * pixelRatio;
                
                img.onload = () => {
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob((blob) => {
                        if (blob) resolve(blob);
                        else reject(new Error("Canvas toBlob failed"));
                    }, 'image/png');
                };
                img.onerror = () => reject(new Error("Failed to load SVG into image. Note: SVG with complex HTML math might not copy to clipboard correctly."));
                img.src = svgUrl;
            });
            
            const item = new ClipboardItem({ "image/png": blobPromise });
            await navigator.clipboard.write([item]);
        } catch (e) {
            console.error("[Mermaid-Extension] Copy failed", e);
            throw e;
        }
    }
}

function injectMermaidButtons() {
    const preElements = document.querySelectorAll('pre');
    
    preElements.forEach((pre, index) => {
        if (pre.dataset.mermaidExtensionProcessed === "true") return;
        
        const text = pre.textContent.trim();
        const hasMermaidClass = pre.classList.contains('language-mermaid') || pre.querySelector('code.language-mermaid');
        const looksLikeMermaid = isMermaidCode(text);
        const looksLikeAnki = isAnkiCode(text);
        const isActuallyMermaid = hasMermaidClass || looksLikeMermaid;
        const isActuallyAnki = looksLikeAnki;

        if (isActuallyMermaid || isActuallyAnki) {
            pre.dataset.mermaidExtensionProcessed = "true";
            
            const controlsGroup = document.createElement('div');
            controlsGroup.className = 'mermaid-header-controls';
            controlsGroup.dataset.theme = currentTheme;

            const btnToggle = document.createElement('button');
            btnToggle.className = 'mermaid-icon-btn';
            btnToggle.textContent = '</>';
            btnToggle.title = 'Visualizza Codice';
            pre._mermaidToggleBtn = btnToggle;
            pre._mermaidIsVisible = false;

            const btnZoomOut = document.createElement('button');
            btnZoomOut.className = 'mermaid-action-btn';
            btnZoomOut.textContent = '−';
            btnZoomOut.title = 'Zoom Out';

            const btnReset = document.createElement('button');
            btnReset.className = 'mermaid-action-btn';
            btnReset.textContent = '↺';
            btnReset.title = 'Reset';

            const btnZoomIn = document.createElement('button');
            btnZoomIn.className = 'mermaid-action-btn';
            btnZoomIn.textContent = '+';
            btnZoomIn.title = 'Zoom In';

            const btnFullscreen = document.createElement('button');
            btnFullscreen.className = 'mermaid-action-btn';
            btnFullscreen.textContent = '⛶';
            btnFullscreen.title = 'Fullscreen';

            const dropdownContainer = document.createElement('div');
            dropdownContainer.className = 'mermaid-dropdown mermaid-diagram-control';

            const btnSettings = document.createElement('button');
            btnSettings.className = 'mermaid-action-btn';
            btnSettings.textContent = '⚙️';
            btnSettings.title = 'Impostazioni';

            const dropdownMenu = document.createElement('div');
            dropdownMenu.className = 'mermaid-dropdown-menu';

            // Theme Select
            const themeSelect = document.createElement('select');
            themeSelect.className = 'mermaid-theme-select';
            ['default', 'dark', 'forest', 'neutral'].forEach(t => {
                const opt = document.createElement('option');
                opt.value = opt.innerText = t;
                themeSelect.appendChild(opt);
            });
            themeSelect.value = currentTheme;

            // Smooth Toggle
            const btnSmooth = document.createElement('button');
            btnSmooth.className = 'mermaid-settings-btn';
            btnSmooth.textContent = '🌊 Curve: Morbide';
            btnSmooth.title = 'Cambia stile linee';
            let isSmooth = true;
            
            // Copy Image
            const btnCopy = document.createElement('button');
            btnCopy.className = 'mermaid-settings-btn';
            btnCopy.textContent = '📋 Copia Immagine';

            // Save Image
            const btnSave = document.createElement('button');
            btnSave.className = 'mermaid-settings-btn';
            btnSave.textContent = '💾 Salva Immagine';

            // Anki Export
            const btnAnki = document.createElement('button');
            btnAnki.className = 'mermaid-settings-btn anki-export-btn';
            btnAnki.textContent = '🧠 Esporta Anki';
            if (isActuallyAnki) {
                btnAnki.classList.add('highlight');
            }

            dropdownMenu.append(themeSelect, btnSmooth, btnCopy, btnSave, btnAnki);
            if (!isActuallyMermaid) {
                // Remove diagram-only options
                themeSelect.style.display = 'none';
                btnSmooth.style.display = 'none';
                btnCopy.style.display = 'none';
                btnSave.style.display = 'none';
            }
            const btnPinDiagram = document.createElement('button');
            btnPinDiagram.className = 'mermaid-settings-btn';
            btnPinDiagram.textContent = '📌';
            btnPinDiagram.title = 'Pin Diagram';
            
            dropdownContainer.append(btnSettings, dropdownMenu);

            controlsGroup.append(btnToggle, btnZoomOut, btnReset, btnZoomIn, btnPinDiagram, btnFullscreen, dropdownContainer);

            if (!isActuallyMermaid) {
                // Se è solo Anki, nascondi tutto il resto e metti il bottone DIRETTO nell'header
                btnToggle.style.display = 'none';
                btnZoomOut.style.display = 'none';
                btnReset.style.display = 'none';
                btnZoomIn.style.display = 'none';
                btnFullscreen.style.display = 'none';
                btnPinDiagram.style.display = 'none';
                dropdownContainer.style.display = 'none';

                const btnAnkiDirect = document.createElement('button');
                btnAnkiDirect.className = 'mermaid-icon-btn highlight anki-export-btn';
                btnAnkiDirect.style.padding = '4px 12px';
                btnAnkiDirect.style.fontSize = '13px';
                btnAnkiDirect.textContent = '🧠 Esporta Anki';
                btnAnkiDirect.onclick = (e) => {
                    e.preventDefault();
                    btnAnki.click(); // Usa lo stesso handler già definito
                };
                controlsGroup.appendChild(btnAnkiDirect);
            }

            const outerContainer = document.createElement('div');
            outerContainer.className = 'mermaid-outer-wrapper';
            outerContainer.style.display = 'none';
            outerContainer.dataset.theme = currentTheme;

            let scale = 1;
            let translateX = 0;
            let translateY = 0;

            const updateTransform = () => {
                const svg = diagramContainer.querySelector('svg');
                if (svg) {
                    svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
                }
            };

            const diagramContainer = document.createElement('div');
            diagramContainer.className = 'mermaid-diagram-container';
            outerContainer.append(diagramContainer);

            // Hide diagram controls initially
            controlsGroup.querySelectorAll('.mermaid-diagram-control').forEach(el => {
                el.style.display = 'none';
            });

            // Inject controls into Gemini's header
            const header = pre.previousElementSibling;
            let targetContainer = null;
            if (header && header.tagName === 'DIV') {
                if (header.lastElementChild && header.lastElementChild.tagName === 'DIV') {
                    targetContainer = header.lastElementChild;
                    targetContainer.style.display = 'flex';
                    targetContainer.style.alignItems = 'center';
                } else {
                    targetContainer = header;
                }
            }

            if (targetContainer) {
                if (targetContainer === header && targetContainer.lastElementChild) {
                     targetContainer.insertBefore(controlsGroup, targetContainer.lastElementChild);
                } else {
                     targetContainer.insertBefore(controlsGroup, targetContainer.firstChild);
                }
            } else {
                pre.insertAdjacentElement('beforebegin', controlsGroup);
            }

            pre.insertAdjacentElement('afterend', outerContainer);

            const performRender = async () => {
                try {
                    const currentText = pre.textContent.trim();
                    const id = `mermaid-svg-${Date.now()}-${index}`;
                    const currentSettings = `${currentTheme}-${isSmooth}`;
                    
                    // Only re-initialize if settings changed to save time
                    if (lastSettings !== currentSettings) {
                        mermaid.initialize({ 
                            theme: currentTheme,
                            legacyMathML: true,
                            flowchart: { curve: isSmooth ? 'basis' : 'linear', nodeSpacing: isSmooth ? 100 : 50, rankSpacing: isSmooth ? 120 : 50, htmlLabels: true, useMaxWidth: false },
                            state: { curve: isSmooth ? 'basis' : 'linear', nodeSpacing: isSmooth ? 100 : 50, rankSpacing: isSmooth ? 120 : 50, htmlLabels: true, useMaxWidth: false },
                            securityLevel: 'loose'
                        });
                        lastSettings = currentSettings;
                    }

                    const finalCode = currentText.replace(/(?<!\$)\$([^$\n]+)\$(?!\$)/g, '$$$$$1$$$$');
                    const { svg } = await mermaid.render(id, finalCode);
                    try {
                        const parser = new DOMParser();
                        const doc = parser.parseFromString(svg, 'image/svg+xml');
                        const svgElement = doc.documentElement;
                        diagramContainer.textContent = '';
                        diagramContainer.appendChild(svgElement);
                    } catch (e) {
                        const errorDiv = document.createElement('div');
                        errorDiv.style.cssText = "color: #ff5252; padding: 10px; background: #ffebee; border-radius: 8px;";
                        errorDiv.textContent = "Errore di rendering SVG.";
                        diagramContainer.textContent = '';
                        diagramContainer.appendChild(errorDiv);
                    }
                    setTimeout(updateTransform, 10);
                } catch (error) {
                    console.error("[Mermaid-Extension] Render Error:", error);
                    const errorDiv = document.createElement('div');
                    errorDiv.style.cssText = "color: #ff5252; padding: 10px; background: #ffebee; border-radius: 8px;";
                    errorDiv.textContent = "Errore di sintassi nel codice Mermaid.";
                    diagramContainer.textContent = '';
                    diagramContainer.appendChild(errorDiv);
                }
            };

            btnPinDiagram.onclick = () => {
                const svg = diagramContainer.querySelector('svg');
                if (svg) {
                    const clone = svg.cloneNode(true);
                    clone.style.transform = '';
                    if (window.addPinnedItem) {
                        window.addPinnedItem(clone, 'Diagramma Mermaid');
                    }
                }
            };

            btnSmooth.onclick = async (e) => {
                e.preventDefault();
                isSmooth = !isSmooth;
                btnSmooth.textContent = `🌊 Curve: ${isSmooth ? 'Morbide' : 'Spezzate'}`;
                await performRender();
            };

            themeSelect.onchange = async (e) => {
                currentTheme = e.target.value;
                outerContainer.dataset.theme = currentTheme;
                controlsGroup.dataset.theme = currentTheme;
                await performRender();
            };

            btnCopy.onclick = async () => {
                const oldText = btnCopy.textContent;
                btnCopy.textContent = '⏳...';
                try {
                    await exportImage(diagramContainer.querySelector('svg'), 'copy');
                    btnCopy.textContent = '✅ Copiato!';
                } catch (e) {
                    btnCopy.textContent = '❌ Errore';
                }
                setTimeout(() => btnCopy.textContent = oldText, 2000);
            };
            btnSave.onclick = async () => {
                const oldText = btnSave.textContent;
                btnSave.textContent = '⏳...';
                try {
                    await exportImage(diagramContainer.querySelector('svg'), 'download');
                    btnSave.textContent = '✅ Salvato!';
                } catch (e) {
                    btnSave.textContent = '❌ Errore';
                }
                setTimeout(() => btnSave.textContent = oldText, 2000);
            };

            btnAnki.onclick = async () => {
                const oldText = btnAnki.textContent;
                btnAnki.textContent = '⏳...';
                try {
                    console.log("[Mermaid-Extension] Starting Anki export...");
                    const ankiText = pre.textContent.trim();
                    
                    let css = "";
                    try {
                        const cssResponse = await fetch(chrome.runtime.getURL('anki_export/anki_styles.css'));
                        if (cssResponse.ok) {
                            css = await cssResponse.text();
                        }
                    } catch (e) {
                        console.warn("[Mermaid-Extension] CSS fetch failed, proceeding without custom styles:", e);
                    }
                    
                    if (typeof AnkiExporter === 'undefined') {
                        throw new Error("AnkiExporter library not loaded. Check manifest.json");
                    }

                    const exporter = new AnkiExporter("Gemini Deck", css);
                    
                    const renderFn = async (code) => {
                        console.log("[Mermaid-Extension] Rendering Mermaid for Anki...");
                        const id = `mermaid-anki-${Date.now()}`;
                        const { svg } = await mermaid.render(id, code);
                        return new Promise((resolve) => {
                            const img = new Image();
                            img.onload = () => {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                ctx.fillStyle = 'white';
                                ctx.fillRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(img, 0, 0);
                                canvas.toBlob(blob => {
                                    resolve({ blob, fileName: `mermaid_${Math.random().toString(36).substr(2, 9)}.png` });
                                }, 'image/png');
                            };
                            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
                        });
                    };

                    await exporter.parseText(ankiText, renderFn);
                    const blob = await exporter.generateApkg();
                    
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Gemini_Anki_${Date.now()}.apkg`;
                    a.click();
                    URL.revokeObjectURL(url);
                    
                    btnAnki.textContent = '✅ Scaricato!';
                    console.log("[Mermaid-Extension] Anki export successful.");
                } catch (e) {
                    console.error("[Mermaid-Extension] Anki Export Error:", e);
                    btnAnki.textContent = '❌ Errore';
                }
                setTimeout(() => btnAnki.textContent = oldText, 2000);
            };

            let isFullscreen = false;
            btnFullscreen.onclick = (e) => {
                e.preventDefault();
                isFullscreen = !isFullscreen;
                if (isFullscreen) {
                    // Crea un segnaposto invisibile dove si trova attualmente il container
                    outerContainer._placeholder = document.createElement('div');
                    outerContainer._placeholder.style.display = 'none';
                    outerContainer.parentNode.insertBefore(outerContainer._placeholder, outerContainer);

                    document.body.appendChild(outerContainer);
                    controlsGroup.classList.add('mermaid-controls-fullscreen');
                    outerContainer.appendChild(controlsGroup);

                    outerContainer.classList.add('mermaid-fullscreen');
                    btnFullscreen.textContent = '⛶ Esci';
                    document.body.style.overflow = 'hidden';
                } else {
                    // Reinserisci il container esattamente dove si trova il segnaposto
                    if (outerContainer._placeholder && outerContainer._placeholder.parentNode) {
                        outerContainer._placeholder.parentNode.replaceChild(outerContainer, outerContainer._placeholder);
                        outerContainer._placeholder = null;
                    }
                    
                    if (controlsGroup._originalParent) {
                        // Ripristina i controlli nel loro posto originale (pre-header)
                        // È meglio usare un target noto piuttosto che l'originalParent se questo cambia
                        const header = pre.previousElementSibling;
                        if(header) {
                            header.appendChild(controlsGroup); // fallback sicuro
                        }
                    }
                    controlsGroup.classList.remove('mermaid-controls-fullscreen');
                    outerContainer.classList.remove('mermaid-fullscreen');
                    btnFullscreen.textContent = '⛶';
                    document.body.style.overflow = '';
                }
                scale = 1; translateX = 0; translateY = 0; updateTransform();
            };

            btnZoomIn.onclick = () => { scale += 0.2; updateTransform(); };
            btnZoomOut.onclick = () => { if (scale > 0.2) scale -= 0.2; updateTransform(); };
            btnReset.onclick = () => { scale = 1; translateX = 0; translateY = 0; updateTransform(); };

            let isDragging = false;
            let startX, startY;
            diagramContainer.onmousedown = (e) => {
                isDragging = true;
                startX = e.pageX - translateX;
                startY = e.pageY - translateY;
                diagramContainer.style.cursor = 'grabbing';
            };
            window.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                translateX = e.pageX - startX;
                translateY = e.pageY - startY;
                updateTransform();
            });
            window.addEventListener('mouseup', () => {
                isDragging = false;
                diagramContainer.style.cursor = 'grab';
            });

            btnToggle.onclick = async (e) => {
                if (e) e.preventDefault();
                if (!pre._mermaidIsVisible) {
                    await performRender();
                    pre.style.display = 'none'; 
                    outerContainer.style.display = 'block'; 
                    btnToggle.classList.add('active');
                    pre._mermaidIsVisible = true;
                    controlsGroup.querySelectorAll('.mermaid-diagram-control').forEach(el => el.style.display = '');
                } else {
                    pre.style.display = 'block';
                    outerContainer.style.display = 'none';
                    btnToggle.classList.remove('active');
                    pre._mermaidIsVisible = false;
                    controlsGroup.querySelectorAll('.mermaid-diagram-control').forEach(el => el.style.display = 'none');
                }
            };
        }
    });
}

function autoRenderLastMessage() {
    const allPres = Array.from(document.querySelectorAll('pre')).filter(pre => {
        return pre.dataset.mermaidExtensionProcessed === "true";
    });

    if (allPres.length === 0) return;

    const blocks = [];
    const preBlocks = new Map();
    
    allPres.forEach(pre => {
        let curr = pre;
        let block = null;
        while (curr && curr !== document.body) {
            if (curr.tagName === 'MESSAGE-CONTENT' || curr.tagName === 'MODEL-RESPONSE' || 
                curr.classList.contains('message-content') || curr.classList.contains('response-container') ||
                curr.tagName === 'CHAT-ITEM' || curr.tagName === 'CONVERSATION-ITEM') {
                block = curr;
                break;
            }
            curr = curr.parentElement;
        }
        if (!block) block = pre.parentElement?.parentElement?.parentElement?.parentElement || pre.parentElement;
        if (!blocks.includes(block)) blocks.push(block);
        preBlocks.set(pre, block);
    });

    const lastBlock = blocks[blocks.length - 1];

    allPres.forEach(pre => {
        const isLast = preBlocks.get(pre) === lastBlock;
        const btnToggle = pre._mermaidToggleBtn;
        
        if (isLast && pre.dataset.autoRendered !== "true" && btnToggle) {
            const currentTextLength = pre.textContent.length;
            if (pre.dataset.lastLength != currentTextLength) {
                pre.dataset.lastLength = currentTextLength;
                pre.dataset.stableCount = 0;
            } else {
                pre.dataset.stableCount = (parseInt(pre.dataset.stableCount) || 0) + 1;
            }
            
            // Stable for 1 interval (2 seconds)
            if (pre.dataset.stableCount >= 1) {
                pre.dataset.autoRendered = "true";
                // Solo se il pulsante è visibile (non è un blocco solo Anki)
                if (!pre._mermaidIsVisible && btnToggle && btnToggle.style.display !== 'none') {
                    btnToggle.click();
                }
            }
        }
    });
}

// Esegui la prima volta
injectMermaidButtons();
setTimeout(autoRenderLastMessage, 500);

// Observer per il contenuto: si attiva solo quando Gemini aggiunge nuovi nodi (es. nuovi messaggi)
const contentObserver = new MutationObserver((mutations) => {
    let shouldRun = false;
    for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
            shouldRun = true;
            break;
        }
    }
    
    // Se ci sono stati cambiamenti, avvia l'elaborazione usando un timeout 
    // per raggruppare le chiamate ravvicinate (Debouncing)
    if (shouldRun) {
        clearTimeout(contentObserver._timer);
        contentObserver._timer = setTimeout(() => {
            injectMermaidButtons();
            autoRenderLastMessage();
        }, 500); // Aspetta mezzo secondo dalla fine dell'animazione
    }
});

// Osserva il contenitore principale per le aggiunte
const observeChat = () => {
    const mainContainer = document.querySelector('main') || document.body;
    contentObserver.observe(mainContainer, { childList: true, subtree: true });
};
observeChat();

// --- Pinboard Implementation ---
(() => {
    // 0. Icon Helper
    const createIcon = (name) => {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("width", "18");
        svg.setAttribute("height", "18");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2.5");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        
        const paths = {
            pin: "M12 2v8m-4 4l4-4 4 4M12 2v10M5 20h14",
            trash: "M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2",
            wide: "M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7",
            dock: "M2 5a2 2 0 012-2h16a2 2 0 012 2v14a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm13 0v14",
            close: "M18 6L6 18M6 6l12 12"
        };
        
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", paths[name] || "");
        svg.appendChild(path);
        return svg;
    };

    // 1. Create Pinboard DOM
    const pinboard = document.createElement('div');
    pinboard.id = 'gemini-pinboard';
    pinboard.className = 'gemini-pinboard floating';

    const resizer = document.createElement('div');
    resizer.id = 'gemini-pinboard-resizer';
    pinboard.appendChild(resizer);
    
    const header = document.createElement('div');
    header.className = 'pinboard-header';
    
    const title = document.createElement('div');
    title.className = 'gemini-pinboard-title';
    const pinIcon = document.createElement('span');
    pinIcon.textContent = '📌 ';
    const titleText = document.createElement('span');
    titleText.textContent = 'Pinboard';
    title.append(pinIcon, titleText);

    const actions = document.createElement('div');
    actions.className = 'pinboard-actions';
    
    const btnClear = document.createElement('button');
    btnClear.className = 'pin-header-btn';
    btnClear.appendChild(createIcon('trash'));
    btnClear.title = 'Svuota tutto';

    const btnWide = document.createElement('button');
    btnWide.className = 'pin-header-btn';
    btnWide.appendChild(createIcon('wide'));
    btnWide.title = 'Wide Mode';

    const btnDock = document.createElement('button');
    btnDock.className = 'pin-header-btn';
    btnDock.appendChild(createIcon('dock'));
    btnDock.title = 'Dock/Floating';

    const btnClose = document.createElement('button');
    btnClose.className = 'pin-header-btn';
    btnClose.appendChild(createIcon('close'));
    btnClose.title = 'Chiudi';
    
    actions.append(btnClear, btnWide, btnDock, btnClose);
    header.append(title, actions);
    
    const content = document.createElement('div');
    content.className = 'pinboard-content';
    
    pinboard.append(header, content);
    document.body.appendChild(pinboard);
    
    // 2. Create Toggle Tab
    const tab = document.createElement('div');
    tab.id = 'gemini-pinboard-tab';
    tab.textContent = '📌';
    tab.title = 'Apri Pinboard';
    document.body.appendChild(tab);
    
    // 3. Create Selection Popup
    const selectionPopup = document.createElement('div');
    selectionPopup.id = 'gemini-selection-popup';
    
    const btnPinText = document.createElement('button');
    btnPinText.className = 'gemini-popup-btn';
    btnPinText.textContent = '📌 Fissa';
    
    const btnQuoteText = document.createElement('button');
    btnQuoteText.className = 'gemini-popup-btn';
    btnQuoteText.textContent = '💬 Cita';
    
    selectionPopup.append(btnPinText, btnQuoteText);
    document.body.appendChild(selectionPopup);

    // State & Persistence
    let isDocked = localStorage.getItem('gemini-pin-docked') === 'true';
    let isWide = localStorage.getItem('gemini-pin-wide') === 'true';
    let itemCount = 0;

    // 4. Integrated Chat Controls
    const injectChatControls = () => {
        if (document.getElementById('gemini-chat-controls')) return;
        
        // Robust search for the chat input fieldset
        const fieldset = document.querySelector('rich-textarea') ||
                         document.querySelector('.input-area-container fieldset') || 
                         document.querySelector('fieldset:has(.ql-editor)') ||
                         document.querySelector('fieldset[role="region"]') ||
                         document.querySelector('fieldset');

        if (!fieldset) {
            console.debug("[Pinboard] Chat fieldset not found yet...");
            return;
        }

        console.log("[Pinboard] Injecting controls into:", fieldset);
        const chatControls = document.createElement('div');
        chatControls.id = 'gemini-chat-controls';

        const cBtnPin = document.createElement('button');
        cBtnPin.className = 'chat-control-btn';
        cBtnPin.appendChild(createIcon('pin'));
        cBtnPin.title = 'Pinboard';
        cBtnPin.onclick = (e) => {
            e.preventDefault();
            pinboard.classList.toggle('visible');
            if (pinboard.classList.contains('visible')) tab.classList.remove('visible');
            updateLayout();
        };

        const cBtnWide = document.createElement('button');
        cBtnWide.className = 'chat-control-btn';
        cBtnWide.appendChild(createIcon('wide'));
        cBtnWide.title = 'Wide Mode';
        cBtnWide.onclick = (e) => {
            e.preventDefault();
            isWide = !isWide;
            updateLayout();
        };

        chatControls.append(cBtnPin, cBtnWide);
        
        // Inject before the editor or tools
        const target = fieldset.querySelector('.upload-card-button') || fieldset.firstChild;
        if (target === fieldset.firstChild) {
            fieldset.prepend(chatControls);
        } else {
            target.parentNode.insertBefore(chatControls, target);
        }
    };

    const inputObserver = new MutationObserver(injectChatControls);
    inputObserver.observe(document.body, { childList: true, subtree: true });
    
    // Drag logic for floating mode
    let isDragging = false;
    let dragStartX, dragStartY;
    let initialLeft, initialTop;
    
    header.addEventListener('mousedown', (e) => {
        if (isDocked || e.target.closest('button')) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        const rect = pinboard.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onStopDrag);
    });
    
    function onDrag(e) {
        if (!isDragging) return;
        const dx = e.clientX - dragStartX;
        const dy = e.clientY - dragStartY;
        // override 'right' and use 'left' for dragging
        pinboard.style.right = 'auto';
        pinboard.style.left = `${initialLeft + dx}px`;
        pinboard.style.top = `${initialTop + dy}px`;
    }
    
    function onStopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onStopDrag);
    }
    
    const updateLayout = () => {
        // Cerca tutti i contenitori principali di Gemini
        const containers = [
            document.querySelector('main'),
            document.querySelector('.chat-scroll-container'),
            document.querySelector('infinite-scroller'),
            document.querySelector('.conversation-container')
        ].filter(el => el);

        if (containers.length === 0) return;

        document.body.classList.remove('pin-docked-left');

        // Gestione WIDE
        if (isWide) {
            document.body.classList.add('gemini-wide-mode');
            btnWide.style.filter = 'grayscale(0)';
        } else {
            document.body.classList.remove('gemini-wide-mode');
            btnWide.style.filter = 'grayscale(1)';
        }

        const isVisible = pinboard.classList.contains('visible');

        // Gestione DOCK e MARGINI
        if (isDocked && isVisible) {
            // È agganciata E visibile: applica i margini per fare spazio
            const width = pinboard.style.width || '450px';
            pinboard.style.width = width;
            pinboard.className = 'gemini-pinboard visible docked-right';
            
            // RESET CRITICO POSIZIONAMENTO (Evita che rimanga a sinistra se trascinata)
            pinboard.style.left = '';
            pinboard.style.right = '';
            pinboard.style.top = '';
            
            containers.forEach(el => {
                el.style.setProperty('margin-right', width, 'important');
                el.style.removeProperty('margin-left');
            });
            btnDock.textContent = '◩';
            
        } else {
            // È chiusa OPPURE è floating: in entrambi i casi la chat deve tornare a tutto schermo
            if (!isDocked) {
                pinboard.className = isVisible ? 'gemini-pinboard visible floating' : 'gemini-pinboard floating';
                
                // Se non è visibile, resettiamo anche la posizione per la prossima volta
                if (!isVisible) {
                    pinboard.style.left = '';
                    pinboard.style.right = '';
                    pinboard.style.top = '';
                }
            } else {
                pinboard.className = 'gemini-pinboard docked-right'; 
                // Reset posizionamento anche se nascosta ma docked
                pinboard.style.left = '';
                pinboard.style.right = '';
                pinboard.style.top = '';
            }
            
            // PULIZIA MARGINI CRITICA
            containers.forEach(el => {
                el.style.removeProperty('margin-right');
                el.style.removeProperty('margin-left');
            });
            
            btnDock.textContent = isDocked ? '◩' : '◨';
        }
        
        localStorage.setItem('gemini-pin-docked', isDocked);
        localStorage.setItem('gemini-pin-wide', isWide);
    };

    // Manual Resize logic for Sidebar
    let isResizing = false;
    
    resizer.addEventListener('mousedown', (e) => {
        if (!isDocked) return;
        isResizing = true;
        resizer.classList.add('active');
        document.body.classList.add('resizing-pinboard');
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        let newWidth = window.innerWidth - e.clientX;

        if (newWidth > 200 && newWidth < window.innerWidth * 0.8) {
            const widthStr = `${newWidth}px`;
            pinboard.style.width = widthStr;
            const containers = [
                document.querySelector('main'),
                document.querySelector('.chat-scroll-container'),
                document.querySelector('infinite-scroller'),
                document.querySelector('.conversation-container')
            ].filter(el => el);

            containers.forEach(el => {
                el.style.setProperty('margin-right', widthStr, 'important');
            });
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.classList.remove('resizing-pinboard');
        }
    });
    
    // Actions logic
    btnWide.onclick = () => {
        isWide = !isWide;
        updateLayout();
    };

    btnDock.onclick = () => {
        isDocked = !isDocked;
        updateLayout();
    };
    
    btnClose.onclick = () => {
        pinboard.classList.remove('visible');
        if (itemCount > 0) tab.classList.add('visible');
        updateLayout();
    };
    
    tab.onclick = () => {
        pinboard.classList.add('visible');
        tab.classList.remove('visible');
        updateLayout();
    };
    
    const updateTitle = () => {
        const titleSpan = header.querySelector('.gemini-pinboard-title span:last-child');
        if (titleSpan) titleSpan.textContent = `Pinboard (${itemCount})`;
    };

    btnClear.onclick = () => {
        content.textContent = '';
        itemCount = 0;
        updateTitle();
        pinboard.classList.remove('visible');
        tab.classList.remove('visible');
        updateLayout();
    };

    window.addPinnedItem = (contentNode, typeName) => {
        const item = document.createElement('div');
        item.className = 'pinned-item';
        
        const itemHeader = document.createElement('div');
        itemHeader.className = 'pinned-item-header';
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'pin-header-btn';
        removeBtn.textContent = '✖';
        removeBtn.style.cssText = "width: 20px; height: 20px; font-size: 10px; padding: 0; display: flex; align-items: center; justify-content: center;";
        removeBtn.onclick = () => {
            item.remove();
            itemCount--;
            updateTitle();
            if (itemCount === 0) {
                pinboard.classList.remove('visible');
            }
        };
        itemHeader.appendChild(removeBtn);
        
        const itemBody = document.createElement('div');
        itemBody.className = 'pinned-item-body';
        if (typeof contentNode === 'string') {
            itemBody.textContent = contentNode;
        } else {
            itemBody.appendChild(contentNode);
        }
        
        item.append(itemHeader, itemBody);
        content.prepend(item); 
        
        itemCount++;
        updateTitle();
        
        pinboard.classList.add('visible');
        tab.classList.remove('visible');
        updateLayout();
    };

    // Initial Layout update
    setTimeout(updateLayout, 1000);
    
    // Text Selection Logic
    document.addEventListener('mouseup', (e) => {
        // Ignore clicks on pinboard or popup
        if (e.target.closest('#gemini-pinboard') || e.target.closest('#gemini-selection-popup')) return;
        
        setTimeout(() => {
            const selection = window.getSelection();
            if (selection && selection.toString().trim().length > 0 && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                
                selectionPopup.style.display = 'flex';
                selectionPopup.style.left = `${rect.right + window.scrollX + 10}px`;
                selectionPopup.style.top = `${rect.top + window.scrollY - 30}px`;
            } else {
                selectionPopup.style.display = 'none';
            }
        }, 10);
    });
    
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('#gemini-selection-popup')) {
            selectionPopup.style.display = 'none';
        }
    });

    const getExpandedRange = (selection) => {
        const range = selection.getRangeAt(0);
        const getClosest = (node, selector) => {
            if (!node) return null;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            return node ? node.closest(selector) : null;
        };
        const startMath = getClosest(range.startContainer, '.katex, .katex-display');
        if (startMath) range.setStartBefore(startMath);
        const endMath = getClosest(range.endContainer, '.katex, .katex-display');
        if (endMath) range.setEndAfter(endMath);
        return range;
    };
    
    btnPinText.onclick = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const range = getExpandedRange(selection);
            const fragment = range.cloneContents();
            const wrapper = document.createElement('message-content');
            wrapper.className = 'message-content';
            wrapper.style.display = 'block';
            wrapper.appendChild(fragment);
            window.addPinnedItem(wrapper, 'Testo');
            selection.removeAllRanges();
            selectionPopup.style.display = 'none';
        }
    };

    btnQuoteText.onclick = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const textToQuote = selection.toString().trim();
            if (textToQuote) {
                // Find Gemini chat input (usually a rich-textarea or contenteditable div)
                const chatInput = document.querySelector('rich-textarea') || document.querySelector('[role="textbox"][contenteditable="true"]');
                
                if (chatInput) {
                    const editable = chatInput.querySelector('[contenteditable="true"]') || chatInput;
                    editable.focus();
                    
                    const quote = `"${textToQuote}"\n`;
                    
                    // Prova prima con execCommand
                    const success = document.execCommand('insertText', false, quote);
                    
                    // Fallback ROBUSTO: Simulazione di un evento Paste
                    if (!success) {
                        const pasteEvent = new ClipboardEvent('paste', {
                            bubbles: true,
                            cancelable: true,
                            clipboardData: new DataTransfer()
                        });
                        pasteEvent.clipboardData.setData('text/plain', quote);
                        editable.dispatchEvent(pasteEvent);
                        
                        // Ultima spiaggia per input/textarea standard
                        if (editable.tagName === 'TEXTAREA' || editable.tagName === 'INPUT') {
                            const start = editable.selectionStart;
                            const end = editable.selectionEnd;
                            editable.value = editable.value.substring(0, start) + quote + editable.value.substring(end);
                            editable.selectionStart = editable.selectionEnd = start + quote.length;
                            editable.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    }
                } else {
                    const ta = document.querySelector('textarea');
                    if (ta) {
                        ta.value += `"${textToQuote}"\n`;
                        ta.dispatchEvent(new Event('input', { bubbles: true }));
                    } else {
                        alert("Non riesco a trovare il box di testo di Gemini.");
                    }
                }
            }
            selectionPopup.style.display = 'none';
        }
    };
})();
