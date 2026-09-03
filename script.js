import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

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

/* ============================================================
   EVALUATIETOOL
   Atheneum Brugge

   Database: Firebase Firestore
   ============================================================ */


/* ============================================================
   CONSTANTEN
   ============================================================ */

const STORAGE_KEY =
    "atheneum_brugge_evaluatietool_v1";

const ACCENT =
    "#2a37b1";

const BG =
    "#f5f3f5";


/* ============================================================
   STATE
   ============================================================ */

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
let editingClassId = null;

let currentEvaluationId = null;
let isRetake = false;

let timerSeconds = 0;
let timerInterval = null;
let timerRunning = false;

let filterUnevaluated = false;

```javascript
/* ============================================================
   INITIALISATIE
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupNavigation();
        setupEvaluationEvents();
        setupAssignmentEvents();
        setupStudentEvents();

        /*
           Firebase is de primaire databron.
           We laden eerst de online database.
        */

        try {

            await loadFromFirebase();

            setConnectionStatus(true);

            renderAll();

            console.log(
                "Firebase succesvol geladen."
            );

        } catch (error) {

            console.error(
                "Firebase kon niet worden geladen:",
                error
            );

            /*
               Alleen wanneer Firebase niet bereikbaar is,
               gebruiken we de lokale gegevens als fallback.
            */

            loadLocalState();

            setConnectionStatus(false);

            renderAll();

            showToast(
                "Database kon niet worden geladen. Lokale gegevens worden gebruikt."
            );

        }

    }
);
```


/* ============================================================
   FIREBASE — GEGEVENS LADEN
   ============================================================ */

async function loadFromFirebase() {

    const collectionNames = [
        "assignments",
        "classes",
        "students",
        "evaluations"
    ];


    const results =
        await Promise.all(
            collectionNames.map(
                async collectionName => {

                    const snapshot =
                        await getDocs(
                            collection(
                                db,
                                collectionName
                            )
                        );

                    return {
                        name: collectionName,
                        data:
                            snapshot.docs.map(
                                document => ({
                                    id:
                                        document.id,
                                    ...document.data()
                                })
                            )
                    };

                }
            )
        );


    results.forEach(result => {

        state[result.name] =
            result.data;

    });


    saveLocalState();

}


/* ============================================================
   VERBINDINGSSTATUS
   ============================================================ */

function setConnectionStatus(
    online
) {

    const dot =
        document.getElementById(
            "connectionDot"
        );

    const text =
        document.getElementById(
            "connectionText"
        );

    if (!dot || !text) return;


    if (online) {

        dot.classList.add(
            "online"
        );

        text.textContent =
            "Online database";

    } else {

        dot.classList.remove(
            "online"
        );

        text.textContent =
            "Lokale modus";

    }

}


/* ============================================================
   LOCAL STORAGE
   ============================================================ */

function loadLocalState() {

    try {

        const raw =
            localStorage.getItem(
                STORAGE_KEY
            );

        if (!raw) return;


        const parsed =
            JSON.parse(raw);


        state = {

            assignments:
                parsed.assignments || [],

            classes:
                parsed.classes || [],

            students:
                parsed.students || [],

            evaluations:
                parsed.evaluations || []

        };

    } catch (error) {

        console.error(
            "Kon lokale gegevens niet laden:",
            error
        );

    }

}


function saveLocalState() {

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
    );

}


/* ============================================================
   DATABASE HELPERS — FIREBASE FIRESTORE
   ============================================================ */

function createId(
    prefix = ""
) {

    return (
        prefix +
        Date.now().toString(36) +
        Math.random()
            .toString(36)
            .substring(2, 8)
    );

}


/* ------------------------------------------------------------
   RECORD TOEVOEGEN
   ------------------------------------------------------------ */

async function dbInsert(
    collectionName,
    object
) {

    const id =
        object.id ||
        createId();


    const reference =
        doc(
            db,
            collectionName,
            id
        );


    const data = {
        ...object,
        id
    };


    await setDoc(
        reference,
        data
    );


    return data;

}


/* ------------------------------------------------------------
   RECORD AANPASSEN
   ------------------------------------------------------------ */

async function dbUpdate(
    collectionName,
    id,
    object
) {

    const reference =
        doc(
            db,
            collectionName,
            id
        );


    await updateDoc(
        reference,
        object
    );


    return {
        ...object,
        id
    };

}


/* ------------------------------------------------------------
   RECORD OPHALEN
   ------------------------------------------------------------ */

async function dbGet(
    collectionName,
    id
) {

    const reference =
        doc(
            db,
            collectionName,
            id
        );


    const snapshot =
        await getDoc(
            reference
        );


    if (!snapshot.exists()) {

        return null;

    }


    return {
        id: snapshot.id,
        ...snapshot.data()
    };

}


/* ------------------------------------------------------------
   ALLE RECORDS OPHALEN
   ------------------------------------------------------------ */

async function dbGetAll(
    collectionName
) {

    const snapshot =
        await getDocs(
            collection(
                db,
                collectionName
            )
        );


    return snapshot.docs.map(
        document => ({
            id: document.id,
            ...document.data()
        })
    );

}


/* ------------------------------------------------------------
   RECORD VERWIJDEREN
   ------------------------------------------------------------ */

async function dbDelete(
    collectionName,
    id
) {

    const reference =
        doc(
            db,
            collectionName,
            id
        );


    await deleteDoc(
        reference
    );

}


/* ============================================================
   NAVIGATIE
============================================================ */

function setupNavigation() {

    document.querySelectorAll(".nav-button").forEach(button => {

        button.addEventListener("click", () => {

            document
                .querySelectorAll(".nav-button")
                .forEach(btn =>
                    btn.classList.remove("active")
                );

            document
                .querySelectorAll(".page")
                .forEach(page =>
                    page.classList.remove("active-page")
                );

            button.classList.add("active");

            document
                .getElementById(button.dataset.page)
                .classList.add("active-page");

        });

    });

}


/* ============================================================
   EVALUATIE EVENTS
============================================================ */

function setupEvaluationEvents() {

    document
        .getElementById("evaluationAssignment")
        .addEventListener("change", event => {

            selectedAssignmentId = event.target.value || null;

            currentEvaluationId = null;
            isRetake = false;

            renderEvaluationStudents();
            renderEvaluationForm();

        });


    document
        .getElementById("evaluationClass")
        .addEventListener("change", event => {

            selectedClassId = event.target.value || null;

            selectedStudentId = null;

            renderEvaluationStudents();
            renderEvaluationForm();

        });


    document
        .getElementById("studentSearch")
        .addEventListener("input", () => {

            renderEvaluationStudents();

        });


    document
        .getElementById("filterUnevaluated")
        .addEventListener("click", event => {

            filterUnevaluated = !filterUnevaluated;

            event.currentTarget.classList.toggle(
                "active",
                filterUnevaluated
            );

            renderEvaluationStudents();

        });


    document
        .getElementById("retakeButton")
        .addEventListener("click", startRetake);


    document
        .getElementById("saveEvaluation")
        .addEventListener("click", saveEvaluation);


    document
        .getElementById("exportStudent")
        .addEventListener("click", exportSelectedStudent);


    document
        .getElementById("exportClass")
        .addEventListener("click", exportSelectedClass);


    document
        .getElementById("toggleHistory")
        .addEventListener("click", () => {

            document
                .getElementById("evaluationHistory")
                .classList.toggle("hidden");

        });


    document
        .getElementById("timerStart")
        .addEventListener("click", startTimer);


    document
        .getElementById("timerPause")
        .addEventListener("click", pauseTimer);


    document
        .getElementById("timerReset")
        .addEventListener("click", resetTimer);

}


/* ============================================================
   EVALUATIE RENDER
============================================================ */

function renderEvaluationSelectors() {

    const assignmentSelect =
        document.getElementById("evaluationAssignment");

    const classSelect =
        document.getElementById("evaluationClass");


    const currentAssignment = selectedAssignmentId;
    const currentClass = selectedClassId;


    assignmentSelect.innerHTML = `
        <option value="">Kies een opdracht...</option>
    `;

    state.assignments.forEach(assignment => {

        assignmentSelect.innerHTML += `
            <option value="${escapeHtml(assignment.id)}">
                ${escapeHtml(assignment.title)}
            </option>
        `;

    });


    classSelect.innerHTML = `
        <option value="">Kies een klas...</option>
    `;

    state.classes.forEach(cls => {

        classSelect.innerHTML += `
            <option value="${escapeHtml(cls.id)}">
                ${escapeHtml(cls.name)}
            </option>
        `;

    });


    if (currentAssignment) {
        assignmentSelect.value = currentAssignment;
    }

    if (currentClass) {
        classSelect.value = currentClass;
    }

}


