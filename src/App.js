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
    Unlock,
    RotateCcw,
    Save,
    ListChecks,
} from "lucide-react";
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

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
const LS_KEY = "ipquiz.questions.v1";
const LS_PIN = "ipquiz.admin.pin";

function loadQuestions() {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return demoSeed();
    try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr;
    } catch (e) {}
    return demoSeed();
}
function saveQuestions(arr) {
    localStorage.setItem(LS_KEY, JSON.stringify(arr));
}
function getAdminPin() {
    return localStorage.getItem(LS_PIN) || "1234"; // default pin
}
function setAdminPin(pin) {
    localStorage.setItem(LS_PIN, pin);
}

// --- Demo seed data ---
function demoSeed() {
    const q = [
        {
            id: uid(),
            ip: "霓虹偶像",
            type: "mcq",
            level: "b",
            title: "Cyalume 最常见的中文俗称是？",
            options: ["荧光棒", "夜明珠", "手电筒", "电子烟"],
            correctIndex: 0,
        },
        {
            id: uid(),
            ip: "霓虹偶像",
            type: "short",
            level: "a",
            title:
                "简答：简述 wotagei 的核心节奏特点（可用要点形式）。",
            reference: "要点示例：8 拍循环；call & response；高抬手；队形变换。",
        },
        {
            id: uid(),
            ip: "科幻阅读",
            type: "reading",
            level: "c",
            title:
                "阅读：\n\n> 人类登上了一颗被称为‘拂晓’的潮汐锁定行星……\n\n问题：请概述潮汐锁定对昼夜与气候的影响（2-3 点）。",
            reference:
                "参考要点：昼夜半球固定；昏线温差适中；大气循环极端；宜居带在晨昏圈。",
        },
        {
            id: uid(),
            ip: "动画 IP",
            type: "fill",
            level: "b",
            title: "填空：\n\n**NSYC** 可被戏拟为一句口号：Never Stop Your _______",
            reference: "Cyalume",
        },
        {
            id: uid(),
            ip: "动画 IP",
            type: "mcq",
            level: "s",
            title: "选择：下列哪一项**不**属于常见应援色？",
            options: ["水蓝", "樱粉", "柠黄", "潘通 448C"],
            correctIndex: 3,
        },
    ];
    localStorage.setItem(LS_KEY, JSON.stringify(q));
    return q;
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
    const [questions, setQuestions] = useState(() => loadQuestions());
    const [selectedIP, setSelectedIP] = useState("");
    const [basket, setBasket] = useState([]); // selected question ids before start
    const [phase, setPhase] = useState("pick"); // pick | running | confirm | finished
    const [answers, setAnswers] = useState({}); // qid -> { type-specific }
    const [adminMode, setAdminMode] = useState(false);
    const [pinInput, setPinInput] = useState("");

    useEffect(() => {
        saveQuestions(questions);
    }, [questions]);

    const ips = useMemo(() => Array.from(new Set(questions.map((q) => q.ip))).sort(), [questions]);

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
                        <Tag tone="violet">总计可选 5 题；每个 IP ≤ 2 题</Tag>
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

                            <div className="mt-2 flex items-center gap-2">
                                <Input
                                    placeholder="管理员 PIN（默认 1234）"
                                    value={pinInput}
                                    onChange={(e) => setPinInput(e.target.value)}
                                    type="password"
                                />
                                {adminMode ? (
                                    <Tag tone="green"><Unlock className="w-3 h-3 inline" /> 管理员已启用</Tag>
                                ) : (
                                    <Button onClick={tryAdmin}><Lock className="w-4 h-4 inline" /> 解锁评分</Button>
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
                    {tab === "admin" && (
                        <AdminArea
                            questions={questions}
                            setQuestions={setQuestions}
                            onSetPin={setAdminPin}
                        />
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

  const visibleQuestions = useMemo(() => {
    if (phase === "pick") {
      return questions.filter((q) => !selectedIP || q.ip === selectedIP);
    }
    // running/confirm/finished: only chosen ones
    return questions.filter((q) => basket.includes(q.id));
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
                  adminMode={adminMode}
                  showReference={phase === "confirm" || phase === "finished"}
                />
              </div>
            )}
          </Card>
        ))}
      </div>
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

function ManualBlock({ q, ans, setAns, adminMode, showReference }) {
    const pts = LEVEL_POINTS[q.level];
    const manual = ans?.manualScore;
    const choices = [0, Math.ceil(pts * 0.5), pts];
    return (
        <div className="space-y-2">
            <div className="text-sm text-gray-600">此题需管理员评分。</div>
            <div className="flex gap-2 items-center">
                {choices.map((p) => (
                    <Button
                        key={p}
                        disabled={!adminMode}
                        onClick={() => setAns({ manualScore: p })}
                        className={`${manual === p ? "bg-gray-900 text-white" : ""}`}
                    >
                        评分 {p} 分
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

function AdminArea({ questions, setQuestions, onSetPin }) {
    const [form, setForm] = useState({
        id: "",
        ip: "",
        type: "mcq",
        level: "b",
        title: "",
        options: ["", "", "", ""],
        correctIndex: 0,
        reference: "",
    });

    const [pin, setPin] = useState(getAdminPin());
    const [ips, setIps] = useState(() => Array.from(new Set(questions.map((q) => q.ip))));
    const [newIp, setNewIp] = useState("");

    function resetForm() {
        setForm({ id: "", ip: "", type: "mcq", level: "b", title: "", options: ["", "", "", ""], correctIndex: 0, reference: "" });
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
        resetForm();
    }

    function addNewIp() {
        if (!newIp.trim()) return alert("IP 名称不能为空");
        if (ips.includes(newIp)) return alert("IP 名称已存在");
        setIps((prev) => [...prev, newIp]);
        setNewIp("");
        setForm((prev) => ({ ...prev, ip: newIp }));
    }

    function deleteQuestion(id) {
        if (window.confirm("确定要删除此题目吗？")) {
            setQuestions((prev) => prev.filter((q) => q.id !== id));
        }
    }

    /*
    function deleteIp(ip) {
        setIps((prev) => prev.filter((i) => i !== ip));
        setQuestions((prev) => prev.filter((q) => q.ip !== ip));
        if (form.ip === ip) setForm((prev) => ({ ...prev, ip: "" }));
    }
    */
   
    return (
        <div className="space-y-4">
            <Card>
                <h3 className="font-semibold mb-2">管理员设置</h3>
                <div className="flex items-center gap-2">
                    <Input value={pin} onChange={(e) => setPin(e.target.value)} placeholder="管理员 PIN" />
                    <Button onClick={() => { onSetPin(pin); alert("管理员 PIN 已更新"); }}><Save className="w-4 h-4 inline" /> 保存 PIN</Button>
                </div>
            </Card>

            <Card>
                <h3 className="font-semibold mb-2">新建 / 编辑题目</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="text-sm">IP 名称</label>
                        <div className="relative">
                            <select
                                className="w-full px-3 py-2 border rounded-xl shadow-sm focus:outline-none focus:ring bg-white"
                                value={form.ip}
                                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                            >
                                <option value="">选择 IP</option>
                                {ips.map((ip) => (
                                    <option key={ip} value={ip}>{ip}</option>
                                ))}
                            </select>
                            <div className="mt-2">
                                <Input
                                    value={newIp}
                                    onChange={(e) => setNewIp(e.target.value)}
                                    placeholder="新 IP 名称"
                                />
                                <Button onClick={addNewIp} className="mt-2">添加</Button>
                            </div>
                        </div>
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
                    <Button onClick={resetForm}><RotateCcw className="w-4 h-4 inline" /> 重置表单</Button>
                </div>
            </Card>

            <Card>
                <h3 className="font-semibold mb-2">题库（{questions.length}）</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {questions.map((q) => (
                        <div key={q.id} className="p-3 rounded-xl border">
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
        </div>
    );
}
