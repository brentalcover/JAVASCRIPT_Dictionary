const wordInput = document.getElementById("wordInput");
const searchForm = document.getElementById("searchForm");
const searchBtn = document.getElementById("searchBtn");
const wordTitle = document.getElementById("wordTitle");
const phonetic = document.getElementById("phonetic");
const meaning = document.getElementById("meaning");
const statusText = document.getElementById("statusText");
const suggestionsBox = document.getElementById("searchSuggestions");
let activeRequest;
let suggestionController;
let suggestionTimer;

function setStatus(message, state) {
    statusText.textContent = message;
    statusText.className = `status ${state}`;
}

function hideSuggestions() {
    suggestionsBox.hidden = true;
    wordInput.setAttribute("aria-expanded", "false");
}

function showSuggestions(words) {
    suggestionsBox.replaceChildren();
    for (const word of words) {
        const option = document.createElement("li");
        option.setAttribute("role", "option");
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = word;
        button.addEventListener("click", () => {
            wordInput.value = word;
            hideSuggestions();
            searchWord(word);
        });
        option.append(button);
        suggestionsBox.append(option);
    }
    suggestionsBox.hidden = words.length === 0;
    wordInput.setAttribute("aria-expanded", String(words.length > 0));
}

function loadSuggestions(value) {
    clearTimeout(suggestionTimer);
    suggestionController?.abort();
    hideSuggestions();
    const query = value.trim();
    if (query.length < 2) {
        hideSuggestions();
        return;
    }

    suggestionTimer = setTimeout(async () => {
        const controller = new AbortController();
        suggestionController = controller;
        try {
            const url = `https://api.datamuse.com/sug?s=${encodeURIComponent(query)}&max=6`;
            const response = await fetch(url, { signal: controller.signal });
            if (!response.ok) {
                hideSuggestions();
                return;
            }
            const matches = await response.json();
            if (wordInput.value.trim().toLowerCase() !== query.toLowerCase()) return;
            const words = matches
                .map(match => match.word)
                .filter(word => !/\s/.test(word) && word.toLowerCase() !== query.toLowerCase());
            showSuggestions(words);
        } catch (error) {
            if (error.name !== "AbortError") hideSuggestions();
        }
    }, 200);
}

async function searchWord(word) {
    const cleanWord = word.trim().toLowerCase();
    if (!cleanWord) {
        setStatus("Please enter a word to search.", "error");
        wordInput.focus();
        return;
    }

    activeRequest?.abort();
    const request = new AbortController();
    activeRequest = request;
    let timedOut = false;
    const timeoutId = setTimeout(() => {
        timedOut = true;
        request.abort();
    }, 10000);
    searchBtn.disabled = true;
    setStatus("Searching definition...", "loading");

    try {
        let response;
        const primaryController = new AbortController();
        const abortPrimary = () => primaryController.abort();
        request.signal.addEventListener("abort", abortPrimary, { once: true });
        const primaryTimeoutId = setTimeout(abortPrimary, 2500);
        try {
            response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`, { signal: primaryController.signal });
        } catch (error) {
            if (request.signal.aborted) throw error;
        } finally {
            clearTimeout(primaryTimeoutId);
            request.signal.removeEventListener("abort", abortPrimary);
        }

        if (response?.status === 404) {
            response = undefined;
        }

        let entry;
        if (response?.ok) {
            try {
                entry = (await response.json())[0];
            } catch (error) {
                if (error.name === "AbortError") throw error;
            }
        }

        const firstMeaning = entry?.meanings?.[0];
        const firstDefinition = firstMeaning?.definitions?.[0];
        let wordValue = entry?.word || cleanWord;
        let phoneticValue = entry?.phonetic || entry?.phonetics?.find(item => item.text)?.text || "";
        let partOfSpeech = firstMeaning?.partOfSpeech || "";
        let definitionText = firstDefinition?.definition;
        let exampleText = firstDefinition?.example;

        if (!definitionText) {
            const fallbackUrl = `https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&md=d&max=1`;
            const fallbackResponse = await fetch(fallbackUrl, { signal: request.signal });
            if (!fallbackResponse.ok) {
                throw new Error(`Dictionary service error (HTTP ${fallbackResponse.status}). Please try again.`);
            }

            const fallbackEntries = await fallbackResponse.json();
            const fallbackEntry = fallbackEntries.find(item => item.defs?.length);
            if (!fallbackEntry) {
                throw new Error("Word not found. Check the spelling and try again.");
            }

            const definitionParts = fallbackEntry.defs[0].split("\t");
            wordValue = fallbackEntry.word;
            partOfSpeech = definitionParts.length > 1 ? definitionParts.shift() : "";
            definitionText = definitionParts.join("\t");
            phoneticValue = "";
            exampleText = "";
        }

        wordTitle.textContent = wordValue;
        phonetic.textContent = phoneticValue ? `${phoneticValue} • (${partOfSpeech})` : partOfSpeech ? `(${partOfSpeech})` : "";

        meaning.replaceChildren();
        const label = document.createElement("strong");
        label.textContent = "Definition: ";
        meaning.append(label, document.createTextNode(definitionText));
        if (exampleText) {
            const example = document.createElement("span");
            example.textContent = `Example: “${exampleText}”`;
            meaning.append(document.createElement("br"), document.createElement("br"), example);
        }

        setStatus("Definition found successfully!", "success");
    } catch (error) {
        if (error.name === "AbortError" && activeRequest !== request) return;
        if (error.name === "AbortError" && timedOut) {
            error = new Error("The dictionary service took too long to respond. Please try again.");
        }
        console.error("Error:", error);
        wordTitle.textContent = cleanWord;
        phonetic.textContent = "";
        meaning.textContent = error instanceof TypeError
            ? "Could not connect to the dictionary service. Check your internet connection and try again."
            : error.message;
        setStatus("Search failed.", "error");
    } finally {
        clearTimeout(timeoutId);
        if (activeRequest === request) {
            activeRequest = undefined;
            searchBtn.disabled = false;
        }
    }
}

searchForm.addEventListener("submit", event => {
    event.preventDefault();
    clearTimeout(suggestionTimer);
    suggestionController?.abort();
    hideSuggestions();
    searchWord(wordInput.value);
});

wordInput.addEventListener("input", () => loadSuggestions(wordInput.value));
wordInput.addEventListener("focus", () => loadSuggestions(wordInput.value));
document.addEventListener("click", event => {
    if (!event.target.closest(".search-area")) hideSuggestions();
});

searchWord(wordInput.value);