function renderEvaluationStudents() {

    const container =
        document.getElementById("studentList");

    if (!selectedClassId) {

        container.innerHTML = `
            <div class="empty-state small">
                Kies eerst een klas.
            </div>
        `;

        return;

    }


    let students =
        state.students.filter(
            student => student.class_id === selectedClassId
        );


    const search =
        document
            .getElementById("studentSearch")
            .value
            .trim()
            .toLowerCase();


    if (search) {

        students = students.filter(student =>
            student.name.toLowerCase().includes(search)
        );

    }


    if (
        filterUnevaluated &&
        selectedAssignmentId
    ) {

        students = students.filter(student => {

            return !hasEvaluation(
                student.id,
                selectedAssignmentId
            );

        });

    }


    if (!students.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Geen leerlingen gevonden.
            </div>
        `;

        return;

    }


    container.innerHTML = students.map(student => {

        const evaluated =
            selectedAssignmentId &&
            hasEvaluation(
                student.id,
                selectedAssignmentId
            );


        const active =
            student.id === selectedStudentId;


        const retakeCount =
            getEvaluationHistory(
                student.id,
                selectedAssignmentId
            ).filter(
                evaluation => evaluation.attempt_number > 1
            ).length;


        return `
            <button
                class="student-item ${active ? "active" : ""}"
                data-student-id="${escapeHtml(student.id)}"
            >

                <span class="student-name">
                    ${escapeHtml(student.name)}
                </span>

                ${
                    evaluated
                        ? `<span class="student-check">✓</span>`
                        : ""
                }

                ${
                    retakeCount
                        ? `<span class="student-retake">
                            ${retakeCount}x herk.
                           </span>`
                        : ""
                }

            </button>
        `;

    }).join("");


    container
        .querySelectorAll(".student-item")
        .forEach(button => {

            button.addEventListener("click", () => {

                selectedStudentId =
                    button.dataset.studentId;

                currentEvaluationId = null;
                isRetake = false;

                resetTimer();

                renderEvaluationStudents();
                renderEvaluationForm();

            });

        });

}


function renderEvaluationForm() {

    const container =
        document.getElementById("evaluationFormContainer");

    const student =
        state.students.find(
            item => item.id === selectedStudentId
        );

    const assignment =
        state.assignments.find(
            item => item.id === selectedAssignmentId
        );


    const studentName =
        document.getElementById("selectedStudentName");

    const meta =
        document.getElementById("evaluationMeta");


    if (!student || !assignment) {

        studentName.textContent =
            "Geen leerling geselecteerd";

        meta.textContent =
            "Kies een opdracht, klas en leerling.";

        document.getElementById("totalScore").textContent = "—";

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">✓</div>
                <h3>Start een evaluatie</h3>
                <p>
                    Kies links een opdracht, klas en leerling
                    om het formulier te openen.
                </p>
            </div>
        `;

        renderHistory();

        return;

    }


    studentName.textContent =
        student.name;

    const cls =
        state.classes.find(
            item => item.id === student.class_id
        );

    meta.textContent =
        `${assignment.title} · ${cls ? cls.name : ""}`;


    let evaluation = null;


    if (currentEvaluationId) {

        evaluation =
            state.evaluations.find(
                item => item.id === currentEvaluationId
            );

    }


    if (!evaluation && !isRetake) {

        evaluation =
            getLatestEvaluation(
                selectedStudentId,
                selectedAssignmentId
            );

    }


    renderForm(
        assignment,
        evaluation
    );

    renderHistory();

}


function renderForm(assignment, evaluation) {

    const container =
        document.getElementById("evaluationFormContainer");


    const selectedScores =
        evaluation?.scores || {};


    const selectedComments =
        evaluation?.comments || [];


    let html = "";


    assignment.parameters.forEach((parameter, index) => {

        const selected =
            selectedScores[parameter.id];


        html += `
            <div
                class="parameter"
                data-parameter-id="${escapeHtml(parameter.id)}"
            >

                <div class="parameter-header">

                    <div>
                        <span class="parameter-number">
                            CRITERIUM ${String(index + 1).padStart(2, "0")}
                        </span>

                        <h3 class="parameter-title">
                            ${escapeHtml(parameter.title)}
                        </h3>
                    </div>

                    <div class="parameter-score"
                         data-score-for="${escapeHtml(parameter.id)}">
                        ${
                            selected
                                ? `Score: ${escapeHtml(String(selected.score))}`
                                : "Niet beoordeeld"
                        }
                    </div>

                </div>


                <div class="levels">

                    ${
                        parameter.levels.length
                            ? parameter.levels.map(level => {

                                const isSelected =
                                    selected &&
                                    selected.level_id === level.id;

                                return `
                                    <label
                                        class="level-card ${
                                            isSelected
                                                ? "selected"
                                                : ""
                                        }"
                                    >

                                        <input
                                            type="radio"
                                            name="parameter-${escapeHtml(parameter.id)}"
                                            value="${escapeHtml(level.id)}"
                                            data-parameter="${escapeHtml(parameter.id)}"
                                            data-score="${escapeHtml(String(level.score))}"
                                            ${
                                                isSelected
                                                    ? "checked"
                                                    : ""
                                            }
                                        >

                                        <div class="level-score">
                                            ${escapeHtml(String(level.score))}
                                        </div>

                                        <div class="level-explanation">
                                            ${escapeHtml(level.explanation)}
                                        </div>

                                    </label>
                                `;

                            }).join("")

                            : `
                                <div class="empty-state small">
                                    Deze parameter heeft nog geen niveaus.
                                </div>
                            `
                    }

                </div>

            </div>
        `;

    });


    html += `
        <div class="comment-section">

            <div class="parameter-header">

                <div>
                    <span class="section-label">
                        FEEDBACK
                    </span>

                    <h3 class="parameter-title">
                        Snelcommentaren
                    </h3>
                </div>

            </div>

            <div class="comment-buttons">

                ${
                    assignment.comments?.length
                        ? assignment.comments.map((comment, index) => {

                            const active =
                                selectedComments.includes(comment);

                            return `
                                <button
                                    type="button"
                                    class="comment-chip ${
                                        active ? "active" : ""
                                    }"
                                    data-comment-index="${index}"
                                >
                                    ${escapeHtml(comment)}
                                </button>
                            `;

                        }).join("")

                        : `
                            <span class="muted">
                                Geen standaardcommentaren ingesteld.
                            </span>
                        `
                }

            </div>


            <label class="feedback-label">
                Feedback
            </label>

            <textarea
                id="feedbackText"
                placeholder="Schrijf hier je feedback..."
            >${escapeHtml(evaluation?.feedback || "")}</textarea>

        </div>
    `;


    container.innerHTML = html;


    container
        .querySelectorAll(".level-card input")
        .forEach(input => {

            input.addEventListener("change", () => {

                container
                    .querySelectorAll(
                        `[name="${input.name}"]`
                    )
                    .forEach(other => {

                        other
                            .closest(".level-card")
                            .classList.remove("selected");

                    });


                input
                    .closest(".level-card")
                    .classList.add("selected");


                const scoreElement =
                    document.querySelector(
                        `[data-score-for="${input.dataset.parameter}"]`
                    );


                scoreElement.textContent =
                    `Score: ${input.dataset.score}`;


                updateTotalScore();

            });

        });


    container
        .querySelectorAll(".comment-chip")
        .forEach(button => {

            button.addEventListener("click", () => {

                const comment =
                    assignment.comments[
                        Number(button.dataset.commentIndex)
                    ];


                const textarea =
                    document.getElementById("feedbackText");


                button.classList.toggle("active");


                const selectedCommentsNow =
                    Array.from(
                        container.querySelectorAll(
                            ".comment-chip.active"
                        )
                    ).map(item =>
                        assignment.comments[
                            Number(item.dataset.commentIndex)
                        ]
                    );


                textarea.value =
                    selectedCommentsNow.join(" ") +
                    (
                        selectedCommentsNow.length &&
                        textarea.value &&
                        !selectedCommentsNow.some(
                            item => textarea.value === item
                        )
                            ? " " + textarea.value
                            : ""
                    );

            });

        });


    updateTotalScore();

}


