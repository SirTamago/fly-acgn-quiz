import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
    PlusCircle,
    Pencil,
    Trash2,
    Play,
    CheckCircle2,
    XCircle,
    BookOpen,
    Eye,
    Lock,
    RotateCcw,
    Save,
    ListChecks,
} from "lucide-react";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import initialQuestions from "./questions.json"; // Changed import name
import baseHints from "./hints.json";

// --- Types ---
/**
 * Question types:
 * - mcq: multiple choice (can be single or multi-select)
 * - fill: fill in blank (manual grading)
 * - short: short answer (manual grading)
 * - reading: reading comprehension (manual grading)
 */
const LEVEL_POINTS = { a: 3, b: 2, c: 1, s: 5 };
const LEVEL_LABEL = { a: "A(3)", b: "B(2)", c: "C(1)", s: "S(5)" };
const LEVEL_COLORS = { a: "red", b: "yellow", c: "green", s: "purple" };
const TYPE_LABELS = {
    mcq: "选择题",
    fill: "填空题",
    short: "简答题",
    reading: "阅读题",
};

/** @typedef {"mcq"|"fill"|"short"|"reading"} QType */

function uid() {
    return Math.random().toString(36).slice(2, 10);
}

// --- LocalStorage helpers ---
const LS_KEY = "ipquiz.questions.v2"; // Changed LS_KEY for new format
const LS_HINTS = "ipquiz.hints.v2";   // Changed LS_HINTS for new format
const LS_PIN = "ipquiz.admin.pin";

function loadQuestions() {
    try {
        const s = localStorage.getItem(LS_KEY);
        if (s) {
            return JSON.parse(s);
        }
    } catch (e) {
        console.error("Failed to load questions from localStorage:", e);
    }
    return initialQuestions; // Fallback to initial questions
}
function saveQuestions(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
}
function loadHints() {
    try {
        const s = localStorage.getItem(LS_HINTS);
        if (s) {
            const fromLS = JSON.parse(s);
            // merge: file defaults + local overrides
            return { ...(baseHints || {}), ...(fromLS || {}) };
        }
    } catch (e) {
        console.error("Failed to load hints from localStorage:", e);
    }
    return baseHints || {};
}
function saveHints(obj) {
    localStorage.setItem(LS_HINTS, JSON.stringify(obj || {}));
}
function getAdminPin() {
    return localStorage.getItem(LS_PIN) || "1234"; // default pin
}
function setAdminPin(pin) {
    localStorage.setItem(LS_PIN, pin);
}

// --- UI Primitives (Tailwind) ---
function Button({ className = "", disabled, children, ...props }) {
    return (
        <button
            disabled={disabled}
            className={`px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
            {...props}
        >
            {children}
        </button>
    );
}
function Card({ className = "", children }) {
    return (
        <div className={`rounded-2xl border shadow-sm p-4 bg-white ${className}`}>{children}</div>
    );
}
function Input({ className = "", ...props }) {
    return (
        <input
            className={`w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring ${className}`}
            {...props}
        />
    );
}
function Textarea({ className = "", ...props }) {
    return (
        <textarea
            className={`w-full px-3 py-2 border rounded-xl focus:outline-none focus:ring min-h-[100px] ${className}`}
            {...props}
        />
    );
}
function Tag({ children, tone = "gray", className = "" }) {
    const colors = {
        gray: "bg-gray-100 text-gray-700",
        blue: "bg-blue-100 text-blue-700",
        green: "bg-green-100 text-green-700",
        yellow: "bg-yellow-100 text-yellow-700",
        red: "bg-red-100 text-red-700",
        purple: "bg-purple-100 text-purple-700",
        rose: "bg-rose-100 text-rose-700",
        amber: "bg-amber-100 text-amber-700"
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] ${colors[tone] || colors.gray} ${className}`}>{children}</span>
    );
}

