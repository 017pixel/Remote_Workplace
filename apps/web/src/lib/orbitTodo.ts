export interface OrbitTodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface OrbitTodoDocument {
  version: 1;
  items: OrbitTodoItem[];
}

export function parseOrbitTodo(content: string): OrbitTodoItem[] {
  if (!content.trim()) return [];
  try {
    const parsed = JSON.parse(content) as Partial<OrbitTodoDocument>;
    if (parsed.version !== 1 || !Array.isArray(parsed.items)) return [];
    return parsed.items.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Partial<OrbitTodoItem>;
      if (typeof candidate.id !== "string" || typeof candidate.text !== "string" || typeof candidate.done !== "boolean") return [];
      return [{ id: candidate.id.slice(0, 100), text: candidate.text.slice(0, 500), done: candidate.done }];
    }).slice(0, 250);
  } catch {
    return content.split("\n").map((text) => text.trim()).filter(Boolean).slice(0, 250)
      .map((text, index) => ({ id: `legacy-${index}`, text: text.replace(/^[-*]\s*/, ""), done: false }));
  }
}

export function serializeOrbitTodo(items: OrbitTodoItem[]): string {
  const document: OrbitTodoDocument = {
    version: 1,
    items: items.slice(0, 250).map((item) => ({ id: item.id.slice(0, 100), text: item.text.slice(0, 500), done: item.done })),
  };
  return JSON.stringify(document);
}