function updateTotalScore() {

    const assignment =
        state.assignments.find(
            item => item.id === selectedAssignmentId
        );

    if (!assignment) return;

    const totalElement =
        document.getElementById("totalScore");

    let totalScore = 0;
    let maxScore = 0;
    let evaluatedCount = 0;

    /*
       Elk criterium (.parameter) telt even zwaar.

       De behaalde score komt van het geselecteerde niveau.
       De maximumscore komt van het hoogste niveau binnen
       dat criterium.
    */

    document
        .querySelectorAll(
            "#evaluationFormContainer .parameter"
        )
        .forEach(parameter => {

            const inputs =
                parameter.querySelectorAll(
                    'input[type="radio"]'
                );

            if (!inputs.length) return;

            let criterionMax = 0;

            inputs.forEach(input => {

                const score =
                    Number(input.dataset.score);

                if (!Number.isNaN(score)) {

                    criterionMax =
                        Math.max(
                            criterionMax,
                            score
                        );

                }

            });

            maxScore += criterionMax;


            const selected =
                parameter.querySelector(
                    'input[type="radio"]:checked'
                );

            if (selected) {

                const score =
                    Number(selected.dataset.score);

                if (!Number.isNaN(score)) {

                    totalScore += score;
                    evaluatedCount++;

                }

            }

        });


    /*
       Nog geen enkele beoordeling:
       toon 0 / maximumscore.
    */

    if (evaluatedCount === 0) {

        totalElement.textContent =
            `0 / ${maxScore}`;

        return;

    }


    /*
       Absolute eindscore:
       behaalde punten / maximaal haalbare punten
    */

    totalElement.textContent =
        `${totalScore} / ${maxScore}`;

}
function collectFormData() {

    const assignment =
        state.assignments.find(
            item => item.id === selectedAssignmentId
        );


    const scores = {};


    if (assignment) {

        assignment.parameters.forEach(parameter => {

            const input =
                document.querySelector(
                    `input[name="parameter-${parameter.id}"]:checked`
                );


            if (!input) return;


            const level =
                parameter.levels.find(
                    item => item.id === input.value
                );


            if (!level) return;


            scores[parameter.id] = {

                level_id: level.id,
                score: Number(level.score),
                level_title: level.title || "",
                explanation: level.explanation

            };

        });

    }


    const comments =
        Array.from(
            document.querySelectorAll(
                ".comment-chip.active"
            )
        ).map(button => {

            return assignment.comments[
                Number(button.dataset.commentIndex)
            ];

        });


    return {

        scores,

        comments,

        feedback:
            document.getElementById("feedbackText")?.value || "",

        duration_seconds:
            timerSeconds

    };

}


/* ============================================================
   EVALUATIE OPSLAAN
============================================================ */

async function saveEvaluation() {

    if (
        !selectedAssignmentId ||
        !selectedStudentId
    ) {

        showToast(
            "Selecteer eerst een opdracht en een leerling."
        );

        return;

    }


    const data =
        collectFormData();


    if (!Object.keys(data.scores).length) {

        showToast(
            "Selecteer minstens één niveau."
        );

        return;

    }


    const previous =
        getEvaluationHistory(
            selectedStudentId,
            selectedAssignmentId
        );


    const nextAttempt =
        previous.length
            ? Math.max(
                ...previous.map(
                    item => item.attempt_number || 1
                )
            ) + (isRetake ? 1 : 0)
            : 1;


    /*
       Wanneer een bestaand formulier wordt geopend en opnieuw
       gewoon wordt opgeslagen, wordt het bestaande record
       aangepast.

       Bij Herkansing wordt een nieuwe evaluatie aangemaakt.
    */

    try {

        if (
            currentEvaluationId &&
            !isRetake
        ) {

            const updated = {

                assignment_id:
                    selectedAssignmentId,

                student_id:
                    selectedStudentId,

                class_id:
                    selectedClassId,

                scores:
                    data.scores,

                comments:
                    data.comments,

                feedback:
                    data.feedback,

                duration_seconds:
                    data.duration_seconds,

                updated_at:
                    new Date().toISOString()

            };


            const result =
                await dbUpdate(
                    "evaluations",
                    currentEvaluationId,
                    updated
                );


            const index =
                state.evaluations.findIndex(
                    item =>
                        item.id === currentEvaluationId
                );


            if (index >= 0) {

                state.evaluations[index] = {
                    ...state.evaluations[index],
                    ...result
                };

            }

        } else {

            const newEvaluation = {

                id:
                    createId("evaluation_"),

                assignment_id:
                    selectedAssignmentId,

                student_id:
                    selectedStudentId,

                class_id:
                    selectedClassId,

                scores:
                    data.scores,

                comments:
                    data.comments,

                feedback:
                    data.feedback,

                duration_seconds:
                    data.duration_seconds,

                attempt_number:
                    isRetake
                        ? nextAttempt
                        : 1,

                evaluation_date:
                    new Date().toISOString(),

                created_at:
                    new Date().toISOString(),

                updated_at:
                    new Date().toISOString()

            };


            const result =
                await dbInsert(
                    "evaluations",
                    newEvaluation
                );


            state.evaluations.push(
                result
            );

            currentEvaluationId =
                result.id;

        }


        saveLocalState();


        isRetake = false;


        renderEvaluationStudents();
        renderEvaluationForm();

        showToast(
            "Evaluatie opgeslagen."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Opslaan mislukt: " +
            (error.message || "onbekende fout")
        );

    }

}


/* ============================================================
   HERKANSING
============================================================ */

function startRetake() {

    if (
        !selectedStudentId ||
        !selectedAssignmentId
    ) {

        showToast(
            "Selecteer eerst een leerling."
        );

        return;

    }


    isRetake = true;
    currentEvaluationId = null;

    resetTimer();

    renderEvaluationForm();

    showToast(
        "Nieuwe herkansing gestart."
    );

}


/* ============================================================
   EVALUATIEGESCHIEDENIS
============================================================ */

function getEvaluationHistory(
    studentId,
    assignmentId
) {

    return state.evaluations
        .filter(evaluation =>

            evaluation.student_id === studentId &&
            evaluation.assignment_id === assignmentId

        )
        .sort(
            (a, b) =>
                new Date(b.created_at || b.evaluation_date) -
                new Date(a.created_at || a.evaluation_date)
        );

}


function getLatestEvaluation(
    studentId,
    assignmentId
) {

    return getEvaluationHistory(
        studentId,
        assignmentId
    )[0] || null;

}


function hasEvaluation(
    studentId,
    assignmentId
) {

    return Boolean(
        getLatestEvaluation(
            studentId,
            assignmentId
        )
    );

}


```javascript
function calculateEvaluationScore(
    evaluation,
    assignment
) {

    if (
        !evaluation ||
        !assignment ||
        !evaluation.scores
    ) {
        return null;
    }

    let totalScore = 0;
    let maxScore = 0;
    let evaluatedCount = 0;

    assignment.parameters.forEach(parameter => {

        /*
           Bepaal de hoogste score die binnen dit
           criterium mogelijk is.
        */

        const criterionMax =
            parameter.levels && parameter.levels.length
                ? Math.max(
                    ...parameter.levels.map(level =>
                        Number(level.score)
                    )
                )
                : 0;

        maxScore += criterionMax;


        /*
           Kijk of dit criterium beoordeeld is.
        */

        const selected =
            evaluation.scores[parameter.id];

        if (
            selected &&
            typeof selected.score === "number"
        ) {

            totalScore += selected.score;
            evaluatedCount++;

        }

    });


    /*
       Geen enkele score ingevuld.
    */

    if (evaluatedCount === 0) {
        return null;
    }


    /*
       Geef de absolute score terug.
       Bijvoorbeeld: 9 / 12
    */

    return {
        total: totalScore,
        max: maxScore,
        evaluated: evaluatedCount,
        totalCriteria: assignment.parameters.length
    };

}
```



