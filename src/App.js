import React, { useEffect, useMemo, useState } from "react";
//import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import {
    //ChevronRight,
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
import { getQuestions, saveQuestions, saveHints } from "./dataSource";

// --- Types ---
/**
 * Question types:
 * - mcq: multiple choice
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
const LS_HINTS = "ipquiz.hints.v1";
const LS_PIN = "ipquiz.admin.pin";
// Note: question/hint persistence is provided by `dataSource.js` which
// exports `getQuestions`, `saveQuestions`, `getHints`, `saveHints`.
// Keep admin PIN helpers here.
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
function Tag({ children, tone = "gray" }) {
    const colors = {
        gray: "bg-gray-100 text-gray-700",
        blue: "bg-blue-100 text-blue-700",
        green: "bg-green-100 text-green-700",
        yellow: "bg-yellow-100 text-yellow-700",
        red: "bg-red-100 text-red-700",
        purple: "bg-purple-100 text-purple-700",
    };
    return (
        <span className={`px-2 py-0.5 rounded-full text-[11px] ${colors[tone] || colors.gray}`}>{children}</span>
    );
}

// --- Main App ---
export default function App() {
    const [tab, setTab] = useState("welcome"); // welcome | quiz | admin
    const [questions, setQuestions] = useState([]);
    const [hints, setHints] = useState({}); // { [ip: string]: string }
    const [selectedIP, setSelectedIP] = useState("");
    const [basket, setBasket] = useState([]); // selected question ids before start
    const [phase, setPhase] = useState("pick"); // pick | running | confirm | finished
    const [answers, setAnswers] = useState({}); // qid -> { type-specific }
    const [adminMode, setAdminMode] = useState(false);
    const [pinInput, setPinInput] = useState("");

    useEffect(() => {
        async function fetchQuestions() {
            const data = await getQuestions();
            setQuestions(data);
        }
        fetchQuestions();
    }, []);

    useEffect(() => {
        saveQuestions(questions);
    }, [questions]);
    useEffect(() => {
        saveHints(hints);
    }, [hints]);
    useEffect(() => {
        // Clear hints from localStorage on page load
        localStorage.removeItem(LS_HINTS);
    }, []);

    const ips = useMemo(() => {
        const set = new Set(questions.map((q) => q.ip));
        Object.keys(hints || {}).forEach((ip) => set.add(ip));
        return Array.from(set).sort();
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
        if (inBasket(id)) setBasket(basket.filter((x) => x !== id));
        else {
            // constraints: total <=5; per IP <=2
            const q = questions.find((x) => x.id === id);
            const totalOk = basket.length < 5;
            const ipOk = ((perIPCounts[q.ip] || 0) < 2) || inBasket(id);
            if (!totalOk) return alert("已达总数上限（最多 5 题）");
            if (!ipOk) return alert("该 IP 已选 2 题上限");
            setBasket([...basket, id]);
        }
    }

    function startQuiz() {
        if (basket.length === 0) return alert("请先选择题目");
        setPhase("running");
        setTab("quiz");
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
        const byLevel = { a: 0, b: 0, c: 0, s: 0 };
        for (const id of basket) {
            const q = questions.find((x) => x.id === id);
            if (!q) continue;
            const ans = answers[id];
            let gained = 0;
            if (q.type === "mcq") {
                if (ans && ans.choiceIndex === q.correctIndex) gained = LEVEL_POINTS[q.level];
            } else {
                // manual grading (admin sets ans.manualScore)
                if (ans && typeof ans.manualScore === "number") gained = ans.manualScore;
            }
            total += gained;
            byIP[q.ip] = (byIP[q.ip] || 0) + gained;
            byLevel[q.level] += gained;
        }
        return { total, byIP, byLevel };
    }, [answers, basket, questions]);

    function revealReferences() {
        setPhase("confirm");
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
                        <Tag tone="blue">总计可选 5 题；每个 IP ≤ 2 题</Tag>
                        <Button onClick={() => setTab("welcome")} className={`${tab === "welcome" ? "bg-gray-900 text-white" : ""}`}>欢迎</Button>
                        <Button onClick={() => setTab("quiz")} className={`${tab === "quiz" ? "bg-gray-900 text-white" : ""}`}>答题</Button>
                        <Button onClick={() => setTab("admin")} className={`${tab === "admin" ? "bg-gray-900 text-white" : ""}`}>管理员</Button>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-12 gap-4">
                {/* Sidebar */}
                <aside className="col-span-12 md:col-span-4 lg:col-span-3">
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
                            <div className="flex gap-2">
                                <Button className="flex-1" onClick={startQuiz} disabled={basket.length === 0 || phase !== "pick"}>
                                    <Play className="w-4 h-4 inline -mt-0.5" /> 开始回答
                                </Button>
                                <Button className="" onClick={resetAll}>
                                    <RotateCcw className="w-4 h-4 inline -mt-0.5" /> 重置
                                </Button>
                            </div>
                            {phase === "running" && (
                                <Button className="w-full" onClick={revealReferences}>
                                    <Eye className="w-4 h-4 inline -mt-0.5" /> 显示参考答案（非选择题）
                                </Button>
                            )}
                            {phase === "confirm" && (
                                <Button className="w-full" onClick={finishAndShowScore}>
                                    <ListChecks className="w-4 h-4 inline -mt-0.5" /> 完成并查看总分
                                </Button>
                            )}
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
                                />
                                <Button onClick={tryAdmin}><Lock className="w-4 h-4 inline" /> 解锁</Button>
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
                <BookOpen />
                <h2 className="text-xl font-semibold">欢迎来到 IP 主题测验</h2>
            </div>
            <p className="text-gray-600 mt-2">左侧选择你感兴趣的 IP 与题目（每个 IP 最多选 2 题，总计最多 5 题），随后点击「开始回答」。</p>
            <ul className="mt-3 text-sm text-gray-700 list-disc pl-5 space-y-1">
                <li>选择题：选中后立即判分与显示正确答案。</li>
                <li>填空 / 简答 / 阅读：仅管理员可在现场选择分数；确认环节可显示参考答案。</li>
                <li>分值：A=3 分，B=2 分，C=1 分，S=5 分。</li>
            </ul>
        </Card>
    );
}

