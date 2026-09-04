import{initializeApp}from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import{getFirestore,collection,addDoc,getDocs,getDoc,doc,setDoc,updateDoc,deleteDoc,query,where}from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig={
    apiKey:"AIzaSyBam3B7hYra1C51WBHXlcupRHx99bsJtcw",
    authDomain:"evaluatietool-dbb5e.firebaseapp.com",
    projectId:"evaluatietool-dbb5e",
    storageBucket:"evaluatietool-dbb5e.firebasestorage.app",
    messagingSenderId:"665576535622",
    appId:"1:665576535622:web:ac29df6b1e4b8c26adfc47"
};

const app=initializeApp(firebaseConfig);
const db=getFirestore(app);

const STORAGE_KEY="atheneum_brugge_evaluatietool_v1";
const ACCENT="#2a37b1";
const BG="#f5f3f5";

let state={
    assignments:[],
    classes:[],
    students:[],
    evaluations:[]
};

let selectedAssignmentId=null;
let selectedClassId=null;
let selectedStudentId=null;

let editingAssignmentId=null;
let editingClassId=null;

let currentEvaluationId=null;
let isRetake=false;

let timerSeconds=0;
let timerInterval=null;
let timerRunning=false;

let filterUnevaluated=false;

let selectedDetailStudentId=null;


/* ============================================================
   INITIALISATIE
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    async()=>{
        setupNavigation();
        setupEvaluationEvents();
        setupAssignmentEvents();
        setupStudentEvents();

        try{
            await loadFromFirebase();

            setConnectionStatus(true);

            renderAll();

        }catch(error){
            console.error(
                "Firebase kon niet worden geladen:",
                error
            );

            setConnectionStatus(false);

            showToast(
                "Database kon niet worden geladen. Controleer de verbinding met Firebase."
            );

            renderAll();
        }
    }
);


/* ============================================================
   FIREBASE — GEGEVENS LADEN
   ============================================================ */

async function loadFromFirebase(){

    const collectionNames=[
        "assignments",
        "classes",
        "students",
        "evaluations"
    ];

    const results=
        await Promise.all(
            collectionNames.map(
                async collectionName=>{

                    const snapshot=
                        await getDocs(
                            collection(
                                db,
                                collectionName
                            )
                        );

                    return{
                        name:collectionName,
                        data:
                            snapshot.docs.map(
                                document=>({
                                    id:document.id,
                                    ...document.data()
                                })
                            )
                    };
                }
            )
        );

    results.forEach(result=>{
        state[result.name]=result.data;
    });
}


/* ============================================================
   VERBINDINGSSTATUS
   ============================================================ */

function setConnectionStatus(online){

    const dot=
        document.getElementById(
            "connectionDot"
        );

    const text=
        document.getElementById(
            "connectionText"
        );

    if(!dot||!text)return;

    if(online){

        dot.classList.add("online");

        text.textContent=
            "Online database";

    }else{

        dot.classList.remove("online");

        text.textContent=
            "Lokale modus";
    }
}


/* ============================================================
   LOCAL STORAGE
   ============================================================ */

function loadLocalState(){

    try{

        const raw=
            localStorage.getItem(
                STORAGE_KEY
            );

        if(!raw)return;

        const parsed=
            JSON.parse(raw);

        state={
            assignments:
                parsed.assignments||[],

            classes:
                parsed.classes||[],

            students:
                parsed.students||[],

            evaluations:
                parsed.evaluations||[]
        };

    }catch(error){

        console.error(
            "Kon lokale gegevens niet laden:",
            error
        );
    }
}


function saveLocalState(){

    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state)
    );
}


/* ============================================================
   DATABASE HELPERS — FIREBASE FIRESTORE
   ============================================================ */

function createId(prefix=""){

    return(
        prefix+
        Date.now().toString(36)+
        Math.random()
            .toString(36)
            .substring(2,8)
    );
}


async function dbInsert(
    collectionName,
    object
){

    const id=
        object.id||
        createId();

    const reference=
        doc(
            db,
            collectionName,
            id
        );

    const data={
        ...object,
        id
    };

    await setDoc(
        reference,
        data
    );

    return data;
}


async function dbUpdate(
    collectionName,
    id,
    object
){

    const reference=
        doc(
            db,
            collectionName,
            id
        );

    await updateDoc(
        reference,
        object
    );

    return{
        ...object,
        id
    };
}


async function dbGet(
    collectionName,
    id
){

    const reference=
        doc(
            db,
            collectionName,
            id
        );

    const snapshot=
        await getDoc(
            reference
        );

    if(!snapshot.exists()){
        return null;
    }

    return{
        id:snapshot.id,
        ...snapshot.data()
    };
}


async function dbGetAll(
    collectionName
){

    const snapshot=
        await getDocs(
            collection(
                db,
                collectionName
            )
        );

    return snapshot.docs.map(
        document=>({
            id:document.id,
            ...document.data()
        })
    );
}


