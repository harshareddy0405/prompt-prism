(() => {
  "use strict";

  const STORAGE_KEY = "prompt-prism.workspace.v1";
  const colors = ["#b8ff6a", "#7de8ff", "#bca0ff", "#ff9bd5", "#ffd66b"];
  const demoValues = {
    audience: "a product manager evaluating a team workspace",
    issue: "The weekly digest includes archived projects.",
    tone: "warm, precise, and calm",
    policy: "Offer a workaround, but do not promise a release date.",
    source: "Interview notes from five customer calls",
    goal: "Identify the three strongest opportunity themes",
    constraints: "Separate evidence from inference; keep it under 400 words",
    artifact: "mobile onboarding flow",
    persona: "first-time freelancer",
    context: "The user has connected a bank account but skipped profile setup",
  };

  const samples = {
    support: {
      name: "Support reply architect",
      a: `You are a customer support specialist for a collaborative work platform.\n\nWrite a reply to {{audience}} about this issue:\n{{issue}}\n\nUse a {{tone}} tone. Follow this policy: {{policy}}\n\nYour response must:\n- Acknowledge the impact without overstating it.\n- Give 2–3 concrete next steps.\n- Separate confirmed facts from possible causes.\n- Stay under 180 words.\n\nIf key information is missing, ask one focused follow-up question. Do not invent product capabilities.\n\nOutput: subject line, then the reply body.`,
      b: `Act as an experienced customer support lead. Draft a concise response for {{audience}} regarding:\n\n<issue>{{issue}}</issue>\n\nVoice: {{tone}}\nPolicy boundary: {{policy}}\n\nStructure the response as:\n1. A one-sentence acknowledgement\n2. What we know (confirmed facts only)\n3. Two numbered actions the customer can take now\n4. One focused question, only if needed\n\nMaximum 160 words. Never fabricate a timeline, feature, or root cause.`,
    },
    research: {
      name: "Research synthesis brief",
      a: `Act as a senior research strategist. Analyze {{source}} to help us {{goal}}.\n\nConstraints:\n- {{constraints}}.\n- Cite the relevant source label beside every finding.\n- State when evidence is weak or contradictory.\n\nReturn a markdown brief with these sections:\n## Executive signal\n## Themes\n## Tensions\n## Recommended next questions\n\nFor each theme include: evidence, confidence (low/medium/high), and product implication. Do not add facts that are absent from the material.`,
      b: `You are synthesizing qualitative research from {{source}}. The decision this work must support is: {{goal}}.\n\nFirst, identify repeated observations. Then distinguish direct evidence from your interpretation. Apply these boundaries: {{constraints}}.\n\nOutput a table with columns: Theme, Evidence, Frequency, Confidence, Implication. Follow it with three unanswered questions. If the source cannot support a conclusion, write “insufficient evidence.”`,
    },
    critique: {
      name: "Design critique lens",
      a: `You are a thoughtful product design critic reviewing a {{artifact}} for {{persona}}.\n\nContext: {{context}}.\n\nEvaluate the design through four lenses: hierarchy, comprehension, accessibility, and user momentum. For each lens:\n- Name one effective choice.\n- Identify one observable friction.\n- Propose a specific improvement and explain the trade-off.\n\nPrioritize the top three changes by impact and effort. Avoid subjective taste statements; connect every point to the stated user and context. Output a concise markdown critique.`,
      b: `Review this {{artifact}} from the perspective of {{persona}}. Situation: {{context}}.\n\nCreate a design critique with:\n1. A two-sentence read of the current experience\n2. A score from 1–5 for hierarchy, clarity, accessibility, and momentum\n3. Evidence for each score\n4. Three prioritized interventions, each with rationale, risk, and a way to validate it\n\nBase comments on observable interaction design principles. Do not assume research findings that were not provided.`,
    },
    blank: { name: "Untitled prompt", a: "", b: "" },
  };

  const defaultState = () => ({
    projectName: samples.support.name,
    variants: { a: samples.support.a, b: samples.support.b },
    values: {
      audience: "a small design agency",
      issue: "Invited collaborators cannot see shared templates.",
      tone: "warm and direct",
      policy: "Do not promise an engineering timeline.",
    },
    activeVariant: "a",
    sample: "support",
    contrast: false,
    versions: [
      {
        id: "seed-2",
        label: "Sharper guardrails",
        variant: "a",
        text: samples.support.a,
        score: 92,
        createdAt: Date.now() - 1000 * 60 * 18,
      },
      {
        id: "seed-1",
        label: "Initial structure",
        variant: "a",
        text: samples.support.a.replace(
          "Do not invent product capabilities.",
          "",
        ),
        score: 84,
        createdAt: Date.now() - 1000 * 60 * 54,
      },
    ],
  });

  let state = loadState();
  let toastTimer;

  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [
    ...context.querySelectorAll(selector),
  ];
  const el = {
    editor: $("#promptEditor"),
    projectNameText: $("#projectNameText"),
    saveState: $("#saveState"),
    activeVariantLabel: $("#activeVariantLabel"),
    tokenEstimate: $("#tokenEstimate"),
    charCount: $("#charCount"),
    variableGrid: $("#variableGrid"),
    variableCount: $("#variableCount"),
    variableEmpty: $("#variableEmpty"),
    compiledPreview: $("#compiledPreview"),
    unresolvedBadge: $("#unresolvedBadge"),
    scoreRing: $("#scoreRing"),
    overallScore: $("#overallScore"),
    scoreLabel: $("#scoreLabel"),
    scoreSummary: $("#scoreSummary"),
    metricList: $("#metricList"),
    suggestionList: $("#suggestionList"),
    suggestionCount: $("#suggestionCount"),
    comparisonPanel: $("#comparisonPanel"),
    compareA: $("#compareA"),
    compareB: $("#compareB"),
    scoreA: $("#scoreA"),
    scoreB: $("#scoreB"),
    compareSummary: $("#compareSummary"),
    versionCount: $("#versionCount"),
    versionTimeline: $("#versionTimeline"),
    versionDetail: $("#versionDetail"),
    sampleSelect: $("#sampleSelect"),
    toast: $("#toast"),
    nameDialog: $("#nameDialog"),
    nameInput: $("#nameInput"),
  };

  function loadState() {
    try {
      const raw = WorkspaceStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const saved = JSON.parse(raw);
      const fallback = defaultState();
      return {
        ...fallback,
        ...saved,
        variants: { ...fallback.variants, ...saved.variants },
        values: saved.values || {},
        versions: Array.isArray(saved.versions)
          ? saved.versions
          : fallback.versions,
      };
    } catch {
      return defaultState();
    }
  }

  function persist() {
    el.saveState.classList.add("saving");
    el.saveState.lastChild.textContent = " Saving…";
    WorkspaceStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.clearTimeout(persist.timer);
    persist.timer = window.setTimeout(() => {
      el.saveState.classList.remove("saving");
      el.saveState.lastChild.textContent = WorkspaceStorage.persistent
        ? " Saved locally"
        : " Session only";
    }, 350);
  }

  function extractVariables(text) {
    return [
      ...new Set(
        [...text.matchAll(/{{\s*([a-zA-Z][\w-]*)\s*}}/g)].map(
          (match) => match[1],
        ),
      ),
    ];
  }

  function compile(text) {
    return text.replace(
      /{{\s*([a-zA-Z][\w-]*)\s*}}/g,
      (full, key) => state.values[key]?.trim() || `⟦${key}⟧`,
    );
  }

  function analyze(text) {
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/) : [];
    const lines = trimmed ? trimmed.split("\n") : [];
    const lower = trimmed.toLowerCase();
    const variables = extractVariables(trimmed);
    const hasAction =
      /\b(write|create|analy[sz]e|summarize|draft|review|design|generate|identify|evaluate|act as|return|produce)\b/i.test(
        trimmed,
      );
    const contextSignals = (
      trimmed.match(
        /\b(context|audience|user|source|situation|background|for a|regarding|about|perspective)\b/gi,
      ) || []
    ).length;
    const constraintSignals = (
      trimmed.match(
        /\b(must|should|under|maximum|minimum|avoid|never|only|do not|constraint|limit|exactly)\b/gi,
      ) || []
    ).length;
    const formatSignals =
      (
        trimmed.match(
          /\b(output|format|section|table|markdown|json|list|columns?|subject line|structure)\b/gi,
        ) || []
      ).length +
      lines.filter((line) => /^\s*(?:[-*]|\d+[.)]|#{1,3})\s/.test(line)).length;
    const guardSignals = (
      trimmed.match(
        /\b(if .*missing|uncertain|do not invent|do not fabricate|insufficient|confirmed facts|absent|weak evidence|ask .*question)\b/gi,
      ) || []
    ).length;
    const lengthFitness =
      words.length >= 45 && words.length <= 260
        ? 1
        : words.length >= 20 && words.length <= 360
          ? 0.62
          : words.length
            ? 0.28
            : 0;
    const scores = {
      Intent: Math.round(
        Math.min(
          100,
          (hasAction ? 58 : 18) +
            Math.min(24, words.length / 4) +
            (variables.length ? 10 : 0) +
            (/[.!?:]/.test(trimmed) ? 8 : 0),
        ),
      ),
      Context: Math.round(
        Math.min(
          100,
          18 +
            contextSignals * 17 +
            variables.length * 7 +
            (words.length > 70 ? 12 : 0),
        ),
      ),
      Constraints: Math.round(
        Math.min(
          100,
          12 +
            constraintSignals * 12 +
            (/[0-9]+\s*(words?|sentences?|items?|%)/i.test(trimmed) ? 14 : 0) +
            lengthFitness * 12,
        ),
      ),
      Output: Math.round(
        Math.min(
          100,
          12 +
            formatSignals * 11 +
            (lines.length > 4 ? 10 : 0) +
            (/[:]/.test(trimmed) ? 8 : 0),
        ),
      ),
      Guardrails: Math.round(
        Math.min(
          100,
          14 +
            guardSignals * 24 +
            (/\b(fact|evidence|source)\b/i.test(lower) ? 12 : 0),
        ),
      ),
    };
    const weights = {
      Intent: 0.22,
      Context: 0.2,
      Constraints: 0.2,
      Output: 0.2,
      Guardrails: 0.18,
    };
    const overall = Math.round(
      Object.entries(scores).reduce(
        (sum, [key, value]) => sum + value * weights[key],
        0,
      ),
    );
    const suggestions = [];
    if (!hasAction)
      suggestions.push({
        icon: "↗",
        color: colors[0],
        title: "Lead with a direct task",
        body: "Add an action such as “Draft”, “Analyze”, or “Create” so the intent is unmistakable.",
      });
    if (scores.Context < 65)
      suggestions.push({
        icon: "◎",
        color: colors[1],
        title: "Ground the situation",
        body: "Name the audience, source material, or decision this response needs to support.",
      });
    if (scores.Constraints < 70)
      suggestions.push({
        icon: "⌁",
        color: colors[2],
        title: "Add a meaningful boundary",
        body: "Set a length, inclusion rule, exclusion, or quality bar that can be checked.",
      });
    if (scores.Output < 70)
      suggestions.push({
        icon: "▤",
        color: colors[3],
        title: "Design the response shape",
        body: "Specify sections, fields, a table, or another concrete output structure.",
      });
    if (scores.Guardrails < 65)
      suggestions.push({
        icon: "◇",
        color: colors[4],
        title: "Handle uncertainty",
        body: "Explain what to do when facts are missing and explicitly discourage invention.",
      });
    if (words.length > 320)
      suggestions.push({
        icon: "−",
        color: colors[4],
        title: "Reduce instruction drag",
        body: "This is long enough to hide priorities. Remove repetition or group related requirements.",
      });
    if (!suggestions.length)
      suggestions.push({
        icon: "✓",
        color: colors[0],
        title: "Strong, testable structure",
        body: "All five rubric lenses have clear signals. Try a challenger variant to test brevity or tone.",
      });
    return { overall, scores, suggestions, words: words.length };
  }

  function renderEditor() {
    el.editor.value = state.variants[state.activeVariant] || "";
    el.projectNameText.textContent = state.projectName;
    el.activeVariantLabel.textContent = `Editing Variant ${state.activeVariant.toUpperCase()}`;
    el.sampleSelect.value = state.sample in samples ? state.sample : "support";
    $$(".variant-tab").forEach((tab) => {
      const active = tab.dataset.variant === state.activeVariant;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-pressed", String(active));
    });
    document.body.classList.toggle("high-contrast", Boolean(state.contrast));
    updateDerived();
  }

  function updateDerived() {
    const text = state.variants[state.activeVariant] || "";
    el.charCount.textContent = text.length.toLocaleString();
    el.tokenEstimate.textContent = Math.ceil(text.length / 4).toLocaleString();
    renderVariables(text);
    renderPreview(text);
    renderAnalysis(analyze(text));
    if (!el.comparisonPanel.hidden) renderComparison();
  }

  function renderVariables(text) {
    const variables = extractVariables(text);
    el.variableCount.textContent = variables.length;
    el.variableGrid.innerHTML = "";
    el.variableEmpty.hidden = variables.length > 0;
    variables.forEach((key) => {
      const wrap = document.createElement("div");
      wrap.className = "variable-field";
      const label = document.createElement("label");
      label.htmlFor = `variable-${key}`;
      label.textContent = key.replace(/[-_]/g, " ");
      const input = document.createElement("input");
      input.id = `variable-${key}`;
      input.dataset.variable = key;
      input.value = state.values[key] || "";
      input.placeholder = demoValues[key] || `Value for ${key}`;
      input.addEventListener("input", (event) => {
        state.values[key] = event.target.value;
        persist();
        renderPreview(state.variants[state.activeVariant]);
      });
      wrap.append(label, input);
      el.variableGrid.append(wrap);
    });
  }

  function renderPreview(text) {
    const output = compile(text);
    const unresolved = (output.match(/⟦[^⟧]+⟧/g) || []).length;
    el.compiledPreview.textContent =
      output || "Your resolved prompt will appear here.";
    el.unresolvedBadge.textContent = `${unresolved} unresolved`;
    el.unresolvedBadge.style.color = unresolved
      ? "var(--amber)"
      : "var(--lime)";
  }

  function renderAnalysis(result) {
    el.overallScore.textContent = result.overall;
    el.scoreRing.style.setProperty("--score", result.overall);
    if (result.overall >= 86) {
      el.scoreLabel.textContent = "Crisp and testable";
      el.scoreSummary.textContent =
        "Strong structure across the rubric. Compare a challenger to pressure-test the design.";
    } else if (result.overall >= 68) {
      el.scoreLabel.textContent = "Solid foundation";
      el.scoreSummary.textContent =
        "The intent is visible. A few targeted refinements can make the output more reliable.";
    } else if (result.overall >= 40) {
      el.scoreLabel.textContent = "Needs more signal";
      el.scoreSummary.textContent =
        "The task is taking shape, but important context or constraints remain implicit.";
    } else {
      el.scoreLabel.textContent = "Ready to shape";
      el.scoreSummary.textContent =
        "Start with a direct task, then add context, boundaries, and a response format.";
    }
    el.metricList.innerHTML = Object.entries(result.scores)
      .map(
        ([name, score], index) => `
      <div class="metric-row"><span>${name}</span><div class="track"><div class="fill" style="width:${score}%;--metric-color:${colors[index]}"></div></div><b>${score}</b></div>`,
      )
      .join("");
    el.suggestionCount.textContent = `${result.suggestions.length} ${result.suggestions.length === 1 ? "signal" : "signals"}`;
    el.suggestionList.innerHTML = result.suggestions
      .slice(0, 3)
      .map(
        (item) => `
      <article class="suggestion-item"><span class="suggestion-icon" style="--suggestion-color:${item.color}">${item.icon}</span><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.body)}</p></div></article>`,
      )
      .join("");
  }

  function renderComparison() {
    const resultA = analyze(state.variants.a);
    const resultB = analyze(state.variants.b);
    el.compareA.textContent = state.variants.a || "Variant A is empty.";
    el.compareB.textContent = state.variants.b || "Variant B is empty.";
    el.scoreA.textContent = `${resultA.overall}/100`;
    el.scoreB.textContent = `${resultB.overall}/100`;
    const delta = resultB.overall - resultA.overall;
    const leader =
      delta === 0
        ? "The variants are tied"
        : `Variant ${delta > 0 ? "B" : "A"} leads by ${Math.abs(delta)} points`;
    const lengthDelta = Math.abs(resultA.words - resultB.words);
    el.compareSummary.innerHTML = `<strong>${leader}.</strong> Variant A is ${resultA.words} words; Variant B is ${resultB.words} words (${lengthDelta}-word difference).`;
  }

  function renderVersions() {
    el.versionCount.textContent = state.versions.length;
    if (!state.versions.length) {
      el.versionTimeline.innerHTML =
        '<div class="empty-illustration">◇</div><h2 style="text-align:center">No saved versions</h2><p style="text-align:center;color:var(--muted);font-size:.7rem">Capture your first deliberate milestone.</p>';
      return;
    }
    el.versionTimeline.innerHTML = state.versions
      .map(
        (version, index) => `
      <div class="timeline-item"><span class="timeline-dot"></span><button class="timeline-button" type="button" data-version-id="${version.id}"><b>${escapeHtml(version.label || `Version ${state.versions.length - index}`)}</b><span>${formatDate(version.createdAt)} · Variant ${version.variant.toUpperCase()}</span><em>${version.score}</em></button></div>`,
      )
      .join("");
    $$("[data-version-id]", el.versionTimeline).forEach((button) =>
      button.addEventListener("click", () =>
        showVersion(button.dataset.versionId),
      ),
    );
  }

  function showVersion(id) {
    const version = state.versions.find((item) => item.id === id);
    if (!version) return;
    $$("[data-version-id]", el.versionTimeline).forEach((button) =>
      button.classList.toggle("active", button.dataset.versionId === id),
    );
    el.versionDetail.innerHTML = `
      <div class="version-detail-header"><div><p class="eyebrow">Saved milestone</p><h2>${escapeHtml(version.label)}</h2><div class="version-detail-meta">${formatDate(version.createdAt)} · Variant ${version.variant.toUpperCase()}</div></div><div class="version-score">${version.score}</div></div>
      <pre>${escapeHtml(version.text)}</pre>
      <div class="version-actions"><button class="button secondary" id="deleteVersionButton" type="button">Delete</button><button class="button primary" id="restoreVersionButton" type="button">Restore version</button></div>`;
    $("#restoreVersionButton").addEventListener("click", () => {
      state.activeVariant = version.variant;
      state.variants[version.variant] = version.text;
      persist();
      renderEditor();
      showView("studio");
      toast("Version restored to the editor");
    });
    $("#deleteVersionButton").addEventListener("click", () => {
      state.versions = state.versions.filter((item) => item.id !== id);
      persist();
      renderVersions();
      el.versionDetail.innerHTML =
        '<div class="empty-illustration">◇</div><h2>Select a version</h2><p>Inspect its template, score, and timestamp before restoring it.</p>';
      toast("Version removed");
    });
  }

  function saveVersion() {
    const text = state.variants[state.activeVariant];
    if (!text.trim()) return toast("Add a prompt before saving a version");
    const result = analyze(text);
    const existing = state.versions.length;
    state.versions.unshift({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      label: `Milestone ${existing + 1}`,
      variant: state.activeVariant,
      text,
      score: result.overall,
      createdAt: Date.now(),
    });
    persist();
    renderVersions();
    toast(`Version saved · score ${result.overall}`);
  }

  function showView(name) {
    $$(".view").forEach((view) => {
      const active = view.dataset.panel === name;
      view.hidden = !active;
      view.classList.toggle("active", active);
    });
    $$(".rail-item").forEach((button) => {
      const active = button.dataset.view === name;
      button.classList.toggle("active", active);
      button.toggleAttribute("aria-current", active);
    });
    if (name === "versions") renderVersions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setInspector(name) {
    $$(".inspector-tab").forEach((tab) => {
      const active = tab.dataset.inspector === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    $$("[data-inspector-panel]").forEach((panel) => {
      const active = panel.dataset.inspectorPanel === name;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
  }

  function selectSample(key) {
    const sample = samples[key];
    if (!sample) return;
    const proceed =
      !state.variants[state.activeVariant].trim() ||
      window.confirm(
        "Replace both prompt variants with this starting point? Your saved versions will remain.",
      );
    if (!proceed) {
      el.sampleSelect.value = state.sample;
      return;
    }
    state.sample = key;
    state.projectName = sample.name;
    state.variants = { a: sample.a, b: sample.b };
    state.activeVariant = "a";
    extractVariables(sample.a + sample.b).forEach((keyName) => {
      if (!state.values[keyName] && demoValues[keyName])
        state.values[keyName] = demoValues[keyName];
    });
    persist();
    renderEditor();
    toast(`${sample.name} loaded`);
  }

  function tidyText() {
    const text = state.variants[state.activeVariant];
    state.variants[state.activeVariant] = text
      .replace(/[ \t]+$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    persist();
    renderEditor();
    toast("Spacing tidied");
  }

  function downloadJson() {
    const payload = {
      exportedAt: new Date().toISOString(),
      projectName: state.projectName,
      variants: state.variants,
      variables: state.values,
      analysis: { a: analyze(state.variants.a), b: analyze(state.variants.b) },
      note: "Created locally by Prompt Prism. No prompt was executed.",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(state.projectName)}.prompt-prism.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast("Workspace exported");
  }

  async function copyPreview() {
    try {
      await navigator.clipboard.writeText(
        compile(state.variants[state.activeVariant]),
      );
      toast("Compiled prompt copied");
    } catch {
      toast("Clipboard access was unavailable");
    }
  }

  function toast(message) {
    window.clearTimeout(toastTimer);
    el.toast.textContent = message;
    el.toast.classList.add("show");
    toastTimer = window.setTimeout(
      () => el.toast.classList.remove("show"),
      2400,
    );
  }

  function escapeHtml(value = "") {
    return value.replace(
      /[&<>'"]/g,
      (char) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[char],
    );
  }
  function slugify(value) {
    return (
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "prompt-workspace"
    );
  }
  function formatDate(time) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(time));
  }

  el.editor.addEventListener("input", (event) => {
    state.variants[state.activeVariant] = event.target.value;
    persist();
    updateDerived();
  });
  $$(".variant-tab").forEach((tab) =>
    tab.addEventListener("click", () => {
      state.activeVariant = tab.dataset.variant;
      persist();
      renderEditor();
    }),
  );
  $$(".rail-item").forEach((button) =>
    button.addEventListener("click", () => showView(button.dataset.view)),
  );
  $$(".inspector-tab").forEach((tab) =>
    tab.addEventListener("click", () => setInspector(tab.dataset.inspector)),
  );
  $("#analyzeButton").addEventListener("click", () => {
    renderAnalysis(analyze(state.variants[state.activeVariant]));
    toast("Analysis refreshed");
  });
  $("#formatButton").addEventListener("click", tidyText);
  $("#fillDemoButton").addEventListener("click", () => {
    extractVariables(state.variants[state.activeVariant]).forEach((key) => {
      state.values[key] = demoValues[key] || `Example ${key}`;
    });
    persist();
    renderVariables(state.variants[state.activeVariant]);
    renderPreview(state.variants[state.activeVariant]);
    toast("Demo values added");
  });
  $("#compareButton").addEventListener("click", () => {
    const open = el.comparisonPanel.hidden;
    el.comparisonPanel.hidden = !open;
    $("#compareButton").setAttribute("aria-pressed", String(open));
    if (open) {
      renderComparison();
      el.comparisonPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  $("#closeCompareButton").addEventListener("click", () => {
    el.comparisonPanel.hidden = true;
    $("#compareButton").setAttribute("aria-pressed", "false");
  });
  $("#copyPreviewButton").addEventListener("click", copyPreview);
  $("#snapshotButton").addEventListener("click", saveVersion);
  $("#snapshotButtonSecondary").addEventListener("click", saveVersion);
  $("#exportButton").addEventListener("click", downloadJson);
  $("#sampleSelect").addEventListener("change", (event) =>
    selectSample(event.target.value),
  );
  $("#themeButton").addEventListener("click", () => {
    state.contrast = !state.contrast;
    persist();
    document.body.classList.toggle("high-contrast", state.contrast);
    toast(
      state.contrast ? "Higher contrast enabled" : "Default contrast restored",
    );
  });
  $("#projectName").addEventListener("click", () => {
    el.nameInput.value = state.projectName;
    el.nameDialog.hidden = false;
    window.setTimeout(() => el.nameInput.focus(), 0);
  });
  $("#cancelNameButton").addEventListener("click", () => {
    el.nameDialog.hidden = true;
  });
  el.nameDialog.addEventListener("click", (event) => {
    if (event.target === el.nameDialog) el.nameDialog.hidden = true;
  });
  $("#nameForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const next = el.nameInput.value.trim();
    if (next) {
      state.projectName = next;
      persist();
      el.projectNameText.textContent = next;
    }
    el.nameDialog.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      renderAnalysis(analyze(state.variants[state.activeVariant]));
      toast("Analysis refreshed");
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveVersion();
    }
    if (event.key === "Escape") el.nameDialog.hidden = true;
  });

  renderEditor();
  renderVersions();
})();
