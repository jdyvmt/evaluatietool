import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBam3B7hYra1C51WBHXlcupRHx99bsJtcw",
    authDomain: "evaluatietool-dbb5e.firebaseapp.com",
    projectId: "evaluatietool-dbb5e",
    storageBucket: "evaluatietool-dbb5e.firebasestorage.app",
    messagingSenderId: "665576535622",
    appId: "1:665576535622:web:ac29df6b1e4b8c26adfc47"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

let state = {
    assignments: [],
    classes: [],
    students: [],
    evaluations: []
};

let selectedAssignmentId = null;
let selectedClassId = null;
let selectedStudentId = null;
let editingAssignmentId = null;
let currentEvaluationId = null;
let isRetake = false;

let timerSeconds = 0;
let timerInterval = null;
let timerRunning = false;

let filterUnevaluated = false;
let selectedDetailStudentId = null;

document.addEventListener("DOMContentLoaded", async () => {
    setupNavigation();
    setupEvaluationEvents();
    setupAssignmentEvents();
    setupStudentEvents();

    try {
        await loadFromFirebase();
        setConnectionStatus(true);
    } catch (error) {
        console.error("Firebase kon niet worden geladen:", error);
        setConnectionStatus(false);
        showToast("Database kon niet worden geladen. Lokale modus.");
    } finally {
        renderAll();
    }
});

async function loadFromFirebase() {
    const collections = ["assignments", "classes", "students", "evaluations"];
    const results = await Promise.all(
        collections.map(async (name) => {
            const snap = await getDocs(collection(db, name));
            return { name, data: snap.docs.map(d => ({ id: d.id, ...d.data() })) };
        })
    );
    results.forEach(r => state[r.name] = r.data);
}

function setConnectionStatus(online) {
    const dot = document.getElementById("connectionDot");
    const text = document.getElementById("connectionText");
    if (!dot || !text) return;
    if (online) {
        dot.classList.add("online");
        text.textContent = "Online database";
    } else {
        dot.classList.remove("online");
        text.textContent = "Lokale modus";
    }
}

function createId(prefix = "") {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function dbInsert(col, obj) {
    const id = obj.id || createId();
    const ref = doc(db, col, id);
    const data = { ...obj, id };
    await setDoc(ref, data);
    return data;
}

async function dbUpdate(col, id, obj) {
    const ref = doc(db, col, id);
    await updateDoc(ref, obj);
    return { ...obj, id };
}

async function dbDelete(col, id) {
    await deleteDoc(doc(db, col, id));
}

function setupNavigation() {
    document.querySelectorAll(".nav-button").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".nav-button").forEach(btn => btn.classList.remove("active"));
            document.querySelectorAll(".page").forEach(page => page.classList.remove("active-page"));
            button.classList.add("active");
            const target = document.getElementById(button.dataset.page);
            if (target) target.classList.add("active-page");
        });
    });
}

function setupEvaluationEvents() {
    document.getElementById("evaluationAssignment")?.addEventListener("change", (e) => {
        selectedAssignmentId = e.target.value || null;
        currentEvaluationId = null;
        isRetake = false;
        renderEvaluationStudents();
        renderEvaluationForm();
    });

    document.getElementById("evaluationClass")?.addEventListener("change", (e) => {
        selectedClassId = e.target.value || null;
        selectedStudentId = null;
        renderEvaluationStudents();
        renderEvaluationForm();
    });

    document.getElementById("studentSearch")?.addEventListener("input", () => renderEvaluationStudents());
    
    document.getElementById("filterUnevaluated")?.addEventListener("click", (e) => {
        filterUnevaluated = !filterUnevaluated;
        e.currentTarget.classList.toggle("active", filterUnevaluated);
        renderEvaluationStudents();
    });

    document.getElementById("retakeButton")?.addEventListener("click", startRetake);
    document.getElementById("saveEvaluation")?.addEventListener("click", saveEvaluation);
    document.getElementById("exportStudent")?.addEventListener("click", exportSelectedStudent);
    document.getElementById("exportClass")?.addEventListener("click", exportSelectedClass);

    document.getElementById("toggleHistory")?.addEventListener("click", () => {
        document.getElementById("evaluationHistory")?.classList.toggle("hidden");
    });

    document.getElementById("timerStart")?.addEventListener("click", startTimer);
    document.getElementById("timerPause")?.addEventListener("click", pauseTimer);
    document.getElementById("timerReset")?.addEventListener("click", resetTimer);
}

