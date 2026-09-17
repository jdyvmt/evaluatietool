import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, addDoc, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

const STORAGE_KEY = "atheneum_brugge_evaluatietool_v1";

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

/* ============================================================
   INITIALISATIE
   ============================================================ */

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
        showToast("Database kon niet worden geladen. Controleer de verbinding.");
    } finally {
        renderAll();
    }
});

/* ============================================================
   FIREBASE — GEGEVENS LADEN & SCHRIJVEN
   ============================================================ */

async function loadFromFirebase() {
    const collectionNames = ["assignments", "classes", "students", "evaluations"];

    const results = await Promise.all(
        collectionNames.map(async (collectionName) => {
            const snapshot = await getDocs(collection(db, collectionName));
            return {
                name: collectionName,
                data: snapshot.docs.map((document) => ({
                    id: document.id,
                    ...document.data()
                }))
            };
        })
    );

    results.forEach((result) => {
        state[result.name] = result.data;
    });
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
        text.textContent = "Lokale modus (Geen verbinding)";
    }
}

function createId(prefix = "") {
    return prefix + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

async function dbInsert(collectionName, object) {
    const id = object.id || createId();
    const reference = doc(db, collectionName, id);
    const data = { ...object, id };
    await setDoc(reference, data);
    return data;
}

async function dbUpdate(collectionName, id, object) {
    const reference = doc(db, collectionName, id);
    await updateDoc(reference, object);
    return { ...object, id };
}

async function dbDelete(collectionName, id) {
    const reference = doc(db, collectionName, id);
    await deleteDoc(reference);
}

/* ============================================================
   NAVIGATIE
   ============================================================ */

function setupNavigation() {
    document.querySelectorAll(".nav-button").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".nav-button").forEach((btn) => btn.classList.remove("active"));
            document.querySelectorAll(".page").forEach((page) => page.classList.remove("active-page"));

            button.classList.add("active");
            const targetPage = document.getElementById(button.dataset.page);
            if (targetPage) targetPage.classList.add("active-page");
        });
    });
}

/* ============================================================
   EVALUATIE EVENTS
   ============================================================ */

function setupEvaluationEvents() {
    const evaluationAssignment = document.getElementById("evaluationAssignment");
    if (evaluationAssignment) {
        evaluationAssignment.addEventListener("change", (event) => {
            selectedAssignmentId = event.target.value || null;
            currentEvaluationId = null;
            isRetake = false;
            renderEvaluationStudents();
            renderEvaluationForm();
        });
    }

    const evaluationClass = document.getElementById("evaluationClass");
    if (evaluationClass) {
        evaluationClass.addEventListener("change", (event) => {
            selectedClassId = event.target.value || null;
            selectedStudentId = null;
            renderEvaluationStudents();
            renderEvaluationForm();
        });
    }

    const studentSearch = document.getElementById("studentSearch");
    if (studentSearch) {
        studentSearch.addEventListener("input", () => renderEvaluationStudents());
    }

    const filterUnevaluatedButton = document.getElementById("filterUnevaluated");
    if (filterUnevaluatedButton) {
        filterUnevaluatedButton.addEventListener("click", (event) => {
            filterUnevaluated = !filterUnevaluated;
            event.currentTarget.classList.toggle("active", filterUnevaluated);
            renderEvaluationStudents();
        });
    }

    const retakeButton = document.getElementById("retakeButton");
    if (retakeButton) retakeButton.addEventListener("click", startRetake);

    const saveEvaluationButton = document.getElementById("saveEvaluation");
    if (saveEvaluationButton) saveEvaluationButton.addEventListener("click", saveEvaluation);

    const exportStudentButton = document.getElementById("exportStudent");
    if (exportStudentButton) exportStudentButton.addEventListener("click", exportSelectedStudent);

    const exportClassButton = document.getElementById("exportClass");
    if (exportClassButton) exportClassButton.addEventListener("click", exportSelectedClass);

    const toggleHistoryButton = document.getElementById("toggleHistory");
    if (toggleHistoryButton) {
        toggleHistoryButton.addEventListener("click", () => {
            const history = document.getElementById("evaluationHistory");
            if (history) history.classList.toggle("hidden");
        });
    }

    const timerStart = document.getElementById("timerStart");
    if (timerStart) timerStart.addEventListener("click", startTimer);

    const timerPause = document.getElementById("timerPause");
    if (timerPause) timerPause.addEventListener("click", pauseTimer);

    const timerReset = document.getElementById("timerReset");
    if (timerReset) timerReset.addEventListener("click", resetTimer);
}

/* ============================================================
   EVALUATIE RENDER & FORM
   ============================================================ */

function renderEvaluationSelectors() {
    const assignmentSelect = document.getElementById("evaluationAssignment");
    const classSelect = document.getElementById("evaluationClass");

    if (!assignmentSelect || !classSelect) return;

    // Sorteer opdrachten op volgorde
    const sortedAssignments = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    assignmentSelect.innerHTML = `<option value="">Kies een opdracht...</option>`;
    sortedAssignments.forEach((assignment) => {
        assignmentSelect.innerHTML += `<option value="${escapeHtml(assignment.id)}">${escapeHtml(assignment.title)}</option>`;
    });

    // Sorteer klassen alfabetisch op naam
    const sortedClasses = [...state.classes].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );

    classSelect.innerHTML = `<option value="">Kies een klas...</option>`;
    sortedClasses.forEach((cls) => {
        classSelect.innerHTML += `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`;
    });

    if (selectedAssignmentId) assignmentSelect.value = selectedAssignmentId;
    if (selectedClassId) classSelect.value = selectedClassId;
}