function renderHistory() {

    const container =
        document.getElementById(
            "evaluationHistory"
        );


    if (
        !selectedStudentId ||
        !selectedAssignmentId
    ) {

        container.innerHTML = `
            <div class="empty-state small">
                Selecteer een leerling.
            </div>
        `;

        return;

    }


    const history =
        getEvaluationHistory(
            selectedStudentId,
            selectedAssignmentId
        );


    const assignment =
        state.assignments.find(
            item => item.id === selectedAssignmentId
        );


    if (!history.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Nog geen eerdere evaluaties.
            </div>
        `;

        return;

    }


    container.innerHTML =
        history.map(evaluation => {

            const score =
                calculateEvaluationScore(
                    evaluation,
                    assignment
                );


            const date =
                formatDate(
                    evaluation.evaluation_date ||
                    evaluation.created_at
                );


            return `
                <div class="history-item">

                    <div class="history-date">
                        <strong>
                            ${date}
                        </strong>

                        <div class="history-attempt">
                            ${
                                evaluation.attempt_number > 1
                                    ? "Herkansing"
                                    : "Eerste evaluatie"
                            }
                        </div>
                    </div>

                    <div class="history-score">
                       ${
    score === null
        ? "—"
        : `${score.total} / ${score.max}`
}
                        }
                    </div>

                    <div class="history-actions">

                        <button
                            data-history-edit="${escapeHtml(evaluation.id)}"
                        >
                            Bewerken
                        </button>

                        <button
                            data-history-delete="${escapeHtml(evaluation.id)}"
                        >
                            Verwijderen
                        </button>

                    </div>

                </div>
            `;

        }).join("");


    container
        .querySelectorAll(
            "[data-history-edit]"
        )
        .forEach(button => {

            button.addEventListener("click", () => {

                currentEvaluationId =
                    button.dataset.historyEdit;

                isRetake = false;

                renderEvaluationForm();

            });

        });


    container
        .querySelectorAll(
            "[data-history-delete]"
        )
        .forEach(button => {

            button.addEventListener("click", async () => {

                const evaluation =
                    state.evaluations.find(
                        item =>
                            item.id ===
                            button.dataset.historyDelete
                    );


                if (!evaluation) return;


                if (
                    !confirm(
                        "Deze evaluatie definitief verwijderen?"
                    )
                ) return;


                try {

                    await dbDelete(
                        "evaluations",
                        evaluation.id
                    );


                    state.evaluations =
                        state.evaluations.filter(
                            item =>
                                item.id !== evaluation.id
                        );


                    if (
                        currentEvaluationId ===
                        evaluation.id
                    ) {

                        currentEvaluationId = null;

                    }


                    saveLocalState();

                    renderEvaluationStudents();
                    renderEvaluationForm();

                    showToast(
                        "Evaluatie verwijderd."
                    );

                } catch (error) {

                    console.error(error);

                    showToast(
                        "Verwijderen mislukt."
                    );

                }

            });

        });

}


/* ============================================================
   TIMER
============================================================ */

function updateTimerDisplay() {

    const minutes =
        Math.floor(timerSeconds / 60)
            .toString()
            .padStart(2, "0");

    const seconds =
        (timerSeconds % 60)
            .toString()
            .padStart(2, "0");


    document.getElementById(
        "timerDisplay"
    ).textContent =
        `${minutes}:${seconds}`;

}


function startTimer() {

    if (timerRunning) return;

    timerRunning = true;

    timerInterval =
        setInterval(() => {

            timerSeconds++;

            updateTimerDisplay();

        }, 1000);

}


function pauseTimer() {

    timerRunning = false;

    clearInterval(
        timerInterval
    );

}


function resetTimer() {

    pauseTimer();

    timerSeconds = 0;

    updateTimerDisplay();

}


/* ============================================================
   OPDRACHTEN EVENTS
============================================================ */

function setupAssignmentEvents() {

    document
        .getElementById("newAssignment")
        .addEventListener(
            "click",
            createNewAssignment
        );


    document
        .getElementById("addComment")
        .addEventListener(
            "click",
            addCommentField
        );


    document
        .getElementById("addParameter")
        .addEventListener(
            "click",
            addParameter
        );


    document
        .getElementById("saveAssignment")
        .addEventListener(
            "click",
            saveAssignment
        );


    document
        .getElementById("duplicateAssignment")
        .addEventListener(
            "click",
            duplicateAssignment
        );


    document
        .getElementById("deleteAssignment")
        .addEventListener(
            "click",
            deleteAssignment
        );

}


/* ============================================================
   OPDRACHTEN
============================================================ */

function createNewAssignment() {

    const assignment = {

        id:
            createId("assignment_"),

        title:
            "Nieuwe opdracht",

        comments:
            [],

        parameters:
            [

                {

                    id:
                        createId("parameter_"),

                    title:
                        "Parameter 1",

                    levels:
                        [

                            {
                                id:
                                    createId("level_"),

                                score:
                                    4,

                                title:
                                    "",

                                explanation:
                                    "Uitstekend"

                            },

                            {
                                id:
                                    createId("level_"),

                                score:
                                    3,

                                title:
                                    "",

                                explanation:
                                    "Goed"

                            },

                            {
                                id:
                                    createId("level_"),

                                score:
                                    2,

                                title:
                                    "",

                                explanation:
                                    "Onvoldoende"

                            },

                            {
                                id:
                                    createId("level_"),

                                score:
                                    1,

                                title:
                                    "",

                                explanation:
                                    "Zeer onvoldoende"

                            }

                        ]

                }

            ]

    };


    state.assignments.push(
        assignment
    );


    editingAssignmentId =
        assignment.id;


    renderAssignments();

    openAssignmentEditor();

}


/* ============================================================
   OPDRACHT EDITOR
============================================================ */

function openAssignmentEditor() {

    const assignment =
        state.assignments.find(
            item =>
                item.id === editingAssignmentId
        );


    if (!assignment) return;


    document
        .getElementById("assignmentEditorEmpty")
        .classList.add("hidden");


    document
        .getElementById("assignmentEditor")
        .classList.remove("hidden");


    document
        .getElementById("assignmentTitle")
        .value =
            assignment.title || "";


    renderCommentsBuilder(
        assignment
    );

    renderParametersBuilder(
        assignment
    );

}


function renderCommentsBuilder(
    assignment
) {

    const container =
        document.getElementById(
            "commentsBuilder"
        );


    container.innerHTML =
        assignment.comments.map(
            (comment, index) => `

                <div class="comment-builder">

                    <input
                        type="text"
                        value="${escapeHtml(comment)}"
                        data-comment="${index}"
                        placeholder="Standaardcommentaar..."
                    >

                    <button
                        class="icon-button"
                        type="button"
                        data-delete-comment="${index}"
                    >
                        ×
                    </button>

                </div>

            `
        ).join("");


    container
        .querySelectorAll(
            "[data-comment]"
        )
        .forEach(input => {

            input.addEventListener(
                "input",
                () => {

                    assignment.comments[
                        Number(input.dataset.comment)
                    ] =
                        input.value;

                }
            );

        });


    container
        .querySelectorAll(
            "[data-delete-comment]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    assignment.comments.splice(
                        Number(
                            button.dataset.deleteComment
                        ),
                        1
                    );

                    renderCommentsBuilder(
                        assignment
                    );

                }
            );

        });

}


function addCommentField() {

    const assignment =
        getEditingAssignment();

    if (!assignment) return;

    assignment.comments.push(
        "Nieuw standaardcommentaar"
    );

    renderCommentsBuilder(
        assignment
    );

}


function renderParametersBuilder(
    assignment
) {

    const container =
        document.getElementById(
            "parametersBuilder"
        );


    container.innerHTML =
        assignment.parameters.map(
            (parameter, parameterIndex) => {

                return `

                    <div
                        class="parameter-builder"
                        data-parameter="${escapeHtml(parameter.id)}"
                    >

                        <div class="parameter-builder-header">

                            <span class="parameter-drag">
                                ☷
                            </span>

                            <input
                                class="parameter-title-input"
                                value="${escapeHtml(parameter.title)}"
                                data-parameter-title="${parameterIndex}"
                            >

                            <div class="move-buttons">

                                <button
                                    class="move-button"
                                    data-param-up="${parameterIndex}"
                                    type="button"
                                >
                                    ↑
                                </button>

                                <button
                                    class="move-button"
                                    data-param-down="${parameterIndex}"
                                    type="button"
                                >
                                    ↓
                                </button>

                            </div>

                            <button
                                class="icon-button"
                                data-delete-parameter="${parameterIndex}"
                                type="button"
                            >
                                ×
                            </button>

                        </div>


                        <div class="level-builder-list">

                            ${
                                parameter.levels.map(
                                    (level, levelIndex) => `

                                        <div class="level-builder">

                                            <input
                                                type="number"
                                                step="0.01"
                                                value="${escapeHtml(String(level.score))}"
                                                data-level-score="${parameterIndex},${levelIndex}"
                                            >

                                            <textarea
                                                data-level-explanation="${parameterIndex},${levelIndex}"
                                                placeholder="Uitleg van dit niveau..."
                                            >${escapeHtml(level.explanation)}</textarea>

                                            <button
                                                class="icon-button"
                                                data-delete-level="${parameterIndex},${levelIndex}"
                                                type="button"
                                            >
                                                ×
                                            </button>

                                        </div>

                                    `
                                ).join("")
                            }

                            <button
                                class="small-primary"
                                data-add-level="${parameterIndex}"
                                type="button"
                            >
                                + Niveau
                            </button>

                        </div>


                        <div class="parameter-footer">

                            <div class="muted">
                                ${parameter.levels.length}
                                niveau${parameter.levels.length === 1 ? "" : "s"}
                            </div>

                        </div>

                    </div>

                `;

            }
        ).join("");


    /* parameter titles */

    container
        .querySelectorAll(
            "[data-parameter-title]"
        )
        .forEach(input => {

            input.addEventListener(
                "input",
                () => {

                    assignment.parameters[
                        Number(input.dataset.parameterTitle)
                    ].title =
                        input.value;

                }
            );

        });


    /* score */

    container
        .querySelectorAll(
            "[data-level-score]"
        )
        .forEach(input => {

            input.addEventListener(
                "input",
                () => {

                    const [
                        p,
                        l
                    ] =
                        input.dataset.levelScore
                            .split(",")
                            .map(Number);


                    assignment.parameters[p]
                        .levels[l]
                        .score =
                            Number(input.value);

                }
            );

        });


    /* explanation */

    container
        .querySelectorAll(
            "[data-level-explanation]"
        )
        .forEach(input => {

            input.addEventListener(
                "input",
                () => {

                    const [
                        p,
                        l
                    ] =
                        input.dataset.levelExplanation
                            .split(",")
                            .map(Number);


                    assignment.parameters[p]
                        .levels[l]
                        .explanation =
                            input.value;

                }
            );

        });


    /* add level */

    container
        .querySelectorAll(
            "[data-add-level]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const parameter =
                        assignment.parameters[
                            Number(
                                button.dataset.addLevel
                            )
                        ];


                    parameter.levels.push({

                        id:
                            createId("level_"),

                        score:
                            parameter.levels.length + 1,

                        title:
                            "",

                        explanation:
                            "Nieuw niveau"

                    });


                    renderParametersBuilder(
                        assignment
                    );

                }
            );

        });


    /* delete level */

    container
        .querySelectorAll(
            "[data-delete-level]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const [
                        p,
                        l
                    ] =
                        button.dataset.deleteLevel
                            .split(",")
                            .map(Number);


                    assignment.parameters[p]
                        .levels.splice(l, 1);


                    renderParametersBuilder(
                        assignment
                    );

                }
            );

        });


    /* delete parameter */

    container
        .querySelectorAll(
            "[data-delete-parameter]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.deleteParameter
                        );


                    assignment.parameters
                        .splice(index, 1);


                    renderParametersBuilder(
                        assignment
                    );

                }
            );

        });


    /* move parameter up */

    container
        .querySelectorAll(
            "[data-param-up]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.paramUp
                        );


                    if (index <= 0) return;


                    const arr =
                        assignment.parameters;


                    [
                        arr[index - 1],
                        arr[index]
                    ] =
                    [
                        arr[index],
                        arr[index - 1]
                    ];


                    renderParametersBuilder(
                        assignment
                    );

                }
            );

        });


    /* move parameter down */

    container
        .querySelectorAll(
            "[data-param-down]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const index =
                        Number(
                            button.dataset.paramDown
                        );


                    const arr =
                        assignment.parameters;


                    if (
                        index >= arr.length - 1
                    ) return;


                    [
                        arr[index],
                        arr[index + 1]
                    ] =
                    [
                        arr[index + 1],
                        arr[index]
                    ];


                    renderParametersBuilder(
                        assignment
                    );

                }
            );

        });

}


function addParameter() {

    const assignment =
        getEditingAssignment();

    if (!assignment) return;


    assignment.parameters.push({

        id:
            createId("parameter_"),

        title:
            `Parameter ${assignment.parameters.length + 1}`,

        levels:
            [

                {
                    id:
                        createId("level_"),

                    score:
                        4,

                    title:
                        "",

                    explanation:
                        "Nieuw niveau"

                }

            ]

    });


    renderParametersBuilder(
        assignment
    );

}


function getEditingAssignment() {

    return state.assignments.find(
        item =>
            item.id === editingAssignmentId
    );

}


async function saveAssignment() {

    const assignment = getEditingAssignment();

    if (!assignment) return;

    const title = document
        .getElementById("assignmentTitle")
        .value
        .trim();

    if (!title) {
        showToast("Geef de opdracht een titel.");
        return;
    }

    assignment.title = title;

    assignment.parameters =
        assignment.parameters.filter(
            parameter => parameter.title.trim()
        );

    const data = {
        title: assignment.title,
        comments: assignment.comments || [],
        parameters: assignment.parameters || [],
        updated_at: new Date().toISOString()
    };

    try {

        // Bestaat de opdracht al in Firestore?
        const assignmentRef = doc(
            db,
            "assignments",
            assignment.id
        );

        const existingDoc =
            await getDoc(assignmentRef);

        if (existingDoc.exists()) {

            await updateDoc(
                assignmentRef,
                data
            );

        } else {

            await setDoc(
                assignmentRef,
                {
                    ...data,
                    id: assignment.id,
                    created_at:
                        assignment.created_at ||
                        new Date().toISOString()
                }
            );

        }

        // Lokale state bijwerken
        const index =
            state.assignments.findIndex(
                item =>
                    item.id === assignment.id
            );

        if (index >= 0) {

            state.assignments[index] = {
                ...state.assignments[index],
                ...data,
                id: assignment.id
            };

        } else {

            state.assignments.push({
                ...assignment,
                ...data
            });

        }

        saveLocalState();

        selectedAssignmentId =
            assignment.id;

        renderAll();

        openAssignmentEditor();

        showToast(
            "Opdracht opgeslagen."
        );

    } catch (error) {

        console.error(
            "Firebase fout bij opslaan opdracht:",
            error
        );

        showToast(
            "Opdracht kon niet worden opgeslagen: " +
            (error.message || "onbekende fout")
        );

    }

}

async function duplicateAssignment() {

    const assignment =
        getEditingAssignment();

    if (!assignment) return;


    const copy =
        JSON.parse(
            JSON.stringify(assignment)
        );


    copy.id =
        createId("assignment_");


    copy.title +=
        " – kopie";


    copy.parameters =
        copy.parameters.map(parameter => {

            parameter.id =
                createId("parameter_");

            parameter.levels =
                parameter.levels.map(level => {

                    level.id =
                        createId("level_");

                    return level;

                });

            return parameter;

        });


    try {

        const result =
            await dbInsert(
                "assignments",
                {

                    id:
                        copy.id,

                    title:
                        copy.title,

                    comments:
                        copy.comments,

                    parameters:
                        copy.parameters,

                    created_at:
                        new Date().toISOString(),

                    updated_at:
                        new Date().toISOString()

                }
            );


        state.assignments.push(
            result
        );


        editingAssignmentId =
            result.id;


        saveLocalState();

        renderAssignments();
        openAssignmentEditor();

        showToast(
            "Opdracht gekopieerd."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Kopiëren mislukt."
        );

    }

}


async function deleteAssignment() {

    const assignment =
        getEditingAssignment();

    if (!assignment) return;


    if (
        !confirm(
            `Opdracht "${assignment.title}" verwijderen?`
        )
    ) return;


    try {

        await dbDelete(
            "assignments",
            assignment.id
        );


        state.assignments =
            state.assignments.filter(
                item =>
                    item.id !== assignment.id
            );


        state.evaluations =
            state.evaluations.filter(
                item =>
                    item.assignment_id !==
                    assignment.id
            );


        editingAssignmentId = null;


        saveLocalState();

        renderAssignments();
        renderEvaluationSelectors();
        renderEvaluationStudents();
        renderEvaluationForm();


        document
            .getElementById("assignmentEditor")
            .classList.add("hidden");


        document
            .getElementById("assignmentEditorEmpty")
            .classList.remove("hidden");


        showToast(
            "Opdracht verwijderd."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Verwijderen mislukt."
        );

    }

}


function renderAssignments() {

    const container =
        document.getElementById(
            "assignmentList"
        );


    if (!state.assignments.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Nog geen opdrachten.
            </div>
        `;

        return;

    }


    container.innerHTML =
        state.assignments.map(
            assignment => {

                const active =
                    assignment.id ===
                    editingAssignmentId;


                return `
                    <div
                        class="assignment-item ${
                            active ? "active" : ""
                        }"
                        data-assignment-id="${escapeHtml(assignment.id)}"
                    >

                        <div class="assignment-item-main">

                            <div class="assignment-item-title">
                                ${escapeHtml(assignment.title)}
                            </div>

                            <div class="assignment-item-meta">
                                ${assignment.parameters.length}
                                criteria ·
                                ${assignment.comments.length}
                                commentaren
                            </div>

                        </div>

                    </div>
                `;

            }
        ).join("");


    container
        .querySelectorAll(
            "[data-assignment-id]"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    editingAssignmentId =
                        item.dataset.assignmentId;

                    renderAssignments();
                    openAssignmentEditor();

                }
            );

        });

}