function renderEvaluationSelectors() {
    const assignmentSelect = document.getElementById("evaluationAssignment");
    const classSelect = document.getElementById("evaluationClass");
    if (!assignmentSelect || !classSelect) return;

    const sortedAssignments = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    assignmentSelect.innerHTML = `<option value="">Kies een opdracht...</option>` + 
        sortedAssignments.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.title)}</option>`).join("");

    const sortedClasses = [...state.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    classSelect.innerHTML = `<option value="">Kies een klas...</option>` + 
        sortedClasses.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");

    if (selectedAssignmentId) assignmentSelect.value = selectedAssignmentId;
    if (selectedClassId) classSelect.value = selectedClassId;
}

function renderEvaluationStudents() {
    const container = document.getElementById("studentList");
    if (!container) return;

    const search = document.getElementById("studentSearch")?.value.trim().toLowerCase() || "";
    if (!search && !selectedClassId) {
        container.innerHTML = `<div class="empty-state small">Kies een klas of zoek op naam.</div>`;
        return;
    }

    let students = search ? state.students.filter(s => s.name.toLowerCase().includes(search)) : state.students.filter(s => s.class_id === selectedClassId);

    if (filterUnevaluated && selectedAssignmentId) {
        students = students.filter(s => !hasEvaluation(s.id, selectedAssignmentId));
    }

    if (!students.length) {
        container.innerHTML = `<div class="empty-state small">Geen leerlingen gevonden.</div>`;
        return;
    }

    students.sort(compareByLastName);

    container.innerHTML = students.map(student => {
        const evaluated = selectedAssignmentId && hasEvaluation(student.id, selectedAssignmentId);
        const active = student.id === selectedStudentId;
        const retakeCount = getEvaluationHistory(student.id, selectedAssignmentId).filter(e => e.attempt_number > 1).length;
        const cls = search ? state.classes.find(c => c.id === student.class_id) : null;
        const classLabel = cls ? `<span class="muted" style="font-size: 10px; margin-left: 5px;">(${escapeHtml(cls.name)})</span>` : "";

        return `
            <button class="student-item ${active ? "active" : ""}" data-student-id="${escapeHtml(student.id)}">
                <span class="student-name">${escapeHtml(student.name)} ${classLabel}</span>
                ${evaluated ? `<span class="student-check">✓</span>` : ""}
                ${retakeCount ? `<span class="student-retake">${retakeCount}x herk.</span>` : ""}
            </button>
        `;
    }).join("");

    container.querySelectorAll(".student-item").forEach(btn => {
        btn.addEventListener("click", () => {
            selectedStudentId = btn.dataset.studentId;
            const student = state.students.find(s => s.id === selectedStudentId);
            if (student && student.class_id) {
                selectedClassId = student.class_id;
                const classSelect = document.getElementById("evaluationClass");
                if (classSelect) classSelect.value = selectedClassId;
            }
            currentEvaluationId = null;
            isRetake = false;
            resetTimer();
            renderEvaluationStudents();
            renderEvaluationForm();
        });
    });
}

function renderEvaluationForm() {
    const container = document.getElementById("evaluationFormContainer");
    const studentName = document.getElementById("selectedStudentName");
    const meta = document.getElementById("evaluationMeta");
    const totalScoreEl = document.getElementById("totalScore");

    if (!container) return;

    const student = state.students.find(s => s.id === selectedStudentId);
    const assignment = state.assignments.find(a => a.id === selectedAssignmentId);

    if (!student || !assignment) {
        if (studentName) studentName.textContent = "Geen leerling geselecteerd";
        if (meta) meta.textContent = "Kies een opdracht, klas en leerling.";
        if (totalScoreEl) totalScoreEl.textContent = "—";
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">✓</div><h3>Start een evaluatie</h3><p>Kies links een opdracht, klas en leerling.</p></div>`;
        renderHistory();
        return;
    }

    if (studentName) studentName.textContent = student.name;
    const cls = state.classes.find(c => c.id === student.class_id);
    if (meta) meta.textContent = `${assignment.title} · ${cls ? cls.name : ""}`;

    let evaluation = currentEvaluationId ? state.evaluations.find(e => e.id === currentEvaluationId) : null;
    if (!evaluation && !isRetake) {
        evaluation = getLatestEvaluation(selectedStudentId, selectedAssignmentId);
    }

    renderForm(assignment, evaluation);
    renderHistory();
}