function QuizArea({
    questions,
    hints,
  selectedIP,
  basket,
  setBasket,
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
        <div className="absolute top-0 left-0 w-full z-50 bg-white p-4 shadow-lg border rounded-xl">
          <button
            className="absolute top-2 right-2 px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition bg-gray-100 hover:bg-gray-200"
            onClick={() => setExpandedQuestion(null)}
          >
            关闭
          </button>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              children={expandedQuestion.title}
            />
          </div>
        </div>
      )}

            {specialHint && (
                <div className="p-3 bg-yellow-100 border border-yellow-300 rounded-lg">
                    <h4 className="font-semibold text-yellow-800">提示</h4>
                    <p className="text-yellow-700 whitespace-pre-line">{specialHint}</p>
                </div>
            )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {visibleQuestions.map((q) => (
          <Card key={q.id} className="relative">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Tag tone="blue">{q.ip}</Tag>
                  <Tag tone={LEVEL_COLORS[q.level]}>{LEVEL_LABEL[q.level]}</Tag>
                  <Tag tone="gray">{TYPE_LABELS[q.type]}</Tag>
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
                  className={`p-2 rounded-xl border hover:bg-gray-50 ${inBasket(q.id) ? "bg-green-50 border-green-300" : ""}`}
                  title={inBasket(q.id) ? "移出选择" : "加入选择"}
                >
                  {inBasket(q.id) ? <CheckCircle2 /> : <PlusCircle />}
                </button>
              ) : null}
            </div>

            {q.type === "mcq" && (
              <div className="mt-3 space-y-2">
                {phase === "pick" ? (
                  // Static display of options during the 'pick' phase
                  q.options?.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="font-medium">{String.fromCharCode(65 + idx)}.</span>
                      <span>{opt}</span>
                    </div>
                  ))
                ) : (
                  // Interactive options during the 'running' phase
                  <MCQBlock q={q} ans={answers[q.id]} setAns={(data) => setAnswer(q.id, data)} />
                )}
              </div>
            )}

            {q.title.length > 100 && (
              <button
                className="px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition bg-gray-100 hover:bg-gray-200 mt-2"
                onClick={() => setExpandedQuestion(q)}
              >
                展开
              </button>
            )}

            {phase !== "pick" && q.type !== "mcq" && (
              <div className="mt-3">
                <ManualBlock
                  q={q}
                  ans={answers[q.id]}
                  setAns={(data) => setAnswer(q.id, data)}
                  showReference={phase === "confirm" || phase === "finished"}
                />
              </div>
            )}
          </Card>
        ))}
      </div>

      {phase === "finished" && (
        <div className="p-4 rounded-xl border bg-white shadow">
          <h3 className="text-lg font-semibold">总分</h3>
          <p className="text-gray-700">总得分：{scoreSummary.total} 分</p>
          <div className="mt-2">
            <h4 className="font-medium">按 IP 分数</h4>
            <ul className="list-disc pl-5 text-sm text-gray-600">
              {Object.entries(scoreSummary.byIP).map(([ip, score]) => (
                <li key={ip}>{ip}: {score} 分</li>
              ))}
            </ul>
          </div>
          <div className="mt-2">
            <h4 className="font-medium">按等级分数</h4>
            <ul className="list-disc pl-5 text-sm text-gray-600">
              {Object.entries(scoreSummary.byLevel).map(([level, score]) => (
                <li key={level}>{LEVEL_LABEL[level]}: {score} 分</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function MCQBlock({ q, ans, setAns }) {
    const chosen = ans?.choiceIndex;
    const correct = q.correctIndex;
    function choose(idx) {
        setAns({ choiceIndex: idx });
    }
    return (
        <div className="space-y-2">
            {q.options?.map((opt, idx) => {
                const isChosen = chosen === idx;
                const isCorrect = correct === idx;
                const judged = typeof chosen === "number";
                return (
                    <button
                        key={idx}
                        className={`w-full text-left px-3 py-2 rounded-xl border hover:bg-gray-50 flex items-center justify-between ${
                            judged && isCorrect ? "bg-green-50 border-green-300" : ""
                        } ${judged && isChosen && !isCorrect ? "bg-rose-50 border-rose-300" : ""}`}
                        onClick={() => choose(idx)}
                    >
                        <span className="mr-2">{String.fromCharCode(65 + idx)}.</span>
                        <span className="flex-1">{opt}</span>
                        {judged && isCorrect && <CheckCircle2 className="text-green-600" />}
                        {judged && isChosen && !isCorrect && <XCircle className="text-rose-600" />}
                    </button>
                );
            })}
            {typeof chosen === "number" && (
                <div className="text-sm mt-1">
                    正确答案：<Tag tone="green">{String.fromCharCode(65 + q.correctIndex)}</Tag>
                </div>
            )}
        </div>
    );
}

function ManualBlock({ q, ans, setAns, showReference }) {
    const pts = LEVEL_POINTS[q.level];
    const manual = ans?.manualScore;

    // Define scoring options based on question type
    const choices = q.type === "fill" ? [0, pts] : Array.from({ length: pts + 1 }, (_, i) => i);

    return (
        <div className="space-y-2">
            <div className="text-sm text-gray-600">此题需管理员评分。</div>
            <div className="flex gap-2 items-center">
                {choices.map((p) => (
                    <Button
                        key={p}
                        onClick={() => setAns({ manualScore: p })}
                        className={`${manual === p ? "bg-gray-900 text-white" : ""}`}
                    >
                        {p} 分
                    </Button>
                ))}
            </div>
            {showReference && q.reference && (
                <div className="mt-2 p-3 rounded-xl bg-amber-50 border text-sm">
                    <div className="font-medium mb-1">参考答案</div>
                    <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{q.reference}</ReactMarkdown>
                    </div>
                </div>
            )}
        </div>
    );
}

function AdminArea({ questions, setQuestions, hints, setHints, selectedIP }) {
    const [form, setForm] = useState(null); // null indicates no editing
    const [newIp, setNewIp] = useState("");
    const [specialHint, setSpecialHint] = useState(() => (selectedIP ? (hints?.[selectedIP] || "") : ""));

    useEffect(() => {
        setSpecialHint(selectedIP ? (hints?.[selectedIP] || "") : "");
    }, [selectedIP, hints]);

    function resetForm() {
        setForm({ id: "", ip: selectedIP || "", type: "mcq", level: "b", title: "", options: ["", "", "", ""], correctIndex: 0, reference: "" });
    }

    function saveSpecialHint() {
        if (!selectedIP) return alert("请先选择一个 IP 分类");
        setHints((prev) => ({ ...(prev || {}), [selectedIP]: specialHint }));
        alert("特殊提示已保存");
    }

    function saveQuestion() {
        const payload = { ...form };
        if (!payload.ip || !payload.title) return alert("请填写 IP 与题目内容");
        if (payload.type === "mcq") {
            if (!payload.options?.length || payload.options.some((o) => !o)) return alert("请填写完整选项");
        }
        if (payload.id) {
            // update
            setQuestions((prev) => prev.map((q) => (q.id === payload.id ? payload : q)));
        } else {
            payload.id = uid();
            setQuestions((prev) => [payload, ...prev]);
        }
        setForm(null);
    }

    function deleteQuestion(id) {
        if (window.confirm("确定要删除此题目吗？")) {
            setQuestions((prev) => prev.filter((q) => q.id !== id));
        }
    }

    function addNewIp() {
        const name = newIp.trim();
        if (!name) return alert("IP 名称不能为空");
        const exists = questions.some((q) => q.ip === name) || !!hints?.[name];
        if (exists) return alert("IP 名称已存在");
        // create empty hint entry for the new IP
        setHints((prev) => ({ ...(prev || {}), [name]: "" }));
        setNewIp("");
    }

    const filteredQuestions = useMemo(() => {
        const arr = selectedIP ? questions.filter((q) => q.ip === selectedIP) : questions;
        // hide any legacy info-type items in admin list
        return arr.filter((q) => q.type !== "info");
    }, [questions, selectedIP]);

    return (
        <div className="space-y-4 relative">
            <Card>
                <h3 className="font-semibold mb-2">添加新 IP</h3>
                <div className="flex items-center gap-2">
                    <Input
                        value={newIp}
                        onChange={(e) => setNewIp(e.target.value)}
                        placeholder="输入新 IP 名称"
                    />
                    <Button onClick={addNewIp} className="bg-blue-500 text-white">添加</Button>
                </div>
            </Card>

            <Card>
                <h3 className="font-semibold mb-2">当前 IP 特殊提示</h3>
                <div className="flex flex-col gap-2">
                    <Textarea
                        value={specialHint}
                        onChange={(e) => setSpecialHint(e.target.value)}
                        placeholder="输入当前 IP 的特殊提示"
                        className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring"
                    />
                    <Button onClick={saveSpecialHint} className="bg-blue-500 text-white">保存提示</Button>
                </div>
            </Card>

            <Card>
                <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">题库（{filteredQuestions.length}）</h3>
                    <Button onClick={resetForm} className="bg-green-500 text-white">新建题目</Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredQuestions.map((q) => (
                        <div key={q.id} className="p-3 rounded-xl border relative">
                            <div className="flex items-center gap-2 mb-1">
                                <Tag tone="blue">{q.ip}</Tag>
                                <Tag tone={LEVEL_COLORS[q.level]}>{LEVEL_LABEL[q.level]}</Tag>
                                <Tag tone="gray">{TYPE_LABELS[q.type]}</Tag>
                            </div>
                            <div className={`prose max-w-none text-base ${q.title.length > 100 ? "line-clamp-3 overflow-hidden" : ""}`}>
                                <ReactMarkdown>{q.title}</ReactMarkdown>
                            </div>
                            <div className="mt-2 flex gap-2">
                                <Button onClick={() => setForm(q)}><Pencil className="w-4 h-4 inline" /> 编辑</Button>
                                <Button onClick={() => deleteQuestion(q.id)} className="text-rose-600 border-rose-300"><Trash2 className="w-4 h-4 inline" /> 删除</Button>
                            </div>
                        </div>
                    ))}
                </div>
            </Card>

            {form && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="relative bg-white p-4 shadow-lg border rounded-xl w-full max-w-2xl">
                        <button
                            className="absolute top-2 right-2 px-3 py-2 rounded-2xl shadow-sm border text-sm hover:shadow transition bg-gray-100 hover:bg-gray-200"
                            onClick={() => setForm(null)}
                        >
                            关闭
                        </button>
                        <div className="prose prose-sm max-w-none">
                            <h3 className="font-semibold">{form.id ? "编辑题目" : "新建题目"}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-sm">IP 名称</label>
                                    <select
                                        className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                        value={form.ip}
                                        onChange={(e) => setForm({ ...form, ip: e.target.value })}
                                    >
                                        <option value="">选择 IP</option>
                                        {Array.from(new Set(questions.map((q) => q.ip))).map((ip) => (
                                            <option key={ip} value={ip}>{ip}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm">题目类型</label>
                                    <select
                                        className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value })}
                                    >
                                        {Object.entries(TYPE_LABELS).map(([key, label]) => (
                                            <option key={key} value={key}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm">难度等级</label>
                                    <select
                                        className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                        value={form.level}
                                        onChange={(e) => setForm({ ...form, level: e.target.value })}
                                    >
                                        <option value="a">A（3 分）</option>
                                        <option value="b">B（2 分）</option>
                                        <option value="c">C（1 分）</option>
                                        <option value="s">S（5 分）</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-sm">题干（支持 Markdown）</label>
                                    <Textarea value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                                </div>

                                {form.type === "mcq" && (
                                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {[0, 1, 2, 3].map((i) => (
                                            <div key={i} className="flex items-center gap-2">
                                                <Tag tone="gray">{String.fromCharCode(65 + i)}</Tag>
                                                <Input
                                                    value={form.options[i] || ""}
                                                    onChange={(e) => {
                                                        const arr = [...form.options];
                                                        arr[i] = e.target.value;
                                                        setForm({ ...form, options: arr });
                                                    }}
                                                />
                                            </div>
                                        ))}
                                        <div className="md:col-span-2">
                                            <label className="text-sm">正确选项</label>
                                            <select
                                                className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                                value={form.correctIndex}
                                                onChange={(e) => setForm({ ...form, correctIndex: Number(e.target.value) })}
                                            >
                                                {[0, 1, 2, 3].map((i) => (
                                                    <option key={i} value={i}>{String.fromCharCode(65 + i)}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {form.type !== "mcq" && (
                                    <div className="md:col-span-2">
                                        <label className="text-sm">参考答案（Markdown，可选）</label>
                                        <Textarea value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
                                    </div>
                                )}
                            </div>

                            <div className="mt-3 flex gap-2">
                                <Button onClick={saveQuestion} className="bg-gray-900 text-white"><Save className="w-4 h-4 inline" /> 保存题目</Button>
                                <Button onClick={() => setForm(null)}><RotateCcw className="w-4 h-4 inline" /> 取消</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
