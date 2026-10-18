"use client";

import { useState, useRef, useEffect } from "react";
import {
  Bot,
  Send,
  X,
  Sparkles,
  ShieldCheck,
  RefreshCw,
  User,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/lib/usePermissions";
import { useUserProfile } from "@/lib/useUserProfile";

const QUICK_PROMPTS = [
  "รายงานเบิกเปลือกดูได้ที่หน้าไหน",
  "WKB-0053 คือรหัสอะไร",
  "ขั้นตอนการขออนุมัติ BOM มีอะไรบ้าง",
  "ขั้นตอนการชั่งคืนวัตถุดิบทำอย่างไร",
];

function renderFormattedText(text) {
  if (!text) return null;
  const lines = text.split("\n");

  return lines.map((line, lIdx) => {
    // Empty line
    if (!line.trim()) {
      return <div key={lIdx} className="h-2" />;
    }

    // Heading lines: ### ... or ## ...
    if (line.startsWith("### ")) {
      return (
        <h4 key={lIdx} className="font-bold text-slate-900 mt-2 mb-1 text-sm">
          {line.replace("### ", "")}
        </h4>
      );
    }
    if (line.startsWith("## ")) {
      return (
        <h3 key={lIdx} className="font-bold text-[#102C57] mt-3 mb-1.5 text-base border-b border-slate-200 pb-1">
          {line.replace("## ", "")}
        </h3>
      );
    }

    // Parse links [title](url) and bold **bold** within the line
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(line)) !== null) {
      if (match.index > lastIndex) {
        parts.push(line.substring(lastIndex, match.index));
      }
      const title = match[1];
      const url = match[2];
      parts.push({ isLink: true, title, url });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }

    return (
      <div key={lIdx} className="min-h-[1.25rem]">
        {parts.map((part, pIdx) => {
          if (typeof part === "string") {
            // Parse bold **text**
            const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
            return boldParts.map((bp, bIdx) => {
              if (bp.startsWith("**") && bp.endsWith("**")) {
                return (
                  <strong key={bIdx} className="font-semibold text-slate-900">
                    {bp.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={bIdx}>{bp}</span>;
            });
          }

          if (part.isLink) {
            return (
              <a
                key={pIdx}
                href={part.url}
                className="inline-flex items-center gap-1.5 px-3 py-1 my-1 bg-blue-50 hover:bg-blue-100 text-[#102C57] font-semibold text-xs rounded-lg border border-blue-200 shadow-xs transition-all transform hover:scale-[1.02] active:scale-95 group"
                title={`เปิดหน้า ${part.title}`}
              >
                <span>{part.title}</span>
                <ExternalLink className="w-3.5 h-3.5 text-blue-600 group-hover:translate-x-0.5 transition-transform" />
              </a>
            );
          }

          return null;
        })}
      </div>
    );
  });
}

function getWelcomeMessage(username) {
  const greeting = username ? `สวัสดีครับคุณ ${username}` : "สวัสดีครับ";
  return `${greeting} ผมคือผู้ช่วย AI ประจำระบบ KPF Quickplan คุณสามารถสอบถามข้อมูลระบบ คู่มือการใช้งาน รหัสสินค้า หรือขั้นตอนการปฏิบัติงานได้เลยครับ`;
}

function getResetMessage(username) {
  const greeting = username ? `ล้างบทสนทนาแล้วครับคุณ ${username}` : "ล้างบทสนทนาแล้วครับ";
  return `${greeting} มีข้อมูลส่วนไหนให้ผมช่วยค้นหาเพิ่มเติมไหมครับ`;
}

export default function AiAssistantDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const { isAdmin, permissions = [] } = usePermissions();
  const { username } = useUserProfile();

  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content: getWelcomeMessage(""),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!username) return;
    setMessages((prev) => {
      if (prev.length === 1 && prev[0].role === "assistant") {
        return [{ role: "assistant", content: getWelcomeMessage(username) }];
      }
      return prev;
    });
  }, [username]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (userText) => {
    const text = (userText || input).trim();
    if (!text || loading) return;

    const newMessages = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/ai-assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.error || "ไม่สามารถติดต่อระบบ AI ได้");
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.message,
          executedTools: data.executedTools,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `ขออภัยครับ เกิดข้อผิดพลาด: ${err.message}`,
          isError: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const roleLabel = isAdmin
    ? "Admin (สิทธิ์เต็ม)"
    : permissions.length > 0
    ? `ผู้ใช้งาน (${permissions.length} สิทธิ์)`
    : "ฝ่ายปฏิบัติการ (Operator)";

  return (
    <div className="print:hidden">
      {/* Compact launcher (right screen edge) */}
      {!isOpen && (
        <aside
          aria-label="เมนูผู้ช่วย AI"
          className="fixed right-0 bottom-28 z-40 select-none print:hidden sm:bottom-32"
        >
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="group flex h-12 w-12 items-center justify-center rounded-l-2xl border-y border-l-2 border-blue-400/40 bg-[var(--surface-navy,#102C57)] text-white shadow-xl transition-colors duration-200 hover:bg-[#183b70] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
            title="เปิดผู้ช่วย AI"
            aria-label="เปิดผู้ช่วย AI"
          >
            <div className="relative flex h-7 w-7 items-center justify-center">
              <Bot className="h-6 w-6 text-amber-300 transition-transform group-hover:scale-110" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-[#102C57]" />
            </div>
          </button>
        </aside>
      )}

      {/* Slide-over / Modal Chat Window */}
      {isOpen && (
        <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[440px] bg-white shadow-2xl flex flex-col border-l border-slate-200 transition-all">
          {/* Header */}
          <div className="px-5 py-4 bg-[var(--surface-navy,#102C57)] text-white flex items-center justify-between border-b border-blue-900/40">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
                <Bot className="w-6 h-6 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base tracking-wide">
                    KPF Assistant
                  </h3>
                  <span className="px-1.5 py-0.5 text-[10px] bg-emerald-500/20 text-emerald-300 rounded font-medium border border-emerald-500/30">
                    Online
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  <span>{username ? `${username} • ` : ""}{roleLabel}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() =>
                  setMessages([
                    {
                      role: "assistant",
                      content: getResetMessage(username),
                    },
                  ])
                }
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="เริ่มการสนทนาใหม่"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                title="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-full bg-[var(--surface-navy,#102C57)] text-amber-300 flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-1">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-[var(--surface-navy,#102C57)] text-white rounded-tr-none shadow-sm"
                      : msg.isError
                      ? "bg-rose-50 text-rose-800 border border-rose-200 rounded-tl-none"
                      : "bg-white text-slate-800 border border-slate-200 shadow-sm rounded-tl-none"
                  }`}
                >
                  <div className="space-y-1">
                    {renderFormattedText(msg.content)}
                  </div>

                  {/* Tool execution note if any */}
                  {msg.executedTools && msg.executedTools.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap gap-1.5">
                      {msg.executedTools.map((t, tIdx) => (
                        <span
                          key={tIdx}
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            t.success
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          🛠️ {t.tool} {t.success ? "✓" : `(จำกัดสิทธิ์)`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-slate-300 text-slate-700 flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm mt-1">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5 justify-start">
                <div className="w-8 h-8 rounded-full bg-[var(--surface-navy,#102C57)] text-amber-300 flex-shrink-0 flex items-center justify-center text-xs font-bold shadow-sm">
                  AI
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>กำลังค้นหาข้อมูลและประมวลผล...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          {messages.length <= 2 && (
            <div className="p-3 bg-white border-t border-slate-100 flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                คำถามแนะนำ:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((prompt, pIdx) => (
                  <button
                    key={pIdx}
                    onClick={() => handleSendMessage(prompt)}
                    className="text-xs bg-slate-100 hover:bg-blue-50 hover:text-[#102C57] text-slate-700 px-2.5 py-1 rounded-full transition-colors border border-slate-200 text-left"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-200">
            <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-200 focus-within:border-[#102C57] focus-within:ring-1 focus-within:ring-[#102C57] transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="พิมพ์คำถาม หรือรหัสที่ต้องการค้นหา..."
                rows={1}
                className="flex-1 bg-transparent border-none outline-none resize-none text-sm text-slate-800 placeholder-slate-400 max-h-24 py-1.5"
              />
              <button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || loading}
                className="w-8 h-8 rounded-lg bg-[var(--surface-navy,#102C57)] text-white flex items-center justify-center hover:bg-[#1b437c] disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                title="ส่งข้อความ"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 px-1">
              <span>ขับเคลื่อนด้วย Gemini 3.8 Flash (Free Tier)</span>
              <span>Protected by KPF RBAC</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