/* ============================================================
   LEERLINGEN EVENTS
============================================================ */

function setupStudentEvents() {

    document
        .getElementById("newClass")
        .addEventListener(
            "click",
            createClass
        );


    document
        .getElementById("addStudent")
        .addEventListener(
            "click",
            addStudent
        );


    document
        .getElementById("editClass")
        .addEventListener(
            "click",
            editClass
        );


    document
        .getElementById("deleteClass")
        .addEventListener(
            "click",
            deleteClass
        );


    document
        .getElementById("saveStudentClass")
        .addEventListener(
            "click",
            saveStudentClass
        );


    document
        .getElementById("closeStudentDetail")
        .addEventListener(
            "click",
            () => {

                document
                    .getElementById("studentDetail")
                    .classList.add("hidden");

            }
        );


    document
        .querySelectorAll(".class-tab")
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(".class-tab")
                        .forEach(item =>
                            item.classList.remove("active")
                        );


                    document
                        .querySelectorAll(".class-tab-content")
                        .forEach(item =>
                            item.classList.add("hidden")
                        );


                    button.classList.add("active");


                    document
                        .getElementById(
                            button.dataset.classTab
                        )
                        .classList.remove("hidden");

                }
            );

        });

}


/* ============================================================
   KLASSEN
============================================================ */

