/**
 * AnkiExporter.js
 * Pure JavaScript implementation of Anki .apkg generation.
 * Handles tab-separated text parsing and Mermaid diagrams.
 */

class AnkiExporter {
    constructor(subject, css) {
        this.subject = subject || "Gemini Deck";
        this.css = css || "";
        this.cards = [];
        this.media = {}; // name -> blob
        const now = Date.now();
        this.deckId = now + Math.floor(Math.random() * 1000);
        this.modelId = now + Math.floor(Math.random() * 1000) + 2000;
    }

    async parseText(text, renderMermaidFn) {
        // Rimuovi eventuali delimitatori di blocchi di codice markdown
        const cleanText = text.replace(/^```[a-z]*\n/i, '').replace(/\n```$/i, '').trim();
        const lines = cleanText.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (!line || line.startsWith('#') || line.startsWith('```')) continue;

            const tags = [];
            if (line.includes('[REV]')) {
                tags.push('reverse');
                line = line.replace('[REV]', '').trim();
            }
            if (line.includes('[SCENARIO]')) {
                tags.push('scenario');
                line = line.replace('[SCENARIO]', '').trim();
            }

            const parts = line.split('\t');
            if (parts.length < 2) continue;

            let question = parts[0].trim();
            let answer = parts[1].trim();
            let intuition = parts.length > 2 ? parts[2].trim() : "";

            // Handle Mermaid Diagrams
            question = await this._processMermaid(question, renderMermaidFn);
            answer = await this._processMermaid(answer, renderMermaidFn);

            // Handle Markdown Styling
            question = this._fixMarkdown(question);
            answer = this._fixMarkdown(answer);
            intuition = this._fixMarkdown(intuition);

            // Handle Math Syntax (Markdown $ -> Anki \( \))
            question = this._fixMath(question);
            answer = this._fixMath(answer);
            intuition = this._fixMath(intuition);

            this.cards.push({ question, answer, intuition, tags });
        }
    }

    async _processMermaid(text, renderMermaidFn) {
        const pattern = /\[IMG_([QA])\](.*)/s;
        const match = text.match(pattern);
        if (match && renderMermaidFn) {
            const code = match[2].trim().replace(/```mermaid/g, '').replace(/```/g, '').trim();
            if (code) {
                try {
                    const { blob, fileName } = await renderMermaidFn(code);
                    this.media[fileName] = blob;
                    const replacement = `<br><img src="${fileName}">`;
                    return text.replace(pattern, replacement);
                } catch (e) {
                    console.error("AnkiExporter: Mermaid render failed", e);
                }
            }
        }
        return text;
    }

    _fixMarkdown(text) {
        if (!text) return "";
        // Simple MD to HTML
        return text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    _fixMath(text) {
        if (!text) return "";
        // Block: $$...$$ -> \[...\]
        text = text.replace(/\$\$(.*?)\$\$/gs, '\\[$1\\]');
        // Inline: $...$ -> \(...\)
        text = text.replace(/(?<!\\)\$(.*?)(?<!\\)\$/g, '\\($1\\)');
        return text;
    }

    async generateApkg() {
        if (typeof initSqlJs === 'undefined') {
            throw new Error("initSqlJs not loaded. Check manifest.json and lib/sql-wasm.js");
        }

        console.log("AnkiExporter: Initializing SQL.js...");
        const sql = await initSqlJs({
            locateFile: file => {
                const url = chrome.runtime.getURL(`lib/${file}`);
                console.log("AnkiExporter: Loading WASM from", url);
                return url;
            }
        });
        console.log("AnkiExporter: SQL.js initialized.");
        const db = new sql.Database();

        // Create Anki 2.1 Database Schema
        db.run(`
            CREATE TABLE col (
                id              integer primary key,
                crt             integer not null,
                mod             integer not null,
                scm             integer not null,
                ver             integer not null,
                dty             integer not null,
                usn             integer not null,
                ls              integer not null,
                conf            text not null,
                models          text not null,
                decks           text not null,
                dconf           text not null,
                tags            text not null
            );
            CREATE TABLE notes (
                id              integer primary key,
                guid            text not null,
                mid             integer not null,
                mod             integer not null,
                usn             integer not null,
                tags            text not null,
                flds            text not null,
                sfld            text not null,
                csum            integer not null,
                flags           integer not null,
                data            text not null
            );
            CREATE TABLE cards (
                id              integer primary key,
                nid             integer not null,
                did             integer not null,
                ord             integer not null,
                mod             integer not null,
                usn             integer not null,
                type            integer not null,
                queue           integer not null,
                due             integer not null,
                ivl             integer not null,
                factor          integer not null,
                reps            integer not null,
                lapses          integer not null,
                left            integer not null,
                odue            integer not null,
                odid            integer not null,
                flags           integer not null,
                data            text not null
            );
            CREATE TABLE revlog (
                id              integer primary key,
                cid             integer not null,
                usn             integer not null,
                ease            integer not null,
                ivl             integer not null,
                lastIvl         integer not null,
                factor          integer not null,
                time            integer not null,
                type            integer not null
            );
            CREATE TABLE graves (
                usn             integer not null,
                oid             integer not null,
                type            integer not null
            );
            CREATE INDEX ix_notes_usn on notes (usn);
            CREATE INDEX ix_cards_usn on cards (usn);
            CREATE INDEX ix_revlog_usn on revlog (usn);
            CREATE INDEX ix_cards_nid on cards (nid);
        `);

        const now = Math.floor(Date.now() / 1000);
        const model = {
            id: this.modelId,
            name: "Gemini Mermaid Flashcard",
            type: 0,
            mod: now,
            usn: -1,
            sortf: 0,
            did: this.deckId,
            tmpls: [
                {
                    name: "Card 1",
                    ord: 0,
                    qfmt: '<div class="card-container"><div class="question">{{Question}}</div></div>',
                    afmt: '<div class="card-container"><div class="question">{{Question}}</div><div class="separator"></div><div class="answer">{{Answer}}</div>{{#Intuition}}<br><div class="intuition"><strong>💡 Intuizione:</strong> {{Intuition}}</div>{{/Intuition}}</div>',
                    bqfmt: "",
                    bafmt: ""
                }
            ],
            flds: [
                { name: "Question", ord: 0, sticky: false, rtl: false, font: "Arial", size: 20 },
                { name: "Answer", ord: 1, sticky: false, rtl: false, font: "Arial", size: 20 },
                { name: "Intuition", ord: 2, sticky: false, rtl: false, font: "Arial", size: 20 }
            ],
            css: this.css,
            latexPre: "\\documentclass[12pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage[T1]{fontenc}\n\\usepackage{amssymb,amsmath}\n\\pagestyle{empty}\n\\begin{document}",
            latexPost: "\\end{document}",
            tags: [],
            vers: [],
            req: [[0, "all", [0]]]
        };

        const models = { [this.modelId.toString()]: model };

        const conf = {
            nextPos: 1,
            est: true,
            activeDecks: [1, this.deckId],
            sortType: "noteFld",
            sortNodes: [true],
            collapseTime: 1200,
            curDeck: 1,
            newSpread: 0,
            timeLim: 0,
            newBury: true,
            revBury: true,
            dueCounts: true,
            curModel: this.modelId,
            nextMin: 0
        };

        const decks = {
            "1": { 
                name: "Default", 
                id: 1, 
                mod: now, 
                usn: -1, 
                lrnToday: [0, 0, 0, 0],
                revToday: [0, 0, 0, 0],
                newToday: [0, 0, 0, 0],
                timeToday: [0, 0, 0, 0],
                conf: 1, 
                rev: 0, 
                new: 0, 
                desc: "",
                collapsed: false,
                browserCollapsed: false,
                dyn: 0,
                extendNew: 10,
                extendRev: 50
            },
            [this.deckId.toString()]: {
                name: this.subject,
                id: this.deckId,
                mod: now,
                usn: -1,
                lrnToday: [0, 0, 0, 0],
                revToday: [0, 0, 0, 0],
                newToday: [0, 0, 0, 0],
                timeToday: [0, 0, 0, 0],
                conf: 1, 
                rev: 0, 
                new: 0, 
                desc: "Mazzo generato da Gemini",
                collapsed: false,
                browserCollapsed: false,
                dyn: 0,
                extendNew: 10,
                extendRev: 50
            }
        };

        const dconf = { 
            "1": { 
                id: 1, 
                mod: now, 
                name: "Default", 
                usn: -1, 
                maxTaken: 60, 
                new: { delays: [1, 10], ints: [1, 4, 7], initialFactor: 2500, separate: true, order: 1, perDay: 20, bury: false }, 
                rev: { perDay: 200, ivlFct: 1, maxIvl: 36500, pool: 14, bury: false, hardFactor: 1.2 }, 
                lapse: { delays: [10], mult: 0, minInt: 1, leeway: 60 }, 
                autoplay: true, 
                replayq: true,
                timer: 0
            } 
        };

        db.run(`INSERT INTO col VALUES (1, ${now}, ${now}, ${now}, 11, 0, -1, 0, ?, ?, ?, ?, '{}')`, [
            JSON.stringify(conf),
            JSON.stringify(models),
            JSON.stringify(decks),
            JSON.stringify(dconf)
        ]);

        // Insert Notes and Cards
        let noteId = Date.now();
        let cardId = noteId + 1000;

        for (const cardData of this.cards) {
            const guid = Math.random().toString(36).substring(2, 12);
            const flds = [cardData.question, cardData.answer, cardData.intuition].join('\x1f');
            
            db.run(`INSERT INTO notes VALUES (?, ?, ?, ?, -1, ?, ?, ?, ?, 0, '')`, [
                noteId, guid, this.modelId, now, cardData.tags.join(' '), flds, cardData.question, 0
            ]);

            db.run(`INSERT INTO cards VALUES (?, ?, ?, 0, ?, -1, 0, 0, ?, 0, 0, 0, 0, 0, 0, 0, 0, '')`, [
                cardId, noteId, this.deckId, now, noteId
            ]);

            noteId++;
            cardId++;
        }

        const zip = new JSZip();
        zip.file("collection.anki2", db.export());
        
        // Media mapping
        const mediaMapping = {};
        Object.keys(this.media).forEach((name, i) => {
            mediaMapping[i] = name;
            zip.file(i.toString(), this.media[name]);
        });
        zip.file("media", JSON.stringify(mediaMapping));

        return await zip.generateAsync({ type: "blob" });
    }
}

window.AnkiExporter = AnkiExporter;