async function dbDelete(
    collectionName,
    id
){

    const reference=
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

function setupNavigation(){

    document
        .querySelectorAll(
            ".nav-button"
        )
        .forEach(button=>{

            button.addEventListener(
                "click",
                ()=>{

                    document
                        .querySelectorAll(
                            ".nav-button"
                        )
                        .forEach(btn=>
                            btn.classList.remove(
                                "active"
                            )
                        );

                    document
                        .querySelectorAll(
                            ".page"
                        )
                        .forEach(page=>
                            page.classList.remove(
                                "active-page"
                            )
                        );

                    button.classList.add(
                        "active"
                    );

                    document
                        .getElementById(
                            button.dataset.page
                        )
                        .classList.add(
                            "active-page"
                        );
                }
            );
        });
}


/* ============================================================
   EVALUATIE EVENTS
   ============================================================ */

function setupEvaluationEvents(){

    document
        .getElementById(
            "evaluationAssignment"
        )
        .addEventListener(
            "change",
            event=>{

                selectedAssignmentId=
                    event.target.value||
                    null;

                currentEvaluationId=null;
                isRetake=false;

                renderEvaluationStudents();
                renderEvaluationForm();
            }
        );


    document
        .getElementById(
            "evaluationClass"
        )
        .addEventListener(
            "change",
            event=>{

                selectedClassId=
                    event.target.value||
                    null;

                selectedStudentId=null;

                renderEvaluationStudents();
                renderEvaluationForm();
            }
        );


    document
        .getElementById(
            "studentSearch"
        )
        .addEventListener(
            "input",
            ()=>{
                renderEvaluationStudents();
            }
        );


    document
        .getElementById(
            "filterUnevaluated"
        )
        .addEventListener(
            "click",
            event=>{

                filterUnevaluated=
                    !filterUnevaluated;

                event.currentTarget.classList.toggle(
                    "active",
                    filterUnevaluated
                );

                renderEvaluationStudents();
            }
        );


    document
        .getElementById(
            "retakeButton"
        )
        .addEventListener(
            "click",
            startRetake
        );


    document
        .getElementById(
            "saveEvaluation"
        )
        .addEventListener(
            "click",
            saveEvaluation
        );


    document
        .getElementById(
            "exportStudent"
        )
        .addEventListener(
            "click",
            exportSelectedStudent
        );


    document
        .getElementById(
            "exportClass"
        )
        .addEventListener(
            "click",
            exportSelectedClass
        );


    document
        .getElementById(
            "toggleHistory"
        )
        .addEventListener(
            "click",
            ()=>{
                document
                    .getElementById(
                        "evaluationHistory"
                    )
                    .classList.toggle(
                        "hidden"
                    );
            }
        );


    document
        .getElementById(
            "timerStart"
        )
        .addEventListener(
            "click",
            startTimer
        );


    document
        .getElementById(
            "timerPause"
        )
        .addEventListener(
            "click",
            pauseTimer
        );


    document
        .getElementById(
            "timerReset"
        )
        .addEventListener(
            "click",
            resetTimer
        );

}


/* ============================================================
   EVALUATIE RENDER
   ============================================================ */

function renderEvaluationSelectors(){

    const assignmentSelect=
        document.getElementById(
            "evaluationAssignment"
        );

    const classSelect=
        document.getElementById(
            "evaluationClass"
        );

    const currentAssignment=
        selectedAssignmentId;

    const currentClass=
        selectedClassId;


    assignmentSelect.innerHTML=`
        <option value="">
            Kies een opdracht...
        </option>
    `;


    state.assignments.forEach(
        assignment=>{

            assignmentSelect.innerHTML+=`
                <option value="${escapeHtml(
                    assignment.id
                )}">
                    ${escapeHtml(
                        assignment.title
                    )}
                </option>
            `;
        }
    );


    classSelect.innerHTML=`
        <option value="">
            Kies een klas...
        </option>
    `;


    state.classes.forEach(
        cls=>{

            classSelect.innerHTML+=`
                <option value="${escapeHtml(
                    cls.id
                )}">
                    ${escapeHtml(
                        cls.name
                    )}
                </option>
            `;
        }
    );


    if(currentAssignment){
        assignmentSelect.value=
            currentAssignment;
    }

    if(currentClass){
        classSelect.value=
            currentClass;
    }
}


function renderEvaluationStudents(){

    const container=
        document.getElementById(
            "studentList"
        );


    if(!selectedClassId){

        container.innerHTML=`
            <div class="empty-state small">
                Kies eerst een klas.
            </div>
        `;

        return;
    }


    let students=
        state.students.filter(
            student=>
                student.class_id===
                selectedClassId
        );


    const search=
        document
            .getElementById(
                "studentSearch"
            )
            .value
            .trim()
            .toLowerCase();


    if(search){

        students=
            students.filter(
                student=>
                    student.name
                        .toLowerCase()
                        .includes(search)
            );
    }


    if(
        filterUnevaluated&&
        selectedAssignmentId
    ){

        students=
            students.filter(
                student=>
                    !hasEvaluation(
                        student.id,
                        selectedAssignmentId
                    )
            );
    }


    if(!students.length){

        container.innerHTML=`
            <div class="empty-state small">
                Geen leerlingen gevonden.
            </div>
        `;

        return;
    }


    container.innerHTML=
        students
            .map(
                student=>{

                    const evaluated=
                        selectedAssignmentId&&
                        hasEvaluation(
                            student.id,
                            selectedAssignmentId
                        );


                    const active=
                        student.id===
                        selectedStudentId;


                    const retakeCount=
                        getEvaluationHistory(
                            student.id,
                            selectedAssignmentId
                        ).filter(
                            evaluation=>
                                evaluation.attempt_number>1
                        ).length;


                    return`
                        <button
                            class="student-item ${
                                active
                                    ?"active"
                                    :""
                            }"
                            data-student-id="${
                                escapeHtml(
                                    student.id
                                )
                            }"
                        >

                            <span class="student-name">
                                ${escapeHtml(
                                    student.name
                                )}
                            </span>

                            ${
                                evaluated
                                    ?`<span class="student-check">✓</span>`
                                    :""
                            }

                            ${
                                retakeCount
                                    ?`<span class="student-retake">
                                        ${retakeCount}x herk.
                                    </span>`
                                    :""
                            }

                        </button>
                    `;
                }
            )
            .join("");


    container
        .querySelectorAll(
            ".student-item"
        )
        .forEach(
            button=>{

                button.addEventListener(
                    "click",
                    ()=>{
                        selectedStudentId=
                            button.dataset.studentId;

                        currentEvaluationId=null;
                        isRetake=false;

                        resetTimer();

                        renderEvaluationStudents();
                        renderEvaluationForm();
                    }
                );
            }
        );
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

        document.getElementById("totalScore").textContent =
            "—";

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
                item =>
                    item.id === currentEvaluationId
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


function renderForm(
    assignment,
    evaluation
) {

    const container =
        document.getElementById(
            "evaluationFormContainer"
        );


    const selectedScores =
        evaluation?.scores || {};


    const selectedComments =
        evaluation?.comments || [];


    let html = "";


    assignment.parameters.forEach(
        (parameter, index) => {

            const selected =
                selectedScores[
                    parameter.id
                ];


            html += `
                <div
                    class="parameter"
                    data-parameter-id="${escapeHtml(
                        parameter.id
                    )}"
                >

                    <div class="parameter-header">

                        <div>

                            <span class="parameter-number">
                                CRITERIUM ${
                                    String(index + 1)
                                        .padStart(2, "0")
                                }
                            </span>

                            <h3 class="parameter-title">
                                ${escapeHtml(
                                    parameter.title
                                )}
                            </h3>

                        </div>


                        <div
                            class="parameter-score"
                            data-score-for="${escapeHtml(
                                parameter.id
                            )}"
                        >
                            ${
                                selected
                                    ? `Score: ${escapeHtml(
                                        String(
                                            selected.score
                                        )
                                    )}`
                                    : "Niet beoordeeld"
                            }
                        </div>

                    </div>


                    <div class="levels">

                        ${
                            parameter.levels.length
                                ? parameter.levels
                                    .map(level => {

                                        const isSelected =
                                            selected &&
                                            selected.level_id ===
                                                level.id;


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
                                                    name="parameter-${escapeHtml(
                                                        parameter.id
                                                    )}"
                                                    value="${escapeHtml(
                                                        level.id
                                                    )}"
                                                    data-parameter="${escapeHtml(
                                                        parameter.id
                                                    )}"
                                                    data-score="${escapeHtml(
                                                        String(
                                                            level.score
                                                        )
                                                    )}"
                                                    ${
                                                        isSelected
                                                            ? "checked"
                                                            : ""
                                                    }
                                                >


                                                <div class="level-score">
                                                    ${escapeHtml(
                                                        String(
                                                            level.score
                                                        )
                                                    )}
                                                </div>


                                                <div class="level-explanation">
                                                    ${escapeHtml(
                                                        level.explanation
                                                    )}
                                                </div>

                                            </label>
                                        `;

                                    })
                                    .join("")

                                : `
                                    <div class="empty-state small">
                                        Deze parameter heeft nog geen niveaus.
                                    </div>
                                `
                        }

                    </div>

                </div>
            `;

        }
    );


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

                        ? assignment.comments
                            .map(
                                (
                                    comment,
                                    index
                                ) => {

                                    const active =
                                        selectedComments
                                            .includes(
                                                comment
                                            );


                                    return `
                                        <button
                                            type="button"
                                            class="comment-chip ${
                                                active
                                                    ? "active"
                                                    : ""
                                            }"
                                            data-comment-index="${index}"
                                        >
                                            ${escapeHtml(
                                                comment
                                            )}
                                        </button>
                                    `;

                                }
                            )
                            .join("")

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
            >${escapeHtml(
                evaluation?.feedback || ""
            )}</textarea>

        </div>
    `;


    container.innerHTML =
        html;


    container
        .querySelectorAll(
            ".level-card input"
        )
        .forEach(input => {

            input.addEventListener(
                "change",
                () => {

                    container
                        .querySelectorAll(
                            `[name="${input.name}"]`
                        )
                        .forEach(
                            other => {

                                other
                                    .closest(
                                        ".level-card"
                                    )
                                    .classList.remove(
                                        "selected"
                                    );

                            }
                        );


                    input
                        .closest(
                            ".level-card"
                        )
                        .classList.add(
                            "selected"
                        );


                    const scoreElement =
                        document.querySelector(
                            `[data-score-for="${input.dataset.parameter}"]`
                        );


                    scoreElement.textContent =
                        `Score: ${input.dataset.score}`;


                    updateTotalScore();

                }
            );

        });


    container
        .querySelectorAll(
            ".comment-chip"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const comment =
                            assignment.comments[
                                Number(
                                    button.dataset
                                        .commentIndex
                                )
                            ];


                        const textarea =
                            document.getElementById(
                                "feedbackText"
                            );


                        button.classList.toggle(
                            "active"
                        );


                        const selectedCommentsNow =
                            Array.from(
                                container.querySelectorAll(
                                    ".comment-chip.active"
                                )
                            ).map(
                                item =>
                                    assignment.comments[
                                        Number(
                                            item.dataset
                                                .commentIndex
                                        )
                                    ]
                            );


                        textarea.value =
                            selectedCommentsNow.join(
                                " "
                            ) +
                            (
                                selectedCommentsNow.length &&
                                textarea.value &&
                                !selectedCommentsNow.some(
                                    item =>
                                        textarea.value ===
                                        item
                                )
                                    ? " " +
                                      textarea.value
                                    : ""
                            );

                    }
                );

            }
        );


    updateTotalScore();

}