async function createClass() {

    const name =
        prompt(
            "Naam van de nieuwe klas:"
        );


    if (!name?.trim()) return;


    const cls = {

        id:
            createId("class_"),

        name:
            name.trim(),

        created_at:
            new Date().toISOString(),

        updated_at:
            new Date().toISOString()

    };


    try {

        const result =
            await dbInsert(
                "classes",
                cls
            );


        state.classes.push(
            result
        );


        selectedClassId =
            result.id;


        saveLocalState();

        renderClasses();
        renderClassContent();

        renderEvaluationSelectors();

        showToast(
            "Klas aangemaakt."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Klas kon niet worden aangemaakt."
        );

    }

}


function renderClasses() {

    const container =
        document.getElementById(
            "classList"
        );


    if (!state.classes.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Nog geen klassen.
            </div>
        `;

        return;

    }


    container.innerHTML =
        state.classes.map(cls => {

            const count =
                state.students.filter(
                    student =>
                        student.class_id === cls.id
                ).length;


            return `
                <div
                    class="class-item ${
                        cls.id === selectedClassId
                            ? "active"
                            : ""
                    }"
                    data-class-id="${escapeHtml(cls.id)}"
                >

                    <div class="class-item-name">
                        ${escapeHtml(cls.name)}
                    </div>

                    <div class="class-item-count">
                        ${count}
                    </div>

                </div>
            `;

        }).join("");


    container
        .querySelectorAll(
            "[data-class-id]"
        )
        .forEach(item => {

            item.addEventListener(
                "click",
                () => {

                    selectedClassId =
                        item.dataset.classId;

                    renderClasses();
                    renderClassContent();

                    renderEvaluationSelectors();
                    renderEvaluationStudents();

                }
            );

        });

}


function renderClassContent() {

    const empty =
        document.getElementById(
            "classEmpty"
        );

    const content =
        document.getElementById(
            "classContent"
        );


    const cls =
        state.classes.find(
            item =>
                item.id === selectedClassId
        );


    if (!cls) {

        empty.classList.remove("hidden");
        content.classList.add("hidden");

        return;

    }


    empty.classList.add("hidden");
    content.classList.remove("hidden");


    document.getElementById(
        "classTitle"
    ).textContent =
        cls.name;


    const students =
        state.students.filter(
            student =>
                student.class_id === cls.id
        );


    document.getElementById(
        "classStudentCount"
    ).textContent =
        students.length;


    document.getElementById(
        "classEvaluationCount"
    ).textContent =
        state.evaluations.filter(
            evaluation =>
                evaluation.class_id === cls.id
        ).length;


    renderStudentsTable(
        students
    );

    renderClassScores(
        cls,
        students
    );

}


function renderStudentsTable(
    students
) {

    const container =
        document.getElementById(
            "studentsTable"
        );


    if (!students.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Voeg je eerste leerling toe.
            </div>
        `;

        return;

    }


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

                ${
                    students.map(student => {

                        const evaluations =
                            state.evaluations.filter(
                                evaluation =>
                                    evaluation.student_id ===
                                    student.id
                            ).length;


                        return `

                            <tr>

                                <td>
                                    <strong>
                                        ${escapeHtml(student.name)}
                                    </strong>
                                </td>

                                <td>
                                    ${evaluations}
                                </td>

                                <td>

                                    <div class="table-actions">

                                        <button
                                            class="table-action"
                                            data-student-detail="${escapeHtml(student.id)}"
                                        >
                                            Bekijken
                                        </button>

                                        <button
                                            class="table-action"
                                            data-delete-student="${escapeHtml(student.id)}"
                                        >
                                            Verwijderen
                                        </button>

                                    </div>

                                </td>

                            </tr>

                        `;

                    }).join("")
                }

            </tbody>

        </table>

    `;


    container
        .querySelectorAll(
            "[data-student-detail]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    openStudentDetail(
                        button.dataset.studentDetail
                    );

                }
            );

        });


    container
        .querySelectorAll(
            "[data-delete-student]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    const student =
                        state.students.find(
                            item =>
                                item.id ===
                                button.dataset.deleteStudent
                        );


                    if (!student) return;


                    if (
                        !confirm(
                            `${student.name} verwijderen?`
                        )
                    ) return;


                    try {

                        await dbDelete(
                            "students",
                            student.id
                        );


                        state.students =
                            state.students.filter(
                                item =>
                                    item.id !==
                                    student.id
                            );


                        state.evaluations =
                            state.evaluations.filter(
                                item =>
                                    item.student_id !==
                                    student.id
                            );


                        saveLocalState();

                        renderAll();

                        showToast(
                            "Leerling verwijderd."
                        );

                    } catch (error) {

                        console.error(error);

                        showToast(
                            "Verwijderen mislukt."
                        );

                    }

                }
            );

        });

}


async function addStudent() {

    if (!selectedClassId) {

        showToast(
            "Selecteer eerst een klas."
        );

        return;

    }


    const input =
        document.getElementById(
            "newStudentName"
        );


    const name =
        input.value.trim();


    if (!name) {

        showToast(
            "Vul een naam in."
        );

        return;

    }


    const student = {

        id:
            createId("student_"),

        name,

        class_id:
            selectedClassId,

        created_at:
            new Date().toISOString(),

        updated_at:
            new Date().toISOString()

    };


    try {

        const result =
            await dbInsert(
                "students",
                student
            );


        state.students.push(
            result
        );


        input.value = "";

        saveLocalState();

        renderClasses();
        renderClassContent();

        renderEvaluationStudents();

        showToast(
            "Leerling toegevoegd."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Leerling kon niet worden toegevoegd."
        );

    }

}


/* ============================================================
   KLAS BEWERKEN
============================================================ */

async function editClass() {

    const cls =
        state.classes.find(
            item =>
                item.id === selectedClassId
        );


    if (!cls) return;


    const name =
        prompt(
            "Nieuwe naam:",
            cls.name
        );


    if (!name?.trim()) return;


    try {

        const updated =
            await dbUpdate(
                "classes",
                cls.id,
                {

                    name:
                        name.trim(),

                    updated_at:
                        new Date().toISOString()

                }
            );


        Object.assign(
            cls,
            updated
        );


        saveLocalState();

        renderClasses();
        renderClassContent();
        renderEvaluationSelectors();

        showToast(
            "Klas aangepast."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Klas kon niet worden aangepast."
        );

    }

}


async function deleteClass() {

    const cls =
        state.classes.find(
            item =>
                item.id === selectedClassId
        );


    if (!cls) return;


    const students =
        state.students.filter(
            student =>
                student.class_id === cls.id
        );


    if (
        !confirm(
            `Klas ${cls.name} verwijderen?\n\nOok de leerlingen en hun evaluaties worden verwijderd.`
        )
    ) return;


    try {

        await dbDelete(
            "classes",
            cls.id
        );


        state.classes =
            state.classes.filter(
                item =>
                    item.id !== cls.id
            );


        state.students =
            state.students.filter(
                student =>
                    student.class_id !== cls.id
            );


        state.evaluations =
            state.evaluations.filter(
                evaluation =>
                    evaluation.class_id !== cls.id
            );


        selectedClassId = null;

        saveLocalState();

        renderAll();

        showToast(
            "Klas verwijderd."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Klas kon niet worden verwijderd."
        );

    }

}


/* ============================================================
   LEERLING DETAIL
============================================================ */

let selectedDetailStudentId = null;


function openStudentDetail(
    studentId
) {

    selectedDetailStudentId =
        studentId;


    const student =
        state.students.find(
            item =>
                item.id === studentId
        );


    if (!student) return;


    const panel =
        document.getElementById(
            "studentDetail"
        );


    panel.classList.remove(
        "hidden"
    );


    document.getElementById(
        "studentDetailName"
    ).textContent =
        student.name;


    const select =
        document.getElementById(
            "studentClassChange"
        );


    select.innerHTML =
        state.classes.map(cls => `

            <option
                value="${escapeHtml(cls.id)}"
                ${
                    cls.id === student.class_id
                        ? "selected"
                        : ""
                }
            >
                ${escapeHtml(cls.name)}
            </option>

        `).join("");


    renderStudentEvaluationHistory();

    panel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

}


function renderStudentEvaluationHistory() {

    const container =
        document.getElementById(
            "studentEvaluationHistory"
        );


    const evaluations =
        state.evaluations
            .filter(
                evaluation =>
                    evaluation.student_id ===
                    selectedDetailStudentId
            )
            .sort(
                (a, b) =>
                    new Date(
                        b.created_at ||
                        b.evaluation_date
                    ) -
                    new Date(
                        a.created_at ||
                        a.evaluation_date
                    )
            );


    if (!evaluations.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Deze leerling heeft nog geen evaluaties.
            </div>
        `;

        return;

    }


    container.innerHTML =
        evaluations.map(evaluation => {

            const assignment =
                state.assignments.find(
                    item =>
                        item.id ===
                        evaluation.assignment_id
                );


            const score =
                calculateEvaluationScore(
                    evaluation,
                    assignment
                );


            return `

                <div class="history-item">

                    <div class="history-date">

                        <strong>
                            ${
                                escapeHtml(
                                    assignment?.title ||
                                    "Onbekende opdracht"
                                )
                            }
                        </strong>

                        <div class="history-attempt">

                            ${formatDate(
                                evaluation.evaluation_date ||
                                evaluation.created_at
                            )}

                            ·

                            ${
                                evaluation.attempt_number > 1
                                    ? "Herkansing"
                                    : "Eerste poging"
                            }

                        </div>

                    </div>


                    <div class="history-score">

                       ${
    score === null
        ? "—"
        : `${score.total} / ${score.max}`
}

                    </div>


                    <div class="history-actions">

                        <button
                            data-student-evaluation-edit="${escapeHtml(evaluation.id)}"
                        >
                            Bewerken
                        </button>

                        <button
                            data-student-evaluation-delete="${escapeHtml(evaluation.id)}"
                        >
                            Verwijderen
                        </button>

                    </div>

                </div>

            `;

        }).join("");


    container
        .querySelectorAll(
            "[data-student-evaluation-edit]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    const evaluation =
                        state.evaluations.find(
                            item =>
                                item.id ===
                                button.dataset
                                    .studentEvaluationEdit
                        );


                    if (!evaluation) return;


                    selectedAssignmentId =
                        evaluation.assignment_id;

                    selectedClassId =
                        evaluation.class_id;

                    selectedStudentId =
                        evaluation.student_id;

                    currentEvaluationId =
                        evaluation.id;

                    isRetake = false;


                    document
                        .querySelector(
                            '[data-page="evaluationPage"]'
                        )
                        .click();


                    renderEvaluationSelectors();
                    renderEvaluationStudents();
                    renderEvaluationForm();

                }
            );

        });


    container
        .querySelectorAll(
            "[data-student-evaluation-delete]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async () => {

                    if (
                        !confirm(
                            "Deze evaluatie verwijderen?"
                        )
                    ) return;


                    try {

                        await dbDelete(
                            "evaluations",
                            button.dataset
                                .studentEvaluationDelete
                        );


                        state.evaluations =
                            state.evaluations.filter(
                                item =>
                                    item.id !==
                                    button.dataset
                                        .studentEvaluationDelete
                            );


                        saveLocalState();

                        renderStudentEvaluationHistory();
                        renderClassContent();

                        showToast(
                            "Evaluatie verwijderd."
                        );

                    } catch (error) {

                        console.error(error);

                        showToast(
                            "Verwijderen mislukt."
                        );

                    }

                }
            );

        });

}