function renderEvaluationStudents() {
    const container = document.getElementById("studentList");
    if (!container) return;

    const search = document.getElementById("studentSearch")?.value.trim().toLowerCase() || "";

    // Als er NIET gezocht wordt, verplicht een klasselectie
    if (!search && !selectedClassId) {
        container.innerHTML = `<div class="empty-state small">Kies een klas of zoek op naam.</div>`;
        return;
    }

    let students = [];

    if (search) {
        // ZOEKMODUS: Zoek over ALLE klassen heen
        students = state.students.filter((student) => student.name.toLowerCase().includes(search));
    } else {
        // KLASMODUS: Filter enkel op de geselecteerde klas
        students = state.students.filter((student) => student.class_id === selectedClassId);
    }

    if (filterUnevaluated && selectedAssignmentId) {
        students = students.filter((student) => !hasEvaluation(student.id, selectedAssignmentId));
    }

    if (!students.length) {
        container.innerHTML = `<div class="empty-state small">Geen leerlingen gevonden.</div>`;
        return;
    }

    // Sorteer alfabetisch op familienaam
    students.sort(compareByLastName);

    container.innerHTML = students
        .map((student) => {
            const evaluated = selectedAssignmentId && hasEvaluation(student.id, selectedAssignmentId);
            const active = student.id === selectedStudentId;
            const retakeCount = getEvaluationHistory(student.id, selectedAssignmentId).filter((e) => e.attempt_number > 1).length;
            
            // Toon de klasnaam bij de zoekresultaten als er over alle klassen gezocht wordt
            const cls = search ? state.classes.find((c) => c.id === student.class_id) : null;
            const classLabel = cls ? `<span class="muted" style="font-size: 10px; margin-left: 5px;">(${escapeHtml(cls.name)})</span>` : "";

            return `
                <button class="student-item ${active ? "active" : ""}" data-student-id="${escapeHtml(student.id)}">
                    <span class="student-name">${escapeHtml(student.name)} ${classLabel}</span>
                    ${evaluated ? `<span class="student-check">✓</span>` : ""}
                    ${retakeCount ? `<span class="student-retake">${retakeCount}x herk.</span>` : ""}
                </button>
            `;
        })
        .join("");

    container.querySelectorAll(".student-item").forEach((button) => {
        button.addEventListener("click", () => {
            selectedStudentId = button.dataset.studentId;
            
            // Pas automatisch de gekozen klas aan op basis van de geselecteerde leerling
            const student = state.students.find((s) => s.id === selectedStudentId);
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

    const student = state.students.find((item) => item.id === selectedStudentId);
    const assignment = state.assignments.find((item) => item.id === selectedAssignmentId);

    if (!student || !assignment) {
        if (studentName) studentName.textContent = "Geen leerling geselecteerd";
        if (meta) meta.textContent = "Kies een opdracht, klas en leerling.";
        if (totalScoreEl) totalScoreEl.textContent = "—";

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <h3>Start een evaluatie</h3>
                <p>Kies links een opdracht, klas en leerling om het formulier te openen.</p>
            </div>
        `;
        renderHistory();
        return;
    }

    if (studentName) studentName.textContent = student.name;
    const cls = state.classes.find((item) => item.id === student.class_id);
    if (meta) meta.textContent = `${assignment.title} · ${cls ? cls.name : ""}`;

    let evaluation = currentEvaluationId ? state.evaluations.find((item) => item.id === currentEvaluationId) : null;

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
    const selectedComments = evaluation?.comments || [];

    let html = "";

    (assignment.parameters || []).forEach((parameter, index) => {
        const selected = selectedScores[parameter.id];

        html += `
            <div class="parameter" data-parameter-id="${escapeHtml(parameter.id)}">
                <div class="parameter-header">
                    <div>
                        <span class="parameter-number">CRITERIUM ${String(index + 1).padStart(2, "0")}</span>
                        <h3 class="parameter-title">${escapeHtml(parameter.title)}</h3>
                    </div>
                    <div class="parameter-score" data-score-for="${escapeHtml(parameter.id)}">
                        ${selected ? `Score: ${escapeHtml(String(selected.score))}` : "Niet beoordeeld"}
                    </div>
                </div>
                <div class="levels">
                    ${
                        parameter.levels && parameter.levels.length
                            ? parameter.levels
                                  .map((level) => {
                                      const isSelected = selected && selected.level_id === level.id;
                                      return `
                                        <label class="level-card ${isSelected ? "selected" : ""}">
                                            <input type="radio" name="parameter-${escapeHtml(parameter.id)}" value="${escapeHtml(level.id)}" data-parameter="${escapeHtml(parameter.id)}" data-score="${escapeHtml(String(level.score))}" ${isSelected ? "checked" : ""}>
                                            <div class="level-score">${escapeHtml(String(level.score))}</div>
                                            <div class="level-explanation">${escapeHtml(level.explanation)}</div>
                                        </label>
                                    `;
                                  })
                                  .join("")
                            : `<div class="empty-state small">Geen niveaus ingesteld.</div>`
                    }
                </div>
            </div>
        `;
    });

    html += `
        <div class="comment-section">
            <div class="parameter-header">
                <div>
                    <span class="section-label">FEEDBACK</span>
                    <h3 class="parameter-title">Snelcommentaren</h3>
                </div>
            </div>
            <div class="comment-buttons">
                ${
                    assignment.comments?.length
                        ? assignment.comments
                              .map((comment, index) => {
                                  const active = selectedComments.includes(comment);
                                  return `<button type="button" class="comment-chip ${active ? "active" : ""}" data-comment-index="${index}">${escapeHtml(comment)}</button>`;
                              })
                              .join("")
                        : `<span class="muted">Geen standaardcommentaren ingesteld.</span>`
                }
            </div>
            <label class="feedback-label">Feedback</label>
            <textarea id="feedbackText" placeholder="Schrijf hier je feedback...">${escapeHtml(evaluation?.feedback || "")}</textarea>
        </div>
    `;

    container.innerHTML = html;

    container.querySelectorAll(".level-card input").forEach((input) => {
        input.addEventListener("change", () => {
            container.querySelectorAll(`[name="${input.name}"]`).forEach((other) => {
                other.closest(".level-card")?.classList.remove("selected");
            });
            input.closest(".level-card")?.classList.add("selected");

            const scoreElement = document.querySelector(`[data-score-for="${input.dataset.parameter}"]`);
            if (scoreElement) scoreElement.textContent = `Score: ${input.dataset.score}`;
            updateTotalScore();
        });
    });

    container.querySelectorAll(".comment-chip").forEach((button) => {
        button.addEventListener("click", () => {
            button.classList.toggle("active");
            const textarea = document.getElementById("feedbackText");
            if (!textarea) return;

            const selectedCommentsNow = Array.from(container.querySelectorAll(".comment-chip.active")).map(
                (item) => assignment.comments[Number(item.dataset.commentIndex)]
            );
            textarea.value = selectedCommentsNow.join(" ");
        });
    });

    updateTotalScore();
}

function updateTotalScore() {
    const assignment = state.assignments.find((item) => item.id === selectedAssignmentId);
    const total = document.getElementById("totalScore");
    if (!assignment || !total) return;

    let achievedScore = 0;
    let maximumScore = 0;
    let evaluatedCount = 0;

    (assignment.parameters || []).forEach((parameter) => {
        const levels = parameter.levels || [];
        if (levels.length) {
            maximumScore += Math.max(...levels.map((l) => Number(l.score)));
        }

        const input = document.querySelector(`input[name="parameter-${parameter.id}"]:checked`);
        if (input) {
            const score = Number(input.dataset.score);
            if (!Number.isNaN(score)) {
                achievedScore += score;
                evaluatedCount++;
            }
        }
    });

    total.textContent = evaluatedCount ? `${achievedScore} / ${maximumScore}` : "—";
}

function collectFormData() {
    const assignment = state.assignments.find((item) => item.id === selectedAssignmentId);
    const scores = {};

    if (assignment) {
        (assignment.parameters || []).forEach((parameter) => {
            const input = document.querySelector(`input[name="parameter-${parameter.id}"]:checked`);
            if (input) {
                const level = parameter.levels.find((item) => item.id === input.value);
                if (level) {
                    scores[parameter.id] = {
                        level_id: level.id,
                        score: Number(level.score),
                        level_title: level.title || "",
                        explanation: level.explanation
                    };
                }
            }
        });
    }

    const comments = Array.from(document.querySelectorAll(".comment-chip.active")).map(
        (button) => assignment.comments[Number(button.dataset.commentIndex)]
    );

    const feedback = document.getElementById("feedbackText")?.value.trim() || "";

    return { scores, comments, feedback };
}

/* ============================================================
   EVALUATIE OPSLAAN & GESCHIEDENIS
   ============================================================ */

async function saveEvaluation() {
    if (!selectedAssignmentId || !selectedStudentId) {
        showToast("Selecteer eerst een opdracht en een leerling.");
        return;
    }

    const data = collectFormData();
    if (!Object.keys(data.scores).length) {
        showToast("Selecteer minstens één niveau.");
        return;
    }

    const previous = getEvaluationHistory(selectedStudentId, selectedAssignmentId);
    const nextAttempt = previous.length ? Math.max(...previous.map((item) => item.attempt_number || 1)) + (isRetake ? 1 : 0) : 1;

    try {
        if (currentEvaluationId && !isRetake) {
            const updated = {
                assignment_id: selectedAssignmentId,
                student_id: selectedStudentId,
                class_id: selectedClassId,
                scores: data.scores,
                comments: data.comments,
                feedback: data.feedback,
                updated_at: new Date().toISOString()
            };
            await dbUpdate("evaluations", currentEvaluationId, updated);
            const index = state.evaluations.findIndex((item) => item.id === currentEvaluationId);
            if (index >= 0) state.evaluations[index] = { ...state.evaluations[index], ...updated };
        } else {
            const newEvaluation = {
                id: createId("evaluation_"),
                assignment_id: selectedAssignmentId,
                student_id: selectedStudentId,
                class_id: selectedClassId,
                scores: data.scores,
                comments: data.comments,
                feedback: data.feedback,
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
        showToast("Opslaan mislukt: " + (error.message || "onbekende fout"));
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
        .filter((e) => e.student_id === studentId && e.assignment_id === assignmentId)
        .sort((a, b) => new Date(b.created_at || b.evaluation_date) - new Date(a.created_at || a.evaluation_date));
}

function getLatestEvaluation(studentId, assignmentId) {
    return getEvaluationHistory(studentId, assignmentId)[0] || null;
}

function hasEvaluation(studentId, assignmentId) {
    return Boolean(getLatestEvaluation(studentId, assignmentId));
}

function calculateEvaluationScore(evaluation, assignment) {
    if (!evaluation || !assignment || !evaluation.scores) return null;

    let totalScore = 0;
    let maxScore = 0;
    let evaluatedCount = 0;

    (assignment.parameters || []).forEach((parameter) => {
        const levels = parameter.levels || [];
        if (levels.length) {
            maxScore += Math.max(...levels.map((l) => Number(l.score)));
        }

        const selected = evaluation.scores[parameter.id];
        if (selected && typeof selected.score === "number") {
            totalScore += selected.score;
            evaluatedCount++;
        }
    });

    if (!evaluatedCount) return null;
    return { total: totalScore, max: maxScore, evaluated: evaluatedCount };
}

function renderHistory() {
    const container = document.getElementById("evaluationHistory");
    if (!container) return;

    if (!selectedStudentId || !selectedAssignmentId) {
        container.innerHTML = `<div class="empty-state small">Selecteer een leerling.</div>`;
        return;
    }

    const history = getEvaluationHistory(selectedStudentId, selectedAssignmentId);
    const assignment = state.assignments.find((item) => item.id === selectedAssignmentId);

    if (!history.length) {
        container.innerHTML = `<div class="empty-state small">Nog geen eerdere evaluaties.</div>`;
        return;
    }

    container.innerHTML = history
        .map((evaluation) => {
            const score = calculateEvaluationScore(evaluation, assignment);
            const date = formatDate(evaluation.evaluation_date || evaluation.created_at);

            return `
                <div class="history-item">
                    <div class="history-date">
                        <strong>${date}</strong>
                        <div class="history-attempt">${evaluation.attempt_number > 1 ? "Herkansing" : "Eerste evaluatie"}</div>
                    </div>
                    <div class="history-score">${score === null ? "—" : `${score.total} / ${score.max}`}</div>
                    <div class="history-actions">
                        <button data-history-edit="${escapeHtml(evaluation.id)}">Bewerken</button>
                        <button data-history-delete="${escapeHtml(evaluation.id)}">Verwijderen</button>
                    </div>
                </div>
            `;
        })
        .join("");

    container.querySelectorAll("[data-history-edit]").forEach((button) => {
        button.addEventListener("click", () => {
            currentEvaluationId = button.dataset.historyEdit;
            isRetake = false;
            renderEvaluationForm();
        });
    });

    container.querySelectorAll("[data-history-delete]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Deze evaluatie definitief verwijderen?")) return;
            try {
                await dbDelete("evaluations", button.dataset.historyDelete);
                state.evaluations = state.evaluations.filter((item) => item.id !== button.dataset.historyDelete);
                if (currentEvaluationId === button.dataset.historyDelete) currentEvaluationId = null;
                renderEvaluationStudents();
                renderEvaluationForm();
                showToast("Evaluatie verwijderd.");
            } catch (error) {
                console.error(error);
                showToast("Verwijderen mislukt.");
            }
        });
    });
}

/* ============================================================
   TIMER
   ============================================================ */

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

/* ============================================================
   OPDRACHTEN BEHEREN
   ============================================================ */

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
        isNew: true // Markeer als nog niet opgeslagen in Firebase
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

    const titleEl = document.getElementById("assignmentTitle");
    if (titleEl) titleEl.value = assignment.title || "";

    renderCommentsBuilder(assignment);
    renderParametersBuilder(assignment);
}

function renderCommentsBuilder(assignment) {
    const container = document.getElementById("commentsBuilder");
    if (!container) return;

    container.innerHTML = assignment.comments
        .map(
            (comment, index) => `
            <div class="comment-builder">
                <input type="text" value="${escapeHtml(comment)}" data-comment-index="${index}">
                <button type="button" class="icon-button" data-delete-comment="${index}">×</button>
            </div>
        `
        )
        .join("");

    container.querySelectorAll("[data-comment-index]").forEach((input) => {
        input.addEventListener("input", () => {
            assignment.comments[Number(input.dataset.commentIndex)] = input.value;
        });
    });

    container.querySelectorAll("[data-delete-comment]").forEach((button) => {
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

    container.innerHTML = assignment.parameters
        .map(
            (parameter, parameterIndex) => `
            <div class="parameter-builder" data-parameter-id="${escapeHtml(parameter.id)}">
                <div class="builder-header">
                    <div>
                        <span class="section-label">CRITERIUM ${String(parameterIndex + 1).padStart(2, "0")}</span>
                        <input type="text" class="parameter-title-input" value="${escapeHtml(parameter.title || "")}" placeholder="Naam van criterium">
                    </div>
                    <button type="button" class="danger-button" data-delete-parameter="${escapeHtml(parameter.id)}">Verwijderen</button>
                </div>
                <div class="levels-builder">
                    <div class="levels-builder-header">
                        <strong>Niveaus</strong>
                        <button type="button" class="secondary-button" data-add-level="${escapeHtml(parameter.id)}">+ Niveau</button>
                    </div>
                    <div class="level-builder-list">
                        ${(parameter.levels || [])
                            .map(
                                (level, levelIndex) => `
                            <div class="level-builder" data-level-id="${escapeHtml(level.id)}">
                                <div class="level-number">${levelIndex + 1}</div>
                                <div class="level-score-input">
                                    <label>Score</label>
                                    <input type="number" value="${escapeHtml(String(level.score ?? ""))}" data-level-score>
                                </div>
                                <div class="level-title-input">
                                    <label>Titel</label>
                                    <input type="text" value="${escapeHtml(level.title || "")}" data-level-title placeholder="Bijv. Uitstekend">
                                </div>
                                <div class="level-explanation-input">
                                    <label>Omschrijving</label>
                                    <input type="text" value="${escapeHtml(level.explanation || "")}" data-level-explanation placeholder="Omschrijving">
                                </div>
                                <button type="button" class="icon-button danger" data-delete-level="${escapeHtml(parameter.id)}" data-level-id="${escapeHtml(level.id)}">×</button>
                            </div>
                        `
                            )
                            .join("")}
                    </div>
                </div>
            </div>
        `
        )
        .join("");

    container.querySelectorAll(".parameter-title-input").forEach((input) => {
        input.addEventListener("input", () => {
            const builder = input.closest(".parameter-builder");
            const parameter = assignment.parameters.find((item) => item.id === builder.dataset.parameterId);
            if (parameter) parameter.title = input.value;
        });
    });

    container.querySelectorAll(".level-builder").forEach((levelElement) => {
        const parameterElement = levelElement.closest(".parameter-builder");
        const parameter = assignment.parameters.find((item) => item.id === parameterElement.dataset.parameterId);
        if (!parameter) return;

        const level = parameter.levels.find((item) => item.id === levelElement.dataset.levelId);
        if (!level) return;

        levelElement.querySelector("[data-level-score]").addEventListener("input", (e) => {
            level.score = Number(e.target.value);
        });
        levelElement.querySelector("[data-level-title]").addEventListener("input", (e) => {
            level.title = e.target.value;
        });
        levelElement.querySelector("[data-level-explanation]").addEventListener("input", (e) => {
            level.explanation = e.target.value;
        });
    });

    container.querySelectorAll("[data-add-level]").forEach((button) => {
        button.addEventListener("click", () => {
            const parameter = assignment.parameters.find((item) => item.id === button.dataset.addLevel);
            if (!parameter) return;

            const existingScores = parameter.levels.map((l) => Number(l.score)).filter((s) => !Number.isNaN(s));
            let newScore = existingScores.length ? Math.min(...existingScores) - 1 : 1;

            parameter.levels.push({ id: createId("level_"), score: newScore, title: "", explanation: "" });
            renderParametersBuilder(assignment);
        });
    });

    container.querySelectorAll("[data-delete-level]").forEach((button) => {
        button.addEventListener("click", () => {
            const parameter = assignment.parameters.find((item) => item.id === button.dataset.deleteLevel);
            if (!parameter) return;

            if (parameter.levels.length <= 1) {
                showToast("Een criterium moet minstens één niveau hebben.");
                return;
            }

            parameter.levels = parameter.levels.filter((l) => l.id !== button.dataset.levelId);
            renderParametersBuilder(assignment);
        });
    });

    container.querySelectorAll("[data-delete-parameter]").forEach((button) => {
        button.addEventListener("click", () => {
            if (assignment.parameters.length <= 1) {
                showToast("Een opdracht moet minstens één criterium hebben.");
                return;
            }
            if (!confirm("Dit criterium verwijderen?")) return;

            assignment.parameters = assignment.parameters.filter((p) => p.id !== button.dataset.deleteParameter);
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
    if (!assignment) {
        showToast("Geen opdracht geselecteerd.");
        return;
    }

    const title = document.getElementById("assignmentTitle")?.value.trim();
    if (!title) {
        showToast("Geef de opdracht een naam.");
        return;
    }

    assignment.title = title;
    assignment.parameters.forEach((p) => p.levels.forEach((l) => (l.score = Number(l.score))));

    try {
        if (assignment.isNew) {
            delete assignment.isNew; // Verwijder de tijdelijke vlag
            await dbInsert("assignments", assignment);
        } else {
            await dbUpdate("assignments", assignment.id, assignment);
        }
        renderAssignments();
        showToast("Opdracht opgeslagen.");
    } catch (error) {
        console.error("Firebase fout:", error);
        showToast("Opdracht kon niet worden opgeslagen.");
    }
}

async function duplicateAssignment() {
    const assignment = getEditingAssignment();
    if (!assignment) return;

    const duplicate = JSON.parse(JSON.stringify(assignment));
    duplicate.id = createId("assignment_");
    duplicate.title = `${assignment.title} - kopie`;
    duplicate.parameters.forEach((p) => {
        p.id = createId("parameter_");
        p.levels.forEach((l) => (l.id = createId("level_")));
    });

    try {
        const result = await dbInsert("assignments", duplicate);
        state.assignments.push(result);
        editingAssignmentId = result.id;
        renderAssignments();
        openAssignmentEditor();
        showToast("Opdracht gedupliceerd.");
    } catch (error) {
        console.error(error);
        showToast("Dupliceren mislukt.");
    }
}

async function deleteAssignment() {
    const assignment = getEditingAssignment();
    if (!assignment) return;

    if (!confirm(`Weet je zeker dat je "${assignment.title}" wilt verwijderen?`)) return;

    try {
        await dbDelete("assignments", assignment.id);
        state.assignments = state.assignments.filter((item) => item.id !== assignment.id);
        editingAssignmentId = null;

        document.getElementById("assignmentEditor")?.classList.add("hidden");
        document.getElementById("assignmentEditorEmpty")?.classList.remove("hidden");

        renderAssignments();
        showToast("Opdracht verwijderd.");
    } catch (error) {
        console.error(error);
        showToast("Verwijderen mislukt.");
    }
}

function getEditingAssignment() {
    return editingAssignmentId ? state.assignments.find((a) => a.id === editingAssignmentId) || null : null;
}

function renderAssignments() {
    const container = document.getElementById("assignmentList");
    if (!container) return;

    if (!state.assignments.length) {
        container.innerHTML = `<div class="empty-state"><h3>Nog geen opdrachten</h3></div>`;
        return;
    }

    // Sorteer opdrachten op volgorde
    const sortedAssignments = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    container.innerHTML = sortedAssignments
        .map((assignment, index) => {
            const active = assignment.id === editingAssignmentId;
            const parameterCount = assignment.parameters?.length || 0;
            const isFirst = index === 0;
            const isLast = index === sortedAssignments.length - 1;

            return `
                <div class="assignment-item ${active ? "active" : ""}">
                    <button type="button" class="assignment-item-main" data-assignment-id="${escapeHtml(assignment.id)}">
                        <strong>${escapeHtml(assignment.title)}</strong>
                        <span>${parameterCount} ${parameterCount === 1 ? "criterium" : "criteria"}</span>
                    </button>
                    <div class="assignment-order-actions">
                        <button type="button" class="order-btn" data-move-up="${escapeHtml(assignment.id)}" ${isFirst ? "disabled" : ""}>▲</button>
                        <button type="button" class="order-btn" data-move-down="${escapeHtml(assignment.id)}" ${isLast ? "disabled" : ""}>▼</button>
                    </div>
                </div>
            `;
        })
        .join("");

    // Klikken op de opdracht om te openen
    container.querySelectorAll("[data-assignment-id]").forEach((button) => {
        button.addEventListener("click", () => {
            editingAssignmentId = button.dataset.assignmentId;
            renderAssignments();
            openAssignmentEditor();
        });
    });

    // Pijltje omhoog
    container.querySelectorAll("[data-move-up]").forEach((button) => {
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            moveAssignment(button.dataset.moveUp, -1);
        });
    });

    // Pijltje omlaag
    container.querySelectorAll("[data-move-down]").forEach((button) => {
        button.addEventListener("click", (e) => {
            e.stopPropagation();
            moveAssignment(button.dataset.moveDown, 1);
        });
    });
}

async function moveAssignment(assignmentId, direction) {
    const sorted = [...state.assignments].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const currentIndex = sorted.findIndex((a) => a.id === assignmentId);
    const targetIndex = currentIndex + direction;

    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    // Wissel posities
    const current = sorted[currentIndex];
    const target = sorted[targetIndex];

    const tempOrder = current.order ?? currentIndex;
    current.order = target.order ?? targetIndex;
    target.order = tempOrder;

    renderAssignments();

    // Sla nieuwe volgorde op in Firebase
    try {
        await Promise.all([
            dbUpdate("assignments", current.id, { order: current.order }),
            dbUpdate("assignments", target.id, { order: target.order })
        ]);
    } catch (error) {
        console.error("Fout bij opslaan volgorde:", error);
        showToast("Volgorde kon niet worden opgeslagen.");
    }
}

/* ============================================================
   KLASSEN EN LEERLINGEN BEHEREN
   ============================================================ */

function setupStudentEvents() {
    document.getElementById("newClass")?.addEventListener("click", createClass);
    document.getElementById("addStudent")?.addEventListener("click", addStudent);
    document.getElementById("editClass")?.addEventListener("click", editClass);
    document.getElementById("deleteClass")?.addEventListener("click", deleteClass);
    document.getElementById("saveStudentClass")?.addEventListener("click", saveStudentClass);
    document.getElementById("closeStudentDetail")?.addEventListener("click", () => {
        document.getElementById("studentDetail")?.classList.add("hidden");
    });
}

async function createClass() {
    const name = prompt("Naam van de nieuwe klas:");
    if (!name?.trim()) return;

    const cls = {
        id: createId("class_"),
        name: name.trim(),
        created_at: new Date().toISOString()
    };

    try {
        const result = await dbInsert("classes", cls);
        state.classes.push(result);
        selectedClassId = result.id;
        renderAll();
        showToast("Klas aangemaakt.");
    } catch (error) {
        console.error(error);
        showToast("Klas maken mislukt.");
    }
}

function renderClasses() {
    const container = document.getElementById("classList");
    if (!container) return;

    if (!state.classes.length) {
        container.innerHTML = `<div class="empty-state small">Nog geen klassen.</div>`;
        return;
    }

    // Sorteer klassen alfabetisch op naam
    const sortedClasses = [...state.classes].sort((a, b) => 
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );

    container.innerHTML = sortedClasses
        .map((cls) => {
            const count = state.students.filter((s) => s.class_id === cls.id).length;
            return `
            <div class="class-item ${cls.id === selectedClassId ? "active" : ""}" data-class-id="${escapeHtml(cls.id)}">
                <div class="class-item-name">${escapeHtml(cls.name)}</div>
                <div class="class-item-count">${count}</div>
            </div>
        `;
        })
        .join("");

    container.querySelectorAll("[data-class-id]").forEach((item) => {
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

    const cls = state.classes.find((item) => item.id === selectedClassId);
    if (!cls) {
        empty.classList.remove("hidden");
        content.classList.add("hidden");
        return;
    }

    empty.classList.add("hidden");
    content.classList.remove("hidden");

    document.getElementById("classTitle").textContent = cls.name;
    const students = state.students.filter((s) => s.class_id === cls.id);
    document.getElementById("classStudentCount").textContent = students.length;

    renderStudentsTable(students);
}

function renderStudentsTable(students) {
    const container = document.getElementById("studentsTable");
    if (!container) return;

    if (!students.length) {
        container.innerHTML = `<div class="empty-state small">Voeg je eerste leerling toe.</div>`;
        return;
    }

    // Sorteer op familienaam
    const sortedStudents = [...students].sort(compareByLastName);

    container.innerHTML = `
        <table class="students-table">
            <thead>
                <tr>
                    <th>LEERLING</th>
                    <th>EVALUATIES</th>
                    <th></th>
                </tr>
            </thead>
            <tbody>
                ${sortedStudents
                    .map((student) => {
                        const evaluations = state.evaluations.filter((e) => e.student_id === student.id).length;
                        return `
                        <tr>
                            <td><strong>${escapeHtml(student.name)}</strong></td>
                            <td>${evaluations}</td>
                            <td>
                                <div class="table-actions">
                                    <button class="table-action" data-student-detail="${escapeHtml(student.id)}">Bekijken</button>
                                    <button class="table-action" data-delete-student="${escapeHtml(student.id)}">Verwijderen</button>
                                </div>
                            </td>
                        </tr>
                    `;
                    })
                    .join("")}
            </tbody>
        </table>
    `;

    // ... (rest van de event listeners in renderStudentsTable blijft hetzelfde)

    container.querySelectorAll("[data-student-detail]").forEach((button) => {
        button.addEventListener("click", () => openStudentDetail(button.dataset.studentDetail));
    });

    container.querySelectorAll("[data-delete-student]").forEach((button) => {
        button.addEventListener("click", async () => {
            if (!confirm("Leerling verwijderen?")) return;
            try {
                await dbDelete("students", button.dataset.deleteStudent);
                state.students = state.students.filter((s) => s.id !== button.dataset.deleteStudent);
                renderAll();
                showToast("Leerling verwijderd.");
            } catch (error) {
                console.error(error);
                showToast("Verwijderen mislukt.");
            }
        });
    });
}

async function addStudent() {
    if (!selectedClassId) {
        showToast("Selecteer eerst een klas.");
        return;
    }

    const input = document.getElementById("newStudentName");
    const name = input?.value.trim();
    if (!name) return;

    const student = {
        id: createId("student_"),
        name,
        class_id: selectedClassId,
        created_at: new Date().toISOString()
    };

    try {
        const result = await dbInsert("students", student);
        state.students.push(result);
        if (input) input.value = "";
        renderAll();
        showToast("Leerling toegevoegd.");
    } catch (error) {
        console.error(error);
        showToast("Toevoegen mislukt.");
    }
}

async function editClass() {
    const cls = state.classes.find((item) => item.id === selectedClassId);
    if (!cls) return;

    const name = prompt("Nieuwe naam:", cls.name);
    if (!name?.trim()) return;

    try {
        await dbUpdate("classes", cls.id, { name: name.trim() });
        cls.name = name.trim();
        renderAll();
        showToast("Klas aangepast.");
    } catch (error) {
        console.error(error);
        showToast("Aanpassen mislukt.");
    }
}

async function deleteClass() {
    const cls = state.classes.find((item) => item.id === selectedClassId);
    if (!cls) return;

    if (!confirm(`Klas ${cls.name} verwijderen?`)) return;

    try {
        await dbDelete("classes", cls.id);
        state.classes = state.classes.filter((item) => item.id !== cls.id);
        state.students = state.students.filter((s) => s.class_id !== cls.id);
        selectedClassId = null;
        renderAll();
        showToast("Klas verwijderd.");
    } catch (error) {
        console.error(error);
        showToast("Verwijderen mislukt.");
    }
}

function openStudentDetail(studentId) {
    selectedDetailStudentId = studentId;
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return;

    const panel = document.getElementById("studentDetail");
    if (!panel) return;

    panel.classList.remove("hidden");
    document.getElementById("studentDetailName").textContent = student.name;

    // Vul het keuzemenu met alle beschikbare klassen
    const select = document.getElementById("studentClassChange");
    if (select) {
        const sortedClasses = [...state.classes].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
        );

        select.innerHTML = sortedClasses
            .map((cls) => `<option value="${escapeHtml(cls.id)}">${escapeHtml(cls.name)}</option>`)
            .join("");

        // Selecteer de huidige klas van de leerling
        select.value = student.class_id;
    }

    renderStudentEvaluationHistory();
}

function renderStudentEvaluationHistory() {
    const container = document.getElementById("studentEvaluationHistory");
    if (!container || !selectedDetailStudentId) return;

    const evaluations = state.evaluations.filter((e) => e.student_id === selectedDetailStudentId);
    if (!evaluations.length) {
        container.innerHTML = "<p>Deze leerling heeft nog geen evaluaties.</p>";
        return;
    }

    container.innerHTML = evaluations
        .map((evaluation) => {
            const assignment = state.assignments.find((a) => a.id === evaluation.assignment_id);
            const score = calculateEvaluationScore(evaluation, assignment);
            return `
            <div class="history-item">
                <div class="history-main">
                    <strong>${assignment ? assignment.title : "Onbekende opdracht"}</strong>
                </div>
                <div class="history-score">${score === null ? "—" : `${score.total} / ${score.max}`}</div>
            </div>
        `;
        })
        .join("");
}

async function saveStudentClass() {
    const select = document.getElementById("studentClassChange");
    if (!select || !selectedDetailStudentId) return;

    try {
        await dbUpdate("students", selectedDetailStudentId, { class_id: select.value });
        const student = state.students.find((s) => s.id === selectedDetailStudentId);
        if (student) student.class_id = select.value;

        // Sluit het detailvenster en herlaad de tabellen
        document.getElementById("studentDetail")?.classList.add("hidden");
        renderAll();
        showToast("Klas van de leerling opgeslagen.");
    } catch (error) {
        console.error(error);
        showToast("Opslaan mislukt.");
    }
}
function renderClassScores() {
    const container = document.getElementById("classScores");
    if (!container) return;

    const classStudents = state.students.filter((s) => s.class_id === selectedClassId);
    const assignment = state.assignments.find((a) => a.id === selectedAssignmentId);

    if (!assignment || !classStudents.length) {
        container.innerHTML = "<p>Selecteer een klas en opdracht.</p>";
        return;
    }

    container.innerHTML = classStudents
        .map((student) => {
            const evaluation = getLatestEvaluation(student.id, assignment.id);
            const score = calculateEvaluationScore(evaluation, assignment);

            return `
            <div class="class-score-row">
                <span>${escapeHtml(student.name)}</span>
                <span>${score === null ? "—" : `${score.total} / ${score.max}`}</span>
            </div>
        `;
        })
        .join("");
}

/* ============================================================
   EXPORT PDF UTILS
   ============================================================ */

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

    const student = state.students.find((s) => s.id === selectedStudentId);
    const assignment = state.assignments.find((a) => a.id === selectedAssignmentId);
    
    doc.save(`${student?.name || "Leerling"} - ${assignment?.title || "Evaluatie"}.pdf`);
    showToast("PDF gegenereerd.");
}

function exportSelectedClass() {
    if (!selectedClassId || !selectedAssignmentId) {
        showToast("Selecteer eerst een klas en een opdracht.");
        return;
    }

    const classStudents = state.students.filter((s) => s.class_id === selectedClassId);
    const cls = state.classes.find((c) => c.id === selectedClassId);
    const assignment = state.assignments.find((a) => a.id === selectedAssignmentId);

    if (!classStudents.length) {
        showToast("Geen leerlingen gevonden in deze klas.");
        return;
    }

    let masterDoc = null;
    let evaluatedCount = 0;

    classStudents.forEach((student) => {
        const evaluation = getLatestEvaluation(student.id, selectedAssignmentId);
        if (!evaluation) return; // Sla leerlingen zonder evaluatie over

        evaluatedCount++;
        
        if (!masterDoc) {
            // Eerste pagina
            masterDoc = buildStudentPdf(evaluation);
        } else {
            // Volgende pagina's in dezelfde PDF
            masterDoc.addPage();
            buildStudentPdf(evaluation, masterDoc);
        }
    });

    if (!masterDoc || evaluatedCount === 0) {
        showToast("Geen ingevulde evaluaties gevonden voor deze klas.");
        return;
    }

    masterDoc.save(`Klas ${cls?.name || ""} - ${assignment?.title || "Evaluaties"}.pdf`);
    showToast(`PDF voor ${evaluatedCount} leerling(en) gegenereerd.`);
}

/**
 * Bouwt één pagina/evaluatie op in een jsPDF document.
 */
function buildStudentPdf(evaluation, existingDoc = null) {
    const assignment = state.assignments.find((a) => a.id === evaluation.assignment_id);
    const student = state.students.find((s) => s.id === evaluation.student_id);
    const cls = state.classes.find((c) => c.id === (student?.class_id || evaluation.class_id));

    if (!assignment || !student) {
        showToast("Fout bij het ophalen van gegevens voor PDF.");
        return null;
    }

    const { jsPDF } = window.jspdf;
    const doc = existingDoc || new jsPDF({ unit: "mm", format: "a4" });

    // Kleurenpalet
    const ACCENT_COLOR = [60, 156, 168];   // #3c9ca8
    const SECONDARY_COLOR = [71, 85, 105]; // Slate 600
    const BG_LIGHT = [248, 250, 252];      // Slate 50
    const BORDER_COLOR = [226, 232, 240]; // Slate 200
    const TEXT_MAIN = [15, 23, 42];       // Slate 900

    const marginX = 20;
    let currentY = 20;

    // 1. TITEL VAN DE OPDRACHT (Gewone hoofdletters/kleine letters zoals ingegeven)
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...ACCENT_COLOR);
    
    const splitTitle = doc.splitTextToSize(assignment.title, 170);
    doc.text(splitTitle, marginX, currentY);
    currentY += (splitTitle.length * 8) + 2;

    // 2. LEERLING & KLAS
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...ACCENT_COLOR);
    doc.text(`${student.name} (${cls ? cls.name : "Geen klas"})`, marginX, currentY);
    currentY += 8;

    // Scheidingslijn
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.5);
    doc.line(marginX, currentY, 190, currentY);
    currentY += 6;

    // 3. META-INFORMATIE (Datum, Leerkracht, Spreekduur)
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...ACCENT_COLOR);

    const evalDate = formatDate(evaluation.evaluation_date || evaluation.created_at);
    let metaText = `Datum: ${evalDate}   |   Leerkracht: dhr. J. Vermote`;
    
    if (timerSeconds > 0) {
        const mins = Math.floor(timerSeconds / 60);
        const secs = timerSeconds % 60;
        metaText += `   |   Spreekduur: ${mins}m ${secs}s`;
    }

    doc.text(metaText, marginX, currentY);
    currentY += 10;

    // 4. PARAMETERS / CRITERIA
    (assignment.parameters || []).forEach((param) => {
        const scoreData = evaluation.scores ? evaluation.scores[param.id] : null;

        const maxParamScore = param.levels && param.levels.length 
            ? Math.max(...param.levels.map((l) => Number(l.score))) 
            : 0;

        const achievedScoreText = scoreData ? `${scoreData.score} / ${maxParamScore}` : `— / ${maxParamScore}`;
        const explanationText = scoreData?.explanation || "Geen specifieke toelichting gegeven.";

        // Bereken benodigde hoogte voor de uitleg
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const splitExplanation = doc.splitTextToSize(explanationText, 162);
        
        // Compactere hoogte: basishoogte van 16mm + dynamische regels
        const boxHeight = Math.max(16, 10 + (splitExplanation.length * 4));

        // Achtergrondblok
        doc.setFillColor(...BG_LIGHT);
        doc.setDrawColor(...BORDER_COLOR);
        doc.roundedRect(marginX, currentY, 170, boxHeight, 2, 2, "FD");

        // Linker accentlijn
        doc.setFillColor(...ACCENT_COLOR);
        doc.rect(marginX, currentY, 1.5, boxHeight, "F");

        // Criterium Titel (Zonder nummering)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...TEXT_MAIN);
        doc.text(param.title, marginX + 4, currentY + 6);

        // Score per parameter (Groter & Duidelijker in accentkleur)
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...ACCENT_COLOR);
        doc.text(achievedScoreText, 185, currentY + 6, { align: "right" });

        // Uitleg / Beoordeling
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...SECONDARY_COLOR);
        doc.text(splitExplanation, marginX + 4, currentY + 12);

        currentY += boxHeight + 4; // Kortere afstand tussen de blokken
    });

    currentY += 4;

    // 5. FEEDBACK
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...ACCENT_COLOR);
    doc.text("Feedback & Opmerkingen", marginX, currentY);
    currentY += 6;

    const feedbackText = evaluation.feedback && evaluation.feedback.trim() !== "" 
        ? evaluation.feedback 
        : "Geen bijkomende opmerkingen.";

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_MAIN);

    const splitFeedback = doc.splitTextToSize(feedbackText, 170);
    doc.text(splitFeedback, marginX, currentY);
    
    currentY += (splitFeedback.length * 5) + 10;

    // 6. TOTAALSCORE
    const scoreObj = calculateEvaluationScore(evaluation, assignment);
    const totalScoreText = scoreObj ? `${scoreObj.total} / ${scoreObj.max}` : "—";

    doc.setFillColor(...ACCENT_COLOR);
    doc.roundedRect(marginX, currentY, 170, 13, 2, 2, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text("TOTAALSCORE", marginX + 6, currentY + 8.5);
    doc.text(totalScoreText, 184, currentY + 8.5, { align: "right" });

    return doc;
}
/* ============================================================
   ALLES RENDEREN & HELPERS
   ============================================================ */

function renderAll() {
    renderAssignments();
    renderClasses();
    renderEvaluationSelectors();
    renderEvaluationStudents();
    renderEvaluationForm();
    renderClassContent();
    renderClassScores();
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

/**
 * Haalt de familienaam op uit een volledige naam (alles vanaf het 2e woord).
 * Als er maar 1 woord is, gebruikt hij die naam.
 */
function getLastName(fullName) {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
}

/**
 * Sorteerfunctie voor leerlingen op basis van familienaam (en voornaam als secundaire sortering).
 */
function compareByLastName(a, b) {
    const lastNameA = getLastName(a.name);
    const lastNameB = getLastName(b.name);
    
    const lastNameCompare = lastNameA.localeCompare(lastNameB, undefined, { numeric: true, sensitivity: "base" });
    if (lastNameCompare !== 0) return lastNameCompare;
    
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}