function updateTotalScore() {

    const assignment =
        state.assignments.find(
            item =>
                item.id ===
                selectedAssignmentId
        );


    const total =
        document.getElementById(
            "totalScore"
        );


    if (!assignment || !total) {
        return;
    }


    let achievedScore = 0;
    let maximumScore = 0;
    let evaluatedCount = 0;


    assignment.parameters.forEach(
        parameter => {

            const levels =
                parameter.levels || [];


            /*
               Het maximum van dit criterium is
               de hoogste score die eraan gekoppeld is.
            */

            if (levels.length) {

                const criterionMaximum =
                    Math.max(
                        ...levels.map(
                            level =>
                                Number(
                                    level.score
                                )
                        )
                    );


                maximumScore +=
                    criterionMaximum;

            }


            /*
               Kijk welke score momenteel
               geselecteerd is.
            */

            const input =
                document.querySelector(
                    `input[name="parameter-${parameter.id}"]:checked`
                );


            if (!input) {
                return;
            }


            const score =
                Number(
                    input.dataset.score
                );


            if (
                !Number.isNaN(score)
            ) {

                achievedScore +=
                    score;

                evaluatedCount++;

            }

        }
    );


    if (!evaluatedCount) {

        total.textContent =
            "—";

        return;
    }


    total.textContent =
        `${achievedScore} / ${maximumScore}`;

}