async function saveStudentClass() {

    const student =
        state.students.find(
            item =>
                item.id === selectedDetailStudentId
        );


    if (!student) return;


    const newClassId =
        document.getElementById(
            "studentClassChange"
        ).value;


    if (!newClassId) return;


    try {

        const updated =
            await dbUpdate(
                "students",
                student.id,
                {

                    class_id:
                        newClassId,

                    updated_at:
                        new Date().toISOString()

                }
            );


        Object.assign(
            student,
            updated
        );


        /*
           De klas op historische evaluaties blijft behouden.
           Daardoor blijft de geschiedenis correct.
        */


        saveLocalState();

        renderAll();

        openStudentDetail(
            student.id
        );

        showToast(
            "Klas van leerling gewijzigd."
        );

    } catch (error) {

        console.error(error);

        showToast(
            "Klas wijzigen mislukt."
        );

    }

}


/* ============================================================
   KLAS SCOREOVERZICHT
============================================================ */

function renderClassScores(
    cls,
    students
) {

    const container =
        document.getElementById(
            "classScores"
        );


    if (!students.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Nog geen leerlingen.
            </div>
        `;

        return;

    }


    if (!state.assignments.length) {

        container.innerHTML = `
            <div class="empty-state small">
                Maak eerst een opdracht aan.
            </div>
        `;

        return;

    }


    let html = `
        <div class="score-table-wrapper">

            <table class="score-table">

                <thead>

                    <tr>
                        <th>LEERLING</th>

                        ${
                            state.assignments.map(
                                assignment => `
                                    <th>
                                        ${escapeHtml(
                                            assignment.title
                                        )}
                                    </th>
                                `
                            ).join("")
                        }

                    </tr>

                </thead>

                <tbody>
    `;


    students.forEach(student => {

        html += `
            <tr>

                <td>
                    <strong>
                        ${escapeHtml(student.name)}
                    </strong>
                </td>
        `;


        state.assignments.forEach(
            assignment => {

                const evaluation =
                    getLatestEvaluation(
                        student.id,
                        assignment.id
                    );


                const score =
                    calculateEvaluationScore(
                        evaluation,
                        assignment
                    );


                html += `

                    <td>

                       ${
    score === null
        ? `<span class="no-score">—</span>`
        : `<span class="score-value">
            ${score.total} / ${score.max}
           </span>`
}

                    </td>

                `;

            }
        );


        html += `
            </tr>
        `;

    });


    html += `
                </tbody>

            </table>

        </div>
    `;


    container.innerHTML =
        html;

}


/* ============================================================
   PDF
============================================================ */

function setupPdfDocument(
    title,
    student,
    cls,
    assignment
) {

    const {
        jsPDF
    } =
        window.jspdf;


    const doc =
        new jsPDF({
            unit: "mm",
            format: "a4"
        });


    const pageWidth =
        doc.internal.pageSize.getWidth();


    const margin = 18;


    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setTextColor(
        42,
        55,
        177
    );

    doc.setFontSize(24);

    doc.text(
        title,
        margin,
        25
    );


    doc.setFontSize(13);

    doc.text(
        `${student.name}  ·  ${cls?.name || ""}`,
        margin,
        34
    );


    doc.setFont(
        "helvetica",
        "normal"
    );

    doc.setFontSize(9);

    doc.setTextColor(
        60,
        60,
        68
    );


    const date =
        formatDate(
            new Date().toISOString()
        );


    doc.text(
        `Datum opdracht: ${date}`,
        margin,
        43
    );


    doc.text(
        "Leerkracht: Dhr. J. Vermote",
        margin,
        49
    );


    doc.text(
        "School: Atheneum Brugge",
        margin,
        55
    );


    doc.setDrawColor(
        42,
        55,
        177
    );

    doc.setLineWidth(
        0.6
    );

    doc.line(
        margin,
        61,
        pageWidth - margin,
        61
    );


    return doc;

}


function exportEvaluationPdf(
    evaluation,
    student,
    assignment,
    cls,
    doc = null
) {

    const {
        jsPDF
    } =
        window.jspdf;


    if (!doc) {

        doc =
            setupPdfDocument(
                assignment.title,
                student,
                cls,
                assignment
            );

    }


    const margin = 18;

    const pageWidth =
        doc.internal.pageSize.getWidth();


    const scores =
        assignment.parameters.map(
            parameter => {

                const selected =
                    evaluation?.scores?.[
                        parameter.id
                    ];


                return [

                    parameter.title,

                    selected
                        ? String(selected.score)
                        : "—",

                    selected
                        ? selected.explanation
                        : "Niet beoordeeld"

                ];

            }
        );


    let y = 70;


    /*
       Eigen vormgeving:
       geen standaard saaie tabel.
       De tabel krijgt een gekleurde balk, afgeronde
       inhoudsblokken en duidelijke typografie.
    */

    assignment.parameters.forEach(
        (parameter, index) => {

            const selected =
                evaluation?.scores?.[
                    parameter.id
                ];


            const blockHeight =
                22;


            doc.setFillColor(
                245,
                243,
                245
            );


            doc.roundedRect(
                margin,
                y,
                pageWidth - margin * 2,
                blockHeight,
                3,
                3,
                "F"
            );


            doc.setFillColor(
                42,
                55,
                177
            );


            doc.roundedRect(
                margin,
                y,
                5,
                blockHeight,
                2,
                2,
                "F"
            );


            doc.setFont(
                "helvetica",
                "bold"
            );

            doc.setFontSize(
                9
            );

            doc.setTextColor(
                30,
                30,
                38
            );


            doc.text(
                parameter.title,
                margin + 10,
                y + 8
            );


            doc.setTextColor(
                42,
                55,
                177
            );

            doc.setFontSize(
                13
            );

            doc.text(
                selected
                    ? String(selected.score)
                    : "—",
                margin + 10,
                y + 17
            );


            doc.setFont(
                "helvetica",
                "normal"
            );

            doc.setTextColor(
                90,
                90,
                100
            );

            doc.setFontSize(
                8
            );


            const explanation =
                selected
                    ? selected.explanation
                    : "Niet beoordeeld";


            const explanationLines =
                doc.splitTextToSize(
                    explanation,
                    pageWidth - margin * 2 - 65
                );


            doc.text(
                explanationLines,
                margin + 35,
                y + 9
            );


            y += blockHeight + 5;


            if (y > 250) {

                doc.addPage();

                y = 25;

            }

        }
    );


    /* feedback */

    if (y > 240) {

        doc.addPage();

        y = 25;

    }


    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setFontSize(
        11
    );

    doc.setTextColor(
        42,
        55,
        177
    );

    doc.text(
        "FEEDBACK",
        margin,
        y + 8
    );


    y += 14;


    doc.setFont(
        "helvetica",
        "normal"
    );

    doc.setTextColor(
        45,
        45,
        52
    );

    doc.setFontSize(
        9
    );


    const feedback =
        evaluation?.feedback ||
        "Geen feedback ingevoerd.";


    const feedbackLines =
        doc.splitTextToSize(
            feedback,
            pageWidth - margin * 2
        );


    doc.text(
        feedbackLines,
        margin,
        y
    );


    y +=
        Math.max(
            20,
            feedbackLines.length * 5 + 12
        );


    /* eindscore */

    doc.setFillColor(
        42,
        55,
        177
    );


    doc.roundedRect(
        margin,
        y,
        pageWidth - margin * 2,
        30,
        4,
        4,
        "F"
    );


    doc.setTextColor(
        255,
        255,
        255
    );


    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setFontSize(
        9
    );


    doc.text(
        "EINDSCORE",
        margin + 10,
        y + 11
    );


    const score =
        calculateEvaluationScore(
            evaluation,
            assignment
        );


    doc.setFontSize(
        19
    );


   doc.text(
    score === null
        ? "—"
        : `${score.total} / ${score.max}`,
    margin + 10,
    y + 23
);


    return doc;

}


async function exportSelectedStudent() {

    if (
        !selectedStudentId ||
        !selectedAssignmentId
    ) {

        showToast(
            "Selecteer eerst een opdracht en leerling."
        );

        return;

    }


    const student =
        state.students.find(
            item =>
                item.id === selectedStudentId
        );


    const assignment =
        state.assignments.find(
            item =>
                item.id === selectedAssignmentId
        );


    const cls =
        state.classes.find(
            item =>
                item.id === student.class_id
        );


    const evaluation =
        currentEvaluationId
            ? state.evaluations.find(
                item =>
                    item.id === currentEvaluationId
            )
            : getLatestEvaluation(
                selectedStudentId,
                selectedAssignmentId
            );


    if (!evaluation) {

        showToast(
            "Er is nog geen evaluatie om te exporteren."
        );

        return;

    }


    const doc =
        exportEvaluationPdf(
            evaluation,
            student,
            assignment,
            cls
        );


    const filename =
        `${safeFilename(student.name)}-${safeFilename(assignment.title)}.pdf`;


    doc.save(
        filename
    );


    showToast(
        "PDF aangemaakt."
    );

}


async function exportSelectedClass() {

    if (!selectedClassId) {

        showToast(
            "Selecteer eerst een klas."
        );

        return;

    }


    const cls =
        state.classes.find(
            item =>
                item.id === selectedClassId
        );


    const students =
        state.students.filter(
            student =>
                student.class_id === cls.id
        );


    if (!students.length) {

        showToast(
            "Deze klas bevat nog geen leerlingen."
        );

        return;

    }


    const {
        jsPDF
    } =
        window.jspdf;


    let doc = null;

    let exported = 0;


    state.assignments.forEach(
        assignment => {

            students.forEach(
                student => {

                    const evaluation =
                        getLatestEvaluation(
                            student.id,
                            assignment.id
                        );


                    if (!evaluation) return;


                    if (!doc) {

                        doc =
                            setupPdfDocument(
                                assignment.title,
                                student,
                                cls,
                                assignment
                            );

                    } else {

                        doc.addPage();

                        doc =
                            addPdfHeader(
                                doc,
                                assignment,
                                student,
                                cls
                            );

                    }


                    exportEvaluationPdf(
                        evaluation,
                        student,
                        assignment,
                        cls,
                        doc
                    );


                    exported++;

                }
            );

        }
    );


    if (!doc) {

        showToast(
            "Er zijn nog geen evaluaties voor deze klas."
        );

        return;

    }


    doc.save(
        `${safeFilename(cls.name)}-evaluaties.pdf`
    );


    showToast(
        `${exported} evaluatie(s) geëxporteerd.`
    );

}


function addPdfHeader(
    doc,
    assignment,
    student,
    cls
) {

    const pageWidth =
        doc.internal.pageSize.getWidth();

    const margin = 18;


    doc.setFont(
        "helvetica",
        "bold"
    );

    doc.setTextColor(
        42,
        55,
        177
    );

    doc.setFontSize(
        24
    );

    doc.text(
        assignment.title,
        margin,
        25
    );


    doc.setFontSize(
        13
    );

    doc.text(
        `${student.name}  ·  ${cls?.name || ""}`,
        margin,
        34
    );


    doc.setFont(
        "helvetica",
        "normal"
    );

    doc.setFontSize(
        9
    );

    doc.setTextColor(
        60,
        60,
        68
    );


    doc.text(
        `Datum opdracht: ${formatDate(
            new Date().toISOString()
        )}`,
        margin,
        43
    );


    doc.text(
        "Leerkracht: Dhr. J. Vermote",
        margin,
        49
    );


    doc.text(
        "School: Atheneum Brugge",
        margin,
        55
    );


    doc.setDrawColor(
        42,
        55,
        177
    );

    doc.setLineWidth(
        0.6
    );

    doc.line(
        margin,
        61,
        pageWidth - margin,
        61
    );


    return doc;

}


/* ============================================================
   ALGEMENE RENDER
============================================================ */

function renderAll() {

    renderEvaluationSelectors();
    renderEvaluationStudents();
    renderEvaluationForm();

    renderAssignments();

    renderClasses();
    renderClassContent();

    renderStudentEvaluationHistory();

}


/* ============================================================
   UTILITIES
============================================================ */

function formatScore(
    score
) {

    return Number(
        score
    ).toLocaleString(
        "nl-BE",
        {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }
    );

}


function formatDate(
    value
) {

    if (!value) return "—";


    const date =
        new Date(value);


    return date.toLocaleDateString(
        "nl-BE",
        {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        }
    );

}


function safeFilename(
    text
) {

    return String(text || "export")
        .replace(
            /[<>:"/\\|?*]+/g,
            "-"
        )
        .replace(
            /\s+/g,
            "-"
        );

}


function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


function showToast(
    message
) {

    const toast =
        document.getElementById(
            "toast"
        );


    document.getElementById(
        "toastMessage"
    ).textContent =
        message;


    toast.classList.add(
        "show"
    );


    clearTimeout(
        showToast.timeout
    );


    showToast.timeout =
        setTimeout(
            () => {

                toast.classList.remove(
                    "show"
                );

            },
            2500
        );

}


/* ============================================================
   START
============================================================ */

updateTimerDisplay();