function renderForm(assignment, evaluation) {
    const container = document.getElementById("evaluationFormContainer");
    if (!container || !assignment) return;

    const selectedScores = evaluation?.scores || {};
    const excludedParams = evaluation?.excluded_parameters || [];
    const penaltyPoints = evaluation?.penalty_points ?? 0;
    const selectedComments = evaluation?.comments || [];

    let html = "";

    (assignment.parameters || []).forEach((parameter, index) => {
        const selected = selectedScores[parameter.id];
        const isExcluded = excludedParams.includes(parameter.id);

        html += `
            <div class="parameter ${isExcluded ? 'parameter-excluded' : ''}" data-parameter-id="${escapeHtml(parameter.id)}">
                <div class="parameter-header">
                    <div>
                        <span class="parameter-number">CRITERIUM ${String(index + 1).padStart(2, "0")}</span>
                        <h3 class="parameter-title">${escapeHtml(parameter.title)}</h3>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <label class="exclude-checkbox-label" style="display: flex; align-items: center; gap: 5px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" class="exclude-param-checkbox" data-parameter-id="${escapeHtml(parameter.id)}" ${isExcluded ? "checked" : ""}> Niet beoordelen
                        </label>
                        <div class="parameter-score" data-score-for="${escapeHtml(parameter.id)}">
                            ${isExcluded ? "Niet meegeteld" : (selected ? `Score: ${escapeHtml(String(selected.score))}` : "Niet beoordeeld")}
                        </div>
                    </div>
                </div>
                <div class="levels" style="${isExcluded ? 'opacity: 0.4; pointer-events: none;' : ''}">
                    ${parameter.levels && parameter.levels.length ? parameter.levels.map(level => {
                        const isSelected = selected && selected.level_id === level.id;
                        return `
                            <label class="level-card ${isSelected ? "selected" : ""}">
                                <input type="radio" name="parameter-${escapeHtml(parameter.id)}" value="${escapeHtml(level.id)}" data-parameter="${escapeHtml(parameter.id)}" data-score="${escapeHtml(String(level.score))}" ${isSelected ? "checked" : ""} ${isExcluded ? "disabled" : ""}>
                                <div class="level-score">${escapeHtml(String(level.score))}</div>
                                <div class="level-explanation">${escapeHtml(level.explanation)}</div>
                            </label>
                        `;
                    }).join("") : `<div class="empty-state small">Geen niveaus ingesteld.</div>`}
                </div>
            </div>
        `;
    });

    html += `
        <div class="penalty-section" style="margin-top: 25px; padding: 15px; background: var(--surface-soft); border-radius: 12px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <strong>Minpunten / Strafpunten</strong>
                <div class="muted" style="font-size: 11px;">Trek punten af van de totale eindscore</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>-</span>
                <input type="number" id="penaltyInput" value="${penaltyPoints}" min="0" step="0.5" style="width: 80px; text-align: center; font-weight: 800;">
                <span>pt(en)</span>
            </div>
        </div>

        <div class="comment-section">
            <div class="parameter-header">
                <div>
                    <span class="section-label">FEEDBACK</span>
                    <h3 class="parameter-title">Snelcommentaren</h3>
                </div>
            </div>
            <div class="comment-buttons">
                ${assignment.comments?.length ? assignment.comments.map((comment, index) => {
                    const active = selectedComments.includes(comment);
                    return `<button type="button" class="comment-chip ${active ? "active" : ""}" data-comment-index="${index}">${escapeHtml(comment)}</button>`;
                }).join("") : `<span class="muted">Geen standaardcommentaren ingesteld.</span>`}
            </div>
            <label class="feedback-label">Feedback</label>
            <textarea id="feedbackText" placeholder="Schrijf hier je feedback...">${escapeHtml(evaluation?.feedback || "")}</textarea>
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll(".exclude-param-checkbox").forEach(checkbox => {
        checkbox.addEventListener("change", (e) => {
            const paramId = e.target.dataset.parameterId;
            const paramBlock = container.querySelector(`[data-parameter-id="${paramId}"]`);
            const levelsContainer = paramBlock.querySelector(".levels");
            const scoreLabel = paramBlock.querySelector(`[data-score-for="${paramId}"]`);

            if (e.target.checked) {
                paramBlock.classList.add("parameter-excluded");
                levelsContainer.style.opacity = "0.4";
                levelsContainer.style.pointerEvents = "none";
                scoreLabel.textContent = "Niet meegeteld";
                // Uncheck radio buttons in this parameter
                levelsContainer.querySelectorAll("input[type=radio]").forEach(r => {
                    r.checked = false;
                    r.disabled = true;
                    r.closest(".level-card").classList.remove("selected");
                });
            } else {
                paramBlock.classList.remove("parameter-excluded");
                levelsContainer.style.opacity = "1";
                levelsContainer.style.pointerEvents = "auto";
                scoreLabel.textContent = "Niet beoordeeld";
                levelsContainer.querySelectorAll("input[type=radio]").forEach(r => r.disabled = false);
            }
            updateTotalScore();
        });
    });

    container.querySelectorAll(".level-card input").forEach(input => {
        input.addEventListener("change", () => {
            container.querySelectorAll(`[name="${input.name}"]`).forEach(other => {
                other.closest(".level-card")?.classList.remove("selected");
            });
            input.closest(".level-card")?.classList.add("selected");
            const scoreElement = document.querySelector(`[data-score-for="${input.dataset.parameter}"]`);
            if (scoreElement) scoreElement.textContent = `Score: ${input.dataset.score}`;
            updateTotalScore();
        });
    });

    document.getElementById("penaltyInput")?.addEventListener("input", () => {
        updateTotalScore();
    });

    container.querySelectorAll(".comment-chip").forEach(button => {
        button.addEventListener("click", () => {
            button.classList.toggle("active");
            const textarea = document.getElementById("feedbackText");
            if (!textarea) return;
            const selectedCommentsNow = Array.from(container.querySelectorAll(".comment-chip.active")).map(
                item => assignment.comments[Number(item.dataset.commentIndex)]
            );
            textarea.value = selectedCommentsNow.join(" ");
        });
    });

    updateTotalScore();
}

function calculateScoreFromData(scores, excludedParams, penalty, assignment) {
    let achieved = 0;
    let max = 0;
    let evaluatedCount = 0;

    (assignment.parameters || []).forEach(parameter => {
        const levels = parameter.levels || [];
        const isExcluded = excludedParams.includes(parameter.id);

        if (!isExcluded && levels.length) {
            max += Math.max(...levels.map(l => Number(l.score)));
        }

        if (!isExcluded && scores && scores[parameter.id]) {
            achieved += Number(scores[parameter.id].score) || 0;
            evaluatedCount++;
        }
    });

    achieved = Math.max(0, achieved - penalty);
    if (!evaluatedCount && max === 0) return null;
    return { total: achieved, max: max };
}

function updateTotalScore() {
    const assignment = state.assignments.find(a => a.id === selectedAssignmentId);
    const totalEl = document.getElementById("totalScore");
    if (!assignment || !totalEl) return;

    let scores = {};
    let excludedParams = [];

    (assignment.parameters || []).forEach(parameter => {
        const checkbox = document.querySelector(`.exclude-param-checkbox[data-parameter-id="${parameter.id}"]`);
        if (checkbox && checkbox.checked) {
            excludedParams.push(parameter.id);
        } else {
            const input = document.querySelector(`input[name="parameter-${parameter.id}"]:checked`);
            if (input) {
                scores[parameter.id] = { score: Number(input.dataset.score) };
            }
        }
    });

    const penalty = Number(document.getElementById("penaltyInput")?.value) || 0;
    const res = calculateScoreFromData(scores, excludedParams, penalty, assignment);

    totalEl.textContent = res === null ? "—" : `${res.total} / ${res.max}`;
}

function collectFormData() {
    const assignment = state.assignments.find(a => a.id === selectedAssignmentId);
    const scores = {};
    const excluded_parameters = [];

    if (assignment) {
        (assignment.parameters || []).forEach(parameter => {
            const checkbox = document.querySelector(`.exclude-param-checkbox[data-parameter-id="${parameter.id}"]`);
            if (checkbox && checkbox.checked) {
                excluded_parameters.push(parameter.id);
            } else {
                const input = document.querySelector(`input[name="parameter-${parameter.id}"]:checked`);
                if (input) {
                    const level = parameter.levels.find(item => item.id === input.value);
                    if (level) {
                        scores[parameter.id] = {
                            level_id: level.id,
                            score: Number(level.score),
                            level_title: level.title || "",
                            explanation: level.explanation
                        };
                    }
                }
            }
        });
    }

    const comments = Array.from(document.querySelectorAll(".comment-chip.active")).map(
        button => assignment.comments[Number(button.dataset.commentIndex)]
    );
    const feedback = document.getElementById("feedbackText")?.value.trim() || "";
    const penalty_points = Number(document.getElementById("penaltyInput")?.value) || 0;

    return { scores, excluded_parameters, comments, feedback, penalty_points };
}

async function saveEvaluation() {
    if (!selectedAssignmentId || !selectedStudentId) {
        showToast("Selecteer eerst een opdracht en een leerling.");
        return;
    }

    const data = collectFormData();
    const previous = getEvaluationHistory(selectedStudentId, selectedAssignmentId);
    const nextAttempt = previous.length ? Math.max(...previous.map(item => item.attempt_number || 1)) + (isRetake ? 1 : 0) : 1;

    try {
        if (currentEvaluationId && !isRetake) {
            const updated = {
                assignment_id: selectedAssignmentId,
                student_id: selectedStudentId,
                class_id: selectedClassId,
                scores: data.scores,
                excluded_parameters: data.excluded_parameters,
                comments: data.comments,
                feedback: data.feedback,
                penalty_points: data.penalty_points,
                updated_at: new Date().toISOString()
            };
            await dbUpdate("evaluations", currentEvaluationId, updated);
            const index = state.evaluations.findIndex(item => item.id === currentEvaluationId);
            if (index >= 0) state.evaluations[index] = { ...state.evaluations[index], ...updated };
        } else {
            const newEvaluation = {
                id: createId("evaluation_"),
                assignment_id: selectedAssignmentId,
                student_id: selectedStudentId,
                class_id: selectedClassId,
                scores: data.scores,
                excluded_parameters: data.excluded_parameters,
                comments: data.comments,
                feedback: data.feedback,
                penalty_points: data.penalty_points,
                attempt_number: isRetake ? nextAttempt : 1,
                evaluation_date: new Date().toISOString(),
                created_at: new Date().toISOString()
            };
            const result = await dbInsert("evaluations", newEvaluation);
            state.evaluations.push(result);
            currentEvaluationId = result.id;
        }

        isRetake = false;
        renderEvaluationStudents();
        renderEvaluationForm();
        showToast("Evaluatie opgeslagen.");
    } catch (error) {
        console.error("Firebase fout:", error);
        showToast("Opslaan mislukt.");
    }
}

function startRetake() {
    if (!selectedStudentId || !selectedAssignmentId) {
        showToast("Selecteer eerst een leerling.");
        return;
    }
    isRetake = true;
    currentEvaluationId = null;
    resetTimer();
    renderEvaluationForm();
    showToast("Nieuwe herkansing gestart.");
}

function getEvaluationHistory(studentId, assignmentId) {
    return state.evaluations
        .filter(e => e.student_id === studentId && e.assignment_id === assignmentId)
        .sort((a, b) => new Date(b.created_at || b.evaluation_date) - new Date(a.created_at || a.evaluation_date));
}

function getLatestEvaluation(studentId, assignmentId) {
    return getEvaluationHistory(studentId, assignmentId)[0] || null;
}

function hasEvaluation(studentId, assignmentId) {
    return Boolean(getLatestEvaluation(studentId, assignmentId));
}

function calculateEvaluationScore(evaluation, assignment) {
    if (!evaluation || !assignment) return null;
    return calculateScoreFromData(evaluation.scores, evaluation.excluded_parameters || [], evaluation.penalty_points || 0, assignment);
}

function renderHistory() {
    const container = document.getElementById("evaluationHistory");
    if (!container) return;

    if (!selectedStudentId || !selectedAssignmentId) {
        container.innerHTML = `<div class="empty-state small">Selecteer een leerling.</div>`;
        return;
    }

    const history = getEvaluationHistory(selectedStudentId, selectedAssignmentId);
    const assignment = state.assignments.find(a => a.id === selectedAssignmentId);

    if (!history.length) {
        container.innerHTML = `<div class="empty-state small">Nog geen eerdere evaluaties.</div>`;
        return;
    }

    container.innerHTML = history.map(evaluation => {
        const score = calculateEvaluationScore(evaluation, assignment);
        const date = formatDate(evaluation.evaluation_date || evaluation.created_at);
        return `
            <div class="history-item">
                <div class="history-date">
                    <strong>${date}</strong>
                    <div class="history-attempt">${evaluation.attempt_number > 1 ? "Herkansing" : "Eerste evaluatie"} ${evaluation.penalty_points ? `(Strafpunten: -${evaluation.penalty_points})` : ""}</div>
                </div>
                <div class="history-score">${score === null ? "—" : `${score.total} / ${score.max}`}</div>
                <div class="history-actions">
                    <button data-history-edit="${escapeHtml(evaluation.id)}">Bewerken</button>
                    <button data-history-delete="${escapeHtml(evaluation.id)}">Verwijderen</button>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-history-edit]").forEach(button => {
        button.addEventListener("click", () => {
            currentEvaluationId = button.dataset.historyEdit;
            isRetake = false;
            renderEvaluationForm();
        });
    });

    container.querySelectorAll("[data-history-delete]").forEach(button => {
        button.addEventListener("click", async () => {
            if (!confirm("Deze evaluatie definitief verwijderen?")) return;
            try {
                await dbDelete("evaluations", button.dataset.historyDelete);
                state.evaluations = state.evaluations.filter(item => item.id !== button.dataset.historyDelete);
                if (currentEvaluationId === button.dataset.historyDelete) currentEvaluationId = null;
                renderEvaluationStudents();
                renderEvaluationForm();
                showToast("Evaluatie verwijderd.");
            } catch (error) {
                showToast("Verwijderen mislukt.");
            }
        });
    });
}