// --- Main App ---
export default function App() {
    const [tab, setTab] = useState("welcome"); // welcome | quiz | admin
    const [questions, setQuestions] = useState(() => loadQuestions());
    const [hints, setHints] = useState(() => loadHints()); // { [ip: string]: string }
    const [selectedIP, setSelectedIP] = useState("");
    const [basket, setBasket] = useState([]); // selected question ids before start
    const [phase, setPhase] = useState("pick"); // pick | running | confirm | finished
    const [answers, setAnswers] = useState({}); // qid -> { chosenIndices: [], manualScore: number }
    const [adminMode, setAdminMode] = useState(false);
    const [pinInput, setPinInput] = useState("");

    useEffect(() => {
        saveQuestions(questions);
    }, [questions]);
    useEffect(() => {
        saveHints(hints);
    }, [hints]);

    // Use a Set for unique IPs, then convert to Array and sort
    const ips = useMemo(() => {
        const ipSet = new Set(questions.map((q) => q.ip));
        Object.keys(hints || {}).forEach((ip) => ipSet.add(ip)); // Include IPs from hints
        return Array.from(ipSet).sort();
    }, [questions, hints]);

    const perIPCounts = useMemo(() => {
        const m = {};
        for (const id of basket) {
            const q = questions.find((x) => x.id === id);
            if (!q) continue;
            m[q.ip] = (m[q.ip] || 0) + 1;
        }
        return m;
    }, [basket, questions]);

    const inBasket = (id) => basket.includes(id);

    function toggleBasket(id) {
        if (phase !== "pick") return; // Only allow modification in pick phase

        if (inBasket(id)) {
            setBasket(basket.filter((x) => x !== id));
        } else {
            // constraints: total <=5; per IP <=2
            const q = questions.find((x) => x.id === id);
            if (!q) return; // Should not happen

            const totalOk = basket.length < 5;
            const ipOk = (perIPCounts[q.ip] || 0) < 2;

            if (!totalOk) return alert("已达总数上限（最多 5 题）");
            if (!ipOk) return alert("该 IP 已选 2 题上限");
            setBasket([...basket, id]);
        }
    }

    function startQuiz() {
        if (basket.length === 0) return alert("请先选择题目");
        setPhase("running");
        setTab("quiz");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function resetAll() {
        setBasket([]);
        setPhase("pick");
        setAnswers({});
        setTab("welcome");
        setSelectedIP("");
    }

    // scoring
    const scoreSummary = useMemo(() => {
        let total = 0;
        const byIP = {};
        const byLevel = { a: 0, b: 0, c: 0, s: 0 }; // Initialize all levels

        for (const id of basket) {
            const q = questions.find((x) => x.id === id);
            if (!q) continue; // Question might have been deleted

            const ans = answers[id];
            let gained = 0;

            if (q.type === "mcq") {
                if (ans && ans.chosenIndices) { // chosenIndices is now an array
                    const correctIndicesSet = new Set(q.correctIndices || []);
                    const chosenIndicesSet = new Set(ans.chosenIndices || []);

                    let allCorrectChosen = true;
                    let noIncorrectChosen = true;

                    // Check if all correct answers are chosen by the user
                    for (const cIdx of correctIndicesSet) {
                        if (!chosenIndicesSet.has(cIdx)) {
                            allCorrectChosen = false;
                            break;
                        }
                    }

                    // Check if no incorrect answers are chosen by the user
                    for (const cIdx of chosenIndicesSet) {
                        if (!correctIndicesSet.has(cIdx)) {
                            noIncorrectChosen = false;
                            break;
                        }
                    }

                    // Full points only if:
                    // 1. All correct answers were chosen
                    // 2. No incorrect answers were chosen
                    // 3. The number of chosen options matches the number of correct options
                    if (allCorrectChosen && noIncorrectChosen && correctIndicesSet.size === chosenIndicesSet.size) {
                        gained = LEVEL_POINTS[q.level];
                    }
                }
            } else {
                // Manual grading (admin sets ans.manualScore)
                if (ans && typeof ans.manualScore === "number") {
                    gained = ans.manualScore;
                }
            }
            total += gained;
            byIP[q.ip] = (byIP[q.ip] || 0) + gained;
            byLevel[q.level] = (byLevel[q.level] || 0) + gained; // Ensure level is initialized
        }
        return { total, byIP, byLevel };
    }, [answers, basket, questions]);


    function revealReferences() {
        setPhase("confirm");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function finishAndShowScore() {
        setPhase("finished");
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Admin login toggle
    function tryAdmin() {
        const pin = getAdminPin();
        if (pinInput === pin) {
            setAdminMode(true);
            setPinInput("");
            setTab("admin"); // Automatically switch to admin tab on login
        } else {
            alert("PIN 不正确");
        }
    }

    // --- Renderers ---
    return (
        <div className="min-h-screen bg-gray-50 text-gray-900">
            <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b">
                <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
                    <BookOpen className="w-6 h-6" />
                    <h1 className="text-lg font-semibold">IP 主题测验 · Demo</h1>
                    <div className="ml-auto flex items-center gap-2">
                        <Tag tone="blue" className="hidden sm:inline-block">总计可选 5 题；每个 IP ≤ 2 题</Tag>
                        <Button onClick={() => setTab("welcome")} className={`${tab === "welcome" ? "bg-gray-900 text-white" : ""}`}>欢迎</Button>
                        <Button onClick={() => setTab("quiz")} className={`${tab === "quiz" ? "bg-gray-900 text-white" : ""}`}>答题</Button>
                        <Button onClick={() => setTab("admin")} className={`${tab === "admin" ? "bg-gray-900 text-white" : ""}`}>管理员</Button>
                        {adminMode && (
                            <Button onClick={() => setAdminMode(false)} className="bg-red-500 text-white">退出管理</Button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-12 gap-4">
                {/* Sidebar */}
                <aside className="col-span-12 md:col-span-4 lg:col-span-3 sticky top-20 self-start">
                    <Card>
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="font-semibold">IP 列表</h2>
                            {selectedIP && <Tag tone="blue">{selectedIP}</Tag>}
                        </div>
                        <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
                            {ips.map((ip) => (
                                <button
                                    key={ip}
                                    className={`w-full text-left px-3 py-2 rounded-xl border hover:bg-gray-50 flex items-center justify-between ${selectedIP === ip ? "bg-gray-100" : ""}`}
                                    onClick={() => setSelectedIP(ip)}
                                >
                                    <span>{ip}</span>
                                    <Tag tone="green">{questions.filter((q) => q.ip === ip).length} 题</Tag>
                                </button>
                            ))}
                            {ips.length === 0 && <div className="text-sm text-gray-500">暂无题目，请到管理员页面添加。</div>}
                        </div>

                        <div className="mt-4 border-t pt-3 space-y-2">
                            <div className="text-sm">已选：{basket.length} / 5</div>
                            <div className="flex flex-wrap gap-1 text-xs">
                                {Object.entries(perIPCounts).map(([ip, n]) => (
                                    <Tag key={ip} tone={n > 2 ? "rose" : "amber"}>{ip}: {n}</Tag>
                                ))}
                            </div>
                            <div className="flex flex-col gap-2">
                                <Button className="flex-1 bg-blue-600 text-white hover:bg-blue-700" onClick={startQuiz} disabled={basket.length === 0 || phase !== "pick"}>
                                    <Play className="w-4 h-4 inline -mt-0.5" /> 开始回答
                                </Button>
                                {phase !== "pick" && ( // Only show reset button if quiz has started
                                    <Button className="border-gray-300 bg-white hover:bg-gray-50" onClick={resetAll}>
                                        <RotateCcw className="w-4 h-4 inline -mt-0.5" /> 重置
                                    </Button>
                                )}
                                {phase === "running" && (
                                    <Button className="w-full bg-orange-500 text-white hover:bg-orange-600" onClick={revealReferences}>
                                        <Eye className="w-4 h-4 inline -mt-0.5" /> 显示参考答案（非选择题）
                                    </Button>
                                )}
                                {phase === "confirm" && (
                                    <Button className="w-full bg-green-500 text-white hover:bg-green-600" onClick={finishAndShowScore}>
                                        <ListChecks className="w-4 h-4 inline -mt-0.5" /> 完成并查看总分
                                    </Button>
                                )}
                            </div>
                        </div>
                    </Card>
                </aside>

                {/* Main content */}
                <section className="col-span-12 md:col-span-8 lg:col-span-9 space-y-4">
                    {tab === "welcome" && <Welcome />}
                    {tab === "quiz" && (
                        <QuizArea
                            questions={questions}
                            hints={hints}
                            selectedIP={selectedIP}
                            basket={basket}
                            setBasket={setBasket}
                            inBasket={inBasket}
                            toggleBasket={toggleBasket}
                            phase={phase}
                            answers={answers}
                            setAnswers={setAnswers}
                            adminMode={adminMode}
                            scoreSummary={scoreSummary}
                        />
                    )}
                    {tab === "admin" && adminMode ? (
                        <AdminArea
                            questions={questions}
                            setQuestions={setQuestions}
                            hints={hints}
                            setHints={setHints}
                            onSetPin={setAdminPin}
                            selectedIP={selectedIP}
                            ips={ips} // Pass all available IPs to admin area
                        />
                    ) : tab === "admin" && (
                        <Card>
                            <h3 className="font-semibold mb-2">管理员登录</h3>
                            <div className="flex items-center gap-2">
                                <Input
                                    placeholder="管理员 PIN"
                                    value={pinInput}
                                    onChange={(e) => setPinInput(e.target.value)}
                                    type="password"
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') tryAdmin();
                                    }}
                                />
                                <Button onClick={tryAdmin} className="bg-blue-600 text-white hover:bg-blue-700"><Lock className="w-4 h-4 inline" /> 解锁</Button>
                            </div>
                        </Card>
                    )}
                </section>
            </main>
        </div>
    );
}

function Welcome() {
    return (
        <Card>
            <div className="flex items-center gap-3">
                <BookOpen className="w-6 h-6 text-blue-500" />
                <h2 className="text-xl font-semibold">欢迎来到 IP 主题测验</h2>
            </div>
            <p className="text-gray-600 mt-2">左侧选择你感兴趣的 IP 与题目（每个 IP 最多选 2 题，总计最多 5 题），随后点击「开始回答」。</p>
            <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-1">
                <li>选择题：包括单选和多选。选中后立即判分与显示正确答案。</li>
                <li>填空 / 简答 / 阅读：仅管理员可在现场选择分数；确认环节可显示参考答案。</li>
                <li>分值：A=3 分，B=2 分，C=1 分，S=5 分。</li>
                <li>管理员 PIN 默认为：`1234`。</li>
            </ul>
        </Card>
    );
}

function QuizArea({
                      questions,
                      hints,
                      selectedIP,
                      basket,
                      inBasket,
                      toggleBasket,
                      phase,
                      answers,
                      setAnswers,
                      adminMode,
                      scoreSummary,
                  }) {
    const [expandedQuestion, setExpandedQuestion] = useState(null);
    const [specialHint, setSpecialHint] = useState("");

    useEffect(() => {
        // Load special hint for the selected IP from hints map
        setSpecialHint((hints && selectedIP && hints[selectedIP]) || "");
    }, [selectedIP, hints]);

    const visibleQuestions = useMemo(() => {
        const list = phase === "pick"
            ? questions.filter((q) => !selectedIP || q.ip === selectedIP)
            : questions.filter((q) => basket.includes(q.id));
        // exclude any legacy info-type items if they exist
        return list.filter((q) => q.type !== "info");
    }, [questions, selectedIP, basket, phase]);

    function setAnswer(qid, data) {
        setAnswers((prev) => ({ ...prev, [qid]: { ...(prev[qid] || {}), ...data } }));
    }

    return (
        <div className="space-y-4 relative">
            {expandedQuestion && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="relative w-full max-w-3xl max-h-[90vh] overflow-auto">
                        <button
                            className="absolute top-4 right-4 px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition bg-gray-100 hover:bg-gray-200"
                            onClick={() => setExpandedQuestion(null)}
                        >
                            关闭
                        </button>
                        <h3 className="text-lg font-semibold mb-3">题目详情</h3>
                        <div className="prose prose-sm max-w-none">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeRaw]}
                                children={expandedQuestion.title}
                            />
                        </div>
                        {expandedQuestion.type === "mcq" && (
                            <div className="mt-3 space-y-2">
                                {expandedQuestion.options?.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <span className="font-medium">{String.fromCharCode(65 + idx)}.</span>
                                        <span>{opt}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {specialHint && (
                <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                    <h4 className="font-semibold text-yellow-800">提示</h4>
                    <p className="text-yellow-700 whitespace-pre-line">{specialHint}</p>
                </div>
            )}

            {phase === "finished" && (
                <Card>
                    <h3 className="text-lg font-semibold">总分总结</h3>
                    <p className="text-gray-700">总得分：<span className="font-bold text-xl text-blue-600">{scoreSummary.total}</span> 分</p>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <h4 className="font-medium text-gray-800">按 IP 分数</h4>
                            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mt-1">
                                {Object.entries(scoreSummary.byIP).length > 0 ? (
                                    Object.entries(scoreSummary.byIP).map(([ip, score]) => (
                                        <li key={ip}>{ip}: <span className="font-semibold">{score}</span> 分</li>
                                    ))
                                ) : (
                                    <li>暂无数据</li>
                                )}
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-medium text-gray-800">按等级分数</h4>
                            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1 mt-1">
                                {Object.entries(scoreSummary.byLevel).length > 0 ? (
                                    Object.entries(scoreSummary.byLevel).map(([level, score]) => (
                                        <li key={level}>{LEVEL_LABEL[level]}: <span className="font-semibold">{score}</span> 分</li>
                                    ))
                                ) : (
                                    <li>暂无数据</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {visibleQuestions.map((q) => (
                    <Card key={q.id} className="relative flex flex-col">
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Tag tone="blue">{q.ip}</Tag>
                                    <Tag tone={LEVEL_COLORS[q.level]}>{LEVEL_LABEL[q.level]}</Tag>
                                    <Tag tone="gray">{TYPE_LABELS[q.type]}{q.type === 'mcq' && (q.isMultiChoice ? ' (多选)' : ' (单选)')}</Tag>
                                </div>
                                <div className={`prose max-w-none text-base ${q.title.length > 100 ? "line-clamp-3 overflow-hidden" : ""}`}>
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        children={q.title}
                                    />
                                </div>
                            </div>

                            {phase === "pick" ? (
                                <button
                                    onClick={() => toggleBasket(q.id)}
                                    className={`p-2 rounded-xl border hover:bg-gray-50 transition ${inBasket(q.id) ? "bg-green-50 border-green-300 text-green-600" : "text-gray-500"}`}
                                    title={inBasket(q.id) ? "移出选择" : "加入选择"}
                                >
                                    {inBasket(q.id) ? <CheckCircle2 className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
                                </button>
                            ) : null}
                        </div>

                        {q.title.length > 100 && (
                            <Button
                                className="mt-2 bg-gray-100 hover:bg-gray-200 self-start text-gray-700"
                                onClick={() => setExpandedQuestion(q)}
                            >
                                展开完整题目
                            </Button>
                        )}

                        {q.type === "mcq" && (
                            <div className="mt-3 space-y-2">
                                {phase === "pick" ? (
                                    // Static display of options during the 'pick' phase
                                    q.options?.map((opt, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-sm text-gray-700">
                                            <span className="font-medium">{String.fromCharCode(65 + idx)}.</span>
                                            <span>{opt}</span>
                                        </div>
                                    ))
                                ) : (
                                    // Interactive options during the 'running', 'confirm', 'finished' phase
                                    <MCQBlock q={q} ans={answers[q.id]} setAns={(data) => setAnswer(q.id, data)} showReference={phase === "confirm" || phase === "finished"} />
                                )}
                            </div>
                        )}

                        {phase !== "pick" && q.type !== "mcq" && (
                            <div className="mt-3">
                                <ManualBlock
                                    q={q}
                                    ans={answers[q.id]}
                                    setAns={(data) => setAnswer(q.id, data)}
                                    showReference={phase === "confirm" || phase === "finished"}
                                    adminMode={adminMode} // Pass adminMode for grading
                                />
                            </div>
                        )}
                    </Card>
                ))}
                {visibleQuestions.length === 0 && phase === "pick" && (
                    <div className="col-span-full text-center py-8 text-gray-500 text-lg">
                        请选择左侧的 IP 以查看题目，或切换到“管理员”页面添加题目。
                    </div>
                )}
                {visibleQuestions.length === 0 && phase !== "pick" && (
                    <div className="col-span-full text-center py-8 text-gray-500 text-lg">
                        篮子中暂无题目，请重置并选择题目。
                    </div>
                )}
            </div>
        </div>
    );
}

function MCQBlock({ q, ans, setAns, showReference }) {
    const chosenIndices = ans?.chosenIndices || []; // User's chosen indices
    const correctIndices = q.correctIndices || []; // Correct indices from question
    const isMultiChoice = q.isMultiChoice;
    const hasAnswered = chosenIndices.length > 0;

    function toggleChoice(idx) {
        if (showReference) return; // Prevent changing answers if references are shown

        let newChosenIndices;
        if (isMultiChoice) {
            // For multi-choice, toggle selection
            if (chosenIndices.includes(idx)) {
                newChosenIndices = chosenIndices.filter((x) => x !== idx);
            } else {
                newChosenIndices = [...chosenIndices, idx];
            }
        } else {
            // For single-choice, replace selection
            newChosenIndices = [idx];
        }
        setAns({ chosenIndices: newChosenIndices });
    }

    // Determine correctness for display
    const isCorrectChoice = (idx) => correctIndices.includes(idx);
    const isChosenByUser = (idx) => chosenIndices.includes(idx);

    // Quiz score logic (for UI feedback)
    const allCorrectChosen = correctIndices.every(cIdx => chosenIndices.includes(cIdx));
    const noIncorrectChosen = chosenIndices.every(cIdx => correctIndices.includes(cIdx));
    const isFullyCorrect = allCorrectChosen && noIncorrectChosen && correctIndices.length === chosenIndices.length;

    return (
        <div className="space-y-2">
            {q.options?.map((opt, idx) => {
                let buttonClass = "";
                let icon = null;

                if (showReference || hasAnswered) { // Show feedback if references are out or user has answered
                    const chosen = isChosenByUser(idx);
                    const correct = isCorrectChoice(idx);

                    if (chosen && correct) { // User chose this and it's correct
                        buttonClass = "bg-green-100 border-green-400 text-green-800";
                        icon = <CheckCircle2 className="text-green-600" />;
                    } else if (chosen && !correct) { // User chose this but it's incorrect
                        buttonClass = "bg-rose-100 border-rose-400 text-rose-800";
                        icon = <XCircle className="text-rose-600" />;
                    } else if (!chosen && correct && showReference) { // User didn't choose but it's correct (only if showing reference)
                        buttonClass = "bg-green-50 border-green-200 text-green-700 opacity-80"; // Highlight correct answer
                        icon = <CheckCircle2 className="text-green-500" />;
                    }
                }

                return (
                    <button
                        key={idx}
                        className={`w-full text-left px-3 py-2 rounded-xl border flex items-center justify-between transition ${
                            showReference ? "cursor-not-allowed" : "hover:bg-gray-50"
                        } ${buttonClass}`}
                        onClick={() => toggleChoice(idx)}
                        disabled={showReference}
                    >
                        <span className="mr-2 font-medium">{String.fromCharCode(65 + idx)}.</span>
                        <span className="flex-1 text-gray-800">{opt}</span>
                        {icon}
                    </button>
                );
            })}
            {(showReference || hasAnswered) && (
                <div className="text-sm mt-1 p-2 rounded-lg bg-gray-50 border border-gray-200">
                    正确答案：
                    {correctIndices.length > 0 ? (
                        correctIndices.map((idx, i) => (
                            <Tag key={i} tone="green" className="mr-1">
                                {String.fromCharCode(65 + idx)}
                            </Tag>
                        ))
                    ) : (
                        <Tag tone="gray">无</Tag> // Should not happen for MCQs
                    )}
                    {showReference && q.reference && (
                        <div className="mt-2 text-gray-700">
                            <span className="font-medium">解释:</span>
                            <div className="prose prose-sm max-w-none ml-2 inline-block">
                                <ReactMarkdown>{q.reference}</ReactMarkdown>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ManualBlock({ q, ans, setAns, showReference, adminMode }) {
    const maxPoints = LEVEL_POINTS[q.level];
    const manualScore = ans?.manualScore; // Current score given by admin

    // Define scoring options based on question type
    // Fill-in-the-blank might be all or nothing, or partial. Let's make it flexible.
    const choices = Array.from({ length: maxPoints + 1 }, (_, i) => i); // 0 to maxPoints

    const canGrade = adminMode && !showReference; // Admin can grade only before references are shown

    return (
        <div className="space-y-2">
            {!adminMode && <div className="text-sm text-gray-600">此题需管理员评分。</div>}
            {adminMode && (
                <div className="flex gap-2 items-center">
                    <span className="text-sm font-medium">评分 ({maxPoints} 分):</span>
                    {choices.map((p) => (
                        <Button
                            key={p}
                            onClick={() => setAns({ manualScore: p })}
                            className={`${manualScore === p ? "bg-blue-600 text-white" : "bg-gray-100 hover:bg-gray-200"}`}
                            disabled={!canGrade}
                        >
                            {p} 分
                        </Button>
                    ))}
                </div>
            )}
            {!adminMode && manualScore !== undefined && (
                <div className="text-sm text-gray-700">
                    你的得分：<Tag tone="blue">{manualScore}</Tag> 分
                </div>
            )}

            {(showReference || adminMode) && q.reference && ( // Admin can always see reference
                <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-900">
                    <div className="font-medium mb-1">参考答案</div>
                    <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{q.reference}</ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
}

function AdminArea({ questions, setQuestions, hints, setHints, selectedIP, ips }) {
    const [form, setForm] = useState(null); // null indicates no editing
    const [newIp, setNewIp] = useState("");
    const [specialHint, setSpecialHint] = useState(() => (selectedIP ? (hints?.[selectedIP] || "") : ""));
    const [adminPin, setAdminPinState] = useState(getAdminPin());
    const [newAdminPin, setNewAdminPin] = useState("");


    useEffect(() => {
        setSpecialHint(selectedIP ? (hints?.[selectedIP] || "") : "");
    }, [selectedIP, hints]);

    function resetForm() {
        setForm({
            id: "",
            ip: selectedIP || (ips.length > 0 ? ips[0] : ""), // Pre-select current IP or first available
            type: "mcq",
            level: "b",
            title: "",
            options: ["", "", "", ""],
            correctIndices: [], // Now an array
            isMultiChoice: false, // Default to single choice
            reference: ""
        });
    }

    function saveSpecialHint() {
        if (!selectedIP) return alert("请先选择一个 IP 分类来保存提示。");
        setHints((prev) => ({ ...(prev || {}), [selectedIP]: specialHint }));
        alert("特殊提示已保存！");
    }

    function saveQuestion() {
        const payload = { ...form };
        if (!payload.ip || !payload.title) return alert("请填写 IP 名称与题目内容");

        if (payload.type === "mcq") {
            // Filter out empty options before validation
            payload.options = payload.options.filter(o => o.trim() !== "");
            if (payload.options.length < 2) return alert("选择题至少需要两个选项。");
            if (payload.options.some((o) => !o)) return alert("请填写完整选项。");

            if (!payload.correctIndices || payload.correctIndices.length === 0) {
                return alert("请选择至少一个正确选项。");
            }
            // Ensure correctIndices only contain valid indices for existing options
            payload.correctIndices = payload.correctIndices.filter(idx => idx >= 0 && idx < payload.options.length);

        } else {
            // Non-MCQ types don't need options, correctIndices, isMultiChoice
            delete payload.options;
            delete payload.correctIndices;
            delete payload.isMultiChoice;
            // Reference is optional for these, but good to have
        }

        if (payload.id) {
            // Update existing question
            setQuestions((prev) => prev.map((q) => (q.id === payload.id ? payload : q)));
        } else {
            // Add new question
            payload.id = uid();
            setQuestions((prev) => [payload, ...prev]);
        }
        setForm(null); // Close the form
    }

    function deleteQuestion(id) {
        if (window.confirm("确定要删除此题目吗？此操作不可逆！")) {
            setQuestions((prev) => prev.filter((q) => q.id !== id));
        }
    }

    function addNewIp() {
        const name = newIp.trim();
        if (!name) return alert("IP 名称不能为空。");
        // Check if IP already exists in questions or hints
        const exists = questions.some((q) => q.ip === name) || Object.keys(hints || {}).some(ip => ip === name);
        if (exists) return alert("IP 名称已存在，请勿重复添加。");

        // Create an empty hint entry for the new IP to make it show up in the IP list
        setHints((prev) => ({ ...(prev || {}), [name]: "" }));
        setNewIp("");
        alert(`IP "${name}" 已添加！`);
    }

    function changeAdminPin() {
        const newPin = newAdminPin.trim();
        if (!newPin) return alert("新 PIN 码不能为空。");
        if (newPin.length < 4) return alert("PIN 码至少需要 4 位。");

        setAdminPin(newPin);
        setAdminPinState(newPin); // Update local state for display
        setNewAdminPin("");
        alert("管理员 PIN 码已更新！");
    }

    const filteredQuestions = useMemo(() => {
        const arr = selectedIP ? questions.filter((q) => q.ip === selectedIP) : questions;
        return arr.filter((q) => q.type !== "info"); // Hide legacy info-type items
    }, [questions, selectedIP]);

    return (
        <div className="space-y-4 relative">
            <Card>
                <h3 className="font-semibold mb-2">添加/管理 IP 分类</h3>
                <div className="flex items-center gap-2 mb-4">
                    <Input
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        placeholder="输入新 IP 名称"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') addNewIp();
                        }}
                    />
                    <Button onClick={addNewIp} className="bg-blue-600 text-white hover:bg-blue-700">添加 IP</Button>
                </div>
                <h4 className="font-semibold mb-2">当前 IP 特殊提示 ({selectedIP || "未选择"})</h4>
                <div className="flex flex-col gap-2">
                    <Textarea
                        value={specialHint}
                        onChange={(e) => setSpecialHint(e.target.value)}
                        placeholder="输入当前 IP 的特殊提示 (支持 Markdown)"
                        className="min-h-[80px]"
                    />
                    <Button onClick={saveSpecialHint} className="bg-green-600 text-white hover:bg-green-700" disabled={!selectedIP}>保存提示</Button>
                </div>
            </Card>

            <Card>
                <h3 className="font-semibold mb-2">修改管理员 PIN 码</h3>
                <div className="flex items-center gap-2">
                    <Input
                        placeholder="输入新的管理员 PIN"
                        value={newAdminPin}
                        onChange={(e) => setNewAdminPin(e.target.value)}
                        type="password"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') changeAdminPin();
                        }}
                    />
                    <Button onClick={changeAdminPin} className="bg-purple-600 text-white hover:bg-purple-700">更新 PIN</Button>
                </div>
                <p className="text-sm text-gray-500 mt-2">当前 PIN 码 (仅供参考，请勿泄露): <Tag>{adminPin}</Tag></p>
            </Card>


            <Card>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold">题库（共 {filteredQuestions.length} 题 {selectedIP && `，${selectedIP} IP 下的题目`}）</h3>
                    <Button onClick={resetForm} className="bg-blue-600 text-white hover:bg-blue-700">
                        <PlusCircle className="w-4 h-4 inline mr-1" /> 新建题目
                    </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredQuestions.length === 0 && (
                        <div className="col-span-full text-center py-4 text-gray-500">
                            暂无题目。点击“新建题目”添加一个。
                        </div>
                    )}
                    {filteredQuestions.map((q) => (
                        <div key={q.id} className="p-3 rounded-xl border relative shadow-sm hover:shadow-md transition bg-white flex flex-col justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Tag tone="blue">{q.ip}</Tag>
                                    <Tag tone={LEVEL_COLORS[q.level]}>{LEVEL_LABEL[q.level]}</Tag>
                                    <Tag tone="gray">{TYPE_LABELS[q.type]}{q.type === 'mcq' && (q.isMultiChoice ? ' (多选)' : ' (单选)')}</Tag>
                                </div>
                                <div className={`prose max-w-none text-base ${q.title.length > 120 ? "line-clamp-3 overflow-hidden" : ""}`}>
                                    <ReactMarkdown>{q.title}</ReactMarkdown>
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <Button onClick={() => setForm(q)} className="bg-gray-100 hover:bg-gray-200 text-gray-700"><Pencil className="w-4 h-4 inline mr-1" /> 编辑</Button>
                                <Button onClick={() => deleteQuestion(q.id)} className="text-rose-600 border-rose-300 bg-rose-50 hover:bg-rose-100"><Trash2 className="w-4 h-4 inline mr-1" /> 删除</Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {/* Question Edit/Create Form Modal */}
            {form && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <Card className="relative w-full max-w-3xl max-h-[95vh] overflow-y-auto">
                        <button
                            className="absolute top-4 right-4 px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition bg-gray-100 hover:bg-gray-200"
                            onClick={() => setForm(null)}
                        >
                            关闭
                        </button>
                        <h3 className="text-lg font-semibold mb-4">{form.id ? "编辑题目" : "新建题目"}</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">IP 名称</label>
                                <select
                                    className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                    value={form.ip}
                                    onChange={(e) => setForm({ ...form, ip: e.target.value })}
                                >
                                    <option value="">选择 IP</option>
                                    {ips.map((ip) => ( // Use all available IPs
                                        <option key={ip} value={ip}>{ip}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">题目类型</label>
                                <select
                                    className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                    value={form.type}
                                    onChange={(e) => {
                                        const newType = e.target.value;
                                        setForm((prevForm) => {
                                            const newState = { ...prevForm, type: newType };
                                            // Reset type-specific fields when changing type
                                            if (newType !== "mcq") {
                                                delete newState.options;
                                                delete newState.correctIndices;
                                                delete newState.isMultiChoice;
                                            } else {
                                                // Ensure MCQ specific fields exist
                                                newState.options = prevForm.options || ["", "", "", ""];
                                                newState.correctIndices = prevForm.correctIndices || [];
                                                newState.isMultiChoice = prevForm.isMultiChoice || false;
                                            }
                                            return newState;
                                        });
                                    }}
                                >
                                    {Object.entries(TYPE_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">难度等级</label>
                                <select
                                    className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                    value={form.level}
                                    onChange={(e) => setForm({ ...form, level: e.target.value })}
                                >
                                    {Object.entries(LEVEL_LABEL).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">题干（支持 Markdown）</label>
                                <Textarea
                                    value={form.title}
                                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                                    placeholder="输入题目内容..."
                                    className="min-h-[120px]"
                                />
                            </div>

                            {form.type === "mcq" && (
                                <div className="md:col-span-2 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="isMultiChoice"
                                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                            checked={form.isMultiChoice || false}
                                            onChange={(e) => {
                                                const newIsMultiChoice = e.target.checked;
                                                let newCorrectIndices = [...(form.correctIndices || [])];
                                                if (!newIsMultiChoice && newCorrectIndices.length > 1) {
                                                    // If switching to single choice, keep only the first correct index
                                                    newCorrectIndices = [newCorrectIndices[0]];
                                                }
                                                setForm({ ...form, isMultiChoice: newIsMultiChoice, correctIndices: newCorrectIndices });
                                            }}
                                        />
                                        <label htmlFor="isMultiChoice" className="text-sm font-medium text-gray-700">允许多选</label>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {[0, 1, 2, 3].map((i) => ( // Support up to 4 options, can be expanded
                                            <div key={i} className="flex items-center gap-2 border rounded-xl p-2 bg-gray-50">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        let newCorrectIndices = [...(form.correctIndices || [])];
                                                        if ((form.isMultiChoice || false)) {
                                                            // Toggle selection for multi-choice
                                                            if (newCorrectIndices.includes(i)) {
                                                                newCorrectIndices = newCorrectIndices.filter((idx) => idx !== i);
                                                            } else {
                                                                newCorrectIndices.push(i);
                                                            }
                                                        } else {
                                                            // For single-choice, just select this one
                                                            newCorrectIndices = [i];
                                                        }
                                                        setForm({ ...form, correctIndices: newCorrectIndices.sort((a,b) => a-b) });
                                                    }}
                                                    className={`w-6 h-6 flex items-center justify-center rounded-full border transition ${
                                                        (form.correctIndices || []).includes(i) ? "bg-blue-500 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-600"
                                                    }`}
                                                >
                                                    {String.fromCharCode(65 + i)}
                                                </button>
                                                <Input
                                                    placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                                                    value={form.options?.[i] || ""}
                                                    onChange={(e) => {
                                                        const arr = [...(form.options || ["", "", "", ""])];
                                                        arr[i] = e.target.value;
                                                        setForm({ ...form, options: arr });
                                                    }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-sm text-gray-600">
                                        正确选项: {' '}
                                        {(form.correctIndices || []).length > 0
                                            ? (form.correctIndices || []).map(idx => String.fromCharCode(65 + idx)).join(', ')
                                            : '未选择'}
                                    </p>
                                </div>
                            )}

                            {form.type !== "mcq" && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">参考答案（Markdown，可选）</label>
                                    <Textarea
                                        value={form.reference || ""}
                                        onChange={(e) => setForm({ ...form, reference: e.target.value })}
                                        placeholder="输入参考答案内容..."
                                        className="min-h-[100px]"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex gap-3 justify-end border-t pt-4">
                            <Button onClick={saveQuestion} className="bg-blue-600 text-white hover:bg-blue-700">
                                <Save className="w-4 h-4 inline mr-1" /> 保存题目
                            </Button>
                            <Button onClick={() => setForm(null)} className="bg-gray-200 text-gray-700 hover:bg-gray-300">
                                <RotateCcw className="w-4 h-4 inline mr-1" /> 取消
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}