function collectFormData() {

    const assignment =
        state.assignments.find(
            item =>
                item.id ===
                selectedAssignmentId
        );


    const scores = {};


    if (assignment) {

        assignment.parameters.forEach(
            parameter => {

                const input =
                    document.querySelector(
                        `input[name="parameter-${parameter.id}"]:checked`
                    );


                if (!input) {
                    return;
                }


                const level =
                    parameter.levels.find(
                        item =>
                            item.id ===
                            input.value
                    );


                if (!level) {
                    return;
                }


                scores[
                    parameter.id
                ] = {

                    level_id:
                        level.id,

                    score:
                        Number(
                            level.score
                        ),

                    level_title:
                        level.title || "",

                    explanation:
                        level.explanation

                };

            }
        );

    }


    const comments =
        Array.from(
            document.querySelectorAll(
                ".comment-chip.active"
            )
        ).map(
            button => {

                return assignment.comments[
                    Number(
                        button.dataset
                            .commentIndex
                    )
                ];

            }
        );


    const feedback =
        document
            .getElementById(
                "feedbackText"
            )
            ?.value
            .trim() || "";


    return {
        scores,
        comments,
        feedback
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


        /*
           Firebase is de enige permanente opslag.
           Geen Local Storage meer.
        */


        isRetake = false;


        renderEvaluationStudents();
        renderEvaluationForm();

        showToast(
            "Evaluatie opgeslagen."
        );

    } catch (error) {

        console.error(
            "Firebase fout bij opslaan evaluatie:",
            error
        );

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
                new Date(
                    b.created_at ||
                    b.evaluation_date
                ) -
                new Date(
                    a.created_at ||
                    a.evaluation_date
                )
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


/* ============================================================
   ABSOLUTE EVALUATIESCORE
============================================================ */

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


    assignment.parameters.forEach(
        parameter => {

            const levels =
                parameter.levels || [];


            /*
               Hoogste beschikbare niveau =
               maximaal te behalen score voor dit criterium.
            */

            if (levels.length) {

                const criterionMax =
                    Math.max(
                        ...levels.map(
                            level =>
                                Number(level.score)
                        )
                    );


                maxScore +=
                    criterionMax;

            }


            /*
               Geselecteerde score voor dit criterium.
            */

            const selected =
                evaluation.scores[
                    parameter.id
                ];


            if (
                selected &&
                typeof selected.score === "number"
            ) {

                totalScore +=
                    selected.score;

                evaluatedCount++;

            }

        }
    );


    if (!evaluatedCount) {

        return null;

    }


    return {

        total:
            totalScore,

        max:
            maxScore,

        evaluated:
            evaluatedCount,

        totalCriteria:
            assignment.parameters.length

    };

}


/* ============================================================
   EVALUATIEGESCHIEDENIS RENDEREN
============================================================ */

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
            item =>
                item.id === selectedAssignmentId
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
        history.map(
            evaluation => {

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

                        </div>


                        <div class="history-actions">

                            <button
                                data-history-edit="${escapeHtml(
                                    evaluation.id
                                )}"
                            >
                                Bewerken
                            </button>


                            <button
                                data-history-delete="${escapeHtml(
                                    evaluation.id
                                )}"
                            >
                                Verwijderen
                            </button>

                        </div>

                    </div>
                `;

            }
        ).join("");


    container
        .querySelectorAll(
            "[data-history-edit]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        currentEvaluationId =
                            button.dataset.historyEdit;

                        isRetake = false;

                        renderEvaluationForm();

                    }
                );

            }
        );


    container
        .querySelectorAll(
            "[data-history-delete]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    async () => {

                        const evaluation =
                            state.evaluations.find(
                                item =>
                                    item.id ===
                                    button.dataset
                                        .historyDelete
                            );


                        if (!evaluation) {
                            return;
                        }


                        if (
                            !confirm(
                                "Deze evaluatie definitief verwijderen?"
                            )
                        ) {
                            return;
                        }


                        try {

                            await dbDelete(
                                "evaluations",
                                evaluation.id
                            );


                            state.evaluations =
                                state.evaluations.filter(
                                    item =>
                                        item.id !==
                                        evaluation.id
                                );


                            if (
                                currentEvaluationId ===
                                evaluation.id
                            ) {

                                currentEvaluationId =
                                    null;

                            }


                            renderEvaluationStudents();
                            renderEvaluationForm();

                            showToast(
                                "Evaluatie verwijderd."
                            );

                        } catch (error) {

                            console.error(
                                "Firebase fout bij verwijderen evaluatie:",
                                error
                            );

                            showToast(
                                "Verwijderen mislukt."
                            );

                        }

                    }
                );

            }
        );

}


/* ============================================================
   TIMER
============================================================ */

function updateTimerDisplay() {

    const minutes =
        Math.floor(
            timerSeconds / 60
        )
        .toString()
        .padStart(
            2,
            "0"
        );


    const seconds =
        (
            timerSeconds % 60
        )
        .toString()
        .padStart(
            2,
            "0"
        );


    document.getElementById(
        "timerDisplay"
    ).textContent =
        `${minutes}:${seconds}`;

}


function startTimer() {

    if (timerRunning) {
        return;
    }


    timerRunning = true;


    timerInterval =
        setInterval(
            () => {

                timerSeconds++;

                updateTimerDisplay();

            },
            1000
        );

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
        .getElementById(
            "newAssignment"
        )
        .addEventListener(
            "click",
            createNewAssignment
        );


    document
        .getElementById(
            "addComment"
        )
        .addEventListener(
            "click",
            addCommentField
        );


    document
        .getElementById(
            "addParameter"
        )
        .addEventListener(
            "click",
            addParameter
        );


    document
        .getElementById(
            "saveAssignment"
        )
        .addEventListener(
            "click",
            saveAssignment
        );


    document
        .getElementById(
            "duplicateAssignment"
        )
        .addEventListener(
            "click",
            duplicateAssignment
        );


    document
        .getElementById(
            "deleteAssignment"
        )
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
            createId(
                "assignment_"
            ),

        title:
            "Nieuwe opdracht",

        comments:
            [],

        parameters:
            [

                {

                    id:
                        createId(
                            "parameter_"
                        ),

                    title:
                        "Parameter 1",

                    levels:
                        [

                            {
                                id:
                                    createId(
                                        "level_"
                                    ),

                                score:
                                    4,

                                title:
                                    "",

                                explanation:
                                    "Uitstekend"

                            },

                            {
                                id:
                                    createId(
                                        "level_"
                                    ),

                                score:
                                    3,

                                title:
                                    "",

                                explanation:
                                    "Goed"

                            },

                            {
                                id:
                                    createId(
                                        "level_"
                                    ),

                                score:
                                    2,

                                title:
                                    "",

                                explanation:
                                    "Onvoldoende"

                            },

                            {
                                id:
                                    createId(
                                        "level_"
                                    ),

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
        getEditingAssignment();


    if (!assignment) {
        return;
    }


    const editor =
        document.getElementById(
            "assignmentEditor"
        );


    const empty =
        document.getElementById(
            "assignmentEditorEmpty"
        );


    editor.classList.remove(
        "hidden"
    );


    empty.classList.add(
        "hidden"
    );


    document.getElementById(
        "assignmentTitle"
    ).value =
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


    if (!container) {
        return;
    }


    container.innerHTML =
        assignment.comments
            .map(
                (comment, index) => `

                    <div class="comment-builder">

                        <input
                            type="text"
                            value="${escapeHtml(
                                comment
                            )}"
                            data-comment-index="${index}"
                        >

                        <button
                            type="button"
                            class="icon-button"
                            data-delete-comment="${index}"
                        >
                            ×
                        </button>

                    </div>

                `
            )
            .join("");


    container
        .querySelectorAll(
            "[data-comment-index]"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "input",
                    () => {

                        assignment.comments[
                            Number(
                                input.dataset
                                    .commentIndex
                            )
                        ] =
                            input.value;

                    }
                );

            }
        );


    container
        .querySelectorAll(
            "[data-delete-comment]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        assignment.comments.splice(
                            Number(
                                button.dataset
                                    .deleteComment
                            ),
                            1
                        );

                        renderCommentsBuilder(
                            assignment
                        );

                    }
                );

            }
        );

}
/* ============================================================
   COMMENTAAR TOEVOEGEN
============================================================ */

function addCommentField() {

    const assignment =
        getEditingAssignment();

    if (!assignment) {
        return;
    }

    assignment.comments.push(
        ""
    );

    renderCommentsBuilder(
        assignment
    );

}


/* ============================================================
   PARAMETERS BUILDER
============================================================ */

function renderParametersBuilder(
    assignment
) {

    const container =
        document.getElementById(
            "parametersBuilder"
        );

    if (!container) {
        return;
    }


    container.innerHTML =
        assignment.parameters
            .map(
                (parameter, parameterIndex) => `

                    <div
                        class="parameter-builder"
                        data-parameter-id="${escapeHtml(
                            parameter.id
                        )}"
                    >

                        <div class="builder-header">

                            <div>

                                <span class="section-label">
                                    CRITERIUM ${
                                        String(
                                            parameterIndex + 1
                                        ).padStart(
                                            2,
                                            "0"
                                        )
                                    }
                                </span>

                                <input
                                    type="text"
                                    class="parameter-title-input"
                                    value="${escapeHtml(
                                        parameter.title || ""
                                    )}"
                                    placeholder="Naam van criterium"
                                >

                            </div>


                            <button
                                type="button"
                                class="danger-button"
                                data-delete-parameter="${escapeHtml(
                                    parameter.id
                                )}"
                            >
                                Verwijderen
                            </button>

                        </div>


                        <div class="levels-builder">

                            <div class="levels-builder-header">

                                <strong>
                                    Niveaus
                                </strong>

                                <button
                                    type="button"
                                    class="secondary-button"
                                    data-add-level="${escapeHtml(
                                        parameter.id
                                    )}"
                                >
                                    + Niveau
                                </button>

                            </div>


                            <div class="level-builder-list">

                                ${
                                    (parameter.levels || [])
                                        .map(
                                            (
                                                level,
                                                levelIndex
                                            ) => `

                                                <div
                                                    class="level-builder"
                                                    data-level-id="${escapeHtml(
                                                        level.id
                                                    )}"
                                                >

                                                    <div class="level-number">
                                                        ${levelIndex + 1}
                                                    </div>


                                                    <div class="level-score-input">

                                                        <label>
                                                            Score
                                                        </label>

                                                        <input
                                                            type="number"
                                                            value="${escapeHtml(
                                                                String(
                                                                    level.score ?? ""
                                                                )
                                                            )}"
                                                            data-level-score
                                                        >

                                                    </div>


                                                    <div class="level-title-input">

                                                        <label>
                                                            Titel
                                                        </label>

                                                        <input
                                                            type="text"
                                                            value="${escapeHtml(
                                                                level.title || ""
                                                            )}"
                                                            data-level-title
                                                            placeholder="Bijv. Uitstekend"
                                                        >

                                                    </div>


                                                    <div class="level-explanation-input">

                                                        <label>
                                                            Omschrijving
                                                        </label>

                                                        <input
                                                            type="text"
                                                            value="${escapeHtml(
                                                                level.explanation || ""
                                                            )}"
                                                            data-level-explanation
                                                            placeholder="Omschrijving van dit niveau"
                                                        >

                                                    </div>


                                                    <button
                                                        type="button"
                                                        class="icon-button danger"
                                                        data-delete-level="${escapeHtml(
                                                            parameter.id
                                                        )}"
                                                        data-level-id="${escapeHtml(
                                                            level.id
                                                        )}"
                                                    >
                                                        ×
                                                    </button>

                                                </div>

                                            `
                                        )
                                        .join("")
                                }

                            </div>

                        </div>

                    </div>

                `
            )
            .join("");


    /*
       Titel van criterium bijwerken
    */

    container
        .querySelectorAll(
            ".parameter-title-input"
        )
        .forEach(
            input => {

                input.addEventListener(
                    "input",
                    () => {

                        const builder =
                            input.closest(
                                ".parameter-builder"
                            );

                        const parameter =
                            assignment.parameters.find(
                                item =>
                                    item.id ===
                                    builder.dataset
                                        .parameterId
                            );

                        if (parameter) {

                            parameter.title =
                                input.value;

                        }

                    }
                );

            }
        );


    /*
       Score / titel / omschrijving van niveau bijwerken
    */

    container
        .querySelectorAll(
            ".level-builder"
        )
        .forEach(
            levelElement => {

                const parameterElement =
                    levelElement.closest(
                        ".parameter-builder"
                    );


                const parameter =
                    assignment.parameters.find(
                        item =>
                            item.id ===
                            parameterElement.dataset
                                .parameterId
                    );


                if (!parameter) {
                    return;
                }


                const level =
                    parameter.levels.find(
                        item =>
                            item.id ===
                            levelElement.dataset
                                .levelId
                    );


                if (!level) {
                    return;
                }


                const scoreInput =
                    levelElement.querySelector(
                        "[data-level-score]"
                    );


                const titleInput =
                    levelElement.querySelector(
                        "[data-level-title]"
                    );


                const explanationInput =
                    levelElement.querySelector(
                        "[data-level-explanation]"
                    );


                scoreInput.addEventListener(
                    "input",
                    () => {

                        level.score =
                            Number(
                                scoreInput.value
                            );

                    }
                );


                titleInput.addEventListener(
                    "input",
                    () => {

                        level.title =
                            titleInput.value;

                    }
                );


                explanationInput.addEventListener(
                    "input",
                    () => {

                        level.explanation =
                            explanationInput.value;

                    }
                );

            }
        );


    /*
       Niveau toevoegen
    */

    container
        .querySelectorAll(
            "[data-add-level]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const parameter =
                            assignment.parameters.find(
                                item =>
                                    item.id ===
                                    button.dataset
                                        .addLevel
                            );


                        if (!parameter) {
                            return;
                        }


                        const existingScores =
                            parameter.levels
                                .map(
                                    level =>
                                        Number(
                                            level.score
                                        )
                                )
                                .filter(
                                    score =>
                                        !Number.isNaN(
                                            score
                                        )
                                );


                        /*
                           Nieuw niveau krijgt standaard
                           één punt onder de laagste score.
                           Als er nog geen scores zijn,
                           begint het op 1.
                        */

                        let newScore = 1;


                        if (
                            existingScores.length
                        ) {

                            newScore =
                                Math.min(
                                    ...existingScores
                                ) - 1;

                        }


                        parameter.levels.push({

                            id:
                                createId(
                                    "level_"
                                ),

                            score:
                                newScore,

                            title:
                                "",

                            explanation:
                                ""

                        });


                        renderParametersBuilder(
                            assignment
                        );

                    }
                );

            }
        );


    /*
       Niveau verwijderen
    */

    container
        .querySelectorAll(
            "[data-delete-level]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const parameter =
                            assignment.parameters.find(
                                item =>
                                    item.id ===
                                    button.dataset
                                        .deleteLevel
                            );


                        if (!parameter) {
                            return;
                        }


                        if (
                            parameter.levels.length <= 1
                        ) {

                            showToast(
                                "Een criterium moet minstens één niveau hebben."
                            );

                            return;

                        }


                        parameter.levels =
                            parameter.levels.filter(
                                level =>
                                    level.id !==
                                    button.dataset
                                        .levelId
                            );


                        renderParametersBuilder(
                            assignment
                        );

                    }
                );

            }
        );


    /*
       Criterium verwijderen
    */

    container
        .querySelectorAll(
            "[data-delete-parameter]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        if (
                            assignment.parameters.length <= 1
                        ) {

                            showToast(
                                "Een opdracht moet minstens één criterium hebben."
                            );

                            return;

                        }


                        if (
                            !confirm(
                                "Dit criterium verwijderen?"
                            )
                        ) {

                            return;

                        }


                        assignment.parameters =
                            assignment.parameters.filter(
                                parameter =>
                                    parameter.id !==
                                    button.dataset
                                        .deleteParameter
                            );


                        renderParametersBuilder(
                            assignment
                        );

                    }
                );

            }
        );

}


/* ============================================================
   CRITERIUM TOEVOEGEN
============================================================ */

function addParameter() {

    const assignment =
        getEditingAssignment();


    if (!assignment) {
        return;
    }


    assignment.parameters.push({

        id:
            createId(
                "parameter_"
            ),

        title:
            `Parameter ${
                assignment.parameters.length + 1
            }`,

        levels: [

            {
                id:
                    createId(
                        "level_"
                    ),

                score:
                    1,

                title:
                    "",

                explanation:
                    ""

            },

            {
                id:
                    createId(
                        "level_"
                    ),

                score:
                    2,

                title:
                    "",

                explanation:
                    ""

            },

            {
                id:
                    createId(
                        "level_"
                    ),

                score:
                    3,

                title:
                    "",

                explanation:
                    ""

            },

            {
                id:
                    createId(
                        "level_"
                    ),

                score:
                    4,

                title:
                    "",

                explanation:
                    ""

            }

        ]

    });


    renderParametersBuilder(
        assignment
    );

}


/* ============================================================
   OPDRACHT OPSLAAN
============================================================ */

async function saveAssignment() {

    const assignment =
        getEditingAssignment();


    if (!assignment) {

        showToast(
            "Geen opdracht geselecteerd."
        );

        return;

    }


    const title =
        document
            .getElementById(
                "assignmentTitle"
            )
            .value
            .trim();


    if (!title) {

        showToast(
            "Geef de opdracht een naam."
        );

        return;

    }


    assignment.title =
        title;


    /*
       Zorg dat scores daadwerkelijk nummers zijn.
    */

    assignment.parameters.forEach(
        parameter => {

            parameter.levels.forEach(
                level => {

                    level.score =
                        Number(
                            level.score
                        );

                }
            );

        }
    );


    try {

        const existing =
            state.assignments.find(
                item =>
                    item.id ===
                    assignment.id
            );


        if (existing) {

            await dbUpdate(
                "assignments",
                assignment.id,
                assignment
            );

        } else {

            await dbInsert(
                "assignments",
                assignment
            );

        }


        /*
           Geen saveLocalState().
           Firebase is de permanente opslag.
        */


        renderAssignments();


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
            (
                error.message ||
                "onbekende fout"
            )
        );

    }

}


/* ============================================================
   OPDRACHT DUPLICEREN
============================================================ */

async function duplicateAssignment() {

    const assignment =
        getEditingAssignment();


    if (!assignment) {

        showToast(
            "Geen opdracht geselecteerd."
        );

        return;

    }


    const duplicate =
        JSON.parse(
            JSON.stringify(
                assignment
            )
        );


    duplicate.id =
        createId(
            "assignment_"
        );


    duplicate.title =
        `${assignment.title} - kopie`;


    duplicate.parameters =
        duplicate.parameters.map(
            parameter => {

                parameter.id =
                    createId(
                        "parameter_"
                    );


                parameter.levels =
                    parameter.levels.map(
                        level => {

                            level.id =
                                createId(
                                    "level_"
                                );

                            return level;

                        }
                    );


                return parameter;

            }
        );


    try {

        const result =
            await dbInsert(
                "assignments",
                duplicate
            );


        state.assignments.push(
            result
        );


        editingAssignmentId =
            result.id;


        renderAssignments();
        openAssignmentEditor();


        showToast(
            "Opdracht gedupliceerd."
        );


    } catch (error) {

        console.error(
            "Firebase fout bij dupliceren:",
            error
        );


        showToast(
            "Opdracht kon niet worden gedupliceerd."
        );

    }

}


/* ============================================================
   OPDRACHT VERWIJDEREN
============================================================ */

async function deleteAssignment() {

    const assignment =
        getEditingAssignment();


    if (!assignment) {
        return;
    }


    if (
        !confirm(
            `Weet je zeker dat je "${assignment.title}" wilt verwijderen?`
        )
    ) {

        return;

    }


    try {

        await dbDelete(
            "assignments",
            assignment.id
        );


        state.assignments =
            state.assignments.filter(
                item =>
                    item.id !==
                    assignment.id
            );


        /*
           Ook de editor sluiten.
        */

        editingAssignmentId =
            null;


        const editor =
            document.getElementById(
                "assignmentEditor"
            );


        const empty =
            document.getElementById(
                "assignmentEditorEmpty"
            );


        if (editor) {
            editor.classList.add(
                "hidden"
            );
        }


        if (empty) {
            empty.classList.remove(
                "hidden"
            );
        }


        renderAssignments();


        showToast(
            "Opdracht verwijderd."
        );


    } catch (error) {

        console.error(
            "Firebase fout bij verwijderen opdracht:",
            error
        );


        showToast(
            "Opdracht kon niet worden verwijderd."
        );

    }

}


/* ============================================================
   HUIDIGE OPDRACHT
============================================================ */

function getEditingAssignment() {

    if (!editingAssignmentId) {
        return null;
    }


    return state.assignments.find(
        assignment =>
            assignment.id ===
            editingAssignmentId
    ) || null;

}


/* ============================================================
   OPDRACHTEN OVERZICHT
============================================================ */

function renderAssignments() {

    const container =
        document.getElementById(
            "assignmentList"
        );


    if (!container) {
        return;
    }


    if (!state.assignments.length) {

        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    +
                </div>

                <h3>Nog geen opdrachten</h3>

                <p>
                    Maak je eerste evaluatieopdracht aan.
                </p>
            </div>
        `;

        return;

    }


    container.innerHTML =
        state.assignments
            .map(
                assignment => {

                    const active =
                        assignment.id ===
                        editingAssignmentId;


                    const parameterCount =
                        assignment.parameters
                            ?.length || 0;


                    return `
                        <button
                            type="button"
                            class="assignment-item ${
                                active
                                    ? "active"
                                    : ""
                            }"
                            data-assignment-id="${escapeHtml(
                                assignment.id
                            )}"
                        >

                            <div class="assignment-item-main">

                                <strong>
                                    ${escapeHtml(
                                        assignment.title
                                    )}
                                </strong>

                                <span>
                                    ${parameterCount}
                                    ${
                                        parameterCount === 1
                                            ? "criterium"
                                            : "criteria"
                                    }
                                </span>

                            </div>

                        </button>
                    `;

                }
            )
            .join("");


    container
        .querySelectorAll(
            "[data-assignment-id]"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        editingAssignmentId =
                            button.dataset
                                .assignmentId;

                        renderAssignments();
                        openAssignmentEditor();

                    }
                );

            }
        );

}