function updateTimerDisplay() {
    const timer = document.getElementById("timerDisplay");
    if (!timer) return;
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    timerInterval = setInterval(() => {
        timerSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function pauseTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
}

function resetTimer() {
    pauseTimer();
    timerSeconds = 0;
    updateTimerDisplay();
}

function setupAssignmentEvents() {
    document.getElementById("newAssignment")?.addEventListener("click", createNewAssignment);
    document.getElementById("addComment")?.addEventListener("click", addCommentField);
    document.getElementById("addParameter")?.addEventListener("click", addParameter);
    document.getElementById("saveAssignment")?.addEventListener("click", saveAssignment);
    document.getElementById("duplicateAssignment")?.addEventListener("click", duplicateAssignment);
    document.getElementById("deleteAssignment")?.addEventListener("click", deleteAssignment);
}

function createNewAssignment() {
    const assignment = {
        id: createId("assignment_"),
        title: "Nieuwe opdracht",
        order: state.assignments.length,
        comments: [],
        parameters: [
            {
                id: createId("parameter_"),
                title: "Parameter 1",
                levels: [
                    { id: createId("level_"), score: 4, title: "", explanation: "Uitstekend" },
                    { id: createId("level_"), score: 3, title: "", explanation: "Goed" },
                    { id: createId("level_"), score: 2, title: "", explanation: "Onvoldoende" },
                    { id: createId("level_"), score: 1, title: "", explanation: "Zeer onvoldoende" }
                ]
            }
        ],
        isNew: true
    };
    state.assignments.push(assignment);
    editingAssignmentId = assignment.id;
    renderAssignments();
    openAssignmentEditor();
}

function openAssignmentEditor() {
    const assignment = getEditingAssignment();
    if (!assignment) return;
    document.getElementById("assignmentEditor")?.classList.remove("hidden");
    document.getElementById("assignmentEditorEmpty")?.classList.add("hidden");
    document.getElementById("assignmentTitle").value = assignment.title || "";
    renderCommentsBuilder(assignment);
    renderParametersBuilder(assignment);
}

function renderCommentsBuilder(assignment) {
    const container = document.getElementById("commentsBuilder");
    if (!container) return;
    container.innerHTML = assignment.comments.map((comment, index) => `
        <div class="comment-builder">
            <input type="text" value="${escapeHtml(comment)}" data-comment-index="${index}">
            <button type="button" class="icon-button" data-delete-comment="${index}">×</button>
        </div>
    `).join("");

    container.querySelectorAll("[data-comment-index]").forEach(input => {
        input.addEventListener("input", () => {
            assignment.comments[Number(input.dataset.commentIndex)] = input.value;
        });
    });

    container.querySelectorAll("[data-delete-comment]").forEach(button => {
        button.addEventListener("click", () => {
            assignment.comments.splice(Number(button.dataset.deleteComment), 1);
            renderCommentsBuilder(assignment);
        });
    });
}

function addCommentField() {
    const assignment = getEditingAssignment();
    if (!assignment) return;
    assignment.comments.push("");
    renderCommentsBuilder(assignment);
}

function renderParametersBuilder(assignment) {
    const container = document.getElementById("parametersBuilder");
    if (!container) return;

    container.innerHTML = assignment.parameters.map((parameter, parameterIndex) => `
        <div class="parameter-builder" data-parameter-id="${escapeHtml(parameter.id)}">
            <div class="builder-header" style="padding: 15px; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <span class="section-label">CRITERIUM ${String(parameterIndex + 1).padStart(2, "0")}</span>
                    <input type="text" class="parameter-title-input" value="${escapeHtml(parameter.title || "")}" placeholder="Naam van criterium">
                </div>
                <button type="button" class="danger-button" data-delete-parameter="${escapeHtml(parameter.id)}">Verwijderen</button>
            </div>
            <div class="levels-builder" style="padding: 15px; border-top: 1px solid var(--border);">
                <div class="levels-builder-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <strong>Niveaus</strong>
                    <button type="button" class="secondary-button" data-add-level="${escapeHtml(parameter.id)}">+ Niveau</button>
                </div>
                <div class="level-builder-list">
                    ${(parameter.levels || []).map((level, levelIndex) => `
                        <div class="level-builder" data-level-id="${escapeHtml(level.id)}">
                            <div class="level-number">${levelIndex + 1}</div>
                            <div class="level-score-input">
                                <input type="number" value="${escapeHtml(String(level.score ?? ""))}" data-level-score placeholder="Score">
                            </div>
                            <div class="level-explanation-input">
                                <input type="text" value="${escapeHtml(level.explanation || "")}" data-level-explanation placeholder="Omschrijving">
                            </div>
                            <button type="button" class="icon-button danger" data-delete-level="${escapeHtml(parameter.id)}" data-level-id="${escapeHtml(level.id)}">×</button>
                        </div>
                    `).join("")}
                </div>
            </div>
        </div>
    `).join("");

    container.querySelectorAll(".parameter-title-input").forEach(input => {
        input.addEventListener("input", () => {
            const builder = input.closest(".parameter-builder");
            const parameter = assignment.parameters.find(item => item.id === builder.dataset.parameterId);
            if (parameter) parameter.title = input.value;
        });
    });

    container.querySelectorAll(".level-builder").forEach(levelElement => {
        const parameterElement = levelElement.closest(".parameter-builder");
        const parameter = assignment.parameters.find(item => item.id === parameterElement.dataset.parameterId);
        if (!parameter) return;
        const level = parameter.levels.find(item => item.id === levelElement.dataset.levelId);
        if (!level) return;

        levelElement.querySelector("[data-level-score]").addEventListener("input", (e) => { level.score = Number(e.target.value); });
        levelElement.querySelector("[data-level-explanation]").addEventListener("input", (e) => { level.explanation = e.target.value; });
    });

    container.querySelectorAll("[data-add-level]").forEach(button => {
        button.addEventListener("click", () => {
            const parameter = assignment.parameters.find(item => item.id === button.dataset.addLevel);
            if (!parameter) return;
            const existingScores = parameter.levels.map(l => Number(l.score)).filter(s => !Number.isNaN(s));
            let newScore = existingScores.length ? Math.min(...existingScores) - 1 : 1;
            parameter.levels.push({ id: createId("level_"), score: newScore, title: "", explanation: "" });
            renderParametersBuilder(assignment);
        });
    });

    container.querySelectorAll("[data-delete-level]").forEach(button => {
        button.addEventListener("click", () => {
            const parameter = assignment.parameters.find(item => item.id === button.dataset.deleteLevel);
            if (!parameter) return;
            if (parameter.levels.length <= 1) {
                showToast("Minstens één niveau vereist.");
                return;
            }
            parameter.levels = parameter.levels.filter(l => l.id !== button.dataset.levelId);
            renderParametersBuilder(assignment);
        });
    });

    container.querySelectorAll("[data-delete-parameter]").forEach(button => {
        button.addEventListener("click", () => {
            if (assignment.parameters.length <= 1) {
                showToast("Minstens één criterium vereist.");
                return;
            }
            if (!confirm("Criterium verwijderen?")) return;
            assignment.parameters = assignment.parameters.filter(p => p.id !== button.dataset.deleteParameter);
            renderParametersBuilder(assignment);
        });
    });
}

function addParameter() {
    const assignment = getEditingAssignment();
    if (!assignment) return;
    assignment.parameters.push({
        id: createId("parameter_"),
        title: `Parameter ${assignment.parameters.length + 1}`,
        levels: [
            { id: createId("level_"), score: 1, title: "", explanation: "" },
            { id: createId("level_"), score: 2, title: "", explanation: "" },
            { id: createId("level_"), score: 3, title: "", explanation: "" },
            { id: createId("level_"), score: 4, title: "", explanation: "" }
        ]
    });
    renderParametersBuilder(assignment);
}

async function saveAssignment() {
    const assignment = getEditingAssignment();
    if (!assignment) return;
    const title = document.getElementById("assignmentTitle")?.value.trim();
    if (!title) {
        showToast("Geef de opdracht een naam.");
        return;
    }
    assignment.title = title;
    assignment.parameters.forEach(p => p.levels.forEach(l => l.score = Number(l.score)));

    try {
        if (assignment.isNew) {
            delete assignment.isNew;
            await dbInsert("assignments", assignment);
        } else {
            await dbUpdate("assignments", assignment.id, assignment);
        }
        renderAssignments();
        showToast("Opdracht opgeslagen.");
    } catch (error) {
        showToast("Opslaan mislukt.");
    }
}

async function duplicateAssignment() {
    const assignment = getEditingAssignment();
    if (!assignment) return;
    const duplicate = JSON.parse(JSON.stringify(assignment));
    duplicate.id = createId("assignment_");
    duplicate.title = `${assignment.title} - kopie`;
    duplicate.parameters.forEach(p => {
        p.id = createId("parameter_");
        p.levels.forEach(l => l.id = createId("level_"));
    });
    try {
        const result = await dbInsert("assignments", duplicate);
        state.assignments.push(result);
        editingAssignmentId = result.id;
        renderAssignments();
        openAssignmentEditor();
        showToast("Opdracht gedupliceerd.");
    } catch (error) {
        showToast("Dupliceren mislukt.");
    }
}

async function deleteAssignment() {
    const assignment = getEditingAssignment();
    if (!assignment) return;
    if (!confirm(`Verwijder "${assignment.title}"?`)) return;
    try {
        await dbDelete("assignments", assignment.id);
        state.assignments = state.assignments.filter(item => item.id !== assignment.id);
        editingAssignmentId = null;
        document.getElementById("assignmentEditor")?.classList.add("hidden");
        document.getElementById("assignmentEditorEmpty")?.classList.remove("hidden");
        renderAssignments();
        showToast("Opdracht verwijderd.");
    } catch (error) {
        showToast("Verwijderen mislukt.");
    }
}

function getEditingAssignment() {
    return editingAssignmentId ? state.assignments.find(a => a.id === editingAssignmentId) || null : null;
}

function renderAssignments() {
    const container = document.getElementById("assignmentList");
    if (!container) return;
    if (!state.assignments.length) {
        container.innerHTML = `<div class="empty-state"><h3>Nog geen opdrachten</h3></div>`;
        return;
    }
    const sorted = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    container.innerHTML = sorted.map((assignment, index) => {
        const active = assignment.id === editingAssignmentId;
        const parameterCount = assignment.parameters?.length || 0;
        return `
            <div class="assignment-item ${active ? "active" : ""}">
                <button type="button" class="assignment-item-main" data-assignment-id="${escapeHtml(assignment.id)}">
                    <strong>${escapeHtml(assignment.title)}</strong>
                    <span>${parameterCount} criteria</span>
                </button>
                <div class="assignment-order-actions">
                    <button type="button" class="order-btn" data-move-up="${escapeHtml(assignment.id)}" ${index === 0 ? "disabled" : ""}>▲</button>
                    <button type="button" class="order-btn" data-move-down="${escapeHtml(assignment.id)}" ${index === sorted.length - 1 ? "disabled" : ""}>▼</button>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-assignment-id]").forEach(btn => {
        btn.addEventListener("click", () => {
            editingAssignmentId = btn.dataset.assignmentId;
            renderAssignments();
            openAssignmentEditor();
        });
    });

    container.querySelectorAll("[data-move-up]").forEach(btn => {
        btn.addEventListener("click", (e) => { e.stopPropagation(); moveAssignment(btn.dataset.moveUp, -1); });
    });
    container.querySelectorAll("[data-move-down]").forEach(btn => {
        btn.addEventListener("click", (e) => { e.stopPropagation(); moveAssignment(btn.dataset.moveDown, 1); });
    });
}

async function moveAssignment(assignmentId, direction) {
    const sorted = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const currentIndex = sorted.findIndex(a => a.id === assignmentId);
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    const current = sorted[currentIndex];
    const target = sorted[targetIndex];
    const temp = current.order ?? currentIndex;
    current.order = target.order ?? targetIndex;
    target.order = temp;

    renderAssignments();
    await Promise.all([
        dbUpdate("assignments", current.id, { order: current.order }),
        dbUpdate("assignments", target.id, { order: target.order })
    ]);
}

function setupStudentEvents() {
    document.getElementById("newClass")?.addEventListener("click", createClass);
    document.getElementById("addStudent")?.addEventListener("click", addStudent);
    document.getElementById("editClass")?.addEventListener("click", editClass);
    document.getElementById("deleteClass")?.addEventListener("click", deleteClass);
    document.getElementById("saveStudentClass")?.addEventListener("click", saveStudentClass);
    document.getElementById("closeStudentDetail")?.addEventListener("click", () => {
        document.getElementById("studentDetail")?.classList.add("hidden");
    });

    document.querySelectorAll(".class-tab").forEach(tab => {
        tab.addEventListener("click", (e) => {
            document.querySelectorAll(".class-tab").forEach(t => t.classList.remove("active"));
            document.querySelectorAll(".class-tab-content").forEach(c => c.classList.add("hidden"));
            e.currentTarget.classList.add("active");
            const targetId = e.currentTarget.dataset.tabTarget;
            document.getElementById(targetId)?.classList.remove("hidden");
            renderClassContent();
        });
    });
}

async function createClass() {
    const name = prompt("Naam van de nieuwe klas:");
    if (!name?.trim()) return;
    const cls = { id: createId("class_"), name: name.trim(), created_at: new Date().toISOString() };
    try {
        const result = await dbInsert("classes", cls);
        state.classes.push(result);
        selectedClassId = result.id;
        renderAll();
        showToast("Klas aangemaakt.");
    } catch (error) {
        showToast("Mislukt.");
    }
}

function renderClasses() {
    const container = document.getElementById("classList");
    if (!container) return;
    if (!state.classes.length) {
        container.innerHTML = `<div class="empty-state small">Nog geen klassen.</div>`;
        return;
    }
    const sorted = [...state.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    container.innerHTML = sorted.map(cls => {
        const count = state.students.filter(s => s.class_id === cls.id).length;
        return `
            <div class="class-item ${cls.id === selectedClassId ? "active" : ""}" data-class-id="${escapeHtml(cls.id)}">
                <div class="class-item-name">${escapeHtml(cls.name)}</div>
                <div class="class-item-count">${count}</div>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-class-id]").forEach(item => {
        item.addEventListener("click", () => {
            selectedClassId = item.dataset.classId;
            renderAll();
        });
    });
}

function renderClassContent() {
    const empty = document.getElementById("classEmpty");
    const content = document.getElementById("classContent");
    if (!empty || !content) return;

    const cls = state.classes.find(item => item.id === selectedClassId);
    if (!cls) {
        empty.classList.remove("hidden");
        content.classList.add("hidden");
        return;
    }

    empty.classList.add("hidden");
    content.classList.remove("hidden");

    document.getElementById("classTitle").textContent = cls.name;
    const students = state.students.filter(s => s.class_id === cls.id);
    document.getElementById("classStudentCount").textContent = students.length;

    renderStudentsTable(students);
    renderClassScoreOverview();
}

function renderStudentsTable(students) {
    const container = document.getElementById("studentsTable");
    if (!container) return;
    if (!students.length) {
        container.innerHTML = `<div class="empty-state small">Voeg een leerling toe.</div>`;
        return;
    }
    const sorted = [...students].sort(compareByLastName);
    container.innerHTML = `
        <table class="students-table">
            <thead><tr><th>LEERLING</th><th>EVALUATIES</th><th></th></tr></thead>
            <tbody>
                ${sorted.map(student => {
                    const evals = state.evaluations.filter(e => e.student_id === student.id).length;
                    return `
                        <tr>
                            <td><strong>${escapeHtml(student.name)}</strong></td>
                            <td>${evals}</td>
                            <td>
                                <div class="table-actions">
                                    <button class="table-action" data-student-detail="${escapeHtml(student.id)}">Bekijken</button>
                                    <button class="table-action" data-delete-student="${escapeHtml(student.id)}">Verwijderen</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join("")}
            </tbody>
        </table>
    `;

    container.querySelectorAll("[data-student-detail]").forEach(btn => {
        btn.addEventListener("click", () => openStudentDetail(btn.dataset.studentDetail));
    });
    container.querySelectorAll("[data-delete-student]").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!confirm("Leerling verwijderen?")) return;
            await dbDelete("students", btn.dataset.deleteStudent);
            state.students = state.students.filter(s => s.id !== btn.dataset.deleteStudent);
            renderAll();
            showToast("Leerling verwijderd.");
        });
    });
}

function renderClassScoreOverview() {
    const container = document.getElementById("classScoresContainer");
    if (!container) return;

    const students = state.students.filter(s => s.class_id === selectedClassId);
    const assignments = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    if (!students.length || !assignments.length) {
        container.innerHTML = `<div class="empty-state small">Geen leerlingen of opdrachten beschikbaar voor overzicht.</div>`;
        return;
    }

    students.sort(compareByLastName);

    let html = `
        <div class="score-table-wrapper">
            <table class="score-table">
                <thead>
                    <tr>
                        <th>Leerling</th>
                        ${assignments.map(a => `<th>${escapeHtml(a.title)}</th>`).join("")}
                    </tr>
                </thead>
                <tbody>
    `;

    students.forEach(student => {
        html += `<tr><td><strong>${escapeHtml(student.name)}</strong></td>`;
        assignments.forEach(assignment => {
            const evaluation = getLatestEvaluation(student.id, assignment.id);
            const score = calculateEvaluationScore(evaluation, assignment);
            html += `<td>${score === null ? `<span class="no-score">—</span>` : `<span class="score-value">${score.total} /${score.max}</span>`}</td>`;
        });
        html += `</tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

async function addStudent() {
    if (!selectedClassId) {
        showToast("Selecteer eerst een klas.");
        return;
    }
    const input = document.getElementById("newStudentName");
    const name = input?.value.trim();
    if (!name) return;

    const student = { id: createId("student_"), name, class_id: selectedClassId, created_at: new Date().toISOString() };
    try {
        const result = await dbInsert("students", student);
        state.students.push(result);
        if (input) input.value = "";
        renderAll();
        showToast("Leerling toegevoegd.");
    } catch (error) {
        showToast("Mislukt.");
    }
}

async function editClass() {
    const cls = state.classes.find(item => item.id === selectedClassId);
    if (!cls) return;
    const name = prompt("Nieuwe naam:", cls.name);
    if (!name?.trim()) return;
    await dbUpdate("classes", cls.id, { name: name.trim() });
    cls.name = name.trim();
    renderAll();
    showToast("Klas aangepast.");
}

async function deleteClass() {
    const cls = state.classes.find(item => item.id === selectedClassId);
    if (!cls) return;
    if (!confirm(`Klas ${cls.name} verwijderen?`)) return;
    await dbDelete("classes", cls.id);
    state.classes = state.classes.filter(item => item.id !== cls.id);
    state.students = state.students.filter(s => s.class_id !== cls.id);
    selectedClassId = null;
    renderAll();
    showToast("Klas verwijderd.");
}

function openStudentDetail(studentId) {
    selectedDetailStudentId = studentId;
    const student = state.students.find(item => item.id === studentId);
    if (!student) return;

    const panel = document.getElementById("studentDetail");
    if (!panel) return;
    panel.classList.remove("hidden");
    document.getElementById("studentDetailName").textContent = student.name;

    const select = document.getElementById("studentClassChange");
    if (select) {
        const sorted = [...state.classes].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
        select.innerHTML = sorted.map(cls => `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`).join("");
        select.value = student.class_id;
    }

    renderStudentEvaluationHistory();
}

function renderStudentEvaluationHistory() {
    const container = document.getElementById("studentEvaluationHistory");
    if (!container || !selectedDetailStudentId) return;

    const evaluations = state.evaluations.filter(e => e.student_id === selectedDetailStudentId);
    if (!evaluations.length) {
        container.innerHTML = "<p class='muted' style='font-size: 12px;'>Deze leerling heeft nog geen evaluaties.</p>";
        return;
    }

    container.innerHTML = evaluations.map(evaluation => {
        const assignment = state.assignments.find(a => a.id === evaluation.assignment_id);
        const score = calculateEvaluationScore(evaluation, assignment);
        const date = formatDate(evaluation.evaluation_date || evaluation.created_at);
        return `
            <div class="history-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border);">
                <div>
                    <strong>${assignment ? escapeHtml(assignment.title) : "Onbekende opdracht"}</strong>
                    <div class="muted" style="font-size: 10px;">Datum: ${date} ${evaluation.attempt_number > 1 ? `(Herkansing ${evaluation.attempt_number})` : ""}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span class="history-score">${score === null ? "—" : `${score.total} /${score.max}`}</span>
                    <button class="danger-button" style="padding: 5px 10px; font-size: 10px;" data-delete-eval="${escapeHtml(evaluation.id)}">Wissen</button>
                </div>
            </div>
        `;
    }).join("");

    container.querySelectorAll("[data-delete-eval]").forEach(btn => {
        btn.addEventListener("click", async () => {
            if (!confirm("Wil je deze evaluatie definitief wissen?")) return;
            try {
                await dbDelete("evaluations", btn.dataset.deleteEval);
                state.evaluations = state.evaluations.filter(e => e.id !== btn.dataset.deleteEval);
                renderStudentEvaluationHistory();
                renderEvaluationStudents();
                renderClassContent();
                showToast("Evaluatie gewist.");
            } catch (error) {
                showToast("Kon evaluatie niet wissen.");
            }
        });
    });
}

async function saveStudentClass() {
    const select = document.getElementById("studentClassChange");
    if (!select || !selectedDetailStudentId) return;
    await dbUpdate("students", selectedDetailStudentId, { class_id: select.value });
    const student = state.students.find(s => s.id === selectedDetailStudentId);
    if (student) student.class_id = select.value;
    document.getElementById("studentDetail")?.classList.add("hidden");
    renderAll();
    showToast("Klas van leerling aangepast.");
}

function exportSelectedStudent() {
    if (!selectedStudentId || !selectedAssignmentId) {
        showToast("Selecteer eerst een opdracht en leerling.");
        return;
    }
    const evaluation = getLatestEvaluation(selectedStudentId, selectedAssignmentId);
    if (!evaluation) {
        showToast("Geen evaluatie gevonden om te exporteren.");
        return;
    }
    const doc = buildStudentPdf(evaluation);
    if (!doc) return;
    const student = state.students.find(s => s.id === selectedStudentId);
    const assignment = state.assignments.find(a => a.id === selectedAssignmentId);
    doc.save(`${student?.name || "Leerling"} - ${assignment?.title || "Evaluatie"}.pdf`);
    showToast("PDF gegenereerd.");
}

function exportSelectedClass() {
    if (!selectedClassId || !selectedAssignmentId) {
        showToast("Selecteer eerst een klas en een opdracht.");
        return;
    }
    const classStudents = state.students.filter(s => s.class_id === selectedClassId);
    const cls = state.classes.find(c => c.id === selectedClassId);
    const assignment = state.assignments.find(a => a.id === selectedAssignmentId);

    if (!classStudents.length) {
        showToast("Geen leerlingen in deze klas.");
        return;
    }

    let masterDoc = null;
    let evaluatedCount = 0;

    classStudents.forEach(student => {
        const evaluation = getLatestEvaluation(student.id, selectedAssignmentId);
        if (!evaluation) return;
        evaluatedCount++;
        if (!masterDoc) {
            masterDoc = buildStudentPdf(evaluation);
        } else {
            masterDoc.addPage();
            buildStudentPdf(evaluation, masterDoc);
        }
    });

    if (!masterDoc || evaluatedCount === 0) {
        showToast("Geen ingevulde evaluaties in deze klas.");
        return;
    }

    masterDoc.save(`Klas ${cls?.name || ""} - ${assignment?.title || "Evaluaties"}.pdf`);
    showToast(`PDF voor ${evaluatedCount} leerling(en) gegenereerd.`);
}

function buildStudentPdf(evaluation, existingDoc = null) {
    const assignment = state.assignments.find(a => a.id === evaluation.assignment_id);
    const student = state.students.find(s => s.id === evaluation.student_id);
    const cls = state.classes.find(c => c.id === (student?.class_id || evaluation.class_id));

    if (!assignment || !student) return null;

    const { jsPDF } = window.jspdf;
    const doc = existingDoc || new jsPDF({ unit: "mm", format: "a4" });

    const ACCENT_COLOR = [42, 55, 177];
    const TEXT_MAIN = [23, 24, 33];
    const BORDER_COLOR = [228, 227, 232];
    const BG_LIGHT = [250, 249, 251];

    const marginX = 20;
    let currentY = 20;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...ACCENT_COLOR);
    const splitTitle = doc.splitTextToSize(assignment.title, 170);
    doc.text(splitTitle, marginX, currentY);
    currentY += (splitTitle.length * 8) + 2;

    doc.setFontSize(16);
    doc.text(`${student.name} (${cls ? cls.name : "Geen klas"})`, marginX, currentY);
    currentY += 8;

    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.5);
    doc.line(marginX, currentY, 190, currentY);
    currentY += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const evalDate = formatDate(evaluation.evaluation_date || evaluation.created_at);
    let metaText = `Datum: ${evalDate}   |   Leerkracht: dhr. J. Vermote`;
    if (timerSeconds > 0) {
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        metaText += `   |   Spreekduur: ${mins}m ${secs}s`;
    }
    doc.text(metaText, marginX, currentY);
    currentY += 10;

    const excludedParams = evaluation.excluded_parameters || [];
    (assignment.parameters || []).forEach((param) => {
        const isExcluded = excludedParams.includes(param.id);
        const scoreData = evaluation.scores ? evaluation.scores[param.id] : null;
        const maxParamScore = param.levels && param.levels.length ? Math.max(...param.levels.map(l => Number(l.score))) : 0;

        let achievedScoreText = isExcluded ? "Niet beoordeeld" : (scoreData ? `${scoreData.score} / ${maxParamScore}` : `— / ${maxParamScore}`);
        let explanationText = isExcluded ? "Dit criterium werd niet beoordeeld voor deze leerling." : (scoreData?.explanation || "Geen toelichting.");

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const splitExplanation = doc.splitTextToSize(explanationText, 162);
        const boxHeight = Math.max(16, 10 + (splitExplanation.length * 4));

        doc.setFillColor(...BG_LIGHT);
        doc.setDrawColor(...BORDER_COLOR);
        doc.roundedRect(marginX, currentY, 170, boxHeight, 2, 2, "FD");

        doc.setFillColor(...ACCENT_COLOR);
        doc.rect(marginX, currentY, 1.5, boxHeight, "F");

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...TEXT_MAIN);
        doc.text(param.title + (isExcluded ? " (Niet beoordeeld)" : ""), marginX + 4, currentY + 6);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...ACCENT_COLOR);
        doc.text(achievedScoreText, 185, currentY + 6, { align: "right" });

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(115, 117, 130);
        doc.text(splitExplanation, marginX + 4, currentY + 12);

        currentY += boxHeight + 4;
    });

    if (evaluation.penalty_points > 0) {
        currentY += 2;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(192, 57, 43);
        doc.text(`Toegepaste minpunten / strafpunten: -${evaluation.penalty_points} punt(en)`, marginX, currentY);
        currentY += 6;
    }

    currentY += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ACCENT_COLOR);
    doc.text("Feedback & Opmerkingen", marginX, currentY);
    currentY += 6;

    const feedbackText = evaluation.feedback?.trim() || "Geen bijkomende opmerkingen.";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_MAIN);
    const splitFeedback = doc.splitTextToSize(feedbackText, 170);
    doc.text(splitFeedback, marginX, currentY);
    currentY += (splitFeedback.length * 5) + 10;

    const scoreObj = calculateEvaluationScore(evaluation, assignment);
    const totalScoreText = scoreObj ? `${scoreObj.total} / ${scoreObj.max}` : "—";

    doc.setFillColor(...ACCENT_COLOR);
    doc.roundedRect(marginX, currentY, 170, 13, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAALSCORE", marginX + 6, currentY + 8.5);
    doc.text(totalScoreText, 184, currentY + 8.5, { align: "right" });

    return doc;
}

function renderAll() {
    renderAssignments();
    renderClasses();
    renderEvaluationSelectors();
    renderEvaluationStudents();
    renderEvaluationForm();
    renderClassContent();
}

function escapeHtml(value) {
    if (value === null || value === undefined) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(date) {
    if (!date) return "—";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("nl-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function showToast(message) {
    const toast = document.getElementById("toast");
    const toastMessage = document.getElementById("toastMessage");
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timeout);
    showToast.timeout = setTimeout(() => toast.classList.remove("show"), 2500);
}

function getLastName(fullName) {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
}

function compareByLastName(a, b) {
    const lastNameA = getLastName(a.name);
    const lastNameB = getLastName(b.name);
    const cmp = lastNameA.localeCompare(lastNameB, undefined, { numeric: true, sensitivity: "base" });
    if (cmp !== 0) return cmp;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}
