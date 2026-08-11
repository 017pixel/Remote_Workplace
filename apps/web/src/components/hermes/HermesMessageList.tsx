import DOMPurify from "dompurify";
import { marked } from "marked";
import type { HermesMessage, HermesToolCall } from "@workbench/contracts";
import { HermesIcon } from "../icons";
import { HermesApprovalCard } from "./HermesApprovalCard";
import { HermesToolCallCard } from "./HermesToolCallCard";

function markdown(value: string): string {
  return DOMPurify.sanitize(marked.parse(value, { async: false }) as string, { USE_PROFILES: { html: true } });
}

function roleLabel(role: HermesMessage["role"]): string {
  return role === "user" ? "Du" : role === "assistant" ? "Hermes" : "System";
}

export function HermesMessageList({ messages, tools, thought, onApproval, approvals }: { messages: HermesMessage[]; tools: HermesToolCall[]; thought: string; approvals: React.ComponentProps<typeof HermesApprovalCard>["request"][]; onApproval: (requestId: string, option: "allow_once" | "allow_session" | "deny") => void }) {
  return (
    <div className="hermes-message-list" role="log" aria-live="polite" aria-label="Hermes-Chat">
      {messages.length === 0 && tools.length === 0 && !thought ? <div className="hermes-empty-chat"><HermesIcon className="hermes-empty-mark" /><strong>Womit soll Hermes beginnen?</strong><p>Starte direkt oder verbinde im Menü ein Projekt.</p></div> : null}
      {messages.map((message) => (
        <article key={message.id} className={`hermes-message is-${message.role}`}>
          <div className="hermes-message-meta"><span>{roleLabel(message.role)}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</time></div>
          {message.content ? <div className="hermes-message-content" dangerouslySetInnerHTML={{ __html: markdown(message.content) }} /> : null}
          {message.toolCalls.map((tool) => <HermesToolCallCard key={tool.id} tool={tool} />)}
        </article>
      ))}
      {tools.filter((tool) => !messages.some((message) => message.toolCalls.some((item) => item.id === tool.id))).map((tool) => <HermesToolCallCard key={tool.id} tool={tool} />)}
      {thought ? <details className="hermes-thought" open><summary>Arbeitsnotiz</summary><p>{thought}</p></details> : null}
      {approvals.map((request) => <HermesApprovalCard key={request.requestId} request={request} onRespond={(option) => onApproval(request.requestId, option)} />)}
    </div>
  );
}
